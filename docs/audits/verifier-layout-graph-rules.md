# Cold verifier — unit/layout-graph-rules

VERDICT: VERIFIED at f468928

- **Unit:** `unit/layout-graph-rules` at `f468928976738cc4422c5c453f7068f391c772f0` (base `feat/twin-v1` @ `e4220ee`).
- **Verifier:** cold Claude subagent (fresh context, did not build this code), run under Connor's standing 24h
  delegation. Every result below is from commands run by this verifier.
- **Workspace:** detached worktree `/Volumes/ToshibaODEA/worktrees/smart-warehouse/verify-layout-graph-rules-tmp`
  (`git rev-parse HEAD` = `f468928976738cc4422c5c453f7068f391c772f0`), rsynced to an internal-SSD copy (no
  `node_modules`/`.git`/`dist`/`coverage`) for the gate.

## Gate (internal-SSD copy, fresh install)

| Command | Exit | Result |
|---|---|---|
| `pnpm install --frozen-lockfile --store-dir ~/Library/pnpm/store/v10` | 0 | done in 12m 27s (load avg ~140-210) |
| `pnpm -r typecheck` | 0 | `packages/layout` tsc + `apps/viewer` vue-tsc clean |
| `pnpm -r test` | 0 | layout: 2 files, 83/83 pass; coverage 100 / 100 / 100 / 100 (stmt/branch/fn/line) on all 4 src files. Viewer: placeholder echo (audit-4 item 7, out of scope) |
| `pnpm -r build` | 0 | viewer vite build OK; layout tsc build OK |

Coverage is enforced, not just met: `packages/layout/vitest.config.ts` sets
`thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 }` and `test` runs `vitest run --coverage`.

## Acceptance criteria (reconstructed) and probe results

Sources: spec §3, `docs/audits/audit-4.md` items 1-5, 8, 9 and its "Excluded" verifier-2 P2s, TEST-PLAN row
`packages/layout`, decision ledger D-001.

Own probe: a throwaway vitest file (in the SSD copy only, deleted after) that deep-copies
`fixtures/valid.tiny-loop.fixture.json`, mutates it and calls `validateLayout`. 25/25 probes behaved as expected:

| Probe | Result |
|---|---|
| valid fixture unchanged | OK |
| all docks `inbound` (zoneIds dropped) | `dock-direction-missing` (no outbound-capable dock) |
| all docks `outbound` | `dock-direction-missing` (no inbound-capable dock) |
| all docks `both` | OK (no direction error) |
| E1 length `1e-12` | `zero-length-edge` |
| E1 length `1000` on 10.05 m segment | `edge-length-mismatch` (tolerance 0.1 m) |
| N-ST moved onto N-R1A | `zero-length-edge` on E2 (+ expected `edge-length-mismatch` on E3) |
| copy of E1 with new id | `duplicate-edge` |
| inbound dock in storage zone | `zone-kind-mismatch` |
| rack in shipping zone / station in storage zone | `zone-kind-mismatch` |
| charging zone removed (battery fleet) | `charging-unreachable` |
| exponential `mean: 0` | `schema` (`>0`) |
| shift `end == start` | `schema` (zero-length shift) |
| `days: ["mon","mon"]` | `schema` (each day once) |
| `costs.vehicles` deleted | only `missing-owner-input` (`costs.vehicles[amr-1]`) — verifier-2 P2 fixed |
| shift `start` deleted | only `missing-owner-input` — verifier-2 P2 fixed |
| rack rotation `-90` | OK — verifier-2 P2 (`DegreesSchema` negatives) fixed |
| rack rotation `-360` | `schema` (range is (-360, 360]) |
| reverse edge N-R1A→N-IN added | OK (regression check) |
| overnight shift 22:00→06:00 | OK (regression check) |
| E3 length +0.5 % | OK (within 1 % tolerance) |
| uniform `min: 0` | OK |
| all `zoneId` removed | OK |
| all nodes + zones offset by 1 km | OK |

Audit-4 / verifier-2 item map:

| Item | Status | Evidence |
|---|---|---|
| A4-1 dock direction | fixed | `validate.ts:335-367`; probes above; fixture `invalid.dock-direction-missing` |
| A4-2 near-zero / mismatched length | fixed | `validate.ts:183-231`; probes; fixtures `invalid.zero-length-edge`, `invalid.edge-length-mismatch` |
| A4-3 duplicate parallel edge | fixed | `validate.ts:201-207`; fixture `invalid.duplicate-edge` |
| A4-4 zone kind + charging | fixed | `validate.ts:236-260`, `369-386`; fixtures `invalid.zone-kind-mismatch`, `invalid.charging-unreachable` |
| A4-5 degenerate service times / shifts | fixed | `schema.ts:78-89`, `163-185` |
| A4-8 root `preview` | fixed | root `package.json`: `"preview": "pnpm --filter @twin/viewer preview"` |
| A4-9 self-loop fixture | fixed | `fixtures/invalid.self-loop-edge.fixture.json` |
| V2 README_EN:166 | fixed | now "pnpm (the repo is a pnpm workspace; npm and yarn are not supported)" |
| V2 owner-input codes | fixed | probes above |
| V2 `PositiveMetresSchema` unused | fixed | no match for `PositiveMetres` in `packages/layout/src` |
| V2 negative rotation | fixed | probe `-90` → OK |

Fixtures: `test/fixtures.test.ts` asserts every `invalid.*` fixture returns exactly its `expectReasons` AND that the set
of rule codes equals `{its own name}`, and that the fixture names equal `Object.values(RULES)` (16 rules, 16 fixtures).
All 19 fixture tests pass.

Hygiene:
- `grep -rn "PositiveMetres|\.default(|\.catch(|from 'node:|document\.|window\." packages/layout/src` → no matches.
- `git diff --stat e4220ee f468928`: only `packages/layout/**`, root `package.json`, `README_EN.md` (24 files).
  `pnpm-lock.yaml` unchanged; `packages/layout/package.json` deps still only `zod` + allowlisted dev deps (D-001).
- `MIN_EDGE_LENGTH_M = 0.01` and `EDGE_LENGTH_RELATIVE_TOLERANCE = 0.01` are validation tolerances, not model figures
  or KPIs; they are exported and documented at `validate.ts:174-186`. Not a no-fixed-values violation.

## Observations (non-blocking; for a later tick to decide)

1. **Every run-ready layout now needs a charging zone.** `FleetTypeSchema.battery` is required in the strict schema
   (pre-existing), and `validate.ts:370-386` requires a reachable charging node whenever any fleet has a battery. So a
   warehouse whose fleet is non-battery (propane forklifts, manual pallet jacks) cannot be expressed. Spec §3 lists
   battery as a fleet field, so this matches the spec as written; consider making `battery` optional per vehicle type.
2. **Zone-kind tables are strict.** `validate.ts:241-242`: racks only in `storage`, stations only in `pick-pack`. A
   forward-pick rack inside a pick-pack zone, or a pack station inside a shipping zone, is rejected. `zoneId` is
   optional, so an owner can omit it as a workaround. Consider widening if real CAD imports hit this.
3. Cosmetic: the `1e-12` length is printed as "edge length 0 m" (`validate.ts:189`, 3-decimal rounding).
4. `pointInPolygon` boundary test uses exact `cross === 0` (`validate.ts:270`); a charger node on a polygon edge with
   float noise may count as outside. Low risk; interior nodes work.

None of these breaks a spec §3 rule or an audit item, so the verdict stands.

VERDICT: VERIFIED at f468928
