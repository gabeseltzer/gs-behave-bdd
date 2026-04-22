---
gsd_state_version: 1.0
milestone: 1.3.0
milestone_name: Multi-Project Support
status: requirements
stopped_at: Defining requirements
last_updated: "2026-04-22T00:00:00.000Z"
progress:
  total_phases: 11
  completed_phases: 11
  total_plans: 28
  completed_plans: 28
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-22 — milestone v1.3.0 started)

**Core value:** Zero-configuration project discovery: tests appear in the Test Explorer without the user touching settings.json — and stay correct as the config evolves.
**Current focus:** Milestone v1.3.0 Multi-Project Support — defining requirements.

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-22 — Milestone v1.3.0 started

## Performance Metrics

**Velocity (cumulative):**

- Milestones shipped: 3 (1.0.0 2026-04-16, 1.1.0 2026-04-17, 1.2.0 2026-04-22)
- Total phases completed: 11 (1.0.0: 1-3, 1.1.0: 4-6, 1.2.0: 7-11)
- Total plans completed: 28 (1.0.0: 6, 1.1.0: 9, 1.2.0: 13)

*Reset per milestone after each `/gsd-complete-milestone` run.*

## Accumulated Context

### Decisions

Full decision log in PROJECT.md Key Decisions table and per-milestone archives:

- 1.0.0: `.planning/milestones/1.0.0-ROADMAP.md`
- 1.1.0: `.planning/milestones/1.1.0-ROADMAP.md`
- 1.2.0: `.planning/milestones/1.2.0-ROADMAP.md`

### Key Architecture Constraints

Carried forward:

- `getUrisOfWkspFoldersWithFeatures()` < 1ms hard budget — discovery results MUST stay cached.
- Backward compat: explicit `projectPath` / `featuresPath` / `featuresPaths` settings see zero behavior change.
- Config-watcher routes through `configurationChangedHandler(undefined, undefined, true)` — single choke point.
- Discovery cache is single source of truth (run guard + watcher + gatekeeper all read `getDiscoveryEntry()`).
- INI/TOML parsing must match behave's own behavior for the `paths` key.
- Single TestItem root per workspace — multi-path features go as path-group children under the workspace node.

### Pending Todos

None.

### Blockers/Concerns

None.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Deprecation | `featuresPath` deprecation + migration popup | Backlog 999.1 | 1.2.0 close |
| Multi-project | Project quick-pick + multi-project-per-workspace (MULTI-01/02) | Next milestone candidate | 1.0.0 init, reaffirmed 1.2.0 |
| Home configs | `~/.behaverc` support | Out of scope | 1.0.0 init |
| Code action | Inline "Fix Config" quick-fix | Out of scope | 1.0.0 init |
| Docs | README / marketplace docs updates | Next milestone candidate | 1.2.0 init |
| Fixture scoping | Per-document-root fixture scoping (INT-01) | Dropped — behave loads globally | 1.2.0 Phase 8 |

## Session Continuity

Last session: Milestone 1.2.0 complete
Stopped at: N/A
Resume file: N/A
