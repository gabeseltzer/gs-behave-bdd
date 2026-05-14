import * as vscode from 'vscode';
import { config } from '../configuration';
import { migrateScopedSetting } from '../notifications';
import {
  isMigrationFinishedAtScope,
  markMigrationFinishedAtScope,
} from './completedMigrations';
import { MIGRATION_REGISTRY } from './registry';
import {
  ALL_MIGRATION_SCOPES,
  type MigrationCase,
  type MigrationEntry,
  type MigrationScope,
} from './types';

export interface EvaluatorHooks {
  onCaseHit?: (
    mcase: MigrationCase,
    entry: MigrationEntry,
    scope: MigrationScope,
    // Optional metadata. Populated for case 2 and case 3 with the legacy/canonical
    // values at the firing scope so the panel can render an accurate hover preview
    // of what each action will write. `equalValues` is set for case 3 only and
    // tells the panel to collapse the action button set when there is no value
    // conflict to resolve.
    meta?: { sourceValue?: unknown; destValue?: unknown; equalValues?: boolean },
  ) => void;
}

export interface EvaluationResult {
  scope: MigrationScope;
  case: MigrationCase;
  action: 'finished' | 'pending-user-choice' | 'already-finished';
}

/**
 * Phase 19 D-01 / D-03: per-scope evaluator.
 *
 * Iterates all three VS Code scopes (Global / Workspace / WorkspaceFolder).
 * For each scope:
 *   - Short-circuits if `completedMigrations` at that scope already contains the entry.
 *   - Otherwise reads source/dest per-scope values via `inspect()` per Pitfall 2
 *     (the merging accessor would conflate scopes), then classifies as case 1, 2, or 3.
 *
 * Case 1 (silent): neither legacy nor canonical set, OR canonical is set with
 * legacy absent, OR legacy is empty/whitespace-only string with canonical absent
 * (MIGRATE-08 — same skip-with-removal semantics as v1.4.0 D-08).
 *
 * Case 2 / case 3: legacy set with (case 2) canonical absent or (case 3) canonical
 * also set. The evaluator does NOT prompt — Phase 21 wires the prompt UX through
 * the injected `hooks.onCaseHit` callback (D-03). The action returned is
 * `'pending-user-choice'`; the caller is responsible for marking Finished after
 * the user chooses.
 *
 * Per-scope independence (MIGRATE-09): each scope's classification is independent.
 * A case 1 finish at Global does not affect Workspace or WorkspaceFolder.
 *
 * Never throws — wraps each per-scope iteration in try/catch and logs via
 * `config.logger.logInfo` on failure.
 */
export async function evaluateMigration(
  entry: MigrationEntry,
  wkspUri: vscode.Uri,
  hooks?: EvaluatorHooks,
): Promise<EvaluationResult[]> {
  const results: EvaluationResult[] = [];

  for (const scope of ALL_MIGRATION_SCOPES) {
    try {
      // Idempotency short-circuit — if the migration is already finished at
      // this scope, return 'already-finished' without re-classifying or firing
      // the hook.
      if (isMigrationFinishedAtScope(entry.id, scope, wkspUri)) {
        // Re-classify the case for completeness (best-effort: may be 1 if the
        // migration completed silently). We do not need to inspect source/dest
        // again — return case 1 as the placeholder for already-finished entries
        // since the evaluator has no further action to take.
        results.push({ scope, case: 1, action: 'already-finished' });
        continue;
      }

      const sourceCfg = vscode.workspace.getConfiguration(entry.sourceNamespace, wkspUri);
      const sourceInsp = sourceCfg.inspect(entry.sourceKey);
      const sourceVal = sourceInsp ? readScopeValue(sourceInsp, scope) : undefined;

      const destCfg = entry.destNamespace === entry.sourceNamespace
        ? sourceCfg
        : vscode.workspace.getConfiguration(entry.destNamespace, wkspUri);
      const destInsp = destCfg.inspect(entry.destKey);
      const destVal = destInsp ? readScopeValue(destInsp, scope) : undefined;

      // MIGRATE-08 sub-case: legacy is an empty/whitespace string AND canonical
      // is absent at this scope. Treat as case 1 with skip-with-removal semantics.
      // Routes through the v1.4.0 primitive (MIGRATE-07 — single source of truth).
      const isEmptyString =
        typeof sourceVal === 'string' && sourceVal.trim() === '';

      if (sourceVal === undefined && destVal === undefined) {
        // Case 1 (neither set).
        await markMigrationFinishedAtScope(entry.id, scope, wkspUri);
        hooks?.onCaseHit?.(1, entry, scope);
        results.push({ scope, case: 1, action: 'finished' });
        continue;
      }

      if (sourceVal === undefined && destVal !== undefined) {
        // Case 1 (canonical already set, legacy absent — nothing to migrate).
        await markMigrationFinishedAtScope(entry.id, scope, wkspUri);
        results.push({ scope, case: 1, action: 'finished' });
        continue;
      }

      if (isEmptyString && destVal === undefined) {
        // MIGRATE-08: clear the empty source via the canonical primitive, then mark Finished.
        await migrateScopedSetting({
          namespace: entry.sourceNamespace,
          sourceKey: entry.sourceKey,
          destNamespace: entry.destNamespace,
          destKey: entry.destKey,
          wkspUri,
          transform: () => ({ kind: 'skipDest', removeSource: true }),
        });
        await markMigrationFinishedAtScope(entry.id, scope, wkspUri);
        hooks?.onCaseHit?.(1, entry, scope);
        results.push({ scope, case: 1, action: 'finished' });
        continue;
      }

      if (sourceVal !== undefined && destVal === undefined) {
        // Case 2: legacy set, canonical absent. Phase 21 owns the prompt.
        hooks?.onCaseHit?.(2, entry, scope, { sourceValue: sourceVal });
        results.push({ scope, case: 2, action: 'pending-user-choice' });
        continue;
      }

      // Case 3: both set. Pass `equalValues` so callers can collapse the action
      // set when there is no conflict to resolve (legacy and canonical agree).
      // JSON-stringify equality is sufficient for VS Code settings (JSON values
      // by definition) and avoids pulling in a deep-equal dependency.
      const equalValues = jsonEqual(sourceVal, destVal);
      hooks?.onCaseHit?.(3, entry, scope, { sourceValue: sourceVal, destValue: destVal, equalValues });
      results.push({ scope, case: 3, action: 'pending-user-choice' });
    } catch (e) {
      try {
        config.logger.logInfo(
          `Could not evaluate migration ${entry.id} at scope ${scope}: ${e}`,
          wkspUri,
        );
      } catch {
        // intentional: never throw from a "log on error" fallback.
      }
    }
  }

  return results;
}

/**
 * Convenience: evaluate every entry in the registry against the given workspace.
 * Phase 19 ships an empty registry (D-05) so this returns `[]` in production
 * until Phase 20 populates it. The `registry` parameter is injectable for tests.
 */
export async function evaluateAllMigrations(
  wkspUri: vscode.Uri,
  hooks?: EvaluatorHooks,
  registry: readonly MigrationEntry[] = MIGRATION_REGISTRY,
): Promise<EvaluationResult[]> {
  const out: EvaluationResult[] = [];
  for (const entry of registry) {
    const r = await evaluateMigration(entry, wkspUri, hooks);
    out.push(...r);
  }
  return out;
}

function readScopeValue<T>(
  insp: { globalValue?: T; workspaceValue?: T; workspaceFolderValue?: T },
  scope: MigrationScope,
): T | undefined {
  switch (scope) {
    case vscode.ConfigurationTarget.WorkspaceFolder: return insp.workspaceFolderValue;
    case vscode.ConfigurationTarget.Workspace: return insp.workspaceValue;
    case vscode.ConfigurationTarget.Global: return insp.globalValue;
  }
}

function jsonEqual(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    // Unserializable values (cycles, BigInt) can't be VS Code settings, but
    // be defensive — treat as not-equal so the user sees the full button set.
    return false;
  }
}
