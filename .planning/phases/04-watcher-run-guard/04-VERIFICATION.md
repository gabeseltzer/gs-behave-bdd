---
phase: 04-watcher-run-guard
verified: 2026-04-16T23:45:00Z
status: human_needed
score: 5/5
overrides_applied: 0
human_verification:
  - test: "Save a change to behave.ini in a workspace root and observe the Test Explorer"
    expected: "Test Explorer updates within 1 second without manual action"
    why_human: "Requires VS Code runtime with active extension host — file watcher event dispatch and UI update cannot be verified programmatically"
  - test: "Create a new behave.ini in a workspace root, then delete it"
    expected: "Test tree rebuilds automatically on create; discovery falls back to convention on delete"
    why_human: "Requires VS Code runtime to observe test tree rebuilding in Test Explorer UI"
  - test: "Click Run Tests in a workspace whose config file has a parse error"
    expected: "Warning popup appears with Run Anyway, Open Config File, and Cancel options; run does not proceed until user chooses"
    why_human: "Requires VS Code runtime with active test controller — warning dialog interaction and test run gating are UI behaviors"
  - test: "Click Debug Tests in a workspace whose config file has a parse error"
    expected: "Same warning popup fires as for regular test runs"
    why_human: "Requires VS Code runtime — debug profile shares the same runHandler path but needs manual confirmation"
  - test: "In a multi-root workspace, run tests from a healthy folder while another folder has a malformed config"
    expected: "Tests run without warning; the malformed config in the other folder does not interfere"
    why_human: "Requires multi-root workspace setup in VS Code to verify workspace isolation"
---

# Phase 4: Watcher & Run Guard Verification Report

**Phase Goal:** Users see the test tree update automatically when a behave config file changes, and are warned before running tests against a workspace with a malformed config
**Verified:** 2026-04-16T23:45:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User saves a change to behave.ini and the VS Code Test Explorer updates within 1 second without manual action | VERIFIED | `configWatcher.ts` creates FileSystemWatcher with brace-expansion glob for all 5 config files, fires on change events, debounces at 500ms, calls `getUrisOfWkspFoldersWithFeatures(true)` + `parser.parseFilesForWorkspace()` to rebuild test tree. Unit test confirms debounce fires after 500ms. |
| 2 | User creates a new behave.ini and test tree rebuilds; user deletes it and discovery falls back to convention | VERIFIED | `configWatcher.ts` lines 68-70 register `onDidCreate`, `onDidChange`, `onDidDelete` -- all three events go through the same debounced handler. Unit tests verify all three event types trigger re-discovery. |
| 3 | User clicks Run Tests with malformed config and sees warning popup with Run Anyway / Open Config File / Cancel | VERIFIED | `checkRunGuard` in `testRunHandler.ts` lines 90-150 reads `configError` from discovery cache via `getDiscoveryEntry()`, shows `vscode.window.showWarningMessage` with all three buttons. Guard call at line 56-61 is BEFORE `ctrl.createTestRun` at line 66 -- no dangling TestRun on cancel. 8 unit tests cover all response paths. |
| 4 | Warning popup fires for both regular test runs and debug sessions (GUARD-03) | VERIFIED | Both run profiles in `extension.ts` call the shared `runHandler(debug, request)` which invokes `checkRunGuard` at line 56. No separate code path -- single guard covers both. |
| 5 | In a multi-root workspace, malformed config in one folder does not block test runs in healthy folders | VERIFIED | `checkRunGuard` GUARD-04 scoping: lines 95-104 collect workspace URIs only for queued test items, lines 106-118 only check `configError` for workspaces in the queued set. Unit test "GUARD-04: only checks workspaces with queued tests" confirms workspace B error is ignored when only workspace A tests are queued. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/watchers/configWatcher.ts` | Config watcher with `startWatchingConfigFiles` export | VERIFIED | 73 lines, exports `startWatchingConfigFiles` and `clearConfigDebounceTimers`, contains CONFIG_GLOB, DEBOUNCE_MS=500, all three event registrations, direct cache invalidation |
| `src/extension.ts` | `wkspConfigWatchers` Map, activation loop, disposal in configurationChangedHandler | VERIFIED | Line 39: Map declaration; Lines 145-148: activation loop; Lines 614-619: disposal/recreation in configurationChangedHandler; Line 216: clearConfigDebounceTimers disposable |
| `test/unit/watchers/configWatcher.test.ts` | Unit tests for debounce, lifecycle, all-three-events | VERIFIED | 313 lines, 10 test cases covering debounce timing (4 tests), independent workspace timers (1), all three event types (3), clearConfigDebounceTimers (1), non-file URI filtering (1) |
| `src/runners/testRunHandler.ts` | `checkRunGuard` function + integration into handler | VERIFIED | Lines 90-150: exported `checkRunGuard` function; Line 56-61: guard call before createTestRun; imports `getDiscoveryEntry` and `basename` from common |
| `test/unit/runners/testRunHandler.test.ts` | Unit tests for run guard response handling | VERIFIED | 8 tests in `checkRunGuard` suite covering no-error, Run Anyway, Open Config File, Cancel, dismiss, filename in message, GUARD-04 scoping, D-14 logging |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/watchers/configWatcher.ts` | `src/common.ts` | `getUrisOfWkspFoldersWithFeatures(true)` | WIRED | Line 56: direct call with forceRefresh=true for cache invalidation |
| `src/extension.ts` | `src/watchers/configWatcher.ts` | `import startWatchingConfigFiles` | WIRED | Line 33: import; Lines 146, 617: called in activation loop and configurationChangedHandler |
| `src/runners/testRunHandler.ts` | `src/common.ts` | `getDiscoveryEntry(wkspUri)?.configError` | WIRED | Line 110-111: reads configError from discovery cache |
| `src/runners/testRunHandler.ts` | `vscode.window.showWarningMessage` | Three-button warning dialog | WIRED | Lines 131-136: showWarningMessage with 'Run Anyway', 'Open Config File', 'Cancel' |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `configWatcher.ts` | FileSystemWatcher events | VS Code FileSystemWatcher API | Real filesystem events | FLOWING |
| `checkRunGuard` | `entry?.configError` | `getDiscoveryEntry(wkspUri)` | Discovery cache populated by `findBehaveConfig` parser | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED -- VS Code extension requires extension host runtime. Module exports cannot be verified outside VS Code. Unit tests (539 passing, 12s) serve as the behavioral verification layer.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-----------|-------------|--------|----------|
| WATCH-01 | 04-01 | FileSystemWatcher monitors all 5 behave config files | SATISFIED | `CONFIG_GLOB = '{behave.ini,.behaverc,setup.cfg,tox.ini,pyproject.toml}'` in configWatcher.ts line 9 |
| WATCH-02 | 04-01 | Watcher fires on create, change, and delete events | SATISFIED | Lines 68-70: `onDidCreate`, `onDidChange`, `onDidDelete` all registered; 3 unit tests verify each event type |
| WATCH-03 | 04-01 | Config file changes debounced at 500ms | SATISFIED | `DEBOUNCE_MS = 500` at line 10; 4 unit tests verify debounce timing including timer reset and rapid save collapse |
| WATCH-04 | 04-01 | Re-discovery silently updates test tree and logs to output channel | SATISFIED | Lines 49-51: `config.logger.logInfo()` for output channel; `parser.parseFilesForWorkspace()` at line 58 triggers tree rebuild |
| WATCH-05 | 04-01 | Per-workspace watcher lifecycle: disposed and recreated on folder change | SATISFIED | extension.ts lines 614-619: `oldConfigWatchers` disposed, new watchers created in configurationChangedHandler |
| WATCH-06 | 04-01 | Notification dedup cleared per-workspace on watcher re-discovery | SATISFIED | `onConfigChanged([wkspUri], true)` at configWatcher.ts line 57; `updateDiscoveryUX` clears `notifiedConfigErrors` when clearNotifiedErrors=true (extension.ts line 63-64) |
| GUARD-01 | 04-02 | Test run checks discovery cache for configError | SATISFIED | `checkRunGuard` reads `getDiscoveryEntry(wkspUri)?.configError` at line 110-111 |
| GUARD-02 | 04-02 | Warning shown with Run Anyway / Open Config File / Cancel | SATISFIED | `showWarningMessage` with all three buttons at lines 131-136 |
| GUARD-03 | 04-02 | Guard applies to both regular and debug sessions | SATISFIED | Both profiles call shared `runHandler` which calls `checkRunGuard` at line 56 |
| GUARD-04 | 04-02 | Guard scoped to workspaces whose tests are queued | SATISFIED | Lines 95-104: collects queued workspace URIs; line 109: `wkspUriSet.has(uriId(wkspUri))` filter |
| TEST-07 | 04-01 | Unit tests for watcher debounce and lifecycle | SATISFIED | 10 unit tests in configWatcher.test.ts -- all passing |
| TEST-09 | 04-02 | Unit test for run guard configError check and response handling | SATISFIED | 8 unit tests in checkRunGuard suite -- all passing |

**Orphaned requirements:** None. All 12 requirements mapped to Phase 4 in REQUIREMENTS.md are covered by plan 04-01 or 04-02.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | - | - | No TODO, FIXME, placeholder, stub, or empty implementation patterns found in any modified source file |

### Human Verification Required

### 1. Config File Change Triggers Test Tree Update

**Test:** Save a change to `behave.ini` (or any of the 5 config formats) in a workspace root
**Expected:** VS Code Test Explorer updates within 1 second without any manual action
**Why human:** Requires VS Code runtime with active extension host -- file watcher event dispatch and UI update cannot be verified programmatically

### 2. Config File Create/Delete Lifecycle

**Test:** Create a new `behave.ini` in a workspace root, then delete it
**Expected:** Test tree rebuilds automatically on create; discovery falls back to convention on delete
**Why human:** Requires VS Code runtime to observe test tree rebuilding in Test Explorer UI

### 3. Run Guard Warning on Malformed Config

**Test:** Click "Run Tests" in a workspace whose config file has a parse error
**Expected:** Warning popup appears with "Run Anyway", "Open Config File", and "Cancel" options; run does not proceed until user chooses
**Why human:** Requires VS Code runtime with active test controller -- warning dialog interaction and test run gating are UI behaviors

### 4. Debug Session Guard

**Test:** Click "Debug Tests" in a workspace whose config file has a parse error
**Expected:** Same warning popup fires as for regular test runs
**Why human:** Requires VS Code runtime -- debug profile shares the same runHandler path but needs manual confirmation

### 5. Multi-Root Workspace Isolation

**Test:** In a multi-root workspace, run tests from a healthy folder while another folder has a malformed config
**Expected:** Tests run without warning; the malformed config in the other folder does not interfere
**Why human:** Requires multi-root workspace setup in VS Code to verify workspace isolation

### Gaps Summary

No code-level gaps found. All 5 observable truths from ROADMAP.md success criteria are supported by substantive, wired, data-flowing artifacts. All 12 requirements are satisfied with implementation evidence. All 539 unit tests pass (including 10 configWatcher tests and 8 checkRunGuard tests). No anti-patterns detected.

Status is `human_needed` because all 5 success criteria describe user-observable behaviors within VS Code's Test Explorer and dialog system, which require manual testing in a running VS Code instance to confirm end-to-end.

---

_Verified: 2026-04-16T23:45:00Z_
_Verifier: Claude (gsd-verifier)_
