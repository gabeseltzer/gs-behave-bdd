/**
 * Phase 21 — User-consent orchestrator for case-2 and case-3 migrations.
 *
 * Design references (see .planning/phases/021-consent-ux-case-2-case-3-prompts/021-CONTEXT.md):
 *  - D-A1 : collect all hits first, then prompt once per (entry, case) group.
 *  - D-A3 : sequentially await each notification (no parallel modal-style prompts).
 *  - D-A4 : honour `gs-behave-bdd.migrationMode` for case-2 silent paths;
 *           case-3 ALWAYS prompts (4 buttons) regardless of mode.
 *  - D-A5 : action → primitive mapping table (see runConsentFlow); per-scope
 *           failure handling (D-A5.4) — failing scope is NOT marked Finished
 *           and re-surfaces next activation.
 *  - D-A6 : friendly scope names for prompt copy (D-A6.2); raw VS Code names
 *           in audit log strings (D-A6.3); one logInfo line per dispatched
 *           action / dismissal (D-A6.1).
 *  - D-A7 : dismissal (showInformationMessage returns undefined) is logged
 *           once and re-surfaces next activation; never marks Finished.
 *  - D-A8.3 (deviation, user-approved Option A): TransformResult's write
 *           variant gained an optional `removeSource` field so the seven
 *           action handlers can distinguish migrate-and-keep / overwrite-and-keep
 *           from their delete-source siblings via the canonical primitive.
 */

import * as vscode from 'vscode';
import type { MigrationEntry, MigrationScope } from './types';
// NOTE: Task 2 of plan 021-01 adds imports for `config`, `migrateScopedSetting`,
// `TransformResult`, and `markMigrationFinishedAtScope` when the seven action
// handlers + `runOverwriteAtScope` land. Kept lean here so ESLint stays clean.

// ─────────────────────────────────────────────────────────────────────────────
// Public types (D-A8.1)
// ─────────────────────────────────────────────────────────────────────────────

export type Case2Action = 'migrate-and-delete' | 'migrate-and-keep' | 'dont-migrate';
export type Case3Action =
  | 'overwrite-and-delete'
  | 'overwrite-and-keep'
  | 'keep-canonical-and-delete-legacy'
  | 'keep-both';
export type MigrationMode = 'prompt' | 'migrate-and-delete' | 'migrate-and-keep' | 'skip';

export interface ConsentHit {
  case: 2 | 3;
  entry: MigrationEntry;
  scope: MigrationScope;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (D-A4.1, D-A6.2)
// ─────────────────────────────────────────────────────────────────────────────

export function readMigrationMode(wkspUri: vscode.Uri): MigrationMode {
  return vscode.workspace
    .getConfiguration('gs-behave-bdd', wkspUri)
    .get<MigrationMode>('migrationMode', 'prompt');
}

export function friendlyScopeName(scope: MigrationScope): string {
  switch (scope) {
    case vscode.ConfigurationTarget.Global: return 'globally';
    case vscode.ConfigurationTarget.Workspace: return 'in this workspace';
    case vscode.ConfigurationTarget.WorkspaceFolder: return 'in this workspace folder';
  }
}

function joinScopes(scopes: readonly MigrationScope[]): string {
  const names = scopes.map(friendlyScopeName);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Message formatters (D-A6 prompt copy)
// ─────────────────────────────────────────────────────────────────────────────

export function formatCase2Message(entry: MigrationEntry, scopes: readonly MigrationScope[]): string {
  return (
    `\`${entry.sourceNamespace}.${entry.sourceKey}\` is set ${joinScopes(scopes)} but \`${entry.destNamespace}.${entry.destKey}\` is not.\n\n` +
    `- **Migrate & delete**: copy the legacy value to the canonical setting and clear the legacy entry.\n` +
    `- **Migrate & keep**: copy the value but leave the legacy entry in place.\n` +
    `- **Don't migrate**: skip this migration. The extension will stop reading the legacy fallback in a future version.`
  );
}

export function formatCase3Message(entry: MigrationEntry, scopes: readonly MigrationScope[]): string {
  return (
    `Both \`${entry.sourceNamespace}.${entry.sourceKey}\` and \`${entry.destNamespace}.${entry.destKey}\` are set ${joinScopes(scopes)}.\n\n` +
    `- **Overwrite & delete**: replace the canonical value with the legacy value and clear the legacy entry.\n` +
    `- **Overwrite & keep**: replace the canonical value with the legacy value, keep the legacy entry.\n` +
    `- **Keep canonical**: leave the canonical value, clear the legacy entry.\n` +
    `- **Keep both**: leave both values untouched.`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator entry point (stub — Task 3 implements the body)
// ─────────────────────────────────────────────────────────────────────────────

export async function runConsentFlow(
  _wkspUri: vscode.Uri,
  _hits: readonly ConsentHit[],
  _mode: MigrationMode,
): Promise<void> {
  // Implemented in Task 3 of this plan.
  return;
}

