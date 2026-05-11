# v1.5.0 Requirements

**Milestone:** Migration Consent & `behave-vsc` Cleanup
**Goal:** Make settings migration opt-in via per-migration consent prompts, complete the cross-extension migration off the legacy `behave-vsc` namespace, and pay down the `activeProjectCache` debt from v1.4.0.

---

## Design Reference (Mental Model)

**Migration registry.** The extension defines a fixed set of *migration entries* in code. Each entry maps one legacy key → one canonical key (e.g. `behave-vsc.featuresPath` → `gs-behave-bdd.featuresPaths`).

**Per-scope evaluation.** On activation, for each unfinished migration × each VS Code scope (Global / Workspace / WorkspaceFolder), the extension inspects that scope's settings and applies one of three cases:

- **Case 1 — Neither legacy nor canonical set at this scope:** mark the migration Finished at this scope. No prompts, no writes.
- **Case 2 — Legacy set, canonical not set at this scope:** apply the user's default migration strategy (`migrationMode` setting): prompt them, or auto-apply *migrate-and-delete* / *migrate-and-keep* / *don't-migrate*. Mark Finished at this scope after the chosen action runs (regardless of which choice was made).
- **Case 3 — Both legacy and canonical set at this scope:** *always* prompt the user (overrides `migrationMode`) with four explicit options: *overwrite-and-delete*, *overwrite-and-keep*, *keep-canonical-and-delete-legacy*, *keep-both*. Mark Finished at this scope after the chosen action runs.

**Finished state.** Stored in `gs-behave-bdd.completedMigrations: string[]` (array of migration IDs), registered as a normal setting and editable per-scope. Each scope has its own array — Global, Workspace, and WorkspaceFolder values are independent. A new workspace folder starts with an empty array, so the extension automatically scans its settings on first open.

**Recheck command.** A *Behave BDD: Recheck Migrations* command in the command palette force-rescans all migrations (including those marked Finished) for the current workspace. Used when a user has manually pasted legacy settings into a workspace and wants to re-migrate them forward.

---

## Active Requirements

### Consent UX & Settings

- [x] **CONSENT-01**: On activation, the extension scans each unfinished migration × each scope. For any case 2 / case 3 hit, a non-blocking notification is shown.
- [ ] **CONSENT-02 (case 2 prompt)**: When `migrationMode` is `prompt`, case 2 hits show a notification with three actions: *Migrate and delete legacy*, *Migrate and keep legacy*, *Don't migrate*. Whichever the user picks, the migration is marked Finished at that scope and the prompt does not re-fire.
- [ ] **CONSENT-03 (case 3 prompt)**: Case 3 hits *always* show a notification (regardless of `migrationMode`) with four actions: *Overwrite canonical with legacy, delete legacy*, *Overwrite canonical with legacy, keep legacy*, *Keep canonical, delete legacy*, *Keep both as-is*. After the chosen action runs, the migration is marked Finished at that scope.
- [x] **CONSENT-04**: Dismissing a notification (clicking X / clicking away without picking an action) leaves the migration *unfinished* at that scope so the prompt re-surfaces on the next activation.
- [ ] **CONSENT-05**: `gs-behave-bdd.migrationMode` setting registered in package.json as an enum (`prompt` | `migrate-and-delete` | `migrate-and-keep` | `skip`), default `prompt`. Editable per-scope from settings.json or the Settings UI.
- [x] **CONSENT-06**: When `migrationMode` is `migrate-and-delete`, `migrate-and-keep`, or `skip`, case 2 hits run silently with no prompt. Case 3 hits still prompt.
- [ ] **CONSENT-07**: `gs-behave-bdd.completedMigrations: string[]` setting registered in package.json (default `[]`). Stores migration IDs that have been finished at each scope.
- [ ] **CONSENT-08**: Setting descriptions for `migrationMode` and `completedMigrations` clearly explain their semantics in the Settings UI.
- [ ] **CONSENT-09**: New command *Behave BDD: Recheck Migrations* registered. Running it clears `completedMigrations` for the current workspace folder (and parent scopes the user can write to) and re-runs the migration scan, re-prompting the user as if migrations had never been evaluated.

### Migration Registry & Mechanics

- [x] **MIGRATE-01**: `migrateLegacyFeaturesPath` refactored to register as a migration entry in the new registry. No more silent auto-migration on activation; runs through the case 1/2/3 evaluator.
- [x] **MIGRATE-02**: `migrateLegacySuppressMultiConfig` refactored to register as a migration entry in the new registry. No more silent auto-migration on activation; runs through the case 1/2/3 evaluator.
- [x] **MIGRATE-03**: New `behave-vsc` → `gs-behave-bdd` migration entries registered for every silently-fallback-read key currently in `src/configuration.ts` (`legacyWinConfig` / `legacyWkspConfig`), `src/common.ts:202`, and `src/discovery/projectList.ts:167`. Confirm the exhaustive list at plan time (`featuresPath`, env presets, `runParallel`, `xRay`, `projectPath`, etc.).
- [ ] **MIGRATE-04**: Migration evaluator: for each unfinished migration × each VS Code scope (Global / Workspace / WorkspaceFolder), inspect both keys at that scope and dispatch to case 1 / 2 / 3 logic.
- [x] **MIGRATE-05**: Case 2 actions implemented: *migrate-and-delete* (copy legacy → canonical, clear legacy at the same scope), *migrate-and-keep* (copy only), *don't-migrate* (no-op). All three mark Finished at that scope.
- [x] **MIGRATE-06**: Case 3 actions implemented: *overwrite-and-delete* (copy legacy → canonical overwriting, clear legacy), *overwrite-and-keep* (copy overwriting, keep legacy), *keep-canonical-and-delete-legacy* (no copy, clear legacy), *keep-both* (no-op). All four mark Finished at that scope.
- [ ] **MIGRATE-07**: All migrations route through the v1.4.0 `migrateScopedSetting<TSrc, TDest>` primitive. No parallel implementations; same-scope inspect/write/clear semantics preserved.
- [ ] **MIGRATE-08**: Empty / whitespace legacy values treated as "not set" (case 1), matching v1.4.0's `skip-with-removal` (D-08) semantics.
- [ ] **MIGRATE-09**: Mark-Finished is per-scope (`completedMigrations` at Global / Workspace / WorkspaceFolder is independent). A new workspace folder starts with empty `completedMigrations` at WorkspaceFolder scope and is automatically scanned on first activation.

### Cleanup & Tech Debt

- [ ] **CLEANUP-01**: Silent-fallback reads of the `behave-vsc` namespace removed from `src/configuration.ts` (`legacyWinConfig` / `legacyWkspConfig`), `src/common.ts:202`, and `src/discovery/projectList.ts:167`. After v1.5.0 ships, the extension reads only canonical `gs-behave-bdd.*` keys; users who chose `skip` or *don't-migrate* at every scope will see their legacy settings stop being honored. Documented prominently in DOC-01.
- [ ] **CLEANUP-02**: `activeProjectCache` invalidation in `src/common.ts:347`: replace the read-time `discoveryDepth` re-read with proper `clearScanResultCache()` + project-list invalidation when discovery-influencing settings change. Closes the v1.4.0 carry-forward debt.

### Tests

- [ ] **TEST-01**: Unit tests for the case 2 prompt covering each of the three actions + dismissal (re-surfaces) + `migrationMode` overrides (silent run when not `prompt`).
- [ ] **TEST-02**: Unit tests for the case 3 prompt covering each of the four actions + dismissal + `migrationMode`-override-doesn't-apply (case 3 always prompts).
- [ ] **TEST-03**: Unit tests for the migration evaluator covering all three cases × all three VS Code scopes; mark-Finished writes to the right scope.
- [x] **TEST-04**: Unit tests for `migrateBehaveVscNamespace` covering each registered legacy key and idempotency (re-running on already-Finished migrations is a no-op).
- [ ] **TEST-05**: Unit tests for the *Recheck Migrations* command (clears `completedMigrations`, re-runs scan, re-prompts).
- [ ] **TEST-06**: Unit tests for `activeProjectCache` invalidation when `discoveryDepth` changes (regression bar against the v1.4.0 read-time re-read pattern).
- [ ] **TEST-07**: Integration test in real VS Code covering the consent flow end-to-end via a dedicated `example-projects/migration-consent/` fixture: seeded `behave-vsc.*` settings.json, prompt fires, choice is recorded, migration completes, `completedMigrations` is written.

### Documentation

- [ ] **DOC-01**: README updated to describe the migration consent UX, the `migrationMode` and `completedMigrations` settings, the *Recheck Migrations* command, and how to migrate from the `behave-vsc` extension. Includes a prominent callout that v1.5.0 removes silent fallback reads of `behave-vsc.*` (CLEANUP-01) — users who pick `skip` need to manually copy values or use *Recheck Migrations* later.
- [ ] **DOC-02**: Setting descriptions for `migrationMode` and `completedMigrations` in package.json read clearly in the Settings UI and match README copy.

---

## Future Requirements

(Deferred from v1.5.0; candidates for v1.6.0+.)

- Notification-suppression audit — make more `logger.showWarn` / `showError` call sites use the v1.4.0 `suppressedNotifications` infrastructure (backlog item #2).
- A diagnostic / Problems-panel view summarizing what was migrated — out of scope for v1.5.0; output channel log is the v1.5.0 audit trail.

---

## Out of Scope

- Per-migration `migrationMode` (e.g. yes to `featuresPath`, no to `behave-vsc`) — the registry intentionally uses a single default strategy. Users wanting fine-grained control can edit `completedMigrations` directly.
- Auto-migrating user-modified canonical values (case 3 silently overwriting) — v1.5.0 always prompts in case 3 specifically to avoid this.
- Removing the legacy `behave-vsc` references from `src/notifications.ts` (the FEATURES_PATH_NAMESPACES array) — kept until users have time to migrate; possible v1.6.0 candidate.

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONSENT-01 | Phase 21 | Complete |
| CONSENT-02 | Phase 21 | Complete |
| CONSENT-03 | Phase 21 | Complete |
| CONSENT-04 | Phase 21 | Complete |
| CONSENT-05 | Phase 19 | Pending |
| CONSENT-06 | Phase 21 | Complete |
| CONSENT-07 | Phase 19 | Pending |
| CONSENT-08 | Phase 19 | Pending |
| CONSENT-09 | Phase 19 | Pending |
| MIGRATE-01 | Phase 20 | Complete |
| MIGRATE-02 | Phase 20 | Complete |
| MIGRATE-03 | Phase 20 | Complete |
| MIGRATE-04 | Phase 19 | Pending |
| MIGRATE-05 | Phase 21 | Complete |
| MIGRATE-06 | Phase 21 | Complete |
| MIGRATE-07 | Phase 19 | Pending |
| MIGRATE-08 | Phase 19 | Pending |
| MIGRATE-09 | Phase 19 | Pending |
| CLEANUP-01 | Phase 22 | Pending |
| CLEANUP-02 | Phase 19 | Pending |
| TEST-01 | Phase 21 | Pending |
| TEST-02 | Phase 21 | Pending |
| TEST-03 | Phase 19 | Pending |
| TEST-04 | Phase 20 | Complete |
| TEST-05 | Phase 19 | Pending |
| TEST-06 | Phase 19 | Pending |
| TEST-07 | Phase 22 | Pending |
| DOC-01 | Phase 22 | Pending |
| DOC-02 | Phase 22 | Pending |

**Coverage:** 29/29 mapped (note: 31 requirements minus 2 — CONSENT and MIGRATE counts confirmed: 9 CONSENT + 9 MIGRATE + 2 CLEANUP + 7 TEST + 2 DOC = 29 distinct IDs above; all v1.5.0 requirements assigned to exactly one phase).
