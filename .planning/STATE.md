---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Multi-Path & Monorepo-Aware Discovery
status: unknown
stopped_at: Phase 8 context gathered
last_updated: "2026-04-20T19:21:25.534Z"
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 6
  completed_plans: 6
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-17 — v1.2 milestone started)

**Core value:** Zero-configuration project discovery: tests appear in the Test Explorer without the user touching settings.json — and stay correct as the config evolves.
**Current focus:** Phase 08 — parser-test-tree-watcher-multi-root

## Current Position

Phase: 9
Plan: Not started

## Performance Metrics

**Velocity (cumulative):**

- Milestones shipped: 2 (v1.0 2026-04-16, v1.1 2026-04-17)
- Total phases completed: 6 (v1.0: 1-3, v1.1: 4-6)
- Total plans completed: 15 (v1.0: 6, v1.1: 9)

**v1.2 planned scope:**

- Phases: 5 (Phase 7 → Phase 11)
- Requirements: 20 (MP-01..06, SD-01..04, INT-01..04, TEST-10..15)
- Plans: TBD per-phase
- Dependencies: 7 → {8, 9 parallel} → 10 → 11

*Reset per milestone after each `/gsd-complete-milestone` run.*

## Accumulated Context

### Decisions

Full decision log in PROJECT.md Key Decisions table and per-milestone archives:

- v1.0: `.planning/milestones/v1.0-ROADMAP.md`
- v1.1: `.planning/milestones/v1.1-ROADMAP.md`

**v1.2 roadmap-level decisions:**

- Primary-plus-list pattern: `featuresUri` kept as scalar getter returning `featuresUris[0]`; plural `featuresUris: Uri[]` added alongside — prevents 18-file rename blast radius (Pitfall 3).
- Path-group TestItems (MP-05) assigned to Phase 8 (test-tree coupling), not Phase 11 — the intermediate-node logic lives in the `_getOrCreateFeatureTestItem…` cascade that Phase 8 already rewrites.
- Per-path diagnostic (MP-04) assigned to Phase 8 — diagnostic emission is a direct consumer of `resolvePaths` failure, and Phase 8 owns the parser/consumer cascade.
- `integrationTestRun` bypass (INT-04) assigned to Phase 9 — the new re-discovery triggers (scanner rebuild + two-tier watcher) are introduced in Phase 9 and must mirror v1.1 Pitfall 14 from day one.
- Phase 7 (types only, compilation-only risk) MUST land first — unblocks Phases 8, 9, 10 per SUMMARY.md Phase Dependency Graph.
- Phase 11 (regression + fixtures) MUST land last — fixtures (`multi-path/`, `monorepo-scan/`) and 3× flakiness gate lock the milestone for close.

### Key Architecture Constraints

Carried into v1.2 from v1.0 + v1.1:

- `getUrisOfWkspFoldersWithFeatures()` < 1ms hard budget — discovery results MUST stay cached.
- Backward compat: explicit `projectPath` / `featuresPath` settings see zero behavior change.
- Config-watcher routes through `configurationChangedHandler(undefined, undefined, true)` — single choke point for log clear + watcher rebuild + `clearNotifiedErrors=true`. **Exception for v1.2 (per v1.1 Pitfall 14 / INT-04):** subdir-scanner re-discovery paths call cache + parser directly, bypassing the handler to keep integration tests exercising those paths.
- Discovery cache is single source of truth (run guard + watcher + gatekeeper all read `getDiscoveryEntry()`).
- INI/TOML parsing must match behave's own behavior for the `paths` key (continuation-line semantics for INI; native array for TOML).
- Single TestItem root per workspace — never one-per-feature-path; multi-path features go as siblings/path-group children under the existing workspace node.

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
| Docs | README / marketplace docs updates | Milestone 3 | v1.2 init |
| Run guard | Hard-blocking run guard on `alsoFoundConfigs` ambiguity | Anti-feature | v1.2 init |

## Session Continuity

Last session: 2026-04-20T17:41:40.099Z
Stopped at: Phase 8 context gathered
Resume file: .planning/phases/08-parser-test-tree-watcher-multi-root/08-CONTEXT.md
