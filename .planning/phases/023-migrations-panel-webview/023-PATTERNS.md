# Phase 023: Migrations Panel (Webview) — Pattern Map

**Mapped:** 2026-05-14
**Files analyzed:** ~6 new + ~6 modified/deleted
**Analogs found:** 5 strong / 7 categories (2 categories have no precedent — flagged)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/migrations/panel.ts` (new) | provider (Webview controller) | event-driven (postMessage / onDidReceiveMessage) | `src/handlers/findStepReferencesHandler.ts` (treeView singleton) | role-match |
| `src/migrations/panelHtml.ts` (new, inline HTML) | utility (template) | transform | — none in repo — | no analog |
| `src/migrations/panelViewModel.ts` (new) | service (collect-only evaluator wrapper) | request-response | `src/migrations/consent.ts:readMigrationMode` + evaluator caller in `recheckCommand.ts` | role-match |
| `src/migrations/openPanelCommand.ts` (new) | command handler | request-response | `src/migrations/recheckCommand.ts` (recheckMigrationsCommandHandler) | exact |
| `src/extension.ts` (modified: register cmd + dispose) | extension entry | event-driven | `src/extension.ts:404–469` (existing subscriptions block) | exact |
| `src/migrations/consent.ts` (modified: toast button + drop publishConsentDiagnostics call) | service | event-driven | self (lines 312–410) | exact |
| `src/migrations/diagnostics.ts` (delete) | — | — | — | deletion |
| `src/migrations/codeActions.ts` (partial delete; keep `dispatchMigrationAction` + `MIGRATION_ACTION_COMMAND` + `MigrationActionArgs`) | command handler | request-response | self | exact |
| `src/migrations/index.ts` (modified: prune exports) | barrel | — | self | exact |
| `test/unit/migrations/panel.test.ts` (new) | test | event-driven async | `test/unit/migrations/consent.test.ts:340–360` (showStub + setImmediate yield) | role-match |

## Pattern Assignments

### `src/migrations/panel.ts` — Webview lifecycle (no precedent)

**Status:** No `createWebviewPanel` / `WebviewPanel` usage anywhere in `src/`. This phase establishes the pattern. Use VS Code's documented single-instance idiom.

**Closest stylistic analog:** `src/handlers/findStepReferencesHandler.ts` exports a module-level `treeView` singleton with lazy creation — mirror that shape for the panel singleton (`let _panel: vscode.WebviewPanel | undefined`).

**Standard shape to follow:**
```typescript
let _panel: vscode.WebviewPanel | undefined;

export function openMigrationsPanel(context: vscode.ExtensionContext): void {
  if (_panel) { _panel.reveal(vscode.ViewColumn.Active); return; }
  _panel = vscode.window.createWebviewPanel(
    'gs-behave-bdd.migrationsPanel',
    'Behave BDD: Migrations',
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  _panel.webview.html = renderHtml(_panel.webview, context.extensionUri /* for nonce + CSP */);
  _panel.webview.onDidReceiveMessage(msg => handleMessage(msg), undefined, context.subscriptions);
  _panel.onDidDispose(() => { _panel = undefined; }, undefined, context.subscriptions);
}
```

**Diverge if:** plan 023-02 needs cross-folder workspace context — then accept a `wkspUri` arg and re-eval when it changes.

**Disposal pattern:** Follow `src/extension.ts:404` — push the registered command (which closes over `_panel`) into `context.subscriptions`. Do NOT push `_panel` itself; the `onDidDispose` callback handles it.

---

### `src/migrations/panelHtml.ts` — CSP-safe HTML scaffold (no precedent)

**Status:** No analog. Webpack does NOT currently bundle any HTML/CSS/JS static assets — only Python via `copy-webpack-plugin` (see `webpack.config.js:55-62`).

**Recommendation:** Inline the HTML/CSS/JS as a TypeScript template literal returned from `renderHtml(webview, extensionUri)`. Reasons:
1. Webview is tiny (probably <300 LOC of HTML+JS combined).
2. Avoids adding a new `copy-webpack-plugin` entry and `webview.asWebviewUri` plumbing.
3. CSP nonce generation is simpler when HTML is built in TS.

**Diverge if:** the panel grows past ~500 LOC of markup, then move to `src/webview/migrations.html` + add a `{ from: 'src/webview', to: 'webview' }` entry to webpack and switch to `webview.asWebviewUri`.

**Theming:** No `activeColorTheme` or `--vscode-*` usage exists in `src/`. Flag in plan 023-01 that we are establishing this. Standard approach: rely on CSS custom properties (`var(--vscode-foreground)`, `var(--vscode-button-background)`, etc.) that VS Code injects automatically into every webview — no JS theme detection needed.

---

### `src/migrations/panelViewModel.ts` — Configuration reads (writes are new)

**Analog for reads:** `src/migrations/consent.ts:52-56` (`readMigrationMode`):
```typescript
export function readMigrationMode(wkspUri: vscode.Uri): MigrationMode {
  return vscode.workspace
    .getConfiguration('gs-behave-bdd', wkspUri)
    .get<MigrationMode>('migrationMode', 'prompt');
}
```

**Analog for writes (migration mode setter):** `src/extension.ts:618` and `src/migrations/recheckCommand.ts:77-78`:
```typescript
const cfg = vscode.workspace.getConfiguration('gs-behave-bdd', targetWkspUri);
await cfg.update('completedMigrations', [], pick.target);
```

**Diverge if:** the panel writes `migrationMode` at Global scope (likely default). Pass `vscode.ConfigurationTarget.Global` (not WorkspaceFolder as in the recheck example). Wrap in try/catch and log via `config.logger.logInfoAllWksps` per `recheckCommand.ts:80-89`.

**Re-evaluation hook:** the evaluator entry is `evaluateAllMigrations` (exported from `src/migrations/index.ts`). Mirror how `recheckCommand.ts:99+` iterates folders. The panel needs a "collect hits without dispatching" mode — likely just call `evaluateAllMigrations` and filter to case-2 / case-3 rows in the view-model layer, no evaluator changes required.

---

### `src/migrations/openPanelCommand.ts` + `src/extension.ts` registration

**Analog:** existing `gs-behave-bdd.recheckMigrations` registration at `src/extension.ts:433`:
```typescript
vscode.commands.registerCommand('gs-behave-bdd.recheckMigrations', () => recheckMigrationsCommandHandler()),
```

**Apply exactly:**
```typescript
vscode.commands.registerCommand('gs-behave-bdd.openMigrationsPanel', () => openMigrationsPanel(context)),
```
Insert directly above the (about-to-be-deleted) `MIGRATION_ACTION_COMMAND` registration at line 437 so related commands stay clustered.

**Also required:** add `"command": "gs-behave-bdd.openMigrationsPanel"` to `package.json` `contributes.commands` with a user-facing title (mirrors however `recheckMigrations` is declared there — check `package.json` during plan 023-01).

**Diverge if:** plan 023-01 decides to lazy-construct the panel module to avoid pulling webview code into the activation path — then dynamic `import()` inside the handler.

---

### `test/unit/migrations/panel.test.ts` — Async message-passing tests

**Analog:** `test/unit/migrations/consent.test.ts:340-360` shows the established async-yield idiom for fire-and-forget UI:
```typescript
showStub.resolves('Open Problems');
await runConsentFlow(...);
await new Promise(resolve => setImmediate(resolve));  // yield to .then() chain
const matchingCall = execStub.getCalls().find(c => c.args[0] === 'workbench.actions.view.problems');
```

**Diverge if:** testing `onDidReceiveMessage` — you'll stub the webview object (not present in `test/unit/vscode.mock.ts`). Add a minimal `WebviewPanel` mock that exposes a `_fireMessage(msg)` test helper which invokes the registered listener synchronously, then `await new Promise(setImmediate)` to flush the handler. Mirror the spy/stub style at the top of `consent.test.ts`.

**View-model unit tests** can skip the webview entirely — test the pure functions in `panelViewModel.ts` directly, same shape as `test/unit/migrations/diagnostics.test.ts` tests pure helpers.

---

## Shared Patterns

### Error handling in command handlers
**Source:** `src/migrations/codeActions.ts:133-152` (`dispatchMigrationAction`)
**Apply to:** `openMigrationsPanel`, message handlers
**Pattern:** never throw out of a webview message handler — wrap in try/catch and route to `safeLog`:
```typescript
function safeLog(message: string, wkspUri: vscode.Uri | undefined): void {
  try {
    if (wkspUri) config.logger.logInfo(message, wkspUri);
    else config.logger.logInfoAllWksps(message);
  } catch { /* intentional */ }
}
```

### Singleton + lazy creation
**Source:** `src/migrations/diagnostics.ts:20-31` (the very pattern being deleted, but the shape is correct)
**Apply to:** `_panel` in `panel.ts`. The module-level lazy singleton with explicit dispose on `onDidDispose` is the idiom.

### Subscriptions push
**Source:** `src/extension.ts:404-469`
**Apply to:** the new command registration and any disposables the panel module exposes for activation-time wiring. Push into `context.subscriptions` in the existing block.

---

## Deletion Surface — Reference Inventory

Files referencing the about-to-be-deleted names (`publishConsentDiagnostics`, `clearDiagnosticsForEntryAtScope`, `getDiagnosticCollection`, `disposeDiagnosticCollection`, `resolveAnchorUri`, `computeRange`, `buildDiagnosticMessage`, `encodeDiagnosticCode`, `decodeDiagnosticCode`, `MIGRATION_DIAG_SOURCE`, `MigrationCodeActionProvider`):

| File | Treatment |
|---|---|
| `src/migrations/diagnostics.ts` | **Delete entire file** |
| `src/migrations/codeActions.ts` | **Partial:** delete `MigrationCodeActionProvider` class + the `decodeDiagnosticCode`/`MIGRATION_DIAG_SOURCE`/`clearDiagnosticsForEntryAtScope` imports + `resolveWkspUriForDispatch` (now unused). **Keep:** `MIGRATION_ACTION_COMMAND`, `MigrationActionArgs`, `dispatchMigrationAction`, `runActionHandler`, `safeLog`. Remove the `clearDiagnosticsForEntryAtScope(entry, args.scope)` call at line 148 — the panel will re-render on success instead. |
| `src/migrations/index.ts` | Prune lines 10-21 (diagnostics block) and `MigrationCodeActionProvider` from line 22-27. Keep `MIGRATION_ACTION_COMMAND`, `dispatchMigrationAction`, `MigrationActionArgs`. |
| `src/migrations/consent.ts` | Drop `publishConsentDiagnostics`, `clearDiagnosticsForEntryAtScope`, `computeRange`, `resolveAnchorUri` from imports (line 27). Rework the toast at line 327 from `'Open Problems', 'Open Settings'` to single button `'Open Migrations Panel'` → `vscode.commands.executeCommand('gs-behave-bdd.openMigrationsPanel')`. Remove the diagnostic-publish block (lines 312-325). |
| `src/extension.ts` | Drop the import block lines 49-53 (`MIGRATION_ACTION_COMMAND` stays; `MigrationCodeActionProvider`, `getDiagnosticCollection`, `MigrationActionArgs` retained for re-export but the provider registration goes). Delete lines 441-450 (`registerCodeActionsProvider(...)` + `getDiagnosticCollection()` in subscriptions). Keep the `MIGRATION_ACTION_COMMAND` registration at 437-440 — it's now driven by the webview. |
| `test/unit/migrations/diagnostics.test.ts` | **Delete entire file** (all targets removed). |
| `test/unit/migrations/consent.test.ts` | Reshape: tests 'Open Problems'/'Open Settings' (lines 342-380+) → single 'Open Migrations Panel' test; delete `summarizeDiagnostics()` assertions throughout. |
| `test/unit/migrations.test.ts` | Test 4.10 (recheck-consent-flow regression) — reshape to assert `openMigrationsPanel` command was invoked instead of diagnostic-publishing. |
| `test/unit/vscode.mock.ts` | Optionally drop diagnostic-collection mock surface if unused after deletion; add minimal `createWebviewPanel` mock. |
| `test/integration/migration-consent suite/extension.test.ts` | Surface-agnostic per CONTEXT line 59 — should be untouched. Verify after refactor. |

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `src/migrations/panel.ts` | Webview lifecycle | First webview in the extension; establish the pattern using VS Code documented idiom. |
| `src/migrations/panelHtml.ts` | HTML/CSS/JS scaffold + CSP | No static asset bundling exists; no theming via CSS custom props exists. Use VS Code-injected `--vscode-*` vars and inline-template approach. |

## Metadata

**Analog search scope:** `src/`, `test/unit/`, `webpack.config.js`
**Files scanned:** ~30
**Key gaps confirmed:** zero webview precedent, zero static-asset bundling for non-Python files, zero CSS-custom-property usage.
