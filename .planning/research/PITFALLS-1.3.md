# Pitfalls Research — 1.3.0 Multi-Project Support

**Domain:** VS Code extension multi-project test management — adding simultaneous multi-project support to existing single-project-per-workspace architecture
**Researched:** 2026-04-22
**Confidence:** HIGH — based on direct codebase analysis of all affected modules, VS Code Test Controller API docs, and established patterns from 1.0.0–1.2.0 milestones

## Critical Pitfalls

### Pitfall 1: WorkspaceSettings Assumes 1:1 Workspace → Project

**What goes wrong:** The entire extension routes through `config.workspaceSettings[wkspUri.path]` — a dictionary keyed by workspace folder URI path. Every consumer (`getWorkspaceSettingsForFile()`, `runTestQueue()`, `startWatchingWorkspace()`, `FileParser.parseFilesForWorkspace()`, every language handler) does a single lookup and gets back ONE `WorkspaceSettings` instance per workspace folder. Introducing multiple projects per workspace folder breaks this fundamental invariant. If you key the new project-level settings by workspace URI, the second project silently overwrites the first.

**Why it happens:** The 1:1 mapping is baked into the `Configuration` class (`_resourceSettings: { [wkspUriPath: string]: WorkspaceSettings }`), the `reloadSettings()` method, and every call site that does `config.workspaceSettings[wkspUri.path]`. The "obvious" fix of changing the key to include a project discriminator ripples into 30+ call sites across `extension.ts`, `testRunHandler.ts`, `workspaceWatcher.ts`, `configWatcher.ts`, and all language handlers.

**How to avoid:**
- Introduce a `ProjectSettings` type that wraps per-project config (`featuresUris`, `projectUri`, env vars, tags) while `WorkspaceSettings` becomes a container holding N `ProjectSettings`.
- Or: Keep `WorkspaceSettings` per workspace and add a `projects: ProjectSettings[]` array property.
- Critical: `getWorkspaceSettingsForFile(uri)` must become project-aware — given a file URI, return the *project* that owns it, not just the workspace. The existing `getFeaturesRootForFile()` already does per-root matching; extend this pattern to per-project resolution.
- Audit every `config.workspaceSettings[wkspUri.path]` call site. Categorize as: (a) needs per-project dispatch, (b) genuinely workspace-scoped (e.g., Python executable), (c) needs iteration over all projects.

**Warning signs:** Tests pass for single-project workspaces but fail for multi-project. Language services (hover, completion, go-to-step) return results from the wrong project. Step mappings from project A bleed into project B's diagnostics.

**Phase to address:** First phase of the milestone (data model). This is the foundation everything else builds on.

---

### Pitfall 2: Test Item ID Collision Across Projects

**What goes wrong:** Test item IDs are currently built from `uriId(uri)` (feature file URI `.toString()`). The path-group nodes use `uriId(root)` as their ID. The workspace grandparent node uses `wkspSettings.id` (also `uriId(wkspUri)`). With multi-project, a new "project" node is inserted between workspace and path-group. If two projects reference the same feature file, or have identically-named features in different roots, their test items collide. VS Code's `TestItemCollection` silently replaces items with duplicate IDs.

**Why it happens:** `controller.createTestItem(id, ...)` requires globally unique IDs within the controller. The current scheme uses URI-based IDs which are unique within one project but may collide across projects in the same workspace. Additionally, `getAllTestItems(wkspId, ...)` uses `item.id.includes(wkspId)` — a substring match on the workspace URI — which cannot distinguish between projects in the same workspace folder.

**How to avoid:**
- Include a project identifier in every test item ID: `projectId + "/" + uriId(uri)` or similar compound key.
- The project-level grouping node needs a stable ID derived from the config file URI or project root URI, not the workspace URI.
- Update `getAllTestItems()` to accept a project filter, not just a workspace filter.
- Tighten `wkspQueue` filtering in `runTestQueue()` — it currently does `item.test.id.includes(m)` where `m = uriId(featuresUri)`. With multiple projects this is ambiguous.

**Warning signs:** "Run All" runs some tests twice or skips some. Test results get attributed to the wrong test item. Clicking a test in the explorer navigates to a file in the wrong project.

**Phase to address:** Test tree construction phase, but the ID scheme must be decided during the data model phase.

---

### Pitfall 3: Step Mapping Flat Array Doesn't Scope by Project

**What goes wrong:** `stepMappings` is a module-level flat array in `stepMappings.ts`, filtered by `featuresUri`. Each project has its own step definitions (different `steps/` directories, potentially different Python environments). If project A defines `@given("I login")` and project B also defines `@given("I login")` with a different implementation, the flat array contains both. `getStepFileStepForFeatureFileStep()` uses `.find()` semantics — it returns whichever was stored first. Go-to-definition navigates to the wrong file. Diagnostics report false "duplicate step" errors across project boundaries.

**Why it happens:** `rebuildStepMappings(featuresUri)` and `deleteStepMappings(featuresUri)` filter on a single `featuresUri`. Lookup functions like `getStepFileStepForFeatureFileStep(featureFileUri, lineNo)` don't scope by project — they search the entire flat array by URI match.

**How to avoid:**
- Partition step mappings by project (e.g., `Map<string, StepMapping[]>` keyed by project ID).
- OR: Ensure the `featuresUri` on `StepMapping` always refers to the project's primary root and filter on it in all lookups.
- `getStepFileStepForFeatureFileStep()` must accept or derive the project context from the feature file URI before searching.
- `rebuildStepMappings()` for project A must never delete or interfere with project B's mappings.

**Warning signs:** Go-to-definition from a feature in project A jumps to a step file in project B. "Missing step definition" diagnostics disappear when a different project defines the same step pattern.

**Phase to address:** Step mapping / parser phase. Must be resolved before language services can work correctly.

---

### Pitfall 4: behave Subprocess Invocation Scoped to Wrong Project

**What goes wrong:** `runOrDebug*.ts` functions invoke `python -m behave` with `cwd` set to `wkspSettings.projectUri.fsPath`. `WkspRun` takes a single `WorkspaceSettings` and uses it for the entire run. `runWorkspaceQueue()` iterates `getUrisOfWkspFoldersWithFeatures()` — one settings object per workspace. With multi-project, each project may need a different `cwd`, Python interpreter, env vars, and behave configuration. Running behave from the wrong directory causes 0-feature discovery or wrong step imports.

**Why it happens:** The run orchestration (`runTestQueue()` → `runWorkspaceQueue()`) was built for one project per workspace. It builds `wkspQueue` by matching test item IDs against `featuresUris`, but the entire queue runs under one `WkspRun` with one set of settings.

**How to avoid:**
- Partition the run queue by project, not just by workspace. Each project gets its own `WkspRun` (or a new `ProjectRun` subclass).
- Each project invocation uses its own `projectUri` as `cwd`, its own Python executable path, and its own env vars.
- `checkRunGuard()` must check config errors per-project, not per-workspace.
- `allTestsForThisWkspAreIncluded()` must become project-aware.

**Warning signs:** behave exits with "No steps directory" because cwd points to the wrong project root. Env vars from project A leak into project B's test run. Debug session attaches to the wrong process.

**Phase to address:** Test execution phase. Blocked on data model (Pitfall 1) being resolved first.

---

### Pitfall 5: Discovery Cache Performance Regression

**What goes wrong:** `getUrisOfWkspFoldersWithFeatures()` has a hard < 1ms performance constraint and is called from hot paths (every file change, every test tree query). The current `discoveryCache` is keyed by workspace folder URI. Adding per-project expansion inside this function — scanning multiple configs, validating paths, rebuilding project lists — blows the 1ms budget. Even changing the return type from `vscode.Uri[]` to include project info breaks all 18+ consumers.

**Why it happens:** The function's cache-read path must be synchronous and near-instantaneous. The BFS scanner already runs async and caches results, but multi-project support means the discovery cache must store N entries per workspace while the hot-path function remains unchanged.

**How to avoid:**
- Keep `getUrisOfWkspFoldersWithFeatures()` returning workspace URIs only (backward-compatible hot path).
- Add a new `getProjectsForWorkspace(wkspUri): ProjectEntry[]` function that reads from a pre-populated cache.
- All heavy work (scanning, parsing configs, validating paths) happens in the async discovery phase, writing results to cache. The sync path only reads.
- Extend `DiscoveryEntry` to hold multiple project entries, or add a parallel `ProjectDiscoveryCache`.
- Add a perf regression test that asserts < 1ms for the hot path with 5 projects in a workspace.

**Warning signs:** Extension activation takes > 2 seconds for monorepo workspaces. Test Explorer sluggish during typing. `diagLog` shows `getUrisOfWkspFoldersWithFeatures` exceeding 1ms.

**Phase to address:** Discovery / data model phase. Establish perf test from day one.

---

### Pitfall 6: FileSystemWatcher Explosion

**What goes wrong:** The extension creates watchers per `featuresUri` per workspace, plus config watchers per workspace, plus the two-tier config watcher strategy from 1.2.0. With N projects × M features paths per project, watcher count multiplies. VS Code relays to OS-level watchers; Linux's default `fs.inotify.max_user_watches` (often 8192) can be exceeded. Excessive watchers cause silent failures where file change events are dropped.

**Why it happens:** `startWatchingWorkspace()` creates one watcher per features root plus optional sibling-steps watchers. `startWatchingConfigFiles()` adds config watchers per workspace. Multi-project multiplies both. The recursive fallback watcher from 1.2.0's two-tier strategy may partially mitigate this.

**How to avoid:**
- Use workspace-wide glob watchers (e.g., `**/*.feature`, `**/*.py`) and filter by project membership in event handlers, rather than one narrow watcher per features path.
- Share the recursive fallback watcher across all projects in a workspace folder.
- Track watcher count; log a warning if it exceeds a per-workspace threshold (e.g., 50).
- Dispose old project watchers before creating new ones on discovery changes.

**Warning signs:** File changes in one project's features directory aren't detected. Linux users report "ENOSPC: System limit for number of file watchers reached." Stale test tree after file saves.

**Phase to address:** Watcher phase. Can be deferred if initial target is 2-3 projects per workspace.

---

### Pitfall 7: No Integration Test Fixture for Multi-Project

**What goes wrong:** The 17 existing integration suites test single-project-per-workspace scenarios (multi-workspace is tested via `project A`/`project B`, but that's different from multi-project-in-one-workspace). Without a multi-project integration fixture, the most dangerous bugs — watcher cross-talk, test run scoping, result attribution, tree structure — only surface in manual testing.

**Why it happens:** Creating a multi-project fixture requires: a workspace folder with 2+ behave configs in subdirectories, each with its own features/steps, and a test suite that asserts both projects appear in the tree and run independently. This is non-trivial and easy to defer.

**How to avoid:**
- Create the multi-project test fixture early (ideally before implementation) as a failing test that defines expected behavior.
- The fixture should include: (a) two projects with different step definitions for the same step text (catches cross-project step bleed), (b) overlapping feature file names (catches ID collisions), (c) different env var configurations (catches setting leakage).
- Use the existing `waitForTestTree` polling pattern for deterministic assertions.
- Test "Run All" (all projects), per-project runs, and single-scenario runs across projects.

**Warning signs:** All unit tests pass but manual testing reveals broken behavior. Integration test creation is the "last phase" and gets cut.

**Phase to address:** First or second phase. Define expected behavior as failing tests, then implementation makes them pass.

---

### Pitfall 8: Language Service Provider Ambiguity for Shared Step Files

**What goes wrong:** Language handlers (HoverProvider, DefinitionProvider, AutoCompleteProvider, StepCodeLensProvider, FindStepReferences) use `getWorkspaceSettingsForFile(document.uri)` to get context, then query step mappings. A Python step file might be shared between projects (common library `steps/` directory). When the user hovers over a step decorator in that shared file, which project's context resolves? If the handler picks the wrong project, CodeLens counts are incorrect, references are incomplete, and navigation targets are wrong.

**Why it happens:** `getWorkspaceSettingsForFile()` returns at most one `WorkspaceSettings`. There's no concept of "this file belongs to multiple projects." The step file may have been discovered by `loadFromBehave()` for multiple projects independently.

**How to avoid:**
- For **feature files**: unambiguous — each feature file belongs to exactly one project (the one whose `featuresUris` contains it). Use `getFeaturesRootForFile()` to resolve project.
- For **step files**: they may belong to multiple projects. CodeLens and references should aggregate across all projects that use the step. Go-to-definition from a feature file uses that feature's project context.
- Simplest approach: all language handlers that start from a feature file have clear project context. Handlers that start from a step file aggregate or pick the "primary" project.
- Document the resolution strategy and enforce it consistently across all 10+ handlers.

**Warning signs:** CodeLens shows "2 references" when there are 5 across two projects. Hover on a shared step shows info from only one project.

**Phase to address:** Language services phase. Depends on step mapping scoping (Pitfall 3) being resolved first.

---

### Pitfall 9: Configuration Reload Race During Multi-Config Discovery

**What goes wrong:** `configurationChangedHandler()` calls `getUrisOfWkspFoldersWithFeatures(true)` → rebuilds discovery cache → rebuilds watchers → re-parses all files. With multi-project, N config files per workspace each have their own watcher. If two config files change simultaneously (e.g., `git checkout`), two debounced events fire close together. The second event may see a partially-updated cache from the first rebuild. Result: intermittent state where some projects are loaded and others aren't.

**Why it happens:** The current flow is safe for single-project because there's only one config file per workspace. Multi-project means N config files, each with their own watcher. The 500ms debounce key is per-config-file, not per-workspace. `clearTestItemsAndParseFilesForAllWorkspaces()` uses per-workspace cancellation, not per-project.

**How to avoid:**
- Coalesce all config-change events within a workspace into a single rebuild. Debounce key must be the workspace URI, not the config file URI.
- Add a "discovery generation" counter. If a rebuild starts and a new change arrives, cancel the in-flight rebuild and restart with the full current state.
- Test with rapid successive config saves (extend the watcher integration test pattern from 1.1.0).

**Warning signs:** Flaky integration tests where sometimes both projects appear and sometimes only one. Test tree "flickers" when saving config files.

**Phase to address:** Config watcher / discovery phase.

---

### Pitfall 10: Backward Compatibility Break for Single-Project Users

**What goes wrong:** Existing users expect: one workspace → one set of features → one test tree root (or workspace grandparent → features). If multi-project changes alter test item IDs, tree depth, or setting semantics, single-project users see unexpected changes: tests disappear from VS Code's test result history, saved filter patterns break, or settings stop working.

**Why it happens:** Subtle changes compound. A new "project" node always present in the tree changes the depth of all items. Changed test item IDs invalidate VS Code's internal test result cache (it's keyed by test item ID). New settings that shadow existing ones create confusion.

**How to avoid:**
- When a workspace has exactly one discovered project, the test tree must look **identical** to pre-multi-project behavior. The project node should only appear when there are 2+ projects.
- Test item IDs for single-project workspaces must remain byte-for-byte unchanged.
- Run the full 614 unit test + 17 integration suite regression suite after every structural change.
- Add an explicit backward-compat integration test asserting existing example projects produce identical trees.

**Warning signs:** Existing integration tests fail after tree restructuring. Users report "all my tests disappeared" after updating the extension.

**Phase to address:** Gate for every phase. Establish the backward-compat assertion in the first phase.

---

## Moderate Pitfalls

### Pitfall 11: JUnit Output Directory Collision Between Projects

**What goes wrong:** Test results go to JUnit XML in a temp directory. `JunitWatcher` monitors this and attributes results to test items. With multi-project, if two projects run simultaneously (parallel mode or "Run All"), their JUnit output may overwrite each other if the directory structure doesn't include a project discriminator.

**How to avoid:** Include project ID in the JUnit run directory: `<tempDir>/<runId>/<projectId>/`. Update `getWkspQueueJunitFileMap()` to partition by project. The existing per-run isolation (`junitRunDirUri`) provides the pattern to extend.

**Phase to address:** Test execution phase.

---

### Pitfall 12: `loadFromBehave()` Subprocess Count Multiplied N-fold

**What goes wrong:** Step discovery spawns `python -m discover.py` per workspace. With N projects per workspace, this becomes N subprocess invocations during initial parse. Each takes 1-3 seconds. A workspace with 5 projects → 5-15 seconds of blocked step navigation on activation.

**How to avoid:** Run project step discoveries in parallel via `Promise.all`, not sequentially. Show progress indicator. Consider lazy step loading (load on first navigation). The `stepsParseComplete()` wait mechanism must handle per-project readiness.

**Phase to address:** Parser / performance phase.

---

### Pitfall 13: `parseFilesForWorkspace` Atomicity — Full-Workspace Wipe

**What goes wrong:** `FileParser._parseFeatureFiles()` deletes all test items for the workspace, then re-creates them. With multi-project, if reparsing one project fails (broken config), all projects in that workspace lose their test items temporarily. The user sees a flash of empty tree.

**How to avoid:** Reparse per-project, not per-workspace. Only delete + rebuild the specific project that changed. Cancel token should be per-project.

**Phase to address:** Parser restructuring phase.

---

### Pitfall 14: Diagnostic Collection Cross-Project Contamination

**What goes wrong:** `config.diagnostics` is a single `DiagnosticCollection`. Diagnostics for step validation, fixture tags, and config errors are set per-URI. Clearing diagnostics for project A on reparse may inadvertently clear diagnostics that project B contributed for shared files.

**How to avoid:** Either use separate diagnostic collections per project (cleaner) or tag diagnostics with project source and filter when clearing. The `diagnostic.code` field can carry a project prefix.

**Phase to address:** Diagnostics phase, after step mapping scoping.

---

## Minor Pitfalls

### Pitfall 15: Output Channel Log Interleaving

**What goes wrong:** One output channel per workspace. Multi-project log messages from different projects interleave, making debugging difficult.

**How to avoid:** Prefix log lines with project name: `[project-a] Discovery source: config-file`. Per-project channels are overkill unless user feedback demands it.

**Phase to address:** Any phase — minimal effort.

---

### Pitfall 16: `suppressMultiConfigNotification` UX Becomes Confusing

**What goes wrong:** The 1.2.0 "multiple configs found" notification tells users to set `projectPath` to choose one project. With multi-project support, all configs are intentionally active. The notification contradicts the new behavior.

**How to avoid:** Replace the "first-match-wins + notification" UX with "all configs active" UX. Remove or reword the `alsoFoundConfigs` notification path. `suppressMultiConfigNotification` setting may become unnecessary.

**Phase to address:** UX / discovery phase.

---

### Pitfall 17: `projectPath` Setting Semantics Under Multi-Project

**What goes wrong:** `projectPath` is a single string setting designed for "I have one project, here's where it lives." With multi-project auto-discovery, users may expect `projectPaths` (plural) or be confused about how `projectPath` interacts with discovered projects. Adding `projectPaths[]` creates duplication with auto-discovery.

**How to avoid:** Auto-discovery is the primary mechanism for multi-project. `projectPath` remains as "force single project" override (backward-compat, Branch A in `hasFeaturesFolder()`). Don't add `projectPaths[]` — it duplicates what the scanner does. Document clearly in setting descriptions.

**Phase to address:** Settings / configuration phase.

---

## Technical Debt Patterns to Avoid

| Shortcut | Why It's Tempting | What Breaks | Better Approach |
|----------|-------------------|-------------|-----------------|
| Key project settings by `wkspUri.path` | Matches existing `config.workspaceSettings` pattern | Second project in same workspace clobbers first | Use `configFileUri` or `projectUri` as project discriminator |
| Duplicate full `WorkspaceSettings` per project | Quick way to give each project its own settings | `getWorkspaceSettingsForFile()` can't choose between duplicates; settings reload creates N objects with shared workspace-level fields | Single `WorkspaceSettings` with `projects[]` array |
| Skip backward-compat gate tests | "We'll test at the end" | Regressions compound across phases and become unfixable | Regression suite runs after every phase |
| Global step mapping array with project tag field | Avoids restructuring `stepMappings.ts` | Every lookup must filter by project; easy to forget in 1 of 10+ handlers | Per-project `Map` from the start |
| Share `WkspRun` across projects in same workspace | Avoids new run class | behave cwd, Python, and env vars wrong for all but one project | Per-project run instance |
| Use `item.id.includes(wkspId)` for project filtering | Existing pattern, seems to work | Matches items from wrong project since IDs share workspace URI prefix | Explicit project-scoped filter function |
| Expand `getUrisOfWkspFoldersWithFeatures()` inline | It's the "main" discovery function | Breaks < 1ms constraint; changes return type; 18+ consumers affected | New parallel `getProjectsForWorkspace()` function |
| Always show project node in tree | Simpler tree construction code | Breaks single-project users' tree structure and test result history | Conditional: project node only when 2+ projects |

## Phase-Specific Warning Summary

| Phase Topic | Primary Pitfalls | Severity | Key Mitigation |
|-------------|-----------------|----------|----------------|
| Data model / settings | #1 (1:1 mapping), #5 (perf cache), #10 (backward-compat) | Critical | Define project identity type; benchmark cache; backward-compat gate |
| Test tree construction | #2 (ID collision), #10 (backward-compat) | Critical | Compound IDs with project prefix; conditional project node |
| Step mappings / parser | #3 (flat array bleed), #12 (N subprocesses), #13 (wipe atomicity) | Critical | Per-project step map partitioning; parallel discovery |
| Test execution | #4 (wrong cwd/Python), #11 (JUnit collision) | Critical | Per-project run instance; JUnit path discrimination |
| Config watching / discovery | #6 (watcher explosion), #9 (reload race) | Moderate | Workspace-wide watcher; coalesce debounce per workspace |
| Language services | #8 (shared step ambiguity), #14 (diagnostic contamination) | Moderate | Feature-file context wins; aggregate for step files |
| UX / settings | #16 (notification), #17 (settings semantics) | Minor | Replace notification; document `projectPath` as single-project override |
| Integration testing | #7 (no multi-project fixture) | Critical | Create fixture in first or second phase |

## Sources

- Direct analysis of source modules: `src/common.ts` (discovery cache, URI helpers), `src/settings.ts` (`WorkspaceSettings`), `src/configuration.ts` (`Configuration` singleton), `src/extension.ts` (`activate()`, `updateDiscoveryUX()`), `src/parsers/fileParser.ts` (test tree construction), `src/parsers/stepMappings.ts` (flat array), `src/runners/testRunHandler.ts` (`WkspRun`, queue orchestration), `src/runners/runOrDebug.ts` (behave invocation), `src/watchers/workspaceWatcher.ts` (watcher creation), `src/handlers/hoverProvider.ts` (language service pattern), `src/parsers/testFile.ts` (tree item creation) — all HIGH confidence
- VS Code Testing API: https://code.visualstudio.com/api/extension-guides/testing — HIGH confidence
- PROJECT.md 1.0.0–1.2.0 architecture decisions — HIGH confidence
- AI_INSTRUCTIONS.md URI handling and error conventions — HIGH confidence
