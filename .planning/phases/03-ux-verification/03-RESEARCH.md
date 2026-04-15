# Phase 3: UX & Verification - Research

**Researched:** 2026-04-15
**Domain:** VS Code Extension UX (logging, notifications, diagnostics, status bar) + Integration Test Infrastructure
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Always-on minimal logging: one-line summary per workspace on activation and settings changes, e.g. `Discovered via behave.ini: /path/to/features`. Use `config.logger.logInfo()` for the summary line.
- **D-02:** xRay diagnostic mode logs the full discovery chain: config file path searched, paths parsed, resolution result, discovery source. Use `diagLog()` for detailed output. Follows the existing xRay pattern.
- **D-03:** Malformed config file errors surface as both a VS Code warning notification AND a diagnostic entry in the Problems panel. Non-blocking — extension continues with convention fallback.
- **D-04:** Warning notification includes two action buttons: "Open Config File" (opens the malformed file in the editor) and "Open Settings" (opens extension settings so user can set paths manually).
- **D-05:** Diagnostic entry references the malformed config file's URI so clicking it navigates to the file. Use `vscode.DiagnosticCollection` — the extension already uses this pattern.
- **D-06:** Status bar item shows an icon only (no text label). Hover tooltip shows full discovery details: source, project root, features path, and config file path if applicable.
- **D-07:** Click action and visibility rules are Claude's discretion.
- **D-08:** Setting description wording for `projectPath` and `featuresPath` is Claude's discretion — reframe to indicate these are overrides of auto-discovery.
- **D-09:** Comprehensive test coverage: create multiple new example projects (`config-only/`, `pyproject-config/`, `malformed-config/`) each with their own integration tests.
- **D-10:** Add unit tests for discovery priority logic (settings > config > convention) per TEST-02.
- **D-11:** Verify all existing example projects with `.vscode/settings.json` still pass unchanged per TEST-06.

### Claude's Discretion

- Status bar click action (open output channel vs open settings vs no action)
- Status bar visibility rules (always when active vs only for config-file discovery)
- Exact wording for setting description updates (UX-05)
- Diagnostic severity level for malformed config entries
- Example project directory structure and feature file contents

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UX-01 | Output channel logs discovery results (source, project root, features path) | `logInfo()` already exists in `Logger`; `WorkspaceSettings` already has `discoverySource` and `configFileUri` populated by Phase 2 |
| UX-02 | Malformed config files trigger warning notification with parse error details | `vscode.window.showWarningMessage()` with action buttons; `DiscoveryEntry.configError` already populated in `discoveryCache` |
| UX-03 | Config parse failure falls back to `features/` convention | Already implemented in Phase 2; Phase 3 only surfaces the error to the user |
| UX-04 | Status bar detail shows discovery source on hover | `LanguageStatusItem.detail` property — already used for step load errors; Phase 3 extends it with discovery info |
| UX-05 | `projectPath` and `featuresPath` setting descriptions updated to frame as overrides | Edit `package.json` `markdownDescription` fields |
| TEST-02 | Unit tests for priority logic (settings > config > convention) | New unit test file; uses existing mock pattern from `discoverySource.test.ts` |
| TEST-05 | Integration test with `config-only/` example project (no settings.json) | New example project + new integration test suite; follows `simple suite` pattern |
| TEST-06 | Backward compat verified: existing example projects unchanged | Run existing suites; no code changes to existing example projects |
</phase_requirements>

## Summary

Phase 3 makes the auto-discovery feature visible to users through logging, notifications, diagnostics, and status bar updates. All the data it needs to surface is already computed and cached by Phase 2 — this phase only reads from the existing `discoveryCache` / `WorkspaceSettings` and formats it for the user.

The three active UX surfaces are: (1) the output channel logger, which already exists and just needs a `logInfo()` call after `WorkspaceSettings` is constructed; (2) a `vscode.window.showWarningMessage()` call with action buttons when `configError` is detected in the discovery cache; and (3) the `LanguageStatusItem.detail` property, which already handles step-load errors and can be extended to show discovery metadata on hover.

The testing work is substantial: three new example projects (`config-only/`, `pyproject-config/`, `malformed-config/`) plus their integration test suites, one new unit test file for priority logic, and a backward-compat run of all existing suites. All follow established patterns already present in the codebase.

**Primary recommendation:** Read from the discovery cache after `getUrisOfWkspFoldersWithFeatures()` completes in `activate()` and `configurationChangedHandler()`, then call logging/notification/status-bar update functions. Do not re-run discovery logic in Phase 3 — all necessary data is already available.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Discovery logging (UX-01) | Extension activation layer | WorkspaceSettings | Logging happens in `activate()` and `configurationChangedHandler()` after discovery completes; `WorkspaceSettings` already has `discoverySource` and `configFileUri` |
| Parse error notification (UX-02, D-03, D-04) | Extension activation layer | common.ts discovery cache | `showWarningMessage()` is a VS Code window API called from `activate()`; error data comes from `getDiscoveryEntry()` |
| Parse error diagnostic (D-05) | Handlers layer (new file: configDiagnostics.ts) | VS Code DiagnosticCollection | Follows `stepDiagnostics.ts` / `fixtureDiagnostics.ts` pattern; diagnostic targets the config file URI |
| Status bar hover detail (UX-04) | Extension activation layer | WorkspaceSettings | `LanguageStatusItem.detail` updated after discovery; existing `statusItem` object already created in `activate()` |
| Setting description update (UX-05) | Extension manifest (package.json) | — | `markdownDescription` fields are static strings in `package.json` |
| Integration test projects | Example projects (new) | Integration test suites (new) | New behave projects with config files; follow `simple` example project structure |
| Unit tests (TEST-02) | Unit test layer | common.ts hasExplicitSetting | Priority logic tests using existing mock pattern in `test/unit/settings/` |

## Standard Stack

### Core (all already installed — no new packages needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vscode API | 1.82.0+ | `showWarningMessage()`, `LanguageStatusItem`, `DiagnosticCollection`, `Uri` | Extension host API |
| TypeScript | 4.5.5 | Implementation language | Project standard |
| Mocha | 9.2.2 | Unit and integration test runner | Project standard |
| @vscode/test-electron | 2.5.2 | Integration test runner (spawns VS Code) | Project standard |

[VERIFIED: codebase grep — `package.json` dependencies]

**No new npm packages required for this phase.** All APIs used are in the existing `vscode` module.

## Architecture Patterns

### System Architecture Diagram

```
activate() / configurationChangedHandler()
         │
         ▼
getUrisOfWkspFoldersWithFeatures()   ← already runs; populates discoveryCache
         │
         ▼
for each wkspUri:
  getDiscoveryEntry(wkspUri)         ← read cached DiscoveryEntry (Phase 2 built this)
         │
         ├──[configError present]──► showWarningMessage()   UX-02
         │                           + "Open Config File" / "Open Settings" buttons   D-04
         │                           + config.diagnostics.set(configFileUri, [...])   D-05
         │
         ├──[always]──────────────► logInfo("Discovered via X: /path/to/features")   UX-01
         │                           diagLog(full chain detail when xRay)             D-02
         │
         └──[always]──────────────► statusItem.detail = "Source: X\nFeatures: Y\n..."  UX-04
```

### Recommended Project Structure

No structural changes to `src/`. New files:

```
src/
└── handlers/
    └── configDiagnostics.ts    # new — parse error diagnostic (D-05)

example-projects/
├── config-only/                # new — behave.ini, no .vscode/settings.json (TEST-05)
│   ├── behave.ini
│   └── features/
│       ├── simple.feature
│       └── steps/
│           └── steps.py
├── pyproject-config/           # new — pyproject.toml, no .vscode/settings.json (D-09)
│   ├── pyproject.toml
│   └── features/
│       ├── simple.feature
│       └── steps/
│           └── steps.py
└── malformed-config/           # new — malformed pyproject.toml (D-09)
    ├── pyproject.toml          # intentionally malformed TOML
    └── features/               # convention fallback path
        ├── simple.feature
        └── steps/
            └── steps.py

test/integration/
├── config-only suite/          # new
│   ├── extension.test.ts
│   ├── expectedResults.ts
│   └── index.ts
├── pyproject-config suite/     # new
│   ├── extension.test.ts
│   ├── expectedResults.ts
│   └── index.ts
└── malformed-config suite/     # new
    ├── extension.test.ts
    ├── expectedResults.ts
    └── index.ts

test/unit/settings/
└── discoveryPriority.test.ts   # new — TEST-02
```

### Pattern 1: Discovery Logging (UX-01, D-01, D-02)

**What:** Log a one-line summary to the workspace output channel after discovery completes.
**When to use:** After `getUrisOfWkspFoldersWithFeatures()` in both `activate()` and `configurationChangedHandler()`.
**Example:**

```typescript
// Source: src/logger.ts Logger.logInfo() — existing pattern
// In activate() or configurationChangedHandler(), after getUrisOfWkspFoldersWithFeatures():
for (const wkspUri of getUrisOfWkspFoldersWithFeatures()) {
  const entry = getDiscoveryEntry(wkspUri);
  if (!entry) continue;

  // D-01: always-on one-liner
  const configPart = entry.configFileUri ? ` (${basename(entry.configFileUri)})` : '';
  config.logger.logInfo(
    `Discovered via ${entry.source}${configPart}: ${entry.featuresUri.fsPath}`,
    wkspUri
  );

  // D-02: xRay full chain (diagLog is already gated by xRay in logger.ts)
  diagLog(
    `Discovery chain: source=${entry.source}, configFile=${entry.configFileUri?.fsPath ?? 'none'}, ` +
    `features=${entry.featuresUri.fsPath}`,
    wkspUri
  );
}
```

[VERIFIED: codebase — `Logger.logInfo()` signature in `src/logger.ts` line 67; `diagLog()` in `src/logger.ts` line 171]

### Pattern 2: Warning Notification with Action Buttons (UX-02, D-03, D-04)

**What:** Show a non-blocking warning notification when a malformed config is detected.
**When to use:** After `getUrisOfWkspFoldersWithFeatures()`, check `entry.configError`.

```typescript
// Source: src/extension.ts lines 207-210 — existing showWarningMessage with action button pattern
const entry = getDiscoveryEntry(wkspUri);
if (entry?.configError) {
  const action = await vscode.window.showWarningMessage(
    `Behave BDD: Could not parse config file "${basename(entry.configError.configFileUri)}".\n` +
    `${entry.configError.errorMessage}\n\nFalling back to "features/" convention.`,
    "Open Config File",
    "Open Settings"
  );
  if (action === "Open Config File") {
    await vscode.commands.executeCommand('vscode.open', entry.configError.configFileUri);
  } else if (action === "Open Settings") {
    await vscode.commands.executeCommand('workbench.action.openSettings', 'gs-behave-bdd');
  }
}
```

**Critical note:** `showWarningMessage()` with action buttons returns a Promise. For non-blocking behavior, do NOT await the outer call — fire-and-forget the notification and chain the action handler with `.then()`. This keeps `activate()` returning fast.

[VERIFIED: codebase — `vscode.window.showWarningMessage()` with action string parameters at `src/extension.ts` lines 200-213]

### Pattern 3: DiagnosticCollection for Config Parse Errors (D-05)

**What:** Add a `vscode.Diagnostic` entry targeting the malformed config file URI so it appears in the Problems panel.
**When to use:** When `configError` is present in the discovery cache.

```typescript
// Source: src/handlers/stepDiagnostics.ts — existing DiagnosticCollection pattern
// New file: src/handlers/configDiagnostics.ts

import * as vscode from 'vscode';
import { config } from '../configuration';

export function setConfigParseErrorDiagnostic(
  configFileUri: vscode.Uri,
  errorMessage: string
): void {
  const range = new vscode.Range(0, 0, 0, 0); // point to start of file
  const diagnostic = new vscode.Diagnostic(
    range,
    `Behave config parse error: ${errorMessage}`,
    vscode.DiagnosticSeverity.Warning   // Warning, not Error — fallback still works
  );
  diagnostic.code = 'behave-config-parse-error';
  diagnostic.source = 'gs-behave-bdd';
  config.diagnostics.set(configFileUri, [diagnostic]);
}

export function clearConfigParseErrorDiagnostic(configFileUri: vscode.Uri): void {
  config.diagnostics.set(configFileUri, []);
}
```

**Key insight:** The `config.diagnostics` collection is a single `vscode.DiagnosticCollection` shared across the extension (created in `ExtensionConfiguration` constructor). The existing diagnostic handlers filter by `diagnostic.code` to avoid clobbering each other. The config parse error handler must set diagnostics by the **config file URI** (not a feature file URI) so Problems panel entries navigate to the correct file.

[VERIFIED: codebase — `config.diagnostics` in `src/configuration.ts` line 34; DiagnosticCollection pattern in `src/handlers/stepDiagnostics.ts`]

### Pattern 4: Status Bar Discovery Detail (UX-04, D-06)

**What:** Update `statusItem.detail` with discovery metadata after discovery completes.
**When to use:** After discovery completes, using the existing `statusItem` variable in `activate()`. Also update in `configurationChangedHandler()`.

The current `LanguageStatusItem` shows only `text` and `detail`. Per D-06, the hover tooltip is `detail`. The `LanguageStatusItem` is already scoped to `{ language: 'gherkin' }`, so it only appears in `.feature` file editors.

```typescript
// Source: src/extension.ts lines 84-106 — existing statusItem pattern
// Add after the parser.onStepLoadError handler, once discovery data is available:

function updateStatusBarDiscovery(statusItem: vscode.LanguageStatusItem, wkspUris: vscode.Uri[]): void {
  // For single-workspace: show discovery detail directly
  // For multi-root: show first workspace discovery or aggregate
  const details: string[] = [];
  for (const wkspUri of wkspUris) {
    const entry = getDiscoveryEntry(wkspUri);
    if (!entry) continue;
    const configPart = entry.configFileUri ? `\nConfig: ${basename(entry.configFileUri)}` : '';
    details.push(
      `Source: ${entry.source}${configPart}\nFeatures: ${entry.featuresUri.fsPath}`
    );
  }
  if (details.length > 0) {
    statusItem.detail = details.join('\n---\n');
  }
}
```

**Important constraint:** `statusItem` is a local variable in `activate()`. If `configurationChangedHandler()` also needs to update it, it must either be hoisted to module scope, or the update function must accept a reference to the statusItem. The status bar update logic should be extracted to a named function.

[VERIFIED: codebase — `LanguageStatusItem.detail` property in `node_modules/@types/vscode/index.d.ts`; `statusItem` created at `src/extension.ts` line 84]

### Pattern 5: Integration Test Suite (TEST-05)

**What:** New example project + integration test suite following the exact `simple suite` pattern.
**When to use:** For `config-only/`, `pyproject-config/`, and `malformed-config/` example projects.

The integration test framework requires:
1. An example project directory in `example-projects/` with behave-runnable features
2. A suite directory in `test/integration/` with `index.ts`, `extension.test.ts`, `expectedResults.ts`
3. A `runTests()` call added to `test/integration/runTestSuites.ts`

The `config-only/` example project must have **no `.vscode/settings.json`** (the point of the test is zero-config discovery). It needs a `behave.ini` pointing to `features/`, plus minimal features and steps that actually pass when behave runs them.

For `malformed-config/`, the test should verify that tests still appear in the Test Explorer (the convention fallback path works) despite the malformed config. A separate unit test or integration assertion can check that a warning was shown.

[VERIFIED: codebase — `test/integration/runTestSuites.ts`; `test/integration/simple suite/` structure]

### Pattern 6: Unit Tests for Priority Logic (TEST-02)

**What:** Unit tests for the `settings > config > convention` priority branching in `getUrisOfWkspFoldersWithFeatures()`.
**When to use:** New file `test/unit/settings/discoveryPriority.test.ts`.

The existing `discoverySource.test.ts` tests `hasExplicitSetting()` in isolation. The priority logic is in `getUrisOfWkspFoldersWithFeatures()` in `common.ts`. Since that function calls `vscode.workspace.workspaceFolders`, `vscode.workspace.getConfiguration()`, and `fs.existsSync()`, it needs mocking.

The unit test pattern uses the VS Code mock at `test/unit/vscode.mock.ts` and the `setup.ts` initializer. Tests should cover:
- Branch A: explicit settings detected → `source: "settings"` in cache
- Branch B: no explicit settings + valid config → `source: "config-file"` in cache
- Branch B malformed: malformed config + convention fallback → `source: "convention"`, `configError` present
- Branch B absent: no config file + convention → `source: "convention"`
- Branch B absent: no config file + no convention → workspace excluded

[VERIFIED: codebase — `test/unit/settings/discoverySource.test.ts` mock pattern]

### Anti-Patterns to Avoid

- **Awaiting `showWarningMessage()` in `activate()`:** This would block extension startup. Fire-and-forget with `.then()` instead.
- **Creating a new `DiagnosticCollection` for config errors:** The extension has one shared `config.diagnostics` collection. Adding config diagnostics to it with a distinct `code` is the correct approach — avoids multiple collections and leverages existing `dispose()` handling.
- **Setting `statusItem.detail` before discovery completes:** `getUrisOfWkspFoldersWithFeatures()` is synchronous and runs before the loop in `activate()`, so discovery data is available immediately.
- **Scoping diagnostics to feature file URIs:** Config parse error diagnostics must target the config file URI (e.g., `behave.ini`) not a feature file, so clicking the diagnostic navigates to the broken config.
- **Adding `statusItem` update logic to `WorkspaceSettings`:** The status item is a view concern owned by `activate()`, not a settings concern. Keep the update call in `extension.ts`.
- **Using `statusItem.text` for discovery detail:** `text` is always visible in the status bar; `detail` is the hover tooltip. Per D-06, only the icon should show in the bar — detail goes in `detail`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Action buttons in warning | Custom modal dialog | `vscode.window.showWarningMessage("msg", "Btn1", "Btn2")` | Native API, already used in extension.ts |
| Problems panel entries | Custom output parsing | `vscode.DiagnosticCollection.set(uri, diagnostics[])` | Already how stepDiagnostics.ts works |
| Status bar hover | Custom webview or tooltip | `LanguageStatusItem.detail` | Available since VS Code 1.82 per @types/vscode |
| Opening a file from a notification | Custom editor API calls | `vscode.commands.executeCommand('vscode.open', uri)` | Standard command, used in `openDocumentRange` in common.ts |
| Opening settings from a notification | Custom settings UI | `vscode.commands.executeCommand('workbench.action.openSettings', 'scope')` | Used in extension.ts selectEnvPreset command |

## Common Pitfalls

### Pitfall 1: `statusItem` variable not accessible in `configurationChangedHandler`

**What goes wrong:** `statusItem` is created as a `const` inside `activate()`, but `configurationChangedHandler` also needs to update it after a config reload. The status bar will become stale after the first settings change.

**Why it happens:** `configurationChangedHandler` is a closure over `activate()`'s scope, but only the variables explicitly captured are available. Since `statusItem` is declared after `configurationChangedHandler`'s definition... actually `statusItem` IS accessible because `configurationChangedHandler` is defined AFTER `statusItem` in `activate()` (line 488 vs line 84). Verify this ordering carefully when writing the update call.

**How to avoid:** Confirm line ordering in `extension.ts`. Extract a named `updateDiscoveryUX(statusItem, wkspUris)` function and call it from both `activate()` and `configurationChangedHandler()`.

**Warning signs:** Status bar shows stale discovery source after user edits `settings.json`.

### Pitfall 2: Notification fires on every `configurationChangedHandler` call

**What goes wrong:** If the parse-error notification is shown every time configuration changes, and the user has a malformed config, they will see repeated popups — once on activation, once per settings change.

**Why it happens:** `configurationChangedHandler` clears and re-runs discovery, re-populating the cache. If the notification logic is called unconditionally after discovery, it fires again.

**How to avoid:** Track which config files have already triggered a notification in a module-level Set, and only show the notification if the URI is not in the Set. Clear the Set on `forceFullRefresh` (workspace folder changes). Alternatively, only show the notification on the first occurrence per session.

**Warning signs:** User sees duplicate "Could not parse config file" popups.

### Pitfall 3: Diagnostics for config files not cleared on re-discovery

**What goes wrong:** If the user fixes a malformed `pyproject.toml`, the Problems panel entry for the old error persists because `config.diagnostics` was never cleared for that URI.

**Why it happens:** Diagnostics are set on `configFileUri` but never cleared when the next discovery run succeeds for that file.

**How to avoid:** In `clearConfigParseErrorDiagnostic(configFileUri)`, always clear the diagnostic when discovery succeeds or when the file is no longer in the workspace. Call `clearConfigParseErrorDiagnostic` from `configurationChangedHandler` before re-running discovery.

**Warning signs:** Old error entries remain in Problems panel after config is fixed.

### Pitfall 4: Integration test `config-only/` project needs a real Python behave run

**What goes wrong:** The integration test framework actually runs behave against the example project. If the feature or step files are malformed, the test run fails with behave errors rather than assertion errors.

**Why it happens:** Unlike unit tests, integration tests spawn a real VS Code instance and invoke `runHandler()` which calls behave.

**How to avoid:** Copy the minimal structure from `example-projects/simple/features/` — one passing scenario, one step file. Keep the feature file as simple as possible (2-3 steps). Verify the project runs manually before writing expectedResults.

**Warning signs:** Integration test times out or shows `BEHAVE EXECUTION ERROR DETECTED` in output.

### Pitfall 5: `malformed-config/` must still activate the extension

**What goes wrong:** If `malformed-config/` has no `features/` directory, the extension will throw on activation (`workspaceFoldersWithFeatures.length === 0`) and the integration test will fail before it can test anything.

**Why it happens:** The convention fallback (`features/` folder) is the last resort. If it does not exist and the config is malformed, the workspace is excluded.

**How to avoid:** `malformed-config/` must have both a malformed `pyproject.toml` AND a `features/` directory with a working scenario. The test then verifies that tests appear (from the convention fallback) despite the malformed config.

**Warning signs:** Integration test fails with "Extension was activated but none of the workspace folders contain a root 'features' folder".

### Pitfall 6: `logInfo()` requires the workspace output channel to exist

**What goes wrong:** If `logInfo()` is called before `logger.syncChannelsToWorkspaceFolders()`, the channel map will not have the workspace key and will throw.

**Why it happens:** `syncChannelsToWorkspaceFolders()` is called at the top of `activate()` (line 67). The discovery loop is also in `activate()` after this call, so timing is fine — but if logging is added to `WorkspaceSettings` constructor instead, it could be called before channels are ready.

**How to avoid:** Keep discovery logging in `activate()` / `configurationChangedHandler()` after `syncChannelsToWorkspaceFolders()`, not in `WorkspaceSettings` constructor (even though `WorkspaceSettings` already has a `logSettings()` method, extending that for UX-01 is safe because it's always called after channels exist).

## Code Examples

### Complete discovery logging + notification + status bar update pattern

```typescript
// Source: src/extension.ts — extends existing activate() pattern
// Called after getUrisOfWkspFoldersWithFeatures() in both activate() and configurationChangedHandler()

function updateDiscoveryUX(
  statusItem: vscode.LanguageStatusItem,
  wkspUris: vscode.Uri[]
): void {
  const detailLines: string[] = [];

  for (const wkspUri of wkspUris) {
    const entry = getDiscoveryEntry(wkspUri);
    if (!entry) continue;

    // UX-01 / D-01: always-on one-liner
    const configPart = entry.configFileUri ? ` (${basename(entry.configFileUri)})` : '';
    config.logger.logInfo(
      `Discovered via ${entry.source}${configPart}: ${entry.featuresUri.fsPath}`,
      wkspUri
    );

    // D-02: xRay detail (diagLog is gated by xRay internally)
    diagLog(
      `Discovery detail: source=${entry.source}, config=${entry.configFileUri?.fsPath ?? 'none'}, ` +
      `features=${entry.featuresUri.fsPath}`,
      wkspUri
    );

    // UX-02 / D-03 / D-04: malformed config notification (fire-and-forget)
    if (entry.configError) {
      const errorUri = entry.configError.configFileUri;
      setConfigParseErrorDiagnostic(errorUri, entry.configError.errorMessage);
      vscode.window.showWarningMessage(
        `Behave BDD: Could not parse "${basename(errorUri)}": ${entry.configError.errorMessage}. ` +
        `Falling back to "features/" convention.`,
        "Open Config File",
        "Open Settings"
      ).then(action => {
        if (action === "Open Config File") {
          vscode.commands.executeCommand('vscode.open', errorUri);
        } else if (action === "Open Settings") {
          vscode.commands.executeCommand('workbench.action.openSettings', 'gs-behave-bdd');
        }
      });
    } else {
      clearConfigParseErrorDiagnostic(/* configFileUri if known */);
    }

    // UX-04 / D-06: status bar hover detail
    const cfgLine = entry.configFileUri ? `\nConfig: ${basename(entry.configFileUri)}` : '';
    detailLines.push(
      `Source: ${entry.source}${cfgLine}\nFeatures: ${entry.featuresUri.fsPath}`
    );
  }

  if (detailLines.length > 0) {
    statusItem.detail = detailLines.join('  |  ');
  }
}
```

### configDiagnostics.ts skeleton

```typescript
// Source: src/handlers/stepDiagnostics.ts — existing DiagnosticCollection pattern
import * as vscode from 'vscode';
import { config } from '../configuration';

const CONFIG_PARSE_CODE = 'behave-config-parse-error';

export function setConfigParseErrorDiagnostic(
  configFileUri: vscode.Uri,
  errorMessage: string
): void {
  const diagnostic = new vscode.Diagnostic(
    new vscode.Range(0, 0, 0, 0),
    `Behave config parse error: ${errorMessage}`,
    vscode.DiagnosticSeverity.Warning
  );
  diagnostic.code = CONFIG_PARSE_CODE;
  diagnostic.source = 'gs-behave-bdd';
  config.diagnostics.set(configFileUri, [diagnostic]);
}

export function clearConfigParseErrorDiagnostic(configFileUri: vscode.Uri): void {
  const existing = config.diagnostics.get(configFileUri) ?? [];
  const filtered = [...existing].filter(d => d.code !== CONFIG_PARSE_CODE);
  config.diagnostics.set(configFileUri, filtered);
}
```

### Minimal `config-only/` example project structure

```
example-projects/config-only/
├── behave.ini
│   [behave]
│   paths = features
│
└── features/
    ├── discovery.feature
    │   Feature: Config Only Discovery
    │     Scenario: run a successful test
    │       Given a simple step passes
    │
    └── steps/
        └── steps.py
            from behave import given
            @given('a simple step passes')
            def step_simple_passes(context):
                pass
```

No `.vscode/settings.json` — that is the point. The extension must discover features via `behave.ini` alone.

### Integration test suite `index.ts` pattern

```typescript
// Source: test/integration/simple suite/index.ts — existing pattern
import { runner } from "../index.helper";
export function run(): Promise<void> {
  return runner("**/config-only suite/**.test.js");
}
```

### `runTestSuites.ts` addition

```typescript
// Source: test/integration/runTestSuites.ts — append to existing list
launchArgs = ["example-projects/config-only"];
extensionTestsPath = getShortPathOnWindows(path.resolve(__dirname, './config-only suite'));
await runTests({ vscodeExecutablePath, extensionDevelopmentPath, extensionTestsPath, launchArgs });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `StatusBarItem` (always visible) | `LanguageStatusItem` (per-language) | VS Code 1.82 | Status item only shows in `.feature` file editors — already how the extension works |
| Diagnostic per-feature-file | Diagnostic per-config-file | Phase 3 (new) | First time a non-feature URI is used in `config.diagnostics`; same API, different target |

**Deprecated/outdated:**

- `vscode.window.createStatusBarItem()`: The extension uses `vscode.languages.createLanguageStatusItem()` instead — the newer language-scoped variant. Do not use the old API.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `statusItem` local variable in `activate()` is accessible from the discovery UX update code because the update code will be written below line 84 in the same function | Architecture Patterns — Pattern 4 | Low risk: easy to verify at implementation time; can hoist to module scope if needed |
| A2 | The single shared `config.diagnostics` DiagnosticCollection can safely hold diagnostics keyed to config file URIs (not just feature file URIs) without conflicting with existing diagnostic handlers | Code Examples — configDiagnostics.ts | Medium risk: existing handlers filter by `diagnostic.code`, so no conflict expected — but verify that `stepDiagnostics.ts` and `fixtureDiagnostics.ts` don't accidentally clear diagnostics on non-feature URIs |

## Open Questions

1. **Should `malformed-config/` suite be an integration test or a unit test?**
   - What we know: Integration tests run actual behave execution; the malformed-config scenario only needs to verify extension activation and test-tree appearance, not behave run results.
   - What's unclear: Does the overhead of a full integration test suite justify testing just "tests appear despite malformed config", or can this be validated more cheaply with a unit test against the `discoveryCache` output?
   - Recommendation: Use a lightweight integration test suite (no `runDefault` test) that only verifies the test tree appears correctly — not a full behave run. This is consistent with what TEST-05 requires.

2. **Should the duplicate-notification guard (Pitfall 2) be implemented in Phase 3?**
   - What we know: `configurationChangedHandler` calls `getUrisOfWkspFoldersWithFeatures(true)` which re-runs discovery. If a user has a persistent malformed config, they would see the notification on every settings change.
   - What's unclear: How often does `configurationChangedHandler` fire in practice? (It fires on any `gs-behave-bdd` config change.)
   - Recommendation: Implement a module-level `notifiedConfigErrors: Set<string>` tracking which config file paths have been notified. Clear on `forceFullRefresh`. Include this in the plan.

## Environment Availability

Step 2.6: SKIPPED — no new external dependencies. All APIs (`vscode`, `fs`, TypeScript) are already available.

## Validation Architecture

nyquist_validation is explicitly `false` in `.planning/config.json` — this section is omitted.

## Security Domain

`security_enforcement` is not explicitly set in `.planning/config.json`. However, this phase has no security-relevant code paths:

- No user input is parsed (only existing `DiscoveryEntry` data is formatted and displayed)
- No new APIs are called that accept untrusted data
- `showWarningMessage()` truncates to 512 chars (enforced by existing `Logger._show()` logic — but the new direct call to `showWarningMessage()` in `configDiagnostics` does not go through that path)

**One ASVS-relevant item:** V5 Input Validation — the `entry.configError.errorMessage` string comes from `smol-toml` or the INI parser. It must be truncated before being shown in a notification to prevent extremely long error messages from overwhelming the UI.

**Standard control:** Truncate `errorMessage` to 200 characters before concatenating into the `showWarningMessage()` call, matching the existing pattern at `src/logger.ts` line 146 (`winText.length > 512`).

## Sources

### Primary (HIGH confidence)

- Codebase grep + Read tool — `src/extension.ts`, `src/common.ts`, `src/settings.ts`, `src/logger.ts`, `src/configuration.ts`, `src/handlers/stepDiagnostics.ts`, `src/handlers/fixtureDiagnostics.ts`, `src/parsers/configParser.ts`
- `node_modules/@types/vscode/index.d.ts` — `LanguageStatusItem`, `DiagnosticCollection`, `showWarningMessage` API shapes
- `test/integration/` directory — full integration test infrastructure patterns
- `test/unit/settings/discoverySource.test.ts` — unit test mock patterns
- `package.json` — current setting `markdownDescription` values, `activationEvents`, script names

### Secondary (MEDIUM confidence)

- None needed — all findings are verified directly from codebase

### Tertiary (LOW confidence)

- None

## Metadata

**Confidence breakdown:**

- Standard Stack: HIGH — all packages verified in `package.json` and `node_modules/@types/vscode`
- Architecture: HIGH — all integration points verified by direct code reading
- Pitfalls: HIGH — derived from direct analysis of existing code paths, not speculation
- Test patterns: HIGH — verified from existing `simple suite` and `test/integration/runTestSuites.ts`

**Research date:** 2026-04-15
**Valid until:** 2026-06-15 (stable VS Code extension API; no fast-moving dependencies)
