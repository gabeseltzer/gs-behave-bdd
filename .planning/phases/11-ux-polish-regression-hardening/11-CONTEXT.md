# Phase 11: UX Polish + Regression Hardening - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Lock down the v1.2 feature set with a multi-scenario integration test matrix running against dedicated fixtures (`multi-path/`, `multi-path-settings/`, `monorepo-scan/`), with a one-time 3× Windows CI flakiness gate before milestone close. No production code changes beyond what tests need for hooks/stubbing and the `logSettings` plural output verification.

This phase depends on Phases 8, 9, and 10 being complete. It exercises the features those phases built — multi-path from `behave.ini`, multi-path from `settings.json` `featuresPaths`, subdirectory config scanning, config-edit → tree rebuild, and `discoveryDepth=0` edge case.

</domain>

<decisions>
## Implementation Decisions

### Fixture Design & Isolation

- **D-01:** `multi-path/` fixture starts with `behave.ini` pointing to a single path (`paths = features`). Tests edit the config to add the second path (`features-alt`), exercising config-edit → tree rebuild. The dormant path is pre-created with feature files but not referenced in the initial config.
- **D-02:** `monorepo-scan/` fixture is richer: `app-a/behave.ini` + `app-a/features/` at depth 1, `app-b/behave.ini` + `app-b/features/` at depth 1, `packages/app-c/behave.ini` + `packages/app-c/features/` at depth 2 for depth ordering, plus a `node_modules/` stub directory.
- **D-03:** Different scenario counts per root for distinctive tree-shape assertions — e.g., root A has 2 scenarios, root B has 1. This makes tree-content assertions unambiguous (can distinguish roots by scenario count, not just labels).
- **D-04:** `node_modules/` is a single marker file (e.g., `node_modules/.gitkeep`). Enough to assert the scanner skips it. Trust unit tests (TEST-11) for scanner perf validation.

### Integration Test Scenario Matrix

- **D-05:** Three new test suites, each wired into `runTestSuites.ts` as separate VS Code instance launches:
  - `multi-path suite/` → launched with `example-projects/multi-path/`
  - `multi-path-settings suite/` → launched with `example-projects/multi-path-settings/`
  - `monorepo-scan suite/` → launched with `example-projects/monorepo-scan/`
- **D-06:** Separate `multi-path-settings/` fixture with `.vscode/settings.json` containing `"gs-behave-bdd.featuresPaths": ["features", "features-alt"]` and no `behave.ini`. Tests multi-path via the settings key independently of config-file discovery.
- **D-07:** Config-edit rebuild in `multi-path suite/` is a three-test round-trip:
  - Test A: Assert single-path baseline (only `features/` scenarios in tree).
  - Test B: Edit `behave.ini` to add second path (`paths = features\n  features-alt`), assert tree rebuilds with both roots via `waitForTestTree`.
  - Test C: Edit `behave.ini` back to single path, assert tree reverts.
- **D-08:** `discoveryDepth=0` edge case tested in `monorepo-scan suite/` via programmatic `vscode.workspace.getConfiguration().update("gs-behave-bdd.discoveryDepth", 0)`, assert no subdirectory configs found (empty or root-only tree), then restore setting in teardown.

### `logSettings` Plural Output

- **D-09:** Unit test only for SC-5 — construct a multi-path `WorkspaceSettings` and assert the log output contains both paths comma-separated. Integration tests implicitly exercise this via normal activation logging. No separate integration assertion needed.
- **D-10:** Agent's discretion on log key naming (`fullFeaturesPaths` / `featuresPaths` vs renaming). Current implementation already renders plural paths correctly.

### Windows CI Flakiness Strategy

- **D-11:** The 3× gate is a one-time manual validation after all Phase 11 code is complete. NOT built into the test pipeline — run the full integration suite 3 times once to confirm no flakiness.
- **D-12:** Agent's discretion on `waitForTestTree` timeouts — pick appropriate values based on what each test exercises (config-edit rebuild, BFS scan, etc.).
- **D-13:** Hard rule — no retries (no Mocha `--retries`), no `.skip`. If a test is flaky, fix the test. Matches v1.1 precedent (Phase 5 D-21).
- **D-14:** Manual gate — developer runs `npm run test:integration` 3 times locally on Windows. No automation script needed.

### Claude's Discretion

- Exact internal file structure within each test suite directory (single `extension.test.ts` with nested suites vs. split files). Follow the pattern most consistent with existing suites.
- Exact scenario names and step text in fixture feature files — just needs to be distinctive per root.
- Whether `multi-path-settings/` shares `features/` and `features-alt/` directory structure with `multi-path/` (likely yes — same layout, different discovery mechanism).
- `waitForTestTree` timeout values per suite.
- Log key naming in `logSettings` (keep current or rename).
- Exact `node_modules/` stub structure (`.gitkeep` vs `placeholder/package.json`).
- Whether the `monorepo-scan/` fixture's `app-a/`, `app-b/`, `packages/app-c/` each have their own `steps/` + `environment.py` or share a common one.

</decisions>

<specifics>
## Specific Ideas

- **Fixture isolation per D-05 (Phase 5):** Each fixture is mutated only by its own suite. No cross-suite reads or mutations. The `multi-path/` `behave.ini` is snapshot/restored in `suiteSetup`/`suiteTeardown` (same pattern as `watcher-integration/`).
- **Chained test ordering per D-08 (Phase 5):** The three-test round-trip in `multi-path suite/` chains state — Test A's end state is Test B's start state. Suite-level teardown is the authoritative restore.
- **`waitForTestTree` reuse:** All new suites reuse the shared `test/integration/suite-shared/waitForTestTree.ts` helper from Phase 5.
- **`runTestSuites.ts` wiring:** Three new `runTests()` calls appended to the existing list (currently 14 suites → 17 after Phase 11).
- **monorepo-scan depth ordering:** `app-a/` and `app-b/` are at depth 1, `packages/app-c/` at depth 2. With `discoveryStopOnFirstHit=false` (default), all three should be found. The primary should be `app-a/` or `app-b/` (depth 1 wins per Phase 9 D-11/D-12).

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap + Requirements
- `.planning/ROADMAP.md` §Phase 11 — Goal, Success Criteria 1-5, Requirements TEST-13 + TEST-14 + TEST-15
- `.planning/REQUIREMENTS.md` §TEST-13, §TEST-14, §TEST-15 — exact acceptance criteria

### Prior Phase Context (fixtures + test patterns)
- `.planning/phases/05-integration-verification/05-CONTEXT.md` — D-05 (dedicated fixture), D-08 (chained test ordering), D-09 (suite teardown restore), D-11/D-12/D-13 (waitForTestTree), D-21 (3× flakiness gate)
- `.planning/phases/08-parser-test-tree-watcher-multi-root/08-CONTEXT.md` — D-01 (path-group labels), D-02 (path-groups when paths= set), D-04 (partial discovery), D-07 (global steps/fixtures)
- `.planning/phases/09-subdirectory-config-scan/09-CONTEXT.md` — D-01 (async BFS), D-06 (multi-config notification), D-08 (suppressMultiConfigNotification), D-11/D-12 (depth ordering), D-14 (full scan to maxDepth), D-15 (new settings)
- `.planning/phases/10-featurespaths-user-facing-setting/10-CONTEXT.md` — D-01 through D-14 (featuresPaths setting shape, precedence, hasExplicitSetting)

### Existing integration test patterns (must match)
- `test/integration/watcher-integration suite/extension.test.ts` — Reference implementation for config-edit → tree rebuild testing, snapshot/restore, waitForTestTree usage
- `test/integration/suite-shared/waitForTestTree.ts` — Shared poll helper (reuse, don't recreate)
- `test/integration/runTestSuites.ts` — Suite wiring pattern (one `runTests()` call per fixture)
- `test/integration/config-only suite/extension.test.ts` — Simpler suite pattern for read-only fixture tests

### Source files for logSettings assertion
- `src/settings.ts` §logSettings (line ~320) — Already renders `fullFeaturesPaths` and `featuresPaths` as comma-joined plurals

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `waitForTestTree(predicate, { intervalMs, timeoutMs })` — Shared poll helper, already battle-tested in watcher-integration suite. Reuse directly for all new suites.
- `setupTestSupport()` / `getWorkspaceUri()` / `findScenarioByName()` patterns from `watcher-integration suite/extension.test.ts` — Copy and adapt for new suites.
- `getAllTestItems()` / `getScenarioTests()` from `src/common.ts` — Used in integration tests to inspect test tree contents.
- `getDiscoveryEntry()` from `src/extension.ts` — Assert discovery cache state in tests.

### Established Patterns
- One `runTests()` call per fixture in `runTestSuites.ts` — each suite launches a fresh VS Code instance with its own workspace.
- Fixture mutation via `fs.writeFileSync` / `fs.unlinkSync` with snapshot/restore in `suiteSetup`/`suiteTeardown`.
- `config.integrationTestRun = true` set in `setupTestSupport()` — bypasses `configurationChangedHandler` early-exit guard.
- Feature files use `Given we have behave installed` / `When we implement a successful test` / `Then we will see the result` step text (matching `steps.py` in each fixture).

### Integration Points
- New suites wire into `test/integration/runTestSuites.ts` as 3 additional `runTests()` blocks.
- New fixtures live under `example-projects/` alongside existing 8+ fixtures.
- `monorepo-scan suite/` exercises `configScanner.ts` BFS + `updateDiscoveryUX` notification path.
- `multi-path suite/` exercises Phase 8's consumer cascade (path-group TestItems, watcher fan-out).
- `multi-path-settings suite/` exercises Phase 10's `featuresPaths` settings key path.

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 11-ux-polish-regression-hardening*
