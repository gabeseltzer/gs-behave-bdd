import * as vscode from 'vscode';
import { config } from '../configuration';
import { evaluateAllMigrations, type EvaluatorHooks } from './evaluator';

type QuickPickScopeId = 'global' | 'workspace' | 'workspaceFolder';

interface ScopePickItem extends vscode.QuickPickItem {
  readonly scopeId: QuickPickScopeId;
  readonly target: vscode.ConfigurationTarget;
}

/**
 * CONSENT-09 / D-06 / D-07 / D-08: Surgical recheck command. Shows a
 * quick-pick of writeable scopes, clears completedMigrations at the chosen
 * scope, then reuses the standard evaluator path (no parallel rescan).
 *
 * Phase 19 ships this against an empty registry (D-05) — no prompts will
 * fire until Phase 20 populates MIGRATION_REGISTRY and Phase 21 wires the
 * onCaseHit hook to notifications.
 */
export async function recheckMigrationsCommandHandler(hooks?: EvaluatorHooks): Promise<void> {
  try {
    const items: ScopePickItem[] = [];

    // Global is always writeable.
    items.push({
      label: 'Global',
      description: 'Clear completed migrations for your User settings',
      scopeId: 'global',
      target: vscode.ConfigurationTarget.Global,
    });

    // Workspace is writeable only when a .code-workspace is open (D-07).
    if (vscode.workspace.workspaceFile !== undefined) {
      items.push({
        label: 'Workspace',
        description: 'Clear completed migrations for the current .code-workspace',
        scopeId: 'workspace',
        target: vscode.ConfigurationTarget.Workspace,
      });
    }

    // WorkspaceFolder is writeable only when at least one folder is open (D-07).
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      items.push({
        label: 'Workspace Folder',
        description: 'Clear completed migrations for the active workspace folder',
        scopeId: 'workspaceFolder',
        target: vscode.ConfigurationTarget.WorkspaceFolder,
      });
    }

    const pick = await vscode.window.showQuickPick(items, {
      title: 'Behave BDD: Recheck Migrations',
      placeHolder: 'Select the scope to clear and re-scan',
      ignoreFocusOut: true,
    });
    if (!pick) return;

    // D-08: clear at the chosen scope, then run the standard evaluator path.
    // The wkspUri passed to getConfiguration is just a binding handle for the
    // VS Code config API; the per-scope ConfigurationTarget controls the
    // actual write location. Use the first folder when present, undefined
    // otherwise (Global-only environments).
    const targetWkspUri = folders && folders.length > 0 ? folders[0].uri : undefined;

    try {
      const cfg = vscode.workspace.getConfiguration('gs-behave-bdd', targetWkspUri);
      await cfg.update('completedMigrations', [], pick.target);
    } catch (e) {
      try {
        const msg = `recheckMigrations: clear at ${pick.scopeId} failed: ${e}`;
        if (targetWkspUri) {
          config.logger.logInfo(msg, targetWkspUri);
        } else {
          config.logger.logInfoAllWksps(msg);
        }
      } catch {
        // intentional: never throw from a "log on error" fallback.
      }
      return;
    }

    // D-08: reuse the activation-time evaluator path. Loop folders so each
    // workspace folder's WorkspaceFolder-scope state is re-classified.
    if (folders) {
      for (const folder of folders) {
        await evaluateAllMigrations(folder.uri, hooks);
      }
    }
  } catch (e) {
    try {
      config.logger.showError(e, undefined);
    } catch {
      // intentional: never throw from a "log on error" fallback.
    }
  }
}
