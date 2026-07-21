---
phase: 24-scanner-mapping-funnel
plan: 02
subsystem: parsers
tags: [typescript, step-mappings, execute_steps, reference-counting, mocha]

requires: ["24-01"]
provides:
  - "executeStepsMappings parallel array + union edit in getStepMappingsForStepsFileFunction (REFS-01/02/03)"
  - "rebuildExecuteStepsMappings, deleteExecuteStepsMappings, getStepFileStepForExecuteStep, matchExecuteStepsContent"
  - "_getCompiledStepDefs shared step-def compilation helper (extracted from _getFilteredSteps)"
affects: ["phase 25 (validation diagnostics — consumes matchExecuteStepsContent)", "phase 26 (go-to-definition — consumes getStepFileStepForExecuteStep)"]

tech-stack:
  added: []
  patterns:
    - "Parallel module-level array kept separate from the flat table to preserve existing WkspParseCounts assertions (REFS-04)"
    - "Single union-point funnel (getStepMappingsForStepsFileFunction) delivers reference counting to all three consumers with zero consumer-side changes"

key-files:
  created:
    - test/unit/parsers/executeStepsMappings.test.ts
  modified:
    - src/parsers/stepMappings.ts

key-decisions:
  - "Tasks 1+2 landed as a single implementation commit rather than two - both were developed and verified together against the real module state, mirroring the precedent set in Plan 01 (RED test suite + one GREEN commit); splitting further would not have added meaningful atomicity since the union edit (Task 1) and rebuild function (Task 2) are only independently testable once both exist."
  - "Ambiguous-type bucket matching (given/when/then in order, each falling back to step) was factored into a private _matchExecuteStepsCallStep helper shared by both rebuildExecuteStepsMappings and matchExecuteStepsContent, rather than duplicating the loop in both call sites."
  - "matchExecuteStepsContent(featuresUri, content) reuses featuresUri as the fileUri argument to scanExecuteSteps, since the plan's locked signature only takes (featuresUri, content) and the live-text scan only uses the uri for building record .uri/.fileName fields, not for cache keys (this function never persists to any cache)."

requirements-completed: [REFS-01, REFS-02, REFS-03, REFS-04]

duration: 35min
completed: 2026-07-16
---

# Phase 24 Plan 02: Scanner + Mapping Funnel - Mapping Funnel Summary

**Parallel `executeStepsMappings` array unions execute_steps call sites into the single `getStepMappingsForStepsFileFunction` funnel that CodeLens, the StepReferences tree, and native Find All References already read — delivering reference counting with zero consumer-side changes — while `getStepMappings()` provably stays exec-free.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-07-16
- **Completed:** 2026-07-16
- **Tasks:** 2 (Task 1: refactor + parallel array + union edit + REFS-04 guard; Task 2: rebuild + lookup + live-match helpers)
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- `src/parsers/stepMappings.ts`: added `executeStepsMappings: StepMapping[]` parallel array (never merged into the flat `stepMappings` table), extended `getStepMappingsForStepsFileFunction` to concat both arrays filtered by the same predicate, added `deleteExecuteStepsMappings`.
- Refactored `_getFilteredSteps` to extract `_getCompiledStepDefs(stepDefsUri)` — the shared step-def compilation logic (exact/params maps + pre-compiled regexes) now used by both the feature-file rebuild path and the new execute_steps rebuild path. `_getFilteredSteps` calls it and adds `featureFileSteps` on top; behavior is byte-identical to before.
- Added `rebuildExecuteStepsMappings(featuresUri)`: delete-then-rebuild against `getExecuteStepsCallSteps`, matches via the existing `_getStepFileStepMatch` engine (structural typing — `ExecuteStepsCallStep` satisfies the `FeatureFileStep`-shaped parameter), calls `refreshStepReferencesView()` (NOT `retriggerSemanticHighlighting()` per CONTEXT.md — exec sites live in `.py` files with no gherkin highlighting), diagLog timing line mirroring `rebuildStepMappings`.
- Added `getStepFileStepForExecuteStep(fileUri, lineNo)` mirroring `getStepFileStepForFeatureFileStep`, reading `executeStepsMappings` and using `urisMatch` (never `===` on URIs).
- Added `matchExecuteStepsContent(featuresUri, content)`: pure live-text matching for Phase 25 — scans content, matches via the shared engine, returns `{ callStep, stepFileStep }[]` without touching any cache or the `executeStepsMappings` array.
- Added private `_matchExecuteStepsCallStep` helper implementing the ambiguous-type bucket-fallback contract (leading And/But/* tries given→when→then in order, each internally falling back to the `step` bucket via the existing matcher; no match across all buckets → `null`), shared by both `rebuildExecuteStepsMappings` and `matchExecuteStepsContent`.
- New `test/unit/parsers/executeStepsMappings.test.ts`: union/rebuild/ambiguous-bucket/lookup/live-match coverage plus the **required REFS-04 regression guard** — `getStepMappings(featuresUri)` asserted to exclude every row whose `featureFileStep instanceof ExecuteStepsCallStep`, both on empty state and after a full rebuild cycle of both arrays.

## Task Commits

Tasks 1 and 2 landed as a single implementation commit (see key-decisions):

1. **Tasks 1+2: mapping funnel implementation + tests** — `c106efb` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `src/parsers/stepMappings.ts` — parallel array, union edit, `_getCompiledStepDefs` extraction, `deleteExecuteStepsMappings`, `rebuildExecuteStepsMappings`, `getStepFileStepForExecuteStep`, `matchExecuteStepsContent`, `_matchExecuteStepsCallStep`
- `test/unit/parsers/executeStepsMappings.test.ts` — 12 new tests: union behavior, rebuild/double-rebuild stability, ambiguous bucket matching (match + no-match paths), lookup miss case, live-match no-persistence (both mapping-output and cache-state assertions), `_getCompiledStepDefs`/`_getFilteredSteps` behavior-preservation check, and the REFS-04 regression guard

## Decisions Made

See `key-decisions` in frontmatter above: (1) Tasks 1+2 combined into one commit per the Plan 01 precedent; (2) ambiguous-bucket matching factored into a single shared private helper; (3) `matchExecuteStepsContent`'s `featuresUri` param doubles as the scanner's `fileUri` argument since the locked signature only accepts `(featuresUri, content)` and this path never caches by file.

## Deviations from Plan

None — plan executed exactly as written. `_getStepFileStepMatch`'s signature and behavior were untouched; `getStepMappings` (stepMappings.ts) was verified unchanged and still filters only the flat `stepMappings` array.

## Issues Encountered

None. Full unit suite green (956 passing, 0 failing — up from the 948-passing/7-pre-existing-failures baseline noted at the end of Plan 01, since that stale-artifact issue was already resolved per the `25b0650` deferred-item fix prior to this plan). `npx eslint src --ext ts` clean.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 03 (parse-cycle wiring) can now call `rebuildExecuteStepsMappings(wkspSettings.featuresUri)` once per workspace after the existing `rebuildStepMappings` loop in `fileParser.ts` (both the initial full-parse and debounced python-reparse insertion points identified in 24-PATTERNS.md).
- Phase 25 (validation diagnostics) can consume `matchExecuteStepsContent` for live-text Error/Warning diagnostics without needing any new stepMappings surface.
- Phase 26 (go-to-definition) can consume `getStepFileStepForExecuteStep(fileUri, lineNo)` directly.

---
*Phase: 24-scanner-mapping-funnel*
*Completed: 2026-07-16*

## Self-Check: PASSED

- FOUND: src/parsers/stepMappings.ts (modified, verified via git diff)
- FOUND: test/unit/parsers/executeStepsMappings.test.ts
- FOUND commit c106efb (feat: Tasks 1+2)
