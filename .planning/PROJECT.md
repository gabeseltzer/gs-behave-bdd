# Auto-Discover Behave Projects

## What This Is

An enhancement to the gs-behave-bdd VS Code extension that automatically discovers behave project structure by reading behave's native configuration files (`behave.ini`, `.behaverc`, `setup.cfg`, `tox.ini`, `pyproject.toml`). New users opening a folder with a behave config file will see their tests appear in the Test Explorer with zero manual configuration — the extension "just works."

## Core Value

Zero-configuration project discovery: tests appear in the Test Explorer without the user touching settings.json.

## Requirements

### Validated

- ✓ Manual `projectPath` and `featuresPath` settings work — existing
- ✓ Extension activates on `workspaceContains:**/*.feature` — existing
- ✓ Multi-root workspace support with per-workspace settings — existing
- ✓ `getUrisOfWkspFoldersWithFeatures()` returns workspace folders with features in < 1ms — existing
- ✓ Extension reads behave config files (all 5 formats) and produces resolved feature path — v1.0
- ✓ INI config files parsed for `[behave]` section `paths` key with continuation-line semantics — v1.0
- ✓ TOML config files parsed for `[tool.behave]` `paths` key as native array — v1.0
- ✓ Config file search follows behave's priority order — v1.0
- ✓ Discovery priority: manual settings > config file > convention — v1.0
- ✓ Manual settings detected via `inspect()` at all 3 scope levels — v1.0
- ✓ Discovery results cached in module-level Map; gatekeeper reads cache only (< 1ms) — v1.0
- ✓ `WorkspaceSettings` tracks `discoverySource` and `configFileUri` — v1.0
- ✓ Activation events expanded for `behave.ini` and `.behaverc` — v1.0
- ✓ Output channel logs discovery source, config file, and features directory — v1.0
- ✓ Malformed config warning notification with "Open Config File" / "Open Settings" buttons — v1.0
- ✓ Config parse failure falls back to convention — v1.0
- ✓ Setting descriptions frame `projectPath`/`featuresPath` as overrides of auto-discovery — v1.0
- ✓ Unit tests for all config formats, priority logic, path resolution, edge cases — v1.0
- ✓ Integration tests with config-only, pyproject-config, malformed-config example projects — v1.0
- ✓ Backward compat: existing example projects with settings.json pass unchanged — v1.0
- ✓ `smol-toml` dependency added for TOML parsing — v1.0

### Active

- [ ] Malformed config run guard: warn user before behave crashes on broken config file at runtime
- [ ] Subdirectory scanning (depth 3, configurable) to find config files in nested project dirs
- [ ] Multiple feature paths (`featuresUris[]`) from multi-value `paths=`
- [ ] File system watchers for config file changes (create/modify/delete)

### Out of Scope

- Multiple behave projects per workspace folder — Milestone 3
- `Behave BDD: Select Project` quick pick command — Milestone 3
- README documentation updates — Milestone 3
- Home directory configs (`~/.behaverc`) — affects runtime, not project structure

## Context

Shipped v1.0 with 3 phases, 6 plans, ~950 new lines of TypeScript + test fixtures.
Tech stack: TypeScript, VS Code Extension API, Mocha/Sinon, smol-toml.
521 unit tests passing, 17 integration test suites passing.

Key files added:
- `src/parsers/configParser.ts` — stateless parser for all 5 behave config formats
- `src/handlers/configDiagnostics.ts` — Problems panel diagnostics for config parse errors
- `src/extension.ts` — `updateDiscoveryUX()` function, discovery cache integration in gatekeeper

## Constraints

- **Performance**: `getUrisOfWkspFoldersWithFeatures()` < 1ms hard requirement. Discovery results cached.
- **Backward compatibility**: Users with explicit settings see zero behavior change.
- **Bundle size**: Extension remains lightweight. `smol-toml` ~5KB.
- **Config fidelity**: INI/TOML parsing matches behave's own behavior for the `paths` key.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Single feature path in v1 (no `featuresUris[]`) | Keep v1 scope small; multi-path deferred to v2 | ✓ Good — shipped faster |
| Workspace root only (no subdirectory scan) | Simplifies Phase 1 discovery logic | ✓ Good — deferred to v2 |
| `smol-toml` for TOML parsing | Correct parsing > hand-rolled regex; ~5KB acceptable | ✓ Good — already installed |
| Hand-rolled INI parser | No npm package matches Python configparser continuation-line semantics | ✓ Good — exact behavior match |
| Activation events for `behave.ini` and `.behaverc` only | Unambiguous behave signals; `setup.cfg`/`tox.ini`/`pyproject.toml` too generic | ✓ Good |
| `inspect()` checks all 3 scope levels | Must detect explicit settings at global, workspace, AND workspaceFolder level | ✓ Good |
| Status bar detail removed | Long detail string pushed output button away; info lives in output channel | ✓ Good — better UX |

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
*Last updated: 2026-04-16 after v1.0 milestone completion*
