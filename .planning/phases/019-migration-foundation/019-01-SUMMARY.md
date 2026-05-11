---
phase: 019-migration-foundation
plan: 01
subsystem: settings
tags: [vscode-settings, package-json, schema, migration]

requires:
  - phase: 015-notification-suppression
    provides: per-key suppressedNotifications array — same scope=resource + array shape pattern reused here
  - phase: 010-features-paths
    provides: featuresPaths plural array setting — schema test pattern reused
provides:
  - gs-behave-bdd.migrationMode enum setting (prompt | migrate-and-delete | migrate-and-keep | skip), default prompt
  - gs-behave-bdd.completedMigrations string[] setting, default []
  - schema-shape unit tests pinning both entries (CONSENT-05/07/08)
affects: [019-02-evaluator, 019-03-recheck-command, 020-migration-registry, 022-cleanup-integration-docs]

tech-stack:
  added: []
  patterns: [resource-scope enum with markdownDescription, resource-scope string[] with default []]

key-files:
  created: []
  modified:
    - package.json
    - test/unit/packageJsonSchema.test.ts

key-decisions:
  - "Placed new entries alphabetically between discoveryStopOnFirstHit and suppressedNotifications, per plan."
  - "markdownDescription copy is the canonical v1.5.0 wording; Phase 22 DOC-02 will reuse verbatim (CONSENT-08)."
  - "Widened schema test SchemaProp type to include scope/enum/markdownDescription so the new pinning tests can read those fields without casts."

patterns-established:
  - "Schema-pin pattern for enum settings: assert type+scope+deepStrictEqual(enum)+default+markdownDescription substrings."
  - "Schema-pin pattern for string[] settings: assert type+scope+items.type+deepStrictEqual(default,[])+markdownDescription substrings."

requirements-completed: [CONSENT-05, CONSENT-07, CONSENT-08]

duration: 8min
completed: 2026-05-07
---

# Phase 019 Plan 01: Settings Registration Summary

**Two new v1.5.0 settings registered in package.json (`migrationMode` enum, `completedMigrations` string[]) with schema-shape tests pinning every field consumed by Plan 02 / Plan 03.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-07
- **Completed:** 2026-05-07
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- `gs-behave-bdd.migrationMode` (enum) registered with default `prompt` and the canonical CONSENT-08 description copy.
- `gs-behave-bdd.completedMigrations` (string[]) registered with default `[]` and the canonical CONSENT-08 description copy.
- Two new schema-shape tests pin every field Plan 02's evaluator and Plan 03's recheck command will read or write.
- Widened the `SchemaProp` type in `packageJsonSchema.test.ts` so future settings can be pinned without per-test casts.

## Task Commits

1. **Task 1: Register migrationMode + completedMigrations + schema tests** — `d361831` (feat)

## Files Created/Modified
- `package.json` — added two new entries under `contributes.configuration.properties`, alphabetically between `discoveryStopOnFirstHit` and `suppressedNotifications`.
- `test/unit/packageJsonSchema.test.ts` — extracted shared `SchemaProp` type; added `Phase 19 (CONSENT-05/07/08)` suite with 2 tests pinning the new entries.

## Decisions Made
- Followed plan as specified — copy is canonical, ordering alphabetical, schema-test style mirrors the existing Phase 15 NOTIF-01 suite.
- Promoted the test file's local property type to a shared `SchemaProp` type at module scope so both suites share it. Equivalent assertions, less duplication.

## Deviations from Plan

None — plan executed exactly as written. The shared-type extraction is a micro-refactor inside the test file with zero behavioral impact.

## Issues Encountered

None.

## Next Phase Readiness

- Plan 02 (evaluator) can now `vscode.workspace.getConfiguration("gs-behave-bdd").inspect("migrationMode" | "completedMigrations")` and find a registered key at every scope.
- Plan 03 (recheck command) can `update("completedMigrations", [], target)` against a real schema-known key — VS Code won't reject the write.

---
*Phase: 019-migration-foundation*
*Plan: 01-settings-registration*
*Completed: 2026-05-07*
