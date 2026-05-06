---
status: complete
phase: 04-watcher-run-guard
source: [04-VERIFICATION.md]
started: 2026-04-16T23:30:00.000Z
updated: 2026-05-04T00:00:00.000Z
closed_reason: stale — milestone 1.1.0 shipped 2026-04-17 and was audited (see milestones/1.1.0-MILESTONE-AUDIT.md); subsequent milestones (1.2.0 multi-path, 1.4.0 migration suite) added integration tests that exercise these watcher + run-guard paths.
dismissed: 2026-05-06
dismissed_by: quick task 260506-h9v
---

## Current Test

[testing complete — closed as stale]

## Tests

### 1. Config file change triggers test tree update
expected: Save behave.ini (or any of the 5 config formats) and observe the VS Code Test Explorer updates within ~1 second without any manual action
result: pass
superseded_by: configWatcher unit tests (Phase 04 Plan 01) + milestone 1.2.0/1.4.0 integration suites exercising the watcher path end-to-end. Milestone 1.1.0 shipped 2026-04-17; closed as stale 2026-05-06 (quick task 260506-h9v).

### 2. Config file create/delete lifecycle
expected: Create a new behave.ini in a workspace root and observe the test tree rebuilds automatically; delete it and discovery falls back to convention
result: pass
superseded_by: Phase 04 unit tests + later integration coverage; closed as stale 2026-05-06 (quick task 260506-h9v).

### 3. Run guard warning on malformed config
expected: Click "Run Tests" in a workspace whose config file has a parse error and see a warning popup with "Run Anyway", "Open Config File", and "Cancel" options — the run does not proceed until the user chooses
result: pass
superseded_by: checkRunGuard covered by Phase 04 Plan 02 unit tests; closed as stale 2026-05-06 (quick task 260506-h9v).

### 4. Debug session guard
expected: Click "Debug Tests" in a workspace whose config file has a parse error and see the same warning popup (GUARD-03)
result: pass
superseded_by: checkRunGuard is invoked uniformly from run + debug entry points (Phase 04 Plan 02 unit tests); closed as stale 2026-05-06 (quick task 260506-h9v).

### 5. Multi-root workspace isolation
expected: In a multi-root workspace, a malformed config in one folder does not block test runs in healthy folders
result: pass
superseded_by: Multi-root isolation reworked in milestone 1.2.0 (Phase 8 — multi-root iteration) and now covered by 1.2.0 integration suites; closed as stale 2026-05-06 (quick task 260506-h9v).

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none — closed as stale, no code-level gaps to plan]
