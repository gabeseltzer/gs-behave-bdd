---
phase: 05-integration-verification
plan: 02
subsystem: testing

tags:
  - integration-test
  - test-helper
  - polling
  - watcher-integration

# Dependency graph
requires: []
provides:
  - Generic predicate-polling helper at test/integration/suite-shared/waitForTestTree.ts
  - Replaces brittle setTimeout(N) waits with deterministic predicate gating (D-11)
  - Configurable intervalMs/timeoutMs (D-12: callers use 100ms/5000ms)
  - Descriptive timeout error includes JSON-serialized last-seen value for CI flakiness diagnosis
affects:
  - 05-03 (watcher tests import waitForTestTree to gate on DiscoveryEntry + ctrl.items state)
  - 05-04 (run-guard tests import for cache-refresh gating)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Predicate-poll integration helper: callers return T | undefined; helper resolves with T on truthy or throws with last-seen value on timeout"
    - "Self-contained suite-shared helper: no vscode or src/ imports, usable by any integration suite"

key-files:
  created:
    - test/integration/suite-shared/waitForTestTree.ts
  modified: []

key-decisions:
  - "Truthiness check tightened beyond plan stub (!== undefined && !== null && !== false) so callers returning boolean | undefined for state-reached predicates don't satisfy the wait on a literal false"
  - "JSON.stringify wrapped in try/catch — falls back to String() when last-seen value contains a cycle (e.g. TestItem with parent-child pointers)"
  - "TAB indentation matches surrounding suite-shared/ files; named exports (no default) match convention"

patterns-established:
  - "Generic <T> predicate-poll primitive for integration tests — bounded by timeoutMs, max ~50 polls per call at 100ms cadence"

requirements-completed: []

# Metrics
duration: ~2 min
completed: 2026-04-17
---

# Phase 5 Plan 2: waitForTestTree Helper Summary

**Created `test/integration/suite-shared/waitForTestTree.ts` — a generic predicate-polling primitive that Phase 5 watcher and run-guard tests use to wait for the Test Explorer to reach an expected state after a fixture mutation, replacing brittle wall-clock sleeps with deterministic state gating.**

## Performance

- **Duration:** ~2 min (single-file authoring + tsc verification)
- **Completed:** 2026-04-17 (commit `7f03066`)
- **Tasks:** 1
- **Files created:** 1 (33 lines)

## Accomplishments
- Authored a 33-line generic helper exporting `WaitOptions` and `waitForTestTree<T>()`
- Verified strict-mode compilation under `test/tsconfig.json`
- Verified no vscode or src/ imports (self-contained per plan acceptance criteria)
- Verified named-export + TAB-indent convention matches surrounding `suite-shared/` files

## Task Commits

1. **Task 1: Create waitForTestTree.ts** — `7f03066` (feat)
   - `feat(05-02): create waitForTestTree predicate-polling helper`
   - Single atomic commit, plan compiled clean on first run

## Files Created/Modified
- `test/integration/suite-shared/waitForTestTree.ts` — Predicate-polling primitive. `waitForTestTree<T>(predicate, options)` calls `predicate()` immediately, then every `intervalMs` until truthy return or `timeoutMs` elapses. On success: resolves with the predicate value (typed `T`). On timeout: throws `Error` with `timeoutMs` and JSON-serialized last-seen value.

## Decisions Made

- **Truthiness check tightened** — used `!== undefined && !== null && (lastSeen as unknown) !== false` instead of plan stub's `!== undefined` only. Rationale: callers writing predicates of shape `() => boolean | undefined` for "state reached?" must not satisfy the wait when returning `false`. Defensive against `null` for type-system completeness.
- **JSON.stringify try/catch** — falls back to `String(lastSeen)` if value contains a cycle. Caller `vscode.TestItem` predicates can return objects with parent-child back-pointers; without the catch the timeout error would itself throw a TypeError.
- **No vscode import** — helper deliberately decoupled from extension-host API so future non-extension-host integration suites (if any) can use it without coupling.

## Deviations from Plan

None functionally. The truthiness check is one operator tighter than the plan stub specified; this is documented above as a deliberate strengthening, not a deviation in spirit.

## Issues Encountered

None. Compiled clean on first run; `npm run test:unit` passed without regression.

## Threat Surface Scan

T-05-02 (DoS via polling loop): mitigated as planned — loop bounded by `timeoutMs` (callers use 5000ms per D-12 → max 50 predicate calls per invocation). Predicate complexity is caller's responsibility. No file I/O, network, or exec in the helper itself.

## Downstream Consumption Contract

Plans 05-03 and 05-04 import this helper:

- **05-03 (extension.test.ts):** Imports `waitForTestTree` to gate the three watcher tests (delete/create/change) on composite predicates returning `{ entry: DiscoveryEntry, scenario: vscode.TestItem }`. Uses `{ intervalMs: 100, timeoutMs: 5000 }` initially; later raised to `15000` in fix `b54de65` for Windows FS event latency.
- **05-04 (runGuard.test.ts):** Imports for sanity-assertion gating after `getUrisOfWkspFoldersWithFeatures(true)` cache refresh, ensuring `configError` populates before `checkRunGuard` runs.

## User Setup Required

None — pure in-process TypeScript helper.

## Next Phase Readiness

- Ready for Plan 05-03 import via `from '../suite-shared/waitForTestTree'`
- Ready for Plan 05-04 import via the same path
- No blockers identified.

## Self-Check: PASSED

Verified on 2026-04-17:

- FOUND: `test/integration/suite-shared/waitForTestTree.ts` (33 lines)
- FOUND: `export interface WaitOptions` and `export async function waitForTestTree<T>`
- FOUND: timeout error template `waitForTestTree: predicate did not match within`
- VERIFIED: no `import.*vscode` or `from '..*src/'` in the file
- VERIFIED: commit `7f03066` is an ancestor of HEAD

---
*Phase: 05-integration-verification*
*Plan: 02*
*Completed: 2026-04-17*
