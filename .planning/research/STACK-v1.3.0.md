# Stack Research — v1.3.0 Multi-Project Support

**Domain:** VS Code extension multi-project test management
**Researched:** 2026-04-22
**Confidence:** HIGH

## Executive Summary

Multi-project support requires **no new external libraries**. The entire feature is an architectural refactoring of existing internal data structures and the test tree hierarchy. The VS Code Test Controller API already supports arbitrary nesting of `TestItem` nodes — the extension just needs to insert a "project" level between workspace and features.

The key change is evolving from a 1:1 mapping of workspace folder → single discovery entry to a 1:N mapping of workspace folder → multiple project entries. The `configScanner` already discovers all configs (`alsoFoundConfigs`) but currently discards extras in favor of first-match-wins. The multi-project milestone promotes all discovered configs into active projects.

The vscode-python extension recently shipped an analogous `ProjectAdapter` pattern for multi-project pytest/unittest support. Their approach validates the architectural pattern: each project gets a root `TestItem`, project-scoped IDs prevent collisions, and independent discovery/execution per project maps cleanly to separate behave invocations.

## Recommended Stack

### Core Technologies (Already Present — No Changes)

| Technology | Version | Purpose | Status |
|------------|---------|---------|--------|
| TypeScript | 4.5.5 | Extension source | No change |
| VS Code Extension API | ^1.82.0 | Test Controller, FileSystemWatcher, configuration | No change — `TestItem` nesting is the mechanism |
| Mocha / Sinon | 9.2.2 / 21.0.1 | Unit + integration testing | No change |
| webpack 5 | 5.76.2 | Bundling | No change |
| smol-toml | (bundled via webpack) | TOML config parsing | No change |
| xml2js | 0.6.2 | JUnit XML parsing | No change |

### VS Code APIs Used (Existing — Reused Differently)

| API | Current Usage | Multi-Project Usage |
|-----|--------------|---------------------|
| `TestController.createTestItem()` | Creates workspace grandparent, path-group, folder, feature, scenario nodes | Also creates **project** intermediate nodes between workspace and path-group/features |
| `TestItem.children` | Nests items in hierarchy | Project node becomes parent of feature/path-group nodes |
| `TestRunRequest.include` | Filters to specific workspace items | Must resolve project membership for per-project behave invocation |
| `WorkspaceConfiguration.inspect()` | Detects explicit settings at 3 scopes | Same — project-level overrides stored in a new structured setting |
| `FileSystemWatcher` | Watches per-workspace config files (5 formats) | Watches ALL discovered project directories for config changes |
| `DiagnosticCollection` | Per-config-file path resolution errors | Per-project config diagnostics |

### Supporting Libraries (No New Additions)

| Library | Purpose | Why Not Needed |
|---------|---------|----------------|
| Any DI framework | Dependency injection | Overkill — singleton `config` + `parser` pattern sufficient for this scale |
| Any state management lib | Managing multi-project state | A `Map<string, ProjectEntry[]>` keyed by workspace URI is sufficient |
| Any new config parser | Reading project-level config | Behave configs already parsed by existing `configParser.ts` |
| nanoid | Unique IDs | Already a transitive dep; project IDs derivable from config URIs (deterministic is better) |

## What NOT to Add

| Candidate | Why NOT |
|-----------|---------|
| **New config file format** (e.g., `.behave-bdd.json`) | Projects derive from behave's own config files. Adding our own format adds confusion and maintenance burden. |
| **inversify / tsyringe** | vscode-python uses inversify but is 100× larger. Our singleton pattern (`config`, `parser`) works fine. |
| **EventEmitter-based project registry** | Over-engineering. The discovery cache + file watchers already implement the reactive pattern. |
| **Per-project TestController** | VS Code supports exactly one `TestController` per extension. Multiple test roots inside one controller is the pattern. |
| **Any database/persistence layer** | Discovery is fast (< 1ms from cache). No need to persist project lists — re-derive on reload. |
| **New `package.json` activation events** | Already activates on `workspaceContains:**/*.feature` and config files. Sufficient for multi-project. |

## Stack Patterns by Variant

### Variant 1: Single Project Per Workspace (Current — Unchanged)

**When:** Only one config found, or `projectPath` explicitly set, or only `features/` convention.

- No project node in tree (backward compat: tree looks identical to v1.2.0)
- `DiscoveryEntry` used as-is
- `WorkspaceSettings` used as-is with existing `projectUri`
- Single behave invocation per workspace

### Variant 2: Multiple Projects Per Workspace (New)

**When:** `configScanner` finds multiple config files AND user hasn't pinned a single `projectPath`.

- **Discovery**: `configScanner` collects ALL `ScanResultEntry[]` instead of just `primary` + `alsoFound`. Each entry maps to a project.
- **Data model**: New `ProjectEntry` interface (extending or wrapping `DiscoveryEntry`) per project. Array stored per workspace folder.
- **Settings**: New `projectOverrides` structured setting in `package.json` for per-project env vars/tags. Falls back to workspace-level settings if no override exists.
- **Test tree**: Project `TestItem` node inserted: Workspace > **Project** > path-group > folder > feature > scenario.
- **Run orchestration**: `WkspRun` created per project (each with its own `projectUri` as cwd). "Run All" at workspace level iterates all projects.
- **Watchers**: Config watchers already watch all 5 formats recursively. On change, re-scan and rebuild affected project(s) only.

### Variant 3: Mixed — Explicit Settings + Auto-Discovery

**When:** User has `projectPath` set for one project but also has other configs in subdirectories.

- The explicitly-configured project takes priority (existing BRANCH A in `getUrisOfWkspFoldersWithFeatures`).
- Auto-discovered projects supplement it (shown as additional project nodes).
- Explicit project's settings use existing `envVarOverrides`, `envVarPresets`, etc.
- Auto-discovered projects use defaults or `projectOverrides` setting.

## Key Integration Points with Existing Stack

### 1. `DiscoveryEntry` / `discoveryCache` (src/common.ts)

**Current:** `Map<string, DiscoveryEntry>` — one entry per workspace folder.
**Change:** Evolve to `Map<string, DiscoveryEntry[]>` (array per workspace). OR introduce a new `Map<string, ProjectEntry[]>` alongside existing cache for backward compat. Prefer the latter to minimize blast radius.

The `getDiscoveryEntry()` getter returns the array; callers that only need the first/only project use `[0]`. New callers iterate.

### 2. `WorkspaceSettings` (src/settings.ts)

**Current:** One instance per workspace folder, reads from VS Code config + discovery entry.
**Change:** Constructor already accepts `discoveryEntry?: DiscoveryEntry`. For multi-project, create one `WorkspaceSettings` per project by passing each project's `DiscoveryEntry`. The `projectUri` field already correctly resolves per-config.

New field: `projectName: string` (derived from config directory's basename, e.g., `"autotest"`, `"backend"`).

### 3. `FileParser._parseFeatureFiles()` (src/parsers/fileParser.ts)

**Current:** Called once per workspace with one `wkspSettings`.
**Change:** Called once per project. Already iterates `wkspSettings.featuresUris`, so the loop body doesn't change — the outer orchestration does.

### 4. Test Tree Hierarchy (src/parsers/fileParser.ts)

**Current hierarchy:** `[workspace?] > [pathGroup?] > [folders] > feature > scenario`
**New hierarchy:** `[workspace?] > [project?] > [pathGroup?] > [folders] > feature > scenario`

Project node appears when >1 project exists in the workspace. Created as `TestItem` with `canResolveChildren=true`, ID derived from project `configFileUri` or `projectUri`.

### 5. `WkspRun` / run orchestration (src/runners/testRunHandler.ts)

**Current:** One `WkspRun` per workspace, cwd = `wkspSettings.projectUri`.
**Change:** One `WkspRun` per project. The `runWorkspaceQueue` function becomes `runProjectQueue`. Each project runs its own behave instance with its own cwd and env vars.

### 6. `configScanner` (src/discovery/configScanner.ts)

**Current:** BFS scan, returns `ScanResult` with `primary` + `alsoFound[]`. `alsoFound` is displayed in notification but not activated.
**Change:** ALL found configs promoted to active projects. The existing `allEntries = [primary, ...alsoFound]` derivation is straightforward.

### 7. `package.json` settings

**New setting needed:**

```jsonc
"gs-behave-bdd.projectOverrides": {
  "scope": "resource",
  "type": "object",
  "markdownDescription": "Per-project overrides keyed by project path...",
  "additionalProperties": {
    "type": "object",
    "properties": {
      "envVarOverrides": { "type": "object" },
      "activeEnvVarPreset": { "type": "string" },
      "tags": { "type": "string" }
    }
  }
}
```

This allows users to customize per-project behavior without separate settings files.

## Performance Considerations

| Concern | Mitigation |
|---------|------------|
| Multiple `parseFilesForWorkspace` calls (one per project) | Already async and self-cancelling per workspace. Per-project calls use same pattern. |
| Larger test tree with project nodes | `TestItem` hierarchy is native VS Code — efficient. WeakMap for test data prevents memory leaks. |
| Multiple behave spawns for "Run All" | Already supported via `runParallel` and `multiRootRunWorkspacesInParallel`. Per-project parallelism follows same pattern. |
| `getUrisOfWkspFoldersWithFeatures()` < 1ms requirement | Still reads from cache. Cache stores all projects per workspace. No performance regression. |
| Config file watching | Already watches recursively. No additional watchers needed — just different handling of change events. |

## Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| No new libraries needed | HIGH | Thorough codebase analysis + VS Code API docs confirm all capabilities exist |
| Test tree hierarchy pattern | HIGH | VS Code Test Controller API supports arbitrary nesting; vscode-python validates the multi-project root pattern |
| Per-project settings via structured object | HIGH | Standard `package.json` contribution pattern; similar to existing `envVarPresets` |
| Run orchestration per project | HIGH | `WkspRun` already parameterized by `WorkspaceSettings.projectUri`; creating one per project is straightforward |
| Config scanner promotion | HIGH | `alsoFoundConfigs` already collected; promoting to active projects is a data flow change, not a capability gap |

## Sources

- VS Code Testing API: https://code.visualstudio.com/api/extension-guides/testing (verified 2026-04-22)
- vscode-python `ProjectAdapter` pattern: `src/client/testing/testController/common/projectAdapter.ts` — multi-project test tree with project root TestItems
- vscode-python `PythonTestController.discoverAllProjectsInWorkspace()`: demonstrates per-project discovery within a single workspace
- vscode-python `populateTestTree()` with `projectId`/`projectName` params: project-scoped test item IDs
- Existing codebase analysis: `configScanner.ts` `alsoFound[]`, `fileParser.ts` tree construction, `testRunHandler.ts` run orchestration
