# Architecture Patterns: 1.2.0 Multi-Path & Monorepo-Aware Discovery

**Domain:** VS Code extension — 1.2.0 additions to gs-behave-bdd (auto-discovery + config watching already shipped)
**Researched:** 2026-04-17
**Confidence:** HIGH (direct source analysis of every touched file)
**Scope:** How DISC-07 (subdir config scan, depth 3) and DISC-08 (multi-path) integrate with the existing architecture. Milestones 1 (1.0.0 discovery) and 2 (1.1.0 watcher + run guard) are fully shipped.

---

## Current State After 1.1.0 (What Already Exists)

Core discovery + watcher + run-guard stack is shipped and operational. Key facts that 1.2.0 has to work with:

### Singular `featuresUri` Everywhere

The entire codebase assumes **one** features directory per workspace. Two singular fields hold this state:

1. **`DiscoveryEntry.featuresUri: vscode.Uri`** (`src/common.ts:39`) — what the discovery cache stores.
2. **`WorkspaceSettings.featuresUri: vscode.Uri`** (`src/settings.ts:78`) — what every consumer reads.

All sub-object keying (featureFileSteps, stepFileSteps, fixtures, stepMappings) uses `uriId(featuresUri)` as a string prefix. This works because there's always exactly one.

### Config-File Lookup Is Workspace-Root-Only

`findBehaveConfig(wkspUri)` in `src/parsers/configParser.ts:29` does `vscode.Uri.joinPath(wkspUri, filename)` — a literal string join at the workspace root. Zero subdirectory awareness.

### Discovery Cache Is Single-Source-Of-Truth

- `discoveryCache: Map<string, DiscoveryEntry>` in `src/common.ts:161` — module-level, keyed by `uriId(wkspUri)`.
- `getDiscoveryEntry(wkspUri)` — synchronous O(1) read; used by `WorkspaceSettings` constructor and run guard.
- `getUrisOfWkspFoldersWithFeatures(forceRefresh=true)` — the only writer; clears + rebuilds via `hasFeaturesFolder` closure.
- Hot-path read returns early on cached `workspaceFoldersWithFeatures` array (< 1ms; hard SLA).

### Config Watcher Is Per-Workspace-Root

`startWatchingConfigFiles(wkspUri, …)` in `src/watchers/configWatcher.ts:22` attaches a single `RelativePattern(wkspUri, '{behave.ini,.behaverc,setup.cfg,tox.ini,pyproject.toml}')` watcher per workspace root. Does **not** traverse subdirectories.

Debounce is module-level (`configDebounceTimers: Map<string, NodeJS.Timeout>`), keyed by `uriId(wkspUri)`. On fire it does **direct** cache invalidation:

```
getUrisOfWkspFoldersWithFeatures(true) → config.reloadSettings(wkspUri) → onConfigChanged([wkspUri], true) → parser.parseFilesForWorkspace(…)
```

NOTE: the 1.1.0 ARCHITECTURE.md prescribed routing through `configurationChangedHandler(undefined, undefined, true)` but the final implementation in `src/watchers/configWatcher.ts:53-59` bypasses it ("Direct cache invalidation — do NOT call configurationChangedHandler (PITFALL-04)"). This matters for 1.2.0: the same bypass will apply to subdir-scanned config watchers.

### Feature-Tree Construction Has Built-In Multi-Root Support

`src/parsers/fileParser.ts:340-348`: when `getUrisOfWkspFoldersWithFeatures().length > 1`, a workspace-grandparent `TestItem` (id = `wkspSettings.id`) is created and each feature file becomes its descendant. **No `featuresUri`-level grandparent exists.** Folder hierarchy below the feature root is derived by string-subtracting `wkspSettings.featuresUri.path` from the feature file URI path (line 359).

### Behave-CLI Path Handling Is Already Multi-Path-Tolerant

`runOrDebugAllFeaturesInOneInstance` in `src/runners/runOrDebug.ts:38-56` passes **no** `-i` path regex to behave — it relies on behave's own config/paths resolution with `cwd = projectUri.fsPath`. So when behave sees `paths = featuresA\nfeaturesB` in behave.ini, it already does the right thing. Only `runOrDebugFeatures` and `runOrDebugFeatureWithSelectedScenarios` build an `-i` regex, and they build it from `scenario.featureFileWorkspaceRelativePath` (which is per-scenario, already path-agnostic). **Nothing in runOrDebug.ts needs `featuresUri` to be a single value.**

---

## System Overview (Post 1.2.0)

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                         Extension Activation Layer                            │
│  src/extension.ts                                                             │
│  activate() — startWatchingConfigFiles(per-workspace) × N                     │
│                updateDiscoveryUX(wkspUris, clearNotifiedErrors)               │
│                configurationChangedHandler (rebuilds watchers on folder chg)  │
├───────────────────────────────────────────────────────────────────────────────┤
│                          Discovery Layer                                      │
│  src/common.ts                                                                │
│  getUrisOfWkspFoldersWithFeatures(forceRefresh)                               │
│     → hasFeaturesFolder(folder)                                               │
│          Branch A: explicit settings (featuresPath | featuresPaths*)          │
│          Branch B: config-file scan (1.2.0: depth-3 via configScanner)         │
│          Branch C: "features/" convention                                     │
│     → discoveryCache.set(uriId(wkspUri), DiscoveryEntry)                      │
│                                                                               │
│  src/parsers/configParser.ts                                                  │
│     findBehaveConfig(dir): BehaveConfigResult (stateless)                     │
│                                                                               │
│  src/discovery/configScanner.ts  **[NEW]**                                    │
│     scanForBehaveConfig(wkspUri, depth): ScanResult                           │
├───────────────────────────────────────────────────────────────────────────────┤
│                          Settings Layer                                       │
│  src/settings.ts  WorkspaceSettings                                           │
│     featuresUris: vscode.Uri[]  **[changed from Uri]**                        │
│     featuresUri: vscode.Uri (getter → featuresUris[0])  **[compat shim]**     │
│     stepsSearchUris: vscode.Uri[] (one per feature root)  **[new]**           │
├───────────────────────────────────────────────────────────────────────────────┤
│                          Parser / Test-Tree Layer                             │
│  src/parsers/fileParser.ts                                                    │
│     _parseFeatureFiles(wkspSettings, …): iterate featuresUris[]               │
│     _parseStepsFiles(wkspSettings, …):   iterate stepsSearchUris[]            │
│     _getOrCreate…Feature: reuse existing wksp-grandparent; feature root       │
│                           grandparent optional (multi-path → wrapper)         │
│  src/parsers/stepMappings.ts                                                  │
│     StepMapping.featuresUri: Uri  **[unchanged — per-mapping identity]**      │
│     rebuildStepMappings(featuresUri) called per-root in loop                  │
├───────────────────────────────────────────────────────────────────────────────┤
│                          Watcher Layer                                        │
│  src/watchers/workspaceWatcher.ts                                             │
│     returns FileSystemWatcher[] — one per featuresUri (plus sibling steps)   │
│  src/watchers/configWatcher.ts                                                │
│     pattern expands: {behave.ini,…} at depths 0..discoveryDepth (was 0 only)  │
├───────────────────────────────────────────────────────────────────────────────┤
│                          Runner Layer (mostly unchanged)                      │
│  src/runners/testRunHandler.ts                                                │
│     WkspRun — no change (runs behave at projectUri with config-driven paths)  │
│     checkRunGuard — reads getDiscoveryEntry(wkspUri), already per-workspace   │
│  src/runners/runOrDebug.ts                                                    │
│     No changes required. Behave resolves paths from its own config.           │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## Every Consumer of `featuresUri` / `featuresPath` Today

This is the **exhaustive** list derived from grepping the entire `src/` tree. Each entry = one change point.

### Type-holder (must change)

| File | Line | Reference | Change Needed |
|------|------|-----------|---------------|
| `src/common.ts` | 39 | `DiscoveryEntry.featuresUri: vscode.Uri` | **Change to `featuresUris: vscode.Uri[]`** |
| `src/settings.ts` | 78 | `WorkspaceSettings.featuresUri: vscode.Uri` | **Change to `featuresUris: vscode.Uri[]`** (keep `featuresUri` as `featuresUris[0]` getter for back-compat) |
| `src/settings.ts` | 72 | `projectRelativeFeaturesPath: string` | **Change to `projectRelativeFeaturesPaths: string[]`** (scalar getter returns `[0]`) |
| `src/settings.ts` | 80 | `workspaceRelativeFeaturesPath: string` | **Change to `workspaceRelativeFeaturesPaths: string[]`** |
| `src/settings.ts` | 79 | `stepsSearchUri: vscode.Uri` | **Change to `stepsSearchUris: vscode.Uri[]`** (one resolved steps-search root per feature root) |
| `src/parsers/stepMappings.ts` | 18 | `StepMapping.featuresUri: vscode.Uri` | **No change.** Per-mapping; each mapping belongs to exactly one feature root. Populated from whichever root is being rebuilt in the loop. |

### Discovery writer (must change)

| File | Lines | Current Behavior | 1.2.0 Change |
|------|-------|------------------|-------------|
| `src/common.ts::hasFeaturesFolder` | 177–291 | Single-path resolution at each of 3 branches. | Branch A: read `featuresPaths[]` (new plural) OR fall back to singular `featuresPath`. Branch B: use new `configScanner.scanForBehaveConfig()` and populate `featuresUris` from `configResult.rawPaths` (all of them, not just `[0]`). Branch C: unchanged (convention yields `[wkspUri/features]`). |
| `src/common.ts` | 214, 225, 229, 231, 255, 260, 274, 286 | Assigns scalar `featuresUri` to the `DiscoveryEntry`. | Assigns array `featuresUris`. |
| `src/parsers/configParser.ts::resolvePaths` | 158–169 | Returns `vscode.Uri` for `rawPaths[0]` only. | Add `resolveAllPaths(rawPaths, configFileUri): vscode.Uri[]` that maps every entry. Keep old `resolvePaths` or replace `BehaveConfigResult.resolvedPath: vscode.Uri` with `resolvedPaths: vscode.Uri[]`. |
| `src/parsers/configParser.ts` | 12–14 | `BehaveConfigResult.resolvedPath: vscode.Uri` | **Change to `resolvedPaths: vscode.Uri[]`.** (`rawPaths: string[]` is already plural.) |

### Settings-reader, test-tree construction (modify)

| File | Line | Reference | Change Needed |
|------|------|-----------|---------------|
| `src/parsers/fileParser.ts` | 143 | `deleteFeatureFileSteps(wkspSettings.featuresUri)` | Loop over `featuresUris` — call per root. |
| `src/parsers/fileParser.ts` | 144 | `deleteStepMappings(wkspSettings.featuresUri)` | Loop over `featuresUris`. |
| `src/parsers/fileParser.ts` | 150 | `findFiles(wkspSettings.featuresUri, …)` | Loop over `featuresUris`, accumulate `featureFiles` across roots. |
| `src/parsers/fileParser.ts` | 154 | `throw "No feature files found in ${wkspSettings.featuresUri.fsPath}"` | Update message; consider per-root emptiness allowed (only throw if **all** roots are empty). |
| `src/parsers/fileParser.ts` | 181–184 | `searchInFeatures = wkspSettings.stepsSearchUri.path.startsWith(wkspSettings.featuresUri.path)` | Per-root decision: use `stepsSearchUris[i]` vs `featuresUris[i]`. |
| `src/parsers/fileParser.ts` | 248–254 | `deleteStepFileSteps / deleteFixtures / storeBehaveStepDefinitions / storePythonFixtureDefinitions(wkspSettings.featuresUri, …)` | Loop per root; each call keyed by its own `featuresUris[i]`. |
| `src/parsers/fileParser.ts` | 359, 366 | `const sfp = uri.path.substring(wkspSettings.featuresUri.path.length + 1)` and `folderTestItemId = uriId(wkspSettings.featuresUri) + "/" + path` | **Per-feature-URI prefix match.** Pick the `featuresUris[i]` that is a strict prefix of `uri.path`; use it for the substring and the folderTestItemId. |
| `src/parsers/fileParser.ts` | 512 | `rebuildStepMappings(wkspSettings.featuresUri)` | Loop per root. |
| `src/parsers/fileParser.ts` | 543–545 | `getStepFileSteps / getFeatureFileSteps / getStepMappings(wkspSettings.featuresUri).length` | Sum across all `featuresUris`. (Only hit in integration-test `WkspParseCounts`.) |
| `src/parsers/fileParser.ts` | 595, 636, 680–684, 700–701 | Same URI used as stepFile/feature key during Python reparse | Pick the right `featuresUris[i]` for the edited file (prefix match on URI). |
| `src/runners/testRunHandler.ts` | 199 | `const idMatch = uriId(wkspSettings.featuresUri)` → filter `queue.filter(item => item.test.id.includes(idMatch))` | Multi-path: build matcher that includes items whose id starts with **any** `uriId(featuresUris[i])`. |
| `src/watchers/workspaceWatcher.ts` | 14 | `new vscode.RelativePattern(wkspSettings.uri, \`${wkspSettings.workspaceRelativeFeaturesPath}/**\`)` | Create **one watcher per** `workspaceRelativeFeaturesPaths[i]`. Return the combined `FileSystemWatcher[]` (already a list — just append more). |
| `src/watchers/workspaceWatcher.ts` | 19 | `!wkspSettings.stepsSearchUri.path.startsWith(wkspSettings.featuresUri.path)` | Per-root check: if **any** `stepsSearchUris[i]` lies outside its corresponding `featuresUris[i]`, add the sibling-steps watcher for that root. (In practice the sibling-steps case is per-workspace, not per-feature-root — see existing behaviour at wksp-root `steps/`.) |
| `src/parsers/junitParser.ts` | 204 | `wkspSettings.workspaceRelativeFeaturesPath + "/"` used to trim junit classname | Must trim **whichever** `workspaceRelativeFeaturesPaths[i]` is a prefix. Fallback: try each in turn. |
| `src/parsers/junitParser.ts` | 207 | `wkspSettings.stepsSearchUri.path.startsWith(wkspSettings.featuresUri.path)` | Per-root prefix match (same logic as workspaceWatcher:19). |
| `src/parsers/junitParser.ts` | 213 | `wkspSettings.workspaceRelativeFeaturesPath.split("/").pop()` | Needs the relevant root's path — find the `workspaceRelativeFeaturesPaths[i]` matching this feature's relpath. |
| `src/extension.ts` | 79, 83 | `entry.featuresUri.fsPath` in log lines | Log **all** feature roots: `entry.featuresUris.map(u => u.fsPath).join(", ")`. |
| `src/extension.ts` | 199 | `urisMatch(wkspSettings.featuresUri, featuresUri)` inside `onStepMappingsRebuilt` | Need: is the rebuilt-for URI one of the wksp's `featuresUris`? Replace `urisMatch` with `featuresUris.some(u => urisMatch(u, featuresUri))`. |
| `src/handlers/autoCompleteProvider.ts` | 39 | `getStepFileSteps(wkspSettings.featuresUri)` | **Union across all roots:** `wkspSettings.featuresUris.flatMap(u => getStepFileSteps(u))`. |
| `src/handlers/codeLensProvider.ts` | 59 | `getStepFileSteps(wkspSettings.featuresUri)` | Same union. |
| `src/handlers/stepDiagnostics.ts` | 25, 28 | `getFeatureFileSteps(wkspSettings.featuresUri)`, `getStepFileSteps(wkspSettings.featuresUri)` | Same union. For feature-steps lookup specifically, could scope to the `featuresUris[i]` that contains `document.uri` — faster, same semantics. |
| `src/handlers/fixtureProviders.ts` | 33, 87, 153, 169 | `getFixtureByTag(wkspSettings.featuresUri, …)`, `getFixtures(wkspSettings.featuresUri)`, `getFeatureTags(wkspSettings.featuresUri)` | Union — but faster + correct: locate the `featuresUris[i]` that is a prefix of `document.uri` and use only that. Fixtures in root A should not bleed into feature files in root B; this is a **behavior-correctness** issue, not just perf. |
| `src/handlers/fixtureDiagnostics.ts` | 24, 25, 32 | Same as fixtureProviders | Same containing-root logic. |

### testWorkspaceConfig.ts (test harness)

| File | Lines | Change Needed |
|------|-------|---------------|
| `src/testWorkspaceConfig.ts` | 16, 27, 35, 48, 76, 77, 125, 126, 173–186, 220–226 | Mirror the WorkspaceSettings plural field everywhere it currently returns singular `featuresPath` / `featuresUri` / `workspaceRelativeFeaturesPath`. Keep a singular getter for unit tests that don't care. Add plural-form testConfig input for multi-path unit tests. |

### Unchanged (sanity-checked)

- **`StepMapping.featuresUri`** — stays `vscode.Uri` (per-mapping, fine). `rebuildStepMappings(featuresUri)` is called **once per root** in a loop; each mapping carries the root it came from.
- **`WkspRun`** — no reference to `featuresUri` at all. The only path-ish field it holds is `junitRunDirUri`, which is per-run.
- **`runOrDebug.ts`** — reads `workspaceRelativeProjectPath`, never `featuresUri`. Behave resolves its own paths from behave.ini.
- **`behaveRun.ts`** — `spawn(pythonExec, ['-m', 'behave', …], { cwd: projectUri })`. Cwd is `projectUri`, not `featuresUri`. Zero change.
- **`findStepReferencesHandler.ts`** — operates on `stepMappings` (a flat array across all roots), keys by `stepsFileUri + lineNo`. Never touches `featuresUri`. **Zero change.** It already works with multiple roots.
- **`featureParser.ts` / `fixtureParser.ts` / `stepsParser.ts`** — all keyed by `uriId(featuresUri) + sepr + …`. **Each call** passes one `featuresUri`; callers loop. No internal change.

---

## New Components to Add

### 1. `src/discovery/configScanner.ts` (new module)

Dedicated subdir-aware scanner. Justification: `configParser.ts` is stateless single-file parsing; putting filesystem-traversal + depth cap there mixes two concerns. A new module keeps the directory structure clean and leaves `configParser` 100% untouched.

```typescript
// src/discovery/configScanner.ts

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { findBehaveConfig, BehaveConfigResult } from '../parsers/configParser';

export const DEFAULT_DISCOVERY_DEPTH = 3;

// Directories to skip during scan — matches DEFAULT_EXCLUDE_DIRS in common.ts
const SCAN_EXCLUDE = new Set([
  '__pycache__', '.git', 'node_modules', '.venv', '.tox',
  '.mypy_cache', '.pytest_cache', '.eggs', 'dist', 'build'
]);

export interface ScanResult {
  result: BehaveConfigResult;         // first valid (or first malformed) config
  discoveredAt: vscode.Uri;           // directory where it was found
  alsoFound: vscode.Uri[];            // other config locations — surfaces ambiguity to UX-warn
}

/**
 * BFS scan from wkspUri down to maxDepth, looking for the first directory
 * that contains a behave config file with valid [behave] section.
 * First match wins; additional finds are reported in `alsoFound` for a warning.
 */
export function scanForBehaveConfig(
  wkspUri: vscode.Uri,
  maxDepth = DEFAULT_DISCOVERY_DEPTH
): ScanResult | undefined {
  // BFS queue of (dir, depth). Workspace root is depth 0.
  const queue: Array<{ dir: vscode.Uri; depth: number }> = [{ dir: wkspUri, depth: 0 }];
  let primary: ScanResult | undefined;
  const alsoFound: vscode.Uri[] = [];

  while (queue.length > 0) {
    const { dir, depth } = queue.shift()!;

    const result = findBehaveConfig(dir);
    if (result) {
      if (!primary) {
        primary = { result, discoveredAt: dir, alsoFound: [] };
      } else {
        alsoFound.push(dir);
      }
    }

    if (depth >= maxDepth) continue;

    let entries: string[];
    try {
      entries = fs.readdirSync(dir.fsPath);
    } catch { continue; }

    for (const name of entries) {
      if (SCAN_EXCLUDE.has(name) || name.startsWith('.')) continue;
      const child = vscode.Uri.joinPath(dir, name);
      try {
        if (fs.statSync(child.fsPath).isDirectory()) {
          queue.push({ dir: child, depth: depth + 1 });
        }
      } catch { /* ignore unreadable entries */ }
    }
  }

  if (primary && alsoFound.length > 0) primary.alsoFound = alsoFound;
  return primary;
}
```

**Why new module, not extend `configParser.ts`:** `configParser` is pure `fs.readFileSync` + parse, zero side effects, zero directory traversal. Keeping it pure makes it independently unit-testable and keeps `smol-toml` out of the scanner's dependency graph. The scanner depends on the parser, not vice versa.

**Why BFS not DFS:** Shallower matches win. BFS ensures the config closest to the workspace root is chosen first — matches intuition (monorepo root configs beat nested subproject configs).

---

## Modified Components

### 1. `src/common.ts::hasFeaturesFolder` (Branch B rewrite)

Today (line 250–277):
```typescript
const configResult = findBehaveConfig(folder.uri);
if (configResult) { … }
```

1.2.0:
```typescript
import { scanForBehaveConfig } from './discovery/configScanner';
import { config } from './configuration';

// read the discoveryDepth setting once
const wkspCfg = vscode.workspace.getConfiguration("gs-behave-bdd", folder.uri);
const depth = wkspCfg.get<number>("discoveryDepth") ?? 3;

const scanResult = scanForBehaveConfig(folder.uri, depth);
if (scanResult) {
  const configResult = scanResult.result;
  if (configResult.ok) {
    // multi-path: featuresUris[] from ALL resolvedPaths, not just [0]
    const existingPaths = configResult.resolvedPaths.filter(u => fs.existsSync(u.fsPath));
    if (existingPaths.length > 0) {
      discoveryCache.set(uriId(folder.uri), {
        source: "config-file",
        configFileUri: configResult.configFileUri,
        featuresUris: existingPaths,
        // NEW: surface ambiguity to the UX
        alsoFoundConfigs: scanResult.alsoFound,
      });
      return true;
    }
  } else {
    // malformed: same as today (capture configError, fall through)
  }
}
```

`DiscoveryEntry.alsoFoundConfigs: vscode.Uri[]` is new and optional — drives the UX warning for subdir scan ambiguity (MULTI-01 deferred, so behavior is "first-match + warn").

### 2. `src/settings.ts::WorkspaceSettings` (multi-path rewrite)

```typescript
// read plural first, fall back to singular for back-compat (NEW in 1.2.0)
const featuresPathsCfg = get<string[] | undefined>("featuresPaths");
const featuresPathCfg = get<string>("featuresPath") ?? "";

let projectRelativeFeaturesPaths: string[];
if (featuresPathsCfg && Array.isArray(featuresPathsCfg) && featuresPathsCfg.length > 0) {
  projectRelativeFeaturesPaths = featuresPathsCfg.map(normalizePath);
} else if (featuresPathCfg) {
  projectRelativeFeaturesPaths = [normalizePath(featuresPathCfg)];
} else {
  // pull from discovery entry (plural)
  const entry = discoveryEntry ?? getDiscoveryEntry(wkspUri);
  const uris = entry?.featuresUris ?? [vscode.Uri.joinPath(this.projectUri, "features")];
  projectRelativeFeaturesPaths = uris.map(u =>
    path.relative(this.projectUri.fsPath, u.fsPath).replaceAll("\\", "/")
  );
}
if (projectRelativeFeaturesPaths.length === 0) projectRelativeFeaturesPaths = ["features"];

this.projectRelativeFeaturesPaths = projectRelativeFeaturesPaths;
this.featuresUris = projectRelativeFeaturesPaths.map(p => vscode.Uri.joinPath(this.projectUri, p));

// back-compat getters
public get featuresUri(): vscode.Uri { return this.featuresUris[0]; }
public get projectRelativeFeaturesPath(): string { return this.projectRelativeFeaturesPaths[0]; }
public get workspaceRelativeFeaturesPath(): string { return this.workspaceRelativeFeaturesPaths[0]; }
public get stepsSearchUri(): vscode.Uri { return this.stepsSearchUris[0]; }
```

**Why keep the singular getters:** minimizes diffs across the 20+ call sites. Only call sites that NEED the array (the parser loops, the watcher setup, the handlers that union across roots) get migrated in this milestone. Everything else keeps working on root `[0]` — correctness is preserved if the user is single-path (which is every user today).

**`stepsSearchUris` computation:** today's logic finds `steps/` under `featuresUri` or traverses upward. For multi-path, compute one `stepsSearchUri` **per featuresUris[i]** with the same algorithm applied independently. Callers then iterate parallel arrays.

### 3. `src/watchers/configWatcher.ts`

Current pattern (line 31): `new vscode.RelativePattern(wkspUri, CONFIG_GLOB)`. Only matches files **at** the workspace root.

For depth-3 scanning, add a depth-aware glob:

```typescript
const CONFIG_GLOB_DEPTH3 = '{,*/,*/*/,*/*/*/}{behave.ini,.behaverc,setup.cfg,tox.ini,pyproject.toml}';
```

Brace expansion covers depth 0..3 explicitly. Using `**/…` is tempting but matches arbitrary depth — we'd fire watcher events for deeply nested `node_modules` configs that don't affect us.

Alternative (cleaner): once `discoveryCache` has `configFileUri` for each wksp, register a watcher **specifically** for that one URI + the workspace root. Then on create/delete of any `{behave.ini,…}` at any depth ≤ `discoveryDepth`, re-scan.

- Pro: tight watcher scope.
- Con: re-registering watchers when the chosen config file moves.

The brace-expansion glob is simpler and keeps the watcher-rebuild logic identical to today. Recommend the glob approach for milestone 1.2.0.

---

## Data Flow: Config at `backend/behave.ini` → Test Tree Shows Backend Features

```
[user opens monorepo/ — no config at root, config at backend/behave.ini]
          |
          v
activate() called
          |
          v
parser.clearTestItemsAndParseFilesForAllWorkspaces(…)
          |
          v
getUrisOfWkspFoldersWithFeatures(forceRefresh initially via workspaceFoldersWithFeatures cache miss)
          |
          v
hasFeaturesFolder(monorepo folder)
   Branch A — no explicit settings: skip
   Branch B — scanForBehaveConfig(monorepo_uri, depth=3)
                    BFS: monorepo/ (no config) → monorepo/backend/ (FOUND behave.ini)
                    returns ScanResult with discoveredAt=backend/, alsoFound=[]
                |
                v
              configResult.ok — rawPaths=["features"]
              resolvedPaths = [backend/features] (relative to config-dir)
              existingPaths = [backend/features] (fs.existsSync true)
              discoveryCache.set(uriId(monorepo), {
                source: "config-file",
                configFileUri: backend/behave.ini,
                featuresUris: [backend/features],
                alsoFoundConfigs: [],
              })
          |
          v
WorkspaceSettings constructor reads discoveryEntry
   featuresUris = [backend/features]
   projectUri = monorepo (workspaceRelativeProjectPath is still "")
   stepsSearchUris[0] computed from featuresUris[0]
          |
          v
updateDiscoveryUX([monorepo])
   output: "Config file: backend/behave.ini"
   output: "Features directories: backend/features"
          |
          v
parser.parseFilesForWorkspace
   _parseFeatureFiles — loop over featuresUris [1 entry]
       findFiles(backend/features, …) → backend/features/*.feature
       _getOrCreateFeatureTestItemAndParentFolderTestItemsForFeature
           sfp = uri.path.substring(backend/features.path.length + 1)  ← pick right root
           folderTestItemId = uriId(backend/features) + "/" + sfp
   _parseStepsFiles — loop over stepsSearchUris [1 entry]
       collect step dirs, call loadFromBehave(pythonExec, projectUri=monorepo, …)
       storeBehaveStepDefinitions(featuresUris[0], …)
          |
          v
Test Explorer shows backend features under the workspace
```

### Data Flow: Multi-Path (`paths = featuresA\nfeaturesB` in behave.ini)

```
hasFeaturesFolder → Branch B → scanForBehaveConfig → configResult.ok
   rawPaths = ["featuresA", "featuresB"]
   resolvedPaths = [wksp/featuresA, wksp/featuresB]
   existingPaths = both exist → featuresUris = both
          |
          v
discoveryCache.set(…, { featuresUris: [wksp/featuresA, wksp/featuresB] })
          |
          v
WorkspaceSettings.featuresUris = [wksp/featuresA, wksp/featuresB]
                 .stepsSearchUris = [stepsSearchFor(A), stepsSearchFor(B)]
          |
          v
parseFilesForWorkspace
   loop i=0 (featuresA):
       _parseFeatureFiles → findFiles(featuresA) → parse, create test items under featuresUris[0]
       deleteFeatureFileSteps(featuresA), rebuildStepMappings(featuresA)
   loop i=1 (featuresB):
       same for featuresB
   Each root owns its own StepMapping set keyed by uriId(featuresUris[i]).
          |
          v
Test Explorer shows (workspace) → featuresA/… + featuresB/… as siblings
   (No per-feature-root wrapper TestItem — see section below.)
          |
          v
User clicks Run Tests
   testRunHandler queue-filter: item.test.id.includes(uriId(featuresA)) || includes(uriId(featuresB))
          |
          v
runOrDebugAllFeaturesInOneInstance
   cd = projectUri (monorepo)
   spawn behave (no -i flag) — behave reads behave.ini paths=featuresA,featuresB itself
          |
          v
Tests execute across both roots in one behave process
```

### Test-Tree Wrapper Question: Per-Feature-Root TestItem?

**Recommendation: NO wrapper TestItem per feature root. Keep features flat under the workspace node (matching today's shape for the multi-root case).**

Reasoning:
1. **ID-prefix keying already handles separation.** Feature items are created with `id = uriId(feature_file_uri)`. No ambiguity — featuresA/foo.feature and featuresB/foo.feature get distinct ids automatically.
2. **Folder hierarchy builder** (`_getOrCreateFeatureTestItemAndParentFolderTestItemsForFeature`, lines 356–395) already computes `folderTestItemId = uriId(featuresUris[i]) + "/" + path`. Two different `featuresUris` yield two disjoint folder-item trees — visually they appear as separate top-level folders under the workspace.
3. **The existing multi-root wrapper (`wkspGrandParent`) stays.** When `getUrisOfWkspFoldersWithFeatures().length > 1`, there's a workspace wrapper. Features from featuresA and featuresB both live under it, appearing as parallel folders.
4. **Adding a per-root wrapper** would force a breaking UX change: today, a single-root workspace shows `my-workspace > features > foo.feature`. Adding a wrapper would make it `my-workspace > features-root-1 > foo.feature`. Every user's tree depth increases by one. Not worth it.
5. **Run-queue filtering** (`testRunHandler.ts:199`) is the one place where the single `idMatch = uriId(featuresUri)` assumption breaks. That's a 3-line change (build a union of all `uriId(featuresUris[i])` matchers), not a tree-structure overhaul.

---

## Build Order (Phase Decomposition)

Five phases, each independently testable. Unit-test-compatible all the way through; integration tests land in phase 4.

### Phase 1 — Internal Multi-Path Types (no UX impact)

**Scope:**
- `DiscoveryEntry.featuresUris: vscode.Uri[]` (common.ts) — new field; keep old `featuresUri` as a **getter** temporarily (returns `featuresUris[0]`) so unrelated call sites don't break mid-phase.
- `WorkspaceSettings.featuresUris / stepsSearchUris / projectRelativeFeaturesPaths / workspaceRelativeFeaturesPaths` — arrays + singular getters for back-compat.
- `BehaveConfigResult.resolvedPaths: vscode.Uri[]` (configParser.ts) — swap `resolvedPath` → `resolvedPaths`. No behavior change for single-path configs.
- `hasFeaturesFolder` — populates arrays even in single-path case (arrays of length 1).

**Why first:** Everything else depends on the type. Getters keep unrelated code compiling. Zero external-behavior change means low blast radius.

**Testing:** Unit tests on `WorkspaceSettings` and `common.hasFeaturesFolder` — assert single-path workspaces still produce arrays of length 1 and all existing call sites still work via the getters.

### Phase 2 — Parser, Test-Tree, Watcher Multi-Root Iteration

**Scope:**
- `fileParser.ts::_parseFeatureFiles`, `_parseStepsFiles`, `reparseFile`, test-tree folder logic, step-mappings rebuild — loop per feature root.
- `workspaceWatcher.ts` — one FS watcher per `workspaceRelativeFeaturesPaths[i]`.
- `junitParser.ts::getjUnitName` — trim whichever `workspaceRelativeFeaturesPaths[i]` is a prefix.
- `testRunHandler.ts:199` — build matcher union across all `featuresUris[i]`.
- `extension.ts:199` — `onStepMappingsRebuilt` matches against `featuresUris.some(…)`.
- Handlers that union across roots (`autoCompleteProvider`, `codeLensProvider`, `stepDiagnostics`). Fixture handlers get the **per-document-root** scoping.

**Why second:** Depends on Phase 1 types. Still no UX visible — if user has single-path config, arrays have length 1 and loops degenerate to single iteration. We can merge this phase with 0 user-facing changes.

**Why not combined with Phase 1:** Phase 1 is a mechanical type change with compilation-only risk. Phase 2 is logic changes with behavior risk (test-tree rebuild, watcher registration, junit name matching). Splitting keeps code review digestible and lets us ship Phase 1 independently if Phase 2 regresses.

**Testing:** Unit tests exercising multi-path via a mocked `WorkspaceSettings` with `featuresUris.length === 2`. Key assertions:
- Two disjoint folder trees are created.
- Step mappings produced for both roots are present in `stepMappings`.
- JUnit name trimming works for features under either root.

### Phase 3 — Subdirectory Config Scan (`src/discovery/configScanner.ts`)

**Scope:**
- Add `src/discovery/configScanner.ts` with `scanForBehaveConfig(wkspUri, maxDepth)`.
- `common.ts::hasFeaturesFolder` Branch B uses `scanForBehaveConfig` instead of `findBehaveConfig(folder.uri)` directly.
- `package.json` — new `gs-behave-bdd.discoveryDepth` setting (default 3, min 0, max 10).
- `configWatcher.ts` — change glob to depth-aware `{,*/,*/*/,*/*/*/}{behave.ini,…}` (or equivalent for the configured depth).
- `DiscoveryEntry.alsoFoundConfigs: vscode.Uri[]` (optional) to surface ambiguity.
- `updateDiscoveryUX` in `extension.ts` — when `alsoFoundConfigs.length > 0`, show notification "Multiple behave configs found under /monorepo; using /monorepo/backend/behave.ini. Set `projectPath` to override."

**Why third:** Requires Phase 1 (`resolvedPaths: vscode.Uri[]`) and is independent of Phase 2 (subdir scan works whether root config has single or multi path). Can run in parallel with Phase 2 if a developer wants, but depending on ordering we recommend sequential for reviewability.

**Testing:**
- Unit test on `scanForBehaveConfig` with a tmp-dir fixture — verify BFS order, depth cap, exclude list.
- Integration test: workspace with no root config + `backend/behave.ini` → test tree shows backend features.
- Integration test: workspace with **two** subdir configs → first-match wins, warning fires.

### Phase 4 — `featuresPaths` settings.json Key (user-facing multi-path)

**Scope:**
- `package.json` — add `gs-behave-bdd.featuresPaths: string[]` (alongside existing `featuresPath: string`).
- `WorkspaceSettings` constructor — prefer `featuresPaths` if set at any scope, else fall back to singular `featuresPath`, else discovery entry.
- `common.ts::hasExplicitSetting` — treat `featuresPaths` **and** `featuresPath` as explicit (either one triggers Branch A).
- Settings descriptions — update `featuresPath` to point at `featuresPaths` for multi-path users.

**Why fourth:** Needs Phase 1 (internal arrays) and Phase 2 (parser/watcher iteration) working end-to-end. Phase 3 is technically independent but by this point the whole stack is multi-path-ready and surfacing it as a user setting is mostly UX/doc work.

**Testing:**
- Unit test: `WorkspaceSettings` with `featuresPaths = ["a", "b"]` → `featuresUris.length === 2`.
- Unit test: `featuresPaths` set + `featuresPath` set → `featuresPaths` wins.
- Integration test: example project with `featuresPaths: ["featuresA", "featuresB"]` and verify both trees appear.

### Phase 5 — UX Polish + Regression Hardening

**Scope:**
- Add integration tests for the combinations: multi-path from config-file, multi-path from settings.json, subdir config with multi-path, multi-path within one of `alsoFoundConfigs`.
- Flakiness gate: run each new integration suite 3× on CI (matches 1.1.0 gate).
- Documentation updates in READMEs (if requested).
- `logSettings` output in `settings.ts:261-267` — make `featuresUris` a sensible display string (currently uses singular `featuresUri`).
- `configWatcher`-depth edge cases: what happens if `discoveryDepth=0`? → no subdir scan, identical to 1.1.0 behaviour.

**Why fifth:** Everything depends on correct multi-path + subdir-scan behavior. Final phase is integration coverage + polish.

---

## Phase Dependency Graph

```
Phase 1 (types)
   │
   ├──> Phase 2 (parser/watcher loops)  ─┐
   │                                      │
   ├──> Phase 3 (subdir scan)            ─┤
   │                                      │
   └──> (if 2 and 3 done) ──> Phase 4 (settings.json featuresPaths)
                                           │
                                           v
                                       Phase 5 (polish + regression)
```

- Phase 1 blocks everything.
- Phases 2 and 3 are independent — can be parallelized across developers or merged in either order.
- Phase 4 needs both 2 and 3 (featuresPaths is the user-visible multi-path trigger, and it must coexist with config-file discovery that may itself be multi-path).
- Phase 5 needs 1–4.

Realistic merge order: **1 → 2 → 3 → 4 → 5**. Or if parallelizing: **1 → {2, 3 in parallel} → 4 → 5**.

---

## Cross-Cutting Design Rules

### 1. Singular Getters Stay for Back-Compat

`WorkspaceSettings.featuresUri` (getter → `featuresUris[0]`) lets any call site that doesn't care about multi-path keep working. The **only** call sites that MUST be migrated to plural are:
- Loops in `fileParser.ts`.
- Watcher setup in `workspaceWatcher.ts`.
- Queue-filter in `testRunHandler.ts:199`.
- Union handlers (autoComplete, codeLens, stepDiagnostics).
- Per-root-scoped handlers (fixtureProviders, fixtureDiagnostics) — **behavior-correctness** issue for multi-path.

Everything else (settings logging, diagnostics for single-file validation, step-mapping identity) either already operates per-root or can use `featuresUris[0]` safely.

### 2. Per-Document Root Resolution Helper

Add a utility in `common.ts`:

```typescript
export function getFeaturesRootForFile(
  wkspSettings: WorkspaceSettings,
  fileUri: vscode.Uri
): vscode.Uri | undefined {
  return wkspSettings.featuresUris.find(root =>
    fileUri.path.startsWith(root.path + "/") || urisMatch(fileUri, root)
  );
}
```

Used by:
- `fileParser.ts:359` (substring prefix)
- `fixtureProviders.ts`, `fixtureDiagnostics.ts` (scope fixtures/tags to their owning root)
- `junitParser.ts:204` (pick the right `workspaceRelativeFeaturesPaths[i]` to trim)
- `onStepMappingsRebuilt` handler (identify which root rebuilt)

Centralizing the lookup prevents subtle bugs where one call-site uses `startsWith(root.path)` (matches both `featuresA` and `featuresAA`) versus `startsWith(root.path + "/")` (correct).

### 3. Subdir Scan Does NOT Cross Workspace-Folder Boundaries

`scanForBehaveConfig(wkspUri, depth)` only ever reads subdirectories of `wkspUri`. It will never look at sibling workspace folders. This matches the existing per-workspace-folder discovery isolation and keeps multi-root semantics clean.

### 4. Config Watcher Depth Must Track `discoveryDepth` Setting

If the user sets `discoveryDepth = 5`, the config watcher's glob must also cover depths 0..5. Rebuild the watcher on setting change. Reuse the existing `configurationChangedHandler` path — a change to `gs-behave-bdd.discoveryDepth` triggers the same "reload everything" flow as changing `projectPath`. Minimal code change: the `affectsConfiguration("gs-behave-bdd")` check at `extension.ts:591` already catches it.

### 5. First-Match Policy for Multiple Subdir Configs

When `scanForBehaveConfig` finds more than one valid config, it picks the **BFS-first** (= shallowest, then lexicographically first at same depth). The others are reported in `alsoFound` so the UX layer can show:

> "Multiple behave configs detected. Using `backend/behave.ini`. Other configs found: `services/api/pyproject.toml`. Set `projectPath` to use a different one."

This is explicitly **not** multi-project support (MULTI-01/02 still deferred). It's "one project per workspace folder, with a clear signal when that assumption is violated."

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Retrofit `featuresUris` into `StepMapping`

Tempting because `StepMapping` has `featuresUri` (singular). **Don't.** Each mapping is scoped to exactly one feature root (the root its `featureFileStep` was parsed from). Leaving it singular preserves per-mapping identity and lets `getStepMappings(featuresUri)` still work as a per-root filter.

### Anti-Pattern 2: Flatten All Feature Roots into One findFiles Call

```typescript
// BAD:
const combinedUri = vscode.Uri.joinPath(wkspSettings.projectUri);
const featureFiles = await findFiles(combinedUri, undefined, ".feature", cancelToken);
```

Looks like less code. Breaks in two ways:
1. `findFiles` scans `wkspSettings.projectUri`, which might also contain other things (scripts, docs, etc.) — picks up unintended `.feature` files.
2. Test-tree folder keying via `substring(featuresUri.path.length + 1)` fails — no single `featuresUri` to subtract from all files.

Correct pattern: loop `for (const root of wkspSettings.featuresUris) { await findFiles(root, …); }` and accumulate.

### Anti-Pattern 3: Arbitrary-Depth Subdir Scan

```typescript
// BAD: unbounded recursion
function scanForBehaveConfig(uri: vscode.Uri): BehaveConfigResult | undefined {
  const result = findBehaveConfig(uri);
  if (result) return result;
  for (const child of subdirs(uri)) {
    const childResult = scanForBehaveConfig(child);
    if (childResult) return childResult;
  }
  return undefined;
}
```

- Performance: would walk into `node_modules`, `.venv`, `dist`, etc. Hit the `getUrisOfWkspFoldersWithFeatures < 1ms` SLA hard.
- False positives: repo-level tooling configs (some linters use `pyproject.toml` with no `[tool.behave]` section — OK today, but a nested `pyproject.toml` in a sub-dependency could match).

Bounded depth (default 3) + exclude list (`node_modules`, `.git`, etc.) + BFS for shallow-wins keeps the scan predictable and monorepo-safe.

### Anti-Pattern 4: Blindly Use `featuresUris[0]` Everywhere

Default-to-`[0]` **where it's safe** (singular getter for back-compat). **Not safe** for:
- Run queue filtering (`testRunHandler.ts:199`) — tests from featuresUris[1] would silently not run.
- Watcher setup (`workspaceWatcher.ts`) — fs changes in featuresUris[1] would be ignored.
- Any handler that aggregates across the workspace (autoCompleteProvider, stepDiagnostics) — would miss steps from other roots.

Rule of thumb: if the call site is an **aggregation over the workspace**, migrate to plural. If the call site is **"this specific file's owning root"**, use the per-document helper.

### Anti-Pattern 5: Report Per-Root State Via Singular Logging

```typescript
// BAD — today's line:
config.logger.logInfo(`Features directory: ${entry.featuresUri.fsPath}`, wkspUri);
```

Becomes a lie the moment multi-path lands (which directory does "the" features directory refer to?). Replace with:

```typescript
// GOOD:
config.logger.logInfo(
  `Features directories: ${entry.featuresUris.map(u => u.fsPath).join(", ")}`,
  wkspUri
);
```

Apply to every log line and diagLog that references a single features location.

---

## Integration Point Summary (file:function → change)

| Integration Point | File:Function | Change Type |
|-------------------|---------------|-------------|
| Discovery type | `src/common.ts:32 DiscoveryEntry` | **Schema change** — `featuresUri` → `featuresUris[]`, add `alsoFoundConfigs?` |
| Discovery writer | `src/common.ts:177 hasFeaturesFolder` | **Rewrite Branch B** to use `scanForBehaveConfig`; emit arrays in all branches |
| Config parsing | `src/parsers/configParser.ts:12 BehaveConfigResult / 158 resolvePaths` | **Schema change** — `resolvedPath` → `resolvedPaths[]`; add `resolveAllPaths` |
| Subdir scan | `src/discovery/configScanner.ts` | **New module** — BFS-bounded scan with exclude list |
| Settings type | `src/settings.ts:59 WorkspaceSettings` | **Schema change** — add `featuresUris[] / stepsSearchUris[] / projectRelativeFeaturesPaths[] / workspaceRelativeFeaturesPaths[]`; keep singular getters |
| Settings input | `src/settings.ts:116 featuresPathCfg` | **Schema change** — read `featuresPaths[]` with fallback to `featuresPath` |
| Test tree build | `src/parsers/fileParser.ts:133 _parseFeatureFiles` | **Loop per root** |
| Test tree folder keying | `src/parsers/fileParser.ts:359 sfp / 366 folderTestItemId` | **Per-file root selection** via `getFeaturesRootForFile` |
| Steps parsing | `src/parsers/fileParser.ts:176 _parseStepsFiles` | **Loop per root** |
| Step mappings rebuild | `src/parsers/fileParser.ts:512 rebuildStepMappings` | **Loop per root** |
| Python reparse | `src/parsers/fileParser.ts:612 _debouncePythonReparse` | **Per-file root selection** for the key + mapping rebuild |
| Feature FS watcher | `src/watchers/workspaceWatcher.ts:14` | **One watcher per root** |
| Config FS watcher | `src/watchers/configWatcher.ts:31 pattern` | **Depth-aware glob** `{,*/,*/*/,*/*/*/}{configs}` |
| Run queue filter | `src/runners/testRunHandler.ts:199 idMatch` | **Union match** across `featuresUris` |
| Run guard | `src/runners/testRunHandler.ts:90 checkRunGuard` | **No change** — already per-workspace |
| Behave CLI | `src/runners/runOrDebug.ts:38 runOrDebugAllFeaturesInOneInstance` | **No change** — behave resolves paths itself |
| JUnit name trim | `src/parsers/junitParser.ts:204 getjUnitName` | **Per-feature root trim** |
| JUnit sibling-steps | `src/parsers/junitParser.ts:207 stepsSearchUri check` | **Per-root prefix check** |
| Extension activation | `src/extension.ts:195 onStepMappingsRebuilt` | **`featuresUris.some` prefix check** |
| Extension UX logging | `src/extension.ts:79 updateDiscoveryUX` | **Plural log output** |
| AutoComplete | `src/handlers/autoCompleteProvider.ts:39` | **Union across roots** |
| CodeLens | `src/handlers/codeLensProvider.ts:59` | **Union across roots** |
| Step diagnostics | `src/handlers/stepDiagnostics.ts:25,28` | **Per-document root scoping** (cleanest) |
| Fixture providers | `src/handlers/fixtureProviders.ts:33,87,153,169` | **Per-document root scoping** (required for correctness) |
| Fixture diagnostics | `src/handlers/fixtureDiagnostics.ts:24,25,32` | **Per-document root scoping** |
| Test harness | `src/testWorkspaceConfig.ts:16,35,125,173…` | **Mirror plural fields** |
| Settings schema | `package.json` | **Add `gs-behave-bdd.featuresPaths` + `gs-behave-bdd.discoveryDepth`** |

---

## Sources

- Direct source analysis of the entire `src/` tree (commit 4a684d3, 1.1.0 shipped):
  - `src/common.ts` (DiscoveryEntry, discoveryCache, `hasFeaturesFolder` closure)
  - `src/settings.ts` (WorkspaceSettings constructor, all field derivations)
  - `src/extension.ts` (`activate`, `updateDiscoveryUX`, `configurationChangedHandler`, `onStepMappingsRebuilt`)
  - `src/parsers/configParser.ts` (BehaveConfigResult, `findBehaveConfig`, `parseIniConfig`, `parseTomlConfig`, `resolvePaths`)
  - `src/parsers/fileParser.ts` (`_parseFeatureFiles`, `_parseStepsFiles`, `_getOrCreateFeatureTestItemAndParentFolderTestItemsForFeature`, `reparseFile`, `_debouncePythonReparse`)
  - `src/parsers/testFile.ts` (TestFile, Scenario, `createScenarioTestItemsFromFeatureFileContent`)
  - `src/parsers/stepMappings.ts` (StepMapping class, `rebuildStepMappings`)
  - `src/parsers/junitParser.ts` (`getjUnitName` using `workspaceRelativeFeaturesPath`)
  - `src/runners/testRunHandler.ts` (WkspRun, `checkRunGuard`, `runTestQueue` queue-filter logic)
  - `src/runners/runOrDebug.ts` (behave argv construction — path-agnostic)
  - `src/runners/behaveRun.ts` (spawn uses `projectUri` as cwd — no change)
  - `src/watchers/workspaceWatcher.ts` (`RelativePattern(workspaceRelativeFeaturesPath)`)
  - `src/watchers/configWatcher.ts` (glob, debounce map, direct cache-invalidation path)
  - `src/handlers/*` (autoComplete, codeLens, fixtureProviders, fixtureDiagnostics, stepDiagnostics, findStepReferencesHandler)
  - `src/testWorkspaceConfig.ts` (test-harness singular fields that must mirror plural)
- `.planning/PROJECT.md` — 1.2.0 scoping decisions (locked 2026-04-17)
- `.planning/research/ARCHITECTURE.md` (prior 1.1.0 baseline — informs the "what exists today" section)
- `package.json` — current `gs-behave-bdd.projectPath` / `.featuresPath` scope=resource schema

---
*Architecture research for: 1.2.0 Multi-Path & Monorepo-Aware Discovery*
*Researched: 2026-04-17*
