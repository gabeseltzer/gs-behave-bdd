---
phase: 03-ux-verification
plan: 01
subsystem: ui
tags: [vscode-extension, diagnostics, status-bar, notifications, ux]

# Dependency graph
requires:
  - phase: 01-config-parsing
    provides: "DiscoveryEntry interface, getDiscoveryEntry(), discoveryCache populated by getUrisOfWkspFoldersWithFeatures()"
  - phase: 02-settings-integration
    provides: "WorkspaceSettings.discoverySource, ConfigResult with ok/error shape"
provides:
  - "configDiagnostics handler with setConfigParseErrorDiagnostic/clearConfigParseErrorDiagnostic"
  - "updateDiscoveryUX function wiring discovery results to output channel, notifications, diagnostics, and status bar"
  - "package.json setting descriptions framing projectPath/featuresPath as overrides of auto-discovery"
affects: [03-ux-verification, integration-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Code-scoped DiagnosticCollection filter pattern (same as stepDiagnostics.ts, fixtureDiagnostics.ts)"
    - "Module-level Set<string> for deduplicating VS Code notifications per session"
    - "Fire-and-forget .then() pattern for showWarningMessage with action buttons"

key-files:
  created:
    - src/handlers/configDiagnostics.ts
  modified:
    - src/extension.ts
    - package.json

key-decisions:
  - "Status bar click opens output channel (gs-behave-bdd.openOutput command) — distinct from Open Settings in notification"
  - "notifiedConfigErrors Set cleared only on forceFullRefresh (workspace folder changes), not on every configurationChangedHandler call"
  - "Error messages truncated to 200 chars before embedding in showWarningMessage and diagnostic (T-03-04 mitigation)"

patterns-established:
  - "configDiagnostics.ts: code-scoped diagnostic set/clear using DiagnosticCollection.get/filter/set — extend this pattern for future config-level diagnostics"
  - "updateDiscoveryUX: single function aggregates all discovery-surface concerns (log, notify, diagnostic, status bar) — call from both activate() and configurationChangedHandler()"

requirements-completed: [UX-01, UX-02, UX-03, UX-04, UX-05]

# Metrics
duration: 25min
completed: 2026-04-16
---

# Phase 03 Plan 01: UX Surfacing Summary

**Discovery results surfaced via output channel log, fire-and-forget warning notification with Open Config File/Open Settings buttons, Problems panel diagnostics, and status bar hover detail — with package.json descriptions reframed as override-only**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-16T17:41:00Z
- **Completed:** 2026-04-16T18:06:04Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created `src/handlers/configDiagnostics.ts` with `setConfigParseErrorDiagnostic` / `clearConfigParseErrorDiagnostic` using the code-scoped DiagnosticCollection filter pattern (consistent with `stepDiagnostics.ts` and `fixtureDiagnostics.ts`)
- Added `updateDiscoveryUX` function to `src/extension.ts` wiring all five UX surfaces: always-on output channel log (UX-01), xRay detail log (D-02), fire-and-forget warning notification with action buttons (UX-02, D-03, D-04), Problems panel diagnostic via `setConfigParseErrorDiagnostic` (D-05), and `statusItem.detail` hover tooltip (UX-04, D-06)
- Updated `gs-behave-bdd.projectPath` and `gs-behave-bdd.featuresPath` `markdownDescription` fields in `package.json` to clearly frame them as override-only settings with auto-discovery fallback (UX-05)
- Added `gs-behave-bdd.openOutput` command for status bar click (D-07)
- Implemented duplicate notification guard via `notifiedConfigErrors` Set (T-03-03 mitigation)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create configDiagnostics.ts and updateDiscoveryUX function** - `0d92203` (feat)
2. **Task 2: Update setting descriptions in package.json (UX-05)** - `e1d8fa1` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified
- `src/handlers/configDiagnostics.ts` - New handler: code-scoped set/clear of `behave-config-parse-error` diagnostic entries
- `src/extension.ts` - Added `updateDiscoveryUX` function, `notifiedConfigErrors` Set, wiring in `activate()` and `configurationChangedHandler()`, `openOutput` command
- `package.json` - Updated `markdownDescription` for `gs-behave-bdd.projectPath` and `gs-behave-bdd.featuresPath`

## Decisions Made
- Status bar click opens the Behave BDD output channel (`gs-behave-bdd.openOutput`) rather than opening settings — the output channel is the most useful next step for a developer investigating an unexpected discovery source, consistent with Pylance/ESLint patterns
- `notifiedConfigErrors` Set cleared only on `forceFullRefresh` (workspace folder changes), not on every `configurationChangedHandler` invocation — prevents notification spam while still re-notifying after workspace structure changes
- Error messages truncated to 200 chars (T-03-04) before embedding in `showWarningMessage` text and diagnostic message

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The `Logger.show()` method exists at `src/logger.ts` line 40, so the `openOutput` command used it directly without needing a fallback.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All five UX surfaces (UX-01 through UX-05) are wired and ready for integration testing
- `configDiagnostics.ts` exports are stable — integration tests can verify Problems panel entries appear and clear correctly
- `updateDiscoveryUX` is called from both `activate()` and `configurationChangedHandler()`, so re-discovery after config changes will also update all surfaces

## Threat Flags

No new threat surface beyond what the plan's threat model covers. All threats documented in plan (T-03-01 through T-03-04) have been mitigated as specified.

---
*Phase: 03-ux-verification*
*Completed: 2026-04-16*
