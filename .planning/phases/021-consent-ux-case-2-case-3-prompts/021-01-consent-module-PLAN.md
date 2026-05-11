---
phase: 021-consent-ux-case-2-case-3-prompts
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/migrations/consent.ts
  - src/migrations/index.ts
autonomous: true
requirements:
  - CONSENT-01
  - CONSENT-02
  - CONSENT-03
  - CONSENT-04
  - CONSENT-06
  - MIGRATE-05
  - MIGRATE-06

must_haves:
  truths:
    - "runConsentFlow groups ConsentHits by (entry, case) tuple and shows one notification per group"
    - "Case 2 with migrationMode=prompt shows 3 buttons; case 3 always shows 4 buttons regardless of migrationMode"
    - "Case 2 with migrationMode != prompt runs the action silently and marks Finished at all hit scopes"
    - "Each explicit action (case 2 or case 3) marks the migration Finished at every scope grouped under that notification, ONLY on success"
    - "If a per-scope write fails, the failing scope is NOT marked Finished and the orchestrator continues with remaining scopes (D-A5.4 — failing scope re-surfaces next activation)"
    - "Dismissal (showInformationMessage returns undefined) does NOT mark Finished and emits exactly one audit-log line"
    - "Every successfully dispatched action emits exactly one config.logger.logInfo line"
    - "All config writes route through migrateScopedSetting (no parallel implementations — MIGRATE-07)"
  artifacts:
    - path: "src/migrations/consent.ts"
      provides: "runConsentFlow orchestrator + public types + helpers"
      exports: ["runConsentFlow", "readMigrationMode", "friendlyScopeName", "formatCase2Message", "formatCase3Message", "Case2Action", "Case3Action", "MigrationMode", "ConsentHit"]
      min_lines: 200
    - path: "src/migrations/index.ts"
      provides: "Flat re-export surface for src/extension.ts"
      contains: "export { runConsentFlow"
  key_links:
    - from: "src/migrations/consent.ts"
      to: "src/notifications.ts (migrateScopedSetting)"
      via: "import + invocation in action handlers"
      pattern: "migrateScopedSetting\\("
    - from: "src/migrations/consent.ts"
      to: "src/migrations/completedMigrations.ts (markMigrationFinishedAtScope)"
      via: "called after every successful explicit action"
      pattern: "markMigrationFinishedAtScope\\("
    - from: "src/migrations/index.ts"
      to: "src/migrations/consent.ts"
      via: "re-export"
      pattern: "from './consent'"
---

> **Shell portability note:** The grep-based acceptance criteria below assume Git Bash. PowerShell users can run the equivalent `Select-String` commands. The `<automated>` verify lines (eslint + tsc + unit tests) are the authoritative cross-shell check; the grep assertions are advisory pre-flight signals.

<objective>
Create `src/migrations/consent.ts` containing the entire user-consent orchestrator for v1.5.0 case 2 / case 3 migrations, and re-export it through `src/migrations/index.ts` so `src/extension.ts` can import it flat. This plan covers the full module: types, mode-reading helper, friendly scope labels, message formatters, the seven action handlers (3 case-2 + 4 case-3, per D-A5.2), the overwrite-transform wrapper (D-A5.3), and the top-level `runConsentFlow` orchestrator that groups hits, sequentially prompts, dispatches actions, marks Finished, and audit-logs (D-A1, D-A3, D-A4, D-A6, D-A7).

Purpose: this is the single new module Phase 21 ships. Plans 02 (wiring) and 03 (tests) depend on the public exports landing here.

Output:
- `src/migrations/consent.ts` (new file, ~250-350 lines)
- `src/migrations/index.ts` (1-line re-export addition)

Invariants preserved:
- `src/notifications.ts` is NOT modified (D-A8.3).
- `src/migrations/evaluator.ts` is NOT modified (D-A3.5).
- All config writes go through `migrateScopedSetting` (MIGRATE-07; D-A5.1).
- No new package.json settings or commands.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/021-consent-ux-case-2-case-3-prompts/021-CONTEXT.md
@.planning/REQUIREMENTS.md
@AI_INSTRUCTIONS.md
@CLAUDE.md

<interfaces>
<!-- Extracted from existing source so the executor does not need to scavenger-hunt. -->

From src/migrations/types.ts (read-only — already shipped in Phase 19):
```typescript
export type MigrationCase = 1 | 2 | 3;
export type MigrationScope =
  | vscode.ConfigurationTarget.Global
  | vscode.ConfigurationTarget.Workspace
  | vscode.ConfigurationTarget.WorkspaceFolder;
export interface MigrationEntry {
  id: string;
  sourceNamespace: string;
  sourceKey: string;
  destNamespace: string;
  destKey: string;
  transform: (sourceVal: unknown, destValAtSameScope: unknown) => TransformResult<unknown>;
}
export const ALL_MIGRATION_SCOPES: readonly MigrationScope[];
```

From src/notifications.ts (DO NOT modify; primitive surface):
```typescript
export type TransformResult<T> =
  | { kind: 'value'; value: T; removeSource?: boolean }
  | { kind: 'skipDest'; removeSource: boolean };

export async function migrateScopedSetting<TSrc, TDest>(opts: {
  namespace: string;
  sourceKey: string;
  destNamespace?: string;
  destKey: string;
  wkspUri: vscode.Uri;
  transform: (sourceVal: TSrc, destValAtSameScope: TDest | undefined) => TransformResult<TDest>;
}): Promise<boolean>;
// NOTE: primitive auto-selects the most-specific scope where sourceVal exists.
// Phase 21 invokes the primitive once per (group × scope) pair; if a hit's
// scope is not the most-specific scope holding the source value, the primitive
// will still migrate the most-specific scope (W-02 limitation, acceptable —
// the evaluator will re-classify the remaining scopes next activation).
```

From src/migrations/completedMigrations.ts:
```typescript
export function isMigrationFinishedAtScope(id: string, scope: MigrationScope, wkspUri: vscode.Uri): boolean;
export async function markMigrationFinishedAtScope(id: string, scope: MigrationScope, wkspUri: vscode.Uri): Promise<void>;
```

From src/configuration.ts (singleton):
```typescript
export const config: { logger: { logInfo(message: string, wkspUri?: vscode.Uri): void; /* ... */ }, /* ... */ };
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create src/migrations/consent.ts with types, helpers, and message formatters</name>
  <files>src/migrations/consent.ts</files>

  <read_first>
    - .planning/phases/021-consent-ux-case-2-case-3-prompts/021-CONTEXT.md (full — locked design contract)
    - src/migrations/types.ts (MigrationEntry / MigrationScope / MigrationCase shapes)
    - src/migrations/completedMigrations.ts (markMigrationFinishedAtScope signature)
    - src/notifications.ts L120-L260 (migrateScopedSetting signature + TransformResult shape)
    - src/configuration.ts (config.logger.logInfo signature)
    - AI_INSTRUCTIONS.md (URI handling, error patterns)
  </read_first>

  <action>
Create the new file `src/migrations/consent.ts`. It must export EXACTLY these public symbols, with EXACTLY these signatures (verbatim copies from D-A8.1):

```typescript
import * as vscode from 'vscode';
import { config } from '../configuration';
import { migrateScopedSetting, type TransformResult } from '../notifications';
import { markMigrationFinishedAtScope } from './completedMigrations';
import type { MigrationEntry, MigrationScope } from './types';

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

export function formatCase2Message(entry: MigrationEntry, scopes: readonly MigrationScope[]): string { /* see body below */ }
export function formatCase3Message(entry: MigrationEntry, scopes: readonly MigrationScope[]): string { /* see body below */ }

export async function runConsentFlow(
  wkspUri: vscode.Uri,
  hits: readonly ConsentHit[],
  mode: MigrationMode,
): Promise<void> { /* implemented in Task 3 */ }
```

For this task, implement ONLY:
1. The imports above (vscode, config, migrateScopedSetting, TransformResult, markMigrationFinishedAtScope, MigrationEntry, MigrationScope).
2. All exported `type` / `interface` declarations (Case2Action, Case3Action, MigrationMode, ConsentHit) verbatim from D-A8.1.
3. `readMigrationMode` — body verbatim above (D-A4.1).
4. `friendlyScopeName` — body verbatim above (D-A6.2). Must be exhaustive over the three scopes; the `switch` should compile under `strict` mode (return in every branch).
5. `formatCase2Message(entry, scopes)` — returns the case-2 prompt body. Use this template (whitespace-stable):
```
`\`${entry.sourceNamespace}.${entry.sourceKey}\` is set ${joinScopes(scopes)} but \`${entry.destNamespace}.${entry.destKey}\` is not.\n\n` +
`- **Migrate & delete**: copy the legacy value to the canonical setting and clear the legacy entry.\n` +
`- **Migrate & keep**: copy the value but leave the legacy entry in place.\n` +
`- **Don't migrate**: skip this migration. The extension will stop reading the legacy fallback in a future version.`
```
6. `formatCase3Message(entry, scopes)` — returns the case-3 prompt body:
```
`Both \`${entry.sourceNamespace}.${entry.sourceKey}\` and \`${entry.destNamespace}.${entry.destKey}\` are set ${joinScopes(scopes)}.\n\n` +
`- **Overwrite & delete**: replace the canonical value with the legacy value and clear the legacy entry.\n` +
`- **Overwrite & keep**: replace the canonical value with the legacy value, keep the legacy entry.\n` +
`- **Keep canonical**: leave the canonical value, clear the legacy entry.\n` +
`- **Keep both**: leave both values untouched.`
```
7. A private helper `joinScopes(scopes: readonly MigrationScope[]): string` that joins friendly names with English conjunctions: 1 scope → `friendlyScopeName(s)`; 2 scopes → `"X and Y"`; 3+ scopes → `"X, Y, and Z"`. Used by both formatters.
8. Stub bodies (named exports only — bodies thrown / TODO acceptable here) for `runConsentFlow`. Use:
```typescript
export async function runConsentFlow(
  _wkspUri: vscode.Uri,
  _hits: readonly ConsentHit[],
  _mode: MigrationMode,
): Promise<void> {
  // Implemented in Task 3 of this plan.
  return;
}
```

Add a module-level doc-comment block at the top citing D-A1 / D-A3 / D-A4 / D-A6 / D-A7 / D-A8 by ID and explaining the collect-then-prompt design (≥ 10 lines, ≤ 30 lines).

No console statements. No `any` types except where TransformResult genericism forces it — when needed, prefer `unknown` and cast at boundaries.
  </action>

  <verify>
    <automated>npx eslint src/migrations/consent.ts --ext ts && npx tsc --noEmit -p tsconfig.json</automated>
  </verify>

  <acceptance_criteria>
    - File `src/migrations/consent.ts` exists.
    - `grep -c "^export type Case2Action = 'migrate-and-delete' | 'migrate-and-keep' | 'dont-migrate';" src/migrations/consent.ts` returns `1`.
    - `grep -c "^export type Case3Action =" src/migrations/consent.ts` returns `1`.
    - `grep -c "^export type MigrationMode = 'prompt' | 'migrate-and-delete' | 'migrate-and-keep' | 'skip';" src/migrations/consent.ts` returns `1`.
    - `grep -c "^export interface ConsentHit" src/migrations/consent.ts` returns `1`.
    - `grep -c "^export function readMigrationMode" src/migrations/consent.ts` returns `1`.
    - `grep -c "^export function friendlyScopeName" src/migrations/consent.ts` returns `1`.
    - `grep -c "^export function formatCase2Message" src/migrations/consent.ts` returns `1`.
    - `grep -c "^export function formatCase3Message" src/migrations/consent.ts` returns `1`.
    - `grep -c "^export async function runConsentFlow" src/migrations/consent.ts` returns `1`.
    - `grep -E "'globally'|'in this workspace'|'in this workspace folder'" src/migrations/consent.ts | grep -v '^#' | wc -l` ≥ `3` (all three friendly scope strings present).
    - `npx eslint src/migrations/consent.ts --ext ts` exits 0 with no output.
    - `npx tsc --noEmit -p tsconfig.json` exits 0.
  </acceptance_criteria>

  <done>The module file exists with all required public symbols, exhaustive `friendlyScopeName` switch, both message formatters returning strings shaped to the templates above, and a stub `runConsentFlow` that compiles. Lint and typecheck pass.</done>
</task>

<task type="auto">
  <name>Task 2: Implement the seven action handlers and the runOverwriteAtScope wrapper</name>
  <files>src/migrations/consent.ts</files>

  <read_first>
    - src/migrations/consent.ts (the file under construction — Task 1 output)
    - .planning/phases/021-consent-ux-case-2-case-3-prompts/021-CONTEXT.md § D-A5 (action → primitive mapping table, the source-of-truth) — pay particular attention to D-A5.4: "If one scope's write fails, log it and continue with the remaining scopes — partial completion is acceptable; the failing scope simply re-surfaces next activation."
    - src/migrations/evaluator.ts L100-L120 (reference call shape for migrateScopedSetting with `kind: 'skipDest'`)
    - src/notifications.ts L260-L295 (reference call shapes for migrateScopedSetting wrappers)
  </read_first>

  <action>
Add seven `async` private helpers and one wrapper to `src/migrations/consent.ts` BELOW the formatters and ABOVE `runConsentFlow`. Each helper takes `(entry, scope, wkspUri)` and returns `Promise<void>`.

**Critical contract (D-A5.4 compliance):** The five write-performing handlers (`runMigrateAndDelete`, `runMigrateAndKeep`, `runOverwriteAndDelete`, `runOverwriteAndKeep`, `runKeepCanonicalAndDeleteLegacy`) MUST mark Finished and emit the success audit-log line ONLY AFTER the underlying `migrateScopedSetting` (or `runOverwriteAtScope`) call resolves successfully. They MUST NOT use a `finally` block to mark Finished — exceptions must propagate so that Task 3's per-scope try/catch can log a `failed` line and the failing scope re-surfaces next activation (D-A5.4).

The two pure no-op handlers (`runDontMigrate`, `runKeepBoth`) have no primitive call that can fail, so they unconditionally `await markMigrationFinishedAtScope` and emit one `logInfo` line.

Implement EXACTLY the D-A5.2 mapping. Function names and bodies:

```typescript
// Case 2 actions
async function runMigrateAndDelete(entry: MigrationEntry, scope: MigrationScope, wkspUri: vscode.Uri): Promise<void> {
  // Success path only marks Finished + logs after the primitive resolves.
  // On primitive failure, the exception propagates to runConsentFlow's per-scope
  // try/catch (D-A5.4) — failing scope is NOT marked Finished.
  await migrateScopedSetting({
    namespace: entry.sourceNamespace,
    sourceKey: entry.sourceKey,
    destNamespace: entry.destNamespace,
    destKey: entry.destKey,
    wkspUri,
    transform: (src, dest) => {
      const r = entry.transform(src, dest);
      if (r.kind === 'value') return { kind: 'value', value: r.value, removeSource: true };
      return { kind: 'skipDest', removeSource: true };
    },
  });
  await markMigrationFinishedAtScope(entry.id, scope, wkspUri);
  config.logger.logInfo(`Migration ${entry.id}: migrate-and-delete at ${describeScope(scope)} — done.`, wkspUri);
}

async function runMigrateAndKeep(entry: MigrationEntry, scope: MigrationScope, wkspUri: vscode.Uri): Promise<void> {
  await migrateScopedSetting({
    namespace: entry.sourceNamespace,
    sourceKey: entry.sourceKey,
    destNamespace: entry.destNamespace,
    destKey: entry.destKey,
    wkspUri,
    transform: (src, dest) => {
      const r = entry.transform(src, dest);
      if (r.kind === 'value') return { kind: 'value', value: r.value, removeSource: false };
      return { kind: 'skipDest', removeSource: false };
    },
  });
  await markMigrationFinishedAtScope(entry.id, scope, wkspUri);
  config.logger.logInfo(`Migration ${entry.id}: migrate-and-keep at ${describeScope(scope)} — done.`, wkspUri);
}

async function runDontMigrate(entry: MigrationEntry, scope: MigrationScope, wkspUri: vscode.Uri): Promise<void> {
  // No primitive call; pure no-op write semantically. Always marks Finished.
  await markMigrationFinishedAtScope(entry.id, scope, wkspUri);
  config.logger.logInfo(`Migration ${entry.id}: dont-migrate at ${describeScope(scope)} — done.`, wkspUri);
}

// Case 3 actions
async function runOverwriteAndDelete(entry: MigrationEntry, scope: MigrationScope, wkspUri: vscode.Uri): Promise<void> {
  await runOverwriteAtScope(entry, scope, wkspUri, /* removeSource */ true);
  await markMigrationFinishedAtScope(entry.id, scope, wkspUri);
  config.logger.logInfo(`Migration ${entry.id}: overwrite-and-delete at ${describeScope(scope)} — done.`, wkspUri);
}

async function runOverwriteAndKeep(entry: MigrationEntry, scope: MigrationScope, wkspUri: vscode.Uri): Promise<void> {
  await runOverwriteAtScope(entry, scope, wkspUri, /* removeSource */ false);
  await markMigrationFinishedAtScope(entry.id, scope, wkspUri);
  config.logger.logInfo(`Migration ${entry.id}: overwrite-and-keep at ${describeScope(scope)} — done.`, wkspUri);
}

async function runKeepCanonicalAndDeleteLegacy(entry: MigrationEntry, scope: MigrationScope, wkspUri: vscode.Uri): Promise<void> {
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

async function runKeepBoth(entry: MigrationEntry, scope: MigrationScope, wkspUri: vscode.Uri): Promise<void> {
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
      if (r.kind === 'value') return { kind: 'value', value: r.value, removeSource };
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
```

Notes:
- Audit-log strings use the raw VS Code scope names (D-A6.3) via `describeScope`, NOT the friendly names.
- **No `try/finally` in any handler.** Failures bubble up to the caller. The orchestrator (Task 3) owns per-scope failure logging.
- All seven handlers MUST call `markMigrationFinishedAtScope` exactly once — and ONLY on the success path. The five write-performing handlers reach that call only if their primitive `await` resolved. The two no-op handlers reach it unconditionally.
- Do NOT export any of the seven handlers or `runOverwriteAtScope` or `describeScope` — they are module-internal.
- Do NOT widen the public surface beyond what Task 1 exports.

Run `npx eslint src --ext ts` and fix any warnings before finishing.
  </action>

  <verify>
    <automated>npx eslint src --ext ts && npx tsc --noEmit -p tsconfig.json</automated>
  </verify>

  <acceptance_criteria>
    - `grep -c "^async function runMigrateAndDelete" src/migrations/consent.ts` returns `1`.
    - `grep -c "^async function runMigrateAndKeep" src/migrations/consent.ts` returns `1`.
    - `grep -c "^async function runDontMigrate" src/migrations/consent.ts` returns `1`.
    - `grep -c "^async function runOverwriteAndDelete" src/migrations/consent.ts` returns `1`.
    - `grep -c "^async function runOverwriteAndKeep" src/migrations/consent.ts` returns `1`.
    - `grep -c "^async function runKeepCanonicalAndDeleteLegacy" src/migrations/consent.ts` returns `1`.
    - `grep -c "^async function runKeepBoth" src/migrations/consent.ts` returns `1`.
    - `grep -c "^async function runOverwriteAtScope" src/migrations/consent.ts` returns `1`.
    - `grep -c "markMigrationFinishedAtScope(entry.id, scope, wkspUri)" src/migrations/consent.ts` ≥ `7` (one per handler, success path only).
    - `grep -c "config.logger.logInfo(" src/migrations/consent.ts` ≥ `7` (one success audit line per handler).
    - **D-A5.4 enforcement:** `grep -nE "^\s*\} finally \{" src/migrations/consent.ts | grep -v '^#' | wc -l` returns `0` — NO handler uses `finally` to mark Finished. (`runConsentFlow` in Task 3 may still introduce a `try/catch` around per-scope dispatch — but not `finally`.)
    - `grep -c "entry.transform(src, undefined)" src/migrations/consent.ts` ≥ `1` (D-A5.3 overwrite semantic present in `runOverwriteAtScope`).
    - None of the seven handler names or `runOverwriteAtScope`/`describeScope` are preceded by `export ` (grep `^export.*(runMigrateAnd|runDontMigrate|runOverwrite|runKeep|describeScope)` returns 0).
    - `npx eslint src --ext ts` exits 0 with no output.
    - `npx tsc --noEmit -p tsconfig.json` exits 0.
  </acceptance_criteria>

  <done>All seven action handlers and the overwrite wrapper exist with the exact D-A5.2 semantics. Every handler marks Finished and emits one audit log line ONLY on the success path (no `finally` blocks). Failures propagate to the orchestrator. Lint and typecheck pass.</done>
</task>

<task type="auto">
  <name>Task 3: Implement runConsentFlow orchestrator (grouping + dispatch + dismissal)</name>
  <files>src/migrations/consent.ts, src/migrations/index.ts</files>

  <read_first>
    - src/migrations/consent.ts (current state — Tasks 1 and 2)
    - .planning/phases/021-consent-ux-case-2-case-3-prompts/021-CONTEXT.md § D-A1, D-A2, D-A3, D-A4, D-A5.4, D-A6, D-A7 (grouping, button labels, sequential await, mode dispatch, per-scope failure semantics, audit log, dismissal)
    - src/migrations/index.ts (current re-export surface)
  </read_first>

  <action>
**Part A — implement `runConsentFlow` in `src/migrations/consent.ts`.** Replace the stub from Task 1 with a real implementation. Algorithm:

1. **Build groups.** Group `hits` by the tuple `(entry.id, case)`. Use a `Map<string, { entry, case, scopes: MigrationScope[] }>` where the key is `` `${entry.id}::${case}` ``. Append `scope` to the matching group's `scopes` array. After grouping, sort the groups deterministically: by `entry.id` ascending, then by `case` ascending (case 2 before case 3) — D-specifics: see § "Specific Ideas" tie-break ordering.
2. **Sequentially process each group.** Use a plain `for (const group of sortedGroups) { await processGroup(group); }` loop (D-A3.3 sequential).
3. **For each group:**
   - **Case 2 + mode != 'prompt'** (silent path, D-A4.2 / CONSENT-06):
     - If `mode === 'migrate-and-delete'`: for each `scope` in `group.scopes` (sequential), wrap `await runMigrateAndDelete(group.entry, scope, wkspUri)` in its own try/catch per D-A5.4 (see step below).
     - If `mode === 'migrate-and-keep'`: same but `runMigrateAndKeep`.
     - If `mode === 'skip'`: for each scope, `await markMigrationFinishedAtScope(...)` AND emit `config.logger.logInfo(\`Migration ${entry.id}: skip at ${describeScope(scope)} — done.\`, wkspUri)`. Do NOT run any migration action.
   - **Case 2 + mode === 'prompt'** OR **Case 3** (any mode — D-A4.3):
     - Build the message via `formatCase2Message(entry, group.scopes)` or `formatCase3Message`.
     - Build the button label array (D-A2.2 / D-A2.3, verbatim strings — these are pinned by tests):
       - Case 2: `['Migrate & delete', 'Migrate & keep', "Don't migrate"]`
       - Case 3: `['Overwrite & delete', 'Overwrite & keep', 'Keep canonical', 'Keep both']`
     - Show via `await vscode.window.showInformationMessage(message, { modal: false }, ...buttons)`.
     - On `undefined` return (dismissal, D-A7.1): emit ONE audit log line `\`Migration ${entry.id}: dismissed at ${group.scopes.map(describeScope).join(', ')} — will re-surface next activation.\`` and `continue` (NO markFinished, NO action — D-A7.1).
     - On a returned label: map label → handler and run sequentially over `group.scopes`:
       - `'Migrate & delete'` → `runMigrateAndDelete`
       - `'Migrate & keep'` → `runMigrateAndKeep`
       - `"Don't migrate"` → `runDontMigrate`
       - `'Overwrite & delete'` → `runOverwriteAndDelete`
       - `'Overwrite & keep'` → `runOverwriteAndKeep`
       - `'Keep canonical'` → `runKeepCanonicalAndDeleteLegacy`
       - `'Keep both'` → `runKeepBoth`
   - **D-A5.4 per-scope failure handling (applies to BOTH the silent and prompted dispatch loops):** wrap each per-scope handler invocation in its own `try/catch`. On `catch`:
     ```typescript
     config.logger.logInfo(`Migration ${entry.id}: action at ${describeScope(scope)} failed: ${e}`, wkspUri);
     ```
     Then `continue` to the next scope. Do NOT abort the group. The failing scope is NOT marked Finished (the handler threw before reaching `markMigrationFinishedAtScope`), so it will re-surface on the next activation per D-A5.4.
4. The function returns `Promise<void>`. It never throws to its caller (the activation site uses `void runConsentFlow(...)` fire-and-forget).

Add a documentation comment immediately above `runConsentFlow` (≥ 15 lines) summarising: grouping rule (D-A1.1/1.2), uniform-per-group action (D-A1.3), sequential await (D-A3.3), mode dispatch (D-A4), per-scope failure recovery (D-A5.4), dismissal semantics (D-A7), audit logging (D-A6.1).

**Part B — update `src/migrations/index.ts`.** Add ONE re-export line at the bottom (keep existing exports untouched):

```typescript
export { runConsentFlow, readMigrationMode } from './consent';
export type { Case2Action, Case3Action, MigrationMode, ConsentHit } from './consent';
```

After both parts, run `npx eslint src --ext ts` and `npm run test:unit` to ensure nothing existing regressed. Fix any warnings.
  </action>

  <verify>
    <automated>npx eslint src --ext ts && npx tsc --noEmit -p tsconfig.json && npm run test:unit</automated>
  </verify>

  <acceptance_criteria>
    - `runConsentFlow` body is no longer a stub: `grep -c "Implemented in Task 3" src/migrations/consent.ts` returns `0`.
    - All seven button-label strings appear verbatim in `src/migrations/consent.ts`:
      - `grep -c "'Migrate & delete'" src/migrations/consent.ts` ≥ `1`
      - `grep -c "'Migrate & keep'" src/migrations/consent.ts` ≥ `1`
      - `grep -c "\"Don't migrate\"" src/migrations/consent.ts` ≥ `1`
      - `grep -c "'Overwrite & delete'" src/migrations/consent.ts` ≥ `1`
      - `grep -c "'Overwrite & keep'" src/migrations/consent.ts` ≥ `1`
      - `grep -c "'Keep canonical'" src/migrations/consent.ts` ≥ `1`
      - `grep -c "'Keep both'" src/migrations/consent.ts` ≥ `1`
    - `grep -c "showInformationMessage" src/migrations/consent.ts` ≥ `1`.
    - `grep -E "dismissed at .*will re-surface next activation" src/migrations/consent.ts | grep -v '^#' | wc -l` ≥ `1` (dismissal audit phrasing present — D-A7.1).
    - `grep -c "skip at " src/migrations/consent.ts` ≥ `1` (skip-mode audit log path — D-A4.2).
    - `grep -E "action at .*failed:" src/migrations/consent.ts | grep -v '^#' | wc -l` ≥ `1` (D-A5.4 per-scope failure logging present in orchestrator).
    - `grep -c "export { runConsentFlow" src/migrations/index.ts` returns `1`.
    - `grep -c "export type { Case2Action" src/migrations/index.ts` returns `1`.
    - `npx eslint src --ext ts` exits 0 with no output.
    - `npx tsc --noEmit -p tsconfig.json` exits 0.
    - `npm run test:unit` exits 0 (existing tests still pass — orchestrator hasn't broken any prior coverage).
  </acceptance_criteria>

  <done>`runConsentFlow` groups by (entry, case), dispatches the seven actions per the verbatim D-A2.2/D-A2.3 button labels, handles dismissal as a logged no-op, honours `migrationMode` for case 2 silent paths, ignores `migrationMode` for case 3, and wraps each per-scope handler call in its own try/catch (D-A5.4) so failures are logged and the loop continues without marking the failing scope Finished. The index re-exports the new public surface. Lint, typecheck, and the existing unit suite all pass.</done>
</task>

</tasks>

<verification>
- File `src/migrations/consent.ts` compiles standalone and via the project tsconfig.
- File `src/migrations/index.ts` exposes `runConsentFlow` / `readMigrationMode` / `ConsentHit` / `MigrationMode` flat.
- No handler in `src/migrations/consent.ts` uses a `finally` block to mark Finished — failures propagate per D-A5.4.
- Existing unit suite (`npm run test:unit`) remains green — no regressions introduced.
- `src/notifications.ts` and `src/migrations/evaluator.ts` are byte-identical to pre-plan state (`git diff --stat src/notifications.ts src/migrations/evaluator.ts` reports zero lines changed).
- ESLint passes cleanly on `src/migrations/consent.ts`.
</verification>

<success_criteria>
- All requirements covered: CONSENT-01 (collect-then-prompt), CONSENT-02 (3 case-2 buttons), CONSENT-03 (4 case-3 buttons always), CONSENT-04 (dismissal re-surfaces), CONSENT-06 (case 2 silent under non-prompt modes), MIGRATE-05 (3 case-2 actions via primitive), MIGRATE-06 (4 case-3 actions via primitive).
- The module is self-contained (no edits to `evaluator.ts` or `notifications.ts`).
- Public surface stable for Plan 02 (wiring) and Plan 03 (tests).
</success_criteria>

<output>
After completion, create `.planning/phases/021-consent-ux-case-2-case-3-prompts/021-01-consent-module-SUMMARY.md`.
</output>
