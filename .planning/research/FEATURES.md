# Feature Landscape: VS Code Test Extension Auto-Discovery

**Domain:** VS Code test runner extension — project/config auto-discovery
**Researched:** 2026-04-15
**Scope:** What features users expect when a test extension adds zero-config project discovery

---

## Context

The gs-behave-bdd extension currently requires users to manually set `projectPath` and `featuresPath`
in settings.json. This milestone adds automatic discovery of behave project structure from native config
files (`behave.ini`, `.behaverc`, `setup.cfg`, `tox.ini`, `pyproject.toml`).

Evidence base: Python (pytest/unittest), Jest, Vitest, Go test, Ruby LSP, and VS Code testing API docs.
Confidence: MEDIUM-HIGH (official docs + verified GitHub sources).

---

## Table Stakes

Features users expect when any test extension claims "zero-config" discovery. Missing = product feels
incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Reads framework's native config file | Pytest reads `pytest.ini`/`pyproject.toml`, Jest reads `jest.config.*` — behave users expect behave config files to drive the extension too | Medium | Core of this milestone. All five behave config files must be covered. |
| Tests appear in Test Explorer on folder open, no settings.json required | Defined as zero-config. VS Code Python extension does this after framework selection; Jest does it fully automatically | Medium | The milestone's core value proposition. |
| Activation without manual enable step | Jest auto-activates on detecting config files; VS Code Python requires one click to select framework. Users expect behave to auto-activate like Jest when a `behave.ini` or `.behaverc` is present | Low | Already partially handled via `workspaceContains:**/*.feature`. Expanding activation events to `behave.ini` and `.behaverc` covers the rest. |
| Manual settings override auto-discovery | Pytest extension settings override `pytest.ini`; Jest settings override `jest.config`. Users who already configured the extension expect zero behavior change | Low | Already designed in PROJECT.md: `settings > config file > convention`. `inspect()` checks all three scope levels. |
| Fallback to convention when no config found | Pytest defaults to `tests/` or current dir; Jest defaults to `__tests__/`. Users expect a sensible fallback even without config | Low | `features/` convention fallback already specified. |
| Error notification when config is malformed | VS Code Python shows "Test discovery error, please check configuration settings." Jest extension shows warnings in output channel. Users expect clear guidance, not silent failure | Low | Warning notification + status bar warning state + fallback to convention. Already in PROJECT.md. |
| Output channel logs what was discovered | All major extensions (Python, Jest, Go) log discovery results to an output channel. Users troubleshoot by reading that log | Low | Log discovery source, project root, and features paths. Already in PROJECT.md. |
| Refresh / re-discover on demand | VS Code Python provides "Test: Refresh Tests" command. Jest re-runs discovery on file change. Users expect a manual trigger when auto-discovery misses something | Low | `vscode.workspace.onDidOpenTextDocument` or a refresh command. Already a VS Code Testing API standard pattern. |

---

## Differentiators

Features not universally expected, but that meaningfully improve the experience and reflect behave's own design.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Multi-path features support (`paths=` with multiple values) | Behave natively supports multiple feature directories in one project. No other VS Code test extension handles this because their frameworks don't have an equivalent. This reflects behave's true behavior. | High | Requires `featuresUris[]` refactor rippling through parser, watcher, runner. Worth doing in v1 because retrofitting later is harder. |
| Subdirectory scan for config files (configurable depth) | Monorepo layouts nest the behave project inside a subdirectory. Vitest scans with glob patterns; Python extension requires explicit `rootdir` config. Auto-scanning up to depth 3 covers the majority of real layouts without extra config. | Medium | `gs-behave-bdd.discoveryDepth` setting. Default 3. Configurable for performance-sensitive users. |
| `discoverySource` tracking in status bar hover | Users are confused when discovery doesn't match expectations. Showing "Discovered from behave.ini" vs "Using convention (features/)" in status bar hover gives instant feedback without requiring output channel inspection. | Low | `discoverySource: "config-file" | "convention" | "settings"`. Unique to this extension. |
| Config file URI tracked for future watchers | Storing `configFileUri` in `WorkspaceSettings` enables file-system watchers in Milestone 2 (mid-session re-discovery) without a settings refactor. Other extensions (Vitest, Jest) support live config reload — users come to expect this. | Low | No watcher in v1, but the groundwork makes Milestone 2 incremental rather than structural. |
| TOML parsing via `smol-toml` (not regex) | `pyproject.toml` is increasingly the preferred Python project config file. Jest and Vitest both parse their TOML/JSON configs with proper parsers, not regex. Using `smol-toml` means correct handling of multi-line arrays, inline tables, and escape sequences that a hand-rolled parser would miss. | Low | ~5KB bundle cost. Acceptable. |

---

## Anti-Features

Things to explicitly NOT build in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| File system watchers for config file changes (mid-session re-discovery) | Adds meaningful complexity (watcher lifecycle, event debouncing, cache invalidation timing) that belongs in its own milestone. Vitest and Jest both ship this, but as a distinct feature from initial discovery. Bundling it here risks delaying Milestone 1 delivery. | Milestone 2. `configFileUri` is already stored in `WorkspaceSettings` to make watcher attachment trivial then. |
| Multiple behave projects per workspace folder | Behave's own `paths=` is multi-path within one project, not multi-project. Supporting "multiple independent behave projects in a single workspace folder" (e.g., `projectA/` and `projectB/` each with their own `behave.ini`) is a different problem requiring a project selection UX (`Behave BDD: Select Project` quick pick). Complex enough to be Milestone 3. | Multi-root VS Code workspaces cover most multi-project cases today. Recommend that pattern to users in setting descriptions. |
| Home directory config (`~/.behaverc`) | Affects runtime behavior (default tags, timeouts), not project structure (paths). Extension discovers project layout within the workspace. Reading `~/.behaverc` would give false path signals. | Explicitly skip. Document why in code comments. |
| Auto-install of behave or Python | VS Code Python extension attempts background install of pytest. This causes confusion when the wrong environment is used or install fails silently. Behave's CLI execution path is the user's responsibility. | Emit a clear error if behave is not found on the configured Python path. Do not attempt install. |
| Interactive setup wizard | Jest extension ships a setup wizard for complex monorepo configs. For behave, the config file IS the setup — if `behave.ini` exists, the extension should just work. A wizard adds UI complexity without equivalent payoff given behave's simpler project model. | The output channel log + status bar hover tooltip replaces the wizard's diagnostic function. |
| Config file editing / generation | Some extensions offer to create `jest.config.js` or `pytest.ini`. Behave users already have these files (they're what triggers discovery). Generating them is outside test-runner scope and creates maintenance burden. | Document behave config file format in README (Milestone 3). |

---

## Feature Dependencies

```
Activation events (behave.ini, .behaverc)
  → must fire before any discovery runs

Config file parsing (INI + TOML)
  → required before featuresUris[] can be populated

featuresUris[] refactor (featuresUri → featuresUris[])
  → blocks: fileParser, stepMappings, featureParser, workspaceWatcher, testRunHandler, runOrDebug
  → backward compat: featuresUri getter = featuresUris[0]

Subdirectory scan
  → depends on config file parsing (need to know WHAT to scan for)
  → feeds: featuresUris[]

Discovery priority logic (settings > config-file > convention)
  → depends on: inspect() at all 3 scopes, config file parsing, subdirectory scan
  → gates: WorkspaceSettings construction

discoverySource + configFileUri tracking
  → depends on: discovery priority logic
  → feeds: status bar display, Milestone 2 watcher attachment

Error handling (malformed config → warning + fallback)
  → depends on: config file parsing
  → feeds: notification UX, output channel logging

Unit tests
  → depend on: all of the above
  → covers: each config format, priority logic, path resolution, edge cases

Integration tests (config-only/, pyproject-config/, multi-features/ example projects)
  → depend on: all of the above
  → verifies: backward compat with existing settings-driven example projects
```

---

## MVP Recommendation

The PROJECT.md already defines a well-scoped v1. From a features perspective, the priority ordering is:

1. **Config file parsing** (INI + TOML) — without this, nothing else works
2. **Discovery priority logic + `WorkspaceSettings` updates** — this is the core behavioral change
3. **`featuresUris[]` refactor** — required for multi-path support and honoring behave's own semantics
4. **Error handling + output logging** — table stakes for a production-quality extension
5. **Status bar discoverySource display** — low effort, high trust signal for users
6. **Unit tests** — required before shipping any parsing logic
7. **Integration tests** — validates the end-to-end flow

Defer to Milestone 2:
- File system watchers for config file changes
- `discoveryDepth` setting (subdirectory scan) — the scan itself is in scope, but making depth user-configurable can ship after the core works

Defer to Milestone 3:
- Multi-project per workspace folder
- README documentation

---

## Sources

- [Python testing in Visual Studio Code (official docs)](https://code.visualstudio.com/docs/python/testing)
- [VS Code Testing API — extension guide](https://code.visualstudio.com/api/extension-guides/testing)
- [jest-community/vscode-jest — GitHub](https://github.com/jest-community/vscode-jest)
- [vitest-dev/vscode — Monorepo and Workspace Configuration (DeepWiki)](https://deepwiki.com/vitest-dev/vscode/5.2-monorepo-and-workspace-configuration)
- [Multi-Project Testing in VS Code — Python extension wiki](https://github.com/microsoft/vscode-python/wiki/Multi%E2%80%90Project-Testing-in-VS-Code)
- [VS Code Activation Events API reference](https://code.visualstudio.com/api/references/activation-events)
- [jimasp/behave-vsc — GitHub (comparable extension)](https://github.com/jimasp/behave-vsc)
