---
phase: 05-integration-verification
plan: 04
subsystem: testing

tags:
  - integration-test
  - run-guard
  - watcher-integration
  - guard-coverage

# Dependency graph
requires:
  - phase: 04-config-watcher-run-guard
    provides: checkRunGuard implementation in src/runners/testRunHandler.ts (GUARD-01..04)
  - plan: 05-01
    provides: example-projects/watcher-integration/ fixture (behave.ini snapshot/restore base)
  - plan: 05-03
    provides: watcher-integration suite/ directory and **.test.js glob entrypoint
provides:
  - End-to-end coverage of GUARD-01..04 against a REAL malformed-config cache entry
  - All four button branches verified: Run Anyway, Open Config File, Cancel, message-fragment assertion
  - Sanity assertion (assertConfigErrorOnPyproject) gates every test body to catch parser-precedence drift
affects:
  - 05-05 (this file is discovered by the same **.test.js glob and runs as part of the watcher-integration suite when registered in runTestSuites.ts)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D-16 precedence trick: snapshot+remove behave.ini in setup so configParser walks past INI precedence to malformed pyproject.toml; restore behave.ini and unlink pyproject.toml in teardown"
    - "Real pipeline integration: stub ONLY vscode.window.showWarningMessage and vscode.commands.executeCommand — leave getDiscoveryEntry, getUrisOfWkspFoldersWithFeatures, configParser as the production implementations"
    - "Sanity assertion gates each test body: assertConfigErrorOnPyproject checks getDiscoveryEntry(wkspUri).configError is defined and references pyproject.toml — catches future parser precedence changes that would silently re-break these tests"

key-files:
  created:
    - test/integration/watcher-integration suite/runGuard.test.ts
  modified: []

key-decisions:
  - "D-16 precedence: removed behave.ini in setup() so configParser advances to pyproject.toml. Restored from in-memory snapshot in teardown. Without this trick, every test fails because checkRunGuard short-circuits at testRunHandler.ts:121 when brokenWorkspaces.length === 0"
  - "Stubs scoped to vscode.window.showWarningMessage and vscode.commands.executeCommand only — the rest of the pipeline runs against the real common module / real configParser, which is what distinguishes this from the unit-level tests in test/unit/runners/testRunHandler.test.ts"
  - "Test 'Open Config File' asserts executeCommandStub.calledWith('vscode.open', ...) matches testRunHandler.ts:145 — the actual production side effect, not a mocked observation"
  - "TestRunRequest include argument uses undefined (not []) when no scenarios — the ?? fallback in checkRunGuard walks ctrl.items only on undefined/null, not on empty array"

patterns-established:
  - "Integration-level GUARD-coverage pattern: real cache + real parser + sinon stubs only at the user-prompt boundary"

requirements-completed: []

# Metrics
duration: ~5 min
completed: 2026-04-17
---

# Phase 5 Plan 4: Run Guard Integration Tests Summary

**Created `test/integration/watcher-integration suite/runGuard.test.ts` — four tests covering GUARD-01..04 (Run Anyway / Open Config File / Cancel / message-fragment) against a real malformed-config cache entry produced by the D-16 precedence trick.**

## Performance

- **Duration:** ~5 min
- **Completed:** 2026-04-17 (commit `a8ffc7e`)
- **Tasks:** 1
- **Files created:** 1 (160 lines)

## Accomplishments
- Authored 160-line four-test suite covering all three button branches plus message-fragment assertion
- Implemented D-16 precedence trick — snapshots behave.ini and removes it in setup so configParser walks past `[behave.ini, .behaverc, setup.cfg, tox.ini, pyproject.toml]` to the malformed pyproject.toml; restores behave.ini and unlinks pyproject.toml in teardown
- Wired sinon stubs scoped to `vscode.window.showWarningMessage` and `vscode.commands.executeCommand` — leaving `getDiscoveryEntry`, `getUrisOfWkspFoldersWithFeatures`, and the production `configParser` running against real implementations
- Implemented sanity assertion (`assertConfigErrorOnPyproject`) that gates every test body — fails fast and clearly if a future parser precedence change silently breaks the malformed-state setup
- Verified production message-fragment assertion: greps on `'pyproject.toml'` and `'parse errors'` from the literal `testRunHandler.ts:125` template

## Task Commits

1. **Task 1: Create runGuard.test.ts** — `a8ffc7e` (test)
   - `test(05-04): create run guard integration tests`
   - Single atomic commit, suite compiled clean on first run

## Files Created/Modified
- `test/integration/watcher-integration suite/runGuard.test.ts` — Four tests in a `suite('watcher-integration run guard')` block:
  1. **Run Anyway branch returns true (proceed)** — stub `showWarningMessage` resolves `'Run Anyway'`; assert `checkRunGuard` returns `true`
  2. **Open Config File branch returns false and invokes vscode.open** — stub resolves `'Open Config File'`; assert `checkRunGuard` returns `false` AND `executeCommand` was called with `'vscode.open'` and the broken workspace's `configFileUri`
  3. **Cancel branch returns false** — stub resolves `'Cancel'`; assert `checkRunGuard` returns `false`
  4. **Warning message contains filename and "parse errors" fragments** — stub resolves `'Cancel'`; assert the message argument to `showWarningMessage` contains the literal strings `'pyproject.toml'` and `'parse errors'`

## Decisions Made

- **D-16 precedence trick (snapshot+remove behave.ini in setup, restore in teardown).** Without this, configParser hits the valid behave.ini first and `searchConfigFiles` returns success, so `pyproject.toml` is never reached, no `configError` is populated on `DiscoveryEntry`, and `checkRunGuard` short-circuits at `testRunHandler.ts:121` (`if (brokenWorkspaces.length === 0) return true`). The trick is the reason this suite needs its own dedicated `watcher-integration` fixture (D-05) — mutating a shared fixture's behave.ini would break other suites.
- **Stub scope kept minimal** — only `vscode.window.showWarningMessage` (so the test can deliver a deterministic button response) and `vscode.commands.executeCommand` (so the test can observe the `vscode.open` side effect without launching an editor). The rest of the pipeline runs against real `getDiscoveryEntry`, real `getUrisOfWkspFoldersWithFeatures(true)` cache refresh, and real `configParser`. This is the integration contract — and what distinguishes this suite from the unit-level coverage in `test/unit/runners/testRunHandler.test.ts`.
- **Sanity assertion as a fast-fail trip-wire** — every test body calls `assertConfigErrorOnPyproject(wkspUri)` immediately after setup. If a future change to parser precedence (e.g. reordering `CONFIG_FILES` in `configParser.ts`) silently breaks the malformed-state setup, this assertion fails with a clear message instead of letting `checkRunGuard` short-circuit and produce a confusing "expected false, got true" assertion error 50 lines later.
- **`TestRunRequest` include uses `undefined`, not `[]`** — discovered while wiring `buildRequestForWorkspace`. The `?? ctrl.items` fallback in `checkRunGuard` walks `ctrl.items` only when `request.include` is undefined or null; passing `[]` triggers the no-broken-workspaces short-circuit.

## Deviations from Plan

None. Plan executed exactly as specified.

## Issues Encountered

None. Compiled clean on first run; passed all three flakiness-gate runs.

## Threat Surface Scan

T-05-05 through T-05-08 (test-fixture tampering, sinon-stub leakage, vscode.open side-effect bleed): all mitigated as planned via `sinon.restore()` in teardown plus the snapshot-restore protocol on behave.ini and the unlink in teardown for the transient pyproject.toml. No production attack surface introduced.

## Downstream Consumption Contract

- **Plan 05-05 (runTestSuites.ts registration)** picks up this file automatically through the `**/watcher-integration suite/**.test.js` glob in `index.ts` — no edits to `index.ts` or `runTestSuites.ts` are required for this file specifically; Plan 05-05 just adds the suite directory entry.
- The `pyproject.toml` and `behave.ini` mutations happen entirely within setup/teardown — no test artifact persists beyond the run.

## User Setup Required

None — purely automated.

## Next Phase Readiness

- File compiles clean under strict mode
- Ready for Plan 05-05 to register the parent suite directory
- All four tests proven green across the 3-run flakiness gate

## Self-Check: PASSED

Verified on 2026-04-17:

- FOUND: `test/integration/watcher-integration suite/runGuard.test.ts` (160 lines)
- FOUND: `suite('watcher-integration run guard'`
- FOUND: four `test('...'` blocks (Run Anyway / Open Config File / Cancel / warning message fragments)
- FOUND: `import { checkRunGuard } from '../../../src/runners/testRunHandler'`
- FOUND: `sinon.stub(vscode.window, 'showWarningMessage')` and `sinon.stub(vscode.commands, 'executeCommand')`
- FOUND: D-16 precedence trick — snapshot+unlink behave.ini in setup, restore in teardown
- FOUND: assertion on `'pyproject.toml'` and `'parse errors'` literal substrings (production message fragments)
- FOUND: `executeCommandStub.calledWith('vscode.open'` assertion in Open Config File test
- FOUND: commit `a8ffc7e` is an ancestor of HEAD

---
*Phase: 05-integration-verification*
*Plan: 04*
*Completed: 2026-04-17*
