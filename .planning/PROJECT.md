# Auto-Discover Behave Projects

## What This Is

An enhancement to the gs-behave-bdd VS Code extension that automatically discovers behave project structure by reading behave's native configuration files (`behave.ini`, `.behaverc`, `setup.cfg`, `tox.ini`, `pyproject.toml`). Opening a folder with a behave config file surfaces tests in the Test Explorer with zero manual configuration. The test tree reacts in real time when config files are edited, created, or deleted. Multi-path configs (e.g. `paths = features\n  features-alt`) and configs nested in monorepo subdirectories are discovered automatically.

## Core Value

Zero-configuration project discovery: tests appear in the Test Explorer without the user touching settings.json — and stay correct as the config evolves.

## Current State

**Shipped:** 1.2.0 Multi-Path & Monorepo-Aware Discovery (2026-04-22)

- 1.0.0: Config parsing, discovery cache, UX (3 phases, 6 plans)
- 1.1.0: Real-time config watching, malformed-config run guard, E2E integration coverage (3 phases, 9 plans)
- 1.2.0: Multi-path types end-to-end, BFS monorepo scanner, `featuresPaths[]` setting, 3 integration fixtures (5 phases, 13 plans)
- 614 unit tests passing; 17 integration suites passing (3-run flakiness gate cleared on Windows)

## Current Milestone: v1.3.0 Project Switching

**Goal:** Let users switch between multiple discovered behave projects within a workspace folder — one active project at a time, with a quick-pick command and status bar indicator, plus incremental README documentation.

**Target features:**
- `Behave BDD: Select Project` quick-pick command to switch active project
- Status bar item showing current active project (click to switch)
- Remember last selected project across sessions
- Auto-select first match when no prior selection exists
- Scanner promotes all discovered configs as switchable projects (no more first-match-wins notification)
- Incremental README documentation additions for discovery features

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
- ✓ Per-workspace FileSystemWatcher for all 5 config formats with 500ms debounce — 1.1.0 (WATCH-01..06)
- ✓ Malformed-config run guard (non-blocking; Run/Open/Cancel) covering runs and debug — 1.1.0 (GUARD-01..04)
- ✓ End-to-end integration coverage of config-edit → tree-update flow (TEST-08) — 1.1.0
- ✓ Unit tests for watcher debounce + run-guard response paths — 1.1.0 (TEST-07, TEST-09)
- ✓ Multi-path `paths=` parsed as array; `featuresUris[]` end-to-end with singular getters for back-compat — 1.2.0 (MP-01, MP-02)
- ✓ `featuresPaths[]` array setting in package.json; plural wins over singular — 1.2.0 (MP-03)
- ✓ Per-path resolution failure surfaces as Problems-panel diagnostic — 1.2.0 (MP-04)
- ✓ Path-group intermediate TestItems for multi-path workspaces — 1.2.0 (MP-05)
- ✓ 18-file consumer cascade iterates/unions over `featuresUris[]` — 1.2.0 (MP-06)
- ✓ BFS subdirectory config scanner with exclude-dirs, symlink-cycle protection, circuit breaker — 1.2.0 (SD-01)
- ✓ `discoveryDepth` setting (default 3; 0 = root-only) — 1.2.0 (SD-02)
- ✓ First-match-wins + `alsoFoundConfigs` notification — 1.2.0 (SD-03)
- ✓ Two-tier config watcher strategy (narrow + recursive fallback) — 1.2.0 (SD-04)
- ✓ `workspaceWatcher` fan-out per `featuresUris[]` entry — 1.2.0 (INT-02)
- ✓ `projectPath` manual override still wins over subdir scan — 1.2.0 (INT-03)
- ✓ `integrationTestRun` bypass for scanner-triggered rebuild — 1.2.0 (INT-04)
- ✓ Unit tests for configParser multi-path and configScanner BFS — 1.2.0 (TEST-10, TEST-11, TEST-12)
- ✓ Integration tests for multi-path, monorepo-scan, config-edit flows — 1.2.0 (TEST-13)
- ✓ Dedicated test fixtures (multi-path/, multi-path-settings/, monorepo-scan/) — 1.2.0 (TEST-14)
- ✓ 3× Windows CI flakiness gate — 1.2.0 (TEST-15)

### Active

(Defined in REQUIREMENTS.md for milestone v1.3.0.)

### Out of Scope

- All discovered projects active simultaneously (multiple test tree roots per workspace) — future milestone candidate
- Per-project settings overrides (env vars, tags) — future milestone candidate
- Deprecate singular `featuresPath` setting — backlog Phase 999.1
- Home directory configs (`~/.behaverc`) — affects runtime, not project structure
- Inline "Fix Config" code action — nice-to-have, not table stakes
- Hard-blocking run guard (no "Run Anyway") — anti-feature; user must always be able to proceed
- "Reload Window" prompt on config change — anti-feature; ESLint explicitly removed this pattern
- Per-document-root fixture scoping (INT-01) — dropped in 1.2.0; behave loads fixtures globally

## Context

**Tech stack:** TypeScript, VS Code Extension API, Mocha/Sinon, smol-toml.
**Test coverage:** 614 unit tests; 17 integration suites.
**Shipped:** 3 milestones, 11 phases, 28 plans across 1.0.0 + 1.1.0 + 1.2.0.

**Key files added during 1.0.0 + 1.1.0 + 1.2.0:**

- `src/parsers/configParser.ts` — stateless parser for all 5 behave config formats (1.0.0); dedup + per-path diagnostics (1.2.0)
- `src/handlers/configDiagnostics.ts` — Problems panel diagnostics for config parse errors (1.0.0)
- `src/watchers/configWatcher.ts` — per-workspace FileSystemWatcher with 500ms debounce (1.1.0); two-tier strategy (1.2.0)
- `src/discovery/configScanner.ts` — BFS subdirectory config scanner with exclude-dirs, symlink-cycle protection (1.2.0)
- `src/extension.ts` — `updateDiscoveryUX()`, discovery cache, watcher lifecycle, scanner IIFE (1.0.0–1.2.0)
- `src/runners/testRunHandler.ts` — `checkRunGuard()` (1.1.0)
- `test/integration/suite-shared/waitForTestTree.ts` — deterministic test-tree state polling (1.1.0)
- `example-projects/multi-path/` — multi-value `paths=` fixture (1.2.0)
- `example-projects/multi-path-settings/` — `featuresPaths[]` setting fixture (1.2.0)
- `example-projects/monorepo-scan/` — nested configs fixture (1.2.0)

## Constraints

- **Performance:** `getUrisOfWkspFoldersWithFeatures()` < 1ms hard requirement. Discovery results cached in-process.
- **Backward compatibility:** Users with explicit `projectPath`/`featuresPath` settings see zero behavior change.
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
| Brace-expansion config glob `{behave.ini,.behaverc,…}` (1.1.0) | Bare filenames silently fail (VS Code bug #164925) | ✓ Good — watcher fires reliably |
| 500ms debounce on config watchers (1.1.0) | Stale file-read race on `onDidChange` (VS Code bug #72831) | ✓ Good |
| Config watcher routes through `configurationChangedHandler(undefined, undefined, true)` (1.1.0) | Preserves integration-test guard, log clearing, watcher rebuild, `clearNotifiedErrors=true` | ✓ Good — single choke point |
| Run guard reads `getDiscoveryEntry()` not `WorkspaceSettings` snapshot (1.1.0) | Staleness-safe — cache is single source of truth | ✓ Good |
| Non-blocking run guard UX (Run Anyway / Open / Cancel) (1.1.0) | Anti-feature to hard-block; user must always be able to proceed | ✓ Good |
| Dedicated fs-mutation test fixture (`watcher-integration/`) (1.1.0) | Prevent cross-suite pollution (D-05) | ✓ Good |
| `waitForTestTree` predicate polling replaces wall-clock sleeps (1.1.0) | Deterministic state gating; handles Windows FileSystemWatcher 1-5s delete latency | ✓ Good |
| Phase 6 tech-debt cleanup as explicit phase (1.1.0) | Clears all code-review findings + admin hygiene before milestone close | ✓ Good — zero debt shipped |
| Primary-plus-list pattern for multi-path types (1.2.0) | `featuresUris[]` with `featuresUri` getter returning `[0]` — 20+ singular call sites unchanged | ✓ Good — minimal disruption |
| Drop INT-01 per-root fixture scoping (1.2.0) | Behave loads fixtures globally, not per-feature-path — scoping would diverge from runtime | ✓ Good — avoids false isolation |
| BFS depth-3 default with `discoveryDepth` opt-out (1.2.0) | Monorepo-friendly out of the box; 0 = v1.1 behavior; 10 = practical max | ✓ Good |
| First-match-wins when scanner finds multiple configs (1.2.0) | Full multi-project support deferred to next milestone; notification guides user to `projectPath` | ✓ Good — ships faster |
| Two-tier watcher strategy (1.2.0) | Narrow watcher at discovered config + recursive fallback; avoids missing new configs | ✓ Good |
| `featuresPaths[]` plural wins over singular `featuresPath` (1.2.0) | Clear precedence; info log when both set; empty array = unset | ✓ Good |
| Semver versioning aligned with package.json (1.2.0) | Planning milestone versions match package.json; real semantic versioning going forward | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):

1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):

1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-22 — milestone v1.3.0 scope revised to project switching*
