---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Multi-Path & Monorepo-Aware Discovery
status: Defining requirements
stopped_at: v1.2 started 2026-04-17; running research before requirements
last_updated: "2026-04-17T20:00:00.000Z"
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-17 — v1.2 milestone started)

**Core value:** Zero-configuration project discovery: tests appear in the Test Explorer without the user touching settings.json — and stay correct as the config evolves.
**Current focus:** v1.2 Multi-Path & Monorepo-Aware Discovery — multi-value `paths=` support + depth-3 subdirectory scan with first-match-wins.

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-17 — Milestone v1.2 started

## Performance Metrics

**Velocity (cumulative):**

- Milestones shipped: 2 (v1.0 2026-04-16, v1.1 2026-04-17)
- Total phases completed: 6 (v1.0: 1-3, v1.1: 4-6)
- Total plans completed: 15 (v1.0: 6, v1.1: 9)

*Reset per milestone after each `/gsd-complete-milestone` run.*

## Accumulated Context

### Decisions

Full decision log in PROJECT.md Key Decisions table and per-milestone archives:

- v1.0: `.planning/milestones/v1.0-ROADMAP.md`
- v1.1: `.planning/milestones/v1.1-ROADMAP.md`

### Key Architecture Constraints

Carried into v1.2 from v1.0 + v1.1:

- `getUrisOfWkspFoldersWithFeatures()` < 1ms hard budget — discovery results MUST stay cached.
- Backward compat: explicit `projectPath` / `featuresPath` settings see zero behavior change.
- Config-watcher routes through `configurationChangedHandler(undefined, undefined, true)` — single choke point for log clear + watcher rebuild + `clearNotifiedErrors=true`.
- Discovery cache is single source of truth (run guard + watcher + gatekeeper all read `getDiscoveryEntry()`).
- INI/TOML parsing must match behave's own behavior for the `paths` key (continuation-line semantics for INI; native array for TOML).

### Pending Todos

None.

### Blockers/Concerns

None.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Multi-project | Project quick-pick + multi-project-per-workspace (MULTI-01/02) | Milestone 3 / v2.0 | v1.0 init, reaffirmed v1.2 |
| Home configs | `~/.behaverc` support | Out of scope | v1.0 init |
| Code action | Inline "Fix Config" quick-fix | Out of scope | v1.0 init |

## Session Continuity

Last session: 2026-04-17T20:00:00Z
Stopped at: v1.2 started — running research before requirements
Resume file: none — `/gsd-new-milestone` in progress.
