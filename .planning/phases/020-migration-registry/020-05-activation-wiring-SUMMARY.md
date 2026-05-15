---
phase: 020-migration-registry
plan: "05"
subsystem: migrations/activation
tags: [migrations, registry, extension-activation, wiring, structural-tests]
dependency_graph:
  requires: [020-01, 020-02, 020-03, 020-04]
  provides: [D-A6.1-activation-wiring, TEST-04-wiring-assertions]
  affects: [src/extension.ts, test/unit/migrations/index.test.ts, test/unit/notifications.test.ts]
tech_stack:
  added: []
  patterns: [evaluator-driven-migration, structural-regression-tests]
key_files:
  created: []
  modified:
    - src/extension.ts
    - test/unit/migrations/index.test.ts
    - test/unit/notifications.test.ts
decisions:
  - "D-A6.1: evaluateAllMigrations(wkspUri) is sole activation-time migration driver; v1.4.0 direct calls deleted"
  - "Kept showSuppressibleNotification import — still used by multiConfigNotification path"
  - "Deleted Phase 15/16 ordering tests that asserted now-absent call sites; replaced with absence/presence assertions"
  - "Phase 16 D-12 Open Settings test: retained publisher-ID absence check as standalone; dropped featuresPaths presence check"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-08T16:40:54Z"
  tasks_completed: 3
  files_modified: 3
---

# Phase 020 Plan 05: Activation Wiring Summary

Wired the Phase 20 migration registry into `src/extension.ts` activation by replacing the v1.4.0 silent direct calls (`migrateLegacyFeaturesPath(wkspUri)` and `migrateLegacySuppressMultiConfig(wkspUri)`) with a single `evaluateAllMigrations(wkspUri)` call that drives all 17 registry entries through the Phase 19 evaluator.

## Tasks

| Task | Name | Commit | Files Changed |
|------|------|--------|---------------|
| 1 | Wire evaluateAllMigrations; delete v1.4.0 silent calls | b846e07 | src/extension.ts |
| 2 | Update structural tests in notifications.test.ts | b703d15 | test/unit/notifications.test.ts |
| 3 | Flip skipped count assertion to hard pin; add wiring-presence test | 457e299 | test/unit/migrations/index.test.ts |

## Verification Results

- `npx eslint src --ext ts` — exit 0 (clean) after all tasks
- `npm run compile` — webpack build clean after Task 1
- `npm run compile-tests` — exit 0 after Task 3
- `node ./out/test/test/unit/run.js` — **826 passing, 0 failing** (was 824 passing + 1 pending before Task 3)
- Structural grep: `migrateLegacyFeaturesPath(wkspUri)` and `migrateLegacySuppressMultiConfig(wkspUri)` absent from extension.ts; `evaluateAllMigrations` present at both import and call site

## Must-Haves Checklist

- [x] `src/extension.ts:348-350` no longer calls `migrateLegacyFeaturesPath` or `migrateLegacySuppressMultiConfig` directly during activation
- [x] `evaluateAllMigrations(wkspUri)` is invoked once per workspace folder during activation
- [x] Plan 01's index.test.ts Test 3 (`MIGRATION_REGISTRY.length === 17`) flipped from `.skip` to hard assertion and passes
- [x] Structural ordering tests in notifications.test.ts updated: absence assertions replace the deleted-call-site presence assertions
- [x] `config.reloadSettings(wkspUri)` preserved inside per-workspace block (Pitfall 4 carry-forward)

## Extension.ts Changes (Task 1)

**Import line 42 before:**
```typescript
import { migrateLegacySuppressMultiConfig, migrateLegacyFeaturesPath, showSuppressibleNotification } from './notifications';
import { recheckMigrationsCommandHandler } from './migrations';
```

**After:**
```typescript
import { showSuppressibleNotification } from './notifications';
import { recheckMigrationsCommandHandler, evaluateAllMigrations } from './migrations';
```

Note: `showSuppressibleNotification` was retained — it is still used by the `multiConfigNotification` path at L188.

**Activation block replaced:** L330-L381 (~50 lines including D-18 ordering comments, `migrationResults` Promise.all, `pendingFeaturesPathNotifs` derivation, and featuresPath notification loop) condensed to ~17 lines calling `evaluateAllMigrations(wkspUri)` per workspace.

## Test Changes

### notifications.test.ts (Task 2)
- Phase 15 suite: Replaced `migrateLegacySuppressMultiConfig precedes updateDiscoveryUX` with `Phase 20 D-A6.1: extension.ts no longer calls migrateLegacySuppressMultiConfig directly` (absence + evaluateAllMigrations ordering)
- Phase 16 suite: Replaced three tests (D-18 ordering, D-13 key presence, D-12 settings search) with two tests: combined absence assertion for both v1.4.0 call sites, and standalone publisher-ID absence check

### index.test.ts (Task 3)
- Converted `test.skip` for `registry contains exactly 17 entries (D-A4.4)` to active `test` — passes with MIGRATION_REGISTRY.length === 17
- Added `Phase 20 D-A6.1: extension.ts wires evaluateAllMigrations and deletes v1.4.0 silent calls` with fs-based source read (5-level path walk from compiled output dir)

## Deviations from Plan

None — plan executed exactly as written. The plan noted that D-13 and D-12 tests would also break; those were handled in Task 2 scope alongside the explicitly listed D-18 deletion.

## Self-Check

- [x] `src/extension.ts` exists and modified
- [x] `test/unit/migrations/index.test.ts` exists and modified
- [x] `test/unit/notifications.test.ts` exists and modified
- [x] Commits b846e07, b703d15, 457e299 all present in git log
- [x] Unit suite: 826 passing, 0 failing

## Self-Check: PASSED
