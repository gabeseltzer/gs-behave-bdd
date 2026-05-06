---
phase: 17-cross-cutting-verification
plan: 03
status: complete
completed: 2026-04-30T17:35:00Z
---

# Plan 17-03 Summary — Registration + npm test regression gate + Phase 15 HUMAN-UAT closeout

## Tasks

### Task 1: Register migrations suite in runTestSuites.ts — DONE

`test/integration/runTestSuites.ts` now contains a final `runTests({...})`
block immediately before `console.log("test run complete")` that launches
the `migrations suite` against the `example-projects/migration-stale`
fixture. Pattern matches the existing `monorepo-scan` and `project-switch`
registrations (commit `27e5af3`).

### Task 2: npm test regression gate — DONE WITH FIX

Initial `npm test` run surfaced a regression in `monorepo-scan suite >
discoveryDepth=0 disables subdirectory scanning`:

```
Error: waitForTestTree: predicate did not match within 15000ms.
Last seen: undefined
```

**Investigation** (see `.planning/debug/resolved/monorepo-scan-discoverydepth0-flake.md`):

- Bisected via `git log -S` to commit `4b9aa3f` —
  `feat(12-02): wire discovery cache and config watcher to use active project`
- Phase 12 added a fallback in `src/common.ts` `hasFeaturesFolder()` that
  resurrected a subdir config-file entry from `activeProjectCache` without
  considering the user's current `discoveryDepth`
- `activeProjectCache` is populated at activation depth (default 3) and
  is never invalidated when settings change, so when the integration test
  set `discoveryDepth=0` the stale active-project pointer continued to
  resurrect a depth-1 subdir config

**Fix** (commit `c08ced5` — re-application of `27f14e0` after a
diagnostic revert/re-revert cycle):

```typescript
// src/common.ts hasFeaturesFolder() — Phase 12 block
if (!isManualProjectPathMode(folder.uri)) {
  const activeProject = getActiveProject(folder.uri);
  const currentDiscoveryDepth = vscode.workspace
    .getConfiguration("gs-behave-bdd", folder.uri)
    .get<number>("discoveryDepth") ?? 3;
  if (activeProject && activeProject.depth <= currentDiscoveryDepth) {
    // ... existing logic ...
  }
}
```

**Verification:**

- `npx eslint src --ext ts` — clean
- `npm run test:unit` — 696 tests pass
- A revert run (commit `a3997cc`, briefly applied during diagnosis) produced
  the original failure at `monorepo-scan suite` line 13989 of
  `17-03-npm-test-revert.log`. With the fix re-applied (commit `c08ced5`),
  the original `monorepo-scan` regression is eliminated.

**Known follow-up (NOT a regression introduced by Phase 17 or this fix):**

Full `npm test` runs on developer machines hit a separate, intermittent
mutex-contention flake in `multiroot suite` when the developer's own VS Code
instance is running. The error surfaces as
`AssertionError: assert(instances)` inside `getTestSupportFromExtension`,
because the second VS Code Electron instance cannot acquire the
`CrossAppIPC` mutex (`Another instance of app 'Code' is already active`).
Multiroot fixtures all have depth-0 root-level configs, so the Phase 12
fix is a logical no-op for them; both pre-fix and post-fix runs exhibit
this flake when the dev's VS Code is open. Recommendation: run `npm test`
in CI or with the developer's VS Code closed.

### Task 3: Update Phase 15 HUMAN-UAT — DONE

`.planning/phases/15-notification-suppression/15-HUMAN-UAT.md` updated:

- frontmatter `status: partial` → `status: complete`
- frontmatter `closed_by: Phase 17 (...)` added
- frontmatter `updated:` ISO timestamp refreshed
- Test 1 (A1 probe) result rewritten to reference Test 7 in
  `test/integration/migrations suite/extension.test.ts`
- Test 2 (DSA flow) result rewritten to reference Test 5 in the same suite,
  noting the Phase 16 generalization
- Summary counters: `passed: 2`, `pending: 0`
- Gaps section: replaced placeholder with confirmation of closure

## Outcomes

| Goal | Status |
|------|--------|
| migrations suite registered in npm test pipeline | ✅ |
| Phase 12 regression in monorepo-scan suite identified and fixed | ✅ |
| Phase 15 HUMAN-UAT items closed by Phase 17 automation | ✅ |
| All 696 unit tests pass with fix | ✅ |
| ESLint clean | ✅ |
| Original `monorepo-scan` regression eliminated | ✅ |
| Multiroot suite environmental flake | ⚠ documented as pre-existing, unrelated to Phase 17 |

## Files Modified

- `test/integration/runTestSuites.ts` (Task 1, commit `27e5af3`)
- `src/common.ts` (debug fix, commit `c08ced5`)
- `.planning/debug/resolved/monorepo-scan-discoverydepth0-flake.md` (debug session, status `resolved`)
- `.planning/phases/15-notification-suppression/15-HUMAN-UAT.md` (Task 3)
- `.planning/phases/17-cross-cutting-verification/17-03-SUMMARY.md` (this file)

## Lessons Recorded

1. Cache invalidation: `clearScanResultCache()` should be paired with
   project-list invalidation when discovery-influencing settings change.
2. Mid-refactor phases that add new code paths (Phase 12) should run the
   full integration regression gate before merge, not just unit tests.
3. Windows + developer's VS Code + `@vscode/test-electron` mutex
   interaction is environmental — document and isolate; don't conflate
   with code regressions.
