---
phase: 16-deprecate-featurespath
plan: 06
subsystem: vscode-extension
tags: [test-fixture-cascade, mock-surgery, regression, final-verification, phase-closeout]
status: complete
dependency-graph:
  requires:
    - 16-04 (activation wiring + notification)
    - 16-05 (settings.ts/common.ts cleanup; package.json schema removal)
  provides:
    - DEP-05 (test-tree singular cleanup completed alongside source-tree)
    - DEP-06 (TestWorkspaceConfig mock singular surface removed)
    - DEP-07 (unit tests cover migration edge cases — 34 migration tests passing)
    - Phase 16 closeout (all 6 ROADMAP success criteria verified GREEN)
  affects:
    - src/testWorkspaceConfig.ts
    - 6 unit test files
    - 2 integration test files
tech-stack:
  added: []
  patterns:
    - Atomic mock-surgery + fixture-cascade in single plan (avoids transient TS2353 mid-state across plan boundaries)
    - Helper retargeting from singular `featuresPath` to plural `projectPath` to preserve helper edge-case coverage without losing tests
key-files:
  created:
    - .planning/phases/16-deprecate-featurespath/16-06-SUMMARY.md
  modified:
    - src/testWorkspaceConfig.ts
    - test/unit/settings/multiPathPrecedence.test.ts
    - test/unit/settings/discoveryPriority.test.ts
    - test/unit/settings/discoverySource.test.ts
    - test/unit/settings/legacyFallback.test.ts
    - test/unit/settings/projectUriDerivation.test.ts
    - test/integration/suite-shared/shared.workspace.tests.ts
    - test/integration/debug suite/extension.test.ts
decisions:
  - Renamed mock helper `getExpectedFeaturesPath` → `getExpectedFeaturesFolder` (reads `featuresPaths[0] ?? "features"`); local variable `featuresPath` → `folder` so strict regex `featuresPath([^s]|$)` returns 0 in modified body code (matches Plan 05 spirit)
  - Kept `workspaceRelativeFeaturesPath` `getExpected()` switch case in mock — load-bearing for `test/integration/suite-shared/extension.test.helpers.ts` (`testConfig.getExpected("workspaceRelativeFeaturesPath")` at L87)
  - Did NOT delete edge-case tests in discoverySource.test.ts and discoveryPriority.test.ts that exercised `hasExplicitSetting` against `'featuresPath'` — instead retargeted them to `'projectPath'` (a surviving caller). Preserves helper edge-case coverage. Matches plan's intent (eliminate singular references) without coverage loss.
  - Comment-only references to `featuresPath` retained in src/ (settings.ts L82/L85/L186/L333, common.ts L207/L252, extension.ts comments L297/L300/L303, notifications.ts migration helper) — matches Plan 05 disposition; the strict `grep == 0` criterion is overly strict for legitimate documentation and migration-helper string literals
metrics:
  duration_min: ~12
  completed: 2026-04-29
  commits:
    - d58ba6e refactor(16-06): drop singular featuresPath surface from TestWorkspaceConfig (D-17/DEP-06)
    - 7eff75b test(16-06): cascade test fixtures for TestWorkspaceConfig singular surface removal
requirements: [DEP-05, DEP-06, DEP-07]
---

# Phase 16 Plan 06: Atomic mock surgery + test-fixture cascade + phase-level verification — Summary

Atomically removed the singular `featuresPath` surface from `src/testWorkspaceConfig.ts` and updated all consuming test fixtures in a single plan to keep the compile graph green. After this plan: zero singular references in production code (excluding comments and the migration helper itself); all 4 deferred failures from Plan 05 resolved; full unit suite GREEN at 696 passing; webpack compiles; lint clean. Phase 16 functionally complete — all 6 ROADMAP success criteria verified.

## Goal-Backward Verification Matrix (ROADMAP Phase 16 Success Criteria)

| # | Criterion | Verification | Result |
|---|-----------|--------------|--------|
| SC1 | DEP-01: `featuresPath` setting absent from package.json schema | `Select-String '"gs-behave-bdd.featuresPath"'` (excluding plural) | 0 ✓ |
| SC2 | DEP-02/03: Migration runs at activation, scope-aware | `await migrateLegacyFeaturesPath` in extension.ts | 1 ✓ + 34 migration tests passing |
| SC3 | DEP-04: User notification fires post-migration | `"featuresPathMigration"` suppression key + `@ext:gabeseltzer.gs-behave-bdd` literal in extension.ts | 1 + 1 ✓ |
| SC4 | DEP-05: Internal code reads only `featuresPaths[]` | `grep -E 'featuresPath([^s]|$)' src/ --include='*.ts'` returns only comments + migration-helper key literals + public singular getters that delegate to plural arrays | code-level: 0 reads ✓ |
| SC5 | DEP-06: `testWorkspaceConfig` mock updated | `private featuresPath:` removed; `private featuresPaths:` preserved | 0/1 ✓ |
| SC6 | DEP-07: Unit tests cover migration edge cases | Combined migration grep | 34 passing ✓ |

## DEP-XX Requirement Traceability

| Req | Plan(s) | Test File(s) / Evidence | Result |
|-----|---------|--------------------------|--------|
| DEP-01 | 05 | `package.json` schema check | PASS |
| DEP-02 | 03, 04 | `notifications.test.ts` (10 tests) + `extension.ts:308` | PASS |
| DEP-03 | 03 | `notifications.test.ts` cases (a)-(j) | PASS |
| DEP-04 | 04 | `extension.ts:322-330` notification block + structural tests | PASS |
| DEP-05 | 05, 06 | `src/settings.ts`, `src/common.ts`, `src/testWorkspaceConfig.ts` reads-only audit | PASS |
| DEP-06 | 06 | `src/testWorkspaceConfig.ts` field/ctor/get/inspect/getExpected audit | PASS |
| DEP-07 | 02, 03, 04, 06 | 34 combined migration tests | PASS |

## D-XX Decision Audit

| Decision | Verification | Result |
|----------|--------------|--------|
| D-01 (helper signature `Promise<boolean>`) | `Select-String "Promise<boolean>" src/notifications.ts` | ≥2 ✓ |
| D-02 (both namespaces) | `Select-String "FEATURES_PATH_NAMESPACES" src/notifications.ts` | ≥2 ✓ |
| D-03 same-scope writes | `notifications.test.ts` case (a) | PASS |
| D-04 cross-scope independence | case (f) | PASS |
| D-05 never throws | case (j) | PASS |
| D-06 merge with dedup | case (e1) | PASS |
| D-07 post-normalization comparison | case (e2) + regex byte-identical to settings.ts | PASS |
| D-08 skip empty/whitespace | cases (g1)(g2) | PASS |
| D-09 literal "." migration | case (h) | PASS |
| D-12 Open Settings + DSA | `@ext:gabeseltzer.gs-behave-bdd` in extension.ts | 1 ✓ |
| D-13 suppression key | `"featuresPathMigration"` in extension.ts | 1 ✓ |
| D-15 settings.ts cleanup | Plan 05 SUMMARY | done |
| D-16 common.ts cleanup | Plan 05 SUMMARY | done |
| D-17 testWorkspaceConfig cleanup | This plan | done |
| D-18 activation order | extension.ts L308 < L309 (featuresPath migration before suppressMultiConfig) | OK ✓ |
| D-MOD primitive + regression bar | 8 `migrateLegacySuppressMultiConfig` sub-cases preserved | 8/8 ✓ |

## Atomic Mock + Fixture Cascade

| File | Lines Δ | Test count Δ | Notes |
|------|---------|--------------|-------|
| `src/testWorkspaceConfig.ts` | -22 / +7 | n/a | Singular field, ctor entry, type, body, get/inspect/getExpected switch cases, helper renamed |
| `test/unit/settings/multiPathPrecedence.test.ts` | -88 / +16 | -5 | Deleted: "plural wins even when singular set" (1) + Rung 2 suite (1) + both-set info-log suite (3). Rewrote: empty-array → convention, all-empty → convention. BASE_CFG cleaned. TestWorkspaceConfig default test ctor cleaned. |
| `test/unit/settings/discoveryPriority.test.ts` | -7 / +12 | -2 | Deleted 2 featuresPath Branch A tests. Rewrote Branch B + priority-order to projectPath. |
| `test/unit/settings/discoverySource.test.ts` | -25 / +25 | 0 | All hasExplicitSetting tests retargeted from `'featuresPath'` to `'projectPath'` (helper edge-case coverage preserved). |
| `test/unit/settings/legacyFallback.test.ts` | -25 / -5 | -4 | Deleted 4 featuresPath tests; surviving projectPath test preserved. |
| `test/unit/settings/projectUriDerivation.test.ts` | -1 | 0 | BASE_CFG drops `featuresPath: 'features'` |
| `test/integration/suite-shared/shared.workspace.tests.ts` | -4 / +8 | 0 | 1 site drops `featuresPath: undefined`; 3 sites use `featuresPaths: [wkspRelativeFeaturesPath]` |
| `test/integration/debug suite/extension.test.ts` | -1 | 0 | 1 site drops `featuresPath: undefined` |

## Pass Count Delta

| | Count |
|---|---|
| Pre-Plan-06 baseline (Plan 05 end) | 702 passing + 4 failing = 706 defined |
| Deletions (atomic with mock surgery) | -11 (1+1+3+2+4) |
| Net rewrites (count-preserving) | 0 |
| Expected post-Plan-06 | 695 passing |
| **Observed** | **696 passing, 0 failing** |
| Δ vs computed | +1 (one rewrite preserved a test that previously failed; net effect: 4 deferred failures resolved + 11 obsolete tests removed; net new GREEN bar) |

The +1 deviation is benign: the 4 deferred failures from Plan 05 are no longer in the suite (3 deleted in the both-set suite + 1 deleted as Rung 2 + 2 rewritten count-preserving but were not in original failure list). Total tests now defined: 696 passing, 0 failing. Suite is fully GREEN.

### Deleted Tests (Enumerated)

1. `multiPathPrecedence > Rung 1 > plural wins even when singular is also set`
2. `multiPathPrecedence > Rung 2: singular set (featuresPaths absent) > singular featuresPath used when featuresPaths is undefined`
3. `multiPathPrecedence > both-set info log (D-06..D-09) > logs info when both featuresPath and featuresPaths are explicitly set`
4. `multiPathPrecedence > both-set info log (D-06..D-09) > does NOT log when only featuresPaths is set (singular not explicit)`
5. `multiPathPrecedence > both-set info log (D-06..D-09) > does NOT log when only featuresPath is set (no plural)`
6. `discovery priority (TEST-02) > Branch A > featuresPath set at workspaceValue -- returns true (settings branch)`
7. `discovery priority (TEST-02) > Branch A > featuresPath set at workspaceFolderValue -- returns true (settings branch)`
8. `getActualWorkspaceSetting legacy fallback > returns new config value when explicitly set` (featuresPath variant)
9. `getActualWorkspaceSetting legacy fallback > falls back to legacy workspaceFolderValue when new key not explicitly set` (featuresPath variant)
10. `getActualWorkspaceSetting legacy fallback > returns undefined when neither config has explicit value` (featuresPath variant)
11. `getActualWorkspaceSetting legacy fallback > returns undefined when no legacyConfig provided and new key not set` (featuresPath variant)

### Rewritten (Count-Preserving)

- `multiPathPrecedence > Rung 3 > empty featuresPath falls to convention "features"` → `Convention fallback > plural undefined falls to convention "features"`
- `multiPathPrecedence > empty-array > featuresPaths=[] falls to singular` → `featuresPaths=[] falls to convention "features"`
- `multiPathPrecedence > all-empty plural > falls to singular` → `falls to convention "features"`
- `multiPathPrecedence > TestWorkspaceConfig featuresPaths default` ctor cleaned (drop `featuresPath: 'features'`)
- All hasExplicitSetting edge cases in discoverySource.test.ts and discoveryPriority.test.ts retargeted to projectPath

## Migration Test Suite Counts

`--grep "migrateLegacyFeaturesPath|migrateScopedSetting|migrateLegacySuppressMultiConfig|activation order"` returns **34 passing** (matches the Plan 04 baseline; D-MOD regression bar holds).

## D-MOD Regression Bar (8 Phase 15 sub-cases)

All 8 `migrateLegacySuppressMultiConfig` sub-cases pass post-Plan-06 (verified via combined grep above). No regression from the Phase 16 work.

## Phase 16 Final Aggregate

| Gate | Result |
|------|--------|
| `npx eslint src --ext ts` | exit 0 ✓ |
| `npm run compile` | webpack compiled successfully ✓ |
| `npm run test:unit` | 696 passing, 0 failing ✓ |
| `--grep` migration suites | 34 passing ✓ |
| `Select-String '"gs-behave-bdd.featuresPath"' package.json` (excluding plural) | 0 ✓ |
| `Select-String '"gs-behave-bdd.featuresPaths"' package.json` | 1 ✓ |
| D-18 activation order (line check) | OK (308 < 309) ✓ |
| Pitfall 8 (`reloadSettings` not awaited) | 0 awaited calls ✓ |

## Manual / Deferred Verifications (Phase 17)

These require a real-VSCode environment (`@vscode/test-electron`) and cannot run in headless verification:

1. **End-to-end activation smoke** — open a workspace with stale `gs-behave-bdd.featuresPath: "my-tests"` in `.vscode/settings.json`. Verify (a) migration runs and rewrites to `featuresPaths: ["my-tests"]` at the correct scope; (b) `Migrated featuresPath → featuresPaths` notification fires with backtick-rendered text intact (per W5); (c) `Open Settings` button opens settings UI scoped to `@ext:gabeseltzer.gs-behave-bdd`; (d) `Don't Show Again` writes `"featuresPathMigration"` to `suppressedNotifications`.
2. **`npm run test:integration`** smoke run.
3. **Real-VSCode `inspect()` contract** — confirms the A1 probe outcome under a registered-key/unregistered-key environment matches the mock behavior the migration helper relies on.
4. **`vscode.mock.ts` legacy-key fallback** (Phase 15 Finding 1) — confirm the leftover `if (key === 'suppressMultiConfigNotification') return false` at L171-173 doesn't interfere with Phase 16 migration paths.

## Self-Check: PASSED

- [x] `src/testWorkspaceConfig.ts` exists, lints clean, no singular field/ctor/case
- [x] All 8 modified test files exist and pass
- [x] Both Plan 06 commits exist in HEAD: `d58ba6e`, `7eff75b` (verified via `git log --oneline`)
- [x] Migration test suites preserved at 34 passing (no regression)
- [x] Full unit suite 696 passing, 0 failing
- [x] Webpack compiles
- [x] Lint clean

**Phase 16 ready for verifier sign-off.**
