# Technology Stack

**Project:** gs-behave-bdd — 1.2.0 Multi-Path & Monorepo-Aware Discovery
**Researched:** 2026-04-17
**Confidence:** HIGH
**Scope:** ADDITIONS ONLY for 1.2.0. 1.0.0 stack (smol-toml, hand-rolled INI parser) and 1.1.0 stack (VS Code FileSystemWatcher, 500ms debounce) remain unchanged.

---

## Headline Finding: configParser.ts ALREADY supports multi-path

`src/parsers/configParser.ts` already parses multi-value `paths=` in both formats correctly. The 1.0.0 shrink was a deliberate deferral in the **resolver**, not the parser.

| Code location | What it does today | 1.2.0 change needed |
|--------------|-------------------|-------------------|
| `parseIniConfig()` line 94-109 | Handles `paths=` plus whitespace-indented continuation lines; pushes each non-empty trimmed line into `pathsLines[]`. Matches Python `configparser` semantics. | **None.** |
| `parseTomlConfig()` line 146-152 | Requires `paths` to be `Array.isArray(...)`; `paths.map(String)` produces `string[]`. | **None.** |
| `BehaveConfigResult` line 13 | Already exposes `rawPaths: string[]` (plural) + single `resolvedPath: vscode.Uri`. | Add `resolvedPaths: vscode.Uri[]` (plural). Keep `resolvedPath` as `resolvedPaths[0]` alias for transitional callers, or delete outright if all downstream consumers are migrated in one phase. |
| `resolvePaths()` line 158-169 | Resolves `rawPaths[0]` only. Comment: `// v1: only the first path is resolved (D-03, D-04); all paths are captured in rawPaths[].` | Rewrite to loop over all `rawPaths`; return `vscode.Uri[]`. Absolute-path detection logic (Unix `/`, Windows `C:\`/`C:/`) stays identical. |
| `buildResult()` line 171-183 | Builds single-path result. | Return `resolvedPaths: vscode.Uri[]`. |

**Net result:** TOML needs zero parser changes (arrays are native). INI needs zero parser changes (continuation-line loop already collects every path). Only `resolvePaths` + `buildResult` + the `BehaveConfigResult` type are touched. This is ~15 lines in one file.

Downstream, `src/common.ts:253-261` (the `findBehaveConfig` → `DiscoveryEntry` bridge) currently sets a single `featuresUri: configResult.resolvedPath`. `DiscoveryEntry` (src/common.ts:32-40) needs `featuresUris: vscode.Uri[]` (plural); `featuresUri` can be kept as `featuresUris[0]` for gatekeeper-only backward compat or dropped.

---

## Recommended Stack (1.2.0 additions)

### Zero new npm packages

| Requirement | Source | Status |
|-------------|--------|--------|
| Subdirectory traversal for config file discovery | Existing `findFiles()` in `src/common.ts:449` (custom recursive `vscode.workspace.fs.readDirectory` walker with excluded dirs + cancel token) | Already exported; reuse or extend — see "Traversal Strategy" below |
| Directory-only enumeration (for depth-limited config search) | `vscode.workspace.fs.readDirectory(uri)` returns `[name, FileType][]`; filter by `FileType.Directory` | Built into `@types/vscode@1.82.0` |
| TOML multi-path parsing | `smol-toml@1.6.0` (installed; `node_modules/smol-toml/package.json` confirms) returns arrays natively | **Zero changes** — already works |
| INI multi-path parsing | Hand-rolled parser in `configParser.ts:94-109` | **Zero changes** — continuation-line loop already collects every path |
| Config watcher for subdirectories | `vscode.RelativePattern(wkspUri, '**/{behave.ini,.behaverc,setup.cfg,tox.ini,pyproject.toml}')` — `**/` is documented glob syntax in `GlobPattern` type definition | Built into VS Code ^1.82.0 |
| Settings schema additions | `package.json` `contributes.configuration.properties` (already used for `featuresPath`) | Just add two new keys |
| Async non-blocking scan pattern | IIFE-after-sync-setup, already used for post-activation validation in `src/extension.ts:505-517` | Pattern already in-codebase |

### What `getUrisOfWkspFoldersWithFeatures` gives us for free

The `<1ms` gatekeeper contract (`src/common.ts:161-168`, verified in 1.0.0) means the discovery cache must stay in-process. Our multi-path entries add `featuresUris: vscode.Uri[]` to the existing `Map<uriId, DiscoveryEntry>` — no new storage tier. Subdirectory scan results feed into the **same** map on cache-miss via the existing `findBehaveConfig` integration point.

---

## Traversal Strategy: Use the Existing `findFiles`, NOT `vscode.workspace.findFiles`, NOT a New Lib

**Decision: reuse + lightly specialise the existing `src/common.ts:449 findFiles()` pattern.**

### Why not `vscode.workspace.findFiles(pattern, ...)` (the built-in glob API)

The codebase already answered this question in 1.0.0:

- `src/parsers/fileParser.ts:146-148` literally commented out a `vscode.workspace.findFiles(pattern, ...)` call and replaced it with the custom walker.
- `src/common.ts:447-448` explains why: *"custom function to replace vscode.workspace.findFiles() functionality when required due to the glob INTERMITTENTLY not returning results on vscode startup in Windows OS for multiroot workspaces"*.
- This extension targets Windows as a first-class platform (the flakiness gate in 1.1.0 was Windows-specific). Re-introducing the same API for config discovery would re-introduce the same bug class.

### Why not `fast-glob`, `globby`, `micromatch`, or `@npmcli/glob`

| Package | Why rejected |
|---------|--------------|
| `fast-glob` | ~500KB installed, adds `@nodelib/fs.*` transitives. Solves the same problem the in-repo walker already solves. No `.gitignore` integration out of the box without extra deps. Overkill for finding at most 5 filenames at depth ≤ 3. |
| `globby` | Wraps `fast-glob` + `.gitignore` via `ignore` lib. Adds 2-3 MB to bundle. Overkill. |
| `micromatch` | Pattern matcher only, not a walker — would still need a walker. No gain. |
| `@npmcli/glob` / `glob@10` | `glob@7.2.0` is already a devDependency (never shipped to extension); pulling a production glob would be the first non-VS Code walker in `dependencies`. No justification for the 100KB+ of weight. |
| `chokidar` | This is a watcher, not a walker — also already rejected in 1.1.0 STACK.md for the same reason. |
| `fs.promises.readdir({ recursive: true })` | Node 18.17+ supports this, but:<br>(1) no `excludeDirs` filter — would descend into `node_modules`, `.git`, `__pycache__` wasting time;<br>(2) no `CancellationToken` integration — cannot abort when workspace folder changes mid-scan;<br>(3) breaks the codebase's single-pattern convention (one traversal primitive, used everywhere). |
| `fs.readdir` with `withFileTypes` + manual recursion | This is what `common.ts:_findFilesRecursive` already does — **but through `vscode.workspace.fs.readDirectory`**, which is abstracted over VS Code's virtual file systems and already integrates `FileType` checks. Using raw Node `fs` would split the abstraction. |

### Why the existing walker fits 1.2.0 with almost no change

`src/common.ts:449 findFiles()` already:

1. Uses `vscode.workspace.fs.readDirectory` (respects VS Code FS providers, not raw Node `fs`).
2. Filters by extension (easy to specialise to filename-set for configs).
3. Skips `DEFAULT_EXCLUDE_DIRS = { '__pycache__', '.git', 'node_modules', '.venv', '.tox', '.mypy_cache', '.pytest_cache', '.eggs', '*.egg-info' }` (`src/common.ts:431`) — exactly the directories we don't want to scan for configs either.
4. Accepts a `CancellationToken` for abort on workspace change.

**What 1.2.0 needs to add:** a thin wrapper (proposed name: `findConfigsInSubdirectories(wkspUri, maxDepth, cancelToken)`) that:

- Tracks current depth; stops recursing when `depth > maxDepth` (default 3, from `discoveryDepth` setting).
- Matches by **exact filename** against the `CONFIG_FILES` list in `configParser.ts:18-24`, not by extension (since `setup.cfg`/`tox.ini`/`pyproject.toml` share extensions with unrelated files).
- Returns `vscode.Uri[]` — the list of candidate config files found, in depth-first order (caller applies first-match-wins).

**Where to put it:** Extend `src/common.ts` or add a new exported function in `src/parsers/configParser.ts`. Leaning toward `configParser.ts` since it already owns the `CONFIG_FILES` constant and keeps config discovery cohesive — but the shared exclude-dir list lives in `common.ts`, so a small import is fine. Roadmap decision, not a stack decision.

**Symlinks:** `vscode.workspace.fs.readDirectory` returns `FileType.SymbolicLink` as a separate flag. The existing walker treats anything not `FileType.Directory` as a file — so symlinked directories are **not** recursed into, which is the desired safety behaviour for a monorepo scan. No change needed.

**`.gitignore` respect:** The existing walker does NOT respect `.gitignore`. For 1.2.0 this is acceptable because the `DEFAULT_EXCLUDE_DIRS` list covers the overwhelming majority of gitignored dirs in practice (`node_modules`, `.venv`, `__pycache__`, etc.). Adding a `.gitignore` parser would be a ~100KB dep (`ignore` package) for marginal benefit. Flag for revisit only if users report false-positive configs from `.gitignore`d dirs.

---

## Non-Blocking Activation Pattern: Use the Existing Fire-And-Forget IIFE

**Decision: follow the pattern already in `src/extension.ts:505-517`.**

### The existing pattern

```ts
// src/extension.ts:505-517 (1.0.0)
(async () => {
  try {
    await parser.stepsParseComplete(10000, "activate-validateOpenDocs");
    initialParsingComplete = true;
    for (const document of vscode.workspace.textDocuments) {
      validateFixtureTags(document);
      validateStepDefinitions(document);
    }
  }
  catch (e: unknown) {
    config.logger.showError(e, undefined);
  }
})();
```

This is the canonical "kick off async work during `activate()` without blocking" idiom in this codebase. `activate()`'s own comment at `src/extension.ts:124-125` spells it out: *"THIS MUST RETURN FAST: AVOID using "await" here unless absolutely necessary"*.

### How 1.2.0 uses it

Inside the existing activation loop (`src/extension.ts:142-146`, which sets up watchers per workspace), the discovery call that invokes `findBehaveConfig` currently runs synchronously through `getUrisOfWkspFoldersWithFeatures()` → `discoveryCache` population (`src/common.ts:249-262`). That whole path is synchronous (`fs.existsSync` + `fs.readFileSync`), which is fine for workspace-root-only reads.

For subdirectory scan 1.2.0 must **not** add synchronous `readDirSync` recursion into activation. Two viable patterns:

**Pattern A (preferred): async fallback inside discovery function**

- Workspace-root check stays synchronous (unchanged).
- If root has no config AND subdirectory-scan is enabled, kick off async scan via IIFE after `activate()` returns; initial test tree renders from convention-fallback; when scan completes, call `getUrisOfWkspFoldersWithFeatures(true)` (forceRefresh) + `parser.parseFilesForWorkspace(...)`, same re-render path used by the 1.1.0 config watcher (`src/watchers/configWatcher.ts:56-59`).
- Trade-off: user sees tests from `features/` convention for a moment, then reconciles to the subdirectory config's features when scan lands. Acceptable because the common case (config at workspace root) still resolves synchronously.

**Pattern B: make discovery fully async**

- Convert `getUrisOfWkspFoldersWithFeatures` + `discoveryCache` population to async.
- Higher risk: the `<1ms` gatekeeper contract is predicated on synchronous cache reads. Going async here risks leaking `Promise`s into handler hot paths.
- Rejected unless Pattern A is provably inadequate.

**No web worker, no `Worker` threads, no off-main-thread scheduling.** VS Code extensions run in a single extension-host process; `Worker` adds complexity without solving a real problem here. Monorepo scans at depth 3, with excluded dirs, complete in tens of milliseconds on typical hardware — the bottleneck is I/O, and moving I/O to a thread doesn't speed up disk.

**Debounce:** Not needed for the initial scan (runs once per workspace per activation). The existing 500ms debounce in `configWatcher.ts:10` already covers post-activation config-file edits.

---

## VS Code FileSystemWatcher Deep-Glob Support

### What 1.1.0 currently watches

`src/watchers/configWatcher.ts:9` → `{behave.ini,.behaverc,setup.cfg,tox.ini,pyproject.toml}` — workspace root only, no `**/`.

### What 1.2.0 needs

When the resolved config file lives in a subdirectory (e.g., `myapp/backend/behave.ini`), the watcher must fire on edits there. Two design choices:

**Option A: Single deep-glob watcher per workspace**
```ts
new vscode.RelativePattern(wkspUri, '**/{behave.ini,.behaverc,setup.cfg,tox.ini,pyproject.toml}')
```

Supported by VS Code's `GlobPattern` type documentation (installed `@types/vscode@1.82.0` — HIGH confidence, same doc block referenced in 1.1.0 STACK.md). `**/` prefix enables arbitrary-depth matching.

**Risk 1 — the #164925 bare-filename bug:** 1.1.0 avoided this by using brace expansion (`{a,b,c}`). The fix is preserved under `**/{a,b,c}`; the bug is specifically about glob patterns with NO metacharacters being silently dropped. Brace expansion keeps this active. **No regression.**

**Risk 2 — recursive watcher cost on huge monorepos:** VS Code's `FileSystemWatcher` with `**/` recursively watches the entire tree. On a 10,000-file monorepo the OS-level watcher handles this, but change-event noise increases (every file-system event is delivered to the extension host, then filtered client-side). Mitigation: our handler already filters by `eventUri.scheme !== 'file'` (configWatcher.ts:35) and the 500ms debounce collapses bursts. Acceptable.

**Risk 3 — documented quirk #72831 (stale file read on `onDidChange`):** Already mitigated by the 500ms debounce (1.1.0). No change needed.

**Option B: Watch only the resolved config file's parent directory**
```ts
new vscode.RelativePattern(configDirUri, '{behave.ini,.behaverc,setup.cfg,tox.ini,pyproject.toml}')
```

Narrower, cheaper. But breaks when the config file is deleted and re-created at a different subdirectory — we wouldn't see the new location. **Rejected.**

**Decision: Option A.** Change `CONFIG_GLOB` in `configWatcher.ts:9` from `{...}` to `**/{...}`. Single-character-level diff; handler logic unchanged (still routes through `configurationChangedHandler`-equivalent code path at configWatcher.ts:55-59 via `getUrisOfWkspFoldersWithFeatures(true)` + `onConfigChanged` callback).

**Setting interaction:** If `discoveryDepth=0` (user opts out of subdirectory scan), the watcher still uses `**/` — this is fine, because the filter is at discovery time, not watch time. Watching more than we scan costs nothing beyond some ignored events. Not worth the extra complexity of conditional-glob construction.

---

## package.json Schema Additions

Two new `contributes.configuration.properties` entries. Both `scope: "resource"` to match the per-workspace pattern of `featuresPath`/`projectPath`.

```jsonc
"gs-behave-bdd.featuresPaths": {
  "scope": "resource",
  "type": "array",
  "items": { "type": "string" },
  "markdownDescription": "*project-relative* paths to features subfolders. **Override only:** Leave empty to use paths from your behave config file, or `features/` if no config file is found. Set this when your project has multiple features directories. Each path is relative to `projectPath` (or workspace root if `projectPath` is not set). Example: `[\"web/features\", \"api/features\"]`. If both `featuresPath` and `featuresPaths` are set, `featuresPaths` wins.",
  "default": []
},
"gs-behave-bdd.discoveryDepth": {
  "scope": "resource",
  "type": "number",
  "minimum": 0,
  "maximum": 10,
  "markdownDescription": "Maximum subdirectory depth to scan for a behave config file (`behave.ini`, `.behaverc`, `setup.cfg`, `tox.ini`, `pyproject.toml`) when none is present at the workspace root. Set to `0` to disable subdirectory scanning (workspace root only). First config found (depth-first order) wins. Increase only if your config is deeply nested inside a monorepo. Ignored when `projectPath`/`featuresPath`/`featuresPaths` are set.",
  "default": 3
}
```

**Why not `"type": ["string", "array"]` for a union?** VS Code settings UI renders union types poorly. Two separate keys (`featuresPath` legacy scalar + `featuresPaths` new array) is clearer and matches the "plural wins" precedence rule already decided in PROJECT.md.

**No activation event changes.** `workspaceContains:**/behave.ini` + `workspaceContains:**/.behaverc` in `package.json:273-277` already use `**/` — so a subdirectory config file already triggers activation. **Verified.**

**No `engines.vscode` bump.** All APIs used (`vscode.workspace.fs.readDirectory`, `RelativePattern`, brace-glob, `createFileSystemWatcher`) are in `^1.82.0` (current engine).

---

## Integration Points With Existing Infrastructure

| File | Change | Rationale |
|------|--------|-----------|
| `src/parsers/configParser.ts:13` | Change `BehaveConfigResult` to expose `resolvedPaths: vscode.Uri[]` (plural) | Parser already collects all paths — just stop discarding them in `resolvePaths` |
| `src/parsers/configParser.ts:155-169` | Rewrite `resolvePaths` to loop over `rawPaths`, return `vscode.Uri[]` | Absolute-detection logic (Unix `/`, Windows `C:\`/`C:/`) is one line per path; trivially lifted into `.map()` |
| `src/parsers/configParser.ts:29` | New entry point `findBehaveConfigDeep(wkspUri, maxDepth, cancelToken)` (or similar name) — calls existing `searchConfigFiles` at root, then walks subdirectories via extended `findFiles` if root has nothing | First-match-wins logic already inside `searchConfigFiles:36-49`; reuse it per candidate directory |
| `src/common.ts:32-40` | `DiscoveryEntry.featuresUri: vscode.Uri` → `featuresUris: vscode.Uri[]` | Cascades to every `entry.featuresUri` read — ~5 call sites (extension.ts:79, 83, settings.ts:101, runners/testRunHandler.ts, common.ts:255,260). Gatekeeper return type may stay singular (pick first) if multi-path isn't exposed through it yet; roadmap decides. |
| `src/common.ts:449 findFiles` | Add a `maxDepth` parameter (default `Infinity` for backward compat) or build a sister function `findFilesShallow(dir, depth, …)` | Non-invasive — existing callers pass no depth and keep unbounded behaviour |
| `src/watchers/configWatcher.ts:9` | `CONFIG_GLOB` → `'**/{behave.ini,.behaverc,setup.cfg,tox.ini,pyproject.toml}'` | Single-line change enables deep watching |
| `src/watchers/workspaceWatcher.ts:14` | `${wkspSettings.workspaceRelativeFeaturesPath}/**` → iterate over `featuresUris[]`, create one watcher per path | Each features path needs its own FileSystemWatcher |
| `src/settings.ts:82-101` | `WorkspaceSettings.featuresUri: Uri` → `featuresUris: Uri[]`; legacy singular `featuresUri` may stay as alias for `featuresUris[0]` to avoid cascading ~30+ call sites in a single phase | Roadmap may stage this |
| `src/parsers/fileParser.ts:150, 185` | `findFiles(wkspSettings.featuresUri, ...)` → iterate `featuresUris` | Each features path produces its own feature-file set; merged into single test tree |
| `src/runners/testRunHandler.ts` | `checkRunGuard` already uses `getDiscoveryEntry` per-workspace (1.1.0) — no change | Multi-path doesn't affect guard semantics (one config, one error) |
| `package.json:5-96` | Add `featuresPaths` and `discoveryDepth` keys (schema above) | |

---

## What NOT to Add

| Temptation | Why to Avoid |
|------------|--------------|
| `fast-glob`, `globby`, `micromatch`, `@npmcli/glob` | 100KB–2MB bundle cost for a problem the in-repo walker already solves. Bundle-size constraint in PROJECT.md:100 is explicit. |
| `chokidar` or raw `fs.watch` | Rejected in 1.1.0 STACK.md for the same reason: VS Code's watcher is more reliable, especially on Windows. |
| `ignore` package (.gitignore respect) | DEFAULT_EXCLUDE_DIRS covers the 95% case. Revisit only on user report. |
| Worker threads for scanning | I/O-bound; threading doesn't speed up disk. Extension host is single-process by design. |
| `fs.promises.readdir({ recursive: true })` | Node 18.17+ supports it but no excluded-dirs + no cancellation = worse than existing walker. |
| `vscode.workspace.findFiles` | 1.0.0 already rejected this for Windows multi-root startup flakiness (configParser/fileParser.ts:146-148, common.ts:447-448). Reintroducing for config search would reintroduce the bug. |
| Bumping `engines.vscode` | No new APIs needed. All patterns work on ^1.82.0. |
| New npm package for INI parsing | The hand-rolled parser in `configParser.ts:56-118` matches Python `configparser` continuation-line semantics exactly — a requirement no npm package satisfies (confirmed in 1.0.0 key decisions). Adding `ini` or `iniparser` would break config-fidelity. |
| Exposing `featuresUris` through `WorkspaceSettings` in the same phase as the parser change | Stage it: the type change cascades to 30+ sites. Scope to one phase at a time — first `configParser.resolvedPaths`, then `DiscoveryEntry`, then `WorkspaceSettings`. |
| Making `updateDiscoveryUX` a public export on `extension.ts` | 1.1.0 already handled this by passing it as a callback into `startWatchingConfigFiles` (configWatcher.ts:27). Keep that pattern for any new watcher/scan modules. |
| Auto-detecting `.gitignore` for scan excludes | Scope creep. `discoveryDepth=0` already gives users a full opt-out. |
| Union-type setting (`featuresPath: string | string[]`) | VS Code settings UI renders union types awkwardly. Two keys + precedence rule is clearer. |
| Async conversion of `getUrisOfWkspFoldersWithFeatures` | The `<1ms` gatekeeper contract (PROJECT.md:98) depends on synchronous cache read. Keep it sync; do async work outside the cache-read path. |

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Reuse existing `findFiles` walker | `vscode.workspace.findFiles` | If we ever drop Windows support or if VS Code fixes the multi-root startup glob bug (unlikely to be worth re-auditing). |
| `**/{...}` single-watcher glob | Multiple per-directory watchers | If profiling shows excessive event noise from deep-watching large monorepos (unlikely; 500ms debounce handles it). |
| Pattern A (sync root + async subdir IIFE) | Pattern B (fully async discovery) | Only if Pattern A introduces a visible flicker that users report as a bug. |
| Two settings keys (`featuresPath` scalar + `featuresPaths` array) | Union-type single key | Never — VS Code UI makes this user-hostile. |
| Inline additions to `configParser.ts` + `common.ts` | New `src/parsers/configDiscovery.ts` module | Only if the subdirectory-scan function grows past ~80 lines; below that, module split is over-abstraction (per 1.1.0 decision on `configWatcher.ts` sizing). |

---

## Version Compatibility

| Package | Version | Notes |
|---------|---------|-------|
| `smol-toml` | `1.6.0` (installed — `node_modules/smol-toml/package.json`) | Already parses arrays natively. BSD-3-Clause. No bump needed. |
| `@types/vscode` | `^1.82.0` | All used APIs (`fs.readDirectory`, `RelativePattern`, `createFileSystemWatcher`) are available. |
| `typescript` | `^4.5.5` | Array types and discriminated unions already used throughout; no syntax upgrades needed. |
| `node` | `18.17.1` (`.tool-versions`) | `fs.promises.readdir({ recursive: true })` is available (Node 18.17+) but we're not using it. No bump needed. |
| VS Code | `^1.82.0` engine | Recursive-glob `**/{...}` in `RelativePattern` supported since much earlier. HIGH confidence. |

---

## Sources

- `src/parsers/configParser.ts:13, 56-118, 123-153, 155-183` — **HIGH confidence**: INI continuation-line parsing and TOML array parsing already complete; only the resolver discards multi-path info.
- `src/common.ts:431-480` — **HIGH confidence**: custom `findFiles` walker with `DEFAULT_EXCLUDE_DIRS`, `vscode.workspace.fs.readDirectory`, `CancellationToken` support.
- `src/common.ts:447-448` — **HIGH confidence**: documented rationale for rejecting `vscode.workspace.findFiles` on Windows multi-root.
- `src/common.ts:32-40, 249-277` — **HIGH confidence**: `DiscoveryEntry` shape and the `findBehaveConfig` → cache-population bridge.
- `src/watchers/configWatcher.ts:9, 31, 55-59` — **HIGH confidence**: 1.1.0 watcher pattern, brace-expansion glob, 500ms debounce, forceRefresh call site.
- `src/extension.ts:124-125` — **HIGH confidence**: explicit "activate must return fast" contract.
- `src/extension.ts:505-517` — **HIGH confidence**: existing async-IIFE pattern for post-activation work.
- `src/parsers/fileParser.ts:146-148, 612-630` — **HIGH confidence**: rejected-`findFiles` comment and the debounce pattern that 1.1.0 already copied.
- `node_modules/@types/vscode/index.d.ts` — `GlobPattern` and `RelativePattern` definitions (HIGH confidence, installed package).
- `node_modules/smol-toml/package.json` — **HIGH confidence**: version `1.6.0`, already installed.
- `package.json:5-96, 273-277` — **HIGH confidence**: existing settings schema shape (for `featuresPath`/`projectPath`) and existing `workspaceContains:**/behave.ini` activation events.
- `.planning/research/STACK.md` (1.1.0 baseline) — **HIGH confidence**: prior rationale for VS Code-native watcher over chokidar, `RelativePattern` with `Uri` base, debounce value.
- `.planning/PROJECT.md:107-120` — **HIGH confidence**: decision log confirming `smol-toml`, hand-rolled INI, brace-expansion glob, 500ms debounce as shipped choices.

---

*Stack research for: VS Code extension — multi-path + monorepo-aware config discovery*
*Researched: 2026-04-17*
