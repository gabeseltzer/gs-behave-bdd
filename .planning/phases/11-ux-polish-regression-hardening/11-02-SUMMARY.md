---
phase: 11-ux-polish-regression-hardening
plan: 02
subsystem: testing
tags: [integration-tests, behave, multi-path, monorepo, watcher, config-edit]

requires:
  - phase: 11-ux-polish-regression-hardening
    provides: multi-path/, multi-path-settings/, monorepo-scan/ fixtures from Plan 01

provides:
  - multi-path integration suite with 3 chained config-edit tests (baseline→multi→revert)
  - multi-path-settings integration suite with 2 tests (discovery + scenario counts)
  - monorepo-scan integration suite with 4 tests (BFS scan + discoveryDepth=0 edge case)
  - All 3 suites wired into runTestSuites.ts

affects: [11-03, ci]

tech-stack:
  added: []
  patterns: [chained-config-edit-test, waitForTestTree-predicate-polling]

key-files:
  created:
    - test/integration/multi-path suite/index.ts
    - test/integration/multi-path suite/extension.test.ts
    - test/integration/multi-path-settings suite/index.ts
    - test/integration/multi-path-settings suite/extension.test.ts
    - test/integration/monorepo-scan suite/index.ts
    - test/integration/monorepo-scan suite/extension.test.ts
  modified:
    - test/integration/runTestSuites.ts

key-decisions:
  - "multi-path getWorkspaceUri uses endsWith to avoid false match with multi-path-settings"
  - "monorepo-scan discoveryDepth=0 test uses suiteTeardown to restore setting"

patterns-established:
  - "chained-config-edit-test: Tests A→B→C chain state with suiteTeardown as authoritative restore"
  - "discovery-assertion: Use getDiscoveryEntry().source and .featuresUris.length for cache state verification"

requirements-completed: [TEST-13]

duration: 8min
completed: 2026-04-21
---

# Plan 11-02: Integration Test Suites

**Three integration test suites covering multi-path config-edit, settings-based discovery, and monorepo BFS scanning — all wired into runTestSuites.ts with 17 total test instances.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-21T16:06:00Z
- **Completed:** 2026-04-21T16:14:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Created multi-path suite with 3 chained tests: single-path baseline → add second path → revert to single
- Created multi-path-settings suite with 2 tests: featuresPaths discovery and scenario count verification
- Created monorepo-scan suite with 4 tests: BFS scan, tree visibility, discoveryDepth=0 disable, and restore
- Wired all 3 suites into runTestSuites.ts (now 17 total runTests() calls)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create multi-path suite with chained config-edit tests** - `b9cf61d` (feat)
2. **Task 2: Create multi-path-settings + monorepo-scan suites and wire into runTestSuites.ts** - `2a29486` (feat)

## Files Created/Modified
- `test/integration/multi-path suite/` — 2 files: index.ts + extension.test.ts with 3 chained tests
- `test/integration/multi-path-settings suite/` — 2 files: index.ts + extension.test.ts with 2 tests
- `test/integration/monorepo-scan suite/` — 2 files: index.ts + extension.test.ts with 4 tests
- `test/integration/runTestSuites.ts` — Added 3 new runTests() blocks

## Decisions Made
None - followed plan as specified.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
All integration test suites are ready for the Windows CI flakiness gate in Plan 03. The suites need to be run with `npm run test:integration` to verify they pass end-to-end.

---
*Phase: 11-ux-polish-regression-hardening*
*Completed: 2026-04-21*
