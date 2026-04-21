---
phase: 10-featurespaths-user-facing-setting
plan: 01
subsystem: settings
tags: [vscode-settings, multi-path, configuration]

requires:
  - phase: 07-types-and-settings-core
    provides: precedence ladder, plural featuresPaths field in WorkspaceSettings
  - phase: 08-multi-path-consumer-wiring
    provides: path-group TestItems, multi-path consumer wiring

provides:
  - featuresPaths array setting declared in package.json (VS Code recognizes the key)
  - hasExplicitNonEmptyArraySetting function for array setting detection
  - "Both set" info log in precedence ladder
  - testWorkspaceConfig default fixed for featuresPaths
  - 9 unit tests covering all new behaviors

affects: [phase-11-regression-fixtures]

tech-stack:
  added: []
  patterns:
    - "hasExplicitNonEmptyArraySetting: array-aware companion to hasExplicitSetting that treats [] as unset"

key-files:
  created: []
  modified:
    - package.json
    - src/common.ts
    - src/settings.ts
    - src/testWorkspaceConfig.ts
    - test/unit/settings/multiPathPrecedence.test.ts
    - test/unit/settings/discoveryPriority.test.ts

key-decisions:
  - "hasExplicitNonEmptyArraySetting is a separate function (not merged into hasExplicitSetting) to preserve backward compat of the boolean return type"
  - "Both-set info log uses logger.logInfo (not warn) per D-08 — advisory, not an error"

patterns-established:
  - "Array setting detection: use hasExplicitNonEmptyArraySetting for array-type settings where empty-array means unset"

requirements-completed: [MP-03]

duration: 8min
completed: 2026-04-21
---

# Phase 10: featuresPaths User-Facing Setting Summary

**Declared `featuresPaths` as a first-class VS Code array setting with full backward compatibility, both-set detection, and 9 unit tests.**

## Performance

- **Duration:** ~8 min
- **Tasks:** 3/3 completed
- **Files modified:** 6

## Accomplishments

- `gs-behave-bdd.featuresPaths` declared in package.json with `type: array`, `scope: resource`, `default: []`
- `featuresPath` description updated with cross-reference to plural setting
- `hasExplicitNonEmptyArraySetting()` added to common.ts — treats `[]` as unset (D-14)
- Branch A gate extended to recognize `featuresPaths` as an explicit setting
- "Both featuresPath and featuresPaths are set" info log fires in Rung 1 of precedence ladder
- `testWorkspaceConfig.ts` returns `[]` instead of `undefined` for unset `featuresPaths`
- 9 new unit tests: 3 both-set log, 5 hasExplicitNonEmptyArraySetting, 1 TestWorkspaceConfig default

## Task Commits

1. **Task 1: Declare featuresPaths in package.json** — `e28afd9` (feat)
2. **Task 2: hasExplicitNonEmptyArraySetting + both-set info log + testWorkspaceConfig fix** — `044e8b4` (feat)
3. **Task 3: Unit tests** — `7bb06a8` (test)

## Files Created/Modified

- `package.json` — Added `gs-behave-bdd.featuresPaths` array setting declaration, updated `featuresPath` description
- `src/common.ts` — Added `hasExplicitNonEmptyArraySetting()`, extended Branch A gate
- `src/settings.ts` — Added `hasExplicitSetting` import, both-set info log in Rung 1
- `src/testWorkspaceConfig.ts` — Fixed `featuresPaths` get() to return `[]` when unset
- `test/unit/settings/multiPathPrecedence.test.ts` — Added both-set log tests (3) + TestWorkspaceConfig default test (1)
- `test/unit/settings/discoveryPriority.test.ts` — Added hasExplicitNonEmptyArraySetting tests (5)

## Decisions Made

None — followed plan as specified.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Self-Check: PASSED

- [x] `npx eslint src --ext ts` exits 0
- [x] `npm run test:unit` passes (611 tests, 0 failures — 9 new)
- [x] All must-have artifacts present
- [x] All must-have truths verified via tests
