---
phase: 020-migration-registry
plan: "03"
subsystem: migrations
tags: [migration, featuresPath, registry, refactor]
dependency_graph:
  requires: [020-01-scaffolding, 020-02-plain-entries]
  provides: [featuresPathMergeWithDedup, featuresPathEntries, registry-size-13]
  affects: [src/migrations/registry.ts, src/notifications.ts]
tech_stack:
  added: []
  patterns: [lift-transform-pattern, two-entries-one-transform]
key_files:
  created:
    - src/migrations/featuresPath.ts
    - test/unit/migrations/featuresPath.test.ts
  modified:
    - src/migrations/registry.ts
    - src/notifications.ts
decisions:
  - "Removed normalizeFeaturesPathEntry import from notifications.ts — only used in featuresPath.ts now"
  - "Kept migrateLegacyFeaturesPath as thin shim delegating to featuresPathMergeWithDedup (Q2 shim through v1.5.0)"
  - "Deleted FEATURES_PATH_NAMESPACES const and normalizePathEntry alias — both dead after refactor"
metrics:
  duration: ~10 minutes
  completed: 2026-05-08
  tasks_completed: 3
  files_changed: 4
---

# Phase 20 Plan 03: Features Path Migration Entries Summary

JWT-style lift: `featuresPathMergeWithDedup` pure function extracted from v1.4.0 wrapper body into `src/migrations/featuresPath.ts`, registered as two entries sharing one transform, with wrapper refactored to a thin delegate shim.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Lift transform into featuresPath.ts + define 2 entries | af80e6d | src/migrations/featuresPath.ts (created) |
| 2 | Test transform + 2 entries | 276b590 | test/unit/migrations/featuresPath.test.ts (created) |
| 3 | Refactor wrapper + delete dead code + wire registry | 0b1ab6c | src/notifications.ts, src/migrations/registry.ts |

## Verification

- `npx eslint src --ext ts` — exit 0 (clean)
- `npm run test:unit` — 784 passing, 1 pending (intentionally skipped 17-entry count test)
- 12 sub-case `migrateLegacyFeaturesPath` regression bar in notifications.test.ts — all green
- New featuresPath.test.ts adds 16 tests (7 transform + 5 structure + 2 idempotency + 2 case-1)
- `MIGRATION_REGISTRY.length === 13` (was 11; invariant tests pass with no duplicates)
- `FEATURES_PATH_NAMESPACES` and `normalizePathEntry` confirmed absent from notifications.ts

## Artifacts

- **`src/migrations/featuresPath.ts`** — exports `featuresPathMergeWithDedup` (pure function, byte-identical to v1.4.0 transform body) and `featuresPathEntries` (length 2: `featuresPath-self` and `featuresPath-from-behavevsc`)
- **`src/migrations/registry.ts`** — spreads `...featuresPathEntries`; registry grows from 11 to 13
- **`src/notifications.ts`** — `migrateLegacyFeaturesPath` now delegates to `featuresPathMergeWithDedup`; `FEATURES_PATH_NAMESPACES` const and `normalizePathEntry` alias removed; `normalizeFeaturesPathEntry` import removed

## Deviations from Plan

**1. [Rule 2 - Dead Import] Removed `normalizeFeaturesPathEntry` import from notifications.ts**
- **Found during:** Task 3
- **Issue:** After removing `normalizePathEntry` alias (which wrapped `normalizeFeaturesPathEntry`) and `FEATURES_PATH_NAMESPACES`, the `normalizeFeaturesPathEntry` import became unused — lint would have flagged it
- **Fix:** Removed the import from notifications.ts (it is still imported in featuresPath.ts where it belongs)
- **Files modified:** src/notifications.ts
- **Commit:** 0b1ab6c

## Known Stubs

None — all data wired through the registry.

## Threat Flags

None — pure structural refactor. No new network endpoints, auth paths, or trust boundary changes. The transform logic is byte-identical to v1.4.0.

## Self-Check: PASSED

- `src/migrations/featuresPath.ts` — FOUND
- `test/unit/migrations/featuresPath.test.ts` — FOUND
- `src/migrations/registry.ts` — FOUND (modified)
- `src/notifications.ts` — FOUND (modified)
- Commits af80e6d, 276b590, 0b1ab6c — all verified in git log
