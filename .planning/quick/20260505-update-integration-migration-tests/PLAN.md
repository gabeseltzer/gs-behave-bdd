---
slug: update-integration-migration-tests
created: 2026-05-05
status: in-progress
---

# Update integration migration tests for B-01 and B-02 string changes

## Context

v1.4.0 review fixes B-01 (drop literal backticks from migration notification copy) and B-02 (replace publisher-coupled `@ext:gabeseltzer.gs-behave-bdd` with publisher-independent `gs-behave-bdd.featuresPaths` search query) updated `src/extension.ts`. Unit tests were updated alongside the fixes, but integration tests in `test/integration/migrations suite/extension.test.ts` still reference the old strings and will fail next time integration tests run.

## Scope

Single file: `test/integration/migrations suite/extension.test.ts`

Lines flagged in the v1.4.0 review report:

- L156 — old notification body string ("Migrated \`featuresPath\` → ...")
- L161 — matcher: `c.args[0].includes('Migrated \`featuresPath\`')`
- L174 — matcher inside DSA stub callback
- L192 — body string in second `showSuppressibleNotification` invocation
- L226 — body string in third `showSuppressibleNotification` invocation
- L232 — `executeCommand` arg `@ext:gabeseltzer.gs-behave-bdd`
- L235-L236 — assertion that `executeCommand` was called with `@ext:gabeseltzer.gs-behave-bdd`

## Plan

1. Replace body strings with the new B-01 copy ("Behave BDD: migrated your 'featuresPath' setting...").
2. Update matchers to look for a stable substring of the new copy (e.g. `"migrated your 'featuresPath'"`).
3. Replace `@ext:gabeseltzer.gs-behave-bdd` with `gs-behave-bdd.featuresPaths` in both the simulated handler body (L232) and the assertion (L235-236).
4. Lint clean (`npx eslint src --ext ts` — note: integration tests live under `test/`, but project lint covers `src/`; this file is under `test/` so won't be linted by that command, that's fine).
5. Commit atomically: `fix(review-followup): align integration migration tests with B-01/B-02`.

## Verification

- `npx eslint src --ext ts` — no regressions in src.
- `npm run test:unit` — still 697/697 (this change touches integration tests only, not unit).
- Integration test file compiles (TS check via `npm run pretest` if available, otherwise webpack will catch it).
