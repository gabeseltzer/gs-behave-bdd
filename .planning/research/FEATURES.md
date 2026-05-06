# Feature Landscape: Multi-Path & Monorepo-Aware Discovery (1.2.0)

**Domain:** VS Code test runner extension — discovery expansion (multi-path + subdirectory scan)
**Researched:** 2026-04-17
**Confidence:** HIGH (mapping cleanly to 1.0.0/1.1.0 patterns, behave CLI semantics verified, prior art in Python/Vitest/Jest extensions)
**Scope:** NEW features ONLY for 1.2.0. 1.0.0 discovery cache / warning UX / diagnostics and 1.1.0 watcher / run-guard are already shipped and out of scope here.

---

## Context

1.0.0 discovered a single `featuresPath` (one directory). 1.1.0 made discovery reactive. 1.2.0 extends discovery along two axes that users hit in real projects:

1. **Multi-path** — behave's `paths=` key is a `Sequence<text>` (INI continuation lines; TOML native array). Real behave projects use this when feature files are spread across multiple directories (e.g. `features/` + `integration_tests/features/`). The extension currently collapses to the first path. We need internal `featuresUris[]` and a new plural settings key `featuresPaths[]` that parallels the existing singular `featuresPath`.
2. **Subdirectory scanning** — behave's CLI walks from CWD, but our extension only scans the workspace root for config files. In monorepos, `behave.ini` routinely lives at `<workspace>/services/qa/behave.ini` or similar. Without subdir scanning, the tests stay invisible until the user manually sets `projectPath`. 1.2.0 scans to depth 3 by default, opt-out via `discoveryDepth`, first-match-wins when multiple configs exist.

1.2.0 explicitly does NOT add multi-project-per-workspace support (multiple behave projects in the same workspace folder). That is deferred to Milestone 3 (MULTI-01/02). This research is careful to flag features that would blur that line.

### Prior-art evidence

- **behave CLI**: `paths=` is documented as `Sequence<text>` ([behave docs](https://behave.readthedocs.io/en/stable/behave/)). All paths are collected into a single run — behave iterates the list and walks each; there is no "independent-runs-per-path" mode. ([Issue #638](https://github.com/behave/behave/issues/638) — user had multiple packages with multiple `paths=` entries and expected one combined run, confirming single-run semantics; reported a steps-discovery bug, not a multi-run design).
- **INI syntax**: Multi-value `paths=` uses Python configparser continuation-line semantics — first line after `paths=`, then indented lines until a blank/comment/new-key. Our existing `parseIniConfig()` (configParser.ts lines 65-100) already collects `pathsLines: string[]` — we are currently keeping only the first. No parser change needed for multi-path beyond downstream plumbing.
- **TOML syntax**: `[tool.behave] paths = ["features/", "integration_tests/"]` — native array. smol-toml already returns this correctly.
- **vscode-python Test Explorer**: Each detected project = separate top-level TestItem root in the tree, labeled by directory name (e.g. "ada", "alice/bob"). [Multi-Project Testing wiki](https://github.com/microsoft/vscode-python/wiki/Multi%E2%80%90Project-Testing-in-VS-Code). *Transferability: partial — they group by project, we need to group by path within one project.*
- **vscode-jest**: Monorepos use `jest.rootPath` per workspace folder, or multi-root workspace. Does not currently group sub-roots within a single project; relies on the user creating multi-root. [Issue #129](https://github.com/jest-community/vscode-jest/issues/129). *Transferability: high — same constraint they faced: "should a single project have multiple test-tree top levels?" Their answer is "no, use multi-root instead" — but that's exactly the MULTI-01/02 line we are staying on the right side of.*
- **vitest-dev/vscode**: Auto-discovers multiple configs, spawns a worker per config, warns at >5 configs by default. [DeepWiki](https://deepwiki.com/vitest-dev/vscode/5.2-monorepo-and-workspace-configuration). *Transferability: medium — the "warn at threshold" pattern maps well to our first-match-wins notification.*
- **vscode-python monorepo grouping pain** ([Issue #20345](https://github.com/microsoft/vscode-python/issues/20345)): Users with multi-root monorepos complain that identically-named `tests/` folders are ambiguous in the Test Explorer. Users explicitly ask for "group tests similarly as in the repositories in the source control view." This is the exact same pain our multi-path UI must avoid.

---

## Table Stakes

Features users expect. Missing = the feature feels half-built or broken.

### Multi-path (DISC-08)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Parse `paths=` as a list, not just first entry | behave's own CLI scans every entry; the extension's Test Explorer must match. Today, users with multi-value `paths=` see only the first path's features; the rest are silently missing. | Low | `parseIniConfig` already collects `pathsLines: string[]`; we just stop discarding the tail. `parseTomlConfig` receives a native array from smol-toml. Extend `BehaveConfigResult` from `rawPaths: string[]` + `resolvedPath: Uri` to `rawPaths: string[]` + `resolvedPaths: Uri[]` (plural). *Depends on 1.0.0 configParser.* |
| Internal `featuresUris[]` on `WorkspaceSettings` + `DiscoveryEntry` | Every downstream consumer (feature parser, workspace watcher, find-step-references, discovery cache) operates on `featuresUri` today. Multi-path requires these to iterate over all paths — not pick one. Backward-compat: keep `featuresUri` as a getter returning `featuresUris[0]` during transition. | Medium | Touches `common.ts` (`WorkspaceSettings.featuresUri`), `src/parsers/fileParser.ts` (discovery iteration), `src/watchers/workspaceWatcher.ts` (one FileSystemWatcher per path), `src/handlers/findStepReferencesHandler.ts`, `src/handlers/gotoStepHandler.ts`. *Depends on 1.0.0 `WorkspaceSettings` + 1.1.0 `DiscoveryEntry` cache.* |
| New `featuresPaths[]` settings.json key | Users who override auto-discovery today use singular `featuresPath`. If they want to override with multiple paths, they need a plural key. Omitting this forces them to pick a single override path even when behave config would have given them multiple — which is an obvious regression. | Low | Add to `package.json` configuration contributions, `scope: "resource"`, `type: "array"`, `items: {"type": "string"}`. *Depends on existing `featuresPath` logic in `settings.ts`.* |
| Plural-wins-over-singular precedence | If a user sets both `featuresPath` (legacy) and `featuresPaths[]` (new), the plural form wins. This is the standard precedence rule — users who add the plural key are signalling intent to upgrade. | Low | Single `if (featuresPaths.length > 0)` branch in `settings.ts::reloadSettings`. Log precedence decision to output channel so users can troubleshoot. |
| Legacy `featuresPath` (singular) still honored | Every existing user with a single path and a settings override would break otherwise. 1.2.0's promise is additive. | Low | Keep existing singular-parsing code; just wrap the result in an array when feeding downstream. |
| Test tree groups tests under a single workspace-folder root (not multiple top-level roots per path) | The `workspaceContains:**/*.feature` activation + per-workspace-folder test-tree root is a 1.0.0 invariant. Creating per-path top-level TestItems would require multi-project scope (MULTI-01/02) and users would lose the per-workspace "Run all" affordance. See vscode-python issue #20345 for the UX pain caused by identically-labeled parallel roots. | Low | No change to test-tree top level. Features from all `featuresUris[]` get added as children of the single workspace TestItem. Feature files retain their feature-file-relative label. *See also Differentiators below for optional path-group intermediate nodes.* |
| Discovery log shows all resolved paths | The 1.0.0 UX-01 log line is `Features directory: <fsPath>`. With multi-path, users need to see every path the extension resolved. Silent collapse to the first = users cannot tell the extension read their config correctly. | Low | Update `updateDiscoveryUX()` in `extension.ts` to log `Features directories:` followed by each `featuresUris[i].fsPath`. |

### Subdirectory scan (DISC-07)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Depth-3 recursive scan for config files | Monorepos put `behave.ini` at `<workspace>/<service>/behave.ini` or `<workspace>/apps/<app>/tests/behave.ini`. Workspace-root-only scan makes auto-discovery useless for these users — they have to configure `projectPath` manually, which defeats the 1.0.0 promise of zero-config. Depth 3 covers the common patterns (service-per-folder, apps/+libs/ split) without walking deep `node_modules`/`.venv` trees. | Medium | New function in `configParser.ts` — `findBehaveConfigRecursive(wkspUri, depth)`. MUST skip `node_modules`, `.git`, `.venv`, `venv`, `__pycache__`, `dist`, `build`, `.tox`, `.pytest_cache`, `.mypy_cache` at every level (both performance AND false-positive avoidance — e.g. a vendored `tox.ini` inside `node_modules/something/` would else be picked up). Synchronous `fs.readdirSync` like the rest of configParser. *Depends on 1.0.0 `findBehaveConfig`.* |
| `discoveryDepth` setting (opt-out) | Some monorepos are ten levels deep; some are one level. The default covers the common case, and power users tune the setting. Users with a VERY large monorepo (SLO impact) need a way to turn this off. | Low | `gs-behave-bdd.discoveryDepth`: `scope: "resource"`, `type: "number"`, `default: 3`, `minimum: 0`. `0` = workspace-root-only (1.0.0 behavior). `1+` = recursive scan to that depth. *Depends on `settings.ts::reloadSettings`.* |
| First-match-wins selection when multiple configs found | With multi-project scope (MULTI-01/02) deferred, we cannot load multiple configs into a single workspace. First-match-wins is the only sane default: pick the shallowest config, warn the user, suggest `projectPath` for override. | Low | In `findBehaveConfigRecursive`, breadth-first walk + return on first match. Ties at same depth: sort alphabetically (deterministic across OS) and pick first. Log all candidates to output channel for transparency. |
| Warning notification when >1 config found | If the scan finds 3 configs and picks one, the user MUST be told — otherwise they will open a second sub-project and wonder why only one shows up in the Test Explorer. Matches 1.0.0 pattern of informative warnings with action buttons. | Low | `vscode.window.showInformationMessage` (not warning — this is informational, not an error). Copy: *"Behave BDD: Found N behave config files in this workspace. Using `<relative/path/behave.ini>`. Set `gs-behave-bdd.projectPath` to choose a different one."* Buttons: `Open Settings`, `Show in Output` (scrolls to the candidate list in the output channel). |
| `projectPath` override still wins over recursive scan | Manual > config > convention is a 1.0.0 invariant. When a user sets `projectPath`, it MUST short-circuit the recursive scan. This is how power users escape ambiguity in monorepos (and the recommended fix path in the notification copy above). | Low | Already true. Reconfirm in 1.2.0: check `projectPath` setting BEFORE calling `findBehaveConfigRecursive`. Add a unit test asserting this. *Depends on 1.0.0 priority chain.* |
| Config watcher covers subdirectory paths | 1.1.0 ships with workspace-root-only config watching. If config is at `<workspace>/app-a/behave.ini`, edits to it must still trigger reparse. | Low | Change `RelativePattern(wkspUri, "{behave.ini,…}")` to `RelativePattern(wkspUri, "**/{behave.ini,…}")` with a maxDepth filter in the event handler. *Depends on 1.1.0 configWatcher.* |
| Discovery cache invalidates on `discoveryDepth` setting change | If user changes `discoveryDepth` from 3 to 1, cache is stale. Settings change already triggers `configurationChangedHandler`, which already invalidates the cache — just confirm `discoveryDepth` is in the affected-settings list. | Low | 1.1.0's `affectsConfiguration("gs-behave-bdd")` already covers this. |

---

## Differentiators

Features that exceed baseline and noticeably improve UX, but aren't required for the feature to feel complete.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Path-group intermediate TestItems (when `featuresUris.length > 1`) | When a project has multiple feature roots, the test tree today would put, say, `login.feature` from `features/` and `smoke.feature` from `integration_tests/` as siblings under the workspace root — users can't tell which came from which root. An intermediate TestItem per path (labeled with the relative path e.g. `features/` and `integration_tests/`) solves this. When there is only one `featuresUri`, no intermediate node — the tree looks identical to 1.0.0. | Medium | Requires changes in `testFile.ts::createScenarioTestItemsFromFeatureFileContent` — parent becomes the path-group TestItem, not the workspace root. Must handle Run-all-tests correctly (the workspace root still runs every path). |
| Discovery notification is deduplicated per session | Same pattern as 1.0.0's `notifiedConfigErrors`. If user reloads window, they get the "found N configs" notification once; they don't get it every time discovery re-runs (e.g. config edit). | Low | Add `notifiedSubdirConfigSelection: Set<string>` keyed on the chosen config file URI, mirroring `notifiedConfigErrors`. Cleared on `clearNotifiedErrors=true`. |
| Output-channel candidate list for subdir scan | When multiple configs are found, the notification copy is terse. Users who click "Show in Output" or open the output channel should see the full list in priority order: `candidates considered: [app-a/behave.ini, app-b/behave.ini, tests/pyproject.toml]; selected: app-a/behave.ini`. | Low | Single `config.logger.logInfo` call at the top of the discovery-UX pipeline. Leverages 1.0.0's per-workspace output channels. |
| `discoveryDepth: 0` disables the scan entirely (single-path workspace-root-only = 1.0.0 behavior) | Power users with performance concerns, and also for users who want to assert "my config is at the root — don't look elsewhere." | Low | Branch in `findBehaveConfigRecursive(wkspUri, 0)` — returns `findBehaveConfig(wkspUri)` (1.0.0 behavior). |
| Symbolic-link and junction-point loop protection | `node_modules` and vendor dirs sometimes contain symlinks that point back to the workspace. Depth-3 + visited-inode tracking prevents infinite loops. Low-probability hit but high-severity if it does (infinite scan = hang on activation). | Low | Use `fs.statSync(path, { throwIfNoEntry: false })` + a `Set<string>` of visited real paths. Same pattern as the existing `fileParser.ts` file walks. |
| Per-path discovery failure surfaces which path failed | If the config says `paths = [features/, nonexistent/]` and `nonexistent/` is wrong, the log + Problems diagnostic should name the bad path, not just fail discovery. | Low | Extend `BehaveConfigResult` malformed branch with `badPath: string` field; `configDiagnostics.ts` formats accordingly. *Depends on 1.0.0 diagnostic.* |
| Debug log entry: "candidates considered: N" when xRay enabled | Users with xRay on can see the full walk — every directory inspected, every skip reason (excluded dir, depth limit hit, no config). Makes subdir-scan troubleshooting tractable. | Low | Existing `diagLog()` infra. Low overhead when off. |

---

## Anti-Features

Tempting additions that would damage UX or bleed into MULTI-01/02 scope. Documenting WHY helps future milestones avoid re-litigating.

| Anti-Feature | Surface Appeal | Why Problematic | Alternative |
|--------------|----------------|-----------------|-------------|
| Prompt on every config-file discovery asking the user to pick one | Looks like "respecting user intent" when multiple configs are found | Prompt-on-activation is the #1 regression pattern in extension UX. It blocks initial discovery (users can't see tests until they answer), creates friction for the 95% case where first-match is correct, and is impossible to answer correctly without project context. ESLint and 1.1.0's run guard both explicitly avoid modal activation prompts for this reason. | Non-modal info notification + `projectPath` override + output-channel candidate list (above). |
| Load ALL discovered configs into one workspace (multi-project per workspace folder) | Looks like "why pick when we could support them all?" | This IS MULTI-01/02 and is out of scope for Milestone 2 for hard reasons: (a) it requires a per-config TestItem top-level root, which requires re-architecting the test-tree model; (b) each config has its own Python interpreter resolution, working directory, and env-var preset — `WorkspaceSettings` becomes per-project, not per-workspace; (c) the `Select Project` quick-pick UX also needs to ship; (d) doubles the surface area of parser + watcher + run-guard. 1.2.0 ships a clean "first-match-wins + warn + override" pattern that DOES NOT require any of this; v2.0 can revisit with a full design. | First-match-wins + informational notification guiding user toward `projectPath` override. Multi-project = Milestone 3 (MULTI-01/02). |
| Multi-root workspace auto-promotion ("detected multiple configs — open as multi-root?") | Looks like "give users an easy out" | Multi-root workspaces modify `.code-workspace` files which are user-managed artifacts. An extension silently offering to convert a folder into a multi-root workspace is invasive. vscode-jest does NOT do this (issue #129), nor does vscode-python; they tell the user to configure manually. Also: multi-root doesn't solve the sub-sub-project case. | Documentation in README ("for independent behave projects, use multi-root"). Future candidate: `Behave BDD: Open as Multi-Root Workspace` command (Milestone 3). |
| Unbounded depth scan (walk the entire workspace) | Looks like "thorough" / "future-proof" | Activation time is already monitored (`performance.now()` timing in extension.ts line 132/652). A user with a 10,000-file monorepo would see seconds-long activation. More insidiously: a recursive scan that descends into `node_modules` would find `pyproject.toml` files in vendored Python deps and present false-positive "Behave config found in `node_modules/old-pkg/`" notifications. Depth 3 + excluded-dirs list is the right knob. | `discoveryDepth` default 3, opt-out to 0, settings allow up to e.g. 10. |
| Async fs reads during discovery (to make deep scans feel snappier) | Looks like "modern" / "non-blocking" | Discovery is synchronous in 1.0.0/1.1.0 (`fs.existsSync`, `fs.readFileSync` in configParser) — and this is a FEATURE, not a bug. `getUrisOfWkspFoldersWithFeatures()` has a <1ms hard requirement because it's called in hot paths (test-tree reconciliation, run guard). Making discovery async requires every hot path to become async-aware, doubling complexity. Depth-3 sync scan is fast enough (<10ms on typical monorepos). | Keep sync fs. If profiling shows measurable regression, introduce a `discoveryInProgress` flag and wait instead of going async. |
| Automatic `projectPath` suggestion ("we found a better project root — apply?") | Looks like "helpful" | Auto-suggesting writes to settings.json is invasive UX. Users haven't opted into that level of automation. Inline suggestion via hover/lens on settings.json is acceptable but out of scope. | Non-modal notification with `Open Settings` button; user types path themselves. |
| Fall through to convention on ALL paths failing to resolve (when `paths=["a/", "b/"]` and both are missing) | Looks like "forgiving" | 1.0.0 already falls back to convention (`features/`) on malformed config — this path is covered. For multi-path, if ANY path resolves, we should use the resolvable ones and warn about the unresolvable ones (per-path failure). If ALL fail, convention fallback + warning is correct — but it should NOT happen silently. | `configDiagnostics.ts` emits a warning per unresolved path; if all fail, fall back to convention (same as 1.0.0 single-path failure). |
| Separate TestItem root per `featuresUri` (multi-top-level-roots in the tree) | Looks like "clearer organization" | Creating multiple top-level TestItems under one workspace folder breaks "Run all tests in workspace" (users would have to select each path's root), breaks run-guard per-workspace semantics (what is "the workspace" when there are 3 roots?), and blurs the line with MULTI-01/02. See vscode-python issue #20345: users ASKED for per-workspace grouping with CLEAR labels — the answer was NOT "add more top-level roots." | Single workspace root TestItem. When >1 `featuresUri`, use an INTERMEDIATE path-group TestItem (differentiator above), not a new top-level root. |
| Watcher for configs ABOVE workspace root (e.g. parent dirs of monorepo) | Looks like "handle the case where behave.ini is in the parent directory of the open folder" | Paths outside the workspace aren't watchable via `RelativePattern` and require absolute-path hacks. Also out of activation scope (`workspaceContains` only triggers on in-workspace files). If users open a subfolder of a monorepo, that's a user decision; the extension honors the workspace they chose. | Document: "Open the monorepo root (or use a multi-root workspace)." |

---

## Feature Dependencies

```
Multi-path (DISC-08)
├── configParser.ts.parseIniConfig already collects pathsLines[]  [1.0.0 — EXISTING]
├── configParser.ts.parseTomlConfig already receives arrays       [1.0.0 — EXISTING]
├── BehaveConfigResult needs resolvedPaths: Uri[] (was resolvedPath: Uri)
├── DiscoveryEntry.featuresUris: Uri[] (was featuresUri: Uri)    [1.1.0 cache type change]
├── WorkspaceSettings.featuresUris: Uri[] (was featuresUri: Uri)
│   └──> requires: settings.ts reloadSettings honors featuresPaths[] + featuresPath
│   └──> requires: getUrisOfWkspFoldersWithFeatures returns workspace URIs (unchanged)
├── fileParser.ts iterates over featuresUris[] when parsing       [loops current single-path logic]
├── workspaceWatcher.ts creates one FileSystemWatcher per featuresUri
├── findStepReferencesHandler.ts iterates featuresUris[]
├── updateDiscoveryUX logs every path                             [1.1.0 log pipeline]
└── run-guard (1.1.0 checkRunGuard) reads featuresUris[] to compute "is this test queue under any feature root?"

Subdirectory scan (DISC-07)
├── findBehaveConfigRecursive(wkspUri, depth) — NEW function in configParser.ts
│   └──> requires: excluded-dirs allowlist (node_modules, .git, .venv, venv, __pycache__, dist, build, .tox, .pytest_cache, .mypy_cache)
│   └──> requires: symlink/junction loop protection (visited-inode Set)
├── discoveryDepth setting (gs-behave-bdd.discoveryDepth)
├── projectPath override still wins before recursive scan         [1.0.0 priority chain — RECONFIRM in tests]
├── Informational notification (N candidates) — optional per session
│   └──> reuses: 1.0.0 notifiedConfigErrors Set pattern
│   └──> reuses: 1.0.0 clearNotifiedErrors=true signal
├── Config watcher glob expanded to **/{behave.ini,…}              [1.1.0 configWatcher]
│   └──> requires: per-event depth filter (so glob match at depth 5 doesn't fire when discoveryDepth=3)
└── Output channel logs full candidate list                        [1.1.0 log pipeline]

Multi-path × Subdir-scan interaction
└── When discovery lands on <workspace>/app-a/behave.ini with paths=[features/, integration/],
    both resolvedPaths[] are relative to <workspace>/app-a/ (projectUri), not to workspace root.
    └──> requires: configParser resolvedPaths are resolved against the config file's directory
    └──> EXISTING logic — single-path 1.0.0 already does this; just loops it.
```

### Dependency notes

- **Multi-path features all require the `featuresUri` → `featuresUris[]` type change.** This is a cross-cutting refactor touching ~8 files (common.ts, settings.ts, fileParser.ts, workspaceWatcher.ts, testFile.ts, testRunHandler.ts, findStepReferencesHandler.ts, gotoStepHandler.ts). Do it once, in order, in a dedicated phase. Keep `featuresUri` as a deprecated getter returning `featuresUris[0]` through the transition.
- **Subdir scan is largely independent of multi-path** — can ship as a separate phase. The only interaction is that a subdir-found config can itself specify multi-path. Both must resolve paths relative to the config file's directory (the behave-standard behavior, already correct in 1.0.0).
- **1.1.0 config watcher rebuilds all config-watchers on settings change** (via `configurationChangedHandler`). Adding `discoveryDepth` to the watched-settings set is automatic (1.1.0's `affectsConfiguration("gs-behave-bdd")` catches it). No new logic.
- **Run guard (1.1.0)** reads `getDiscoveryEntry()` — it needs to handle `featuresUris[]`. If any of the workspace's paths has `configError`, guard fires. Straightforward change.

---

## MVP Definition (for 1.2.0 milestone)

### Launch With (1.2.0)

Minimum viable to ship the milestone. Must all be present.

- [ ] **DISC-08 multi-path end-to-end** — config parses N paths, `WorkspaceSettings.featuresUris[]` populated, fileParser walks all, test tree shows all features, workspace watcher covers all paths, run-guard handles all paths.
- [ ] **`featuresPaths[]` new settings.json key** — scope `resource`, type `array<string>`, precedence plural > singular > auto-discovered.
- [ ] **Legacy `featuresPath` singular still works** — zero change for existing users.
- [ ] **DISC-07 recursive scan, depth-3 default** — `findBehaveConfigRecursive` excludes standard junk dirs, first-match-wins, symlink-safe.
- [ ] **`discoveryDepth` setting** — `number`, default 3, min 0, resource scope.
- [ ] **Informational "found N configs" notification** — when subdir scan finds >1, non-modal, `Open Settings` button, dedupe per session.
- [ ] **Discovery log shows all paths + all candidates** — output channel + xRay diagLog.
- [ ] **Unit tests for multi-value `paths=` parsing** — INI continuation lines + TOML arrays.
- [ ] **Unit tests for recursive scan** — depth-3 hit, depth-0 skip, excluded-dirs skip, first-match-wins ordering, symlink loop.
- [ ] **Integration test fixture** — monorepo with `<root>/app-a/behave.ini` + `<root>/app-b/behave.ini` containing multi-value `paths=`. Reuses 1.1.0 `waitForTestTree` polling.
- [ ] **Regression suite passes** — all 1.0.0 + 1.1.0 example projects still pass unchanged.

### Add After Validation (1.2.x)

- [ ] **Path-group intermediate TestItems** (when `featuresUris.length > 1`) — visual grouping in the tree. Ship as patch release if users request it.
- [ ] **Per-path resolution failure in Problems panel** — when `paths=[a/, bogus/]`, Problems shows `bogus/` not found. Quality-of-life win if users hit it.

### Future Consideration (v2+)

- [ ] **Multi-project per workspace folder (MULTI-01/02)** — multiple behave projects in one workspace. Requires test-tree re-architecture, `Select Project` quick-pick, per-project Python interpreter.
- [ ] **`Behave BDD: Open as Multi-Root Workspace` command** — takes the N configs found in a monorepo and writes a `.code-workspace` scaffold. Only makes sense after MULTI-01/02.
- [ ] **Async discovery** — only if profiling shows depth-3 sync scan is >50ms on realistic monorepos.
- [ ] **Home-directory `~/.behaverc`** — affects runtime behavior; out-of-scope per PROJECT.md.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Multi-value `paths=` parsed + fed to all downstream consumers | HIGH | MEDIUM | P1 |
| `featuresPaths[]` settings.json key | HIGH | LOW | P1 |
| Legacy `featuresPath` preserved | HIGH (backward-compat) | LOW | P1 |
| Depth-3 recursive scan with excluded dirs | HIGH | MEDIUM | P1 |
| `discoveryDepth` setting | MEDIUM | LOW | P1 |
| First-match-wins + informational notification | HIGH | LOW | P1 |
| `projectPath` still wins (reconfirmed) | HIGH (regression-guard) | LOW | P1 |
| Discovery output-channel log of candidates | MEDIUM | LOW | P1 |
| Config watcher covers subdirs | HIGH | LOW | P1 |
| Symlink/junction loop protection | MEDIUM (low-prob/high-severity) | LOW | P1 |
| Dedupe notification per session | MEDIUM | LOW | P2 |
| Per-path resolution failure diagnostic | MEDIUM | LOW | P2 |
| Path-group intermediate TestItems | MEDIUM | MEDIUM | P2 |
| `discoveryDepth: 0` disables scan | LOW | LOW | P2 |
| Multi-project per workspace (MULTI-01/02) | HIGH | HIGH | P3 (v2.0) |

---

## Competitor Feature Analysis

| Feature | vscode-python | vscode-jest | vitest-dev/vscode | Our Approach |
|---------|---------------|-------------|---------------------|--------------|
| Multiple test roots within one workspace folder | Via Python Environments API: each detected project = top-level TestItem root | Not natively; `jest.rootPath` per workspace folder, or multi-root | Scans `**/*{vite,vitest}*.config*` up to 5 configs, warns beyond | Single test root per workspace folder; `featuresUris[]` all feed into it. Path-group intermediate nodes as differentiator. Stays on safe side of MULTI-01/02. |
| Monorepo support | Multi-project wiki recommends multi-root workspace OR Python Environments API per subfolder | Multi-root workspace or `jest.rootPath` per package | Auto-discovers, spawns worker per config, threshold warning | Recursive scan to depth 3 + first-match-wins + informational notification + `projectPath` override. User can manually escape via multi-root (documented). |
| Grouping ambiguity (same-named test folders) | Known pain point (issue #20345, unresolved) | Mitigated by workspace folder labels | N/A (one config per package is distinct) | Avoided entirely — we never create multiple top-level TestItem roots. Path-group intermediate labels feature-path-relative, so `features/` and `integration/` look distinct. |
| Config discovery depth | Python tests discover from `python.testing.cwd`; implicit via pytest's `rootdir` | Driven by `jest.rootPath` setting | Glob pattern matching, configurable | Explicit `discoveryDepth` setting (default 3), opt-out to 0 (workspace-root-only), excluded-dirs allowlist. |
| Multi-value config arrays | pytest handles via `testpaths = ...` natively | Jest `projects = [...]` natively | Vitest `workspace = [...]` | behave `paths = [...]` natively (INI continuation or TOML array). We just plumb this to `featuresUris[]`. |
| Ambiguity UX when multiple configs | N/A (per-project API) | Setup wizard command | Threshold warning, per-worker instance | First-match-wins + informational notification + candidate list in output channel + `projectPath` override. |

**Key transferability note:** The closest analogue is **vitest-dev/vscode** (auto-discover + threshold warning + per-instance handling), but they solve "multiple independent test runners" (our Milestone 3 / MULTI-01/02). For 1.2.0, we borrow the *auto-discover + threshold warning* pattern, but collapse to a single instance via first-match-wins. This is intentionally more conservative than Vitest — and stays scoped.

---

## Anti-Features Flagged for MULTI-01/02 Boundary

Features that would LOOK natural in 1.2.0 but actually require multi-project scope. Rejecting these here keeps the boundary clean:

1. **Per-config Python interpreter resolution.** Today, `WorkspaceSettings.pythonExec` is per-workspace-folder. If we discovered 3 configs in a monorepo and honored them all, each would need its own interpreter (ms-python extension API is per-resource-uri). 1.2.0 sidesteps this by picking only one config.
2. **Per-config env-var presets.** Same argument. `envVarPresets` is keyed per workspace; per-config presets = MULTI-01.
3. **`Select Project` quick-pick command.** Makes no sense with one config per workspace; deferred with MULTI-01/02.
4. **Parallel test runs across configs.** `multiRootRunWorkspacesInParallel` already exists (per workspace folder). Parallel per-config within a workspace = MULTI-02.
5. **Per-config output channel.** Output channels are per-workspace-folder today. Per-config = MULTI-01.

Rule of thumb: if the feature would require `WorkspaceSettings` to become per-project (not per-workspace-folder), it is MULTI-01/02 scope and must not ship in 1.2.0. This research recommends 1.2.0 keep `WorkspaceSettings` strictly per-workspace-folder.

---

## Confidence Notes

- **behave multi-value `paths=` semantics** — HIGH. Config source (behave's own configparser) + existing 1.0.0 parser already collects continuation lines. smol-toml handles arrays. Verified against behave's type signature (`Sequence<text>`) and community issue #638.
- **Test Explorer UX recommendations (single root, path-group intermediate)** — MEDIUM-HIGH. Based on vscode-python issue #20345 and vscode-jest issue #129 explicit user pain; no direct "behave" analogue but the Test Controller API constraints are the same.
- **Depth-3 default** — MEDIUM. Reasonable trade-off based on common monorepo shapes (`apps/<app>/`, `services/<svc>/`, `packages/<pkg>/tests/`) but could benefit from real-project profiling during implementation. Mitigation: `discoveryDepth` is user-configurable, so a wrong default is fixable by the user.
- **First-match-wins over prompt-on-activation** — HIGH. ESLint, vscode-python, vscode-jest all avoid modal activation prompts for this class of ambiguity. Our 1.1.0 non-blocking run-guard decision set the precedent in this codebase.
- **`featuresPaths[]` plural-wins-over-singular** — HIGH. Matches how other VS Code extensions handle singular-to-plural key migrations (ESLint `validate` → `validate` with array form).

---

## Sources

- [behave docs — Using behave (paths = Sequence)](https://behave.readthedocs.io/en/stable/behave/) — primary config semantics
- [behave issue #638 — multiple paths in config](https://github.com/behave/behave/issues/638) — confirms merge-into-one-run semantics, documents a steps-discovery bug adjacent to our parser
- [behave behave.ini reference](https://github.com/behave/behave/blob/main/behave.ini) — INI format reference
- [behave configuration.py (1.2.5 source)](https://sources.debian.org/src/behave/1.2.5-2/behave/configuration.py/) — config_filenames() source of truth
- [vscode-python Multi-Project Testing wiki](https://github.com/microsoft/vscode-python/wiki/Multi%E2%80%90Project-Testing-in-VS-Code) — per-project top-level root pattern (what we DON'T want for 1.2.0)
- [vscode-python issue #20345 — group by workspace](https://github.com/microsoft/vscode-python/issues/20345) — UX pain from ambiguous parallel test roots
- [vscode-python issue #15812 — monorepo virtualenvs](https://github.com/microsoft/vscode-python/issues/15812) — monorepo shape reference
- [vscode-python issue #21204 — improved monorepo support](https://github.com/microsoft/vscode-python/issues/21204) — open design discussion
- [vscode-python issue #25069 — monorepo conftest.py discovery](https://github.com/microsoft/vscode-python/issues/25069) — nested-project-discovery pain
- [vscode-jest issue #129 — monorepo support](https://github.com/jest-community/vscode-jest/issues/129) — "use multi-root" escape-hatch pattern
- [vitest-dev/vscode monorepo config docs](https://deepwiki.com/vitest-dev/vscode/5.2-monorepo-and-workspace-configuration) — threshold-warning pattern, per-config workers
- [VS Code Testing API](https://code.visualstudio.com/api/extension-guides/testing) — TestController/TestItem hierarchy constraints
- [VS Code issue #87888 — nested repo depth limit](https://github.com/microsoft/vscode/issues/87888) — precedent for depth-limit settings in VS Code discovery
- Existing codebase: `src/parsers/configParser.ts` (continuation-line handling already in place), `src/extension.ts` (`updateDiscoveryUX` / `configurationChangedHandler` integration points), `src/watchers/configWatcher.ts` (1.1.0 glob pattern to extend), `.planning/PROJECT.md` (MULTI-01/02 deferral rationale)
