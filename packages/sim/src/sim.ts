import { validateLayout, type Layout, type PathEdge, type ServiceTime } from '@twin/layout';
import { CsvError, parseOrdersCsv, type Order } from './csv';
import { aStar, buildGraph, reach, type Graph } from './graph';
import { mulberry32, sampleServiceTime, type Rng } from './prng';
import { EventQueue } from './queue';
import type {
  EventType,
  InboundArrival,
  Kpis,
  LogEntry,
  OpenOrderStatus,
  PalletSnapshot,
  SimInput,
  VehicleState,
} from './types';

// ---------- internal state ----------

type PalletLoc = 'dock' | 'vehicle' | 'rack' | 'station' | 'conveyor' | 'shipped';

interface Pallet {
  id: string;
  sku: string;
  loc: PalletLoc;
  /** Set while the pallet is stored in a rack. */
  rack?: RackState;
  faceNode?: string;
  orderId?: string;
}

interface RackState {
  id: string;
  capacity: number;
  stored: number;
  /** Slots promised to pallets already on their way here. */
  reserved: number;
  faces: Array<{ id: string; node: string }>;
}

interface Server {
  queue: Pallet[];
  busy: boolean;
  max: number;
}

interface StationState extends Server {
  id: string;
  node: string;
  dist: ServiceTime;
  /** Pallets assigned to this station and not yet finished (on the way, queued or in service). */
  load: number;
  conveyor?: ConveyorState;
}

interface ConveyorState extends Server {
  id: string;
  toDockId: string;
  seconds: number;
}

interface DockRef {
  id: string;
  node: string;
}

interface Vehicle {
  id: string;
  speed: number;
  loadTime: number;
  unloadTime: number;
  node: string;
  state: VehicleState;
  since: number;
  busy: number;
  route: PathEdge[];
  onArrive: () => void;
}

interface Task {
  pallet: Pallet;
  pickup: string;
  pickupId: string;
  drop: string;
  dropId: string;
  onLoad: () => void;
  onUnload: () => void;
}

interface OrderState {
  order: Order;
  arrived: boolean;
  shipped: number;
}

interface EdgeState {
  occupant: Vehicle | null;
  waiters: Vehicle[];
}

// ---------- public API ----------

export interface Sim {
  readonly layout: Layout;
  /** Current sim clock in seconds. */
  readonly now: number;
  readonly log: readonly LogEntry[];
  /** Run the single earliest event. Returns false when none is left or the next is past the horizon. */
  next(): boolean;
  /** Run every event with time <= t (capped at the horizon) and move the clock to that time. */
  stepUntil(t: number): void;
  /** Run to completion, or up to the horizon (the clock then ends at the horizon). */
  run(): void;
  kpis(): Kpis;
  pallets(): PalletSnapshot;
}

export type CreateSimResult = { ok: true; sim: Sim } | { ok: false; reasons: string[] };

export interface SimResult {
  log: LogEntry[];
  kpis: Kpis;
}
export type RunSimResult = ({ ok: true } & SimResult) | { ok: false; reasons: string[] };

/** Validate the input, run it headless to completion and return the event log and KPIs. */
export function runSim(input: SimInput): RunSimResult {
  const created = createSim(input);
  if (!created.ok) return created;
  created.sim.run();
  return { ok: true, log: [...created.sim.log], kpis: created.sim.kpis() };
}

const noop = (): void => undefined;
const isOutbound = (k: string) => k === 'outbound' || k === 'both';
const isInbound = (k: string) => k === 'inbound' || k === 'both';

/**
 * Build a sim from a layout, the order CSV, the inbound list and a seed.
 * Nothing runs until `next`, `stepUntil` or `run` is called.
 */
export function createSim(input: SimInput): CreateSimResult {
  const v = validateLayout(input.layout);
  if (!v.ok) return { ok: false, reasons: v.reasons };
  const layout = v.layout;

  const reasons: string[] = [];
  if (!Number.isInteger(input.seed)) reasons.push(`input: seed: ${String(input.seed)} is not an integer`);
  const horizon = input.horizon ?? Infinity;
  if (!(horizon > 0)) reasons.push(`input: horizon: ${String(input.horizon)} must be a number of seconds > 0`);

  let orders: Order[] = [];
  try {
    orders = parseOrdersCsv(input.ordersCsv);
  } catch (e) {
    reasons.push(`orders-csv: ${(e as CsvError).message}`);
  }

  const docks = new Map(layout.docks.map((d) => [d.id, d]));
  const inboundIds = new Set<string>();
  for (const a of input.inbound) {
    const at = `inbound[${a.id}]`;
    if (a.id === '' || inboundIds.has(a.id)) reasons.push(`${at}: id must be non-empty and unique`);
    inboundIds.add(a.id);
    if (!Number.isFinite(a.t) || a.t < 0) reasons.push(`${at}.t: ${a.t} is not a number of seconds >= 0`);
    if (!Number.isInteger(a.pallets) || a.pallets < 1) reasons.push(`${at}.pallets: ${a.pallets} is not a whole number >= 1`);
    if (a.sku === '') reasons.push(`${at}.sku: sku is empty`);
    const dock = docks.get(a.dockId);
    if (dock === undefined) reasons.push(`${at}.dockId: dock "${a.dockId}" does not exist`);
    else if (!isInbound(dock.kind)) reasons.push(`${at}.dockId: dock "${a.dockId}" is ${dock.kind}, not inbound`);
  }
  if (orders.length > 0) {
    if (layout.stations.length === 0) reasons.push('layout: stations: orders need at least one pick-pack station');
    if (!layout.docks.some((d) => isOutbound(d.kind))) reasons.push('layout: docks: orders need at least one outbound dock');
  }

  const graph = buildGraph(layout);
  reasons.push(...checkOneNetwork(layout, graph));
  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true, sim: new Engine(layout, graph, orders, input.inbound, mulberry32(input.seed), horizon) };
}

/**
 * v1 needs every dock, rack face and station on one strongly connected network, so a
 * vehicle can always drive from any of them to any other. `validateLayout` only asks
 * for a round trip through some dock; this is the stronger sim-run rule.
 */
function checkOneNetwork(layout: Layout, g: Graph): string[] {
  const service: Array<{ where: string; node: string }> = [
    ...layout.docks.map((d) => ({ where: `docks[${d.id}]`, node: d.accessNodeId })),
    ...layout.racks.flatMap((r) => r.faces.map((f) => ({ where: `racks[${r.id}].faces[${f.id}]`, node: f.accessNodeId }))),
    ...layout.stations.map((s) => ({ where: `stations[${s.id}]`, node: s.accessNodeId })),
  ];
  const root = service[0] as { node: string };
  const fwd = reach(g, root.node, false);
  const back = reach(g, root.node, true);
  return service
    .filter((s) => !fwd.has(s.node) || !back.has(s.node))
    .map(
      (s) =>
        `sim-unreachable: ${s.where}.accessNodeId: node "${s.node}" is not on the same two-way network as node "${root.node}"; v1 needs every dock, rack face and station mutually reachable`,
    );
}

// ---------- engine ----------

class Engine implements Sim {
  readonly log: LogEntry[] = [];
  now = 0;

  private readonly queue = new EventQueue();
  private readonly routes = new Map<string, { cost: number; edges: PathEdge[] }>();
  private readonly edges = new Map<string, EdgeState>();
  private readonly racks: RackState[];
  private readonly stations: StationState[];
  private readonly conveyors: ConveyorState[] = [];
  private readonly outbound: DockRef[];
  private readonly dockNode = new Map<string, string>();
  private readonly vehicles: Vehicle[] = [];
  private readonly tasks: Task[] = [];
  private readonly allPallets: Pallet[] = [];
  private readonly stock = new Map<string, Pallet[]>();
  private readonly pending: Array<{ order: OrderState; sku: string }> = [];
  private readonly awaitingRack: Array<{ pallet: Pallet; dock: DockRef }> = [];
  private readonly orders: OrderState[];
  private readonly orderById = new Map<string, OrderState>();
  private readonly shipTimes: Array<{ orderId: string; seconds: number }> = [];
  private shippedPallets = 0;

  constructor(
    readonly layout: Layout,
    private readonly graph: Graph,
    orders: Order[],
    inbound: InboundArrival[],
    private readonly rng: Rng,
    private readonly horizon: number,
  ) {
    for (const e of layout.pathGraph.edges) this.edges.set(e.id, { occupant: null, waiters: [] });
    for (const d of layout.docks) this.dockNode.set(d.id, d.accessNodeId);
    this.racks = layout.racks.map((r) => ({
      id: r.id,
      capacity: r.rows.value * r.levels.value * r.slots.value * r.slotCapacity.value,
      stored: 0,
      reserved: 0,
      faces: r.faces.map((f) => ({ id: f.id, node: f.accessNodeId })),
    }));
    this.outbound = layout.docks.filter((d) => isOutbound(d.kind)).map((d) => ({ id: d.id, node: d.accessNodeId }));
    const outboundIds = new Set(this.outbound.map((d) => d.id));
    this.stations = layout.stations.map((s) => {
      const c = layout.conveyors.find((c) => c.fromId === s.id && outboundIds.has(c.toId));
      let conveyor: ConveyorState | undefined;
      if (c !== undefined) {
        conveyor = { id: c.id, toDockId: c.toId, seconds: 3600 / c.rate.value, queue: [], busy: false, max: 0 };
        this.conveyors.push(conveyor);
      }
      return { id: s.id, node: s.accessNodeId, dist: s.serviceTime, queue: [], busy: false, max: 0, load: 0, conveyor };
    });

    const start = (layout.docks.find((d) => isInbound(d.kind)) ?? (layout.docks[0] as Layout['docks'][number])).accessNodeId;
    for (const f of layout.fleet) {
      for (let i = 0; i < f.count.value; i++) {
        this.vehicles.push({
          id: `${f.id}#${i + 1}`,
          speed: f.speed.value,
          loadTime: f.loadTime.value,
          unloadTime: f.unloadTime.value,
          node: start,
          state: 'idle',
          since: 0,
          busy: 0,
          route: [],
          onArrive: noop,
        });
      }
    }

    // Inbound first, then orders: at equal times a delivery is handled before an order.
    for (const a of inbound) this.queue.push(a.t, () => this.onInbound(a));
    this.orders = orders.map((order) => ({ order, arrived: false, shipped: 0 }));
    for (const o of this.orders) {
      this.orderById.set(o.order.id, o);
      this.queue.push(o.order.t, () => this.onOrder(o));
    }
  }

  // ---------- clock ----------

  next(): boolean {
    const ev = this.queue.peek();
    if (ev === undefined || ev.t > this.horizon) return false;
    this.queue.pop();
    this.now = ev.t;
    ev.fire();
    return true;
  }

  stepUntil(t: number): void {
    const limit = Math.min(t, this.horizon);
    for (let ev = this.queue.peek(); ev !== undefined && ev.t <= limit; ev = this.queue.peek()) this.next();
    if (Number.isFinite(limit) && limit > this.now) this.now = limit;
  }

  run(): void {
    while (this.next());
    // Events are left only when the next one is past a finite horizon: the run ends there.
    if (this.queue.size > 0) this.now = this.horizon;
  }

  private at(dt: number, fire: () => void): void {
    this.queue.push(this.now + dt, fire);
  }

  private emit(entityId: string, type: EventType, from: string | null, to: string | null, payload: LogEntry['payload'] = {}): void {
    this.log.push({ t: this.now, entityId, type, from, to, payload });
  }

  // ---------- routing ----------

  private route(from: string, to: string): { cost: number; edges: PathEdge[] } {
    const key = `${from}\u0000${to}`;
    let r = this.routes.get(key);
    if (r === undefined) {
      // checkOneNetwork guarantees every service node reaches every other.
      r = aStar(this.graph, from, to) as { cost: number; edges: PathEdge[] };
      this.routes.set(key, r);
    }
    return r;
  }

  private dist(from: string, to: string): number {
    return this.route(from, to).cost;
  }

  // ---------- vehicles ----------

  private setState(v: Vehicle, s: VehicleState): void {
    if (v.state !== 'idle') v.busy += this.now - v.since;
    this.emit(v.id, 'vehicle.state', v.state, s);
    v.state = s;
    v.since = this.now;
  }

  private travel(v: Vehicle, target: string, done: () => void): void {
    const edges = this.route(v.node, target).edges;
    if (edges.length === 0) {
      done();
      return;
    }
    this.setState(v, 'travel');
    v.route = [...edges];
    v.onArrive = done;
    this.advance(v);
  }

  private advance(v: Vehicle): void {
    const e = v.route[0];
    if (e === undefined) {
      v.onArrive();
      return;
    }
    const es = this.edges.get(e.id) as EdgeState;
    if (es.occupant === null) this.enter(v, e, es);
    else {
      es.waiters.push(v);
      this.emit(v.id, 'edge.wait', e.from, e.to, { edgeId: e.id, blockedBy: es.occupant.id });
    }
  }

  /** Capacity 1: a vehicle holds the edge from entering it until it reaches the far node. */
  private enter(v: Vehicle, e: PathEdge, es: EdgeState): void {
    es.occupant = v;
    v.route.shift();
    this.emit(v.id, 'edge.enter', e.from, e.to, { edgeId: e.id });
    this.at(e.length.value / v.speed, () => {
      es.occupant = null;
      v.node = e.to;
      this.emit(v.id, 'edge.exit', e.from, e.to, { edgeId: e.id });
      const w = es.waiters.shift();
      if (w !== undefined) this.enter(w, e, es);
      this.advance(v);
    });
  }

  private addTask(task: Task): void {
    this.tasks.push(task);
    this.dispatch();
  }

  /** Tasks go first-in first-out to the nearest idle vehicle (ties: fleet order). */
  private dispatch(): void {
    while (this.tasks.length > 0) {
      const task = this.tasks[0] as Task;
      let best: Vehicle | undefined;
      let bestD = Infinity;
      for (const v of this.vehicles) {
        if (v.state !== 'idle') continue;
        const d = this.dist(v.node, task.pickup);
        if (d < bestD) {
          best = v;
          bestD = d;
        }
      }
      if (best === undefined) return;
      this.tasks.shift();
      this.runTask(best, task);
    }
  }

  private runTask(v: Vehicle, task: Task): void {
    this.travel(v, task.pickup, () => {
      this.setState(v, 'load');
      this.at(v.loadTime, () => {
        task.onLoad();
        task.pallet.loc = 'vehicle';
        this.emit(task.pallet.id, 'pallet.load', task.pickupId, v.id);
        this.travel(v, task.drop, () => {
          this.setState(v, 'unload');
          this.at(v.unloadTime, () => {
            this.emit(task.pallet.id, 'pallet.unload', v.id, task.dropId);
            this.setState(v, 'idle');
            task.onUnload();
            this.dispatch();
          });
        });
      });
    });
  }

  // ---------- inbound and putaway ----------

  private onInbound(a: InboundArrival): void {
    this.emit(a.id, 'inbound.arrive', null, a.dockId, { sku: a.sku, pallets: a.pallets });
    const dock = { id: a.dockId, node: this.dockNode.get(a.dockId) as string };
    for (let k = 1; k <= a.pallets; k++) {
      const pallet: Pallet = { id: `${a.id}#${k}`, sku: a.sku, loc: 'dock' };
      this.allPallets.push(pallet);
      this.putaway(pallet, dock);
    }
  }

  /** Nearest rack face (by route length from `from`) on a rack with a free slot. Ties: layout order. */
  private chooseRack(from: string): { rack: RackState; node: string } | undefined {
    let best: { rack: RackState; node: string } | undefined;
    let bestD = Infinity;
    for (const rack of this.racks) {
      if (rack.stored + rack.reserved >= rack.capacity) continue;
      for (const f of rack.faces) {
        const d = this.dist(from, f.node);
        if (d < bestD) {
          best = { rack, node: f.node };
          bestD = d;
        }
      }
    }
    return best;
  }

  private putaway(pallet: Pallet, dock: DockRef): void {
    const choice = this.chooseRack(dock.node);
    if (choice === undefined) {
      this.awaitingRack.push({ pallet, dock });
      this.emit(pallet.id, 'pallet.wait-rack', dock.id, null);
      return;
    }
    const { rack, node } = choice;
    rack.reserved++;
    this.addTask({
      pallet,
      pickup: dock.node,
      pickupId: dock.id,
      drop: node,
      dropId: rack.id,
      onLoad: noop,
      onUnload: () => {
        rack.reserved--;
        rack.stored++;
        pallet.loc = 'rack';
        pallet.rack = rack;
        pallet.faceNode = node;
        this.emit(pallet.id, 'pallet.store', null, rack.id, { sku: pallet.sku });
        const i = this.pending.findIndex((p) => p.sku === pallet.sku);
        if (i >= 0) {
          const [want] = this.pending.splice(i, 1) as [{ order: OrderState; sku: string }];
          this.retrieve(pallet, want.order);
        } else {
          const list = this.stock.get(pallet.sku) ?? [];
          list.push(pallet);
          this.stock.set(pallet.sku, list);
        }
      },
    });
  }

  private retryAwaitingRack(): void {
    for (let w = this.awaitingRack[0]; w !== undefined && this.chooseRack(w.dock.node) !== undefined; w = this.awaitingRack[0]) {
      this.awaitingRack.shift();
      this.putaway(w.pallet, w.dock);
    }
  }

  // ---------- orders ----------

  private onOrder(o: OrderState): void {
    o.arrived = true;
    this.emit(o.order.id, 'order.arrive', null, null, { lines: o.order.lines.length });
    for (const line of o.order.lines) {
      const pallet = this.stock.get(line.sku)?.shift();
      if (pallet !== undefined) this.retrieve(pallet, o);
      else {
        this.pending.push({ order: o, sku: line.sku });
        this.emit(o.order.id, 'order.wait-stock', null, null, { sku: line.sku });
      }
    }
  }

  /** Least-loaded station, then nearest by route from `from`, then layout order. */
  private chooseStation(from: string): StationState {
    let best = this.stations[0] as StationState;
    let bestD = this.dist(from, best.node);
    for (const s of this.stations) {
      const d = this.dist(from, s.node);
      if (s.load < best.load || (s.load === best.load && d < bestD)) {
        best = s;
        bestD = d;
      }
    }
    return best;
  }

  private retrieve(pallet: Pallet, o: OrderState): void {
    pallet.orderId = o.order.id;
    const rack = pallet.rack as RackState;
    const face = pallet.faceNode as string;
    const station = this.chooseStation(face);
    station.load++;
    this.addTask({
      pallet,
      pickup: face,
      pickupId: rack.id,
      drop: station.node,
      dropId: station.id,
      onLoad: () => {
        rack.stored--;
        pallet.rack = undefined;
        this.retryAwaitingRack();
      },
      onUnload: () => {
        pallet.loc = 'station';
        this.enqueue(station, pallet, 'station.queue', station.id);
        this.serveStation(station);
      },
    });
  }

  private enqueue(server: Server, pallet: Pallet, type: EventType, id: string): void {
    server.queue.push(pallet);
    server.max = Math.max(server.max, server.queue.length);
    this.emit(pallet.id, type, null, id, { queue: server.queue.length });
  }

  private serveStation(s: StationState): void {
    if (s.busy) return;
    const pallet = s.queue.shift();
    if (pallet === undefined) return;
    s.busy = true;
    const seconds = sampleServiceTime(s.dist, this.rng);
    this.emit(pallet.id, 'station.start', null, s.id, { seconds });
    this.at(seconds, () => {
      s.busy = false;
      s.load--;
      this.emit(pallet.id, 'station.done', s.id, null);
      this.afterStation(s, pallet);
      this.serveStation(s);
    });
  }

  /** A station's own conveyor to an outbound dock if it has one, else a vehicle to the nearest outbound dock. */
  private afterStation(s: StationState, pallet: Pallet): void {
    const c = s.conveyor;
    if (c !== undefined) {
      pallet.loc = 'conveyor';
      this.enqueue(c, pallet, 'conveyor.queue', c.id);
      this.serveConveyor(c);
      return;
    }
    let dock = this.outbound[0] as DockRef;
    for (const d of this.outbound) if (this.dist(s.node, d.node) < this.dist(s.node, dock.node)) dock = d;
    this.addTask({
      pallet,
      pickup: s.node,
      pickupId: s.id,
      drop: dock.node,
      dropId: dock.id,
      onLoad: noop,
      onUnload: () => this.ship(pallet, dock.id),
    });
  }

  /** Conveyor v1: a single server whose time per item is 3600 / rate (items per hour). */
  private serveConveyor(c: ConveyorState): void {
    if (c.busy) return;
    const pallet = c.queue.shift();
    if (pallet === undefined) return;
    c.busy = true;
    this.emit(pallet.id, 'conveyor.start', null, c.id, { seconds: c.seconds });
    this.at(c.seconds, () => {
      c.busy = false;
      this.emit(pallet.id, 'conveyor.done', c.id, c.toDockId);
      this.ship(pallet, c.toDockId);
      this.serveConveyor(c);
    });
  }

  private ship(pallet: Pallet, dockId: string): void {
    pallet.loc = 'shipped';
    this.shippedPallets++;
    this.emit(pallet.id, 'pallet.ship', null, dockId);
    const o = this.orderById.get(pallet.orderId as string) as OrderState;
    o.shipped++;
    if (o.shipped === o.order.lines.length) {
      const seconds = this.now - o.order.t;
      this.shipTimes.push({ orderId: o.order.id, seconds });
      this.emit(o.order.id, 'order.ship', null, dockId, { seconds });
    }
  }

  // ---------- outputs ----------

  pallets(): PalletSnapshot {
    return {
      palletsIn: this.allPallets.length,
      stored: this.racks.reduce((n, r) => n + r.stored, 0),
      inTransit: this.allPallets.filter((p) => p.loc !== 'rack' && p.loc !== 'shipped').length,
      shipped: this.shippedPallets,
    };
  }

  kpis(): Kpis {
    const end = this.now;
    const shipped = new Set(this.shipTimes.map((s) => s.orderId));
    const status = (o: OrderState): OpenOrderStatus =>
      !o.arrived ? 'not-arrived' : this.pending.some((p) => p.order === o) ? 'awaiting-stock' : 'in-progress';
    const vehicles = this.vehicles.map((v) => {
      const busySeconds = v.busy + (v.state === 'idle' ? 0 : end - v.since);
      return { vehicleId: v.id, state: v.state, busySeconds, utilisation: end > 0 ? busySeconds / end : 0 };
    });
    const capacity = this.racks.reduce((n, r) => n + r.capacity, 0);
    const stored = this.racks.reduce((n, r) => n + r.stored, 0);
    const total = this.shipTimes.reduce((n, s) => n + s.seconds, 0);
    return {
      endTime: end,
      ordersTotal: this.orders.length,
      ordersShipped: this.shipTimes.length,
      openOrders: this.orders
        .filter((o) => !shipped.has(o.order.id))
        .map((o) => ({ orderId: o.order.id, status: status(o) })),
      ordersPerHour: end > 0 ? this.shipTimes.length / (end / 3600) : 0,
      orderToShip: {
        meanSeconds: this.shipTimes.length > 0 ? total / this.shipTimes.length : 0,
        list: this.shipTimes.map((s) => ({ ...s })),
      },
      rackFillPercent: (stored / capacity) * 100,
      racks: this.racks.map((r) => ({
        rackId: r.id,
        storedPallets: r.stored,
        capacityPallets: r.capacity,
        fillPercent: (r.stored / r.capacity) * 100,
      })),
      freeVehicles: this.vehicles.filter((v) => v.state === 'idle').length,
      vehicleUtilisation: vehicles.reduce((n, v) => n + v.utilisation, 0) / vehicles.length,
      vehicles,
      queueLengths: {
        tasksWaiting: this.tasks.length,
        stations: this.stations.map((s) => ({ stationId: s.id, current: s.queue.length, max: s.max })),
        conveyors: this.conveyors.map((c) => ({ conveyorId: c.id, current: c.queue.length, max: c.max })),
      },
    };
  }
}
