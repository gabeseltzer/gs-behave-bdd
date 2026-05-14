// Phase 023 Plan 02 Task 3: CSP-safe HTML scaffold for the Migrations Webview.
//
// Inline template literal (no external assets) — see 023-RESEARCH §Asset
// Strategy: the panel is small enough that the bundler / copy-webpack-plugin
// machinery isn't worth the bytes. CSS uses VS Code's injected theme custom
// properties (`var(--vscode-*)`) only — zero hardcoded colors so the panel
// follows light / dark / high-contrast themes automatically.
//
// CSP: strict `default-src 'none'`, nonced inline `<style>` and `<script>`.
// One nonce per `renderHtml` call, captured ONCE per call (023-RESEARCH
// Pitfall 3) to keep the meta tag in sync with the actual tags.
//
// 023-02 wires:
//   - `render(vm)` builds real per-row markup from the view-model posted by
//     `MigrationsPanel._refresh()`. Multi-folder workspaces get `<h2>` section
//     headers grouping rows by workspace folder name (Decision A); single-
//     folder workspaces suppress the header to avoid noise.
//   - Empty state renders a Recheck Migrations button that posts
//     `{ kind: 'recheck' }`.
//   - Delegated click handler distinguishes `data-recheck` (recheck) from
//     `data-action` (dispatchAction) buttons and posts the appropriate
//     message kind. Host-side validation is re-applied (V5).
//
// 023-03 wires:
//   - Migration Mode section above the row list. Buttons (one per
//     `MIGRATION_MODE_OPTIONS` entry) with `aria-pressed` reflecting
//     `vm.migrationMode`. Selected state restyled via [aria-pressed="true"].
//   - Delegated click handler extended to post
//     `{ kind: 'setMigrationMode', value }` for `data-mode` buttons.
//   - `MIGRATION_MODE_OPTIONS` is embedded as a JSON literal at HTML build
//     time — the browser script doesn't import host modules. Safe because
//     option values/labels are alphanumeric+dashes (no XSS surface).
import * as vscode from 'vscode';
import { MIGRATION_MODE_OPTIONS } from './panelViewModel';


export function renderHtml(webview: vscode.Webview): string {
  const nonce = getNonce();
  const cspSource = webview.cspSource;
  // Embed mode options as a JSON literal. `JSON.stringify` produces a valid
  // JS expression whose contents are safe inside a `<script>` block (no
  // </script> in the data; values are registry-controlled).
  const modeOptionsJson = JSON.stringify(MIGRATION_MODE_OPTIONS);

  // CSP notes:
  //   - default-src 'none'  — deny everything not explicitly allowed.
  //   - style-src 'nonce-…' — only the nonced <style> below renders.
  //   - script-src 'nonce-…' — only the nonced <script> below executes.
  //   - img-src ${cspSource} — allow webview-hosted images for future use.
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src ${cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Behave BDD: Migrations</title>
  <style nonce="${nonce}">
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 1rem;
    }
    h1 {
      font-size: 1.2rem;
      margin: 0 0 1rem 0;
      font-weight: 600;
    }
    h2 {
      font-size: 1rem;
      margin: 1rem 0 .5rem 0;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
    }
    .row {
      border: 1px solid var(--vscode-panel-border);
      padding: .75rem;
      margin-bottom: .5rem;
    }
    .row code {
      font-family: var(--vscode-editor-font-family);
    }
    .row .scope {
      color: var(--vscode-descriptionForeground);
      margin-left: .5rem;
    }
    .row .actions {
      margin-top: .5rem;
    }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: 0;
      padding: .25rem .75rem;
      margin-right: .25rem;
      cursor: pointer;
      font-family: var(--vscode-font-family);
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    button:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }
    .empty {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
      margin-bottom: .5rem;
    }
    .mode-section {
      padding: .5rem 0 1rem;
      border-bottom: 1px solid var(--vscode-panel-border);
      margin-bottom: 1rem;
    }
    .mode-section h2 {
      font-size: 1rem;
      margin: 0 0 .5rem;
    }
    .mode-section button[data-mode] {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      margin-right: .25rem;
    }
    .mode-section button[data-mode][aria-pressed="true"] {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .mode-section button[data-mode]:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .mode-section .desc {
      color: var(--vscode-descriptionForeground);
      margin: .5rem 0 0;
      font-size: .9em;
    }
  </style>
</head>
<body>
  <div id="mode-root"></div>
  <h1>Pending Migrations</h1>
  <div id="root"><p class="empty">Loading…</p></div>
  <script nonce="${nonce}">
    // Capture the VS Code API exactly once per webview load — calling
    // acquireVsCodeApi twice throws (023-RESEARCH Pitfall 2).
    const vscode = acquireVsCodeApi();
    const root = document.getElementById('root');
    const modeRoot = document.getElementById('mode-root');

    // Host-embedded constant — see renderHtml(). Values are alphanumeric +
    // dashes (registry-controlled); safe to interpolate via escape() into
    // the rendered button attributes.
    const MODES = ${modeOptionsJson};

    // 4-line HTML escaper. Acceptable here because the values we interpolate
    // are registry-derived setting keys (alphanumeric + dots) plus
    // workspace folder names — not free-form user input. See 023-RESEARCH
    // §Don't Hand-Roll: dompurify is overkill at this volume.
    function escape(s) {
      return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // Delegated click handler. Two button types:
    //   - data-recheck="true"  → post { kind: 'recheck' }
    //   - data-action="<verb>" → post { kind: 'dispatchAction', args: {...} }
    // Any other click is ignored. Host re-validates the payload before
    // dispatching (V5 — see panel.ts validateActionArgs).
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLButtonElement)) return;

      if (t.dataset.recheck === 'true') {
        vscode.postMessage({ kind: 'recheck' });
        return;
      }

      if (typeof t.dataset.mode === 'string' && t.dataset.mode.length > 0) {
        vscode.postMessage({ kind: 'setMigrationMode', value: t.dataset.mode });
        return;
      }

      if (typeof t.dataset.action === 'string' && t.dataset.action.length > 0) {
        vscode.postMessage({
          kind: 'dispatchAction',
          args: {
            entryId: t.dataset.entryId,
            case: Number(t.dataset.case),
            scope: Number(t.dataset.scope),
            action: t.dataset.action,
            wkspUri: t.dataset.wkspUri,
          },
        });
      }
    });

    window.addEventListener('message', (ev) => {
      const m = ev.data;
      if (!m || typeof m !== 'object') return;
      if (m.kind === 'stateUpdate') {
        render(m.viewModel);
      }
    });

    function render(vm) {
      if (!vm) {
        modeRoot.innerHTML = '';
        root.innerHTML = '<p class="empty">Loading…</p>';
        return;
      }

      // Migration Mode section renders above the row list regardless of
      // whether there are pending migrations — picking the mode is useful
      // even when the list is empty (affects next activation).
      renderModeSection(vm.migrationMode);

      if (vm.empty) {
        root.innerHTML =
          '<p class="empty">No pending migrations.</p>' +
          '<button type="button" data-recheck="true">Recheck Migrations</button>';
        return;
      }

      // Group rows by folder when more than one workspace folder is open.
      const showFolderHeaders = vm.folderCount > 1;
      const groups = new Map();
      for (const row of vm.rows) {
        const key = row.folderName;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      }

      const sections = [];
      for (const [folderName, rows] of groups) {
        const header = showFolderHeaders
          ? '<h2>' + escape(folderName) + '</h2>'
          : '';
        const rowMarkup = rows.map(renderRow).join('');
        sections.push(header + rowMarkup);
      }

      root.innerHTML = sections.join('');
    }

    function renderModeSection(currentMode) {
      const buttons = MODES.map(function (opt) {
        const pressed = opt.value === currentMode ? 'true' : 'false';
        return '<button type="button"'
          + ' data-mode="' + escape(opt.value) + '"'
          + ' aria-pressed="' + pressed + '"'
          + ' title="' + escape(opt.description) + '">'
          + escape(opt.label)
          + '</button>';
      }).join('');

      modeRoot.innerHTML =
        '<div class="mode-section">'
          + '<h2>Migration Mode</h2>'
          + buttons
          + '<p class="desc">Applied at Global scope. Affects how silent migrations are handled on next activation.</p>'
          + '</div>';
    }

    function renderRow(row) {
      const buttons = row.buttons.map(function (b) {
        return '<button type="button"'
          + ' data-action="' + escape(b.action) + '"'
          + ' data-entry-id="' + escape(row.entryId) + '"'
          + ' data-case="' + row.case + '"'
          + ' data-scope="' + row.scope + '"'
          + ' data-wksp-uri="' + escape(row.wkspUri) + '">'
          + escape(b.label)
          + '</button>';
      }).join('');

      return '<div class="row">'
        + '<code>' + escape(row.sourceKey) + '</code> → <code>' + escape(row.destKey) + '</code>'
        + '<span class="scope">at ' + escape(row.scopeLabel) + '</span>'
        + '<div class="actions">' + buttons + '</div>'
        + '</div>';
    }

    // Kick the host to send us the first state.
    vscode.postMessage({ kind: 'requestState' });
  </script>
</body>
</html>`;
}


// 32-char alphanumeric token. This is a CSP nonce, not a cryptographic
// secret — Math.random is the documented choice in the VS Code
// webview-sample. See 023-RESEARCH §Pattern 2.
function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
