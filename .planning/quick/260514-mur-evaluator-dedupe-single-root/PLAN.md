---
quick_id: 260514-mur
slug: evaluator-dedupe-single-root
created: 2026-05-14
status: planned
files_modified:
  - src/migrations/evaluator.ts
  - test/unit/migrations/evaluator.test.ts
  - test/integration/migrations suite/extension.test.ts
---

# Quick Task: De-duplicate Workspace + WorkspaceFolder hits in single-folder workspaces

## Problem

In a single-folder workspace, `.vscode/settings.json` is the single source for both `workspaceValue` and `workspaceFolderValue`. When `evaluateMigration` iterates `ALL_MIGRATION_SCOPES` it produces two pending hits for the same line — once at Workspace, once at WorkspaceFolder. The user-visible symptom: the Migrations Panel renders two identical rows for the same legacy key. Both actions are non-destructive (the second collapses to case 1 after the first runs), but the UX is confusing.

The integration test at `test/integration/migrations suite/extension.test.ts:84-89` carries an explanatory comment that asserts the wrong VS Code behavior (claims `workspaceFolderValue` is undefined in single-folder mode). The test still passes because of the `?? workspaceValue ?? globalValue` fallback chain, which masks the duplication.

## Fix

Detect single-folder mode in the evaluator and skip the WorkspaceFolder iteration when `vscode.workspace.workspaceFile === undefined`. Source-of-truth fix — evaluator-level, so the recheck command, panel view model, and any future consumers all see de-duplicated results.

## Tasks

### Task 1 — Evaluator de-dupe

File: `src/migrations/evaluator.ts`

Inside `evaluateMigration`, before the `for (const scope of ALL_MIGRATION_SCOPES)` loop, compute:

```ts
const isSingleFolderWorkspace = vscode.workspace.workspaceFile === undefined;
```

Inside the loop, immediately after the `try {`, skip WorkspaceFolder when in single-folder mode:

```ts
if (isSingleFolderWorkspace && scope === vscode.ConfigurationTarget.WorkspaceFolder) {
  continue;
}
```

Add a short comment explaining why (single VS Code source serves both scopes; iterating both produces phantom duplicate hits for the same `.vscode/settings.json` line).

Commit: `fix(migrations): skip WorkspaceFolder scope in single-folder workspaces to dedupe hits`

### Task 2 — Unit test

File: `test/unit/migrations/evaluator.test.ts`

Add one test in the appropriate describe block (likely the existing per-scope iteration block):

- Mock `vscode.workspace.workspaceFile = undefined` (single-folder)
- Set up `inspect()` to return the legacy key at BOTH `workspaceValue` and `workspaceFolderValue` (with the same value, mimicking VS Code's single-folder behavior)
- Run `evaluateMigration` and assert the results array contains exactly ONE entry with `scope === ConfigurationTarget.Workspace` (no WorkspaceFolder entry)
- Also add (or extend an existing) test that asserts multi-root mode (`workspaceFile` defined) still produces both scope entries when the legacy key is set at both — so the new branch doesn't over-correct.

Commit: `test(migrations): cover evaluator dedupe in single-folder workspaces`

### Task 3 — Correct the integration test comment

File: `test/integration/migrations suite/extension.test.ts` around line 82-89.

Replace the misleading comment block with one that accurately describes the actual VS Code behavior and notes that the helper's fallback chain is intentionally tolerant of both modes. Keep the `userScopeValue` helper as-is — it's still correct in spirit.

Commit: `docs(migrations): correct single-folder inspect() comment in integration test`

## Verification

- `npx eslint src --ext ts` clean
- `npm run test:unit` green (852 → 853 with the new test, or more if multi-root extension counts)
- Manual smoke (optional): open a single-folder workspace with a legacy `behave-vsc.*` key set, confirm the Migrations Panel shows ONE row per setting (was two).

## SUMMARY

To be written after execution.
