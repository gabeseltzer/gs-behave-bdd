// Phase 023 Plan 01: Migrations Panel (Webview) — singleton lifecycle.
//
// Owns the Webview surface that replaces the diagnostics-based consent UX
// (the legacy Problems-pane / Code-Action chain). Single-instance per VS
// Code window: `createOrShow` reveals an existing panel rather than spawning
// a second.
//
// Decisions baked in here (settled 2026-05-14 in 023-CONTEXT / 023-01-PLAN):
//   - Decision B: NO `WebviewPanelSerializer`. Auto-reopen on activation is
//     handled by the summary toast (which already fires on activation when
//     hits exist) and by the command palette. The panel does not survive a
//     VS Code reload.
//   - Decision E: Empty-state lifecycle stays open with the user closing the
//     tab. 023-01 reserves the `#root` container; 023-02 owns the markup.
//   - `retainContextWhenHidden: false` — the view-model is cheap to re-derive
//     from the evaluator on every reveal, and retaining the DOM doubles
//     memory for no UX win.
//   - `localResourceRoots: [extensionUri]` — required for any future
//     `asWebviewUri` use; safe in remote-extension-host setups per the
//     VS Code webview guide.
//
// 023-01 scope: this file establishes the shell only. The
// `onDidReceiveMessage` handler currently logs and ignores everything except
// the initial `requestState` ping, which is also a no-op log. 023-02 Task 2
// replaces that with a real `_refresh()` that posts a `stateUpdate` message
// built from the evaluator.
import * as vscode from 'vscode';
import { config } from '../configuration';
import { renderHtml } from './panelHtml';


type PanelInboundMessage =
  | { kind: 'requestState' }
  // 023-02+ will narrow these:
  | { kind: 'dispatchAction'; [k: string]: unknown }
  | { kind: 'setMigrationMode'; [k: string]: unknown }
  | { kind: 'recheck'; [k: string]: unknown };


export class MigrationsPanel {
  public static currentPanel: MigrationsPanel | undefined;
  public static readonly viewType = 'gs-behave-bdd.migrationsPanel';

  private readonly _panel: vscode.WebviewPanel;
  // Reserved for 023-02 / 023-03 (asWebviewUri / localResourceRoots use).
  // Keep the underscore prefix so ESLint doesn't flag it as unused.
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];


  public static createOrShow(extensionUri: vscode.Uri): void {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (MigrationsPanel.currentPanel) {
      MigrationsPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      MigrationsPanel.viewType,
      'Behave BDD: Migrations',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: false,
        localResourceRoots: [extensionUri],
      },
    );

    MigrationsPanel.currentPanel = new MigrationsPanel(panel, extensionUri);
  }


  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Re-derive HTML (and a fresh nonce) on construction. We never re-assign
    // `webview.html` after this; subsequent state updates go via postMessage
    // to avoid the `acquireVsCodeApi() called twice` pitfall.
    this._panel.webview.html = renderHtml(this._panel.webview);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      (msg: PanelInboundMessage) => {
        try {
          if (!msg || typeof msg !== 'object' || typeof msg.kind !== 'string') {
            config.logger.logInfoAllWksps('MigrationsPanel: ignoring malformed webview message');
            return;
          }
          if (msg.kind === 'requestState') {
            // 023-01: shell-only — no view-model yet. 023-02 Task 2 replaces
            // this branch with `await this._refresh()`.
            config.logger.logInfoAllWksps('MigrationsPanel: requestState (no-op in 023-01)');
            return;
          }
          // dispatchAction / setMigrationMode / recheck are wired in later
          // plans. Log and ignore for now so we can see if the webview tries
          // to fire them prematurely.
          config.logger.logInfoAllWksps(`MigrationsPanel: ignoring unhandled message kind '${msg.kind}' (wired in 023-02/023-03)`);
        } catch (e) {
          // Never throw out of a webview message handler (see 023-RESEARCH
          // §"Error handling in command handlers").
          config.logger.logInfoAllWksps(`MigrationsPanel: message handler error: ${e}`);
        }
      },
      null,
      this._disposables,
    );
  }


  public dispose(): void {
    // First line, before anything that could throw (023-RESEARCH Pitfall 5):
    // ensures `createOrShow` doesn't see a stale `currentPanel` after a
    // failed dispose.
    MigrationsPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      this._disposables.pop()?.dispose();
    }
  }
}
