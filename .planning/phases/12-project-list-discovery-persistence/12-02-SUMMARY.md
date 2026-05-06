---
phase: 12-project-list-discovery-persistence
plan: 02
type: execute
status: complete
---

## Summary

Wired the ProjectList module (from Plan 01) into the extension lifecycle across three files:

### `src/extension.ts`
- Called `initProjectListPersistence(context.workspaceState)` during activation
- Added sync project list population loop for already-discovered workspaces (after configWatcher setup)
- Added async project list population after BFS scan completes (after `setCachedScanResult`)
- Both paths include root config detection and `rebuildProjectList` call

### `src/common.ts`
- Added Phase 12 block in `hasFeaturesFolder()` before the existing Phase 9 fallback
- Checks `getActiveProject(folder.uri)` first — uses active project's config for discovery cache
- Guarded by `isManualProjectPathMode` so Branch A (explicit settings) is untouched
- Phase 9 `scanResult.primary` block retained as fallback for gap between scan and project list population
- Builds `alsoFoundConfigs` from full scan result minus the active project

### `src/watchers/configWatcher.ts`
- Added re-scan + `rebuildProjectList` in the debounced handler, BEFORE the single `getUrisOfWkspFoldersWithFeatures(true)` call
- Detects active project changes after rebuild; shows D-01 notification when fallback fires
- Restructured handler so discovery refresh happens once (after project list update), not twice

## Key Decisions
- Single `getUrisOfWkspFoldersWithFeatures(true)` call in configWatcher — project list rebuild happens first, then discovery refreshes with active project data
- Root config detection duplicated in extension.ts and configWatcher.ts (same CONFIG_PRIORITY pattern) — acceptable for handler isolation

## Verification
- ESLint: Clean across all src files
- Unit tests: 634 passing (0 failing), including all 14 ProjectList tests from Plan 01
- configWatcher debounce tests pass (single discovery call assertion satisfied)

## Commits
- `0318f41` feat(12-02): wire project list into extension activation and scan completion
- `4b9aa3f` feat(12-02): wire discovery cache and config watcher to use active project
