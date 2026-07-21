---
phase: 24-scanner-mapping-funnel
plan: 03
subsystem: parsers
tags: [typescript, fileparser, orchestration, execute_steps, wiring]

requires: ["24-01", "24-02"]
provides:
  - "allPyFiles execute_steps scan wired into _parseStepsFiles (initial parse), independent of the behave subprocess result"
  - "rebuildExecuteStepsMappings called once per workspace after both the initial-parse and debounced-reparse rebuildStepMappings loops, before onStepMappingsRebuilt"
  - "debounced python reparse rescans the edited .py file (any watched .py, not just isStepsFile) before rebuilding exec mappings"
affects: ["phase 25 (validation diagnostics)", "phase 26 (go-to-definition)", "phase 27 (integration tests/fixture/docs)"]

tech-stack:
  added: []
  patterns:
    - "Pure in-memory scan step placed outside/before the behave subprocess try/catch so it always runs regardless of behave load success"
    - "Per-workspace (not per-root) rebuild call placed after the existing per-root rebuild loop, mirroring the exact insertion points mapped in 24-PATTERNS.md"

key-files:
  created: []
  modified:
    - src/parsers/fileParser.ts

key-decisions:
  - "The allPyFiles exec scan reads each file's content via getContentFromFilesystem and calls parseExecuteStepsFileContent per file inside _parseStepsFiles, positioned after allPyFiles is built/deduped and before the stepFiles filter/behave try block - so it runs even when behave loading later throws or errors."
  - "In the debounced python reparse path, the edited file's content is already available as the _debouncePythonReparse closure parameter (threaded from reparseFile), so no extra filesystem read was needed - parseExecuteStepsFileContent is called directly with that in-scope content."
  - "Both tasks landed as separate commits (one per PLAN.md task) since each was independently verifiable (lint + tsc + full unit suite) and touches a physically distinct insertion point in the same file."

requirements-completed: [REFS-01, REFS-02, REFS-03, REFS-04]

duration: 20min
completed: 2026-07-16
---

# Phase 24 Plan 03: Scanner + Mapping Funnel - Parse-Cycle Wiring Summary

**`fileParser.ts` now scans every watched `.py` file for `execute_steps()` call sites during the initial parse (independent of the behave subprocess outcome), rescans the edited file on debounced reparse, and calls `rebuildExecuteStepsMappings` exactly once per workspace at both insertion points before `onStepMappingsRebuilt` fires — making CodeLens counts, the StepReferences tree, and native find-references include execute_steps call sites with the full existing unit suite staying green.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-16
- **Completed:** 2026-07-16
- **Tasks:** 2 (Task 1: allPyFiles scan + initial-parse rebuild insertion; Task 2: debounced rescan + rebuild insertion)
- **Files modified:** 1

## Accomplishments

- `src/parsers/fileParser.ts` imports `parseExecuteStepsFileContent`, `deleteExecuteStepsCallSteps` (from `executeStepsParser`) and `rebuildExecuteStepsMappings` (from `stepMappings`).
- `_parseStepsFiles`: after `allPyFiles` is built and deduped, clears the workspace's cached exec call steps once via `deleteExecuteStepsCallSteps(wkspSettings.featuresUri)`, then loops over **all** of `allPyFiles` (not just `stepFiles`) reading each file's content and calling `parseExecuteStepsFileContent`. This runs before/independent of the behave subprocess `try` block, so it executes even if behave loading later fails. A `diagLog` line reports files scanned and call sites found.
- Initial full-parse rebuild path: `rebuildExecuteStepsMappings(wkspSettings.featuresUri)` inserted immediately after the existing `for (const root of wkspSettings.featuresUris) { rebuildStepMappings(...) }` loop closes — once per workspace, not inside the loop. The existing loop, `WkspParseCounts`, and diagLog lines are unchanged.
- Debounced python reparse path (`_debouncePythonReparse`): before the existing `for (const root ...) rebuildStepMappings(...)` loop, rescans the edited `fileUri` (using the already-in-scope `content` closure parameter) via `parseExecuteStepsFileContent(wkspSettings.featuresUri, content, fileUri, "[reparseFile]")` — gated only on the file being a watched `.py` (the surrounding `reparseFile` guard already filters to python/feature files, not specifically `isStepsFile`), so helper modules and `environment.py` are rescanned too. `rebuildExecuteStepsMappings(wkspSettings.featuresUri)` is then inserted between the rebuild loop and `this.onStepMappingsRebuilt?.(...)`.
- The feature-file reparse branch (`reparseFile` lines ~695-712) is completely untouched, as required.

## Task Commits

1. **Task 1: allPyFiles scan + initial-parse rebuild insertion** — `7c1e825` (feat)
2. **Task 2: debounced rescan + rebuild insertion** — `bbde565` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `src/parsers/fileParser.ts` — added imports; `_parseStepsFiles` execute_steps scan over `allPyFiles`; `rebuildExecuteStepsMappings` call in both the initial-parse and debounced-reparse rebuild paths.

## Decisions Made

See `key-decisions` in frontmatter above: (1) scan placement runs regardless of behave subprocess outcome; (2) debounced path reuses the already-threaded `content` parameter rather than re-reading from disk; (3) two separate task commits since each insertion point is independently verifiable and maps 1:1 to a PLAN.md task.

## Deviations from Plan

None — plan executed exactly as written. Both insertion points match the verbatim current-state snippets documented in `24-PATTERNS.md`.

## Issues Encountered

None. Full unit suite green (956 passing, 0 failing) after both tasks; `npx eslint src --ext ts` clean; `npx tsc -p test/tsconfig.json --noEmit` clean.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 24 (Scanner + Mapping Funnel) is now functionally complete: the scanner (24-01), the mapping funnel (24-02), and the parse-cycle wiring (24-03) are all wired end-to-end. Live CodeLens counts, the StepReferences tree, and native find-references now include `execute_steps` call sites (REFS-01/02/03), and the full pre-existing unit suite stays green with zero behavior change (REFS-04).
- Phase 25 (validation diagnostics) can now rely on the scan cycle already running on every parse/reparse, and can independently call `matchExecuteStepsContent` for live-text diagnostics.
- Phase 26 (go-to-definition) can rely on `getStepFileStepForExecuteStep` being kept current by the now-wired rebuild calls.

---
*Phase: 24-scanner-mapping-funnel*
*Completed: 2026-07-16*

## Self-Check: PASSED

- FOUND: src/parsers/fileParser.ts (modified, verified via git diff/log)
- FOUND commit 7c1e825 (feat: Task 1)
- FOUND commit bbde565 (feat: Task 2)
