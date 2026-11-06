/**
 * TEST FIXTURE GENERATOR. Builds hand-specified or seeded-random *test* layouts.
 * Every number here is a test input chosen by the test that calls it; none of it is a
 * product default or demo value, and nothing in src/ imports this file.
 *
 * Shape: one straight two-way corridor along y = 0. Nodes in order:
 *   inbound dock, rack faces..., stations..., outbound dock.
 * Consecutive nodes are joined by two directed edges (a->b and b->a), each with
 * length equal to the Euclidean distance between its nodes.
 *
 * The generated layouts satisfy validateLayout and the extra layout rules being added
 * in parallel: >= 1 inbound and >= 1 outbound dock; edge length == Euclidean distance;
 * no duplicate (from, to) edges; no self-loops; positive service-time params; a
 * charging zone (every fleet type has a battery in the schema); docks inside
 * receiving/shipping zones, racks inside storage zones, stations inside pick-pack zones.
 */
import type { ServiceTime } from '@twin/layout';
import type { Rng } from '../../src';

export interface RackSpec {
  rows: number;
  levels: number;
  slots: number;
  slotCapacity: number;
}

export interface FleetSpec {
  count: number;
  speed: number;
  loadTime: number;
  unloadTime: number;
}

export interface LayoutSpec {
  /** Distance in metres between consecutive corridor nodes. */
  spacing: number;
  racks: RackSpec[];
  stations: ServiceTime[];
  /** Indices of stations that get a conveyor to the outbound dock, with its rate (items/h). */
  conveyors?: Array<{ station: number; rate: number }>;
  fleet: FleetSpec[];
}

const pt = (x: number, y: number) => ({ x, y, unit: 'm' as const, source: 'cad' as const });
const box = (x0: number, x1: number, y0: number, y1: number) => [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)];
const owner = (value: number) => ({ value, source: 'owner' as const });
const ownerU = <U extends string>(value: number, unit: U) => ({ value, unit, source: 'owner' as const });
const sec = (value: number) => ownerU(value, 's');

export const fixed = (value: number): ServiceTime => ({ kind: 'fixed', value: sec(value) });

export function makeLayout(spec: LayoutSpec) {
  const s = spec.spacing;
  const ids: string[] = ['N-IN', ...spec.racks.map((_, i) => `N-R${i + 1}`), ...spec.stations.map((_, i) => `N-ST${i + 1}`), 'N-OUT'];
  const xOf = (i: number) => i * s;
  const nodes = ids.map((id, i) => ({ id, position: pt(xOf(i), 0) }));
  const edges = ids.slice(1).flatMap((id, i) => {
    const a = ids[i] as string;
    const len = { value: s, unit: 'm' as const, source: 'derived' as const };
    const cap = { value: 1 as const, unit: 'vehicles' as const, source: 'derived' as const };
    return [
      { id: `E-${a}-${id}`, from: a, to: id, length: len, capacity: cap },
      { id: `E-${id}-${a}`, from: id, to: a, length: len, capacity: cap },
    ];
  });
  const nr = spec.racks.length;
  const ns = spec.stations.length;
  const half = s / 2;
  const last = ids.length - 1;
  return {
    schemaVersion: 1 as const,
    id: 'test-corridor',
    name: 'Generated corridor (TEST FIXTURE)',
    zones: [
      { id: 'Z-RCV', kind: 'receiving' as const, polygon: box(-half, half, -3, 3) },
      { id: 'Z-STO', kind: 'storage' as const, polygon: box(half, xOf(nr) + half, -3, 3) },
      ...(ns > 0 ? [{ id: 'Z-PP', kind: 'pick-pack' as const, polygon: box(xOf(nr) + half, xOf(nr + ns) + half, -3, 3) }] : []),
      { id: 'Z-SHP', kind: 'shipping' as const, polygon: box(xOf(last) - half, xOf(last) + half, -3, 3) },
      { id: 'Z-PRK', kind: 'parking' as const, polygon: box(-half, half, 4, 8) },
      { id: 'Z-CHG', kind: 'charging' as const, polygon: box(half, xOf(1) + half, 4, 8) },
    ],
    docks: [
      { id: 'D-IN', kind: 'inbound' as const, zoneId: 'Z-RCV', position: pt(0, 0), accessNodeId: 'N-IN' },
      { id: 'D-OUT', kind: 'outbound' as const, zoneId: 'Z-SHP', position: pt(xOf(last), 0), accessNodeId: 'N-OUT' },
    ],
    racks: spec.racks.map((r, i) => ({
      id: `R${i + 1}`,
      zoneId: 'Z-STO',
      position: pt(xOf(i + 1), 2),
      rotation: { value: 0, unit: 'deg' as const, source: 'cad' as const },
      rows: { value: r.rows, source: 'cad' as const },
      levels: { value: r.levels, source: 'cad' as const },
      slots: { value: r.slots, source: 'cad' as const },
      slotCapacity: owner(r.slotCapacity),
      faces: [{ id: `R${i + 1}-F`, side: 'front' as const, accessNodeId: `N-R${i + 1}` }],
    })),
    stations: spec.stations.map((st, i) => ({
      id: `ST${i + 1}`,
      kind: 'pick-pack' as const,
      zoneId: 'Z-PP',
      position: pt(xOf(nr + 1 + i), 2),
      accessNodeId: `N-ST${i + 1}`,
      serviceTime: st,
    })),
    conveyors: (spec.conveyors ?? []).map((c) => ({
      id: `CV${c.station + 1}`,
      fromId: `ST${c.station + 1}`,
      toId: 'D-OUT',
      path: [pt(xOf(nr + 1 + c.station), 2), pt(xOf(last), 2)],
      rate: ownerU(c.rate, 'items/h'),
    })),
    pathGraph: { nodes, edges },
    fleet: spec.fleet.map((f, i) => ({
      id: `F${i + 1}`,
      vehicleType: 'amr' as const,
      count: owner(f.count),
      speed: ownerU(f.speed, 'm/s'),
      loadTime: sec(f.loadTime),
      unloadTime: sec(f.unloadTime),
      battery: {
        runtime: ownerU(8, 'h'),
        chargeTime: ownerU(2, 'h'),
        rechargeThreshold: ownerU(20, '%'),
      },
    })),
    shifts: [{ id: 'S1', start: '06:00', end: '14:00', days: ['mon' as const], staff: owner(1) }],
    costs: {
      currency: 'USD',
      labourRatePerHour: ownerU(1, 'currency/h'),
      vehicles: spec.fleet.map((_, i) => ({
        fleetId: `F${i + 1}`,
        capexPerUnit: ownerU(1, 'currency'),
        maintenancePerYear: ownerU(1, 'currency/year'),
      })),
    },
  };
}

const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)] as T;

/** A random positive service-time distribution of any kind (test input). */
export function randomServiceTime(rng: Rng): ServiceTime {
  const a = int(rng, 1, 30);
  const b = int(rng, 1, 30);
  switch (pick(rng, ['fixed', 'uniform', 'exponential', 'normal', 'lognormal'] as const)) {
    case 'fixed':
      return fixed(a);
    case 'uniform':
      return { kind: 'uniform', min: sec(Math.min(a, b)), max: sec(Math.max(a, b)) };
    case 'exponential':
      return { kind: 'exponential', mean: sec(a) };
    case 'normal':
      return { kind: 'normal', mean: sec(a), stdDev: sec(b) };
    case 'lognormal':
      return { kind: 'lognormal', mean: sec(a), stdDev: sec(b) };
  }
}

/** A seeded random small scenario: layout, inbound list and order CSV (all test inputs). */
export function randomScenario(rng: Rng) {
  const skus = ['A', 'B', 'C'];
  const spec: LayoutSpec = {
    spacing: int(rng, 2, 8),
    racks: Array.from({ length: int(rng, 1, 3) }, () => ({ rows: 1, levels: int(rng, 1, 2), slots: int(rng, 1, 3), slotCapacity: int(rng, 1, 2) })),
    stations: Array.from({ length: int(rng, 1, 2) }, () => randomServiceTime(rng)),
    fleet: Array.from({ length: int(rng, 1, 2) }, () => ({ count: int(rng, 1, 3), speed: int(rng, 1, 3), loadTime: int(rng, 0, 5), unloadTime: int(rng, 0, 5) })),
  };
  if (rng() < 0.5) spec.conveyors = [{ station: 0, rate: int(rng, 60, 720) }];
  const inbound = Array.from({ length: int(rng, 0, 4) }, (_, i) => ({
    id: `IN${i + 1}`,
    t: int(rng, 0, 300),
    dockId: 'D-IN',
    sku: pick(rng, skus),
    pallets: int(rng, 1, 3),
  }));
  const rows = ['order_id,time_s,sku'];
  const nOrders = int(rng, 0, 5);
  for (let i = 1; i <= nOrders; i++) {
    const t = int(rng, 0, 600);
    for (let l = int(rng, 1, 2); l > 0; l--) rows.push(`O${i},${t},${pick(rng, skus)}`);
  }
  const horizon = rng() < 0.25 ? int(rng, 50, 800) : undefined;
  return { layout: makeLayout(spec), inbound, ordersCsv: rows.join('\n'), horizon, seed: int(rng, 0, 2 ** 31) };
}
