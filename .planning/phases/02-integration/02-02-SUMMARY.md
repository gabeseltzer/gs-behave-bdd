---
phase: 02-integration
plan: "02"
subsystem: gatekeeper-discovery
tags: [discovery, settings, cache, unit-tests]
dependency_graph:
  requires: [02-01]
  provides: [common.ts-discovery-cache, settings.ts-discoverySource, hasExplicitSetting]
  affects: [src/common.ts, src/settings.ts, test/unit/settings/discoverySource.test.ts]
tech_stack:
  added: []
  patterns: [discriminated-union-result, module-level-cache, inspect-scope-detection]
key_files:
  created:
    - test/unit/settings/discoverySource.test.ts
  modified:
    - src/common.ts
    - src/settings.ts
decisions:
  - "discoveryCache cleared in same forceRefresh block as workspaceFoldersWithFeatures (atomically paired)"
  - "hasExplicitSetting checks all 3 VS Code scopes (global, workspace, workspaceFolder) plus legacyConfig.workspaceFolderValue"
  - "discoveryEntry param is last and optional on WorkspaceSettings constructor — all existing callers unaffected"
  - "configFileUri excluded from nonUserSettableWkspSettings to prevent garbled vscode.Uri JSON serialization"
metrics:
  duration: "5 minutes"
  completed: "2026-04-15"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 2
  files_created: 1
---

# Phase 2 Plan 02: Discovery Integration (gatekeeper + WorkspaceSettings) Summary

**One-liner:** Three-branch priority chain (settings > config-file > convention) wired into the gatekeeper with a module-level discovery cache and WorkspaceSettings metadata properties.

## What Was Built

### Task 1: common.ts — discovery types, cache, hasExplicitSetting, hasFeaturesFolder restructure

- Added `DiscoverySource` type and `DiscoveryEntry` interface to `src/common.ts`
- Added module-level `discoveryCache: Map<string, DiscoveryEntry>` and exported `getDiscoveryEntry()` getter
- Added `hasExplicitSetting()` helper that checks all three VS Code config scopes (globalValue, workspaceValue, workspaceFolderValue) plus legacy config workspaceFolderValue
- Restructured `hasFeaturesFolder()` into three-branch priority chain:
  - **Branch A (explicit settings):** existing behavior preserved verbatim — now stores `DiscoveryEntry` with `source: "settings"` before returning `true`
  - **Branch B (config-file):** calls `findBehaveConfig(folder.uri)` from Phase 1; on success stores `source: "config-file"` entry; on `ok:false` stores partial entry with `configError`
  - **Branch B fallthrough (convention):** `features/` directory check; preserves any `configError` from above via object spread
- `discoveryCache.clear()` added in the same `forceRefresh` reset block as `workspaceFoldersWithFeatures = []` (atomically paired per INTG-04)
- Updated error message to mention behave config files (D-04)
- Added `import { findBehaveConfig } from './parsers/configParser'`

**Commit:** `d04313f`

### Task 2: settings.ts — WorkspaceSettings enrichment

- Added import of `DiscoverySource`, `DiscoveryEntry`, `getDiscoveryEntry` from `./common`
- Added `public readonly discoverySource: DiscoverySource` and `public readonly configFileUri: vscode.Uri | undefined` properties
- Added optional trailing `discoveryEntry?: DiscoveryEntry` parameter to constructor (all existing callers unaffected)
- Constructor body reads from passed-in entry or falls back to cache via `getDiscoveryEntry(wkspUri)`; defaults to `"convention"` if no entry found
- Added `"configFileUri"` to `nonUserSettableWkspSettings` exclusion list (prevents garbled `{}` JSON output)
- `logSettings()` now logs `discoverySource` and `configFileUri` (as fsPath string) in workspace settings output

**Commit:** `64c87ca`

### Task 3: test/unit/settings/discoverySource.test.ts — unit tests for hasExplicitSetting

- Created new test file with 11 tests covering `hasExplicitSetting()` across all VS Code scopes
- Tests: no-value cases (2), globalValue (1), workspaceValue (1), workspaceFolderValue (1), projectPath key (2), legacy config fallback (2), edge cases (2)
- Follows exact same structure as `legacyFallback.test.ts` analog — `makeConfig`, `makeGlobalConfig`, `makeWkspFolderConfig` helpers
- All 511 tests pass (500 prior + 11 new)

**Commit:** `9e23ad8`

## Verification

- `npx eslint src --ext ts` exits 0 (no output)
- `npm run test:unit` exits 0: 511 passing
- `src/common.ts` exports `DiscoverySource`, `DiscoveryEntry`, `getDiscoveryEntry`, `hasExplicitSetting`
- `src/settings.ts` `WorkspaceSettings` has `discoverySource` and `configFileUri` properties
- `discoveryCache.clear()` is in the same block as `workspaceFoldersWithFeatures = []`
- `hasFeaturesFolder` has three branches: explicit settings (Branch A), config-file (Branch B), convention (Branch B fallthrough)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — the "placeholder" comment at `src/common.ts:274` (`featuresUri: vscode.Uri.joinPath(folder.uri, "features")`) is intentional design: it stores a temporary value in the cache for a malformed-config error path that is overwritten if the convention fallback succeeds, and is never surfaced to users as a path (it represents an error state).

## Threat Flags

No new threat surface introduced beyond what is documented in the plan's threat model (T-02-04 through T-02-07).

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| src/common.ts exists | FOUND |
| src/settings.ts exists | FOUND |
| test/unit/settings/discoverySource.test.ts exists | FOUND |
| 02-02-SUMMARY.md exists | FOUND |
| commit d04313f (Task 1) | FOUND |
| commit 64c87ca (Task 2) | FOUND |
| commit 9e23ad8 (Task 3) | FOUND |
