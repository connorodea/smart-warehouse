# Cold verifier report — unit/scaffold-layout

| Field | Value |
|---|---|
| Unit | `unit/scaffold-layout` — spec §9 step 1 (pnpm monorepo scaffold + `packages/layout`) |
| SHA verified | `7e9c185` (= `origin/unit/scaffold-layout` after `git fetch`, full `7e9c185f3c7d06902f61ab3b5e5146982478e1c7`) |
| Parent | `d4aebf2` (not `feat/twin-v1` 7452ff5; merge-base is d4aebf2, so the `git diff 7452ff5 7e9c185` "deletion" of `docs/audits/audit-2.md` + `loop-log.md` is only the missing tick-2 docs commit, not a removal) |
| Date | 2026-11-06 |
| Verifier | cold Claude subagent (did not build this unit) |

## Gate (rsync copy on internal SSD, no node_modules/.git copied)

| Command | Exit | Key output |
|---|---|---|
| `pnpm install --frozen-lockfile --store-dir ~/Library/pnpm/store/v10` | 0 | resolved 149, reused 149, "Done in 4m 56.9s using pnpm v10.33.1" |
| `pnpm -r typecheck` | 0 | `packages/layout typecheck: Done`, `apps/viewer typecheck: Done` |
| `pnpm -r test` | 0 | `Test Files 2 passed (2)`, `Tests 45 passed (45)`; coverage All files 100 / 100 / 100 / 100 (quantity.ts, schema.ts, validate.ts) |
| `pnpm -r build` | 0 | `packages/layout build: Done` (tsc), `apps/viewer build: ✓ built in 2.28s` (vite 5.4.21) |

Hand-made edge inputs run with `npx tsx` against `validateLayout` (scratch only, not committed):

| # | Input | Result |
|---|---|---|
| 1 | Extra dock + extra station on an island (2 nodes, 2 edges) not linked to the main graph | `ok: true` (see finding 2) |
| 2 | Extra dock on an island with no place | `dock-not-connected: ... cannot reach any rack face or station` |
| 3 | `slotCapacity.source = "derived"` | `ok: true` (allowed by design; see finding 3) |
| 4 | Fleet total count 0 | `fleet-empty: fleet: total vehicle count is 0 ...` |
| 5 | Edge id equal to a node id | `duplicate-id: pathGraph.edges[N-IN]: ... already used by pathGraph.nodes[N-IN]` |
| 6 | Missing `costs.currency` and `fleet[].battery` | two `missing-owner-input` reasons, nothing defaulted |
| 7 | `shifts[].staff.source = "cad"` | `owner-input-source: shifts[day].staff: ...` |
| 8 | Edge length 9999 m between nodes 10 m apart | `ok: true` (see finding 4) |
| 9 | Unknown root key | `schema: (root): Unrecognized key: "foo"` |
| 10 | `null`; `docks: []` | `schema: (root): ... received null`; `schema: docks: Too small ...` |

## Acceptance checklist

1. **PASS — pnpm workspace scaffold (spec §2, §9.1).** `pnpm-workspace.yaml:1-3` (`apps/*`, `packages/*`); root `package.json` scripts `typecheck`/`test`/`build` run `pnpm -r`; `tsconfig.base.json` shared.
2. **PASS — viewer moved to `apps/viewer` (D-002).** All moves are renames with 0 line changes except `apps/viewer/tsconfig.json` (now extends base). `apps/viewer/vite.config.ts` alias `@ -> ./src` resolves inside `apps/viewer`; build green.
3. **PASS — `vercel.json`.** `installCommand: pnpm install --frozen-lockfile`, `buildCommand: pnpm --filter @twin/viewer build`, `outputDirectory: apps/viewer/dist` (`vercel.json:4-6`). Frozen install verified rc=0.
4. **PASS — D-001 dependencies.** Lockfile importers: `.` typescript; `apps/viewer` three, vue, @types/three, @vitejs/plugin-vue, typescript, vite, vue-tsc — identical to the root `package.json` at 7452ff5 (a move, not an addition); `packages/layout` zod, @vitest/coverage-v8, typescript, vitest — all on the allowlist. No other new dependency.
5. **PASS — §3 entities.** zones, docks, racks (rows × levels × slots, slotCapacity, faces), stations (service-time distribution), conveyors (path, rate), pathGraph (nodes, directed edges, length, capacity = 1 vehicle), fleet (type, count, speed, load/unload, battery), shifts, costs: `packages/layout/src/schema.ts:24-214`.
6. **PASS (with finding 1) — §3 "every numeric field carries source".** Every number is a sourced object (`src/quantity.ts:13-65`, `PointSchema` 43-48). Exception: shift `start`/`end` (HH:MM strings) and `days` (enum) have no `source` (`schema.ts:172-175`).
7. **PASS — validation: zero-length edges.** `validate.ts:166-170`; self-loops also rejected `validate.ts:171-173`.
8. **PASS — validation: every dock connected.** `validate.ts:212-227`: in + out edge, reaches a rack face/station, and is reached from one. Self-loops ignored for connectivity (`validate.ts:199`).
9. **PASS — validation: every rack face reachable; stations reachable.** Served = reachable from a dock AND can return to a dock (`validate.ts:229-245`).
10. **PASS — validation: fleet > 0.** `validate.ts:251-258` (no types, or total count 0).
11. **PASS — validation: owner inputs present, not from CAD, never defaulted.** `LayoutDraftSchema` makes owner fields optional only so each gap is named (`schema.ts:221-230`); `checkOwnerInputs` lists every missing one and rejects any nested `source: "cad"` (`validate.ts:271-314`). No default value anywhere in `src/`.
12. **PASS — unique ids, refs resolve.** Layout-wide unique ids incl. rack faces (`validate.ts:88-121`); zone/node/endpoint/fleet refs (`validate.ts:123-162`).
13. **PASS — invalid layouts rejected with a list of reasons.** `ValidationResult` `{ ok: false; reasons: string[] }`; independent problems reported in one pass (`test/validate.test.ts:341-347`).
14. **PASS — fixtures test-only.** Every fixture has `"_fixture": "test-only"` and a `_note`; `test/fixtures.test.ts:31-33` enforces it; `src/` does not import `fixtures/`.

### audit-2 items

1. **PASS (partial, process).** Work is committed (7e9c185) and pushed (`origin/unit/scaffold-layout`). The `### Tick 3` loop-log entry is not in this unit; that is the orchestrator's job, not this commit's.
2. **PASS.** Unused `PositiveMetresSchema` import removed from `schema.ts`; typecheck rc=0. The schema is still exported from `quantity.ts:52` and used nowhere (P2 note, finding 5).
3. **PASS.** `vitest` and `@vitest/coverage-v8` `^3.2.4` (`packages/layout/package.json`); tests run.
4. **PASS.** Lockfile regenerated; `pnpm install --frozen-lockfile` rc=0.
5. **PASS.** Dock must reach and be reached from a rack face/station; self-loop edges rejected (`validate.ts:166-227`); tests `validate.test.ts:181-215`.
6. **PASS.** Duplicate `costs.vehicles` per `fleetId` -> `duplicate-id` (`validate.ts:112-119`); test `validate.test.ts:127-129`.
7. **FAIL.** Not fixed and not recorded. Shift `start`/`end`/`days` still have no `source` (`schema.ts:172-175`), and `docs/audits/overnight-decisions.md` (at 7e9c185 and at `feat/twin-v1`) has no exemption entry. The commit message says "Fixes audit-2 items 1-9".
8. **PASS.** Edge capacity uses `SourceSchema` (`schema.ts:130`).
9. **PASS.** Fixture tests assert the full reason list with `toEqual` (`test/fixtures.test.ts:46`); new tests for items 5 and 6 exist. Some zod schema messages still use regex prefixes (`validate.test.ts:68-102`), acceptable because zod owns that text.
10. **PASS.** `README.md` / `README_EN.md` show `apps/viewer/...` and `pnpm install` / `pnpm dev` / `pnpm build`.

## Findings

1. **P1 — claimed audit fix not done (audit-2 item 7).** `packages/layout/src/schema.ts:172-175`: shift `start`, `end`, `days` carry no `source`, and no decision-ledger exemption exists, but commit 7e9c185 claims items 1-9 fixed. Fix (either, ~10 min): add a ledger entry (e.g. D-005) stating that shift times/days are non-numeric owner-entered strings/enums, always required, never defaulted, so they are exempt from `source`; or wrap them as sourced objects and reject `cad` for them in `checkOwnerInputs`.
2. **P2 — path graph may split into islands.** A dock plus station on an island, not linked to the main graph, validates `ok: true` (edge input 1). Spec §3 wording ("every dock connected") is met literally. Suggest a check that all dock/place nodes lie in one strongly connected part, before `packages/sim` relies on it.
3. **P2 — `derived` accepted for owner inputs.** Spec only bans CAD, so this is correct, but `derived` lets a producer fill an owner input with no owner. Record in the ledger who may write `derived` owner inputs.
4. **P2 — edge `length` not checked against node positions.** A 9999 m edge between nodes 10 m apart validates (edge input 8).
5. **P2 — dead export.** `PositiveMetresSchema` (`quantity.ts:52`) is exported but unused.
6. **P2 — branch parent.** The unit is based on `d4aebf2`, not `feat/twin-v1` (7452ff5). Merge into `feat/twin-v1` is still clean (no shared files), but rebase/merge before integration so the diff shows only this unit.

VERDICT: FAILED at 7e9c185
