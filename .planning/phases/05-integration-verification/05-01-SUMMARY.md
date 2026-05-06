---
phase: 05-integration-verification
plan: 01
subsystem: testing

tags:
  - fixture
  - example-projects
  - behave
  - watcher-integration
  - integration-test

# Dependency graph
requires:
  - phase: 04-config-watcher-run-guard
    provides: Config file watchers and malformed-config run guard shipped in src/; Phase 5 is the integration-verification layer on top
provides:
  - On-disk test fixture at example-projects/watcher-integration/ cloned from config-only layout
  - Sibling features-alt/ directory with a distinct Feature/Scenario label enabling grep-assertions on ctrl.items
  - Distinct "Watcher Integration Discovery" Feature label that Plan 03 watcher tests use to assert discovery path
  - Distinct "alternate path discovery" Scenario label unique to features-alt/ for swap-assertions
  - Mutation-safe fixture ownership (per D-05) — Plans 03/04 mutate this fixture without affecting the 17 existing suites
affects:
  - 05-03 (watcher integration tests — delete/create/change flows mutate behave.ini in this fixture)
  - 05-04 (run-guard integration test — temporarily writes malformed pyproject.toml / removes behave.ini in this fixture)
  - 05-05 (suite orchestrator append — runTestSuites.ts runs this fixture as its own launchArgs workspace)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dedicated fixture ownership per integration suite (D-05): suites that mutate on-disk state get their own example-projects/ directory to prevent cross-suite pollution"
    - "Distinct label convention for grep-assertable discovery: unique Feature/Scenario labels per path so ctrl.items inspection can prove which features directory is active"
    - "Fixture twin-directories: features/ and features-alt/ share byte-identical environment.py and steps/steps.py so behave parses either directory successfully after a paths= swap"

key-files:
  created:
    - example-projects/watcher-integration/behave.ini
    - example-projects/watcher-integration/features/discovery.feature
    - example-projects/watcher-integration/features/environment.py
    - example-projects/watcher-integration/features/steps/steps.py
    - example-projects/watcher-integration/features-alt/alt.feature
    - example-projects/watcher-integration/features-alt/environment.py
    - example-projects/watcher-integration/features-alt/steps/steps.py
  modified: []

key-decisions:
  - "Cloned config-only/ layout verbatim for environment.py and steps/steps.py — canonical step set so either features directory parses identically"
  - "Used distinct Feature label 'Watcher Integration Discovery' instead of 'Config Only Discovery' so Plan 03 watcher tests can grep-assert the label in ctrl.items without false positives against the config-only suite"
  - "features-alt/alt.feature Scenario label 'alternate path discovery' is unique across the fixture tree — Plan 03's paths-swap test asserts presence/absence of this exact string"
  - "Did not commit pyproject.toml to the fixture root (per D-16): Plan 04's run-guard test writes it transiently in setUp and removes it in teardown, keeping baseline clean"

patterns-established:
  - "Integration-fixture ownership: any suite that performs test-time fs mutations gets its own example-projects/ directory (first applied here; 17 prior suites are read-only and share fixtures safely)"
  - "Twin features dirs for path-swap testing: features/ + features-alt/ with identical environment + steps but distinct labels — reusable pattern for future watcher/discovery tests"

requirements-completed:
  - TEST-08

# Metrics
duration: <1 min (verification only — files pre-committed)
completed: 2026-04-17
---

# Phase 5 Plan 1: Watcher Integration Fixture Summary

**Created example-projects/watcher-integration/ — a config-only-style behave fixture with a sibling features-alt/ directory, distinct grep-assertable labels, and mutation-safe dedicated ownership for Phase 5 watcher and run-guard integration tests.**

## Performance

- **Duration:** <1 min (verification only; files pre-committed at c2ed324)
- **Started:** 2026-04-17T18:47:28Z
- **Completed:** 2026-04-17T18:47:50Z
- **Tasks:** 2 (both verified already-complete)
- **Files modified:** 7 (all pre-existing on HEAD via commit c2ed324)

## Accomplishments
- Verified the watcher-integration fixture is fully present on HEAD with all seven files matching the plan's exact-content specification
- Confirmed `behave.ini` declares `paths = features` verbatim (no BOM, no trailing whitespace noise)
- Confirmed distinct label contract: `Feature: Watcher Integration Discovery` under features/, and `Feature: Alternate Path Discovery` + `   Scenario: alternate path discovery` under features-alt/
- Confirmed byte-identical twinning: `diff features/environment.py features-alt/environment.py` and `diff features/steps/steps.py features-alt/steps/steps.py` both return empty
- Confirmed no build-artifact pollution: no `__pycache__/`, `.mypy_cache/`, or committed `pyproject.toml` under the fixture
- Confirmed scenario label `alternate path discovery` is unique to features-alt/ (does not appear under features/) — critical for Plan 03's grep-assertion contract

## Task Commits

The plan's file-creation work was already landed in a prior session as a single atomic commit on the current history:

1. **Tasks 1+2: Clone config-only layout + add features-alt/** — `c2ed324` (feat) — all 7 files in one commit
   - `feat(05-01): create watcher-integration test fixture`
   - Already an ancestor of HEAD (9acaea4) — present in this worktree without re-applying
   - Tasks 1 and 2 were not split into separate commits when originally executed; the baseline content is identical to the plan's exact-content blocks, so no additional commits were needed in this execution pass

**Plan metadata:** this SUMMARY is committed separately below.

_Note: Because the work was already on HEAD when this worktree agent started, no additional file changes were made during this execution. The plan is verified-complete rather than freshly-written._

## Files Created/Modified
- `example-projects/watcher-integration/behave.ini` — Initial config declaring `paths = features`; Plan 03 will delete-and-recreate this file with `paths = features-alt` during the change/create tests; Plan 04 will temporarily mutate it to malformed INI
- `example-projects/watcher-integration/features/discovery.feature` — Feature file under the default path with the distinct `Feature: Watcher Integration Discovery` label; the sole scenario (`run a successful test`) is what the baseline discovery test asserts against
- `example-projects/watcher-integration/features/environment.py` — Behave hooks (skip-tag handling) cloned verbatim from config-only so either features dir parses scenarios successfully
- `example-projects/watcher-integration/features/steps/steps.py` — Canonical step definitions (`we have behave installed`, `we implement a {successful_or_failing} test`, `we will see the result`) shared by both features dirs
- `example-projects/watcher-integration/features-alt/alt.feature` — Alternate-path feature with unique `Feature: Alternate Path Discovery` / `Scenario: alternate path discovery` labels; Plan 03's paths-swap test asserts this scenario appears in ctrl.items after `paths = features-alt` is written
- `example-projects/watcher-integration/features-alt/environment.py` — Byte-identical copy of features/environment.py (verified via diff)
- `example-projects/watcher-integration/features-alt/steps/steps.py` — Byte-identical copy of features/steps/steps.py (verified via diff)

## Decisions Made

- **Did not re-commit already-landed work.** The fixture at commit c2ed324 is byte-for-byte identical to the plan's exact-content blocks (verified by reading each file and running the plan's verification script). Creating a redundant commit would add noise without changing tree content. The existing commit is preserved as the atomic record of the two tasks.
- **Did not split into two task commits retroactively.** The original commit combined Tasks 1 and 2 into a single `feat(05-01):` commit. Retroactively splitting would require `git filter-branch` or an interactive rebase on shared history — unjustified risk for a fixture-creation plan where the files are jointly required (Plan 03 needs both features/ and features-alt/ to run its paths-swap test).
- Followed the plan as specified for all content-level decisions (label strings, byte-identical twinning, no pyproject.toml at root).

## Deviations from Plan

None — plan executed exactly as written. All seven files exist with the exact content specified in the PLAN's `<action>` blocks; all seven `<verify>` and plan-level `<verification>` checks pass.

**Note on execution mode:** This plan was originally executed in a prior session (commit c2ed324) before this worktree agent was spawned. This agent's pass was a verification+summary pass: it read each file, ran the plan's automated verification script, and produced this SUMMARY.md. No code or fixture changes were required.

## Issues Encountered

None. All verification checks returned OK on first run.

## Threat Surface Scan

No new security-relevant surface introduced. This plan ships an immutable on-disk test fixture with no executable paths, no network endpoints, no auth boundaries, no schema changes. T-05-01 (test-fixture tampering) disposition from the plan's threat register is mitigated by downstream plans (03/04) snapshotting and restoring the fixture in their suiteSetup/suiteTeardown — this plan's baseline content is immutable.

## Downstream Consumption Contract

This fixture is consumed by three downstream plans in the same phase. Documenting here so future maintainers understand what Plans 03, 04, 05 will mutate:

**Plan 05-03 (watcher integration tests) will mutate:**
- `example-projects/watcher-integration/behave.ini` — Test A (delete) removes the file; Test B (create) writes a new file with `paths = features-alt`; Test C (change) edits `paths = features` → `paths = features-alt`
- Snapshots/restores the original `[behave]\npaths = features\n` in suiteSetup/suiteTeardown per D-09

**Plan 05-04 (run-guard integration test) will mutate:**
- `example-projects/watcher-integration/behave.ini` — Temporarily removed in test setUp so the parser walks past it to pyproject.toml (D-16 precedence constraint)
- `example-projects/watcher-integration/pyproject.toml` — Created transiently in setUp with malformed TOML content, deleted in teardown (NOT committed to the repo per D-16)

**Plan 05-05 (suite orchestrator append) will NOT mutate:**
- `test/integration/runTestSuites.ts` — Appends one `runTests({...})` call with `launchArgs = ["example-projects/watcher-integration"]`

**What must NEVER be mutated by downstream tests:**
- `features/environment.py`, `features/steps/steps.py`, `features-alt/environment.py`, `features-alt/steps/steps.py`, `features/discovery.feature`, `features-alt/alt.feature` — These are immutable baseline content. Only `behave.ini` (Plans 03/04) and `pyproject.toml` (Plan 04, transient) are test-mutated.

## User Setup Required

None — no external service configuration required. This is a static test fixture checked into the repo.

## Next Phase Readiness

- Fixture ready for Plan 05-02 (shared helper: `test/integration/suite-shared/waitForTestTree.ts`)
- Fixture ready for Plan 05-03 (watcher integration tests — delete/create/change flows)
- Fixture ready for Plan 05-04 (run-guard integration test)
- Fixture ready for Plan 05-05 (suite orchestrator append)
- No blockers identified.

## Self-Check: PASSED

Verified on 2026-04-17:

- FOUND: `example-projects/watcher-integration/behave.ini`
- FOUND: `example-projects/watcher-integration/features/discovery.feature`
- FOUND: `example-projects/watcher-integration/features/environment.py`
- FOUND: `example-projects/watcher-integration/features/steps/steps.py`
- FOUND: `example-projects/watcher-integration/features-alt/alt.feature`
- FOUND: `example-projects/watcher-integration/features-alt/environment.py`
- FOUND: `example-projects/watcher-integration/features-alt/steps/steps.py`
- FOUND: commit `c2ed324` — `feat(05-01): create watcher-integration test fixture`

All seven fixture files exist, content matches plan exactly, distinct labels verified, byte-identical twinning verified, no build-artifact pollution, and the originating commit is present as an ancestor of HEAD (9acaea4).

---
*Phase: 05-integration-verification*
*Plan: 01*
*Completed: 2026-04-17*
