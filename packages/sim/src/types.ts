/** One line of the event log (spec section 4). `t` is seconds from the run start. */
export interface LogEntry {
  t: number;
  entityId: string;
  type: EventType;
  from: string | null;
  to: string | null;
  payload: Record<string, string | number>;
}

export type EventType =
  | 'inbound.arrive'
  | 'pallet.wait-rack'
  | 'pallet.load'
  | 'pallet.unload'
  | 'pallet.store'
  | 'pallet.ship'
  | 'order.arrive'
  | 'order.wait-stock'
  | 'order.ship'
  | 'vehicle.state'
  | 'edge.wait'
  | 'edge.enter'
  | 'edge.exit'
  | 'station.queue'
  | 'station.start'
  | 'station.done'
  | 'conveyor.queue'
  | 'conveyor.start'
  | 'conveyor.done';

/** v1 fleet states. `charge` is in the spec but deferred (see README, "v1 limits"). */
export type VehicleState = 'idle' | 'travel' | 'load' | 'unload';

/** A delivery of pallets to an inbound (or two-way) dock. Owner input, never generated. */
export interface InboundArrival {
  id: string;
  /** Seconds from the start of the run. */
  t: number;
  dockId: string;
  sku: string;
  pallets: number;
}

export interface SimInput {
  /** Candidate layout; it is checked with `validateLayout` before anything runs. */
  layout: unknown;
  /** The owner's order-history CSV text (see `parseOrdersCsv`). */
  ordersCsv: string;
  inbound: InboundArrival[];
  /** Integer seed for the PRNG. */
  seed: number;
  /** Optional end time in seconds; events after it are not run. */
  horizon?: number;
}

export type OpenOrderStatus = 'not-arrived' | 'awaiting-stock' | 'in-progress';

export interface Kpis {
  /** Sim clock at the time the KPIs were taken (seconds). */
  endTime: number;
  ordersTotal: number;
  ordersShipped: number;
  openOrders: Array<{ orderId: string; status: OpenOrderStatus }>;
  /** Shipped orders divided by elapsed sim hours (endTime). 0 when endTime is 0. */
  ordersPerHour: number;
  orderToShip: { meanSeconds: number; list: Array<{ orderId: string; seconds: number }> };
  /** Stored pallets / total pallet capacity of all racks, in percent. */
  rackFillPercent: number;
  racks: Array<{ rackId: string; storedPallets: number; capacityPallets: number; fillPercent: number }>;
  freeVehicles: number;
  /** Mean of the per-vehicle utilisation, 0..1. */
  vehicleUtilisation: number;
  vehicles: Array<{ vehicleId: string; state: VehicleState; busySeconds: number; utilisation: number }>;
  queueLengths: {
    /** Vehicle tasks waiting for a free vehicle. */
    tasksWaiting: number;
    stations: Array<{ stationId: string; current: number; max: number }>;
    conveyors: Array<{ conveyorId: string; current: number; max: number }>;
  };
}

/** Pallet counts for the conservation invariant: in = stored + inTransit + shipped. */
export interface PalletSnapshot {
  palletsIn: number;
  stored: number;
  inTransit: number;
  shipped: number;
}
