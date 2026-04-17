# Phase 5: Integration Verification - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver an automated integration test suite that exercises the Phase 4 config-watcher and run-guard behavior end-to-end inside a real VS Code extension host, so the `config-edit → debounce → cache-invalidate → re-parse → Test Explorer update` flow and the `malformed config → warning popup → user choice → run/cancel` flow are both covered in CI. Closes TEST-08 and obsoletes the five pending Human UAT items from the v1.1 milestone audit. Scope ends at automation of the flows already built in Phase 4 — no production code changes beyond what the tests need for hooks/stubbing.

</domain>

<decisions>
## Implementation Decisions

### Scope & Coverage
- **D-01:** Integration test suite covers BOTH the watcher flow (config-edit → test-tree-update) and the run-guard flow (malformed config → warning popup → branch). Single phase delivers full E2E coverage for the v1.1 milestone, not just the literal wording of Success Criterion 1.
- **D-02:** Watcher tests cover all three `FileSystemWatcher` events — `onDidCreate`, `onDidChange`, `onDidDelete` — not just `onDidChange`. Closes the WATCH-02 end-to-end gap and the WATCH-05 "dispose-stops-events" manual-only residual from the v1.1 milestone audit.
- **D-03:** Run-guard test verifies the popup fires and each of the three button branches (`Run Anyway`, `Open Config File`, `Cancel`) routes correctly. Covers GUARD-01 through GUARD-04 at integration level.

### Suite & Fixture
- **D-04:** New dedicated suite at `test/integration/watcher-integration suite/`. Does NOT extend `config-only suite` or `malformed-config suite` — keeping existing 17 suites' `expectedResults.ts` untouched eliminates regression risk.
- **D-05:** New fixture at `example-projects/watcher-integration/`. Cloned from `example-projects/config-only` layout (features/ dir, environment.py, steps/, `[behave]` `behave.ini`). Fixture is mutated during tests — dedicated ownership means mutations never affect other suites.
- **D-06:** Fixture includes a second pre-created features directory (`features-alt/`) with at least one distinct `.feature` file, so the "change" test can swap `paths` to a known alternate target and assert an observable tree change.
- **D-07:** New suite wired into `test/integration/runTestSuites.ts` so it runs by default under `npm run test:integration` alongside the existing 17 suites. Becomes the 18th suite (Success Criterion 2).

### Test Sequencing & Cleanup
- **D-08:** Test ordering within the watcher flow: `delete → create → change` (linear). Each test's final state is the next test's starting state — no `beforeEach` restore between watcher tests; only a suite-level restore in `suiteTeardown`.
  - Test A (`delete`): start from fixture-with-`behave.ini`, delete it, assert the test tree falls back to convention and shows scenarios from `features/`.
  - Test B (`create`): starts from no-config state left by Test A, writes a new `behave.ini` with `paths = features-alt`, asserts tree now shows scenarios from `features-alt/`.
  - Test C (`change`): starts from Test B's state, rewrites `behave.ini` to `paths = features`, asserts tree switches back to `features/`.
- **D-09:** Original `behave.ini` content snapshotted in `suiteSetup`, restored in `suiteTeardown`. `try`/`finally` inside each `test()` restores the file if an assertion throws, so an abandoned mid-run does not poison the next CI run or leave dirty git state.
- **D-10:** Run-guard test lives in the same suite but runs AFTER the watcher tests (separate `suite()` block within the suite file, or a sibling `.test.ts`). Uses `example-projects/watcher-integration/` with the `behave.ini` temporarily mutated to malformed content, then restored in teardown.

### Wait / Sync Strategy
- **D-11:** Wait strategy for watcher tests = poll the VS Code `TestController` items (`ctrl.items` / `getScenarioTests()` helper) until the expected post-change state appears, timeout after 5s. Do NOT use fixed `setTimeout(N)` — fails Success Criterion 2 ("no new flakiness") on loaded CI runners.
- **D-12:** Poll interval = 100ms, overall timeout = 5000ms per wait. Well under the existing per-test Mocha timeout (300000ms) and covers: 500ms debounce + parse time + generous slack for Windows CI runners.
- **D-13:** Poll helper is a new shared utility in `test/integration/suite-shared/` (e.g. `waitForTestTree.ts`) — other future watcher tests can reuse it. Signature: `waitForTestTree(predicate, { intervalMs, timeoutMs })` returning the matching state or throwing with the last-seen state for a useful failure message.

### Run Guard Test Strategy
- **D-14:** Run-guard test stubs `vscode.window.showWarningMessage` via `sinon.stub` to return a predetermined button response (one test per branch: `Run Anyway` / `Open Config File` / `Cancel`). No real modal — eliminates CI hang risk.
- **D-15:** Run-guard test triggers `checkRunGuard` (or the equivalent entry point in `testRunHandler`) against a `TestRunRequest` scoped to the malformed workspace; asserts (a) the stub was called with a message containing the expected filename, (b) the run proceeds or is cancelled per the stubbed branch, (c) `vscode.window.showTextDocument` (or `vscode.commands.executeCommand('vscode.open', ...)`) was invoked for the `Open Config File` branch.
- **D-16:** Malformed-config state set up by writing bad TOML to `example-projects/watcher-integration/pyproject.toml` (or introducing a syntax error in `behave.ini`) in the guard test's `setup`, and restored in its `teardown`. Does not touch the same `behave.ini` file the watcher tests manipulate — keeps test state orthogonal.

### Telemetry & Assertion Shape
- **D-17:** Tests assert on observable extension state (test tree contents, cache entries via `getDiscoveryEntry`, stub invocations) rather than on `diagLog` / output-channel text. Logs are brittle to format changes and `xRay` setting state; cache + tree are the contract surface.
- **D-18:** Watcher tests also assert `getDiscoveryEntry(wkspUri)?.source` transitions correctly: `config-file → convention` on delete, `convention → config-file` on create, `config-file → config-file` (different featuresUri) on change. Covers Pitfall 11 (cache invalidation race) from the angle of "final state is right."

### Integration Test Bypass Handling
- **D-19:** The suite operates in a real VS Code extension host where `config.integrationTestRun = true`. The Phase 4 config watcher intentionally does NOT route through `configurationChangedHandler` (which has the `integrationTestRun` early-exit guard — Pitfall 14), so `configWatcher.ts` handlers must fire in this suite's context. The suite implicitly verifies Pitfall 14 is honored — if the watcher ever starts routing through `configurationChangedHandler`, these tests go red.

### Constraints & CI Compliance
- **D-20:** No new production code dependencies. All new code is under `test/integration/` and `example-projects/`. No change to `webpack.config.js`, `package.json` `dependencies`, or bundle size.
- **D-21:** Suite must pass three times in a row locally on Windows before PR merge (informal flakiness check) — no `.skip` or retry wrappers. Success Criterion 2 is a hard gate.

### Claude's Discretion
- Exact filenames/structure inside `test/integration/watcher-integration suite/` (single `extension.test.ts` with nested suites vs. split `watcher.test.ts` + `runguard.test.ts`). Follow the pattern most consistent with the existing 17 suites.
- Exact poll helper API shape (promise-based vs. async-iterator) — pick what reads cleanest for this codebase.
- Whether the fixture's `features-alt/` contains one or several scenarios. One is enough for observability; more is harmless.
- `TestSupport`/`activateExtensionAndWait` bootstrap pattern vs. direct `parser` access — match whatever existing simple-suite / config-only-suite do for `suiteSetup`.
- How to assert "test tree rebuilt from convention" after delete — probably simplest to compare against the tree shape before any config file existed, which matches the existing `simple suite` baseline.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Audit
- `.planning/REQUIREMENTS.md` — TEST-08 (the phase target), plus WATCH-01..06 and GUARD-01..04 for coverage mapping
- `.planning/v1.1-MILESTONE-AUDIT.md` — Gap closure contract: TEST-08 unsatisfied, 5 human-UAT tests to obsolete via automation, WATCH-05 dispose-stops-events manual-only residual

### Architecture & Pitfalls (must understand before writing tests)
- `.planning/research/PITFALLS.md` §Pitfall 3 — `onDidChange` fires before file flushed to disk; 500ms debounce is the mitigation — tests must wait past debounce
- `.planning/research/PITFALLS.md` §Pitfall 10 — All three events (create/change/delete) register separate handlers; delete must trigger convention fallback
- `.planning/research/PITFALLS.md` §Pitfall 14 — `configurationChangedHandler` has `integrationTestRun` early-exit; config watcher bypasses it by calling `getUrisOfWkspFoldersWithFeatures(true)` + `parser.parseFilesForWorkspace` directly. This is WHY integration tests for the watcher work at all.
- `.planning/phases/04-watcher-run-guard/04-CONTEXT.md` §Watcher Lifecycle + §Run Guard UX — Phase 4 locked decisions that this suite verifies
- `.planning/STATE.md` §Key Architecture Constraints — config watcher + run guard constraints

### Existing Code (must read before implementing tests)
- `src/watchers/configWatcher.ts` — The System Under Test for the watcher suite. Event handler, debounce Map, direct cache+parser call path
- `src/extension.ts` — `configurationChangedHandler`, `wkspConfigWatchers` lifecycle, `integrationTestRun` flag, `TestSupport` export
- `src/runners/testRunHandler.ts` — `checkRunGuard` or equivalent, the SUT for the run-guard suite
- `src/common.ts` — `getDiscoveryEntry`, `getUrisOfWkspFoldersWithFeatures`, `DiscoveryEntry.configError`, `uriId`

### Test Infrastructure Patterns (must mirror)
- `.planning/codebase/TESTING.md` — Mocha TDD UI (`suite()`/`test()`), Sinon sandbox pattern, integration test `@vscode/test-electron` bootstrap
- `test/integration/runTestSuites.ts` — Orchestrator to extend; each suite entry = `launchArgs` (workspace path) + `extensionTestsPath` (compiled suite dir)
- `test/integration/config-only suite/extension.test.ts` — Closest structural analog (static-config suite against `example-projects/config-only`)
- `test/integration/malformed-config suite/extension.test.ts` — Closest analog for the malformed-config path
- `test/integration/suite-shared/shared.workspace.tests.ts` + `extension.test.helpers.ts` — Shared activation pattern (`TestSupport`, `activateExtensionAndWait`) and assertion helpers
- `test/integration/simple suite/extension.test.ts` — Baseline pattern: `suiteSetup` activates, `suiteTeardown` cleans up, `this.timeout(120000)` suite-level

### Example Project Patterns (must mirror)
- `example-projects/config-only/` — Layout template for new `example-projects/watcher-integration/` fixture (behave.ini + features/ + environment.py + steps/)
- `example-projects/malformed-config/` — Malformed-state template for the run-guard test mutation

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SharedWorkspaceTests` in `test/integration/suite-shared/shared.workspace.tests.ts` — Default/parallel/together run harness. Probably NOT a direct fit for watcher tests (which need dynamic fixture mutation, not a single `runHandler` assertion cycle), but its activation + cleanup shape is the reference.
- `activateExtensionAndWait`-style bootstrap used by existing suites — returns `TestSupport` with `ctrl` (TestController), `config`, `parser`. Watcher tests get at `ctrl.items` / `getScenarioTests` through this.
- `extension.test.helpers.ts` helpers: `assertTestResultMatchesExpectedResult`, `assertWorkspaceSettingsAsExpected`, `getScenarioTests`, `getUrisOfWkspFoldersWithFeatures`, `urisMatch`, `uriId`, `isFeatureFile`. Wait helper is new; most other assertion plumbing exists.
- `sinon.createSandbox()` pattern from unit tests — Run-guard test reuses this for `showWarningMessage` stub; sandbox is restored in teardown.
- `fs.writeFileSync` / `fs.unlinkSync` — Used directly to mutate fixture; matches the `configParser.ts` reading pattern (sync fs).

### Established Patterns
- **Integration suite scaffold:** `test/integration/<suite name>/` contains `extension.test.ts`, `index.ts` (re-exports `runner` helper), optional `expectedResults.ts`. Launch orchestrated by `runTestSuites.ts`.
- **Suite lifecycle:** `suiteSetup` activates extension + captures initial state; `suiteTeardown` disposes. `setup`/`teardown` per test for sandbox/fixture-state.
- **Fixture projects:** Live under `example-projects/`, one directory per workspace. Referenced by relative path in `runTestSuites.ts` `launchArgs`.
- **Debounce pattern (production):** `configDebounceTimers: Map<string, NodeJS.Timeout>` keyed on `wkspUri.path` with 500ms. Tests must wait longer than 500ms.
- **Cache assertion:** `getDiscoveryEntry(wkspUri)` returns the `DiscoveryEntry` including `source`, `featuresUri`, `configError`. Authoritative post-watcher state.

### Integration Points
- New suite file: `test/integration/watcher-integration suite/extension.test.ts` — entry point compiled to `out/test/integration/watcher-integration suite/extension.test.js`.
- New suite index: `test/integration/watcher-integration suite/index.ts` — re-exports `runner("**/watcher-integration suite/**.test.js")`.
- `test/integration/runTestSuites.ts` — Append one more `runTests({...})` call with `launchArgs = ["example-projects/watcher-integration"]` and `extensionTestsPath = getShortPathOnWindows(path.resolve(__dirname, './watcher-integration suite'))`.
- `package.json` integration test scripts — No change required; `runTestSuites.ts` is the single entry point for all integration suites.
- New fixture: `example-projects/watcher-integration/` — mirrors `config-only/` layout (behave.ini with `paths = features`, features/, features-alt/, environment.py, steps/).
- New shared helper: `test/integration/suite-shared/waitForTestTree.ts` — polling primitive exported for reuse.

</code_context>

<specifics>
## Specific Ideas

- The `features-alt/` fixture contents should be a single scenario with a distinct label that the test can grep on, e.g. `Scenario: alternate path discovery` inside `features-alt/alt.feature`. The watcher tests assert the label is present/absent in `ctrl.items`.
- The run-guard test should assert on the exact message fragment from `04-CONTEXT.md` D-04 pattern (`"Config file '{filename}' has parse errors."`) so any message drift also fails the integration test. Matches the existing `config-only` pattern of assertion tying back to production strings.
- Prefer splitting suite file into `watcher.test.ts` + `runGuard.test.ts` within the suite directory if it reads cleaner — `index.ts` glob `**.test.js` picks up both. Either is acceptable (Claude's Discretion).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. Future enhancements (e.g., multi-root watcher interference tests, concurrent-edit stress tests, pyproject.toml-specific malformed-state tests beyond the single run-guard case) remain in the backlog if new regressions surface.

</deferred>

---

*Phase: 05-integration-verification*
*Context gathered: 2026-04-17*
