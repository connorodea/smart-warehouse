import { describe, expect, it } from 'vitest';
import {
  DegreesSchema,
  LAYOUT_SCHEMA_VERSION,
  LayoutSchema,
  ShiftSchema,
  edgeLengthTolerance,
  formatPath,
  pointInPolygon,
  validateLayout,
  type Layout,
} from '../src';
import valid from '../fixtures/valid.tiny-loop.fixture.json';

// Every test starts from a deep copy of the hand-built test fixture and breaks one thing.
// Tests mutate freely, so the copy is untyped on purpose.
type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const clone = <T>(v: T): Loose => JSON.parse(JSON.stringify(v));
const base = (): Loose => clone(valid.layout);

const reasonsOf = (input: unknown): string[] => {
  const r = validateLayout(input);
  if (r.ok) throw new Error('expected the layout to be rejected');
  return r.reasons;
};
const pt = (x: number, y: number) => ({ x, y, unit: 'm', source: 'cad' });
const edgeWith = (id: string, from: string, to: string, len: number) => ({
  id,
  from,
  to,
  length: { value: len, unit: 'm', source: 'derived' },
  capacity: { value: 1, unit: 'vehicles', source: 'derived' },
});
/** An edge whose length is the true distance between its nodes in layout `l` (1 m if a node is unknown). */
const edge = (l: Loose, id: string, from: string, to: string) => {
  const at = (n: string) => l.pathGraph.nodes.find((x: Loose) => x.id === n)?.position;
  const a = at(from);
  const b = at(to);
  return edgeWith(id, from, to, a && b ? Math.hypot(a.x - b.x, a.y - b.y) || 1 : 1);
};
const node = (id: string, x: number, y: number) => ({ id, position: pt(x, y) });

describe('validateLayout: valid input', () => {
  it('accepts the fixture and returns a typed Layout', () => {
    const r = validateLayout(base());
    expect(r.ok).toBe(true);
    if (r.ok) {
      const l: Layout = r.layout;
      expect(l.schemaVersion).toBe(LAYOUT_SCHEMA_VERSION);
      expect(LayoutSchema.safeParse(l).success).toBe(true);
    }
  });

  it('accepts optional zone refs left out and every service-time kind', () => {
    const l = base();
    delete l.docks[0].zoneId;
    delete l.racks[0].zoneId;
    delete l.stations[0].zoneId;
    for (const st of [
      { kind: 'fixed', value: { value: 30, unit: 's', source: 'owner' } },
      { kind: 'exponential', mean: { value: 30, unit: 's', source: 'derived' } },
      { kind: 'normal', mean: { value: 30, unit: 's', source: 'owner' }, stdDev: { value: 5, unit: 's', source: 'owner' } },
      { kind: 'uniform', min: { value: 10, unit: 's', source: 'owner' }, max: { value: 10, unit: 's', source: 'owner' } },
      { kind: 'lognormal', mean: { value: 30, unit: 's', source: 'owner' }, stdDev: { value: 5, unit: 's', source: 'owner' } },
    ]) {
      l.stations[0].serviceTime = st;
      expect(validateLayout(l).ok).toBe(true);
    }
  });

  it('accepts a zero-count fleet type when another type has vehicles', () => {
    const l = base();
    l.fleet.push({ ...clone(l.fleet[0]), id: 'amr-2', count: { value: 0, source: 'owner' } });
    l.costs.vehicles.push({ ...clone(l.costs.vehicles[0]), fleetId: 'amr-2' });
    expect(validateLayout(l).ok).toBe(true);
  });
});

describe('rule: schema', () => {
  it('rejects a non-object with a root reason', () => {
    expect(reasonsOf(null)[0]).toMatch(/^schema: \(root\): /);
  });

  it('rejects the wrong schema version', () => {
    const l = base();
    l.schemaVersion = 2;
    expect(reasonsOf(l)).toEqual([expect.stringMatching(/^schema: schemaVersion: /)]);
  });

  it('names array elements by id and by index when they have no id', () => {
    const l = base();
    l.racks[0].rows.value = 1.5;
    l.zones[0].polygon[1].unit = 'ft';
    const r = reasonsOf(l);
    expect(r).toContainEqual(expect.stringMatching(/^schema: racks\[R1\]\.rows\.value: /));
    expect(r).toContainEqual(expect.stringMatching(/^schema: zones\[Z-RCV\]\.polygon\[1\]\.unit: /));
  });

  it('rejects unknown fields (strict objects)', () => {
    const l = base();
    l.racks[0].colour = 'blue';
    expect(reasonsOf(l)[0]).toMatch(/^schema: racks\[R1\]: /);
  });

  it('rejects a uniform service time with min > max', () => {
    const l = base();
    l.stations[0].serviceTime = {
      kind: 'uniform',
      min: { value: 20, unit: 's', source: 'owner' },
      max: { value: 10, unit: 's', source: 'owner' },
    };
    expect(reasonsOf(l)).toEqual([expect.stringMatching(/^schema: stations\[ST1\]\.serviceTime\.min: uniform min/)]);
  });

  it('rejects a negative quantity and a bad shift time', () => {
    const l = base();
    l.pathGraph.edges[0].length.value = -1;
    l.shifts[0].start = '25:00';
    const r = reasonsOf(l);
    expect(r).toContainEqual(expect.stringMatching(/^schema: pathGraph\.edges\[E1\]\.length\.value: /));
    expect(r).toContainEqual(expect.stringMatching(/^schema: shifts\[day\]\.start: time must be HH:MM/));
  });
});

describe('rule: schema (service times, shifts, rotation)', () => {
  const s = (value: number) => ({ value, unit: 's', source: 'owner' });
  it.each([
    ['fixed value 0', { kind: 'fixed', value: s(0) }, 'serviceTime.value.value'],
    ['exponential mean 0', { kind: 'exponential', mean: s(0) }, 'serviceTime.mean.value'],
    ['normal mean 0', { kind: 'normal', mean: s(0), stdDev: s(5) }, 'serviceTime.mean.value'],
    ['normal stdDev 0', { kind: 'normal', mean: s(30), stdDev: s(0) }, 'serviceTime.stdDev.value'],
    ['lognormal stdDev 0', { kind: 'lognormal', mean: s(30), stdDev: s(0) }, 'serviceTime.stdDev.value'],
    ['uniform max 0', { kind: 'uniform', min: s(0), max: s(0) }, 'serviceTime.max.value'],
  ])('rejects a service time with %s', (_name, st, path) => {
    const l = base();
    l.stations[0].serviceTime = st;
    const r = reasonsOf(l);
    expect(r).toHaveLength(1);
    expect(r[0]?.startsWith(`schema: stations[ST1].${path}: `)).toBe(true);
  });

  it('accepts a uniform service time starting at 0', () => {
    const l = base();
    l.stations[0].serviceTime = { kind: 'uniform', min: s(0), max: s(10) };
    expect(validateLayout(l).ok).toBe(true);
  });

  it('rejects a shift whose end equals its start, in the draft and in the strict schema', () => {
    const l = base();
    l.shifts[0].end = l.shifts[0].start;
    expect(reasonsOf(l)).toEqual(['schema: shifts[day].end: shift end must differ from start (a zero-length shift is not allowed)']);
    expect(ShiftSchema.safeParse(l.shifts[0]).success).toBe(false);
  });

  it('accepts an overnight shift (end earlier than start)', () => {
    const l = base();
    l.shifts[0].start = '22:00';
    l.shifts[0].end = '06:00';
    expect(validateLayout(l).ok).toBe(true);
  });

  it('rejects a repeated day', () => {
    const l = base();
    l.shifts[0].days = ['mon', 'mon'];
    expect(reasonsOf(l)).toEqual(['schema: shifts[day].days: each day may appear only once']);
  });

  it('rotation accepts any finite angle in (-360, 360]', () => {
    const deg = (value: number) => DegreesSchema.safeParse({ value, unit: 'deg', source: 'cad' }).success;
    expect([-359.9, -90, 0, 90, 360].map(deg)).toEqual([true, true, true, true, true]);
    expect([-360, 360.1, Number.NaN, Number.POSITIVE_INFINITY].map(deg)).toEqual([false, false, false, false]);
    const l = base();
    l.racks[0].rotation.value = -90;
    expect(validateLayout(l).ok).toBe(true);
    l.racks[0].rotation.value = 450;
    expect(reasonsOf(l)).toEqual(['schema: racks[R1].rotation.value: rotation must be in (-360, 360] degrees']);
  });
});

describe('formatPath', () => {
  it('handles paths that leave the input shape', () => {
    expect(formatPath({ a: 1 }, [])).toBe('(root)');
    expect(formatPath({ a: 1 }, ['a', 'b'])).toBe('a.b');
    expect(formatPath({ a: 1 }, ['a', 0])).toBe('a[0]');
    expect(formatPath([{ id: 7 }], [0, 'x'])).toBe('[0].x');
  });
});

describe('rule: duplicate-id', () => {
  it('reports the second user of an id and names the first', () => {
    const l = base();
    l.stations[0].id = 'R1';
    l.conveyors[0].fromId = 'R1';
    expect(reasonsOf(l)).toEqual([
      'duplicate-id: stations[R1]: id "R1" is already used by racks[R1]',
    ]);
  });

  it('reports a second cost entry for one fleet type', () => {
    const l = base();
    l.costs.vehicles.push(clone(l.costs.vehicles[0]));
    const id = l.costs.vehicles[0].fleetId;
    expect(reasonsOf(l)).toEqual([`duplicate-id: costs.vehicles[${id}]: fleet type "${id}" already has a cost entry`]);
  });
});

describe('rule: unknown-ref', () => {
  it('reports every dangling reference with entity and field', () => {
    const l = base();
    l.docks[0].zoneId = 'Z-NONE';
    l.racks[0].zoneId = 'Z-NONE';
    l.stations[0].zoneId = 'Z-NONE';
    l.conveyors[0].fromId = 'X';
    l.costs.vehicles.push({ ...clone(l.costs.vehicles[0]), fleetId: 'ghost' });
    expect(reasonsOf(l)).toEqual([
      'unknown-ref: docks[D-IN].zoneId: zone "Z-NONE" does not exist',
      'unknown-ref: racks[R1].zoneId: zone "Z-NONE" does not exist',
      'unknown-ref: stations[ST1].zoneId: zone "Z-NONE" does not exist',
      'unknown-ref: conveyors[CV1].fromId: station or dock "X" does not exist',
      'unknown-ref: costs.vehicles[ghost].fleetId: fleet type "ghost" does not exist',
    ]);
  });

  it('reports unknown access nodes once, without a second reachability reason', () => {
    const l = base();
    l.docks[1].accessNodeId = 'N-GONE';
    l.racks[0].faces[0].accessNodeId = 'N-GONE';
    l.stations[0].accessNodeId = 'N-GONE';
    const r = reasonsOf(l);
    expect(r).toEqual([
      'unknown-ref: docks[D-OUT].accessNodeId: path node "N-GONE" does not exist',
      'unknown-ref: racks[R1].faces[R1-A].accessNodeId: path node "N-GONE" does not exist',
      'unknown-ref: stations[ST1].accessNodeId: path node "N-GONE" does not exist',
    ]);
  });

  it('reports edges to unknown nodes', () => {
    const l = base();
    l.pathGraph.nodes.push(node('N-X', 40, 40));
    l.pathGraph.edges.push(edge(l, 'E-bad1', 'N-GONE', 'N-X'), edge(l, 'E-bad2', 'N-X', 'N-GONE'));
    const r = reasonsOf(l);
    expect(r).toContain('unknown-ref: pathGraph.edges[E-bad1].from: path node "N-GONE" does not exist');
    expect(r).toContain('unknown-ref: pathGraph.edges[E-bad2].to: path node "N-GONE" does not exist');
  });
});

describe('rule: zero-length-edge', () => {
  it('rejects an edge of length 0', () => {
    const l = base();
    l.pathGraph.edges[4].length.value = 0;
    expect(reasonsOf(l)).toEqual(['zero-length-edge: pathGraph.edges[E5].length: edge length 0 m is below the 0.01 m minimum']);
  });

  it('rejects a near-zero stated length', () => {
    const l = base();
    l.pathGraph.edges[4].length.value = 1e-12;
    expect(reasonsOf(l)).toEqual(['zero-length-edge: pathGraph.edges[E5].length: edge length 0 m is below the 0.01 m minimum']);
  });

  it('rejects two nodes on one spot even when the stated length is not 0', () => {
    const l = base();
    l.pathGraph.nodes.push(node('N-TWIN', 0, 5)); // same position as N-IN
    l.pathGraph.edges.push(edgeWith('E-t1', 'N-IN', 'N-TWIN', 1), edgeWith('E-t2', 'N-TWIN', 'N-IN', 1));
    expect(reasonsOf(l)).toEqual([
      'zero-length-edge: pathGraph.edges[E-t1]: nodes "N-IN" and "N-TWIN" are 0 m apart, below the 0.01 m minimum',
      'zero-length-edge: pathGraph.edges[E-t2]: nodes "N-TWIN" and "N-IN" are 0 m apart, below the 0.01 m minimum',
    ]);
  });
});

describe('rule: edge-length-mismatch', () => {
  it('tolerance is max(1 cm, 1% of the node distance)', () => {
    expect(edgeLengthTolerance(0.5)).toBe(0.01);
    expect(edgeLengthTolerance(10)).toBe(0.1);
  });

  it('accepts a length within tolerance and rejects one just outside', () => {
    const l = base();
    l.pathGraph.edges[2].length.value = 10.1; // E3 nodes are exactly 10 m apart
    expect(validateLayout(l).ok).toBe(true);
    l.pathGraph.edges[2].length.value = 10.11;
    expect(reasonsOf(l)).toEqual([
      'edge-length-mismatch: pathGraph.edges[E3].length: length 10.11 m differs from the 10 m between nodes "N-ST" and "N-OUT" by more than 0.1 m',
    ]);
  });

  it('rejects a stated length far longer than the nodes allow', () => {
    const l = base();
    l.pathGraph.edges[0].length.value = 1000;
    expect(reasonsOf(l)).toEqual([
      'edge-length-mismatch: pathGraph.edges[E1].length: length 1000 m differs from the 10.05 m between nodes "N-IN" and "N-R1A" by more than 0.1 m',
    ]);
  });

  it('does not judge geometry for edges to unknown nodes', () => {
    const l = base();
    l.pathGraph.edges.push(edgeWith('E-u', 'N-IN', 'N-GONE', 999));
    expect(reasonsOf(l)).toEqual(['unknown-ref: pathGraph.edges[E-u].to: path node "N-GONE" does not exist']);
  });
});

describe('rule: self-loop-edge', () => {
  it('rejects an edge that starts and ends at one node', () => {
    const l = base();
    l.pathGraph.edges.push(edgeWith('E6', 'N-IN', 'N-IN', 5));
    expect(reasonsOf(l)).toEqual(['self-loop-edge: pathGraph.edges[E6]: edge starts and ends at node "N-IN"']);
  });
});

describe('rule: duplicate-edge', () => {
  it('rejects a second edge with the same from and to', () => {
    const l = base();
    l.pathGraph.edges.push({ ...clone(l.pathGraph.edges[0]), id: 'E1b' });
    expect(reasonsOf(l)).toEqual(['duplicate-edge: pathGraph.edges[E1b]: edge "E1" already runs from "N-IN" to "N-R1A"']);
  });

  it('accepts the reverse edge of a two-way aisle', () => {
    const l = base();
    l.pathGraph.edges.push(edge(l, 'E1r', 'N-R1A', 'N-IN'));
    expect(validateLayout(l).ok).toBe(true);
  });
});

describe('rule: zone-kind-mismatch', () => {
  it('checks docks by direction, racks against storage and stations against pick-pack', () => {
    const l = base();
    l.docks[0].zoneId = 'Z-SHP'; // inbound dock in shipping
    l.docks[1].zoneId = 'Z-RCV'; // outbound dock in receiving
    l.racks[0].zoneId = 'Z-PP';
    l.stations[0].zoneId = 'Z-STO';
    expect(reasonsOf(l)).toEqual([
      'zone-kind-mismatch: docks[D-IN].zoneId: inbound dock sits in shipping zone "Z-SHP"; expected receiving',
      'zone-kind-mismatch: docks[D-OUT].zoneId: outbound dock sits in receiving zone "Z-RCV"; expected shipping',
      'zone-kind-mismatch: racks[R1].zoneId: rack sits in pick-pack zone "Z-PP"; expected storage',
      'zone-kind-mismatch: stations[ST1].zoneId: pick-pack station sits in storage zone "Z-STO"; expected pick-pack',
    ]);
  });

  it('a "both" dock may sit in receiving or shipping, not elsewhere', () => {
    const l = base();
    l.docks[0].kind = 'both';
    expect(validateLayout(l).ok).toBe(true);
    l.docks[0].zoneId = 'Z-SHP';
    expect(validateLayout(l).ok).toBe(true);
    l.docks[0].zoneId = 'Z-PRK';
    expect(reasonsOf(l)).toEqual([
      'zone-kind-mismatch: docks[D-IN].zoneId: both dock sits in parking zone "Z-PRK"; expected receiving or shipping',
    ]);
  });
});

describe('rule: dock-direction-missing', () => {
  it('no inbound-capable dock, reported once (not again for every rack face and station)', () => {
    const l = base();
    l.docks[0].kind = 'outbound';
    delete l.docks[0].zoneId;
    expect(reasonsOf(l)).toEqual([
      'dock-direction-missing: docks: no inbound-capable dock; at least one dock of kind "inbound" or "both" is required',
    ]);
  });

  it('no outbound-capable dock', () => {
    const l = base();
    l.docks[1].kind = 'inbound';
    delete l.docks[1].zoneId;
    expect(reasonsOf(l)).toEqual([
      'dock-direction-missing: docks: no outbound-capable dock; at least one dock of kind "outbound" or "both" is required',
    ]);
  });

  it('a single "both" dock serves both directions', () => {
    const l = base();
    l.docks = [{ ...l.docks[0], kind: 'both' }];
    l.conveyors[0].toId = 'D-IN';
    expect(validateLayout(l).ok).toBe(true);
  });
});

describe('rule: dock-not-connected', () => {
  const withDock = (links: Array<[string, string, string]>, extra: Array<ReturnType<typeof node>> = []) => {
    const l = base();
    l.pathGraph.nodes.push(node('N-D3', 0, 0), ...extra);
    l.pathGraph.edges.push(...links.map(([id, a, b]) => edge(l, id, a, b)));
    l.docks.push({ id: 'D3', kind: 'both', position: pt(0, 0), accessNodeId: 'N-D3' });
    return l;
  };

  it('no edges at all', () => {
    expect(reasonsOf(withDock([]))).toEqual(['dock-not-connected: docks[D3].accessNodeId: node "N-D3" has no edges']);
  });
  it('no incoming edge', () => {
    expect(reasonsOf(withDock([['E-o', 'N-D3', 'N-IN']]))).toEqual([
      'dock-not-connected: docks[D3].accessNodeId: node "N-D3" has no incoming edge',
    ]);
  });
  it('no outgoing edge', () => {
    expect(reasonsOf(withDock([['E-i', 'N-OUT', 'N-D3']]))).toEqual([
      'dock-not-connected: docks[D3].accessNodeId: node "N-D3" has no outgoing edge',
    ]);
  });
  it('a self-loop does not connect a dock', () => {
    expect(reasonsOf(withDock([['E-s', 'N-D3', 'N-D3']]))).toEqual([
      'self-loop-edge: pathGraph.edges[E-s]: edge starts and ends at node "N-D3"',
      'dock-not-connected: docks[D3].accessNodeId: node "N-D3" has no edges',
    ]);
  });
  it('an island cycle cannot reach any rack face or station', () => {
    const l = withDock([['E-a', 'N-D3', 'N-X'], ['E-b', 'N-X', 'N-D3']], [node('N-X', 0, -3)]);
    expect(reasonsOf(l)).toEqual([
      'dock-not-connected: docks[D3].accessNodeId: node "N-D3" cannot reach any rack face or station',
    ]);
  });
  it('a dock no rack face or station can reach', () => {
    const l = withDock([['E-a', 'N-D3', 'N-IN'], ['E-b', 'N-X', 'N-D3']], [node('N-X', 0, -3)]);
    expect(reasonsOf(l)).toEqual([
      'dock-not-connected: docks[D3].accessNodeId: node "N-D3" cannot be reached from any rack face or station',
    ]);
  });
});

describe('rule: rack-face-unreachable', () => {
  it('a face no dock can reach', () => {
    const l = base();
    l.pathGraph.nodes.push(node('N-F', 2, 2));
    l.pathGraph.edges.push(edge(l, 'E-f', 'N-F', 'N-IN'));
    l.racks[0].faces[1].accessNodeId = 'N-F';
    expect(reasonsOf(l)).toEqual([
      'rack-face-unreachable: racks[R1].faces[R1-B].accessNodeId: node "N-F" cannot be reached from any inbound dock',
    ]);
  });

  it('a dead-end face with no route to an outbound dock', () => {
    const l = base();
    l.pathGraph.nodes.push(node('N-F', 2, 2));
    l.pathGraph.edges.push(edge(l, 'E-f', 'N-IN', 'N-F'));
    l.racks[0].faces[1].accessNodeId = 'N-F';
    expect(reasonsOf(l)).toEqual([
      'rack-face-unreachable: racks[R1].faces[R1-B].accessNodeId: no route from node "N-F" to any outbound dock',
    ]);
  });
});

describe('rule: station-unreachable', () => {
  it('a station on an isolated node', () => {
    const l = base();
    l.pathGraph.nodes.push(node('N-S', 20, 0));
    l.stations[0].accessNodeId = 'N-S';
    expect(reasonsOf(l)).toEqual([
      'station-unreachable: stations[ST1].accessNodeId: node "N-S" cannot be reached from any inbound dock',
    ]);
  });

  it('a station that cannot reach an outbound dock', () => {
    const l = base();
    l.pathGraph.nodes.push(node('N-S', 20, 0));
    l.pathGraph.edges.push(edge(l, 'E-s', 'N-ST', 'N-S'));
    l.stations[0].accessNodeId = 'N-S';
    expect(reasonsOf(l)).toEqual([
      'station-unreachable: stations[ST1].accessNodeId: no route from node "N-S" to any outbound dock',
    ]);
  });
});

describe('rule: charging-unreachable', () => {
  it('no charging zone while a fleet type has a battery', () => {
    const l = base();
    l.zones = l.zones.filter((z: Loose) => z.kind !== 'charging');
    expect(reasonsOf(l)).toEqual([
      'charging-unreachable: zones: no zone of kind "charging" exists; fleet types with a battery: amr-1',
    ]);
  });

  it('a charging zone with no served path node inside it', () => {
    const l = base();
    l.pathGraph.edges = l.pathGraph.edges.filter((e: Loose) => !e.id.startsWith('E-CHG'));
    expect(reasonsOf(l)).toEqual([
      'charging-unreachable: zones: no path node inside a charging zone is reachable from a dock and back; fleet types with a battery: amr-1',
    ]);
  });

  it('a charger node reachable from a dock but with no way back', () => {
    const l = base();
    l.pathGraph.edges = l.pathGraph.edges.filter((e: Loose) => e.id !== 'E-CHG2');
    expect(reasonsOf(l)).toEqual([
      'charging-unreachable: zones: no path node inside a charging zone is reachable from a dock and back; fleet types with a battery: amr-1',
    ]);
  });

  it('a charger node on the zone boundary counts', () => {
    const l = base();
    l.pathGraph.nodes.find((n: Loose) => n.id === 'N-CHG').position = pt(5, 12);
    for (const e of l.pathGraph.edges.filter((e: Loose) => e.id.startsWith('E-CHG'))) {
      e.length.value = Math.hypot(5, 4);
    }
    expect(validateLayout(l).ok).toBe(true);
  });

  it('no charging rule when no fleet type states a battery (the battery is then a missing owner input)', () => {
    const l = base();
    l.zones = l.zones.filter((z: Loose) => z.kind !== 'charging');
    delete l.fleet[0].battery;
    expect(reasonsOf(l)).toEqual([
      'missing-owner-input: fleet[amr-1].battery: battery runtime, charge time and recharge threshold is required from the owner',
    ]);
  });
});

describe('pointInPolygon', () => {
  const square = [pt(0, 0), pt(4, 0), pt(4, 4), pt(0, 4)] as Loose;
  it('inside, outside, on an edge and on a vertex', () => {
    expect(pointInPolygon(pt(2, 2) as Loose, square)).toBe(true);
    expect(pointInPolygon(pt(5, 2) as Loose, square)).toBe(false);
    expect(pointInPolygon(pt(2, -1) as Loose, square)).toBe(false);
    expect(pointInPolygon(pt(-1, 2) as Loose, square)).toBe(false);
    expect(pointInPolygon(pt(4, 2) as Loose, square)).toBe(true);
    expect(pointInPolygon(pt(0, 0) as Loose, square)).toBe(true);
    expect(pointInPolygon(pt(6, 0) as Loose, square)).toBe(false); // collinear with an edge, past its end
  });
});

describe('rule: fleet-empty', () => {
  it('no fleet types', () => {
    const l = base();
    l.fleet = [];
    l.costs.vehicles = [];
    expect(reasonsOf(l)).toEqual(['fleet-empty: fleet: no fleet types defined']);
  });

  it('total count of 0', () => {
    const l = base();
    l.fleet[0].count.value = 0;
    expect(reasonsOf(l)).toEqual([
      'fleet-empty: fleet: total vehicle count is 0; at least one vehicle is required',
    ]);
  });

  it('a missing count is reported as an owner input, not as an empty fleet', () => {
    const l = base();
    delete l.fleet[0].count;
    expect(reasonsOf(l)).toEqual(['missing-owner-input: fleet[amr-1].count: vehicle count is required from the owner']);
  });
});

describe('rule: missing-owner-input (never defaulted)', () => {
  it('lists every missing owner input by entity and field', () => {
    const l = base();
    delete l.racks[0].slotCapacity;
    delete l.stations[0].serviceTime;
    delete l.conveyors[0].rate;
    for (const k of ['speed', 'loadTime', 'unloadTime', 'battery']) delete l.fleet[0][k];
    delete l.shifts[0].staff;
    delete l.shifts[0].start;
    delete l.shifts[0].end;
    delete l.shifts[0].days;
    delete l.costs.currency;
    delete l.costs.labourRatePerHour;
    delete l.costs.vehicles;
    expect(reasonsOf(l)).toEqual([
      'missing-owner-input: racks[R1].slotCapacity: slot capacity is required from the owner',
      'missing-owner-input: stations[ST1].serviceTime: service-time distribution is required from the owner',
      'missing-owner-input: conveyors[CV1].rate: conveyor rate is required from the owner',
      'missing-owner-input: fleet[amr-1].speed: vehicle speed is required from the owner',
      'missing-owner-input: fleet[amr-1].loadTime: load time is required from the owner',
      'missing-owner-input: fleet[amr-1].unloadTime: unload time is required from the owner',
      'missing-owner-input: fleet[amr-1].battery: battery runtime, charge time and recharge threshold is required from the owner',
      'missing-owner-input: shifts[day].start: shift start time is required from the owner',
      'missing-owner-input: shifts[day].end: shift end time is required from the owner',
      'missing-owner-input: shifts[day].days: shift days is required from the owner',
      'missing-owner-input: shifts[day].staff: staff count is required from the owner',
      'missing-owner-input: costs.currency: currency is required from the owner',
      'missing-owner-input: costs.labourRatePerHour: labour rate per hour is required from the owner',
      'missing-owner-input: costs.vehicles[amr-1]: vehicle cost for fleet type "amr-1" is required from the owner',
    ]);
  });

  it('no shifts and no costs at all', () => {
    const l = base();
    l.shifts = [];
    delete l.costs;
    expect(reasonsOf(l)).toEqual([
      'missing-owner-input: shifts: at least one shift is required from the owner',
      'missing-owner-input: costs: costs (currency, labour rate, vehicle costs) are required from the owner',
    ]);
  });
});

describe('rule: owner-input-source', () => {
  it('rejects owner inputs that claim CAD provenance, including nested values', () => {
    const l = base();
    l.fleet[0].battery.runtime.source = 'cad';
    l.stations[0].serviceTime.stdDev.source = 'cad';
    l.costs.vehicles[0].capexPerUnit.source = 'cad';
    expect(reasonsOf(l)).toEqual([
      'owner-input-source: stations[ST1].serviceTime.stdDev: owner input cannot come from CAD; use "owner" or "derived"',
      'owner-input-source: fleet[amr-1].battery.runtime: owner input cannot come from CAD; use "owner" or "derived"',
      'owner-input-source: costs.vehicles[amr-1].capexPerUnit: owner input cannot come from CAD; use "owner" or "derived"',
    ]);
  });
});

describe('reasons accumulate across rules', () => {
  it('reports several independent problems in one pass', () => {
    const l = base();
    l.pathGraph.edges[0].length.value = 0;
    l.fleet[0].count.value = 0;
    delete l.shifts[0].staff;
    const r = reasonsOf(l);
    expect(r.map((x) => x.split(':')[0])).toEqual(['zero-length-edge', 'fleet-empty', 'missing-owner-input']);
  });
});
