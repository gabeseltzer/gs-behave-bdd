---
phase: 020-migration-registry
plan: "01"
subsystem: migrations
tags: [scaffolding, test, docs]
dependency_graph:
  requires: []
  provides: [registry-invariants-test, id-naming-convention-docblock]
  affects: [src/migrations/types.ts, test/unit/migrations/index.test.ts]
tech_stack:
  added: []
  patterns: [tdd-vacuous-pass, test-skip-placeholder]
key_files:
  created:
    - test/unit/migrations/index.test.ts
  modified:
    - src/migrations/types.ts
decisions:
  - "Q1 resolved: test path is test/unit/migrations/ (runner globs **/unit/**/*.test.js; src/ path missed)"
  - "Q2 resolved: wrapper functions kept as shims; deletion is Phase 22"
  - "Q3 resolved: activation wiring (evaluateAllMigrations) added in Plan 05"
metrics:
  duration: ~10 minutes
  completed: 2026-05-08
---

# Phase 20 Plan 01: Scaffolding Summary

**One-liner:** Registry invariant test gate (id uniqueness + naming convention) plus id naming convention docblock on MigrationEntry.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Document entry-id naming convention in types.ts | e24de3d | src/migrations/types.ts |
| 2 | Add registry-level invariants test | 2c6f462 | test/unit/migrations/index.test.ts |

## Verification Results

- `npx eslint src --ext ts` — exits 0, no output (clean)
- `npm run compile` — webpack compiled successfully
- `npm run compile-tests && node ./out/test/test/unit/run.js` — 741 passing, 1 pending (the skip)
- Suite "Phase 20 — migrations registry invariants" visible in runner output
- Tests 1+2 pass vacuously against empty registry; test 3 is `test.skip` with TODO pointing at Plan 05

## Resolved Open Questions

**Q1 (test path):** `test/unit/migrations/<area>.test.ts` — confirmed by reading `test/unit/run.ts:22` which globs `**/unit/**/*.test.js` against `out/test/`. Source-colocated tests at `src/migrations/*.test.ts` would compile to `out/src/...` and be missed.

**Q2 (wrapper exports):** `migrateLegacySuppressMultiConfig` / `migrateLegacyFeaturesPath` kept as thin shims. `test/unit/notifications.test.ts` imports both at L10/L12 and exercises ~30 sub-cases against them; deletion deferred to Phase 22.

**Q3 (activation wiring):** `evaluateAllMigrations` is not yet called in `src/extension.ts` (0 hits confirmed). Plan 05 wires it into the per-workspace activation loop.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — this plan adds only a docblock and a test. No production data or UI-rendering paths touched.

## Threat Flags

None — no new trust boundaries introduced. This plan only modifies a TSDoc comment and adds a test file.

## Self-Check: PASSED

- [x] `src/migrations/types.ts` contains `-from-behavevsc` and `-self` docblock
- [x] `test/unit/migrations/index.test.ts` exists
- [x] Commit e24de3d exists (`git log` confirmed)
- [x] Commit 2c6f462 exists (`git log` confirmed)
- [x] 741 tests passing (was 739 + 2 new vacuous + 1 skip = 741 pass / 1 pending)
