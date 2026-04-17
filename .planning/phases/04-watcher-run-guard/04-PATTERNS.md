# Phase 4: Watcher & Run Guard - Pattern Map

**Mapped:** 2026-04-16
**Files analyzed:** 5 (3 new, 2 modified)
**Analogs found:** 5 / 5

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/watchers/configWatcher.ts` | watcher | event-driven | `src/watchers/workspaceWatcher.ts` | exact |
| `src/extension.ts` (watcher wiring) | config | event-driven | `src/extension.ts` lines 137-141, 598-604 | self-reference (same file) |
| `src/runners/testRunHandler.ts` (run guard) | middleware | request-response | `src/runners/testRunHandler.ts` lines 45-53 | self-reference (same file, adjacent guard) |
| `test/unit/watchers/configWatcher.test.ts` | test | event-driven | `test/unit/parsers/reparseFileDebounce.test.ts` | exact |
| `test/unit/runners/testRunHandler.test.ts` (run guard tests) | test | request-response | `test/unit/runners/testRunHandler.test.ts` (existing file) | self-reference |

---

## Pattern Assignments

### `src/watchers/configWatcher.ts` (watcher, event-driven)

**Analog:** `src/watchers/workspaceWatcher.ts`

**Imports pattern** (`src/watchers/workspaceWatcher.ts` lines 1-7):
```typescript
import * as vscode from 'vscode';
import { basename, isFeatureFile, isStepsFile } from '../common';
import { config } from "../configuration";
import { diagLog, DiagLogType } from '../logger';
import { FileParser } from '../parsers/fileParser';
import { TestData } from '../parsers/testFile';
```

For `configWatcher.ts`, replace domain-specific imports with:
```typescript
import * as vscode from 'vscode';
import { config } from '../configuration';
import { diagLog } from '../logger';
import { FileParser } from '../parsers/fileParser';
import { TestData } from '../parsers/testFile';
import { getUrisOfWkspFoldersWithFeatures } from '../common';
// updateDiscoveryUX will be passed as a callback or imported once exported from extension.ts
```

**Module-level timer Map pattern** (`src/parsers/fileParser.ts` line 42 — exact shape to use at module level in `configWatcher.ts`):
```typescript
// fileParser.ts — private class field (the exact pattern, moved to module scope):
private _pythonReparseTimers: Map<string, NodeJS.Timeout> = new Map();
private static readonly PYTHON_REPARSE_DEBOUNCE_MS = 500;

// In configWatcher.ts — module-level constant (not a class; mirrors workspaceWatcher.ts shape):
const CONFIG_GLOB = '{behave.ini,.behaverc,setup.cfg,tox.ini,pyproject.toml}';
const DEBOUNCE_MS = 500;
const configDebounceTimers = new Map<string, NodeJS.Timeout>();
```

**Function signature pattern** (`src/watchers/workspaceWatcher.ts` lines 9-10):
```typescript
export function startWatchingWorkspace(wkspUri: vscode.Uri, ctrl: vscode.TestController, testData: TestData,
  parser: FileParser): vscode.FileSystemWatcher[] {
```

`configWatcher.ts` uses the identical shape — same parameters, same return type `vscode.FileSystemWatcher[]`. Additionally needs `updateDiscoveryUX` (either passed as callback or called via import once exported):
```typescript
export function startWatchingConfigFiles(
  wkspUri: vscode.Uri,
  ctrl: vscode.TestController,
  testData: TestData,
  parser: FileParser,
  updateDiscoveryUX: (wkspUris: vscode.Uri[], clearNotifiedErrors: boolean) => void
): vscode.FileSystemWatcher[] {
```

**RelativePattern + createFileSystemWatcher pattern** (`src/watchers/workspaceWatcher.ts` lines 14-15):
```typescript
const pattern = new vscode.RelativePattern(wkspSettings.uri, `${wkspSettings.workspaceRelativeFeaturesPath}/**`);
const watcher = vscode.workspace.createFileSystemWatcher(pattern);
```

For `configWatcher.ts` — must use brace-expansion glob (bare filenames silently fail, per PITFALL-02):
```typescript
const pattern = new vscode.RelativePattern(wkspUri, CONFIG_GLOB);
const watcher = vscode.workspace.createFileSystemWatcher(pattern);
```

**Debounce implementation** (`src/parsers/fileParser.ts` lines 612-711 — `_debouncePythonReparse`):
```typescript
private _debouncePythonReparse(fileUri: vscode.Uri, content: string, wkspSettings: WorkspaceSettings) {
  // Keyed per-workspace
  const wkspKey = wkspSettings.uri.path;

  // Cancel any pending timer for this workspace
  const existingTimer = this._pythonReparseTimers.get(wkspKey);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(async () => {
    this._pythonReparseTimers.delete(wkspKey);
    try {
      // ... async work ...
    } finally {
      this._reparsingFile = false;
    }
  }, FileParser.PYTHON_REPARSE_DEBOUNCE_MS);

  this._pythonReparseTimers.set(wkspKey, timer);
}
```

**All-three-events registration pattern** (`src/watchers/workspaceWatcher.ts` lines 39-76):
```typescript
const setEventHandlers = (watcher: vscode.FileSystemWatcher) => {
  // fires on either new file/folder creation OR rename (inc. git actions)
  watcher.onDidCreate(uri => updater(uri));

  // fires on file save (inc. git actions)
  watcher.onDidChange(uri => updater(uri));

  // fires on either file/folder delete OR rename (inc. git actions)
  watcher.onDidDelete(uri => {
    if (uri.scheme !== "file")
      return;
    try {
      // ... delete-specific logic ...
    }
    catch (e: unknown) {
      config.logger.showError(e, wkspUri);
    }
  });
};
```

For `configWatcher.ts` — all three events share the same debounced handler (D-03, no special-casing for delete):
```typescript
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
      // Direct cache invalidation — do NOT call configurationChangedHandler (PITFALL-04)
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
```

**Return pattern** (`src/watchers/workspaceWatcher.ts` lines 79-86):
```typescript
setEventHandlers(watcher);
if (watcher2) {
  setEventHandlers(watcher2);
  watchers.push(watcher2);
}
return watchers;
```

For `configWatcher.ts` — single watcher covering all five filenames via brace glob, so:
```typescript
return [watcher];
```

**Error handling pattern** (`src/watchers/workspaceWatcher.ts` lines 29-36 — updater function):
```typescript
try {
  console.log(`updater: ${uri.fsPath}`);
  parser.reparseFile(uri, undefined, wkspSettings, testData, ctrl);
}
catch (e: unknown) {
  // entry point function (handler) - show error
  config.logger.showError(e, wkspUri);
}
```

All watcher event callbacks are entry-point functions. Error pattern: `config.logger.showError(e, wkspUri)` inside try/catch — identical in `configWatcher.ts`.

---

### `src/extension.ts` — wkspConfigWatchers Map and wiring (config, event-driven)

**Analog:** `src/extension.ts` itself — self-reference to the `wkspWatchers` Map pattern.

**Module-level Map declaration** (`src/extension.ts` line 37):
```typescript
const wkspWatchers = new Map<vscode.Uri, vscode.FileSystemWatcher[]>();
```

Add directly below this line:
```typescript
const wkspConfigWatchers = new Map<vscode.Uri, vscode.FileSystemWatcher[]>();
```

**Activation watcher loop** (`src/extension.ts` lines 137-141):
```typescript
for (const wkspUri of getUrisOfWkspFoldersWithFeatures()) {
  const watchers = startWatchingWorkspace(wkspUri, ctrl, testData, parser);
  wkspWatchers.set(wkspUri, watchers);
  watchers.forEach(w => context.subscriptions.push(w));
}
```

Add a parallel loop immediately after (or fold into the same loop):
```typescript
for (const wkspUri of getUrisOfWkspFoldersWithFeatures()) {
  const configWatchers = startWatchingConfigFiles(wkspUri, ctrl, testData, parser, updateDiscoveryUX);
  wkspConfigWatchers.set(wkspUri, configWatchers);
  configWatchers.forEach(w => context.subscriptions.push(w));
}
```

**configurationChangedHandler disposal and recreation** (`src/extension.ts` lines 598-604):
```typescript
config.reloadSettings(wkspUri);
const oldWatchers = wkspWatchers.get(wkspUri);
if (oldWatchers)
  oldWatchers.forEach(w => w.dispose());
const watchers = startWatchingWorkspace(wkspUri, ctrl, testData, parser);
wkspWatchers.set(wkspUri, watchers);
watchers.forEach(w => context.subscriptions.push(w));
```

Add parallel config watcher disposal/recreation immediately after:
```typescript
const oldConfigWatchers = wkspConfigWatchers.get(wkspUri);
if (oldConfigWatchers)
  oldConfigWatchers.forEach(w => w.dispose());
const configWatchers = startWatchingConfigFiles(wkspUri, ctrl, testData, parser, updateDiscoveryUX);
wkspConfigWatchers.set(wkspUri, configWatchers);
configWatchers.forEach(w => context.subscriptions.push(w));
```

**`updateDiscoveryUX` visibility** — currently a local function (`src/extension.ts` line 57). Must be exported so `configWatcher.ts` can call it, OR passed as a callback parameter. The callback approach used above avoids making the function a module export and avoids circular import risk. Both are valid — the callback parameter is the cleaner choice since `workspaceWatcher.ts` uses no imports from `extension.ts`.

---

### `src/runners/testRunHandler.ts` — run guard insertion (middleware, request-response)

**Analog:** `src/runners/testRunHandler.ts` lines 45-53 — the existing `featureParseComplete` guard, which is the exact pattern the new guard must mirror.

**Existing guard pattern** (`src/runners/testRunHandler.ts` lines 45-53 — insert new guard immediately after):
```typescript
const ready = await parser.featureParseComplete(1000, "testRunHandler");
if (!ready) {
  const msg = "Cannot run tests while feature files are being parsed, please try again.";
  diagLog(msg, undefined, DiagLogType.warn);
  vscode.window.showWarningMessage(msg, "OK");
  if (config.integrationTestRun)
    throw msg;
  return;
}
// <-- INSERT run guard check here, BEFORE ctrl.createTestRun (line 58)
```

**Warning dialog pattern** (`src/extension.ts` lines 95-106 — `updateDiscoveryUX` malformed-config notification):
```typescript
vscode.window.showWarningMessage(
  `Behave BDD: Could not parse "${basename(errorUri)}": ${msg}\n\nFalling back to "features/" convention.`,
  'Open Config File',
  'Open Settings'
).then(action => {
  if (action === 'Open Config File') {
    vscode.commands.executeCommand('vscode.open', errorUri);
  } else if (action === 'Open Settings') {
    vscode.commands.executeCommand('workbench.action.openSettings', 'gs-behave-bdd');
  }
});
```

For the run guard, use `await` (not `.then`) to gate execution on user response, with three buttons:
```typescript
const choice = await vscode.window.showWarningMessage(
  `Config file '${filename}' has parse errors. Tests may not discover correctly.`,
  'Run Anyway',
  'Open Config File',
  'Cancel'
);
if (choice === 'Run Anyway') {
  // proceed — fall through
} else if (choice === 'Open Config File') {
  vscode.commands.executeCommand('vscode.open', configFileUri);
  return; // cancel run — do NOT create TestRun
} else {
  return; // Cancel or ESC — cancel run
}
```

**Discovery cache read pattern** (`src/common.ts` lines 164-166):
```typescript
export function getDiscoveryEntry(wkspUri: vscode.Uri): DiscoveryEntry | undefined {
  return discoveryCache.get(uriId(wkspUri));
}
// DiscoveryEntry.configError = { configFileUri: vscode.Uri, errorMessage: string }
```

Run guard reads: `getDiscoveryEntry(wkspUri)?.configError`

**Workspace extraction from queue** (`src/runners/testRunHandler.ts` lines 82-109 — `queueSelectedTestItems` for the pattern of iterating `request.include`):
```typescript
for (const test of tests) {
  if (request.exclude?.includes(test)) continue;
  const data = testData.get(test);
  // ...
}
```

For run guard workspace scoping (GUARD-04): iterate `request.include` (or `ctrl.items` if null), call `getWorkspaceSettingsForFile(item.uri)` on each, collect unique workspace URIs into a `Set<string>` keyed by `uriId(wkspUri)`.

**Logging pattern** (`src/runners/testRunHandler.ts` line 39 — `diagLog` at entry):
```typescript
diagLog(`testRunHandler: invoked`);
```

Run guard audit trail (D-14) uses `config.logger.logInfo(...)` to the workspace output channel:
```typescript
config.logger.logInfo(`Run guard: config error in '${filename}' — user prompted`, wkspUri);
```

---

### `test/unit/watchers/configWatcher.test.ts` (test, event-driven)

**Analog:** `test/unit/parsers/reparseFileDebounce.test.ts`

**Imports pattern** (`test/unit/parsers/reparseFileDebounce.test.ts` lines 1-12):
```typescript
import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { FileParser } from '../../../src/parsers/fileParser';
import { WorkspaceSettings } from '../../../src/settings';
import * as commonModule from '../../../src/common';
import * as stepsMapModule from '../../../src/parsers/stepMappings';
import * as configModule from '../../../src/configuration';
import * as behaveLoaderModule from '../../../src/parsers/behaveLoader';
import * as adapterModule from '../../../src/parsers/stepsParserBehaveAdapter';
```

For `configWatcher.test.ts` — import the new module plus its dependencies:
```typescript
import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as configModule from '../../../src/configuration';
import * as commonModule from '../../../src/common';
// import { startWatchingConfigFiles } from '../../../src/watchers/configWatcher';
```

**`sinon.useFakeTimers()` setup/teardown** (`test/unit/parsers/reparseFileDebounce.test.ts` lines 55-86):
```typescript
setup(() => {
  clock = sinon.useFakeTimers();
  fileParser = new FileParser();
  // Stub external dependencies
  sinon.stub(configModule.config.logger, 'showError');
  sinon.stub(configModule.config.logger, 'showWarn');
  sinon.stub(configModule.config.logger, 'logInfo');
  sinon.stub(configModule.config.logger, 'show');
});

teardown(() => {
  fileParser.dispose();
  clock.restore();
  sinon.restore();
});
```

**Debounce assertions pattern** (`test/unit/parsers/reparseFileDebounce.test.ts` lines 115-131):
```typescript
test('rapid calls should result in single execution', async () => {
  const testData = new WeakMap();
  const ctrlStub = {} as vscode.TestController;

  await fileParser.reparseFile(stepsFileUri, 'content1', wkspSettings, testData, ctrlStub);
  await fileParser.reparseFile(stepsFileUri, 'content2', wkspSettings, testData, ctrlStub);
  await fileParser.reparseFile(stepsFileUri, 'content5', wkspSettings, testData, ctrlStub);

  await clock.tickAsync(500);

  assert.strictEqual(loadFromBehaveStub.callCount, 1,
    'loadFromBehave should only be called once despite rapid calls');
});
```

**Independent workspace timer test** (`test/unit/parsers/reparseFileDebounce.test.ts` lines 222-244):
```typescript
test('debounce for workspace A does not affect workspace B', async () => {
  // Call for workspace A
  await fileParser.reparseFile(stepsFileUri, 'contentA', wkspSettings, testData, ctrlStub);
  await clock.tickAsync(300);

  // Call for workspace B
  await fileParser.reparseFile(stepsFileUri2, 'contentB', wkspSettings2, testData, ctrlStub);

  // Advance 200ms — workspace A fires, B does not
  await clock.tickAsync(200);
  assert.strictEqual(loadFromBehaveStub.callCount, 1, 'only workspace A fires');

  // Advance 300ms — workspace B fires
  await clock.tickAsync(300);
  assert.strictEqual(loadFromBehaveStub.callCount, 2, 'workspace B fires');
});
```

**Dispose cleanup test** (`test/unit/parsers/reparseFileDebounce.test.ts` lines 267-282):
```typescript
test('pending timers should not fire after dispose', async () => {
  await fileParser.reparseFile(stepsFileUri, 'content', wkspSettings, testData, ctrlStub);
  fileParser.dispose();
  await clock.tickAsync(500);
  assert.strictEqual(loadFromBehaveStub.callCount, 0, 'should NOT be called after dispose');
});
```

Note: `configWatcher.ts` uses a module-level Map (not a class), so there is no `.dispose()` call. Instead, the test must directly invoke the watcher callbacks via stubs on `vscode.workspace.createFileSystemWatcher`.

---

### `test/unit/runners/testRunHandler.test.ts` — run guard tests (test, request-response)

**Analog:** `test/unit/runners/testRunHandler.test.ts` (existing file — extend with a new suite).

**Existing test module loading pattern** (`test/unit/runners/testRunHandler.test.ts` lines 38-52):
```typescript
setup(() => {
  appendOutputCalls = [];
  diagLogStub = sinon.stub(loggerModule, 'diagLog');
  void diagLogStub;

  // Clear module cache so each test gets a fresh import
  for (const key of Object.keys(require.cache)) {
    if (key.includes('testRunHandler')) {
      delete require.cache[key];
    }
  }
  const mod = require('../../../src/runners/testRunHandler');
  logWkspRunStarted = mod.logWkspRunStarted;
  logWkspRunComplete = mod.logWkspRunComplete;
});

teardown(() => {
  sinon.restore();
});
```

**Run guard stub pattern** — for `getDiscoveryEntry` and `vscode.window.showWarningMessage`:
```typescript
// In setup:
let getDiscoveryEntryStub: sinon.SinonStub;
let showWarningMessageStub: sinon.SinonStub;

getDiscoveryEntryStub = sinon.stub(commonModule, 'getDiscoveryEntry');
showWarningMessageStub = sinon.stub(vscode.window, 'showWarningMessage');

// In test bodies:
getDiscoveryEntryStub.returns({
  source: 'config-file',
  configFileUri: vscode.Uri.file('/workspace/behave.ini'),
  configError: {
    configFileUri: vscode.Uri.file('/workspace/behave.ini'),
    errorMessage: 'invalid syntax'
  },
  featuresUri: vscode.Uri.file('/workspace/features')
});

showWarningMessageStub.resolves('Run Anyway'); // or 'Open Config File', 'Cancel', undefined
```

---

## Shared Patterns

### Entry-Point Error Handling
**Source:** `src/watchers/workspaceWatcher.ts` lines 29-36, `src/runners/testRunHandler.ts` lines 68-71
**Apply to:** `configWatcher.ts` event callback, any new helper called directly from extension lifecycle
```typescript
catch (e: unknown) {
  // entry point function (handler) - show error
  config.logger.showError(e, wkspUri);
}
```

### Scheme Guard in Watcher Callbacks
**Source:** `src/watchers/workspaceWatcher.ts` lines 26-27 and 49-50
**Apply to:** All three event handlers in `configWatcher.ts`
```typescript
if (uri.scheme !== "file")
  return;
```

### diagLog for Diagnostic Tracing (D-13)
**Source:** `src/watchers/workspaceWatcher.ts` line 65, `src/parsers/fileParser.ts` line 626
**Apply to:** `configWatcher.ts` event handler and debounce timer body
```typescript
diagLog(`configWatcher: ${eventType} detected for ${eventUri.fsPath}`);
diagLog(`configWatcher: debounce timer reset for ${wkspUri.path}`);
```

### Status Bar Busy Signal
**Source:** `src/parsers/fileParser.ts` lines 67-68 — `_notifyStatusChange(true/false)` called from `parseFilesForWorkspace`
**Apply to:** No extra wiring needed — `parser.parseFilesForWorkspace(...)` already calls `_notifyStatusChange(true)` on entry and `_notifyStatusChange(false)` on completion, which flows through the `onStatusChange` callback registered in `extension.ts` lines 151-156 to set `statusItem.busy`. The config watcher just calls `parser.parseFilesForWorkspace(...)` and gets busy/ready feedback for free.

### Sinon Fake Timers Test Pattern
**Source:** `test/unit/parsers/reparseFileDebounce.test.ts` lines 55-56, 82-86
**Apply to:** `test/unit/watchers/configWatcher.test.ts` setup/teardown
```typescript
setup(() => {
  clock = sinon.useFakeTimers();
  // stub logger methods to prevent channel access errors:
  sinon.stub(configModule.config.logger, 'showError');
  sinon.stub(configModule.config.logger, 'logInfo');
});
teardown(() => {
  clock.restore();
  sinon.restore();
});
```

### Workspace URI Key for Timer Maps
**Source:** `src/parsers/fileParser.ts` lines 615, 624
**Apply to:** `configDebounceTimers` key selection in `configWatcher.ts`
```typescript
const wkspKey = wkspSettings.uri.path;  // fileParser.ts pattern
// configWatcher.ts equivalent:
const key = wkspUri.path;  // consistent string key for Map lookups
```

---

## No Analog Found

All files have close analogs. No entries.

---

## Key Anti-Patterns (from RESEARCH.md — verified against source)

These must be checked during plan review and implementation:

| Anti-Pattern | Correct Pattern | Source Evidence |
|---|---|---|
| Bare filename in RelativePattern: `'behave.ini'` | Brace-expansion glob: `'{behave.ini,.behaverc,...}'` | PITFALL-02; VS Code bug #164925 |
| Reading file immediately in `onDidChange` | Read inside the 500ms debounced callback | PITFALL-03; VS Code bug #72831 |
| Single global `let debounceTimer` | `Map<string, NodeJS.Timeout>` keyed by `wkspUri.path` | PITFALL-04; `fileParser.ts` line 42 |
| Routing through `configurationChangedHandler` | Call `getUrisOfWkspFoldersWithFeatures(true)` + `parser.parseFilesForWorkspace` directly | PITFALL-04 (integration test guard); `extension.ts` line 570 |
| Run guard AFTER `ctrl.createTestRun` (line 58) | Run guard BEFORE `ctrl.createTestRun` | PITFALL-07; `testRunHandler.ts` line 58 |
| Guard checks all workspaces | Guard checks only workspaces with queued tests | PITFALL-06; GUARD-04 |
| Reading `wkspSettings.configError` in run guard | Read `getDiscoveryEntry(wkspUri)?.configError` | PITFALL-07 (stale settings) |
| `updateDiscoveryUX` called with `clearNotifiedErrors=false` from watcher | Must pass `true` to clear `notifiedConfigErrors` | PITFALL-05; `extension.ts` line 619 |

---

## Metadata

**Analog search scope:** `src/watchers/`, `src/runners/`, `src/extension.ts`, `src/common.ts`, `src/parsers/fileParser.ts`, `test/unit/parsers/`, `test/unit/runners/`, `test/unit/watchers/`
**Files scanned:** 10 source files read in full
**Pattern extraction date:** 2026-04-16
