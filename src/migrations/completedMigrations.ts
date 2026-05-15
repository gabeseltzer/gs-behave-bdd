import * as vscode from 'vscode';
import { config } from '../configuration';
import type { MigrationScope } from './types';

const NAMESPACE = 'gs-behave-bdd';
const KEY = 'completedMigrations';

/**
 * Reads `gs-behave-bdd.completedMigrations` at the requested scope only —
 * via `inspect()` per Pitfall 2 (the merging cfg accessor must never be used
 * here). Returns true iff the per-scope array contains `id`.
 *
 * Per MIGRATE-09: each VS Code scope's value is independent — a Global hit
 * does not satisfy a Workspace query.
 */
export function isMigrationFinishedAtScope(
  id: string,
  scope: MigrationScope,
  wkspUri: vscode.Uri,
): boolean {
  const cfg = vscode.workspace.getConfiguration(NAMESPACE, wkspUri);
  const insp = cfg.inspect<string[]>(KEY);
  if (!insp) return false;
  const arr = readScopeValue(insp, scope);
  return Array.isArray(arr) && arr.includes(id);
}

/**
 * Appends `id` to `gs-behave-bdd.completedMigrations` at the requested scope.
 * - Reads the per-scope value via `inspect()` per Pitfall 2 (merged-scope reads
 *   are forbidden here — they would falsely skip lower-scope writes).
 * - Idempotent: skips the `update()` call entirely if `id` is already present
 *   at the requested scope, to avoid emitting a no-op configuration-change
 *   event that would re-trigger downstream reparses.
 * - Never throws: on `update()` rejection logs via `config.logger.logInfo`
 *   and returns (mirrors the v1.4.0 primitive contract — D-07).
 */
export async function markMigrationFinishedAtScope(
  id: string,
  scope: MigrationScope,
  wkspUri: vscode.Uri,
): Promise<void> {
  const cfg = vscode.workspace.getConfiguration(NAMESPACE, wkspUri);
  const insp = cfg.inspect<string[]>(KEY);
  const existing = insp ? readScopeValue(insp, scope) : undefined;
  const current = Array.isArray(existing) ? [...existing] : [];
  if (current.includes(id)) return;
  current.push(id);
  try {
    await cfg.update(KEY, current, scope);
  } catch (e) {
    try {
      config.logger.logInfo(
        `Could not mark migration ${id} as finished at scope ${scope}: ${e}`,
        wkspUri,
      );
    } catch {
      // intentional: never throw from a "log on error" fallback.
    }
  }
}

function readScopeValue(
  insp: { globalValue?: string[]; workspaceValue?: string[]; workspaceFolderValue?: string[] },
  scope: MigrationScope,
): string[] | undefined {
  switch (scope) {
    case vscode.ConfigurationTarget.WorkspaceFolder: return insp.workspaceFolderValue;
    case vscode.ConfigurationTarget.Workspace: return insp.workspaceValue;
    case vscode.ConfigurationTarget.Global: return insp.globalValue;
  }
}
