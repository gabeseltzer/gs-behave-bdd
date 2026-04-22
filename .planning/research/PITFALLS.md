# Pitfalls Research — 1.2.0 Multi-Path & Monorepo-Aware Discovery

**Domain:** VS Code extension — extending per-workspace discovery/watcher/test-tree architecture to support multiple feature paths and depth-3 subdirectory config scanning
**Researched:** 2026-04-17
**Confidence:** HIGH (every pitfall verified against concrete code references in `src/common.ts`, `src/watchers/configWatcher.ts`, `src/extension.ts`, `src/parsers/configParser.ts`, `src/settings.ts`, `src/watchers/workspaceWatcher.ts` or against shipped 1.0.0/1.1.0 decisions in PROJECT.md)

---

## How This Document Is Scoped

This is an **integration-risk catalogue** for adding two orthogonal features on top of a mature system:

- **Multi-path (DISC-08):** `paths=` becomes an array → internal `featuresUris[]` → downstream consumers (`WorkspaceSettings.featuresUri`, `workspaceWatcher.ts`, `fileParser.ts` findFiles calls, test-tree top-level node, find-step-refs, run guard) must all accept N paths instead of 1.
- **Monorepo subdir scan (DISC-07):** `findBehaveConfig` stops being a workspace-root-only `fs.existsSync` probe and becomes a bounded recursive scan with opt-out via `discoveryDepth`.

These do **not** generically break "a VS Code extension." They specifically break integration seams in this codebase — most of them invisible (silent wrong behavior, not a thrown error). Prevention references the concrete file and line where the trap lives.

The 1.1.0 pitfalls document is **still binding** (carry forward disposal leak, glob-not-filename, debounce, cache-is-source-of-truth). Those are not re-listed — this document only covers NEW traps from 1.2.0.

---

## Critical Pitfalls

---

### Pitfall 1: Subdirectory Scan Walks `node_modules` / `.git` / `dist` — Extension-Host Freeze on Activation

**What goes wrong:** A naive depth-3 scan implemented as "`for each entry in wkspUri: if directory, recurse up to depth 3, probe for behave config files" hits every transitive directory within the depth budget. In a realistic monorepo, `workspaceRoot/node_modules/` alone can contain 10,000+ top-level packages, each with nested directories. Even a depth-3 scan will `fs.readdirSync` or `vwfs.readDirectory` tens of thousands of directories on activation — blowing past the `< 1ms` budget for `getUrisOfWkspFoldersWithFeatures()` by three orders of magnitude, and freezing the extension host for seconds on workspace open.

**Why it happens:** VS Code's `vscode.workspace.findFiles` honors the user's `files.exclude` and `search.exclude` settings by default, so developers building from scratch don't notice the problem. But `src/common.ts` already established (1.0.0, line 447) that `vscode.workspace.findFiles` is unreliable on Windows for workspace-root features discovery — and the project rolled its own `findFiles` that walks `vwfs.readDirectory` recursively. 1.2.0's subdir scan is likely to follow the same hand-rolled pattern for consistency. The existing hand-rolled `findFiles` (line 449) takes an `excludeDirs` parameter with a `DEFAULT_EXCLUDE_DIRS` fallback (line 431: `__pycache__, .git, node_modules, .venv, .tox, .mypy_cache, .pytest_cache, .eggs, *.egg-info`). A scan that forgets to pass or honor that set will eat the monorepo alive.

**Consequences:**
- Activation time goes from <100ms to 5-30s; status bar shows "Behave: Parsing..." for the whole window
- `getUrisOfWkspFoldersWithFeatures()` no longer meets the `< 1ms` cached-path constraint on first call (it's *not* cached on the first call — only subsequent calls read the cache)
- On Linux, transitive opens of symlinked node_modules can trigger an infinite loop unless stat+link detection is in place
- User files a "extension hangs on startup" bug; no stack trace, looks like a VS Code problem

**Prevention:**
- **Reuse `DEFAULT_EXCLUDE_DIRS` from `src/common.ts:431`.** The subdir scan must accept a `Set<string>` of excludes and default to the same constant. Add `dist`, `out`, `build`, `.next`, `.nuxt`, `coverage`, `.vscode-test` explicitly if they are not already there (they aren't — verified).
- **Early-terminate on finding the first match.** First-match-wins is already the locked scoping decision; the scanner must stop descending once it finds a valid `[behave]` section anywhere in its current subtree, not continue scanning the rest of the workspace.
- **Breadth-first, not depth-first.** BFS with a queue means `workspace-root/` is probed before `workspace-root/packages/foo/`; a workspace-root `behave.ini` wins immediately and avoids scanning `packages/` at all.
- **Add a `maxEntriesScanned` circuit-breaker** (e.g. 5000 directories). Log a warning and fall back to "no config found" if breached — better to degrade to convention than freeze the extension host.
- **Benchmark with a real monorepo fixture.** Add `example-projects/monorepo-scan/` containing a seeded 1000-file `node_modules/` and assert total discovery time < 100ms.

**Warning signs:**
- `perf info: getUrisOfWkspFoldersWithFeatures took N ms` where N > 50
- Status bar stuck on "Behave: Parsing..." for > 1s on workspace open
- User reports of "VS Code frozen" on opening their monorepo

**Phase to address:** The phase that implements DISC-07 subdir scanning. Non-negotiable performance requirement — must land with the scanner itself, not a follow-up optimization.

---

### Pitfall 2: Multi-Path Test Tree Produces Duplicate Feature Nodes (Overlapping Paths)

**What goes wrong:** A user config has `paths = features\n  features/api` (parent and child in the same `paths=` list, which behave itself allows). The multi-path resolution produces `featuresUris = [<wkspRoot>/features, <wkspRoot>/features/api]`. The test-tree builder calls `findFiles(featuresUri, ...)` once per entry in `featuresUris`; the `.feature` files under `features/api/` appear in both calls. VS Code's `TestController` has no natural dedup — the same `.feature` file is added to the tree twice, each time as a sibling of the other. Find-step-refs returns two results per step. Running "Run All" tests executes every scenario twice.

**Why it happens:** The existing parser (`src/parsers/fileParser.ts:150`) calls `findFiles(wkspSettings.featuresUri, ...)` with a single URI. When `featuresUri` becomes `featuresUris[]`, the obvious refactor is a loop — but without a containment check between URIs in the list, overlapping paths silently duplicate. behave at runtime doesn't duplicate because its discovery flattens the union, but the VS Code-side tree builder has no such deduplication.

**Consequences:**
- Test tree shows the same scenario twice under the workspace node; users file this as a phantom "duplicate-scenario" bug, but the existing duplicate-scenario diagnostic (handled by `src/handlers/stepDiagnostics.ts`) doesn't fire because the two nodes have different `TestItem.id` values (each has the parent's featuresUri baked into its id)
- "Run All Tests" doubles runtime and may produce contradictory results if the two runs race on the same JUnit output file (`src/parsers/junitParser.ts`)
- Find-step-refs returns N*2 results — at best annoying, at worst confusing when scenarios have duplicate step names

**Prevention:**
- **Canonicalize + dedup `featuresUris` in `configParser.ts` before returning.** After `resolvePaths` produces the N URIs, sort by `fsPath` length ascending, then filter: drop any URI whose `fsPath` starts with another URI's `fsPath + path.sep`. This treats `features/api` as subsumed by `features`.
- **Warn the user** when dedup removes a path — add `notedContainedPaths: string[]` to the `BehaveConfigResult.ok:true` variant and surface via `updateDiscoveryUX` (one notification per config file per session, mirroring the `notifiedConfigErrors` pattern at `extension.ts:43`).
- **Use `uriId()` for comparison** — `src/common.ts:89` is the canonical case-insensitive-on-Windows URI matcher. Do NOT compare `fsPath` directly; Windows drive-letter casing will make `C:\features\api` not start with `c:\features\`.
- **Unit test the dedup matrix:** `[features, features/api]` → `[features]`; `[features/a, features/b]` → both retained; `[features, FEATURES]` on Windows → `[features]` only.

**Warning signs:**
- Integration test scenario count doubles silently after 1.2.0 merges
- "Run All" takes 2× as long on an unchanged fixture
- Find-step-refs returns duplicate entries in a fixture with no duplicates in the raw step files

**Phase to address:** DISC-08 multi-path parsing phase — dedup must land in the parser layer, not the test-tree layer. Test-tree fix-ups are patches around the underlying problem.

---

### Pitfall 3: `WorkspaceSettings.featuresUri` Is Scalar — Single-Property Rename Breaks 18 Files

**What goes wrong:** `featuresUri` is read in 18 files (verified via grep). Changing its type from `vscode.Uri` to `vscode.Uri[]` requires touching every consumer: `junitParser.ts` builds JUnit dir paths per-feature-root, `codeLensProvider.ts` filters documents by containment, `fixtureParser.ts` locates `environment.py` relative to features root, `stepsParser.ts` expects a single ancestor for `steps/` resolution, `workspaceWatcher.ts` creates a watcher per features path, `testRunHandler.ts:199` computes a single `idMatch = uriId(wkspSettings.featuresUri)` to scope the run queue. If the breaking rename is done first ("rename `featuresUri` to `featuresUris`"), every consumer breaks in a different way — some at compile time, some only on specific runtime paths (e.g. the JUnit dir computation is reached only during a test run).

**Why it happens:** The instinct is "just make it an array." But the consumers have semantically different needs: some want "the one canonical path" (JUnit dir, idMatch), others want "iterate every path" (findFiles, watchers), and a third group wants "does this file live under any of our paths?" (codeLensProvider, find-step-refs). A single property rename collapses three distinct questions into one, and each consumer has to invent its own answer.

**Consequences:**
- Integration tests pass on the happy path (single-path config) but the JUnit dir silently uses `featuresUris[0]` when the user's config has multiple paths, meaning test-result reporting for scenarios under `featuresUris[1]` hits the wrong directory and fails with "JUnit file not found"
- The run queue `idMatch` check silently excludes scenarios under non-first paths from "Run All" selections
- `codeLensProvider` shows "no step references found" for files under `featuresUris[1]` because its containment check hard-codes `featuresUri`

**Prevention:**
- **Keep `featuresUri` as a scalar "primary path" AND add `featuresUris: vscode.Uri[]` as the full list.** `featuresUri` becomes `featuresUris[0]` by construction, preserving backward compatibility for the 15+ sites that want "the canonical one." Sites that need to iterate opt in explicitly via `featuresUris`.
- **Add a `WorkspaceSettings.isFileInFeatures(uri: vscode.Uri): boolean` helper.** Every containment check in the 18 files goes through this one method. Implementation: `featuresUris.some(fu => uri.path.startsWith(fu.path + '/'))`. This collapses the third consumer group to one call site.
- **Changeset audit:** before merging the multi-path PR, grep `featuresUri` and classify each read site as "primary", "iterate", or "contains". Apply the right replacement per class.
- **JUnit dir must be unique per workspace, not per features path.** The JUnit watcher (`src/watchers/junitWatcher.ts`) assumes one junit dir per workspace. Multi-path runs still emit to one junit dir; the parser already uses scenario-qualified filenames so no collision.

**Warning signs:**
- TypeScript compile errors in 5+ files after the rename — that's the visible ones; the invisible ones are runtime-only
- `runAllTests` integration test passes but scenarios appear as "skipped" when added under a non-first features path
- find-step-refs suddenly returns empty for files under a second path

**Phase to address:** DISC-08 — refactor phase. Introduce the primary-plus-list pattern before wiring multi-path through, not after. Do one prep commit (add `featuresUris[]` defaulting to `[featuresUri]`, add `isFileInFeatures`), land all the consumer migrations, THEN start returning real multi-path from the parser.

---

### Pitfall 4: Empty `featuresPaths: []` Silently Disables Discovery

**What goes wrong:** A user reads the 1.2.0 release notes, sees the new `gs-behave-bdd.featuresPaths` array setting, and adds `"gs-behave-bdd.featuresPaths": []` to settings.json as a "placeholder" before filling it in. The `hasExplicitSetting` check at `src/common.ts:142` fires true (the setting exists at workspace-folder scope), Branch A runs, and `featuresPath` (the singular legacy key) is undefined. The current code (`common.ts:189-246`) interprets "no featuresPath and default features/ folder exists" as success with convention fallback — but if `featuresPaths` is set to `[]`, the plural-wins rule from the PROJECT.md key decisions says "empty array = user explicitly said no paths." The test tree is empty, no error surfaces, user thinks 1.2.0 broke their setup.

**Why it happens:** There are two overlapping signals: "plural setting wins if both are set" and "plural empty is distinct from plural unset." VS Code's `getConfiguration` returns `[]` (empty array) and `undefined` (never set) as different values, and the extension must pick a reasonable interpretation. The behave-native behavior for `paths =` (empty) in INI is "fall back to default," not "no paths."

**Consequences:**
- Silent empty test tree. User has to open the output channel and search for the discovery log to figure out what happened.
- Integration tests that set `featuresPaths: []` (thinking it's a reset) break in confusing ways.
- If multi-path ever gets merged with auto-migration tooling, the migrator producing `featuresPaths: []` for users with no prior config becomes a ship-breaker.

**Prevention:**
- **Treat `featuresPaths: []` as "setting not explicitly set" for discovery purposes.** In `hasExplicitSetting` (or a sibling `hasExplicitArraySetting`), return false when the array is empty. This matches behave's own `paths=` (empty) semantics.
- **If `featuresPaths[0]` is an empty string** (single element, empty content) also treat as "not set." Same for `"."` (see Pitfall 8 for `.` semantics).
- **Warn when `featuresPaths` is set AND `featuresPath` is also set.** The decision "plural wins if both set" is user-hostile when they didn't realize both were set (e.g. inherited from global settings). Log an info message: "Both `featuresPath` and `featuresPaths` are set; using `featuresPaths` and ignoring `featuresPath`" — via `config.logger.logInfo`, not a popup.
- **Add a unit test:** `featuresPaths: []` → behaves identically to setting-absent. `featuresPaths: ["features", ""]` → filters to `["features"]`. `featuresPaths: [".", "features"]` → `.` rejected (it's already rejected for `featuresPath` at `settings.ts:160`, keep the rejection for arrays).

**Warning signs:**
- A user's test tree is empty but `settings.json` contains `gs-behave-bdd.featuresPaths: []` or `[""]`
- Output channel log: "Discovery source: settings" followed by no further output
- Integration test that passed in 1.1.0 fails in 1.2.0 after adding `featuresPaths` to testConfig

**Phase to address:** DISC-08 — settings wiring phase. Must cover this in unit tests for `WorkspaceSettings` before wiring through to `WkspRun`.

---

### Pitfall 5: Config Watcher Glob Fans Out in Monorepos — 50 Watchers on a Single Save

**What goes wrong:** 1.1.0 shipped `CONFIG_GLOB = '{behave.ini,.behaverc,setup.cfg,tox.ini,pyproject.toml}'` anchored to `wkspUri` (`configWatcher.ts:9`). This is a workspace-root glob — it fires only for config files in the workspace root. With 1.2.0 subdir scanning, the watcher glob must become `**/{behave.ini,.behaverc,setup.cfg,tox.ini,pyproject.toml}` to catch config files created/edited/deleted at any depth. But VS Code's FileSystemWatcher with `**/` globs has documented performance issues on Windows (spawns a per-directory listener under the hood, receives 2-3 event duplicates per change, and is one of the top contributors to reported extension-host slowdowns per VS Code issues #3025, #60813). A monorepo with 50 `pyproject.toml` files under `packages/` (one per sub-package, typical for a pnpm/yarn monorepo) generates 50 watcher registrations, each firing on every save.

**Why it happens:** `**/` is the natural glob for "I don't know where the config is." But VS Code's watcher wraps chokidar on Windows, which iterates on every match. Subdir scanning at discovery time is one-shot and bounded; watcher fan-out is continuous.

**Consequences:**
- Saving any `.toml` file anywhere in the workspace triggers the watcher, invokes the 500ms debounce per workspace, and re-runs `getUrisOfWkspFoldersWithFeatures(true)`. In a workspace with a dozen `pyproject.toml` files, unrelated TOML edits (e.g. Poetry dependency bumps) silently re-run discovery.
- On Windows with antivirus scanning, watcher event storms can produce 100ms+ of extension-host blocking per save.
- The user's `files.watcherExclude` is honored (1.1.0 Pitfall 12), but defaults don't exclude `packages/*/pyproject.toml` — only `node_modules`.

**Prevention:**
- **Anchor the watcher glob to the discovered config file's directory, not the workspace root.** After subdir scan finds `packages/frontend/behave.ini`, create the watcher with `new vscode.RelativePattern(wkspUri, 'packages/frontend/{behave.ini,...}')` — a narrow glob, one directory deep. The old 1.1.0 workspace-root watcher stays as a fallback for "config deleted, need to know when one is re-created."
- **Two-tier watcher strategy:**
  - Tier 1: narrow watcher at the discovered config's directory — fires on the specific file's change/delete. This is the hot path.
  - Tier 2: one workspace-wide `**/{behave.ini,.behaverc,...}` watcher but **only registered if no config was discovered.** Fires once when a user creates their first config file, which triggers re-discovery and the creation of the Tier 1 watcher. This avoids the fan-out on normal operation.
- **Do not mirror multi-path into multi-watcher.** One config file → one Tier 1 watcher, even if that config lists multiple feature paths. Feature-path changes are detected by re-parsing the config on a single file's change, not by watching each feature directory for config events (the `workspaceWatcher.ts` already handles feature file churn separately).
- **Honor `DEFAULT_EXCLUDE_DIRS` in the Tier 2 glob.** Pattern: `'**/{behave.ini,.behaverc,setup.cfg,tox.ini,pyproject.toml}'` with a companion `files.watcherExclude`-style filter in the handler that rejects events under `node_modules/`, `.git/`, `dist/`, etc. even if the watcher delivers them.

**Warning signs:**
- `diagLog: configWatcher: change detected for .../node_modules/some-pkg/pyproject.toml` — should never happen
- Editing an unrelated `pyproject.toml` in a monorepo re-runs the Behave discovery log
- Extension-host CPU spike on every save in a monorepo

**Phase to address:** The phase that implements DISC-07 subdir scanning. Watcher strategy must land with the scanner, not as a follow-up. Extend `startWatchingConfigFiles` to accept the discovered `configFileUri` and compute a narrow pattern from it.

---

### Pitfall 6: Subdir Scan Finds Malformed Config First, Never Tries Deeper Configs

**What goes wrong:** `searchConfigFiles` in `configParser.ts:36-49` already has the right shape: malformed configs (`ok:false`) are captured as `firstError` but the loop continues; a later valid config (`ok:true`) wins over the captured error. This is the D-06 decision, already correct.

The 1.2.0 subdir scan must preserve this semantic across both dimensions:
1. Priority-order (behave.ini, .behaverc, setup.cfg, tox.ini, pyproject.toml)
2. Depth-order (wkspRoot, depth 1, depth 2, depth 3)

The trap: the natural implementation is nested loops "for each depth, for each filename, probe." If the outer loop is depth and the inner is filename, a malformed `behave.ini` at depth 0 captures the error, loops through no other files at depth 0, descends to depth 1, and so on. Fine. But if someone writes it as "for each filename, for each depth," a malformed `behave.ini` at depth 0 will skip a valid `behave.ini` at depth 2 (unlikely) and also skip a valid `.behaverc` at depth 0 (plausible — the user keeps a legacy `behave.ini` around and their real config is `.behaverc`).

First-match-wins at depth level has a secondary trap: if a malformed config is found at depth 1 AND a valid config at depth 0 exists but was missed (e.g. depth-0 pass checked only one file type), first-match-wins returns the deeper malformed config. User ends up with an error popup even though their actual top-level config is fine.

**Why it happens:** behave's own discovery walks file priorities at a single location (the cwd) and doesn't search subdirectories. This project layers subdir scanning on top — there's no reference implementation to copy. The depth-vs-filename iteration order is a free design choice.

**Consequences:**
- "I have a working `.behaverc` but you're showing me a `behave.ini` parse error I didn't know existed" — confusing user report
- D-06 (malformed falls through to convention) silently weakens when depth-order wins over priority-order

**Prevention:**
- **Iteration order: depth outer, filename inner, priority-preserved.** At depth 0, try all 5 filenames in priority order; if any valid result, return it; if any malformed, capture `firstError` but keep searching at higher depth. At depth 1+, same thing. Return `firstError` only if no valid config found at any depth.
- **The captured `firstError` should be the **shallowest** error, not just the first-encountered.** If the scan finds a malformed `pyproject.toml` at depth 0 and a malformed `behave.ini` at depth 1, the more visible one to the user is depth 0. Current code already satisfies this because it iterates depth-outer.
- **Do NOT set `depthFound` on the DiscoveryEntry yet** — that's scope creep. Just log it in `diagLog` for debugging.
- **Unit test matrix:**
  - depth 0 malformed `behave.ini` + depth 1 valid `behave.ini` → deeper wins, no error surfaced
  - depth 0 valid `pyproject.toml` + depth 1 valid `behave.ini` → depth 0 wins (first-match)
  - depth 0 malformed `behave.ini` + depth 0 valid `.behaverc` → `.behaverc` wins (priority order within depth)
  - depth 0 valid `tox.ini` + depth 2 valid `behave.ini` → depth 0 wins, depth 2 never scanned

**Warning signs:**
- User reports "strange parse error for a config file I didn't know existed"
- The ok:false configError in the discovery cache points to a config file in a subdirectory but another valid config exists higher up

**Phase to address:** DISC-07 scanner implementation. Extend the existing `searchConfigFiles` contract (single-loop in `configParser.ts`) rather than adding a parallel depth-scan function.

---

### Pitfall 7: Run Guard Reads `configError` — Subdir Scan Changes Config File Identity Without Changing Error State

**What goes wrong:** 1.1.0 shipped `checkRunGuard` (from `runners/testRunHandler.ts`) reading `getDiscoveryEntry(wkspUri)?.configError` as the single source of truth (per D-decision "discovery cache is the single source of truth for runtime guards"). That works when the config file is at workspace root: the user edits `behave.ini`, watcher fires, cache rebuilds with new `configError`, guard reads correctly.

Under 1.2.0 subdir scanning, the discovered config might be at `packages/a/behave.ini`. User edits an unrelated file at `packages/b/behave.ini` (a different, not-yet-discovered config). The Tier 2 `**/` watcher fires (assuming it's active), debounce runs, `getUrisOfWkspFoldersWithFeatures(true)` re-runs the subdir scan, and first-match-wins re-selects `packages/a/behave.ini` (same as before) — but now the scanner also encountered `packages/b/behave.ini`, which is malformed. The first-match is healthy, so `configError` is undefined. The run guard sees a healthy cache and proceeds. User's run fails because behave itself, invoked with `cwd = packages/a/`, doesn't see `packages/b/behave.ini` and neither does the extension's discovery — this scenario is actually fine.

The real trap: user now moves `packages/a/behave.ini` (the chosen config) to be malformed, AND `packages/b/behave.ini` is valid. First-match at `packages/a/` returns ok:false with configError. But if the scanner's iteration caches results across scans, `packages/b` might be silently preferred in a later scan because its result is cached from last time. Result: run guard sometimes shows the error, sometimes doesn't, depending on which scan state is live.

**Why it happens:** The 1.0.0 `searchConfigFiles` is stateless (pure function of `wkspUri`). If 1.2.0 adds any memoization or pre-computed depth index for perf, statefulness creeps in. The existing `discoveryCache` is the only state, and it's per-workspace, which is fine. Per-config-file caching inside `searchConfigFiles` is where the bug enters.

**Consequences:**
- Run guard is non-deterministic across rapid config edits
- The watcher's 500ms debounce (1.1.0) interacts with stale cache (1.1.0 Pitfall 5) — stacking instead of isolated
- Flaky integration tests that depend on "edit config, run test, see error" timing

**Prevention:**
- **Keep `findBehaveConfig` stateless.** No per-config-file memoization. The discovery cache at the workspace level is sufficient; the subdir scan must re-enter `findBehaveConfig` on every refresh.
- **On `onDidChange` for a discovered config file, invalidate ONLY that workspace's discoveryCache entry, then re-scan.** This is what 1.1.0 already does — preserve it.
- **On `onDidCreate` of a config file in a different location than the current discovered one:** full re-scan. Do not assume the existing discovered config still wins — a new higher-priority or shallower config might be introduced.
- **On `onDidDelete` of the currently-discovered config:** full re-scan from scratch. Any cached knowledge about the scanner's traversal from the previous scan must not be reused.
- **Integration test: move `packages/a/behave.ini` to `packages/b/` (delete + create sequence). Assert the cache reflects `packages/b/` as the new `configFileUri` within ≤ 1s, verified via `waitForTestTree` predicate.**

**Warning signs:**
- Run guard shows warning for a config file that is no longer the discovered one
- `getDiscoveryEntry(wkspUri)?.configFileUri` doesn't match the result of a fresh `findBehaveConfig` call
- Integration tests flake on a "move config across directories" scenario

**Phase to address:** DISC-07 scanner phase. Defensive: write the scanner as a pure function. The full re-scan on every watcher event is the 1.1.0 pattern — don't optimize it away in 1.2.0 without careful thought.

---

### Pitfall 8: Windows Path Separator in INI Continuation Lines

**What goes wrong:** behave's INI parsing (via Python configparser) accepts continuation lines indented below a key:
```ini
[behave]
paths = features
  features-alt
  packages\foo\features
```
On Windows, the third continuation value contains a backslash. Python's `configparser` treats it literally as a path string; behave does `os.path` operations on it which silently normalize backslashes. The 1.0.0 INI parser (`configParser.ts:57-118`) handles continuation correctly but produces raw strings from `line.trim()`, preserving whatever separators the user wrote.

When `resolvePaths` (currently at `configParser.ts:158`) resolves the path:
- For Unix absolute `/foo/bar`: `vscode.Uri.file()` handles it.
- For Windows absolute `C:\foo`: the regex `/^[a-zA-Z]:[\\/]/` matches; `vscode.Uri.file()` handles it.
- For relative `packages\foo\features`: `vscode.Uri.joinPath(configDirUri, rawPath)` is called. `vscode.Uri.joinPath` is platform-native and on Windows **does** accept backslash separators, converting to forward slash internally. BUT on Unix, a backslash in the rawPath is treated as part of the filename — `packages\foo\features` becomes a single-segment name.

For 1.2.0 multi-path, this extends to every entry in `rawPaths[]`. A Windows user writing `paths = features-win\alt` in their committed `behave.ini` ships a config that fails silently on macOS coworkers' machines — the path becomes a literal filename, `fs.existsSync` returns false, and the discovery falls through to convention with no warning.

**Why it happens:** Python-on-Windows is forgiving about separators; Node-on-Unix is not. The existing `resolvePaths` already lives with this compromise for single-path (1.0.0), but the blast radius of silently-wrong paths grows linearly with the number of paths in `featuresUris[]`.

**Consequences:**
- Cross-platform monorepo team: Windows dev commits `behave.ini` with backslashes, macOS CI runs behave successfully (behave normalizes), but the VS Code test tree on the macOS dev's machine is empty. Extension looks broken on Mac, works on Windows — hard to diagnose.
- If the path happens to match a valid filename on Unix (e.g. a directory literally named `features-win\alt`, which is technically valid on POSIX), the extension silently discovers the wrong directory.

**Prevention:**
- **Normalize separators in `resolvePaths` before URI construction.** Replace all `\` with `/` in `rawPath` before both the absolute-path regex and `vscode.Uri.joinPath`. This is safe because:
  - Windows paths with forward slashes work natively
  - Unix paths never contain backslashes legitimately in practice (spec allows it; nobody does)
  - behave's own behavior matches (Python `os.path` normalizes on Windows)
- **Emit a warning when normalization fires.** Log at `diagLog` level: `"Normalized backslashes in paths[${i}]: ${rawPath}"` — helps cross-platform debugging.
- **Document in the settings.json schema description for `featuresPaths`:** "Use forward slashes (`/`) even on Windows. Backslashes are normalized but are discouraged for cross-platform compatibility."
- **Unit test:** `paths = features\\alt` on Linux (string literal `features\alt` after trim) → resolves to `<wksp>/features/alt`, not a file named `features\alt`.

**Warning signs:**
- macOS/Linux user with a Windows coworker reports "tests appear in the tree on my colleague's machine but not mine"
- The output channel log shows `Features directory: /workspace/features\alt` on Unix (backslash visible in the path)
- `fs.existsSync` returns false for a path the user swears exists

**Phase to address:** DISC-08 multi-path parsing phase. Normalization lives in `resolvePaths` and applies to every rawPath, not just `rawPaths[0]` (which is all 1.0.0 does).

---

### Pitfall 9: Symlink Cycles in Subdir Scan — Infinite Recursion on Linux/macOS

**What goes wrong:** A monorepo uses symlinks for internal package linking (`packages/b/node_modules/@org/a → ../../a`). The existing `findFiles` in `common.ts:458` calls `vwfs.readDirectory(directory)` which follows symlinks by default. A depth-3 limit prevents infinite recursion, but the limit counts *directory traversals*, not *distinct directories*. A cycle `a → b → a → b → ...` still terminates at depth 3 but visits `a` and `b` twice, doubling work per cycle. In the worst case (a full `pnpm` workspace with symlinks between every package), a depth-3 scan can explore thousands of already-visited directories.

**Why it happens:** Python's `os.walk` has a `followlinks=False` default and handles this gracefully. Node's `fs.readdirSync` and VS Code's `vscode.workspace.fs.readDirectory` follow symlinks unconditionally. The existing `findFiles` has no symlink detection.

**Consequences:**
- Subdir scan takes 5-10× longer than expected on pnpm monorepos
- On pathological symlink graphs, the depth budget is exhausted before reaching workspaces that would contain real configs

**Prevention:**
- **Track visited real-paths in the scanner.** `const visited = new Set<string>()` keyed by `fs.realpathSync(dirPath)`. Before descending into a subdirectory, check and add. Skip if already visited.
- **Use `fs.realpath` not `fs.realpathSync`** for async-friendly behavior; but given the scan is bounded, sync is acceptable.
- **This does NOT apply to feature-file discovery** (`findFiles` under `featuresUri`) because feature paths are user-asserted to be valid directories and typically don't contain symlink cycles. Only the 1.2.0 config subdir scanner needs this protection.

**Warning signs:**
- Subdir scan time is 10× higher on a pnpm/yarn-workspaces monorepo than on a plain repo of the same nominal size
- Log noise: repeated `configWatcher: ... packages/<same-pkg>/pyproject.toml` from different symlink paths

**Phase to address:** DISC-07 scanner implementation. Include symlink detection in the initial scanner, do not retrofit.

---

## Moderate Pitfalls

---

### Pitfall 10: Mid-Run Config Change Disrupts Test Tree Reconciliation

**What goes wrong:** User starts a test run. Watcher fires mid-run (unrelated config edit), debounce elapses, `parser.clearTestItemsAndParseFilesForAllWorkspaces(...)` is invoked from the config watcher callback. This clears TestItems that are currently part of the active `TestRun.queue`. VS Code's Test Controller allows this but emits warnings; the scenarios being cleared may be stuck in "Running" state forever because no result is ever reported for a deleted `TestItem`.

**Why it happens:** 1.1.0's `configWatcher.ts:58-59` calls `onConfigChanged` AND `parser.parseFilesForWorkspace` without checking whether a test run is active. For 1.1.0 with a single config file and a single features path, the blast radius was small: the watcher fires on an actual config change, which is rare mid-run. 1.2.0's subdir scan + multi-path means watcher events are more frequent, and mid-run config edits become more likely (e.g. a user saving `pyproject.toml` while debugging a scenario).

**Consequences:**
- Scenario stuck in "Running" state; user has to manually cancel the run
- `testRunHandler.ts` may throw a `WkspError` if it tries to report against a disposed TestItem

**Prevention:**
- **Check `!!ctrl.activeRuns?.length` (or equivalent) in the config watcher debounced callback** before invoking `parseFilesForWorkspace`. If a run is active, queue the re-parse for after completion. Pattern mirror: `junitWatcher.ts` already does "defer rebuild during active run."
- **Alternative simpler approach: pass `forceRefresh=false` to the parser during active run, and schedule a forced refresh for when the run ends.** The discovery cache can still be invalidated (run guard correctness), just the test-tree rebuild is deferred.
- **Integration test:** start a slow test, mid-run edit `behave.ini` (trivially, add whitespace), verify the run completes and the tree reflects the edit on completion.

**Warning signs:**
- Test scenarios stuck in "Running" state that only recover on window reload
- Integration test `flakiness-gate` starts failing on the mid-run config edit case

**Phase to address:** DISC-07/08 integration phase — after both features are wired, before merging. This is a race-window concern that only manifests once subdir scanning + multi-path increase event frequency.

---

### Pitfall 11: `waitForTestTree` Predicate Must Handle Multi-Path Tree Structure

**What goes wrong:** 1.1.0 introduced `waitForTestTree` (`test/integration/suite-shared/waitForTestTree.ts`) as a predicate-polling primitive. Existing predicates likely check "top-level node has N children" or "scenario X exists under feature Y." With multi-path, the top-level tree structure changes: instead of one "features/" node per workspace, there could be N sibling nodes (one per path in `featuresUris[]`). Existing predicates that count top-level children break silently (N instead of 1).

**Why it happens:** The test-tree builder at `parsers/testFile.ts` groups features by their `featuresUri`. Multi-path means N groups, and any test that asserted "I can find my scenario by walking `topLevel.children[0]`" now has to walk all children and search.

**Consequences:**
- All existing integration tests that walk the tree by index break
- `waitForTestTree` predicates produce false positives (find the expected scenario under path 0, predicate returns true) or false negatives (search only under path 0, miss the real result)

**Prevention:**
- **Audit `waitForTestTree` usage before merging multi-path.** Every predicate function that walks `ctrl.items` must handle multiple top-level paths. Pattern: use `TestItem.uri` to identify scenarios, never positional index.
- **Extend `waitForTestTree` helpers with `findScenario(ctrl, featurePath, scenarioName)` that searches all top-level nodes.** Centralizes the search logic; prevents ad-hoc index-based walks.
- **Run the full integration suite against a single-path fixture AND a multi-path fixture** (new in 1.2.0) as separate parametrizations. Any predicate that passes on single-path but fails on multi-path is a bug.

**Warning signs:**
- An integration test that passed in 1.1.0 fails in 1.2.0 with "expected TestItem X not found" where X exists under a non-first features path
- `waitForTestTree` times out against a multi-path fixture but a manual inspection shows the expected state is present

**Phase to address:** Integration-test phase of 1.2.0. Fixture changes + predicate audit together.

---

### Pitfall 12: Fixture Pollution Across Suites — Multi-Path Fixture Needs Its Own Root

**What goes wrong:** 1.1.0 established the pattern "dedicated `example-projects/` fixture per fs-mutating suite" (D-05; pattern codified as `watcher-integration/`). 1.2.0 adds two new test surfaces:
1. Multi-path: config file with `paths = features\n  features-alt`.
2. Subdir scan: config file at `packages/frontend/behave.ini`.

If either test reuses an existing fixture (e.g. `watcher-integration/` for its fs-mutation convenience), the tests silently cross-pollinate: a 1.2.0 test edits `watcher-integration/behave.ini` to add a second path, subsequent 1.1.0 tests fail because the fixture state is no longer the single-path baseline they expected.

**Why it happens:** Fixture reuse is tempting for developer convenience. The 1.1.0 retrospective flagged this explicitly (D-05), and the pattern worked because one suite per fixture was enforced. 1.2.0's two-axis feature expansion pressures the pattern.

**Prevention:**
- **Two new fixtures:** `example-projects/multi-path/` (single config, `paths=features,features-alt`) and `example-projects/monorepo-scan/` (config at `packages/app/behave.ini`, multi-package structure).
- **Neither fixture should be used for watcher-integration tests.** Watcher tests continue to use `watcher-integration/`. Multi-path + watcher interactions get their own fixture or use the same multi-path fixture with suiteSetup snapshot-restore.
- **Assert zero cross-dependency in `suiteSetup`:** each suite asserts its fixture directory is in a known-clean state (e.g. no `.behaverc` in a fixture that should only have `behave.ini`). Fail fast with a clear error rather than continuing against corrupt state.

**Warning signs:**
- A test passes in isolation but fails when the full suite runs
- `suiteTeardown` leaves artifacts (the one failure mode D-05 called out specifically)

**Phase to address:** Integration-test phase of 1.2.0. Plan the fixture matrix before writing the tests.

---

### Pitfall 13: Migration Path — User With `featuresPath: "features"` Plus `featuresPaths: ["features-alt"]`

**What goes wrong:** User upgrades from 1.1.0 to 1.2.0, reads the changelog, and adds `featuresPaths: ["features-alt"]` to settings.json alongside their existing `featuresPath: "features"`. PROJECT.md's locked decision says "plural wins if both set," so `featuresPaths[0] = features-alt` becomes the only path; `features` is silently dropped. User expected both to be combined (plural = additive on top of singular).

**Why it happens:** "Wins" is one of three reasonable semantics: "replaces", "merges", or "invalid configuration". Users are as likely to assume merge as replace. Without a warning, they lose coverage silently.

**Consequences:**
- Silent coverage loss. The scenarios under `features/` never appear in the test tree after the upgrade.
- User reports "upgrade broke my tests" — hard to diagnose without output channel logs.

**Prevention:**
- **When both are set, log a high-visibility info message** (not a popup — anti-feature per 1.0.0 key decisions): `"Both 'featuresPath' and 'featuresPaths' are set. 'featuresPaths' takes precedence; 'featuresPath' is ignored. Remove 'featuresPath' from settings.json to suppress this message."`. Use `config.logger.logInfo` so it's one line in the Behave BDD output channel.
- **Consider: auto-migrate `featuresPath` into `featuresPaths[0]` (in-memory, not settings.json) when only singular is set.** Internally the code always reads `featuresUris[]`; the migration is transparent and keeps `featuresPath` semantically additive if a user adds a plural later. This is a scoping choice — the "plural wins" decision might need a caveat about "plural wins but singular is concatenated as [0]" for merge semantics. Document whichever choice is made in PROJECT.md key decisions.
- **Release notes call-out:** explicit paragraph on the interaction. Not a README update (out of scope for 1.2.0 per PROJECT.md), but a CHANGELOG entry.

**Warning signs:**
- Post-release bug reports of "upgrade lost my features"
- Output channel log silent about the setting interaction

**Phase to address:** Settings resolution phase (DISC-08). Decide merge-vs-replace before the parser wiring, not after.

---

### Pitfall 14: Integration-Test `integrationTestRun` Bypass Still Lives in `configurationChangedHandler`

**What goes wrong:** 1.1.0 explicitly documented this in Pitfall 14 of the previous PITFALLS doc: `configurationChangedHandler` has `if (config.integrationTestRun && !testCfg) return;` at `extension.ts:582`. 1.1.0's fix was "config watcher calls cache refresh directly, not through `configurationChangedHandler`" (confirmed at `configWatcher.ts:53-59`).

For 1.2.0, any new code path that triggers full re-discovery (e.g. "subdir scan found a new config") must follow the same rule: do not delegate through `configurationChangedHandler`. The temptation is to route through the single choke point (1.1.0's "single choke-point callback" pattern from the retrospective), but that pattern's reuse-semantics were carefully calibrated for watcher-triggered changes. A full re-scan on detection of a new config file at depth 2 is architecturally similar but not identical — and silently hitting the `integrationTestRun` guard breaks integration tests for that path.

**Why it happens:** The retrospective key lesson was "make the main handler absorb the work." Applied mechanically, that means routing every re-discovery through `configurationChangedHandler`. The asterisk — "except under integration test, which the single choke point bypasses" — is easy to forget for new code.

**Prevention:**
- **For any new 1.2.0 trigger of re-discovery (subdir scan detecting config creation, watcher handling a file create event at an unexpected depth), call `getUrisOfWkspFoldersWithFeatures(true) + config.reloadSettings(wkspUri) + parser.parseFilesForWorkspace(...)` directly.** Mirror the 1.1.0 `configWatcher.ts:56-59` pattern exactly.
- **Do NOT remove the `integrationTestRun` guard from `configurationChangedHandler`.** It's load-bearing for `runAllTestsAndAssertTheResults`.
- **Integration tests for 1.2.0 subdir scanning MUST invoke the scanner without going through `configurationChangedHandler`.** Use the `testCfg` path or the direct `parser.parseFilesForWorkspace` call.

**Warning signs:**
- Integration test for "create a new `behave.ini` at depth 2" passes trivially (the re-discovery never fired because of the bypass)
- `config.integrationTestRun` is never set-true in a test that should exercise the watcher path

**Phase to address:** Any phase that adds a new discovery trigger. Propagate the 1.1.0 pattern.

---

### Pitfall 15: `workspaceWatcher` Needs One Watcher Per Features Path

**What goes wrong:** `workspaceWatcher.ts:13-14` creates a FileSystemWatcher with `new vscode.RelativePattern(wkspSettings.uri, '${wkspSettings.workspaceRelativeFeaturesPath}/**')` — one watcher, glob anchored to the single features path. With multi-path, adding a `.feature` file under `featuresUris[1]` won't fire this watcher; the tree silently doesn't update.

**Why it happens:** The watcher's pattern was correct for 1.0.0 (one features path). 1.2.0's per-path expansion must touch this file.

**Prevention:**
- **`startWatchingWorkspace` iterates `featuresUris[]` and creates one watcher per path.** Returns the union as `FileSystemWatcher[]`. The existing `wkspWatchers: Map<Uri, FileSystemWatcher[]>` already supports multiple watchers per workspace, so the Map shape doesn't change.
- **Each watcher's handler must know its `featuresUri`.** Currently the handler delegates to `parser.reparseFile(uri, ...)` which uses `wkspSettings` — that still works because the settings object captures all paths. No per-watcher state is needed.
- **Dispose each watcher independently in `configurationChangedHandler`** — the existing `oldWatchers.forEach(w => w.dispose())` at `extension.ts:612-613` already handles this correctly.
- **Steps-folder watcher (`watcher2` at `workspaceWatcher.ts:22`):** the "steps folder is not in features folder" condition at line 19 must be evaluated per path. If ANY `featuresUri[i]` does not contain the `stepsSearchUri`, create the steps watcher. In practice `stepsSearchUri` is derived from `featuresUris[0]`; keep it that way and document.

**Warning signs:**
- Adding `.feature` file under a non-first features path doesn't update the tree
- The tree updates on file add under path 0 but not path 1

**Phase to address:** DISC-08 multi-path phase. Watcher fan-out is a derived consequence of multi-path; land them together.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Make `featuresUri` an array; rename every consumer | Less code in the primary consumer | 18-file refactor, every reader has to case-analyze; bugs in reader sites are invisible | Never — use the dual primary-plus-list pattern (Pitfall 3) |
| Skip subdir scan exclude list; "users don't have weird node_modules" | 3 lines less code | Silent monorepo freeze, user-facing "extension hangs" bug | Never — reuse existing `DEFAULT_EXCLUDE_DIRS` from day one |
| Use `**/{configs}` watcher glob workspace-wide | Simple, fires on every config change anywhere | 50 watcher fan-out in monorepo; performance spike on unrelated edits | Only as Tier 2 fallback for "no config found yet" |
| Treat `featuresPaths: []` as valid empty discovery | "The user said empty, they meant empty" | Upgrade paths break silently; indistinguishable from absent setting | Never — treat empty as unset (Pitfall 4) |
| Cache subdir scan results per-file inside `searchConfigFiles` | Avoid re-reading files on back-to-back scans | Run guard becomes non-deterministic; watcher invalidation races | Never — rely on the per-workspace `discoveryCache` |
| Skip symlink detection in depth scan | Simpler recursive function | 10× scan time on pnpm monorepos; possible infinite recursion on pathological graphs | Never — pnpm is table stakes for JS monorepos |
| Inline backslash normalization only when tested | Fewer code paths | Cross-platform regression slips through; macOS user gets silent empty tree | Always normalize — safe on both platforms |
| Delegate 1.2.0 re-discovery through `configurationChangedHandler` for "single choke point" | Mirrors 1.1.0 retrospective wisdom | Integration tests silently bypass via `integrationTestRun` guard | Never — call cache+parser directly per 1.1.0 Pitfall 14 |

---

## Integration Gotchas

| Integration point | Common Mistake | Correct Approach |
|---|---|---|
| `WorkspaceSettings` singular → plural | Rename `featuresUri` to `featuresUris` | Keep `featuresUri` as primary; add `featuresUris[]` list; add `isFileInFeatures(uri)` helper (Pitfall 3) |
| `common.ts` `hasExplicitSetting` | Treat any-defined array as "explicitly set" | Empty-array and whitespace-only array → "unset" for multi-path (Pitfall 4) |
| `configParser.resolvePaths` | Resolve only `rawPaths[0]` (1.0.0 behavior) | Resolve every entry; dedup subsumed paths; normalize backslashes (Pitfalls 2, 8) |
| `configWatcher.ts` glob | Extend to `**/{configs}` everywhere | Two-tier: narrow watcher at discovered dir + fallback workspace-wide only when no config (Pitfall 5) |
| `workspaceWatcher.ts` pattern | Keep single pattern; assume featuresUri scalar | Iterate `featuresUris[]`; one watcher per path (Pitfall 15) |
| `testRunHandler` `idMatch` | `uriId(featuresUri)` — single id | Compute `idMatches = featuresUris.map(uriId)` and check `.some()` |
| `junitWatcher` per-scenario routing | Assume one features root per workspace | Already filename-scoped; one junitDir per workspace is fine as-is |
| `codeLensProvider` file-in-workspace check | `uri.path.startsWith(featuresUri.path)` | Route through `isFileInFeatures(uri)` helper (Pitfall 3) |
| Integration tests | Reuse `watcher-integration/` fixture | Two new fixtures: `multi-path/` and `monorepo-scan/` (Pitfall 12) |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Subdir scan without exclude list | Activation > 1s; status bar stuck "Parsing..." | Reuse `DEFAULT_EXCLUDE_DIRS`; add `dist`, `out`, `build` | First user with `node_modules/` in workspace (immediate) |
| Depth scan BFS vs DFS | Deep trees scanned before shallow root | BFS with early-termination on first match | Workspace with 5+ directories at root, any of which contains `behave.ini` |
| `**/` watcher glob fan-out | Per-save extension CPU spike in monorepo | Narrow Tier 1 watcher at discovered config dir | Monorepo with 20+ `pyproject.toml` files (common at ≥ 5-package pnpm workspace) |
| Symlink recursion | Scan time 10× on pnpm workspace | `fs.realpathSync` + visited-set | Any pnpm workspace with internal linking (default) |
| Per-config-file cache inside scanner | Non-deterministic run guard | Keep `findBehaveConfig` pure; cache only at `discoveryCache` level | Immediately under rapid config edits (watcher debounce wakeups) |
| Multi-path findFiles without dedup | Doubled scenario count; doubled run time | Containment-based dedup in parser before returning | Any user with `paths = features\n  features/sub` |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Silent discovery of subdir config when user expected workspace-root | "Where is it finding this `behave.ini` from?" | Log `Config file: <path>` prominently at Info level in output channel (already done in `extension.ts:77`) |
| Subdir scan finds 2+ configs, first-match-wins without warning | User has no idea there's a second config being ignored | Log + one-time notification: "Behave BDD: Found N config files. Using: X. Set `gs-behave-bdd.projectPath` to choose a specific one." (existing `notifiedConfigErrors` pattern) |
| `featuresPaths: []` gives empty tree with no diagnostic | "Extension broke" | Log info message; treat as unset (Pitfall 4) |
| Cross-platform path separator surprise | Tests visible on Windows colleague's machine, empty on Mac | Normalize + schema description warning (Pitfall 8) |
| Multi-path coverage loss on upgrade | Silent drop of legacy `featuresPath` | Info-level log when both singular and plural set (Pitfall 13) |
| Status bar stuck on "Parsing..." during subdir scan | Looks frozen | `< 1ms` budget — performance target, not UX polish |
| Run guard false positive after config rename/move | "Why does this still show an error?" | Full re-scan on create/delete; invalidate discovery cache fully (Pitfall 7) |

---

## "Looks Done But Isn't" Checklist

- [ ] **Multi-path parsing:** Often missing path deduplication — verify `paths = features\n  features/api` produces one feature tree, not two (Pitfall 2)
- [ ] **Multi-path test tree:** Often missing per-path watcher — verify creating a `.feature` under `featuresUris[1]` updates the tree (Pitfall 15)
- [ ] **Subdir scanner:** Often missing exclude dir list — verify discovery time on a fixture with seeded `node_modules/` is < 100ms (Pitfall 1)
- [ ] **Subdir scanner:** Often missing symlink detection — verify pnpm fixture scan terminates and is bounded (Pitfall 9)
- [ ] **Watcher glob:** Often uses `**/{configs}` everywhere — verify unrelated `pyproject.toml` saves do NOT trigger re-discovery (Pitfall 5)
- [ ] **`featuresPaths: []`:** Often treated as "user said empty" — verify empty array behaves identically to setting-absent (Pitfall 4)
- [ ] **Path separator:** Often unnormalized — verify `paths = features\alt` on Linux discovers `features/alt`, not a file named literally `features\alt` (Pitfall 8)
- [ ] **Run guard with subdir scan:** Often assumes first-match is stable — verify move of discovered config to sibling directory updates the cache and guard correctly (Pitfall 7)
- [ ] **`WorkspaceSettings.featuresUri` scalar:** Often renamed to plural and left — verify all 18 existing read sites still work (Pitfall 3)
- [ ] **Integration tests:** Often reuse existing fixture — verify new tests have dedicated fixtures (Pitfall 12)
- [ ] **Mid-run config edit:** Often hangs a scenario — verify edit during run completes run cleanly (Pitfall 10)
- [ ] **Config watcher re-discovery:** Often delegated through `configurationChangedHandler` — verify `integrationTestRun` guard doesn't bypass new path (Pitfall 14)
- [ ] **`featuresPath` + `featuresPaths` coexistence:** Often silently drops singular — verify info message in output channel (Pitfall 13)

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Pitfall 1 (`node_modules` scan freeze) | LOW | Add `DEFAULT_EXCLUDE_DIRS` to scanner; hot-fix release |
| Pitfall 2 (duplicate feature nodes) | MEDIUM | Add dedup in `resolvePaths`; add diagnostic for overlapping paths; re-run affected users' projects |
| Pitfall 3 (18-file rename breakage) | HIGH | Revert rename; re-land as primary-plus-list; audit each site manually |
| Pitfall 4 (empty array kills tree) | LOW | Treat empty as unset; release note on upgrade |
| Pitfall 5 (watcher fan-out) | MEDIUM | Two-tier watcher split; refactor `startWatchingConfigFiles` to accept config URI |
| Pitfall 6 (iteration order) | LOW | Re-order nested loops; add unit test matrix |
| Pitfall 7 (stale run guard) | MEDIUM | Keep scanner pure; full re-scan on watcher events; integration test for move scenario |
| Pitfall 8 (path separator) | LOW | Normalize in `resolvePaths`; add schema description |
| Pitfall 9 (symlink recursion) | MEDIUM | Add `visited: Set<realPath>`; instrument scan timing |
| Pitfall 10 (mid-run disruption) | MEDIUM | Check `ctrl.activeRuns` in watcher callback; defer re-parse |
| Pitfall 11 (`waitForTestTree` predicates) | MEDIUM | Audit all predicates; extract `findScenario` helper |
| Pitfall 12 (fixture pollution) | LOW if caught early | Two new fixtures; snapshot-restore in setup |
| Pitfall 13 (migration surprise) | LOW | Info log; changelog callout |
| Pitfall 14 (`integrationTestRun` bypass) | LOW | Call cache+parser directly per 1.1.0 pattern |
| Pitfall 15 (workspace watcher per-path) | LOW | Loop over `featuresUris[]`; array of watchers |

---

## Pitfall-to-Phase Mapping

The 1.2.0 milestone is expected to split into approximately 3 phases (parsing, discovery-scan, integration-plus-watchers). This maps each pitfall to the phase that must prevent it.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. `node_modules` scan freeze | Phase: DISC-07 subdir scanner implementation | Integration test: discovery on seeded `node_modules/` fixture completes < 100ms; perf log under threshold |
| 2. Duplicate feature nodes | Phase: DISC-08 multi-path parsing | Unit test: `[features, features/api]` → 1 path after dedup; integration test: scenario count unchanged on overlap config |
| 3. `featuresUri` 18-file rename | Phase: DISC-08 prep commit (before multi-path wiring) | Grep audit of `featuresUri`: each site classified primary/iterate/contains; `isFileInFeatures` helper exists |
| 4. `featuresPaths: []` empty disables discovery | Phase: DISC-08 settings layer | Unit test: `featuresPaths=[]` vs unset → identical behavior; `featuresPaths=[""]` → filtered |
| 5. Watcher glob fan-out | Phase: DISC-07 scanner + watcher wiring | Integration test: save unrelated `pyproject.toml` under `packages/b/` → no re-discovery in output log |
| 6. Scanner iteration order | Phase: DISC-07 scanner implementation | Unit test matrix (4 cases described); depth-outer, filename-inner enforced |
| 7. Run guard cache staleness with subdir scan | Phase: DISC-07/08 integration phase | Integration test: move discovered config to sibling dir, verify `getDiscoveryEntry` reflects new `configFileUri` within 1s |
| 8. Windows path separator | Phase: DISC-08 multi-path parsing | Unit test: `features\alt` on Linux resolves to `features/alt`; schema description documents separator norm |
| 9. Symlink recursion | Phase: DISC-07 scanner implementation | Integration test: pnpm-style fixture with symlink cycle completes bounded |
| 10. Mid-run config edit | Phase: DISC-07/08 integration phase | Integration test: slow run + concurrent config edit completes cleanly |
| 11. `waitForTestTree` predicates multi-path-aware | Phase: Integration-test phase | All existing predicate helpers refactored to walk all top-level nodes; both fixtures pass full suite |
| 12. Fixture pollution | Phase: Integration-test phase (planning before writing) | `example-projects/multi-path/` and `example-projects/monorepo-scan/` created; no test references `watcher-integration/` |
| 13. `featuresPath` + `featuresPaths` migration | Phase: DISC-08 settings layer | Unit test: both set → info log emitted; CHANGELOG documents precedence |
| 14. `integrationTestRun` bypass for new paths | Phase: Every phase adding a re-discovery trigger | Code review checklist: "Does this path go through `configurationChangedHandler`? If so, why?" |
| 15. `workspaceWatcher` per-features-path | Phase: DISC-08 multi-path phase | Integration test: add `.feature` under `featuresUris[1]` updates tree within `waitForTestTree` budget |

---

## Sources

### Primary (codebase verification — HIGH confidence)

- `src/common.ts` — discovery cache, `getUrisOfWkspFoldersWithFeatures`, `hasExplicitSetting`, `DEFAULT_EXCLUDE_DIRS` (lines 168-320, 142-155, 431, 449-484)
- `src/watchers/configWatcher.ts` — 1.1.0 brace-glob + 500ms debounce; direct cache invalidation (lines 9-74)
- `src/extension.ts` — `updateDiscoveryUX`, `configurationChangedHandler`, watcher lifecycle, `integrationTestRun` guard (lines 62-118, 577-645, 582)
- `src/parsers/configParser.ts` — `searchConfigFiles` (malformed falls through D-06), `parseIniConfig` continuation semantics, `resolvePaths` single-path only (lines 36-49, 57-118, 158-169)
- `src/settings.ts` — `WorkspaceSettings.featuresUri` scalar + derived `stepsSearchUri` (lines 77-158)
- `src/watchers/workspaceWatcher.ts` — single-pattern feature watcher, needs per-path expansion (lines 9-86)
- `src/runners/testRunHandler.ts` — single `idMatch = uriId(featuresUri)` scope check (line 199)
- Prior research: `.planning/research/PITFALLS.md` (1.1.0 baseline — carried forward: watcher disposal, glob-not-filename, 500ms debounce, cache-is-source-of-truth, integrationTestRun bypass, Windows delete latency)
- Prior research: `.planning/RETROSPECTIVE.md` (1.1.0 lessons — D-05 fixture isolation; `waitForTestTree` primitive; single choke-point callback; predicate-polling beats wall-clock sleeps)
- `.planning/PROJECT.md` (Key Decisions — all 1.0.0 + 1.1.0 decisions treated as constraints: singular-in-1.0.0, no-subdir-scan-in-1.0.0, brace-glob, 500ms debounce, `configurationChangedHandler(undefined, undefined, true)` choke point, cache-first guard, non-blocking UX, dedicated fs-mutation fixture, `waitForTestTree`)

### Secondary (known VS Code platform behavior — MEDIUM confidence)

- VS Code issue #164925: FileSystemWatcher bare-filename silent failure — 1.1.0 baseline
- VS Code issue #72831: FileSystemWatcher onDidChange stale-read — 1.1.0 baseline (500ms debounce)
- VS Code issue #56549: FileSystemWatcher rename inconsistency — affects subdir scan move scenarios (Pitfall 7)
- VS Code issues #3025 / #60813: `**/` glob perf on Windows (Pitfall 5)
- Node.js `fs.readdirSync` symlink behavior (follows by default) — source for Pitfall 9 protection
- Python `configparser` continuation-line + path normalization — behave's own parser reference

### Confidence notes

- Every Critical Pitfall has either a specific line citation or a cross-reference to a shipped 1.1.0 decision — HIGH confidence in the *pattern*.
- The specific perf threshold "< 100ms with 1000-file `node_modules/`" in Pitfall 1 is a hypothesis; exact threshold depends on target hardware. Benchmark in the implementing phase and revise.
- Pitfall 10 (mid-run race) is plausible but not observed in 1.1.0 — flagged MODERATE because 1.2.0's increased event frequency raises the hit rate. May not materialize; safe to implement the guard defensively.
- Pitfall 11 (`waitForTestTree` predicates) depends on how those predicates were actually written — an audit during Phase planning will either confirm or downgrade this.

---

*Pitfalls research for: 1.2.0 Multi-Path & Monorepo-Aware Discovery*
*Researched: 2026-04-17*
*Supersedes (additively): `.planning/research/PITFALLS.md` 1.1.0 baseline — 1.1.0 pitfalls still apply.*
