---
phase: 023
plan_number: 1
slug: webview-shell
status: complete
completed: 2026-05-14
requirements:
  - PANEL-01-LIFECYCLE
  - PANEL-CSP
  - PANEL-THEME
commits:
  - 4cd05c0  # feat(023-01): add CSP-safe HTML scaffold
  - b533df0  # feat(023-01): add MigrationsPanel singleton lifecycle
  - 4fb95bd  # feat(023-01): register command + package.json entry
  - b8af575  # test(023-01): createWebviewPanel mock
files_created:
  - src/migrations/panel.ts
  - src/migrations/panelHtml.ts
files_modified:
  - src/extension.ts
  - package.json
  - test/unit/vscode.mock.ts
verification:
  lint: clean (npx eslint src --ext ts)
  unit_tests: 855 passing (npm run test:unit)
  manual_smoke: deferred — no F5 dev host run from this executor session
---

# Phase 023 Plan 01: Webview Shell — Summary

Landed the single-instance `MigrationsPanel` Webview surface that
Phase 023 builds on. The shell ships with a strict CSP, per-render nonce,
theme integration via `var(--vscode-*)` custom properties, command palette
entry, and a minimal mock surface so 023-05 can author panel tests without
re-inventing the createWebviewPanel mock.

## What shipped

1. **`src/migrations/panel.ts`** — `MigrationsPanel` class:
   - `static currentPanel` + `static createOrShow(extensionUri)` reveal-if-
     exists semantics.
   - `viewType = 'gs-behave-bdd.migrationsPanel'`; title `Behave BDD: Migrations`.
   - Constructor wires `onDidDispose` and `onDidReceiveMessage` into a
     `_disposables` array; the message handler logs and ignores everything
     except a no-op `requestState` branch. `dispatchAction` / `setMigrationMode`
     / `recheck` are reserved for 023-02 / 023-03.
   - `dispose()` first-line-clears `currentPanel` (Pitfall 5), then drains
     disposables.
   - `retainContextWhenHidden: false`; `localResourceRoots: [extensionUri]`.

2. **`src/migrations/panelHtml.ts`** — `renderHtml(webview)`:
   - Inline template literal. Single `nonce` capture per call.
   - CSP: `default-src 'none'; style-src 'nonce-…'; script-src 'nonce-…'; img-src <cspSource>;`.
   - Zero hardcoded colors — all `var(--vscode-*)`.
   - `<body>` has `<h1>Pending Migrations</h1>` and `<div id="root"><p class="empty">Loading…</p></div>`.
   - Script captures `acquireVsCodeApi()` exactly once, installs a delegated
     click listener that is intentionally a no-op for `dispatchAction`-shaped
     events in 023-01, listens for `stateUpdate` messages, and fires an
     initial `requestState` ping.
   - `getNonce()` — 32-char alphanumeric, the canonical webview-sample
     implementation.

3. **`src/extension.ts`** — registers
   `gs-behave-bdd.openMigrationsPanel` directly above the existing
   `MIGRATION_ACTION_COMMAND` registration so 023-04's deletion sweep stays
   mechanical.

4. **`package.json`** — adds command palette entry
   `Behave BDD: Open Migrations Panel` after the `recheckMigrations` entry.
   No keybinding (per plan).

5. **`test/unit/vscode.mock.ts`** — minimal `window.createWebviewPanel` mock:
   - Captures the most recently registered `onDidReceiveMessage` /
     `onDidDispose` callbacks in module-level arrays.
   - Exposes `_fireWebviewMessage(msg)`, `_disposeWebview()`,
     `_getLastWebviewPanel()`, `_resetWebviewMocks()` helpers.
   - Adds `window.activeTextEditor` (optional) and a `ViewColumn` enum
     because `createOrShow` reads both.

## Decisions reaffirmed

- **Decision B (auto-reopen on activation): no `WebviewPanelSerializer`.**
  Documented in `panel.ts` header.
- **Decision E (empty-state lifecycle): panel stays open on empty.** 023-01
  reserves the `#root` container; 023-02 will own the markup.

## Verification

- `npx eslint src --ext ts` — clean, no output.
- `npm run test:unit` — **855/855 passing** (pre-existing baseline preserved).
- `npx tsc --noEmit` — only emits the pre-existing
  `node_modules/smol-toml/dist/error.d.ts(28,25): Cannot find name
  'ErrorOptions'` error. Unrelated to this plan.
- Manual smoke (F5 dev host + Webview Developer Tools) — **deferred**. The
  plan calls this optional and the executor environment does not have an
  interactive VS Code session available. Recommend running before 023-02
  starts so any CSP nonce mismatch is caught early.

## Deviations from plan

None. All four tasks executed as specified.

A couple of small choices not explicitly called out by the plan:

- The Webview JS `render(vm)` stub was wired to set
  `root.innerHTML = '<p class="empty">No pending migrations.</p>'` rather
  than leaving it as a `/* TODO */` no-op. This is harmless because
  023-01's host never posts a `stateUpdate` message (the only postMessage
  in panel.ts is the future `_refresh()` introduced in 023-02), so the
  stub is unreachable in 023-01 runtime. 023-02 will replace the function
  body wholesale.
- The mock surface stored `_postedMessages`, `_revealCalls`, and
  `_disposed` flags on the mock panel object even though no test consumes
  them yet — 023-05 panel.test.ts will. Keeping them out would force a
  mock revision in 023-05; including them now is the smaller diff.

## Follow-ups / handoffs to 023-02

- **Wire `_refresh()` in `panel.ts`.** Replace the `requestState` branch's
  no-op log with `await this._refresh()` and add a private method that
  builds the view-model and posts a `stateUpdate` message. The plan
  explicitly forbids doing this in 023-01.
- **Wire `dispatchAction` host branch** in `panel.ts onDidReceiveMessage`,
  and replace the webview-side click delegate's TODO with a real
  `vscode.postMessage({ kind: 'dispatchAction', ... })` call.
- **Configuration-change listener:** 023-02 adds the
  `vscode.workspace.onDidChangeConfiguration` subscription filtered to
  `gs-behave-bdd` + `behave-vsc` namespaces (Decision C). Push into
  `_disposables`.
- **Manual smoke test:** before 023-02 starts, do one F5 run + Webview
  Developer Tools check to confirm no CSP violations from the inline
  nonced `<style>` and `<script>` (CSP3 nonced-style assumption A2 in
  023-RESEARCH).

## Blockers for 023-02

None. The shell exists, the command is registered, the mock surface is
in place. 023-02 can start immediately.
