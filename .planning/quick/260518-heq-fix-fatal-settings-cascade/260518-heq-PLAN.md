---
phase: quick-260518-heq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/watchers/workspaceWatcher.ts
  - src/parsers/fileParser.ts
  - test/unit/watchers/workspaceWatcherSettingsGuard.test.ts
  - test/unit/parsers/fileParserSettingsGuard.test.ts
autonomous: true
requirements:
  - QUICK-260518-heq
must_haves:
  truths:
    - "When a workspace's WorkspaceSettings construction throws a FATAL error, the user sees exactly ONE error notification (the one surfaced by the configuration.workspaceSettings getter), not three."
    - "startWatchingWorkspace returns an empty watcher array without throwing when config.workspaceSettings[wkspUri.path] is undefined."
    - "parseFilesForWorkspace returns undefined without throwing when config.workspaceSettings[wkspUri.path] is undefined."
    - "Workspaces with valid settings continue to be watched and parsed normally even when a sibling workspace has a fatal config error."
  artifacts:
    - path: "src/watchers/workspaceWatcher.ts"
      provides: "Early-return guard when wkspSettings is undefined"
      contains: "if (!wkspSettings)"
    - path: "src/parsers/fileParser.ts"
      provides: "Early-return guard when wkspSettings is undefined"
      contains: "if (!wkspSettings)"
    - path: "test/unit/watchers/workspaceWatcherSettingsGuard.test.ts"
      provides: "Regression test for the watcher guard"
    - path: "test/unit/parsers/fileParserSettingsGuard.test.ts"
      provides: "Regression test for the parser guard"
  key_links:
    - from: "src/watchers/workspaceWatcher.ts"
      to: "src/configuration.ts (workspaceSettings getter)"
      via: "config.workspaceSettings[wkspUri.path] lookup"
      pattern: "config\\.workspaceSettings\\["
    - from: "src/parsers/fileParser.ts"
      to: "src/configuration.ts (workspaceSettings getter)"
      via: "config.workspaceSettings[wkspUri.path] lookup"
      pattern: "config\\.workspaceSettings\\["
---

<objective>
Stop the FATAL-settings cascade so users with a misconfigured `projectPath` see ONE clean error notification instead of three. When `WorkspaceSettings` construction throws, the `configuration.workspaceSettings` getter already calls `logger.showError` and leaves `_resourceSettings[wkspUri.path]` unpopulated. Downstream callers (`startWatchingWorkspace` in `src/watchers/workspaceWatcher.ts` and `parseFilesForWorkspace` in `src/parsers/fileParser.ts`) currently dereference `undefined` and throw, producing two additional cascading notifications.

Purpose: Single coherent user-facing error for a broken workspace config; silent skip downstream since the root cause has already been reported.
Output: Two guarded entry points and two unit tests covering the regression.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@AI_INSTRUCTIONS.md
@.planning/STATE.md

@src/watchers/workspaceWatcher.ts
@src/parsers/fileParser.ts
@src/configuration.ts

<interfaces>
<!-- The relevant getter contract (configuration.ts lines 82-111): -->
<!-- public get workspaceSettings(): { [wkspUriPath: string]: WorkspaceSettings } -->
<!-- On WorkspaceSettings ctor throw: -->
<!--   - calls logger.showError(e, wkspUri) ONCE (tracked via _failedSettingsWorkspaces) -->
<!--   - does NOT populate _resourceSettings[wkspUri.path] -->
<!--   - subsequent reads of config.workspaceSettings[wkspUri.path] return undefined -->

<!-- Current cascade points: -->
<!-- 1. src/watchers/workspaceWatcher.ts:13-17 -->
<!--      const wkspSettings = config.workspaceSettings[wkspUri.path]; -->
<!--      for (let i = 0; i < wkspSettings.featuresUris.length; i++) { ... }   // throws when undefined -->
<!-- 2. src/parsers/fileParser.ts:517 (inside parseFilesForWorkspace) -->
<!--      const wkspSettings: WorkspaceSettings = config.workspaceSettings[wkspUri.path]; -->
<!--      ...passed into _parseFeatureFiles where wkspSettings.name is read -->

<!-- Existing test-file pattern (test/unit/parsers/fileParser.test.ts) shows how to stub: -->
<!--   sinon.stub(configModule, 'config').value({ ... workspaceSettings: { ... } }) -->
<!-- or wrap with Object.defineProperty if the import shape requires it. -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add undefined-settings guards in watcher and parser</name>
  <files>src/watchers/workspaceWatcher.ts, src/parsers/fileParser.ts</files>
  <action>
In `src/watchers/workspaceWatcher.ts` `startWatchingWorkspace()`, immediately after the `const wkspSettings = config.workspaceSettings[wkspUri.path];` lookup (line 13), insert a guard: if `wkspSettings` is undefined (or falsy), call `diagLog` once with a message like `startWatchingWorkspace: skipping ${wkspUri.path} — workspace settings unavailable (fatal config error already reported)` and `return [];`. Do NOT call `showError` — the configuration getter has already surfaced the single user-facing notification.

In `src/parsers/fileParser.ts` `parseFilesForWorkspace()`, after the line that reads `const wkspSettings: WorkspaceSettings = config.workspaceSettings[wkspUri.path];` (~line 517), add an identical guard. If `wkspSettings` is undefined: call `diagLog` (same style message identifying the parser), mark the in-flight state machine flags as finished for this workspace so other waiters don't hang (`_finishedFeaturesParseForWorkspace[wkspPath] = true; _finishedStepsParseForWorkspace[wkspPath] = true;`), dispose / delete the cancel-token-source allocated a few lines above (`this._cancelTokenSources[wkspPath].dispose(); delete this._cancelTokenSources[wkspPath];`), then `return undefined;`. The intent is a clean no-op so the parse pipeline reaches a stable post-completion state without invoking `_parseFeatureFiles`.

Do NOT change `configuration.ts` — its getter already does the right thing. Keep guards silent (no showError, no showWarn). Use existing `diagLog` from the module's existing imports.

Run `npx eslint src --ext ts` after edits — must be clean.
  </action>
  <verify>
    <automated>npx eslint src --ext ts</automated>
  </verify>
  <done>Both guarded functions early-return when `wkspSettings` is undefined: watcher returns `[]`, parser returns `undefined` after marking parse state as finished and disposing its cancel token. ESLint passes with no warnings/errors. No call to `showError`/`showWarn` inside either guard.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Regression unit tests for both guards</name>
  <files>test/unit/watchers/workspaceWatcherSettingsGuard.test.ts, test/unit/parsers/fileParserSettingsGuard.test.ts</files>
  <behavior>
    - Watcher test: when `config.workspaceSettings` returns `{}` (no entry for `wkspUri.path`), `startWatchingWorkspace(wkspUri, ctrl, testData, parser)` returns an empty array, does not throw, and does NOT call `vscode.workspace.createFileSystemWatcher`.
    - Watcher test: `config.logger.showError` is NOT called by the guard (the configuration getter is responsible for that).
    - Parser test: when `config.workspaceSettings` returns `{}` for the target uri, `parseFilesForWorkspace(wkspUri, testData, ctrl, "test", false)` resolves to `undefined` without throwing.
    - Parser test: after the guarded call, `_parseFeatureFiles` is NOT invoked (stub it and assert `notCalled`); `config.logger.showError` is NOT called.
    - Parser test: a second call with a now-populated `workspaceSettings` entry proceeds normally (covers state-flag cleanup so the workspace is not permanently stuck).
  </behavior>
  <action>
Create two new Mocha test files alongside the existing unit tests (see `test/unit/parsers/fileParser.test.ts` for the established sinon/stub pattern).

`test/unit/watchers/workspaceWatcherSettingsGuard.test.ts`:
- Import `startWatchingWorkspace` from `../../../src/watchers/workspaceWatcher`.
- Stub `configModule.config` (or use `Object.defineProperty` on the imported `config` getter) so `config.workspaceSettings` returns `{}` (empty object — no entry for the test uri).
- Stub `vscode.workspace.createFileSystemWatcher` via sinon and assert `notCalled`.
- Stub `config.logger.showError` and assert `notCalled`.
- Pass minimal fakes for `ctrl`, `testData`, `parser` (`{} as any` is fine — the guard returns before touching them).
- Assert the return value is an array of length 0.

`test/unit/parsers/fileParserSettingsGuard.test.ts`:
- Instantiate a real `FileParser` and stub its private `_parseFeatureFiles` / `_parseStepsFiles` via `sinon.stub(fileParser as any, '_parseFeatureFiles')` so we can assert `notCalled`.
- Stub `configModule.config` so `workspaceSettings` returns `{}`.
- Stub `getWorkspaceFolder` (in `common`) defensively — should not be reached but if it is, fail the test loudly.
- Call `await fileParser.parseFilesForWorkspace(wkspUri, {} as any, {} as any, 'unit-test', false)` and assert the result is `undefined`, that `_parseFeatureFiles` was not called, and `config.logger.showError` was not called.
- Add a second test that switches the stub to return a real-ish `WorkspaceSettings`-shaped object on the second call and verifies the parser proceeds (only needs to assert that `_parseFeatureFiles` IS called this time) — this confirms the guard doesn't permanently poison state.

Match the import style and `setup`/`teardown` pattern from `test/unit/parsers/fileParser.test.ts` (sinon restore in teardown). Use VS Code mock via the test harness's existing setup (other tests in those folders show the working pattern).

Run `npm run test:unit` after writing and confirm both new suites pass.
  </action>
  <verify>
    <automated>npm run test:unit</automated>
  </verify>
  <done>Both new test files exist and pass under `npm run test:unit`. Existing unit-test suite remains green. No new ESLint warnings.</done>
</task>

</tasks>

<verification>
Run, in order:
1. `npx eslint src --ext ts` — must exit 0 with no output.
2. `npm run test:unit` — all suites pass, including the two new ones.
3. Manual sanity (optional): grep the diff to confirm `if (!wkspSettings)` appears exactly once in `workspaceWatcher.ts` and once in `fileParser.ts`, and that neither guard calls `showError`.
</verification>

<success_criteria>
- A workspace whose `WorkspaceSettings` ctor throws FATAL produces exactly ONE notification (the existing one from `configuration.ts:104`).
- `startWatchingWorkspace` and `parseFilesForWorkspace` are silent no-ops in that case.
- Sibling workspaces with valid settings are unaffected.
- ESLint clean; `npm run test:unit` green.
</success_criteria>

<output>
After completion, create `.planning/quick/260518-heq-fix-fatal-settings-cascade/260518-heq-SUMMARY.md` summarizing the guards added, tests written, and the lint/test results.
</output>
