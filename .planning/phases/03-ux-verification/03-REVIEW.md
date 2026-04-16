---
phase: 03-ux-verification
reviewed: 2026-04-16T12:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - src/extension.ts
  - src/handlers/configDiagnostics.ts
  - package.json
  - test/integration/config-only suite/expectedResults.ts
  - test/integration/config-only suite/extension.test.ts
  - test/integration/config-only suite/index.ts
  - test/integration/malformed-config suite/expectedResults.ts
  - test/integration/malformed-config suite/extension.test.ts
  - test/integration/malformed-config suite/index.ts
  - test/integration/pyproject-config suite/expectedResults.ts
  - test/integration/pyproject-config suite/extension.test.ts
  - test/integration/pyproject-config suite/index.ts
  - test/integration/runTestSuites.ts
  - test/unit/settings/discoveryPriority.test.ts
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-04-16T12:00:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Phase 3 introduces the UX layer for behave config auto-discovery: a `updateDiscoveryUX` function that surfaces discovery results via the status bar, output channel, warning notifications, and VS Code Problems panel diagnostics. It also adds `configDiagnostics.ts` for managing parse-error diagnostics, three new integration test suites (`config-only`, `malformed-config`, `pyproject-config`), a unit test for discovery priority, and the wiring in `runTestSuites.ts`.

The code is generally well-structured and follows project conventions. No critical security or crash issues were found. There are three warnings related to potential bugs (URI key inconsistency, unhandled promise rejection, stale diagnostics on deactivation) and three informational items.

## Warnings

### WR-01: URI Key Inconsistency in notifiedConfigErrors Set

**File:** `src/extension.ts:95`
**Issue:** The `notifiedConfigErrors` set uses `errorUri.fsPath` as the deduplication key (line 95), while the rest of the codebase consistently uses `uriId(uri)` (which calls `uri.toString()`) for URI-based keys. On Windows, `fsPath` can have inconsistent drive letter casing (`C:` vs `c:`), which could cause the same config file to trigger duplicate notifications or, conversely, fail to deduplicate. The project's `AI_INSTRUCTIONS.md` and `common.ts` explicitly warn against using `.fsPath` for comparison.
**Fix:**
```typescript
import { uriId } from './common';
// ...
const key = uriId(errorUri);
```

### WR-02: Unhandled Promise Rejection on showWarningMessage Chain

**File:** `src/extension.ts:98-108`
**Issue:** The fire-and-forget `.then()` chain on `vscode.window.showWarningMessage(...)` has no `.catch()` handler. If `vscode.commands.executeCommand('vscode.open', errorUri)` or the settings command rejects (e.g., if the file was deleted between notification display and user click), the promise rejection will be unhandled. The project convention (from `AI_INSTRUCTIONS.md`) says to use async/await, not `.then()` chains, except for unawaited background tasks -- and even unawaited tasks should handle errors.
**Fix:** Add a `.catch()` to prevent unhandled rejection:
```typescript
vscode.window.showWarningMessage(
  `Behave BDD: Could not parse "${basename(errorUri)}": ${msg}\n\nFalling back to "features/" convention.`,
  'Open Config File',
  'Open Settings'
).then(action => {
  if (action === 'Open Config File') {
    return vscode.commands.executeCommand('vscode.open', errorUri);
  } else if (action === 'Open Settings') {
    return vscode.commands.executeCommand('workbench.action.openSettings', 'gs-behave-bdd');
  }
}).catch(() => { /* notification dismissed or command failed -- safe to ignore */ });
```

### WR-03: Config Parse Error Diagnostics Not Cleared on Workspace Removal

**File:** `src/extension.ts:57-125` and `src/handlers/configDiagnostics.ts`
**Issue:** When `updateDiscoveryUX` is called with `clearNotifiedErrors: true` (on workspace folder changes, line 631), it clears the notification dedup set but does not clear stale diagnostics from the Problems panel for workspaces that were removed. The `clearConfigParseErrorDiagnostic` is only called when a specific `entry.configFileUri` exists without an error (line 112), but if a workspace is removed entirely, its diagnostics will persist until VS Code is reloaded. This could confuse users who see stale "Behave config parse error" entries for folders they no longer have open.
**Fix:** When `clearNotifiedErrors` is true, iterate the diagnostic collection and clear config-parse-error entries for URIs that no longer belong to any workspace folder:
```typescript
if (clearNotifiedErrors) {
  notifiedConfigErrors.clear();
  // Clear stale diagnostics for removed workspaces
  config.diagnostics.forEach((uri, _diagnostics) => {
    if (!vscode.workspace.getWorkspaceFolder(uri)) {
      clearConfigParseErrorDiagnostic(uri);
    }
  });
}
```

## Info

### IN-01: Diagnostic Range Always Points to Line 0, Column 0

**File:** `src/handlers/configDiagnostics.ts:10`
**Issue:** `setConfigParseErrorDiagnostic` creates a diagnostic at `Range(0, 0, 0, 0)`, which means the error squiggly in the Problems panel will always point to the very first character of the config file. While acceptable for v1 (since the error message itself is descriptive), a future improvement could parse the error position from the underlying parser error to provide a more precise location.
**Fix:** Consider extracting line/column from the parser error in a future iteration, or use `Range(0, 0, 0, Number.MAX_SAFE_INTEGER)` to highlight the entire first line for better visibility.

### IN-02: malformed-config Suite Only Tests runDefault (No runParallel/runTogether)

**File:** `test/integration/malformed-config suite/extension.test.ts:11-13`
**Issue:** The `malformed-config` suite only exercises `runDefault`, whereas the `config-only` and `pyproject-config` suites also exercise `runParallel` and `runTogether`. This is likely intentional (malformed config falls back to convention, so parallel/together modes are implicitly covered by the `simple` suite which also uses convention). However, this asymmetry is not documented and could be mistaken for an oversight.
**Fix:** Add a brief comment in the test file explaining why `runParallel` and `runTogether` are intentionally omitted:
```typescript
// Only runDefault is tested -- malformed config falls back to convention (features/),
// which is already covered by runParallel/runTogether in the simple suite.
```

### IN-03: New Integration Suites Missing from .vscode/launch.json Debug Configurations

**File:** `test/integration/runTestSuites.ts`
**Issue:** The three new integration test suites (`config-only`, `pyproject-config`, `malformed-config`) are registered in `runTestSuites.ts` (lines 131-156) but do not have corresponding debug launch configurations in `.vscode/launch.json`. Other suites (simple, nested project, etc.) have debug configurations for developer convenience. This is a developer experience gap, not a functional issue.
**Fix:** Add launch configurations for the three new suites in `.vscode/launch.json` following the pattern of existing suite entries.

---

_Reviewed: 2026-04-16T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
