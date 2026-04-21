---
phase: 11-ux-polish-regression-hardening
plan: 01
subsystem: testing
tags: [behave, fixtures, integration-tests, multi-path, monorepo]

requires:
  - phase: 10-featurespaths-user-facing-setting
    provides: featuresUris plural array and projectRelativeFeaturesPaths on WorkspaceSettings

provides:
  - multi-path/ fixture with behave.ini single-path baseline and dormant features-alt/
  - multi-path-settings/ fixture with .vscode/settings.json featuresPaths array
  - monorepo-scan/ fixture with 3 nested behave.ini configs at depths 1 and 2
  - logSettings plural unit test proving comma-joined output for multiple featuresUris

affects: [11-02, integration-tests]

tech-stack:
  added: []
  patterns: [fixture-per-discovery-path]

key-files:
  created:
    - example-projects/multi-path/behave.ini
    - example-projects/multi-path/features/multi_path_a.feature
    - example-projects/multi-path/features-alt/multi_path_b.feature
    - example-projects/multi-path-settings/.vscode/settings.json
    - example-projects/multi-path-settings/features/settings_a.feature
    - example-projects/multi-path-settings/features-alt/settings_b.feature
    - example-projects/monorepo-scan/app-a/behave.ini
    - example-projects/monorepo-scan/app-b/behave.ini
    - example-projects/monorepo-scan/packages/app-c/behave.ini
    - example-projects/monorepo-scan/node_modules/.gitkeep
    - test/unit/settings/logSettingsPlural.test.ts
  modified: []

key-decisions:
  - "Scenario counts differ per root (2 vs 1) for unambiguous tree assertions in Plan 02"
  - "node_modules/.gitkeep force-added via git add -f to survive .gitignore"

patterns-established:
  - "fixture-per-discovery-path: each integration test scenario gets its own example-projects/ directory"

requirements-completed: [TEST-14]

duration: 5min
completed: 2026-04-21
---

# Plan 11-01: Test Fixtures & logSettings Plural Unit Test

**Three integration test fixtures created under example-projects/ covering multi-path config, settings-based multi-path, and monorepo scanning — plus a unit test verifying plural featuresUris rendering in logSettings.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-21T16:00:00Z
- **Completed:** 2026-04-21T16:05:00Z
- **Tasks:** 2
- **Files modified:** 28

## Accomplishments
- Created `multi-path/` fixture with behave.ini single-path baseline (2 scenarios in primary, 1 in alt)
- Created `multi-path-settings/` fixture with .vscode/settings.json featuresPaths array (no behave.ini)
- Created `monorepo-scan/` fixture with 3 nested behave projects at depths 1 and 2, plus node_modules/ stub
- Added logSettings plural unit test — verifies comma-joined paths for multiple featuresUris

## Task Commits

Each task was committed atomically:

1. **Task 1: Create multi-path/ and multi-path-settings/ fixtures** - `6227e0a` (feat)
2. **Task 2: Create monorepo-scan/ fixture + logSettings plural unit test** - `93b2e0f` (feat)

## Files Created/Modified
- `example-projects/multi-path/` — 7 files: behave.ini + features with 2 scenarios + features-alt with 1 scenario
- `example-projects/multi-path-settings/` — 7 files: .vscode/settings.json + features with 2 scenarios + features-alt with 1 scenario
- `example-projects/monorepo-scan/` — 13 files: 3 behave projects (app-a, app-b, packages/app-c) + node_modules/.gitkeep
- `test/unit/settings/logSettingsPlural.test.ts` — Unit test for plural logSettings output

## Decisions Made
None - followed plan as specified.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
All three fixtures are ready for Plan 02 integration test suites. The monorepo-scan/node_modules/.gitkeep was force-added to survive .gitignore.

---
*Phase: 11-ux-polish-regression-hardening*
*Completed: 2026-04-21*
