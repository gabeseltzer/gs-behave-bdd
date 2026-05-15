---
phase: 023
plan_number: 1
slug: webview-shell
status: planned
depends_on: []
files_modified:
  - src/migrations/panel.ts
  - src/migrations/panelHtml.ts
  - src/extension.ts
  - package.json
  - test/unit/vscode.mock.ts
requirements:
  - PANEL-01-LIFECYCLE
  - PANEL-CSP
  - PANEL-THEME
must_haves:
  truths:
    - "`gs-behave-bdd.openMigrationsPanel` command exists and is registered."
    - "Running the command opens a Webview titled `Behave BDD: Migrations`."
    - "Opening the command a second time reveals the existing panel (no second instance)."
    - "Closing the panel tab disposes all subscriptions and nulls the module singleton."
    - "Webview HTML carries a strict CSP with a per-render nonce and themes via `var(--vscode-*)` CSS variables."
  artifacts:
    - path: "src/migrations/panel.ts"
      provides: "MigrationsPanel singleton class (createOrShow / dispose)"
    - path: "src/migrations/panelHtml.ts"
      provides: "renderHtml(webview) + getNonce() — CSP-safe HTML scaffold"
  key_links:
    - from: "src/extension.ts"
      to: "MigrationsPanel.createOrShow"
      via: "vscode.commands.registerCommand('gs-behave-bdd.openMigrationsPanel', …)"
      pattern: "openMigrationsPanel"
    - from: "package.json contributes.commands"
      to: "src/extension.ts command registration"
      via: "command id string match"
      pattern: "gs-behave-bdd\\.openMigrationsPanel"
---

## Goal

Establish the Webview surface for Phase 023: a single-instance `MigrationsPanel`
class with the canonical VS Code lifecycle (create / reveal / dispose), a
CSP-safe HTML scaffold rendered from inline templates, and a command palette
entry that opens it. No migration content yet — the panel renders a `Loading…`
placeholder. This plan establishes the patterns (singleton, nonce, theming) that
023-02 and 023-03 build on.

## Why this plan exists

The repo has zero precedent for Webviews, CSP nonces, or `var(--vscode-*)`
theming (per 023-PATTERNS). Landing the shell in isolation means 023-02 can
focus on the view-model + render logic without simultaneously inventing the
hosting machinery. The shell also unblocks 023-04, which needs the command id
registered before it can rewire the summary toast.

## Decisions settled in this plan

- **Decision B (auto-reopen on activation): NO.** Do not register a
  `WebviewPanelSerializer`. Re-entry is via the summary toast (already fires on
  activation when hits exist) or the command palette. Document in `panel.ts`
  header.
- **Decision E (empty-state lifecycle): stay open, show empty state.** The
  panel is single-instance and the user closes the tab when done. 023-02 owns
  the empty-state markup; this plan reserves the `#root` container.

## Tasks

### Task 1 — `src/migrations/panel.ts`: singleton lifecycle

Create `src/migrations/panel.ts` modeled on the canonical `CatCodingPanel`
shape from 023-RESEARCH §Pattern 1, adapted to project conventions (2-space
indent, named class export, `import * as vscode from 'vscode'`,
`config.logger.logInfoAllWksps` for error logs).

What to add:

- `export class MigrationsPanel` with:
  - `static currentPanel: MigrationsPanel | undefined`
  - `static readonly viewType = 'gs-behave-bdd.migrationsPanel'`
  - `static createOrShow(extensionUri: vscode.Uri): void` — reveal-if-exists,
    else construct. Use `vscode.window.activeTextEditor?.viewColumn ??
    vscode.ViewColumn.One` for the column.
  - `private readonly _panel: vscode.WebviewPanel`
  - `private readonly _extensionUri: vscode.Uri`
  - `private _disposables: vscode.Disposable[] = []`
  - private constructor that:
    1. Stores panel + extensionUri.
    2. Sets `this._panel.webview.html = renderHtml(this._panel.webview)` (from `panelHtml.ts`).
    3. Wires `onDidDispose(() => this.dispose(), null, this._disposables)`.
    4. Wires `onDidReceiveMessage` with a try/catch wrapper that handles only
       `{ kind: 'requestState' }` for now — log and ignore other kinds. (023-02
       expands this to `dispatchAction` / `setMigrationMode` / `recheck`.)

       **IMPORTANT — 023-01 scope:** the `requestState` host branch in this
       plan is a no-op log only (e.g. `config.logger.logInfoAllWksps('panel: requestState (no-op in 023-01)')`).
       Do NOT call `await this._refresh()` here — `_refresh()` does not exist
       until 023-02 Task 2 introduces `buildViewModel` and the `_refresh`
       method. Calling it in 023-01 is a compile error.
  - `dispose(): void` — first line `MigrationsPanel.currentPanel = undefined;`
    (per 023-RESEARCH Pitfall 5), then `_panel.dispose()`, then drain
    `_disposables`.
- `createWebviewPanel` options: `{ enableScripts: true,
  retainContextWhenHidden: false, localResourceRoots: [extensionUri] }`. Cite
  Decision B + the "re-derive on reveal" constraint in a header comment.

What NOT to do yet:

- No view-model construction (023-02).
- No `onDidChangeConfiguration` listener (023-02).
- No Migration Mode dropdown (023-03).
- Do NOT push `_panel` itself into `context.subscriptions`; only the command
  registration goes there (`onDidDispose` handles panel cleanup).

Verify before next task: file compiles in isolation (`npx tsc --noEmit`),
ESLint clean.

### Task 2 — `src/migrations/panelHtml.ts`: CSP-safe HTML + nonce

Create `src/migrations/panelHtml.ts`:

- `export function renderHtml(webview: vscode.Webview): string` — returns a
  template literal exactly matching 023-RESEARCH Example 1's `_getHtml` body,
  with:
  - One `const nonce = getNonce()` capture per call (per Pitfall 3).
  - CSP meta: `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource};`.
  - `<style nonce="${nonce}">` block using only `var(--vscode-foreground)`,
    `var(--vscode-editor-background)`, `var(--vscode-panel-border)`,
    `var(--vscode-button-{background,foreground,hoverBackground}}`,
    `var(--vscode-descriptionForeground)`, `var(--vscode-focusBorder)`,
    `var(--vscode-font-family)`. Zero hardcoded colors.
  - `<body>` contains `<h1>Pending Migrations</h1>` and `<div id="root"><p
    class="empty">Loading…</p></div>`.
  - `<script nonce="${nonce}">` containing:
    - `const vscode = acquireVsCodeApi();` (once, top of script)
    - A delegated `document.addEventListener('click', …)` that reads `dataset`
      and posts messages (stub the render branches — 023-02 fills in).
    - A `window.addEventListener('message', ev => …)` that switches on
      `ev.data.kind === 'stateUpdate'` and calls `render(ev.data.viewModel)`.
    - A `render(vm)` stub that just innerHTMLs an empty placeholder (023-02
      replaces).
    - Final line: `vscode.postMessage({ kind: 'requestState' });` to trigger
      the first state fetch once the script is live. (In 023-01 the host
      logs and ignores it; 023-02 replaces the host branch with a real
      `_refresh()`.)
- `function getNonce(): string` — 32-char `[A-Za-z0-9]` per the canonical
  webview-sample (023-RESEARCH §Pattern 2).

What NOT to do:

- No external HTML/CSS/JS file (inline is the v1 choice — 023-RESEARCH §Asset Strategy).
- No `unsafe-inline` in CSP (we use nonced styles per A2 in 023-RESEARCH).
- No `acquireVsCodeApi()` second call (Pitfall 2). Capture once at script
  top-level.
- **Click delegate scope (023-01):** the delegated click handler may read
  `dataset` for diagnostic / logging purposes, but it must `return` (no
  `postMessage`) for any `dispatchAction`-shaped event. 023-02 Task 2 is
  what wires the host-side `dispatchAction` switch; sending the message
  before that branch exists would log a "no handler" warning on every click.
  Concretely: in 023-01 the click delegate's only `postMessage` call is the
  initial `requestState` already specified above. Leave a TODO comment in
  the script body: `// 023-02: post { kind: 'dispatchAction', ... } here`.

Verify before next task: open the panel via the F5 dev host (manual smoke),
confirm the webview developer tools (`Developer: Open Webview Developer Tools`)
shows zero CSP violations.

### Task 3 — Wire the command in `src/extension.ts` + `package.json`

Touch `src/extension.ts`:

- Add `import { MigrationsPanel } from './migrations/panel';` near the existing
  migrations imports (lines 49-54 area).
- In the `context.subscriptions.push(...)` block, add directly above the
  existing `MIGRATION_ACTION_COMMAND` registration (line ~437):
  ```ts
  vscode.commands.registerCommand('gs-behave-bdd.openMigrationsPanel', () => {
    MigrationsPanel.createOrShow(context.extensionUri);
  }),
  ```

Touch `package.json` `contributes.commands` (after the `recheckMigrations`
entry at line 174):

```json
{
  "command": "gs-behave-bdd.openMigrationsPanel",
  "title": "Behave BDD: Open Migrations Panel"
}
```

What NOT to do:

- Do NOT delete `MIGRATION_ACTION_COMMAND` registration, the
  `registerCodeActionsProvider` block, or `getDiagnosticCollection()` here —
  023-04 owns the deletion sweep. Co-locating the new command above them keeps
  the diff in 023-04 mechanical.
- No keybinding entry. Command palette only.

### Task 4 — `test/unit/vscode.mock.ts`: minimal `createWebviewPanel` mock

Augment the existing `vscode.mock.ts` window mock with a `createWebviewPanel`
factory that returns a fake panel exposing capture hooks for tests. Use the
snippet in 023-RESEARCH §"Mock additions needed" verbatim, adapted to the
project's existing EventEmitter mock pattern (capture the registered
`onDidReceiveMessage` and `onDidDispose` callbacks into module-level arrays so
tests can fire them; expose `_lastPanel` for inspection).

Add minimal export helpers:
- `_fireWebviewMessage(msg)` — invokes the most recently registered
  onDidReceiveMessage callback.
- `_disposeWebview()` — invokes the most recently registered onDidDispose
  callback.

What NOT to do:

- No real DOM. Tests assert on the HTML string and on captured messages, not
  on rendered DOM.

## Verification

```bash
npx eslint src --ext ts
npm run compile
npm run test:unit
```

Manual smoke (one-time, optional):
1. `F5` to launch the dev host.
2. Command palette → `Behave BDD: Open Migrations Panel`.
3. Confirm a tab titled "Behave BDD: Migrations" opens with "Pending
   Migrations" heading and "Loading…" placeholder.
4. Run the command again — same tab is revealed (no duplicate).
5. `Developer: Open Webview Developer Tools` → console clean of CSP errors.
6. Close the tab; run the command again — fresh panel opens (singleton state
   reset).

## Test coverage

Defer the real `panel.test.ts` to 023-05. This plan only delivers the
`createWebviewPanel` mock surface; assertions on it live in 023-05.

## Non-goals (this plan)

- View-model construction or evaluator integration.
- Configuration-change listener.
- Migration Mode UI.
- Deleting any diagnostics code.
- Touching `consent.ts` (toast button stays `'Open Problems' / 'Open Settings'`
  until 023-04).
- Localization, telemetry, persistence across reloads, bulk-action UI.

## Risks

- **CSP nonce/style mismatch silently breaks JS** (023-RESEARCH Pitfall 3). The
  manual smoke step + Webview Developer Tools check is the only catch. Mitigate
  by capturing `nonce` once per `renderHtml` call.
- **`createWebviewPanel` mock surface drifts from real API.** If 023-02 / 023-05
  need fields not in the mock, they'll add them — keep this plan's mock minimal
  to avoid over-fitting.
- **Command id typo between `package.json` and `extension.ts`.** The grep-style
  pattern in `must_haves.key_links` catches this; both strings must match
  `gs-behave-bdd.openMigrationsPanel` exactly.
