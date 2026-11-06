import { describe, expect, it } from 'vitest';
import { validateLayout } from '@twin/layout';
import { createSim, mulberry32, parseOrdersCsv, type LogEntry } from '../src';
import { randomScenario } from './fixtures/gen-layout';

// Property tests without a property-testing library: 200 seeded random small layouts and
// order sets from the package's own PRNG. The master seed is fixed so a failure names
// the case and replays exactly.
const CASES = 200;
const MASTER_SEED = 20261106;

function edgeViolations(log: readonly LogEntry[]): string[] {
  const occupant = new Map<string, string>();
  const out: string[] = [];
  for (const e of log) {
    const edgeId = String(e.payload.edgeId);
    if (e.type === 'edge.enter') {
      const held = occupant.get(edgeId);
      if (held !== undefined) out.push(`t=${e.t}: ${e.entityId} entered ${edgeId} held by ${held}`);
      occupant.set(edgeId, e.entityId);
    } else if (e.type === 'edge.exit') {
      if (occupant.get(edgeId) !== e.entityId) out.push(`t=${e.t}: ${e.entityId} left ${edgeId} it did not hold`);
      occupant.delete(edgeId);
    }
  }
  return out;
}

describe(`invariants over ${CASES} seeded random scenarios`, () => {
  const rng = mulberry32(MASTER_SEED);
  const scenarios = Array.from({ length: CASES }, () => randomScenario(rng));

  it.each(scenarios.map((sc, i) => [i, sc] as const))('case %i', (_i, sc) => {
    expect(validateLayout(sc.layout).ok).toBe(true);
    const created = createSim(sc);
    if (!created.ok) throw new Error(created.reasons.join('\n'));
    const sim = created.sim;
    const rackIds = new Set(sc.layout.racks.map((r) => r.id));

    let lastT = 0;
    let checked = 0;
    const step = () => {
      // Pallets conserved: in = stored + in transit + shipped, both from state and from the log.
      const p = sim.pallets();
      expect(p.stored + p.inTransit + p.shipped).toBe(p.palletsIn);
      let arrived = 0;
      let stored = 0;
      let shipped = 0;
      for (const e of sim.log.slice(checked)) {
        // Time never goes backward.
        expect(e.t).toBeGreaterThanOrEqual(lastT);
        lastT = e.t;
      }
      checked = sim.log.length;
      for (const e of sim.log) {
        if (e.type === 'inbound.arrive') arrived += Number(e.payload.pallets);
        if (e.type === 'pallet.store') stored++;
        if (e.type === 'pallet.load' && e.from !== null && rackIds.has(e.from)) stored--;
        if (e.type === 'pallet.ship') shipped++;
      }
      expect(p.palletsIn).toBe(arrived);
      expect(p.stored).toBe(stored);
      expect(p.shipped).toBe(shipped);
    };
    while (sim.next()) step();
    sim.run();
    step();

    // Never 2 vehicles on one edge segment at the same time.
    expect(edgeViolations(sim.log)).toEqual([]);

    // Every order ships or is reported open at the end.
    const k = sim.kpis();
    const ids = parseOrdersCsv(sc.ordersCsv).map((o) => o.id);
    const shippedIds = k.orderToShip.list.map((s) => s.orderId);
    const openIds = k.openOrders.map((o) => o.orderId);
    expect(k.ordersTotal).toBe(ids.length);
    expect([...shippedIds, ...openIds].sort()).toEqual([...ids].sort());
    expect(new Set([...shippedIds, ...openIds]).size).toBe(ids.length);
    if (sc.horizon !== undefined) expect(k.endTime).toBeLessThanOrEqual(sc.horizon);
    for (const s of k.orderToShip.list) expect(s.seconds).toBeGreaterThanOrEqual(0);
    for (const v of k.vehicles) {
      expect(v.utilisation).toBeGreaterThanOrEqual(0);
      expect(v.utilisation).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('the generator exercises congestion, waiting stock, full racks and open orders', () => {
    const logs = scenarios.map((sc) => {
      const r = createSim(sc);
      if (!r.ok) throw new Error('invalid');
      r.sim.run();
      return { log: r.sim.log, k: r.sim.kpis() };
    });
    const seen = (type: string) => logs.filter((l) => l.log.some((e) => e.type === type)).length;
    expect(seen('edge.wait')).toBeGreaterThan(0);
    expect(seen('order.wait-stock')).toBeGreaterThan(0);
    expect(seen('pallet.wait-rack')).toBeGreaterThan(0);
    expect(seen('conveyor.start')).toBeGreaterThan(0);
    expect(logs.filter((l) => l.k.ordersShipped > 0).length).toBeGreaterThan(0);
    expect(logs.filter((l) => l.k.openOrders.length > 0).length).toBeGreaterThan(0);
  });
});
