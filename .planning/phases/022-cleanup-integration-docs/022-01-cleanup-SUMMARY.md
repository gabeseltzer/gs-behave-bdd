---
phase: 022-cleanup-integration-docs
plan: "01"
subsystem: settings
tags: [cleanup, legacy-removal, refactor]
dependency_graph:
  requires: []
  provides: [canonical-only-settings-read]
  affects: [src/settings.ts, src/configuration.ts, src/common.ts, src/discovery/projectList.ts]
tech_stack:
  added: []
  patterns: [canonical-config-only, simplified-constructor]
key_files:
  created: []
  modified:
    - src/common.ts
    - src/discovery/projectList.ts
    - src/settings.ts
    - src/configuration.ts
    - test/unit/settings/verboseLogging.test.ts
    - test/unit/settings/projectUriDerivation.test.ts
    - test/unit/settings/discoveryPriority.test.ts
    - test/unit/settings/discoverySource.test.ts
  deleted:
    - test/unit/settings/legacyFallback.test.ts
decisions:
  - "Deleted legacyFallback.test.ts entirely — every test in it exercised deleted production code (getWithLegacyFallback / 2-arg WindowSettings / 3-arg getActualWorkspaceSetting)"
  - "Removed 2 legacy-fallback suites from discoveryPriority.test.ts and discoverySource.test.ts — these tested the removed 3rd arg of hasExplicitSetting"
  - "Removed 2 legacy verboseLogging tests that used 2-arg WindowSettings constructor"
metrics:
  duration: ~8 minutes
  completed: "2026-05-11"
  tasks_completed: 3
  files_modified: 8
  files_deleted: 1
---

# Phase 22 Plan 01: behave-vsc Silent Read Cleanup Summary

Stripped every silent `behave-vsc.*` namespace read from the runtime path — deleted `getWithLegacyFallback<T>()`, collapsed both Settings constructors to canonical-config-only, and trimmed all 4 legacy parameter call sites in production code plus all test fixtures.

## What Was Done

### Task 1 — src/common.ts + src/discovery/projectList.ts (commit `043b352`)

**Lines removed: 13**

- `getActualWorkspaceSetting`: dropped `legacyConfig?` parameter and the `if (legacyConfig) return legacyConfig.inspect(name)?.workspaceFolderValue as T;` branch
- `hasExplicitSetting`: dropped `legacyConfig?` parameter and the entire `if (legacyConfig) { … }` block (4 lines)
- `hasFeaturesFolder`: deleted `const legacyWkspConfig = vscode.workspace.getConfiguration("behave-vsc", folder.uri);`; trimmed 2 call sites
- `isManualProjectPathMode`: deleted `const legacyConfig = vscode.workspace.getConfiguration("behave-vsc", wkspUri);`; trimmed call site

### Task 2 — src/settings.ts + src/configuration.ts (commit `f68fbbd`)

**Lines removed: 33 (settings.ts: 24, configuration.ts: 9)**

- Deleted `getWithLegacyFallback<T>()` function + comment block (17 lines)
- `WindowSettings` constructor: `(winConfig, legacyConfig?)` → `(winConfig)`; lambda simplified
- `WorkspaceSettings` constructor: `(wkspUri, wkspConfig, winSettings, logger, legacyConfig?, discoveryEntry?)` → `(wkspUri, wkspConfig, winSettings, logger, discoveryEntry?)`; lambda simplified; `hasExplicitSetting` call trimmed
- `configuration.ts` reloadSettings: removed 2 `legacyWin/WkspConfig` locals; trimmed `WindowSettings` and `WorkspaceSettings` calls
- `configuration.ts` globalSettings getter: dropped `vscode.workspace.getConfiguration("behave-vsc")` second arg
- `configuration.ts` workspaceSettings getter: dropped `vscode.workspace.getConfiguration("behave-vsc", wkspUri)` trailing arg

### Task 3 — Unit test fixtures (commit `19092a8`)

**Lines removed: 176, file deleted: 1**

- `legacyFallback.test.ts`: deleted entirely (7 tests, all testing removed production code)
- `verboseLogging.test.ts`: removed 2 tests using 2-arg `WindowSettings`
- `projectUriDerivation.test.ts`: dropped `undefined` 5th arg from 4 `WorkspaceSettings` call sites
- `discoveryPriority.test.ts`: removed 'legacy config fallback' suite (2 tests, 3-arg `hasExplicitSetting`)
- `discoverySource.test.ts`: removed 'legacyConfig fallback' suite (2 tests, 3-arg `hasExplicitSetting`)

**Note:** The plan listed 3 test files to modify; 2 additional files (`discoveryPriority.test.ts`, `discoverySource.test.ts`) were discovered via `tsc --noEmit` compilation errors and fixed per Rule 3.

## Test Count

| Baseline | After cleanup | Delta |
|----------|---------------|-------|
| 849      | 836           | -13   |

13 tests deleted (all tested removed legacy-fallback production code). 836 > 800 minimum threshold.

## Verification

- `grep -rn "getWithLegacyFallback" src/` → 0 matches
- `grep -rn "legacyConfig" src/` → 0 matches
- `grep -rn 'getConfiguration("behave-vsc"' src/` → 0 matches (the extension.ts legacy command aliases use different patterns and were not touched)
- `npx tsc --noEmit` → clean (0 errors in src/)
- `npx eslint src --ext ts` → clean
- `npm run test:unit` → 836 passing, 0 failing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Two additional test files had legacy 3-arg `hasExplicitSetting` calls**
- **Found during:** Task 3 compilation step
- **Issue:** `test/unit/settings/discoveryPriority.test.ts` (lines 111, 117) and `test/unit/settings/discoverySource.test.ts` (lines 122, 128) both had suite blocks calling `hasExplicitSetting(cfg, 'projectPath', legacyCfg)` — the 3-arg form that no longer exists
- **Fix:** Deleted both 'legacy config fallback' suites (2 tests each) — tests for removed production code
- **Files modified:** `test/unit/settings/discoveryPriority.test.ts`, `test/unit/settings/discoverySource.test.ts`
- **Commit:** `19092a8`

## Known Stubs

None.

## Threat Flags

None — this plan only removes dead code branches; no new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Self-Check: PASSED

- src/common.ts: no `legacyConfig`, no `legacyWkspConfig`, no `behave-vsc` getConfiguration
- src/discovery/projectList.ts: no `legacyConfig`, no `behave-vsc` getConfiguration
- src/settings.ts: no `getWithLegacyFallback`, no `legacyConfig`
- src/configuration.ts: no `behave-vsc` getConfiguration, no `legacyWinConfig`/`legacyWkspConfig`
- Commits present: `043b352`, `f68fbbd`, `19092a8`
- 836 unit tests passing
