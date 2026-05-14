/**
 * Command dispatcher for migration actions.
 *
 * Phase 023 (Migrations Panel Webview): the CodeAction provider and the
 * diagnostics surface it depended on are gone. The Webview panel from
 * `src/migrations/panel.ts` now sends a `dispatchMigrationAction` message
 * over `postMessage`, which is routed through the same
 * `MIGRATION_ACTION_COMMAND` entry point this module registers.
 *
 * Per 023-04 Task 2: `MIGRATION_ACTION_COMMAND` registration in extension.ts
 * stays even though the only in-process caller is the panel — the command
 * boundary is kept callable so external callers (or future surfaces) can
 * invoke via `vscode.commands.executeCommand` with hand-encoded args.
 */

import * as vscode from 'vscode';
import { config } from '../configuration';
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
 * Action payload encoded into the command arguments. Keep this serializable —
 * VS Code persists command arguments across reloads in some surfaces, and the
 * Webview posts these as JSON.
 */
export interface MigrationActionArgs {
  entryId: string;
  case: 2 | 3;
  scope: MigrationScope;
  action: Case2Action | Case3Action;
  wkspUri: string;
}

/**
 * Command handler. Resolves entryId → MigrationEntry via MIGRATION_REGISTRY
 * and dispatches to the matching consent.ts handler. The panel re-renders on
 * the configuration change that follows a successful dispatch, so this module
 * no longer needs to clear any diagnostic surface on success.
 *
 * Never throws — failures are logged. Mirrors the per-scope failure recovery
 * in consent.ts runConsentFlow.
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
  } catch (e) {
    safeLog(`Migration ${entry.id}: action ${args.action} failed: ${e}`, wkspUri);
  }
}

export async function runActionHandler(
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

export function safeLog(message: string, wkspUri: vscode.Uri | undefined): void {
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
