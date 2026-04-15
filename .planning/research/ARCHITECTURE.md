# Architecture Patterns: Auto-Discovery Integration

**Domain:** VS Code extension — config file discovery added to existing extension
**Researched:** 2026-04-15
**Scope:** How `behaveConfigDiscovery.ts` fits into the established layer model

---

## Recommended Architecture

Discovery is a new sub-layer that sits inside the **Configuration Layer**, between the raw VS Code settings API and `WorkspaceSettings` construction. It is not a peer layer — it is a pure service called by `WorkspaceSettings` during construction and by `getUrisOfWkspFoldersWithFeatures()` during workspace activation.

```
Extension (extension.ts)
  └── getUrisOfWkspFoldersWithFeatures()    [common.ts — must stay < 1ms]
        └── behaveConfigDiscovery (cache read only, sync)
  └── config.reloadSettings()               [configuration.ts]
        └── new WorkspaceSettings()         [settings.ts]
              └── behaveConfigDiscovery      [behaveConfigDiscovery.ts]
                    ├── INI parser (inline)
                    └── TOML parser (smol-toml)

Parsing Layer                               [parsers/fileParser.ts, featureParser.ts, etc.]
  └── receives wkspSettings.featuresUris[]  (was featuresUri, now array)

Test Framework Layer                        [runners/testRunHandler.ts, runOrDebug.ts]
  └── receives wkspSettings.featuresUri     (backward-compat getter → featuresUris[0])

Watchers Layer                              [watchers/workspaceWatcher.ts]
  └── receives wkspSettings (uses featuresUri for pattern, unchanged)
```

---

## Component Boundaries

| Component | File | Responsibility | Communicates With |
|-----------|------|----------------|-------------------|
| `behaveConfigDiscovery` | `src/behaveConfigDiscovery.ts` | Find config files via subdirectory scan; parse INI/TOML; return resolved `Uri[]`; maintain module-level cache | Called by `WorkspaceSettings` constructor and `hasFeaturesFolder()` in `common.ts` |
| `WorkspaceSettings` | `src/settings.ts` | Consume discovery result; apply priority (settings > config-file > convention); expose `featuresUris[]` and `featuresUri` getter; expose `discoverySource` and `configFileUri` | Calls `behaveConfigDiscovery`; consumed by all layers |
| `getUrisOfWkspFoldersWithFeatures()` | `src/common.ts` | Gate which workspace folders are active; must remain < 1ms | Reads discovery cache (synchronous, no I/O) |
| `fileParser.ts` | `src/parsers/fileParser.ts` | Iterate `featuresUris[]` for feature file scanning and step mapping | Receives `WorkspaceSettings` |
| `stepMappings.ts` | `src/parsers/stepMappings.ts` | Already keyed by `featuresUri`; needs iteration for multi-path | Receives `featuresUri` per call |
| `featureParser.ts` | `src/parsers/featureParser.ts` | Already keyed by `featuresUri`; no interface change needed | Receives `featuresUri` per call |
| `workspaceWatcher.ts` | `src/watchers/workspaceWatcher.ts` | Watch `workspaceRelativeFeaturesPath` glob — needs to watch each path in `featuresUris[]` | Reads `WorkspaceSettings` |
| `testRunHandler.ts` / `runOrDebug.ts` | `src/runners/` | Reference `featuresUri` (singular); backward-compat getter means no change required in this milestone | Reads `WorkspaceSettings` |

---

## Data Flow

### Startup / Settings Load Path (async, happens once per workspace)

```
vscode workspace opens
  → extension.activate()
  → getUrisOfWkspFoldersWithFeatures(forceRefresh=true)
      → hasFeaturesFolder(folder)
          → behaveConfigDiscovery.discoverAsync(folder.uri, depth)   [populates cache]
          → returns true if any featuresUri exists on disk
  → config.reloadSettings(wkspUri)
      → new WorkspaceSettings(wkspUri, ...)
          → reads inspect() for projectPath / featuresPath
          → if NOT explicitly set → behaveConfigDiscovery.getFromCache(wkspUri)
          → resolves featuresUris[] from discovery result or convention
          → sets discoverySource, configFileUri
  → parser.clearTestItemsAndParseFilesForAllWorkspaces()
      → parseFilesForWorkspace(wkspUri)
          → _parseFeatureFiles(wkspSettings)
              → for each uri in wkspSettings.featuresUris:
                  findFiles(uri, ...) → feature URIs
          → _parseStepsFiles(wkspSettings)
              → uses wkspSettings.featuresUri (singular, first entry) for
                 stepsSearchUri resolution (unchanged)
          → rebuildStepMappings(wkspSettings.featuresUri)
              → called once per unique featuresUris[] entry
```

### Hot Path — Repeated Calls to `getUrisOfWkspFoldersWithFeatures()` (must be < 1ms)

```
any event handler or language provider
  → getUrisOfWkspFoldersWithFeatures()        [cache hit: returns module-level array]
      NO I/O, no discovery, pure memory read
```

The discovery scan is only triggered on `forceRefresh=true`, which happens at activation and on configuration change events. All other calls are cache reads.

### Cache Invalidation Triggers

```
onDidChangeConfiguration event
  → configurationChangedHandler()
      → getUrisOfWkspFoldersWithFeatures(forceRefresh=true)  [clears behaveConfigDiscovery cache too]
      → config.reloadSettings()                               [re-runs WorkspaceSettings constructor]

onDidChangeWorkspaceFolders event
  → same path as above
```

File system watchers for config files themselves (`behave.ini`, `.behaverc` etc.) are **out of scope for Milestone 1** — only workspace/settings changes trigger re-discovery.

---

## Key Design Decisions

### Discovery Module Is Stateless Except for Its Cache

`behaveConfigDiscovery.ts` exports pure functions plus a module-level `Map<string, DiscoveryResult>` cache keyed by workspace URI string. It holds no reference to VS Code APIs beyond what it needs to read the filesystem. This keeps it testable in isolation without a VS Code host.

### Priority Logic Lives in `WorkspaceSettings`, Not in Discovery

`behaveConfigDiscovery` answers only "what does the config file say?" The priority decision (settings > config-file > convention) is made in `WorkspaceSettings` constructor using `inspect()`, which already has the `getWithLegacyFallback` pattern. This keeps priority logic co-located with all other settings resolution.

### `featuresUri` Backward-Compat Getter

```typescript
// WorkspaceSettings addition
public readonly featuresUris: vscode.Uri[];

public get featuresUri(): vscode.Uri {
  return this.featuresUris[0];
}
```

Runners (`runOrDebug.ts`, `testRunHandler.ts`) and watchers reference `wkspSettings.featuresUri`. The getter means zero changes needed in those files for Milestone 1. Multi-path awareness in runners is deferred to Milestone 3.

### `workspaceWatcher.ts` Needs Multi-Path Iteration

The watcher creates one `RelativePattern` per features path. With `featuresUris[]`, it must create one watcher per entry. This is the one downstream consumer that cannot use the `featuresUri` getter shortcut, because it needs to watch all paths:

```typescript
// Before: one watcher
const pattern = new vscode.RelativePattern(wkspSettings.uri, `${wkspSettings.workspaceRelativeFeaturesPath}/**`);

// After: one watcher per features path
for (const featuresUri of wkspSettings.featuresUris) {
  const relPath = vscode.workspace.asRelativePath(featuresUri, false);
  const pattern = new vscode.RelativePattern(wkspSettings.uri, `${relPath}/**`);
  // create watcher, push to watchers[]
}
```

### `fileParser.ts` Feature Scan Iteration

`_parseFeatureFiles` currently calls `findFiles(wkspSettings.featuresUri, ...)`. With multi-path:

```typescript
// After: iterate featuresUris
for (const featuresUri of wkspSettings.featuresUris) {
  deleteFeatureFileSteps(featuresUri);
  deleteStepMappings(featuresUri);
  const files = await findFiles(featuresUri, undefined, ".feature", cancelToken);
  // process files ...
}
```

`deleteFeatureFileSteps` and `deleteStepMappings` are already keyed by `featuresUri`, so they work correctly per-path without changes to their own internals.

### `_parseStepsFiles` Is Unaffected

Step file discovery is driven by `wkspSettings.stepsSearchUri`, which is derived from `featuresUri` (the first entry). Behave's own model is one `steps/` folder per project root, not per features path. This is correct: multi-path `paths=` in a behave config file refers to multiple feature locations under a single project, sharing one `steps/` dir.

---

## `behaveConfigDiscovery.ts` Internal Structure

```typescript
// Module-level cache — cleared on forceRefresh
const _cache = new Map<string, DiscoveryResult | null>();

export interface DiscoveryResult {
  configFileUri: vscode.Uri;
  configType: "behave.ini" | ".behaverc" | "setup.cfg" | "tox.ini" | "pyproject.toml";
  featuresUris: vscode.Uri[];     // resolved absolute URIs from paths= key
  projectUri: vscode.Uri;         // config file directory
  discoverySource: "config-file"; // always config-file when this module has a result
}

// Primary entry point: scan wkspUri up to `depth` subdirectory levels
// Returns null if no config file found or config has no usable paths
export async function discoverBehaveConfig(
  wkspUri: vscode.Uri,
  depth: number,
  cancelToken: vscode.CancellationToken
): Promise<DiscoveryResult | null>

// Synchronous cache read — safe to call from hot paths after first run
export function getDiscoveryCacheEntry(wkspUri: vscode.Uri): DiscoveryResult | null | undefined

// Called on configuration change or workspace folder change
export function clearDiscoveryCache(wkspUri?: vscode.Uri): void

// Internal: try to find and parse a config file at a single directory
function _tryParseConfigAt(dirUri: vscode.Uri): Promise<DiscoveryResult | null>

// Internal: parse [behave] paths= from INI content
function _parseIniPaths(content: string, configUri: vscode.Uri): vscode.Uri[] | null

// Internal: parse [tool.behave] paths from TOML content  
function _parseTomlPaths(content: string, configUri: vscode.Uri): vscode.Uri[] | null
```

---

## `WorkspaceSettings` Changes

New fields added to `WorkspaceSettings`:

```typescript
// New in this milestone
public readonly featuresUris: vscode.Uri[];            // replaces scalar featuresUri
public readonly discoverySource: "config-file" | "convention" | "settings";
public readonly configFileUri: vscode.Uri | undefined; // set when discoverySource === "config-file"

// Backward-compat getter (no readonly keyword — it's a getter, not a property)
public get featuresUri(): vscode.Uri {
  return this.featuresUris[0];
}
```

The constructor priority logic:

```typescript
const isManual = /* inspect() check for projectPath OR featuresPath at any scope */;

if (isManual) {
  this.featuresUris = [/* existing single-URI resolution logic */];
  this.discoverySource = "settings";
  this.configFileUri = undefined;
} else {
  const discovered = getDiscoveryCacheEntry(wkspUri);
  if (discovered) {
    this.featuresUris = discovered.featuresUris;
    this.discoverySource = "config-file";
    this.configFileUri = discovered.configFileUri;
  } else {
    this.featuresUris = [vscode.Uri.joinPath(this.projectUri, "features")];
    this.discoverySource = "convention";
    this.configFileUri = undefined;
  }
}
```

The existing `workspaceRelativeFeaturesPath` and `stepsSearchUri` computations continue to use `featuresUris[0]` — no change to those.

---

## Scalability Considerations

| Concern | Single-root, single features path | Multi-path (3 paths) | Deep monorepo (depth 3) |
|---------|----------------------------------|----------------------|------------------------|
| `getUrisOfWkspFoldersWithFeatures()` latency | < 1ms (cached) | < 1ms (cached) | < 1ms (cached) |
| Discovery scan latency (first run only) | < 20ms (sync fs walk) | same | up to ~150ms depending on tree size |
| Watcher count | 1 per workspace | 3 per workspace | 1 per workspace (single config found) |
| `rebuildStepMappings` calls | 1 per workspace | 1 per featuresUri entry | 1 per workspace |
| Memory (cache) | 1 entry per workspace | 1 entry per workspace | 1 entry per workspace |

Discovery scan cost is paid once at activation and on settings change. It is not in any hot path.

---

## Suggested Build Order (Phase Dependencies)

The milestone has these components with hard dependencies:

```
1. behaveConfigDiscovery.ts (new module)
   └── No deps on other new code. Can be built and unit-tested in isolation.

2. WorkspaceSettings: featuresUris[] + discoverySource + configFileUri
   └── Depends on: behaveConfigDiscovery (must exist to call getDiscoveryCacheEntry)
   └── Introduces backward-compat featuresUri getter

3. getUrisOfWkspFoldersWithFeatures() update
   └── Depends on: behaveConfigDiscovery (must exist to call discoverBehaveConfig)
   └── Depends on: WorkspaceSettings (to confirm the returned URI is valid)

4. fileParser.ts: iterate featuresUris[]
   └── Depends on: WorkspaceSettings change (featuresUris[] must exist)

5. workspaceWatcher.ts: multi-path watcher creation
   └── Depends on: WorkspaceSettings change (featuresUris[] must exist)

6. stepMappings.ts: call rebuildStepMappings per featuresUri
   └── Depends on: fileParser change (called from inside fileParser loop)

7. package.json: discoveryDepth setting + activation events
   └── No code deps; can be done in parallel with step 1

8. Output channel logging + status bar discoverySource display
   └── Depends on: WorkspaceSettings discoverySource field (step 2)

9. Error handling: parse errors → warning notification + convention fallback
   └── Depends on: behaveConfigDiscovery (error propagation path)

10. Unit tests (all formats, priority, edge cases)
    └── Depends on: behaveConfigDiscovery and WorkspaceSettings final interfaces

11. Integration test projects (config-only/, pyproject-config/, multi-features/)
    └── Depends on: all above
```

**Critical path:** steps 1 → 2 → 3 → 4 → 5. These must be implemented sequentially. Steps 7, 8, 9 can be parallelised alongside steps 2-4.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Calling Discovery Inside the Hot Path

`getUrisOfWkspFoldersWithFeatures()` is called from language service providers (hover, completion, definition) on every user interaction. Discovery I/O inside this function would freeze the editor.

**Instead:** Discovery runs once during `forceRefresh=true` calls. All other calls read the module-level cache synchronously.

### Anti-Pattern 2: Putting Priority Logic Inside `behaveConfigDiscovery`

The discovery module should not know about VS Code settings. It only reads files. `WorkspaceSettings` owns priority because it already owns the `inspect()` pattern for detecting explicit settings.

### Anti-Pattern 3: Removing the `featuresUri` Scalar Property

The scalar `featuresUri` is referenced in 12+ call sites across runners, handlers, and watchers. Removing it without a backward-compat getter would require a large simultaneous refactor across all layers. The getter approach localises all change to `WorkspaceSettings` for this milestone.

### Anti-Pattern 4: One Watcher for All Paths via Glob Union

VS Code `RelativePattern` does not support `{path1,path2}` glob unions reliably across platforms. Create one `FileSystemWatcher` per features path — they are cheap, and cleanup on dispose is already handled by iterating the existing `watchers[]` array.

### Anti-Pattern 5: TOML Hand-Rolled Regex Parsing

`pyproject.toml` TOML is not parseable with regex because the `paths` array spans multiple lines and may include inline comments. Use `smol-toml` — it is 5KB, has no dependencies, and correctly handles all TOML edge cases. Using regex risks diverging from behave's own `tomllib` parsing behavior.

---

## Sources

- Direct source analysis of `src/common.ts`, `src/settings.ts`, `src/configuration.ts`, `src/parsers/fileParser.ts`, `src/parsers/stepMappings.ts`, `src/watchers/workspaceWatcher.ts`, `src/runners/testRunHandler.ts`, `src/runners/runOrDebug.ts`
- `.planning/PROJECT.md` — milestone requirements and constraints
- `.planning/codebase/ARCHITECTURE.md` — existing layer documentation
- `bundled/libs/behave/configuration.py` — behave config file resolution reference (per PROJECT.md)
