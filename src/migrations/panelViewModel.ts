// Phase 023 Plan 02 Task 1: typed view-model + builder for the Migrations Webview.
//
// Collect-only evaluator wrapper. Mirrors the per-folder evaluator loop in
// `recheckCommand.ts:100-109` but never dispatches — only records hits — and
// folds them into a typed `PanelViewModel` the webview can render directly.
//
// Decisions baked in (settled 2026-05-14, 023-02 plan):
//   - Decision A: single panel for multi-root workspaces; rows tagged with
//     `folderName` for grouping in `panelHtml.render`.
//   - Global-scope hits are deduped across folders via a `Set<string>` keyed by
//     `${entryId}::${scope}` so the same logical row doesn't multiply once per
//     workspace folder iteration (see 023-02 PLAN §Risks).
//
// Type-preservation NOTE: `CASE_2_BUTTONS` / `CASE_3_BUTTONS` keep the narrowed
// `Case2Action` / `Case3Action` action types so the `dispatchMigrationAction`
// callsite (after 023-04) retains union narrowing instead of degrading to
// `string`. The Task 4 re-export in `codeActions.ts` MUST preserve this.
import * as vscode from 'vscode';
import { config } from '../configuration';
import { readMigrationMode, type Case2Action, type Case3Action, type MigrationMode } from './consent';
import { evaluateAllMigrations } from './evaluator';
import type { MigrationEntry, MigrationScope } from './types';

// Re-export `MigrationMode` so `panel.ts` and consumers can pull the enum type
// from a single barrel without reaching into `consent.ts` directly. 023-03.
export type { MigrationMode } from './consent';


// 023-03 Task 1: surface mode metadata for the panel's Migration Mode picker.
// Order is fixed (matches the spec's enum order) so the rendered buttons are
// stable across reloads. Labels and descriptions are user-facing; tooltips on
// the buttons in `panelHtml.ts` use the description string.
export const MIGRATION_MODE_OPTIONS: readonly {
  value: MigrationMode;
  label: string;
  description: string;
}[] = [
  { value: 'prompt',             label: 'Prompt',           description: 'Ask per scope (default)' },
  { value: 'migrate-and-delete', label: 'Migrate & delete', description: 'Silently move legacy values and remove the legacy key' },
  { value: 'migrate-and-keep',   label: 'Migrate & keep',   description: 'Silently copy legacy values and leave the legacy key' },
  { value: 'skip',               label: 'Skip',             description: 'Finish without copying' },
];

// String-set form for fast membership checks during webview input validation.
export const MIGRATION_MODE_VALUES: readonly MigrationMode[] =
  MIGRATION_MODE_OPTIONS.map(o => o.value);


export const CASE_2_BUTTONS: readonly { label: string; action: Case2Action }[] = [
  { label: 'Migrate & delete', action: 'migrate-and-delete' },
  { label: 'Migrate & keep', action: 'migrate-and-keep' },
  { label: "Don't migrate", action: 'dont-migrate' },
];

export const CASE_3_BUTTONS: readonly { label: string; action: Case3Action }[] = [
  { label: 'Overwrite & delete', action: 'overwrite-and-delete' },
  { label: 'Overwrite & keep', action: 'overwrite-and-keep' },
  { label: 'Keep canonical', action: 'keep-canonical-and-delete-legacy' },
  { label: 'Keep both', action: 'keep-both' },
];


export interface PanelRow {
  entryId: string;
  case: 2 | 3;
  scope: MigrationScope;
  scopeLabel: string;
  sourceKey: string;
  destKey: string;
  wkspUri: string;
  folderName: string;
  // The action button set is case-correct (3 for case 2, 4 for case 3) and
  // typed with the narrowed action union — not `string` — so a round-trip
  // through `postMessage` lands on `Case2Action | Case3Action` at the host.
  buttons: readonly { label: string; action: Case2Action | Case3Action }[];
}


export interface PanelViewModel {
  rows: PanelRow[];
  folderCount: number;
  // Read-only here — 023-03 owns the writer for the Migration Mode picker.
  // Sourced from the first workspace folder (or 'prompt' when no folders).
  migrationMode: MigrationMode;
  empty: boolean;
}


export function describeScope(scope: MigrationScope): string {
  switch (scope) {
    case vscode.ConfigurationTarget.Global: return 'Global';
    case vscode.ConfigurationTarget.Workspace: return 'Workspace';
    case vscode.ConfigurationTarget.WorkspaceFolder: return 'Workspace Folder';
  }
}


export async function buildViewModel(): Promise<PanelViewModel> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return { rows: [], folderCount: 0, migrationMode: 'prompt', empty: true };
  }

  const rows: PanelRow[] = [];
  // Dedup key for Global- and Workspace-scope hits — those are window-wide and
  // would otherwise repeat once per folder iteration. WorkspaceFolder-scope
  // hits stay per-folder (genuinely distinct rows).
  const seen = new Set<string>();

  for (const folder of folders) {
    try {
      await evaluateAllMigrations(folder.uri, {
        onCaseHit: (mcase, entry, scope) => {
          if (mcase !== 2 && mcase !== 3) return;

          if (scope === vscode.ConfigurationTarget.Global
              || scope === vscode.ConfigurationTarget.Workspace) {
            const key = `${entry.id}::${scope}`;
            if (seen.has(key)) return;
            seen.add(key);
          }

          rows.push(buildRow(entry, mcase, scope, folder));
        },
      });
    } catch (e) {
      try {
        config.logger.logInfo(
          `buildViewModel: evaluation failed for folder ${folder.name}: ${e}`,
          folder.uri,
        );
      } catch {
        // intentional: never throw from a "log on error" fallback.
      }
    }
  }

  const migrationMode = readMigrationMode(folders[0].uri);

  return {
    rows,
    folderCount: folders.length,
    migrationMode,
    empty: rows.length === 0,
  };
}


function buildRow(
  entry: MigrationEntry,
  mcase: 2 | 3,
  scope: MigrationScope,
  folder: vscode.WorkspaceFolder,
): PanelRow {
  return {
    entryId: entry.id,
    case: mcase,
    scope,
    scopeLabel: describeScope(scope),
    sourceKey: `${entry.sourceNamespace}.${entry.sourceKey}`,
    destKey: `${entry.destNamespace}.${entry.destKey}`,
    wkspUri: folder.uri.toString(),
    folderName: folder.name,
    buttons: mcase === 2 ? CASE_2_BUTTONS : CASE_3_BUTTONS,
  };
}
