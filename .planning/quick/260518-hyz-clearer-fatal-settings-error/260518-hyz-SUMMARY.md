---
phase: 260518-hyz
plan: 01
status: complete
date: 2026-05-18
requirements: [hyz-A, hyz-B, hyz-C, hyz-D]
files_modified:
  - src/common.ts
  - src/logger.ts
  - src/configuration.ts
  - src/extension.ts
  - src/settings.ts
files_added:
  - test/unit/configuration.test.ts
  - test/unit/settings/fatalToast.test.ts
test_count_before: 884
test_count_after: 898
---

# 260518-hyz — Clearer Fatal Settings Error Summary

Four UX/log-hygiene fixes around fatal workspace-settings errors. A single broken
`projectPath` previously produced a wall of repeated text (full settings dump → multi-line
FATAL throw → showError-dedup'd toast → derivative "No steps folder found" warn →
misleading "Phase 21 migration consent flow error" log). This change tightens the toast,
suppresses the derivative warn, caches the failure so the getter doesn't reconstruct,
and quiets the Phase 21 catch when the error has already been surfaced.

## What changed

### Sub-fix A — WkspError + showError actions (commit `849e94b`)
- `src/common.ts`: added `WkspErrorAction` interface and an optional `actions?:
  WkspErrorAction[]` field on `WkspError`.
- `src/logger.ts`: `showError` now detects `error instanceof WkspError` and, when
  `actions` is present, renders them as buttons on `showErrorMessage` instead of the
  default "OK". Selected actions route through `vscode.commands.executeCommand`,
  except the sentinel command `"__showOutput"` which calls `logger.show(wkspUri)`
  directly — no new public command needed.

### Sub-fix B — failed-settings cache + quiet Phase 21 catch (commit `3d653b5`)
- `src/configuration.ts`: `_failedSettingsWorkspaces` upgraded from `Set<string>` to
  `Map<string, Error>`. The `workspaceSettings` getter now short-circuits the
  forEach for any uri already in the failure cache, so `new WorkspaceSettings(...)`
  is invoked at most once per broken workspace. `reloadSettings(wkspUri)` still
  clears the entry so a fix-then-reload cycle retries construction.
- `src/extension.ts`: the Phase 21 migration consent flow catch site (around line
  361) now routes `WkspError` to `diagLog` (already surfaced via the getter) and
  keeps `logger.logInfo` only for non-`WkspError` errors. Imports `WkspError` from
  `./common`.

### Sub-fix C — short toast + verbose detail to channel + buttons (commit `cbec99e`)
- `src/settings.ts` `_fatalErrors` entries: now quote the user-supplied value AND
  include the resolved fsPath, e.g. `project path "src/autotest" (resolved to
  /home/u/proj/src/autotest) not found.`
- The `WkspError` thrown from `logSettings` now carries a SHORT one-line toast
  ("Behave BDD: project path \"x\" not found in workspace \"name\". Tests cannot
  load." / analogous for features path / generic fallback for multiple fatals)
  built by a new private `buildFatalToast()` helper.
- Verbose multi-line context (full `_fatalErrors.join("\n")` + the "NOTE: fatal
  errors may require..." line) is written to the workspace output channel via
  `logger.logInfo` BEFORE the throw, so [Show Details] reveals it.
- Toast actions wired: `Open Settings` →
  `workbench.action.openSettings("gs-behave-bdd.projectPath")`, `Show Details` →
  `__showOutput` sentinel, `Reload Window` → `workbench.action.reloadWindow`.

### Sub-fix D — gate "No steps folder" warn on `_fatalErrors.length === 0` (commit `cbec99e`)
- `src/settings.ts`: the inline `logger.showWarn('No "steps" folder found.', ...)`
  call inside the `stepsSearchUris` map was replaced with a local `noStepsFolder`
  boolean. After all fatal collectors have run (i.e., right before
  `this.logSettings(...)`), the warn fires only when `noStepsFolder &&
  _fatalErrors.length === 0`. A broken `projectPath` no longer also produces a
  misleading "No steps folder" toast.

## Commits

| SHA       | Title                                                                                 |
| --------- | ------------------------------------------------------------------------------------- |
| `849e94b` | feat(260518-hyz): add WkspError.actions and wire showError to render toast buttons    |
| `3d653b5` | fix(260518-hyz): cache failed WorkspaceSettings construction and quiet Phase 21 catch |
| `cbec99e` | feat(260518-hyz): reformat FATAL toast, quote setting values, gate steps-folder warn  |

## Tests

- **Before:** 884 passing
- **After:** 898 passing, 0 failing
- **Net new tests:** 14
  - 5 in `test/unit/configuration.test.ts` (getter caching, reloadSettings reset,
    WkspError vs generic instanceof / Phase 21 catch policy)
  - 8 in `test/unit/settings/fatalToast.test.ts` (toast shape, actions array,
    verbose context logging, steps-folder gate with/without fatals)
  - 1 updated assertion in `test/unit/settings/multiPathPrecedence.test.ts` (the
    `"."` rejection test now matches the new generic short-toast shape)
- `npx eslint src --ext ts` — clean (exit 0, no output)

## Untouched (per instructions)

- The cascade guards from the prior quick task `260518-heq` at
  `src/watchers/workspaceWatcher.ts:13` and the `parser.parseFiles` early-return
  in `src/parsers/fileParser.ts` are untouched.
- No new public commands were introduced; the `Show Details` button uses the
  `__showOutput` sentinel string handled inline in `Logger.showError`.

## Self-Check: PASSED

- Files modified: all 5 source files + 2 new tests present.
- Commits `849e94b`, `3d653b5`, `cbec99e` verified via `git log --oneline -5`.
- `npm run test:unit` → 898 passing, 0 failing.
- `npx eslint src --ext ts` → clean.
