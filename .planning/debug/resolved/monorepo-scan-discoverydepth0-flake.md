---
status: resolved
slug: monorepo-scan-discoverydepth0-flake
started: 2026-04-30T16:45:00Z
updated: 2026-04-30T17:35:00Z
phase_surface: 17-cross-cutting-verification
suspected_origin: 12-project-list (commit 4b9aa3f)
confirmed_origin: 12-project-list (commit 4b9aa3f, "feat(12-02): wire discovery cache and config watcher to use active project")
fix_commit: c08ced5
---

# Debug: monorepo-scan suite — `discoveryDepth=0 disables subdirectory scanning` fails

## Summary

When Phase 17 wired the migrations suite into `runTestSuites.ts` and ran
`npm test`, the **monorepo-scan suite** failed on the test
`discoveryDepth=0 disables subdirectory scanning` with
`waitForTestTree: predicate did not match within 15000ms. Last seen: undefined`.

Investigation traced the regression to **Phase 12** (commit `4b9aa3f`,
~1 week earlier than Phase 17), not Phase 15/16. Phases 15/16 only made the
regression visible by being the first phase since 12 to run the full
integration suite end-to-end on this branch.

## Root Cause

`src/common.ts` `hasFeaturesFolder()` has a "Phase 12 fallback" block that
runs *after* the explicit-settings (Branch A), config-file (Branch B), and
convention-features-folder fallthroughs. It uses `getActiveProject()` to
resurrect a subdir config-file entry from the in-memory `activeProjectCache`.

`activeProjectCache` is populated at activation when the BFS scanner runs at
the user-configured `discoveryDepth` (default 3). It is NOT cleared when the
user later changes `discoveryDepth`.

So when the integration test does:

1. (init) BFS scan finds `app-a`, `app-b`, `packages/app-c` —
   `activeProject` = `app-a` at depth 1
2. (test) `update('discoveryDepth', 0, ConfigurationTarget.Workspace)`
3. (test) `configurationChangedHandler(undefined, undefined, true)`
4. handler calls `clearScanResultCache()` (clears BFS scan cache, NOT
   `activeProjectCache`)
5. handler calls `getUrisOfWkspFoldersWithFeatures(true)` → invalidates
   `discoveryCache`
6. `hasFeaturesFolder(monorepo-scan)` runs:
   - Branch A: no explicit setting → skip
   - Branch B (root config): no `monorepo-scan/behave.ini` → skip
   - Convention `features/`: no folder → false
   - **Phase 12 fallback: `getActiveProject()` returns cached `app-a` at depth 1
     → resurrects subdir config-file entry** ← BUG
7. Test predicate sees `entry.source === 'config-file'` with `app-a` config →
   returns `undefined` → polls 15s → timeout

The Phase 12 fallback did NOT consider `discoveryDepth`. With
`discoveryDepth=0`, the user explicitly told the extension "do not look in
subdirectories" — but the active-project cache still pointed at a
subdirectory.

## Why Phase 17 surfaced it

Phase 17 added a new test fixture and registered a new suite, but otherwise
made zero source-code changes. The `npm test` regression gate is the first
time since Phase 12 shipped that the full integration test suite has run on
this branch end-to-end (Phases 13/14/15/16 ran subsets / unit tests only).

## Fix (Option B: depth gate)

In `src/common.ts` `hasFeaturesFolder()` Phase 12 block: read
`discoveryDepth` for the folder and gate the fallback on
`activeProject.depth <= currentDiscoveryDepth`.

```typescript
// === Phase 12: Check active project from project list ===
// Phase 17 fix: also gate on currentDiscoveryDepth so a stale activeProject
// (cached at activation depth) does not resurrect a subdir config when the
// user later lowers discoveryDepth below where the active project lives.
if (!isManualProjectPathMode(folder.uri)) {
  const activeProject = getActiveProject(folder.uri);
  const currentDiscoveryDepth = vscode.workspace
    .getConfiguration("gs-behave-bdd", folder.uri)
    .get<number>("discoveryDepth") ?? 3;
  if (activeProject && activeProject.depth <= currentDiscoveryDepth) {
    // ... existing block ...
  }
}
```

This generalizes correctly to all depth changes (not just `=0`) and adds one
comparison. `ProjectEntry` already carries `depth` from the scan.

## Verification

**Without fix (revert run, log `17-03-npm-test-revert.log`):** 16 suites pass,
17th (`monorepo-scan suite`) fails with original
`waitForTestTree predicate did not match within 15000ms` error at line 13989.

**With fix (commits `27f14e0`/`c08ced5`):** Original `monorepo-scan` regression
eliminated. (Multiroot suite encountered separate environmental flake from
mutex contention with developer's running VS Code instance — unrelated to this
fix; multiroot fixtures all have depth=0 root-level configs so the depth gate
is a logical no-op for them. See `## Known follow-up` below.)

## Known follow-up

The full `npm test` run on developer machines hits **CrossAppIPC mutex
contention** (`Another instance of app 'Code' is already active`) when the
developer also has VS Code open. This is a `@vscode/test-electron` /
Windows mutex limitation, not extension code. The `multiroot suite` is
particularly sensitive because it spawns 4 workspace folders and one
intentionally-bad fixture that throws `WkspError` during settings
construction. Both the pre-Phase-17 baseline and the Phase 17 fix exhibit
this flake; only the timing of failure differs run-to-run.

Recommendation: future runs of `npm test` should be done in CI or with the
developer's VS Code closed. This is unrelated to the Phase 12 regression
fix shipped here.

## Lessons

1. `clearScanResultCache()` should be paired with project-list invalidation
   when settings that influence project discovery change (or vice versa).
2. Caches keyed off discovery output (e.g. `activeProjectCache`) must
   participate in any "rescan" trigger, not just the raw scan-result cache.
3. New code paths added in mid-refactor phases (Phase 12) should run the full
   integration regression gate before merge, not just unit tests.
