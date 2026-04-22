# Architecture Research: v1.3.0 Multi-Project Support

**Domain:** VS Code extension multi-project test management
**Researched:** 2026-04-22
**Confidence:** HIGH

## Executive Summary

Multi-project support requires evolving a **1:1 workspace→project** model into a **1:N workspace→projects** model. The current architecture already handles multi-path features within a single project and multi-root workspaces — multi-project is the natural next dimension. The core change is introducing a **project identity layer** between the workspace folder and the features/steps data, so that discovery, settings, parsing, test tree, and test execution all key on `(wkspUri, projectId)` instead of just `wkspUri`.

The good news: the existing data flow is modular enough that most modules need adapter changes rather than rewrites. The hard part is the discovery cache (currently `Map<string, DiscoveryEntry>`) and `WorkspaceSettings` (currently 1:1 with workspace folders), which are the two central data structures everything reads from.

## Current Architecture (Relevant Subset)

```
┌─────────────────────────────────────────────────────────────────┐
│                     VS Code Extension Host                       │
│                                                                  │
│  ┌──────────┐   ┌─────────────────┐   ┌────────────────────┐   │
│  │ activate()│──►│ discoveryCache  │──►│ WorkspaceSettings  │   │
│  │           │   │ Map<wkspId,     │   │ { [wkspUri.path]:  │   │
│  │           │   │   DiscoveryEntry>│   │    WorkspaceSettings}│  │
│  └──────────┘   └────────┬────────┘   └────────┬───────────┘   │
│                          │                      │                │
│       ┌──────────────────┼──────────────────────┤                │
│       ▼                  ▼                      ▼                │
│  ┌─────────┐    ┌──────────────┐    ┌───────────────────┐       │
│  │FileParser│    │  Test Tree   │    │  Test Execution   │       │
│  │(singleton)│   │  Wksp ─►    │    │  WkspRun(         │       │
│  │          │   │  PathGroup──►│    │   wkspSettings,   │       │
│  │          │   │    Feature──►│    │   queue, ...)     │       │
│  │          │   │     Scenario │    │                   │       │
│  └──────────┘   └──────────────┘    └───────────────────┘       │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────┐        │
│  │ In-Memory Step/Feature Maps (keyed by featuresUri)  │        │
│  │  featureFileSteps: Map<featuresUri+sepr+..., Step>  │        │
│  │  stepFileSteps:    Map<featuresUri+sepr+..., Step>  │        │
│  │  stepMappings:     StepMapping[] (flat, by featUri)  │        │
│  └─────────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

### Current Key Invariants

| Invariant | Location | Implication for Multi-Project |
|-----------|----------|-------------------------------|
| `discoveryCache` keyed by `uriId(wkspFolder.uri)` | `common.ts` | Must become 1:N — one workspace can have multiple discovery entries |
| `config.workspaceSettings[wkspUri.path]` is 1:1 | `configuration.ts` | Must become 1:N — one workspace can have multiple project settings |
| `WorkspaceSettings` owns `featuresUris[]`, `stepsSearchUris[]` | `settings.ts` | Per-project; each project has its own set |
| `FileParser.parseFilesForWorkspace(wkspUri, ...)` iterates `wkspSettings.featuresUris` | `fileParser.ts` | Must iterate per-project, not per-workspace |
| Step data maps keyed by `uriId(featuresUri) + sepr + ...` | `stepsParser.ts`, `featureParser.ts` | Already namespace-isolated by featuresUri — works for multi-project as-is |
| `WkspRun` carries a single `WorkspaceSettings` | `testRunHandler.ts` | One `WkspRun` per project (not per workspace) |
| Test tree: Workspace → PathGroup → Feature → Scenario | `fileParser.ts` | Add Project node: Workspace → Project → PathGroup → Feature → Scenario |
| Config scanner returns `ScanResult.primary` (first match) | `configScanner.ts` | Must return ALL matches, all active simultaneously |

## Recommended Architecture: Multi-Project

### New Concept: ProjectEntry

A **project** is defined by a single behave config file (or an explicit settings override) within a workspace folder. Each project has:

- A unique identity: `(wkspUri, configDirUri)` — or `(wkspUri, "settings")` for explicit settings
- Its own `projectUri` (the directory containing the config)
- Its own `featuresUris[]` and `stepsSearchUris[]`
- Its own position in the test tree (a TestItem node under the workspace node)

```
┌──────────────────────────────────────────────────────────────────────┐
│                  Multi-Project Architecture                           │
│                                                                       │
│  ┌──────────┐   ┌─────────────────────┐   ┌──────────────────────┐  │
│  │ activate()│──►│ discoveryCache      │──►│ ProjectSettings[]    │  │
│  │           │   │ Map<wkspId,         │   │ (per project)        │  │
│  │           │   │   DiscoveryResult>  │   │                      │  │
│  │           │   │   .projects[]       │   │ projectUri           │  │
│  │           │   │     .configFileUri  │   │ featuresUris[]       │  │
│  │           │   │     .featuresUris[] │   │ stepsSearchUris[]    │  │
│  │           │   │     .projectUri     │   │ envVarOverrides      │  │
│  └──────────┘   └─────────────────────┘   └──────────────────────┘  │
│                                                                       │
│  Test Tree (TestController.items):                                    │
│                                                                       │
│   Multi-root:    Workspace ──► Project ──► PathGroup ──► Feature     │
│   Single-root:                 Project ──► PathGroup ──► Feature     │
│   Single-project (1 config):  (no project node) ──► Feature         │
│                                                                       │
│  Test Execution:                                                      │
│                                                                       │
│   runTestQueue iterates workspaces × projects                        │
│   WkspRun renamed/extended → ProjectRun(projectSettings, queue, ..) │
│   Each ProjectRun runs behave in projectSettings.projectUri          │
│                                                                       │
│  Parsing:                                                             │
│                                                                       │
│   FileParser.parseFilesForProject(projectSettings, testData, ctrl)   │
│   Step/feature maps already keyed by featuresUri — no change needed  │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Current Responsibility | Change for Multi-Project |
|-----------|-----------------------|--------------------------|
| `discoveryCache` (`common.ts`) | Maps wkspUri → single `DiscoveryEntry` | Maps wkspUri → `DiscoveryResult` containing `ProjectEntry[]` |
| `configScanner.ts` | BFS scan, returns primary + alsoFound | Returns **all** found configs as active projects (remove first-match-wins) |
| `getUrisOfWkspFoldersWithFeatures()` | Populates discoveryCache 1:1 | Populates discoveryCache 1:N; still returns workspace folder URIs |
| `WorkspaceSettings` (`settings.ts`) | Per-workspace settings + features/steps paths | **Split** into `WorkspaceSettings` (shared per-workspace) + `ProjectSettings` (per-project features/steps/env) |
| `config.workspaceSettings` | `{ [wkspUriPath: string]: WorkspaceSettings }` | Add `config.projectSettings` indexing; or nest `projects[]` under `WorkspaceSettings` |
| `FileParser` | `parseFilesForWorkspace(wkspUri)` | Add `parseFilesForProject(projectSettings)` — iterate projects within workspace |
| Test tree builder (`fileParser._getOrCreate...`) | Workspace → PathGroup → Feature | Workspace → Project → PathGroup → Feature (project node inserted) |
| `WkspRun` (`testRunHandler.ts`) | One run per workspace | One run per **project** — rename to `ProjectRun` or add `projectSettings` field |
| `runOrDebug*.ts` | `cd projectUri; behave` | No change — already uses `wkspSettings.projectUri` per run |
| `workspaceWatcher.ts` | One set of watchers per workspace's features | One set per **project** (per project's featuresUris) |
| `configWatcher.ts` | Watches config files per workspace | Watches all config file locations across all projects in a workspace |
| Language services (`handlers/*.ts`) | Use `getWorkspaceSettingsForFile(uri)` | Use `getProjectSettingsForFile(uri)` — find the project whose featuresUris contains the file |
| `configDiagnostics.ts` | Per-config diagnostics | No change — already keyed by configFileUri |
| `stepMappings.ts` | Keyed by `featuresUri` | No change — each project's featuresUri is already distinct |
| `stepsParser.ts`, `featureParser.ts` | Keyed by `uriId(featuresUri) + sepr + ...` | No change — namespace isolation already works |

## Data Model Changes

### 1. Discovery Cache: `DiscoveryEntry` → `DiscoveryResult`

```typescript
// NEW: replaces single DiscoveryEntry per workspace
interface DiscoveryResult {
  projects: ProjectEntry[];
}

interface ProjectEntry {
  projectId: string;           // unique ID: uriId(projectUri) or "settings-default"
  source: DiscoverySource;     // "settings" | "config-file" | "convention"
  projectUri: vscode.Uri;      // root of behave project (config file's directory)
  configFileUri?: vscode.Uri;  // which config file, if source = "config-file"
  configError?: { configFileUri: vscode.Uri; errorMessage: string };
  featuresUris: vscode.Uri[];  // resolved feature directories
  label: string;               // display name for Test Explorer (dir name or custom)
}

// Cache changes:
// OLD: discoveryCache: Map<string, DiscoveryEntry>
// NEW: discoveryCache: Map<string, DiscoveryResult>
```

### 2. Settings Split

```typescript
// WorkspaceSettings (shared, per workspace folder — keeps existing shape for window/workspace settings)
class WorkspaceSettings {
  // Unchanged: multiRootRunWorkspacesInParallel, xRay, etc. (window-level via WindowSettings)
  // Unchanged: discoveryDepth, discoveryStopOnFirstHit, suppressMultiConfigNotification
  // Unchanged: justMyCode, runParallel, importStrategy (workspace-level defaults)
  projects: ProjectSettings[];  // NEW: ordered list of projects in this workspace

  // Back-compat: delegate to first project
  get projectRelativeFeaturesPath(): string { return this.projects[0].projectRelativeFeaturesPath; }
  get featuresUri(): vscode.Uri { return this.projects[0].featuresUri; }
  get featuresUris(): vscode.Uri[] { return this.projects[0].featuresUris; }
  get stepsSearchUri(): vscode.Uri { return this.projects[0].stepsSearchUri; }
  // etc.
}

// ProjectSettings (per project within a workspace folder)
class ProjectSettings {
  projectId: string;
  label: string;
  projectUri: vscode.Uri;
  configFileUri?: vscode.Uri;
  discoverySource: DiscoverySource;
  featuresUris: vscode.Uri[];
  stepsSearchUris: vscode.Uri[];
  projectRelativeFeaturesPaths: string[];
  workspaceRelativeFeaturesPaths: string[];
  // Per-project overrides (fall back to workspace defaults if unset):
  envVarOverrides: { [name: string]: string };
  envVarPresets: { [presetName: string]: { [name: string]: string } };
  activeEnvVarPreset: string;
  // Back-compat singular getters:
  get featuresUri(): vscode.Uri { return this.featuresUris[0]; }
  get stepsSearchUri(): vscode.Uri { return this.stepsSearchUris[0]; }
  get projectRelativeFeaturesPath(): string { return this.projectRelativeFeaturesPaths[0]; }
}
```

**Migration strategy:** The existing `WorkspaceSettings` already carries all per-project fields. The cleanest approach is:

1. Extract per-project fields into `ProjectSettings`
2. Keep `WorkspaceSettings` as a thin wrapper: workspace-level defaults + `projects: ProjectSettings[]`
3. Existing code that reads `config.workspaceSettings[wkspUri.path].featuresUri` can use back-compat getters that delegate to the first project (same pattern as the singular→plural migration in v1.2.0)

### 3. Test Tree Structure

```
Single-project workspace (no change from today):
  Feature: Login ← TestItem (top-level)
    Scenario: Valid login
    Scenario: Invalid login

Multi-project, single workspace:
  backend/ ← Project TestItem (NEW)
    features/ ← PathGroup TestItem
      Feature: API Login
        Scenario: ...
  frontend/ ← Project TestItem (NEW)
    features/ ← PathGroup TestItem
      Feature: UI Login
        Scenario: ...

Multi-project, multi-root workspace:
  my-workspace ← Workspace TestItem
    backend/ ← Project TestItem (NEW)
      Feature: ...
    frontend/ ← Project TestItem (NEW)
      Feature: ...
```

**Project node visibility rule:** Only show the Project TestItem node when `discoveryResult.projects.length > 1` for that workspace. When there's exactly one project, collapse it (same as today's behavior with workspace grandparent nodes for single-root workspaces).

### 4. Test Execution Model

```typescript
// Rename WkspRun → ProjectRun (or extend WkspRun with projectSettings)
class ProjectRun {
  constructor(
    public readonly projectSettings: ProjectSettings,     // was: wkspSettings
    public readonly workspaceSettings: WorkspaceSettings,  // NEW: for shared defaults
    public readonly run: vscode.TestRun,
    public readonly request: vscode.TestRunRequest,
    public readonly debug: boolean,
    public readonly ctrl: vscode.TestController,
    public readonly testData: TestData,
    public readonly sortedQueue: QueueItem[],
    public readonly pythonExec: string,
    public readonly allTestsForThisProjectIncluded: boolean,
    public readonly includedFeatures: vscode.TestItem[],
    public readonly junitRunDirUri: vscode.Uri
  ) { }
}
```

`runTestQueue` currently iterates workspaces, then filters queue items by `featuresUri`. It needs to iterate **workspaces × projects** — but the inner loop is the same pattern.

## Architectural Patterns

### Pattern 1: Thin Adapter Layer (Recommended)

Rather than rewriting all consumers of `WorkspaceSettings` at once, create adapter functions:

```typescript
// In common.ts or a new projectHelpers.ts
function getProjectSettingsForFile(uri: vscode.Uri): ProjectSettings | undefined {
  const wkspSettings = getWorkspaceSettingsForFile(uri); // existing — finds workspace
  if (!wkspSettings) return undefined;
  return wkspSettings.projects.find(p =>
    p.featuresUris.some(fu => uri.path.startsWith(fu.path + '/') || urisMatch(fu, uri)) ||
    p.stepsSearchUris.some(su => uri.path.startsWith(su.path + '/') || urisMatch(su, uri))
  );
}

function getAllProjectSettings(): ProjectSettings[] {
  return getUrisOfWkspFoldersWithFeatures()
    .flatMap(wkspUri => config.workspaceSettings[wkspUri.path].projects);
}
```

This avoids a Big Bang refactor. Consumers that need per-project data call `getProjectSettingsForFile()`. Consumers that just need workspace-level settings continue as before.

### Pattern 2: Config Scanner Returns All Matches

Currently `scanForBehaveConfig` returns `primary` + `alsoFound` and only the primary is used. Change it to return all found configs as equals:

```typescript
interface ScanResult {
  entries: ScanResultEntry[];   // ALL found configs (replaces primary + alsoFound)
  scannedDirs: number;
  circuitBreakerFired: boolean;
  maxDepthReached: number;
}
```

The `first-match-wins` logic and `alsoFoundConfigs` notification become obsolete. All discovered configs are active projects.

### Pattern 3: Project Node in Test Tree

The test tree builder (`_getOrCreateFeatureTestItemAndParentFolderTestItemsForFeature`) already handles workspace grandparent nodes and path-group intermediate nodes. Add a project node between them:

```typescript
// In _getOrCreateFeatureTestItemAndParentFolderTestItemsForFeature:
const showProjectNode = wkspSettings.projects.length > 1;
if (showProjectNode) {
  const projectNodeId = projectSettings.projectId;
  let projectNode = (wkspGrandParent ?? ctrl.items).get(projectNodeId);
  if (!projectNode) {
    projectNode = ctrl.createTestItem(projectNodeId, projectSettings.label);
    projectNode.canResolveChildren = true;
    wkspGrandParent ? wkspGrandParent.children.add(projectNode) : ctrl.items.add(projectNode);
  }
  // Then path groups / features go under projectNode
}
```

### Pattern 4: Per-Project Parsing with Shared Python Process

Each project needs its own `loadFromBehave()` call because behave step discovery is project-scoped (behave.ini in a specific directory). But the Python executable can be shared across projects in the same workspace.

```
For each workspace:
  pythonExec = getPythonExecutable(wkspUri)
  For each project in workspace:
    loadFromBehave(pythonExec, projectSettings.projectUri, stepsPaths, ...)
```

## Data Flow

### Discovery Flow (Changed)

```
activate()
  └─► getUrisOfWkspFoldersWithFeatures(forceRefresh=true)
        ├─► BRANCH A: explicit settings → single ProjectEntry with source="settings"
        ├─► BRANCH B: findBehaveConfig(rootDir) → single ProjectEntry from root config
        └─► BRANCH C: scanForBehaveConfig(rootDir, depth)
              └─► returns ALL matches (not just primary)
              └─► each match → a ProjectEntry
              └─► discoveryCache.set(wkspId, { projects: [...all entries] })

  └─► for each wkspUri in discovered workspaces:
        config.reloadSettings(wkspUri)  // reads discoveryCache, builds ProjectSettings[]
        for each project in wkspSettings.projects:
          startWatchingProject(project, ctrl, testData, parser)
          startWatchingConfigFiles(project.configFileUri, ...)
```

### Parsing Flow (Changed)

```
parser.clearTestItemsAndParseFilesForAllWorkspaces(...)
  └─► for each wkspUri:
        parser.parseFilesForWorkspace(wkspUri, ...)  // still the entry point
          └─► for each projectSettings in wkspSettings.projects:
                parser._parseFeatureFiles(projectSettings, testData, ctrl, ...)
                parser._parseStepsFiles(projectSettings, ...)
                rebuildStepMappings(projectSettings.featuresUri, ...)
```

### Test Execution Flow (Changed)

```
testRunHandler(request)
  └─► queueSelectedTestItems(request.include)
  └─► runTestQueue(queue)
        └─► for each wkspSettings:
              for each projectSettings in wkspSettings.projects:
                projectQueue = queue.filter(item in this project's featuresUris)
                if projectQueue.length > 0:
                  projectRun = new ProjectRun(projectSettings, ...)
                  cd projectSettings.projectUri; behave [args]
```

## Integration Points

### Where New Code Touches Existing Code

| # | Integration Point | Existing File | Change Type | Risk |
|---|-------------------|---------------|-------------|------|
| 1 | Discovery cache structure | `common.ts` (discoveryCache, DiscoveryEntry) | **MODIFY** — cache value becomes `DiscoveryResult` with `projects[]` | HIGH — 20+ consumers read the cache |
| 2 | `getUrisOfWkspFoldersWithFeatures()` | `common.ts` | **MODIFY** — populate multi-project entries | MEDIUM — logic change in branches B and C |
| 3 | Config scanner output | `configScanner.ts` | **MODIFY** — return all matches as active | LOW — well-isolated |
| 4 | `WorkspaceSettings` constructor | `settings.ts` | **MODIFY** — split into workspace + project settings | HIGH — constructor is complex, ~300 lines |
| 5 | `config.workspaceSettings` accessor | `configuration.ts` | **MODIFY** — nest `projects[]` under each value | MEDIUM |
| 6 | `getProjectSettingsForFile()` helper | `common.ts` (**NEW**) | **ADD** — per-project lookup replacing `getWorkspaceSettingsForFile()` for project-scoped operations | LOW (additive) |
| 7 | Test tree builder | `fileParser.ts` (`_getOrCreate...`) | **MODIFY** — add project node layer | MEDIUM — already has 3 levels of nesting |
| 8 | `parseFilesForWorkspace` | `fileParser.ts` | **MODIFY** — iterate projects within workspace | MEDIUM |
| 9 | `runTestQueue` / `runWorkspaceQueue` | `testRunHandler.ts` | **MODIFY** — iterate projects within workspace | MEDIUM |
| 10 | `WkspRun` → `ProjectRun` | `testRunHandler.ts` | **MODIFY** — add projectSettings field | LOW — data class |
| 11 | Workspace watcher setup | `workspaceWatcher.ts` | **MODIFY** — one watcher set per project | LOW |
| 12 | Config watcher setup | `configWatcher.ts` | **MODIFY** — watch all project config files | LOW |
| 13 | Language service handlers | `handlers/*.ts` | **MODIFY** — some use `getWorkspaceSettingsForFile()` which needs to become project-aware | MEDIUM — ~20 files |
| 14 | `updateDiscoveryUX()` | `extension.ts` | **MODIFY** — iterate projects for UX output | LOW |
| 15 | Run guard | `testRunHandler.ts` | **MODIFY** — check config errors per project | LOW |

### New Components

| Component | Purpose | Location |
|-----------|---------|----------|
| `ProjectEntry` interface | Per-project discovery data | `common.ts` |
| `DiscoveryResult` interface | Container for `ProjectEntry[]` per workspace | `common.ts` |
| `ProjectSettings` class | Per-project configuration extracted from `WorkspaceSettings` | `settings.ts` |
| `getProjectSettingsForFile()` | Find which project a file belongs to | `common.ts` |
| `getAllProjectSettings()` | Flat list of all project settings across all workspaces | `common.ts` |

### Files That Do NOT Need Changes

These modules are already keyed by `featuresUri` and naturally namespace by project:

- `stepsParser.ts` — step map keyed by `uriId(featuresUri) + sepr + ...`
- `featureParser.ts` — feature step map keyed by `uriId(featuresUri) + sepr + ...`
- `stepMappings.ts` — flat array filtered by `featuresUri`
- `fixtureParser.ts` — keyed by `featuresUri`
- `configParser.ts` — stateless, takes a directory URI
- `behaveRun.ts` / `behaveDebug.ts` — take `WkspRun`/`ProjectRun` as parameter, run behave
- `junitParser.ts` — keyed by run directory
- `junitWatcher.ts` — keyed by run name
- `gherkinPatterns.ts` — pure regex, no settings dependency

## Backward Compatibility Constraints

1. **Single-project workspaces must behave identically to today.** When `discoveryResult.projects.length === 1`, no project node appears in the test tree and all settings work exactly as before.

2. **Explicit settings override discovery.** If a user has `projectPath` or `featuresPath` set, that becomes the single project for the workspace. Multi-project is only for auto-discovered configs.

3. **`WorkspaceSettings` singular getters** (`featuresUri`, `stepsSearchUri`, etc.) must continue to work for any code not yet migrated to project-aware iteration. They delegate to the first project.

4. **`config.workspaceSettings[wkspUri.path]`** accessor must continue to return a `WorkspaceSettings` object. The `projects` array is additive — no existing field is removed.

5. **Existing integration tests** must pass unchanged. The example-projects all have single configs, so they become single-project workspaces (functionally identical to today).

## Suggested Build Order

Build from the bottom up — data model first, then parsing, then tree, then execution:

| Phase | What | Depends On | Why This Order |
|-------|------|------------|----------------|
| 1 | **Data model**: `ProjectEntry`, `DiscoveryResult`, `ProjectSettings` class | None | Everything else reads these types |
| 2 | **Discovery**: Update `getUrisOfWkspFoldersWithFeatures()` branches B+C and `configScanner` to populate multi-project entries | Phase 1 | Discovery populates the cache that settings read |
| 3 | **Settings**: Split `WorkspaceSettings` → workspace + `ProjectSettings[]`; add `getProjectSettingsForFile()` | Phase 1–2 | Settings are the main API surface for all consumers |
| 4 | **Parsing**: Update `FileParser` to iterate projects within each workspace | Phase 3 | Parsing uses ProjectSettings to find feature/step files |
| 5 | **Test tree**: Add Project node layer in `_getOrCreate...` | Phase 3–4 | Tree builder runs during parsing |
| 6 | **Test execution**: Update `runTestQueue` to iterate projects; `WkspRun` → `ProjectRun` | Phase 3 | Execution reads ProjectSettings and queue items |
| 7 | **Watchers**: Update workspace and config watchers to per-project | Phase 3 | Watchers trigger parsing |
| 8 | **Language services**: Update handlers that use `getWorkspaceSettingsForFile()` | Phase 3 | Handlers are the last consumers |
| 9 | **UX**: Update `updateDiscoveryUX`, multi-config notification, run guard | Phase 2–3 | UX reads discovery results and settings |
| 10 | **README / docs**: Document multi-project behavior | Phase 1–9 | After implementation is stable |

### Critical Path

Phases 1–3 are the foundation. Phase 1 is pure type addition (low risk). Phase 2 modifies the discovery cache population (medium risk — must preserve explicit-settings-wins priority). Phase 3 is the highest-risk phase because `WorkspaceSettings` constructor is the most complex single function in the codebase (~300 lines).

### Suggested Approach for Phase 3 (Settings Split)

1. Create `ProjectSettings` class with the per-project fields extracted from `WorkspaceSettings`
2. Add `projects: ProjectSettings[]` to `WorkspaceSettings`
3. Move the features/steps path resolution logic into `ProjectSettings` constructor
4. `WorkspaceSettings` constructor creates one `ProjectSettings` per `DiscoveryResult.projects[]` entry
5. Keep singular back-compat getters on `WorkspaceSettings` that delegate to `this.projects[0]`
6. Run all 614 unit tests after each sub-step — back-compat is the primary risk

## Anti-Patterns to Avoid

### Anti-Pattern 1: Global Project Registry
**What:** Creating a global `Map<string, ProjectSettings>` disconnected from workspaces.
**Why bad:** Breaks the workspace-scoped model. VS Code's configuration API is workspace-scoped. Settings lookups, Python executable resolution, and output channels are all workspace-scoped.
**Instead:** Keep projects nested under their workspace: `workspaceSettings.projects[]`.

### Anti-Pattern 2: Multiple WorkspaceSettings Per Workspace in the Flat Map
**What:** Changing `config.workspaceSettings` key to `projectId` instead of `wkspUri.path`.
**Why bad:** Breaks every caller that does `config.workspaceSettings[wkspUri.path]`. The key semantics change silently.
**Instead:** Keep the existing map keyed by `wkspUri.path`, add `.projects[]` to the value.

### Anti-Pattern 3: Big-Bang Consumer Migration
**What:** Changing `WorkspaceSettings` API in one phase and updating all 20+ handler files simultaneously.
**Why bad:** Massive diff, impossible to review, high risk of regressions.
**Instead:** Add `getProjectSettingsForFile()` and migrate handlers incrementally. Back-compat getters keep existing code working during migration.

### Anti-Pattern 4: Project Node Always Visible
**What:** Always showing the project node in the test tree, even for single-project workspaces.
**Why bad:** Adds a useless extra click for the majority of users who have one behave project per workspace.
**Instead:** Only show the project node when `projects.length > 1` (same pattern as workspace grandparent node visibility).

## Open Questions

1. **Per-project settings in `settings.json`**: How should users configure per-project env var overrides? Options:
   - A) New `projects` map in settings: `"gs-behave-bdd.projects": { "backend": { "envVarOverrides": {...} } }`
   - B) Config file carries settings (behave.ini already has env vars via `[behave.userdata]`)
   - C) Defer per-project settings to a future milestone; use workspace defaults for all projects
   - **Recommendation:** Option C for v1.3.0 MVP. Per-project overrides are a nice-to-have, not table stakes.

2. **Project label source**: What label to show for a project in the test tree?
   - Config file's parent directory name (e.g., `backend/`, `tests/`) — simple, deterministic
   - **Recommendation:** Use the relative path from workspace root to the config's directory, with trailing `/`.

3. **Conflicting step definitions across projects**: If two projects define the same step, should the extension warn?
   - Currently step maps are isolated by `featuresUri` so this won't cause incorrect navigation.
   - **Recommendation:** No cross-project validation. Each project is independent.

## Sources

- Direct analysis of the gs-behave-bdd codebase (HIGH confidence — primary source)
- VS Code Test Controller API documentation (HIGH confidence — established API)
- Existing `.planning/codebase/ARCHITECTURE.md` (HIGH confidence — verified against code)
- Behave documentation for config file semantics (HIGH confidence — well-documented)
