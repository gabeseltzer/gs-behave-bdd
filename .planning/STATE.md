---
gsd_state_version: 1.0
milestone: v1.4.0
milestone_name: Deprecate featuresPath & Notification Suppression
status: shipped
last_updated: "2026-05-04T00:00:00Z"
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 17
  completed_plans: 17
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-04 — v1.4.0 shipped)

**Core value:** Zero-configuration project discovery: tests appear in the Test Explorer without the user touching settings.json — and stay correct as the config evolves.
**Current focus:** Planning next milestone — run `/gsd-new-milestone` to define scope.

## Current Position

Milestone v1.4.0 shipped 2026-05-04. No active phase.

## Performance Metrics

**Velocity (cumulative):**

- Milestones shipped: 5 (1.0.0 2026-04-16, 1.1.0 2026-04-17, 1.2.0 2026-04-22, 1.3.0 2026-04-23, v1.4.0 2026-05-04)
- Total phases completed: 18 (1.0.0: 1-3, 1.1.0: 4-6, 1.2.0: 7-11, 1.3.0: 12-14, v1.4.0: 15-18)
- Total plans completed: 52 (1.0.0: 6, 1.1.0: 9, 1.2.0: 13, 1.3.0: 7, v1.4.0: 17)

## Accumulated Context

### Roadmap Evolution

- Phase 18 added: Address v1.4.0 tech debt: artifact rollups, mock cleanup

### Decisions

Full decision log in PROJECT.md Key Decisions table and per-milestone archives:

- 1.0.0: `.planning/milestones/1.0.0-ROADMAP.md`
- 1.1.0: `.planning/milestones/1.1.0-ROADMAP.md`
- 1.2.0: `.planning/milestones/1.2.0-ROADMAP.md`
- 1.3.0: `.planning/milestones/v1.3.0-ROADMAP.md`
- [Phase 16]: Plan 02: Extracted migrateScopedSetting<TSrc, TDest> primitive with TransformResult<T> discriminated union; refactored migrateLegacySuppressMultiConfig to delegate (Promise<void> preserved); regression bar GREEN (8/8 Phase 15 sub-cases pass); 7 new direct primitive tests; 683 -> 690 unit pass count
- [Phase 16]: Plan 03: Shipped migrateLegacyFeaturesPath(wkspUri): Promise<boolean> wrapper around the D-MOD primitive — loops [gs-behave-bdd, behave-vsc] (D-02), transform handles merge-with-dedup (D-06/D-07 byte-identical regex), empty/whitespace skip-with-removal (D-08), literal '.' migration (D-09); 12 new unit tests covering cases (a)-(j); regression bars GREEN; 690 -> 702 unit pass count
- [Phase 16]: D-18 ordering: featuresPath migration runs before suppressMultiConfig at activation
- [Phase 16]: Pitfall 8: config.reloadSettings called WITHOUT await (sync void)
- [Phase 16]: Plan 05: Schema entry gs-behave-bdd.featuresPath removed (DEP-01); settings.ts ladder collapsed to 3 rungs (D-15); common.ts hasFeaturesFolder Branch A is plural-only (D-16). Executed Task 2 before Task 1 to keep every commit's compile graph green. 4 obsolete tests in multiPathPrecedence.test.ts deferred to Plan 06 alongside testWorkspaceConfig.ts mock surgery and fixture cascade.
- [Phase 16]: Plan 06: atomic mock surgery + 8-file fixture cascade. Singular featuresPath surface removed from TestWorkspaceConfig (D-17/DEP-06); 11 obsolete tests deleted, helper edge-case tests retargeted from featuresPath to projectPath to preserve coverage. 4 deferred Plan-05 failures resolved. Full unit suite 696 passing 0 failing. 34 migration tests preserved (D-MOD regression bar GREEN). Phase 16 functionally complete.

### v1.4.0 Decisions

- Migration notification: show user-visible notification after `featuresPath` → `featuresPaths[]` migration
- Suppression infrastructure: single `suppressedNotifications` string array setting (not per-key booleans)
- Suppression writes to WorkspaceFolder scope by default
- Setting is visible in settings UI (not hidden in workspaceState)

### Phase 15 Decisions (Plan 01)

- BLOCKER B-2 fold honored: strict-undefined throw on `WorkspaceSettings.suppressedNotifications` and the four cascading settings test fixture updates landed atomically in Plan 01 — no transient red full-unit-suite window during Wave 2.
- Legacy `gs-behave-bdd.suppressMultiConfigNotification` schema entry and `WorkspaceSettings.suppressMultiConfigNotification` field intentionally preserved for Plan 03 migration. Schema removal lives in Plan 05, gated on Wave 0 A1 probe outcome.
- Wave 0 A1 probe asserts the *expected* `cfg.inspect()` per-scope return contract via stub; real-VSCode confirmation deferred to Plan 05 smoke check (per 15-VALIDATION.md Manual-Only Verifications).
- `makeScopedConfig` test helper exported from `test/unit/notifications.test.ts` so plans 02/03 can import it without duplication.

### Phase 15 Decisions (Plan 02)

- `src/notifications.ts` exports plain async functions (D-01) with one module-level `DONT_SHOW_AGAIN` constant referenced at append + intercept sites (T-15-04 mitigation; literal appears once outside JSDoc).
- `suppressNotification` reads `inspect().workspaceFolderValue` for dedup (Pitfall 2 — never `cfg.get()` which merges scopes); writes at `vscode.ConfigurationTarget.WorkspaceFolder` (NOTIF-03); on `update()` rejection logs via `config.logger.logInfo` and returns normally (no throw).
- Used a separate-variable guard pattern (`const wfv = insp ? insp.workspaceFolderValue : undefined`) instead of `insp!.workspaceFolderValue!` — same semantics, zero non-null assertions, ESLint clean.
- Rule 3 deviation: added `enum ConfigurationTarget { Global=1, Workspace=2, WorkspaceFolder=3 }` to `test/unit/vscode.mock.ts`. Without it, `vscode.ConfigurationTarget.WorkspaceFolder` evaluates to `undefined.WorkspaceFolder` and throws TypeError before the spy is called. Mock-only change; values match VS Code's published API.
- `showSuppressibleNotification` returns `undefined` (not the literal `'Don't Show Again'`) when DSA is clicked, suppressed, or dismissed (D-04). The DSA branch internally calls `suppressNotification` so callers can stay fire-and-forget.
- Wrapper is implemented but NOT wired into `extension.ts` — Plan 05 owns the wiring. End of Plan 02 the new module is unused at runtime.

### Phase 15 Decisions (Plan 03)

- `migrateLegacySuppressMultiConfig(wkspUri)` exported from `src/notifications.ts` per RESEARCH.md Open Question 3 — direct unit-test access avoids brittleness of going through `activate()`. Plan 05 will import it.
- Scope detection ladder: workspaceFolderValue → workspaceValue → globalValue (most-specific wins). Mirrors `getWithLegacyFallback` direction in `src/settings.ts` L20-L25.
- Same-scope dedup: read existing `suppressedNotifications` via `cfg.inspect<string[]>(...).<sameScope>Value` — NEVER `cfg.get()` which merges scopes (Pitfall 2). A merged-scope read would falsely skip lower-scope migrations when a higher-scope array already contains the key.
- Two writes per scope hit at the SAME `ConfigurationTarget` (D-06): `update("suppressedNotifications", merged, target)` then `update("suppressMultiConfigNotification", undefined, target)`. Both wrapped in single try/catch; on rejection, `config.logger.logInfo` is called and the function returns (D-07, T-15-11 mitigation).
- Idempotency by construction: post-first-run state has legacy key undefined at all scopes → no target → returns no-op. The new array's dedup means re-migration also doesn't double-append.
- New test helper `makePerKeyScopedConfig` introduced because migration calls `inspect()` twice on different keys (legacy boolean + new array). The Plan 01 `makeScopedConfig` returns the same shape for any key, conflating the two reads. Both helpers coexist; `makeScopedConfig` is still used by isSuppressed/suppressNotification/showSuppressibleNotification tests.
- Plan 03 does NOT modify `extension.ts`, `package.json`, `WorkspaceSettings`, or `TestWorkspaceConfig` legacy entries — Plan 05 owns all wiring and cleanup.

### Phase 15 Decisions (Plan 04)

- `TestWorkspaceConfig` mock surgery: private `suppressedNotifications: string[] | undefined` field, optional constructor param, `get()` case with `?? []` fallback (matches package.json `default: []`), `inspect()` case without fallback. All five touch points mirror the `featuresPaths` array precedent at L17 / L40 / L57 / L90-L91 / L148-L150.
- No `getExpected()` case added for the array key — `featuresPaths` precedent (PATTERNS.md L357 explicit).
- Both legacy `suppressMultiConfigNotification` and new `suppressedNotifications` mock entries coexist; legacy removal is Plan 05/06's responsibility, gated on Wave 0 A1 probe outcome.
- No new ad-hoc tests added in this plan: the four cascading fixture files Plan 01 updated already exercise the new mock surface implicitly. The optional `TestWorkspaceConfig suppressedNotifications default (NOTIF-08)` test block in PATTERNS.md L478-L508 was not required by acceptance criteria and was skipped to keep this plan minimal-surface.
- Single-task plan structure preserved per BLOCKER B-2 fold: the four BASE_CFG / makeFakeWkspSettings cascade updates that were originally Plan 04 tasks 2-5 already landed in Plan 01.

### Phase 15 Decisions (Plan 05)

- A1 probe (Wave 0) was confirmed GREEN before Plan 05 schema removal. Both `inspect()`-of-unregistered-key probes pass against the project's vscode mock environment, satisfying the contract Plan 03's migration helper relies on. Real-VSCode confirmation deferred to Phase 17 manual smoke check per 15-VALIDATION.md Manual-Only Verifications.
- Wrapper call in `extension.ts` is FIRE-AND-FORGET (`.then(action => ...)`), NOT awaited — preserves the pre-existing inline block's UX. Awaiting would block `updateDiscoveryUX` on user input. The MIGRATION await in `activate()` is the opposite direction: it MUST be awaited because D-05 mandates "before any notifications fire."
- Per-workspace migration loop placed in `activate()` between the project-list-population loop and the `updateDiscoveryUX(...)` call. After each `await migrateLegacySuppressMultiConfig(wkspUri)`, calls `config.reloadSettings(wkspUri)` to refresh the cached `WorkspaceSettings.suppressedNotifications` (Pitfall 4). Loop is wrapped in a defense-in-depth try/catch — D-07 says the helper never throws, but `reloadSettings` is not contracted to never throw, so the catch routes any failure to `config.logger.logInfo` and continues.
- Comment text in `extension.ts` rephrased to drop the literal string `suppressMultiConfigNotification` so the new structural test (`!src.includes('suppressMultiConfigNotification')`) passes. The migration helper itself in `src/notifications.ts` is the only remaining source-tree reference to the legacy key — that's by design (it's the literal key the migration inspects/removes from settings.json).
- Activation-ordering structural test uses `indexOf('updateDiscoveryUX(getUrisOfWkspFoldersWithFeatures()')` — the call site signature, not the bare function name. There's also a `function updateDiscoveryUX` declaration earlier in the file that would have produced a false-positive ordering match. Discovered as a Rule 1 fix during the first run of the new structural test; landed in Task 5 commit before any further work.
- Phase 15 functional work is complete after Plan 05. STATE.md and ROADMAP.md show total_plans=6 — if Plan 06 has scoped cleanup work, it can land separately; otherwise Phase 15 closes here.

### Phase 15 Decisions (Plan 06)

- Verification-only gate. No code edits in `src/` or `test/`. Battery: lint + typecheck (test) + full unit suite + webpack + targeted mocha sub-suites + inline schema-shape `node -e` checks + source/test legacy-reference greps.
- All 8 NOTIF-* requirements verified GREEN. 683 unit tests passing (655 pre-Phase-15 baseline + 28 new); 28 Phase-15-specific tests covering A1 probe, isSuppressed, suppressNotification, showSuppressibleNotification, migrateLegacySuppressMultiConfig (8 sub-cases), 3 activation-ordering structural tests, and 2 schema tests.
- One minor finding raised, NOT silently fixed (per verification-only mandate): `test/unit/vscode.mock.ts` retains a defensive `if (key === 'suppressMultiConfigNotification') return false` get() fallback at lines 171-173 — pre-existing leftover from before Plan 05's schema removal, no behavioral impact (migration uses `inspect()` not `get()`; no production code calls `cfg.get<boolean>("suppressMultiConfigNotification")` anymore). Disposition deferred to a follow-up small-fix plan or absorbed into Phase 16/17 work that touches `vscode.mock.ts`.
- Integration test (`npm run test:integration`) deferred — requires VSCode Insiders/Stable launch via `@vscode/test-electron`, not feasible in headless verification environment. Matches the Phase 17 manual smoke check already documented in `15-VALIDATION.md` Manual-Only Verifications.
- `--grep` does not propagate through `npm run test:unit` on this Windows shell because the runner script (`out/test/test/unit/run.js`) does not parse `argv`. Used `npx mocha --require ./out/test/test/unit/setup.js --ui tdd 'out/test/test/unit/**/*.test.js' --grep <pattern>` directly — same approach Plan 03 fell back to.
- Phase-level `15-SUMMARY.md` aggregates all 5 implementation plan summaries plus this verification gate. ROADMAP.md left untouched (orchestrator-owned per `<critical_constraints>`).

## v1.4.0 Carry-Forward Tech Debt

> Closed by Phase 18 Plan 02 audit-rollup; pattern remains for future redesign. Preserved here so the v1.4.0 milestone-audit recommendations survive `/gsd-complete-milestone v1.4.0`.

**`activeProjectCache` invalidation pattern (`src/common.ts` `hasFeaturesFolder()`):**

The Phase 12 active-project block re-reads `discoveryDepth` at lookup time rather than invalidating `activeProjectCache` when discovery-influencing settings change. Working but ad-hoc — see commit `c08ced5` (re-applied from `27f14e0` after a diagnostic revert/re-revert during the Phase 17 regression bisect) and the WHY comment near `src/common.ts:347`. Recommended follow-up: pair `clearScanResultCache()` with project-list invalidation when discovery-influencing settings change. Tracked here so the v1.4.0 milestone-audit recommendation isn’t lost.

**Multiroot integration mutex flake:** environmental — documented in `AI_INSTRUCTIONS.md` § "Integration Test Structure" (Local-dev gotcha). Surfaces as `Another instance of app 'Code' is already active` / `AssertionError: assert(instances)` when the developer’s own VS Code is running during `npm run test:integration`. No code action needed.

**`test/unit/vscode.mock.ts` legacy fallback (Phase 15 Finding 1):** dead `if (key === 'suppressMultiConfigNotification') return false` branch at L171-173. Unreachable (migration uses `inspect()`); cosmetic one-line cleanup deferred — slated for Phase 18 Plan 01.

## Quick Tasks Completed

| Date | Slug | Commits | Notes |
|------|------|---------|-------|
| 2026-05-05 | update-integration-migration-tests | `35e0a48` | Aligned `test/integration/migrations suite/extension.test.ts` with v1.4.0 review B-01 (notification copy) and B-02 (publisher-independent settings query). Closes the integration-test gap flagged in the v1.4.0 review batch. |
