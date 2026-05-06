---
phase: 08-parser-test-tree-watcher-multi-root
plan: 03
subsystem: watchers, handlers, runners
tags: [watcher, runner, extension, handlers, multi-path]

requires:
  - phase: 08-01
    provides: dedupResolvedPaths, diagnostic infrastructure
  - phase: 08-02
    provides: Multi-root parser layer, path-group TestItems

provides:
  - Per-root FileSystemWatcher fan-out (INT-02)
  - Multi-root queue filter in test runner
  - Plural logging in extension and settings
  - Per-root feature tag lookups in fixture/diagnostic handlers
  - Global step/fixture lookups verified correct for all handlers

affects: [phase-9, phase-10, phase-11]

tech-stack:
  added: []
  patterns:
    - "Per-root watcher loop: one FileSystemWatcher per featuresUris entry"
    - "Queue filter: idMatches array with .some() for multi-root test items"
    - "Handler D-07 rule: steps/fixtures global (singular), feature steps/tags per-root"

key-files:
  created: []
  modified:
    - src/watchers/workspaceWatcher.ts
    - src/runners/testRunHandler.ts
    - src/extension.ts
    - src/handlers/autoCompleteProvider.ts
    - src/handlers/codeLensProvider.ts
    - src/handlers/stepDiagnostics.ts
    - src/handlers/fixtureProviders.ts
    - src/handlers/fixtureDiagnostics.ts
    - src/settings.ts

key-decisions:
  - "autoComplete and codeLens use singular getter (confirmed correct per D-07 — global steps)"
  - "stepDiagnostics flatMaps featureFileSteps across all roots for union validation"
  - "fixtureProviders and fixtureDiagnostics use getFeaturesRootForFile for feature tag lookups"
  - "Watcher fan-out replaces old watcher+watcher2 conditional with per-root loop"

patterns-established:
  - "Handler audit pattern: verify singular vs plural getter correctness per D-07 model"

requirements-completed: [INT-02, MP-06]

duration: 20min
completed: 2026-04-20
---

# Plan 08-03: Watcher Fan-Out + Handler Union + Runner + Settings Cascade Summary

**All 9 consumer files migrated to multi-root — watchers fire per root, runner matches any root, handlers use correct global vs per-root lookup pattern.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- `workspaceWatcher.ts` creates one FileSystemWatcher per `featuresUris[]` entry with per-root sibling-steps logic
- `testRunHandler.ts` queue filter uses `idMatches` array with `.some()` for multi-root test items
- `extension.ts` logs all feature roots and uses `.some()` for `onStepMappingsRebuilt`
- `settings.ts` `logSettings` renders plural `fullFeaturesPaths` and `featuresPaths`
- `stepDiagnostics.ts` flatMaps feature file steps across all roots for union validation
- `fixtureProviders.ts` and `fixtureDiagnostics.ts` use `getFeaturesRootForFile` for per-document feature tag lookups
- `autoCompleteProvider.ts` and `codeLensProvider.ts` confirmed correct with singular getter (global steps per D-07)

## Task Commits

1. **Task 1: Watcher fan-out + runner queue filter + extension updates** - `bc44244` (feat)
2. **Task 2: Handler union migration — step diagnostics + fixture providers** - `bc44244` (feat — combined commit)

## Files Created/Modified
- `src/watchers/workspaceWatcher.ts` - Per-root FileSystemWatcher fan-out
- `src/runners/testRunHandler.ts` - Multi-root queue filter with idMatches array
- `src/extension.ts` - Plural logging, multi-root onStepMappingsRebuilt
- `src/settings.ts` - logSettings renders plural paths
- `src/handlers/stepDiagnostics.ts` - flatMap featureFileSteps across roots
- `src/handlers/fixtureProviders.ts` - getFeaturesRootForFile for feature tags
- `src/handlers/fixtureDiagnostics.ts` - getFeaturesRootForFile for feature tags
- `src/handlers/autoCompleteProvider.ts` - Audited, no change needed (D-07 correct)
- `src/handlers/codeLensProvider.ts` - Audited, no change needed (D-07 correct)

## Decisions Made
- Old watcher/watcher2 conditional replaced entirely with per-root loop
- Handler audit documented which files need changes vs which are correct as-is

## Deviations from Plan
None - plan executed as written.

## Issues Encountered
None.

## User Setup Required
None.

## Next Phase Readiness
Phase 8 consumer cascade complete. Phases 9-11 can build on the multi-root foundation.

---
*Phase: 08-parser-test-tree-watcher-multi-root*
*Completed: 2026-04-20*
