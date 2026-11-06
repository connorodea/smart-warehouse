# Warehouse Digital Twin Platform — Design Spec

Date: 2026-11-06 · Status: approved in brainstorming (Connor) · Repo: `connorodea/smart-warehouse`
(fork of `Xxcool/smart-warehouse`, MIT — keep the upstream copyright notice).

## 1. Product

A vendor-neutral "what-if" simulator for **warehouse owners** (resale / liquidation / 3PL first).
The owner uploads a CAD floor plan, AI agents build a running digital twin, and the owner tests
changes (fleet size, layout, shifts) and gets a proven answer: "you need 6 AMRs, not 10, and here is
the orders/hour evidence and the payback period."

Inspiration: the "Rackline" video (credited to @anxuanng on X) — NVIDIA SimReady models placed by
Claude Opus 5.5, rendered in a browser with a live KPI HUD and 1x–10x speed controls. No code was
published; analysis of the video points to Three.js + a browser sim loop. This product keeps that
stack and adds a headless engine so agents can run hundreds of scenarios.

### Locked decisions

| # | Decision | Answer |
|---|---|---|
| 1 | Market | Warehouses / resale |
| 2 | v1 job | What-if layout and fleet testing |
| 3 | Layout input | CAD (2D DWG/DXF floor plan) + AI agents |
| 4 | First payer | Warehouse owners |
| 5 | Agents | Build, Experiment, Explain, Report — LangChain + LangGraph (JS) |
| 6 | Engine | Video-style stack (glTF + Three.js + TypeScript sim) + the same sim on servers |
| 7 | Frontend | Vue 3 + Vite (inherited from this repo) |

### Non-negotiable rule: no fixed values

Every figure the owner sees is computed from the owner's own inputs (order history, equipment specs,
shift hours, costs) or is a value the owner entered and is labelled as theirs. When an input is
missing, the system asks for it. It never fills the gap with a constant or demo default. The current
repo's hard-coded KPI strings (`src/core/constants.ts`, HUD components) are removed under this rule.

## 2. Architecture

```
 CAD (.dwg/.dxf)
      │  convert (DWG→DXF) + parse
      ▼
 Build agent ──asks owner about unclear shapes──▶ owner
      ▼
 Layout JSON  (single source of truth; zod schema)
      ▼
 Sim core (TypeScript, pure, seeded)
   ├─ browser: live mode, clock = wall clock × speed
   └─ server workers: headless, as fast as CPU allows
      ▼
 Event log + KPIs ──▶ Viewer (Three.js) · Explain agent · Report agent
      ▲
 Experiment agent (mutates Layout JSON, reruns, ranks)
```

### Monorepo layout (pnpm workspaces)

```
apps/viewer/        Vue 3 + Three.js app (this repo's current src/, refactored)
packages/layout/    Layout JSON schema (zod), validators, fixtures
packages/sim/       Discrete-event sim core (no DOM, no Node-only APIs)
packages/cad/       DXF parsing → raw shapes grouped by layer
packages/agents/    LangGraph.js graphs: supervisor, build, experiment, explain, report
packages/runner/    Node worker pool that runs the sim headless in batches
```

Each package has one job and is testable alone. Agents only read and write Layout JSON and event
logs — they never touch renderer or sim internals.

## 3. Layout JSON (packages/layout)

Core entities: `zones` (receiving, storage, pick-pack, shipping, parking, charging), `docks`,
`racks` (position, rows × levels × slots, slot capacity), `stations` (pick/pack, with service-time
distribution), `conveyors` (path, rate), `pathGraph` (nodes + directed edges with length and
capacity = 1 vehicle per segment), `fleet` (vehicle type, count, speed, load/unload time, battery),
`shifts`, `costs`. Every numeric field carries `source: "owner" | "cad" | "derived"`.

Validation before any run: every rack face reachable from the path graph, every dock connected,
no zero-length edges, fleet > 0, all required owner inputs present. Invalid layouts are rejected with
a list of reasons.

## 4. Sim core (packages/sim)

- **Discrete-event**: priority queue of timestamped events; jumps event to event.
- **Deterministic**: seeded PRNG; same Layout + orders + seed ⇒ identical event log and KPIs.
- **Flow (v1)**: inbound arrival at receiving → putaway to rack slot → order arrives → retrieve →
  pick-pack queue → conveyor → shipping dock.
- **Fleet states**: idle, travel, load, unload, charge. Routing: A* on `pathGraph`. One vehicle per
  edge segment, so congestion emerges naturally.
- **Demand**: replays the owner's order-history CSV (WMS export); a fitted arrival process is
  allowed only when derived from that CSV.
- **Clock modes**: `live` (wall clock × speed, 1x–10x) and `headless` (run to completion).
- **Outputs**: event log `{t, entityId, type, from, to, payload}` and KPIs — orders/hour,
  order-to-ship time, rack fill %, free vehicles, queue lengths, vehicle utilisation.
- **Calibration**: run last month's real orders; compare simulated vs. actual orders/hour. Gap > 10%
  ⇒ twin is flagged "not calibrated" (threshold configurable).

## 5. Viewer (apps/viewer)

Keep from this repo: theme engine (Cyber Night / Studio Day), camera transitions, raycast picking,
anchored popups, HUD layout, loading overlay.

Replace:
- Scripted AGV spline (`t = time × 0.035`) → vehicle positions interpolated from the event log
  between each vehicle's previous and next event.
- Hard-coded `ENTITY_DATA` and HUD strings → bound to live KPIs and entity state.
- Single baked `smart_warehouse.glb` → scene assembled from Layout JSON, one glTF per object type
  (NVIDIA SimReady assets converted USD→glTF, plus the repo's Blender parts where useful).
- Chinese UI text → English (i18n-ready).
- Split the 1,610-line `WarehouseScene.ts` into `SceneRenderer`, `ThemeEngine`, `CameraController`,
  `EntityPicker`, `FleetView`, `LayoutBuilder`.
- Add playback bar: pause, 1x/2x/5x/10x, sim clock.

## 6. Agents (packages/agents, LangGraph.js)

- **Supervisor**: routes each owner request to one agent.
- **Build agent**: DXF shapes → tagged entities → Layout JSON. Uses a LangGraph `interrupt` to ask
  the owner about any unclear shape or missing input. Never guesses.
- **Experiment agent**: takes a goal ("hit 60 orders/hr"), generates layout/fleet/shift variants,
  submits batches to `packages/runner`, ranks by KPI with multiple seeds, returns the top 3 with
  evidence.
- **Explain agent**: answers "why" questions by querying the event log and pointing at a time and
  place the viewer can jump to.
- **Report agent**: ROI report from owner-entered costs (equipment, labour) vs. KPI deltas; payback
  in months.

LLM: Claude via `@langchain/anthropic` for production agent reasoning. Model is configurable.

## 7. Errors

- Invalid layout ⇒ rejected before run, reasons listed.
- Failed sim run in a batch ⇒ logged, skipped, reported in the experiment summary.
- Missing owner input ⇒ agent asks; no default.
- CAD parse failure ⇒ owner sees which layers/shapes failed.

## 8. Testing

- `packages/sim`: fixed-seed golden tests (identical KPIs), invariant tests (no two vehicles on one
  edge, conservation of pallets), throughput sanity on tiny hand-built layouts.
- `packages/layout`: schema + validator tests with good and bad fixtures.
- `packages/cad`: parse tests on 3 sample DXF files.
- `packages/agents`: graph tests with a mocked LLM; one live smoke test.
- Viewer: `vue-tsc` + build + Playwright screenshot smoke test.
- Calibration test: synthetic "real" history generated from a known layout must calibrate < 10%.

## 9. Build order

1. Monorepo scaffold + `packages/layout` schema and fixtures.
2. `packages/sim` core + tests (headless).
3. Viewer refactor: split `WarehouseScene.ts`, English UI, remove fake KPIs.
4. Viewer driven by sim (live mode, playback bar, KPI tiles).
5. `packages/runner` worker pool.
6. `packages/cad` DXF parsing.
7. Agents: build → experiment → explain → report.
8. Calibration + ROI report.

## 10. Out of scope (v1)

Live WMS/ERP feeds, 3D equipment CAD import (STEP/STL), Omniverse/Isaac Sim export, Blender MCP
asset generation, multi-tenant auth and billing.
