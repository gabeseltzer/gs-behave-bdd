# Phase 9: Subdirectory Config Scan - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

A user opening a monorepo folder whose behave config lives at `packages/<name>/behave.ini` sees their tests discovered automatically — without workspace-root config, without freezing on `node_modules/`, and with a non-modal notification guiding them to `projectPath` when multiple configs exist. New `src/discovery/configScanner.ts` module, `discoveryDepth` setting, first-match-wins + `alsoFoundConfigs` notification, two-tier config watcher.

Phase 9 does NOT touch multi-project-per-workspace (MULTI-01/02 — Milestone 3). It does NOT add `featuresPaths` setting (Phase 10). It builds the scanner module and wires it into discovery Branch B.

</domain>

<decisions>
## Implementation Decisions

### Async Discovery Lifecycle

- **D-01:** The BFS subdirectory scan is async (`vscode.workspace.fs.readDirectory`) and cannot run inline in `getUrisOfWkspFoldersWithFeatures()` (hard <1ms budget). The scan runs post-activation via the fire-and-forget IIFE pattern established in `extension.ts:505-517`. The discovery cache is backfilled once the scan completes.
- **D-02:** **Progress indicator** — While the scan runs, a brief "Scanning for behave config..." message appears in the output channel. The Test Explorer tree is empty during the gap and fills in when the scan completes. No status bar item.
- **D-03:** **Run-before-ready** — If the user clicks "Run Tests" before the scan completes, it fails naturally (empty test queue, no-op). A **unit test** must verify this path and ensure a clear message is communicated (not a crash). The run guard does not add scan-awareness; the natural "no tests discovered" behavior is sufficient.
- **D-04:** **No-config-found logging** — When a workspace has no root-level config and the scan finds nothing (no subdirectory configs, no `features/` convention), the extension logs an info-level line to the output channel: `"No behave config found in subdirectories (scanned depth N)"`. Silent otherwise.
- **D-05:** **Re-scan on settings change** — The scan re-runs when relevant extension settings change (`discoveryDepth`, `discoveryStopOnFirstHit`, `projectPath`). This goes through `configurationChangedHandler`'s existing refresh path. It also re-runs on config file watcher events.

### Multiple-Config Notification UX

- **D-06:** **Detailed notification** — When BFS finds 2+ configs, the non-modal `showInformationMessage` lists all found configs with project-relative paths. Format:
  ```
  Behave BDD: Found 2 behave configs:
  • app-a/behave.ini (active)
  • app-b/behave.ini
  Set projectPath to choose a different project.
  ```
  Buttons: **"Open Settings"** + **"Show Details"** + **"Don't Show Again"**.
- **D-07:** **"Show Details" button** opens the Behave BDD output channel, which always logs the full scan results (all configs found, which was selected as primary, and why) regardless of whether the notification fires.
- **D-08:** **"Don't Show Again" button** sets `gs-behave-bdd.suppressMultiConfigNotification: true`. This is a standard VS Code setting declared in `package.json` (default `false`), settable at all 3 scope levels (user / workspace / folder) with standard cascade — more specific overrides less specific.
- **D-09:** **Output channel always logs** — Full scan results (all configs found, primary selection, ordering rationale) are logged to the workspace output channel on every scan, regardless of notification suppression. Advanced users can check the output channel directly.
- **D-10:** **Re-notification on re-scan** — If the user re-runs the scan (settings change, config file edit) and multiple configs are still found, the notification re-fires (unless suppressed by the setting). No per-session dedup beyond the setting — the notification is useful context after a deliberate re-scan.

### First-Match Ordering Semantics

- **D-11:** **Shallower wins** — BFS depth is the primary sort key. A config at depth 1 always wins over depth 2+.
- **D-12:** **Config filename priority as tiebreaker** — When multiple configs are at the same depth (whether in the same directory or different directories), behave's own config priority order is the tiebreaker: `behave.ini` > `.behaverc` > `setup.cfg` > `tox.ini` > `pyproject.toml`. So `app-b/behave.ini` beats `app-a/setup.cfg` at the same depth.
- **D-13:** **Same-directory, multiple configs** — Follows the exact same logic as behave's root-level config search: scan the directory for all 5 config filenames in priority order, take the first match. The existing `findBehaveConfig` logic is reused per scanned directory.
- **D-14:** **Full scan to maxDepth by default** — The scanner always scans up to `discoveryDepth` (default 3), even after finding a match at a shallower depth. This ensures `alsoFoundConfigs` reports all configs the user might want. A new setting `gs-behave-bdd.discoveryStopOnFirstHit: boolean` (default `false`) allows users to stop scanning after the first hit depth for performance.

### New Settings

- **D-15:** Three new `package.json` settings for Phase 9:
  1. `gs-behave-bdd.discoveryDepth: number` — default `3`, min `0`, max `10`. `0` disables subdir scan (v1.1 behavior). Already specified in SD-02.
  2. `gs-behave-bdd.discoveryStopOnFirstHit: boolean` — default `false`. When `true`, scanner stops at the first depth that yields a config.
  3. `gs-behave-bdd.suppressMultiConfigNotification: boolean` — default `false`. When `true`, suppresses the "multiple configs found" notification.

### Claude's Discretion

- Internal data structure for `ScanResult` (how to represent the ordered list of found configs + primary selection).
- Whether `configScanner.ts` exports a class or a set of functions — follow whatever pattern reads cleaner.
- Exact wording of output channel log lines for scan results.
- Whether the two-tier config watcher (narrow at discovered config dir + recursive `**/` fallback) is implemented as two separate `FileSystemWatcher` instances or one with a dynamic pattern.
- How `discoveryStopOnFirstHit` interacts with `maxEntriesScanned` circuit breaker — both are performance caps; pick whichever fires first.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap + Requirements
- `.planning/ROADMAP.md` §Phase 9 — Goal, Success Criteria 1-6, Requirements SD-01 + SD-02 + SD-03 + SD-04 + INT-03 + INT-04
- `.planning/REQUIREMENTS.md` §SD-01, §SD-02, §SD-03, §SD-04, §INT-03, §INT-04, §TEST-11 — exact acceptance criteria
- `.planning/STATE.md` — v1.2 roadmap-level decisions, key architecture constraints

### Prior Phase Context
- `.planning/phases/07-internal-multi-path-types/07-CONTEXT.md` — D-01 through D-15 (plural types, singular getters, non-empty invariant)
- `.planning/phases/08-parser-test-tree-watcher-multi-root/08-CONTEXT.md` — D-01 through D-11 (path-group TestItems, partial discovery, dedup, cross-root scoping)

### Research
- `.planning/research/SUMMARY.md` — Executive summary, subdir scanning pre-answered decisions
- `.planning/research/STACK.md` §Why the existing walker fits v1.2 — walker reuse rationale, symlink safety, `.gitignore` non-respect acceptable
- `.planning/research/STACK.md` §Non-Blocking Activation Pattern — fire-and-forget IIFE pattern for async scan
- `.planning/research/STACK.md` §`discoveryDepth` setting schema — `package.json` declaration format
- `.planning/research/PITFALLS.md` §Pitfall 14 — `integrationTestRun` bypass for re-discovery paths (INT-04)

### Source files Phase 9 touches
- `src/common.ts` §`hasFeaturesFolder` (line 178) — Branch B must call scanner when root-level config not found
- `src/common.ts` §`DiscoveryEntry` (line 33) — needs `alsoFoundConfigs?: Uri[]` field
- `src/common.ts` §`findFiles` / `_findFilesRecursive` (line 449+) — walker to reuse/adapt for config scanning
- `src/common.ts` §`DEFAULT_EXCLUDE_DIRS` (line 431) — exclude set to extend with `dist`, `out`, `build`, `coverage`
- `src/watchers/configWatcher.ts` — glob upgrade from `{configs}` to `**/{configs}`, two-tier watcher strategy
- `src/extension.ts` §`updateDiscoveryUX` (line 62) — extend for `alsoFoundConfigs` notification
- `src/extension.ts` §`activate()` IIFE block (line 505) — async scan kickoff
- `src/settings.ts` §`WorkspaceSettings` — wire `discoveryDepth`, `discoveryStopOnFirstHit`, `suppressMultiConfigNotification`
- `src/parsers/configParser.ts` §`findBehaveConfig` — reuse per-directory config search logic
- `package.json` — 3 new settings declarations

### Build verification
- `CLAUDE.md` §After Every Code Change — `npx eslint src --ext ts` + `npm run test:unit` must pass
- `AI_INSTRUCTIONS.md` — URI handling, disposables, performance, cross-platform rules

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`findFiles` / `_findFilesRecursive`** in `common.ts` (line 449+) — BFS walker using `vscode.workspace.fs.readDirectory`. Respects `DEFAULT_EXCLUDE_DIRS` and `CancellationToken`. Adapt for filename-set matching (config files) instead of extension matching.
- **`findBehaveConfig`** in `configParser.ts` — Searches a single directory for all 5 config filenames in priority order. Reuse per-directory in the BFS scan.
- **`DEFAULT_EXCLUDE_DIRS`** in `common.ts` (line 431) — `{ '__pycache__', '.git', 'node_modules', '.venv', '.tox', '.mypy_cache', '.pytest_cache', '.eggs', '*.egg-info' }`. Phase 9 extends with `dist`, `out`, `build`, `coverage`.
- **`notifiedConfigErrors`** Set in `extension.ts` — Pattern for per-session notification dedup. Phase 9's `suppressMultiConfigNotification` setting replaces session-level dedup with a persistent setting.
- **`uriId()`** in `common.ts` — Case-insensitive URI comparator. Use for dedup of found configs.

### Established Patterns
- **Fire-and-forget IIFE** (`extension.ts:505-517`) — Non-blocking async work during `activate()`. Scanner scan piggybacks.
- **Config watcher debounce** (`configWatcher.ts`) — 500ms debounce on config file events. Two-tier watcher preserves this.
- **`configurationChangedHandler`** (`extension.ts`) — Existing settings-change handler. Re-scan wires through here for `discoveryDepth`/`discoveryStopOnFirstHit` changes.
- **`getUrisOfWkspFoldersWithFeatures(true)`** — Force-refresh cache invalidation. Called by config watcher after scan to backfill results.

### Integration Points
- **`hasFeaturesFolder` Branch B** (`common.ts:178`) — Currently calls `findBehaveConfig(folder.uri)` at workspace root only. Phase 9 adds: if root-level config not found AND `discoveryDepth > 0`, call `scanForBehaveConfig(folder.uri, maxDepth)`.
- **`updateDiscoveryUX`** (`extension.ts:62`) — Extend to check `DiscoveryEntry.alsoFoundConfigs` and fire the multi-config notification.
- **`startWatchingConfigFiles`** (`configWatcher.ts`) — Glob upgrade from workspace-root `{configs}` to two-tier: narrow watcher at discovered config's parent dir + recursive `**/{configs}` fallback when no config is discovered yet.

</code_context>

<specifics>
## Specific Ideas

- **Output channel scan summary format**: Log lines should show the scan tree structure — depth, directories scanned, configs found, primary selection rationale. Example: `"Subdir scan: depth=3, scanned 42 dirs, found: app-a/behave.ini (depth 1, primary), app-b/behave.ini (depth 1, secondary)"`
- **Circuit breaker logging**: When `maxEntriesScanned` fires, log a warning: `"Subdir scan: circuit breaker at N entries. Increase discoveryDepth=0 to disable scan or set projectPath manually."`

</specifics>

<deferred>
## Deferred Ideas

- **Multiple independent behave projects per workspace** (MULTI-01/02) — Milestone 3 / v2.0. `alsoFoundConfigs` is notification-only, not a second test root.
- **`.gitignore`-aware scanning** — `DEFAULT_EXCLUDE_DIRS` covers the overwhelming majority of cases. Revisit only if users report false-positive configs from gitignored dirs.
- **Auto-detecting scan exclude patterns from project files** — Scope creep. `discoveryDepth=0` already gives full opt-out.

</deferred>

---

*Phase: 09-subdirectory-config-scan*
*Context gathered: 2026-04-20*
