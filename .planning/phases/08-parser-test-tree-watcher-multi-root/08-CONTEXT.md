# Phase 8: Parser / Test-Tree / Watcher Multi-Root Iteration - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Make every consumer (parser, test tree, watcher, runner queue, fixture/step handlers, JUnit parser) iterate/union/per-root-scope across `featuresUris[]` so the full test surface is visible, runnable, and correctly scoped when a behave config lists multiple feature paths. User-visible multi-path when a behave.ini already lists multiple `paths=` entries.

Phase 8 owns the 18-file consumer cascade that actually iterates over the plural fields introduced in Phase 7. It also owns path dedup (MP-01), per-path diagnostics (MP-04), path-group TestItems (MP-05), and watcher fan-out (INT-02).

</domain>

<decisions>
## Implementation Decisions

### Test Tree Path-Group Labels (MP-05)

- **D-01:** Path-group intermediate TestItems use **project-relative path labels** (e.g. `features/`, `src/features-alt/`). Always unambiguous, even when multiple paths share the same leaf directory name.
- **D-02:** Path-group nodes appear **whenever the resolved paths list has any entries** — even a single explicit `paths = features` entry triggers the intermediate node. Single-path workspaces that rely on convention (no `paths=` in config) stay flat (no change from v1.1).
- **D-03:** Path-group TestItem expansion/collapse follows **VS Code's default behavior**. No explicit `collapsibleState` override — defer to the Test Explorer's own defaults.

### Partial Discovery Behavior (MP-04)

- **D-04:** When some paths in `paths=` fail to resolve, the extension uses **partial success** — valid paths are discovered normally, and each invalid path gets an **Error-severity diagnostic** in the Problems panel. Tests still run from the valid paths.
- **D-05:** Per-path Error diagnostics **attach to the config file at the exact line** containing the bad path entry. This requires the INI/TOML parser to track line numbers for each path entry and propagate them through `BehaveConfigResult`.
- **D-06:** When **ALL** paths in `paths=` fail to resolve, the config is treated as **malformed** (no convention fallback). Multiple Error diagnostics are shown — one per bad path. This replaces Phase 7's D-06 all-or-nothing behavior with per-path granularity while keeping the "all bad = malformed" semantic.

### Cross-Root Step/Fixture Scoping

- **D-07:** Steps and fixtures are **shared across all feature roots** within a workspace. This matches behave's actual execution model: step definitions are loaded into a global registry from `steps/` directories, and `environment.py` hooks are loaded once from the project root. Per-feature-path isolation would produce incorrect autocomplete/diagnostic results that don't match what behave will accept at runtime.
- **D-08:** **INT-01 is dropped from Phase 8 scope.** Per-document-root fixture scoping was based on an incorrect assumption that behave isolates fixtures per feature path. Since behave loads all fixtures globally, the extension should too. `getFeaturesRootForFile` (from Phase 7) is still used for test-tree path-group assignment and JUnit name trimming — just not for fixture/step scoping.

### Overlapping Path Dedup (MP-01)

- **D-09:** When paths overlap (parent contains child, e.g. `paths = features  features/api`), the **broader parent path always wins**. The subsumed child path is dropped to prevent double-counting features.
- **D-10:** Path subsumption collisions are reported via **both** an info-level line in the Behave BDD output channel **and** a Warning-severity diagnostic on the config file at the subsumed path's line. Both channels to ensure visibility.
- **D-11:** Path dedup uses `uriId()` for comparison, which is **case-insensitive**. This provides platform-correct behavior on Windows where `Features/` and `features/` are the same directory.

### Claude's Discretion

- Order and grouping of the 18-file consumer migration (fileParser, junitParser, testRunHandler, workspaceWatcher, autoCompleteProvider, codeLensProvider, stepDiagnostics, fixtureProviders, fixtureDiagnostics, extension, common, settings, stepMappings, etc.). Recommend grouping by layer: parsers → test tree → watchers → handlers → runners.
- How to propagate line numbers from the INI/TOML parser for D-05 — whether to enrich `BehaveConfigResult` with a `pathLineNumbers` map or use a separate structure.
- Whether the watcher fan-out (INT-02) creates one `FileSystemWatcher` per `featuresUris[]` entry or uses a compound glob pattern. One-per-entry is simpler to reason about for add/remove.
- Exact implementation of subsumption check in `resolvePaths` — `startsWith` on URI paths or `uriId` prefix match.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap + Requirements
- `.planning/ROADMAP.md` §Phase 8 — Goal, Success Criteria 1-6, Requirements MP-01 + MP-04 + MP-05 + MP-06 + INT-02 + TEST-10
- `.planning/REQUIREMENTS.md` §MP-01, §MP-04, §MP-05, §MP-06, §INT-02, §TEST-10 — exact acceptance criteria
- `.planning/REQUIREMENTS.md` §INT-01 — dropped from Phase 8 per D-08 (behave's global model)
- `.planning/STATE.md` — v1.2 roadmap-level decisions, key architecture constraints

### Prior Phase Context
- `.planning/phases/07-internal-multi-path-types/07-CONTEXT.md` — D-01 through D-15, especially:
  - D-01/D-02: `resolvedPaths: Uri[]` and `featuresUris: Uri[]` shapes
  - D-04: `StepMapping.featuresUri` stays scalar
  - D-05: Non-empty invariant on plural fields
  - D-06: All-or-nothing behavior (overridden by Phase 8 D-04/D-06 partial success)
  - D-08: `isFileInFeatures(uri)` on WorkspaceSettings
  - D-09: `getFeaturesRootForFile` in common.ts
  - D-10: Windows backslash normalization

### Research
- `.planning/research/SUMMARY.md` — Executive summary, 18-consumer cascade overview
- `.planning/research/ARCHITECTURE.md` §Every Consumer of featuresUri/featuresPath Today — exhaustive 18-file grep
- `.planning/research/ARCHITECTURE.md` §Anti-Pattern 1 — StepMapping.featuresUri stays scalar
- `.planning/research/ARCHITECTURE.md` §Cross-Cutting Design Rules #2 — getFeaturesRootForFile helper
- `.planning/research/PITFALLS.md` §Pitfall 2 — overlapping/subsumed paths
- `.planning/research/PITFALLS.md` §Pitfall 3 — primary-plus-list pattern (18-file rename trap)

### Source files Phase 8 touches (primary consumers)
- `src/parsers/fileParser.ts` — Feature discovery, step discovery, step mappings rebuild (~20 singular call sites)
- `src/parsers/junitParser.ts` — JUnit name trimming uses `workspaceRelativeFeaturesPath`
- `src/parsers/stepMappings.ts` — `getStepMappings(featuresUri)` keyed by singular
- `src/runners/testRunHandler.ts` — `uriId(wkspSettings.featuresUri)` for test item matching
- `src/watchers/workspaceWatcher.ts` — `RelativePattern` uses singular `workspaceRelativeFeaturesPath`
- `src/handlers/autoCompleteProvider.ts` — `getStepFileSteps(featuresUri)`
- `src/handlers/codeLensProvider.ts` — `getStepFileSteps(featuresUri)`
- `src/handlers/stepDiagnostics.ts` — `getFeatureFileSteps(featuresUri)`, `getStepFileSteps(featuresUri)`
- `src/handlers/fixtureProviders.ts` — `getFixtureByTag(featuresUri, tag)`, `getFixtures(featuresUri)`
- `src/handlers/fixtureDiagnostics.ts` — `getFeatureTags(featuresUri)`, `getFixtures(featuresUri)`
- `src/extension.ts` — `urisMatch(wkspSettings.featuresUri, featuresUri)` in test tree builder
- `src/settings.ts` — `logSettings` renders singular `featuresUri.fsPath`
- `src/common.ts` — `hasFeaturesFolder` populates `DiscoveryEntry.featuresUris`
- `src/parsers/configParser.ts` — `resolvePaths` needs dedup logic + line number tracking

### Build verification
- `CLAUDE.md` §After Every Code Change — `npx eslint src --ext ts` + `npm run test:unit` must pass
- `AI_INSTRUCTIONS.md` — URI handling, disposables, performance, cross-platform rules

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`isFileInFeatures(uri)`** on `WorkspaceSettings` (Phase 7 D-08) — ready for any consumer that needs to check file membership across all roots.
- **`getFeaturesRootForFile(wkspSettings, fileUri)`** in `common.ts` (Phase 7 D-09) — maps a file to its owning feature root. Used for test-tree path-group assignment and JUnit name trimming.
- **`uriId(uri)`** in `common.ts` — case-insensitive URI comparator. Use for dedup and prefix matching.
- **`urisMatch(a, b)`** in `common.ts` — equality check. Use where exact URI match is needed.
- **`findFiles(baseUri, subdir, ext, cancelToken)`** in `common.ts` — existing file walker that respects exclusions. Phase 8 calls it per `featuresUris[i]` entry.
- **`deleteFeatureFileSteps`, `deleteStepMappings`, `rebuildStepMappings`** in `stepMappings.ts` — already keyed by `featuresUri`. Phase 8 must call per-root for cleanup, but rebuild uses workspace-wide steps (D-07).

### Established Patterns
- **Singular getter over plural state** — established in Phase 7. `featuresUri` returns `featuresUris[0]`. Consumers that need "iterate all" use the plural directly.
- **`StepMapping.featuresUri` stays scalar** (Anti-Pattern 1) — each mapping belongs to exactly one feature root. When building mappings, iterate over all feature file steps from all roots but preserve the per-file root identity.
- **Watcher debounce** — 500ms debounce on step file changes (fileParser.ts). Feature file watchers fire immediately. Phase 8 fan-out must preserve this.

### Integration Points
- **`fileParser.ts::parseFeatures()`** — Entry point for feature discovery. Currently calls `findFiles(wkspSettings.featuresUri, ...)` once. Phase 8 iterates over `featuresUris[]`.
- **`fileParser.ts::_getOrCreateFeatureTestItem()`** (line ~359) — Builds test tree items. Currently strips `wkspSettings.featuresUri.path` prefix. Phase 8 must determine the correct root per file and optionally insert path-group intermediate nodes.
- **`workspaceWatcher.ts::createFeatureFileWatcher()`** — Creates one `RelativePattern` watcher. Phase 8 creates one per root.
- **`junitParser.ts::getJunitClassName()`** (line ~204) — Trims `workspaceRelativeFeaturesPath` from JUnit names. Phase 8 must use the correct per-file root.

</code_context>

<specifics>
## Specific Ideas

- **Path-group node threshold**: The "always show path-group when paths= is set" rule (D-02) means the single entry `paths = features` produces `Workspace > features/ > login.feature` instead of `Workspace > login.feature`. This is a deliberate visual signal that the project is multi-path-aware, even when only one path is configured.
- **Parser line number enrichment for D-05**: The INI parser already iterates `pathsLines` (continuation lines). Track the source line number per entry in `rawPaths` so `resolvePaths` can propagate it to the diagnostic. TOML paths come from a native array — line tracking may require regex search in the raw TOML text.
- **Dedup runs before discovery**: `resolvePaths` dedup and subsumption check should run before `findFiles` calls, not after. This prevents scanning a subsumed directory just to discard its results.

</specifics>

<deferred>
## Deferred Ideas

- **INT-01 per-root fixture scoping** — dropped from Phase 8 (D-08). If users report false fixture suggestions in multi-path workspaces, revisit in a future phase. `getFeaturesRootForFile` infrastructure is already in place if needed.
- **Per-root step definition isolation** — not applicable per behave's global model (D-07). Only revisit if behave itself adds per-path step scoping.
- **`featuresPaths` user-facing setting** — Phase 10 (MP-03). Phase 8 only exercises multi-path via behave config `paths=` entries.
- **Integration test fixtures** (`multi-path/`, `monorepo-scan/`) — Phase 11 (TEST-14).

</deferred>

---

*Phase: 08-parser-test-tree-watcher-multi-root*
*Context gathered: 2026-04-20*
