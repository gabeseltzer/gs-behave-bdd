# Phase 3: UX & Verification - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Surface discovery information to users via logging, warning notifications, status bar annotations, and setting description updates. Validate the full discovery flow with integration tests and backward-compat checks. This phase makes the auto-discovery feature visible and debuggable.

</domain>

<decisions>
## Implementation Decisions

### Discovery Logging
- **D-01:** Always-on minimal logging: one-line summary per workspace on activation and settings changes, e.g. `Discovered via behave.ini: /path/to/features`. Use `config.logger.logInfo()` for the summary line.
- **D-02:** When xRay diagnostic mode is enabled, also log the full discovery chain: config file path searched, paths parsed, resolution result, discovery source. Use `diagLog()` for the detailed output. Follows the existing xRay pattern throughout the codebase.

### Parse Error UX
- **D-03:** Malformed config file errors surface as both a VS Code warning notification AND a diagnostic entry in the Problems panel. The warning notification is non-blocking — the extension continues with convention fallback per Phase 2's D-06.
- **D-04:** The warning notification includes two action buttons: "Open Config File" (opens the malformed file in the editor) and "Open Settings" (opens extension settings so the user can set paths manually as an alternative).
- **D-05:** The diagnostic entry in the Problems panel should reference the malformed config file's URI so clicking the diagnostic navigates to the file. Use `vscode.DiagnosticCollection` — the extension already uses this pattern in `stepDiagnostics.ts` and `fixtureDiagnostics.ts`.

### Status Bar
- **D-06:** Status bar item shows an icon only (no text label). Hover tooltip shows full discovery details: source ("config-file" / "convention" / "settings"), project root, features path, and config file path if applicable.
- **D-07:** Click action and visibility rules are Claude's discretion — pick what's most useful based on VS Code extension conventions.

### Setting Descriptions
- **D-08:** Setting description wording for `projectPath` and `featuresPath` is Claude's discretion — reframe to indicate these are overrides of auto-discovery.

### Integration Tests
- **D-09:** Comprehensive test coverage: create multiple new example projects (`config-only/`, `pyproject-config/`, `malformed-config/`) each with their own integration tests.
- **D-10:** Add unit tests for discovery priority logic (settings > config > convention) per TEST-02.
- **D-11:** Verify all existing example projects with `.vscode/settings.json` still pass unchanged per TEST-06.

### Claude's Discretion
- Status bar click action (open output channel vs open settings vs no action)
- Status bar visibility rules (always when active vs only for config-file discovery)
- Exact wording for setting description updates (UX-05)
- Diagnostic severity level for malformed config entries
- Example project directory structure and feature file contents

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 2 Integration Points
- `src/common.ts` — `discoveryCache` Map, `DiscoveryEntry` type, `getDiscoveryEntry()` getter — Phase 3 reads error details from cache
- `src/settings.ts` — `WorkspaceSettings.discoverySource` and `.configFileUri` properties — Phase 3 surfaces these in UX
- `src/parsers/configParser.ts` — `BehaveConfigResult` discriminated union with `ok: false` error variant — Phase 3 reads `errorMessage`

### Existing UX Patterns
- `src/logger.ts` — `Logger` class: `logInfo()`, `logSettingsWarning()`, `showWarn()`, `diagLog()` — reference for logging approach
- `src/handlers/stepDiagnostics.ts` — `DiagnosticCollection` usage pattern for Problems panel entries
- `src/handlers/fixtureDiagnostics.ts` — Another `DiagnosticCollection` reference

### Extension Manifest
- `package.json` — Setting descriptions for `projectPath` and `featuresPath` (UX-05 update targets)

### Test Infrastructure
- `example-projects/` — Existing example projects directory (10+ projects, none with config-only setup)
- `test/integration/` — Integration test infrastructure
- `.planning/REQUIREMENTS.md` — UX-01 through UX-05, TEST-02, TEST-05, TEST-06

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Logger` class in `src/logger.ts`: `logInfo()` for always-on, `diagLog()` for xRay-gated detail
- `DiagnosticCollection` pattern in `stepDiagnostics.ts` and `fixtureDiagnostics.ts`: reuse for config parse error diagnostics
- `discoveryCache` Map in `common.ts`: already stores error details (`ok: false` entries) — Phase 3 just reads them
- `WorkspaceSettings.discoverySource` and `.configFileUri`: already populated in Phase 2, ready to surface

### Established Patterns
- Warning notifications via `vscode.window.showWarningMessage()` with action buttons (used in `extension.ts` lines 207-210)
- xRay diagnostic logging via `diagLog()` function (gated by settings, zero-cost when disabled)
- Per-workspace output channels for multi-root workspace support
- Integration tests using example projects in `example-projects/` directory

### Integration Points
- `activate()` in `extension.ts`: after gatekeeper returns, this is where discovery logging and status bar creation should happen
- `configurationChangedHandler` in `extension.ts`: triggers re-discovery, needs to update status bar and re-log
- `WorkspaceSettings` constructor: already receives discovery data, logging can happen here

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-ux-verification*
*Context gathered: 2026-04-15*
