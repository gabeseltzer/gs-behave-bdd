---
phase: 020-migration-registry
plan: "02"
subsystem: migrations
tags: [migrations, registry, plain-entries, behave-vsc, tdd]
dependency_graph:
  requires: [020-01-scaffolding-SUMMARY.md]
  provides: [plainEntries, makePlainEntry, MIGRATION_REGISTRY with 11 entries]
  affects: [src/migrations/registry.ts, src/migrations/plain.ts]
tech_stack:
  added: []
  patterns: [plain-entry factory, injectable-registry tests, per-key scoped config stub]
key_files:
  created:
    - src/migrations/plain.ts
    - test/unit/migrations/plain.test.ts
  modified:
    - src/migrations/registry.ts
    - test/unit/migrations.test.ts
decisions:
  - Drop explicit type parameters from makePlainEntry() calls in plainEntries array (TypeScript contravariance on transform parameter requires T=unknown for readonly MigrationEntry[])
  - Fix 2 pre-existing tests in migrations.test.ts that assumed an empty registry (Rule 1 auto-fix)
metrics:
  duration: "5 minutes"
  completed: "2026-05-08"
  tasks: 3
  files_changed: 4
---

# Phase 20 Plan 02: Plain Entries Summary

**One-liner:** `makePlainEntry` factory + 11 plain-copy `behave-vsc.<key>` -> `gs-behave-bdd.<key>` entries registered in MIGRATION_REGISTRY with full TEST-04 coverage.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement makePlainEntry factory + 11 plainEntries | 88869c2 | src/migrations/plain.ts |
| 2 | Test factory + per-entry TEST-04 dimensions | 024216d | test/unit/migrations/plain.test.ts |
| 3 | Wire plainEntries into MIGRATION_REGISTRY | 80e186d | src/migrations/registry.ts, test/unit/migrations.test.ts |

## Verification

- `npx eslint src --ext ts` → exit 0 (clean) after every task
- `npm run test:unit` → 768 passing, 1 pending (skipped Plan 05 gate), 0 failing
- Baseline was 739 tests; +29 new tests: 5 factory + 11 idempotency + 11 case-1 + 2 test updates
- `MIGRATION_REGISTRY.length === 11` after Task 3
- All 11 ids end with `-from-behavevsc` (registry-invariants test passes)
- No changes to extension.ts, notifications.ts, settings.ts, or any file outside migrations/

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript type error: MigrationEntry<T, T> not assignable to MigrationEntry<unknown, unknown>**
- **Found during:** Task 1 compile step
- **Issue:** The plan's code sample called `makePlainEntry<string>('projectPath')` etc., but TypeScript's contravariance on the `transform` parameter means `MigrationEntry<string, string>` is not assignable to `readonly MigrationEntry[]` (defaults to `MigrationEntry<unknown, unknown>`).
- **Fix:** Drop the explicit type parameters — call `makePlainEntry('projectPath')` etc. TypeScript infers `T = unknown` from context, which is compatible.
- **Files modified:** src/migrations/plain.ts
- **Commit:** 88869c2

**2. [Rule 1 - Bug] Two pre-existing Phase 19 tests broke when registry became non-empty**
- **Found during:** Task 3 (wiring registry)
- **Issue:**
  - Test 3.14 (`evaluateAllMigrations with empty registry returns []`) called `evaluateAllMigrations(MOCK_URI)` without an injectable registry, so it now ran against 11 real entries and got 33 results instead of `[]`.
  - Test 4.9 (`empty registry post-clear`) asserted `onCaseHit.called === false`, but now 11 entries all fire case-1 hooks, so the spy is called 33 times.
- **Fix:**
  - 3.14: pass `[]` as the injectable registry arg explicitly; rename to clarify intent.
  - 4.9: update assertion to verify onCaseHit fires (all case-1) rather than not firing; update description to match.
- **Files modified:** test/unit/migrations.test.ts
- **Commit:** 80e186d

## Known Stubs

None — all 11 entries produce real transforms and are fully wired into MIGRATION_REGISTRY.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes. Plain entries reuse Phase 19's threat mitigations (T-19-*) unchanged.

## Self-Check: PASSED

- src/migrations/plain.ts exists: FOUND
- src/migrations/registry.ts modified: FOUND
- test/unit/migrations/plain.test.ts exists: FOUND
- Commit 88869c2: FOUND
- Commit 024216d: FOUND
- Commit 80e186d: FOUND
- 768 tests passing (up from 739 baseline)
