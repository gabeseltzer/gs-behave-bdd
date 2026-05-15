# Phase 22: Cleanup, Integration & Docs — Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Finish-line work for milestone v1.5.0. Three deliverables:

1. **CLEANUP-01** — strip silent `behave-vsc.*` fallback reads. After v1.5.0 the extension reads only canonical `gs-behave-bdd.*` keys at runtime.
2. **TEST-07** — verify the consent flow end-to-end in real VS Code via a new `example-projects/migration-consent/` fixture and an integration suite.
3. **DOC-01 / DOC-02** — document the behavior change in README and tighten the `migrationMode` / `completedMigrations` setting descriptions in `package.json`.

Out of scope: any change to the registry, evaluator, consent module, or `migrateScopedSetting` primitive (all locked from Phases 19-21). No new settings, commands, or migration entries.
</domain>

<canonical_refs>
## Canonical References

Downstream agents MUST read these before planning or executing.

- `.planning/ROADMAP.md` — Phase 22 goal + success criteria (v1.5.0 section).
- `.planning/REQUIREMENTS.md` — CLEANUP-01 (line 52), TEST-07 (line 63), DOC-01 (line 67), DOC-02 (line 68).
- `.planning/phases/019-migration-foundation/019-CONTEXT.md` — registry / evaluator design.
- `.planning/phases/020-migration-registry/020-VERIFICATION.md` — final registry coverage (17 entries via `migrateScopedSetting`).
- `.planning/phases/021-consent-ux-case-2-case-3-prompts/021-CONTEXT.md` — consent flow + action handlers (D-A1..D-A9).
- `src/settings.ts` — current `getWithLegacyFallback<T>()` ladder and `WindowSettings` / `WorkspaceSettings` constructors with `legacyConfig?` params (the dead code we remove).
- `src/configuration.ts:68-92` — first read site (`legacyWinConfig`, `legacyWkspConfig`).
- `src/common.ts:214` — second read site.
- `src/discovery/projectList.ts:179` — third read site.
- `test/integration/migrations suite/` and `test/integration/runTestSuites.ts` — existing integration-test scaffolding to extend.
- `example-projects/migration-stale/` — closest existing fixture (seeds `behave-vsc.featuresPath`); useful structural reference.
- `README.md` — "New in this fork" list (target for DOC-01 bullet #14).
- `package.json` — `gs-behave-bdd.migrationMode` + `gs-behave-bdd.completedMigrations` schema entries (DOC-02 target).
</canonical_refs>

<decisions>
## Implementation Decisions

### D-C1: CLEANUP-01 reaches into `settings.ts` ladder (full cleanup)
Remove ALL silent `behave-vsc.*` reads from the runtime path, not just the three sites named in CLEANUP-01.

Concretely:
- Delete the three `getConfiguration("behave-vsc", ...)` calls in `src/configuration.ts:68-92` and the two in `src/common.ts:214` / `src/discovery/projectList.ts:179`.
- Delete `getWithLegacyFallback<T>()` from `src/settings.ts:14-30`.
- Drop the optional `legacyConfig?: vscode.WorkspaceConfiguration` parameter from the `WindowSettings` (`src/settings.ts:40`) and `WorkspaceSettings` (`src/settings.ts:106`) constructors.
- Simplify the inner `get<T>(key)` lambdas inside both constructors to `<T>(key: string) => wkspConfig.get<T>(key)` (no ternary).
- Any call site that currently passes `legacyConfig` into those constructors must drop the trailing arg.

**Rationale:** Matches the Phase 19 CLEANUP-02 precedent (full removal of the v1.4.0 read-time re-read pattern). Leaving the helper + params as dead code creates a follow-up debt that's almost as much work as the original removal. Repo ends in a clean state.

**Risk surface:** Any test fixture (`testWorkspaceConfig.ts` and friends) that constructs `WorkspaceSettings` with a 5-arg signature will need its calls trimmed. Verify by recompiling: `npx tsc --noEmit` should surface every call site.

### D-C2: TEST-07 covers three smoke scenarios (per-case)
The new `example-projects/migration-consent/` fixture and integration suite cover **three scenarios in real VS Code**, one per migration case:

1. **Case 1 silent finish** — seed `behave-vsc.runParallel: true` with `gs-behave-bdd.runParallel: true` already canonical (case 1: legacy-only). Assert: no prompt fires, `completedMigrations` includes the entry, legacy key handled per the action's contract.
2. **Case 2 with `Migrate & delete`** — seed `behave-vsc.featuresPath: "features-alt"`, leave `gs-behave-bdd.featuresPaths` unset. Assert: prompt fires, picking `Migrate & delete` writes canonical (with transform), removes legacy, marks Finished.
3. **Case 3 with `Overwrite & delete`** — seed both `behave-vsc.featuresPath: "features-alt"` AND `gs-behave-bdd.featuresPaths: ["features-existing"]`. Assert: 4-button prompt fires, picking `Overwrite & delete` writes the legacy value to canonical, removes legacy, marks Finished.

**Rationale:** Unit tests in `test/unit/migrations/consent.test.ts` (Phase 21, 23 scenarios) already cover the action × mode matrix. The integration suite's job is to prove the VS Code seam — prompt registration, button activation, notification → action dispatch — works in real VS Code. Three smoke scenarios prove all three case-dispatch paths without massive CI cost (~3-5 min add per `runTestSuites.ts` pass).

**Implementation note:** Use the `migrations suite` directory style (existing pattern); the suite name should be `migration-consent suite`. Fixture lives at `example-projects/migration-consent/` with seeded `.vscode/settings.json` per scenario — likely one fixture with multiple `settings.template.json` files swapped per test, matching `migration-stale` conventions.

### D-C3: CLEANUP-01 lands before TEST-07; test asserts post-cleanup state
Plan ordering:

1. **Wave 1 — CLEANUP-01 (Plan 22-01):** Remove all silent `behave-vsc.*` reads per D-C1. Atomic. Existing 849 unit tests must pass post-removal (any fixture rewiring lands in this plan, not deferred).
2. **Wave 2 — TEST-07 (Plan 22-02):** Build the fixture + 3-scenario integration suite. Assertions describe the final v1.5.0 state — legacy keys not honored at runtime, canonical-only reads.
3. **Wave 2 — DOC-01 / DOC-02 (Plan 22-03):** README + package.json descriptions (per D-C4). Independent of TEST-07 file-wise; can run parallel.

**Rationale:** The consent flow itself runs off the Phase 20 registry's explicit per-entry detection, **not** off the silent-fallback ladder. So TEST-07 has no dependency on CLEANUP-01's pre-state — it can assert the post-cleanup runtime directly from day one. Doing cleanup first means the test never has to be rewritten when the ladder goes away, and any cleanup-induced regression surfaces under the existing 849-test baseline before the integration layer touches it.

**Wave 2 parallelization:** Plans 22-02 (test fixture + suite under `test/integration/` and `example-projects/`) and 22-03 (`README.md`, `package.json`) touch disjoint files — safe to run in parallel.

### D-C4: README docs go in the "New in this fork" list (bullet #14); package.json descriptions are self-contained
**README structure (DOC-01):**
- Add a new numbered bullet (currently #14) at the end of "New in this fork" titled e.g. *"Migration from `behave-vsc`"* with 1-2 sentences of summary.
- Underneath that bullet, add a focused sub-section explaining:
  - The v1.5.0 callout: silent `behave-vsc.*` fallback reads are removed; users who pick `skip` keep their legacy values in settings.json but the extension stops reading them.
  - The `migrationMode` setting (`prompt` / `migrate-and-delete` / `migrate-and-keep` / `skip`) and what each value does.
  - The `completedMigrations` setting — what it is, why it's an array of strings, when to clear it.
  - The *Behave BDD: Recheck Migrations* command — when to use it (after picking `skip` and changing your mind).
- Tone matches the existing fork-additions list — terse, practical, code-block examples where useful.

**Package.json descriptions (DOC-02):**
- Self-contained: each description is 1-2 sentences that explain the setting without requiring the user to leave the Settings UI.
- Match the README copy in *meaning* but not verbatim — Settings UI users get the gist; README readers get the migration narrative.
- No links into README (Settings UI renders them awkwardly).

**Rationale:** Lower README churn than a new top-level section and avoids introducing a separate `MIGRATION.md` file the user has to discover. The "New in this fork" list is already the canonical place for v1.5.0-style fork-specific behavior callouts. Risk: lower discoverability than a top-level callout — accepted in exchange for repo simplicity.
</decisions>

<code_context>
## Reusable Assets & Integration Points

- **Existing integration suite pattern** — `test/integration/migrations suite/` already exists with `extension.test.ts` + `index.ts`. New suite mirrors that shape; add to `test/integration/runTestSuites.ts` registration.
- **Fixture conventions** — `example-projects/migration-stale/.vscode/settings.template.json` is the closest analog (seeds `behave-vsc.featuresPath`). The "swap a template into settings.json per scenario" pattern is established and should be reused.
- **Registry detection** — `src/migrations/registry.ts` (or wherever Phase 20 landed the registry) — the integration test does NOT need to mock the registry; it runs the real evaluator + consent flow against seeded settings and asserts the side effects.
- **No `notifications.ts` change** — the D-A8.3 deviation (extending `TransformResult` write variant with `removeSource?`) is already in place from Phase 21 commit `9f82f9e`. Phase 22 does not touch `notifications.ts`.
</code_context>

<scope_boundary>
## Scope Boundary

In scope:
- Removal of silent `behave-vsc.*` reads and the entire `getWithLegacyFallback` ladder.
- One new integration suite + one new fixture under `example-projects/`.
- README bullet + sub-section additions.
- `package.json` description prose for `migrationMode` + `completedMigrations`.

Out of scope (defer to a future phase / milestone):
- Any change to the registry, evaluator, or consent module.
- Removing the v1.4.0 wrapper shims (`migrateLegacyFeaturesPath`, `migrateLegacySuppressMultiConfig` in `src/notifications.ts:257,275`) — they're preserved intentionally as thin shims; Phase 20 verification flagged them as future cleanup but the user has not scoped that into v1.5.0.
- Any change to `example-projects/migration-stale/` (a different fixture for a different test).
- Changing the migration consent UX, button labels, action semantics, or grouping behavior.
</scope_boundary>

<deferred>
## Noted for Later
- v1.4.0 wrapper-shim removal in `src/notifications.ts:257,275` — eligible for a v1.5.1 or v1.6.0 cleanup ticket.
- Any post-v1.5.0 telemetry on how many users picked `skip` vs `migrate-*` — would inform whether to ship a deprecation banner in v1.6.0.
</deferred>

<next_steps>
## Next Steps

1. Run `/gsd-plan-phase 22` to produce three plans (22-01 cleanup, 22-02 integration test, 22-03 docs) per D-C3.
2. Plans 22-02 and 22-03 are parallelizable (Wave 2); 22-01 is Wave 1.
3. After execution, the milestone v1.5.0 is ready for archive via `/gsd-complete-milestone`.
</next_steps>
