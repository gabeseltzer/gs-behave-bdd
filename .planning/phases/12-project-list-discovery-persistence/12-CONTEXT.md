# Phase 12: Project List Discovery & Persistence - Context

**Gathered:** 2026-04-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Extension discovers all behave projects in a workspace and maintains a persistent project list with one active selection. The scanner promotes all discovered configs (root-level and subdirectory) as switchable projects; active selection is persisted via `workspaceState` and auto-selected on first use. Config watchers keep the list in sync with disk.

This phase delivers the **data layer** — project list management, persistence, watcher integration, and auto-selection logic. It does NOT add user-facing switching UI (Phase 13: quick-pick command, status bar indicator) or tree rebuild on switch (Phase 14).

</domain>

<decisions>
## Implementation Decisions

### Active Project Fallback

- **D-01:** When the active project's config is deleted, auto-select the next project in scanner order (depth + config priority) and notify the user via **non-modal info notification + output channel log**. Notification format: brief message ("Active project config deleted. Switched to [project].") with a "Show Details" button that opens the output channel.
- **D-02:** When the last (only) project's config is deleted, clear the test tree and log to the output channel — same as current single-project behavior. No notification beyond the log.
- **D-03:** When the active project's config becomes **malformed** (parse error), keep the project in the list. The existing run guard (Phase 4) handles test execution. Do not auto-switch away from a malformed config.

### Notification Evolution

- **D-04:** Leave Phase 9's multi-config notification ("set projectPath to choose a different project") unchanged in Phase 12. Phase 13 updates it when the `Select Project` command exists. Clean separation: Phase 12 is data layer only.

### Project List Ordering

- **D-05:** Project list is ordered as **active project first, then scanner order** (depth ASC, config priority ASC) for the rest. The underlying storage keeps scanner order; presentation floats the active project to the top.
- **D-06:** Auto-selection (DISC-03) picks the scanner's primary result (shallowest depth, highest config priority) — consistent with Phase 9's existing first-match-wins behavior.
- **D-07:** When a new config file is created on disk (watcher detects it), add it to the project list **silently**. The active project does not change. The user can switch manually via Phase 13's command.

### Root-Level Config Status

- **D-08:** Root-level configs are equal entries in the project list at depth 0. No special "primary" treatment — they naturally sort first via scanner order and auto-select when no prior choice exists.
- **D-09:** Both root-level and subdirectory configs are fully switchable projects. Active selection determines which one is used.
- **D-10:** **Full scan wait before populating the project list.** The test tree stays empty until the BFS scanner completes (including root-level config discovery). Use the **Test Controller resolving state** (`testController.resolveHandler`) to show the native VS Code loading spinner in the Test Explorer during the scan.
- **D-11:** Output channel continues to log "Scanning for behave configs..." during the scan (Phase 9 D-02 behavior preserved).

### Agent's Discretion

- Internal data structure for the project list (new `ProjectList` class/interface vs extending `ScanResult`)
- How `workspaceState` key is structured for persistence (config file path, directory path, or other identifier)
- How root-level config discovery is unified with the BFS scanner (run root check inside the scanner, or merge results after)
- Whether project list module lives in `src/discovery/` alongside `configScanner.ts` or in a new location
- Exact wording of notification messages and output channel log lines

</decisions>

<specifics>
## Specific Ideas

- **Test Controller resolving state** — VS Code's `testController.resolveHandler` pattern shows a loading spinner in the Test Explorer. This replaces the empty-tree gap during scanning with a native "discovering tests" indicator.
- **Notification pattern for fallback** — Follow Phase 9's notification style (non-modal `showInformationMessage` with action buttons). "Show Details" opens the output channel, consistent with Phase 9 D-07.
- **Scanner order is the source of truth** — The project list's underlying storage preserves scanner order (depth + config priority). The "active first" presentation is a derived view for Phase 13's quick-pick.
- **`workspaceState` is new to the codebase** — No existing `workspaceState` usage. This is the first extension state that persists across reloads without being in `settings.json`.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap + Requirements
- `.planning/ROADMAP.md` §Phase 12 — Goal, Success Criteria 1-5, Requirements DISC-01 through DISC-05, INT-04, TEST-01
- `.planning/REQUIREMENTS.md` §DISC-01, §DISC-02, §DISC-03, §DISC-04, §DISC-05, §INT-04, §TEST-01 — exact acceptance criteria

### Prior Phase Context
- `.planning/phases/09-subdirectory-config-scan/09-CONTEXT.md` — D-01 (async scan lifecycle), D-06-D-10 (notification UX), D-11-D-14 (ordering semantics), D-15 (settings)
- `.planning/phases/04-watcher-run-guard/04-CONTEXT.md` — Watcher patterns, run guard behavior

### Key Source Files
- `src/discovery/configScanner.ts` — `ScanResult`, `ScanResultEntry`, `scanForBehaveConfig()`, `scanResultCache`
- `src/common.ts` — `DiscoveryEntry`, `discoveryCache`, `hasFeaturesFolder()`, discovery precedence ladder
- `src/configuration.ts` — `ExtensionConfiguration` singleton, per-workspace `WorkspaceSettings`
- `src/settings.ts` — `WorkspaceSettings` class, settings loading
- `src/extension.ts` — Activation flow, async BFS scanner IIFE (lines 560-750), `updateDiscoveryUX()`

### Architecture Decisions
- `.planning/STATE.md` §v1.3.0 Architecture Decision — "One active project at a time with switching"

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ScanResult` / `ScanResultEntry` in `configScanner.ts` — already contains `primary` + `alsoFound[]` with depth and config priority. Project list can build on this.
- `scanResultCache` (Map<string, ScanResult>) — in-memory cache keyed by workspace URI. Could be extended or replaced by a project list cache.
- `discoveryCache` (Map<string, DiscoveryEntry>) in `common.ts` — stores resolved features URIs per workspace. The active project feeds into this.
- `findBehaveConfig()` in `configParser.ts` — synchronous root-level config finder. Needs to be unified with BFS scanner results for the project list.
- `updateDiscoveryUX()` in `extension.ts` — currently handles the multi-config notification. Will need to be aware of the project list.

### Established Patterns
- **Cache pattern** — Module-level Map with `get`/`set`/`clear` exports (used by both `scanResultCache` and `discoveryCache`)
- **Async post-activation IIFE** — Scanner runs after sync activation completes (extension.ts lines 560-750)
- **Non-modal notifications** — `showInformationMessage` with action buttons ("Open Settings", "Show Details", "Don't Show Again")
- **Per-workspace keying** — `uriId(wkspUri)` used as Map keys throughout

### Integration Points
- Config file watcher (Phase 4) — needs to update the project list on create/delete/modify events
- `reloadSettings()` in `configuration.ts` — called after discovery; needs to use the active project from the list
- `getUrisOfWkspFoldersWithFeatures()` in `common.ts` — gatekeeper function that reads discovery cache; needs to reflect active project selection

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 12-project-list-discovery-persistence*
