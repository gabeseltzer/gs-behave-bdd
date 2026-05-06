# Milestones

## v1.4.0 Deprecate featuresPath & Notification Suppression (Shipped: 2026-05-04)

**Phases completed:** 4 phases (15-18), 17 plans
**Git range:** ef3bc8c..9146b35 (77 commits, 95 files, +14899/-418 lines)
**Requirements:** 15/15 satisfied (NOTIF-01..08, DEP-01..07)
**Timeline:** 2026-04-27 → 2026-05-04 (8 days)
**Tests at close:** 697 unit + 19 integration suites passing

**Key accomplishments:**

- `suppressedNotifications: string[]` array setting + reusable suppression module (`src/notifications.ts`) with check/suppress/migrate paths; legacy `suppressMultiConfigNotification` boolean removed and auto-migrated to the array on activation (Phase 15 — 28 new unit tests, 683 baseline)
- `featuresPath` setting hard-removed from package.json schema; `migrateLegacyFeaturesPath` wired into activation with same-scope inspect/write/clear semantics; internal reads collapsed to `featuresPaths[]`-only across `settings.ts`, `common.ts`, and the `TestWorkspaceConfig` mock (Phase 16 — 7/7 DEP requirements verified)
- `migrateScopedSetting<TSrc, TDest>` reusable migration primitive extracted from Phase 15 + refactored Phase 15 helper to delegate to it (D-MOD regression bar: all 8 sub-cases pass) — Phase 16 ships its own migration as a thin wrapper
- 19th integration suite: 7 real-VSCode migrations integration tests (`migrations integration suite/extension.test.ts`) covering both migrations end-to-end via a dedicated `migration-stale/` fixture; uncovered + fixed Phase 12 `activeProjectCache` staleness regression at commit `c08ced5` (Phase 17)
- Phase 18 closure: removed unreachable `suppressMultiConfigNotification` mock fallback, documented the read-time `discoveryDepth` re-read as deliberate ad-hoc workaround pending proper invalidation, wrote phase-level rollups for Phases 16+17, captured `activeProjectCache` invalidation pairing as v1.4.0 carry-forward tech debt

**Carry-forward tech debt (not blocking close):** Pair `clearScanResultCache()` with project-list invalidation when discovery-influencing settings change. See commit `c08ced5` and `.planning/STATE.md` § "v1.4.0 Carry-Forward Tech Debt".

---

## v1.3.0 Project Switching (Shipped: 2026-04-23)

**Phases completed:** 3 phases (12-14), 7 plans
**Git range:** 1.2.0..v1.3.0 (20 commits, 40 files, +3715/-40 lines)
**Requirements:** 18/18 satisfied
**Timeline:** 2026-04-23 (single day)

**Key accomplishments:**

- `ProjectList` module (`projectList.ts`) with per-workspace CRUD, `workspaceState` persistence, auto-selection, and fallback logic — scanner promotes all discovered configs as switchable projects
- `Behave BDD: Select Project` quick-pick command with status bar indicator; pure helper extraction (`selectProjectHelpers.ts`) with 35 unit tests (14 project list + 21 select project)
- Switch triggers full test tree + step mapping rebuild via `configurationChangedHandler` with `withProgress` notification and `projectSwitchInProgress` run guard (GUARD-05)
- Dedicated `project-switch/` integration test fixture (alpha + beta sub-projects) verifying tree rebuilds after switching; 18th integration suite
- README documentation covering auto-discovery, multi-path configs, monorepo scanning, and project switching

---

## 1.2.0 Multi-Path & Monorepo-Aware Discovery (Shipped: 2026-04-22)

**Phases completed:** 5 phases (7-11), 13 plans
**Git range:** 1.1.0..1.2.0 (67 commits, 130 files, +15786/-1011 lines)
**Requirements:** 19/20 satisfied (1 intentionally dropped: INT-01)
**Timeline:** 2026-04-17 → 2026-04-22 (5 days)

**Key accomplishments:**

- `WorkspaceSettings` carries `featuresUris[]`, `stepsSearchUris[]`, `projectRelativeFeaturesPaths[]` end-to-end with singular getters for back-compat; 18-file consumer cascade updated to iterate/union across all roots
- Path-group intermediate TestItems: multi-path workspaces show collapsible `features/`, `features-alt/` subtrees under the workspace node; single-path workspaces stay flat
- BFS subdirectory config scanner (`configScanner.ts`) with exclude-dirs, symlink-cycle protection, circuit breaker, and `discoveryDepth` setting (default 3, 0 = v1.1 behavior)
- Multi-config notification UX: first-match-wins + non-modal notification listing all found configs with "Open Settings" / "Show Details" / "Don't Show Again" buttons
- Two-tier config watcher strategy (narrow at discovered config + recursive fallback) preserving debounce and brace-expansion fixes
- `featuresPaths[]` user-facing setting in package.json; plural wins over singular with info log; `hasExplicitNonEmptyArraySetting` gate
- 3 dedicated test fixtures (multi-path/, multi-path-settings/, monorepo-scan/) with 9 integration tests locked by 3× Windows CI flakiness gate

---

## 1.1.0 Config File Watching (Shipped: 2026-04-17)

**Phases completed:** 3 phases (4-6), 9 plans, 19 tasks
**Git range:** 1.0.0..1.1.0 (48 commits, 93 files, +9458/-8540 lines)
**Requirements:** 13/13 complete

**Key accomplishments:**

- Per-workspace FileSystemWatcher covering all 5 behave config formats with 500ms debounce, wired into `configurationChangedHandler` so test-tree rebuilds happen automatically on config edits
- Non-blocking run guard (`checkRunGuard`) that reads `configError` from the discovery cache and intercepts both test runs and debug sessions with "Run Anyway / Open Config File / Cancel"
- Dedicated watcher-integration fixture (`example-projects/watcher-integration/`) with sibling `features-alt/` for mutation-safe filesystem tests
- Shared `waitForTestTree` polling primitive replacing brittle wall-clock sleeps with deterministic state gating across integration suites
- 14th integration suite added: 3 watcher tests (delete/create/change) + 4 run-guard tests, locked in by a 3-run flakiness gate on Windows
- TEST-08 closed and 13/13 1.1.0 requirements flipped to Complete; Phase 4 code-review findings (WR-01, WR-02, IN-01, IN-02) resolved in Phase 6

---

## 1.0.0 Auto-Discover Behave Projects (Shipped: 2026-04-16)

**Phases completed:** 3 phases, 6 plans, 11 tasks

**Key accomplishments:**

- Stateless `configParser.ts` module with hand-rolled INI parser and smol-toml TOML parser, reading all 5 behave config formats in priority order and resolving feature paths as `vscode.Uri`
- 12-test Mocha suite covering all 5 behave config formats, path resolution, edge cases, multi-path, and priority order — status: checkpoint pending human verification
- One-liner:
- Discovery results surfaced via output channel log (source, config file, features directory), fire-and-forget warning notification with Open Config File/Open Settings buttons, and Problems panel diagnostics — with package.json descriptions reframed as override-only
- example-projects/config-only/

---
