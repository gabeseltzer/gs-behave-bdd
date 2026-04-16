# Technology Stack

**Project:** gs-behave-bdd — v1.1 Config File Watching + Malformed Config Run Guard
**Researched:** 2026-04-16
**Scope:** ADDITIONS ONLY for v1.1. v1.0 stack (smol-toml, hand-rolled INI parser, synchronous fs) remains unchanged and is not re-documented here.

---

## No New Dependencies

Zero new npm packages are needed for v1.1. Everything required is already available.

| Requirement | Source | Status |
|-------------|--------|--------|
| File system watching | `vscode.workspace.createFileSystemWatcher` | Built into VS Code API (engine ^1.82.0) |
| Glob scoping to workspace root | `vscode.RelativePattern` | Built into VS Code API |
| Discovery cache read | `getDiscoveryEntry()` in `src/common.ts` | Already exported |
| Config error state | `DiscoveryEntry.configError` in `src/common.ts` | Already defined |
| Warning popup with actions | `vscode.window.showWarningMessage()` | Already used in `extension.ts` |
| Debounce timer | Native `setTimeout` / `clearTimeout` | Pattern already in `src/parsers/fileParser.ts` lines 612-630 |

---

## VS Code APIs to Use

### `vscode.workspace.createFileSystemWatcher`

**Signature** (from installed `@types/vscode@1.82.0` — HIGH confidence):
```ts
createFileSystemWatcher(
  globPattern: GlobPattern,
  ignoreCreateEvents?: boolean,
  ignoreChangeEvents?: boolean,
  ignoreDeleteEvents?: boolean
): FileSystemWatcher
```

**Events on `FileSystemWatcher`:**
- `onDidCreate: Event<Uri>` — new file created (or renamed-in)
- `onDidChange: Event<Uri>` — file saved/modified
- `onDidDelete: Event<Uri>` — file deleted (or renamed-out)

**Disposal:** `FileSystemWatcher` extends `Disposable`. Must be pushed into `context.subscriptions` or manually disposed. The existing pattern in `extension.ts` lines 599-604 disposes old watchers before creating replacements during `configurationChangedHandler`.

**Why VS Code's watcher over chokidar or Node.js `fs.watch`:** VS Code's watcher runs out-of-process. It is more reliable than `fs.watch` (which has known platform inconsistencies on Windows), has no bundle cost, and is the established pattern in this codebase.

---

### `vscode.RelativePattern`

**Signature** (from `@types/vscode/index.d.ts` lines 2082-2135 — HIGH confidence):
```ts
constructor(base: WorkspaceFolder | Uri | string, pattern: string)
```

**Config file glob pattern:**
```ts
new vscode.RelativePattern(wkspUri, '{behave.ini,.behaverc,setup.cfg,tox.ini,pyproject.toml}')
```

The `{}` brace expansion is supported in VS Code's glob syntax (documented in the `GlobPattern` type definition). This matches all 5 behave config filenames at the workspace root only — no `**` prefix, so subdirectories are not watched. This is correct for v1.1 scope (subdirectory scanning is a separate out-of-scope Active requirement).

The existing `workspaceWatcher.ts` uses `new vscode.RelativePattern(wkspSettings.uri, ...)` with a `Uri` base, confirming this constructor overload works in production.

---

### `vscode.window.showWarningMessage` (run guard)

**Signature** (already used in this codebase):
```ts
showWarningMessage(message: string, ...items: string[]): Thenable<string | undefined>
```

The run guard uses `await` on this to get the user's button choice before deciding whether to proceed. This is the same pattern as `testRunHandler.ts` line 49 (existing `"OK"` warning), but extended with a "Run Anyway" / "Open Config File" choice.

---

## Integration Points With Existing Infrastructure

### Where the config file watcher lives

Add it inside `src/watchers/workspaceWatcher.ts`, within `startWatchingWorkspace()`. The function already builds an array of watchers and returns them. The config watcher is added to this array as a third watcher (alongside the existing features-folder watcher and optional steps-outside-features watcher).

**Why here, not a new file:** The config watcher has one job (trigger re-discovery on config file events) and fits in ~25 lines. A new `configWatcher.ts` module would be unnecessary abstraction.

**Why this array, not a separate map:** `extension.ts` already disposes and replaces the entire `wkspWatchers` array on workspace folder changes (lines 599-604). Config watchers must participate in this lifecycle or they will leak.

### What the config watcher handler calls

On any config file event (create/change/delete), the handler needs to:

1. Call `getUrisOfWkspFoldersWithFeatures(true)` — the `forceRefresh: true` overload clears and rebuilds the discovery cache. Used at line 590 of `extension.ts` during `configurationChangedHandler`.
2. Call `updateDiscoveryUX()` — already in `extension.ts`, re-logs discovery output and re-fires the malformed config notification if still broken.
3. Call `parser.parseFilesForWorkspace(...)` — triggers test tree rebuild.

`updateDiscoveryUX` is not currently exported from `extension.ts`. Pass it as a callback parameter to `startWatchingWorkspace` to avoid circular coupling.

**Updated signature:**
```ts
export function startWatchingWorkspace(
  wkspUri: vscode.Uri,
  ctrl: vscode.TestController,
  testData: TestData,
  parser: FileParser,
  onConfigChange?: () => void   // new optional callback
): vscode.FileSystemWatcher[]
```

### Debounce

Use a closure-scoped `let configDebounceTimer: NodeJS.Timeout | undefined` inside `startWatchingWorkspace`. On each config file event, clear the previous timer and set a new 500ms one. This matches the existing debounce pattern in `fileParser.ts` lines 612-630 exactly.

500ms rationale: config changes are rare and expensive (full reparse), and editors emit multiple events on a single file save. 500ms is the established value for Python file debouncing in this codebase — use the same value for consistency.

### Run guard location

**File:** `src/runners/testRunHandler.ts`

**Position:** After the existing parse-readiness guard (lines 45-53), before `ctrl.createTestRun`. The run guard reads from `getDiscoveryEntry()` — which is already exported from `common.ts` (line 164) but not yet imported in `testRunHandler.ts`.

**One new import needed** in `testRunHandler.ts`:
```ts
import {
  countTestItems, getAllTestItems, getContentFromFilesystem, uriId,
  getUrisOfWkspFoldersWithFeatures, getWorkspaceSettingsForFile, rndNumeric,
  getDiscoveryEntry  // ADD THIS
} from '../common';
```

`getUrisOfWkspFoldersWithFeatures` is already imported there (line 9), so iterating workspaces to check each `DiscoveryEntry.configError` requires no additional infrastructure.

**Why read from `getDiscoveryEntry()` and not `WorkspaceSettings.configError`:** `WorkspaceSettings` does not expose `configError` — it only exposes `configFileUri` (verified in `src/settings.ts` lines 82-101). The config error lives only in `DiscoveryEntry` in `common.ts`. No changes to `WorkspaceSettings` are needed.

---

## What NOT to Add

| Temptation | Why to Avoid |
|------------|--------------|
| New `src/watchers/configWatcher.ts` file | 25 lines of watcher code does not justify a new module |
| Watching inside subdirectories | Out of scope for v1.1; subdirectory scan is a separate Active requirement |
| A separate watcher tracking map in `extension.ts` | Config watcher goes in the existing `wkspWatchers` array — no new state |
| `chokidar` or `fs.watch` | VS Code's built-in watcher is more reliable and has zero bundle cost |
| Making `updateDiscoveryUX` a public export | Expose as a callback parameter instead; keeps coupling explicit |
| Hard-blocking the run on config error | Non-blocking warning with "Run Anyway" matches VS Code UX conventions; users may have valid reasons to run |
| Exposing `configError` on `WorkspaceSettings` | Unnecessary; `getDiscoveryEntry()` is already the right access point |

---

## Sources

- `node_modules/@types/vscode/index.d.ts` lines 2082-2148 — `RelativePattern` constructor, `GlobPattern` glob syntax (HIGH confidence, installed package)
- `node_modules/@types/vscode/index.d.ts` — `createFileSystemWatcher` signature and `FileSystemWatcher` interface (HIGH confidence)
- `src/watchers/workspaceWatcher.ts` lines 14-15 — existing `RelativePattern(wkspSettings.uri, ...)` usage confirming `Uri` base works (HIGH confidence)
- `src/extension.ts` lines 37, 139, 590, 595-604 — watcher array tracking, disposal, and `forceRefresh` patterns (HIGH confidence)
- `src/extension.ts` lines 57-113 — `updateDiscoveryUX()` function — what the config watcher callback must trigger (HIGH confidence)
- `src/runners/testRunHandler.ts` lines 45-53 — parse-readiness guard pattern used as model for run guard (HIGH confidence)
- `src/common.ts` lines 32-40, 161-168 — `DiscoveryEntry` interface with `configError` field and `getDiscoveryEntry()` export (HIGH confidence)
- `src/settings.ts` lines 82-101 — `WorkspaceSettings.configFileUri` present, `configError` absent — confirms run guard must use `getDiscoveryEntry`, not `WorkspaceSettings` (HIGH confidence)
- `src/parsers/fileParser.ts` lines 612-630 — closure-scoped debounce timer pattern (HIGH confidence)
