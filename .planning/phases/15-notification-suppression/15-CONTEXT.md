# Phase 15: Notification Suppression Infrastructure - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a reusable notification suppression module and migrate the existing ad-hoc `suppressMultiConfigNotification` boolean to the new `suppressedNotifications` string array infrastructure. The multi-config notification is the first consumer; Phase 16's migration notification will be the second.

</domain>

<decisions>
## Implementation Decisions

### Suppression Module API Shape
- **D-01:** Plain exported functions (not class or namespace). Matches codebase style in `common.ts`.
- **D-02:** New dedicated file `src/notifications.ts` for all notification-related utilities.
- **D-03:** Module provides a full notification wrapper `showSuppressibleNotification(key, message, buttons, wkspUri)` that auto-appends "Don't Show Again" and handles suppression internally.
- **D-04:** Wrapper returns the user's selected action (`string | undefined`), excluding "Don't Show Again" which is handled internally. Callers can react to button choices (e.g., "Select Project" → run command).

### Migration Timing & Error Handling
- **D-05:** Migration runs eagerly on activation (inside `activate()`), before any notifications fire.
- **D-06:** After writing the new array value, remove the old `suppressMultiConfigNotification` key from settings via `update(oldKey, undefined)`.
- **D-07:** On migration failure (e.g., read-only workspace), log a warning to the output channel but don't notify the user. Old boolean stays, new array gets created with default `[]`.
- **D-08:** Migration writes the array value at the same scope level where the old boolean was found (use `inspect()` to detect scope).

### Notification Key Naming Convention
- **D-09:** Keys are camelCase freeform strings (e.g., `multiConfigNotification`, `featuresPathMigration`).
- **D-10:** No validation of key values — unknown keys in the array are silently ignored.
- **D-11:** Deduplicate on write — `suppressNotification()` checks if key already exists before appending.

### Claude's Discretion
- Internal function naming and parameter ordering within `src/notifications.ts`
- Whether migration function is exported (for unit testing) or kept private
- Whether to export a `migrateNotificationSuppression()` function separately or inline in activation

</decisions>

<specifics>
## Specific Ideas

- The wrapper should handle the "Don't Show Again" button action transparently — callers pass their custom buttons only, the wrapper appends "Don't Show Again" and intercepts it.
- Migration must use `vscode.workspace.getConfiguration().inspect()` to find the scope level of the old boolean, matching the pattern already established in the codebase for settings inspection.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing suppression implementation (to be replaced)
- `src/extension.ts` §L141-L181 — Current inline multi-config notification with ad-hoc boolean suppression
- `src/settings.ts` §L74, §L155-L167 — `suppressMultiConfigNotification` property and loading
- `src/testWorkspaceConfig.ts` §L27, §L110-L111, §L175-L176, §L278-L279 — Mock for the boolean setting
- `package.json` §L120-L125 — Schema definition for the boolean setting

### Settings patterns (for migration approach)
- `src/settings.ts` — How settings are loaded and validated (pattern to follow for new array setting)
- `src/testWorkspaceConfig.ts` — Mock configuration pattern (must be updated for new setting shape)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `config.workspaceSettings[wkspUri.path]` pattern for accessing per-workspace settings
- `vscode.workspace.getConfiguration("gs-behave-bdd", wkspUri)` pattern for writing settings
- `config.logger.logInfo()` and `config.logger.showWarn()` for output channel logging

### Established Patterns
- Settings are loaded in `WorkspaceSettings` constructor (`src/settings.ts`) with `getConfiguration().get()` calls
- Settings throw if undefined (strict validation)
- `testWorkspaceConfig.ts` mirrors all settings with `get()` / `inspect()` / `update()` switch cases
- Package.json defines schema with scope, type, markdownDescription, and default

### Integration Points
- `activate()` in `src/extension.ts` — where migration should run (before multi-config notification code)
- Multi-config notification block at L141-L181 in `extension.ts` — first consumer to migrate to new module
- `WorkspaceSettings` class — needs new `suppressedNotifications` array property
- `testWorkspaceConfig` — needs new array setting mock, old boolean mock removed

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 15-notification-suppression*
