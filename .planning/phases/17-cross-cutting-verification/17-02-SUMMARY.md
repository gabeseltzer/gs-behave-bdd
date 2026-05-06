---
phase: 17-cross-cutting-verification
plan: 02
subsystem: testing
tags: [integration-test, sinon, migration, vscode-settings, notifications]

requires:
  - phase: 17
    provides: migration-stale fixture (Plan 17-01)
  - phase: 15-notification-suppression
    provides: showSuppressibleNotification public API
  - phase: 16-features-paths-migration
    provides: featuresPath migration loop in activate()
provides:
  - "test/integration/migrations suite/ — 7 black-box integration assertions covering Phase 15+16 migrations end-to-end"
  - "Suite-load-time showInformationMessage stub pattern (new convention — only suite that needs this)"
affects: [17-03]

tech-stack:
  added: []
  patterns:
    - "Suite-load-time sinon stub install in index.ts (BEFORE runner() returns) to capture activation-time notifications"
    - "Per-test stub re-configuration via .callsFake() to drive DSA + Open Settings click flows"
    - "Template-restore in suiteTeardown via fs.readFileSync template + fs.writeFileSync settings.json"

key-files:
  created:
    - test/integration/migrations suite/index.ts
    - test/integration/migrations suite/extension.test.ts
  modified: []

key-decisions:
  - "Test 3 asserts cached `workspaceRelativeFeaturesPaths` (not `featuresPaths` — that property doesn't exist on WorkspaceSettings; the cached relative paths are exposed via workspace/projectRelativeFeaturesPaths arrays per src/settings.ts:80)"
  - "Stub fake typed via `as unknown as typeof vscode.window.showInformationMessage` — VS Code has overloaded signatures (string + MessageOptions + MessageItem variants); the simple string-only fake satisfies the call sites we exercise"
  - "Default stub returns undefined (silent dismiss); per-test .callsFake() overrides for DSA + Open Settings flows; reset to default-dismiss in finally"
  - "No sinon.restore() in index.ts — Dev Host process exits at suite end; restoring would re-arm real UI mid-suite"

patterns-established:
  - "Suite-load-time stub install: when a notification fires during activate() (before suiteSetup runs), the stub MUST be in index.ts at module-top-level, not in suiteSetup"
  - "Black-box migration verification: assert via raw .vscode/settings.json file content + cfg.inspect() per-scope reads + post-state cache — never spy on internal migrate* helpers (CONTEXT.md D-05)"

requirements-completed: [DEP-02, DEP-03, DEP-04, NOTIF-04, NOTIF-06]

completed: 2026-04-30
---

# Phase 17 Plan 02: Migration Suite Test File Created

**`test/integration/migrations suite/` ships 7 black-box assertions that, when run against the migration-stale fixture (Plan 01), verify Phase 15 + Phase 16 migrations end-to-end through one Dev Host activation.**

## Accomplishments
- `index.ts` — 28-line Mocha entry with module-top-level sinon stub on `vscode.window.showInformationMessage` (D-01 / RESEARCH §5.1)
- `extension.test.ts` — 7 tests in a single `suite('migrations suite', ...)` covering: file content, inspect() per-scope, post-state cache (D-18 ordering), notification firing, DSA flow, Open Settings flow, A1 inspect-probe
- `suiteTeardown` template-restore: copies `.vscode/settings.template.json` → `.vscode/settings.json` after every run, keeping the fixture stale for the next invocation
- TypeScript compiles cleanly (`npm run compile-tests` exit 0); no source-code changes; lint baseline preserved

## Task Commits

1. **Task 1: Create suite index with suite-load-time stub install** — `222cd91` (feat)
2. **Task 2: Create extension.test.ts with all migration + A1-probe + click-flow assertions** — `4b1bdf4` (feat)

## Test → Decision Map

| Test | Asserts | Closes |
|------|---------|--------|
| 1. file content | legacy keys gone, canonical keys written to disk at WorkspaceFolder scope | D-09 (raw disk view) |
| 2. cfg.inspect() | per-scope state matches disk (legacy at no scope, canonical at WorkspaceFolder) | D-09 (runtime API view) + D-02/D-03 |
| 3. cache reflects both | `workspaceRelativeFeaturesPaths` + `suppressedNotifications` populated | D-18 (reloadSettings ran AFTER both helpers) |
| 4. notification fired | activation-time `showInformationMessage` call captured with both buttons | D-04 (notification path verified) |
| 5. DSA flow | `featuresPathMigration` appended to `suppressedNotifications` after DSA click | Phase 15 HUMAN-UAT #2 (generalized to Phase 16 notification) |
| 6. Open Settings flow | `executeCommand("workbench.action.openSettings", "@ext:gabeseltzer.gs-behave-bdd")` triggered | D-04 (Open Settings handler verified) |
| 7. A1 probe | `cfg.inspect()` returns per-scope shape `{globalValue, workspaceValue, workspaceFolderValue}` for an unregistered key | Phase 15 HUMAN-UAT #1 (A1 probe) |

## Deviations from Plan

**Test 3 — `featuresPaths` → `workspaceRelativeFeaturesPaths`.** The plan specified asserting against `wkspSettings.featuresPaths`, but `WorkspaceSettings` (`src/settings.ts:80`) does not expose that field. The migration's resolved values land in `workspaceRelativeFeaturesPaths` (and `projectRelativeFeaturesPaths`). Asserted against `workspaceRelativeFeaturesPaths` instead — same evidence (cache reflects post-migration values), correct property name. Caught at `npm run compile-tests`.

**index.ts stub fake typing.** The plan's example fake had signature `(message: string, ...items: string[]) => Promise<undefined>`, which does not satisfy VS Code's overloaded `showInformationMessage` type (one overload includes `MessageOptions`). Resolved by typing the fake as `(...args: unknown[]) => undefined` cast via `as unknown as typeof vscode.window.showInformationMessage` (the plan anticipated this in the "If TS complains" note). Same per-test fakes also cast.

## Plan 03 must

1. Register `"migrations"` in `runTestSuites.ts` so it is launched against `example-projects/migration-stale/`
2. Run `npm test` to actually exercise the 7 assertions (Plan 02's verification was compile + structural shape only)
3. Wire the result back to Phase 15's `15-HUMAN-UAT.md` to close out the human-test items those tests now cover (A1 + DSA flow)

## Verification

- `npm run compile-tests` exits 0
- `npx eslint src --ext ts` exits 0 (no source changes)
- File contains 1 `suite('migrations suite', ...)` and 7 `test(...)` blocks
- `index.ts` contains module-top-level `sinon.stub(vscode.window, 'showInformationMessage')`
