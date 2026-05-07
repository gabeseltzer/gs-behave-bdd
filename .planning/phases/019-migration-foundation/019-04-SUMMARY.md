---
phase: 019-migration-foundation
plan: 04
subsystem: discovery
tags: [activeProjectCache, scan-cache, config-change-handler, tech-debt]

requires:
  - phase: 012-project-list-discovery
    provides: activeProjectCache and getActiveProject/setActiveProject — the cache this plan now invalidates proactively
  - phase: 017-regression-fixes
    provides: read-time discoveryDepth gate (`activeProject.depth <= currentDiscoveryDepth`) — replaced here
provides:
  - clearActiveProjectCache() public helper
  - configurationChangedHandler rescan branch covering all 6 scan-shaping keys (D-09)
  - removal of the read-time discoveryDepth re-read in src/common.ts (D-11)
  - TEST-06 regression bar pinning the post-D-11 shape
affects: [022-cleanup-integration-docs]

tech-stack:
  added: []
  patterns:
    - "Proactive cache invalidation in configurationChangedHandler — clears scan-result + active-project caches together when any scan-shaping key changes."

key-files:
  created: []
  modified:
    - src/discovery/projectList.ts
    - src/extension.ts
    - src/common.ts
    - test/unit/discovery/projectList.test.ts
    - .planning/STATE.md

key-decisions:
  - "TEST-06 lives in test/unit/discovery/projectList.test.ts (not test/unit/common.test.ts) — projectList already exercises the cache helpers directly, so adding the new tests there reuses MockMemento and the makeScanEntry/makeScanResult fixtures."
  - "The structural source-text check (7.1a) tries 3 candidate paths to locate src/common.ts. The compiled test runs from out/test/test/unit/discovery/, which is one level deeper than the packageJsonSchema test's location — the multi-candidate fallback handles this without coupling the test to a specific runner config."
  - "Replaced the 8-line v1.4.0 tech-debt comment block at L353-L360 with a 3-line CLEANUP-02 closure marker. The closure marker is short on purpose — Phase 22 may delete it entirely once enough time has passed for the original context to age out of relevance."

patterns-established:
  - "Cache invalidation triple: configurationChangedHandler + clearScanResultCache + clearActiveProjectCache always travel together."
  - "Structural source-text test pattern (read source file, assert literal substring presence/absence) for closure markers and removed code paths."

requirements-completed: [CLEANUP-02, TEST-06]

duration: ~15min
completed: 2026-05-07
---

# Phase 019 Plan 04: activeProjectCache Invalidation Summary

**v1.4.0 read-time discoveryDepth gate replaced with a proper proactive invalidation hook — configurationChangedHandler now wipes both scan-result + active-project caches whenever any of 6 scan-shaping settings change.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-07
- **Completed:** 2026-05-07
- **Tasks:** 2 (atomic commits)
- **Files modified:** 5

## Accomplishments

- Added `clearActiveProjectCache(): void` helper to `src/discovery/projectList.ts`.
- Broadened `configurationChangedHandler`'s rescan branch in `src/extension.ts` from 3 keys (`discoveryDepth`, `discoveryStopOnFirstHit`, `projectPath`) to all 6 scan-shaping keys per D-09 — added `projectPaths`, `featuresPath`, `featuresPaths`. The handler now invokes both `clearScanResultCache()` and `clearActiveProjectCache()` when any of those keys change.
- Removed the read-time `discoveryDepth` re-read at `src/common.ts` (the per-call `getConfiguration().get<number>("discoveryDepth")` on the `<1ms` `hasFeaturesFolder` hot path) plus the surrounding v1.4.0 tech-debt comment block. Active-project gate simplified from `if (activeProject && activeProject.depth <= currentDiscoveryDepth)` to `if (activeProject)`.
- Added TEST-06 regression bar (3 new tests) — structural assertion that the read-time gate is gone, behavioral assertion on the helper, idempotency check.
- Updated `.planning/STATE.md` to mark the v1.4.0 carry-forward `activeProjectCache` invalidation tech-debt entry as **RESOLVED** by Phase 19 Plan 04.

## Task Commits

1. **Task 1: clearActiveProjectCache + broadened rescan branch** — `cff8b78` (feat)
2. **Task 2: Remove read-time gate + TEST-06 + STATE.md** — `ebfbbbb` (refactor)

**Plan metadata:** `docs(019-04): plan summary` (this file).

## Files Created/Modified

- `src/discovery/projectList.ts` — new `clearActiveProjectCache()` export.
- `src/extension.ts` — added `clearActiveProjectCache` to the projectList import; replaced the 3-key needsRescan predicate with a 6-key one; added the new clear call alongside `clearScanResultCache()`.
- `src/common.ts` — removed `currentDiscoveryDepth` const + `get<number>("discoveryDepth")` call + `activeProject.depth <= currentDiscoveryDepth` gate + the surrounding tech-debt comment block; added a 3-line CLEANUP-02 closure marker.
- `test/unit/discovery/projectList.test.ts` — added 3 tests in a new "Phase 19 / CLEANUP-02 — clearActiveProjectCache" suite (TEST-06 7.1(a) structural, 7.1(b) behavioral, 7.2 idempotency).
- `.planning/STATE.md` — flipped the v1.4.0 carry-forward tech-debt entry to ✅ RESOLVED with the Phase 19 Plan 04 + D-09 + TEST-06 attribution.

## Decisions Made

- TEST-06 placement: chose `test/unit/discovery/projectList.test.ts` over `test/unit/common.test.ts` since the new tests exercise the cache helper directly and reuse the existing `MockMemento` + scan-entry fixtures.
- Structural source-text test uses a 3-candidate path resolution for robustness against runner-config drift.
- Replaced the v1.4.0 tech-debt comment block with a short closure marker rather than deleting all narrative — the marker links the new behavior to D-09 and explains the v1.4.0 context for any reader who hits the diff later.

## Deviations from Plan

None — both Task 1 and Task 2 executed exactly as written. The two atomic commits match the plan's task structure.

## Issues Encountered

- The structural source-text test initially failed with `ENOENT` because `__dirname` for compiled `out/test/test/unit/discovery/` is one level deeper than `packageJsonSchema.test.ts`'s location. Fixed by trying 3 candidate paths instead of one fixed depth.

## Next Phase Readiness

- Phase 22 integration test (TEST-07) will exercise the full configuration-change → cache-invalidation flow against a real VS Code workspace; this plan satisfies the unit-level structural and behavioral pins.
- The v1.4.0 carry-forward tech-debt list (STATE.md § "v1.4.0 Carry-Forward Tech Debt") now has one fewer open item — only the cosmetic `vscode.mock.ts` legacy fallback remains (Phase 18 Plan 01's slated cleanup).

---
*Phase: 019-migration-foundation*
*Plan: 04-active-project-cache-invalidation*
*Completed: 2026-05-07*
