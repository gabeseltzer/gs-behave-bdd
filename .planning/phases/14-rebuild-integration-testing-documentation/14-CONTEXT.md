# Phase 14: Rebuild, Integration Testing & Documentation - Context

**Gathered:** 2026-04-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Switching the active project triggers full test tree and step mapping rebuild; an end-to-end integration test with a multi-project fixture verifies the flow; README documents the complete discovery feature set (auto-discovery, multi-path configs, monorepo scanning, project switching).

This phase wires Phase 13's `setActiveProject()` call to a full rebuild (discovery cache → settings → parser), adds a run guard during rebuild, creates a dedicated integration test fixture and suite, and writes README documentation. It does NOT change the project list data layer (Phase 12) or the quick-pick/status bar UX (Phase 13).

</domain>

<decisions>
## Implementation Decisions

### Rebuild Feedback During Switch
- **D-01:** Show the **Test Controller resolving state** (loading spinner in Test Explorer) during the rebuild, consistent with Phase 12 D-10's initial scan pattern.
- **D-02:** Show a **`withProgress` notification** during rebuild (e.g. "Switching to project: backend...") so the user has feedback outside the Test Explorer too.
- **D-03:** No confirmation notification after rebuild completes — the test tree update is sufficient feedback.
- **D-04:** **Block test runs during rebuild.** Use a run guard or equivalent gate so users cannot run tests against stale/partial state while the new project is loading.

### README Documentation Scope
- **D-05:** Add bullet point(s) in the "New in this fork" feature list AND a dedicated **"## Auto-Discovery & Project Switching"** section for details.
- **D-06:** Brief text descriptions only — no config file examples or detailed walkthroughs.
- **D-07:** Text only — no directory tree diagrams or screenshots for the new documentation.
- **D-08:** Update existing `projectPath`/`featuresPath` documentation to frame them as **manual overrides** of auto-discovery, with a note like "In most cases you don't need these settings."

### Integration Test Design
- **D-09:** Test both switch directions — A→B AND B→A — to verify the rebuild is fully symmetric.
- **D-10:** Verify **step navigation** (go-to-definition) works after switching, confirming INT-02 (step mapping rebuild). Each sub-project in the fixture has distinct step definitions.
- **D-11:** Create a new dedicated **`example-projects/project-switch/`** fixture with two sub-projects (distinct features, distinct steps) for clean isolation from existing monorepo-scan tests.
- **D-12:** Create a separate **`test/integration/project-switch suite/`** with its own VS Code instance launch, not added to the existing monorepo-scan suite.

### Agent's Discretion
- Exact rebuild implementation: whether to call the existing `configurationChangedHandler` flow or build a dedicated `switchProject()` function
- How the run guard gate works during rebuild (boolean flag, promise-based, or reuse existing `integrationTestRun` pattern)
- `withProgress` location (notification vs status bar progress) and cancellation support
- Fixture structure: number of scenarios per sub-project, step definition complexity
- README section placement relative to existing sections (before or after "Workspace requirements")
- Integration test runner configuration (`.vscode-test.mjs` entry, launch args)

</decisions>

<specifics>
## Specific Ideas

- **`withProgress` during rebuild** — VS Code's `window.withProgress({ location: ProgressLocation.Notification })` is the standard pattern. The progress message should name the target project. Non-cancellable (rebuild is fast and must complete).
- **Run guard pattern** — The existing `checkRunGuard()` function already gates test execution for malformed configs. Extending it with a "rebuild in progress" check is the natural integration point.
- **Rebuild sequence** — The existing `configurationChangedHandler` in extension.ts already handles: clear discovery cache → re-scan → reload settings → reparse. The project switch needs a similar sequence but scoped to "active project changed" rather than "config file changed."
- **Fixture design** — Two sub-projects (e.g. `alpha/` and `beta/`) each with a `behave.ini`, a `features/` dir with one feature file, and a `steps/` dir with distinct step definitions. Scenarios and step text must be different so the test can assert which project's content is visible.
- **Step navigation verification** — Use `TestSupport.getStepFileStepForFeatureFileStep()` to verify that after switching, a feature file step resolves to the new project's step definition file.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap + Requirements
- `.planning/ROADMAP.md` §Phase 14 — Goal, Success Criteria 1-4, Requirements INT-01, INT-02, TEST-03, DOC-01
- `.planning/REQUIREMENTS.md` §INT-01, §INT-02, §TEST-03, §DOC-01 — exact acceptance criteria

### Prior Phase Context
- `.planning/phases/12-project-list-discovery-persistence/12-CONTEXT.md` — D-01 through D-11 (project list data layer, fallback, ordering)
- `.planning/phases/13-switching-ux-quick-pick-status-bar/13-CONTEXT.md` — D-01 through D-12 (quick-pick, status bar, notification update)
- `.planning/phases/12-project-list-discovery-persistence/12-01-SUMMARY.md` — ProjectList module API
- `.planning/phases/12-project-list-discovery-persistence/12-02-SUMMARY.md` — Extension lifecycle wiring
- `.planning/phases/13-switching-ux-quick-pick-status-bar/13-01-SUMMARY.md` — Select Project command, status bar implementation

### Key Source Files
- `src/extension.ts` — `selectProjectCommand` handler (lines 549-620, calls `setActiveProject` but does NOT rebuild), `configurationChangedHandler`, `updateDiscoveryUX()`, `TestSupport` type
- `src/discovery/projectList.ts` — `setActiveProject()`, `getActiveProject()`, `getProjectList()`, `isManualProjectPathMode()`
- `src/common.ts` — `discoveryCache`, `getUrisOfWkspFoldersWithFeatures()`, `checkRunGuard()`
- `src/configuration.ts` — `config.reloadSettings()`, `WorkspaceSettings`
- `src/parsers/fileParser.ts` — `parser.parseFilesForWorkspace()`
- `README.md` — Current documentation (no discovery/switching content yet)

### Integration Test Patterns
- `test/integration/monorepo-scan suite/extension.test.ts` — Existing integration test pattern: `setupTestSupport()`, `waitForTestTree()`, `configurationChangedHandler()` calls
- `test/integration/suite-shared/waitForTestTree.ts` — Shared polling helper for async tree updates
- `example-projects/monorepo-scan/` — Existing multi-project fixture (app-a, app-b, packages/app-c)

### Architecture Decisions
- `.planning/STATE.md` §v1.3.0 Architecture Decision — "One active project at a time with switching"

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `configurationChangedHandler()` in `extension.ts` — Handles full re-discovery + settings reload + reparse cycle. May be reusable for switch-triggered rebuilds.
- `checkRunGuard()` in `common.ts` — Existing gate for blocking test runs on malformed configs. Natural extension point for "rebuild in progress" blocking.
- `waitForTestTree()` in `test/integration/suite-shared/` — Polling helper that waits for a condition on the test tree. Reusable for switch integration tests.
- `TestSupport.getStepFileStepForFeatureFileStep()` — Exposed on the test support interface; can verify step navigation after switching.
- `getAllTestItems()` / `getScenarioTests()` in `common.ts` — Test tree traversal helpers used in existing integration tests.

### Established Patterns
- **Integration test setup** — `setupTestSupport()` activates extension, sets `integrationTestRun = true`, waits 3s for initial parse.
- **Tree verification** — Poll with `waitForTestTree()` using `intervalMs: 100, timeoutMs: 15000`.
- **Configuration triggering** — `instances.configurationChangedHandler(undefined, undefined, true)` forces re-discovery in integration tests.
- **Suite structure** — Each suite in its own directory under `test/integration/`, with `extension.test.ts` and a corresponding entry in `.vscode-test.mjs`.

### Integration Points
- `selectProjectCommand` in `extension.ts` — Currently calls `setActiveProject` + status bar update + log. Needs to also trigger rebuild.
- `checkRunGuard()` — Needs a "rebuilding" state check.
- `.vscode-test.mjs` — Integration test runner config; needs new suite entry for `project-switch suite`.
- `package.json` scripts — May need `test:integration` script update if suite config changes.

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 14-rebuild-integration-testing-documentation*
