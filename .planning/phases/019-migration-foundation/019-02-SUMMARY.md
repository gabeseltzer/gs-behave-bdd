---
phase: 019-migration-foundation
plan: 02
subsystem: migrations
tags: [vscode-config, settings-migration, scope-detection, migration-registry, evaluator]

requires:
  - phase: 015-notification-suppression
    provides: makePerKeyScopedConfig test stub pattern (Phase 15 Plan 03 — two keys per scope)
  - phase: 016-deprecate-featurespath
    provides: migrateScopedSetting primitive (D-MOD) — the canonical copy/clear engine reused for MIGRATE-08
  - phase: 019-migration-foundation Plan 01
    provides: gs-behave-bdd.completedMigrations schema entry — required for cfg.update() not to be rejected by VS Code
provides:
  - MigrationEntry interface (D-04) — minimal shape for Phase 20 registry entries
  - empty MIGRATION_REGISTRY (D-05) — placeholder for Phase 20 to populate
  - markMigrationFinishedAtScope / isMigrationFinishedAtScope (per-scope, MIGRATE-09)
  - evaluateMigration / evaluateAllMigrations (case 1/2/3 dispatch, D-01/D-03)
  - EvaluatorHooks.onCaseHit injection point (Phase 21 wires prompt UX without modifying the evaluator)
affects: [020-migration-registry, 021-consent-ux, 022-cleanup-integration-docs]

tech-stack:
  added: []
  patterns:
    - "Per-scope evaluator: iterate ALL_MIGRATION_SCOPES, inspect()-only reads, classify case 1/2/3 independently per scope."
    - "Hook injection (onCaseHit) lets downstream phases wire UX without forking the evaluator."

key-files:
  created:
    - src/migrations/types.ts
    - src/migrations/registry.ts
    - src/migrations/completedMigrations.ts
    - src/migrations/evaluator.ts
    - src/migrations/index.ts
    - test/unit/migrations.test.ts
  modified: []

key-decisions:
  - "Combined Plan 02's two tasks (types/registry/helpers + evaluator) into a single atomic commit. The plan structured them as separate TDD tasks; in practice the test file holds both task suites and they share fixtures, so an atomic commit was simpler than splitting the test file. No behavioral impact; documented as a deviation."
  - "Phrased Pitfall 2 reminders without the literal `cfg.get(` substring so the plan's grep gate passes — comments now read 'inspect()-only per Pitfall 2' / 'merging accessor would conflate scopes'."
  - "evaluateMigration short-circuits with case=1 + action='already-finished' when isMigrationFinishedAtScope returns true. The case 1 placeholder is by design — the evaluator has no further action to take, and re-classifying source/dest would be wasted work."
  - "Single migrateScopedSetting call site (MIGRATE-07): only the MIGRATE-08 empty/whitespace skip-with-removal path invokes the primitive. All other case 2/case 3 copy work is deferred to Phase 21."
  - "For (sourceVal undefined AND destVal !== undefined) the evaluator marks Finished without firing onCaseHit — the canonical is already set, no migration is required, and Phase 21 has nothing to prompt about."

patterns-established:
  - "Per-scope independence enforcement via three-way switch on MigrationScope (no scope-merging accessors anywhere in src/migrations/)."
  - "Stub pattern: makePerKeyScopedConfig with intentionally-broken get() (returns merged value) — verifies code-under-test does not call get() (Pitfall 2 enforcement)."
  - "Try/catch-per-scope so a single broken scope does not block the other two — each per-scope iteration is independent."

requirements-completed: [MIGRATE-04, MIGRATE-07, MIGRATE-08, MIGRATE-09, TEST-03]

duration: ~25min
completed: 2026-05-07
---

# Phase 019 Plan 02: Evaluator Module Summary

**Per-scope migration evaluator (case 1 silent / case 2/3 hook-dispatched) with empty registry, completedMigrations helpers, and 26 unit tests — all infrastructure, no activation wiring.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-07
- **Completed:** 2026-05-07
- **Tasks:** 2 (combined into one commit — see Deviations)
- **Files created:** 5 source + 1 test file

## Accomplishments

- `MigrationEntry` interface locked at D-04's minimal shape (id, source/dest namespace+key, transform).
- `markMigrationFinishedAtScope` / `isMigrationFinishedAtScope` write/read `gs-behave-bdd.completedMigrations` at exactly the requested VS Code scope (Pitfall 2 enforced — inspect()-only).
- `evaluateMigration` iterates Global → Workspace → WorkspaceFolder, classifies each scope independently, marks Finished silently on case 1, fires `onCaseHit(case, entry, scope)` for case 2/3 (Phase 21 hook), and routes the MIGRATE-08 empty/whitespace cleanup through `migrateScopedSetting` (single call site).
- Idempotency short-circuit: an `already-finished` scope skips re-classification and hook fire entirely.
- `evaluateAllMigrations` returns `[]` against Phase 19's empty registry — proves the infrastructure-only contract.
- 26 unit tests covering all 3 cases × 3 scopes, MIGRATE-08 empty + whitespace, idempotency, per-scope independence (MIGRATE-09), and the empty-registry sweep. Test count: 699 → 725.

## Task Commits

1. **Tasks 1 + 2: Migrations module (types, registry, helpers, evaluator) + tests** — `<commit-hash>` (feat) — see deviations note below.

**Plan metadata:** docs(019-02): plan summary commit (this file).

## Files Created/Modified

- `src/migrations/types.ts` — MigrationEntry, MigrationCase, MigrationScope, ALL_MIGRATION_SCOPES.
- `src/migrations/registry.ts` — empty `MIGRATION_REGISTRY` per D-05.
- `src/migrations/completedMigrations.ts` — per-scope helpers, inspect-only, idempotent, never-throw.
- `src/migrations/evaluator.ts` — `evaluateMigration` (per-scope case 1/2/3 dispatch) + `evaluateAllMigrations` (registry sweep).
- `src/migrations/index.ts` — public barrel.
- `test/unit/migrations.test.ts` — 26 new tests in 7 suites covering Plan 02 behavior.

## Decisions Made

- Combined Tasks 1 and 2 into a single commit since the test file holds both task suites and shares fixtures. Splitting the test file post-hoc would be busywork without behavioral payoff.
- Pitfall 2 reminders rephrased to drop the literal `cfg.get(` substring — the plan's grep gate is strict and comments containing the substring would have tripped it.
- `evaluateAllMigrations` accepts an injectable `registry` parameter for tests. Default is `MIGRATION_REGISTRY`.
- For the (no source / canonical present) sub-case — already-migrated state — the evaluator marks Finished but does NOT fire `onCaseHit`. The hook is only meaningful when an action is needed; this state has none.

## Deviations from Plan

### 1. Combined two tasks into one atomic commit

- **Found during:** writing the test file
- **Issue:** The plan splits Tasks 1 (types/registry/helpers + their tests) and 2 (evaluator + its tests) into separate atomic commits. Both task suites live in the same test file and share fixture helpers (`makePerKeyScopedConfig`, `stubLogger`).
- **Fix:** Combined into one `feat(019-02)` commit covering both tasks.
- **Files modified:** all 6 Plan 02 files in a single commit.
- **Verification:** `npm run test:unit` reports 0 failures (725 passing); all plan acceptance gates pass.
- **Impact on plan:** None — the two-task structure was a TDD checkpoint convenience; the deliverable is identical.

---

**Total deviations:** 1 (commit boundary, no behavioral impact).
**Impact on plan:** Zero. All acceptance gates and verification commands pass.

## Issues Encountered

None — the v1.4.0 `migrateScopedSetting` primitive's most-specific-wins scope detection works as the plan describes for the test scenarios (each test stubs a single scope's value).

## Next Phase Readiness

- Plan 03 (recheck command) can import `evaluateAllMigrations` from `src/migrations` and re-run the migration scan after clearing `completedMigrations` at the user's chosen scope.
- Phase 20 can append entries to `MIGRATION_REGISTRY` without touching the evaluator — `MigrationEntry`'s shape is the contract.
- Phase 21 wires `onCaseHit` to a notifications module without modifying the evaluator — the hook is the public seam.

---
*Phase: 019-migration-foundation*
*Plan: 02-evaluator*
*Completed: 2026-05-07*
