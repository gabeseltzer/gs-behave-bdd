# Project Research Summary

**Project:** gs-behave-bdd v1.3.0 Multi-Project Support
**Domain:** VS Code extension multi-project test management
**Researched:** 2026-04-22
**Confidence:** HIGH

## Executive Summary

Multi-project support is a pure architectural refactoring — no new external libraries are needed. The VS Code Test Controller API already supports arbitrary `TestItem` nesting, and the extension's config scanner (`alsoFoundConfigs`) already discovers all behave configs in the workspace but discards extras in favor of first-match-wins. The v1.3.0 milestone promotes all discovered configs into active projects, evolving the data model from 1:1 workspace→project to 1:N workspace→projects. This pattern is validated by vscode-python's `ProjectAdapter` (Feb 2026), which uses identical mechanics: per-project root TestItems, project-scoped IDs, and independent discovery/execution per project.

The core challenge is that two central data structures — `discoveryCache` (keyed by workspace URI) and `WorkspaceSettings` (1:1 per workspace folder) — are consumed by 20+ files across parsers, runners, handlers, and watchers. Every consumer that reads `wkspSettings.projectUri` or `wkspSettings.featuresUris` must learn which project it's operating on. The recommended approach is incremental: introduce a `ProjectSettings` class nested under `WorkspaceSettings.projects[]`, add a thin `getProjectSettingsForFile()` adapter, and keep backward-compatible singular getters so existing code keeps working during migration. The step/feature data maps are already keyed by `featuresUri`, so they naturally namespace by project without structural changes.

The riskiest work is the settings split (Phase 3 in the suggested build order), because the `WorkspaceSettings` constructor is the most complex single function in the codebase (~300 lines). Backward compatibility is the paramount constraint: single-project workspaces must produce byte-for-byte identical test item IDs and tree structure. The project node only appears when 2+ projects exist. With careful phase ordering (data model → discovery → settings → parsing → tree → execution → watchers → language services → UX), each phase builds on a stable foundation and can be independently verified.

## Key Findings

### Recommended Stack

**No new libraries needed.** The entire feature is an internal architectural refactoring:

| Technology | Status | Role in Multi-Project |
|------------|--------|----------------------|
| TypeScript 4.5.5 | No change | Extension source |
| VS Code Extension API ^1.82.0 | No change | `TestItem` nesting is the mechanism for project nodes |
| smol-toml (already bundled) | No change | TOML config parsing |
| Mocha/Sinon | No change | Unit + integration testing |

**Key API reuse:** `TestController.createTestItem()` creates project nodes. `TestRunRequest.include` resolves project membership. `FileSystemWatcher` already watches recursively. No new activation events needed.

**What NOT to add:** No DI frameworks (singleton `config`/`parser` pattern is sufficient at this scale), no new config file formats (projects derive from behave's own configs), no per-project `TestController` (VS Code supports exactly one per extension), no EventEmitter-based project registry (over-engineering), no persistence layer (discovery cache is fast enough).

### Expected Features

**Must-have (table stakes — 10 features):**

1. All discovered configs active simultaneously (no more first-match-wins)
2. Project node in Test Explorer tree with workspace-relative label
3. Per-project settings context (`projectUri`, `featuresUris`, `configFileUri` per project)
4. Per-project behave execution CWD
5. Run All at workspace level runs every project
6. Individual project runnable from tree
7. Backward compatibility: single-project workspaces show no project node
8. Manual `projectPath` override still wins (single-project mode)
9. Discovery log shows all active projects
10. Incremental README documentation

**Should-have (differentiators, low effort):**

11. Config-file description on project TestItems (e.g., "behave.ini")
12. "Open Config File" context menu on project nodes
13. `maximumProjects` advisory limit with notification

**Defer to later:**

- Per-project env var overrides (medium complexity, requires new settings schema)
- Per-project tag filters (medium complexity)
- Quick-pick "Select Project" command (explicitly deferred in PROJECT.md)
- Per-project Python interpreter (massive complexity, niche use case)
- Cross-project step definition navigation (behave doesn't support this)
- Separate output channels per project (clutter — use `[project-label]` prefix instead)

### Architecture Approach

**Core concept: Project identity layer.** Introduce `ProjectEntry` (discovery) and `ProjectSettings` (runtime) between workspace and features/steps data. All modules key on `(wkspUri, projectId)` instead of just `wkspUri`.

**Data model changes:**
- `discoveryCache: Map<string, DiscoveryEntry>` → `Map<string, DiscoveryResult>` where `DiscoveryResult.projects: ProjectEntry[]`
- `WorkspaceSettings` gains `projects: ProjectSettings[]` with per-project `featuresUris`, `stepsSearchUris`, `projectUri`
- Back-compat singular getters delegate to `this.projects[0]`

**Test tree:** `Workspace > Project > PathGroup > Feature > Scenario` — project node only when `projects.length > 1`.

**Test execution:** `WkspRun` becomes per-project (one behave invocation per project, each with its own CWD and env vars).

**Thin adapter pattern (recommended):** `getProjectSettingsForFile(uri)` resolves which project owns a file. Consumers migrate incrementally. No Big-Bang refactor.

**Files that need NO changes** (already keyed by `featuresUri`): `stepsParser.ts`, `featureParser.ts`, `fixtureParser.ts`, `configParser.ts`, `behaveRun.ts`, `behaveDebug.ts`, `junitParser.ts`, `gherkinPatterns.ts`.

### Critical Pitfalls

| # | Pitfall | Severity | Phase | Key Mitigation |
|---|---------|----------|-------|----------------|
| 1 | **WorkspaceSettings 1:1 invariant** — entire extension routes through `config.workspaceSettings[wkspUri.path]` as a single lookup; second project silently overwrites first | Critical | Data model (Phase 1-3) | Nest `projects[]` under `WorkspaceSettings`; add `getProjectSettingsForFile()` adapter; audit all 30+ call sites |
| 2 | **Test item ID collision** — URI-based IDs collide across projects (same feature file name, same step decorator). `TestItemCollection` silently replaces duplicates | Critical | Tree (Phase 5) | Compound IDs: `projectId + "/" + uriId(uri)`; decide scheme during data model phase |
| 3 | **Step mapping bleed** — flat `stepMappings[]` array searched without project scope; go-to-definition navigates to wrong project's step file | Critical | Parser (Phase 4) | Partition by project or ensure `featuresUri` filtering is strict in all 10+ lookup paths |
| 4 | **Wrong behave CWD** — `WkspRun` carries single `WorkspaceSettings`; running behave from wrong directory = 0 features found | Critical | Execution (Phase 6) | Per-project `ProjectRun` with its own `projectUri` as CWD |
| 5 | **Discovery cache perf regression** — `getUrisOfWkspFoldersWithFeatures()` has < 1ms hard constraint; expanding it inline blows the budget | Critical | Discovery (Phase 2) | Keep hot path returning workspace URIs only; add separate `getProjectsForWorkspace()` that reads pre-populated cache |

**Additional moderate risks:** FileSystemWatcher explosion on Linux (use workspace-wide globs), config reload race conditions (coalesce debounce per workspace), no integration test fixture for multi-project (create early as failing tests), shared step file ambiguity in language services (feature-file context wins).

## Implications for Roadmap

### Suggested Phase Structure

The research strongly suggests a bottom-up build order: data model → discovery → settings → parsing → tree → execution → watchers → language services → UX. Each phase builds on a stable foundation.

| Phase | Name | Delivers | Key Features | Pitfalls to Avoid | Research Flag |
|-------|------|----------|-------------|-------------------|---------------|
| 1 | **Data Model & Types** | `ProjectEntry`, `DiscoveryResult`, `ProjectSettings` interfaces/classes; backward-compat getters on `WorkspaceSettings` | F3 (per-project settings context) | #1 (1:1 mapping), #10 (backward-compat) | Standard pattern — no research needed |
| 2 | **Discovery Promotion** | Config scanner returns all matches as active projects; discovery cache populated with `DiscoveryResult.projects[]`; `getProjectsForWorkspace()` helper | F1 (all configs active), F8 (projectPath override wins) | #5 (perf regression), #9 (reload race) | Standard pattern |
| 3 | **Settings Split** | `WorkspaceSettings` constructor builds `ProjectSettings[]`; `getProjectSettingsForFile()` adapter; per-project overrides setting in `package.json` | F3 (per-project context) | #1 (1:1 invariant), #10 (backward-compat) | **Needs careful planning** — ~300-line constructor |
| 4 | **Parser & Step Mappings** | `FileParser` iterates projects within workspace; per-project step parsing; step mapping scoping | — (infra) | #3 (step bleed), #12 (N subprocesses), #13 (wipe atomicity) | Standard pattern |
| 5 | **Test Tree** | Project node in Test Explorer; compound IDs; conditional visibility (only when 2+ projects) | F2 (project node), F7 (backward-compat tree) | #2 (ID collision), #10 (backward-compat) | Standard pattern |
| 6 | **Test Execution** | Per-project `ProjectRun`; run queue partitioned by project; JUnit directory discrimination; Run All aggregation | F4 (per-project CWD), F5 (Run All), F6 (individual project run) | #4 (wrong CWD), #11 (JUnit collision) | Standard pattern |
| 7 | **Watchers & Config** | Per-project watcher sets; coalesced config change debouncing; notification UX update | F9 (discovery log) | #6 (watcher explosion), #9 (race), #16 (notification UX) | Standard pattern |
| 8 | **Language Services** | Handlers use `getProjectSettingsForFile()`; feature-file context wins; step-file aggregation | — (infra) | #8 (shared step ambiguity), #14 (diagnostic contamination) | Standard pattern |
| 9 | **Integration Tests & UX** | Multi-project integration fixture; "Open Config File" command; config description on TestItems; README docs | F10 (docs), F11-F12 (differentiators) | #7 (no test fixture) | Standard pattern |

### Rationale for Ordering

- **Phases 1-3 are the critical path.** Everything downstream reads `ProjectSettings`. Phase 3 (settings split) is the highest-risk single phase due to the 300-line constructor and 20+ consumer files.
- **Phase 4 (parser) before Phase 5 (tree)** because the tree builder runs during parsing.
- **Phase 6 (execution) can parallel with Phase 5** since they share the data model but are otherwise independent.
- **Phase 7 (watchers) after parsing/tree** because watchers trigger re-parsing.
- **Phase 8 (language services)** is the largest file count (~20 handler files) but lowest risk per file.
- **Phase 9 (tests/UX/docs)** is the polish phase. Integration test fixtures should ideally be created in Phase 1-2 as failing tests, then pass as implementation lands.

### Research Flags

- **Needs careful planning:** Phase 3 (Settings Split) — the `WorkspaceSettings` constructor is the most complex function in the codebase. Recommend `/gsd-research-phase` or detailed sub-step planning.
- **Standard patterns (skip research):** All other phases — the patterns are well-documented in vscode-python prior art and the architecture research.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | No new libraries; confirmed all capabilities exist in current stack via API docs and codebase analysis |
| Features | HIGH | Mapped against vscode-python, vitest-dev/vscode, vscode-jest, and VS Code Testing API docs |
| Architecture | HIGH | Based on direct codebase analysis of all affected modules; data flow traced end-to-end |
| Pitfalls | HIGH | 17 pitfalls identified from codebase analysis + prior milestone learnings; all have concrete mitigations |

### Gaps to Address

1. **Per-project env var overrides UX** — deferred from v1.3.0 MVP but the `projectOverrides` settings schema should be designed now to avoid a breaking change later
2. **Integration test fixture design** — the specific directory structure and assertion patterns for the multi-project fixture need to be defined early (Phase 1-2)
3. **Phase 3 constructor refactoring** — the ~300-line `WorkspaceSettings` constructor needs a detailed sub-step plan before execution

## Sources

| Source | Type | Confidence |
|--------|------|------------|
| [vscode-python Multi-Project Testing wiki](https://github.com/microsoft/vscode-python/wiki/Multi%E2%80%90Project-Testing-in-VS-Code) | Official docs | HIGH |
| [vitest-dev/vscode monorepo architecture](https://deepwiki.com/vitest-dev/vscode/5.2-monorepo-and-workspace-configuration) | Community docs | HIGH |
| [VS Code Testing API](https://code.visualstudio.com/api/extension-guides/testing) | Official docs | HIGH |
| [vscode-jest issue #129](https://github.com/jest-community/vscode-jest/issues/129) | Issue discussion | MEDIUM |
| Direct codebase analysis: `configScanner.ts`, `settings.ts`, `fileParser.ts`, `testRunHandler.ts`, `common.ts`, `configuration.ts`, `extension.ts`, all `handlers/*.ts` | Source code | HIGH |
| PROJECT.md 1.0.0–1.2.0 architecture decisions | Project docs | HIGH |
