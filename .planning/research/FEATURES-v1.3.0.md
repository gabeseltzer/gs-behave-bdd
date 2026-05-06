# Feature Landscape: Multi-Project Support (v1.3.0)

**Domain:** VS Code test runner extension — multiple behave projects per workspace folder
**Researched:** 2026-04-22
**Confidence:** HIGH (mapped against vscode-python multi-project testing, vitest-dev/vscode multi-config architecture, VS Code Testing API docs, and existing 1.2.0 codebase patterns)
**Scope:** NEW features ONLY for v1.3.0. Auto-discovery (1.0.0), config watching (1.1.0), multi-path + monorepo scanning (1.2.0) are shipped and out of scope here.

---

## Context

1.2.0 introduced BFS subdirectory config scanning and the `alsoFoundConfigs` notification — the scanner already finds ALL behave configs in the workspace. But only the first match is activated ("first-match-wins"). The `alsoFoundConfigs` notification tells the user "we found 3 configs, set `projectPath` to pick one" — this is the exact seam 1.3.0 must open.

Today the entire data model is 1:1 workspace-folder:
- `WorkspaceSettings` has one `projectUri`, one `featuresUris[]`, one `envVarOverrides`, etc.
- `DiscoveryEntry` per workspace folder in `discoveryCache`
- `WkspRun` carries one `WorkspaceSettings` and runs behave with that project's CWD
- Test tree: `Workspace > PathGroup > Folders > Feature > Scenario`

1.3.0 changes this to 1:N — one workspace folder contains N behave projects, each with its own config file, project root, features paths, env vars, and behave execution CWD.

### Prior Art Evidence

- **vscode-python** (Feb 2026): Each detected project = separate root TestItem in test tree, labeled by directory name (e.g. "ada", "alice/bob"). Uses Python Environments API for project discovery. Each project has its own interpreter. Nested projects handled with `--ignore` flags for pytest. Falls back to "legacy mode" (single root) when Python Environments extension is unavailable. ([Wiki](https://github.com/microsoft/vscode-python/wiki/Multi%E2%80%90Project-Testing-in-VS-Code))

- **vitest-dev/vscode** (Feb 2026): Each config gets its own `VitestFolderAPI` with separate worker process, WebSocket connection, and file watchers. `maximumConfigs` limit (default 5) with advisory warning — all configs still load. Workspace config file (`vitest.workspace.*`) aggregates multiple configs as an alternative to auto-discovery. Config priority: workspace config > auto-discovered workspace > root config > auto-discovered config. ([DeepWiki](https://deepwiki.com/vitest-dev/vscode/5.2-monorepo-and-workspace-configuration))

- **vscode-jest** ([Issue #129](https://github.com/jest-community/vscode-jest/issues/129)): No sub-root grouping within a single workspace folder. Relies on the user creating a multi-root workspace for monorepos. This is the "punt to multi-root" approach — works but UX is worse for monorepo users who don't want to maintain a `.code-workspace` file.

- **VS Code Testing API** ([docs](https://code.visualstudio.com/api/extension-guides/testing)): `TestItem` hierarchy is fully flexible — no restriction on intermediate "project" nodes. `TestRunRequest.include` contains the subset of test items the user selected; the extension maps them to the correct runner. `TestTag`s can restrict which profiles run which tests.

---

## Table Stakes

Features users expect. Missing = the feature feels half-built or broken compared to vscode-python/vitest patterns.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|-------------|-------|
| **All discovered configs active simultaneously** | The whole point of 1.3.0. Today's first-match-wins + notification already tells users "we found these other configs." Users expect clicking "Run All" exercises ALL their projects. vscode-python and vitest both activate all discovered projects. | Medium | Scanner's `alsoFoundConfigs` output (1.2.0 SD-03); `DiscoveryEntry` cache (1.0.0) | Change `ScanResult.primary` + `alsoFound` from a priority pick to a full list. Each entry becomes a project. The scanner BFS and config-priority sort are reusable — they already produce the full list. |
| **Project node in Test Explorer tree** | Users need to tell projects apart. Without a project node, features from different projects intermingle with ambiguous labels (e.g., two `login.feature` files from two projects). vscode-python uses project names as top-level roots; vitest groups by config name. | Medium | `fileParser.ts` test-tree construction (1.0.0/1.2.0); `WorkspaceSettings.id` used as wkspGrandParent ID | Insert a project node: `Workspace > Project > PathGroup > Folders > Feature > Scenario`. Label = config directory relative to workspace root (e.g. "backend", "frontend/api"). ID = `uriId(configDirUri)`. `canResolveChildren = true`. |
| **Project node label = workspace-relative config directory** | vscode-python uses "ada", "alice/bob" — the directory name relative to workspace. This is intuitive: users think in directory names, not config file names. Behave configs live at project root, so config-dir = project-root. | Low | Project node (above) | For root-level configs, label = workspace folder name (or omit the project node to avoid single-child nesting). For subdir configs, label = relative path. |
| **Per-project behave execution CWD** | behave reads `behave.ini` from CWD and resolves `paths=` relative to CWD. Each project MUST run behave from its own project root directory. Using the wrong CWD = wrong config loaded = wrong features found = test failures. | Low | `behaveRun.ts` and `behaveDebug.ts` already use `wr.wkspSettings.projectUri.fsPath` as CWD | Today `WorkspaceSettings` has one `projectUri`. Multi-project requires each project's WkspRun to carry its project-specific settings with the correct `projectUri`. |
| **Run All at workspace level runs every project** | The workspace root TestItem's "Run" button must execute all projects' features. Users expect one click = full test suite. vscode-python does this by iterating all project roots in `TestRunRequest`. | Medium | `testRunHandler.ts` workspace queue grouping; per-project WkspRun | Today `queueSelectedTestItems` groups by workspace and creates one `WkspRun` per workspace. Need to further group by project within each workspace, then create one WkspRun-equivalent per project. Each project runs behave independently (separate CWD, separate env). |
| **Individual project runnable** | Users must be able to click "Run" on a single project node to run only that project's features. This is the natural expectation when there's a project node in the tree. | Low | Project node has `canResolveChildren = true`; `testRunHandler.ts` already walks `request.include` items | Falls out naturally from the test item hierarchy — if `request.include` is a project node, all its children are queued with that project's settings. |
| **Per-project settings context** | Each project needs its own `projectUri`, `featuresUris[]`, `configFileUri`, and `discoverySource`. Today `WorkspaceSettings` carries all of these as a single set. Multi-project requires N sets per workspace folder. | High | `WorkspaceSettings` class in `settings.ts`; `DiscoveryEntry` in `common.ts`; 18-file consumer cascade (1.2.0 MP-06) | This is the highest-complexity table-stakes feature. Options: (A) Create a `ProjectSettings` class extracted from `WorkspaceSettings` for project-scoped fields, keeping workspace-scoped fields on `WorkspaceSettings`; or (B) Create N `WorkspaceSettings` instances per workspace folder (one per project), each with its own `projectUri`/`featuresUris[]`. Option B is simpler: fewer refactoring touch-points because all 18 consumer files already accept `WorkspaceSettings`. |
| **Backward compatibility: single-project workspaces unchanged** | Users with one behave project (the common case) must see zero behavior change. No extra "project" node wrapping their features. vscode-python handles this: if only one project detected, behaves like legacy mode. | Medium | All above features | When only one config is discovered (or `projectPath` is explicitly set), skip the project node and produce the same tree as 1.2.0. Threshold: project count per workspace > 1 → show project nodes. |
| **Manual `projectPath` override still wins** | 1.0.0/1.2.0 promise: explicit settings override auto-discovery. A user who sets `projectPath` is telling the extension "ignore scanning, use this." This must remain true even when multi-project is active. | Low | `hasExplicitSetting()` in `settings.ts` (1.0.0) | When `projectPath` is explicitly set, create a single project from it (no scanning). Same behavior as today. |
| **Discovery log shows all active projects** | Today's output channel logs "Discovery source: config-file, Features directories: X". Multi-project needs "Discovered 3 projects:" with per-project details. Users need this to troubleshoot "why is my project not showing up?" | Low | `updateDiscoveryUX()` in `extension.ts` | Extend the existing UX function to iterate projects. |

---

## Differentiators

Features that set the extension apart. Not expected (no prior art demands them), but valued.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|-------------|-------|
| **Per-project env var overrides** | Power users running integration tests across multiple projects need different env vars per project (e.g., different API endpoints). Today `envVarOverrides` and `envVarPresets` are per-workspace-folder. Per-project overrides let users configure `BACKEND_URL` for the backend project and `ML_SERVICE_URL` for the ML project without switching presets. | Medium | `WorkspaceSettings.envVarOverrides` and `envVarPresets`; `behaveEnv.ts` env merging | Requires a new settings key structure, e.g. `projectOverrides: { "backend": { envVarOverrides: {...} } }`. Key = project label (workspace-relative config dir). Merges: workspace env → project-specific env → active preset. |
| **Per-project tag filters** | Users may want to run `@smoke` tests in the backend project but `@regression` in the frontend project. Tag filtering per project is more granular than the current workspace-level approach. | Medium | `TestRunProfile` and `TestTag` in VS Code API; `behaveRun.ts` CLI args | Could use VS Code's `TestTag` API to associate project-specific tags. Or simpler: per-project `--tags` arg in the `projectOverrides` settings object. |
| **`maximumProjects` config limit with advisory warning** | Vitest warns at >5 configs because each spawns a worker process. Behave spawns per-run, so the cost is lower, but a 10-project monorepo could still cause UX clutter and slow initial parsing. An advisory limit (default 10?) with a notification mirrors vitest's pattern. | Low | Scanner circuit breaker (1.2.0 SD-01) already has `maxEntriesScanned` | Add `maximumProjects` setting. Log warning when exceeded but still load all projects (advisory, not blocking — consistent with vitest behavior). |
| **Config-file icon/description on project nodes** | Show the config file type (behave.ini, pyproject.toml, etc.) as a description on the project TestItem. Helps users identify which config drives each project without opening the output channel. | Low | `ScanResultEntry.configPriority` (1.2.0) already knows the config type | `testItem.description = "behave.ini"` or `testItem.description = "pyproject.toml"`. Cheap and informative. |
| **"Open Config File" context menu on project node** | Right-click a project node → "Open Config File" opens the behave config for that project. Saves navigation time in monorepos with deeply nested configs. | Low | `testing/item/context` menu contribution point in VS Code API; `configFileUri` on DiscoveryEntry | Register a command `gs-behave-bdd.openProjectConfig` and add it to `testing/item/context`. Guard: only show when the TestItem is a project node. |
| **Incremental README documentation** | Ship discovery feature docs alongside the code. Users discovering the extension from the Marketplace need to understand auto-discovery, multi-path, monorepo scanning, and now multi-project in the README. | Low | Existing README.md | Additive sections. Should cover: how projects are discovered, how the tree is structured, per-project overrides, and common monorepo layouts. |

---

## Anti-Features

Features commonly requested or tempting to build, but problematic.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Quick-pick "Select Project" command** | Already explicitly deferred from 1.3.0 scope in PROJECT.md. With all projects active simultaneously, there's no need to "select" one — all are visible and runnable. A select command implies only one project is active at a time, which contradicts the multi-project model. | Rely on Test Explorer tree navigation. Revisit only if users report a concrete need (e.g., filtering a very large project list). |
| **Per-project Python interpreter** | vscode-python does this because different projects may need different Python versions. Behave projects within one workspace folder almost always share a Python environment. Adding per-project interpreter resolution adds massive complexity (ms-python API integration per project) for a niche use case. | Use the workspace-level Python interpreter. If a user truly needs different interpreters per project, they should use a multi-root workspace (one folder per interpreter). |
| **Project-scoped step definitions (isolated step registries)** | Tempting because two projects might define the same `@given("a user exists")` with different implementations. But behave itself loads steps globally — it doesn't namespace steps per project. If we scope steps per project, our diagnostics and navigation would diverge from behave's runtime behavior, causing confusion when tests pass in the extension but fail on CLI (or vice versa). | Keep step definitions global per workspace folder (matching behave's behavior). Document that behave loads steps globally and users should namespace their step decorators if projects conflict. |
| **Separate output channels per project** | Today there's one output channel per workspace folder. Splitting per project multiplies the number of output channels, cluttering the Output panel. Vitest logs all configs to one channel with clear delimiters. | Prefix project-specific log lines with `[project-label]` in the existing per-workspace output channel. |
| **Hard limit on discovered projects** | Vitest's `maximumConfigs` is advisory (still loads all). A hard limit that refuses to load projects would surprise users who expect all their configs to be active. 1.1.0 explicitly rejected a hard-blocking run guard as an anti-feature for the same reason. | Use advisory `maximumProjects` with a notification suggesting the user consolidate or use multi-root. Load all projects regardless. |
| **Cross-project step definition navigation** | Jumping from a feature file in project A to a step definition in project B. This would require maintaining a global cross-project step index. Behave doesn't support this (each `behave` invocation sees only its own steps directory), and the UX would be confusing. | Step navigation remains scoped to the project's own `steps/` directory (or more precisely, the `stepsSearchUri` derived from each project's features path). |
| **Auto-merge of nested project configs** | If project A's config is at `root/behave.ini` and project B's is at `root/backend/behave.ini`, auto-merging B's settings into A's would be surprising. Behave CLI doesn't do this — each invocation reads exactly one config. | Each config = one independent project. No inheritance, no merging. Users who want shared settings should use a shared config file format (e.g., `setup.cfg` at root). |

---

## Feature Dependencies

```
All discovered configs active simultaneously
├── Per-project settings context (WorkspaceSettings refactor)
│   ├── Per-project behave execution CWD
│   │   └── Run All at workspace level runs every project
│   │       └── Individual project runnable
│   └── Per-project env var overrides (differentiator)
│       └── Per-project tag filters (differentiator)
├── Project node in Test Explorer tree
│   ├── Project node label (workspace-relative path)
│   ├── Config-file description on TestItems (differentiator)
│   ├── "Open Config File" context menu (differentiator)
│   └── Backward compatibility: single-project = no extra node
├── Discovery log shows all active projects
└── Manual projectPath override still wins

maximumProjects config limit (differentiator)
└── (independent — advisory only)

Incremental README documentation (differentiator)
└── (independent — additive content)
```

**Critical path:** Per-project settings context → test tree construction → test execution → UX polish.

The settings refactor is the highest-risk item because `WorkspaceSettings` is consumed by 18+ files across parsers, runners, handlers, and watchers. All downstream consumers that today read `wkspSettings.projectUri` or `wkspSettings.featuresUris` must handle the concept of "which project am I operating on?"

---

## MVP Definition

### v1.3.0 (This Milestone)

**Must ship:**
1. All discovered configs active simultaneously (no more first-match-wins)
2. Project node in Test Explorer tree with workspace-relative label
3. Per-project settings context (projectUri, featuresUris, configFileUri per project)
4. Per-project behave execution CWD
5. Run All at workspace level runs every project
6. Individual project runnable from tree
7. Backward compatibility: single-project workspaces show no project node
8. Manual `projectPath` override still wins (single-project mode)
9. Discovery log shows all active projects
10. Incremental README documentation

**Should ship (differentiators, if time allows):**
11. Config-file description on project TestItems (low effort, high UX value)
12. "Open Config File" context menu on project nodes (low effort)
13. `maximumProjects` advisory limit with notification (low effort)

**Defer to later:**
- Per-project env var overrides (medium complexity, requires new settings schema)
- Per-project tag filters (medium complexity, requires new settings schema)
- Quick-pick "Select Project" command (explicitly deferred in PROJECT.md)

### Complexity Estimates

| Feature | Complexity | Files Touched | Risk |
|---------|------------|---------------|------|
| Per-project settings context | High | `settings.ts`, `common.ts`, `extension.ts`, + 18 consumer files | Highest risk — foundational refactor |
| Project node in tree | Medium | `fileParser.ts`, `testFile.ts` | Moderate — must handle single/multi project modes |
| All configs active | Medium | `common.ts` (discovery), `configScanner.ts`, `extension.ts` | Moderate — scanner already finds all configs |
| Per-project execution | Medium | `testRunHandler.ts`, `behaveRun.ts`, `behaveDebug.ts`, `runOrDebug.ts` | Moderate — CWD and path resolution per project |
| Backward compatibility | Medium | `fileParser.ts`, `extension.ts` | Moderate — must preserve exact 1.2.0 tree shape |
| Run All aggregation | Low-Medium | `testRunHandler.ts` | Low-moderate — extends existing workspace queue pattern |
| README docs | Low | `README.md` | Low |
| Config description on TestItems | Low | `fileParser.ts` | Low |
| Context menu command | Low | `package.json`, new handler file | Low |

---

## Sources

| Source | Type | Confidence | Relevance |
|--------|------|------------|-----------|
| [vscode-python Multi-Project Testing wiki](https://github.com/microsoft/vscode-python/wiki/Multi%E2%80%90Project-Testing-in-VS-Code) | Official documentation | HIGH | Primary pattern for project-per-config test tree structure |
| [vitest-dev/vscode monorepo architecture](https://deepwiki.com/vitest-dev/vscode/5.2-monorepo-and-workspace-configuration) | Community documentation | HIGH | Multi-config discovery, maximumConfigs pattern, worker-per-config architecture |
| [VS Code Testing API](https://code.visualstudio.com/api/extension-guides/testing) | Official documentation | HIGH | TestItem hierarchy, TestRunRequest.include, TestTag, context menus |
| [vscode-python issue #20345](https://github.com/microsoft/vscode-python/issues/20345) | Issue discussion | MEDIUM | Ambiguous test labels in monorepos — informs project node labeling |
| [vscode-jest issue #129](https://github.com/jest-community/vscode-jest/issues/129) | Issue discussion | MEDIUM | "Punt to multi-root" anti-pattern for monorepos |
| Existing codebase: `configScanner.ts`, `settings.ts`, `fileParser.ts`, `testRunHandler.ts` | Source code | HIGH | Current architecture constraints and extension points |
