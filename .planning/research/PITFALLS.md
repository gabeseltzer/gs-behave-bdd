# Domain Pitfalls: Config File Watching and Run Guard

**Domain:** VS Code extension — FileSystemWatcher for behave config files, cache invalidation, run guard
**Researched:** 2026-04-16
**Codebase verified:** Yes — all findings cross-referenced against `src/watchers/workspaceWatcher.ts`,
`src/extension.ts`, `src/runners/testRunHandler.ts`, `src/parsers/configParser.ts`, `src/common.ts`

---

## Critical Pitfalls

Mistakes that cause silent resource leaks, stale state, or broken extension behavior.

---

### Pitfall 1: Config Watcher Disposal Leak in `configurationChangedHandler`

**What goes wrong:** `configurationChangedHandler` in `extension.ts` (lines 599–604) already handles
_feature/steps_ watcher recycling correctly: it disposes old watchers from `wkspWatchers`, then calls
`startWatchingWorkspace` and pushes the new ones into `context.subscriptions`. The new config file
watchers must follow this exact same pattern. If config watchers are pushed to
`context.subscriptions` without an equivalent `wkspConfigWatchers.get(wkspUri)?.forEach(w => w.dispose())`
call before the push, every settings-change event creates a new undisposed watcher. On a long session
with frequent settings changes, config files accumulate multiple active watchers for the same files.

**Why it happens:** The `context.subscriptions.push(watcher)` API is designed for watchers that live
for the entire extension lifetime. Config watchers are per-workspace and can change if the workspace
folder set changes. When a watcher is pushed to subscriptions without disposing the previous one, the
old watcher is not garbage-collected because VS Code holds a reference to it via subscriptions.

**Consequences:**
- Multiple `onDidChange` handlers fire for the same config file edit; `getUrisOfWkspFoldersWithFeatures(true)`
  is called N times in rapid succession where N is the number of unrecycled watchers
- `configurationChangedHandler` is called multiple times (already noted in its own comment as a known
  issue); config watchers make this dramatically worse
- On Linux, each leaked inotify watch consumes a file descriptor; large workspaces hit the system limit
  (`/proc/sys/fs/inotify/max_user_watches`) and future watchers silently stop working

**Prevention:**
- Maintain a parallel `wkspConfigWatchers: Map<vscode.Uri, vscode.FileSystemWatcher[]>` (same shape as
  the existing `wkspWatchers` map)
- In `configurationChangedHandler`, before creating new config watchers, dispose old ones:
  ```typescript
  const oldConfigWatchers = wkspConfigWatchers.get(wkspUri);
  if (oldConfigWatchers) oldConfigWatchers.forEach(w => w.dispose());
  ```
- Push new config watchers into `context.subscriptions` only when they are first created (activation),
  OR manage lifetime entirely via the Map and explicit `dispose()` in a `context.subscriptions.push({
  dispose() { ... } })` call at activation time

**Detection:** Add `diagLog` inside `startWatchingConfigFiles` counting active watchers. Trigger a
configuration change and check whether the count grows unboundedly.

**Phase:** Watcher creation and `configurationChangedHandler` update.

---

### Pitfall 2: Glob Pattern Required — Exact Filename Fails Silently

**What goes wrong:** Using a bare filename (e.g., `new vscode.RelativePattern(wkspUri, 'behave.ini')`)
in `createFileSystemWatcher` does NOT fire events in many VS Code versions. This is a confirmed VS Code
bug (issue #164925). The watcher is created without error, subscriptions are registered without error,
and the extension silently never reacts to config file changes.

**Why it happens:** VS Code's watcher dispatch requires a pattern with a wildcard or path separator to
be recognized as a "recursive watch request." A plain filename string fails the pattern-recognition check
in the native watcher backend.

**Consequences:** Config file editing never triggers re-discovery. The user edits `behave.ini`, nothing
happens, they assume the extension is broken.

**Prevention:**
- Always use a glob pattern: `**/behave.ini`, `**/.behaverc`, `**/setup.cfg`, `**/tox.ini`,
  `**/pyproject.toml`
- Alternatively: one watcher per workspace root covering all config files:
  `new vscode.RelativePattern(wkspUri, '{behave.ini,.behaverc,setup.cfg,tox.ini,pyproject.toml}')`
  — this fires on any of the five files and is more efficient than five separate watchers
- Test this: create a watcher in a dev host and save a `behave.ini` — confirm the handler fires
  before writing any downstream logic

**Detection:** Add a `console.log` or `diagLog` inside the config watcher `onDidChange` handler during
development and physically save a config file to confirm the event fires.

**Phase:** Watcher pattern construction.

---

### Pitfall 3: `onDidChange` Fires Before File Content Is Updated on Disk

**What goes wrong:** VS Code fires `FileSystemWatcher.onDidChange` to extensions _before_ the VS Code
text model and in some cases the underlying file are fully committed. Reading the config file immediately
inside the event handler (e.g., `fs.readFileSync(uri.fsPath)`) can return stale content — the previous
version of the file (confirmed VS Code issue #72831).

**Why it happens:** The OS file-write and the VS Code event dispatch are not atomic. The watcher event
can arrive before the file buffer is flushed to disk.

**Consequences:** The extension re-parses the config file, gets the old content, updates the discovery
cache with the old result, and silently leaves the test tree in the pre-change state. The user edits
`paths = features/api`, saves, sees no change, edits again, and the second save (which also re-reads
old content) still does not update.

**Prevention:**
- Debounce the handler with a 500ms delay (matching the existing Python step file debounce in
  `fileParser.ts`) before calling `getUrisOfWkspFoldersWithFeatures(true)`. By 500ms the file is
  always fully flushed
- The debounce also collapses rapid-save events (e.g., auto-save on every keystroke) into a single
  re-discovery call
- Do NOT use `vscode.workspace.openTextDocument(uri)` inside the watcher handler — it can also return
  cached pre-change content. Use `fs.readFileSync` inside the debounced callback instead (which
  `configParser.ts` already does)

**Phase:** Config watcher handler implementation.

---

### Pitfall 4: `getUrisOfWkspFoldersWithFeatures(true)` Called from Watcher — Must Not Block

**What goes wrong:** The config watcher handler, when fired, must call
`getUrisOfWkspFoldersWithFeatures(true)` to invalidate and rebuild the discovery cache. That function
calls `findBehaveConfig` which calls `fs.readFileSync` synchronously for up to 5 config files per
workspace. This is acceptable for the initial load and for explicit `forceRefresh` calls. However, if
the watcher handler runs on the extension host's main thread (which all VS Code extension code does),
a slow synchronous read can briefly freeze the UI.

The bigger risk: the watcher fires `onDidChange` for _every_ keystroke if the user has auto-save
enabled with a short delay. Without a debounce, this calls `fs.readFileSync` × N-config-files ×
N-workspaces on every keypress in any of the five config files.

**Why it happens:** Auto-save in VS Code can be configured to save on every change event with a 100ms
delay. Five rapid saves = five synchronous re-parse cycles.

**Consequences:** Noticeable UI lag in a large workspace. More subtly: each synchronous call holds the
extension host event loop, potentially causing `featureParseComplete` timeout in the test runner to
expire prematurely (it waits 1000ms max).

**Prevention:**
- 500ms debounce on the config watcher handler is mandatory, not optional
- The debounce timer reference must be per-workspace (not a single module-level timer) to avoid
  one workspace's rapid edits cancelling another workspace's pending re-discovery
- Pattern: `const configDebounceTimers = new Map<string, NodeJS.Timeout>()`; clear+reset per wkspUri

**Phase:** Config watcher handler implementation and per-workspace debounce design.

---

### Pitfall 5: Cache Invalidation Race — Run Guard Checks Stale Cache

**What goes wrong:** The run guard (checking `entry.configError` before allowing a test run) reads from
the discovery cache. The config watcher fires, the 500ms debounce starts, and 300ms later the user
clicks "Run Tests." The guard reads the cache which still holds the pre-change `configError: undefined`
entry, and the run proceeds. Meanwhile, the debounce fires 200ms into the test run and overwrites
`WorkspaceSettings` mid-run.

More dangerous scenario in reverse: user fixes a malformed config, cache not yet refreshed, guard
incorrectly blocks a run that would now succeed.

**Why it happens:** The debounce introduces a window between "file changed" and "cache updated." The
run guard is synchronous (cache read, check `configError`, proceed), not awaitable.

**Consequences:**
- False negative guard: run proceeds with a broken config, behave crashes with a confusing error
  instead of the helpful warning
- False positive guard: user just fixed the config, guard still shows warning, user is confused

**Prevention:**
- Accept that a short window of stale-cache behavior is unavoidable without making the run guard
  async (which would add 500ms+ latency to every test run). This is acceptable — the guard is a
  "best effort" UX aid, not a hard blocker
- Keep the debounce short (500ms) to minimize the stale window
- The guard warning must say "the last-known config state has an error" not "your config is currently
  broken" — framing that acknowledges the snapshot nature of the cache
- When the guard is triggered and the user dismisses it, do NOT re-run automatically after debounce
  completes — that would be surprising. Let the user click Run again

**Phase:** Run guard implementation in `testRunHandler.ts`.

---

### Pitfall 6: `notifiedConfigErrors` Set Not Cleared on Config Watcher Re-Discovery

**What goes wrong:** `extension.ts` maintains a `notifiedConfigErrors: Set<string>` to avoid showing
the same malformed-config warning notification more than once per session (line 41). After a config
file watcher fires and re-discovery runs, if the file is still malformed the notification is suppressed
because the key is still in `notifiedConfigErrors`. The user edits `pyproject.toml`, introduces a
syntax error, sees the warning, fixes it, introduces a different error — but the second error is silently
swallowed.

However, the set IS cleared when `updateDiscoveryUX` is called with `clearNotifiedErrors: true` (which
`configurationChangedHandler` does when `forceFullRefresh === true`, but NOT when the config watcher
triggers a soft re-discovery).

**Why it happens:** `clearNotifiedErrors` is `false` in the normal config-change path (see line 619).
The guard is intentionally designed to suppress repeated notifications — but a new error in a previously-
errored file is a new, distinct user-visible event.

**Consequences:** A user who fixes-then-breaks `pyproject.toml` in the same session sees no second
warning. The Problems panel diagnostic IS updated (it calls `setConfigParseErrorDiagnostic`), but the
popup notification is silently skipped.

**Prevention:**
- When a config watcher triggers re-discovery, pass `clearNotifiedErrors: true` to `updateDiscoveryUX`
  for the affected workspace(s). The notification is per-file per-error-key, so clearing and re-checking
  against the new parse result is correct
- Alternative: key `notifiedConfigErrors` on `${filePath}:${errorMessage}` hash so a new error
  message on the same file is always shown, while the exact same error on re-load is suppressed

**Phase:** Config watcher handler → `updateDiscoveryUX` call site.

---

## Moderate Pitfalls

---

### Pitfall 7: Run Guard False Positive — `configError` Survives After User Switches to Manual Settings

**What goes wrong:** The discovery cache `DiscoveryEntry` is populated with `configError` when a config
file is malformed. If the user then adds `featuresPath` to `settings.json` (switching to Branch A:
explicit settings), `getUrisOfWkspFoldersWithFeatures(true)` takes Branch A and writes a new entry
with `source: "settings"` and NO `configError`. But the old `configError` entry is gone only if
`discoveryCache.clear()` was called first — which it IS (line 175 in `common.ts`).

The false-positive risk is NOT in the cache clear, but in `WorkspaceSettings`: the settings constructor
reads `getDiscoveryEntry(wkspUri)` (line 99 of `settings.ts`). If `configurationChangedHandler` calls
`config.reloadSettings(wkspUri)` (which constructs `WorkspaceSettings`) and the discovery cache has NOT
been refreshed yet at that point, the old entry (with `configError`) is used. The run guard then reads
`wkspSettings.configError` and shows a false positive even though the user has explicitly configured paths.

**Why it happens:** `configurationChangedHandler` calls `config.reloadSettings(wkspUri)` inside the
`getUrisOfWkspFoldersWithFeatures(true)` loop (lines 598–604). The `(true)` argument refreshes the
cache before the loop executes, so the `WorkspaceSettings` constructor should see the fresh entry.
However, if a _config watcher_ triggers re-discovery via a separate code path that does NOT call
`config.reloadSettings`, `WorkspaceSettings.configFileUri` and `WorkspaceSettings.discoverySource`
can be out of sync with the updated cache.

**Prevention:**
- Config watcher re-discovery must call `configurationChangedHandler(undefined, undefined, false)` (or
  an equivalent path that calls `config.reloadSettings`) — not just `getUrisOfWkspFoldersWithFeatures(true)`
  alone. This ensures `WorkspaceSettings` is rebuilt from the fresh cache
- The run guard must read `configError` from the _discovery cache_ directly via `getDiscoveryEntry(wkspUri)`,
  not from the (potentially stale) `WorkspaceSettings` snapshot

**Phase:** Config watcher handler design — what it calls downstream.

---

### Pitfall 8: Run Guard Fires for Every Workspace — Multi-Root Edge Case

**What goes wrong:** In a multi-root workspace with three folders, one has a malformed config and two
are fine. The guard checks `configError` on the specific workspace(s) in the test request. If the guard
is implemented as "check all workspaces" rather than "check workspaces relevant to the test request,"
the malformed-but-irrelevant workspace blocks runs in the healthy workspaces.

**Prevention:**
- Scope the guard check to the workspace URIs that contain the tests in the current `TestRunRequest`
- Pattern: extract workspace URI from each `QueueItem.test` (use `getWorkspaceSettingsForFile`), then
  check `getDiscoveryEntry(wkspUri)?.configError` only for those workspaces
- Mirror how `testRunHandler.ts` already scopes `wskpsWithFeaturesSettings` to the current queue

**Phase:** Run guard implementation in `testRunHandler.ts`.

---

### Pitfall 9: Config Watcher Fires for ALL Five File Types — `setup.cfg` and `tox.ini` Are Noisy

**What goes wrong:** Watching `setup.cfg` means the watcher fires on any save of that file — including
changes to `[flake8]`, `[mypy]`, or other non-behave sections. Each save triggers a 500ms debounce,
re-reads the file, re-runs `configParser.ts`, and potentially triggers re-discovery. For a project
that frequently edits `setup.cfg` for unrelated tooling config, this is unnecessary churn.

**Why it matters:** `configParser.ts` already handles "no `[behave]` section = skip" correctly, so the
churn is harmless for _correctness_. The issue is performance and log noise: every `setup.cfg` save
produces a discovery log in the output channel even if nothing changed.

**Prevention:**
- In the config watcher handler, after the debounce fires, compare the new discovery result to the
  current cache entry before calling `updateDiscoveryUX` or triggering re-parsing
- If the discovery entry is identical (same `source`, same `featuresUri`, no `configError`), skip the
  downstream re-discovery calls entirely — this is a no-op refresh guard
- Log at `diagLog` level only (not `logInfo`) when a re-discovery produces no change

**Phase:** Config watcher handler — change-detection optimization.

---

### Pitfall 10: `onDidCreate` for Config Files Requires `forceRefresh` — Not Just `onDidChange`

**What goes wrong:** A user creates `behave.ini` in a workspace that was previously using convention
discovery. The watcher must fire `onDidCreate` and trigger a full re-discovery with `forceRefresh`.
But `onDidCreate` may not fire if the watcher pattern only covers `onDidChange`.

All three watcher events (create, change, delete) are relevant:
- `onDidCreate`: new config file added → re-discover (may switch source from `convention` to `config-file`)
- `onDidChange`: config file edited → re-parse and update cache
- `onDidDelete`: config file removed → re-discover (may fall back to `convention`)

The existing `workspaceWatcher.ts` sets all three. A config watcher must do the same.

**Prevention:**
- Register handlers for all three events on every config watcher
- `onDidDelete` specifically must call `getUrisOfWkspFoldersWithFeatures(true)` since deleting
  `behave.ini` means the discovery source changes (falls back to `.behaverc`, then convention)
- Do NOT assume the watcher fires `onDidDelete` when a user runs `git checkout HEAD -- behave.ini`
  (git branch switches): VS Code may fire `onDidChange` instead, depending on git's atomic rename
  strategy (known inconsistency, issue #56549). Handle both events as "re-discover"

**Phase:** Config watcher setup — all three event handlers.

---

### Pitfall 11: Run Guard Must Not Block the Debug Path

**What goes wrong:** The run guard in `testRunHandler.ts` (lines 45–53) currently only guards the
`featureParseComplete` check. A new `configError` guard inserted in the same function will also run
for debug runs. Blocking a debug run (which spawns a debug adapter and may have already attached a
debug server) with a warning popup is more disruptive than blocking a regular run.

**Why it happens:** The `runHandler` returned by `testRunHandler()` is registered for both "Run Tests"
and "Debug Tests" profiles (lines 407–418 in `extension.ts`). Both call the same `runHandler(debug,
request)` function.

**Prevention:**
- The guard warning may still make sense for debug runs since a malformed config causes behave to exit
  immediately (same as a regular run), but give the debug case special treatment: show the warning but
  default the dismiss action to "Run Anyway" rather than requiring explicit confirmation
- Alternatively, allow the run through for debug always (debug is typically used by advanced users who
  know what they're doing) and only block/warn for non-debug runs

**Phase:** Run guard implementation — handling `debug` parameter.

---

## Minor Pitfalls

---

### Pitfall 12: `files.watcherExclude` May Silently Exclude Config Files

**What goes wrong:** VS Code allows users to configure `files.watcherExclude` to prevent the file
watcher from monitoring certain paths. A user who has `"**/setup.cfg": true` in this setting will
not receive events for `setup.cfg` changes. The extension watcher respects this setting silently.

**Prevention:**
- This is expected behavior, not a bug to work around
- Document in the output channel (at `diagLog` level) which config files are being watched on activation
- If initial discovery found a config file, log it at startup so the user knows which file the extension
  found and is monitoring

**Phase:** Config watcher logging at startup.

---

### Pitfall 13: Watcher Pattern Must Use `RelativePattern(wkspUri, ...)` Not `RelativePattern(configFileUri, ...)`

**What goes wrong:** A tempting shortcut: create a `RelativePattern` using the specific `configFileUri`
(e.g., `new vscode.RelativePattern(configFileUri, '*')`). This creates a watcher scoped to the directory
_containing_ the config file, not the workspace root. For workspace-root config files this is equivalent,
but for config files found via subdirectory scan (future milestone), the pattern scope would be wrong —
it would watch only that subdirectory and miss sibling config files that might be created at a different
level.

**Prevention:**
- Always anchor config watchers to `wkspUri` (the workspace root):
  `new vscode.RelativePattern(wkspUri, '{behave.ini,.behaverc,setup.cfg,tox.ini,pyproject.toml}')`
- This also means one watcher per workspace (not one per config file), which is more efficient
- Keep the watcher count aligned with the existing `startWatchingWorkspace` convention: one call per
  workspace, returning an array of watchers

**Phase:** Config watcher construction.

---

### Pitfall 14: Integration Test `integrationTestRun` Guard Bypasses Watcher Re-Discovery

**What goes wrong:** `configurationChangedHandler` has an early exit for integration tests:
`if (config.integrationTestRun && !testCfg) return;` (line 570). A config watcher handler that calls
`configurationChangedHandler` directly will be silently skipped during integration test runs.

**Consequences:** Integration tests that test config file watching behavior will pass vacuously unless
the watcher handler invokes the re-discovery logic directly rather than routing through
`configurationChangedHandler`.

**Prevention:**
- Config watcher re-discovery should call `getUrisOfWkspFoldersWithFeatures(true)` and
  `parser.parseFilesForWorkspace(...)` directly (like a targeted refresh), not delegate through
  `configurationChangedHandler`. This also avoids the integration test bypass
- The run guard read path is unaffected (it reads the cache directly) but tests for the watcher should
  verify the cache is updated, not that `configurationChangedHandler` was called

**Phase:** Config watcher handler — routing to re-discovery logic.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Watcher creation | Pitfall 2: exact filename fails | Use `{behave.ini,.behaverc,...}` glob pattern |
| Watcher disposal | Pitfall 1: leak on config reload | Mirror `wkspWatchers` Map pattern; dispose before replacing |
| Watcher event handler | Pitfall 3: stale file content on `onDidChange` | 500ms debounce before reading file |
| Debounce design | Pitfall 4: per-workspace timer required | `Map<string, NodeJS.Timeout>` keyed by `wkspUri` path |
| Run guard implementation | Pitfall 5: race between debounce and run | Accept best-effort; guard message frames it as last-known state |
| Run guard implementation | Pitfall 7: stale `WorkspaceSettings` | Read guard from cache via `getDiscoveryEntry`, not `wkspSettings` |
| Run guard multi-root | Pitfall 8: blocks healthy workspaces | Scope check to queue's workspace URIs only |
| `notifiedConfigErrors` handling | Pitfall 6: second error suppressed | Clear set on watcher-triggered re-discovery |
| Config file create/delete | Pitfall 10: all three events required | Register `onDidCreate`, `onDidChange`, `onDidDelete` |
| Integration tests | Pitfall 14: `integrationTestRun` bypass | Route watcher handler to direct cache+parser calls, not `configurationChangedHandler` |

---

## Sources

- VS Code issue #164925: FileSystemWatcher not firing with complete filename (no wildcard)
- VS Code issue #72831: FileSystemWatcher fires before text documents are updated (stale read race)
- VS Code issue #56549: FileSystemWatcher behavior differs in workspace vs folder case for renames
- VS Code File Watcher Issues wiki: platform-specific limitations, `files.watcherExclude` behavior
- Roo-Code issue #4230: FileSystemWatcher leak from broken disposal chain
- Extension source: `src/extension.ts` lines 138–141, 598–604 (watcher lifecycle patterns)
- Extension source: `src/extension.ts` lines 41, 619 (`notifiedConfigErrors` and `clearNotifiedErrors`)
- Extension source: `src/runners/testRunHandler.ts` lines 45–53 (existing run guard pattern)
- Extension source: `src/common.ts` lines 160–175 (discovery cache and `forceRefresh` mechanics)
