import { z } from 'zod';
import {
  CountSchema,
  DegreesSchema,
  HoursSchema,
  ItemsPerHourSchema,
  MetresSchema,
  MoneyPerHourSchema,
  MoneyPerYearSchema,
  MoneySchema,
  PercentSchema,
  PointSchema,
  PositiveCountSchema,
  SecondsSchema,
  SourceSchema,
  SpeedSchema,
} from './quantity';

/** Bumped on any breaking change to the Layout JSON shape. */
export const LAYOUT_SCHEMA_VERSION = 1 as const;

export const IdSchema = z.string().min(1).regex(/^[A-Za-z0-9._:-]+$/, 'id may use letters, digits, . _ : - only');

// ---------- zones ----------

export const ZoneKindSchema = z.enum(['receiving', 'storage', 'pick-pack', 'shipping', 'parking', 'charging']);
export type ZoneKind = z.infer<typeof ZoneKindSchema>;

export const ZoneSchema = z.strictObject({
  id: IdSchema,
  kind: ZoneKindSchema,
  name: z.string().optional(),
  /** Closed polygon in plan view; the last point joins back to the first. */
  polygon: z.array(PointSchema).min(3),
});
export type Zone = z.infer<typeof ZoneSchema>;

// ---------- docks ----------

export const DockSchema = z.strictObject({
  id: IdSchema,
  kind: z.enum(['inbound', 'outbound', 'both']),
  zoneId: IdSchema.optional(),
  position: PointSchema,
  /** Path-graph node where vehicles stop to load or unload at this dock. */
  accessNodeId: IdSchema,
});
export type Dock = z.infer<typeof DockSchema>;

// ---------- racks ----------

/**
 * A rack face is one side of a rack that vehicles can serve. It attaches to the
 * path graph through `accessNodeId`: the node where a vehicle stops to put away or
 * retrieve from any slot on that face.
 */
export const RackFaceSchema = z.strictObject({
  id: IdSchema,
  side: z.enum(['front', 'back', 'left', 'right']),
  accessNodeId: IdSchema,
});
export type RackFace = z.infer<typeof RackFaceSchema>;

export const RackSchema = z.strictObject({
  id: IdSchema,
  zoneId: IdSchema.optional(),
  position: PointSchema,
  rotation: DegreesSchema,
  rows: PositiveCountSchema,
  levels: PositiveCountSchema,
  slots: PositiveCountSchema,
  /** Owner input: units each slot holds. */
  slotCapacity: PositiveCountSchema,
  faces: z.array(RackFaceSchema).min(1),
});
export type Rack = z.infer<typeof RackSchema>;

// ---------- stations ----------

export const ServiceTimeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('fixed'), value: SecondsSchema }),
  z.strictObject({ kind: z.literal('exponential'), mean: SecondsSchema }),
  z.strictObject({ kind: z.literal('normal'), mean: SecondsSchema, stdDev: SecondsSchema }),
  z.strictObject({ kind: z.literal('lognormal'), mean: SecondsSchema, stdDev: SecondsSchema }),
  z
    .strictObject({ kind: z.literal('uniform'), min: SecondsSchema, max: SecondsSchema })
    .refine((d) => d.min.value <= d.max.value, { message: 'uniform min must be <= max', path: ['min'] }),
]);
export type ServiceTime = z.infer<typeof ServiceTimeSchema>;

export const StationSchema = z.strictObject({
  id: IdSchema,
  kind: z.enum(['pick', 'pack', 'pick-pack']),
  zoneId: IdSchema.optional(),
  position: PointSchema,
  accessNodeId: IdSchema,
  /** Owner input: time to process one order line. */
  serviceTime: ServiceTimeSchema,
});
export type Station = z.infer<typeof StationSchema>;

// ---------- conveyors ----------

export const ConveyorSchema = z.strictObject({
  id: IdSchema,
  /** Station or dock id at the conveyor's start. */
  fromId: IdSchema,
  /** Station or dock id at the conveyor's end. */
  toId: IdSchema,
  path: z.array(PointSchema).min(2),
  /** Owner input: throughput. */
  rate: ItemsPerHourSchema,
});
export type Conveyor = z.infer<typeof ConveyorSchema>;

// ---------- path graph ----------

export const PathNodeSchema = z.strictObject({
  id: IdSchema,
  position: PointSchema,
});
export type PathNode = z.infer<typeof PathNodeSchema>;

export const PathEdgeSchema = z.strictObject({
  id: IdSchema,
  from: IdSchema,
  to: IdSchema,
  length: MetresSchema,
  /** One vehicle per segment (spec section 3); congestion emerges from this. */
  capacity: z.strictObject({ value: z.literal(1), unit: z.literal('vehicles'), source: SourceSchema }),
});
export type PathEdge = z.infer<typeof PathEdgeSchema>;

export const PathGraphSchema = z.strictObject({
  nodes: z.array(PathNodeSchema).min(1),
  /** Directed edges. Add a reverse edge for two-way aisles. */
  edges: z.array(PathEdgeSchema),
});
export type PathGraph = z.infer<typeof PathGraphSchema>;

// ---------- fleet ----------

export const BatterySchema = z.strictObject({
  /** Operating time on a full charge. */
  runtime: HoursSchema,
  /** Time from the recharge threshold back to full. */
  chargeTime: HoursSchema,
  /** State of charge at which a vehicle goes to charge. */
  rechargeThreshold: PercentSchema,
});
export type Battery = z.infer<typeof BatterySchema>;

export const FleetTypeSchema = z.strictObject({
  id: IdSchema,
  vehicleType: z.enum(['amr', 'agv', 'forklift', 'pallet-jack']),
  model: z.string().optional(),
  count: CountSchema,
  speed: SpeedSchema,
  loadTime: SecondsSchema,
  unloadTime: SecondsSchema,
  battery: BatterySchema,
});
export type FleetType = z.infer<typeof FleetTypeSchema>;

// ---------- shifts ----------

// start/end/days are not numeric, so they carry no `source` (decision ledger D-006).
const HhMm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time must be HH:MM (24h)');

export const ShiftSchema = z.strictObject({
  id: IdSchema,
  name: z.string().optional(),
  start: HhMm,
  /** May be earlier than `start` for a shift that crosses midnight. */
  end: HhMm,
  days: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).min(1),
  staff: PositiveCountSchema,
});
export type Shift = z.infer<typeof ShiftSchema>;

// ---------- costs ----------

export const VehicleCostSchema = z.strictObject({
  fleetId: IdSchema,
  capexPerUnit: MoneySchema,
  maintenancePerYear: MoneyPerYearSchema,
});
export type VehicleCost = z.infer<typeof VehicleCostSchema>;

export const CostsSchema = z.strictObject({
  /** ISO 4217 code; money quantities use unit "currency" and mean this currency. */
  currency: z.string().regex(/^[A-Z]{3}$/, 'currency must be an ISO 4217 code like USD'),
  labourRatePerHour: MoneyPerHourSchema,
  vehicles: z.array(VehicleCostSchema),
});
export type Costs = z.infer<typeof CostsSchema>;

// ---------- layout ----------

/** A complete, run-ready layout: every owner input is present. */
export const LayoutSchema = z.strictObject({
  schemaVersion: z.literal(LAYOUT_SCHEMA_VERSION),
  id: IdSchema,
  name: z.string().min(1),
  zones: z.array(ZoneSchema),
  docks: z.array(DockSchema).min(1),
  racks: z.array(RackSchema).min(1),
  stations: z.array(StationSchema),
  conveyors: z.array(ConveyorSchema),
  pathGraph: PathGraphSchema,
  fleet: z.array(FleetTypeSchema).min(1),
  shifts: z.array(ShiftSchema).min(1),
  costs: CostsSchema,
});
export type Layout = z.infer<typeof LayoutSchema>;

/**
 * A layout that may still lack owner inputs (for example one the Build agent made
 * from CAD before asking the owner). Owner-input fields are optional here so the
 * validator can name each missing one instead of failing on the first.
 */
export const LayoutDraftSchema = LayoutSchema.extend({
  racks: z.array(RackSchema.partial({ slotCapacity: true })).min(1),
  stations: z.array(StationSchema.partial({ serviceTime: true })),
  conveyors: z.array(ConveyorSchema.partial({ rate: true })),
  fleet: z.array(
    FleetTypeSchema.partial({ count: true, speed: true, loadTime: true, unloadTime: true, battery: true }),
  ),
  shifts: z.array(ShiftSchema.partial({ staff: true })),
  costs: CostsSchema.partial({ currency: true, labourRatePerHour: true }).optional(),
});
export type LayoutDraft = z.infer<typeof LayoutDraftSchema>;
