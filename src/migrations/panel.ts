// Phase 023 Plan 02 Task 2: full message routing + configuration-change re-render.
//
// Owns the Webview surface that replaces the diagnostics-based consent UX
// (the legacy Problems-pane / Code-Action chain). Single-instance per VS
// Code window: `createOrShow` reveals an existing panel rather than spawning
// a second.
//
// Decisions baked in here (settled 2026-05-14 in 023-CONTEXT / 023-01-PLAN /
// 023-02-PLAN):
//   - Decision A: single panel for multi-root workspaces.
//   - Decision B: NO `WebviewPanelSerializer`.
//   - Decision C: re-render on `gs-behave-bdd.*` OR `behave-vsc.*` config
//     change — filter by namespace, not by exact key. Over-refresh is sub-ms
//     and benign; under-refresh leaves the panel stale.
//   - Decision E: Empty-state lifecycle stays open with the user closing the
//     tab. 023-02 owns the markup in `panelHtml.render(vm)`.
//   - `retainContextWhenHidden: false` — view-model is cheap to re-derive.
//   - `localResourceRoots: [extensionUri]` — required for any future
//     `asWebviewUri` use.
//
// 023-02 wires:
//   - `requestState` → `_refresh()` (replaces 023-01 no-op log).
//   - `dispatchAction` → validates payload, calls `dispatchMigrationAction`,
//     then `_refresh()`.
//   - `recheck` → executes `gs-behave-bdd.recheckMigrations` command, then
//     `_refresh()`.
//   - `onDidChangeConfiguration` listener filtered to `gs-behave-bdd` and
//     `behave-vsc` namespaces.
//
// 023-03 will add the `setMigrationMode` branch.
import * as vscode from 'vscode';
import { config } from '../configuration';
import { dispatchMigrationAction, type MigrationActionArgs } from './codeActions';
import { buildViewModel } from './panelViewModel';
import { renderHtml } from './panelHtml';
import { MIGRATION_REGISTRY } from './registry';
import type { MigrationScope } from './types';


type PanelInboundMessage =
  | { kind: 'requestState' }
  | { kind: 'dispatchAction'; args: MigrationActionArgs }
  | { kind: 'recheck' }
  // 023-03 will wire this:
  | { kind: 'setMigrationMode'; [k: string]: unknown };


export class MigrationsPanel {
  public static currentPanel: MigrationsPanel | undefined;
  public static readonly viewType = 'gs-behave-bdd.migrationsPanel';

  private readonly _panel: vscode.WebviewPanel;
  // Reserved for 023-03+ (asWebviewUri / localResourceRoots use).
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
      (msg: PanelInboundMessage) => { void this._handleMessage(msg); },
      null,
      this._disposables,
    );

    // Decision C: re-render when ANY `gs-behave-bdd.*` or `behave-vsc.*`
    // setting changes — covers both the legacy and canonical namespaces so
    // the panel stays fresh whether the user edits settings.json directly
    // or uses the Settings UI. Re-derivation is sub-ms; filtering tighter
    // is unnecessary at the <10 entries we evaluate.
    this._disposables.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('gs-behave-bdd') || e.affectsConfiguration('behave-vsc')) {
          void this._refresh();
        }
      }),
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


  private async _handleMessage(msg: PanelInboundMessage): Promise<void> {
    try {
      if (!msg || typeof msg !== 'object' || typeof (msg as { kind?: unknown }).kind !== 'string') {
        config.logger.logInfoAllWksps('MigrationsPanel: ignoring malformed webview message');
        return;
      }

      switch (msg.kind) {
        case 'requestState':
          await this._refresh();
          return;

        case 'dispatchAction': {
          const validated = validateActionArgs((msg as { args?: unknown }).args);
          if (!validated) {
            // V5 input-validation (023-RESEARCH §Security): the host MUST
            // re-validate every Webview→host message. A malformed payload is
            // dropped with an audit line; never trusted server-side after the
            // round-trip.
            config.logger.logInfoAllWksps('MigrationsPanel: ignoring dispatchAction with invalid payload');
            return;
          }
          await dispatchMigrationAction(validated);
          await this._refresh();
          return;
        }

        case 'recheck':
          await vscode.commands.executeCommand('gs-behave-bdd.recheckMigrations');
          await this._refresh();
          return;

        case 'setMigrationMode':
          // 023-03 wires this. Log + ignore for now so we can see if the
          // webview tries to fire it prematurely.
          config.logger.logInfoAllWksps('MigrationsPanel: ignoring setMigrationMode (wired in 023-03)');
          return;

        default: {
          const _exhaustive: never = msg;
          void _exhaustive;
          config.logger.logInfoAllWksps(`MigrationsPanel: ignoring unhandled message kind '${(msg as { kind: string }).kind}'`);
        }
      }
    } catch (e) {
      // Never throw out of a webview message handler.
      config.logger.logInfoAllWksps(`MigrationsPanel: message handler error: ${e}`);
    }
  }


  private async _refresh(): Promise<void> {
    try {
      const viewModel = await buildViewModel();
      await this._panel.webview.postMessage({ kind: 'stateUpdate', viewModel });
    } catch (e) {
      config.logger.logInfoAllWksps(`MigrationsPanel: refresh failed: ${e}`);
    }
  }
}


// V5 input-validation: re-check every field of the webview-supplied payload
// before forwarding to `dispatchMigrationAction`. The webview round-trips
// numbers as numbers (we coerce client-side via `Number()`) but a malicious
// or buggy script could send anything — drop payloads that don't match.
function validateActionArgs(raw: unknown): MigrationActionArgs | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const a = raw as Record<string, unknown>;

  if (typeof a.entryId !== 'string') return undefined;
  if (!MIGRATION_REGISTRY.some(e => e.id === a.entryId)) return undefined;

  if (a.case !== 2 && a.case !== 3) return undefined;

  if (typeof a.scope !== 'number') return undefined;
  if (a.scope !== vscode.ConfigurationTarget.Global
      && a.scope !== vscode.ConfigurationTarget.Workspace
      && a.scope !== vscode.ConfigurationTarget.WorkspaceFolder) {
    return undefined;
  }

  if (typeof a.action !== 'string') return undefined;
  if (typeof a.wkspUri !== 'string') return undefined;

  return {
    entryId: a.entryId,
    case: a.case as 2 | 3,
    scope: a.scope as MigrationScope,
    // The action union is enforced downstream by `dispatchMigrationAction`'s
    // switch (which has an exhaustive `never` default). A bogus action string
    // hits the default branch and is logged + ignored.
    action: a.action as MigrationActionArgs['action'],
    wkspUri: a.wkspUri,
  };
}
