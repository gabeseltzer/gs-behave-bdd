# Feature Landscape: Config File Watching and Malformed Config Run Guard

**Domain:** VS Code test runner extension — mid-session config reactivity
**Researched:** 2026-04-16
**Scope:** NEW features only for v1.1 milestone. Existing features (auto-discovery, cache, diagnostics, warning
notifications, convention fallback) are already shipped and out of scope here.

---

## Context

v1.0 shipped static auto-discovery: the extension reads behave config files once at activation, caches the
result, and surfaces errors. v1.1 adds two reactive features:

1. **Config file watchers** — the extension reacts to `behave.ini`, `.behaverc`, `setup.cfg`, `tox.ini`,
   and `pyproject.toml` create/modify/delete events in real time.
2. **Malformed config run guard** — when a user clicks "Run Tests" in a workspace whose config file failed
   to parse, the extension warns before behave crashes.

Evidence base: VS Code `FileSystemWatcher` API, existing `workspaceWatcher.ts` + `extension.ts` in this
repo, ESLint extension config watch pattern (github.com/microsoft/vscode-eslint), `testRunHandler.ts`
`featureParseComplete` guard as direct analogue. Confidence: HIGH for both features — both map cleanly to
established patterns already in the codebase.

---

## Table Stakes

Features users expect for a reactive test extension. Missing = the extension feels unfinished after v1.0.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Re-discover when config file is modified | Every major test extension (ESLint, Jest, vscode-python) re-runs discovery/validation when their config file changes. Users expect behave config edits (e.g. changing `paths=`) to appear in Test Explorer without a window reload. | Low | Uses `vscode.workspace.createFileSystemWatcher` with a per-workspace glob pattern. On `onDidChange` / `onDidCreate`: invalidate `discoveryCache`, call `getUrisOfWkspFoldersWithFeatures(true)`, then `updateDiscoveryUX()`, then trigger full reparse via `configurationChangedHandler(undefined, undefined, true)`. The `configurationChangedHandler` path already handles all three (settings reload, watcher restart, reparse). |
| Re-discover when config file is created | User adds `behave.ini` to a project that previously had none (was using convention fallback). Tests should move from convention-discovered to config-discovered path without any action. | Low | Same handler as modify. The 5-second polling fallback in VS Code's `FileSystemWatcher` handles the "file didn't exist at watcher creation" case natively. |
| Re-discover when config file is deleted | User removes `behave.ini`. Extension should fall back to convention and update Test Explorer. No stale "config file" badge or diagnostics. | Low | Same handler. Requires clearing the config-file diagnostics (`clearConfigParseErrorDiagnostic`) and invalidating cache before re-running discovery. |
| 500ms debounce on config file changes | Rapid file saves (e.g. format-on-save with multiple writes) must not thrash discovery. The existing Python steps watcher uses 500ms. Users notice jank when the Test Explorer flickers on each keystroke save. | Low | Implement debounce with `setTimeout`/`clearTimeout` at the watcher level, same as the `FileParser` debounce already in the codebase. Do NOT rely on VS Code's internal coalescing — it is not guaranteed. |
| Output log entry on config-driven re-discovery | Every time discovery re-runs from a config file event, the output channel should say "Config file changed, re-running discovery…" before the normal discovery summary. Users troubleshoot by reading the log. | Low | One `config.logger.logInfo(...)` call at the top of the handler, before `updateDiscoveryUX()`. |
| Clear stale config-error diagnostic when file is fixed | User fixes a previously malformed `behave.ini`. The Problems panel warning should disappear immediately after the fixed file is saved. | Low | `clearConfigParseErrorDiagnostic(configFileUri)` is already implemented. Call it when the re-discovery result is `ok: true`. Already happens inside `updateDiscoveryUX()` via the existing `else if (entry.configFileUri)` branch — verify this path is exercised on re-discovery. |
| Malformed config run guard — warn before run | When `testRunHandler` is invoked for a workspace whose `discoveryEntry.configError` is set, show `vscode.window.showWarningMessage` with "Run Anyway" and "Open Config File" buttons. Do not silently let behave crash with a Python traceback. | Low | Direct analogue to the existing `featureParseComplete` guard at the top of `testRunHandler`. Read `getDiscoveryEntry(wkspUri)` for each workspace in the run queue. If any has `configError`, warn and return unless user selects "Run Anyway". |
| Run guard does not block "Run Anyway" | The warning is a gate, not a hard block. Users with a partially broken config (e.g. bad `paths=` but valid behave sections elsewhere) may still want to run tests. "Run Anyway" bypasses the guard for this run only. | Low | `showWarningMessage` returns the selected action. If "Run Anyway", continue. Otherwise `return undefined` (consistent with existing `featureParseComplete` guard). |

---

## Differentiators

Features that exceed the baseline but meaningfully improve the experience.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Per-workspace watcher lifecycle (create/dispose on config change) | If the discovered features path changes when a config file is modified, the existing feature/steps watchers (in `workspaceWatcher.ts`) are watching the OLD path. Those must be disposed and recreated. `configurationChangedHandler` already does this (disposes old watchers, starts new ones). The config file watcher just needs to call into the same path. | Low | No new logic needed — `configurationChangedHandler(undefined, undefined, true)` already handles watcher lifecycle. The config watcher's only job is to trigger it. |
| Watcher registered per workspace folder (multi-root safe) | In a multi-root workspace, each folder may have its own config file. A single glob across all folders would fire on the wrong workspace's config file. Using one `RelativePattern(wkspUri, ...)` per workspace folder keeps events scoped. | Low | Mirror the existing pattern in `workspaceWatcher.ts` which creates one watcher per workspace. Store config watchers in a parallel Map in `extension.ts`. |
| Re-notify on malformed config after fix-then-break cycle | `notifiedConfigErrors` (a `Set<string>`) prevents duplicate popups within a session. When a config file is fixed and then broken again in the same session, the key should be re-added so the user gets notified again. Clearing `notifiedConfigErrors` on re-discovery (same as the existing `clearNotifiedErrors: true` path in `updateDiscoveryUX`) handles this. | Low | Already partially handled. Confirm `clearNotifiedErrors=true` is passed when re-discovery is triggered by a file event (vs. `false` at initial activation). |

---

## Anti-Features

Things to explicitly NOT build in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| "Reload window" prompt on config change | The ESLint extension does NOT ask users to reload the window when `.eslintrc` changes — it re-validates inline. Asking users to reload for a `behave.ini` change would be regressive UX given the extension already supports live reparse of feature files. | Silent re-discovery (update Test Explorer + output log). |
| Watcher for `~/.behaverc` (home dir) | Home directory config affects runtime behavior, not project structure. Watching a path outside the workspace is outside VS Code's standard FileSystemWatcher scope and requires absolute paths, which do not survive workspace portability. | Documented out-of-scope. Already in PROJECT.md. |
| Debounce at the `FileParser` level for config events | `FileParser`'s existing 500ms debounce is for Python step files (high-frequency edits). Config files change rarely and their discovery is heavier than step parsing. Sharing the debounce timer conflates two concerns and risks one cancelling the other. | Separate `debounceTimer: NodeJS.Timeout | undefined` local to the config watcher handler. |
| "Fix config" inline code action | Offering a quick fix for TOML/INI syntax errors is out of scope for a test runner. It would require a language server and understanding of behave's full config grammar. | The existing "Open Config File" button in the warning notification is sufficient. |
| Hard-blocking run on malformed config (no "Run Anyway") | Behave might still run correctly if the malformed section is `pyproject.toml`'s `[tool.other]` not `[tool.behave]`. A hard block punishes users with partially valid configs. | Modal warning with "Run Anyway" option. |
| Watching `package.json` or other non-behave config files | ESLint watches `package.json` because ESLint config can live there. Behave has no such relationship with `package.json`. Watching it adds noise. | Only the five files in `CONFIG_FILES` from `configParser.ts`. |

---

## Feature Dependencies

```
Config file watcher (create + modify + delete)
  → requires: discoveryCache invalidation API (getUrisOfWkspFoldersWithFeatures(forceRefresh=true)) — EXISTING
  → requires: updateDiscoveryUX() — EXISTING
  → requires: configurationChangedHandler() — EXISTING
  → produces: fresh DiscoveryEntry in cache for each workspace
  → produces: updated Test Explorer tree

Watcher lifecycle management (dispose old, create new on path change)
  → already handled by: configurationChangedHandler(forceFullRefresh=true) — EXISTING
  → no new logic required

Config watcher disposable registration
  → add to: context.subscriptions (same as workspaceWatcher pattern) — Low complexity

Malformed config run guard
  → requires: getDiscoveryEntry(wkspUri) — EXISTING
  → requires: DiscoveryEntry.configError field — EXISTING (set in common.ts discovery logic)
  → insertion point: testRunHandler.ts, after featureParseComplete guard, before run.createTestRun()
  → uses: vscode.window.showWarningMessage — Low complexity

Run guard "per workspace" check
  → must iterate: getUrisOfWkspFoldersWithFeatures() filtered to queue workspaces
  → can use: existing wkspSettings loop in testRunHandler
```

---

## Complexity Assessment

Both features are LOW implementation complexity because:

- The config file watcher has no novel logic — it reuses `configurationChangedHandler(undefined, undefined, true)` which already handles cache invalidation, watcher restart, reparse, and UX update. The watcher is essentially a 20-30 line function in `extension.ts` that creates one `FileSystemWatcher` per workspace and calls the existing handler on events.
- The run guard inserts 10-15 lines into `testRunHandler.ts` above an existing guard, reads from an already-populated cache entry, and calls a well-understood VS Code API (`showWarningMessage` with modal-style "Run Anyway" / "Open Config File" buttons).

Neither feature requires new modules, new abstractions, or new test infrastructure beyond standard Sinon stubs for the new watcher events and run guard.

**Risk area:** The glob pattern for named config files. Using exact filenames (e.g. `new RelativePattern(wkspUri, "behave.ini")`) has a known VS Code bug (issue #164925, ~2022) where events do not fire. The safe pattern is a brace-alternation glob: `{behave.ini,.behaverc,setup.cfg,tox.ini,pyproject.toml}`. This is a one-line choice at watcher creation time — MEDIUM confidence (VS Code fixed the exact-filename issue in later releases, but the brace glob is safer and should be used regardless).

---

## Sources

- [VS Code FileSystemWatcher API — Haxe externs docs](https://vshaxe.github.io/vscode-extern/vscode/FileSystemWatcher.html)
- [File Watcher Internals — microsoft/vscode Wiki](https://github.com/microsoft/vscode/wiki/File-Watcher-Internals)
- [API: FileSystemWatcher not firing when complete filename used without wildcards — issue #164925](https://github.com/microsoft/vscode/issues/164925)
- [FileSystemWatcher fires events before text documents are updated — issue #72831](https://github.com/microsoft/vscode/issues/72831)
- [microsoft/vscode-eslint client.ts — config file watcher via synchronize.fileEvents](https://github.com/microsoft/vscode-eslint/blob/main/client/src/client.ts)
- Existing codebase: `src/watchers/workspaceWatcher.ts`, `src/runners/testRunHandler.ts`, `src/extension.ts` (`configurationChangedHandler`, `updateDiscoveryUX`), `src/common.ts` (`getUrisOfWkspFoldersWithFeatures`, `discoveryCache`, `getDiscoveryEntry`)
