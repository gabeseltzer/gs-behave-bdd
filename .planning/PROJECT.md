# Auto-Discover Behave Projects

## What This Is

An enhancement to the gs-behave-bdd VS Code extension that automatically discovers behave project structure by reading behave's native configuration files (`behave.ini`, `.behaverc`, `setup.cfg`, `tox.ini`, `pyproject.toml`). Opening a folder with a behave config file surfaces tests in the Test Explorer with zero manual configuration, and — since 1.1.0 — the test tree reacts in real time when those config files are edited, created, or deleted. Test execution is guarded when a workspace's config is malformed.

## Core Value

Zero-configuration project discovery: tests appear in the Test Explorer without the user touching settings.json — and stay correct as the config evolves.

## Current State

**Shipped:** 1.1.0 Config File Watching (2026-04-17)
**In flight:** 1.2.0 Multi-Path & Monorepo-Aware Discovery (started 2026-04-17)

- 1.0.0: Config parsing, discovery cache, UX (3 phases, 6 plans)
- 1.1.0: Real-time config watching, malformed-config run guard, E2E integration coverage (3 phases, 9 plans)
- 539 unit tests passing; 14 integration suites passing (3-run flakiness gate cleared on Windows)

## Current Milestone: 1.2.0 Multi-Path & Monorepo-Aware Discovery

**Goal:** Extend auto-discovery to support behave projects with multiple feature paths and configs nested inside monorepo subdirectories — without touching multi-project scope.

**Target features:**

- **Multi-path features (DISC-08)** — Parse `paths=` as array; internal `featuresUris[]`; downstream consumers (test tree, feature parser, watchers, find-step-refs, discovery cache) updated; new `featuresPaths[]` settings.json key added (legacy singular `featuresPath` still honored).
- **Subdirectory config scanning (DISC-07)** — Depth-3 scan by default (opt-out via `discoveryDepth`); first-match-wins when multiple configs found; warning + notification guides the user toward `projectPath` override.
- **Watcher + run-guard compatibility** — Config watcher glob covers subdirectory paths; run guard still works per-workspace with multi-path test trees.

**Key scoping decisions:**

- First-match + warn when subdir scan finds >1 config (MULTI-01/02 stays deferred to Milestone 3 / v2.0)
- Depth 3, opt-out (monorepo-friendly by default; `discoveryDepth` setting tunes scope)
- Add `featuresPaths[]` settings.json key (both singular `featuresPath` and plural supported; plural wins if both set)

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

### Active

(1.2.0 requirements drafted during this milestone cycle; see `.planning/REQUIREMENTS.md`.)

### Out of Scope

- Multiple behave projects per workspace folder — Milestone 3 candidate
- `Behave BDD: Select Project` quick-pick command — Milestone 3 candidate
- README documentation updates — Milestone 3 candidate
- Home directory configs (`~/.behaverc`) — affects runtime, not project structure
- Inline "Fix Config" code action — nice-to-have, not table stakes
- Hard-blocking run guard (no "Run Anyway") — anti-feature; user must always be able to proceed
- "Reload Window" prompt on config change — anti-feature; ESLint explicitly removed this pattern

## Context

**Tech stack:** TypeScript, VS Code Extension API, Mocha/Sinon, smol-toml.
**Test coverage:** 539 unit tests; 14 integration suites (watcher-integration added in 1.1.0 as the 14th).
**Shipped:** 2 milestones, 6 phases, 15 plans across 1.0.0 + 1.1.0.

**Key files added during 1.0.0 + 1.1.0:**

- `src/parsers/configParser.ts` — stateless parser for all 5 behave config formats (1.0.0)
- `src/handlers/configDiagnostics.ts` — Problems panel diagnostics for config parse errors (1.0.0)
- `src/watchers/configWatcher.ts` — per-workspace FileSystemWatcher with 500ms debounce (1.1.0)
- `src/extension.ts` — `updateDiscoveryUX()`, discovery cache integration, watcher lifecycle (1.0.0 + 1.1.0)
- `src/runners/testRunHandler.ts` — `checkRunGuard()` (1.1.0)
- `test/integration/suite-shared/waitForTestTree.ts` — deterministic test-tree state polling (1.1.0)
- `example-projects/watcher-integration/` — dedicated fs-mutation fixture (1.1.0)

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
*Last updated: 2026-04-17 — 1.2.0 milestone started (multi-path + monorepo-aware discovery)*
