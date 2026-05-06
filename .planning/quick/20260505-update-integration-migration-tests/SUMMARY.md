---
slug: update-integration-migration-tests
status: complete
completed: 2026-05-05
commits:
  - 35e0a48
---

# Summary — update integration migration tests for B-01/B-02

## What changed

`test/integration/migrations suite/extension.test.ts`: 8 line updates across 4 tests.

- Notification body strings → new B-01 copy ("Behave BDD: migrated your 'featuresPath' setting...").
- Substring matchers → `"migrated your 'featuresPath'"` (stable, indirectly tied to B-01 wording).
- Publisher-coupled `@ext:gabeseltzer.gs-behave-bdd` → publisher-independent `gs-behave-bdd.featuresPaths` (matches the new B-02 form in `src/extension.ts`).

## Verification

- `npx tsc -p test/tsconfig.json --noEmit` — clean compile of the integration test project.
- `npx eslint src --ext ts` — clean.
- `npm run test:unit` — 697/697 passing.
- Atomic commit: `35e0a48`.

## Notes

- The four affected tests (lines 149, 170, 218 + the shape probe) drive `showSuppressibleNotification` directly with custom strings, so the body text is test-controlled — the matchers needed a stable substring that survives small future copy edits. Chose `"migrated your 'featuresPath'"` for that reason.
- Did not touch any of the production code added during the v1.4.0 review fix batch.
