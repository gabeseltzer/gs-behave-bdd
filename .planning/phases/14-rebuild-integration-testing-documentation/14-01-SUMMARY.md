---
phase: 14-rebuild-integration-testing-documentation
plan: 01
status: complete
started: 2026-04-23
completed: 2026-04-23
---

## Summary

Wired the project switch command to trigger a full tree + step mapping rebuild with progress feedback and a run guard during rebuild.

## Changes

### src/common.ts
- Added module-level `_projectSwitchInProgress` flag with `setProjectSwitchInProgress()` setter and `isProjectSwitchInProgress()` getter

### src/runners/testRunHandler.ts
- Added GUARD-05 at the top of `checkRunGuard()` that blocks test runs when `isProjectSwitchInProgress()` is true
- Shows warning message to user during rebuild

### src/extension.ts
- Added `setProjectSwitchInProgress` import from `./common`
- Modified `selectProjectCommand` `onDidAccept` handler to trigger full rebuild after project switch:
  - Sets `projectSwitchInProgress` flag to `true`
  - Shows `withProgress` notification during rebuild
  - Calls `configurationChangedHandler(undefined, undefined, true)` for full rebuild
  - Clears flag in `finally` block ensuring cleanup on error

## Key Files

| File | Change |
|------|--------|
| src/common.ts | `setProjectSwitchInProgress` / `isProjectSwitchInProgress` exports |
| src/runners/testRunHandler.ts | GUARD-05 run guard |
| src/extension.ts | Rebuild logic in selectProjectCommand |

## Verification

- ESLint: 0 errors
- Unit tests: 655 passing
