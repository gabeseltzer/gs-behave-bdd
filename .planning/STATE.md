---
gsd_state_version: 1.0
milestone: v1.4.0
milestone_name: milestone
status: executing
last_updated: "2026-04-27T17:39:47.000Z"
last_activity: 2026-04-27 -- Phase 15 Plan 05 complete (NOTIF-04 wired + NOTIF-05 schema removal + NOTIF-06 migration loop in activate() + structural ordering tests)
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 6
  completed_plans: 5
  percent: 83
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-23 — milestone v1.4.0 started)

**Core value:** Zero-configuration project discovery: tests appear in the Test Explorer without the user touching settings.json — and stay correct as the config evolves.
**Current focus:** Phase 15 — Notification Suppression Infrastructure (executing)

## Current Position

Phase: 15 — Notification Suppression Infrastructure (in progress)
Plan: 15-06 (Wave 5 — final cleanup; next, if scoped — Phase 15 functional work is complete after Plan 05)
Status: Executing (Plans 01-05 complete; Phase 15 is functionally complete — wrapper wired, migration runs in activate(), legacy key removed from schema/field/mock/fixture; only the migration helper itself still references the legacy key string by design)
Last activity: 2026-04-27 -- Phase 15 Plan 05 complete: extension.ts L141-L181 inline notification block replaced with showSuppressibleNotification('multiConfigNotification', ...) wrapper call (NOTIF-04 wired). Per-workspace migration loop added in activate() before updateDiscoveryUX — awaits migrateLegacySuppressMultiConfig + config.reloadSettings, wrapped in defense-in-depth try/catch (D-05, Pitfall 3, Pitfall 4). Legacy gs-behave-bdd.suppressMultiConfigNotification schema entry deleted from package.json (NOTIF-05). WorkspaceSettings legacy field, TestWorkspaceConfig legacy mock entries, and the four cascading settings test fixture entries all removed. Three new structural tests guard the activation-ordering invariant (Pitfall 3) + the wrapper call shape + the legacy-key-literal absence in extension.ts. Full unit suite GREEN: 683 tests passing (680 baseline + 3 new structural). Lint clean, typecheck clean (only pre-existing smol-toml baseline noise), webpack compile succeeds.

## Performance Metrics

**Velocity (cumulative):**

- Milestones shipped: 4 (1.0.0 2026-04-16, 1.1.0 2026-04-17, 1.2.0 2026-04-22, 1.3.0 2026-04-23)
- Total phases completed: 14 (1.0.0: 1-3, 1.1.0: 4-6, 1.2.0: 7-11, 1.3.0: 12-14)
- Total plans completed: 35 (1.0.0: 6, 1.1.0: 9, 1.2.0: 13, 1.3.0: 7)

## Accumulated Context

### Decisions

Full decision log in PROJECT.md Key Decisions table and per-milestone archives:

- 1.0.0: `.planning/milestones/1.0.0-ROADMAP.md`
- 1.1.0: `.planning/milestones/1.1.0-ROADMAP.md`
- 1.2.0: `.planning/milestones/1.2.0-ROADMAP.md`
- 1.3.0: `.planning/milestones/v1.3.0-ROADMAP.md`

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
