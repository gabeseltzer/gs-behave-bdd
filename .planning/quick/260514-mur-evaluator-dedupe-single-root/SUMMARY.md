---
quick_id: 260514-mur
slug: evaluator-dedupe-single-root
created: 2026-05-14
completed: 2026-05-14
status: complete
---

# SUMMARY — De-duplicate Workspace + WorkspaceFolder hits in single-folder workspaces

## What shipped

- **Fix location moved from evaluator to view model.** Initial plan was to skip
  the WorkspaceFolder iteration inside `evaluator.ts`. That broke 40 existing
  evaluator unit tests because the evaluator's case-1 silent-finish writes
  `completedMigrations` at all three scopes by contract (MIGRATE-09). The fix
  landed at `panelViewModel.ts:buildViewModel` instead, where the UX symptom
  lives. Evaluator surface is unchanged.

- **`src/migrations/panelViewModel.ts`** — when `vscode.workspace.workspaceFile`
  is undefined (single-folder mode), suppress WorkspaceFolder-scope hits in
  the `onCaseHit` callback. Multi-root workspaces keep both rows.

- **`test/unit/migrations/panelViewModel.test.ts`** — new file, 4 tests:
  single-folder dedup, multi-root preservation, WorkspaceFolder-only suppression,
  Global-scope passthrough.

- **`test/integration/migrations suite/extension.test.ts:82-92`** — corrected
  the comment block. The prior text claimed `workspaceFolderValue` is undefined
  in single-folder mode; in practice VS Code populates both scope values from
  the same file. The `userScopeValue` helper's fallback chain already handled
  the ambiguity — only the comment was wrong.

## Commits

- `0c30607` fix(migrations): dedupe panel rows in single-folder workspaces
- `ab49f47` docs(migrations): correct single-folder inspect() comment in integration test

## Verification

- `npx eslint src --ext ts` → clean
- `npm run test:unit` → **856 passing** (was 852 before; +4 new tests)
- Manual smoke not performed — recommended next time the user is in the
  single-folder workspace that reproduced the bug.

## Deviations from PLAN.md

- **Layer change.** PLAN.md proposed evaluator-level skip; switched to
  panelViewModel-level skip to preserve the evaluator's per-scope bookkeeping
  contract that 40 unit tests depend on. Net result is the same as far as the
  user-visible Migrations Panel is concerned.

- **No evaluator change committed.** The temporary fix in `evaluator.ts`
  was reverted before the final commit.
