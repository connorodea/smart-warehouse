# @twin/sim

Deterministic discrete-event simulation core for the warehouse digital twin (spec
`docs/superpowers/specs/2026-11-06-warehouse-twin-platform-design.md`, section 4).
Pure TypeScript: no DOM, no Node-only APIs (`tsconfig` uses `lib: ["ES2020"], types: []`),
no `Math.random`, no `Date.now`.

## Run

```ts
import { runSim, createSim } from '@twin/sim';

const r = runSim({ layout, ordersCsv, inbound, seed: 1, horizon: 8 * 3600 });
if (!r.ok) console.log(r.reasons);   // invalid layout or input: a list of reasons
else console.log(r.kpis, r.log.length);

// Stepping, for a live wall-clock driver later (spec section 9 step 4):
const c = createSim({ layout, ordersCsv, inbound, seed: 1 });
if (c.ok) { c.sim.next(); c.sim.stepUntil(60); c.sim.run(); c.sim.kpis(); }
```

## Inputs

| Field | Meaning |
|---|---|
| `layout` | Any value. It is checked with `validateLayout` from `@twin/layout`; its reasons are returned unchanged. |
| `ordersCsv` | The owner's order-history CSV **text** (see below). |
| `inbound` | `{ id, t, dockId, sku, pallets }[]`: deliveries of `pallets` pallets of `sku` to an inbound or two-way dock at `t` seconds. Owner input; the sim never invents an arrival rate. |
| `seed` | Integer seed for the PRNG (mulberry32). |
| `horizon` | Optional end time in seconds (> 0). Events after it do not run. |

Every speed, load/unload time, service time, conveyor rate and rack capacity comes from the
layout. The sim has no defaults: a missing value is a `validateLayout` reason.

### Order CSV contract

Header row required; columns in any order; extra columns ignored; blank lines ignored.

| Column | Meaning |
|---|---|
| `order_id` | Order id. Rows with the same id are lines of one order and must share `time_s`. |
| `time_s` | Release time in seconds from the run start (number >= 0). |
| `sku` | SKU of the line. **One row = one order line = one pallet.** For 2 pallets of a SKU, write 2 rows. |

Fields are split on commas; quoted fields are not supported in v1. A malformed row throws
`CsvError` with `row` (1-based line number); `createSim` returns it as `orders-csv: row N: ...`.

### Extra run checks (beyond `validateLayout`)

- Seed is an integer; horizon > 0.
- Inbound: unique non-empty ids, `t >= 0`, whole `pallets >= 1`, non-empty sku, dock exists and is `inbound` or `both`.
- Orders present => at least one station and one `outbound`/`both` dock.
- `sim-unreachable`: every dock, rack face and station access node must be on one strongly
  connected network (validateLayout only asks for a round trip through some dock).

## Flow (v1)

1. Inbound arrival at a dock: each pallet gets a putaway task to the nearest rack face (route
   length) of a rack with a free slot. If every rack is full, the pallet waits at the dock
   (`pallet.wait-rack`) and goes up when a slot frees.
2. Order arrival: each line reserves a stored pallet of its SKU (first stored, first out). With
   no stock, the line waits (`order.wait-stock`) and takes the next pallet of that SKU stored.
3. Retrieve: a vehicle takes the pallet from its rack face to a station: least-loaded, then
   nearest, then layout order.
4. Station: one server per station, FIFO queue, service time sampled from the station's
   distribution with the seeded PRNG.
5. After the station: if a conveyor runs from that station to an outbound dock, the pallet rides
   it (one server, `3600 / rate` seconds per item); otherwise a vehicle takes it to the nearest
   outbound dock. A pallet at an outbound dock is shipped; an order ships when all its lines have.

Vehicles: tasks are served first-in first-out by the nearest idle vehicle (route length; ties by
fleet order). Each vehicle carries one pallet. A task is travel -> load (`loadTime`) -> travel ->
unload (`unloadTime`). Vehicles start at the first inbound-capable dock (else the first dock) and
stay where they finish. Routing is A* on `pathGraph` (edge length cost; Euclidean heuristic scaled
so it stays admissible). Each edge holds one vehicle from entry to the far node; a vehicle that
finds its next edge occupied waits FIFO (`edge.wait`) — congestion emerges. Nodes hold any number
of vehicles, so edge waits cannot deadlock.

## Outputs

Event log entries `{ t, entityId, type, from, to, payload }`. Types: `inbound.arrive`,
`pallet.wait-rack|load|unload|store|ship`, `order.arrive|wait-stock|ship`, `vehicle.state`,
`edge.wait|enter|exit`, `station.queue|start|done`, `conveyor.queue|start|done`.

`kpis()`: `endTime`, `ordersTotal`, `ordersShipped`, `openOrders` (status `not-arrived` /
`awaiting-stock` / `in-progress`), `ordersPerHour` (shipped / elapsed hours, elapsed = `endTime`
from 0), `orderToShip` (mean and per-order list), `rackFillPercent` and per rack (stored /
`rows x levels x slots x slotCapacity`), `freeVehicles`, `vehicleUtilisation` (mean of non-idle
time / elapsed) and per vehicle, `queueLengths` (tasks waiting for a vehicle; per station and
conveyor: current and max). With nothing shipped or zero elapsed time, rates and means are 0.

`pallets()`: `{ palletsIn, stored, inTransit, shipped }` for the conservation check.

## Determinism

Same layout + CSV + inbound + seed => byte-identical event log and KPIs. Events are ordered by
`(time, scheduling sequence)`; at equal start times inbound arrivals are scheduled before orders.
All choices tie-break by layout order. The PRNG is only used for station service times.

## v1 limits (deferred)

- **Charging is not simulated.** The schema gives runtime, charge time and recharge threshold,
  but no charger location on the path graph and no drain model beyond "runtime"; a battery
  model would need a figure the schema lacks, so v1 has no `charge` state.
- Shifts and staff are not applied: stations run all the time with one server each.
- Times are plain seconds; ISO timestamps in the CSV are not parsed yet.
- One pallet per vehicle trip and per order line; no SKU-to-slot rules beyond nearest free rack.
- Conveyor transit is throughput only (`3600 / rate`); path length is not used (no belt speed in the schema).
- Station-to-station conveyors are ignored; only station-to-outbound-dock conveyors are used.
- Calibration (spec section 4) is a later unit.
