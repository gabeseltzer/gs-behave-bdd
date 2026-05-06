# Phase 4: Watcher & Run Guard - Research

**Researched:** 2026-04-16
**Domain:** VS Code FileSystemWatcher lifecycle, per-workspace debounce, discovery cache invalidation, modal warning UX
**Confidence:** HIGH — all findings verified against existing codebase source; VS Code API patterns confirmed from running code

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Debounce Behavior**
- D-01: Status bar shows "Behave: Parsing..." (busy=true) when debounce starts, clears when reparse completes. Consistent with existing activation behavior.
- D-02: Rapid saves reset the 500ms debounce timer on each save. Only the final save triggers re-discovery. Matches the existing Python file debounce pattern in `fileParser.ts`.
- D-03: All events (create, change, delete) go through the same 500ms debounce. No special-casing for delete. Handles delete-then-recreate within 500ms (e.g., git operations).

**Run Guard UX**
- D-04: Warning message names the broken file: "Config file '{filename}' has parse errors. Tests may not discover correctly." Consistent with existing malformed config notification in `updateDiscoveryUX`.
- D-05: Warning prompts every time — no "remember" behavior. Re-checks `discoveryCache` via `getDiscoveryEntry()` on each run. Warning automatically stops appearing once the config is fixed (watcher re-discovery clears `configError`).
- D-06: In multi-root workspaces, warn only for workspaces whose tests are queued AND have `configError` (GUARD-04). "Cancel" cancels the entire run. "Run Anyway" runs all tests including the broken workspace. "Open Config File" opens the file and cancels the run.
- D-07: Guard fires for all test execution triggers — bulk runs, individual scenario runs, and debug sessions (GUARD-03). Same code path through `testRunHandler`.

**Watcher Lifecycle**
- D-08: Config watchers created at activation alongside existing `wkspWatchers`, using brace-expansion glob pattern for all 5 config filenames at workspace root.
- D-09: Separate `wkspConfigWatchers: Map<Uri, FileSystemWatcher[]>` parallel to `wkspWatchers`. Keeps concerns separate.
- D-10: Config watchers disposed and recreated in `configurationChangedHandler` alongside existing `wkspWatchers` handling. Single code path for all workspace lifecycle events (add/remove/rename).
- D-11: Config file creation in a workspace using convention always triggers full re-discovery. Config-file discovery takes precedence over convention per existing priority chain.

**Logging & Feedback**
- D-12: Output channel logs one-line summary on config change: "Config file changed: {filename} — re-discovering features..." followed by existing `updateDiscoveryUX` discovery summary.
- D-13: xRay diagnostic logging includes detailed watcher event info: event type, debounce timer resets, re-discovery timing. Zero overhead when disabled.
- D-14: Run guard warning logged to output channel: "Run guard: config error in {filename} — user prompted". Creates audit trail.
- D-15: No user-visible notification (toast) on successful config change re-discovery. Silent update per WATCH-04. Status bar "Parsing..." is the only visible feedback.

### Claude's Discretion

- Debounce timer implementation: separate per-workspace timer Map vs reusing fileParser debounce mechanism. Claude should choose based on code cleanliness and separation of concerns.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WATCH-01 | FileSystemWatcher monitors all 5 behave config files at each workspace root | Verified: brace-expansion glob `{behave.ini,.behaverc,setup.cfg,tox.ini,pyproject.toml}` via `vscode.RelativePattern(wkspUri, ...)` |
| WATCH-02 | Watcher fires on create, change, and delete events | Verified: `onDidCreate`, `onDidChange`, `onDidDelete` — all three required; `workspaceWatcher.ts` demonstrates the pattern |
| WATCH-03 | Config file changes debounced at 500ms before triggering re-discovery | Verified: `fileParser.ts` `_pythonReparseTimers` is the exact pattern to replicate; `Map<string, NodeJS.Timeout>` keyed by `wkspUri.path` |
| WATCH-04 | Re-discovery silently updates test tree and logs to output channel (no notification on normal changes) | Verified: `updateDiscoveryUX` handles the silent path; `D-15` locks this; status bar is the only UI feedback |
| WATCH-05 | Per-workspace watcher lifecycle: disposed and recreated when workspace folders change | Verified: `configurationChangedHandler` lines 598-604 — exact disposal loop to mirror for `wkspConfigWatchers` |
| WATCH-06 | Notification dedup cleared per-workspace on watcher-triggered re-discovery | Verified: `notifiedConfigErrors` Set in `extension.ts`; must pass `clearNotifiedErrors: true` to `updateDiscoveryUX` on watcher re-discovery |
| GUARD-01 | Test run checks discovery cache for `configError` before executing behave | Verified: `getDiscoveryEntry(wkspUri)?.configError` in `common.ts` is the read path; insert check in `testRunHandler` after `featureParseComplete` |
| GUARD-02 | Warning shown with "Run Anyway" / "Open Config File" / "Cancel" options | Verified: `vscode.window.showWarningMessage(msg, btn1, btn2, btn3)` returns Promise<string \| undefined>; undefined = cancel/dismiss |
| GUARD-03 | Guard applies to both regular test runs and debug sessions | Verified: both profiles call the same `runHandler(debug, request)` path in `extension.ts` lines 407-418 |
| GUARD-04 | Guard scoped to workspaces whose tests are actually queued | Verified: extract workspace URIs from queued `QueueItem` objects; only check those workspaces |
| TEST-07 | Unit tests for watcher debounce logic and lifecycle management | Verified: `reparseFileDebounce.test.ts` is the exact pattern — `sinon.useFakeTimers()`, `clock.tickAsync(500)` |
| TEST-09 | Unit test for run guard configError check and user response handling | Verified: `testRunHandler.test.ts` exists; extend with stub for `getDiscoveryEntry` + `vscode.window.showWarningMessage` stub |
</phase_requirements>

---

## Summary

Phase 4 adds two new capabilities to the extension: (1) automatic config file watching that re-triggers feature discovery when any of the 5 behave config files change, and (2) a run guard that intercepts test execution when a workspace has a known malformed config.

The codebase already contains all the patterns needed. The config watcher follows the same structure as `startWatchingWorkspace` in `watchers/workspaceWatcher.ts` — a per-workspace function returning `FileSystemWatcher[]`, all three event handlers registered, pushed to `context.subscriptions`. The debounce follows the `_pythonReparseTimers` pattern in `fileParser.ts` — a `Map<string, NodeJS.Timeout>` keyed by workspace URI path, using `clearTimeout`/`setTimeout`. The run guard inserts a check in `testRunHandler` after the existing `featureParseComplete` guard, reading directly from the discovery cache via `getDiscoveryEntry()`.

The key architectural constraint is that config watcher re-discovery must NOT route through `configurationChangedHandler` directly, because that function has an `integrationTestRun` early-exit guard that would silently skip re-discovery during integration tests (Pitfall 14). Instead, the watcher handler should call `getUrisOfWkspFoldersWithFeatures(true)` and `parser.parseFilesForWorkspace(...)` directly, then call `updateDiscoveryUX` — the same sequence that `configurationChangedHandler` performs internally.

**Primary recommendation:** Implement `startWatchingConfigFiles(wkspUri)` as a new file in `src/watchers/configWatcher.ts` mirroring the shape of `workspaceWatcher.ts`, maintain a parallel `wkspConfigWatchers` Map in `extension.ts`, and insert the run guard as a focused async helper called from `testRunHandler` immediately after the parse-ready check.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Config file watching | Extension host (event registration) | Watcher module | VS Code FileSystemWatcher is extension-side; same tier as feature/steps watchers |
| Debounce timer management | Watcher callback | — | Timer state is local to the watcher callback; no DB or UI layer involved |
| Discovery cache invalidation | `common.ts` (getUrisOfWkspFoldersWithFeatures) | — | Cache already lives here; watcher triggers forceRefresh=true |
| Test tree rebuild | FileParser | — | `parseFilesForWorkspace` already handles this; watcher just calls it |
| Run guard check | `testRunHandler.ts` | `common.ts` (cache read) | Guard must be in the run entry point; reads from shared cache |
| Warning dialog | VS Code API (extension host) | — | `vscode.window.showWarningMessage` is the correct layer for user interaction |
| Status bar feedback | `parser.onStatusChange` callback | — | Already wired in `extension.ts`; `notifyStatusChange(true/false)` flows through FileParser |

---

## Standard Stack

### Core (No new dependencies required)

| API / Module | Version | Purpose | Why Standard |
|-------------|---------|---------|--------------|
| `vscode.workspace.createFileSystemWatcher` | VS Code ^1.82.0 | Watch config files for changes | Built-in VS Code API; already used in `workspaceWatcher.ts` |
| `vscode.RelativePattern` | VS Code ^1.82.0 | Scope watcher to workspace root with glob | Required to make `createFileSystemWatcher` fire correctly (Pitfall 2) |
| `vscode.window.showWarningMessage` | VS Code ^1.82.0 | Run guard warning dialog with action buttons | Built-in; already used in `extension.ts` `updateDiscoveryUX` |
| `getDiscoveryEntry` from `common.ts` | — | Read `configError` from discovery cache | Already exported; single source of truth for discovery state |
| `getUrisOfWkspFoldersWithFeatures(true)` | — | Force-refresh discovery cache on config change | Already exists; `forceRefresh=true` clears and rebuilds the cache |
| `sinon.useFakeTimers()` | Sinon 21.0.1 | Unit test debounce without real time | Already used in `reparseFileDebounce.test.ts` |

No new npm packages required. [VERIFIED: codebase grep of package.json and existing source]

---

## Architecture Patterns

### System Architecture Diagram

```
Config File Change (disk)
        |
        v
FileSystemWatcher (onDidCreate / onDidChange / onDidDelete)
        |
        v
Per-workspace debounce (Map<wkspUri.path, NodeJS.Timeout>, 500ms)
  - rapid saves collapse into single handler invocation
        |
        v
getUrisOfWkspFoldersWithFeatures(true)  ← cache invalidate
        |
        v
updateDiscoveryUX(wkspUris, clearNotifiedErrors=true)
  - logs to output channel
  - sets/clears Problems panel diagnostic
  - re-fires toast notification if still malformed (after dedup clear)
        |
        v
parser.parseFilesForWorkspace(wkspUri, ...)  ← test tree rebuild
  - triggers onStatusChange(busy=true) → status bar "Parsing..."
  - triggers onStatusChange(busy=false) when complete


User clicks "Run Tests" / "Debug Tests"
        |
        v
testRunHandler (existing featureParseComplete check)
        |
        v
[NEW] runGuardCheck(queue, wkspUri[])
  - collect workspace URIs from queued test items
  - for each wkspUri: getDiscoveryEntry(wkspUri)?.configError
  - if any configError found:
      vscode.window.showWarningMessage(...)
      → "Run Anyway"    → proceed
      → "Open Config File" → open file, return (cancel run)
      → undefined (dismiss / "Cancel") → return (cancel run)
        |
        v
queueSelectedTestItems → runTestQueue (existing path)
```

### Recommended Project Structure

```
src/
  watchers/
    workspaceWatcher.ts     # existing — feature/steps watcher (read-only reference)
    junitWatcher.ts         # existing
    configWatcher.ts        # NEW — startWatchingConfigFiles(), per-workspace config watcher
  runners/
    testRunHandler.ts       # MODIFIED — insert runGuardCheck before queueSelectedTestItems
  extension.ts              # MODIFIED — wkspConfigWatchers Map, activation setup, disposal loop

test/unit/
  watchers/
    configWatcher.test.ts   # NEW — debounce, lifecycle, all-three-events tests (TEST-07)
  runners/
    testRunHandler.test.ts  # MODIFIED — add runGuard tests (TEST-09)
```

### Pattern 1: Config Watcher Module (mirrors workspaceWatcher.ts)

**What:** A module-level function `startWatchingConfigFiles` that creates one `FileSystemWatcher` per workspace root using a brace-expansion glob covering all 5 config filenames.

**When to use:** Called at activation and in `configurationChangedHandler` when workspaces change.

```typescript
// src/watchers/configWatcher.ts
// Source: workspaceWatcher.ts pattern, VS Code API docs
import * as vscode from 'vscode';
import { getUrisOfWkspFoldersWithFeatures } from '../common';
import { FileParser } from '../parsers/fileParser';
import { diagLog } from '../logger';

const CONFIG_GLOB = '{behave.ini,.behaverc,setup.cfg,tox.ini,pyproject.toml}';
const DEBOUNCE_MS = 500;

const configDebounceTimers = new Map<string, NodeJS.Timeout>();

export function startWatchingConfigFiles(
  wkspUri: vscode.Uri,
  ctrl: vscode.TestController,
  testData: TestData,
  parser: FileParser
): vscode.FileSystemWatcher[] {

  const pattern = new vscode.RelativePattern(wkspUri, CONFIG_GLOB);
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);

  const handler = (eventUri: vscode.Uri, eventType: string) => {
    if (eventUri.scheme !== 'file') return;
    diagLog(`configWatcher: ${eventType} detected for ${eventUri.fsPath}`);

    const key = wkspUri.path;
    const existing = configDebounceTimers.get(key);
    if (existing) {
      clearTimeout(existing);
      diagLog(`configWatcher: debounce timer reset for ${wkspUri.path}`);
    }

    const timer = setTimeout(async () => {
      configDebounceTimers.delete(key);
      try {
        const filename = eventUri.path.split('/').pop() ?? 'config file';
        config.logger.logInfo(
          `Config file changed: ${filename} — re-discovering features...`,
          wkspUri
        );
        // Direct cache invalidation (avoids integrationTestRun guard in configurationChangedHandler)
        getUrisOfWkspFoldersWithFeatures(true);
        updateDiscoveryUX([wkspUri], true);  // clearNotifiedErrors=true per WATCH-06
        parser.parseFilesForWorkspace(wkspUri, testData, ctrl, 'configWatcher', false);
      } catch (e: unknown) {
        config.logger.showError(e, wkspUri);
      }
    }, DEBOUNCE_MS);

    configDebounceTimers.set(key, timer);
  };

  watcher.onDidCreate(uri => handler(uri, 'create'));
  watcher.onDidChange(uri => handler(uri, 'change'));
  watcher.onDidDelete(uri => handler(uri, 'delete'));

  return [watcher];
}
```

**Note:** `updateDiscoveryUX` is currently a local function in `extension.ts`. It will need to be either exported or the config watcher will need to call it indirectly. The simplest approach: keep `updateDiscoveryUX` in `extension.ts` and pass it as a callback parameter to `startWatchingConfigFiles`, OR export it. [ASSUMED — depends on final implementation design; planner should decide]

### Pattern 2: Per-Workspace Timer Map (matches fileParser.ts `_pythonReparseTimers`)

**What:** A module-level `Map<string, NodeJS.Timeout>` keyed by `wkspUri.path`. Each workspace gets its own independent debounce timer.

**When to use:** Inside the config watcher event handler. One timer per workspace ensures workspace A's rapid saves do not cancel workspace B's pending re-discovery.

```typescript
// Source: fileParser.ts lines 42, 612-711 — _debouncePythonReparse pattern
const configDebounceTimers = new Map<string, NodeJS.Timeout>();

// In handler:
const key = wkspUri.path; // string key (consistent across platforms)
const existing = configDebounceTimers.get(key);
if (existing) clearTimeout(existing);
const timer = setTimeout(async () => {
  configDebounceTimers.delete(key);
  // ... re-discovery work ...
}, 500);
configDebounceTimers.set(key, timer);
```

### Pattern 3: Run Guard in testRunHandler

**What:** After the existing `featureParseComplete` check, collect workspace URIs for all queued items, check each for `configError` in the discovery cache, and show a warning dialog with three choices.

**When to use:** Insert in the `testRunHandler` return function, before `queueSelectedTestItems`.

**Important:** The guard runs before the `TestRun` is created (`ctrl.createTestRun`). If the user cancels, no `TestRun` is created and `run.end()` is not needed. However, based on current `testRunHandler.ts`, `ctrl.createTestRun` is called before `queueSelectedTestItems`. The guard should be inserted AFTER `featureParseComplete` but BEFORE `ctrl.createTestRun`. [VERIFIED: testRunHandler.ts lines 45-65]

```typescript
// Source: testRunHandler.ts lines 45-53 (existing guard pattern)
// Insert after line 53 (after the featureParseComplete check):

// GUARD-01: Check for malformed config in queued workspaces
const guardResult = await checkRunGuard(request, ctrl, testData);
if (!guardResult) return; // user cancelled

// Pattern for checkRunGuard:
async function checkRunGuard(
  request: vscode.TestRunRequest,
  ctrl: vscode.TestController,
  testData: TestData
): Promise<boolean> {
  // Collect workspace URIs for queued tests (GUARD-04: only queued workspaces)
  const queue: QueueItem[] = [];
  // ... collect items as in queueSelectedTestItems but don't enqueue ...
  const wkspUrisToCheck = new Set<string>();
  // extract wkspUri from each test item via getWorkspaceSettingsForFile(item.uri)

  const brokenWorkspaces: { wkspUri: vscode.Uri; filename: string }[] = [];
  for (const wkspUri of wkspUrisToCheck) {
    const entry = getDiscoveryEntry(/* wkspUri */);
    if (entry?.configError) {
      brokenWorkspaces.push({
        wkspUri: /* wkspUri */,
        filename: basename(entry.configError.configFileUri)
      });
    }
  }

  if (brokenWorkspaces.length === 0) return true; // no issues

  const filenames = brokenWorkspaces.map(b => `'${b.filename}'`).join(', ');
  const msg = `Config file ${filenames} has parse errors. Tests may not discover correctly.`;
  config.logger.logInfo(`Run guard: config error in ${filenames} — user prompted`, /* wkspUri */);

  const choice = await vscode.window.showWarningMessage(msg, 'Run Anyway', 'Open Config File', 'Cancel');
  if (choice === 'Run Anyway') return true;
  if (choice === 'Open Config File') {
    vscode.commands.executeCommand('vscode.open', brokenWorkspaces[0].configFileUri);
    return false;
  }
  return false; // Cancel or dismiss
}
```

### Pattern 4: wkspConfigWatchers Map in extension.ts (mirrors wkspWatchers)

**What:** A parallel `Map<vscode.Uri, vscode.FileSystemWatcher[]>` that tracks config watchers by workspace URI. Disposed and recreated in `configurationChangedHandler` at the same point as `wkspWatchers`.

```typescript
// Source: extension.ts lines 37, 598-604
// Add alongside wkspWatchers:
const wkspConfigWatchers = new Map<vscode.Uri, vscode.FileSystemWatcher[]>();

// In activation (after existing wkspWatchers loop):
for (const wkspUri of getUrisOfWkspFoldersWithFeatures()) {
  const configWatchers = startWatchingConfigFiles(wkspUri, ctrl, testData, parser);
  wkspConfigWatchers.set(wkspUri, configWatchers);
  configWatchers.forEach(w => context.subscriptions.push(w));
}

// In configurationChangedHandler (after existing wkspWatchers disposal):
const oldConfigWatchers = wkspConfigWatchers.get(wkspUri);
if (oldConfigWatchers) oldConfigWatchers.forEach(w => w.dispose());
const configWatchers = startWatchingConfigFiles(wkspUri, ctrl, testData, parser);
wkspConfigWatchers.set(wkspUri, configWatchers);
configWatchers.forEach(w => context.subscriptions.push(w));
```

### Anti-Patterns to Avoid

- **Bare filename in RelativePattern:** `new vscode.RelativePattern(wkspUri, 'behave.ini')` — silently never fires (VS Code bug #164925). Always use `'{behave.ini,...}'` brace-expansion glob. [VERIFIED: PITFALLS.md Pitfall 2]
- **Reading file immediately in onDidChange:** `fs.readFileSync` called synchronously inside the event handler before the 500ms debounce — returns stale content (VS Code bug #72831). Always debounce first. [VERIFIED: PITFALLS.md Pitfall 3]
- **Single global debounce timer:** `let debounceTimer: NodeJS.Timeout` at module level — a save in workspace A cancels workspace B's pending re-discovery. Always use `Map<string, NodeJS.Timeout>`. [VERIFIED: PITFALLS.md Pitfall 4]
- **Routing through configurationChangedHandler:** Config watcher callback that calls `configurationChangedHandler(undefined, undefined, true)` will be silently skipped during integration test runs due to `integrationTestRun` early exit (line 570). Call `getUrisOfWkspFoldersWithFeatures(true)` and `parser.parseFilesForWorkspace` directly. [VERIFIED: PITFALLS.md Pitfall 14, extension.ts line 570]
- **Run guard reading from WorkspaceSettings:** `wkspSettings.configError` may be stale if `configurationChangedHandler` hasn't run since the last watcher re-discovery. Always read from the discovery cache via `getDiscoveryEntry(wkspUri)`. [VERIFIED: PITFALLS.md Pitfall 7]
- **Checking all workspaces in run guard:** Must scope to workspaces with queued tests only, not `getUrisOfWkspFoldersWithFeatures()`. A malformed config in workspace A must not block runs in workspace B. [VERIFIED: PITFALLS.md Pitfall 8]
- **Not registering all three events:** Only registering `onDidChange` — `onDidCreate` and `onDidDelete` are also required. A user creating `behave.ini` in a convention workspace won't trigger re-discovery without `onDidCreate`. [VERIFIED: PITFALLS.md Pitfall 10]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File watching | Custom polling loop with `fs.watch` | `vscode.workspace.createFileSystemWatcher` | VS Code API handles platform differences, workspace root scoping, and resource lifecycle |
| Warning dialog | Custom webview or notification tree | `vscode.window.showWarningMessage(msg, btn1, btn2, btn3)` | Built-in, already used in `extension.ts`, handles focus/dismiss correctly |
| Debounce implementation | Custom EventEmitter or rxjs | `clearTimeout/setTimeout` with `Map<string, NodeJS.Timeout>` | Already proven in `fileParser.ts`; rxjs would add bundle weight |
| Cache invalidation | Separate cache module | `getUrisOfWkspFoldersWithFeatures(true)` | `forceRefresh=true` already clears `discoveryCache` in-place |

**Key insight:** The entire phase is about wiring together already-existing infrastructure. No new complex abstractions are needed — the value is in the correct connection of existing pieces.

---

## Common Pitfalls

### Pitfall 1: Watcher Disposal Leak
**What goes wrong:** Config watchers pushed to `context.subscriptions` without disposing old ones in `configurationChangedHandler`. On each settings change, a new undisposed watcher accumulates. On Linux, hits `inotify` file descriptor limits.
**Why it happens:** `context.subscriptions` is designed for extension-lifetime objects. Config watchers are per-workspace and change when workspace folders change.
**How to avoid:** Mirror the existing `wkspWatchers` pattern exactly — dispose from `wkspConfigWatchers.get(wkspUri)` before creating new ones. [VERIFIED: PITFALLS.md Pitfall 1, extension.ts lines 598-604]
**Warning signs:** Multiple identical log lines on a single config file save; unexpected re-discovery events for unchanged workspaces.

### Pitfall 2: Glob Pattern Required
**What goes wrong:** Bare filename `'behave.ini'` in `RelativePattern` never fires events (VS Code bug #164925).
**Why it happens:** VS Code's native watcher backend requires a wildcard or path separator in the pattern.
**How to avoid:** Always use `'{behave.ini,.behaverc,setup.cfg,tox.ini,pyproject.toml}'` (one watcher, all five files). [VERIFIED: PITFALLS.md Pitfall 2]
**Warning signs:** Config file saved, no log line in output channel, no test tree update.

### Pitfall 3: Stale File Read Race
**What goes wrong:** Reading the config file immediately inside `onDidChange` returns the previous version (VS Code bug #72831). Extension parses old content and updates the cache with wrong data.
**Why it happens:** OS write and VS Code event dispatch are not atomic. File buffer may not be flushed when the event fires.
**How to avoid:** Always place the `fs.readFileSync` call (inside `findBehaveConfig` which `getUrisOfWkspFoldersWithFeatures` calls) inside the debounced callback, not in the event handler itself. [VERIFIED: PITFALLS.md Pitfall 3]
**Warning signs:** Config file change appears to have no effect; second save "fixes" it unexpectedly.

### Pitfall 4: Integration Test Guard Bypass
**What goes wrong:** Config watcher handler calls `configurationChangedHandler(undefined, undefined, true)`. During integration tests, this exits immediately at `if (config.integrationTestRun && !testCfg) return` (line 570).
**Why it happens:** `configurationChangedHandler` has a guard protecting integration test isolation.
**How to avoid:** Call `getUrisOfWkspFoldersWithFeatures(true)` + `parser.parseFilesForWorkspace` directly from the watcher handler. [VERIFIED: PITFALLS.md Pitfall 14, extension.ts line 570]
**Warning signs:** Integration test for config file watching passes vacuously (no assertion failure but no re-discovery happened).

### Pitfall 5: notifiedConfigErrors Not Cleared
**What goes wrong:** User introduces a new config error in a file that previously had a (now fixed) error. The notification is suppressed because the file path is still in `notifiedConfigErrors`.
**Why it happens:** `updateDiscoveryUX` is called with `clearNotifiedErrors=false` in the default config-change path.
**How to avoid:** Pass `clearNotifiedErrors=true` to `updateDiscoveryUX` from the config watcher handler (not `false`). [VERIFIED: PITFALLS.md Pitfall 6, extension.ts line 619]
**Warning signs:** User reports "second config error shows no notification"; only Problems panel updates.

### Pitfall 6: Run Guard Checks Wrong Workspace Set
**What goes wrong:** Guard checks `getUrisOfWkspFoldersWithFeatures()` (all workspaces) rather than only workspaces with queued tests. A malformed config in workspace A blocks runs in workspace B.
**Why it happens:** Simple implementation loops over all workspaces without filtering to the request.
**How to avoid:** Extract workspace URIs from the `QueueItem` array (or from `request.include` test items) using `getWorkspaceSettingsForFile(item.uri)`. [VERIFIED: PITFALLS.md Pitfall 8, GUARD-04 requirement]
**Warning signs:** Clicking "Run Test" in workspace B shows warning about workspace A's config.

### Pitfall 7: Guard Inserted After TestRun Created
**What goes wrong:** `ctrl.createTestRun(request, ...)` is called before the guard check. If the user cancels, the `TestRun` is already open and `run.end()` must be called. Failure to call `run.end()` leaves a dangling run in the Test Explorer UI.
**Why it happens:** Current `testRunHandler.ts` creates the run before queuing items (line 58).
**How to avoid:** Insert the guard check BEFORE `ctrl.createTestRun`. If the user cancels, return without creating a run. [VERIFIED: testRunHandler.ts line 58]
**Warning signs:** "Running..." indicator stuck in Test Explorer after user clicks Cancel.

---

## Code Examples

Verified patterns from existing codebase:

### Existing Debounce Pattern (fileParser.ts lines 612-711)
```typescript
// Source: src/parsers/fileParser.ts _debouncePythonReparse
private _pythonReparseTimers: Map<string, NodeJS.Timeout> = new Map();
private static readonly PYTHON_REPARSE_DEBOUNCE_MS = 500;

private _debouncePythonReparse(fileUri: vscode.Uri, content: string, wkspSettings: WorkspaceSettings) {
  const wkspKey = wkspSettings.uri.path;
  const existingTimer = this._pythonReparseTimers.get(wkspKey);
  if (existingTimer) clearTimeout(existingTimer);

  const timer = setTimeout(async () => {
    this._pythonReparseTimers.delete(wkspKey);
    // ... async work ...
  }, FileParser.PYTHON_REPARSE_DEBOUNCE_MS);

  this._pythonReparseTimers.set(wkspKey, timer);
}
```

### Existing Watcher Lifecycle Pattern (extension.ts lines 598-604)
```typescript
// Source: src/extension.ts configurationChangedHandler
config.reloadSettings(wkspUri);
const oldWatchers = wkspWatchers.get(wkspUri);
if (oldWatchers) oldWatchers.forEach(w => w.dispose());
const watchers = startWatchingWorkspace(wkspUri, ctrl, testData, parser);
wkspWatchers.set(wkspUri, watchers);
watchers.forEach(w => context.subscriptions.push(w));
```

### Existing Warning Dialog Pattern (extension.ts lines 95-106)
```typescript
// Source: src/extension.ts updateDiscoveryUX
vscode.window.showWarningMessage(
  `Behave BDD: Could not parse "${basename(errorUri)}": ${msg}\n\nFalling back to "features/" convention.`,
  'Open Config File',
  'Open Settings'
).then(action => {
  if (action === 'Open Config File') {
    vscode.commands.executeCommand('vscode.open', errorUri);
  }
});
```

### Existing Run Guard Entry Point (testRunHandler.ts lines 45-53)
```typescript
// Source: src/runners/testRunHandler.ts — featureParseComplete guard
const ready = await parser.featureParseComplete(1000, "testRunHandler");
if (!ready) {
  const msg = "Cannot run tests while feature files are being parsed, please try again.";
  vscode.window.showWarningMessage(msg, "OK");
  if (config.integrationTestRun) throw msg;
  return;
}
// INSERT RUN GUARD CHECK HERE (before ctrl.createTestRun)
```

### Existing Discovery Cache Read (common.ts lines 164-166)
```typescript
// Source: src/common.ts
export function getDiscoveryEntry(wkspUri: vscode.Uri): DiscoveryEntry | undefined {
  return discoveryCache.get(uriId(wkspUri));
}
// DiscoveryEntry.configError = { configFileUri: vscode.Uri, errorMessage: string }
```

### Unit Test Pattern for Debounce (reparseFileDebounce.test.ts lines 55-86)
```typescript
// Source: test/unit/parsers/reparseFileDebounce.test.ts
setup(() => {
  clock = sinon.useFakeTimers();
  // ... stub external dependencies ...
});
teardown(() => {
  fileParser.dispose();
  clock.restore();
  sinon.restore();
});

test('rapid calls should result in single execution', async () => {
  // trigger 5 rapid events
  await clock.tickAsync(500);
  assert.strictEqual(callCount, 1, 'should fire only once');
});
```

---

## Runtime State Inventory

> Omitted — this is a greenfield feature addition, not a rename/refactor/migration phase.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `vscode.workspace.findFiles` for globbing | Custom `findFiles` function | Phase 2 (v1.0) | Needed due to Windows multi-root intermittent failure |
| Polling for config changes | `FileSystemWatcher` event-driven | This phase | Standard VS Code pattern; no CPU overhead when files are stable |

**Deprecated/outdated:**
- Bare filename in `RelativePattern` without glob: deprecated by VS Code bug #164925 — always use `{file1,file2}` brace syntax.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `updateDiscoveryUX` needs to be either exported from `extension.ts` or accepted as a callback parameter by `startWatchingConfigFiles` — current implementation keeps it module-private | Architecture Patterns (Pattern 1) | If neither approach is chosen, the config watcher cannot call it; planner must decide export vs callback |
| A2 | The run guard check should be inserted BEFORE `ctrl.createTestRun` (line 58) to avoid a dangling run on cancel | Common Pitfalls (Pitfall 7) | If inserted after, cancel leaves a stuck test run in the UI; verify exact insertion point during implementation |

---

## Open Questions

1. **`updateDiscoveryUX` visibility**
   - What we know: It is a local function in `extension.ts`, not exported. Config watcher must call it to surface discovery results and fire the malformed-config notification.
   - What's unclear: Should it be exported (`export function updateDiscoveryUX`) or passed as a callback to `startWatchingConfigFiles`?
   - Recommendation: Export it — it's a pure side-effect function with no circular dependency risk, and the discovery UX surface should be reachable from any watcher module.

2. **Integration test coverage for WATCH-01 through WATCH-05 (TEST-08 deferred to Phase 5)**
   - What we know: TEST-08 (integration test verifying config file change triggers test tree rebuild) is assigned to Phase 5 per REQUIREMENTS.md traceability table.
   - What's unclear: Does Phase 4 need any integration-level smoke test for the watcher, or is unit coverage sufficient?
   - Recommendation: Unit tests for debounce and lifecycle (TEST-07) are sufficient for Phase 4. TEST-08 integration coverage is Phase 5.

3. **Queue inspection for run guard workspace scoping (GUARD-04)**
   - What we know: The guard must check only workspaces with queued tests. The `request.include` array contains the test items, but they may not be fully resolved to scenarios yet at guard-check time.
   - What's unclear: Can workspace URIs be extracted reliably from `request.include` items without full scenario resolution?
   - Recommendation: Use `getWorkspaceSettingsForFile(item.uri)` on each item in `request.include` (or all controller items if `request.include` is null/empty). This is fast and doesn't require scenario resolution.

---

## Environment Availability

> Skipped — this phase is a pure TypeScript code addition with no external tool dependencies beyond what already exists in the project.

---

## Validation Architecture

> `nyquist_validation` is `false` in `.planning/config.json` — section skipped.

---

## Security Domain

> `security_enforcement` not set to false, but this phase has no user-facing data inputs, authentication, cryptography, or network endpoints. The only user input is a modal dialog button click (handled by VS Code's own `showWarningMessage` API). No ASVS categories apply.

---

## Sources

### Primary (HIGH confidence)
- `src/extension.ts` — wkspWatchers Map, configurationChangedHandler, updateDiscoveryUX, notifiedConfigErrors, activate() watcher setup (verified lines cited throughout)
- `src/watchers/workspaceWatcher.ts` — startWatchingWorkspace pattern (returned array of FileSystemWatcher[], all three event handlers)
- `src/runners/testRunHandler.ts` — exact insertion point for run guard, featureParseComplete pattern
- `src/common.ts` — getDiscoveryEntry, DiscoveryEntry type, discoveryCache, getUrisOfWkspFoldersWithFeatures
- `src/parsers/fileParser.ts` — _pythonReparseTimers debounce pattern, _debouncePythonReparse implementation, PYTHON_REPARSE_DEBOUNCE_MS constant
- `test/unit/parsers/reparseFileDebounce.test.ts` — unit test pattern for debounce (sinon.useFakeTimers, clock.tickAsync)
- `.planning/research/PITFALLS.md` — 14 pitfalls verified against source, all cross-referenced

### Secondary (MEDIUM confidence)
- VS Code API docs (implicit) — `createFileSystemWatcher`, `RelativePattern`, `showWarningMessage` behavior verified against working usage in existing codebase
- VS Code bug #164925: bare filename in RelativePattern fails silently (cited in PITFALLS.md, behavior confirmed as design constraint in codebase comments)
- VS Code bug #72831: onDidChange fires before file content is committed (cited in PITFALLS.md, mitigation already in place for Python files via debounce)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all patterns verified in running codebase
- Architecture: HIGH — watcher module shape, Map pattern, insertion point all verified in source
- Pitfalls: HIGH — all 14 pitfalls cross-referenced against actual source lines in PITFALLS.md

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (stable VS Code API, no expected changes)
