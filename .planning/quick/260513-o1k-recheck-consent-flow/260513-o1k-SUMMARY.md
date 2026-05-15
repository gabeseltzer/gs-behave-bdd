---
quick_id: 260513-o1k
description: wire runConsentFlow into recheckMigrations command so case-2/3 prompts fire
status: complete
completed: 2026-05-13
---

# Summary — Wire runConsentFlow into recheckMigrations command

## Outcome

`gs-behave-bdd.recheckMigrations` now shows the consent prompt for case-2 / case-3
hits after clearing `completedMigrations`. Previously it cleared the registry and
re-ran the evaluator, but never invoked `runConsentFlow` — hits were classified and
dropped, so the user saw nothing happen.

Reproduced manually: set `behave-vsc.justMyCode: false` at user level, ran "Recheck
migrations", got no prompt.

## Files changed

- `src/migrations/recheckCommand.ts`
  - Dropped the optional `EvaluatorHooks` parameter from `recheckMigrationsCommandHandler`.
  - Imported `runConsentFlow`, `readMigrationMode`, `ConsentHit`.
  - Inside the per-folder loop after the clear: build a local `hits[]`, pass an
    `onCaseHit` hook that collects case-2 / case-3 hits, read `migrationMode`, and
    `await runConsentFlow(folder.uri, hits, mode)`.
  - Sequential `await` (not fire-and-forget like activation) — the user just clicked
    the menu item and is waiting on the UI.
- `test/unit/migrations.test.ts`
  - Stubbed `config.reloadSettings` in the recheck suite setup (consent flow calls
    it post-prompt; mock vscode would otherwise throw).
  - Rewrote test 4.9 to drop the removed `hooks` parameter — asserts evaluator ran
    by counting `completedMigrations` writes.
  - **New test 4.10** — regression pin for this fix. Stubs a real case-2 condition
    (`behave-vsc.justMyCode: false` at Global, canonical absent) using a
    namespace-aware getConfiguration stub, picks Global in the quick-pick, and
    asserts `showInformationMessage` fired exactly once with the case-2 button set
    and a message naming the legacy key.

## Verification

- `npx eslint src --ext ts` → clean (0 errors, 0 warnings on src).
- `npm run test:unit` → 847 passing (was 846; new 4.10 test added).

## Why the test went through three iterations

1. **First run:** namespace-blind stub conflated `behave-vsc.justMyCode` and
   `gs-behave-bdd.justMyCode` (same key name in different namespaces) → evaluator
   saw case 3 instead of case 2.
2. **Second run:** namespace-aware stub fixed the case classification, but the
   stub's `get()` ignored `defaultValue`, so `readMigrationMode` returned undefined
   and `processGroup` took the silent skip path. Seeded `migrationMode: 'prompt'`
   in the canonical-namespace stub.
3. **Third run:** green. Both pitfalls now documented inline in the test.
