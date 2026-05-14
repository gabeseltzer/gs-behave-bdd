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
import { config } from '../configuration';
import { migrateScopedSetting } from '../notifications';
import { markMigrationFinishedAtScope } from './completedMigrations';
import type { MigrationEntry, MigrationScope } from './types';

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

// VS Code's showInformationMessage renders plain text only — no Markdown — so
// we keep the copy terse and let the button labels describe each action. The
// detailed per-action descriptions from the design doc live in the README /
// migration docs instead.
export function formatCase2Message(entry: MigrationEntry, scopes: readonly MigrationScope[]): string {
  return (
    `${entry.sourceNamespace}.${entry.sourceKey} is set ${joinScopes(scopes)} but ${entry.destNamespace}.${entry.destKey} is not. ` +
    `Migrate the legacy value to the new setting?`
  );
}

export function formatCase3Message(entry: MigrationEntry, scopes: readonly MigrationScope[]): string {
  return (
    `Both ${entry.sourceNamespace}.${entry.sourceKey} and ${entry.destNamespace}.${entry.destKey} are set ${joinScopes(scopes)}. ` +
    `Which value should win?`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Action handlers (D-A5.2 mapping table)
//
// CONTRACT (D-A5.4): the five write-performing handlers mark Finished and emit
// the success audit-log line ONLY AFTER the primitive `await` resolves
// successfully. NO `try/finally` — failures must propagate to runConsentFlow's
// per-scope try/catch so the failing scope re-surfaces next activation.
// The two pure no-op handlers (`runDontMigrate`, `runKeepBoth`) have no
// primitive call that can fail and unconditionally mark Finished + log.
//
// Pseudocode note: where the plan uses `kind: 'value'` it means the codebase's
// `kind: 'write'` (renamed in src/notifications.ts since the plan was authored).
// ─────────────────────────────────────────────────────────────────────────────

// Case 2 actions
//
// Phase v1.5.0 follow-up (260513-oh5): each handler now also clears the
// matching diagnostic on success so the Problems pane reflects the new state
// immediately when the user clicks a quick-fix.

export async function runMigrateAndDelete(entry: MigrationEntry, scope: MigrationScope, wkspUri: vscode.Uri): Promise<void> {
  await migrateScopedSetting({
    namespace: entry.sourceNamespace,
    sourceKey: entry.sourceKey,
    destNamespace: entry.destNamespace,
    destKey: entry.destKey,
    wkspUri,
    transform: (src, dest) => {
      const r = entry.transform(src, dest);
      if (r.kind === 'write') return { kind: 'write', value: r.value, removeSource: true };
      return { kind: 'skipDest', removeSource: true };
    },
  });
  await markMigrationFinishedAtScope(entry.id, scope, wkspUri);
  config.logger.logInfo(`Migration ${entry.id}: migrate-and-delete at ${describeScope(scope)} — done.`, wkspUri);
}

export async function runMigrateAndKeep(entry: MigrationEntry, scope: MigrationScope, wkspUri: vscode.Uri): Promise<void> {
  await migrateScopedSetting({
    namespace: entry.sourceNamespace,
    sourceKey: entry.sourceKey,
    destNamespace: entry.destNamespace,
    destKey: entry.destKey,
    wkspUri,
    transform: (src, dest) => {
      const r = entry.transform(src, dest);
      if (r.kind === 'write') return { kind: 'write', value: r.value, removeSource: false };
      return { kind: 'skipDest', removeSource: false };
    },
  });
  await markMigrationFinishedAtScope(entry.id, scope, wkspUri);
  config.logger.logInfo(`Migration ${entry.id}: migrate-and-keep at ${describeScope(scope)} — done.`, wkspUri);
}

export async function runDontMigrate(entry: MigrationEntry, scope: MigrationScope, wkspUri: vscode.Uri): Promise<void> {
  // No primitive call; pure no-op write semantically. Always marks Finished.
  await markMigrationFinishedAtScope(entry.id, scope, wkspUri);
  config.logger.logInfo(`Migration ${entry.id}: dont-migrate at ${describeScope(scope)} — done.`, wkspUri);
}

// Case 3 actions

export async function runOverwriteAndDelete(entry: MigrationEntry, scope: MigrationScope, wkspUri: vscode.Uri): Promise<void> {
  await runOverwriteAtScope(entry, scope, wkspUri, /* removeSource */ true);
  await markMigrationFinishedAtScope(entry.id, scope, wkspUri);
  config.logger.logInfo(`Migration ${entry.id}: overwrite-and-delete at ${describeScope(scope)} — done.`, wkspUri);
}

export async function runOverwriteAndKeep(entry: MigrationEntry, scope: MigrationScope, wkspUri: vscode.Uri): Promise<void> {
  await runOverwriteAtScope(entry, scope, wkspUri, /* removeSource */ false);
  await markMigrationFinishedAtScope(entry.id, scope, wkspUri);
  config.logger.logInfo(`Migration ${entry.id}: overwrite-and-keep at ${describeScope(scope)} — done.`, wkspUri);
}

export async function runKeepCanonicalAndDeleteLegacy(entry: MigrationEntry, scope: MigrationScope, wkspUri: vscode.Uri): Promise<void> {
  await migrateScopedSetting({
    namespace: entry.sourceNamespace,
    sourceKey: entry.sourceKey,
    destNamespace: entry.destNamespace,
    destKey: entry.destKey,
    wkspUri,
    transform: () => ({ kind: 'skipDest', removeSource: true }),
  });
  await markMigrationFinishedAtScope(entry.id, scope, wkspUri);
  config.logger.logInfo(`Migration ${entry.id}: keep-canonical-and-delete-legacy at ${describeScope(scope)} — done.`, wkspUri);
}

export async function runKeepBoth(entry: MigrationEntry, scope: MigrationScope, wkspUri: vscode.Uri): Promise<void> {
  // No primitive call; pure no-op write semantically. Always marks Finished.
  await markMigrationFinishedAtScope(entry.id, scope, wkspUri);
  config.logger.logInfo(`Migration ${entry.id}: keep-both at ${describeScope(scope)} — done.`, wkspUri);
}

// D-A5.3: pass undefined as destAtSameScope so the entry transform produces a
// clean replacement value (overwrite semantics) instead of a merge.
async function runOverwriteAtScope(
  entry: MigrationEntry,
  _scope: MigrationScope,
  wkspUri: vscode.Uri,
  removeSource: boolean,
): Promise<void> {
  await migrateScopedSetting({
    namespace: entry.sourceNamespace,
    sourceKey: entry.sourceKey,
    destNamespace: entry.destNamespace,
    destKey: entry.destKey,
    wkspUri,
    transform: (src, _destAtSameScope) => {
      const r = entry.transform(src, undefined);
      if (r.kind === 'write') return { kind: 'write', value: r.value, removeSource };
      return { kind: 'skipDest', removeSource };
    },
  });
}

function describeScope(scope: MigrationScope): string {
  switch (scope) {
    case vscode.ConfigurationTarget.Global: return 'Global';
    case vscode.ConfigurationTarget.Workspace: return 'Workspace';
    case vscode.ConfigurationTarget.WorkspaceFolder: return 'WorkspaceFolder';
  }
}

/**
 * Emits a multi-line summary of the pending migrations to the workspace
 * output channel before the orchestrator does any dispatching. Pairs with
 * the existing per-action audit lines (D-A6.1) so the output channel shows
 * both what was found and what was done.
 */
function logHitsSummary(hits: readonly ConsentHit[], wkspUri: vscode.Uri): void {
  const case2 = hits.filter(h => h.case === 2).length;
  const case3 = hits.filter(h => h.case === 3).length;
  config.logger.logInfo(
    `Pending migrations: ${hits.length} (case 2: ${case2}, case 3: ${case3})`,
    wkspUri,
  );
  for (const h of hits) {
    config.logger.logInfo(
      `  • ${h.entry.id} at ${describeScope(h.scope)} (case ${h.case}): `
      + `${h.entry.sourceNamespace}.${h.entry.sourceKey} → ${h.entry.destNamespace}.${h.entry.destKey}`,
      wkspUri,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator entry point (D-A1 / D-A3 / D-A4 / D-A5.4 / D-A6.1 / D-A7)
// ─────────────────────────────────────────────────────────────────────────────

interface ConsentGroup {
  entry: MigrationEntry;
  case: 2 | 3;
  scopes: MigrationScope[];
}

/**
 * Top-level consent orchestrator.
 *
 *  - Grouping (D-A1.1 / D-A1.2): hits are grouped by `(entry.id, case)` so a
 *    single notification covers every scope where that case fired for that
 *    entry. Groups are sorted deterministically (entry.id asc, then case asc).
 *
 *  - Uniform per-group action (D-A1.3): the user's single button click applies
 *    to every scope in the group; we dispatch the matching action handler
 *    sequentially over `group.scopes`.
 *
 *  - Sequential await (D-A3.3): groups are processed one-at-a-time with
 *    `await` — never `Promise.all` — to avoid stacking VS Code notifications.
 *
 *  - Mode dispatch (D-A4):
 *      * Case 2 + mode !== 'prompt' → silent path (migrate-and-delete /
 *        migrate-and-keep / skip), no notification shown.
 *      * Case 2 + mode === 'prompt' OR Case 3 (any mode, D-A4.3) → prompt
 *        with the verbatim D-A2.2 / D-A2.3 button labels.
 *
 *  - Per-scope failure recovery (D-A5.4): every per-scope handler invocation
 *    is wrapped in its own try/catch. A failure is logged (`action at <scope>
 *    failed: <err>`), the loop continues with the remaining scopes, and the
 *    failing scope is NOT marked Finished — it re-surfaces on the next
 *    activation.
 *
 *  - Dismissal (D-A7.1): when `showInformationMessage` returns `undefined`
 *    the orchestrator emits ONE audit line ("dismissed at … — will re-surface
 *    next activation") and moves on. No action runs, no scope is marked
 *    Finished.
 *
 *  - Audit logging (D-A6.1): every dispatched action emits exactly one
 *    `config.logger.logInfo` line via the handler itself; dismissals and
 *    per-scope failures emit one line each via the orchestrator. Audit lines
 *    use the raw VS Code scope names ("Global" / "Workspace" /
 *    "WorkspaceFolder", D-A6.3), NOT the friendly names used in prompts.
 *
 *  - Fire-and-forget (D-A3.4): the activation site calls
 *    `void runConsentFlow(...)`. We never throw to the caller.
 */
export async function runConsentFlow(
  wkspUri: vscode.Uri,
  hits: readonly ConsentHit[],
  mode: MigrationMode,
): Promise<void> {
  // ── 0. Dedupe single-folder phantom hits ────────────────────────────────
  // In a single-folder workspace, .vscode/settings.json is the source for both
  // Workspace and WorkspaceFolder scopes — VS Code's inspect() reports the
  // same value at both. The evaluator surfaces both, which would otherwise
  // (a) inflate the notification count, (b) cause double-writes during silent
  // dispatch, and (c) duplicate the per-hit audit log lines. Drop the
  // WorkspaceFolder duplicates here; multi-root workspaces keep both because
  // the scopes are genuinely independent.
  const effectiveHits: readonly ConsentHit[] = vscode.workspace.workspaceFile === undefined
    ? hits.filter(h => h.scope !== vscode.ConfigurationTarget.WorkspaceFolder)
    : hits;

  // ── 1. Log potential migrations found (output channel surface) ──────────
  if (effectiveHits.length > 0) {
    logHitsSummary(effectiveHits, wkspUri);
  }

  // ── 2. Build groups keyed by (entry.id, case) ────────────────────────────
  const groupMap = new Map<string, ConsentGroup>();
  for (const hit of effectiveHits) {
    const key = `${hit.entry.id}::${hit.case}`;
    const existing = groupMap.get(key);
    if (existing) {
      existing.scopes.push(hit.scope);
    } else {
      groupMap.set(key, { entry: hit.entry, case: hit.case, scopes: [hit.scope] });
    }
  }

  // Deterministic order: entry.id asc, then case asc (case 2 before case 3).
  const groups = [...groupMap.values()].sort((a, b) => {
    if (a.entry.id !== b.entry.id) return a.entry.id < b.entry.id ? -1 : 1;
    return a.case - b.case;
  });

  // ── 3. Apply silent migrationMode dispatch for case-2 groups ─────────────
  // (case 3 always prompts, regardless of mode — D-A4.3)
  const promptBoundHits: ConsentHit[] = [];
  for (const group of groups) {
    if (group.case === 2 && mode !== 'prompt') {
      await processCase2Silent(group, wkspUri, mode);
      continue;
    }
    for (const scope of group.scopes) {
      promptBoundHits.push({ case: group.case, entry: group.entry, scope });
    }
  }

  // ── 4. Summary toast → Migrations Panel for prompt-bound hits ───────────
  // 023-04: replaces the diagnostics-publishing + two-button toast with a
  // single-button toast that opens the Migrations Panel (Webview). The panel
  // re-evaluates from scratch when it opens, so we don't need to thread any
  // hit through to the click handler.
  if (promptBoundHits.length > 0) {
    const n = promptBoundHits.length;
    const message = `${n} ${n === 1 ? 'setting' : 'settings'} can be migrated for Behave BDD`;
    void vscode.window
      .showInformationMessage(message, 'Open Migrations Panel')
      .then(choice => handleSummaryToastChoice(choice, wkspUri));
  }

  // Restore the D-18 contract: WorkspaceSettings cache reflects post-migration
  // state. Only reload when there was actually a consent hit (silent or
  // prompt-bound), to avoid touching the cache on every activation tick.
  if (groups.length > 0) {
    config.reloadSettings(wkspUri);
  }
}

async function processCase2Silent(group: ConsentGroup, wkspUri: vscode.Uri, mode: MigrationMode): Promise<void> {
  const { entry, scopes } = group;
  if (mode === 'migrate-and-delete') {
    await dispatchOverScopes(scopes, entry, wkspUri, runMigrateAndDelete);
    return;
  }
  if (mode === 'migrate-and-keep') {
    await dispatchOverScopes(scopes, entry, wkspUri, runMigrateAndKeep);
    return;
  }
  // mode === 'skip': mark each scope Finished without running any action.
  for (const scope of scopes) {
    try {
      await markMigrationFinishedAtScope(entry.id, scope, wkspUri);
      config.logger.logInfo(`Migration ${entry.id}: skip at ${describeScope(scope)} — done.`, wkspUri);
    } catch (e) {
      config.logger.logInfo(`Migration ${entry.id}: action at ${describeScope(scope)} failed: ${e}`, wkspUri);
    }
  }
}

type ActionHandler = (entry: MigrationEntry, scope: MigrationScope, wkspUri: vscode.Uri) => Promise<void>;

// D-A5.4: each per-scope handler invocation is wrapped in its own try/catch.
// A failure is logged and the loop continues; the failing scope is NOT marked
// Finished (the handler threw before reaching markMigrationFinishedAtScope),
// so it will re-surface on the next activation.
async function dispatchOverScopes(
  scopes: readonly MigrationScope[],
  entry: MigrationEntry,
  wkspUri: vscode.Uri,
  handler: ActionHandler,
): Promise<void> {
  for (const scope of scopes) {
    try {
      await handler(entry, scope, wkspUri);
    } catch (e) {
      config.logger.logInfo(`Migration ${entry.id}: action at ${describeScope(scope)} failed: ${e}`, wkspUri);
      // continue with remaining scopes (D-A5.4)
    }
  }
}

/**
 * 023-04: dispatch the summary-toast button choice.
 *
 *   'Open Migrations Panel' → executes the gs-behave-bdd.openMigrationsPanel
 *                             command (Webview registered in extension.ts).
 *   undefined               → user dismissed the toast — no-op; the next
 *                             activation will re-surface the toast.
 *
 * Never throws; failures are logged so a misclick can't surface a stack trace
 * via the unhandled-rejection handler.
 */
async function handleSummaryToastChoice(choice: string | undefined, wkspUri: vscode.Uri): Promise<void> {
  if (choice === undefined) return;
  try {
    if (choice === 'Open Migrations Panel') {
      await vscode.commands.executeCommand('gs-behave-bdd.openMigrationsPanel');
    }
  } catch (e) {
    config.logger.logInfo(`Summary toast action "${choice}" failed: ${e}`, wkspUri);
  }
}
