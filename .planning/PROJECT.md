# Auto-Discover Behave Projects

## What This Is

An enhancement to the gs-behave-bdd VS Code extension that automatically discovers behave project structure by reading behave's native configuration files (`behave.ini`, `.behaverc`, `setup.cfg`, `tox.ini`, `pyproject.toml`). Opening a folder with a behave config file surfaces tests in the Test Explorer with zero manual configuration. The test tree reacts in real time when config files are edited, created, or deleted. Multi-path configs and configs nested in monorepo subdirectories are discovered automatically. Workspaces with multiple behave projects support switching between them via a quick-pick command and status bar indicator.

## Core Value

Zero-configuration project discovery: tests appear in the Test Explorer without the user touching settings.json — and stay correct as the config evolves.


## Current State

**Shipped:** v1.4.0 Deprecate featuresPath & Notification Suppression (2026-05-04)

- 1.0.0: Config parsing, discovery cache, UX (3 phases, 6 plans)
- 1.1.0: Real-time config watching, malformed-config run guard, E2E integration coverage (3 phases, 9 plans)
- 1.2.0: Multi-path types end-to-end, BFS monorepo scanner, `featuresPaths[]` setting, 3 integration fixtures (5 phases, 13 plans)
- 1.3.0: Project switching with quick-pick command, status bar indicator, `workspaceState` persistence, rebuild on switch (3 phases, 7 plans)
- v1.4.0: Reusable notification suppression module, `featuresPath` deprecation with auto-migration, `migrateScopedSetting` primitive, migrations integration suite (4 phases, 17 plans)
- 697 unit tests passing; 19 integration suites passing

## Next Milestone Goals

(To be defined via `/gsd-new-milestone`.)

## Requirements

### Validated

- ✓ Manual `projectPath` and `featuresPath` settings work — existing
- ✓ Extension activates on `workspaceContains:**/*.feature` — existing
- ✓ Multi-root workspace support with per-workspace settings — existing
- ✓ `getUrisOfWkspFoldersWithFeatures()` returns workspace folders with features in < 1ms — existing
- ✓ Extension reads behave config files (all 5 formats) and produces resolved feature path — 1.0.0
- ✓ INI config files parsed for `[behave]` section `paths` key with continuation-line semantics — 1.0.0
- ✓ TOML config files parsed for `[tool.behave]` `paths` key as native array — 1.0.0
- ✓ Config file search follows behave's priority order — 1.0.0
- ✓ Discovery priority: manual settings > config file > convention — 1.0.0
- ✓ Manual settings detected via `inspect()` at all 3 scope levels — 1.0.0
- ✓ Discovery results cached in module-level Map; gatekeeper reads cache only (< 1ms) — 1.0.0
- ✓ `WorkspaceSettings` tracks `discoverySource` and `configFileUri` — 1.0.0
- ✓ Activation events expanded for `behave.ini` and `.behaverc` — 1.0.0
- ✓ Output channel logs discovery source, config file, and features directory — 1.0.0
- ✓ Malformed config warning notification with "Open Config File" / "Open Settings" buttons — 1.0.0
- ✓ Config parse failure falls back to convention — 1.0.0
- ✓ Setting descriptions frame `projectPath`/`featuresPath` as overrides of auto-discovery — 1.0.0
- ✓ Unit tests for all config formats, priority logic, path resolution, edge cases — 1.0.0
- ✓ Integration tests with config-only, pyproject-config, malformed-config example projects — 1.0.0
- ✓ Backward compat: existing example projects with settings.json pass unchanged — 1.0.0
- ✓ `smol-toml` dependency added for TOML parsing — 1.0.0
- ✓ Per-workspace FileSystemWatcher for all 5 config formats with 500ms debounce — 1.1.0
- ✓ Malformed-config run guard (non-blocking; Run/Open/Cancel) covering runs and debug — 1.1.0
- ✓ End-to-end integration coverage of config-edit → tree-update flow — 1.1.0
- ✓ Unit tests for watcher debounce + run-guard response paths — 1.1.0
- ✓ Multi-path `paths=` parsed as array; `featuresUris[]` end-to-end with singular getters for back-compat — 1.2.0
- ✓ `featuresPaths[]` array setting in package.json; plural wins over singular — 1.2.0
- ✓ Per-path resolution failure surfaces as Problems-panel diagnostic — 1.2.0
- ✓ Path-group intermediate TestItems for multi-path workspaces — 1.2.0
- ✓ 18-file consumer cascade iterates/unions over `featuresUris[]` — 1.2.0
- ✓ BFS subdirectory config scanner with exclude-dirs, symlink-cycle protection, circuit breaker — 1.2.0
- ✓ `discoveryDepth` setting (default 3; 0 = root-only) — 1.2.0
- ✓ First-match-wins + `alsoFoundConfigs` notification — 1.2.0
- ✓ Two-tier config watcher strategy (narrow + recursive fallback) — 1.2.0
- ✓ `workspaceWatcher` fan-out per `featuresUris[]` entry — 1.2.0
- ✓ `projectPath` manual override still wins over subdir scan — 1.2.0
- ✓ `integrationTestRun` bypass for scanner-triggered rebuild — 1.2.0
- ✓ Unit tests for configParser multi-path and configScanner BFS — 1.2.0
- ✓ Integration tests for multi-path, monorepo-scan, config-edit flows — 1.2.0
- ✓ Dedicated test fixtures (multi-path/, multi-path-settings/, monorepo-scan/) — 1.2.0
- ✓ 3x Windows CI flakiness gate — 1.2.0
- ✓ Scanner promotes all discovered configs as switchable project list — 1.3.0 (DISC-01)
- ✓ Active project selection persisted in `workspaceState` — 1.3.0 (DISC-02)
- ✓ Auto-select first discovered config when no prior selection — 1.3.0 (DISC-03)
- ✓ `projectPath` manual override = single project mode, no switching UI — 1.3.0 (DISC-04)
- ✓ Config watcher updates project list on disk changes — 1.3.0 (DISC-05)
- ✓ `featuresPath` removed from package.json settings schema (DEP-01) — 1.4.0
- ✓ Auto-migration of `featuresPath` → `featuresPaths` on per-workspace activation (DEP-02, DEP-04) — 1.4.0
- ✓ `migrateLegacyFeaturesPath(wkspUri)` migration helper with same-scope inspect/write/clear semantics (DEP-03) — 1.4.0
- ✓ Reusable `migrateScopedSetting<TSrc, TDest>` primitive with `TransformResult<T>` discriminated union (DEP-07) — 1.4.0
- ✓ Phase 15 `migrateLegacySuppressMultiConfig` refactored to delegate to the primitive (DEP-07) — 1.4.0
- ✓ Singular `featuresPath` reads removed from `src/settings.ts`, `src/common.ts`, and `TestWorkspaceConfig` mock (DEP-05, DEP-06) — 1.4.0
- ✓ `Behave BDD: Select Project` quick-pick command — 1.3.0 (UX-01)
- ✓ Status bar showing active project label — 1.3.0 (UX-02)
- ✓ Clicking status bar opens quick-pick — 1.3.0 (UX-03)
- ✓ Status bar hidden when 1 project or manual mode — 1.3.0 (UX-04)
- ✓ Quick-pick shows label + config type description — 1.3.0 (UX-05)
- ✓ Switch triggers test tree rebuild — 1.3.0 (INT-01)
- ✓ Switch triggers step mapping rebuild — 1.3.0 (INT-02)
- ✓ Output channel log shows active + alternatives — 1.3.0 (INT-03)
- ✓ Single-project workspaces: zero behavior change — 1.3.0 (INT-04)
- ✓ Unit tests for project list management — 1.3.0 (TEST-01)
- ✓ Unit tests for quick-pick and status bar — 1.3.0 (TEST-02)
- ✓ Integration test with multi-project fixture — 1.3.0 (TEST-03)
- ✓ README covers auto-discovery, multi-path, monorepo, switching — 1.3.0 (DOC-01)

### Active

(Requirements for next milestone — to be defined via `/gsd-new-milestone`.)

### Out of Scope

- All discovered projects active simultaneously (multiple test tree roots per workspace) — future milestone candidate
- Per-project settings overrides (env vars, tags) — future milestone candidate
- Home directory configs (`~/.behaverc`) — affects runtime, not project structure
- Inline "Fix Config" code action — nice-to-have, not table stakes
- Hard-blocking run guard (no "Run Anyway") — anti-feature; user must always be able to proceed
- "Reload Window" prompt on config change — anti-feature; ESLint explicitly removed this pattern
- Per-document-root fixture scoping (INT-01) — dropped in 1.2.0; behave loads fixtures globally

## Context

**Tech stack:** TypeScript, VS Code Extension API, Mocha/Sinon, smol-toml.
**Test coverage:** 697 unit tests; 19 integration suites.
**Shipped:** 5 milestones, 18 phases, 52 plans across 1.0.0 + 1.1.0 + 1.2.0 + 1.3.0 + v1.4.0.

**Key files added during 1.0.0-v1.4.0:**

- `src/parsers/configParser.ts` — stateless parser for all 5 behave config formats (1.0.0); dedup + per-path diagnostics (1.2.0)
- `src/handlers/configDiagnostics.ts` — Problems panel diagnostics for config parse errors (1.0.0)
- `src/watchers/configWatcher.ts` — per-workspace FileSystemWatcher with 500ms debounce (1.1.0); two-tier strategy (1.2.0)
- `src/discovery/configScanner.ts` — BFS subdirectory config scanner with exclude-dirs, symlink-cycle protection (1.2.0)
- `src/discovery/projectList.ts` — per-workspace project list with CRUD, persistence, auto-selection (1.3.0)
- `src/discovery/selectProjectHelpers.ts` — pure helpers for quick-pick items and status bar state (1.3.0)
- `src/extension.ts` — discovery cache, watcher lifecycle, scanner, project switching command (1.0.0-1.3.0)
- `src/runners/testRunHandler.ts` — `checkRunGuard()` (1.1.0); `projectSwitchInProgress` guard (1.3.0)
- `test/integration/suite-shared/waitForTestTree.ts` — deterministic test-tree state polling (1.1.0)
- `example-projects/project-switch/` — alpha/beta sub-project fixture (1.3.0)
- `src/notifications.ts` — reusable notification suppression module: `isSuppressed`, `suppressNotification`, `showSuppressibleNotification` (v1.4.0)
- `src/migrations.ts` — `migrateScopedSetting<TSrc, TDest>` primitive + `migrateLegacyFeaturesPath`/`migrateLegacySuppressMultiConfig` wrappers (v1.4.0)
- `test/integration/migrations integration suite/` — 7 real-VSCode tests covering both migrations end-to-end (v1.4.0)
- `example-projects/migration-stale/` — seeded settings.json fixture for migration integration tests (v1.4.0)

## Constraints

- **Performance:** `getUrisOfWkspFoldersWithFeatures()` < 1ms hard requirement. Discovery results cached in-process.
- **Backward compatibility:** Auto-migration ensures users with `featuresPath` see zero behavior change after upgrade.
- **Bundle size:** Extension remains lightweight. `smol-toml` adds ~5KB (acceptable).
- **Config fidelity:** INI/TOML parsing matches behave's own behavior for the `paths` key.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Single feature path in 1.0.0 (no `featuresUris[]`) | Keep v1 scope small; multi-path deferred | ✓ Good — shipped faster; 1.2.0 candidate |
| Workspace root only (no subdirectory scan) in 1.0.0 | Simplifies Phase 1 discovery logic | ✓ Good — deferred to 1.2.0 |
| `smol-toml` for TOML parsing | Correct parsing > hand-rolled regex; ~5KB acceptable | ✓ Good — already installed |
| Hand-rolled INI parser | No npm package matches Python configparser continuation-line semantics | ✓ Good — exact behavior match |
| Activation events for `behave.ini` and `.behaverc` only | Unambiguous behave signals; `setup.cfg`/`tox.ini`/`pyproject.toml` too generic | ✓ Good |
| `inspect()` checks all 3 scope levels | Must detect explicit settings at global, workspace, AND workspaceFolder level | ✓ Good |
| Status bar detail removed | Long detail string pushed output button away; info lives in output channel | ✓ Good — better UX |
| Brace-expansion config glob (1.1.0) | Bare filenames silently fail (VS Code bug #164925) | ✓ Good |
| 500ms debounce on config watchers (1.1.0) | Stale file-read race on `onDidChange` (VS Code bug #72831) | ✓ Good |
| Config watcher routes through `configurationChangedHandler` (1.1.0) | Single choke point preserves all side effects | ✓ Good |
| Non-blocking run guard UX (1.1.0) | User must always be able to proceed | ✓ Good |
| Primary-plus-list pattern for multi-path types (1.2.0) | `featuresUris[]` with `featuresUri` getter returning `[0]` — 20+ singular call sites unchanged | ✓ Good |
| Drop INT-01 per-root fixture scoping (1.2.0) | Behave loads fixtures globally | ✓ Good |
| BFS depth-3 default with `discoveryDepth` opt-out (1.2.0) | Monorepo-friendly; 0 = v1.1 behavior | ✓ Good |
| First-match-wins with notification (1.2.0) | Full multi-project deferred to 1.3.0 | ✓ Good — shipped faster |
| Two-tier watcher strategy (1.2.0) | Narrow + recursive fallback | ✓ Good |
| `featuresPaths[]` plural wins over singular (1.2.0) | Clear precedence | ✓ Good |
| One active project at a time (1.3.0) | No 1:N WorkspaceSettings refactor; much simpler than simultaneous | ✓ Good — ships value immediately |
| `workspaceState` persistence for active project (1.3.0) | Survives reload; fire-and-forget update semantics | ✓ Good |
| Pure helper extraction for testability (1.3.0) | `buildQuickPickItems`/`computeStatusBarState` as standalone functions | ✓ Good — 21 unit tests |
| Rebuild via `configurationChangedHandler` on switch (1.3.0) | Reuses existing choke point; no parallel rebuild path | ✓ Good |
| `projectSwitchInProgress` run guard (1.3.0) | Blocks test runs during rebuild with warning message | ✓ Good |
| `suppressedNotifications: string[]` array (v1.4.0) | Extensible to future notification keys without schema growth | ✓ Good |
| Migration writes at detected scope via `inspect()` (v1.4.0) | Preserves user intent across global/workspace/folder | ✓ Good |
| `migrateScopedSetting` primitive extraction (v1.4.0) | Phase 16 reuses Phase 15 logic; D-MOD regression bar held | ✓ Good |
| Read-time `discoveryDepth` re-read in `hasFeaturesFolder()` (v1.4.0) | Tactical fix for cache-staleness regression; redesign deferred | ⚠ Revisit — proper invalidation pairing tracked as v1.4.0 carry-forward |
| Phase 17 as dedicated cross-cutting verification phase (v1.4.0) | Migrations span Phases 15+16; integration evidence belongs in its own phase | ✓ Good — caught the `activeProjectCache` regression |
| Phase 18 closure phase (v1.4.0) | Audit found low-severity artifact + cleanup gaps; address before close | ✓ Good — zero outstanding artifact debt |

## Evolution

This document evolves at phase transitions and milestone boundaries.

---
*Last updated: 2026-05-04 after v1.4.0 milestone shipped*