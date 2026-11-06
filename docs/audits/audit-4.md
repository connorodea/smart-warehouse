# Audit — tick 4 (AUDITOR)

- **Range:** `feat/twin-v1` `d4aebf2..c603488` (spec §9 step 1: pnpm monorepo scaffold, viewer move to
  `apps/viewer/`, `packages/layout` schema + validator + fixtures).
- **Method:** one cold Claude subagent (read-only), probes via `bun run` on a scratch script that mutates
  `valid.tiny-loop.fixture.json` and calls `validateLayout`. Orchestrator spot-checked items 2, 6, 7 in source.
- **Baseline:** `pnpm -C packages/layout exec vitest run --coverage` → 45/45 pass, 100% stmt/branch/fn/line.
  `pnpm -C packages/layout typecheck` clean. `pnpm -C apps/viewer typecheck` clean.
- **Excluded (already known, from verifier-2):** README_EN.md:166 "npm or pnpm"; missing `costs.vehicles` / shift
  times report `schema:` not `missing-owner-input:`; `PositiveMetresSchema` unused; `DegreesSchema` rejects negatives.
- **Result:** 0 P0, 2 P1, 7 P2. Nothing was fixed in this tick.

## Findings

1. **P1 — dock direction ignored.** `packages/layout/src/validate.ts:194-246`, `schema.ts:42`. Probe: every dock
   set to `kind: "inbound"` → `OK`. Spec §4 flow needs receiving (inbound) and shipping (outbound); reachability
   only checks "any dock". Fix: require ≥1 inbound-capable and ≥1 outbound-capable dock; check rack faces are
   reachable from an inbound dock and stations can reach an outbound dock.
2. **P1 — zero-length check is exact `=== 0` only.** `validate.ts:169`. Probes: length `1e-12` → `OK`; E1 length
   `1000` with nodes 10.05 m apart → `OK`; two nodes at the same position → `OK`. Spec §3 "no zero-length edges".
   Fix: compare `length` to node-to-node distance within a tolerance; reject near-zero distance.
3. **P2 — duplicate parallel edge passes.** `validate.ts:166-175`. Probe: copy of E1 with a new id → `OK`. Weakens
   the 1-vehicle-per-segment rule. Fix: reject duplicate `(from, to)` pairs.
4. **P2 — zone kind never checked.** `validate.ts:132-134`. Probe: dock with `zoneId` = storage zone → `OK`. No
   charging zone required although fleets carry batteries. Fix: per-entity zone-kind check; require a reachable
   charging zone when any fleet type has a battery.
5. **P2 — degenerate service times / shifts.** `schema.ts:81-84`, `schema.ts:173-175`. Probes: exponential
   `mean: 0` → `OK`; shift `end == start` → `OK`; `days: ["mon","mon"]` → `OK`. Fix: positive means; define
   `start == end`; unique `days`.
6. **P2 — package exports point at TS source; dist not loadable.** `packages/layout/package.json:6-10`,
   `src/index.ts:1-3`. Evidence: `tsc -p tsconfig.build.json` then Node v24.11.1 import → `ERR_MODULE_NOT_FOUND
   ... dist/quantity` (extensionless imports). Blocks a Node consumer such as `packages/runner` (§9 step 5).
   Fix: `exports`/`types` → `dist`, `.js` import suffixes (or a bundler).
7. **P2 — viewer `test` script always exits 0.** `apps/viewer/package.json:12`. `pnpm -r test` is green with zero
   viewer tests. Fix: make the skip visible in the gate summary, or fail until the Playwright smoke test exists.
8. **P2 — root `preview` script dropped.** root `package.json:7-12`. README_EN already says
   `pnpm --filter @twin/viewer preview`, so docs match. Fix: add a root alias, or leave.
9. **P2 — `self-loop-edge` has no `invalid.*` fixture.** Only a unit test (`validate.test.ts:181`); every other
   rule has a fixture. Fix: add `invalid.self-loop-edge.fixture.json`.

## Categories with nothing found

- §3 field coverage: all present; every numeric field carries `source`; owner-input rules match D-007.
- No fixed values: no `.default()`/`.catch()`/KPI constants in `src/`; only `capacity: z.literal(1)` (spec-mandated).
- Fixtures: each `invalid.*` fails with exactly its named rule code (`fixtures.test.ts` compares exactly).
- Edge cases correct: NaN/Infinity rejected; unknown keys rejected (root/rack/fleet); dock id = node id →
  `duplicate-id`; duplicate face id in one rack → `duplicate-id`; nested `cad` source on battery/speed →
  `owner-input-source`; unknown `costs.vehicles` fleetId → `unknown-ref`; all 11 reference fields checked.
- Layering: `packages/layout` imports only `zod`; `lib: ["ES2020"]`, `types: []` → DOM/Node APIs fail typecheck.
- `vercel.json`: `buildCommand` / `outputDirectory: apps/viewer/dist` match the move (no live deploy tested).
- Sim determinism / agents layering: not applicable yet (no `packages/sim` or agents code in range).

## Recommended handling (tick 5)

- Items 1, 2 are one small Claude unit (`unit/layout-graph-rules`) on `packages/layout` — do before `packages/sim`
  consumes the graph. Fold items 3, 4, 5, 9 and the 4 known verifier-2 P2s into the same unit (same files).
- Item 6 can wait until §9 step 5 (runner) needs a built package; log it in that unit's acceptance criteria.
- Items 7, 8: one-line config edits; bundle into the layout unit or the viewer i18n unit.

AUDITED: d4aebf2..c603488
