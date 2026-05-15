---
phase: 023
plan_number: 4
slug: surface-swap
status: planned
depends_on: [1, 2, 3]
files_modified:
  - src/migrations/consent.ts
  - src/migrations/codeActions.ts
  - src/migrations/diagnostics.ts
  - src/migrations/index.ts
  - src/extension.ts
  - test/unit/migrations/diagnostics.test.ts
requirements:
  - PANEL-05-TOAST-WIRE
  - REMOVAL-01-DIAGNOSTICS
  - REMOVAL-02-CODE-ACTION-PROVIDER
must_haves:
  truths:
    - "The summary toast on activation has a single button labeled `Open Migrations Panel`; clicking it opens the panel."
    - "No file in `src/` imports `publishConsentDiagnostics`, `clearDiagnosticsForEntryAtScope`, `MigrationCodeActionProvider`, `MIGRATION_DIAG_SOURCE`, `resolveAnchorUri`, `computeRange`, `decodeDiagnosticCode`, `getDiagnosticCollection`, or `disposeDiagnosticCollection`."
    - "`src/migrations/diagnostics.ts` is deleted from the repo."
    - "`MigrationCodeActionProvider`, `registerCodeActionsProvider(...)` for migration kinds, and `getDiagnosticCollection()` are removed from `extension.ts` activation subscriptions."
    - "`dispatchMigrationAction` no longer calls `clearDiagnosticsForEntryAtScope` (the panel re-render replaces it)."
    - "Each of the 7 action handlers in `consent.ts` no longer calls `clearDiagnosticsForEntryAtScope`."
    - "`test/unit/migrations/diagnostics.test.ts` is deleted."
  artifacts:
    - path: "src/migrations/consent.ts"
      provides: "Updated runConsentFlow with single-button toast → openMigrationsPanel; no diagnostic imports/calls"
    - path: "src/migrations/codeActions.ts"
      provides: "Slimmed module exporting only MIGRATION_ACTION_COMMAND, MigrationActionArgs, dispatchMigrationAction, runActionHandler"
    - path: "src/migrations/index.ts"
      provides: "Pruned barrel — only Webview-era surface exported"
  key_links:
    - from: "consent.ts toast handler"
      to: "gs-behave-bdd.openMigrationsPanel command"
      via: "vscode.commands.executeCommand on user click"
      pattern: "openMigrationsPanel"
    - from: "extension.ts subscriptions"
      to: "no diagnostics / no CodeActionProvider"
      via: "deletion"
      pattern: "MigrationCodeActionProvider|getDiagnosticCollection"
---

## Goal

Swap the entire migration UX surface from "Problems pane diagnostics + Code
Actions + summary toast with Problems/Settings buttons" to "summary toast →
open Migrations Panel". Delete every artifact of the diagnostics surface that
the prior consent-diagnostics quick-task chain (260513-oh5 → 260514-ean)
introduced. After this plan, the panel from 023-01..03 is the sole UI for
case-2 / case-3 migrations.

## Why this plan exists

This is the destructive half of the phase — by the end of 023-03 we have a
working panel sitting alongside a working diagnostics surface. Leaving both
shipped would create two competing UIs telling the user different things when
they disagree. We delete the diagnostics surface in a focused plan so the diff
is self-contained, the test impact is visible, and the rollback story is a
clean revert if anything regresses.

## Decisions settled in this plan

No new design decisions. This plan executes the deletion inventory from
023-PATTERNS §"Deletion Surface — Reference Inventory" and rewires the toast
per CONTEXT.md §"What the panel owns".

## Tasks

### Task 1 — `consent.ts`: rewire the summary toast + strip diagnostic calls

Modify `src/migrations/consent.ts`:

- Delete the import line for diagnostics (line 27):
  ```ts
  import { clearDiagnosticsForEntryAtScope, computeRange, publishConsentDiagnostics, resolveAnchorUri } from './diagnostics';
  ```
- Remove the `clearDiagnosticsForEntryAtScope(entry, scope);` line from each of
  the 7 action handlers (`runMigrateAndDelete`, `runMigrateAndKeep`,
  `runDontMigrate`, `runOverwriteAndDelete`, `runOverwriteAndKeep`,
  `runKeepCanonicalAndDeleteLegacy`, `runKeepBoth`) and from the silent
  `processCase2Silent` `skip` branch (line 354).
- Rewrite the "Publish diagnostics + summary toast" block (lines 312-330) to:
  ```ts
  if (promptBoundHits.length > 0) {
    const n = promptBoundHits.length;
    const message = `${n} ${n === 1 ? 'setting' : 'settings'} can be migrated for Behave BDD`;
    void vscode.window
      .showInformationMessage(message, 'Open Migrations Panel')
      .then(choice => handleSummaryToastChoice(choice, wkspUri));
  }
  ```
  Note: `promptBoundHits` is no longer needed past the count check — the panel
  re-evaluates from scratch when it opens. The `firstHit` parameter goes away.
- Rewrite `handleSummaryToastChoice` to a one-liner:
  ```ts
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
  ```

What NOT to do:

- Do NOT change `runConsentFlow`'s public signature, grouping logic, silent
  case-2 dispatch, dismissal logging, or `config.reloadSettings` call. Only
  the diagnostic-publish block and the toast button set change.
- Do NOT remove the `void runConsentFlow(...)` fire-and-forget call at the
  activation site — orchestration is unchanged.

### Task 2 — `codeActions.ts`: slim down

Modify `src/migrations/codeActions.ts`:

- Delete `MigrationCodeActionProvider` class entirely (lines 61-99).
- Delete `resolveWkspUriForDispatch` (lines 112-122) — only the provider used it.
- Delete imports of `MIGRATION_DIAG_SOURCE`, `clearDiagnosticsForEntryAtScope`,
  `decodeDiagnosticCode` from `./diagnostics` (lines 15-19).
- Remove the `clearDiagnosticsForEntryAtScope(entry, args.scope);` call inside
  `dispatchMigrationAction` (line 148) — its replacement is the panel's
  `_refresh()` from 023-02.
- Note the `CASE_2_LABELS` / `CASE_3_LABELS` re-exports added in 023-02
  Task 4 — those can now be deleted too, since the provider that consumed
  them is gone. `panelViewModel.ts` keeps its `CASE_2_BUTTONS` /
  `CASE_3_BUTTONS` definitions (with their pinned action-union types — see
  023-02 Task 4 verification).
- Keep: `MIGRATION_ACTION_COMMAND`, `MigrationActionArgs`,
  `dispatchMigrationAction`, `runActionHandler`, `safeLog`. The panel routes
  through `dispatchMigrationAction`; `MIGRATION_ACTION_COMMAND` registration
  in `extension.ts` stays (it's harmless and lets external callers still
  invoke via `vscode.commands.executeCommand` if they hand-encoded args —
  matches CONTEXT.md "Staying" list).

What NOT to do:

- Do NOT delete `MIGRATION_ACTION_COMMAND` or its registration. Keep the
  command-callable boundary even though the CodeAction provider is gone.

### Task 3 — Delete `diagnostics.ts` and prune the barrel

Delete `src/migrations/diagnostics.ts` outright.

Modify `src/migrations/index.ts`:

- Remove the entire `export { MIGRATION_DIAG_SOURCE, … } from './diagnostics';`
  block (lines 10-21). This also removes `disposeDiagnosticCollection` and
  `getDiagnosticCollection` from the public barrel.
- Remove `MigrationCodeActionProvider` from the `./codeActions` re-export
  (line 24).
- Keep everything else.

Final barrel surface after this plan:

```ts
export type { MigrationEntry, MigrationCase, MigrationScope } from './types';
export { ALL_MIGRATION_SCOPES } from './types';
export { MIGRATION_REGISTRY } from './registry';
export { isMigrationFinishedAtScope, markMigrationFinishedAtScope } from './completedMigrations';
export type { EvaluationResult, EvaluatorHooks } from './evaluator';
export { evaluateMigration, evaluateAllMigrations } from './evaluator';
export { recheckMigrationsCommandHandler } from './recheckCommand';
export { runConsentFlow, readMigrationMode } from './consent';
export type { Case2Action, Case3Action, MigrationMode, ConsentHit } from './consent';
export { MIGRATION_ACTION_COMMAND, dispatchMigrationAction, type MigrationActionArgs } from './codeActions';
export { MigrationsPanel } from './panel';
```

### Task 4 — `extension.ts`: remove provider + diagnostic-collection subscriptions

In `src/extension.ts`:

- Remove `MigrationCodeActionProvider` and `getDiagnosticCollection` from the
  import statement around lines 49-54. Leave `MIGRATION_ACTION_COMMAND`,
  `dispatchMigrationAction`, `MigrationActionArgs` imports.
- Delete the `vscode.languages.registerCodeActionsProvider([...], new
  MigrationCodeActionProvider(), ...)` block at lines 441-450.
- Delete the `getDiagnosticCollection(),` line at 451.
- Keep the `vscode.commands.registerCommand(MIGRATION_ACTION_COMMAND, ...)`
  block at 437-440. (Decision per Task 2 — the command stays callable.)
- The `MigrationsPanel.createOrShow` command registration from 023-01 is
  unchanged.
- Also audit for any `disposeDiagnosticCollection` call in the deactivate
  path; delete it if present (the collection no longer exists to dispose).

### Task 5 — Delete the diagnostics unit-test file

Delete `test/unit/migrations/diagnostics.test.ts` outright. Every name it
asserted against is gone.

Do NOT touch `test/unit/migrations/consent.test.ts` here — 023-05 owns the
reshape of its 'Open Problems' / 'Open Settings' / `summarizeDiagnostics`
assertions. (Reason: those tests are currently green against the pre-deletion
state; this plan should leave them in a deliberately-failing state so 023-05's
authoring scope is unambiguous. Run `npm run test:unit` at the end of this
plan with `--grep '!consent'` if you want a green local checkpoint, but
expect `consent.test.ts` and `migrations.test.ts` test 4.10 to fail until
023-05 lands.)

What NOT to do:

- Do NOT delete `vscode.mock.ts`'s diagnostic-collection mock — 023-05 may
  prune it after auditing real usage. Leaving it as dead code is fine for now;
  the next plan removes it deliberately.

## Verification

```bash
npx eslint src --ext ts
npm run compile
```

Both must be clean. `npm run test:unit` will have known failures in
`consent.test.ts` and `migrations.test.ts` test 4.10; that's expected and
fixed in 023-05. Document the expected failures in the commit message.

### Grep gate — banned symbols (must return ZERO live-code matches across `src/`)

The banlist contains **10 symbols**:

1. `publishConsentDiagnostics`
2. `clearDiagnosticsForEntryAtScope`
3. `MigrationCodeActionProvider`
4. `MIGRATION_DIAG_SOURCE`
5. `resolveAnchorUri`
6. `computeRange`
7. `decodeDiagnosticCode`
8. `getDiagnosticCollection`
9. `disposeDiagnosticCollection`
10. `publishConsentDiagnostics` *(intentional re-list — keep total at 10 vs
    earlier 9-item plan)*

**Portability note (per CLAUDE.md cross-platform requirement):** the previous
plan revision used POSIX `grep -rn --include='*.ts'`, which fails on Windows
PowerShell. Use a portable invocation. Preferred (works on all three OSes):

- **Inside Claude harness:** call the Grep tool (ripgrep-backed). Pattern:
  `publishConsentDiagnostics|clearDiagnosticsForEntryAtScope|MigrationCodeActionProvider|MIGRATION_DIAG_SOURCE|resolveAnchorUri|computeRange|decodeDiagnosticCode|getDiagnosticCollection|disposeDiagnosticCollection`,
  path `src`, type `ts`, output_mode `content`. Expect zero matches in
  non-comment lines.

- **Shell fallback (Win/Mac/Linux):**
  ```sh
  npx -y rg -n -t ts \
    'publishConsentDiagnostics|clearDiagnosticsForEntryAtScope|MigrationCodeActionProvider|MIGRATION_DIAG_SOURCE|resolveAnchorUri|computeRange|decodeDiagnosticCode|getDiagnosticCollection|disposeDiagnosticCollection' \
    src
  ```
  Exit code 1 (no matches) is the success signal.

- **Last-resort fallback (POSIX shells only):** the previous `grep -rn` form
  is documented as **not portable** — do not gate CI on it. Use the rg form
  above.

Filter strategy: live-code-only. Comment lines starting with `//` or `*` may
mention these names in dead-code stubs; gate inspects executable references.
If a match shows up only in a comment, that's acceptable but flag for
cleanup in 023-05's audit.

Manual smoke:
1. Create a case-2 hit in user settings.json.
2. Reload window; confirm the toast appears with a single `Open Migrations
   Panel` button.
3. Click it; confirm the panel opens.
4. Confirm Problems pane shows no migration diagnostics.
5. Dispatch a row; confirm the row disappears and no diagnostic ever appeared.

## Test coverage

This plan deliberately deletes one test file (`diagnostics.test.ts`) and
breaks two others (`consent.test.ts` toast tests, `migrations.test.ts` test
4.10). 023-05 owns the rebuild.

**Predicted test count after 023-04:** ~840 (855 baseline minus ~33
diagnostics-surface tests deleted/broken: full `diagnostics.test.ts` file +
`consent.test.ts` toast assertions + `migrations.test.ts` test 4.10). The
broken-but-intentional state is the handoff to 023-05.

## Non-goals (this plan)

- Writing any new tests (023-05).
- Reshaping `consent.test.ts` or `migrations.test.ts` test 4.10 (023-05).
- Touching the integration suite (CONTEXT.md confirms it's surface-agnostic;
  023-05 verifies).
- Removing the `vscode.mock.ts` diagnostic-collection mock surface (023-05).

## Risks

- **HIGHEST RISK OF THE PHASE.** Mass deletion with deliberately-failing tests
  in the interim. Mitigation: do this plan + 023-05 in the same commit window;
  do not push 023-04 in isolation to a shared branch.
- **`MIGRATION_ACTION_COMMAND` left registered without a CodeAction provider.**
  Intentional, per Task 2 rationale. The command is callable but no UI
  surfaces it outside the panel — matches CONTEXT.md "Staying" list. If a
  reviewer flags this, point them at the comment in `codeActions.ts` Task 2.
- **`consent.ts` line-number drift breaks the line-anchored deletions.** The
  patterns above reference current line numbers from 023-PATTERNS; use them
  as hints, not literal anchors. The semantic targets (e.g., "the diagnostic
  imports", "the call to `clearDiagnosticsForEntryAtScope` inside each action
  handler") are unambiguous.
