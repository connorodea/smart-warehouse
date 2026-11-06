import { describe, expect, it } from 'vitest';
import { LAYOUT_SCHEMA_VERSION, LayoutSchema, formatPath, validateLayout, type Layout } from '../src';
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
const edge = (id: string, from: string, to: string, len = 5) => ({
  id,
  from,
  to,
  length: { value: len, unit: 'm', source: 'derived' },
  capacity: { value: 1, unit: 'vehicles', source: 'derived' },
});
const node = (id: string) => ({ id, position: { x: 0, y: 0, unit: 'm', source: 'cad' } });

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
    l.pathGraph.nodes.push(node('N-X'));
    l.pathGraph.edges.push(edge('E-bad1', 'N-GONE', 'N-X'), edge('E-bad2', 'N-X', 'N-GONE'));
    const r = reasonsOf(l);
    expect(r).toContain('unknown-ref: pathGraph.edges[E-bad1].from: path node "N-GONE" does not exist');
    expect(r).toContain('unknown-ref: pathGraph.edges[E-bad2].to: path node "N-GONE" does not exist');
  });
});

describe('rule: zero-length-edge', () => {
  it('rejects an edge of length 0', () => {
    const l = base();
    l.pathGraph.edges[4].length.value = 0;
    expect(reasonsOf(l)).toEqual(['zero-length-edge: pathGraph.edges[E5].length: edge length is 0']);
  });
});

describe('rule: self-loop-edge', () => {
  it('rejects an edge that starts and ends at one node', () => {
    const l = base();
    l.pathGraph.edges.push(edge('E6', 'N-IN', 'N-IN'));
    expect(reasonsOf(l)).toEqual(['self-loop-edge: pathGraph.edges[E6]: edge starts and ends at node "N-IN"']);
  });
});

describe('rule: dock-not-connected', () => {
  const withDock = (edges: Array<ReturnType<typeof edge>>) => {
    const l = base();
    l.pathGraph.nodes.push(node('N-D3'));
    l.pathGraph.edges.push(...edges);
    l.docks.push({ id: 'D3', kind: 'both', position: { x: 0, y: 0, unit: 'm', source: 'cad' }, accessNodeId: 'N-D3' });
    return l;
  };

  it('no edges at all', () => {
    expect(reasonsOf(withDock([]))).toEqual(['dock-not-connected: docks[D3].accessNodeId: node "N-D3" has no edges']);
  });
  it('no incoming edge', () => {
    expect(reasonsOf(withDock([edge('E-o', 'N-D3', 'N-IN')]))).toEqual([
      'dock-not-connected: docks[D3].accessNodeId: node "N-D3" has no incoming edge',
    ]);
  });
  it('no outgoing edge', () => {
    expect(reasonsOf(withDock([edge('E-i', 'N-OUT', 'N-D3')]))).toEqual([
      'dock-not-connected: docks[D3].accessNodeId: node "N-D3" has no outgoing edge',
    ]);
  });
  it('a self-loop does not connect a dock', () => {
    expect(reasonsOf(withDock([edge('E-s', 'N-D3', 'N-D3')]))).toEqual([
      'self-loop-edge: pathGraph.edges[E-s]: edge starts and ends at node "N-D3"',
      'dock-not-connected: docks[D3].accessNodeId: node "N-D3" has no edges',
    ]);
  });
  it('an island cycle cannot reach any rack face or station', () => {
    const l = withDock([edge('E-a', 'N-D3', 'N-X'), edge('E-b', 'N-X', 'N-D3')]);
    l.pathGraph.nodes.push(node('N-X'));
    expect(reasonsOf(l)).toEqual([
      'dock-not-connected: docks[D3].accessNodeId: node "N-D3" cannot reach any rack face or station',
    ]);
  });
  it('a dock no rack face or station can reach', () => {
    const l = withDock([edge('E-a', 'N-D3', 'N-IN'), edge('E-b', 'N-X', 'N-D3')]);
    l.pathGraph.nodes.push(node('N-X'));
    expect(reasonsOf(l)).toEqual([
      'dock-not-connected: docks[D3].accessNodeId: node "N-D3" cannot be reached from any rack face or station',
    ]);
  });
});

describe('rule: rack-face-unreachable', () => {
  it('a face no dock can reach', () => {
    const l = base();
    l.pathGraph.nodes.push(node('N-F'));
    l.pathGraph.edges.push(edge('E-f', 'N-F', 'N-IN'));
    l.racks[0].faces[1].accessNodeId = 'N-F';
    expect(reasonsOf(l)).toEqual([
      'rack-face-unreachable: racks[R1].faces[R1-B].accessNodeId: node "N-F" cannot be reached from any dock',
    ]);
  });

  it('a dead-end face with no route back to a dock', () => {
    const l = base();
    l.pathGraph.nodes.push(node('N-F'));
    l.pathGraph.edges.push(edge('E-f', 'N-IN', 'N-F'));
    l.racks[0].faces[1].accessNodeId = 'N-F';
    expect(reasonsOf(l)).toEqual([
      'rack-face-unreachable: racks[R1].faces[R1-B].accessNodeId: no route from node "N-F" back to any dock',
    ]);
  });
});

describe('rule: station-unreachable', () => {
  it('a station on an isolated node', () => {
    const l = base();
    l.pathGraph.nodes.push(node('N-S'));
    l.stations[0].accessNodeId = 'N-S';
    expect(reasonsOf(l)).toEqual([
      'station-unreachable: stations[ST1].accessNodeId: node "N-S" cannot be reached from any dock',
    ]);
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
    delete l.costs.currency;
    delete l.costs.labourRatePerHour;
    l.costs.vehicles = [];
    expect(reasonsOf(l)).toEqual([
      'missing-owner-input: racks[R1].slotCapacity: slot capacity is required from the owner',
      'missing-owner-input: stations[ST1].serviceTime: service-time distribution is required from the owner',
      'missing-owner-input: conveyors[CV1].rate: conveyor rate is required from the owner',
      'missing-owner-input: fleet[amr-1].speed: vehicle speed is required from the owner',
      'missing-owner-input: fleet[amr-1].loadTime: load time is required from the owner',
      'missing-owner-input: fleet[amr-1].unloadTime: unload time is required from the owner',
      'missing-owner-input: fleet[amr-1].battery: battery runtime, charge time and recharge threshold is required from the owner',
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
