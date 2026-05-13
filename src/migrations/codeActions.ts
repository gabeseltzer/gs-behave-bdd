/**
 * Code Action provider + command dispatcher for migration consent quick-fixes.
 *
 * Pairs with diagnostics.ts: every Diagnostic with source 'gs-behave-bdd' and
 * a decodable `code` exposes the 3 (case 2) or 4 (case 3) action buttons as
 * quick-fixes in the Problems pane and the lightbulb menu in settings.json.
 *
 * Clicking a quick-fix invokes the `gs-behave-bdd.migration.action` command
 * with the encoded payload; the command resolves entryId → MigrationEntry and
 * dispatches to the matching handler exported from consent.ts.
 */

import * as vscode from 'vscode';
import { config } from '../configuration';
import {
  MIGRATION_DIAG_SOURCE,
  clearDiagnosticsForEntryAtScope,
  decodeDiagnosticCode,
} from './diagnostics';
import {
  runMigrateAndDelete,
  runMigrateAndKeep,
  runDontMigrate,
  runOverwriteAndDelete,
  runOverwriteAndKeep,
  runKeepCanonicalAndDeleteLegacy,
  runKeepBoth,
  type Case2Action,
  type Case3Action,
} from './consent';
import { MIGRATION_REGISTRY } from './registry';
import type { MigrationEntry, MigrationScope } from './types';

export const MIGRATION_ACTION_COMMAND = 'gs-behave-bdd.migration.action';

/**
 * Action payload encoded into the Command arguments. Keep this serializable —
 * VS Code persists Code Action commands across reloads in some surfaces.
 */
export interface MigrationActionArgs {
  entryId: string;
  case: 2 | 3;
  scope: MigrationScope;
  action: Case2Action | Case3Action;
  wkspUri: string;
}

const CASE_2_LABELS: { label: string; action: Case2Action }[] = [
  { label: 'Migrate & delete', action: 'migrate-and-delete' },
  { label: 'Migrate & keep', action: 'migrate-and-keep' },
  { label: "Don't migrate", action: 'dont-migrate' },
];

const CASE_3_LABELS: { label: string; action: Case3Action }[] = [
  { label: 'Overwrite & delete', action: 'overwrite-and-delete' },
  { label: 'Overwrite & keep', action: 'overwrite-and-keep' },
  { label: 'Keep canonical', action: 'keep-canonical-and-delete-legacy' },
  { label: 'Keep both', action: 'keep-both' },
];

export class MigrationCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const out: vscode.CodeAction[] = [];
    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== MIGRATION_DIAG_SOURCE) continue;
      const decoded = decodeDiagnosticCode(diagnostic.code);
      if (!decoded) continue;

      const wkspUri = resolveWkspUriForDispatch(document, decoded.scope);
      if (!wkspUri) continue;

      const labels = decoded.case === 2 ? CASE_2_LABELS : CASE_3_LABELS;
      for (const { label, action } of labels) {
        const ca = new vscode.CodeAction(label, vscode.CodeActionKind.QuickFix);
        ca.diagnostics = [diagnostic];
        const args: MigrationActionArgs = {
          entryId: decoded.entryId,
          case: decoded.case,
          scope: decoded.scope,
          action: action as Case2Action | Case3Action,
          wkspUri: wkspUri.toString(),
        };
        ca.command = {
          command: MIGRATION_ACTION_COMMAND,
          title: label,
          arguments: [args],
        };
        out.push(ca);
      }
    }
    return out;
  }
}

/**
 * Pick a workspace folder URI suitable for `getConfiguration(..., wkspUri)`
 * calls inside the action handler. The actual scope where the write lands is
 * encoded in `scope`; wkspUri is just a binding handle for the VS Code API.
 *
 *   - WorkspaceFolder scope → the folder that contains the anchor settings.json
 *     (walk up via `vscode.workspace.getWorkspaceFolder`).
 *   - Global / Workspace scope → the first workspace folder is fine; if no
 *     folders are open we return undefined and skip dispatch (the action is
 *     meaningless without at least one binding).
 */
function resolveWkspUriForDispatch(
  document: vscode.TextDocument,
  scope: MigrationScope,
): vscode.Uri | undefined {
  if (scope === vscode.ConfigurationTarget.WorkspaceFolder) {
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (folder) return folder.uri;
  }
  const first = vscode.workspace.workspaceFolders?.[0];
  return first?.uri;
}

/**
 * Command handler. Resolves entryId → MigrationEntry via MIGRATION_REGISTRY,
 * dispatches to the matching consent.ts handler, then clears the diagnostic
 * for that (entry, scope) tuple on success.
 *
 * Never throws — failures are logged and the diagnostic stays so the user
 * sees the action didn't take. Mirrors the per-scope failure recovery in
 * consent.ts runConsentFlow.
 */
export async function dispatchMigrationAction(args: MigrationActionArgs): Promise<void> {
  const entry = MIGRATION_REGISTRY.find(e => e.id === args.entryId);
  if (!entry) {
    safeLog(`Migration ${args.entryId}: dispatch failed — entry not in registry`, undefined);
    return;
  }
  let wkspUri: vscode.Uri;
  try {
    wkspUri = vscode.Uri.parse(args.wkspUri);
  } catch (e) {
    safeLog(`Migration ${args.entryId}: dispatch failed — bad wkspUri: ${e}`, undefined);
    return;
  }
  try {
    await runActionHandler(entry, args, wkspUri);
    clearDiagnosticsForEntryAtScope(entry, args.scope);
  } catch (e) {
    safeLog(`Migration ${entry.id}: action ${args.action} failed: ${e}`, wkspUri);
  }
}

async function runActionHandler(
  entry: MigrationEntry,
  args: MigrationActionArgs,
  wkspUri: vscode.Uri,
): Promise<void> {
  switch (args.action) {
    case 'migrate-and-delete': return runMigrateAndDelete(entry, args.scope, wkspUri);
    case 'migrate-and-keep': return runMigrateAndKeep(entry, args.scope, wkspUri);
    case 'dont-migrate': return runDontMigrate(entry, args.scope, wkspUri);
    case 'overwrite-and-delete': return runOverwriteAndDelete(entry, args.scope, wkspUri);
    case 'overwrite-and-keep': return runOverwriteAndKeep(entry, args.scope, wkspUri);
    case 'keep-canonical-and-delete-legacy': return runKeepCanonicalAndDeleteLegacy(entry, args.scope, wkspUri);
    case 'keep-both': return runKeepBoth(entry, args.scope, wkspUri);
    default: {
      const _exhaustive: never = args.action;
      void _exhaustive;
      safeLog(`Migration ${entry.id}: unknown action "${String(args.action)}"`, wkspUri);
    }
  }
}

function safeLog(message: string, wkspUri: vscode.Uri | undefined): void {
  try {
    if (wkspUri) {
      config.logger.logInfo(message, wkspUri);
    } else {
      config.logger.logInfoAllWksps(message);
    }
  } catch {
    // intentional: never throw from a "log on error" fallback.
  }
}
