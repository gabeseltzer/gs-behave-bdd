---
status: root_cause_identified
slug: monorepo-scan-discoverydepth0-flake
started: 2026-04-30T16:45:00Z
updated: 2026-04-30T16:50:00Z
phase_surface: 17-cross-cutting-verification
suspected_origin: 12-project-list (commit 4b9aa3f)
confirmed_origin: 12-project-list (commit 4b9aa3f, "feat(12-02): wire discovery cache and config watcher to use active project")
---

# Debug: monorepo-scan suite — `discoveryDepth=0 disables subdirectory scanning` fails

## Summary

When Phase 17 wired the migrations suite into `runTestSuites.ts` and ran `npm test`,
the **monorepo-scan suite** failed on the test
`discoveryDepth=0 disables subdirectory scanning`. Investigation traced the
regression to **Phase 12** (commit `4b9aa3f`, ~1 week earlier than Phase 17),
not Phase 15/16 — those phases only made the regression visible by being
the next phase to run integration tests after Phase 12 shipped.

## Root Cause

`src/common.ts` `hasFeaturesFolder()` has a "Phase 12 fallback" block that runs
*after* the explicit-settings (Branch A), config-file (Branch B), and
convention-features-folder fallthroughs. It uses `getActiveProject()` to
resurrect a subdir config-file entry from the in-memory `activeProjectCache`.

`activeProjectCache` is populated at activation when the BFS scanner runs at the
user-configured `discoveryDepth` (default 3). It is NOT cleared when the user
later changes `discoveryDepth`.

So when the integration test does:

1. (init) BFS scan finds `app-a`, `app-b`, `packages/app-c` — `activeProject` = `app-a`
2. (test) `update('discoveryDepth', 0, ConfigurationTarget.Workspace)`
3. (test) `configurationChangedHandler(undefined, undefined, true)`
4. handler calls `clearScanResultCache()` (clears BFS scan cache, NOT activeProjectCache)
5. handler calls `getUrisOfWkspFoldersWithFeatures(true)` → invalidates discoveryCache
6. `hasFeaturesFolder(monorepo-scan)` runs:
   - Branch A: no explicit setting → skip
   - Branch B (root config): no `monorepo-scan/behave.ini` → skip
   - Convention `features/`: no folder → false
   - **Phase 12 fallback: `getActiveProject()` returns cached `app-a` → resurrects subdir config-file entry** ← BUG
7. Test predicate sees `entry.source === 'config-file'` with `app-a` config → returns `undefined` → polls 15s → timeout

The Phase 12 fallback does NOT consider `discoveryDepth`. With `discoveryDepth=0`,
the user has explicitly told the extension "do not look in subdirectories" — but
the active-project cache still points at a subdirectory.

## Why Phase 17 surfaced it

Phase 17 added a new test fixture and registered a new suite, but otherwise made
zero source-code changes. The `npm test` regression gate is the first time
since Phase 12 shipped that the full integration test suite has run on this
branch end-to-end (Phases 13/14/15/16 likely ran subsets / unit tests only).

## Fix

Skip the Phase 12 fallback when `activeProject.depth > currentDiscoveryDepth`.
Generalizes correctly to all depth changes (not just `=0`) and adds one
comparison. `ProjectEntry` already carries `depth` from the scan.

## Implementation

In `src/common.ts` `hasFeaturesFolder()` Phase 12 block: read
`discoveryDepth` for the folder and gate the fallback on
`activeProject.depth <= currentDepth`.

## Resolution

Pending commit on branch `auto-detect-behave-directory`, file `src/common.ts`.
After fix lands, re-run `npm test` to verify all 18 existing suites + new
migrations suite green.
