# Phase 13: Switching UX (Quick-Pick & Status Bar) - Context

**Gathered:** 2026-04-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can see which project is active and switch between discovered projects via command palette or status bar. This phase delivers the **user-facing UX layer** — a `Select Project` command with quick-pick, a status bar indicator, and output channel logging. It builds on Phase 12's data layer (`ProjectList` module with `getProjectList`, `getActiveProject`, `setActiveProject`).

This phase does NOT trigger tree/step rebuild on switch (Phase 14) — it only updates the active project selection and the UX elements. It also updates Phase 9's multi-config notification to reference the new command.

</domain>

<decisions>
## Implementation Decisions

### Quick-Pick Item Presentation
- **D-01:** Active project shown with `"✓ active"` in the description field, matching the existing `selectEnvPreset` command pattern.
- **D-02:** Quick-pick layout: **Label** = workspace-relative dir path (e.g. "backend"), **Description** = config file type (e.g. "behave.ini"), **Detail** = full config file path. Per UX-05.
- **D-03:** Root-level projects (config at workspace root) labeled `"(root)"` in the quick-pick and status bar.
- **D-04:** Quick-pick items have an action button to **open the config file** in the editor (similar to the gear button in env preset quick-pick).

### Status Bar Item
- **D-05:** Status bar item positioned on the **left side** (workspace context area, near branch/errors).
- **D-06:** Status bar text format: `Behave: <label>` (e.g. `Behave: backend`, `Behave: (root)` for root-level projects).
- **D-07:** Tooltip is **detailed**: shows active project name, config type, number of discovered projects, and "click to switch" hint. Example: `"Active: backend (behave.ini)\n3 projects discovered — click to switch"`.
- **D-08:** Status bar **appears immediately and silently** when a second project is discovered on disk (watcher detects new config). No notification accompanies the appearance.

### Output Channel Logging
- **D-09:** On project switch, log a **single line**: `Active project switched to: backend (behave.ini)`.
- **D-10:** On startup with multiple projects, log a **bulleted list** (same format as Phase 9 multi-config log): each project on its own `•` line, active project marked. Per INT-03.
- **D-11:** No special prefix on project-related log lines — rely on the extension output channel context.

### Phase 9 Notification Update
- **D-12:** Replace Phase 9's multi-config notification text to mention the `Select Project` command instead of "Set projectPath to choose a different project." Keep the notification structure (non-modal info message with action buttons) but update the call-to-action. This fulfills Phase 12 D-04's deferred work.

### Agent's Discretion
- Status bar priority number (ordering relative to other left-side items)
- Icon choice for the "open config file" quick-pick button (e.g. `$(go-to-file)`, `$(file-code)`)
- Exact notification button labels after rewording (e.g. "Select Project", "Show Details", "Don't Show Again")
- Whether the quick-pick uses `showQuickPick` or `createQuickPick` (the button requirement likely requires `createQuickPick`)
- Status bar item's `name` property for the "Extension Status Bar Items" manager

</decisions>

<specifics>
## Specific Ideas

- **Follow `selectEnvPreset` pattern** — The existing env preset command in `extension.ts` (lines 344-495) is a close template for the Select Project command: multi-workspace handling, `createQuickPick` with item buttons, description/detail layout.
- **`(root)` label** — Consistent with filesystem convention; avoids confusion with workspace folder name which may differ from the root project's purpose.
- **Status bar as primary discovery UX** — The status bar replaces the notification as the primary way users learn about and interact with multi-project workspaces. The notification still fires once but now directs users to the command.
- **Phase 12 `setActiveProject()` is the switch mechanism** — The quick-pick handler calls `setActiveProject(wkspUri, selectedEntry)` and then updates status bar + output channel. Phase 14 wires the rebuild trigger.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap + Requirements
- `.planning/ROADMAP.md` §Phase 13 — Goal, Success Criteria 1-4, Requirements UX-01 through UX-05, INT-03, TEST-02
- `.planning/REQUIREMENTS.md` §UX-01, §UX-02, §UX-03, §UX-04, §UX-05, §INT-03, §TEST-02 — exact acceptance criteria

### Prior Phase Context
- `.planning/phases/12-project-list-discovery-persistence/12-CONTEXT.md` — D-01 through D-11 (project list data layer decisions)
- `.planning/phases/12-project-list-discovery-persistence/12-01-SUMMARY.md` — ProjectList module API (exports, persistence key format)
- `.planning/phases/12-project-list-discovery-persistence/12-02-SUMMARY.md` — Wiring into extension lifecycle, discovery cache, config watcher
- `.planning/phases/09-subdirectory-config-scan/09-CONTEXT.md` — D-06 through D-10 (multi-config notification UX that Phase 13 updates)

### Key Source Files
- `src/discovery/projectList.ts` — `ProjectEntry`, `getProjectList()`, `getActiveProject()`, `setActiveProject()`, `isManualProjectPathMode()`
- `src/extension.ts` — `updateDiscoveryUX()` (lines 68-170, multi-config notification to update), `selectEnvPresetCommand` (lines 344-495, quick-pick pattern to follow), command registrations (lines 298-320)
- `package.json` — `contributes.commands` array (lines 128-155, register new command here)

### Architecture Decisions
- `.planning/STATE.md` §v1.3.0 Architecture Decision — "One active project at a time with switching"

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `selectEnvPresetCommand` in `extension.ts` — Full `createQuickPick` pattern with item buttons, multi-workspace handling, and settings inspection. Closest template for `Select Project` command.
- `ProjectEntry` interface — Has `label`, `configFileUri`, `dirUri`, `depth`, `configPriority`. Label is workspace-relative dir path, ready for quick-pick display.
- `getProjectList(wkspUri)` / `getActiveProject(wkspUri)` / `setActiveProject(wkspUri, entry)` — Full CRUD already available from Phase 12.
- `isManualProjectPathMode(wkspUri)` — Gate for hiding status bar and quick-pick (UX-04).
- `updateDiscoveryUX()` — Current multi-config notification handler. Needs text update per D-12.

### Established Patterns
- **Command registration** — `vscode.commands.registerCommand()` pushed to `context.subscriptions` in `activate()`.
- **Legacy command alias** — New commands get a `behave-vsc.*` legacy alias (see `legacySelectEnvPresetCommand` at line 492).
- **Non-modal notifications** — `showInformationMessage` with action buttons (Open Settings, Show Details, Don't Show Again).
- **Per-workspace keying** — `uriId(wkspUri)` used as Map keys; status bar may need per-workspace items in multi-root.

### Integration Points
- `package.json` `contributes.commands` — Register `gs-behave-bdd.selectProject` command.
- `extension.ts` `activate()` — Create status bar item, register command, push to subscriptions.
- `updateDiscoveryUX()` — Update notification text and add status bar visibility logic.
- `configWatcher.ts` — After `rebuildProjectList`, update status bar visibility (project count may have changed).

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 13-switching-ux-quick-pick-status-bar*
