# Phase 4: Watcher & Run Guard - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver config file watchers that silently re-discover features when behave config files change, and a run guard that warns users before executing tests in a workspace with a malformed config. The test tree updates automatically on config file create/change/delete with 500ms debounce. The run guard intercepts all test execution triggers (run, debug, individual scenario) and prompts the user with actionable options.

</domain>

<decisions>
## Implementation Decisions

### Debounce Behavior
- **D-01:** Status bar shows "Behave: Parsing..." (busy=true) when debounce starts, clears when reparse completes. Consistent with existing activation behavior.
- **D-02:** Rapid saves reset the 500ms debounce timer on each save. Only the final save triggers re-discovery. Matches the existing Python file debounce pattern in `fileParser.ts`.
- **D-03:** All events (create, change, delete) go through the same 500ms debounce. No special-casing for delete. Handles delete-then-recreate within 500ms (e.g., git operations).

### Run Guard UX
- **D-04:** Warning message names the broken file: "Config file '{filename}' has parse errors. Tests may not discover correctly." Consistent with existing malformed config notification in `updateDiscoveryUX`.
- **D-05:** Warning prompts every time — no "remember" behavior. Re-checks `discoveryCache` via `getDiscoveryEntry()` on each run. Warning automatically stops appearing once the config is fixed (watcher re-discovery clears `configError`).
- **D-06:** In multi-root workspaces, warn only for workspaces whose tests are queued AND have `configError` (GUARD-04). "Cancel" cancels the entire run. "Run Anyway" runs all tests including the broken workspace. "Open Config File" opens the file and cancels the run.
- **D-07:** Guard fires for all test execution triggers — bulk runs, individual scenario runs, and debug sessions (GUARD-03). Same code path through `testRunHandler`.

### Watcher Lifecycle
- **D-08:** Config watchers created at activation alongside existing `wkspWatchers`, using brace-expansion glob pattern for all 5 config filenames at workspace root.
- **D-09:** Separate `wkspConfigWatchers: Map<Uri, FileSystemWatcher[]>` parallel to `wkspWatchers`. Keeps concerns separate.
- **D-10:** Config watchers disposed and recreated in `configurationChangedHandler` alongside existing `wkspWatchers` handling. Single code path for all workspace lifecycle events (add/remove/rename).
- **D-11:** Config file creation in a workspace using convention always triggers full re-discovery. Config-file discovery takes precedence over convention per existing priority chain.

### Logging & Feedback
- **D-12:** Output channel logs one-line summary on config change: "Config file changed: {filename} — re-discovering features..." followed by existing `updateDiscoveryUX` discovery summary.
- **D-13:** xRay diagnostic logging includes detailed watcher event info: event type, debounce timer resets, re-discovery timing. Zero overhead when disabled.
- **D-14:** Run guard warning logged to output channel: "Run guard: config error in {filename} — user prompted". Creates audit trail.
- **D-15:** No user-visible notification (toast) on successful config change re-discovery. Silent update per WATCH-04. Status bar "Parsing..." is the only visible feedback.

### Claude's Discretion
- Debounce timer implementation: separate per-workspace timer Map vs reusing fileParser debounce mechanism. Claude should choose based on code cleanliness and separation of concerns.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — WATCH-01 through WATCH-06, GUARD-01 through GUARD-04, TEST-07, TEST-09

### Architecture & Constraints
- `.planning/STATE.md` §Accumulated Context — Key architecture constraints for watcher lifecycle, run guard scoping, and integration test guard
- `.planning/research/PITFALLS.md` — Known pitfalls from v1.1 research (watcher disposal, stale file reads, integration test guard bypass)

### Existing Code (must read before implementing)
- `src/extension.ts` — `configurationChangedHandler`, `updateDiscoveryUX`, `wkspWatchers` Map, `notifiedConfigErrors` Set, `activate()` watcher setup
- `src/watchers/workspaceWatcher.ts` — Existing watcher pattern to follow (per-workspace, returns FileSystemWatcher[], event handlers)
- `src/runners/testRunHandler.ts` — Test run entry point where run guard must be inserted
- `src/common.ts` — `getDiscoveryEntry()`, `discoveryCache`, `DiscoveryEntry` type with `configError`
- `src/handlers/configDiagnostics.ts` — `setConfigParseErrorDiagnostic`, `clearConfigParseErrorDiagnostic`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `configurationChangedHandler` in `extension.ts`: Already handles watcher dispose/recreate, settings reload, and test tree reparse on config change. Config watchers should route through this.
- `updateDiscoveryUX()` in `extension.ts`: Already surfaces discovery results to output channel and fires malformed config notifications. Can be called after config watcher re-discovery.
- `getDiscoveryEntry()` in `common.ts`: Returns `DiscoveryEntry` with `configError` field. Run guard reads this to determine if a warning is needed.
- `notifiedConfigErrors` Set in `extension.ts`: Tracks per-session notification dedup. Must be cleared per-workspace on watcher-triggered re-discovery (WATCH-06).
- `startWatchingWorkspace()` in `workspaceWatcher.ts`: Pattern to follow for config watchers — per-workspace, returns `FileSystemWatcher[]`, pushes to `context.subscriptions`.

### Established Patterns
- Debounce: `fileParser.ts` uses `_pythonReparseTimers: Map<string, NodeJS.Timeout>` with `clearTimeout`/`setTimeout` for 500ms debounce on Python file changes.
- Watcher lifecycle: `wkspWatchers` Map in `extension.ts` — dispose old watchers before creating new ones in `configurationChangedHandler`.
- Error display: `config.logger.showError(e, wkspUri)` for entry-point error handling. `vscode.window.showWarningMessage()` for user-facing warnings with action buttons.
- Status bar: `parser.onStatusChange` callback sets `statusItem.busy` and `statusItem.text`.

### Integration Points
- Config watcher callback → `configurationChangedHandler(undefined, undefined, true)` — forces full refresh including cache invalidation
- Run guard → inserted in `testRunHandler` return function, before `queueSelectedTestItems()` call
- Watcher disposal → `configurationChangedHandler` loop where `wkspWatchers` are disposed/recreated

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches following established codebase patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-watcher-run-guard*
*Context gathered: 2026-04-16*
