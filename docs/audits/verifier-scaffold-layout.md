# Cold verifier report — unit/scaffold-layout

Previous: FAILED at 7e9c185 (3468b7e, branch `verify/scaffold-layout`).

| Field | Value |
|---|---|
| Unit | `unit/scaffold-layout` — spec §9 step 1 (pnpm monorepo scaffold + `packages/layout`) |
| SHA verified | `029327d` (= `origin/unit/scaffold-layout` after `git fetch`, full `029327d4a20ea82616837c00af921f31f381ffbb`) |
| Commits | `7e9c185` feat(layout) scaffold + schema + validator; `029327d` docs(layout) ledger D-005..D-007 |
| Merge-base with `feat/twin-v1` (7452ff5) | `d4aebf2`. The `audit-2.md` / `loop-log.md` "deletions" in `git diff 7452ff5 029327d` are fork-point artifacts; `git merge-tree --write-tree 7452ff5 029327d` is clean. |
| Date | 2026-11-06 |
| Verifier | second cold Claude subagent (built nothing, did not reuse the first report's verdict) |

## Gate (rsync copy on internal SSD, no node_modules/.git copied)

| Command | Exit | Key output |
|---|---|---|
| `pnpm install --frozen-lockfile --store-dir ~/Library/pnpm/store/v10` | 0 | "Done in 3m 55.8s using pnpm v10.33.1" |
| `pnpm -r typecheck` | 0 | `apps/viewer typecheck: Done`, `packages/layout typecheck: Done` |
| `pnpm -r test` | 0 | `Test Files 2 passed (2)`, `Tests 45 passed (45)`, v8 coverage `All files 100 / 100 / 100 / 100` |
| `pnpm -r build` | 0 | `apps/viewer build: ✓ built in 2.98s`; layout `tsc -p tsconfig.build.json` Done |

## Edge-case probes (`npx tsx`, hand-made inputs from the valid fixture)

| Probe | Result | Correct? |
|---|---|---|
| Third dock on a 2-node island cycle, no place | `dock-not-connected: docks[D3].accessNodeId: node "N-X" cannot reach any rack face or station` | yes |
| Dock with a one-way route out to a rack face and a different one-way route back | `OK` | yes (real round trip) |
| Edge length `1e-300` / `-1` | OK / `schema: ...length.value: Too small` | yes (only exact 0 is the §3 rule) |
| `battery.rechargeThreshold.source = "cad"`, `speed.source = "derived"` | only the `cad` leaf rejected (`owner-input-source`) | yes (nested leaves walked; D-007) |
| `costs.vehicles` key removed | `schema: costs.vehicles: ... expected array` | rejected, but as `schema` not `missing-owner-input` (finding 2) |
| Fleet count 0 | `fleet-empty: fleet: total vehicle count is 0 ...` | yes |
| `slotCapacity.source` removed | `schema: racks[R1].slotCapacity.source: Invalid option` | yes (source is mandatory) |

## Acceptance checklist

1. **PASS — pnpm monorepo scaffold (spec §2).** `pnpm-workspace.yaml` (`apps/*`, `packages/*`); root `package.json` is private, `packageManager: pnpm@10.33.1`, scripts `pnpm -r typecheck|test|build`; viewer moved by `git mv` to `apps/viewer/` (D-002) with `apps/viewer/tsconfig.json` extending `tsconfig.base.json`.
2. **PASS — §3 entities.** `packages/layout/src/schema.ts`: zones (6 kinds, :26), docks :40, racks rows×levels×slots + slotCapacity :64-75, stations + service-time distribution :80-99, conveyors path + rate :104-113, pathGraph directed edges with length + capacity = 1 vehicle :124-131, fleet type/count/speed/load/unload/battery :153-162, shifts :170, costs :190.
3. **PASS — "every numeric field carries source".** All numbers go through `quantity.ts` (`quantity`, `positiveQuantity`, `CountSchema`, `PositiveCountSchema`, `PointSchema`, `PercentSchema`), each a `strictObject` with required `source: SourceSchema` (quantity.ts:9-65). Only non-sourced number-like fields are shift `start`/`end`/`days` (strings; see item 6) and `schemaVersion` (format version, not a warehouse figure).
4. **PASS — §3 validation rules**, `packages/layout/src/validate.ts`:
   - every rack face reachable: :238-242 (served = reachable from a dock AND can return to a dock);
   - every dock connected: :212-227 (in + out edge, reaches a place, reached from a place; self-loops excluded :199);
   - no zero-length edges: :168-170; self-loops also rejected :171-173;
   - fleet > 0: :251-258 (no types, or total count 0);
   - all required owner inputs present: :271-314 (slotCapacity, serviceTime, conveyor rate, fleet count/speed/load/unload/battery, shift staff, costs currency/labour rate/per-fleet vehicle cost), plus CAD provenance rejected for owner inputs :278-280;
   - rejected with a list of reasons: `ValidationResult` :24, all checks concatenated :44-52.
5. **PASS — fixtures.** 1 valid + 10 invalid in `packages/layout/fixtures/`, every one `"_fixture": "test-only"`, enforced by `test/fixtures.test.ts:31-33`; exact `toEqual` on reason lists :46; `src/` does not import fixtures.
6. **PASS — audit-2 items 1–10** (audit at `7452ff5:docs/audits/audit-2.md`):
   1. Uncommitted tick-1 work — committed and pushed as 7e9c185 / 029327d. Fixed.
   2. Unused `PositiveMetresSchema` (TS6133) — now an exported helper in `quantity.ts:52`; typecheck rc 0. Fixed (see finding 3).
   3. vitest 5 vs vite 5 — `packages/layout/package.json` `vitest` / `@vitest/coverage-v8` `^3.2.4`; tests pass. Fixed.
   4. Stale lockfile — `pnpm install --frozen-lockfile` rc 0; `vercel.json` install/build/output point at pnpm + `apps/viewer/dist`. Fixed.
   5. Dock self-loop island — `validate.ts:171-173,199,219-223`; tests `validate.test.ts:211-222`; probe above. Fixed.
   6. Duplicate `costs.vehicles` — `validate.ts:112-119`; test `validate.test.ts:127-129`. Fixed.
   7. Shift `start`/`end`/`days` without source — **exempted, D-006**. Sound reading: spec §3 says "every *numeric* field"; these are an `HH:MM` regex string (schema.ts:168) and an enum list (:176); the shift's only number, `staff`, is sourced (:177); audit-2 itself offered "record the exemption in the decision ledger" as an acceptable fix. They are owner inputs by nature and are never defaulted (required by the schema). Exempted soundly.
   8. Inline source enum — `schema.ts:130` uses `SourceSchema`. Fixed.
   9. Prefix-only asserts — `fixtures.test.ts:46` exact `toEqual`; new tests for items 5 and 6 (`validate.test.ts:181-222,127-129`). Fixed.
   10. README paths/commands — `README.md:87-123`, `README_EN.md:140-185` now `apps/viewer/...` and `pnpm install` / `pnpm dev` / `pnpm build`. Fixed (see finding 4).
7. **PASS — D-001 dependency allowlist.** New in `packages/layout`: `zod`, `vitest`, `@vitest/coverage-v8`, `typescript` — all allowlisted. Viewer deps (`vue`, `three`, `@types/three`, `@vitejs/plugin-vue`, `vite`, `vue-tsc`, `typescript`) moved root → `apps/viewer/package.json` unchanged in version: a move. Root keeps only `typescript`. No disallowed dependency.
8. **PASS — D-006 / D-007 soundness.** D-006: as item 6.7. D-007 (`derived` allowed for owner inputs, only `cad` banned): consistent with spec §1 ("computed from the owner's own inputs ... or a value the owner entered") — a derived value is computed from owner inputs.
9. **PASS — no fixed values in product code.** `packages/layout/src` has no warehouse figures or defaults; the only literals are the spec-mandated edge capacity `z.literal(1)` (schema.ts:130, spec §3 "capacity = 1 vehicle per segment"), percent bounds 0–100, and `LAYOUT_SCHEMA_VERSION = 1`. Missing owner inputs produce reasons, never defaults (validate.ts:273-276). Old viewer KPI constants are upstream code removed by spec §9 step 3, not this unit.
10. **PASS — scope.** Only §9 step 1 work; no sim/cad/agents/runner code.

## Findings

No P0. No P1.

1. **P2 — `README_EN.md:166`.** Prerequisites still say "npm or pnpm"; the workspace now requires pnpm (`packageManager`, `pnpm-workspace.yaml`). Fix: "pnpm 10".
2. **P2 — `validate.ts:271-314` / `schema.ts:230`.** A draft with no `costs.vehicles` key, or no shift `start`/`end`/`days`, is rejected with a `schema:` reason, not `missing-owner-input:`. Still rejected and named, so §3 holds; the Build agent (spec §6) would get a less specific ask. Fix later: make these optional in `LayoutDraftSchema` and report them in `checkOwnerInputs`.
3. **P2 — `quantity.ts:52`.** `PositiveMetresSchema` is exported but used nowhere (audit-2 item 2 suggested using it for conveyor/real lengths). Harmless; use it or drop it when `packages/sim` lands.
4. **P2 — `quantity.ts:55`.** `DegreesSchema` is non-negative, so a CAD rotation of `-90` fails parsing. The CAD step (§9 step 6) must normalise to 0–360, or allow negatives.

VERDICT: VERIFIED at 029327d
