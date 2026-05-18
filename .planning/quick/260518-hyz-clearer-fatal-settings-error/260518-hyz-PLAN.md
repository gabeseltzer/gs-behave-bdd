---
phase: 260518-hyz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/common.ts
  - src/logger.ts
  - src/configuration.ts
  - src/settings.ts
  - src/extension.ts
  - test/unit/settings.test.ts
  - test/unit/configuration.test.ts
autonomous: true
requirements: [hyz-A, hyz-B, hyz-C, hyz-D]

must_haves:
  truths:
    - "When workspace settings construction throws, the user sees ONE concise error toast — not a wall of FATAL prose."
    - "The toast offers actionable buttons (Open Settings, Show Details, Reload Window) and clicking them performs the right action."
    - "The verbose context (resolved path, full failure list) is written to the workspace output channel, not the toast."
    - "When projectPath/featuresPaths is broken, the derivative 'No steps folder found' warning does not also fire."
    - "After the first failed settings construction, re-entering the workspaceSettings getter does NOT reconstruct WorkspaceSettings (no duplicate logs / no duplicate toasts)."
    - "reloadSettings() called explicitly still re-attempts construction and clears the failure cache so a fix-then-reload works."
    - "The Phase 21 migration consent flow catch site no longer spams the user-facing copy 'Phase 21 migration consent flow error: ...' when the underlying error is a WkspError already surfaced via the getter."
  artifacts:
    - path: "src/common.ts"
      provides: "WkspError extended with optional `actions` array"
      contains: "actions?:"
    - path: "src/logger.ts"
      provides: "showError honors WkspError.actions and wires button → command execution"
      contains: "executeCommand"
    - path: "src/configuration.ts"
      provides: "_failedSettingsWorkspaces upgraded to Map<string, Error>; getter short-circuits"
      contains: "_failedSettingsWorkspaces"
    - path: "src/settings.ts"
      provides: "Reformatted FATAL message + gated steps-warn + quoted projectPath value"
      contains: "Tests cannot load"
    - path: "test/unit/settings.test.ts"
      provides: "Tests for new fatal message shape, action attachment, steps-warn suppression"
    - path: "test/unit/configuration.test.ts"
      provides: "Tests for getter caching of failed construction + reloadSettings reset"
  key_links:
    - from: "src/settings.ts (logSettings throw)"
      to: "src/logger.ts (showError)"
      via: "WkspError carrying actions array"
      pattern: "new WkspError.*actions"
    - from: "src/configuration.ts (workspaceSettings getter)"
      to: "src/configuration.ts (_failedSettingsWorkspaces Map)"
      via: "cache hit short-circuits construction"
      pattern: "_failedSettingsWorkspaces\\.has"
    - from: "src/extension.ts:364 catch"
      to: "diagLog / logInfo"
      via: "WkspError type detection → quieter log path"
      pattern: "instanceof WkspError"
---

<objective>
Four small UX/log-hygiene fixes around fatal workspace-settings errors. Today a single broken `projectPath` produces a 4× repeated wall of text: full settings dump → multi-line FATAL throw → showError-dedup'd toast → derivative "No steps folder found" warn → misleading "Phase 21 migration consent flow error" log. We tighten the toast, suppress the derivative warn, cache the failure so the getter doesn't reconstruct, and quiet the Phase 21 catch when the error has already been surfaced.

Purpose: Cleaner first-run failure mode — user gets one short toast with buttons and can fix the problem without digging.
Output: Modified `src/configuration.ts`, `src/settings.ts`, `src/common.ts`, `src/logger.ts`, `src/extension.ts`, plus unit-test additions.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@AI_INSTRUCTIONS.md
@.planning/STATE.md

@src/configuration.ts
@src/settings.ts
@src/common.ts
@src/logger.ts

<interfaces>
<!-- Key existing shapes the executor will use. No codebase exploration needed. -->

From src/common.ts (current WkspError):
```typescript
export class WkspError extends Error {
  constructor(errorOrMsg: unknown, public wkspUri: vscode.Uri, public run?: vscode.TestRun) { ... }
}
```
Extend to:
```typescript
export interface WkspErrorAction {
  label: string;
  command: string;
  args?: unknown[];
}
export class WkspError extends Error {
  constructor(
    errorOrMsg: unknown,
    public wkspUri: vscode.Uri,
    public run?: vscode.TestRun,
    public actions?: WkspErrorAction[],
  ) { ... }
}
```

From src/logger.ts (current showError):
```typescript
showError = (error: unknown, wkspUri?: vscode.Uri, run?: vscode.TestRun) => { ... }
```
Inside `_show` (DiagLogType.error branch), the current code calls
`vscode.window.showErrorMessage(winText, "OK")`. When the source error is a
WkspError with `actions`, the executor must instead call
`vscode.window.showErrorMessage(winText, ...labels)` and route the awaited
selection to `vscode.commands.executeCommand(action.command, ...action.args)`.

From src/configuration.ts:33 (current cache):
```typescript
private _failedSettingsWorkspaces = new Set<string>();
```
Upgrade to:
```typescript
private _failedSettingsWorkspaces = new Map<string, Error>();
```
Lines 62 (`.delete`), 102 (`.has`), 103 (`.add` → `.set(uri.path, e)`), and the
getter short-circuit must all be updated together.

From src/settings.ts:354-358 (current throw — to be replaced):
```typescript
throw new WkspError(`\nFATAL error due to invalid workspace setting in workspace "${this.name}". Extension cannot continue. ` +
  `${this._fatalErrors.join("\n")}\n` +
  `NOTE: fatal errors may require you to restart vscode after correcting the problem.) `, this.uri);
```

Confirmed commands available (from package.json grep):
- `gs-behave-bdd.selectProject` ✓ exists (line 169)
- `gs-behave-bdd.openOutput` ✗ does NOT exist — use `config.logger.show(wkspUri)` directly for [Show Details]. Since `executeCommand` cannot call a method on a singleton, the executor should register a lightweight callback OR have showError short-circuit and call `logger.show(wkspUri)` itself when an action's `command` is the sentinel value `"__showOutput"`. Prefer the latter (no new public command needed).
- `workbench.action.openSettings` ✓ built-in
- `workbench.action.reloadWindow` ✓ built-in
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend WkspError with optional actions + teach showError to render them</name>
  <files>src/common.ts, src/logger.ts</files>
  <action>
In `src/common.ts`, add an exported `WkspErrorAction` interface ({ label: string; command: string; args?: unknown[] }) and add an optional 4th constructor parameter `actions?: WkspErrorAction[]` to `WkspError`, stored as a public field. Existing call sites (no 4th arg) must keep working — the param is optional.

In `src/logger.ts` `showError`, when `error instanceof WkspError` and `error.actions?.length`, branch the toast rendering: extract action labels, call `vscode.window.showErrorMessage(winText, ...labels)` instead of the current `"OK"` call, then `.then(picked => { if (!picked) return; const a = error.actions.find(x => x.label === picked); if (!a) return; if (a.command === "__showOutput") this.show(error.wkspUri); else vscode.commands.executeCommand(a.command, ...(a.args ?? [])); })`. Keep diagLog / channel appendLine / run.appendOutput behavior unchanged. Refactor `_show` minimally — the cleanest shape is to pass an optional `actions` arg down from `showError` rather than re-detecting WkspError inside `_show`.

Do NOT change `showWarn` behavior. Do NOT change non-WkspError error paths.
  </action>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json &amp;&amp; npx eslint src --ext ts</automated>
  </verify>
  <done>WkspError accepts actions; showError calls showErrorMessage with action labels when actions present; tsc clean; eslint clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Cache failed settings construction in configuration.ts; quiet Phase 21 catch</name>
  <files>src/configuration.ts, src/extension.ts, test/unit/configuration.test.ts</files>
  <behavior>
    - After first failed `new WorkspaceSettings(...)` in the getter, a second call to the getter for the same workspace must NOT invoke the constructor again (verified via a sinon spy on WorkspaceSettings or by counting logInfo calls / using a counter wrapper).
    - `reloadSettings(wkspUri)` clears the cache entry — a subsequent getter call DOES re-attempt construction.
    - Phase 21 catch site at `src/extension.ts:361-365`: when the caught error is `instanceof WkspError`, use `config.logger.logInfo` with a quieter message (e.g. `diagLog(...)` instead, since the getter already surfaced the toast) — for non-WkspError, keep existing logInfo. Test by stubbing reloadSettings to throw a WkspError and asserting no duplicate user-facing notification fires (count `showErrorMessage` calls).
  </behavior>
  <action>
In `src/configuration.ts`:
1. Change `_failedSettingsWorkspaces` from `Set<string>` to `Map<string, Error>`.
2. Update line 62 (`.delete` — same API on Map, OK) and lines 102-103 to use `.has` / `.set(wkspUri.path, e as Error)`.
3. In the getter (line 84-109), restructure the `if (!this._resourceSettings[wkspUri.path])` block: BEFORE attempting construction, check `if (this._failedSettingsWorkspaces.has(wkspUri.path)) return;` (early-continue inside the forEach). This eliminates the silent reconstruct-on-every-getter-call. The existing "already in _resourceSettings" guard handles the success path.
4. Note in code comments why the cache exists and that reloadSettings is the documented way to retry.

In `src/extension.ts:361-365`, import `WkspError` from `./common` if not already imported, then change the catch block to:
```ts
} catch (e) {
  if (e instanceof WkspError) {
    // Already surfaced via workspaceSettings getter / showError; keep output channel quiet.
    diagLog(`Phase 21 migration consent flow saw settled WkspError for ${wkspUri.path}: ${e.message}`, wkspUri);
  } else {
    config.logger.logInfo(`Phase 21 migration consent flow error: ${e}`, wkspUri);
  }
}
```
(Adjust the diagLog import as needed — it lives in `./logger`.)

Add `test/unit/configuration.test.ts` entries (or extend the existing file if present):
- Test: getter returns nothing twice for a bad workspace and constructor is invoked only once.
- Test: after `reloadSettings(badUri)` the cache is cleared (construction attempted again, throws again, but cache was reset).
- Test: Phase 21-style WkspError caught at extension.ts uses diagLog path, not logInfo (verify via spy on logger.logInfo — should NOT be called with the "Phase 21 migration consent flow error" prefix when error is a WkspError).
  </action>
  <verify>
    <automated>npm run test:unit -- --grep "workspaceSettings getter|Phase 21" &amp;&amp; npx eslint src --ext ts</automated>
  </verify>
  <done>Getter constructs WorkspaceSettings at most once per failed wkspUri until reloadSettings resets it; Phase 21 catch is silent for WkspError; tests pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Reformat FATAL toast, quote setting values, attach action buttons (settings.ts)</name>
  <files>src/settings.ts, test/unit/settings.test.ts</files>
  <behavior>
    - When projectPath does not exist on disk, `_fatalErrors` contains: `project path "<workspaceRelativeProjectPath>" (resolved to <fullPath>) not found.`
    - When a featuresPaths entry does not exist, `_fatalErrors` contains: `features path "<projectRelativeEntry>" (resolved to <fullPath>) not found.`
    - The thrown `WkspError.message` is the SHORT toast text: `Behave BDD: project path "<relPath>" not found in workspace "<name>". Tests cannot load.` — and when the first fatal error is featuresPaths-related, swap "project path" for "features path"; when there are multiple distinct fatals or the first one is neither shape, use `Behave BDD: workspace "<name>" has invalid settings. Tests cannot load.`
    - The thrown `WkspError.actions` is an array with: `{ label: "Open Settings", command: "workbench.action.openSettings", args: ["gs-behave-bdd.projectPath"] }`, `{ label: "Show Details", command: "__showOutput" }`, `{ label: "Reload Window", command: "workbench.action.reloadWindow" }`.
    - The verbose multi-line context (full _fatalErrors join, NOTE about restart) is still written to the output channel via `logger.logInfo` BEFORE the throw — NOT included in the toast.
  </behavior>
  <action>
In `src/settings.ts`:

1. Line ~153 — change the projectPath fatal push from:
   `this._fatalErrors.push(\`project path ${this.projectUri.fsPath} not found.\`);`
   to:
   `this._fatalErrors.push(\`project path "${this.workspaceRelativeProjectPath}" (resolved to ${this.projectUri.fsPath}) not found.\`);`

2. Line ~215 — change the featuresPaths fatal push similarly. For each featUri / projectRelativeFeaturesPath pair:
   `this._fatalErrors.push(\`features path "${projectRelativeFeaturesPaths[idx]}" (resolved to ${u.fsPath}) not found.\`);`
   (restructure the loop to iterate by index OR zip the arrays, whichever is cleaner).

3. Lines 354-358 — rewrite the throw:
   - Before throwing, call `logger.logInfo` with the verbose context: the full `this._fatalErrors.join("\n")` plus the existing "NOTE: fatal errors may require you to restart vscode" line. This goes to the output channel.
   - Compute a short toast message from the FIRST fatal error: if it starts with `"project path"` → `Behave BDD: project path "<relPath>" not found in workspace "<this.name>". Tests cannot load.`; if `"features path"` → analogous; else → generic `Behave BDD: workspace "<this.name>" has invalid settings. Tests cannot load.` Helper-extract a small `private buildFatalToast(): string` if it improves readability.
   - Build the `actions` array per the behavior block above (import `WkspErrorAction` if needed).
   - `throw new WkspError(shortMsg, this.uri, undefined, actions);`

In `test/unit/settings.test.ts`, add tests:
- bad projectPath: assert `_fatalErrors[0]` contains both `"<relPath>"` (quoted) and the resolved fsPath.
- bad projectPath: assert the thrown WkspError's `.message` matches `/^Behave BDD: project path "[^"]+" not found in workspace "[^"]+"\. Tests cannot load\.$/`.
- bad projectPath: assert `.actions` has 3 entries with labels `["Open Settings", "Show Details", "Reload Window"]` and that "Open Settings" command is `workbench.action.openSettings` with args `["gs-behave-bdd.projectPath"]`.
- bad featuresPaths: short toast says "features path".
- mixed/multiple fatals: short toast falls back to the generic shape.
  </action>
  <verify>
    <automated>npm run test:unit -- --grep "fatal|FATAL|projectPath toast|features path toast" &amp;&amp; npx eslint src --ext ts</automated>
  </verify>
  <done>Tests pass; manual smoke (set projectPath to a nonexistent dir, reload window) shows a single short toast with 3 buttons and verbose detail only in the Behave BDD output channel.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Gate "No steps folder found" warn on _fatalErrors.length === 0</name>
  <files>src/settings.ts, test/unit/settings.test.ts</files>
  <behavior>
    - When projectPath OR featuresPaths is broken (so `_fatalErrors.length > 0` by the time logSettings runs), the "No steps folder found." showWarn is NOT emitted to the user.
    - When settings are otherwise valid but steps folder is genuinely missing, the warn fires exactly as today.
  </behavior>
  <action>
The current `logger.showWarn('No "steps" folder found.', this.uri)` at settings.ts:234 fires DURING the `stepsSearchUris` map, which runs BEFORE `_fatalErrors` is fully populated (featuresPaths check at line 213 already pushed, but other validators may still push afterward). Read the flow carefully.

Two acceptable approaches — pick the cleaner one:

**Option A (preferred):** Collect the "no steps folder" condition into a local boolean `noStepsFolder = false` during the map. Don't call showWarn inline. At the END of the constructor (just before `this.logSettings(...)` at line 286), check: `if (noStepsFolder && this._fatalErrors.length === 0) logger.showWarn('No "steps" folder found.', this.uri);`. This guarantees all fatal-error collectors have run.

**Option B:** Move the warn into `logSettings` itself, after the fatal-error check — but this changes when it fires relative to the settings dump and is messier. Skip unless Option A causes issues.

Add tests:
- Bad projectPath + missing steps folder: assert `logger.showWarn` was NOT called with the "No steps folder" message (spy/stub on showWarn).
- Valid projectPath + missing steps folder: assert `logger.showWarn` WAS called once with `'No "steps" folder found.'`.
  </action>
  <verify>
    <automated>npm run test:unit -- --grep "steps folder" &amp;&amp; npx eslint src --ext ts</automated>
  </verify>
  <done>Steps-folder warn is suppressed when fatals exist; still fires when settings are otherwise valid; tests pass.</done>
</task>

<task type="auto">
  <name>Task 5: Full lint + unit test sweep, confirm 884+ tests pass</name>
  <files>(no edits — verification only)</files>
  <action>
Run the full lint and unit test suites to confirm no regressions across the four changes. If anything fails, diagnose and fix in-place (do NOT add new files — fix the failing source).

```
npx eslint src --ext ts
npm run test:unit
```

Confirm:
- ESLint exits 0 with no output.
- Mocha reports >= 884 passing, 0 failing.
- No test was skipped that wasn't already skipped on `main`.

If the test count dropped, identify which test(s) regressed and either fix the source or update the test if the behavior change is intentional (e.g. the old FATAL message shape is no longer asserted by name).
  </action>
  <verify>
    <automated>npx eslint src --ext ts &amp;&amp; npm run test:unit</automated>
  </verify>
  <done>ESLint clean; all unit tests pass; no skipped-test regressions.</done>
</task>

</tasks>

<verification>
Phase-wide checks:
- `npx eslint src --ext ts` → clean
- `npm run test:unit` → all passing (>= 884)
- Manual smoke (optional, not gating): in example-projects, set `gs-behave-bdd.projectPath` to a non-existent directory, reload window. Expect: ONE short error toast with [Open Settings] [Show Details] [Reload Window]; clicking [Show Details] reveals the Behave BDD output channel with the full fatal context; no "Phase 21 migration consent flow error" line in any output channel; no "No steps folder found" warning toast.
</verification>

<success_criteria>
- All five tasks' `done` criteria met.
- Lint clean; unit tests green.
- The four sub-fixes A/B/C/D are each independently verifiable by the new unit tests (cache, steps-warn gate, message shape + actions, quoted setting values).
- Cascade guards from 260518-heq (workspaceWatcher.ts, fileParser.ts) are untouched.
</success_criteria>

<output>
After completion, create `.planning/quick/260518-hyz-clearer-fatal-settings-error/260518-hyz-SUMMARY.md` per the standard quick-task summary template.
</output>
