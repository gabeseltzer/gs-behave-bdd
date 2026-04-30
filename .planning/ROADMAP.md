# Roadmap: Auto-Discover Behave Projects

## Milestones

- ✅ **1.0.0 Auto-Discover Behave Projects** — Phases 1-3 (shipped 2026-04-16)
- ✅ **1.1.0 Config File Watching** — Phases 4-6 (shipped 2026-04-17)
- ✅ **1.2.0 Multi-Path & Monorepo-Aware Discovery** — Phases 7-11 (shipped 2026-04-22)
- ✅ **1.3.0 Project Switching** — Phases 12-14 (shipped 2026-04-23)
- 🔄 **1.4.0 Deprecate featuresPath & Notification Suppression** — Phases 15-17

## Phases

<details>
<summary>✅ 1.0.0 Auto-Discover Behave Projects (Phases 1-3) — SHIPPED 2026-04-16</summary>

- [x] Phase 1: Config Parsing (2/2 plans) — completed 2026-04-15
- [x] Phase 2: Integration (2/2 plans) — completed 2026-04-15
- [x] Phase 3: UX & Verification (2/2 plans) — completed 2026-04-16

Archive: [milestones/1.0.0-ROADMAP.md](milestones/1.0.0-ROADMAP.md)

</details>

<details>
<summary>✅ 1.1.0 Config File Watching (Phases 4-6) — SHIPPED 2026-04-17</summary>

- [x] Phase 4: Watcher & Run Guard (2/2 plans) — completed 2026-04-16
- [x] Phase 5: Integration Verification (5/5 plans) — completed 2026-04-17
- [x] Phase 6: 1.1.0 Tech Debt & Admin Cleanup (2/2 plans) — completed 2026-04-17

Archive: [milestones/1.1.0-ROADMAP.md](milestones/1.1.0-ROADMAP.md)

</details>

<details>
<summary>✅ 1.2.0 Multi-Path & Monorepo-Aware Discovery (Phases 7-11) — SHIPPED 2026-04-22</summary>

- [x] Phase 7: Internal Multi-Path Types (3/3 plans) — completed 2026-04-20
- [x] Phase 8: Parser / Test-Tree / Watcher Multi-Root Iteration (3/3 plans) — completed 2026-04-21
- [x] Phase 9: Subdirectory Config Scan (3/3 plans) — completed 2026-04-21
- [x] Phase 10: `featuresPaths` User-Facing Settings Key (1/1 plans) — completed 2026-04-21
- [x] Phase 11: UX Polish + Regression Hardening (3/3 plans) — completed 2026-04-21

Archive: [milestones/1.2.0-ROADMAP.md](milestones/1.2.0-ROADMAP.md)

</details>

<details>
<summary>✅ 1.3.0 Project Switching (Phases 12-14) — SHIPPED 2026-04-23</summary>

- [x] Phase 12: Project List Discovery & Persistence (2/2 plans) — completed 2026-04-23
- [x] Phase 13: Switching UX (Quick-Pick & Status Bar) (2/2 plans) — completed 2026-04-23
- [x] Phase 14: Rebuild, Integration Testing & Documentation (3/3 plans) — completed 2026-04-23

Archive: [milestones/v1.3.0-ROADMAP.md](milestones/v1.3.0-ROADMAP.md)

</details>

### Phase 15: Notification Suppression Infrastructure ✓ (2026-04-27)

**Goal:** Build reusable notification suppression module and migrate existing multi-config notification to use it

**Requirements:** [NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04, NOTIF-05, NOTIF-06, NOTIF-07, NOTIF-08]
**Plans:** 6/6 complete
**Depends on:** None
**Status:** Verified — 8/8 NOTIF requirements met (683 unit tests passing). 2 items deferred to Phase 17 manual smoke per 15-VALIDATION.md.

Plans:

**Wave 1**
- [x] 15-01-PLAN.md — Schema + WorkspaceSettings field + A1 probe + BASE_CFG fixture cascade (NOTIF-01, NOTIF-08 partial)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 15-02-PLAN.md — notifications.ts core (isSuppressed, suppressNotification, showSuppressibleNotification) + tests (NOTIF-02, NOTIF-03, NOTIF-04 button-passthrough)
- [x] 15-04-PLAN.md — TestWorkspaceConfig mock surgery (NOTIF-08)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 15-03-PLAN.md — migrateLegacySuppressMultiConfig + 8 sub-case tests (NOTIF-06)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 15-05-PLAN.md — Wire extension.ts + remove legacy schema/field/mock (NOTIF-04 wired, NOTIF-05, NOTIF-06 wired)

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 15-06-PLAN.md — Phase verification gate + SUMMARY (NOTIF-07)

**Cross-cutting constraints:**
- Migration runs eagerly in `activate()` before any notification fires (D-05); cache refreshed via `config.reloadSettings(wkspUri)` after migration (Pitfall 4)
- Migration writes at the `ConfigurationTarget` scope detected via `inspect()` (D-08)
- Wrapper never returns "Don't Show Again" to caller; intercepted internally (D-04)

**Success criteria:**
1. `suppressedNotifications` array setting exists in package.json with default `[]`
2. Reusable suppression module checks array and appends key on "Don't Show Again"
3. "Don't Show Again" writes to WorkspaceFolder scope by default
4. Multi-config notification uses new infrastructure with key `multiConfigNotification`
5. `suppressMultiConfigNotification` boolean setting removed from package.json
6. Existing `suppressMultiConfigNotification: true` auto-migrated to array on activation
7. `testWorkspaceConfig` mock updated for new setting shape
8. Unit tests cover check/suppress/migrate paths

### Phase 16: Deprecate featuresPath

**Goal:** Remove `featuresPath` from schema, auto-migrate to `featuresPaths[]` with user notification

**Requirements:** [DEP-01, DEP-02, DEP-03, DEP-04, DEP-05, DEP-06, DEP-07]
**Plans:** 6/6 plans complete
**Depends on:** Phase 15 (migration notification should use suppression infrastructure)

Plans:

**Wave 1**
- [x] 16-01-PLAN.md — Pre-flight verifications (publisher, A1 probe, baseline pass count) + export makePerKeyScopedConfig (DEP-07 prep)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 16-02-PLAN.md — Extract D-MOD primitive `migrateScopedSetting<TSrc, TDest>` + refactor Phase 15 helper to call it + 7 direct primitive tests (DEP-07; D-MOD regression bar: 8 Phase 15 sub-cases pass)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 16-03-PLAN.md — Implement `migrateLegacyFeaturesPath` wrapper (D-01..D-09) + 12 unit tests covering cases (a)-(j) (DEP-02, DEP-03, DEP-07)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 16-04-PLAN.md — Wire activation loop + post-loop notification (D-18, D-12, D-13) + 4 structural tests (DEP-02, DEP-04)
- [x] 16-05-PLAN.md — Source-tree singular cleanup: package.json schema removal + settings.ts ladder collapse + common.ts discovery simplification + testWorkspaceConfig.ts mock surgery (DEP-01, DEP-05, DEP-06; D-15..D-17)

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 16-06-PLAN.md — Test fixture cascade (6 test files) + final phase-level goal-backward verification (DEP-05, DEP-06, DEP-07)

**Cross-cutting constraints:**
- Migration runs eagerly in `activate()` BEFORE the multi-config notification migration (D-18: data shape first, UX cleanup second), and BEFORE the post-loop featuresPath notification fires
- `config.reloadSettings(wkspUri)` is sync void — NEVER await it (Pitfall 8)
- D-07 normalize regex byte-identical between `src/notifications.ts` and `src/settings.ts:204` (Pitfall 9)
- "Open Settings" button uses `@ext:gabeseltzer.gs-behave-bdd` (publisher confirmed in 16-01-SUMMARY)
- Helper never throws (D-05) — primitive's catch block logs via `config.logger.logInfo`
- D-MOD regression bar: all 8 existing `migrateLegacySuppressMultiConfig` sub-cases still pass after the primitive extraction refactor

**Success criteria:**
1. `featuresPath` setting absent from package.json schema
2. On activation, existing `featuresPath` value migrated to `featuresPaths[]` at correct scope level
3. User sees migration notification after successful migration
4. Internal code reads only `featuresPaths[]` — no `featuresPath` references in runtime code
5. `testWorkspaceConfig` mock updated to remove `featuresPath` support
6. Unit tests cover migration edge cases (value present, absent, already has featuresPaths, multiple scopes)

### Phase 17: Cross-Cutting Verification

**Goal:** End-to-end regression pass across both migrations

**Requirements:** Verification of DEP-* and NOTIF-*
**Plans:** 3 plans
- [ ] 17-01-PLAN.md — Create the migration-stale fixture (seeded settings.json + restore template + minimal behave config)
- [ ] 17-02-PLAN.md — Create the migrations integration suite (suite-load-time stub + 7 tests covering migration outcomes, A1 probe, DSA + Open Settings flows)
- [ ] 17-03-PLAN.md — Register suite in runTestSuites.ts, run full regression pass, close Phase 15 HUMAN-UAT debt
**Depends on:** Phase 15, Phase 16

**Success criteria:**
1. All existing unit tests pass (655+)
2. All 18 integration suites pass
3. Fresh activation with no deprecated settings works correctly
4. Activation with old `featuresPath` + `suppressMultiConfigNotification` migrates both cleanly
5. Migration notification shown and suppressible
