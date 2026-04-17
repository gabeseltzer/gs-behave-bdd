---
phase: 05-integration-verification
plan: 05
subsystem: testing

tags:
  - integration-test
  - suite-registration
  - flakiness-gate
  - requirements-closure
  - watcher-integration

# Dependency graph
requires:
  - plan: 05-01
    provides: example-projects/watcher-integration/ fixture
  - plan: 05-02
    provides: waitForTestTree helper
  - plan: 05-03
    provides: watcher-integration suite/extension.test.ts (3 watcher tests)
  - plan: 05-04
    provides: watcher-integration suite/runGuard.test.ts (4 run-guard tests)
provides:
  - 14th integration suite registered in test/integration/runTestSuites.ts (was 13, now 14)
  - Three consecutive green-run flakiness gate satisfied on Windows (D-21)
  - TEST-08 closed: REQUIREMENTS.md checkbox + traceability row both flipped to Complete
affects:
  - Phase 5 closure: all 5 plans complete, Success Criterion 1 + 2 verified, TEST-08 satisfied
  - v1.1 milestone: TEST-08 was the last open requirement; Phase 6 (tech-debt cleanup) is the only remaining v1.1 work

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Suite registration: append runTests({...}) block between malformed-config and console.log closer in runTestSuites.ts"
    - "Three-consecutive-green-runs informal flakiness gate (D-21) on Windows before closing TEST-08"

key-files:
  created: []
  modified:
    - test/integration/runTestSuites.ts
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Inserted the 14th suite as a bare-string launchArgs entry (no template literal) — matches malformed-config and config-only convention since 'watcher-integration' has no spaces"
  - "extensionTestsPath uses './watcher-integration suite' (with the SPACE) to match Plan 05-03's directory name"
  - "Did not modify ROADMAP.md Success Criterion 2 wording errors — flagged as a follow-up in the Follow-ups section below"

patterns-established:
  - "GUARD coverage gate: TEST-08 closes only after 3 consecutive Windows runs, not just 1 — D-21 informal flakiness budget"

requirements-completed:
  - TEST-08

# Metrics
duration: ~25 min (1 min runTestSuites.ts edit + ~20 min three integration runs + ~2 min REQUIREMENTS.md edit)
completed: 2026-04-17
---

# Phase 5 Plan 5: Suite Registration + Flakiness Gate + TEST-08 Closure Summary

**Registered the watcher-integration suite as the 14th entry in `runTestSuites.ts`, ran the full integration battery three times in a row on Windows to satisfy the D-21 flakiness gate, and flipped TEST-08 to Complete in REQUIREMENTS.md — closing Phase 5 and the last open v1.1 requirement.**

## Performance

- **Duration:** ~25 min total (1 min file edit + 3 × ~7 min integration runs + 2 min REQUIREMENTS.md edit)
- **Completed:** 2026-04-17 (suite-registration commit `01bd4e7`; REQUIREMENTS.md update committed earlier with the broader Phase 5 work)
- **Tasks:** 3 (Task 1 auto, Task 2 checkpoint:human-verify, Task 3 auto)

## Accomplishments
- Appended the 14th `runTests({...})` entry to `test/integration/runTestSuites.ts` between the existing malformed-config block and the closing `console.log("test run complete")`
- Ran `npm run test:integration` three consecutive times on Windows; surfaced one transient timeout that prompted Plan 05-03's b54de65 fix; subsequent runs all green
- Flipped TEST-08 in `.planning/REQUIREMENTS.md` from `[ ]` → `[x]` in the testing-requirements checklist and from `Pending` → `Complete` in the traceability table
- Verified all 14 suites green across the final 3 consecutive runs
- Verified `git status example-projects/watcher-integration/` clean after each run (suiteTeardown + per-test cleanup behaves correctly under load)

## Task Commits

1. **Task 1: Append watcher-integration suite to runTestSuites.ts** — `01bd4e7` (test)
   - `test(05-05): register watcher-integration as 14th integration suite`
   - 9 lines added: launchArgs + extensionTestsPath + runTests block
2. **Task 2: Three-run flakiness gate** — no commit (verification-only)
   - First run failed on Plan 05-03 Test A (delete behave.ini timed out at 5000ms on Windows)
   - Plan 05-03 fix `b54de65` raised timeouts to 15000ms
   - Three subsequent consecutive runs all green
3. **Task 3: Flip TEST-08 to Complete** — committed alongside Phase 5 work (verified by `grep TEST-08 .planning/REQUIREMENTS.md`)
   - Two-line edit: checkbox at line 30 + traceability row at line 76

## Files Created/Modified
- `test/integration/runTestSuites.ts` — Added 14th `runTests({...})` block. `launchArgs = ["example-projects/watcher-integration"]` (bare string, no template literal — matches `config-only` and `malformed-config` style). `extensionTestsPath = getShortPathOnWindows(path.resolve(__dirname, './watcher-integration suite'))` — preserves the SPACE in the directory name to match Plan 05-03's suite layout. New block sits between the malformed-config block and the `console.log("test run complete")` closer.
- `.planning/REQUIREMENTS.md` — Two edits:
  - Line 30: `- [ ] **TEST-08**: ...` → `- [x] **TEST-08**: ...`
  - Line 76: `| TEST-08 | Phase 5 | Pending |` → `| TEST-08 | Phase 5 | Complete |`

## Decisions Made

- **Bare string launchArgs (no template literal)** — matches the surrounding malformed-config and config-only blocks since `watcher-integration` directory name has no spaces. Template literals are reserved for paths that need interpolation or contain spaces.
- **Did NOT modify ROADMAP.md** — even though ROADMAP Success Criterion 2 contains the wrong pre-existing suite count (says "17 integration test suites" when actual pre-existing count is 13). Plan revision is not the right surface for ROADMAP edits; flagged as a Follow-up below.
- **Three runs is the minimum acceptance threshold** — D-21 chose three over five as the practical sweet spot: catches most ordering-related flakiness without burning ~2 hours of local runner time.

## Deviations from Plan

- **One intermediate failure surfaced during the flakiness gate.** Plan 05-03's initial 5000ms timeouts proved insufficient on Windows for FileSystemWatcher delete-event delivery (1-5s latency observed). Resolution was to fix Plan 05-03 (commit `b54de65`) rather than relax the flakiness gate. After the fix, three consecutive runs passed clean. This is the GATE WORKING AS INTENDED — flakiness was caught before the requirement was closed.

## Issues Encountered

- **Initial run-1 timeout in Plan 05-03 Test A.** Root cause: Windows FileSystemWatcher delivers delete events with 1-5s latency vs. <100ms on Linux/macOS. Fix landed in commit `b54de65` (raised timeouts from 5000ms → 15000ms in all three watcher predicates). After fix, three consecutive runs all green. Total fix-and-retry overhead: ~10 min.
- **No other failures observed** across the three final runs — all 14 suites green, all 7 new tests (3 watcher + 4 run-guard) pass every run.

## Threat Surface Scan

T-05-09 (fixture tampering during test run): mitigated as planned. Post-run `git status example-projects/watcher-integration/` was clean after every one of the three final runs.

T-05-10 (DoS via three-runs CI cost): accepted per D-21. Three local Windows runs is the explicit gate cost in exchange for flakiness confidence.

## Follow-ups

- **ROADMAP.md Success Criterion 2 wording is numerically wrong.** Currently states "existing 17 integration test suites" and "18th integration suite". Actual: pre-existing count was 13, this plan made it the 14th. Recommended user edit:
  ```diff
  - existing 17 integration test suites
  + existing 13 integration test suites
  - 18th integration suite
  + 14th integration suite
  ```
  Located in `.planning/ROADMAP.md` Phase 5 section (around line 50-65). This was deliberately not fixed in this plan because plan revisions don't modify ROADMAP.md.

- **v1.1-MILESTONE-AUDIT.md human-UAT items obsoleted.** Five items previously flagged as needing human testing for the watcher + run-guard behavior are now covered by automation in this suite. Suggested cleanup is part of the Phase 6 admin scope.

## Downstream Consumption Contract

- **Phase 6 (v1.1 Tech Debt & Admin Cleanup)** can rely on: 14 green integration suites, TEST-08 closed, all v1.1 functional requirements satisfied. The remaining v1.1 work is doc cleanup, code-review fixes, and the ROADMAP wording correction noted above.

## User Setup Required

None — flakiness gate is `npm run test:integration` against the existing test-electron harness.

## Next Phase Readiness

- TEST-08 closed (REQUIREMENTS.md ✓ in both checklist and traceability)
- 14 integration suites all green in 3 consecutive Windows runs
- No regressions in any pre-existing suite
- Phase 5 complete — Phase 6 (tech debt cleanup) is the next focus per ROADMAP

## Self-Check: PASSED

Verified on 2026-04-17:

- FOUND: `launchArgs = ["example-projects/watcher-integration"]` in test/integration/runTestSuites.ts
- FOUND: `./watcher-integration suite` in test/integration/runTestSuites.ts
- VERIFIED: `grep -c "await runTests" test/integration/runTestSuites.ts` returns `14`
- FOUND: `- [x] **TEST-08**:` in .planning/REQUIREMENTS.md (checkbox flipped)
- FOUND: `| TEST-08 | Phase 5 | Complete |` in .planning/REQUIREMENTS.md (traceability flipped)
- VERIFIED: no `| TEST-08 | Phase 5 | Pending |` row remains
- FOUND: commit `01bd4e7` for runTestSuites.ts edit is an ancestor of HEAD

---
*Phase: 05-integration-verification*
*Plan: 05*
*Completed: 2026-04-17*
