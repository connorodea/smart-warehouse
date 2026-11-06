import { describe, expect, it } from 'vitest';
import { validateLayout } from '@twin/layout';
import { createSim, mulberry32, runSim, type InboundArrival, type LogEntry, type Sim, type SimInput } from '../src';
import { fixed, makeLayout, randomScenario, type LayoutSpec } from './fixtures/gen-layout';

// TEST FIXTURES ONLY. Hand-built tiny layout: corridor IN(0) - R1(5) - ST1(10) - OUT(15),
// 1 vehicle at 1 m/s, load 2 s, unload 3 s, station service fixed 10 s, rack capacity
// 1 row x 1 level x 2 slots x 2 pallets = 4 pallets. Every expectation below is computed
// by hand from these test inputs.
type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const handSpec = (over: Partial<LayoutSpec> = {}): LayoutSpec => ({
  spacing: 5,
  racks: [{ rows: 1, levels: 1, slots: 2, slotCapacity: 2 }],
  stations: [fixed(10)],
  fleet: [{ count: 1, speed: 1, loadTime: 2, unloadTime: 3 }],
  ...over,
});
const inb = (id: string, t: number, sku: string, pallets = 1, dockId = 'D-IN'): InboundArrival => ({ id, t, dockId, sku, pallets });
const csv = (...rows: string[]) => ['order_id,time_s,sku', ...rows].join('\n');
const input = (over: Partial<SimInput> = {}): SimInput => ({
  layout: makeLayout(handSpec()),
  ordersCsv: csv(),
  inbound: [],
  seed: 1,
  ...over,
});
const ok = (i: SimInput) => {
  const r = runSim(i);
  if (!r.ok) throw new Error(r.reasons.join('\n'));
  return r;
};
const reasonsOf = (i: SimInput) => {
  const r = createSim(i);
  if (r.ok) throw new Error('expected rejection');
  return r.reasons;
};
const sim = (i: SimInput): Sim => {
  const r = createSim(i);
  if (!r.ok) throw new Error(r.reasons.join('\n'));
  return r.sim;
};
const types = (log: readonly LogEntry[], entityId: string) => log.filter((e) => e.entityId === entityId).map((e) => `${e.t} ${e.type}`);

describe('fixtures', () => {
  it('the hand layout passes validateLayout', () => {
    expect(validateLayout(makeLayout(handSpec())).ok).toBe(true);
  });
});

describe('createSim: rejects bad input with reasons', () => {
  it('returns validateLayout reasons for an invalid layout', () => {
    const r = validateLayout({});
    expect(r.ok).toBe(false);
    expect(reasonsOf(input({ layout: {} }))).toEqual(!r.ok && r.reasons);
  });

  it('runSim returns the same reasons', () => {
    expect(runSim(input({ seed: 0.5 }))).toEqual({ ok: false, reasons: ['input: seed: 0.5 is not an integer'] });
  });

  it('rejects a non-integer seed and a non-positive horizon', () => {
    expect(reasonsOf(input({ seed: 1.5 }))).toEqual(['input: seed: 1.5 is not an integer']);
    expect(reasonsOf(input({ horizon: 0 }))).toEqual(['input: horizon: 0 must be a number of seconds > 0']);
    expect(reasonsOf(input({ horizon: Number.NaN }))).toEqual(['input: horizon: NaN must be a number of seconds > 0']);
  });

  it('names the CSV row', () => {
    expect(reasonsOf(input({ ordersCsv: csv('O1,x,A') }))).toEqual(['orders-csv: row 2: time_s "x" is not a number of seconds >= 0']);
  });

  it('checks every inbound field', () => {
    const l: Loose = makeLayout(handSpec());
    const r = reasonsOf(
      input({
        layout: l,
        inbound: [inb('', -1, '', 0), inb('A', 0, 'A', 1.5, 'NOPE'), inb('A', Number.NaN, 'A', 1, 'D-OUT')],
      }),
    );
    expect(r).toEqual([
      'inbound[]: id must be non-empty and unique',
      'inbound[].t: -1 is not a number of seconds >= 0',
      'inbound[].pallets: 0 is not a whole number >= 1',
      'inbound[].sku: sku is empty',
      'inbound[A].pallets: 1.5 is not a whole number >= 1',
      'inbound[A].dockId: dock "NOPE" does not exist',
      'inbound[A]: id must be non-empty and unique',
      'inbound[A].t: NaN is not a number of seconds >= 0',
      'inbound[A].dockId: dock "D-OUT" is outbound, not inbound',
    ]);
  });

  it('needs a station and an outbound dock when there are orders', () => {
    const noStation = makeLayout(handSpec({ stations: [] }));
    expect(reasonsOf(input({ layout: noStation, ordersCsv: csv('O1,0,A') }))).toEqual([
      'layout: stations: orders need at least one pick-pack station',
    ]);
    // Without orders, no station is needed.
    expect(createSim(input({ layout: noStation })).ok).toBe(true);
    const noOut: Loose = makeLayout(handSpec());
    noOut.docks[1].kind = 'inbound';
    expect(reasonsOf(input({ layout: noOut, ordersCsv: csv('O1,0,A') }))).toEqual([
      'layout: docks: orders need at least one outbound dock',
    ]);
  });

  it('rejects a valid layout whose service nodes are on two separate networks', () => {
    // IN <-> R1 and ST1 <-> OUT, with no link between R1 and ST1: valid, but not one network.
    const l: Loose = makeLayout(handSpec());
    l.pathGraph.edges = l.pathGraph.edges.filter((e: Loose) => !e.id.includes('N-R1-N-ST1') && !e.id.includes('N-ST1-N-R1'));
    expect(validateLayout(l).ok).toBe(true);
    expect(reasonsOf(input({ layout: l }))).toEqual([
      'sim-unreachable: docks[D-OUT].accessNodeId: node "N-OUT" is not on the same two-way network as node "N-IN"; v1 needs every dock, rack face and station mutually reachable',
      'sim-unreachable: stations[ST1].accessNodeId: node "N-ST1" is not on the same two-way network as node "N-IN"; v1 needs every dock, rack face and station mutually reachable',
    ]);
  });
});

describe('KPIs on hand-computed tiny layouts', () => {
  it('1 vehicle, 1 rack, 1 order: order-to-ship = travel + load + unload + pack exactly', () => {
    // Putaway: load at IN 0-2, travel 5 m 2-7, unload at R1 7-10.
    // Order at 100: load at R1 100-102, travel 102-107, unload at ST1 107-110, pack 110-120,
    // load at ST1 120-122, travel 122-127, unload at OUT 127-130.
    // travel 5+5 + load 2+2 + unload 3+3 + pack 10 = 30.
    const r = ok(input({ inbound: [inb('IN1', 0, 'A')], ordersCsv: csv('O1,100,A') }));
    const k = r.kpis;
    expect(k.orderToShip).toEqual({ meanSeconds: 30, list: [{ orderId: 'O1', seconds: 30 }] });
    expect(k.endTime).toBe(130);
    expect(k.ordersTotal).toBe(1);
    expect(k.ordersShipped).toBe(1);
    expect(k.openOrders).toEqual([]);
    expect(k.ordersPerHour).toBeCloseTo(3600 / 130, 12);
    expect(k.rackFillPercent).toBe(0);
    expect(k.freeVehicles).toBe(1);
    expect(k.vehicles).toEqual([{ vehicleId: 'F1#1', state: 'idle', busySeconds: 30, utilisation: 30 / 130 }]);
    expect(k.vehicleUtilisation).toBe(30 / 130);
    expect(k.queueLengths).toEqual({ tasksWaiting: 0, stations: [{ stationId: 'ST1', current: 0, max: 1 }], conveyors: [] });
    expect(types(r.log, 'IN1#1')).toEqual([
      '2 pallet.load',
      '10 pallet.unload',
      '10 pallet.store',
      '102 pallet.load',
      '110 pallet.unload',
      '110 station.queue',
      '110 station.start',
      '120 station.done',
      '122 pallet.load',
      '130 pallet.unload',
      '130 pallet.ship',
    ]);
    expect(types(r.log, 'O1')).toEqual(['100 order.arrive', '130 order.ship']);
    expect(r.log.filter((e) => e.type === 'edge.enter').map((e) => `${e.t} ${e.from}->${e.to}`)).toEqual([
      '2 N-IN->N-R1',
      '102 N-R1->N-ST1',
      '122 N-ST1->N-OUT',
    ]);
  });

  it('a station conveyor to the outbound dock replaces the last vehicle leg (3600 / rate s per item)', () => {
    // As above to 120, then conveyor 3600 / 720 = 5 s: ship at 125. 5 + 2 + 3 + 10 + 5 = 25.
    const layout = makeLayout(handSpec({ conveyors: [{ station: 0, rate: 720 }] }));
    const r = ok(input({ layout, inbound: [inb('IN1', 0, 'A')], ordersCsv: csv('O1,100,A') }));
    expect(r.kpis.orderToShip.list).toEqual([{ orderId: 'O1', seconds: 25 }]);
    expect(r.kpis.vehicles[0]?.busySeconds).toBe(20);
    expect(r.kpis.queueLengths.conveyors).toEqual([{ conveyorId: 'CV1', current: 0, max: 1 }]);
    expect(types(r.log, 'IN1#1').slice(-4)).toEqual(['120 conveyor.queue', '120 conveyor.start', '125 conveyor.done', '125 pallet.ship']);
  });

  it('rack fill % comes from slot counts: 3 stored of 1 x 1 x 2 x 2 = 4 is 75%', () => {
    const k = ok(input({ inbound: [inb('IN1', 0, 'A', 3)] })).kpis;
    expect(k.rackFillPercent).toBe(75);
    expect(k.racks).toEqual([{ rackId: 'R1', storedPallets: 3, capacityPallets: 4, fillPercent: 75 }]);
    // 3 putaways of 2 + 5 + 3 = 10 s, returning 5 s empty between them: 10 + 15 + 15 = 40.
    expect(k.endTime).toBe(40);
    expect(k.ordersPerHour).toBe(0);
  });

  it('empty order list and no inbound: zero KPIs, no crash', () => {
    const k = ok(input()).kpis;
    expect(k).toEqual({
      endTime: 0,
      ordersTotal: 0,
      ordersShipped: 0,
      openOrders: [],
      ordersPerHour: 0,
      orderToShip: { meanSeconds: 0, list: [] },
      rackFillPercent: 0,
      racks: [{ rackId: 'R1', storedPallets: 0, capacityPallets: 4, fillPercent: 0 }],
      freeVehicles: 1,
      vehicleUtilisation: 0,
      vehicles: [{ vehicleId: 'F1#1', state: 'idle', busySeconds: 0, utilisation: 0 }],
      queueLengths: { tasksWaiting: 0, stations: [{ stationId: 'ST1', current: 0, max: 0 }], conveyors: [] },
    });
  });
});

describe('flow rules', () => {
  it('a pallet waits at the dock when every rack is full and goes up when a slot frees', () => {
    const layout = makeLayout(handSpec({ racks: [{ rows: 1, levels: 1, slots: 1, slotCapacity: 1 }] }));
    const r = ok(input({ layout, inbound: [inb('IN1', 0, 'A', 3)], ordersCsv: csv('O1,50,A') }));
    expect(r.log.filter((e) => e.type === 'pallet.wait-rack').map((e) => e.entityId)).toEqual(['IN1#2', 'IN1#3']);
    expect(r.kpis.ordersShipped).toBe(1);
    expect(r.kpis.racks[0]?.storedPallets).toBe(1);
    expect(r.kpis.rackFillPercent).toBe(100);
  });

  it('an order that arrives before its stock waits, and stock for other SKUs is not used for it', () => {
    const r = ok(input({ inbound: [inb('IN1', 0, 'A'), inb('IN2', 5, 'B')], ordersCsv: csv('O1,0,B') }));
    expect(types(r.log, 'O1')[1]).toBe('0 order.wait-stock');
    expect(r.kpis.ordersShipped).toBe(1);
    expect(r.log.find((e) => e.type === 'pallet.ship')?.entityId).toBe('IN2#1');
    expect(r.kpis.racks[0]?.storedPallets).toBe(1);
  });

  it('reports each open order with its status at the horizon, and counts busy time to the horizon', () => {
    const r = ok(
      input({
        inbound: [inb('IN1', 0, 'A')],
        ordersCsv: csv('O1,100,A', 'O2,0,Z', 'O3,1000,A'),
        horizon: 105,
      }),
    );
    expect(r.kpis.openOrders).toEqual([
      { orderId: 'O1', status: 'in-progress' },
      { orderId: 'O2', status: 'awaiting-stock' },
      { orderId: 'O3', status: 'not-arrived' },
    ]);
    // Putaway 10 s, then load 100-102 and travel 102-105 (cut by the horizon).
    expect(r.kpis.vehicles[0]).toEqual({ vehicleId: 'F1#1', state: 'travel', busySeconds: 15, utilisation: 15 / 105 });
    expect(r.kpis.endTime).toBe(105);
  });

  it('vehicles start at the first dock when no dock is inbound', () => {
    const l: Loose = makeLayout(handSpec());
    l.docks[0].kind = 'outbound';
    const r = ok(input({ layout: l, ordersCsv: csv('O1,0,A') }));
    expect(r.kpis.openOrders).toEqual([{ orderId: 'O1', status: 'awaiting-stock' }]);
  });

  it('a two-way dock takes inbound and ships to the nearest outbound dock', () => {
    const l: Loose = makeLayout(handSpec());
    l.docks[0].kind = 'both';
    const r = ok(input({ layout: l, inbound: [inb('IN1', 0, 'A')], ordersCsv: csv('O1,100,A') }));
    expect(r.log.find((e) => e.type === 'pallet.ship')?.to).toBe('D-OUT');
    expect(r.kpis.orderToShip.list[0]?.seconds).toBe(30);
  });

  it('spreads work over the least-loaded station, then the nearest', () => {
    // Swap the two stations' access nodes so ST2 is the nearer one.
    const l: Loose = makeLayout(handSpec({ stations: [fixed(10), fixed(10)], fleet: [{ count: 2, speed: 1, loadTime: 2, unloadTime: 3 }] }));
    [l.stations[0].accessNodeId, l.stations[1].accessNodeId] = [l.stations[1].accessNodeId, l.stations[0].accessNodeId];
    const r = ok(input({ layout: l, inbound: [inb('IN1', 0, 'A', 2)], ordersCsv: csv('O1,100,A', 'O2,100,A') }));
    const starts = r.log.filter((e) => e.type === 'station.start').map((e) => e.to);
    expect(starts).toEqual(['ST2', 'ST1']);
    expect(r.kpis.ordersShipped).toBe(2);
  });

  it('a vehicle waits for an occupied edge (capacity 1): congestion emerges', () => {
    const layout = makeLayout(handSpec({ fleet: [{ count: 2, speed: 1, loadTime: 2, unloadTime: 3 }] }));
    const r = ok(input({ layout, inbound: [inb('IN1', 0, 'A', 2)] }));
    const wait = r.log.find((e) => e.type === 'edge.wait');
    expect(wait).toMatchObject({ t: 2, entityId: 'F1#2', from: 'N-IN', to: 'N-R1', payload: { blockedBy: 'F1#1' } });
    const enters = r.log.filter((e) => e.type === 'edge.enter' && e.from === 'N-IN').map((e) => `${e.t} ${e.entityId}`);
    expect(enters).toEqual(['2 F1#1', '7 F1#2']);
  });
});

describe('stepping', () => {
  it('next() runs one event at a time and stepUntil moves the clock even with no events', () => {
    const s = sim(input({ inbound: [inb('IN1', 0, 'A')], ordersCsv: csv('O1,100,A') }));
    expect(s.now).toBe(0);
    expect(s.next()).toBe(true);
    expect(s.log.length).toBeGreaterThan(0);
    s.stepUntil(50);
    expect(s.now).toBe(50);
    expect(s.kpis().racks[0]?.storedPallets).toBe(1);
    s.stepUntil(20);
    expect(s.now).toBe(50);
    s.stepUntil(Infinity);
    expect(s.now).toBe(130);
    expect(s.next()).toBe(false);
  });

  it('stepUntil stops at the horizon', () => {
    const s = sim(input({ inbound: [inb('IN1', 0, 'A')], ordersCsv: csv('O1,100,A'), horizon: 60 }));
    s.stepUntil(1000);
    expect(s.now).toBe(60);
    expect(s.kpis().openOrders).toEqual([{ orderId: 'O1', status: 'not-arrived' }]);
  });

  it('the stepped run gives the same log as run()', () => {
    const i = input({ inbound: [inb('IN1', 0, 'A', 2)], ordersCsv: csv('O1,3,A', 'O2,40,A') });
    const a = sim(i);
    a.run();
    const b = sim(i);
    for (let t = 0; t < 400; t += 7) b.stepUntil(t);
    b.run();
    expect(JSON.stringify(b.log)).toBe(JSON.stringify(a.log));
  });
});

describe('determinism', () => {
  const stochastic = (seed: number): SimInput => {
    const layout = makeLayout(
      handSpec({
        racks: [{ rows: 1, levels: 2, slots: 5, slotCapacity: 2 }],
        stations: [{ kind: 'exponential', mean: { value: 30, unit: 's', source: 'owner' } }],
        fleet: [{ count: 2, speed: 1.5, loadTime: 2, unloadTime: 3 }],
      }),
    );
    const orders = Array.from({ length: 10 }, (_, i) => `O${i + 1},${i * 20},A`);
    return input({ layout, seed, inbound: [inb('IN1', 0, 'A', 10)], ordersCsv: csv(...orders) });
  };

  it('same seed => byte-identical event log and KPIs', () => {
    const a = ok(stochastic(99));
    const b = ok(stochastic(99));
    expect(JSON.stringify(b.log)).toBe(JSON.stringify(a.log));
    expect(JSON.stringify(b.kpis)).toBe(JSON.stringify(a.kpis));
  });

  it('different seed => different service draws', () => {
    expect(JSON.stringify(ok(stochastic(1)).log)).not.toBe(JSON.stringify(ok(stochastic(2)).log));
  });

  it('same seed => identical results on 20 random scenarios', () => {
    const rng = mulberry32(2026);
    for (let i = 0; i < 20; i++) {
      const sc = randomScenario(rng);
      const a = ok(sc);
      const b = ok(sc);
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    }
  });
});
