---
phase: "04"
plan: "02"
subsystem: runners
tags: [run-guard, config-error, warning-dialog, test-coverage]
dependency_graph:
  requires:
    - src/common.ts (getDiscoveryEntry, basename, getUrisOfWkspFoldersWithFeatures, getWorkspaceSettingsForFile, uriId)
    - src/configuration.ts (config singleton, Logger.logInfo)
  provides:
    - checkRunGuard exported function in testRunHandler.ts
    - 8 unit tests covering all guard response paths
  affects:
    - src/runners/testRunHandler.ts (modified — guard inserted before createTestRun)
    - test/unit/runners/testRunHandler.test.ts (extended — new checkRunGuard suite)
tech_stack:
  added: []
  patterns:
    - Run guard pattern: exported async helper intercepting test execution before TestRun creation
    - Sinon stub pattern: commonModule + configModule stubs without module cache clearing (preserves config singleton)
key_files:
  created: []
  modified:
    - src/runners/testRunHandler.ts
    - test/unit/runners/testRunHandler.test.ts
decisions:
  - "Import checkRunGuard once at suite level (no cache clearing) — clearing testRunHandler cache breaks config reference chain via circular configuration/logger deps"
  - "checkRunGuard exported as named export — enables direct unit test import without module re-loading"
  - "Guard placed before removeTempDirectoryCancelSource.cancel() and ctrl.createTestRun() — prevents dangling TestRun on cancel"
metrics:
  duration: "~25 minutes"
  completed: "2026-04-16"
  tasks_completed: 2
  files_modified: 2
---

# Phase 4 Plan 02: Run Guard Implementation Summary

Run guard that intercepts test execution when queued workspaces have malformed config. Reads configError from the discovery cache, shows a warning dialog with three action buttons (Run Anyway / Open Config File / Cancel), and gates or passes test execution accordingly. Fires for both regular runs and debug sessions via the shared runHandler path. 8 unit tests cover all response paths and workspace scoping.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement checkRunGuard in testRunHandler.ts | 3d16560 | src/runners/testRunHandler.ts |
| 2 | Unit tests for run guard (TEST-09) | cc1237c | test/unit/runners/testRunHandler.test.ts |

## What Was Built

### `checkRunGuard` function (src/runners/testRunHandler.ts)

- Exported async function accepting `TestRunRequest` and `TestController`
- Collects workspace URIs for queued test items only (GUARD-04 scoping)
- Reads `configError` from discovery cache via `getDiscoveryEntry()` (GUARD-01)
- Shows `vscode.window.showWarningMessage` with three buttons: Run Anyway, Open Config File, Cancel (GUARD-02)
- D-14 audit trail: logs `"Run guard: config error in '${filename}'"` to workspace output channel
- Open Config File branch: calls `vscode.commands.executeCommand('vscode.open', configFileUri)`
- Returns `true` to proceed or `false` to cancel; caller skips `ctrl.createTestRun` on false
- Guard fires for both run and debug profiles via shared `runHandler` (GUARD-03)

### Guard call site insertion

Guard call inserted between `featureParseComplete` check (line 45-53) and `removeTempDirectoryCancelSource.cancel()` (line 56), ensuring no dangling TestRun is created on cancel (plan PITFALL-07).

### Unit tests (test/unit/runners/testRunHandler.test.ts)

New `suite('checkRunGuard', ...)` with 8 tests:
1. Returns true when no workspaces have configError (no dialog shown)
2. Returns true when user clicks "Run Anyway"
3. Opens config file and returns false when user clicks "Open Config File"
4. Returns false when user clicks "Cancel"
5. Returns false when user dismisses dialog (undefined)
6. Warning message contains the broken config filename (e.g., `'behave.ini'`)
7. GUARD-04: workspace B configError not checked when only workspace A tests are queued
8. D-14: logInfo called with "Run guard: config error in" string

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Module cache clearing incompatible with config singleton**
- **Found during:** Task 2 (test setup)
- **Issue:** Plan specified clearing testRunHandler module cache between tests (same pattern as existing logWkspRunStarted tests). But checkRunGuard accesses `config.logger` which requires the configuration singleton to be intact. Clearing testRunHandler's cache causes it to re-require configuration via a partially-initialized circular dep (configuration ↔ logger), resulting in `config` being undefined inside the re-loaded module.
- **Fix:** Import `checkRunGuard` once at suite scope (before setup) without cache clearing. The stubs on `commonModule` and `configModule.config.logger` are applied fresh each test via `setup()` and removed via `sinon.restore()` in `teardown()`. This is the same pattern used in `atomicStepReload.test.ts` which also stubs `config.logger`.
- **Files modified:** test/unit/runners/testRunHandler.test.ts
- **Commit:** cc1237c

## Known Stubs

None. All behavior is fully implemented and wired.

## Threat Flags

No new threat surface introduced beyond the plan's threat model. `vscode.commands.executeCommand('vscode.open')` opens only the user's own config file — no privilege escalation.

## Self-Check: PASSED
