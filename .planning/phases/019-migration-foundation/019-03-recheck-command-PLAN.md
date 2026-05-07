---
phase: 019-migration-foundation
plan: 03
type: execute
wave: 2
depends_on: [019-01, 019-02]
files_modified:
  - package.json
  - src/extension.ts
  - src/migrations/recheckCommand.ts
  - src/migrations/index.ts
  - test/unit/migrations.test.ts
autonomous: true
requirements: [CONSENT-09, TEST-05]
must_haves:
  truths:
    - "The command *Behave BDD: Recheck Migrations* appears in the VS Code command palette."
    - "Invoking the command shows a quick-pick with Global / Workspace / Workspace Folder (D-06), filtering scopes the user cannot write to (D-07)."
    - "After picking a scope, `gs-behave-bdd.completedMigrations` is cleared (written as `[]`) at that scope (D-08), and the migration scan re-runs via the same evaluator path activation uses (D-08 — no parallel rescan path)."
    - "Cancelling the quick-pick (Esc / dismiss) leaves `completedMigrations` untouched."
  artifacts:
    - path: "package.json"
      provides: "Command contribution `gs-behave-bdd.recheckMigrations` with title 'Behave BDD: Recheck Migrations'"
      contains: "gs-behave-bdd.recheckMigrations"
    - path: "src/migrations/recheckCommand.ts"
      provides: "recheckMigrationsCommandHandler — quick-pick scope picker + clear + rescan"
      exports: ["recheckMigrationsCommandHandler"]
    - path: "src/extension.ts"
      provides: "vscode.commands.registerCommand wiring"
      pattern: "gs-behave-bdd\\.recheckMigrations"
    - path: "test/unit/migrations.test.ts"
      provides: "Unit tests for the command handler (TEST-05)"
  key_links:
    - from: "package.json contributes.commands"
      to: "src/extension.ts registerCommand"
      via: "command id 'gs-behave-bdd.recheckMigrations'"
      pattern: "gs-behave-bdd\\.recheckMigrations"
    - from: "src/migrations/recheckCommand.ts"
      to: "src/migrations/evaluator.ts evaluateAllMigrations"
      via: "import + invoke after clearing completedMigrations"
      pattern: "evaluateAllMigrations"
---

<objective>
Ship the *Behave BDD: Recheck Migrations* command (CONSENT-09). The command shows a `vscode.window.showQuickPick` of writeable scopes (Global / Workspace / Workspace Folder per D-06, filtered by D-07), clears `gs-behave-bdd.completedMigrations` at the chosen scope, and re-runs `evaluateAllMigrations` for the active workspace folder (D-08).

Phase 19's empty registry (D-05) means invoking the command in Phase 19 produces no prompts. Phase 20 populates the registry; from Phase 21 onward, the command becomes user-visible.

Purpose: Closes CONSENT-09 and TEST-05.
Output: A new `package.json` command contribution, a handler module under `src/migrations/`, the registerCommand wiring in `src/extension.ts`, and unit tests covering the quick-pick + clear + rescan flow.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/019-migration-foundation/019-CONTEXT.md
@.planning/phases/019-migration-foundation/019-01-settings-registration-PLAN.md
@.planning/phases/019-migration-foundation/019-02-evaluator-PLAN.md
@CLAUDE.md
@AI_INSTRUCTIONS.md

<interfaces>
<!-- Plan 02 added evaluateAllMigrations + ALL_MIGRATION_SCOPES; this plan consumes them. -->

From src/migrations/index.ts (Plan 02 surface):
```typescript
export type { MigrationEntry, MigrationCase, MigrationScope } from './types';
export { ALL_MIGRATION_SCOPES } from './types';
export { MIGRATION_REGISTRY } from './registry';
export { isMigrationFinishedAtScope, markMigrationFinishedAtScope } from './completedMigrations';
export { evaluateMigration, evaluateAllMigrations } from './evaluator';
export type { EvaluatorHooks, EvaluationResult } from './evaluator';
```

From src/extension.ts (existing pattern for command registration, lines 427-449):
```typescript
context.subscriptions.push(
  vscode.commands.registerCommand('gs-behave-bdd.openOutput', () => { ... }),
  vscode.commands.registerCommand('gs-behave-bdd.stepReferences.prev', prevStepReferenceHandler),
  vscode.commands.registerCommand('gs-behave-bdd.stepReferences.next', nextStepReferenceHandler),
  // ...
);
```

From package.json (existing command contribution pattern, lines 125-153):
```json
{
  "command": "gs-behave-bdd.selectProject",
  "title": "Behave BDD: Select Active Project"
}
```

VS Code API for scope-availability detection:
- Workspace scope is writeable iff `vscode.workspace.workspaceFile !== undefined` (i.e. user opened a `.code-workspace`).
- WorkspaceFolder scope is writeable iff `vscode.workspace.workspaceFolders` is non-empty.
- Global is always writeable.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement recheckMigrationsCommandHandler with scope quick-pick</name>
  <read_first>
    - C:\code\gs-behave-bdd\src\migrations\index.ts (Plan 02 barrel; confirm `evaluateAllMigrations`, `ALL_MIGRATION_SCOPES`, and `markMigrationFinishedAtScope` are exported as expected)
    - C:\code\gs-behave-bdd\src\migrations\completedMigrations.ts (Plan 02 — we need to write `[]` at a scope; either reuse `markMigrationFinishedAtScope` machinery or call `cfg.update(..., [], target)` directly. Design choice documented in <action>.)
    - C:\code\gs-behave-bdd\.planning\phases\019-migration-foundation\019-CONTEXT.md (D-06 quick-pick shape; D-07 unwriteable-scope filtering; D-08 reuse evaluator)
    - C:\code\gs-behave-bdd\src\extension.ts lines 427-460 (existing registerCommand pattern; understand how handlers are imported and how `context.subscriptions.push` is called)
    - C:\code\gs-behave-bdd\test\unit\notifications.test.ts (existing patterns for stubbing `vscode.window.showQuickPick` and `vscode.workspace.workspaceFile` / `workspaceFolders`)
    - C:\code\gs-behave-bdd\test\unit\vscode.mock.ts (confirm `window.showQuickPick`, `workspace.workspaceFile`, `workspace.workspaceFolders` mocks; extend ONLY if absolutely required and document the deviation per CLAUDE.md / AI_INSTRUCTIONS.md)
  </read_first>
  <files>src/migrations/recheckCommand.ts, src/migrations/index.ts, test/unit/migrations.test.ts</files>
  <behavior>
    Test 4.1: With `vscode.workspace.workspaceFile === undefined` and `workspaceFolders` length 1, the quick-pick is shown with exactly TWO items: "Global" and "Workspace Folder" (Workspace filtered out per D-07).
    Test 4.2: With `vscode.workspace.workspaceFile` set (a `.code-workspace` is open) AND a workspace folder present, the quick-pick shows all THREE items (Global, Workspace, Workspace Folder).
    Test 4.3: With NO workspace folders open (`workspaceFolders === undefined`), the quick-pick shows only "Global"; the handler short-circuits without calling the evaluator if the user picks Global (no wkspUri to evaluate).
    Test 4.4: When user cancels the quick-pick (Esc — `showQuickPick` resolves to `undefined`), the handler returns immediately; `cfg.update("completedMigrations", ...)` is NOT called and `evaluateAllMigrations` is NOT invoked.
    Test 4.5: When user picks "Global", the handler calls `cfg.update("completedMigrations", [], vscode.ConfigurationTarget.Global)` exactly once, then calls `evaluateAllMigrations(wkspUri, undefined)` for each workspace folder.
    Test 4.6: When user picks "Workspace Folder" with one workspace folder, the handler writes `[]` at `ConfigurationTarget.WorkspaceFolder` for that folder's URI, then calls `evaluateAllMigrations(wkspUri)` for that folder.
    Test 4.7: When user picks "Workspace" (only available when workspaceFile is set), the handler writes `[]` at `ConfigurationTarget.Workspace`.
    Test 4.8: On `update()` rejection, the handler logs via `config.logger.logInfo` and returns normally — the rescan is NOT attempted (we don't want to re-prompt against a stale cleared state).
    Test 4.9: With the empty Phase 19 registry (D-05), the post-clear evaluator pass returns `[]` and the handler completes without invoking any prompt UX (Phase 19 infrastructure-only contract).
  </behavior>
  <action>
    **File 1 — `src/migrations/recheckCommand.ts`**: Export an async handler:
    ```typescript
    import * as vscode from 'vscode';
    import { config } from '../configuration';
    import { evaluateAllMigrations, EvaluatorHooks } from './evaluator';

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
        if (!pick) return; // user dismissed (Test 4.4)

        // D-08: clear at the chosen scope, then run the standard evaluator path.
        // The wkspUri we use for the cfg.update() and for evaluateAllMigrations
        // is the active folder when scope is workspaceFolder; for global/workspace
        // we still need *some* wkspUri to satisfy getConfiguration(ns, wkspUri),
        // and any folder works since the per-scope target controls the actual write.
        const targetWkspUri = folders && folders.length > 0 ? folders[0].uri : undefined;

        try {
          const cfg = vscode.workspace.getConfiguration('gs-behave-bdd', targetWkspUri);
          await cfg.update('completedMigrations', [], pick.target);
        } catch (e) {
          config.logger.logInfo(`recheckMigrations: clear at ${pick.scopeId} failed: ${e}`, targetWkspUri);
          return; // Test 4.8: don't re-evaluate against a stale cleared state.
        }

        // D-08: reuse the activation-time evaluator path. Loop folders so each
        // workspace folder's WorkspaceFolder-scope state is re-classified.
        if (folders) {
          for (const folder of folders) {
            await evaluateAllMigrations(folder.uri, hooks);
          }
        }
        // (If no folders are open, there is nothing to evaluate — Test 4.3.)
      } catch (e) {
        // Defense in depth — never throw out of a command handler.
        config.logger.showError(e, undefined);
      }
    }
    ```

    **File 2 — extend `src/migrations/index.ts`** to re-export `recheckMigrationsCommandHandler`.

    **File 3 — `test/unit/migrations.test.ts`**: append tests 4.1-4.9. Stub `vscode.window.showQuickPick`, `vscode.workspace.workspaceFile`, `vscode.workspace.workspaceFolders`, and `vscode.workspace.getConfiguration().update` via Sinon. If the existing `vscode.mock.ts` lacks `workspace.workspaceFile`, add it as a mock-only deviation per Phase 15 Plan 02 precedent and document it in the plan summary.

    Implementation notes:
    - The handler is exported so unit tests can drive it directly without going through the registerCommand flow (mirrors the Phase 15 `migrateLegacySuppressMultiConfig` direct-import pattern from RESEARCH.md Open Question 3).
    - Per D-08 we deliberately do NOT invent a parallel rescan path — `evaluateAllMigrations` is the single rescan entry point, called the same way activation will (eventually) call it.
    - Per Phase 19 contract: NOT called from `activate()` yet. Wiring lives in Task 2 of this plan (registerCommand only — no activation-time evaluator invocation).
  </action>
  <verify>
    <automated>npm run test:unit -- --grep "recheckMigrations|recheckMigrationsCommandHandler"</automated>
  </verify>
  <acceptance_criteria>
    - All 9 Task 1 tests pass.
    - Grep `vscode\.window\.showQuickPick` inside `src/migrations/recheckCommand.ts` returns exactly 1 hit.
    - Grep `evaluateAllMigrations` inside `src/migrations/recheckCommand.ts` returns exactly 1 hit (D-08 — single rescan path).
    - Grep `cfg\.update\("completedMigrations"` (or equivalent regex `update\(['"]completedMigrations['"]` non-comment) inside `src/migrations/recheckCommand.ts` returns exactly 1 hit.
    - `npx eslint src --ext ts` exits 0.
    - `npm run test:unit` reports 0 failures (full suite).
  </acceptance_criteria>
  <done>The handler exists, is exported via the migrations barrel, and is fully exercised by 9 unit tests.</done>
</task>

<task type="auto">
  <name>Task 2: Wire the command in package.json and src/extension.ts</name>
  <read_first>
    - C:\code\gs-behave-bdd\package.json lines 125-153 (existing `commands` array; add the new entry alphabetically — after `gs-behave-bdd.openOutput` if present, otherwise grouped with the other gs-behave-bdd commands)
    - C:\code\gs-behave-bdd\src\extension.ts lines 427-449 (existing `registerCommand` invocations inside the `context.subscriptions.push(...)` block — append the new handler alongside)
    - C:\code\gs-behave-bdd\src\migrations\recheckCommand.ts (Task 1 of this plan)
    - C:\code\gs-behave-bdd\src\extension.ts top imports (line 42) — confirm the import-style for handler modules; we will add `import { recheckMigrationsCommandHandler } from './migrations';`
  </read_first>
  <files>package.json, src/extension.ts, test/unit/packageJsonSchema.test.ts</files>
  <behavior>
    Schema test 5.1: `package.json` `contributes.commands` contains exactly one entry where `command === "gs-behave-bdd.recheckMigrations"` and `title === "Behave BDD: Recheck Migrations"` (CONSENT-09 wording — appears in the command palette).
    Structural test 5.2 (added to test/unit/packageJsonSchema.test.ts or a new structural test file — pick the existing one to minimize file churn): `src/extension.ts` source contains the literal string `'gs-behave-bdd.recheckMigrations'` exactly once and that occurrence is inside a `vscode.commands.registerCommand` invocation. Use a substring assertion + `indexOf` ordering check, mirroring the Phase 15 Plan 05 activation-ordering structural test pattern.
  </behavior>
  <action>
    **package.json** — add to `contributes.commands` (place alphabetically/logically with the other `gs-behave-bdd.*` commands, e.g. after `gs-behave-bdd.openOutput`):
    ```json
    {
      "command": "gs-behave-bdd.recheckMigrations",
      "title": "Behave BDD: Recheck Migrations"
    }
    ```

    **src/extension.ts** — at the top, extend the existing import from `'./notifications'` block; add a new import:
    ```typescript
    import { recheckMigrationsCommandHandler } from './migrations';
    ```

    Inside the existing `context.subscriptions.push(...)` block that already registers `gs-behave-bdd.openOutput` and friends (around lines 427-449), append:
    ```typescript
    vscode.commands.registerCommand('gs-behave-bdd.recheckMigrations', () => recheckMigrationsCommandHandler()),
    ```

    Per Phase 19 boundary, do NOT call `evaluateAllMigrations` from `activate()` yet — that activation-time wiring lands in Phase 21 alongside the prompt UX.

    **test/unit/packageJsonSchema.test.ts** (or create a new section/describe block within the same file) — add 5.1 + 5.2.
  </action>
  <verify>
    <automated>npm run test:unit -- --grep "recheckMigrations|packageJsonSchema"</automated>
  </verify>
  <acceptance_criteria>
    - `node -e "const p=require('./package.json'); const c=p.contributes.commands.find(x=>x.command==='gs-behave-bdd.recheckMigrations'); if(!c||c.title!=='Behave BDD: Recheck Migrations') process.exit(1)"` exits 0.
    - Grep `gs-behave-bdd\.recheckMigrations` in `src/extension.ts` returns exactly 1 hit (excluding comments — verify with `grep -v '^\s*//' src/extension.ts | grep -c "gs-behave-bdd\.recheckMigrations"` returning 1).
    - `npx eslint src --ext ts` exits 0.
    - `npm run test:unit` reports 0 failures.
    - `npx webpack` (production build) succeeds — bundle smoke check, mirrors Phase 15 Plan 06 verification gate practice.
  </acceptance_criteria>
  <done>The command palette entry exists in `package.json`, the registerCommand call is wired in `src/extension.ts`, schema tests pin the contribution, and the production webpack build succeeds.</done>
</task>

</tasks>

<verification>
- `npm run test:unit` reports 0 failures with ≥11 new tests (9 from Task 1 + 2 from Task 2).
- `npx eslint src --ext ts` exits 0.
- `npx webpack` succeeds.
- Manually invoking the command via the palette in a real VS Code instance is deferred to Phase 22 integration testing.
</verification>

<success_criteria>
Phase 19 success criterion #3 satisfied: *Behave BDD: Recheck Migrations* appears in the command palette and, when invoked, clears `completedMigrations` for the chosen writeable scope and re-runs the scan via `evaluateAllMigrations`.
</success_criteria>

<output>
After completion, create `.planning/phases/019-migration-foundation/019-03-SUMMARY.md` summarising the command wiring, the quick-pick UX choice (D-06/D-07), the test count delta, and any vscode.mock.ts deviations introduced.
</output>
