---
status: complete
phase: quick-260518-heq
plan: 01
requirements:
  - QUICK-260518-heq
files_modified:
  - src/watchers/workspaceWatcher.ts
  - src/parsers/fileParser.ts
files_added:
  - test/unit/watchers/workspaceWatcherSettingsGuard.test.ts
  - test/unit/parsers/fileParserSettingsGuard.test.ts
commits:
  - b7b8f90 fix(quick-260518-heq): guard against undefined wkspSettings in watcher and parser
  - bb7d610 test(quick-260518-heq): regression tests for FATAL settings cascade guards
---

# Fix FATAL Settings Cascade — Summary

## What changed

When `WorkspaceSettings` construction throws a FATAL error (e.g. invalid `projectPath`), the
`configuration.workspaceSettings` getter already surfaces exactly one user-facing notification
via `logger.showError` and leaves `_resourceSettings[wkspUri.path]` unpopulated. Two downstream
entry points then dereferenced `undefined` and threw, producing two additional cascading
notifications — three errors total for a single root cause.

Both call sites now early-return without calling `showError`, leaving the configuration getter
as the single source of the user-facing message.

### `src/watchers/workspaceWatcher.ts`

After looking up `wkspSettings`, if it is undefined, the watcher logs a single `diagLog` (xRay
only) and returns an empty `vscode.FileSystemWatcher[]`. No watcher creation, no error
notification.

### `src/parsers/fileParser.ts` — `parseFilesForWorkspace`

Immediately after the `config.workspaceSettings[wkspUri.path]` lookup, if `wkspSettings` is
undefined, the parser:

- logs a single `diagLog`,
- marks `_finishedFeaturesParseForWorkspace[wkspPath]` and `_finishedStepsParseForWorkspace[wkspPath]`
  as `true` so other waiters (`waitOn…` helpers, `_finishedStepsParseForAllWorkspaces` aggregation)
  do not hang,
- disposes and deletes the just-allocated `_cancelTokenSources[wkspPath]` so a subsequent call
  (after the user fixes config) can allocate a fresh one and proceed normally,
- returns `undefined`.

`_parseFeatureFiles` is never reached in the failure case.

## Tests

Two new Mocha suites (7 tests total, all passing):

**`test/unit/watchers/workspaceWatcherSettingsGuard.test.ts`** (3 tests)
- Returns empty array, does not throw.
- `vscode.workspace.createFileSystemWatcher` is never called.
- `config.logger.showError` is never called.

**`test/unit/parsers/fileParserSettingsGuard.test.ts`** (4 tests)
- Returns `undefined`, does not throw.
- Private `_parseFeatureFiles` is never invoked.
- `config.logger.showError` is never called.
- State is not poisoned: a second call with a now-populated `workspaceSettings` entry reaches
  `_parseFeatureFiles` (confirms cancel-token cleanup and flag handling).

## Verification

- `npx eslint src --ext ts` — clean (exit 0, no output).
- `npx eslint test/unit/watchers/workspaceWatcherSettingsGuard.test.ts test/unit/parsers/fileParserSettingsGuard.test.ts` — clean.
- `npm run test:unit` — **884 passing**. The 4 failures present are pre-existing and unrelated
  (Phase 24 `discover.py` cleanup work-in-progress: `discoverPostRegex` structural assertions
  expect `_DECORATOR_RE`, `find_duplicate_steps`, etc. to be deleted). My changes touch neither
  `discover.py` nor anything those tests assert on.

## Truths satisfied

- Single error notification on FATAL settings: only `configuration.ts:104` fires.
- `startWatchingWorkspace` returns `[]` cleanly when `workspaceSettings[uri.path]` is undefined.
- `parseFilesForWorkspace` returns `undefined` cleanly under the same condition.
- Sibling workspaces with valid settings are unaffected — the guards are per-workspace and
  silent.
