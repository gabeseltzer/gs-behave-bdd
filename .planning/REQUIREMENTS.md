# Milestone v1.2: Multi-Path & Monorepo-Aware Discovery — Requirements

**Goal:** Extend auto-discovery to support behave projects with multiple feature paths and configs nested inside monorepo subdirectories — without touching multi-project scope.

**Research:** `.planning/research/SUMMARY.md` (HIGH confidence; scope smaller than milestone name suggests — parser already multi-path capable)

---

## v1.2 Requirements

### Multi-Path (DISC-08 breakdown)

- [ ] **MP-01**: `configParser.ts::resolvePaths` returns `resolvedPaths: vscode.Uri[]` end-to-end (INI continuation lines + TOML array both produce the full path list; dedup overlapping entries with case-insensitive subsumption match; Windows backslash → forward slash normalization before URI construction).
- [ ] **MP-02**: `WorkspaceSettings` exposes `featuresUris: vscode.Uri[]` (plus `stepsSearchUris`, `projectRelativeFeaturesPaths`, `workspaceRelativeFeaturesPaths`) with singular getters (`featuresUri` returns `featuresUris[0]`) for primary-plus-list back-compat.
- [ ] **MP-03**: `featuresPaths` array setting added to `package.json`; plural wins over singular `featuresPath` when both set; empty array treated as unset; info-level log emitted to the workspace output channel when both keys are set at the same scope; `hasExplicitSetting` recognizes both.
- [ ] **MP-04**: Per-path resolution failure surfaces as a Problems-panel diagnostic attached to the config file (e.g. `paths=[features, bogus]` flags `bogus` specifically without aborting the whole discovery).
- [ ] **MP-05**: Path-group intermediate TestItems — when `featuresUris.length > 1`, features are grouped under project-relative path labels (e.g. `features/`, `features-alt/`) as collapsible children of the workspace node. Single-path workspaces stay flat (no visible change).
- [ ] **MP-06**: 18-file consumer cascade — `fileParser.ts`, `junitParser.ts`, `testRunHandler.ts`, `workspaceWatcher.ts`, `autoCompleteProvider.ts`, `codeLensProvider.ts`, `stepDiagnostics.ts`, `fixtureProviders.ts`, `fixtureDiagnostics.ts`, `extension.ts`, `common.ts`, `settings.ts` — all loop/union over `featuresUris[]` correctly; `isFileInFeatures(uri)` helper available in `common.ts`; `StepMapping.featuresUri` stays scalar (per-mapping identity).

### Subdirectory Config Scan (DISC-07 breakdown)

- [ ] **SD-01**: New `src/discovery/configScanner.ts` module implements BFS-bounded subdir scan (`scanForBehaveConfig(wkspUri, maxDepth): ScanResult`). Respects `DEFAULT_EXCLUDE_DIRS` (adds `dist`, `out`, `build`, `coverage`); protects against symlink cycles via visited-realpath set; circuit-breaks at configurable `maxEntriesScanned`; iteration order is depth-outer/filename-inner (preserves v1.0 D-06 malformed-config priority).
- [ ] **SD-02**: `discoveryDepth` setting added to `package.json` (default `3`; `0` disables subdir scan — workspace-root-only legacy behavior; documented minimum `0`, practical maximum `10`); wired through `WorkspaceSettings`.
- [ ] **SD-03**: First-match-wins when multiple configs found — scanner returns primary + `alsoFoundConfigs: Uri[]`; `updateDiscoveryUX` shows a non-modal `showInformationMessage` listing the primary + others with an "Open Settings" button guiding the user to set `projectPath` manually; notification dedup per session (mirrors v0.1 `notifiedConfigErrors` pattern).
- [ ] **SD-04**: `configWatcher.ts` glob upgrades from `{configs}` to `**/{configs}` with two-tier watcher strategy (Tier 1: narrow watcher at discovered config's directory for speed; Tier 2: recursive `**/` only when no primary config discovered). Preserves v1.1 brace-expansion fix (#164925) and 500ms debounce (#72831).

### Integration & Per-Root Correctness

- [ ] **INT-01**: Per-document-root scoping — `fixtureProviders.ts` and `fixtureDiagnostics.ts` use a new `getFeaturesRootForFile(wkspSettings, fileUri)` helper so fixtures in root A don't bleed into feature files in root B (correctness, not just perf).
- [ ] **INT-02**: `workspaceWatcher.ts` fan-out — one `FileSystemWatcher` per `featuresUris[]` entry; feature-file add/delete/rename events fire across all roots.
- [ ] **INT-03**: `projectPath` manual override still wins over subdir scan — v1.0 priority chain (manual > config > convention) preserved and explicitly re-tested.
- [ ] **INT-04**: `integrationTestRun` bypass — all new re-discovery paths (scanner-triggered rebuild, multi-path watcher rebuild) call the cache + parser directly, not through `configurationChangedHandler`, mirroring v1.1 Pitfall 14 handling.

### Test Coverage

- [ ] **TEST-10**: Unit tests for `configParser.ts` — multi-path INI + TOML, dedup behavior (exact duplicate, subsumed path, Windows backslash variants), per-path resolution failure diagnostic, empty `paths=` graceful handling.
- [ ] **TEST-11**: Unit tests for `configScanner.ts` — depth-3 finds nested config, exclude-dirs honored (seeded `node_modules/` fixture), symlink cycle doesn't infinite-loop, `maxEntriesScanned` circuit breaker fires, `discoveryDepth=0` short-circuits to root-only scan.
- [ ] **TEST-12**: Unit tests for `WorkspaceSettings` — plural/singular precedence matrix (plural set / singular set / both set / neither set / plural empty array), `hasExplicitSetting` branches, Windows backslash normalization applied to all entries.
- [ ] **TEST-13**: Integration tests — multi-path from `behave.ini` loads all features into the test tree; multi-path from `settings.json.featuresPaths` equivalent; subdir-scan with monorepo fixture picks first-match + surfaces alsoFound notification; config-edit adds new path → tree rebuilds via `waitForTestTree` predicate; `discoveryDepth=0` edge case works.
- [ ] **TEST-14**: Dedicated fixtures — `example-projects/multi-path/` (single config with multi-value `paths=`) and `example-projects/monorepo-scan/` (nested `app-a/behave.ini` + `app-b/behave.ini` + seeded `node_modules/` for perf assertion). Isolated per v1.1 D-05 pattern.
- [ ] **TEST-15**: 3× flakiness gate on Windows CI (v1.1 precedent) for the new integration suite before milestone close.

---

## Future Requirements

(None currently deferred at the v1.2 level — full scope elected. Any MP-04 or MP-05 complications during execution may be bumped to a v1.2.x patch release.)

---

## Out of Scope

### Explicit MULTI-01/02 Boundary (Milestone 3 / v2.0)

The following features would require `WorkspaceSettings` to become per-project rather than per-workspace-folder. They are explicitly out of scope for v1.2 and must NOT ship:

- **Multiple independent behave projects per workspace folder** (MULTI-01) — only one primary config per workspace; `alsoFoundConfigs` is notification-only, not a second test root.
- **`Behave BDD: Select Project` quick-pick** (MULTI-02) — users must use `projectPath` override to disambiguate.
- **Per-config Python interpreter** — one interpreter per workspace folder (via ms-python.python).
- **Per-config environment variable presets** — env-var presets remain per-workspace-folder.
- **Per-config output channels** — one output channel per workspace folder.
- **Parallel runs across configs within one workspace folder** — `runParallel` setting still applies per workspace, not per discovered config.
- **`Open as Multi-Root Workspace` command** — users can set this up manually in VS Code; we don't automate it.

### Other Out of Scope

- **Home directory configs (`~/.behaverc`)** — runtime concern, not discovery.
- **Inline "Fix Config" code action** — nice-to-have; not table stakes.
- **README / marketplace docs updates** — Milestone 3 candidate.
- **Hard-blocking run guard on alsoFoundConfigs ambiguity** — anti-feature; user must always be able to proceed (v1.1 precedent).
- **Prompting on every config-file discovery** — anti-feature; non-modal info notification only, dedup per session.
- **Test tree with multiple top-level roots per workspace** — firm design constraint; single TestItem root per workspace folder (cited: vscode-python #20345, vscode-jest #129 UX pain).

---

## Requirement → Phase Traceability

| Phase | Name | Requirements |
|-------|------|--------------|
| (filled by roadmapper) |  |  |

---

## Key References

- **Research summary:** `.planning/research/SUMMARY.md`
- **Architecture detail:** `.planning/research/ARCHITECTURE.md` (18-file integration point table)
- **Pitfall catalogue:** `.planning/research/PITFALLS.md` (15 catalogued, 5 critical)
- **Prior milestones:** `.planning/milestones/v1.0-REQUIREMENTS.md`, `.planning/milestones/v1.1-REQUIREMENTS.md`

*REQ-ID format: `[CATEGORY]-[NUMBER]`. Continuing from existing prefixes (MP-, SD-, INT-, TEST-); TEST- continues from v1.1 TEST-09 → v1.2 starts at TEST-10.*
