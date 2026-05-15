---
phase: 020-migration-registry
plan: "04"
subsystem: migrations
tags: [migration, registry, transforms, suppress-notifications, env-presets]
dependency_graph:
  requires: [020-01-scaffolding, 020-02-plain-entries, 020-03-features-path]
  provides: [suppressedNotificationsEntries, envPresetEntries, mergeRecord, registry-17-entries]
  affects: [src/migrations/registry.ts, src/notifications.ts]
tech_stack:
  added: []
  patterns: [array-append-with-dedup, deep-merge-record, transform-delegation-shim]
key_files:
  created:
    - src/migrations/suppressedNotifications.ts
    - src/migrations/envPresets.ts
    - test/unit/migrations/suppressedNotifications.test.ts
    - test/unit/migrations/envPresets.test.ts
  modified:
    - src/migrations/registry.ts
    - src/notifications.ts
decisions:
  - "Kept migrateLegacySuppressMultiConfig as thin shim delegating to lifted transform (Pitfall 1 — notifications.test.ts regression bar preserved)"
  - "suppressedNotificationsEntries exports 2 entries (not 1 as original D-A4.3 stated) per reconciliation block in PLAN.md"
  - "mergeRecord exported from envPresets.ts for Phase 21 reuse per D-A2.3"
  - "Pitfall 4 guard in both env transforms: undefined legacy returns skipDest not write; defined legacy always returns write even when canonical is undefined"
metrics:
  duration: "~25 minutes"
  completed: "2026-05-08"
  tasks_completed: 5
  tasks_total: 5
  files_created: 4
  files_modified: 2
---

# Phase 20 Plan 04: Suppress and Env SUMMARY

Landed 4 transform-bearing registry entries (2 suppressedNotifications + 2 envPresets) bringing the migration registry to 17 total entries (final count per D-A4.4). Refactored `migrateLegacySuppressMultiConfig` into a thin shim delegating to the lifted transform, preserving all 8 sub-case regression tests.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Lift suppress transform + 2 entries | e1044c2 | src/migrations/suppressedNotifications.ts |
| 2 | Test suppressedNotifications transforms + entries | 0c6e774 | test/unit/migrations/suppressedNotifications.test.ts |
| 3 | mergeRecord utility + 2 envPresets entries | 689b11a | src/migrations/envPresets.ts |
| 4 | Test mergeRecord + envPresets entries | 8200f99 | test/unit/migrations/envPresets.test.ts |
| 5 | Refactor wrapper + wire registry to 17 | 8f3b085 | src/notifications.ts, src/migrations/registry.ts |

## What Was Built

**`src/migrations/suppressedNotifications.ts`**
- `suppressMultiConfigToArray`: lifted byte-identical from `src/notifications.ts:267-279`. Boolean `true` → append `"multiConfigNotification"` to array (deduped); `!== true` → skipDest with removeSource:false (preserves callCount===0 contract).
- `suppressedNotificationsAppendWithDedup`: D-A2.4 array append-with-dedup transform for the cross-namespace `behave-vsc.suppressedNotifications` → `gs-behave-bdd.suppressedNotifications` migration.
- `suppressedNotificationsEntries`: array of 2 entries (`suppressMultiConfig-self` + `suppressedNotifications-from-behavevsc`).

**`src/migrations/envPresets.ts`**
- `mergeRecord<T>`: generic two-record merge utility exported for Phase 21 reuse. Caller supplies inner-merge function for collision direction.
- `envVarPresetsTransform`: preset-level + var-level deep merge via `mergeRecord`. Legacy wins on var collision (case-2/overwrite-* direction).
- `envVarOverridesTransform`: single-level merge, legacy wins.
- `envPresetEntries`: array of 2 entries (`envVarPresets-from-behavevsc` + `envVarOverrides-from-behavevsc`).

**`src/notifications.ts` (refactored)**
- Added import of `suppressMultiConfigToArray`.
- `migrateLegacySuppressMultiConfig` body replaced with 4-line shim delegating to the lifted transform. Public `Promise<void>` signature preserved.

**`src/migrations/registry.ts` (updated)**
- Added imports for `suppressedNotificationsEntries` and `envPresetEntries`.
- `MIGRATION_REGISTRY` now spreads all 4 groups → 17 entries total.

## Deviations from Plan

None — plan executed exactly as written. The reconciliation block's "17 entries" count (not 16) was already the binding interpretation, and this plan shipped exactly that: 2 suppress entries + 2 env entries = 4 new entries over Plan 03's 13.

## Test Coverage

| Suite | Tests Added |
|-------|-------------|
| Phase 20 — suppressMultiConfigToArray transform | 5 |
| Phase 20 — suppressedNotificationsAppendWithDedup transform | 7 (incl. Pitfall 4 analog) |
| Phase 20 — suppressedNotifications entries: structure | 4 |
| Phase 20 — suppressedNotifications entries: TEST-04 idempotency (dim a) | 2 |
| Phase 20 — suppressedNotifications entries: TEST-04 case-1 silent finish (dim b) | 2 |
| Phase 20 — mergeRecord utility | 6 |
| Phase 20 — envVarPresetsTransform | 4 (incl. Pitfall 4 explicit assertion) |
| Phase 20 — envVarOverridesTransform | 3 (incl. Pitfall 4) |
| Phase 20 — envPresets entries: structure | 4 |
| Phase 20 — envPresets entries: TEST-04 idempotency (dim a) | 2 |
| Phase 20 — envPresets entries: TEST-04 case-1 silent finish (dim b) | 2 |
| **Total new tests** | **41** |
| **Full suite result** | 825 passing, 1 pending (count assertion skipped per plan — Plan 05 flips it) |

## Pitfall Coverage

- **Pitfall 4**: `envVarPresetsTransform` and `envVarOverridesTransform` both have an explicit `(legacy={...}, canonical=undefined) → write` test, asserting the primitive receives `kind:'write'` (not `skipDest`) so the value gets copied into canonical.

## Known Stubs

None — all transforms are fully implemented with correct behavior.

## Self-Check: PASSED

- `src/migrations/suppressedNotifications.ts`: FOUND
- `src/migrations/envPresets.ts`: FOUND
- `test/unit/migrations/suppressedNotifications.test.ts`: FOUND
- `test/unit/migrations/envPresets.test.ts`: FOUND
- `src/migrations/registry.ts` (modified): FOUND
- `src/notifications.ts` (modified): FOUND
- Commits e1044c2, 0c6e774, 689b11a, 8200f99, 8f3b085: all present in git log
- 825 tests passing, 1 pending
