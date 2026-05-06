# Phase 17: Cross-Cutting Verification - Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

End-to-end regression validation of the v1.4.0 milestone. Both migrations (Phase 15 `suppressMultiConfigNotification` → `suppressedNotifications[]` and Phase 16 `featuresPath` → `featuresPaths[]`) are functionally shipped at the unit-test level. Phase 17 closes the verification gap by:

1. Running the existing automated test bar (unit + integration + lint) against the integrated state
2. Adding new integration tests that exercise the live-VSCode behaviors deferred from Phases 15 + 16 — specifically the `cfg.inspect()` contract on unregistered keys, the per-workspace migration loop end-to-end, the D-18 ordering invariant, and the migration notification firing
3. Closing out Phase 15's 2 pending HUMAN-UAT items

Phase 17 ships **no new product code**. All work lands under `test/integration/` and `example-projects/`. If the regression pass discovers a real bug in shipped Phase 15/16 code, that's a fix-forward in this phase (see Deferred Ideas — failure-handling protocol was not pre-decided; planner picks per-incident).

</domain>

<decisions>
## Implementation Decisions

### Verification Strategy (D-01..D-03)
- **D-01:** All 3 live-VSCode behaviors from ROADMAP success criteria #3, #4, #5 become **automated `@vscode/test-electron` integration tests** — not HUMAN-UAT items. The DSA-click UI flow is included in scope of automation; the user explicitly chose full automation over a hybrid manual/auto split. Rationale: migrations are mechanical and high-value to gate on CI; treating any of them as "human-only" leaves regression risk on every future release.
- **D-02:** Add a **standalone A1-probe integration test** that writes an unregistered key to `.vscode/settings.json`, calls `vscode.workspace.getConfiguration().inspect("<unregistered>")`, and asserts the per-scope shape (`globalValue` / `workspaceValue` / `workspaceFolderValue`). This is the load-bearing contract Phase 15's `migrateLegacySuppressMultiConfig` and Phase 16's `migrateLegacyFeaturesPath` both rely on. Tiny, fast, definitive — closes Phase 15's pending HUMAN-UAT item #1 and Phase 16's inherited assumption in one shot.
- **D-03:** Phase 15's HUMAN-UAT item #2 (live notification + DSA click) is replaced by an automated integration test (per D-01), not re-run manually. After Phase 17 ships, Phase 15's HUMAN-UAT status flips from `partial` to `complete (superseded by Phase 17 automation)`.

### Test File Organization (D-04)
- **D-04:** All new tests land in a single new file `test/integration/migrations.test.ts` for cohesion and shared setup helpers. Follows the existing `test/integration/<name>.ts` pattern (e.g., `runTestSuites.ts`, `testRunUtils.ts`). Test suite directory follows the `<name> suite/` convention if a fixture-tied suite is needed (e.g., `test/integration/migrations suite/` for the combined fixture's index).

### Fixture Strategy (D-05..D-08)
- **D-05:** **Single combined fixture** pre-seeded with both stale keys (`gs-behave-bdd.featuresPath`, `behave-vsc.featuresPath`, `gs-behave-bdd.suppressMultiConfigNotification: true`) at varying scopes. One Dev Host launch exercises: Phase 15 migration, Phase 16 migration, D-18 ordering invariant (featuresPath migrates first), the post-migration notification, and cross-namespace independence (D-04 of Phase 16). A separate clean-baseline fixture is **NOT** added — ROADMAP success criterion #3 ("fresh activation with no deprecated settings") is implicitly covered by the existing 18 integration suites, all of which use clean fixtures.
- **D-06:** Fixture lives under `example-projects/` alongside existing fixtures (e.g., `example-projects/migration-stale/` — exact name is planner's discretion). Follows the established convention; existing integration suites all source fixtures from this directory.
- **D-07:** Combined fixture seeds **both `gs-behave-bdd` and `behave-vsc` namespaces** for `featuresPath`, placed at different scopes to exercise Phase 16's D-02 (both-namespace migration) and D-04 (cross-scope independence) in one Dev Host launch. No separate `behave-vsc`-only fixture is added — unit tests already cover that namespace in isolation.
- **D-08:** **Pre-committed seeded `.vscode/settings.json`** in the fixture (not programmatic seed/cleanup per test). Simple, deterministic, matches how existing `example-projects/` fixtures work. Trade-off accepted: tests must reset the fixture's settings.json after each run (or the test runs are non-idempotent). Planner picks the reset mechanism — git-checkout in `afterEach`, write-back from a checked-in `.vscode/settings.template.json`, or marking the fixture as run-once-per-CI-job.

### Assertion Strategy (D-09)
- **D-09:** Tests verify migration outcome via **both file content and `inspect()` API** (belt-and-suspenders). File content asserts the user-visible state (what lands in their `settings.json`); `inspect()` asserts the runtime VS Code API contract. Catches divergence between "we wrote the file" and "VS Code reads what we wrote at the right scope." Reasonable extra cost for a milestone-closing regression gate.

### the agent's Discretion
- Exact fixture directory name under `example-projects/`
- Reset mechanism for the seeded `settings.json` between test runs (git checkout, template copy, or run-once gating)
- Number and shape of individual `it()` blocks within `migrations.test.ts` — could be one large E2E test asserting many properties, or several focused tests sharing a single Dev Host launch via `before` hooks. Planner picks based on what reads cleanest and stays under the existing per-suite timeout budget.
- Whether `migrations.test.ts` lives directly in `test/integration/` or under a `migrations suite/` subdirectory — planner matches whichever pattern fits the existing convention for cross-cutting (non-fixture-tied) tests.
- Failure-handling protocol if regression catches a real bug in shipped Phase 15/16 code: fix-forward inline as a Phase 17 plan vs. spawn Phase 17.1 vs. kick back to Phase 15/16. Not pre-decided — planner/executor handles per-incident.
- Documentation/CHANGELOG outputs (README deprecation note, CHANGELOG.md creation, milestone retro doc) — not pre-decided. Planner may include in a final cleanup plan or defer to milestone close-out outside Phase 17.

</decisions>

<specifics>
## Specific Ideas

- The combined fixture is the load-bearing artifact. It must seed `gs-behave-bdd.featuresPath` at one scope, `behave-vsc.featuresPath` at a different scope, and `gs-behave-bdd.suppressMultiConfigNotification: true` at a third scope (or overlapping scopes — planner chooses to maximize coverage). Post-activation assertions check that all three legacy keys are gone, `gs-behave-bdd.featuresPaths[]` contains the merged values at the correct scopes, and `gs-behave-bdd.suppressedNotifications[]` contains `multiConfigNotification` at the correct scope.
- The A1-probe test is a 10-line standalone test, not part of the combined-fixture suite. It can use any minimal fixture (or a temp dir) — its purpose is to confirm the VS Code API contract, not to test migration logic.
- The DSA-click flow requires invoking `vscode.window.showInformationMessage` and simulating a button click. The repo's existing integration tests don't currently exercise notification UI; the planner will need to research how `@vscode/test-electron` handles notification interaction (likely via stubbing `vscode.window.showInformationMessage` from within the activated extension's test entry-point, or via the Electron-level UI driver).
- D-18 ordering assertion: after activation, the order in which the migrations ran is observable via the resulting state — if `featuresPaths[]` contains the migrated value AND `suppressedNotifications[]` contains `multiConfigNotification`, both ran. Direct ordering can be asserted by spying on `config.logger.logInfo` calls if needed (each migration logs distinct messages), or accepted as implicit if the post-state is correct.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Verification debt being closed
- `.planning/phases/15-notification-suppression/15-VALIDATION.md` §Manual-Only Verifications — the 2 deferred items being closed by D-01/D-02/D-03.
- `.planning/phases/15-notification-suppression/15-HUMAN-UAT.md` — current `partial` status; flips to `complete (superseded)` after Phase 17.
- `.planning/phases/16-deprecate-featurespath/16-CONTEXT.md` §"Verification debt to be aware of" — explicit handoff that Phase 16's real-VSCode A1 confirmation rolls into Phase 17.

### Migration code under test
- `src/notifications.ts` — `migrateLegacySuppressMultiConfig`, `migrateLegacyFeaturesPath`, `migrateScopedSetting` primitive. The integration tests black-box-verify the activation outcomes; they do not call these directly.
- `src/extension.ts` `activate()` — the per-workspace migration loop (Phase 15 D-05 + Phase 16 D-18). Activation ordering is the structural invariant being exercised.
- `src/configuration.ts` `config.reloadSettings(wkspUri)` — sync void; called after each migration in the activation loop (Pitfall 4 / Pitfall 8).

### Phase 16 migration semantics being verified
- `.planning/phases/16-deprecate-featurespath/16-CONTEXT.md` D-02 (both namespaces), D-03 (same-scope write), D-04 (cross-scope independence), D-06/D-07 (merge with normalized dedup), D-18 (ordering).

### Phase 15 migration semantics being verified
- `.planning/phases/15-notification-suppression/15-CONTEXT.md` D-05 (eager activation), D-08 (same-scope write), D-11 (dedup on write).

### Existing integration test infrastructure
- `test/integration/runTestSuites.ts` — top-level suite runner; Phase 17 plans hook in via this entry point.
- `test/integration/index.helper.ts` — shared Dev Host setup helpers; reuse for the new `migrations.test.ts`.
- `test/integration/<name> suite/` directories — fixture-tied suite convention (e.g., `multi-path suite/`, `project-switch suite/`).
- `test/integration/.mocharc.json` — integration test mocha config.
- `example-projects/` — fixture root; existing examples include `multi-path/`, `pyproject-config/`, `multiroot bad features path/`. The new `migration-stale` (or planner-named) fixture lives here.

### Project-level
- `.planning/REQUIREMENTS.md` — DEP-01..DEP-07 and NOTIF-01..NOTIF-08 acceptance criteria. All marked `[x]` at unit level; Phase 17 confirms at integration level.
- `.planning/ROADMAP.md` §Phase 17 — success criteria #1-#5.
- `.planning/PROJECT.md` — milestone v1.4.0 framing; "Auto-migration ensures users with `featuresPath` see zero behavior change" — the integration tests are the empirical check on this claim.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `test/integration/index.helper.ts` — shared Dev Host launch + activation helpers. Reuse verbatim.
- `test/integration/runTestSuites.ts` — top-level orchestrator; new suite registered here.
- `example-projects/multi-path/`, `example-projects/multiroot bad features path/` — existing fixtures with pre-committed `.vscode/settings.json`. Structural template for the new `migration-stale/` fixture.
- `src/notifications.ts` — Phase 15 + Phase 16 migration helpers + the `migrateScopedSetting` primitive. Black-box-verified via activation outcome; not called directly from tests.
- `vscode.workspace.getConfiguration().inspect()` — used in tests to assert per-scope state post-activation (D-09).

### Established Patterns
- Per-fixture integration suite: `test/integration/<name> suite/index.ts` exports a Mocha suite that runs against the fixture in `example-projects/<name>/`. Phase 17's `migrations.test.ts` either follows this pattern (with a `migrations suite/` directory) or sits as a top-level cross-cutting test in `test/integration/migrations.test.ts` — planner's discretion.
- Pre-committed `.vscode/settings.json` in fixtures (vs. programmatic per-test seeding). All existing fixtures follow this; Phase 17 keeps the pattern (D-08).
- `cfg.inspect()` per-scope reads (Pitfall 2) — tests follow the same pattern as runtime code.

### Integration Points
- New fixture `example-projects/<migration-stale>/` — pre-seeded `.vscode/settings.json` with the 3 stale keys at varying scopes. Includes a minimal `features/` directory (or a `behave.ini` / `pyproject.toml`) so activation actually proceeds far enough to enter the migration loop.
- New file `test/integration/migrations.test.ts` (or `test/integration/migrations suite/index.ts`) — exercises the combined fixture + standalone A1-probe.
- `test/integration/runTestSuites.ts` registration — adds the new suite to the existing roster.
- After-test reset of fixture `.vscode/settings.json` — mechanism is planner's choice (D-08 trade-off).

</code_context>

<deferred>
## Deferred Ideas

- **CHANGELOG.md creation, README deprecation note, milestone retro doc** — these are milestone v1.4.0 close-out artifacts. Not pre-decided for Phase 17. Planner may include in a final cleanup plan or defer to a separate milestone-close pass after Phase 17 ships.
- **Failure-handling protocol if regression catches a real bug** — not pre-decided. Handled per-incident by planner/executor (fix-forward as a Phase 17 plan, spawn Phase 17.1, or kick back to Phase 15/16 as appropriate).
- **Phase 16-specific manual UAT additions** (Open Settings button click, "." literal migration triggering existing fatal-error guard, behave-vsc-only namespace edge cases) — user opted to keep Phase 17 scope tight. If the integration-test coverage from D-01..D-09 leaves gaps, planner may add unit tests; broader manual UAT is not in this phase.
- **Performance/load testing of activation under many migrations** — out of scope. Migration is bounded by workspace folder count; not a stress-test concern at v1.4.0.
- **Migration registry/framework (Option C from Phase 16 discussion)** — already deferred from Phase 16; remains deferred. Phase 17 verifies the existing 2-migration shape, not a 3rd-migration abstraction.
- **Clean-baseline fixture for ROADMAP success criterion #3** — implicitly covered by the existing 18 integration suites (all use clean fixtures). Not added as a dedicated Phase 17 artifact.

</deferred>

---

*Phase: 17-cross-cutting-verification*
*Context gathered: 2026-04-29*
