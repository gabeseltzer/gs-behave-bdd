---
phase: 08-parser-test-tree-watcher-multi-root
plan: 01
subsystem: parsing
tags: [configParser, dedup, diagnostics, multi-path]

requires:
  - phase: 07-internal-multi-path-types
    provides: BehaveConfigResult with resolvedPaths[], pathLineNumbers[], plural WorkspaceSettings fields

provides:
  - dedupResolvedPaths function for overlapping/duplicate path elimination
  - Per-path Error diagnostics in Problems panel for invalid paths
  - Subsumption Warning diagnostics for contained paths
  - Line number tracking per config path entry
  - Partial success (valid paths proceed, invalid paths flagged)

affects: [08-02, 08-03, phase-9]

tech-stack:
  added: []
  patterns:
    - "Dedup-before-discovery: paths are always deduped before fs.existsSync checks"
    - "Diagnostic filter-append pattern: preserve existing diagnostics with different codes"

key-files:
  created: []
  modified:
    - src/parsers/configParser.ts
    - src/common.ts
    - src/handlers/configDiagnostics.ts
    - test/unit/parsers/configParser.test.ts

key-decisions:
  - "Parent path wins over child in subsumption (D-09) — sorted by length ascending"
  - "ALL paths fail → no convention fallback (D-06)"
  - "Subsumption produces Warning, missing path produces Error diagnostic"

patterns-established:
  - "Dedup pattern: sort by URI path length ascending, check seenIds + prefix for subsumption"
  - "Diagnostic codes: behave-config-path-not-found (Error), behave-config-path-subsumed (Warning)"

requirements-completed: [MP-01, MP-04, TEST-10]

duration: 15min
completed: 2026-04-20
---

# Plan 08-01: Config Parser Dedup + Per-Path Diagnostics Summary

**Config paths are deduped, line-tracked, and diagnosed — overlapping/invalid paths produce actionable Problems panel entries while valid paths proceed normally.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- BehaveConfigResult enriched with `pathLineNumbers[]` for both INI and TOML parsers
- `dedupResolvedPaths()` eliminates exact duplicates (case-insensitive) and parent-contains-child overlaps
- `hasFeaturesFolder` Branch B uses multi-path partial success: valid paths cached, invalid paths flagged
- Per-path Error diagnostics (`behave-config-path-not-found`) with exact line numbers
- Subsumption Warning diagnostics (`behave-config-path-subsumed`) for deduped paths
- 13+ new unit tests covering line tracking, dedup, and partial success

## Task Commits

1. **Task 1: configParser line tracking + dedup + diagnostics** - `923a8e9` (feat)
2. **Task 2: Unit tests for dedup, subsumption, line tracking** - `923a8e9` (feat — combined commit)

## Files Created/Modified
- `src/parsers/configParser.ts` - pathLineNumbers tracking in INI/TOML parsers
- `src/common.ts` - dedupResolvedPaths function + Branch B multi-path partial success
- `src/handlers/configDiagnostics.ts` - setPathResolutionDiagnostics, setSubsumptionDiagnostics, clearPathDiagnostics
- `test/unit/parsers/configParser.test.ts` - 13+ new tests for dedup, line numbers, partial success

## Decisions Made
- Parent path always wins in subsumption (sorted by length ascending)
- Diagnostic range highlights entire line (col 0 to 999)
- clearPathDiagnostics called at start of Branch B to remove stale diagnostics

## Deviations from Plan
None - plan executed as written.

## Issues Encountered
None.

## User Setup Required
None.

## Next Phase Readiness
Plans 08-02 and 08-03 can proceed — dedup and diagnostic infrastructure ready for consumer migration.

---
*Phase: 08-parser-test-tree-watcher-multi-root*
*Completed: 2026-04-20*
