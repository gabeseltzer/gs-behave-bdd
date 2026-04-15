# Phase 2: Integration - Pattern Map

**Mapped:** 2026-04-15
**Files analyzed:** 6 files (4 modified source + 1 new test + 1 updated test)
**Analogs found:** 6 / 6

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/common.ts` | utility / gatekeeper | request-response | `src/common.ts` (self — existing patterns extended) | exact |
| `src/settings.ts` | model / config | request-response | `src/settings.ts` (self — existing `WorkspaceSettings` enriched) | exact |
| `src/parsers/configParser.ts` | parser | file-I/O + transform | `src/parsers/configParser.ts` Phase 1 (self — type extended) | exact |
| `package.json` | config | — | `package.json` (self — array append) | exact |
| `test/unit/settings/discoverySource.test.ts` | test | request-response | `test/unit/settings/legacyFallback.test.ts` | exact |
| `test/unit/parsers/configParser.test.ts` | test | request-response | `test/unit/parsers/configParser.test.ts` Phase 1 (self — extended) | exact |

---

## Pattern Assignments

### `src/common.ts` (utility / gatekeeper — new helper + cache + priority chain)

**Analog:** `src/common.ts` (self, lines 116-224)

**Imports — no new imports needed** (lines 1-11):
```typescript
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { customAlphabet } from 'nanoid';
import { config } from "./configuration";
import { Scenario, TestData } from './parsers/testFile';
import { WorkspaceSettings } from './settings';
import { diagLog } from './logger';
import { getJunitDirUri } from './watchers/junitWatcher';
```

Add import of `findBehaveConfig` and its types from configParser:
```typescript
import { findBehaveConfig, BehaveConfigResult } from './parsers/configParser';
```

**New exported types — place after line 25 (after `sepr` constants)**:
```typescript
// Add alongside existing module-level constants in common.ts (after line 25)
export type DiscoverySource = "settings" | "config-file" | "convention";

export interface DiscoveryEntry {
  source: DiscoverySource;
  configFileUri?: vscode.Uri;      // set when source = "config-file"
  configError?: {                  // set when malformed config found (D-05)
    configFileUri: vscode.Uri;
    errorMessage: string;
  };
  featuresUri: vscode.Uri;
}
```

**New module-level cache — place immediately after `workspaceFoldersWithFeatures` declaration** (line 128):
```typescript
// Existing (line 128):
let workspaceFoldersWithFeatures: vscode.Uri[];

// NEW: add on next line
const discoveryCache = new Map<string, DiscoveryEntry>();

// Export getter so WorkspaceSettings can read it without coupling to the Map directly
export function getDiscoveryEntry(wkspUri: vscode.Uri): DiscoveryEntry | undefined {
  return discoveryCache.get(uriId(wkspUri));
}
```

**Cache-clear pattern — copy from existing `forceRefresh` block** (lines 129-135):
```typescript
// EXISTING cache-check early return (lines 129-135) — add discoveryCache.clear() alongside:
export const getUrisOfWkspFoldersWithFeatures = (forceRefresh = false): vscode.Uri[] => {
  if (!forceRefresh && workspaceFoldersWithFeatures)
    return workspaceFoldersWithFeatures;

  const start = performance.now();
  workspaceFoldersWithFeatures = [];
  discoveryCache.clear();           // NEW: clear alongside workspaceFoldersWithFeatures reset

  // ... (rest unchanged until hasFeaturesFolder)
```

**New `hasExplicitSetting` helper — place near `getActualWorkspaceSetting` (after line 123)**:

Copy the `inspect()` pattern from `getWithLegacyFallback` in `src/settings.ts` lines 18-23:
```typescript
// src/settings.ts lines 18-23 — the reference inspect() pattern:
const insp = newConfig.inspect<T>(key);
const isExplicit = insp !== undefined && (
  insp.globalValue !== undefined ||
  insp.workspaceValue !== undefined ||
  insp.workspaceFolderValue !== undefined
);
```

New helper in `src/common.ts` (after `getActualWorkspaceSetting`, line 123):
```typescript
// Returns true if the named setting has been explicitly set at ANY VS Code scope
// (global, workspace, or workspace folder). Used by hasFeaturesFolder() to implement D-01/D-02.
export function hasExplicitSetting(
  wkspConfig: vscode.WorkspaceConfiguration,
  name: string,
  legacyConfig?: vscode.WorkspaceConfiguration
): boolean {
  const insp = wkspConfig.inspect(name);
  if (insp && (insp.globalValue !== undefined || insp.workspaceValue !== undefined || insp.workspaceFolderValue !== undefined))
    return true;
  if (legacyConfig) {
    const legacyInsp = legacyConfig.inspect(name);
    if (legacyInsp?.workspaceFolderValue !== undefined) return true;
  }
  return false;
}
```

**Restructured `hasFeaturesFolder` priority chain** — replaces lines 137-198.

Copy the structural shell from the existing `hasFeaturesFolder` (lines 137-198) and wrap it:
```typescript
function hasFeaturesFolder(folder: vscode.WorkspaceFolder): boolean {
  const wkspConfig = vscode.workspace.getConfiguration("gs-behave-bdd", folder.uri);
  const legacyWkspConfig = vscode.workspace.getConfiguration("behave-vsc", folder.uri);

  // BRANCH A: explicit settings — run existing path unchanged (D-02, INTG-07)
  if (hasExplicitSetting(wkspConfig, "projectPath", legacyWkspConfig) ||
      hasExplicitSetting(wkspConfig, "featuresPath", legacyWkspConfig)) {
    // [paste existing lines 143-197 verbatim here]
    // After resolving featuresUri (just before returning true), store discovery entry:
    discoveryCache.set(uriId(folder.uri), {
      source: "settings",
      featuresUri: /* the resolved featuresUri */,
    });
    return true / false; // as existing logic returns
  }

  // BRANCH B: no explicit settings — config-file discovery (INTG-01)
  const configResult = findBehaveConfig(folder.uri);

  if (configResult) {
    if (configResult.ok) {
      // Success: use config file's resolved path
      const featuresUri = configResult.resolvedPath;
      if (!fs.existsSync(featuresUri.fsPath)) {
        // Config file points to nonexistent path — fall through to convention
      } else {
        discoveryCache.set(uriId(folder.uri), {
          source: "config-file",
          configFileUri: configResult.configFileUri,
          featuresUri,
        });
        return true;
      }
    } else {
      // ok:false — malformed config; capture error, fall through to convention (D-06)
      discoveryCache.set(uriId(folder.uri), {
        source: "convention",   // will be overwritten if convention succeeds
        configError: {
          configFileUri: configResult.configFileUri,
          errorMessage: configResult.errorMessage,
        },
        featuresUri: vscode.Uri.joinPath(folder.uri, "features"), // placeholder
      });
    }
  }

  // BRANCH B fallthrough: features/ convention (INTG-01 last resort)
  const featuresUri = vscode.Uri.joinPath(folder.uri, "features");
  if (fs.existsSync(featuresUri.fsPath)) {
    const existing = discoveryCache.get(uriId(folder.uri));
    discoveryCache.set(uriId(folder.uri), {
      ...existing,              // preserves configError if set
      source: "convention",
      featuresUri,
    });
    return true;
  }

  return false;
}
```

**Updated error message — replace lines 219-221**:

Existing error message (line 219-221):
```typescript
throw `Extension was activated because a '*.feature' file was found in a workspace folder, but ` +
  `none of the workspace folders contain either a root 'features' folder or a settings.json that specifies a valid 'gs-behave-bdd.featuresPath'.\n` +
  `Please add a valid 'gs-behave-bdd.featuresPath' property to your workspace settings.json file and then restart vscode.`;
```

Updated message (D-04):
```typescript
throw `Extension was activated but none of the workspace folders contain a root 'features' folder, ` +
  `a behave config file (behave.ini, .behaverc, setup.cfg, tox.ini, pyproject.toml) with a [behave] paths setting, ` +
  `or a settings.json that specifies a valid 'gs-behave-bdd.featuresPath'.\n` +
  `Please add a valid 'gs-behave-bdd.featuresPath' property to your workspace settings.json file and then restart vscode.`;
```

---

### `src/settings.ts` (model — `WorkspaceSettings` enrichment)

**Analog:** `src/settings.ts` (self, lines 58-289)

**New public readonly properties — add after line 80** (after `workspaceRelativeFeaturesPath`):

Copy the pattern from existing readonly properties (lines 63-80):
```typescript
// Existing pattern (lines 63-80):
public readonly envVarOverrides: { [name: string]: string } = {};
public readonly featuresUri: vscode.Uri;
public readonly workspaceRelativeFeaturesPath: string;
```

New properties (add in the "convenience properties" block, lines 73-79):
```typescript
// Discovery metadata (Phase 2)
public readonly discoverySource: DiscoverySource;
public readonly configFileUri: vscode.Uri | undefined;
```

Add import for `DiscoverySource` and `getDiscoveryEntry` from `'./common'` — add to the existing import (line 4-6):
```typescript
import {
  findHighestTargetParentDirectorySync, findSubdirectorySync, getUrisOfWkspFoldersWithFeatures,
  getWorkspaceFolder, uriId, WkspError,
  DiscoverySource, getDiscoveryEntry,   // NEW
} from './common';
```

**Constructor signature — add optional trailing `discoveryEntry` parameter** (line 85):

Copy the pattern of existing optional trailing parameter convention (CLAUDE.md "Optional parameters come last"):
```typescript
// Existing constructor signature (line 85):
constructor(wkspUri: vscode.Uri, wkspConfig: vscode.WorkspaceConfiguration, winSettings: WindowSettings, logger: Logger, legacyConfig?: vscode.WorkspaceConfiguration)

// New signature (add ONE optional param at end):
constructor(
  wkspUri: vscode.Uri,
  wkspConfig: vscode.WorkspaceConfiguration,
  winSettings: WindowSettings,
  logger: Logger,
  legacyConfig?: vscode.WorkspaceConfiguration,
  discoveryEntry?: DiscoveryEntry    // NEW — optional trailing param
)
```

**Constructor body — set new properties** (add after `this.id = uriId(wkspUri)` at line 90):
```typescript
// Copy the assignment pattern from existing properties (lines 89-92):
this.uri = wkspUri;
this.id = uriId(wkspUri);
const wsFolder = getWorkspaceFolder(wkspUri);
this.name = wsFolder.name;

// NEW: set discovery metadata from passed-in entry OR read from cache
const entry = discoveryEntry ?? getDiscoveryEntry(wkspUri);
this.discoverySource = entry?.source ?? "convention";
this.configFileUri = entry?.configFileUri;
```

**`logSettings()` exclusion — update `nonUserSettableWkspSettings` array** (line 252):

Copy the existing exclusion list pattern (line 252):
```typescript
// Existing (line 252):
const nonUserSettableWkspSettings = ["name", "uri", "id", "projectUri", "featuresUri", "stepsSearchUri", "workspaceRelativeFeaturesPath"];

// Updated (add "configFileUri" to exclude URI object from JSON.stringify):
const nonUserSettableWkspSettings = ["name", "uri", "id", "projectUri", "featuresUri", "stepsSearchUri", "workspaceRelativeFeaturesPath", "configFileUri"];
```

Then log `configFileUri` and `discoverySource` separately after the existing `wkspEntries` block:
```typescript
// Add after wkspEntries.push(["featuresPath", ...]) block (around line 261):
wkspEntries.push(["discoverySource", this.discoverySource]);
wkspEntries.push(["configFileUri", this.configFileUri?.fsPath ?? "(none)"]);
```

---

### `src/parsers/configParser.ts` (parser — error variant, D-05)

**Analog:** `src/parsers/configParser.ts` Phase 1 (self — extend the existing return type)

**Updated `BehaveConfigResult` type — replace `interface` with discriminated union** (lines 12-17):

Existing (lines 12-17):
```typescript
export interface BehaveConfigResult {
  configFileUri: vscode.Uri;
  format: 'ini' | 'toml';
  rawPaths: string[];
  resolvedPath: vscode.Uri;
}
```

Replace with discriminated union (D-05):
```typescript
// Discriminated union: ok:true = success, ok:false = config found but malformed
export type BehaveConfigResult =
  | { ok: true; configFileUri: vscode.Uri; format: 'ini' | 'toml'; rawPaths: string[]; resolvedPath: vscode.Uri }
  | { ok: false; configFileUri: vscode.Uri; errorMessage: string };

// findBehaveConfig return signature:
// undefined = no config file found at all (not an error)
// { ok: false } = config file found but malformed (D-05)
// { ok: true } = success
```

**Updated `buildResult` — add `ok: true`** (lines 167-178):

Copy the existing `buildResult` function (lines 167-178) and add `ok: true`:
```typescript
function buildResult(
  configFileUri: vscode.Uri,
  format: 'ini' | 'toml',
  rawPaths: string[]
): BehaveConfigResult {
  return {
    ok: true,   // NEW discriminant field
    configFileUri,
    format,
    rawPaths,
    resolvedPath: resolvePaths(rawPaths, configFileUri),
  };
}
```

**Updated `parseTomlConfig` — return error variant for malformed TOML** (lines 121-149):

Copy the existing `try/catch` pattern at lines 130-134:
```typescript
// Existing (lines 130-134) — silently returns undefined:
try {
  parsed = parseToml(content) as Record<string, unknown>;
} catch {
  return undefined; // malformed TOML — silently skip
}
```

Replace with error variant return (D-05):
```typescript
try {
  parsed = parseToml(content) as Record<string, unknown>;
} catch (e: unknown) {
  // Malformed TOML: config file found but invalid — return error variant (D-05)
  // Note: "no [tool.behave] section" still returns undefined (not an error — see Pitfall 3)
  return { ok: false, configFileUri: fileUri, errorMessage: e instanceof Error ? e.message : String(e) };
}
```

**Updated `parseIniConfig` — distinguish parse errors from "no [behave] section"** (lines 54-116):

The existing function returns `undefined` for both "no section" and "malformed". Under D-05:
- No `[behave]` section found (line 109): still returns `undefined` (not an error)
- Malformed INI where `[behave]` IS found but paths parse fails: return `{ ok: false, ... }`

Copy the try/catch file-read pattern (lines 56-60) — it stays as `undefined` (unreadable file):
```typescript
try {
  content = fs.readFileSync(fileUri.fsPath, 'utf8');
} catch {
  return undefined; // unreadable file — not a behave config error (silently skip)
}
```

The "no [behave] section" check (line 109) stays `undefined`:
```typescript
if (!inBehaveSection) return undefined; // DISC-06: valid INI, no [behave] section — not an error
```

---

### `package.json` (manifest — activation events)

**Analog:** `package.json` lines 273-275 (self — array append)

**Current** (lines 273-275):
```json
"activationEvents": [
  "workspaceContains:**/*.feature"
]
```

**New** (D-03):
```json
"activationEvents": [
  "workspaceContains:**/*.feature",
  "workspaceContains:**/behave.ini",
  "workspaceContains:**/.behaverc"
]
```

No TypeScript changes. This is a pure JSON edit — no compile step needed for this file alone.

---

### `test/unit/settings/discoverySource.test.ts` (NEW test — INTG-02, INTG-06)

**Analog:** `test/unit/settings/legacyFallback.test.ts` (exact role match — same framework, same `makeConfig` helper, same `suite`/`test`/`assert` structure)

**Imports pattern** (copy from `test/unit/settings/legacyFallback.test.ts` lines 1-7):
```typescript
import * as assert from 'assert';
import type * as vscode from 'vscode';
import { hasExplicitSetting } from '../../../src/common';
// WorkspaceSettings import only needed for INTG-06 property tests (may require more mocking)
```

**`makeConfig` helper** — copy verbatim from `test/unit/settings/legacyFallback.test.ts` lines 10-23:
```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeConfig(values: Record<string, unknown>, explicitKeys: string[] = []): any {
  return {
    get: (key: string) => values[key],
    has: () => false,
    inspect: (key: string) => ({
      key,
      defaultValue: undefined,
      globalValue: undefined,
      workspaceValue: explicitKeys.includes(key) ? values[key] : undefined,
      workspaceFolderValue: undefined,
    }),
    update: () => Promise.resolve(),
  };
}
```

To test globalValue and workspaceFolderValue scope variants, add scope-specific helpers by varying which field is populated — copy the `makeWkspConfig` variant from `test/unit/settings/legacyFallback.test.ts` lines 106-119:
```typescript
function makeWkspConfig(folderValues: Record<string, unknown>): any {
  return {
    get: (key: string) => folderValues[key],
    has: () => false,
    inspect: (key: string) => ({
      key,
      defaultValue: undefined,
      globalValue: undefined,
      workspaceValue: undefined,
      workspaceFolderValue: folderValues[key],
    }),
    update: () => Promise.resolve(),
  };
}
```

**Suite structure** (copy from `legacyFallback.test.ts` lines 27-102):
```typescript
suite('hasExplicitSetting', () => {

  suite('returns false when no scope has a value', () => {
    test('empty config — returns false', () => {
      const cfg = makeConfig({});
      assert.strictEqual(hasExplicitSetting(cfg, 'featuresPath'), false);
    });
  });

  suite('returns true when globalValue is set', () => {
    test('globalValue present — returns true', () => {
      // makeConfig with the key in globalValue slot (add globalValue variant helper)
      // ...
    });
  });

  suite('returns true when workspaceValue is set', () => {
    test('workspaceValue present — returns true', () => {
      const cfg = makeConfig({ featuresPath: 'my_tests' }, ['featuresPath']); // workspaceValue
      assert.strictEqual(hasExplicitSetting(cfg, 'featuresPath'), true);
    });
  });

  suite('returns true when workspaceFolderValue is set', () => {
    test('workspaceFolderValue present — returns true', () => {
      const cfg = makeWkspConfig({ featuresPath: 'my_tests' });
      assert.strictEqual(hasExplicitSetting(cfg, 'featuresPath'), true);
    });
  });

  suite('legacyConfig fallback', () => {
    test('no new config explicit + legacy workspaceFolderValue — returns true', () => {
      const newCfg = makeConfig({});
      const legacyCfg = makeWkspConfig({ projectPath: 'backend' });
      assert.strictEqual(hasExplicitSetting(newCfg, 'projectPath', legacyCfg), true);
    });

    test('inspect returns undefined (unregistered key) — returns false, not throw', () => {
      // Copy from legacyFallback.test.ts lines 88-98 — inspect: () => undefined edge case
      const newCfg: vscode.WorkspaceConfiguration = {
        get: () => undefined,
        has: () => false,
        inspect: (_key: string) => undefined,
        update: () => Promise.resolve(),
      };
      assert.strictEqual(hasExplicitSetting(newCfg, 'featuresPath'), false);
    });
  });

});
```

---

### `test/unit/parsers/configParser.test.ts` (UPDATED — extend for error variant)

**Analog:** `test/unit/parsers/configParser.test.ts` Phase 1 (self — extend existing file)

**Breaking change:** All existing assertions that access `result.format`, `result.rawPaths`, `result.resolvedPath`, `result.configFileUri` directly must add `result.ok === true` guard first.

Copy the existing assertion pattern (line 22-33) and update:
```typescript
// BEFORE (Phase 1 pattern — now broken by discriminated union):
const result = findBehaveConfig(wkspUri);
assert.ok(result, 'should return a result');
assert.strictEqual(result.format, 'ini');

// AFTER (Phase 2 — add ok guard):
const result = findBehaveConfig(wkspUri);
assert.ok(result, 'should return a result');
assert.ok(result.ok, 'should be ok:true');
assert.strictEqual(result.format, 'ini');
assert.deepStrictEqual(result.rawPaths, ['features']);
```

**New test suite for error variant** (add at end of file, after existing suites):

Copy the `suite`/`test` structure from existing suites (lines 14-168) and add:
```typescript
suite('findBehaveConfig - error variant (D-05)', () => {

  test('malformed TOML returns ok:false with errorMessage', () => {
    // Requires a new fixture: test/unit/parsers/fixtures/config/malformed-toml/pyproject.toml
    // with invalid TOML syntax (e.g. missing closing bracket)
    const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'malformed-toml'));
    const result = findBehaveConfig(wkspUri);
    assert.ok(result, 'should return a result (not undefined)');
    assert.strictEqual(result.ok, false, 'should be ok:false');
    // TypeScript narrows result to error branch after ok===false check
    if (!result.ok) {
      assert.ok(result.errorMessage.length > 0, 'errorMessage should be non-empty');
      assert.ok(
        result.configFileUri.fsPath.replace(/\\/g, '/').endsWith('malformed-toml/pyproject.toml'),
        'configFileUri should point to the malformed file'
      );
    }
  });

  test('INI without [behave] section still returns undefined (not ok:false)', () => {
    // Existing fixture: no-behave-section — must still return undefined, not { ok: false }
    const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'no-behave-section'));
    const result = findBehaveConfig(wkspUri);
    assert.strictEqual(result, undefined, 'no [behave] section is not an error — must be undefined');
  });

  test('TOML without [tool.behave] returns undefined (not ok:false)', () => {
    // Existing fixture: no-tool-behave — must still return undefined
    const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'no-tool-behave'));
    const result = findBehaveConfig(wkspUri);
    assert.strictEqual(result, undefined, 'no [tool.behave] section is not an error — must be undefined');
  });

});
```

**New fixture required:** `test/unit/parsers/fixtures/config/malformed-toml/pyproject.toml` — a `pyproject.toml` file with a `[tool.behave]` table present but invalid TOML syntax (so smol-toml throws on parse). Example:
```toml
[tool.behave]
paths = [
  "features"
  # missing closing bracket — smol-toml will throw
```

---

## Shared Patterns

### `inspect()` for Explicit-Setting Detection
**Source:** `src/settings.ts` lines 18-23 (`getWithLegacyFallback`)
**Apply to:** New `hasExplicitSetting()` in `src/common.ts`
```typescript
const insp = newConfig.inspect<T>(key);
const isExplicit = insp !== undefined && (
  insp.globalValue !== undefined ||
  insp.workspaceValue !== undefined ||
  insp.workspaceFolderValue !== undefined
);
```

### Module-Level Cache + `forceRefresh` Clear Pattern
**Source:** `src/common.ts` lines 128-135
**Apply to:** New `discoveryCache` in `src/common.ts`
```typescript
// Existing pattern — the new discoveryCache.clear() must be added here
let workspaceFoldersWithFeatures: vscode.Uri[];
export const getUrisOfWkspFoldersWithFeatures = (forceRefresh = false): vscode.Uri[] => {
  if (!forceRefresh && workspaceFoldersWithFeatures)
    return workspaceFoldersWithFeatures;

  const start = performance.now();
  workspaceFoldersWithFeatures = [];
  // discoveryCache.clear();   <-- NEW: add this line in the same reset block
```

### `uriId()` as Map Key
**Source:** `src/common.ts` lines 76-78
**Apply to:** `discoveryCache.set(uriId(folder.uri), ...)` and `discoveryCache.get(uriId(wkspUri))`
```typescript
export function uriId(uri: vscode.Uri) {
  return uri.toString();
}
// Usage: discoveryCache.get(uriId(wkspUri))
// NOT: discoveryCache.get(wkspUri.fsPath)   ← wrong — casing inconsistency on Windows
```

### `fs.existsSync` for Synchronous Path Checks
**Source:** `src/common.ts` lines 150, 172
**Apply to:** Convention fallback in restructured `hasFeaturesFolder()`
```typescript
const hasDefaultFeaturesFolder = fs.existsSync(featuresUri.fsPath);
if (!fs.existsSync(projectUri.fsPath)) { ... }
```

### `vscode.Uri.joinPath` for URI Construction
**Source:** `src/common.ts` lines 97-98, 149, 169, 182
**Apply to:** All URI construction in `src/common.ts` changes
```typescript
// Never path.join in src/ — always:
vscode.Uri.joinPath(folder.uri, "features");
vscode.Uri.joinPath(folder.uri, projectPath);
```

### `public readonly` Property Pattern for `WorkspaceSettings`
**Source:** `src/settings.ts` lines 63-80
**Apply to:** New `discoverySource` and `configFileUri` properties
```typescript
public readonly envVarOverrides: { [name: string]: string } = {};
public readonly featuresUri: vscode.Uri;
// Pattern: public readonly, typed, set in constructor body (no initializer for Uri types)
```

### `nonUserSettableWkspSettings` Exclusion List
**Source:** `src/settings.ts` line 252
**Apply to:** `configFileUri` exclusion from JSON log output
```typescript
const nonUserSettableWkspSettings = ["name", "uri", "id", "projectUri", "featuresUri", "stepsSearchUri", "workspaceRelativeFeaturesPath"];
// Add "configFileUri" to this array — vscode.Uri serializes as {} in JSON.stringify
```

### `makeConfig` / `makeWkspConfig` Mock Helpers (tests only)
**Source:** `test/unit/settings/legacyFallback.test.ts` lines 10-23 and 106-119
**Apply to:** `test/unit/settings/discoverySource.test.ts`
```typescript
function makeConfig(values: Record<string, unknown>, explicitKeys: string[] = []): any {
  return {
    get: (key: string) => values[key],
    has: () => false,
    inspect: (key: string) => ({
      key,
      defaultValue: undefined,
      globalValue: undefined,
      workspaceValue: explicitKeys.includes(key) ? values[key] : undefined,
      workspaceFolderValue: undefined,
    }),
    update: () => Promise.resolve(),
  };
}
```

### Handler Try/Catch Pattern (top-level only)
**Source:** `src/extension.ts` lines 384-392, 496-545
**Apply to:** No new handlers in Phase 2, but any new event subscriptions must follow:
```typescript
context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
  try {
    await configurationChangedHandler(undefined, undefined, true);
  }
  catch (e: unknown) {
    config.logger.showError(e, undefined);
  }
}));
```

---

## No Analog Found

No files are in this category. All Phase 2 changes extend or enrich existing files that are their own closest analogs.

---

## Critical Implementation Notes (from RESEARCH.md pitfalls)

These are compile-time and runtime traps specific to Phase 2:

1. **`discoveryCache.clear()` must pair with `workspaceFoldersWithFeatures = []`** — both resets in the same `forceRefresh` block (`src/common.ts` line 135). Pitfall 2.

2. **"no [behave] section" must return `undefined`, not `{ ok: false }`** — `parseIniConfig` line 109: `if (!inBehaveSection) return undefined` stays as `undefined`. Only return `{ ok: false }` for actual parse errors on files that DO have a `[behave]` section. Pitfall 3.

3. **`discoveryEntry` parameter must be the LAST parameter** on `WorkspaceSettings` constructor — and optional. `configuration.ts` lines 57, 63, 81-84 call the constructor without the new param; TypeScript strict mode will catch missing optionality. Pitfall 4.

4. **`configFileUri` must be in `nonUserSettableWkspSettings`** — `vscode.Uri` serializes as `{}` in `JSON.stringify`. Log it separately as `.fsPath ?? "(none)"`. Pitfall 5.

5. **`configParser.test.ts` existing assertions break** when discriminated union is added — all `result.format` / `result.rawPaths` accesses need `result.ok === true` guard. Must update in the same plan as `configParser.ts` type change. Research.md Open Question 2.

---

## Metadata

**Analog search scope:** `src/common.ts`, `src/settings.ts`, `src/parsers/configParser.ts`, `src/extension.ts`, `src/configuration.ts`, `test/unit/settings/legacyFallback.test.ts`, `test/unit/parsers/configParser.test.ts`, `test/unit/common.test.ts`, `.planning/phases/01-config-parsing/01-PATTERNS.md`
**Files scanned:** 9 source/test files read directly
**Pattern extraction date:** 2026-04-15
