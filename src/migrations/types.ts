import * as vscode from 'vscode';
import type { TransformResult } from '../notifications';

/**
 * Phase 19 D-04: minimal MigrationEntry shape. Phase 20 may extend with
 * additional optional fields (e.g. `legacyCleanupNote`, `description`)
 * when concrete entries are registered. Keep this interface stable so
 * downstream phases can rely on it.
 */
export interface MigrationEntry<TSrc = unknown, TDest = unknown> {
  /**
   * Unique migration id. Phase 20 naming convention (CONTEXT.md D-A4 / Pitfall 3):
   *
   * - `<key>-from-behavevsc`  — cross-extension entry migrating `behave-vsc.<key>`
   *                             → `gs-behave-bdd.<key>` (covers the 15 plain entries
   *                             plus `featuresPath-from-behavevsc`).
   * - `<key>-self`            — intra-namespace entry migrating one `gs-behave-bdd` key
   *                             to another (e.g. `featuresPath-self`, `suppressMultiConfig-self`).
   *
   * Id must be globally unique across all registry entries (see registry-invariants test).
   */
  readonly id: string;
  readonly sourceNamespace: string;
  readonly sourceKey: string;
  readonly destNamespace: string;
  readonly destKey: string;
  readonly transform: (src: TSrc, destAtSameScope: TDest | undefined) => TransformResult<TDest>;
}

/** Per-scope classification produced by the evaluator. */
export type MigrationCase = 1 | 2 | 3;

/** The three VS Code scopes the evaluator visits per MIGRATE-04. */
export type MigrationScope =
  | vscode.ConfigurationTarget.Global
  | vscode.ConfigurationTarget.Workspace
  | vscode.ConfigurationTarget.WorkspaceFolder;

export const ALL_MIGRATION_SCOPES: readonly MigrationScope[] = [
  vscode.ConfigurationTarget.Global,
  vscode.ConfigurationTarget.Workspace,
  vscode.ConfigurationTarget.WorkspaceFolder,
] as const;
