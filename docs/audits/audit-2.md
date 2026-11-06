# Audit — tick 2 (AUDITOR) — 2026-11-06

- **Diff base:** `docs/twin-platform-spec` (d4f7b34) → `feat/twin-v1` (d4aebf2). Committed change: docs only
  (`loop-log.md`, `overnight-decisions.md`). No findings in committed code.
- **Also audited:** UNCOMMITTED work stranded in worktree
  `/Volumes/ToshibaODEA/worktrees/smart-warehouse/unit/scaffold-layout` (branch `unit/scaffold-layout`, HEAD d4aebf2).
  This is spec §9 step 1 (monorepo scaffold + `packages/layout`). Reviewed by one cold Claude subagent in a
  throwaway rsync copy; nothing in the worktree was changed.
- **Gate on the copy:** `pnpm install --frozen-lockfile` rc=1 · `pnpm -r typecheck` rc=2 · `pnpm -r test` rc=1 ·
  `pnpm -r build` rc=2. With findings 2 + 3 applied in the copy only: typecheck rc=0, test rc=0 (40/40, 100% coverage).

## Findings

1. **P0 — process: tick 1 left its work uncommitted and unlogged.** `logs/tick-1.log`: "Background tasks still
   running 10m after the last turn (subagent "Build monorepo scaffold + layout schema"); stopping them." The
   builder ran in the background, against TICK.md §1 ("launch them with `run_in_background: false`"). Result: no
   commit, no push, no `### Tick 1` log entry, no `ticks/tick-1.md`. Fix: next orchestrator tick resumes this
   worktree (do not restart it), applies items 2–4, commits, pushes, then cold-verifies. Every subagent foreground.
2. **P0 — `packages/layout/src/schema.ts:14`.** `error TS6133: 'PositiveMetresSchema' is declared but its value is
   never read.` Breaks typecheck and build. Fix: use it for lengths that must be > 0 (e.g. conveyors) or drop it.
3. **P0 — `packages/layout/package.json:22,24`.** `vitest ^5.1.0` needs vite ≥6; workspace has vite 5.4.21 from the
   viewer → `ERR_PACKAGE_PATH_NOT_EXPORTED ... './module-runner'`. Fix: `vitest` + `@vitest/coverage-v8` `^3.2.4`
   (tested in copy: 40/40 pass). Both stay on the D-001 allowlist.
4. **P0 — `pnpm-lock.yaml` + `vercel.json:4`.** Lockfile is the old root one ("6 dependencies were removed: three,
   vue, ..."). `vercel.json` now uses `pnpm install --frozen-lockfile`, so install fails. Fix: regenerate and commit
   the lockfile with the move.
5. **P1 — `packages/layout/src/validate.ts:189-196`.** Spec §3 "every dock connected" is checked only as "dock node
   has an in-edge and an out-edge". A dock on an island node with a self-loop edge gets `ok: true`. Fix: require
   each dock to reach and be reached from at least one rack face/station; reject self-loop edges.
6. **P1 — `packages/layout/src/validate.ts:149,279`.** Duplicate `costs.vehicles` entries for one `fleetId` pass;
   `find()` silently takes the first. Fix: `duplicate-id` reason.
7. **P2 — `packages/layout/src/schema.ts:172-175`.** Spec §3 "every numeric field carries source": shift
   `start`/`end`/`days` have no `source`. Fix: sourced objects, or record the exemption in the decision ledger.
8. **P2 — `packages/layout/src/schema.ts:130`.** Edge `capacity.source` re-declares the enum inline. Fix: use `SourceSchema`.
9. **P2 — `packages/layout/test/fixtures.test.ts`.** Invalid fixtures assert reason prefixes (`startsWith`) only; no
   test for items 5 and 6. Fix: full-string asserts + two new tests.
10. **P2 — `README.md:93,117-123`, `README_EN.md:146,176-185`.** Still show root `src/` and `npm install`/`npm run dev`.
    Fix: `apps/viewer/` paths, `pnpm install && pnpm dev`.
11. **P2 — fixtures live in `packages/layout/fixtures/`, not `test/fixtures/`.** Each is labelled `"_fixture":
    "test-only"` and a test enforces it; `src/` does not import them. Acceptable; noted only.

## Checked, no finding

- Dependencies: new ones are `zod`, `vitest`, `@vitest/coverage-v8`, `typescript` — all on D-001.
- No fixed values added in new product code; owner fields carry `source: "owner"`, validator rejects `cad` there.
  Old hard-coded KPIs in `apps/viewer/src/core/constants.ts` are upstream code, removed by spec §5/§9 step 3.
- Paths: `vite.config.ts`, `apps/viewer/tsconfig.json`, `vercel.json outputDirectory` point at `apps/viewer`.
- Spec §2/§3 coverage: all §3 entities and all five validation rules present; `sim`/`cad`/`agents`/`runner` are later §9 steps.
- Layering / sim determinism: not applicable yet (no `packages/sim`, no agents).
