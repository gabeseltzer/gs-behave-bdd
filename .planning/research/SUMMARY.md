# Project Research Summary

**Project:** gs-behave-bdd — v1.2 Multi-Path & Monorepo-Aware Discovery
**Domain:** VS Code extension — additive discovery expansion on top of shipped v1.0/v1.1 stack
**Researched:** 2026-04-17
**Confidence:** HIGH

---

## Executive Summary

**Scope is smaller than the milestone name suggests.** `src/parsers/configParser.ts` **already parses** multi-value `paths=` correctly in both INI (continuation lines) and TOML (native arrays). The v1.0 single-path restriction lives in exactly two functions — `resolvePaths` and `buildResult` — roughly 15 lines in one file. The parser never needed changes; v1.0 deliberately discarded the tail of `rawPaths[]` at the resolver. DISC-08 is a cascading type change (`featuresUri: Uri` → `featuresUris: Uri[]`) across ~18 consumers, not a parser rewrite. Land as a **primary-plus-list** pattern (keep `featuresUri` as a `featuresUris[0]` getter) rather than hard rename — the 18 consumers have three semantically distinct needs (primary canonical path, iterate-all, does-file-belong) that a blunt rename would collapse incorrectly.

**DISC-07 subdir scanning decisions are mostly pre-answered by the v1.0 codebase** — reuse `src/common.ts:449 findFiles` walker (not `vscode.workspace.findFiles`, rejected in v1.0 for Windows multi-root startup flakiness), reuse `DEFAULT_EXCLUDE_DIRS`, follow the fire-and-forget IIFE activation idiom from `extension.ts:505-517`. No new npm packages. `smol-toml` already handles arrays natively. Scanner must be BFS-bounded (depth 3 default, `discoveryDepth` setting opt-out), dedup subsumed paths, normalize Windows backslashes, and protect against symlink cycles on pnpm monorepos. Two new `package.json` settings keys (`featuresPaths`, `discoveryDepth`) and one watcher-glob change (`{...}` → `**/{...}`) round out the external surface.

**Two design constraints are firm, not preferences:**

1. **Single TestItem root per workspace** — never one-per-feature-path. Cited from vscode-python #20345 and vscode-jest #129 UX pain. Multi-path features go as siblings under the existing workspace node.
2. **MULTI-01/02 boundary rule** — if a feature requires `WorkspaceSettings` to become per-project rather than per-workspace-folder, it is Milestone 3 scope. Keeps out per-config Python interpreters, per-config env-var presets, `Select Project` quick-pick, parallel per-config runs. v1.2 stays single-project-per-workspace with "first-match wins + warn + `projectPath` override."

---

## Key Findings

### Recommended Stack

**Zero new npm dependencies.** Entire feature set built on existing infrastructure (`smol-toml@1.6.0`, `@types/vscode@1.82.0`, hand-rolled INI parser, in-repo `findFiles` walker). Bundle size constraint preserved. No `engines.vscode` bump.

**Core technologies (reuse):**
- **`smol-toml` 1.6.0** — installed; `parseTomlConfig` returns arrays natively.
- **Hand-rolled INI parser** (`configParser.ts:57-118`) — already collects continuation lines into `pathsLines: string[]`.
- **`vscode.workspace.fs.readDirectory` + existing `findFiles` walker** (`common.ts:449`) — respects `DEFAULT_EXCLUDE_DIRS` and `CancellationToken`. Do NOT use `vscode.workspace.findFiles` (Windows multi-root glob flakiness).
- **`vscode.RelativePattern` with `**/{configs}`** — glob upgrade from workspace-root-only to recursive. `**/` + brace-expansion preserves the v1.1 bare-filename bug fix (VS Code #164925); 500ms debounce covers stale-read (#72831).
- **Fire-and-forget IIFE activation** (`extension.ts:505-517`) — non-blocking post-activation pattern. Subdir scan piggybacks so the `<1ms` gatekeeper contract stays synchronous.

See `STACK.md` for the full reuse matrix, alternatives considered, and the "what NOT to add" list.

### Expected Features

**Must have (table stakes, P1):**
- Parse `paths=` as list end-to-end; `featuresUris[]` populated everywhere downstream (~8 files).
- New `featuresPaths[]` settings.json key; plural wins over singular `featuresPath` when both set.
- Legacy `featuresPath` still honored (backward-compat non-negotiable).
- Depth-3 recursive config scan with excluded dirs; `discoveryDepth` setting (default 3, `0` disables).
- First-match-wins selection when multiple configs found; informational notification + `projectPath` override path.
- `projectPath` override still wins over recursive scan (v1.0 priority chain preserved; reconfirm in tests).
- Config watcher covers subdirectory paths (`**/{configs}` glob upgrade).
- Symlink/junction loop protection (visited-realpath set — pnpm monorepos).
- Single TestItem root per workspace — features from all paths as siblings, **not** multiple top-level roots.

**Should have (differentiators, P2):**
- Path-group intermediate TestItems when `featuresUris.length > 1`.
- Per-path resolution failure diagnostic in Problems panel.
- Deduplicated notification per session (mirrors v1.0 `notifiedConfigErrors` pattern).
- Output-channel candidate list logging full scan walk when xRay enabled.

**Defer (v2+ / MULTI-01/02, Milestone 3):**
- Multiple independent behave projects per workspace folder.
- Per-config Python interpreter / env-var presets / output channels.
- `Behave BDD: Select Project` quick-pick.
- Parallel runs across configs within one workspace folder.
- `Open as Multi-Root Workspace` command.
- README/docs updates.

See `FEATURES.md` for the full taxonomy and explicit anti-features list guarding the MULTI-01/02 boundary.

### Architecture Approach

**Additive refactor** on top of shipped v1.0 (discovery) + v1.1 (watcher + run-guard). Three major integration surfaces:

**Major components:**
1. **Parser layer** — `configParser.ts::resolvePaths` / `buildResult` rewritten to loop over `rawPaths`; `BehaveConfigResult.resolvedPath: Uri` → `resolvedPaths: Uri[]`. ~15 lines. One new module: `src/discovery/configScanner.ts` implementing BFS-bounded subdir scan.
2. **Settings + Discovery layer** — `WorkspaceSettings.featuresUri` → `featuresUris[]` (with `featuresUri` getter returning `[0]` for back-compat). `DiscoveryEntry.featuresUri` → `featuresUris[]` plus optional `alsoFoundConfigs: Uri[]` for ambiguity surfacing. New utility `getFeaturesRootForFile(wkspSettings, fileUri)` for per-document-scoped handlers.
3. **Consumer layer (18 files)** — Parser/test-tree (`fileParser.ts` iterates per root), watcher (`workspaceWatcher.ts` one watcher per features path; `configWatcher.ts` depth-aware glob), runner queue filter (`testRunHandler.ts:199` union match), handlers (autoComplete/codeLens/stepDiagnostics union across roots; fixtureProviders/fixtureDiagnostics per-document-root scoping for **correctness**, not just performance).

**Unchanged (verified):** `runOrDebug.ts` (behave CLI resolves paths from config itself), `behaveRun.ts` (cwd = `projectUri`, not features), `findStepReferencesHandler.ts` (operates on flat `stepMappings` — already multi-root capable), `WkspRun`, `StepMapping.featuresUri` (stays scalar per-mapping identity).

See `ARCHITECTURE.md` for the exhaustive 18-file integration-point table.

### Critical Pitfalls

Top five, all with concrete code-line citations:

1. **Subdir scan freezes extension host on monorepos** — naive recursion walks `node_modules/` and blows the `<1ms` gatekeeper SLA. **Avoid:** reuse `DEFAULT_EXCLUDE_DIRS` from `common.ts:431` (add `dist`, `out`, `build`, `coverage`); BFS with early-termination on first match; `maxEntriesScanned` circuit breaker.
2. **Multi-path produces duplicate feature nodes when `paths=` contains overlapping entries** — e.g. `paths=features\n  features/api`. Silently doubles scenario count. **Avoid:** canonicalize + dedup in `resolvePaths` after resolution; sort by `fsPath` length ascending and drop URIs subsumed by another (using `uriId` for case-insensitive Windows match).
3. **Scalar `featuresUri` rename cascades to 18 files with silent runtime bugs** — consumers have three semantically distinct needs. **Avoid:** primary-plus-list pattern — `featuresUri` stays scalar (returns `featuresUris[0]`); add `featuresUris: Uri[]` list; add `isFileInFeatures(uri)` helper. Classify each read site before migrating.
4. **Config watcher `**/{configs}` glob fan-out on monorepos** — 50 `pyproject.toml` files = 50 watcher registrations. **Avoid:** two-tier watcher strategy — Tier 1 narrow watcher at discovered config's directory; Tier 2 `**/` only when no config is discovered. Honor exclude-dirs filter in handler.
5. **Windows path separator in INI continuation lines** — Windows user commits `paths = features-win\alt`; on macOS `vscode.Uri.joinPath` treats as literal single-segment filename; discovery silently falls back. **Avoid:** normalize all `\` → `/` in `resolvePaths` before URI construction. Document in settings.json schema description.

Additional pitfalls in `PITFALLS.md`: empty `featuresPaths: []` silently disables discovery; scanner iteration order (depth outer, filename inner) for D-06 malformed-config priority; run-guard non-determinism if scanner memoizes; symlink cycles on pnpm workspaces; mid-run config edit disrupting test run (`ctrl.activeRuns` check); `waitForTestTree` predicates must walk all top-level nodes; fixture pollution (two new dedicated fixtures — `multi-path/`, `monorepo-scan/`); migration UX when both `featuresPath` + `featuresPaths` set; `integrationTestRun` bypass mirroring v1.1 Pitfall 14; `workspaceWatcher` one-per-features-path.

---

## Implications for Roadmap

### Reconciled Phase Decomposition

ARCHITECTURE.md's **5-phase decomposition** absorbs PITFALLS.md's **~3 pitfall groupings** with explicit dependency gating.

### Phase 1: Internal Multi-Path Types (compilation-only risk)

**Rationale:** Every downstream consumer depends on the type shape. Landing types first with singular getters means the codebase compiles at every intermediate commit. Smallest blast radius.
**Delivers:** `DiscoveryEntry.featuresUris: Uri[]`; `WorkspaceSettings.featuresUris/stepsSearchUris/projectRelativeFeaturesPaths/workspaceRelativeFeaturesPaths` with singular getters; `BehaveConfigResult.resolvedPaths: Uri[]`; `hasFeaturesFolder` populates length-1 arrays in the single-path case.
**Addresses:** DISC-08 prep — unblocks Phases 2, 3, 4.
**Avoids:** Pitfall 3 (18-file rename breakage).

### Phase 2: Parser, Test-Tree, Watcher Multi-Root Iteration

**Rationale:** Mechanical loop-over-roots refactor across ~10 consumer files. Depends on Phase 1. Still zero user-facing change.
**Delivers:** `fileParser.ts` iterates `featuresUris[]` for feature/step parsing + step-mappings rebuild; `workspaceWatcher.ts` one watcher per features path; `junitParser.ts::getjUnitName` trims the correct root prefix; `testRunHandler.ts:199` queue-filter unions across roots; handlers (autoComplete/codeLens/stepDiagnostics union; fixtureProviders/fixtureDiagnostics per-document-root scoped).
**Avoids:** Pitfall 2 (duplicate feature nodes — dedup in `resolvePaths`); Pitfall 15 (workspace watcher per-features-path); Pitfall 11 (`waitForTestTree` predicates audited before integration tests written).

### Phase 3: Subdirectory Config Scan (parallelizable with Phase 2)

**Rationale:** `src/discovery/configScanner.ts` is a new module independent of Phase 2. Depends only on Phase 1.
**Delivers:** `scanForBehaveConfig(wkspUri, maxDepth)` with BFS + exclude-dirs + symlink-cycle protection + circuit breaker; `common.ts::hasFeaturesFolder` Branch B uses it; `package.json` adds `discoveryDepth` setting; `configWatcher.ts` glob upgrades to depth-aware `**/{configs}` with two-tier watcher; `DiscoveryEntry.alsoFoundConfigs` surfaces ambiguity; `updateDiscoveryUX` notification when scan finds >1 config.
**Avoids:** Pitfall 1 (`node_modules` freeze); Pitfall 5 (watcher glob fan-out); Pitfall 6 (iteration order); Pitfall 9 (symlink recursion); Pitfall 14 (`integrationTestRun` bypass).

### Phase 4: `featuresPaths` User-Facing Settings Key

**Rationale:** Surfaces multi-path as a user setting. Needs Phase 1 (types), Phase 2 (parser/watcher iteration).
**Delivers:** `package.json` `gs-behave-bdd.featuresPaths: string[]`; `WorkspaceSettings` constructor prefers plural over singular; `hasExplicitSetting` treats both as "explicit"; settings descriptions updated.
**Avoids:** Pitfall 4 (empty array disables discovery); Pitfall 8 (Windows path separator normalization); Pitfall 13 (migration UX).

### Phase 5: UX Polish + Regression Hardening

**Rationale:** Integration test coverage + polish.
**Delivers:** Integration test matrix (multi-path from config-file, multi-path from settings.json, subdir config with multi-path, multi-path within `alsoFoundConfigs`); flakiness gate (×3 on CI per v1.1 precedent); `logSettings` plural output; `discoveryDepth=0` edge case; dedicated fixtures `example-projects/multi-path/` and `example-projects/monorepo-scan/`.
**Avoids:** Pitfall 7 (run-guard staleness under rapid config move); Pitfall 10 (mid-run config edit); Pitfall 11 (predicate audit); Pitfall 12 (fixture isolation).

### Phase Dependency Graph

```
Phase 1 (types)
   │
   ├──> Phase 2 (parser/watcher loops)  ─┐
   │                                      │
   ├──> Phase 3 (subdir scanner)         ─┤
   │                                      │
   └──> (2 AND 3 done) ──> Phase 4 (featuresPaths setting)
                                           │
                                           v
                                       Phase 5 (polish + regression)
```

Realistic sequential order: **1 → 2 → 3 → 4 → 5**. Parallel-capable: **1 → {2, 3 concurrent} → 4 → 5**.

### Research Flags

**Phases likely needing deeper research during planning (`/gsd-research-phase`):**
- **Phase 3 (subdir scanner):** Real-project perf benchmark (pnpm monorepo fixture; seeded `node_modules/`). Two-tier watcher strategy has sub-decisions. Symlink cycle fixture design.
- **Phase 5 (UX polish + regression):** `waitForTestTree` predicate audit before the fixture matrix is locked in.

**Phases with standard patterns (likely skip research):**
- **Phase 1 (types):** Pure type refactor; primary-plus-list pattern established.
- **Phase 2 (consumers):** Loop-over-roots is mechanical once `getFeaturesRootForFile` helper is written.
- **Phase 4 (featuresPaths setting):** Schema contribution straightforward.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new npm deps. All decisions cross-referenced to installed packages and code-line citations. |
| Features | HIGH | behave CLI semantics verified via behave docs + issue #638; prior art checked. Depth-3 default is MEDIUM (common-case heuristic; user-tunable). |
| Architecture | HIGH | Every one of 18 consumer files audited with specific line numbers. |
| Pitfalls | HIGH | Each of 15 pitfalls has line-cited evidence + concrete prevention. MEDIUM on perf thresholds. |

**Overall:** HIGH.

### Gaps to Address

- **Depth-3 default heuristic** — user-tunable escape hatch via `discoveryDepth`; adjust default if Phase 3 profiling reveals a different common case.
- **`featuresPath` + `featuresPaths` coexistence** — plural-wins locked; migration surprise mitigated by info-level log + CHANGELOG entry.
- **Path-group intermediate TestItems** — ship flat in v1.2; wrapper as v1.2.x patch if users ask.
- **`waitForTestTree` predicate audit scope** — unknown until Phase 5.
- **Benchmarking threshold** — "<100ms with 1000-file `node_modules/`" is a target, validate in Phase 3.

---

## Sources

### Primary (HIGH confidence)
- Source code analysis — every `src/` file referenced with line numbers in STACK.md, ARCHITECTURE.md, PITFALLS.md. Verified against commit `4a684d3` (v1.1 shipped).
- `.planning/PROJECT.md` — locked v1.2 scoping decisions.
- v1.0 + v1.1 RESEARCH + RETROSPECTIVE — prior decisions.
- `node_modules/smol-toml/package.json` — version 1.6.0 installed, array semantics verified.
- `node_modules/@types/vscode/index.d.ts` — `GlobPattern`, `RelativePattern`, `FileSystemWatcher` API surface for `^1.82.0`.
- behave docs + source — `paths = Sequence<text>` semantics; issue #638.

### Secondary (MEDIUM-HIGH confidence)
- vscode-python wiki + issues #20345, #15812, #21204, #25069.
- vscode-jest issue #129.
- vitest-dev/vscode monorepo docs.
- VS Code issues #3025, #60813 (`**/` glob perf on Windows), #56549 (FileSystemWatcher rename).

### Tertiary (LOW confidence, informational)
- Depth-3 heuristic — user-tunable setting mitigates wrong-default risk.
- Perf threshold "<100ms with 1000-file `node_modules/`" — hypothesis; verify in Phase 3.

---

*Research completed: 2026-04-17*
*Ready for roadmap: yes*
