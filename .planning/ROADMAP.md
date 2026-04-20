# Roadmap: Auto-Discover Behave Projects

## Milestones

- **v1.0 Auto-Discover Behave Projects** — Phases 1-3 (shipped 2026-04-16)
- **v1.1 Config File Watching** — Phases 4-6 (shipped 2026-04-17)
- **v1.2 Multi-Path & Monorepo-Aware Discovery** — Phases 7-11 (started 2026-04-17)

## Phases

<details>
<summary>v1.0 Auto-Discover Behave Projects (Phases 1-3) — SHIPPED 2026-04-16</summary>

- [x] Phase 1: Config Parsing (2/2 plans) — completed 2026-04-15
- [x] Phase 2: Integration (2/2 plans) — completed 2026-04-15
- [x] Phase 3: UX & Verification (2/2 plans) — completed 2026-04-16

Archive: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)

</details>

<details>
<summary>v1.1 Config File Watching (Phases 4-6) — SHIPPED 2026-04-17</summary>

- [x] Phase 4: Watcher & Run Guard (2/2 plans) — completed 2026-04-16
- [x] Phase 5: Integration Verification (5/5 plans) — completed 2026-04-17
- [x] Phase 6: v1.1 Tech Debt & Admin Cleanup (2/2 plans) — completed 2026-04-17

Archive: [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md)

</details>

### v1.2 Multi-Path & Monorepo-Aware Discovery (Phases 7-11)

- [x] **Phase 7: Internal Multi-Path Types** — Introduce primary-plus-list plural types end-to-end (`featuresUris[]`, `resolvedPaths[]`) with singular getters so the codebase still compiles — completed 2026-04-20 (3/3 plans)
- [ ] **Phase 8: Parser / Test-Tree / Watcher Multi-Root Iteration** — Make every consumer iterate/union/per-root-scope across `featuresUris[]`; user-visible multi-path when a behave.ini already lists multiple `paths=` entries
- [ ] **Phase 9: Subdirectory Config Scan** — New `src/discovery/configScanner.ts` module: BFS depth-3 default, `discoveryDepth` setting, first-match-wins + `alsoFoundConfigs` notification, two-tier config watcher
- [ ] **Phase 10: `featuresPaths` User-Facing Settings Key** — `gs-behave-bdd.featuresPaths: string[]` in package.json; plural wins over singular `featuresPath`; legacy key still honored
- [ ] **Phase 11: UX Polish + Regression Hardening** — Integration test matrix, dedicated `multi-path/` + `monorepo-scan/` fixtures, 3× Windows CI flakiness gate

## Phase Details

### Phase 7: Internal Multi-Path Types
**Goal**: The codebase carries multi-path shape end-to-end (`featuresUris: Uri[]`, `resolvedPaths: Uri[]`) without changing any user-visible behavior; singular getters preserve back-compat for every existing consumer
**Depends on**: Phase 6 (v1.1 close)
**Requirements**: MP-02, TEST-12
**Success Criteria** (what must be TRUE):
  1. A single-path workspace (e.g. the v1.0 `config-only/` fixture) still discovers its features correctly and shows its test tree with zero visible change
  2. `WorkspaceSettings.featuresUri` / `projectRelativeFeaturesPath` / `stepsSearchUri` singular getters return the corresponding `…s[0]` element for all 20+ existing call sites
  3. A workspace with an INI config containing `paths = features\n  features-alt` populates `WorkspaceSettings.featuresUris.length === 2` internally, even though nothing downstream consumes the second entry yet
  4. Setting `featuresPath: "."` (invalid token) or an empty string is still rejected exactly as in v1.1
  5. `npm run test:unit` passes with new unit coverage for the plural/singular precedence matrix (plural set / singular set / both set / neither set / plural empty array)
**Plans**: TBD

### Phase 8: Parser / Test-Tree / Watcher Multi-Root Iteration
**Goal**: When a user's behave config resolves to multiple feature directories, every consumer (parser, test tree, watcher, runner queue, fixture/step handlers, JUnit parser) iterates/unions/per-root-scopes across all roots so the full test surface is visible, runnable, and correctly scoped
**Depends on**: Phase 7
**Requirements**: MP-01, MP-04, MP-05, MP-06, INT-01, INT-02, TEST-10
**Success Criteria** (what must be TRUE):
  1. A workspace with `behave.ini` containing `paths = features\nfeatures-alt` shows features from BOTH roots in the Test Explorer as path-group intermediate TestItems (e.g. `features/`, `features-alt/`) collapsible under the workspace node; single-path workspaces stay flat (no visible change)
  2. Adding a new `.feature` file under `features-alt/` (the non-primary root) surfaces in the Test Explorer within the workspace-watcher budget — one FileSystemWatcher now fires per `featuresUris[]` entry
  3. Clicking "Run All Tests" executes scenarios from both roots in a single behave invocation and produces correct Pass/Fail status for every scenario (JUnit name trim picks the correct per-root prefix)
  4. A per-path diagnostic appears in the Problems panel attached to the config file when one entry in `paths=` fails to resolve (e.g. `paths=[features, bogus]` flags `bogus` without aborting discovery of `features`)
  5. Fixtures declared in root A do NOT appear as autocomplete/diagnostic results for a feature file in root B — per-document-root scoping via `getFeaturesRootForFile` is correctness-enforced
  6. Overlapping paths (`paths = features\n  features/api`) produce exactly ONE test tree subtree — dedup in `resolvePaths` drops the subsumed path and logs the collision
**Plans**: 3 plans
**Plans:**
- [x] 08-01-PLAN.md - configParser dedup + per-path diagnostics + unit tests
- [x] 08-02-PLAN.md - fileParser + stepMappings + junitParser multi-root + path-group TestItems
- [x] 08-03-PLAN.md - Watcher fan-out + handler union + runner + settings cascade
**UI hint**: yes

### Phase 9: Subdirectory Config Scan
**Goal**: A user opening a monorepo folder whose behave config lives at `packages/<name>/behave.ini` sees their tests discovered automatically — without workspace-root config, without freezing on `node_modules/`, and with a non-modal notification guiding them to `projectPath` when multiple configs exist
**Depends on**: Phase 7
**Requirements**: SD-01, SD-02, SD-03, SD-04, INT-03, INT-04, TEST-11
**Success Criteria** (what must be TRUE):
  1. Opening a workspace whose only behave config is at `backend/behave.ini` (no workspace-root config) surfaces backend features in the Test Explorer automatically — no settings.json intervention required
  2. Scanning a workspace with a seeded 1000-file `node_modules/` completes within the discovery performance budget (<100ms target) because the scanner respects `DEFAULT_EXCLUDE_DIRS` and circuit-breaks at `maxEntriesScanned`
  3. When the scan finds multiple configs (e.g. `app-a/behave.ini` + `app-b/behave.ini`), a single non-modal information notification lists all of them, says which is primary, and offers "Open Settings" to set `projectPath`; the same session does NOT re-notify for the same pair
  4. Setting `gs-behave-bdd.discoveryDepth: 0` restores v1.1 behavior exactly (workspace-root-only scan) with no subdir traversal
  5. Editing or deleting the currently-discovered subdirectory config fires the config watcher correctly (two-tier strategy: narrow watcher at the discovered config's directory + `**/` fallback only when no config is discovered); the tree rebuilds via `waitForTestTree` predicate
  6. Setting `gs-behave-bdd.projectPath` manually still overrides scan results — the v1.0 priority chain (manual > config > convention) is preserved and re-tested
**Plans**: 3 plans
**Plans:**
- [ ] 09-01-PLAN.md — Settings declarations + DiscoveryEntry type extension
- [ ] 09-02-PLAN.md — configScanner.ts BFS module + unit tests (TEST-11)
- [ ] 09-03-PLAN.md — Integration wiring, async IIFE, multi-config UX, two-tier watcher

### Phase 10: `featuresPaths` User-Facing Settings Key
**Goal**: Users can opt into multi-path discovery via a new `gs-behave-bdd.featuresPaths: string[]` setting in settings.json, and legacy `featuresPath` keeps working unchanged; when both are set, the plural value wins with a one-line info log
**Depends on**: Phase 7, Phase 8
**Requirements**: MP-03
**Success Criteria** (what must be TRUE):
  1. A workspace with `"gs-behave-bdd.featuresPaths": ["featuresA", "featuresB"]` in settings.json shows both as path-group TestItems in the Test Explorer (identical to the behave.ini-driven multi-path behavior from Phase 8)
  2. A workspace with only the legacy `"gs-behave-bdd.featuresPath": "features"` set sees zero behavior change from v1.1 — single path, single tree
  3. A workspace with BOTH `featuresPath` and `featuresPaths` set uses the plural value and writes an info-level line to the Behave BDD output channel noting that the singular is being ignored
  4. `"gs-behave-bdd.featuresPaths": []` (empty array) is treated as if the setting is not set — discovery falls back to config file / convention with no silent empty tree
  5. `hasExplicitSetting` returns true when either `featuresPath` OR `featuresPaths` is set at any scope, preserving the v1.0 manual-override priority
**Plans**: TBD

### Phase 11: UX Polish + Regression Hardening
**Goal**: The v1.2 feature set is locked in by a multi-scenario integration test matrix running against dedicated fixtures, with a 3× Windows CI flakiness gate matching v1.1 precedent
**Depends on**: Phase 8, Phase 9, Phase 10
**Requirements**: TEST-13, TEST-14, TEST-15
**Success Criteria** (what must be TRUE):
  1. New `example-projects/multi-path/` fixture (single config with `paths = features\nfeatures-alt`) is isolated from all other suites per D-05 — no suite reads or mutates it cross-boundary
  2. New `example-projects/monorepo-scan/` fixture (nested `app-a/behave.ini` + `app-b/behave.ini` + seeded `node_modules/` for perf assertion) is isolated equivalently and exercises the subdir-scan happy path + ambiguity notification
  3. Integration suite covers: multi-path from `behave.ini`, multi-path from `settings.json.featuresPaths`, subdir scan with multi-path inside the discovered config, config-edit that adds a new path rebuilding the tree via `waitForTestTree`, `discoveryDepth=0` edge case
  4. 3-run green pass on Windows CI matches the v1.1 D-21 flakiness gate before milestone close
  5. `logSettings` output in `settings.ts` renders the plural `featuresUris` as a comma-joined list — no single-path lie in the output channel
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Config Parsing | v1.0 | 2/2 | Complete | 2026-04-15 |
| 2. Integration | v1.0 | 2/2 | Complete | 2026-04-15 |
| 3. UX & Verification | v1.0 | 2/2 | Complete | 2026-04-16 |
| 4. Watcher & Run Guard | v1.1 | 2/2 | Complete | 2026-04-16 |
| 5. Integration Verification | v1.1 | 5/5 | Complete | 2026-04-17 |
| 6. v1.1 Tech Debt & Admin Cleanup | v1.1 | 2/2 | Complete | 2026-04-17 |
| 7. Internal Multi-Path Types | v1.2 | 3/3 | Complete | 2026-04-20 |
| 8. Parser / Test-Tree / Watcher Multi-Root Iteration | v1.2 | 0/3 | Not started | - |
| 9. Subdirectory Config Scan | v1.2 | 0/3 | Not started | - |
| 10. `featuresPaths` User-Facing Settings Key | v1.2 | 0/? | Not started | - |
| 11. UX Polish + Regression Hardening | v1.2 | 0/? | Not started | - |
