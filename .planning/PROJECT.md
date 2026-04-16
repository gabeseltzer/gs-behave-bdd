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
- ✓ Extension reads behave config files (`behave.ini`, `.behaverc`, `setup.cfg`, `tox.ini`, `pyproject.toml`) to discover project root and feature paths — Validated in Phase 1: Config Parsing
- ✓ INI config files parsed for `[behave]` section `paths` key (newline-separated values) — Validated in Phase 1: Config Parsing
- ✓ TOML config files parsed for `[tool.behave]` `paths` key (native array) — Validated in Phase 1: Config Parsing
- ✓ Unit tests for all config file formats, priority logic, path resolution, and edge cases — Validated in Phase 1: Config Parsing
- ✓ Discovery priority: manual settings > config file > `features/` convention — Validated in Phase 2: Integration
- ✓ Manual settings detected via `inspect()` checking `globalValue`, `workspaceValue`, and `workspaceFolderValue` — Validated in Phase 2: Integration
- ✓ Discovery results cached in module-level Map; cache invalidated by workspace folder changes, settings changes, or manual refresh — Validated in Phase 2: Integration
- ✓ `WorkspaceSettings` tracks `discoverySource` ("config-file" | "convention" | "settings") and `configFileUri` — Validated in Phase 2: Integration
- ✓ Activation events expanded to include `workspaceContains:**/behave.ini` and `workspaceContains:**/.behaverc` — Validated in Phase 2: Integration

### Active

- [ ] Extension reads behave config files (`behave.ini`, `.behaverc`, `setup.cfg`, `tox.ini`, `pyproject.toml`) to discover project root and feature paths
- [ ] INI config files parsed for `[behave]` section `paths` key (newline-separated values)
- [ ] TOML config files parsed for `[tool.behave]` `paths` key (native array)
- [x] Discovery priority: manual settings > config file > `features/` convention
- [x] Manual settings detected via `inspect()` checking `globalValue`, `workspaceValue`, and `workspaceFolderValue`
- [ ] Subdirectory scanning (default depth 3, configurable via `gs-behave-bdd.discoveryDepth` setting) to find config files in nested project dirs
- [ ] Multiple feature paths supported (`featuresUris: Uri[]`) when config specifies multiple `paths=` values
- [ ] All downstream consumers (parsers, watchers, runners) updated to iterate over multiple feature paths
- [ ] Backward-compatible `featuresUri` getter returns `featuresUris[0]`
- [x] Discovery results cached in module-level Map; cache invalidated by workspace folder changes, settings changes, or manual refresh
- [x] `WorkspaceSettings` tracks `discoverySource` ("config-file" | "convention" | "settings") and `configFileUri`
- [ ] Output channel logs discovery results (source, project root, features paths)
- [ ] Status bar detail shows discovery source on hover
- [x] Activation events expanded to include `workspaceContains:**/behave.ini` and `workspaceContains:**/.behaverc`
- [ ] Setting descriptions updated to frame `projectPath` and `featuresPath` as overrides
- [ ] Config parse errors shown as warning notification + status bar warning state, with fallback to convention
- [ ] `smol-toml` npm dependency added for correct TOML parsing (~5KB)
- [ ] Unit tests for all config file formats, priority logic, path resolution, and edge cases
- [ ] Integration tests with new example projects (`config-only/`, `pyproject-config/`, `multi-features/`)
- [ ] Existing example projects with `.vscode/settings.json` continue to work unchanged (backward compat)

### Out of Scope

- File system watchers for config file changes (mid-session re-discovery) — Milestone 2
- Cache invalidation via config file watchers — Milestone 2
- Multiple behave projects per workspace folder (multi-project discovery) — Milestone 3
- `Behave BDD: Select Project` quick pick command — Milestone 3
- README documentation updates — Milestone 3
- Home directory configs (`~/.behaverc`, etc.) — irrelevant for project discovery; these affect runtime behavior, not project structure

## Context

- **Existing architecture**: The extension follows a command-handler-parser-runner pattern. `getUrisOfWkspFoldersWithFeatures()` in `src/common.ts` is the gatekeeper that determines which workspace folders are active. `WorkspaceSettings` in `src/settings.ts` holds resolved paths.
- **Behave's config system** (verified against `bundled/libs/behave/configuration.py`):
  - `config_filenames()` searches `./` and `~/` for `behave.ini`, `.behaverc`, `setup.cfg`, `tox.ini`, `pyproject.toml`
  - INI files: `[behave]` section, `paths` key with `action="append"` → `splitlines()`
  - TOML files: `[tool.behave]` table, `paths` as native array
  - Paths resolved relative to config file directory via `os.path.normpath(os.path.join(config_dir, p))`
  - Runner uses `paths[0]` as base_dir, walks up looking for `steps/` dir — multi-path means multiple feature search locations under one project root, NOT multiple projects
  - TOML support conditional on `tomllib`/`tomli`/`toml` availability in Python; extension needs its own parser
- **`featuresUri` → `featuresUris[]` refactor**: Ripples through `fileParser.ts`, `stepMappings.ts`, `featureParser.ts`, `workspaceWatcher.ts`, `testRunHandler.ts`, and `runOrDebug.ts`. Mitigated by keeping `featuresUri` as convenience getter for `featuresUris[0]`.
- **Performance constraint**: `getUrisOfWkspFoldersWithFeatures()` must remain < 1ms. Discovery scan cached after first run; subsequent calls return from cache.

## Constraints

- **Performance**: `getUrisOfWkspFoldersWithFeatures()` < 1ms hard requirement. Discovery results must be cached.
- **Backward compatibility**: Users with explicit `projectPath`/`featuresPath` settings must see zero behavior change.
- **Bundle size**: Extension must remain lightweight. `smol-toml` adds ~5KB — acceptable.
- **Tech stack**: TypeScript, VS Code Extension API, Mocha/Sinon for tests. No Python changes.
- **Config fidelity**: INI/TOML parsing must match behave's own parsing behavior for the `paths` key.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Include multi-path (`featuresUris[]`) in v1 | Behave supports multi-path natively via `paths=`; blocking to single path is artificial limitation | — Pending |
| Depth 3 subdirectory scan with configurable setting | "Just works" philosophy — covers deeply nested monorepo layouts; configurable for users who want to limit scan | — Pending |
| Add `smol-toml` dependency | Correct TOML parsing > hand-rolled regex; ~5KB bundle impact acceptable | — Pending |
| Activation events for `behave.ini` and `.behaverc` only | Unambiguous behave signals; `setup.cfg`/`tox.ini`/`pyproject.toml` too generic for activation | Implemented in Phase 2 |
| Skip home directory configs | Extension discovers project structure within workspace; `~/.behaverc` affects runtime, not layout | — Pending |
| `inspect()` checks all 3 scope levels | Must detect explicit settings at global, workspace, AND workspaceFolder level to match `getWithLegacyFallback()` pattern | Implemented in Phase 2 |

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
*Last updated: 2026-04-16 after Phase 3 completion — all 3 phases complete, milestone v1.0 done*
