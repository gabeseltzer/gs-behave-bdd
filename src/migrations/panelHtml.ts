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
    /* Settings-page-inspired styling: per-setting card with a bolded title,
       muted description, and the control beneath — mirrors VS Code's own
       workbench.action.openSettings layout. No bordered boxes per row;
       sections are separated by horizontal rules and generous spacing. */
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 24px 28px 48px;
      max-width: 920px;
      line-height: 1.4;
    }
    h1 {
      font-size: 26px;
      font-weight: 600;
      margin: 0 0 4px;
      letter-spacing: -0.01em;
    }
    .page-desc {
      color: var(--vscode-descriptionForeground);
      font-size: 13px;
      margin: 0 0 28px;
    }
    h2 {
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      margin: 24px 0 12px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    h3 {
      font-size: 18px;
      font-weight: 600;
      margin: 0 0 6px;
      letter-spacing: -0.005em;
    }
    .section {
      padding: 14px 0 18px;
    }
    .section + .section {
      border-top: 1px solid var(--vscode-panel-border);
    }
    .setting-title {
      font-size: 14px;
      font-weight: 600;
      margin: 0 0 4px;
    }
    .setting-title code {
      font-family: var(--vscode-editor-font-family);
      font-weight: 600;
      font-size: 13px;
      background: transparent;
    }
    .setting-desc {
      color: var(--vscode-descriptionForeground);
      font-size: 13px;
      margin: 0 0 10px;
      max-width: 720px;
    }
    .setting-meta {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      margin: 0 0 10px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: 1px solid transparent;
      padding: 4px 14px;
      font-size: 13px;
      cursor: pointer;
      font-family: var(--vscode-font-family);
      border-radius: 2px;
      line-height: 1.5;
      position: relative;
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    button:focus {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    button.secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .empty {
      color: var(--vscode-descriptionForeground);
      font-size: 13px;
      margin: 12px 0 16px;
    }
    /* Mode section: pill-style toggle group matching VS Code's settings-UI
       enum picker. Selected pill gets the primary button background. */
    .mode-section .actions {
      margin-top: 4px;
    }
    .mode-section button[data-mode] {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .mode-section button[data-mode][aria-pressed="true"] {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .mode-section button[data-mode]:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .mode-section button[data-mode][aria-pressed="true"]:hover {
      background: var(--vscode-button-hoverBackground);
    }
    /* Hover preview popover. Anchored above the hovered button via absolute
       positioning. Renders an indented JSON-ish diff: lines tagged - / + or
       blank are colored to match VS Code's text-diff palette. */
    .preview-popover {
      position: absolute;
      z-index: 1000;
      background: var(--vscode-editorHoverWidget-background, var(--vscode-editor-background));
      color: var(--vscode-editorHoverWidget-foreground, var(--vscode-foreground));
      border: 1px solid var(--vscode-editorHoverWidget-border, var(--vscode-panel-border));
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
      padding: 8px 12px;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      white-space: pre;
      pointer-events: none;
      max-width: 560px;
      overflow: hidden;
    }
    .preview-popover .preview-label {
      color: var(--vscode-descriptionForeground);
      font-family: var(--vscode-font-family);
      font-size: 11px;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .preview-popover .line-del {
      color: var(--vscode-gitDecoration-deletedResourceForeground, #d16969);
      text-decoration: line-through;
      text-decoration-thickness: 1px;
    }
    .preview-popover .line-add {
      color: var(--vscode-gitDecoration-addedResourceForeground, #6a9955);
    }
    .preview-popover .line-keep {
      color: var(--vscode-descriptionForeground);
    }
    .preview-popover .preview-nochange {
      font-family: var(--vscode-font-family);
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }
  </style>
</head>
<body>
  <h1>Behave BDD: Migrations</h1>
  <p class="page-desc">Review and apply pending settings migrations. The actions you choose below write to your VS Code settings.json the same way the Settings UI does.</p>
  <div id="mode-root"></div>
  <div id="pending-root"><p class="empty">Loading…</p></div>
  <div id="preview" class="preview-popover" style="display:none"></div>
  <script nonce="${nonce}">
    // Capture the VS Code API exactly once per webview load — calling
    // acquireVsCodeApi twice throws (023-RESEARCH Pitfall 2).
    const vscode = acquireVsCodeApi();
    const root = document.getElementById('pending-root');
    const modeRoot = document.getElementById('mode-root');
    const previewEl = document.getElementById('preview');

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

    // Per-row data captured at render time so the hover preview script can
    // look up the (sourceKey, destKey, sourceValue, destValue) tuple by row id
    // without round-tripping to the host or interpolating raw JSON into every
    // button's dataset (which would blow up the DOM for non-trivial values).
    const ROW_DATA = new Map();

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

    // Hover preview wiring. Show/hide a popover that diffs the underlying
    // settings.json lines before/after the hovered action. The host already
    // sends sourceValue and destValue via the view-model, so this is a pure
    // client-side computation.
    document.addEventListener('mouseover', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLButtonElement)) return;
      if (typeof t.dataset.action !== 'string') return;
      const rowKey = t.dataset.rowKey;
      const row = ROW_DATA.get(rowKey);
      if (!row) return;
      showPreview(t, row, t.dataset.action);
    });
    document.addEventListener('mouseout', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLButtonElement)) return;
      if (typeof t.dataset.action !== 'string') return;
      hidePreview();
    });

    function hidePreview() {
      previewEl.style.display = 'none';
      previewEl.innerHTML = '';
    }

    function showPreview(buttonEl, row, action) {
      const lines = buildPreviewLines(row, action);
      if (lines.length === 0) {
        previewEl.innerHTML =
          '<div class="preview-label">Effect</div>'
          + '<div class="preview-nochange">No changes to settings.json</div>';
      } else {
        const inner = lines.map(function (l) {
          return '<span class="' + l.cls + '">' + escape(l.text) + '</span>';
        }).join('\\n');
        previewEl.innerHTML =
          '<div class="preview-label">Effect on ' + escape(row.scopeLabel) + ' settings.json</div>'
          + inner;
      }
      // Position above the button. If it would go off the top of the viewport,
      // fall back to below.
      const rect = buttonEl.getBoundingClientRect();
      previewEl.style.display = 'block';
      const popH = previewEl.offsetHeight;
      const top = rect.top + window.scrollY - popH - 8;
      const fitsAbove = rect.top - popH - 8 > 4;
      previewEl.style.top = (fitsAbove ? top : (rect.bottom + window.scrollY + 8)) + 'px';
      previewEl.style.left = (rect.left + window.scrollX) + 'px';
    }

    // Stable formatter for setting values — VS Code settings are JSON, so
    // JSON.stringify with 2-space indent matches what the user would see in
    // their settings.json. Truncate long values so the popover stays compact.
    function formatValue(v) {
      let s;
      try { s = JSON.stringify(v, null, 2); }
      catch { s = String(v); }
      if (s === undefined) s = 'undefined';
      if (s.length > 240) s = s.slice(0, 237) + '...';
      return s;
    }

    function line(cls, prefix, key, value) {
      return { cls: cls, text: prefix + ' "' + key + '": ' + formatValue(value) };
    }

    // Computes the lines to display per action. Returns [] when the action is
    // a no-op (e.g. "Keep both", "Don't migrate", "Skip").
    function buildPreviewLines(row, action) {
      const src = row.sourceKey;
      const dst = row.destKey;
      const sv = row.sourceValue;
      const dv = row.destValue;

      switch (action) {
        case 'migrate-and-delete':
          return [
            line('line-add',  '+', dst, sv),
            line('line-del',  '-', src, sv),
          ];
        case 'migrate-and-keep':
          return [
            line('line-add',  '+', dst, sv),
            line('line-keep', ' ', src, sv),
          ];
        case 'dont-migrate':
          return [];
        case 'overwrite-and-delete':
          return [
            line('line-del',  '-', dst, dv),
            line('line-add',  '+', dst, sv),
            line('line-del',  '-', src, sv),
          ];
        case 'overwrite-and-keep':
          return [
            line('line-del',  '-', dst, dv),
            line('line-add',  '+', dst, sv),
            line('line-keep', ' ', src, sv),
          ];
        case 'keep-canonical-and-delete-legacy':
          return [
            line('line-keep', ' ', dst, dv),
            line('line-del',  '-', src, sv),
          ];
        case 'keep-both':
          return [];
        default:
          return [];
      }
    }

    window.addEventListener('message', (ev) => {
      const m = ev.data;
      if (!m || typeof m !== 'object') return;
      if (m.kind === 'stateUpdate') {
        render(m.viewModel);
      }
    });

    function render(vm) {
      ROW_DATA.clear();
      hidePreview();
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
          '<h2>Pending Migrations</h2>'
          + '<div class="section">'
            + '<p class="empty">No pending migrations.</p>'
            + '<div class="actions">'
              + '<button type="button" class="secondary" data-recheck="true">Recheck Migrations</button>'
            + '</div>'
          + '</div>';
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

      const blocks = ['<h2>Pending Migrations</h2>'];
      for (const [folderName, rows] of groups) {
        if (showFolderHeaders) {
          blocks.push('<h3>' + escape(folderName) + '</h3>');
        }
        for (const row of rows) {
          blocks.push(renderRow(row));
        }
      }
      // Footer recheck button at the bottom — mirrors VS Code's "Restore
      // Defaults" placement at the end of settings sections.
      blocks.push(
        '<div class="section">'
        + '<div class="actions">'
          + '<button type="button" class="secondary" data-recheck="true">Recheck Migrations</button>'
        + '</div>'
        + '</div>'
      );

      root.innerHTML = blocks.join('');
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
        '<h2>Migration Mode</h2>'
        + '<div class="section mode-section">'
          + '<p class="setting-title">gs-behave-bdd.migrationMode</p>'
          + '<p class="setting-desc">How silent migrations are handled the next time the extension activates. Applied at Global scope.</p>'
          + '<div class="actions">'
            + buttons
          + '</div>'
        + '</div>';
    }

    function describeAction(row, action) {
      // Tooltip fallback used as the title attribute on each action button.
      // The popover is richer, but keyboard users and screen readers still
      // get a hint.
      switch (action) {
        case 'migrate-and-delete':              return 'Copy legacy value to ' + row.destKey + ' and delete legacy line';
        case 'migrate-and-keep':                return 'Copy legacy value to ' + row.destKey + ' and keep legacy line';
        case 'dont-migrate':                    return 'Do nothing; mark this migration as handled';
        case 'overwrite-and-delete':            return 'Replace ' + row.destKey + ' with legacy value and delete legacy line';
        case 'overwrite-and-keep':              return 'Replace ' + row.destKey + ' with legacy value and keep legacy line';
        case 'keep-canonical-and-delete-legacy':return 'Keep ' + row.destKey + ' unchanged; delete legacy line';
        case 'keep-both':                       return 'Leave both lines unchanged; mark as handled';
        default: return '';
      }
    }

    function renderRow(row) {
      // Stable row key — included on every button as data-row-key so the
      // hover handler can look up the row's value tuple.
      const rowKey = row.entryId + '|' + row.scope + '|' + row.wkspUri;
      ROW_DATA.set(rowKey, row);

      const buttons = row.buttons.map(function (b) {
        return '<button type="button"'
          + ' data-action="' + escape(b.action) + '"'
          + ' data-entry-id="' + escape(row.entryId) + '"'
          + ' data-case="' + row.case + '"'
          + ' data-scope="' + row.scope + '"'
          + ' data-wksp-uri="' + escape(row.wkspUri) + '"'
          + ' data-row-key="' + escape(rowKey) + '"'
          + ' title="' + escape(describeAction(row, b.action)) + '">'
          + escape(b.label)
          + '</button>';
      }).join('');

      const caseLabel = row.case === 2
        ? 'Legacy key set; canonical key is not'
        : 'Both legacy and canonical keys are set';

      return '<div class="section">'
        + '<p class="setting-title"><code>' + escape(row.sourceKey) + '</code> &rarr; <code>' + escape(row.destKey) + '</code></p>'
        + '<p class="setting-desc">' + escape(caseLabel) + '. Hover an action to preview the change.</p>'
        + '<p class="setting-meta">Scope: ' + escape(row.scopeLabel) + '</p>'
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
