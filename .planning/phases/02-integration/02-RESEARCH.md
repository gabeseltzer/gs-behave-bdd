# Phase 2: Integration - Research

**Researched:** 2026-04-15
**Domain:** VS Code Extension API — WorkspaceSettings wiring, gatekeeper cache, activation events
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** "Explicit settings" means any of `globalValue`, `workspaceValue`, or `workspaceFolderValue` is set for `projectPath` or `featuresPath` — checked via `inspect()` at all three scopes. Aligns with the existing `getWithLegacyFallback()` pattern in `settings.ts`. Satisfies INTG-02.

**D-02:** When explicit settings are detected at any scope, config-file discovery is bypassed entirely. The existing settings path runs unchanged (INTG-07 backward compat).

**D-03:** Add `workspaceContains:**/behave.ini` and `workspaceContains:**/.behaverc` to `activationEvents` in `package.json`. The extension activates on config files even without `.feature` files present.

**D-04:** The gatekeeper's error message (when no features are found) should be updated to mention config file discovery as an option alongside `featuresPath` settings.

**D-05:** Expand the `findBehaveConfig()` return type to include an error variant alongside the success result. When a config file exists but is malformed, the parser returns error details (`configFileUri` + `errorMessage`) instead of `undefined`. Phase 3 reads these from the discovery cache to show UX-02 warning notifications.

**D-06:** Malformed config files fall through to `features/` convention discovery (not blocking). The error is captured AND the extension continues to try convention-based discovery. Matches UX-03 requirement.

### Claude's Discretion

- Specific TypeScript shape of the error variant (discriminated union, wrapper, etc.)
- Cache data structure (Map key, what's stored beyond discovery result)
- Internal function decomposition for the discovery orchestration logic
- Whether to modify `getActualWorkspaceSetting()` or create a new `hasExplicitSetting()` function

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INTG-01 | Discovery priority: explicit manual settings > config file > `features/` convention | Gatekeeper `hasFeaturesFolder()` restructuring: three-branch priority chain |
| INTG-02 | Explicit settings detected via `inspect()` checking `globalValue`, `workspaceValue`, `workspaceFolderValue` | `getWithLegacyFallback()` already implements the 3-scope inspect pattern — copy it |
| INTG-03 | Discovery results cached in module-level Map; gatekeeper reads cache only (< 1ms) | Module-level `Map<string, DiscoveryEntry>` keyed by workspace URI string; cache-first read pattern from `workspaceFoldersWithFeatures` |
| INTG-04 | Cache populated during activation; invalidated by workspace folder changes and settings changes | `configurationChangedHandler` already calls `getUrisOfWkspFoldersWithFeatures(true)` — `forceRefresh=true` clears cache |
| INTG-05 | Activation events expanded to `workspaceContains:**/behave.ini` and `workspaceContains:**/.behaverc` | `package.json` `activationEvents` array — append two strings |
| INTG-06 | `WorkspaceSettings` gains `discoverySource` and `configFileUri` properties | Add two readonly properties to `WorkspaceSettings`; constructor receives discovery result |
| INTG-07 | Existing users with explicit `projectPath`/`featuresPath` settings see zero behavior change | D-02: bypass config discovery when explicit settings detected — the existing code path is unmodified |
</phase_requirements>

---

## Summary

Phase 2 wires the stateless `findBehaveConfig()` parser from Phase 1 into the extension's activation path. The three integration points are: (1) the gatekeeper function `getUrisOfWkspFoldersWithFeatures()` in `common.ts`, (2) the `WorkspaceSettings` class in `settings.ts`, and (3) the `activationEvents` array in `package.json`.

The design follows a clean priority chain: if `projectPath` or `featuresPath` are explicitly set in VS Code settings (at any scope), config-file discovery is skipped entirely — existing users see no change. If no explicit settings exist, `findBehaveConfig()` is called and its result drives the paths used. If that also returns nothing, the `features/` convention fallback runs as before.

The cache lives as a module-level `Map<string, DiscoveryEntry>` keyed by `uriId(wkspUri)`. The gatekeeper populates it on first call (or when `forceRefresh=true`) and returns from cache otherwise. The `configurationChangedHandler` already passes `forceRefresh=true`, satisfying INTG-04 without new event subscription code.

**Primary recommendation:** Introduce `hasExplicitSetting()` as a focused new helper (rather than modifying `getActualWorkspaceSetting()`), add `discoverySource` and `configFileUri` properties to `WorkspaceSettings`, enrich the module-level cache to store discovery metadata, and expand two activation events in `package.json`. Total surface area is small — four localized changes across three files, plus a test file.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Detecting explicit settings | Extension Host (TS) | — | VS Code WorkspaceConfiguration.inspect() is synchronous, runs in the extension host |
| Calling `findBehaveConfig()` | Extension Host (TS) | — | Phase 1 parser is already in-process; called synchronously from gatekeeper |
| Caching discovery results | Extension Host (TS) | — | Module-level Map follows existing caching pattern; must be in same module as gatekeeper |
| Cache invalidation | Extension Host (TS) | — | VS Code events (`onDidChangeConfiguration`, `onDidChangeWorkspaceFolders`) are extension-host events |
| Exposing `discoverySource`/`configFileUri` | `WorkspaceSettings` class | — | These are workspace-scoped properties — natural fit for `WorkspaceSettings` |
| Activation events | VS Code Manifest | — | `package.json` activationEvents — VS Code host reads this before any TS runs |
| Error variant storage | `configParser.ts` | cache in `common.ts` | Parser owns the type; cache stores it for Phase 3 to read |

---

## Standard Stack

### Core (No new dependencies — all already in project)

| Component | Version | Purpose | Source |
|-----------|---------|---------|--------|
| `vscode.WorkspaceConfiguration.inspect()` | VS Code API ^1.82.0 | Detect whether a setting is explicitly set vs default | [VERIFIED: already used in `src/settings.ts` lines 12-26] |
| `fs.existsSync()` | Node built-in | Synchronous file presence check in performance-critical path | [VERIFIED: `src/common.ts` lines 150, 172] |
| `vscode.Uri.joinPath()` | VS Code API | URI construction from path segments | [VERIFIED: used throughout `src/common.ts`] |
| `Map<string, T>` | TypeScript built-in | Module-level cache (same pattern as featureParser/stepsParser) | [VERIFIED: `src/parsers/featureParser.ts` lines 10-11] |

### No New npm Packages Required

`smol-toml` (Phase 1), `fs`, `vscode` — all already present. Phase 2 is pure integration code; no new libraries needed. [VERIFIED: confirmed by reading package.json and all referenced modules]

---

## Architecture Patterns

### System Architecture Diagram

```
VS Code Activation Event
   (*.feature / behave.ini / .behaverc)
             |
             v
      activate() [extension.ts]
             |
             v
  getUrisOfWkspFoldersWithFeatures()   <--- cache hit returns in < 1ms
    [common.ts — gatekeeper]
             |
     (forceRefresh or cache empty)
             |
      hasFeaturesFolder(folder)
             |
     ┌───────┴──────────────────────┐
     |                              |
  inspect() → explicit settings?    |
     |                              |
  YES: return true, source="settings"
     |                              |
  NO: call findBehaveConfig(wkspUri) [configParser.ts]
             |
      ┌──────┴────────────┐
      |                   |
  Result found?       Error result?
      |                   |
  YES: resolvedPath   capture in cache,
  drives featuresUri  fall through ↓
  source="config-file"
      |
  NO: check features/ convention
      |
  ┌───┴────────┐
  Found?      Not found?
    |            |
  source=     return false
  "convention" (workspace excluded)
    |
    v
  Push wkspUri to workspaceFoldersWithFeatures[]
  Store DiscoveryEntry in discoveryCache Map
             |
             v
  WorkspaceSettings constructor
  receives discovery result
  (discoverySource, configFileUri, resolvedFeaturesUri)
             |
             v
  startWatchingWorkspace() per wksp
```

### Recommended File Structure Changes

```
src/
├── common.ts            # MODIFIED: add discoveryCache Map, hasExplicitSetting(),
│                        #           update hasFeaturesFolder() priority chain,
│                        #           update error message (D-04)
├── settings.ts          # MODIFIED: add discoverySource + configFileUri to WorkspaceSettings,
│                        #           constructor receives optional BehaveConfigResult | BehaveConfigError
├── parsers/
│   └── configParser.ts  # MODIFIED: add BehaveConfigError type + error variant to findBehaveConfig()
└── package.json         # MODIFIED: add two activationEvents entries

test/unit/
├── settings/
│   └── discoverySource.test.ts  # NEW: unit tests for INTG-02, INTG-06
└── parsers/
    └── configParserError.test.ts  # NEW (or extend configParser.test.ts): error variant
```

---

## Pattern 1: Explicit-Settings Detection (`hasExplicitSetting`)

**What:** A helper that returns `true` when `projectPath` or `featuresPath` has a non-default value at ANY of the three VS Code scopes.

**When to use:** Called from `hasFeaturesFolder()` before attempting config-file discovery. Implements D-01/D-02.

**Existing reference pattern** (from `src/settings.ts` lines 12-26 — `getWithLegacyFallback()`):
```typescript
// [VERIFIED: src/settings.ts lines 18-23]
const insp = newConfig.inspect<T>(key);
const isExplicit = insp !== undefined && (
  insp.globalValue !== undefined ||
  insp.workspaceValue !== undefined ||
  insp.workspaceFolderValue !== undefined
);
```

**New helper** (Claude's discretion — create new function, do not modify `getActualWorkspaceSetting()`):
```typescript
// In common.ts, near getActualWorkspaceSetting()
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

**Why not modify `getActualWorkspaceSetting()`:** That function returns the value; the new function answers a boolean question. They serve different callers. Keeping them separate avoids breaking callers of `getActualWorkspaceSetting()` (currently used only in `hasFeaturesFolder()`).

---

## Pattern 2: Discovery Cache

**What:** A module-level `Map` keyed by `uriId(wkspUri)` storing the full discovery result per workspace folder. Populated during the gatekeeper's non-cached path; returned on cache hits.

**Existing analogues:**
- `workspaceFoldersWithFeatures` — already a module-level variable in `common.ts` line 128
- `featureFileSteps`, `featureTags` Maps in `featureParser.ts` lines 10-11

**Recommended shape** (Claude's discretion):
```typescript
// [ASSUMED: discriminated union is idiomatic TypeScript for error variants]
export type DiscoverySource = "settings" | "config-file" | "convention";

export interface DiscoveryEntry {
  source: DiscoverySource;
  configFileUri?: vscode.Uri;       // set when source = "config-file"
  configError?: {                   // set when malformed config found (D-05)
    configFileUri: vscode.Uri;
    errorMessage: string;
  };
  featuresUri: vscode.Uri;          // the resolved features path used
}

// Module-level (alongside workspaceFoldersWithFeatures in common.ts)
const discoveryCache = new Map<string, DiscoveryEntry>();
```

**Cache invalidation:** The existing `forceRefresh` flag in `getUrisOfWkspFoldersWithFeatures()` already clears `workspaceFoldersWithFeatures`. Extend it to also clear `discoveryCache.clear()`. No new event subscriptions needed — `configurationChangedHandler` and `onDidChangeWorkspaceFolders` both pass `forceRefresh=true` already. [VERIFIED: `src/extension.ts` lines 384-392, 513]

**Exposing the cache for WorkspaceSettings:** Add a getter function or expose `getDiscoveryEntry(wkspUri)` so `WorkspaceSettings` constructor can read it without coupling to the Map directly.

---

## Pattern 3: WorkspaceSettings Enrichment

**What:** Add `discoverySource` and `configFileUri` as public readonly properties on `WorkspaceSettings`. They are set once in the constructor and never change (settings are reloaded via new construction, not mutation). Implements INTG-06.

**Existing pattern** (from `src/settings.ts` — all properties are `public readonly`):
```typescript
// [VERIFIED: src/settings.ts lines 63-80]
public readonly envVarOverrides: { [name: string]: string } = {};
public readonly featuresUri: vscode.Uri;
```

**New properties to add:**
```typescript
// In WorkspaceSettings class (src/settings.ts)
public readonly discoverySource: "settings" | "config-file" | "convention";
public readonly configFileUri: vscode.Uri | undefined;
```

**Constructor signature options** (Claude's discretion):

Option A — pass `DiscoveryEntry` as optional parameter (clean, no coupling to cache):
```typescript
constructor(
  wkspUri: vscode.Uri,
  wkspConfig: vscode.WorkspaceConfiguration,
  winSettings: WindowSettings,
  logger: Logger,
  legacyConfig?: vscode.WorkspaceConfiguration,
  discoveryEntry?: DiscoveryEntry   // NEW optional param (last, per project convention)
)
```

Option B — `WorkspaceSettings` reads from `getDiscoveryEntry()` itself (more self-contained). Option A is preferred: it keeps `WorkspaceSettings` testable without the cache being populated.

**`logSettings()` update:** The `nonUserSettableWkspSettings` array in `logSettings()` should include `"configFileUri"` (it's a URI object, not a string, and would serialize oddly). `discoverySource` is a string and CAN be logged.

---

## Pattern 4: Error Variant for `findBehaveConfig()` (D-05)

**What:** Instead of returning `undefined` for malformed config files, return a typed error object so the cache can store it and Phase 3 can surface UX-02 notifications.

**Existing pattern — discriminated union in TypeScript** [ASSUMED: discriminated union is the idiomatic TypeScript pattern for result types]:
```typescript
// Recommended shape for configParser.ts
export type BehaveConfigResult =
  | { ok: true; configFileUri: vscode.Uri; format: 'ini' | 'toml'; rawPaths: string[]; resolvedPath: vscode.Uri }
  | { ok: false; configFileUri: vscode.Uri; errorMessage: string };

// Entry point signature change
export function findBehaveConfig(wkspUri: vscode.Uri): BehaveConfigResult | undefined
// undefined = no config file found at all
// { ok: false } = config file found but malformed
// { ok: true } = success
```

**Implication for callers:** The gatekeeper in `hasFeaturesFolder()` must check `result.ok` before using `result.resolvedPath`. The `DiscoveryEntry.configError` field captures the error for Phase 3.

**Impact on existing configParser.ts:** Currently `parseTomlConfig()` catches smol-toml exceptions and returns `undefined`. Under D-05 it should return `{ ok: false, configFileUri, errorMessage }` for malformed TOML. Same for INI parse errors that indicate a file-exists-but-is-invalid condition. Files with no `[behave]` section continue to return `undefined` (not an error — just not a behave config).

**Backward compatibility of the type change:** Phase 1 tests use `findBehaveConfig()` and check `result.format`, `result.rawPaths`, etc. They must be updated to check `result.ok === true` first, or the success branch fields must remain at the same level. The discriminated union requires updating all existing callers. There are exactly two callers at this point: (1) `configParser.test.ts` tests, (2) the new gatekeeper code in Phase 2.

---

## Pattern 5: `hasFeaturesFolder()` Restructured Priority Chain

**Current implementation** (`src/common.ts` lines 137-198):

```
1. Read wkspConfig + legacyConfig
2. Read projectPath via getActualWorkspaceSetting (workspaceFolderValue only)
3. If projectPath set: validate it
4. Check if features/ folder exists (default featuresUri)
5. If no featuresPath AND no features/ folder: return false
6. If features/ folder exists AND no featuresPath: return true
7. If featuresPath set: validate it, return true/false
```

**New implementation** (INTG-01 priority chain):

```
1. Read wkspConfig + legacyConfig
2. Check hasExplicitSetting(projectPath) OR hasExplicitSetting(featuresPath) [D-01]
3. Branch A — EXPLICIT SETTINGS (D-02, INTG-07):
   - Run existing steps 2-7 unchanged
   - Store DiscoveryEntry { source: "settings", featuresUri: computed }
   - return true/false as before
4. Branch B — NO EXPLICIT SETTINGS:
   a. Call findBehaveConfig(folder.uri) [Phase 1 parser]
   b. If ok:true result: featuresUri = result.resolvedPath
      Store DiscoveryEntry { source: "config-file", configFileUri, featuresUri }
      Validate featuresUri exists, return true
   c. If ok:false result (malformed): store configError, fall through to step 4d
   d. Check features/ convention: fs.existsSync(folder.uri/features)
      If found: Store DiscoveryEntry { source: "convention", featuresUri }
               return true
      If not:   return false
```

**Key observation:** The existing `projectPath` and `featuresPath` validation/warning code in Branch A can be reused verbatim. Branch B bypasses it entirely — the config file is the authority for paths.

**Error message update (D-04):** The throw at `common.ts` line 219 currently reads:
```
"...none of the workspace folders contain either a root 'features' folder or a 
settings.json that specifies a valid 'gs-behave-bdd.featuresPath'."
```
Update to mention: `...or a behave config file (behave.ini, .behaverc, setup.cfg, tox.ini, pyproject.toml) with a [behave] paths setting.`

---

## Pattern 6: `activationEvents` Expansion

**What:** Add two entries to `package.json` `activationEvents` array. Simple string append.

**Existing** (`package.json` line 273-274) [VERIFIED]:
```json
"activationEvents": [
  "workspaceContains:**/*.feature"
]
```

**New:**
```json
"activationEvents": [
  "workspaceContains:**/*.feature",
  "workspaceContains:**/behave.ini",
  "workspaceContains:**/.behaverc"
]
```

**Why only these two:** D-03 specifies these two. `setup.cfg`, `tox.ini`, `pyproject.toml` are generic Python files — activating on them without `.feature` files present would cause false activations on non-behave Python projects. `behave.ini` and `.behaverc` are behave-specific. [VERIFIED: D-03 in CONTEXT.md]

**Impact:** VS Code reads `activationEvents` from the installed extension manifest. No TypeScript changes needed for this item. The extension will activate in two additional scenarios after this change.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Detect explicit VS Code settings | Custom config file reader | `vscode.WorkspaceConfiguration.inspect()` | VS Code API handles scope hierarchy correctly including workspace override semantics |
| URI path joining | `path.join(uri.fsPath, seg)` | `vscode.Uri.joinPath(uri, seg)` | `path.join` gives wrong results on Windows for URI construction; the VS Code pattern is enforced by `src/common.ts` and PATTERNS.md |
| Cache invalidation | New event subscriptions | Existing `forceRefresh` flag | `configurationChangedHandler` and `onDidChangeWorkspaceFolders` already pass `forceRefresh=true` — zero new subscriptions needed |
| Error result type | `throw` from parser helpers | Discriminated union return type | Parser helpers must not throw (project convention); callers must handle errors as values |

**Key insight:** This phase's work is almost entirely structural wiring — the hard parts (file parsing, event subscription, cache pattern) are already solved. The main effort is routing the Phase 1 output into the right places with the right data shapes.

---

## Common Pitfalls

### Pitfall 1: `path.join` in src/ for URI construction
**What goes wrong:** Using `path.join(uri.fsPath, "features")` then `vscode.Uri.file(result)` instead of `vscode.Uri.joinPath(uri, "features")`.
**Why it happens:** Natural JavaScript instinct; both produce a path string.
**How to avoid:** Always use `vscode.Uri.joinPath()` in `src/`. Only `path.*` in test files. [VERIFIED: PATTERNS.md "URI Construction" section]
**Warning signs:** `import * as path from 'path'` appearing in `src/` files.

### Pitfall 2: Not clearing `discoveryCache` in `forceRefresh` path
**What goes wrong:** `workspaceFoldersWithFeatures` is cleared but `discoveryCache` is not. Stale cached discovery entries persist after settings change.
**Why it happens:** The new Map is added alongside the existing array but the clear is only added to the array.
**How to avoid:** `discoveryCache.clear()` must be called in the same `if (forceRefresh ...)` block that resets `workspaceFoldersWithFeatures = []`.
**Warning signs:** INTG-04 test: settings change → re-discovery should show new source.

### Pitfall 3: Treating "no `[behave]` section" as a malformed-file error
**What goes wrong:** `configParser.ts` currently returns `undefined` for files without a `[behave]` section (DISC-06). After the D-05 type change, this must still return `undefined` (not `{ ok: false }`), because a `setup.cfg` with no `[behave]` section is not an error — it's just not a behave config.
**Why it happens:** Conflating "malformed" (parse error, bad syntax) with "not a behave config" (valid file, no `[behave]` section).
**How to avoid:** Only return `{ ok: false }` when the file IS a behave config (has `[behave]`/`[tool.behave]`) but has a structural/parse error. Return `undefined` for "no section found."
**Warning signs:** `no-behave-section` fixture test starts failing.

### Pitfall 4: `WorkspaceSettings` constructor signature breaks integration tests
**What goes wrong:** Adding a required parameter to `WorkspaceSettings` constructor breaks `configuration.ts` calls and integration test `TestWorkspaceConfig` injection.
**Why it happens:** TypeScript strict mode catches it at compile time, but the fix must be correct — `discoveryEntry` must be the LAST parameter and optional.
**How to avoid:** Always add new constructor parameters as optional trailing params. [VERIFIED: CLAUDE.md "Optional parameters come last"]
**Warning signs:** `npm run compile` fails; `configuration.ts` reloadSettings calls break.

### Pitfall 5: `logSettings()` attempting to serialize `configFileUri` (a URI object)
**What goes wrong:** `configFileUri` is a `vscode.Uri` — `JSON.stringify` renders it as `{}`. The log output becomes useless or confusing.
**Why it happens:** `logSettings()` uses `Object.entries(this)` and stringifies all non-excluded properties.
**How to avoid:** Add `"configFileUri"` to the `nonUserSettableWkspSettings` array in `logSettings()`, then log it separately as `this.configFileUri?.fsPath ?? "(none)"`. [VERIFIED: src/settings.ts lines 252-253]
**Warning signs:** Unit test for settings log output shows `{}` for `configFileUri`.

### Pitfall 6: Gatekeeper performance regression
**What goes wrong:** `findBehaveConfig()` is called synchronously on every invocation because the cache-check happens after the discovery branch — or `forceRefresh` is always true.
**Why it happens:** Early return from cache (`if (!forceRefresh && workspaceFoldersWithFeatures)`) must also reset `discoveryCache` when clearing, ensuring both are in sync.
**How to avoid:** The cache-hit early return must gate BOTH Maps. [VERIFIED: `src/common.ts` lines 130-132: existing pattern]
**Warning signs:** Perf log shows `getUrisOfWkspFoldersWithFeatures` > 1ms on second call.

---

## Code Examples

### Existing inspect() pattern to extend (src/settings.ts lines 12-26)
```typescript
// [VERIFIED: src/settings.ts lines 12-26]
function getWithLegacyFallback<T>(
  newConfig: vscode.WorkspaceConfiguration,
  legacyConfig: vscode.WorkspaceConfiguration,
  key: string
): T | undefined {
  const insp = newConfig.inspect<T>(key);
  const isExplicit = insp !== undefined && (
    insp.globalValue !== undefined ||
    insp.workspaceValue !== undefined ||
    insp.workspaceFolderValue !== undefined
  );
  if (isExplicit) return newConfig.get<T>(key);
  // ...
}
```

### Existing cache-check early-return pattern (src/common.ts lines 129-132)
```typescript
// [VERIFIED: src/common.ts lines 129-132]
let workspaceFoldersWithFeatures: vscode.Uri[];
export const getUrisOfWkspFoldersWithFeatures = (forceRefresh = false): vscode.Uri[] => {
  if (!forceRefresh && workspaceFoldersWithFeatures)
    return workspaceFoldersWithFeatures;
  // ... populate cache ...
```

### Existing configurationChangedHandler cache-invalidation call (src/extension.ts line 513)
```typescript
// [VERIFIED: src/extension.ts line 513]
for (const wkspUri of getUrisOfWkspFoldersWithFeatures(true)) {  // true = forceRefresh
```

### Existing onDidChangeWorkspaceFolders handler (src/extension.ts lines 384-392)
```typescript
// [VERIFIED: src/extension.ts lines 384-392]
context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
  try {
    await configurationChangedHandler(undefined, undefined, true);  // true = forceFullRefresh
  }
```

### Test mock pattern for `inspect()` (test/unit/settings/legacyFallback.test.ts lines 10-23)
```typescript
// [VERIFIED: test/unit/settings/legacyFallback.test.ts lines 10-23]
function makeConfig(values: Record<string, unknown>, explicitKeys: string[] = []): any {
  return {
    get: (key: string) => values[key],
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
Use this same `makeConfig` pattern for unit tests of `hasExplicitSetting()`.

---

## Runtime State Inventory

> Step 2.5: Not applicable — this is a feature-addition phase, not a rename/refactor/migration.

---

## Environment Availability

> Step 2.6: Phase 2 makes no new external tool calls. All dependencies are in-process (VS Code API, Node built-ins, Phase 1 parser). No audit needed.

---

## Validation Architecture

> `nyquist_validation: false` in `.planning/config.json` — this section is skipped per config.

---

## Security Domain

> Phase 2 reads behave config files from disk and passes path strings to `vscode.Uri.joinPath()`. No user input is eval'd or passed to shell. No authentication, credentials, or network I/O. ASVS V5 (input validation): config file paths are resolved via `vscode.Uri.joinPath()` and existence-checked with `fs.existsSync()` before use — path traversal is not a risk because the base is always the workspace folder URI controlled by VS Code. Security posture: unchanged from Phase 1.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `workspaceFolderValue` only in `getActualWorkspaceSetting()` | All three scopes via `inspect()` (D-01) | Phase 2 | Explicit-settings detection now correctly covers global and workspace-level settings |
| `features/` or explicit path only | Three-branch priority chain (settings > config > convention) | Phase 2 | Zero-config activation |
| `BehaveConfigResult` success-only | Discriminated union with error variant | Phase 2 (D-05) | Phase 3 can surface malformed-config warnings without re-parsing |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Discriminated union (`{ ok: true } \| { ok: false }`) is the idiomatic TypeScript pattern for result types with error variants | Pattern 4 (Error Variant) | Alternative: separate `BehaveConfigSuccess` + `BehaveConfigError` types with union; functionally equivalent, slightly more verbose. Low risk. |
| A2 | `WorkspaceSettings` constructor receives `discoveryEntry` as an optional trailing parameter (Option A) rather than reading the cache directly | Pattern 3 (WorkspaceSettings Enrichment) | If constructor reads the cache directly, it becomes untestable without populating the cache — breaks unit test isolation. Option A is safer. |

---

## Open Questions

1. **Should `discoveryCache` be exported or kept module-internal?**
   - What we know: `WorkspaceSettings` needs the discovery result; Phase 3 needs the error result.
   - What's unclear: Whether it's cleaner to export a getter function (`getDiscoveryEntry(wkspUri)`) vs passing the value explicitly.
   - Recommendation: Export a getter function — keeps the Map internal, avoids accidental external mutation.

2. **Should the configParser.test.ts suite be updated in Phase 2 or deferred?**
   - What we know: Adding the discriminated union to `BehaveConfigResult` will break existing test assertions that access `.format`, `.rawPaths` directly without checking `.ok`.
   - What's unclear: Whether to update tests inline with the type change or defer to a separate plan.
   - Recommendation: Update `configParser.test.ts` in the same plan that modifies `configParser.ts` — they are tightly coupled.

---

## Sources

### Primary (HIGH confidence)
- `src/common.ts` — gatekeeper implementation, `getActualWorkspaceSetting()`, cache pattern [VERIFIED: read directly]
- `src/settings.ts` — `WorkspaceSettings`, `getWithLegacyFallback()`, `inspect()` pattern [VERIFIED: read directly]
- `src/extension.ts` — `activate()`, `configurationChangedHandler`, `onDidChangeWorkspaceFolders` [VERIFIED: read directly]
- `src/configuration.ts` — `reloadSettings()`, WorkspaceSettings construction [VERIFIED: read directly]
- `src/parsers/configParser.ts` — Phase 1 output, `BehaveConfigResult` interface, `findBehaveConfig()` [VERIFIED: read directly]
- `package.json` — `activationEvents` current state [VERIFIED: read directly]
- `test/unit/settings/legacyFallback.test.ts` — `makeConfig()` mock pattern for `inspect()` [VERIFIED: read directly]
- `.planning/phases/01-config-parsing/01-PATTERNS.md` — established Phase 1 code patterns [VERIFIED: read directly]

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions D-01 through D-06 — locked design decisions from /gsd-discuss-phase

### Tertiary (LOW confidence)
- None.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all components verified in codebase
- Architecture: HIGH — all integration points read directly from source; no inference required
- Pitfalls: HIGH — derived from reading actual code paths and existing tests
- Error variant shape: MEDIUM — discriminated union is idiomatic but alternatives exist (tagged [ASSUMED])

**Research date:** 2026-04-15
**Valid until:** 2026-05-15 (stable codebase — no external dependencies change)
