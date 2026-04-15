---
phase: 02-integration
verified: 2026-04-15T00:00:00Z
status: human_needed
score: 11/12
overrides_applied: 0
human_verification:
  - test: "Open a folder that contains behave.ini (and has no .feature files and no settings.json). Confirm the extension activates and tests appear in Test Explorer."
    expected: "Extension activates, runs hasFeaturesFolder() via config-file discovery branch, and displays test items in Test Explorer based on the path resolved from behave.ini."
    why_human: "VS Code activation events and Test Explorer rendering require a running VS Code instance. Cannot verify programmatically without spawning a full integration test session."
---

# Phase 2: Integration — Verification Report

**Phase Goal:** Discovery results from config parsers drive WorkspaceSettings so the extension activates on behave projects with no settings.json
**Verified:** 2026-04-15
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | When explicit projectPath or featuresPath is set at any VS Code scope, config-file discovery is bypassed and existing behavior is preserved | VERIFIED | `hasFeaturesFolder()` Branch A checks `hasExplicitSetting()` for both keys before any config-file call; branch returns early without touching `findBehaveConfig()` |
| 2 | When no explicit settings exist and a valid behave config file is found, its resolved path drives the extension | VERIFIED | Branch B calls `findBehaveConfig()`, checks `result.ok`, and stores `source: "config-file"` + `featuresUri: configResult.resolvedPath` in `discoveryCache` |
| 3 | When no explicit settings exist and no config file is found, the features/ convention fallback runs | VERIFIED | Branch B fallthrough checks `fs.existsSync(conventionFeaturesUri.fsPath)` and stores `source: "convention"` in cache |
| 4 | When a malformed config file is found, the error is captured in the discovery cache and features/ convention is attempted | VERIFIED | `ok:false` branch stores `configError` partial entry then falls through to convention check; `searchConfigFiles()` captures first error and keeps searching for valid config |
| 5 | Discovery cache returns in < 1ms on subsequent calls (forceRefresh=false) | VERIFIED | `getUrisOfWkspFoldersWithFeatures(false)` returns immediately when `workspaceFoldersWithFeatures` is truthy (no Map lookup, no FS access) |
| 6 | WorkspaceSettings exposes discoverySource and configFileUri properties reflecting how the path was resolved | VERIFIED | `src/settings.ts` lines 82-101: `public readonly discoverySource: DiscoverySource` and `public readonly configFileUri: vscode.Uri | undefined` populated from `getDiscoveryEntry(wkspUri)` |
| 7 | Cache is cleared when forceRefresh=true (settings change or workspace folder change) | VERIFIED | `getUrisOfWkspFoldersWithFeatures()` lines 174-175: `workspaceFoldersWithFeatures = []` and `discoveryCache.clear()` execute atomically before re-populating; triggered on both `onDidChangeConfiguration` and `onDidChangeWorkspaceFolders` via `configurationChangedHandler` |
| 8 | hasExplicitSetting() checks all 3 VS Code scopes (globalValue, workspaceValue, workspaceFolderValue) plus legacy config | VERIFIED | `src/common.ts` lines 147-154: checks `insp.globalValue`, `insp.workspaceValue`, `insp.workspaceFolderValue`, then `legacyConfig.inspect()?.workspaceFolderValue`; 11-test suite in `discoverySource.test.ts` covers all cases |
| 9 | findBehaveConfig() returns ok:true for valid configs and ok:false for malformed configs | VERIFIED | `BehaveConfigResult` discriminated union in `configParser.ts`; `buildResult()` returns `ok: true`; `parseTomlConfig()` catch block returns `{ ok: false, configFileUri, errorMessage }` |
| 10 | Extension activates on workspaces containing behave.ini or .behaverc even without .feature files | VERIFIED | `package.json` activationEvents: `["workspaceContains:**/*.feature", "workspaceContains:**/behave.ini", "workspaceContains:**/.behaverc"]` (3 entries confirmed) |
| 11 | All 511 unit tests pass with zero regressions | VERIFIED | `npm run test:unit` exits 0 with 511 passing, 0 failing (500 pre-phase-2 + 11 new `hasExplicitSetting` tests) |
| 12 | Opening a folder with behave.ini and no settings.json causes tests to appear in Test Explorer | ? HUMAN NEEDED | Cannot verify without running VS Code instance; all code paths enabling this are wired, but end-to-end activation requires human testing |

**Score:** 11/12 truths verified (1 requires human)

---

### Required Artifacts

**Plan 02-01 Artifacts:**

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/parsers/configParser.ts` | BehaveConfigResult discriminated union with ok:true/ok:false branches | VERIFIED | Contains `export type BehaveConfigResult =`, `\| { ok: true;`, `\| { ok: false;`, `ok: true` in buildResult, error variant in parseTomlConfig catch |
| `test/unit/parsers/configParser.test.ts` | Updated tests with ok guards and error variant suite | VERIFIED | Contains `assert.strictEqual(result.ok, true` in all success-path tests; `findBehaveConfig - error variant (D-05)` suite with 3 tests |
| `test/unit/parsers/fixtures/config/malformed-toml/pyproject.toml` | Fixture with invalid TOML syntax | VERIFIED | File exists; content has unclosed array `paths = [` then `"features"` without closing `]` — smol-toml throws on parse |
| `package.json` | Expanded activationEvents with behave.ini and .behaverc | VERIFIED | 3 entries: `.feature`, `behave.ini`, `.behaverc` |

**Plan 02-02 Artifacts:**

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/common.ts` | hasExplicitSetting(), discoveryCache, getDiscoveryEntry(), restructured hasFeaturesFolder() | VERIFIED | All four exports present; three-branch hasFeaturesFolder() at lines 177-292 |
| `src/common.ts` | DiscoverySource type and DiscoveryEntry interface | VERIFIED | Lines 30-40: `export type DiscoverySource = "settings" \| "config-file" \| "convention"` and `export interface DiscoveryEntry` |
| `src/settings.ts` | discoverySource and configFileUri properties on WorkspaceSettings | VERIFIED | Lines 82-83 declare both `public readonly` properties; lines 99-101 populate from cache |
| `test/unit/settings/discoverySource.test.ts` | Unit tests for hasExplicitSetting across all 3 scopes + legacy | VERIFIED | 11 tests covering: no-value (2), globalValue (1), workspaceValue (1), workspaceFolderValue (1), projectPath (2), legacy (2), edge cases (2) |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `test/unit/parsers/configParser.test.ts` | `src/parsers/configParser.ts` | `import { findBehaveConfig }` | WIRED | Pattern confirmed by gsd-tools + direct read |
| `src/parsers/configParser.ts` | `smol-toml` | catch block returns ok:false on parse error | WIRED | Pattern confirmed by gsd-tools; catch at line 134 |
| `src/common.ts` | `src/parsers/configParser.ts` | `import { findBehaveConfig }` | WIRED | Line 11 of common.ts; confirmed by gsd-tools |
| `src/settings.ts` | `src/common.ts` | `import { DiscoverySource, getDiscoveryEntry }` | WIRED | Lines 6-7 of settings.ts; confirmed by gsd-tools |
| `src/common.ts hasFeaturesFolder()` | `discoveryCache` | `discoveryCache.set(uriId(folder.uri), ...)` | WIRED | 5 call sites at lines 225, 231, 257, 268, 283 |
| `src/common.ts getUrisOfWkspFoldersWithFeatures()` | `discoveryCache` | `discoveryCache.clear()` on forceRefresh | WIRED | Line 175, atomically paired with `workspaceFoldersWithFeatures = []` at line 174 |

Note: gsd-tools reported 2 key-links as "Source file not found" for links whose `from` field contained function names rather than file paths. Both were manually verified in source.

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `src/settings.ts WorkspaceSettings` | `discoverySource`, `configFileUri` | `getDiscoveryEntry(wkspUri)` → `discoveryCache` → `hasFeaturesFolder()` → `findBehaveConfig()` | Yes — populated by real FS reads in `configParser.ts` | FLOWING |
| `src/common.ts hasFeaturesFolder()` | `configResult` | `findBehaveConfig(folder.uri)` → `fs.readFileSync` | Yes — reads actual workspace config files | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Unit test suite passes (511 tests) | `npm run test:unit` | 511 passing, 0 failing | PASS |
| activationEvents has 3 entries | `node -e "require('C:/code/gs-behave-bdd/package.json').activationEvents"` | `["workspaceContains:**/*.feature","workspaceContains:**/behave.ini","workspaceContains:**/.behaverc"]` | PASS |
| ESLint clean | `npx eslint src --ext ts` | Exit 0, no output | PASS |
| Extension activates on behave.ini workspace with no .feature files | Requires running VS Code | N/A | SKIP — human needed |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| INTG-01 | 02-02 | Discovery priority: settings > config file > features/ convention | SATISFIED | Three-branch `hasFeaturesFolder()` in common.ts: Branch A (explicit settings), Branch B (config-file), Branch B fallthrough (convention) |
| INTG-02 | 02-02 | Explicit settings detected via inspect() checking all 3 scopes | SATISFIED | `hasExplicitSetting()` checks globalValue, workspaceValue, workspaceFolderValue + legacyConfig.workspaceFolderValue; 11-test suite verifies all paths |
| INTG-03 | 02-02 | Discovery results cached in module-level Map; gatekeeper reads cache only (< 1ms) | SATISFIED | `discoveryCache: Map<string, DiscoveryEntry>` at module level; `getUrisOfWkspFoldersWithFeatures(false)` short-circuits before any Map/FS access |
| INTG-04 | 02-02 | Cache populated during activation; invalidated by workspace folder changes and settings changes | SATISFIED | Cache cleared via `discoveryCache.clear()` in forceRefresh block; called by `configurationChangedHandler` on both `onDidChangeConfiguration` and `onDidChangeWorkspaceFolders` |
| INTG-05 | 02-01 | Activation events expanded to behave.ini and .behaverc | SATISFIED | package.json activationEvents has 3 entries including both |
| INTG-06 | 02-02 | WorkspaceSettings gains discoverySource and configFileUri properties | SATISFIED | Both properties declared and populated in settings.ts; logged via logSettings() |
| INTG-07 | 02-02 | Existing users with explicit projectPath/featuresPath see zero behavior change | SATISFIED | Branch A runs existing settings-based logic verbatim when either setting is explicit; no path changes for those users |

All 7 required requirements (INTG-01 through INTG-07) are SATISFIED.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/common.ts` | 274 | `featuresUri: vscode.Uri.joinPath(folder.uri, "features"), // placeholder, overwritten below if convention succeeds` | Info | Intentional — this is a temporary value in the `ok:false` cache entry for the malformed-config error path; it is overwritten if the convention fallback succeeds, and is never surfaced to users as an actual path. Documented in 02-02-SUMMARY.md under Known Stubs. Not a stub. |

No blockers. No warnings.

---

### Human Verification Required

#### 1. End-to-End Activation via behave.ini (ROADMAP SC-1)

**Test:** Create a fresh folder with only a `behave.ini` (containing `[behave]\npaths = features`) and a `features/` directory with one `.feature` file. Open this folder in VS Code with no `.vscode/settings.json`. Wait for extension to activate.

**Expected:** The Behave BDD extension activates (visible in the Test Explorer sidebar and Output panel "Behave BDD" channel). Test items appear in Test Explorer corresponding to scenarios in the feature file.

**Why human:** VS Code's activation event system, Test Controller registration, and Test Explorer rendering all require a live VS Code process. No programmatic equivalent exists in unit/spot-check scope. The code paths are fully wired (activationEvents include `behave.ini`, `hasFeaturesFolder()` Branch B handles config-file discovery, `WorkspaceSettings` reads the cache) but the integration can only be confirmed by observing the actual extension host behavior.

---

### Gaps Summary

No gaps. All automated checks passed. One item (ROADMAP SC-1: end-to-end activation in a live VS Code session) requires human verification — it is not a code gap but an integration validation that cannot be performed programmatically.

---

_Verified: 2026-04-15_
_Verifier: Claude (gsd-verifier)_
