# Architecture Patterns: Config File Watching and Run Guard

**Domain:** VS Code extension — v1.1 additions to existing auto-discovery extension
**Researched:** 2026-04-16
**Scope:** How config file watchers integrate with the existing watcher/discovery architecture, and where the run guard hooks into test execution. Milestone 1 (v1.0) is fully shipped; this document is forward-looking for v1.1.

---

## Current State After v1.0 (What Already Exists)

Before analysing what to add, the actual implementation matters. The v1.0 implementation differs in one significant way from what the previous ARCHITECTURE.md planned:

**The discovery + cache is NOT in a separate `behaveConfigDiscovery.ts` module.** It lives entirely inside `src/common.ts`:
- `discoveryCache` is a module-level `Map<string, DiscoveryEntry>` in `common.ts`
- `getUrisOfWkspFoldersWithFeatures()` in `common.ts` populates the cache inline (via the `hasFeaturesFolder` closure)
- `configParser.ts` is stateless — it parses a file and returns a `BehaveConfigResult`
- `getDiscoveryEntry(wkspUri)` in `common.ts` is the synchronous cache read
- `WorkspaceSettings` already has `discoverySource` and `configFileUri` fields
- `extension.ts` has `updateDiscoveryUX()` which reads the cache and shows warning notifications + Problems diagnostics

The architecture for v1.1 must work with this actual implementation, not the planned one.

### Actual Data Model (DiscoveryEntry in common.ts)

```typescript
export interface DiscoveryEntry {
  source: DiscoverySource;                 // "settings" | "config-file" | "convention"
  configFileUri?: vscode.Uri;              // set when source === "config-file"
  configError?: {                          // set when malformed config found
    configFileUri: vscode.Uri;
    errorMessage: string;
  };
  featuresUri: vscode.Uri;
}
```

### Existing Cache Invalidation Path

The only way to re-run discovery today is:
1. `configurationChangedHandler()` in `extension.ts` calls `getUrisOfWkspFoldersWithFeatures(forceRefresh=true)`
2. `forceRefresh=true` clears `discoveryCache` and re-runs the full `hasFeaturesFolder` loop
3. That loop calls `findBehaveConfig()` (from `configParser.ts`) synchronously for each workspace folder

There is no config-file file system watcher today. That gap is what v1.1 fills.

---

## New Components vs Modified Components

### New Component: Config File Watcher

**File:** `src/watchers/configFileWatcher.ts` (new)

This is the primary new component. It mirrors the shape of `JunitWatcher` — a class that:
- Creates `FileSystemWatcher` instances for config file patterns in each workspace root
- Debounces change events (500ms, matching the existing Python file debounce)
- On fire: invalidates the discovery cache and triggers the full re-discovery flow
- Is disposable (for VS Code subscription cleanup)

It does NOT need to watch for specific filenames via per-file watchers. A single `RelativePattern` at the workspace root matching `{behave.ini,.behaverc,setup.cfg,tox.ini,pyproject.toml}` covers all five config file types. VS Code's `FileSystemWatcher` supports glob patterns including `{a,b}` alternatives in `RelativePattern`.

### Modified Component: extension.ts (activate + configurationChangedHandler)

Two changes:
1. `activate()` instantiates the config file watcher, starts watching, registers it in `context.subscriptions`
2. The config file watcher's callback routes into `configurationChangedHandler(undefined, undefined, true)` — the same path already used by `onDidChangeWorkspaceFolders`, which already does the right thing: clears logs, reloads settings, reruns discovery, calls `updateDiscoveryUX()`, reparses the test tree

### Modified Component: testRunHandler.ts (run guard)

One change: at the top of `testRunHandler`, before the `featureParseComplete` check, add a workspace-level guard that reads `getDiscoveryEntry(wkspUri)` for each workspace in the run and checks for `entry.configError`. If any workspace has a config error, show a `vscode.window.showWarningMessage` and return early (or ask the user to confirm before continuing).

No new module is needed for the run guard — it is a small inline check.

---

## Integration Points

### Integration Point 1: Config Watcher → Discovery Cache Invalidation → Test Tree Rebuild

The config file watcher fires → debounce 500ms → calls back into `configurationChangedHandler(undefined, undefined, true)`.

`configurationChangedHandler` with `forceFullRefresh=true` already does exactly what is needed:
1. `config.logger.clearAllWksps()` — clears output channels
2. `config.logger.syncChannelsToWorkspaceFolders()` — re-syncs output channels
3. For each wksp: `config.reloadSettings(wkspUri)` — rebuilds `WorkspaceSettings` from cache
4. `getUrisOfWkspFoldersWithFeatures(true)` — forces `discoveryCache.clear()` and re-runs `hasFeaturesFolder` which calls `findBehaveConfig()` for each folder
5. `updateDiscoveryUX(...)` — re-logs discovery source, re-shows malformed config notification, re-sets Problems diagnostic
6. `parser.clearTestItemsAndParseFilesForAllWorkspaces(...)` — rebuilds the test tree

The config file watcher does not need to know anything about discovery internals. It is a pure event emitter that delegates to the existing handler.

### Integration Point 2: Run Guard → Discovery Cache Read

In `testRunHandler.ts`, the guard reads `getDiscoveryEntry(wkspUri)` for each workspace that has queued tests. This is an already-exported function from `common.ts` that `testRunHandler.ts` does not currently import. Adding the import is the only dependency change.

The guard fires before `featureParseComplete()` is awaited — failing fast is better UX. If the guard fires, the `TestRun` created by `ctrl.createTestRun()` must still be ended (the `run.end()` in the `finally` block handles this).

### Integration Point 3: Config Watcher → Subscription Lifecycle

The config file watcher produces `vscode.FileSystemWatcher` instances that are disposables. These must be registered in `context.subscriptions` in `activate()` so VS Code disposes them on extension deactivation.

Pattern to follow: identical to how `workspaceWatcher.ts` watchers are managed — stored in a map and pushed into `context.subscriptions`.

---

## Data Flow: Config Change → Cache Invalidation → Test Tree Rebuild

```
[user edits behave.ini or creates/deletes a config file]
          |
          v
vscode.FileSystemWatcher fires (onDidCreate / onDidChange / onDidDelete)
          |
          v (500ms debounce timer in configFileWatcher.ts)
configFileWatcher callback
          |
          v
configurationChangedHandler(undefined, undefined, forceFullRefresh=true)
  [in extension.ts — already handles config + workspace changes]
          |
          +---> config.logger.clearAllWksps()
          |
          +---> config.logger.syncChannelsToWorkspaceFolders()
          |
          +---> getUrisOfWkspFoldersWithFeatures(forceRefresh=true)
          |           |
          |           v
          |     discoveryCache.clear()                   [common.ts]
          |     for each workspace folder:
          |       hasFeaturesFolder()
          |         findBehaveConfig()                   [configParser.ts]
          |           reads config file from disk        [fs.readFileSync]
          |         populates discoveryCache             [common.ts]
          |
          +---> for each wkspUri:
          |       config.reloadSettings(wkspUri)
          |         new WorkspaceSettings(wkspUri, ...)
          |           getDiscoveryEntry(wkspUri)         [reads cache]
          |           sets discoverySource, configFileUri, featuresUri
          |
          +---> updateDiscoveryUX(wkspUris, clearNotifiedErrors=true)
          |       logs new discovery source to output channel
          |       if configError: show warning notification + Problems diagnostic
          |       if no error: clear stale Problems diagnostic
          |
          +---> parser.clearTestItemsAndParseFilesForAllWorkspaces(...)
                  rebuilds VS Code Test Explorer tree with new featuresUri
```

### Hot Path Is Unaffected

`getUrisOfWkspFoldersWithFeatures()` without `forceRefresh` remains a synchronous Map read. Config file watcher events do not touch the hot path.

---

## Run Guard Data Flow

```
[user clicks Run Tests in Test Explorer]
          |
          v
testRunHandler(false, request)
  [in runners/testRunHandler.ts]
          |
          v (NEW — run guard check)
for each workspace with queued tests:
  getDiscoveryEntry(wkspUri)             [common.ts — O(1) Map read]
  if entry.configError:
    vscode.window.showWarningMessage(
      "Behave BDD: Config file is malformed. Tests may fail.\n" +
      "Fix the config file or open Settings to override.", 
      "Run Anyway", "Open Config File", "Cancel"
    )
    if user picks "Cancel": return early (run.end() in finally)
    if user picks "Open Config File": open file, return early
    if user picks "Run Anyway": continue
          |
          v (EXISTING — unchanged)
featureParseComplete(1000, "testRunHandler")
  ... rest of run ...
```

The guard is non-blocking when there is no error — it is a single synchronous cache read per workspace, well under 0.1ms.

---

## configFileWatcher.ts Internal Structure

```typescript
// src/watchers/configFileWatcher.ts

const CONFIG_FILE_GLOB = '{behave.ini,.behaverc,setup.cfg,tox.ini,pyproject.toml}';
const DEBOUNCE_MS = 500;

export class ConfigFileWatcher implements vscode.Disposable {
  private _watchers: vscode.FileSystemWatcher[] = [];
  private _debounceTimer: NodeJS.Timeout | undefined;
  private _onChangeCallback: () => void;

  constructor(onChangeCallback: () => void) {
    this._onChangeCallback = onChangeCallback;
  }

  startWatching(wkspUris: vscode.Uri[]): void {
    // Creates one FileSystemWatcher per workspace folder for the 5 config filenames
    for (const wkspUri of wkspUris) {
      const pattern = new vscode.RelativePattern(wkspUri, CONFIG_FILE_GLOB);
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      const handler = () => this._onDebounce();
      watcher.onDidCreate(handler);
      watcher.onDidChange(handler);
      watcher.onDidDelete(handler);
      this._watchers.push(watcher);
    }
  }

  private _onDebounce(): void {
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._onChangeCallback(), DEBOUNCE_MS);
  }

  dispose(): void {
    clearTimeout(this._debounceTimer);
    this._watchers.forEach(w => w.dispose());
    this._watchers = [];
  }
}
```

### Why One Watcher Per Workspace (Not Global)

`vscode.RelativePattern` requires a base URI — it cannot be constructed without one. The alternatives are:
- One watcher per workspace folder using `RelativePattern(wkspUri, CONFIG_FILE_GLOB)` — **recommended**
- One global watcher using a bare glob string `**/{behave.ini,...}` — works but fires for ALL folders in the VS Code instance, not just workspace folders, and has known reliability issues on Windows

One-per-workspace is consistent with how `workspaceWatcher.ts` is structured.

### Why Rebuild Watchers on Workspace Folder Change

When workspace folders change, `configurationChangedHandler` already rebuilds the feature/step file watchers. The config file watcher must also be rebuilt at this point, or it will either miss new folders or hold stale references to removed folders. The `dispose()` + `startWatching(newUris)` lifecycle is the right pattern.

---

## Suggested Build Order

```
1. configFileWatcher.ts (new module)
   └── No dependencies on other new code.
   └── Unit-testable in isolation with Sinon stubs for vscode.workspace.createFileSystemWatcher.
   └── Does not require extension.ts changes to be tested.

2. Run guard in testRunHandler.ts
   └── Depends on: getDiscoveryEntry import (already exported from common.ts — no new code).
   └── Unit-testable: stub getDiscoveryEntry to return an entry with configError set.
   └── Can be built in parallel with step 1.

3. Wire configFileWatcher into activate() in extension.ts
   └── Depends on: configFileWatcher.ts (step 1 must exist).
   └── Small change: instantiate ConfigFileWatcher, call startWatching(getUrisOfWkspFoldersWithFeatures()),
       register in context.subscriptions.
   └── Also: rebuild config file watcher inside configurationChangedHandler on workspace folder change.

4. Integration test fixture for config file watcher
   └── Depends on: steps 1-3 being wired.
   └── Test: edit behave.ini in-place → wait for debounce → verify test tree rebuilt.

5. Integration test fixture for run guard
   └── Depends on: step 2.
   └── Test: workspace with malformed config → attempt to run tests → verify warning appears.
```

Steps 1 and 2 can be built and tested in parallel. Step 3 requires step 1. Steps 4 and 5 require steps 1-3.

---

## Key Design Constraints

### configurationChangedHandler Is the Single Re-Discovery Trigger

The config file watcher must NOT call `getUrisOfWkspFoldersWithFeatures(forceRefresh=true)` directly, nor call `updateDiscoveryUX()` directly. It must route through `configurationChangedHandler(undefined, undefined, true)`. This preserves:
- The integration test guard (`if (config.integrationTestRun && !testCfg) return;`)
- The log clearing logic
- The watcher rebuild logic for feature/step file watchers
- The `updateDiscoveryUX` call with `clearNotifiedErrors=true` (so the malformed config notification can fire again after a fix attempt)

### Debounce Is Required

Config files are often saved as part of a batch operation (e.g., `git checkout` switches branches and rewrites multiple files). Without debouncing, each file event would trigger a full re-discovery + test tree rebuild. 500ms matches the existing Python file debounce in `fileParser.ts`.

### notifiedConfigErrors Must Be Cleared on Config File Change

In `extension.ts`, `notifiedConfigErrors` is a `Set<string>` that prevents duplicate warning popups within a session. When a config file changes, the set must be cleared so the user sees the notification again if the file is still malformed. This is handled by passing `clearNotifiedErrors=true` to `updateDiscoveryUX()` — which the `forceFullRefresh` branch of `configurationChangedHandler` already does.

### Run Guard: Show Warning, Don't Block Silently

The guard must show a user-visible warning with choices, not silently abort. Silent abort would confuse users who don't know there is a malformed config. The warning message should reference the config file by name (available from `entry.configError.configFileUri`).

### Run Guard Does Not Prevent Runs When Source Is "convention"

A workspace using the convention fallback (no config file found, or malformed config fell back to convention) is a normal state. The guard only fires when `entry.configError` is set — meaning a config file was found and failed to parse. Convention fallback without a config file present is fine and the guard stays silent.

---

## Component Interaction Map

```
extension.ts (activate)
  ├── instantiates ConfigFileWatcher(callback)
  ├── calls configFileWatcher.startWatching(wkspUris)
  └── context.subscriptions.push(configFileWatcher)

ConfigFileWatcher (new)
  ├── creates vscode.FileSystemWatcher per workspace (for 5 config filenames)
  ├── debounces events (500ms)
  └── on fire → calls configurationChangedHandler(undefined, undefined, true)

configurationChangedHandler (existing, no logic change)
  ├── clears logs
  ├── getUrisOfWkspFoldersWithFeatures(forceRefresh=true) → clears + rebuilds discoveryCache
  ├── config.reloadSettings() → rebuilds WorkspaceSettings from new cache
  ├── updateDiscoveryUX(uris, clearNotifiedErrors=true) → notification + Problems panel
  └── parser.clearTestItemsAndParseFilesForAllWorkspaces() → rebuilds test tree

testRunHandler (modified)
  ├── NEW: for each wksp with queued tests: getDiscoveryEntry(wkspUri)
  ├── NEW: if configError → showWarningMessage("Run Anyway" / "Open Config" / "Cancel")
  └── EXISTING: featureParseComplete → runTestQueue → ...

discoveryCache (existing, in common.ts)
  ├── populated by getUrisOfWkspFoldersWithFeatures(forceRefresh=true)
  ├── read by getDiscoveryEntry() (O(1), synchronous)
  └── read by WorkspaceSettings constructor
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Config File Watcher Calls Discovery Directly

The watcher callback should not call `getUrisOfWkspFoldersWithFeatures(forceRefresh=true)` or `updateDiscoveryUX()` directly. These are internal operations that must run inside `configurationChangedHandler` to preserve the integration test guard and the correct sequencing with watcher rebuilds and log clearing.

### Anti-Pattern 2: Creating One Watcher for All Five Config Filenames

Creating five separate watchers per workspace (one per config filename) is unnecessary. VS Code's `RelativePattern` supports `{file1,file2,...}` brace expansion. One watcher per workspace for `{behave.ini,.behaverc,setup.cfg,tox.ini,pyproject.toml}` is sufficient.

### Anti-Pattern 3: Skipping the Debounce

Without debouncing, a `git checkout` that touches multiple files triggers multiple full test tree rebuilds in rapid succession, causing visible flicker and redundant I/O. 500ms debounce means only the last event in a burst causes a rebuild.

### Anti-Pattern 4: Run Guard Throws Instead of Showing UI

Throwing from inside `testRunHandler` before `ctrl.createTestRun()` will result in an unhandled rejection with no user-visible message. The guard must use `vscode.window.showWarningMessage` and return early, letting the `finally { run.end(); }` block clean up properly.

### Anti-Pattern 5: Forgetting to Rebuild Config Watchers After Workspace Folder Change

`configurationChangedHandler` already rebuilds feature/step file watchers when workspace folders change (the `oldWatchers.forEach(w => w.dispose())` block). The config file watcher must be disposed and re-created at the same point, otherwise new workspace folders won't be watched and removed folders keep their watchers alive.

---

## Sources

- Direct source analysis of:
  - `src/watchers/workspaceWatcher.ts` (watcher pattern)
  - `src/watchers/junitWatcher.ts` (JunitWatcher class shape, disposable pattern)
  - `src/extension.ts` (activate flow, configurationChangedHandler, updateDiscoveryUX, notifiedConfigErrors)
  - `src/runners/testRunHandler.ts` (run entry point, featureParseComplete guard, run.end() lifecycle)
  - `src/common.ts` (discoveryCache Map, getDiscoveryEntry, getUrisOfWkspFoldersWithFeatures)
  - `src/parsers/configParser.ts` (BehaveConfigResult discriminated union, stateless design)
  - `src/settings.ts` (WorkspaceSettings constructor, discoverySource, configFileUri)
- `.planning/PROJECT.md` — v1.1 milestone requirements
