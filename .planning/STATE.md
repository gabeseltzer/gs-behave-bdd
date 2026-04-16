---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Config File Watching
status: executing
stopped_at: Phase 4 context gathered
last_updated: "2026-04-16T22:21:13.646Z"
last_activity: 2026-04-16 -- Phase 04 execution started
progress:
  total_phases: 2
  completed_phases: 0
  total_plans: 2
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-16)

**Core value:** Zero-configuration project discovery: tests appear in the Test Explorer without the user touching settings.json.
**Current focus:** Phase 04 — watcher-run-guard

## Current Position

Phase: 04 (watcher-run-guard) — EXECUTING
Plan: 1 of 2
Status: Executing Phase 04
Last activity: 2026-04-16 -- Phase 04 execution started

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 6 (v1.0)
- Average duration: -
- Total execution time: 0 hours (v1.1)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 2 | - | - |
| 02 | 2 | - | - |
| 03 | 2 | - | - |
| 04 | TBD | - | - |
| 05 | TBD | - | - |

**Recent Trend:**

- Last 5 plans: (none yet for v1.1)
- Trend: -

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- smol-toml already installed at v1.6.0 — no install step needed
- INI parser hand-rolled — matches Python configparser continuation-line semantics
- Single featuresUri in v1 — multi-path deferred to v2
- Workspace root only — subdirectory scanning deferred to v2
- Discovery cache lives in common.ts (not a separate module) — config watcher must route through configurationChangedHandler
- Config watcher uses brace-expansion glob `{behave.ini,.behaverc,setup.cfg,tox.ini,pyproject.toml}` — bare filenames silently fail (VS Code bug #164925)
- 500ms debounce mandatory — stale file read race on onDidChange (VS Code bug #72831)
- Run guard reads from discoveryCache via getDiscoveryEntry(), NOT from WorkspaceSettings snapshot
- Run guard is non-blocking: "Run Anyway" / "Open Config File" / "Cancel"

### Key Architecture Constraints

- Config watcher callback must route through `configurationChangedHandler(undefined, undefined, true)` — preserves integration test guard, log clearing, watcher rebuild, and `clearNotifiedErrors=true`
- Per-workspace watcher lifecycle: maintain `wkspConfigWatchers: Map<vscode.Uri, vscode.FileSystemWatcher[]>` parallel to existing `wkspWatchers`; dispose before recreating (Pitfall 1)
- Run guard scoped to workspace URIs with queued tests only (not all workspaces) — Pitfall 8
- Integration test (TEST-08): config watcher routes through configurationChangedHandler which has `integrationTestRun` early-exit guard — test may need direct cache+parser calls instead (Pitfall 14)

### Pending Todos

None beyond roadmap scope.

### Blockers/Concerns

None.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Multi-path | featuresUris[] array + downstream consumer updates | v2 | Init |
| Subdirectory scan | depth-3 scan + discoveryDepth setting | v2 | Init |
| Multi-project | Project quick-pick command | Milestone 3 | Init |

## Session Continuity

Last session: 2026-04-16T22:01:07.559Z
Stopped at: Phase 4 context gathered
Resume file: .planning/phases/04-watcher-run-guard/04-CONTEXT.md
