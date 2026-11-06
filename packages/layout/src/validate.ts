import type { z } from 'zod';
import { LayoutDraftSchema, LayoutSchema, type Dock, type Layout, type LayoutDraft, type ZoneKind } from './schema';
import type { Point, Source } from './quantity';

/**
 * Rule codes. Every reason string starts with one of these, then the entity and
 * field it is about, then what is wrong: `<rule>: <where>: <message>`.
 */
export const RULES = {
  schema: 'schema',
  duplicateId: 'duplicate-id',
  unknownRef: 'unknown-ref',
  zeroLengthEdge: 'zero-length-edge',
  edgeLengthMismatch: 'edge-length-mismatch',
  selfLoopEdge: 'self-loop-edge',
  duplicateEdge: 'duplicate-edge',
  zoneKindMismatch: 'zone-kind-mismatch',
  dockDirectionMissing: 'dock-direction-missing',
  dockNotConnected: 'dock-not-connected',
  rackFaceUnreachable: 'rack-face-unreachable',
  stationUnreachable: 'station-unreachable',
  chargingUnreachable: 'charging-unreachable',
  fleetEmpty: 'fleet-empty',
  missingOwnerInput: 'missing-owner-input',
  ownerInputSource: 'owner-input-source',
} as const;
export type Rule = (typeof RULES)[keyof typeof RULES];

export type ValidationResult = { ok: true; layout: Layout } | { ok: false; reasons: string[] };

const reason = (rule: Rule, where: string, message: string) => `${rule}: ${where}: ${message}`;

/**
 * Validate a candidate layout before any sim run (spec section 3).
 *
 * Reachability model (directed edges). Goods enter at an inbound-capable dock
 * (`inbound` or `both`) and leave at an outbound-capable dock (`outbound` or `both`).
 * Every rack face and every station access node must be reachable from at least one
 * inbound-capable dock's access node AND must reach at least one outbound-capable
 * dock's access node. When any fleet type has a battery, at least one path node inside
 * a `charging` zone must be reachable from a dock and lead back to a dock.
 *
 * Owner inputs are never defaulted: each missing one is listed as a reason.
 */
export function validateLayout(input: unknown): ValidationResult {
  const parsed = LayoutDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reasons: parsed.error.issues.map((i) => schemaReason(input, i)) };
  }
  const draft = parsed.data;
  const reasons = [
    ...checkDuplicateIds(draft),
    ...checkRefs(draft),
    ...checkEdges(draft),
    ...checkZoneKinds(draft),
    ...checkConnectivity(draft),
    ...checkFleet(draft),
    ...checkOwnerInputs(draft),
  ];
  if (reasons.length > 0) return { ok: false, reasons };
  // Every gap the strict schema cares about was reported above, so this parse succeeds.
  return { ok: true, layout: LayoutSchema.parse(draft) };
}

// ---------- schema errors ----------

/** Render a zod issue path, naming array elements by their `id` where they have one. */
export function formatPath(root: unknown, path: readonly PropertyKey[]): string {
  let out = '';
  let node: unknown = root;
  for (const key of path) {
    if (typeof key === 'number') {
      const el: unknown = Array.isArray(node) ? node[key] : undefined;
      const id = isRecord(el) && typeof el.id === 'string' ? el.id : String(key);
      out += `[${id}]`;
      node = el;
    } else {
      const k = String(key);
      out += out === '' ? k : `.${k}`;
      node = isRecord(node) ? node[k] : undefined;
    }
  }
  return out === '' ? '(root)' : out;
}

function schemaReason(root: unknown, issue: z.core.$ZodIssue): string {
  return reason(RULES.schema, formatPath(root, issue.path), issue.message);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ---------- ids and references ----------

function allIds(d: LayoutDraft): Array<{ id: string; where: string }> {
  return [
    ...d.zones.map((z) => ({ id: z.id, where: `zones[${z.id}]` })),
    ...d.docks.map((x) => ({ id: x.id, where: `docks[${x.id}]` })),
    ...d.racks.map((x) => ({ id: x.id, where: `racks[${x.id}]` })),
    ...d.racks.flatMap((r) => r.faces.map((f) => ({ id: f.id, where: `racks[${r.id}].faces[${f.id}]` }))),
    ...d.stations.map((x) => ({ id: x.id, where: `stations[${x.id}]` })),
    ...d.conveyors.map((x) => ({ id: x.id, where: `conveyors[${x.id}]` })),
    ...d.pathGraph.nodes.map((x) => ({ id: x.id, where: `pathGraph.nodes[${x.id}]` })),
    ...d.pathGraph.edges.map((x) => ({ id: x.id, where: `pathGraph.edges[${x.id}]` })),
    ...d.fleet.map((x) => ({ id: x.id, where: `fleet[${x.id}]` })),
    ...d.shifts.map((x) => ({ id: x.id, where: `shifts[${x.id}]` })),
  ];
}

/** Ids are unique across the whole layout, so any id names exactly one entity. */
function checkDuplicateIds(d: LayoutDraft): string[] {
  const seen = new Map<string, string>();
  const out: string[] = [];
  for (const { id, where } of allIds(d)) {
    const first = seen.get(id);
    if (first === undefined) seen.set(id, where);
    else out.push(reason(RULES.duplicateId, where, `id "${id}" is already used by ${first}`));
  }
  // costs.vehicles is keyed by fleetId, so a second entry for one fleet type is ambiguous.
  const fleetCosts = new Set<string>();
  for (const v of d.costs?.vehicles ?? []) {
    if (fleetCosts.has(v.fleetId)) {
      out.push(reason(RULES.duplicateId, `costs.vehicles[${v.fleetId}]`, `fleet type "${v.fleetId}" already has a cost entry`));
    }
    fleetCosts.add(v.fleetId);
  }
  return out;
}

function checkRefs(d: LayoutDraft): string[] {
  const zones = new Set(d.zones.map((z) => z.id));
  const nodes = new Set(d.pathGraph.nodes.map((n) => n.id));
  const endpoints = new Set([...d.stations.map((s) => s.id), ...d.docks.map((x) => x.id)]);
  const fleet = new Set(d.fleet.map((f) => f.id));
  const out: string[] = [];
  const need = (ok: boolean, where: string, what: string, id: string) => {
    if (!ok) out.push(reason(RULES.unknownRef, where, `${what} "${id}" does not exist`));
  };
  const zoneRef = (zoneId: string | undefined, where: string) => {
    if (zoneId !== undefined) need(zones.has(zoneId), `${where}.zoneId`, 'zone', zoneId);
  };

  for (const x of d.docks) {
    zoneRef(x.zoneId, `docks[${x.id}]`);
    need(nodes.has(x.accessNodeId), `docks[${x.id}].accessNodeId`, 'path node', x.accessNodeId);
  }
  for (const r of d.racks) {
    zoneRef(r.zoneId, `racks[${r.id}]`);
    for (const f of r.faces) {
      need(nodes.has(f.accessNodeId), `racks[${r.id}].faces[${f.id}].accessNodeId`, 'path node', f.accessNodeId);
    }
  }
  for (const s of d.stations) {
    zoneRef(s.zoneId, `stations[${s.id}]`);
    need(nodes.has(s.accessNodeId), `stations[${s.id}].accessNodeId`, 'path node', s.accessNodeId);
  }
  for (const c of d.conveyors) {
    need(endpoints.has(c.fromId), `conveyors[${c.id}].fromId`, 'station or dock', c.fromId);
    need(endpoints.has(c.toId), `conveyors[${c.id}].toId`, 'station or dock', c.toId);
  }
  for (const e of d.pathGraph.edges) {
    need(nodes.has(e.from), `pathGraph.edges[${e.id}].from`, 'path node', e.from);
    need(nodes.has(e.to), `pathGraph.edges[${e.id}].to`, 'path node', e.to);
  }
  for (const v of d.costs?.vehicles ?? []) {
    need(fleet.has(v.fleetId), `costs.vehicles[${v.fleetId}].fleetId`, 'fleet type', v.fleetId);
  }
  return out;
}

// ---------- path graph ----------

/**
 * Edge geometry tolerances. These are validation rules, not model values: they only
 * decide whether a stated length is believable for the two node positions.
 * - `MIN_EDGE_LENGTH_M`: a stated length or node-to-node distance below 1 cm is a
 *   zero-length edge (two nodes on one spot, or a length typed as 0 / rounding noise).
 * - Length mismatch: |length - distance| may be at most max(1 cm, 1% of distance).
 *   1 cm absorbs CAD rounding on short edges; 1% absorbs rounding on long ones. A
 *   path that curves (longer than the straight line) must be split into straight edges.
 */
export const MIN_EDGE_LENGTH_M = 0.01;
export const EDGE_LENGTH_RELATIVE_TOLERANCE = 0.01;
export const edgeLengthTolerance = (distance: number) =>
  Math.max(MIN_EDGE_LENGTH_M, EDGE_LENGTH_RELATIVE_TOLERANCE * distance);

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const metres = (v: number) => `${Number(v.toFixed(3))} m`;

function checkEdges(d: LayoutDraft): string[] {
  const pos = new Map(d.pathGraph.nodes.map((n) => [n.id, n.position]));
  const out: string[] = [];
  const firstByPair = new Map<string, string>();
  for (const e of d.pathGraph.edges) {
    const at = `pathGraph.edges[${e.id}]`;
    if (e.from === e.to) {
      out.push(reason(RULES.selfLoopEdge, at, `edge starts and ends at node "${e.from}"`));
      continue;
    }
    const pair = JSON.stringify([e.from, e.to]);
    const first = firstByPair.get(pair);
    if (first !== undefined) {
      out.push(reason(RULES.duplicateEdge, at, `edge "${first}" already runs from "${e.from}" to "${e.to}"`));
    } else {
      firstByPair.set(pair, e.id);
    }
    const length = e.length.value;
    if (length < MIN_EDGE_LENGTH_M) {
      out.push(reason(RULES.zeroLengthEdge, `${at}.length`, `edge length ${metres(length)} is below the ${metres(MIN_EDGE_LENGTH_M)} minimum`));
      continue;
    }
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    // Unknown nodes are reported by checkRefs.
    if (a === undefined || b === undefined) continue;
    const dist = distance(a, b);
    if (dist < MIN_EDGE_LENGTH_M) {
      out.push(reason(RULES.zeroLengthEdge, at, `nodes "${e.from}" and "${e.to}" are ${metres(dist)} apart, below the ${metres(MIN_EDGE_LENGTH_M)} minimum`));
    } else if (Math.abs(length - dist) > edgeLengthTolerance(dist)) {
      out.push(
        reason(
          RULES.edgeLengthMismatch,
          `${at}.length`,
          `length ${metres(length)} differs from the ${metres(dist)} between nodes "${e.from}" and "${e.to}" by more than ${metres(edgeLengthTolerance(dist))}`,
        ),
      );
    }
  }
  return out;
}

// ---------- zones ----------

/** Zone kinds each entity may sit in. Entities without a `zoneId` are not checked. */
export const DOCK_ZONE_KINDS: Record<Dock['kind'], readonly ZoneKind[]> = {
  inbound: ['receiving'],
  outbound: ['shipping'],
  both: ['receiving', 'shipping'],
};
export const RACK_ZONE_KINDS: readonly ZoneKind[] = ['storage'];
export const STATION_ZONE_KINDS: readonly ZoneKind[] = ['pick-pack'];

function checkZoneKinds(d: LayoutDraft): string[] {
  const kinds = new Map(d.zones.map((z) => [z.id, z.kind]));
  const out: string[] = [];
  const check = (zoneId: string | undefined, allowed: readonly ZoneKind[], where: string, what: string) => {
    if (zoneId === undefined) return;
    const kind = kinds.get(zoneId);
    // Unknown zones are reported by checkRefs.
    if (kind === undefined || allowed.includes(kind)) return;
    out.push(
      reason(RULES.zoneKindMismatch, `${where}.zoneId`, `${what} sits in ${kind} zone "${zoneId}"; expected ${allowed.join(' or ')}`),
    );
  };
  for (const x of d.docks) check(x.zoneId, DOCK_ZONE_KINDS[x.kind], `docks[${x.id}]`, `${x.kind} dock`);
  for (const r of d.racks) check(r.zoneId, RACK_ZONE_KINDS, `racks[${r.id}]`, 'rack');
  for (const s of d.stations) check(s.zoneId, STATION_ZONE_KINDS, `stations[${s.id}]`, `${s.kind} station`);
  return out;
}

/** True when `p` lies inside the closed polygon or on its boundary. */
export function pointInPolygon(p: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i] as Point;
    const b = polygon[j] as Point;
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    const onSegment =
      cross === 0 &&
      p.x >= Math.min(a.x, b.x) &&
      p.x <= Math.max(a.x, b.x) &&
      p.y >= Math.min(a.y, b.y) &&
      p.y <= Math.max(a.y, b.y);
    if (onSegment) return true;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// ---------- path graph reachability ----------

function reachable(starts: Iterable<string>, adj: Map<string, string[]>): Set<string> {
  const seen = new Set<string>(starts);
  const queue = [...seen];
  while (queue.length > 0) {
    const n = queue.pop() as string;
    for (const m of adj.get(n) ?? []) {
      if (!seen.has(m)) {
        seen.add(m);
        queue.push(m);
      }
    }
  }
  return seen;
}

const intersects = (set: Set<string>, items: string[]) => items.some((i) => set.has(i));

function checkConnectivity(d: LayoutDraft): string[] {
  const nodes = new Set(d.pathGraph.nodes.map((n) => n.id));
  const fwd = new Map<string, string[]>();
  const back = new Map<string, string[]>();
  // Self-loops are reported by checkEdges and never connect anything.
  for (const e of d.pathGraph.edges.filter((e) => e.from !== e.to)) {
    fwd.set(e.from, [...(fwd.get(e.from) ?? []), e.to]);
    back.set(e.to, [...(back.get(e.to) ?? []), e.from]);
  }
  const out: string[] = [];

  // Places a vehicle works at: rack faces and stations. Unknown nodes are reported by checkRefs.
  const places = [
    ...d.racks.flatMap((r) => r.faces.map((f) => f.accessNodeId)),
    ...d.stations.map((s) => s.accessNodeId),
  ].filter((n) => nodes.has(n));

  // Docks: the access node needs a way in and a way out, and both must lead to a place.
  for (const x of d.docks.filter((x) => nodes.has(x.accessNodeId))) {
    const n = x.accessNodeId;
    const hasIn = back.has(n);
    const hasOut = fwd.has(n);
    let problem: string | undefined;
    if (!hasIn || !hasOut) {
      problem = `has ${!hasIn && !hasOut ? 'no edges' : !hasIn ? 'no incoming edge' : 'no outgoing edge'}`;
    } else if (!intersects(reachable([n], fwd), places)) {
      problem = 'cannot reach any rack face or station';
    } else if (!intersects(reachable([n], back), places)) {
      problem = 'cannot be reached from any rack face or station';
    }
    if (problem !== undefined) {
      out.push(reason(RULES.dockNotConnected, `docks[${x.id}].accessNodeId`, `node "${n}" ${problem}`));
    }
  }

  const known = (docks: LayoutDraft['docks']) => docks.map((x) => x.accessNodeId).filter((n) => nodes.has(n));
  const inbound = d.docks.filter((x) => x.kind !== 'outbound');
  const outbound = d.docks.filter((x) => x.kind !== 'inbound');
  if (inbound.length === 0) {
    out.push(reason(RULES.dockDirectionMissing, 'docks', 'no inbound-capable dock; at least one dock of kind "inbound" or "both" is required'));
  }
  if (outbound.length === 0) {
    out.push(reason(RULES.dockDirectionMissing, 'docks', 'no outbound-capable dock; at least one dock of kind "outbound" or "both" is required'));
  }

  // A missing direction is reported once above, and a direction whose docks all sit on
  // unknown nodes is reported by checkRefs; neither is repeated for every place.
  const inboundNodes = known(inbound);
  const outboundNodes = known(outbound);
  const fromInbound = inboundNodes.length === 0 ? undefined : reachable(inboundNodes, fwd);
  const toOutbound = outboundNodes.length === 0 ? undefined : reachable(outboundNodes, back);
  const why = (n: string): string | undefined =>
    fromInbound !== undefined && !fromInbound.has(n)
      ? `node "${n}" cannot be reached from any inbound dock`
      : toOutbound !== undefined && !toOutbound.has(n)
        ? `no route from node "${n}" to any outbound dock`
        : undefined;

  for (const r of d.racks) {
    for (const f of r.faces.filter((f) => nodes.has(f.accessNodeId))) {
      const problem = why(f.accessNodeId);
      if (problem !== undefined) out.push(reason(RULES.rackFaceUnreachable, `racks[${r.id}].faces[${f.id}].accessNodeId`, problem));
    }
  }
  for (const s of d.stations.filter((s) => nodes.has(s.accessNodeId))) {
    const problem = why(s.accessNodeId);
    if (problem !== undefined) out.push(reason(RULES.stationUnreachable, `stations[${s.id}].accessNodeId`, problem));
  }

  // Charging: a battery vehicle must be able to drive from a dock to a charger and back.
  const battery = d.fleet.filter((f) => f.battery !== undefined).map((f) => f.id);
  if (battery.length > 0) {
    const fromDock = reachable(known(d.docks), fwd);
    const toDock = reachable(known(d.docks), back);
    const chargers = d.zones.filter((z) => z.kind === 'charging');
    const served = d.pathGraph.nodes.some(
      (n) => fromDock.has(n.id) && toDock.has(n.id) && chargers.some((z) => pointInPolygon(n.position, z.polygon)),
    );
    const fleets = `fleet types with a battery: ${battery.join(', ')}`;
    if (chargers.length === 0) {
      out.push(reason(RULES.chargingUnreachable, 'zones', `no zone of kind "charging" exists; ${fleets}`));
    } else if (!served) {
      out.push(
        reason(RULES.chargingUnreachable, 'zones', `no path node inside a charging zone is reachable from a dock and back; ${fleets}`),
      );
    }
  }
  return out;
}

// ---------- fleet ----------

function checkFleet(d: LayoutDraft): string[] {
  if (d.fleet.length === 0) return [reason(RULES.fleetEmpty, 'fleet', 'no fleet types defined')];
  const counts = d.fleet.map((f) => f.count);
  // A missing count is reported as a missing owner input; judge the total only when all counts exist.
  if (counts.some((c) => c === undefined)) return [];
  const total = counts.reduce((sum, c) => sum + (c as { value: number }).value, 0);
  return total > 0 ? [] : [reason(RULES.fleetEmpty, 'fleet', 'total vehicle count is 0; at least one vehicle is required')];
}

// ---------- owner inputs ----------

type Sourced = { source: Source };

/** Every `{ source }` object inside a value, with its path. */
function sourcedLeaves(value: unknown, path: string): Array<{ path: string; source: Source }> {
  if (!isRecord(value)) return [];
  if ('source' in value) return [{ path, source: (value as Sourced).source }];
  return Object.entries(value).flatMap(([k, v]) => sourcedLeaves(v, `${path}.${k}`));
}

function checkOwnerInputs(d: LayoutDraft): string[] {
  const out: string[] = [];
  const owner = (value: unknown, where: string, what: string) => {
    if (value === undefined) {
      out.push(reason(RULES.missingOwnerInput, where, `${what} is required from the owner`));
      return;
    }
    for (const leaf of sourcedLeaves(value, where).filter((l) => l.source === 'cad')) {
      out.push(reason(RULES.ownerInputSource, leaf.path, 'owner input cannot come from CAD; use "owner" or "derived"'));
    }
  };

  for (const r of d.racks) owner(r.slotCapacity, `racks[${r.id}].slotCapacity`, 'slot capacity');
  for (const s of d.stations) owner(s.serviceTime, `stations[${s.id}].serviceTime`, 'service-time distribution');
  for (const c of d.conveyors) owner(c.rate, `conveyors[${c.id}].rate`, 'conveyor rate');
  for (const f of d.fleet) {
    const at = `fleet[${f.id}]`;
    owner(f.count, `${at}.count`, 'vehicle count');
    owner(f.speed, `${at}.speed`, 'vehicle speed');
    owner(f.loadTime, `${at}.loadTime`, 'load time');
    owner(f.unloadTime, `${at}.unloadTime`, 'unload time');
    owner(f.battery, `${at}.battery`, 'battery runtime, charge time and recharge threshold');
  }

  if (d.shifts.length === 0) {
    out.push(reason(RULES.missingOwnerInput, 'shifts', 'at least one shift is required from the owner'));
  }
  for (const s of d.shifts) {
    owner(s.start, `shifts[${s.id}].start`, 'shift start time');
    owner(s.end, `shifts[${s.id}].end`, 'shift end time');
    owner(s.days, `shifts[${s.id}].days`, 'shift days');
    owner(s.staff, `shifts[${s.id}].staff`, 'staff count');
  }

  if (d.costs === undefined) {
    out.push(reason(RULES.missingOwnerInput, 'costs', 'costs (currency, labour rate, vehicle costs) are required from the owner'));
    return out;
  }
  const costs = d.costs;
  if (costs.currency === undefined) {
    out.push(reason(RULES.missingOwnerInput, 'costs.currency', 'currency is required from the owner'));
  }
  owner(costs.labourRatePerHour, 'costs.labourRatePerHour', 'labour rate per hour');
  for (const f of d.fleet) {
    const entry = costs.vehicles?.find((v) => v.fleetId === f.id);
    owner(entry, `costs.vehicles[${f.id}]`, `vehicle cost for fleet type "${f.id}"`);
  }
  return out;
}
