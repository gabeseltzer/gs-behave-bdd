---
phase: 04-watcher-run-guard
plan: 01
subsystem: watchers
tags: [vscode-api, file-system-watcher, debounce, sinon-fake-timers, config-discovery]

# Dependency graph
requires:
  - phase: 01-config-parsing
    provides: getUrisOfWkspFoldersWithFeatures(forceRefresh) and discoveryCache in common.ts
  - phase: 03-ux-verification
    provides: updateDiscoveryUX function and notifiedConfigErrors Set in extension.ts
provides:
  - startWatchingConfigFiles() — per-workspace FileSystemWatcher for all 5 behave config files
  - clearConfigDebounceTimers() — cleanup export for extension shutdown
  - wkspConfigWatchers Map in extension.ts — parallel to wkspWatchers for lifecycle management
  - 10 unit tests covering debounce timing, timer independence, all three events, disposal, and URI filtering
affects: [04-02-run-guard, integration-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Module-level debounce timer Map keyed by wkspUri.path (same shape as fileParser._pythonReparseTimers)
    - Callback injection (onConfigChanged) to avoid circular import from configWatcher.ts to extension.ts
    - Direct cache invalidation via getUrisOfWkspFoldersWithFeatures(true) bypassing configurationChangedHandler

key-files:
  created:
    - src/watchers/configWatcher.ts
    - test/unit/watchers/configWatcher.test.ts
  modified:
    - src/extension.ts
    - test/unit/vscode.mock.ts

key-decisions:
  - "Callback injection for updateDiscoveryUX — avoids circular import; extension.ts passes it as onConfigChanged parameter"
  - "Direct cache invalidation (not via configurationChangedHandler) — avoids integrationTestRun early-exit guard (PITFALL-04)"
  - "Module-level clearConfigDebounceTimers() export — needed for both extension shutdown and unit test isolation"
  - "Static import in test (not freshModule()) — avoids sinon fake timer interception issues with dynamic require"
  - "vscode.mock.ts extended with createFileSystemWatcher and RelativePattern — required for configWatcher unit tests"

patterns-established:
  - "Parallel wkspConfigWatchers Map: new watcher Maps in extension.ts use same lifecycle pattern as wkspWatchers"
  - "Per-workspace brace-expansion glob: {behave.ini,.behaverc,setup.cfg,tox.ini,pyproject.toml} in RelativePattern"

requirements-completed: [WATCH-01, WATCH-02, WATCH-03, WATCH-04, WATCH-05, WATCH-06, TEST-07]

# Metrics
duration: 45min
completed: 2026-04-16
---

# Phase 4 Plan 01: Config Watcher Summary

**FileSystemWatcher for all 5 behave config files with 500ms per-workspace debounce, wired into extension.ts activation and configurationChangedHandler lifecycle, with 10 unit tests via sinon fake timers**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-04-16T22:30:00Z
- **Completed:** 2026-04-16T23:15:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Created `src/watchers/configWatcher.ts` implementing WATCH-01 through WATCH-06: brace-expansion glob for all 5 config files, all three events (create/change/delete) via unified debounced handler, 500ms per-workspace timer Map, direct cache invalidation via `getUrisOfWkspFoldersWithFeatures(true)`, clearNotifiedErrors=true per WATCH-06
- Wired `wkspConfigWatchers` Map into `extension.ts`: activation loop creates config watchers alongside workspace watchers; `configurationChangedHandler` disposes and recreates them on workspace changes (WATCH-05); `clearConfigDebounceTimers` pushed to context.subscriptions for clean shutdown
- 10 passing unit tests (TEST-07) covering all required behaviors: not-before-500ms, after-500ms, rapid-saves-collapse, timer-reset, independent-workspace-timers, onDidCreate/Change/Delete, clearConfigDebounceTimers disposal, non-file URI filtering

## Task Commits

Each task was committed atomically:

1. **Task 1: Create configWatcher.ts and wire into extension.ts** - `6e46dda` (feat)
2. **Task 2: Unit tests for config watcher debounce and lifecycle** - `28cb251` (test)

## Files Created/Modified

- `src/watchers/configWatcher.ts` - New module: startWatchingConfigFiles() and clearConfigDebounceTimers()
- `src/extension.ts` - Added wkspConfigWatchers Map, activation loop, configurationChangedHandler disposal/recreation, clearConfigDebounceTimers disposable
- `test/unit/watchers/configWatcher.test.ts` - 10 unit tests for debounce, lifecycle, and event coverage
- `test/unit/vscode.mock.ts` - Added createFileSystemWatcher, RelativePattern, and non-file URI scheme support to Uri.parse

## Decisions Made

- **Callback injection over export for updateDiscoveryUX:** `startWatchingConfigFiles` accepts `onConfigChanged` callback parameter rather than importing from `extension.ts` directly — avoids circular import (configWatcher → extension). Extension passes `updateDiscoveryUX` at call site.
- **Direct cache invalidation (not configurationChangedHandler):** Watcher handler calls `getUrisOfWkspFoldersWithFeatures(true)` directly. Routing through `configurationChangedHandler` would silently exit during integration tests due to `integrationTestRun` guard at line 570 (PITFALL-04).
- **Static import in unit tests:** Used top-level `import { startWatchingConfigFiles }` instead of `freshModule()` dynamic require pattern. Static import correctly resolves `setTimeout` through sinon fake timers; dynamic require in test body hit an interception issue.
- **`clearConfigDebounceTimers()` for test isolation:** Module-level timer Map requires explicit cleanup between tests (no class dispose method). `clearConfigDebounceTimers()` exported and called in teardown.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added createFileSystemWatcher and RelativePattern to vscode.mock.ts**
- **Found during:** Task 2 (unit test implementation)
- **Issue:** vscode.mock.ts lacked `createFileSystemWatcher` — sinon could not stub a non-existent property, causing all configWatcher tests to fail in setup
- **Fix:** Added `createFileSystemWatcher` stub function to `workspace` mock object, and `RelativePattern` class to the mock exports
- **Files modified:** test/unit/vscode.mock.ts
- **Verification:** All 10 configWatcher tests pass; existing 521 tests unaffected
- **Committed in:** 28cb251 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed Uri.parse in mock to extract scheme correctly**
- **Found during:** Task 2 (non-file URI filtering test)
- **Issue:** `Uri.parse('git:///...')` was defaulting to `scheme='file'` because the scheme extraction regex matched `://` but wasn't setting scheme on the returned Uri object
- **Fix:** Updated Uri.parse to extract scheme from the URI string and assign it to the returned Uri object
- **Files modified:** test/unit/vscode.mock.ts
- **Verification:** Non-file URI test passes (gitUri.scheme === 'git', handler returns early)
- **Committed in:** 28cb251 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 bug)
**Impact on plan:** Both fixes were in the test support layer (vscode.mock.ts), not in production code. No scope creep.

## Issues Encountered

- Dynamic `require()` inside test bodies (freshModule pattern) caused sinon fake timers to not intercept `setTimeout` in the loaded module. Root cause: module was re-required but sinon's fake timer replacement of `global.setTimeout` wasn't being picked up by the newly loaded module in that execution context. Fixed by using static top-level imports and `clearConfigDebounceTimers()` for state reset between tests.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Config watcher (WATCH-01 through WATCH-06) is complete and unit-tested
- Plan 02 (run guard) can proceed: testRunHandler.ts guard insertion point verified in RESEARCH.md
- No blockers

---
*Phase: 04-watcher-run-guard*
*Completed: 2026-04-16*

## Self-Check: PASSED

- FOUND: src/watchers/configWatcher.ts
- FOUND: src/extension.ts (modified)
- FOUND: test/unit/watchers/configWatcher.test.ts
- FOUND: test/unit/vscode.mock.ts (modified)
- FOUND: .planning/phases/04-watcher-run-guard/04-01-SUMMARY.md
- FOUND: commit 6e46dda (feat: configWatcher implementation)
- FOUND: commit 28cb251 (test: configWatcher unit tests)
