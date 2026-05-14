// Phase 023 Plan 01: CSP-safe HTML scaffold for the Migrations Webview.
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
// 023-01 scope: `render(vm)` and the click delegate are stubs. The click
// delegate intentionally does NOT postMessage `dispatchAction`-shaped events
// because the host-side branch doesn't exist until 023-02 Task 2 — sending
// them would just log "no handler" warnings. The only postMessage in this
// plan is the initial `requestState` ping at the bottom of the script.
import * as vscode from 'vscode';


export function renderHtml(webview: vscode.Webview): string {
  const nonce = getNonce();
  const cspSource = webview.cspSource;

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
    .row {
      border: 1px solid var(--vscode-panel-border);
      padding: .75rem;
      margin-bottom: .5rem;
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
    }
  </style>
</head>
<body>
  <h1>Pending Migrations</h1>
  <div id="root"><p class="empty">Loading…</p></div>
  <script nonce="${nonce}">
    // Capture the VS Code API exactly once per webview load — calling
    // acquireVsCodeApi twice throws (023-RESEARCH Pitfall 2).
    const vscode = acquireVsCodeApi();
    const root = document.getElementById('root');

    // Delegated click handler. 023-01 only reads dataset for diagnostic
    // purposes — no dispatchAction postMessage until 023-02 Task 2 wires
    // the host branch. The lone postMessage in this plan is the
    // requestState ping below.
    document.addEventListener('click', (e) => {
      const target = e.target;
      if (!(target instanceof HTMLButtonElement)) return;
      if (!target.dataset || !target.dataset.action) return;
      // 023-02: post { kind: 'dispatchAction', ... } here once the host
      // switch in panel.ts handles it. For now intentionally a no-op so
      // we don't generate spurious "unhandled message" log lines.
      return;
    });

    window.addEventListener('message', (ev) => {
      const m = ev.data;
      if (!m || typeof m !== 'object') return;
      if (m.kind === 'stateUpdate') {
        render(m.viewModel);
      }
    });

    function render(_vm) {
      // 023-02 replaces this with real per-row markup. For now the empty
      // placeholder rendered server-side is the whole UI.
      root.innerHTML = '<p class="empty">No pending migrations.</p>';
    }

    // Kick the host to send us the first state. In 023-01 the host logs
    // and ignores; 023-02 Task 2 replaces the host branch with a real
    // _refresh() call.
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
