---
phase: 08-parser-test-tree-watcher-multi-root
plan: 02
subsystem: parsing
tags: [fileParser, stepMappings, junitParser, testTree, multi-path]

requires:
  - phase: 08-01
    provides: dedupResolvedPaths, pathLineNumbers, per-path diagnostics

provides:
  - fileParser multi-root feature/step discovery across all featuresUris[]
  - Path-group intermediate TestItems in Test Explorer when config-file source
  - Per-root step mapping rebuild with global step definitions
  - Per-root JUnit name trimming for correct test results
  - Per-root prefix stripping for test item IDs

affects: [08-03, phase-9, phase-10, phase-11]

tech-stack:
  added: []
  patterns:
    - "Path-group TestItems: intermediate nodes when source=config-file or featuresUris.length > 1"
    - "Per-root iteration: for(root of featuresUris) for feature discovery, step mapping rebuild"
    - "Global step defs: stored under primary root key (featuresUri singular)"

key-files:
  created: []
  modified:
    - src/parsers/fileParser.ts
    - src/parsers/stepMappings.ts
    - src/parsers/junitParser.ts

key-decisions:
  - "Path-group nodes shown when source=config-file, even for single paths (D-02)"
  - "Steps are global per workspace (D-07) — stored under primary root key"
  - "rebuildStepMappings accepts optional stepDefsUri for per-root feature + global step def lookup"
  - "JUnit name trimming tries each workspaceRelativeFeaturesPaths[] to find matching prefix"

patterns-established:
  - "getFeaturesRootForFile determines owning root for any feature file"
  - "stepMappings(featuresRoot, stepDefsUri) — two-URI pattern for per-root features + global steps"

requirements-completed: [MP-05, MP-06]

duration: 20min
completed: 2026-04-20
---

# Plan 08-02: Parser Layer Multi-Root Iteration Summary

**Parser layer fully iterates all feature roots — test tree shows path-group nodes, step mappings cover all roots, JUnit results parse correctly per root.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `_parseFeatureFiles` iterates all `featuresUris[]` for delete + findFiles
- Path-group intermediate TestItems created when discovery source is config-file
- `_parseStepsFiles` searches all `stepsSearchUris[]` with dedup
- `rebuildStepMappings` accepts optional `stepDefsUri` for global step definition lookup
- `_getFilteredSteps` uses separate URIs for per-root feature steps and global step defs
- `getjUnitName` iterates `workspaceRelativeFeaturesPaths` to find correct per-root prefix
- `WkspParseCounts` sums feature file steps and step mappings across all roots

## Task Commits

1. **Task 1: fileParser multi-root feature parsing + path-group TestItems** - `cf3c381` (feat)
2. **Task 2: stepMappings per-root rebuild + junitParser per-root trimming** - `cf3c381` (feat — combined commit)

## Files Created/Modified
- `src/parsers/fileParser.ts` - Multi-root iteration, path-group TestItems, per-root prefix stripping
- `src/parsers/stepMappings.ts` - Optional stepDefsUri parameter, two-URI _getFilteredSteps
- `src/parsers/junitParser.ts` - Per-root name trimming via workspaceRelativeFeaturesPaths iteration

## Decisions Made
- Path-group shown when source=config-file even with single path (matches D-02)
- canResolveChildren=true on path-group nodes, no explicit collapsibleState (D-03)
- Step file dedup via Set<string> when searching overlapping stepsSearchUris

## Deviations from Plan
None - plan executed as written.

## Issues Encountered
None.

## User Setup Required
None.

## Next Phase Readiness
Parser layer complete. Plan 08-03 consumer migration can use the multi-root parser output.

---
*Phase: 08-parser-test-tree-watcher-multi-root*
*Completed: 2026-04-20*
