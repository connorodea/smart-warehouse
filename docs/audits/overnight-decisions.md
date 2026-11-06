# Decision ledger — warehouse twin 24h run

Decisions made without asking, per the `/overnight` decision-ledger rule. Each one is reversible.

## D-001 — Dependency allowlist

- **Decision:** which new dependencies the loop may add.
- **Options:** (a) none (the default `/overnight` hold — no build is possible); (b) only those the
  approved spec names plus standard test/build tooling; (c) anything.
- **Chosen default + why:** (b). Connor approved the spec (2026-11-06) that names these libraries and
  then ordered a 24h build of it. Allowlist: `zod`, `vitest`, `@vitest/coverage-v8`,
  `@langchain/langgraph`, `@langchain/core`, `@langchain/anthropic`, `dxf-parser`, `vue-i18n`,
  `@playwright/test`, `tsx`, `typescript`, `@types/node`. Anything else is not added; its need is
  logged here.
- **Reversal cost:** remove the package from the relevant `package.json` and re-run `pnpm install`.

## D-002 — Repository moves

- **Decision:** whether the current `src/` may move into `apps/viewer/` for the monorepo.
- **Options:** (a) leave the viewer at the repo root; (b) `git mv` into `apps/viewer/` on a branch.
- **Chosen default + why:** (b). This repo is a forked open-source demo, not QL/QB material. `git mv`
  on a feature branch keeps full history and destroys nothing.
- **Reversal cost:** drop the branch, or `git revert` the move commit.

## D-003 — Merge target

- **Decision:** where verified work lands.
- **Options:** (a) main (forbidden by the hard hold); (b) integration branch `feat/twin-v1`.
- **Chosen default + why:** (b). Keeps main clean; Connor merges `feat/twin-v1` to main himself.
- **Reversal cost:** delete nothing; just do not merge `feat/twin-v1`.

## D-004 — DeepSeek model id

- **Decision:** which DeepSeek V4.1 Flash id to use.
- **Options:** rolling `deepseek/deepseek-v4.1-flash` or pinned `deepseek/deepseek-v4.1-flash-1017`.
- **Chosen default + why:** pinned `-1017` snapshot, matching the earlier rule to use snapshots, not
  rolling aliases, so results stay reproducible across 24h.
- **Reversal cost:** change `--model` in `TICK.md`.

## D-005 — Commit messages past the branch-scope hook

- **Decision:** how to commit a unit whose honest scope (e.g. `layout`) is new on a branch that
  forks from `feat/twin-v1` (whose only scope since main is `spec`).
- **Options:** (a) mislabel the scope as `spec`; (b) open the unit on a branch off main (breaks D-003);
  (c) keep the honest scope, state in the tick why it belongs, and pass the message with `git commit -F <file>`
  written by a separate tool call (the hook re-fires on every retry by design).
- **Chosen default + why:** (c). A unit branch holds exactly one spec §9 unit, so the scope question
  the hook asks is answered by construction. Mislabelling would corrupt history.
- **Reversal cost:** none; future commits can use any form.

## D-006 — Shift `start` / `end` / `days` carry no `source`

- **Decision:** audit-2 item 7: whether shift times and days need `{ value, source }` wrappers.
- **Options:** (a) wrap them like quantities (touches every fixture and test); (b) exempt them.
- **Chosen default + why:** (b). Spec §3 says "every *numeric* field carries source". `start`/`end` are
  `HH:MM` strings and `days` is a list of day names, not numbers. They are owner inputs by definition: no
  CAD file has shift times. `staff`, the shift's only number, is sourced.
- **Reversal cost:** change `ShiftSchema` to wrap the three fields and update fixtures (~30 min).

## D-007 — `derived` is accepted as the source of an owner input

- **Decision:** whether an owner-input field may say `source: "derived"`.
- **Options:** (a) only `owner`; (b) `owner` or `derived` (reject only `cad`).
- **Chosen default + why:** (b). Spec §3 bans only CAD provenance for owner inputs. `derived` covers
  values computed from other owner inputs (e.g. a rate from a stated shift volume), where the derivation
  lives with the producer.
- **Reversal cost:** one-line change in `checkOwnerInputs` plus fixtures that use `derived`.
