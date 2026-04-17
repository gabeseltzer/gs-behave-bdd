---
phase: 05-integration-verification
plan: 03
subsystem: testing

tags:
  - integration-test
  - watcher
  - filesystemwatcher
  - end-to-end
  - watcher-integration

# Dependency graph
requires:
  - phase: 04-config-watcher-run-guard
    provides: configWatcher.ts (FileSystemWatcher + 500ms debounce + cache invalidate + parser rerun)
  - plan: 05-01
    provides: example-projects/watcher-integration/ fixture with paired features/ and features-alt/ directories
  - plan: 05-02
    provides: waitForTestTree predicate-poll helper
provides:
  - End-to-end verification that the Phase 4 FileSystemWatcher delete/create/change flow updates ctrl.items and getDiscoveryEntry().source observably
  - Snapshot-restore protocol (D-09) so the fixture's behave.ini is left clean after every run
  - test/integration/watcher-integration suite/ directory with index.ts glob entrypoint
affects:
  - 05-04 (sibling runGuard.test.ts lives in this suite directory; index.ts glob `**.test.js` picks it up automatically)
  - 05-05 (suite is registered in runTestSuites.ts, becomes the 14th integration suite)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Linear D-08 test sequencing: each test's final state is the next test's starting state — no beforeEach restore between watcher tests"
    - "Authoritative restore via suiteTeardown only (D-09) — per-test try/finally blocks intentionally no-op to preserve D-08 chain"
    - "Predicate-poll integration tests via waitForTestTree (D-11/D-12): 100ms cadence, timeout 15000ms after Windows FS latency fix"
    - "Cache + tree dual assertion (D-17/D-18): assert on getDiscoveryEntry().source AND scenario presence in ctrl.items"

key-files:
  created:
    - test/integration/watcher-integration suite/extension.test.ts
    - test/integration/watcher-integration suite/index.ts
  modified: []

key-decisions:
  - "Per-test try/finally blocks left INTENTIONALLY no-op per design_notes — adding restore would break D-08 chain (Test B needs Test A's no-config end state, Test C needs Test B's paths=features-alt end state). suiteTeardown is the authoritative restore."
  - "Initial 5000ms timeout raised to 15000ms in fix b54de65 — Windows FileSystemWatcher delivers delete events with 1-5s latency in practice; 5000ms expired before watcher fired + 500ms debounce + parse"
  - "config.integrationTestRun = true is compatible with this suite per Pitfall 14 — configWatcher bypasses configurationChangedHandler and calls getUrisOfWkspFoldersWithFeatures(true) + parser.parseFilesForWorkspace directly"
  - "Composite predicate returns { entry, scenario } so the assertion block operates on typed values without refetching"

patterns-established:
  - "watcher-integration suite test layout: suiteSetup snapshots fixture state, three linear D-08 tests, suiteTeardown unconditionally restores"
  - "**.test.js glob entrypoint for the suite so future sibling .test.ts files (e.g. runGuard.test.ts in Plan 05-04) are discovered without index.ts edits"

requirements-completed: []

# Metrics
duration: ~5 min initial + ~2 min Windows-latency fix
completed: 2026-04-17
---

# Phase 5 Plan 3: Watcher Integration Test Suite Summary

**Created `test/integration/watcher-integration suite/` with three linear delete → create → change tests that exercise the Phase 4 FileSystemWatcher end-to-end inside a real VS Code extension host, asserting on observable DiscoveryEntry transitions and ctrl.items scenario visibility.**

## Performance

- **Duration:** ~5 min initial authoring (commit `e2f242c`), ~2 min Windows-latency fix (commit `b54de65`)
- **Completed:** 2026-04-17
- **Tasks:** 2
- **Files created:** 2 (160 + 5 = 165 lines)

## Accomplishments
- Authored 160-line three-test suite covering Phase 4 FileSystemWatcher delete/create/change flows
- Authored 5-line glob entrypoint that auto-discovers sibling `.test.js` files (extension.test.ts now, runGuard.test.ts in Plan 05-04)
- Wired `waitForTestTree` (Plan 05-02) to gate every assertion on observable cache+tree state
- Implemented snapshot-restore protocol — `originalBehaveIni` captured in `suiteSetup`, restored in `suiteTeardown`, so CI working tree stays clean
- Verified Pitfall 14 compatibility: `config.integrationTestRun = true` does NOT prevent the watcher from firing (configWatcher.ts bypasses configurationChangedHandler)
- Patched Windows FS watcher latency (1-5s for delete events) by raising timeout from 5000ms → 15000ms in three test predicates

## Task Commits

1. **Task 1+2: Create suite + index** — `e2f242c` (test)
   - `test(05-03): create watcher integration test suite`
   - Both files (extension.test.ts + index.ts) landed in one atomic commit; suite compiled clean on first run
2. **Windows FS latency fix** — `b54de65` (fix)
   - `fix(05-03): increase watcher test timeout to 15s for Windows FS latency`
   - Discovered during the Plan 05-05 three-run flakiness gate; not a deviation from plan content but an empirical adjustment to the D-12 timeout budget for Windows-specific FS event delivery

## Files Created/Modified
- `test/integration/watcher-integration suite/extension.test.ts` — Three-test suite. `suiteSetup` snapshots behave.ini and activates the extension. Tests delete/create/change behave.ini in linear order (D-08), each waiting on a composite `{ entry: DiscoveryEntry, scenario: vscode.TestItem }` predicate via `waitForTestTree`. `suiteTeardown` writes `originalBehaveIni` back unconditionally.
- `test/integration/watcher-integration suite/index.ts` — Glob entrypoint: `runner('**/watcher-integration suite/**.test.js')`. Picks up extension.test.ts now and runGuard.test.ts in Plan 05-04 without further index.ts edits.

## Decisions Made

- **Per-test finally blocks intentionally no-op** — per the `<design_notes>` block in 05-03-PLAN.md. Adding `fs.writeFileSync(behaveIniPath, originalBehaveIni)` inside any per-test finally would break D-08's state-chain contract: Test B requires Test A's "no config" end state, Test C requires Test B's "paths = features-alt" end state. `suiteTeardown` is Mocha's unconditional cleanup hook (runs even after test failure) and is the AUTHORITATIVE restore.
- **Composite predicate returns `{ entry, scenario }`** — lets the assertion block operate on already-fetched typed values; no refetching, no race between predicate-success and assertion-fetch.
- **Test C predicate explicitly asserts `altScenario` is absent** — proves the tree actually re-parsed (dropping features-alt scenarios) rather than just appending features scenarios on top.
- **15000ms timeout (post-fix)** — empirically required for Windows FileSystemWatcher delete-event latency (1-5s) plus 500ms configWatcher debounce plus parser rerun plus CI slack. Original 5000ms expired before the watcher delivered the delete event in the first run of the flakiness gate.

## Deviations from Plan

- **Timeout values raised from 5000 → 15000ms** in all three test predicates. Plan originally specified `{ intervalMs: 100, timeoutMs: 5000 }` per D-12. Empirical Windows behavior required the increase. This is an updated D-12 value, not an architectural deviation — interval and the predicate-poll strategy are unchanged.

## Issues Encountered

- **Initial 5000ms timeout failed on Windows** — first execution of the Plan 05-05 three-run flakiness gate timed out on Test A (delete behave.ini). Root cause: Windows FileSystemWatcher delivers delete events 1-5 seconds after the underlying syscall completes (compared to <100ms on Linux/macOS). Resolution: bumped timeout to 15000ms across all three predicates in commit `b54de65`. After the fix, all three subsequent runs of the flakiness gate passed clean.

## Threat Surface Scan

T-05-03 (fixture tampering): mitigated as planned via `suiteTeardown` snapshot-restore. Best-effort try/catch inside teardown swallows fs errors so cleanup doesn't mask test failures. Residual risk: SIGKILL between test failure and `suiteTeardown` could leave dirty state — accepted because git surfaces the dirty tree on next `git status`.

T-05-04 (info disclosure via timeout error): accepted — JSON-serialized DiscoveryEntry contains absolute fs paths from the CI runner's own checkout, no secrets.

## Downstream Consumption Contract

- **Plan 05-04 (runGuard.test.ts)** lands as a sibling file in this same `watcher-integration suite/` directory. The `**.test.js` glob in index.ts discovers it without further edits.
- **Plan 05-05 (runTestSuites.ts)** registers this suite directory as the 14th integration suite via `getShortPathOnWindows(path.resolve(__dirname, './watcher-integration suite'))`.

## User Setup Required

None — purely automated tests against the existing VS Code Extension Host launch from `@vscode/test-electron`.

## Next Phase Readiness

- Suite directory ready for Plan 05-04's sibling runGuard.test.ts
- Suite ready for Plan 05-05 registration in runTestSuites.ts
- Compile-clean under strict mode; no unit-test regressions
- 15000ms timeout proven sufficient for Windows in flakiness gate runs

## Self-Check: PASSED

Verified on 2026-04-17:

- FOUND: `test/integration/watcher-integration suite/extension.test.ts`
- FOUND: `test/integration/watcher-integration suite/index.ts`
- FOUND: three test names in source (`delete behave.ini`, `create behave.ini with paths = features-alt`, `change behave.ini to paths = features`)
- FOUND: `waitForTestTree` import from `'../suite-shared/waitForTestTree'`
- FOUND: `integrationTestRun = true` setup
- FOUND: `originalBehaveIni` snapshot/restore in suiteSetup/suiteTeardown
- FOUND: D-08/D-09 tension comments inside each test's no-op finally block
- FOUND: 15000ms timeoutMs (post-fix value) in all three predicates
- FOUND: commits `e2f242c` and `b54de65` are ancestors of HEAD

---
*Phase: 05-integration-verification*
*Plan: 03*
*Completed: 2026-04-17*
