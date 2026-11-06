# Cold verifier report: unit/sim-core

VERDICT: VERIFIED at 226bc0f

- Unit: `unit/sim-core` at `226bc0f689f445e88eeb46478b4b83822b57d4d7`, base `feat/twin-v1` @ `e4220ee`.
- Scope: new `packages/sim` (`@twin/sim`), spec section 9 step 2, plus its `pnpm-lock.yaml` importer.
- Verifier: cold subagent (fresh context, did not build this code), run under Connor's standing 24h
  delegation. Every result below comes from commands this verifier ran.
- Date: 2026-11-06.

## Setup

- Detached worktree at `226bc0f` (`git rev-parse HEAD` = `226bc0f689f445e88eeb46478b4b83822b57d4d7`).
- Copy on internal SSD (`rsync -a --exclude node_modules --exclude .git --exclude dist --exclude coverage`).
- `pnpm install --frozen-lockfile --store-dir ~/Library/pnpm/store/v10`: exit 0 (12m 15s, load avg ~145-208).

## Gate

| Command | Exit | Result |
|---|---|---|
| `pnpm -r typecheck` | 0 | viewer, layout, sim all Done |
| `pnpm -r test` | 0 | layout 45/45 (2 files); sim 260/260 (6 files) |
| `pnpm -r build` | 0 | viewer built; sim `tsc -p tsconfig.build.json` emits `dist/*.js` + `.d.ts` |
| sim coverage (v8) | - | All files 100 / 100 / 100 / 100 (stmts/branch/funcs/lines); csv, graph, index, prng, queue, sim each 100; `types.ts` is type-only (no runtime code) |

Coverage is enforced: `packages/sim/vitest.config.ts` sets `thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 }` over `src/**/*.ts`, and `test` runs `vitest run --coverage`.

## Acceptance criteria (rebuilt from spec sections 2, 4, 8; TEST-PLAN sim rows; D-001)

| # | Criterion | Evidence | Result |
|---|---|---|---|
| 1 | Discrete-event priority queue, stable tie-break | `src/queue.ts`: binary min-heap on `(t, seq)`, `seq` assigned at push. `queue.test.ts` checks ties and 500 seeded events vs a sort | Pass |
| 2 | Seeded PRNG; no `Math.random`, `Date.now`, `performance`, `new Date` | `src/prng.ts` mulberry32. `grep -nE "Math\.random\|Date\.now\|performance\|new Date\|require\(\|from 'node:\|process\.\|window\|document" packages/sim/src/*.ts` -> no matches (exit 1) | Pass |
| 3 | Determinism | Verifier probe: 30 seeded ladder layouts, each run twice -> `JSON.stringify` of log and KPIs byte-identical. Seed 3 vs 4 -> logs differ. Package test `same seed => byte-identical` passes | Pass |
| 4 | Flow section 4 modelled | Read `src/sim.ts` 430-624. Traced order O27 (probe, seed 5): `order.arrive` t=33, `order.wait-stock` sku D; inbound IN15 `inbound.arrive` t=86 at D-IN; pallet IN15#1 `pallet.load` 87 D-IN -> `pallet.unload`/`pallet.store` 93 R1 -> `pallet.load` 94 R1 -> `pallet.unload` 116 ST1 -> `station.queue`/`station.start` 116 (23.07 s sampled) -> `station.done` 139.07 -> `conveyor.queue`/`start` (10 s = 3600/360) -> `conveyor.done`/`pallet.ship` 149.07 D-OUT; `order.ship` 149.07, seconds 116.07. Travel times match edge lengths / speed | Pass |
| 5 | One vehicle per edge segment | Verifier check (own code, interval overlap per edge id from paired `edge.enter`/`edge.exit`) over 30 ladder layouts (two parallel corridors + rungs, 10 vehicles in 2 fleet types, 25 inbound deliveries, 40 orders, conveyor): 0 overlaps, 0 unpaired exits, 0 edges left open; 4249 `edge.wait` events; 540 edges used by more than one vehicle. All 30 layouts pass `validateLayout` | Pass |
| 6 | Property test: pallet conservation, monotone time, every order shipped or open; >= 200 cases; non-trivial generator | `vitest --reporter=verbose test/invariants.test.ts`: 200 `case N` tests + 1 generator-coverage test (201 passed). Each case checks `stored + inTransit + shipped = palletsIn` after every event (state and log), `t` non-decreasing, no edge double-occupancy, shipped + open ids = all ids with no duplicates. Generator: fleet 1-2 types x 1-3 vehicles, 1-3 racks, 1-2 stations, 0-4 inbound, 0-5 orders, random horizon; a test asserts `edge.wait`, `order.wait-stock`, `pallet.wait-rack`, `conveyor.start`, shipped and open orders each occur in some case | Pass |
| 7 | KPI hand-computed test | Re-derived: corridor IN(0)-R1(5)-ST1(10)-OUT(15), 1 m/s, load 2, unload 3, pack 10. Putaway 0-10 leaves the vehicle at R1. Order t=100: load 100-102, travel 5 m 102-107, unload 107-110, pack 110-120, load 120-122, travel 122-127, unload 127-130. Order-to-ship = 130 - 100 = 30; busy = 10+10+10 = 30; utilisation 30/130; orders/h 3600/130. Test expects exactly these | Pass |
| 8 | Outputs | `LogEntry {t, entityId, type, from, to, payload}` (`src/types.ts`). `Kpis`: ordersPerHour, orderToShip (mean + list), rackFillPercent + per rack, freeVehicles, queueLengths (tasks, stations, conveyors), vehicleUtilisation + per vehicle, openOrders | Pass |
| 9 | Invalid layout rejected with reasons; CSV row error | `createSim` returns `validateLayout` reasons unchanged (test compares to `validateLayout({})`). `CsvError(row, ...)`; `csv('O1,x,A')` -> `orders-csv: row 2: time_s "x" is not a number of seconds >= 0` | Pass |
| 10 | No fixed values in `src` | Numeric grep of `packages/sim/src`: only `3600` (seconds per hour, unit conversion for rate and orders/h) and `100` (percent). Speeds, load/unload, service times, conveyor rate, rack capacity all read from the layout; arrivals from `inbound` and the CSV | Pass |
| 11 | Layering and deps | `tsconfig.json`: `lib: ["ES2020"], types: []`. Imports in `src`: only `@twin/layout` and local files. `package.json` deps: `@twin/layout` (workspace); dev: `vitest`, `@vitest/coverage-v8`, `typescript` (all on the D-001 allowlist; no `fast-check`). `git diff --stat e4220ee 226bc0f`: 19 files under `packages/sim/**` + `pnpm-lock.yaml` (+16, only the `packages/sim` importer) | Pass |
| 12 | README v1 limits | Charging deferred because the schema has no charger node or drain model; shifts/staff not applied (one server per station, always on). Neither invents a value: no battery or shift figure is used anywhere in `src` | Pass (acceptable for step 2) |

## Observations (not blocking)

1. No stored golden for a stochastic run. Determinism is checked by running twice in one process
   (`test/sim.test.ts` determinism block) and by a pinned PRNG first value (`test/prng.test.ts`).
   The fixed-service hand tests pin full event sequences. A drift in event scheduling order under a
   stochastic service time would not be caught across releases. Suggest one pinned KPI snapshot.
2. TEST-PLAN says "ties broken by stable id"; the queue breaks ties by scheduling sequence. This is
   stable and deterministic, and the README documents it.
3. Edge capacity is per directed edge id (spec section 3: "directed edges"). A two-way aisle is two
   edges, so two vehicles can move in opposite directions on one physical aisle. This matches the
   schema comment ("Add a reverse edge for two-way aisles").
4. The README's "v1 limits" also lists: one pallet per trip and per order line, conveyor transit
   from rate only, station-to-station conveyors ignored. All are documented and none uses an
   invented figure.

## Probe

The verifier probe (`probe/probe.test.ts`, in the scratch copy only, not committed) builds a ladder
layout from the package's own test fixture plus a second corridor and rung edges, then runs the
checks in rows 3, 4 and 5. Command: `npx vitest run --config /dev/null probe/probe.test.ts` ->
3 passed; output `{"waits":4249,"totalShipped":729,"multiVehSharedEdges":540}`, `seed-diff true`.
