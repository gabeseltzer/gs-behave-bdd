# Roadmap: Auto-Discover Behave Projects

## Milestones

- ✅ **1.0.0 Auto-Discover Behave Projects** — Phases 1-3 (shipped 2026-04-16)
- ✅ **1.1.0 Config File Watching** — Phases 4-6 (shipped 2026-04-17)
- ✅ **1.2.0 Multi-Path & Monorepo-Aware Discovery** — Phases 7-11 (shipped 2026-04-22)
- ✅ **1.3.0 Project Switching** — Phases 12-14 (shipped 2026-04-23)
- ✅ **v1.4.0 Deprecate featuresPath & Notification Suppression** — Phases 15-18 (shipped 2026-05-04)
- 🚧 **v1.5.0 Migration Consent & `behave-vsc` Cleanup** — Phases 19-22 (in progress)

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

<details>
<summary>✅ v1.4.0 Deprecate featuresPath & Notification Suppression (Phases 15-18) — SHIPPED 2026-05-04</summary>

- [x] Phase 15: Notification Suppression Infrastructure (6/6 plans) — completed 2026-04-27
- [x] Phase 16: Deprecate featuresPath (6/6 plans) — completed 2026-04-29
- [x] Phase 17: Cross-Cutting Verification (3/3 plans) — completed 2026-04-30
- [x] Phase 18: Tech debt closure — artifact rollups + mock cleanup (2/2 plans) — completed 2026-05-04

Archive: [milestones/v1.4.0-ROADMAP.md](milestones/v1.4.0-ROADMAP.md)

</details>

### 🚧 v1.5.0 Migration Consent & `behave-vsc` Cleanup (Phases 19-22) — IN PROGRESS

**Milestone goal:** Make settings migration opt-in via per-migration consent prompts, complete the cross-extension migration off `behave-vsc`, and pay down the `activeProjectCache` invalidation debt from v1.4.0.

**Granularity:** coarse · **Requirements:** 29/29 mapped (CONSENT-01..09, MIGRATE-01..09, CLEANUP-01..02, TEST-01..07, DOC-01..02)

#### Summary

- [ ] **Phase 19: Migration Foundation** — Register `migrationMode` / `completedMigrations` settings, build the per-scope evaluator, ship the recheck command, and pay down the `activeProjectCache` invalidation debt.
- [ ] **Phase 20: Migration Registry** — Refactor v1.4.0's two migrations into the new registry and add `behave-vsc` → `gs-behave-bdd` entries for every silent-fallback key.
- [ ] **Phase 21: Consent UX (Case 2 & Case 3 Prompts)** — Wire activation-time scanning to non-blocking notifications, implement the case 2 / case 3 actions, and honour `migrationMode` overrides + dismissal semantics.
- [ ] **Phase 22: Cleanup, Integration & Docs** — Remove the `behave-vsc` silent fallback reads, add the consent-flow integration suite, and document the new UX in README + setting descriptions.

#### Phase Details

##### Phase 19: Migration Foundation
**Goal**: The new migration plumbing — settings, evaluator, recheck command — is in place and exercised by unit tests, and the v1.4.0 `activeProjectCache` debt is closed.
**Depends on**: Nothing (continues from v1.4.0 phase 18)
**Requirements**: CONSENT-05, CONSENT-07, CONSENT-08, CONSENT-09, MIGRATE-04, MIGRATE-07, MIGRATE-08, MIGRATE-09, CLEANUP-02, TEST-03, TEST-05, TEST-06
**Success Criteria** (what must be TRUE):
  1. `gs-behave-bdd.migrationMode` (enum, default `prompt`) and `gs-behave-bdd.completedMigrations` (string[], default `[]`) are visible and editable per-scope in the Settings UI with clear descriptions.
  2. The migration evaluator inspects each unfinished migration × each VS Code scope (Global / Workspace / WorkspaceFolder) and dispatches to case 1 / 2 / 3 logic; mark-Finished writes land at the correct scope and a fresh workspace folder starts with an empty `completedMigrations`.
  3. *Behave BDD: Recheck Migrations* appears in the command palette and, when invoked, clears `completedMigrations` for the writeable scopes and re-runs the scan.
  4. Empty / whitespace legacy values are treated as case 1 (no prompt, no copy), matching v1.4.0's `skip-with-removal` semantics; all migrations route through the existing `migrateScopedSetting` primitive (no parallel implementations).
  5. Changing `discoveryDepth` invalidates `activeProjectCache` via `clearScanResultCache()` + project-list invalidation, replacing the v1.4.0 read-time re-read in `src/common.ts:347`; a unit test pins the new behavior.
**Plans:** 4 plans
Plans:
- [x] 019-01-PLAN.md — Register `gs-behave-bdd.migrationMode` (enum) and `gs-behave-bdd.completedMigrations` (string[]) in package.json with schema-test pins (CONSENT-05/07/08).
- [x] 019-02-PLAN.md — Build the migrations module: types, empty registry (D-05), per-scope evaluator with case 1/2/3 dispatch, and per-scope completedMigrations helpers (MIGRATE-04/07/08/09, TEST-03).
- [x] 019-03-PLAN.md — Ship the *Behave BDD: Recheck Migrations* command with quick-pick scope picker, clear, and rescan via the standard evaluator path (CONSENT-09, TEST-05).
- [x] 019-04-PLAN.md — Add `clearActiveProjectCache()`, broaden the `configurationChangedHandler` rescan branch to all scan-shaping keys, and remove the v1.4.0 read-time discoveryDepth re-read (CLEANUP-02, TEST-06).

##### Phase 20: Migration Registry
**Goal**: A single registry holds every migration entry the extension knows about — both v1.4.0's two existing migrations and the new `behave-vsc` cross-extension entries — and they all flow through the case 1/2/3 evaluator built in Phase 19.
**Depends on**: Phase 19
**Requirements**: MIGRATE-01, MIGRATE-02, MIGRATE-03, TEST-04
**Success Criteria** (what must be TRUE):
  1. `migrateLegacyFeaturesPath` and `migrateLegacySuppressMultiConfig` are registered as registry entries; their old activation-time silent auto-migration call sites are gone, and they only run via the evaluator.
  2. New `behave-vsc` → `gs-behave-bdd` migration entries cover every silent-fallback key currently read in `src/configuration.ts` (`legacyWinConfig` / `legacyWkspConfig`), `src/common.ts:202`, and `src/discovery/projectList.ts:167` — exhaustive list confirmed at plan time (`featuresPath`, env presets, `runParallel`, `xRay`, `projectPath`, etc.).
  3. Re-running migrations on already-Finished entries is a no-op (idempotency guarantee).
  4. Unit tests exercise each registered legacy → canonical key pair and idempotency.
**Plans:** 5 plans
Plans:
- [ ] 020-01-scaffolding-PLAN.md — Document entry-id naming convention; add registry invariants test (no collisions, count gate). Resolves RESEARCH.md Q1/Q2/Q3 in-plan.
- [ ] 020-02-plain-entries-PLAN.md — makePlainEntry factory + 11 plain cross-namespace entries (MIGRATE-03 / TEST-04 dimensions a + b).
- [ ] 020-03-features-path-PLAN.md — Lift featuresPathMergeWithDedup; register featuresPath-self + featuresPath-from-behavevsc; refactor migrateLegacyFeaturesPath wrapper to delegate (MIGRATE-01).
- [ ] 020-04-suppress-and-env-PLAN.md — suppressedNotifications + envPresets transforms (5 entries); refactor migrateLegacySuppressMultiConfig wrapper (MIGRATE-02 / MIGRATE-03 / Pitfall 4).
- [ ] 020-05-activation-wiring-PLAN.md — Wire evaluateAllMigrations into extension.ts; delete src/extension.ts:348-350 silent calls; flip registry-count assertion to hard pin (D-A6.1).

##### Phase 21: Consent UX (Case 2 & Case 3 Prompts)
**Goal**: Users see the right prompt at activation — case 2 honours `migrationMode`, case 3 always prompts with four actions — and dismissal vs. explicit choice behaves as designed.
**Depends on**: Phase 20
**Requirements**: CONSENT-01, CONSENT-02, CONSENT-03, CONSENT-04, CONSENT-06, MIGRATE-05, MIGRATE-06, TEST-01, TEST-02
**Success Criteria** (what must be TRUE):
  1. On activation, any unfinished migration × scope hitting case 2 or case 3 produces a non-blocking notification; case 1 is silent.
  2. With `migrationMode = prompt`, case 2 hits show three actions (*Migrate and delete legacy* / *Migrate and keep legacy* / *Don't migrate*); picking any of the three marks the migration Finished at that scope and the prompt does not re-fire.
  3. With `migrationMode = migrate-and-delete` / `migrate-and-keep` / `skip`, case 2 hits run silently with the corresponding action and mark Finished at that scope.
  4. Case 3 hits *always* show four actions (*overwrite-and-delete* / *overwrite-and-keep* / *keep-canonical-and-delete-legacy* / *keep-both*) regardless of `migrationMode`; the chosen action runs and marks Finished at that scope.
  5. Dismissing a notification (X / click-away) leaves the migration unfinished at that scope so it re-surfaces on the next activation.
**Plans:** 3 plans
Plans:
- [x] 021-01-consent-module-PLAN.md — Create src/migrations/consent.ts (types, helpers, formatters, 7 action handlers, runConsentFlow orchestrator) + re-export from src/migrations/index.ts.
- [ ] 021-02-activation-wiring-PLAN.md — Wire collect-then-prompt pattern into src/extension.ts:~338 (fire-and-forget runConsentFlow).
- [ ] 021-03-tests-PLAN.md — Add test/unit/migrations/consent.test.ts (TEST-01 + TEST-02 + grouping + audit logging).
**UI hint**: yes

##### Phase 22: Cleanup, Integration & Docs
**Goal**: The `behave-vsc` silent fallback reads are gone, the new consent flow is verified end-to-end in real VS Code, and users have accurate documentation describing the behavior change.
**Depends on**: Phase 21
**Requirements**: CLEANUP-01, TEST-07, DOC-01, DOC-02
**Success Criteria** (what must be TRUE):
  1. `src/configuration.ts` (`legacyWinConfig` / `legacyWkspConfig`), `src/common.ts:202`, and `src/discovery/projectList.ts:167` no longer read the `behave-vsc.*` namespace; the extension reads only canonical `gs-behave-bdd.*` keys after v1.5.0.
  2. A new `example-projects/migration-consent/` fixture with seeded `behave-vsc.*` settings drives an integration test that exercises the full flow: prompt fires, user picks an action, migration completes, `completedMigrations` is written.
  3. README clearly explains the consent UX, the `migrationMode` / `completedMigrations` settings, the *Recheck Migrations* command, and the migration path off the `behave-vsc` extension — with a prominent callout that v1.5.0 stops honouring legacy `behave-vsc.*` reads.
  4. Setting descriptions for `migrationMode` and `completedMigrations` in package.json read clearly in the Settings UI and match README copy.
**Plans:** 3 plans
Plans:
- [ ] 022-01-cleanup-PLAN.md — Remove all silent behave-vsc.* fallback reads, delete getWithLegacyFallback ladder, drop legacyConfig from WindowSettings/WorkspaceSettings + helpers (CLEANUP-01).
- [ ] 022-02-integration-test-PLAN.md — New example-projects/migration-consent/ fixture + integration suite covering Case 1 silent, Case 2 Migrate & delete, Case 3 Overwrite & delete (TEST-07).
- [ ] 022-03-docs-PLAN.md — README bullet #14 + migration sub-section; tighten package.json descriptions for migrationMode + completedMigrations (DOC-01, DOC-02).

#### Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 19. Migration Foundation | 4/4 | Complete | 2026-05-07 |
| 20. Migration Registry | 5/5 | Complete | 2026-05-08 |
| 21. Consent UX (Case 2 & Case 3 Prompts) | 3/3 | Complete | 2026-05-11 |
| 22. Cleanup, Integration & Docs | 0/3 | Planned | - |
