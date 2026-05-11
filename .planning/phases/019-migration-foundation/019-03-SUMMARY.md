---
phase: 019-migration-foundation
plan: 03
subsystem: commands
tags: [vscode-command, quick-pick, migration, recheck]

requires:
  - phase: 019-migration-foundation Plan 01
    provides: gs-behave-bdd.completedMigrations schema entry — the cfg.update target
  - phase: 019-migration-foundation Plan 02
    provides: evaluateAllMigrations — the rescan path the command reuses (D-08)
provides:
  - recheckMigrationsCommandHandler — quick-pick scope picker + clear + rescan
  - gs-behave-bdd.recheckMigrations command contribution + registerCommand wiring
  - schema + structural tests (5.1 + 5.2) pinning the command surface
affects: [020-migration-registry, 021-consent-ux, 022-cleanup-integration-docs]

tech-stack:
  added: []
  patterns:
    - "Direct-import handler pattern (Phase 15 Plan 03 precedent): export the command handler so unit tests drive it without going through registerCommand."
    - "Mock-only deviations in test/unit/vscode.mock.ts: added workspace.workspaceFile and window.showQuickPick to support the new test surface (mirrors Phase 15 Plan 02 ConfigurationTarget precedent)."

key-files:
  created:
    - src/migrations/recheckCommand.ts
  modified:
    - src/migrations/index.ts
    - src/extension.ts
    - package.json
    - test/unit/migrations.test.ts
    - test/unit/packageJsonSchema.test.ts
    - test/unit/vscode.mock.ts

key-decisions:
  - "Used logInfoAllWksps() when no workspace folder is open and no targetWkspUri is available — config.logger.logInfo's signature requires Uri (non-optional). Caught at compile time."
  - "Mock-only deviation: extended vscode.mock.ts with workspace.workspaceFile (default undefined) and window.showQuickPick (default Promise.resolve(undefined)). Both are overridden via Sinon stubs in tests; production reads through to the real API. Phase 15 Plan 02 ConfigurationTarget precedent applies."
  - "Phase 19 boundary respected: the registerCommand is wired in extension.ts, but evaluateAllMigrations is NOT yet called from activate(). Phase 21 owns activation-time wiring alongside the prompt UX."
  - "Wrap config.logger.showError in its own try/catch (defense in depth) so the handler never throws out of a command surface."

patterns-established:
  - "Quick-pick scope-availability matrix: Global always, Workspace iff workspaceFile, WorkspaceFolder iff workspaceFolders.length > 0."
  - "Structural test for command wiring: literal command id appears exactly once in extension.ts AND a registerCommand( token sits within ~80 chars before it (Phase 15 Plan 05 pattern)."

requirements-completed: [CONSENT-09, TEST-05]

duration: ~20min
completed: 2026-05-07
---

# Phase 019 Plan 03: Recheck Migrations Command Summary

**Behave BDD: Recheck Migrations command shipped — quick-pick scope picker with availability filtering, clears completedMigrations at the chosen scope, re-runs the standard evaluator path. Wired through registerCommand and pinned by 11 new unit tests.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-05-07
- **Completed:** 2026-05-07
- **Tasks:** 2 (atomic commits)
- **Files modified:** 7 (1 new source, 6 modified)

## Accomplishments

- New `src/migrations/recheckCommand.ts` exposes `recheckMigrationsCommandHandler(hooks?)` — the command palette handler.
- Quick-pick UX (D-06): three options Global / Workspace / Workspace Folder, with descriptions explaining scope semantics and `ignoreFocusOut: true` so an accidental click-away doesn't lose progress.
- Scope availability filtering (D-07): Workspace appears only when `workspace.workspaceFile !== undefined`; Workspace Folder appears only when `workspaceFolders.length > 0`.
- Clear-then-rescan (D-08): `cfg.update("completedMigrations", [], pick.target)` followed by `evaluateAllMigrations(folder.uri)` per workspace folder. Single rescan path — no parallel implementation.
- Failure handling: `cfg.update` rejection logs and short-circuits (avoids re-evaluating against a stale cleared state). Outer try/catch routes any unexpected error to `config.logger.showError` so the handler never throws out of a command surface.
- Command contribution registered in `package.json` with the canonical CONSENT-09 title.
- `registerCommand` wiring landed in the existing `context.subscriptions.push(...)` block in `src/extension.ts`.
- Extended `test/unit/vscode.mock.ts` with `workspace.workspaceFile` (default `undefined`) and `window.showQuickPick` (default `Promise.resolve(undefined)`) — both mock-only, both overridden via Sinon in the new tests.
- 11 new tests across two suites (9 handler-behavior + 2 schema/structural). Test count: 728 → 739.

## Task Commits

1. **Task 1: recheckMigrationsCommandHandler + tests + mock surface** — `53a1471` (feat)
2. **Task 2: package.json command + registerCommand wiring + 5.1/5.2 tests** — `80dbf72` (feat)

**Plan metadata:** `docs(019-03): plan summary` (this file).

## Files Created/Modified

- **Created** `src/migrations/recheckCommand.ts` — quick-pick scope picker, clear, evaluator rescan loop.
- `src/migrations/index.ts` — re-exports `recheckMigrationsCommandHandler`.
- `src/extension.ts` — added the `recheckMigrationsCommandHandler` import and the `registerCommand('gs-behave-bdd.recheckMigrations', () => recheckMigrationsCommandHandler())` wiring inside the existing subscriptions block.
- `package.json` — added the `gs-behave-bdd.recheckMigrations` entry to `contributes.commands` after `gs-behave-bdd.selectProject`.
- `test/unit/migrations.test.ts` — 9 new tests in a new "Phase 19 Plan 03 — recheckMigrationsCommandHandler" suite covering the scope-availability matrix (4.1-4.3), cancel (4.4), each successful pick (4.5-4.7), update rejection (4.8), and the empty-registry no-prompt path (4.9).
- `test/unit/packageJsonSchema.test.ts` — 2 new tests (5.1 schema, 5.2 structural) in a new "package.json + extension.ts — Phase 19 Plan 03 (CONSENT-09)" suite.
- `test/unit/vscode.mock.ts` — added `workspace.workspaceFile` and `window.showQuickPick` mock surface (deviations documented inline).

## Decisions Made

- See "key-decisions" frontmatter. Highlights: signature compatibility for `logInfo`, mock-only deviation for `showQuickPick` + `workspaceFile`, Phase 19 boundary preserved (no activation-time evaluator call yet).

## Deviations from Plan

### 1. logInfo signature requires Uri — added logInfoAllWksps fallback

- **Found during:** Task 1 compilation
- **Issue:** Plan's snippet calls `config.logger.logInfo(msg, targetWkspUri)` where `targetWkspUri` is `Uri | undefined`. The Logger's `logInfo(text: string, wkspUri: vscode.Uri, ...)` signature is non-optional, so TypeScript rejected it.
- **Fix:** Added a guard — when `targetWkspUri` is `undefined` (no folders open), call `config.logger.logInfoAllWksps(msg)` instead. Same logging surface, no-folder safe.
- **Files modified:** src/migrations/recheckCommand.ts
- **Verification:** `npm run test:unit` 0 failures; 4.8 (cfg.update rejection) test confirms logger.logInfo path still works in the with-folder case.
- **Committed in:** `53a1471` (Task 1).

### 2. vscode.mock.ts mock-only deviation (workspace.workspaceFile + window.showQuickPick)

- **Found during:** Task 1 test writing
- **Issue:** The existing mock did not expose `workspace.workspaceFile` (used by D-07 filtering) or `window.showQuickPick` (the picker UX). Without these the new tests would have to monkey-patch the module under test.
- **Fix:** Added both as mock-only properties. Defaults are no-op (`undefined` and `Promise.resolve(undefined)`). All 9 tests override via Sinon stubs.
- **Files modified:** test/unit/vscode.mock.ts
- **Verification:** Existing 700+ unit tests still pass; new tests cover the new surface.
- **Committed in:** `53a1471` (Task 1).

---

**Total deviations:** 2 (one type-safety guard, one mock-only addition).
**Impact on plan:** Zero behavioral impact. Both align with prior precedents (Phase 15 Plan 02 mock deviation; standard logger fallback patterns).

## Issues Encountered

- TypeScript strict mode caught the `Uri | undefined` mismatch immediately — surfaced before runtime, fixed in seconds.

## Next Phase Readiness

- The command palette entry is live and bundled (webpack production build succeeds). A Phase 22 manual smoke check via the palette will confirm end-to-end UX.
- Phase 21 can layer the prompt UX behind `EvaluatorHooks.onCaseHit` without touching the command handler — the hooks parameter on `recheckMigrationsCommandHandler` is reserved for that wiring.

---
*Phase: 019-migration-foundation*
*Plan: 03-recheck-command*
*Completed: 2026-05-07*
