---
phase: 15-notification-suppression
plan: 03
subsystem: notifications
tags: [migration, vscode-settings, configuration-target, scope-detection, test, tdd]

requires:
  - phase: 15-notification-suppression
    plan: 02
    provides: "src/notifications.ts module with isSuppressed, suppressNotification, showSuppressibleNotification, DONT_SHOW_AGAIN; ConfigurationTarget enum in vscode.mock.ts; makeScopedConfig test helper"
provides:
  - "src/notifications.ts::migrateLegacySuppressMultiConfig — one-shot legacy boolean → array migration helper"
  - "Eight NOTIF-06 sub-case unit tests (WorkspaceFolder/Workspace/Global scope, no-op×2, merge, idempotent, failure)"
  - "makePerKeyScopedConfig test helper: per-key scope branching (migration calls inspect() twice — once for legacy boolean, once for new array)"
affects:
  - "15-05-extension-wire-and-schema-removal (will call migrateLegacySuppressMultiConfig from activate() before updateDiscoveryUX)"

tech-stack:
  added: []
  patterns:
    - "Scope-preserving migration (RESEARCH.md Pattern 2): inspect() detects scope, update() writes both new and legacy keys at same ConfigurationTarget"
    - "Most-specific-wins scope ladder: workspaceFolderValue → workspaceValue → globalValue (mirrors src/settings.ts L20-L25 getWithLegacyFallback pattern)"
    - "Idempotency via dedup-against-same-scope read of existing array (Pitfall 2 mitigation — never use cfg.get() which merges scopes)"
    - "Per-key inspect mock pattern: makePerKeyScopedConfig branches return values on inspected key — required because scope-preserving migration inspects two different keys"

key-files:
  created: []
  modified:
    - src/notifications.ts
    - test/unit/notifications.test.ts

key-decisions:
  - "Migration helper exported (not module-private) per RESEARCH.md Open Question 3 — direct test access avoids brittleness of going through activate()"
  - "Same-scope dedup read uses cfg.inspect() not cfg.get() — Pitfall 2: get() merges scopes, returning false dedup positives when a higher-scope array contains the key"
  - "Failure path uses config.logger.logInfo (not showWarn) — DSA write is fire-and-forget; UI warning would be jarring after user already approved suppression"
  - "Reused makeScopedConfig helper exported from notifications.test.ts (Plan 01) for tests that need single-scope shapes; introduced new makePerKeyScopedConfig only where per-key branching is required (the migration's two inspect() calls on different keys)"

patterns-established:
  - "Phase 15 migrations always write at the detected legacy scope (D-08), never at a hardcoded scope — preserves user intent across global/workspace/folder scope levels"
  - "Phase 15 migrations are idempotent by construction: legacy key removal + new-key dedup means the second run inspects an already-migrated state and returns no-op"

requirements-completed: [NOTIF-06]

duration: ~10min
completed: 2026-04-27
---

# Phase 15 Plan 03: migrateLegacySuppressMultiConfig Summary

**Adds the legacy boolean → array migration helper `migrateLegacySuppressMultiConfig` to `src/notifications.ts`, backed by 8 unit-test sub-cases covering all NOTIF-06 paths (folder/workspace/global scope detection, false no-op, absent no-op, merge with existing entries, idempotent re-run, and warn-on-failure). Plan 02 exports preserved. Plan does NOT wire migration into `extension.ts` — Plan 05 owns that.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-27 (sequential executor invocation, after Plan 04 commit `7e8015e`)
- **Completed:** 2026-04-27
- **Tasks:** 2 (TDD cycle: RED then GREEN)
- **Files modified:** 2 (`src/notifications.ts`, `test/unit/notifications.test.ts`)
- **Files created:** 0

## Accomplishments

- NOTIF-06 (folder scope): `inspect().workspaceFolderValue=true` triggers migration writes at `vscode.ConfigurationTarget.WorkspaceFolder`. Both writes (new array + legacy delete) target the same ConfigurationTarget.
- NOTIF-06 (workspace scope): `inspect().workspaceValue=true` (and `workspaceFolderValue` unset) triggers migration writes at `vscode.ConfigurationTarget.Workspace`.
- NOTIF-06 (global scope): `inspect().globalValue=true` (and folder + workspace unset) triggers migration writes at `vscode.ConfigurationTarget.Global`.
- NOTIF-06 (no-op false): `legacyValue === false` short-circuits before any update — `updateSpy.callCount === 0`.
- NOTIF-06 (no-op absent): all three scope values undefined → no target → returns before any update.
- NOTIF-06 (merge): `existingInsp.workspaceFolderValue = ['someOther']` is preserved; merged array becomes `['someOther', 'multiConfigNotification']` (D-11 dedup applied to the merge).
- NOTIF-06 (idempotent): second run with legacy key already removed (`workspaceFolderValue: undefined`) and new array already containing the key returns no-op — no duplicate `multiConfigNotification` appended.
- NOTIF-06 (failure): `update()` rejection on the first call routes to `config.logger.logInfo(...)` with a message containing both key names; `assert.doesNotReject` confirms no exception escapes (D-07, T-15-11 mitigation).
- D-06 enforced: after writing the new array, a SECOND `update("suppressMultiConfigNotification", undefined, target)` is issued at the SAME target — verified by `updateSpy.secondCall.args` deep-equal assertion.
- D-08 enforced: scope detection uses `cfg.inspect<boolean>("suppressMultiConfigNotification")` and walks workspaceFolder → workspace → global (most-specific-wins).
- ESLint clean across `src/` (`npx eslint src --ext ts` exit 0 with no output).
- Test compile (`tsc -p test/tsconfig.json`) clean.
- Full unit suite GREEN: 680 tests passing (672 baseline from Plan 04 + 8 new migration tests).

## Task Commits

1. **Task 1: Write failing migration tests for migrateLegacySuppressMultiConfig (NOTIF-06)** — `6586143` (test)
2. **Task 2: Implement migrateLegacySuppressMultiConfig (GREEN)** — `b371923` (feat)

## Files Created/Modified

### Modified

- `src/notifications.ts` — +58 lines. Appended `migrateLegacySuppressMultiConfig(wkspUri)` after `showSuppressibleNotification`. The function: (1) calls `cfg.inspect<boolean>("suppressMultiConfigNotification")`, (2) walks workspaceFolder/workspace/global to detect scope and value, (3) returns no-op for `target === undefined || legacyValue !== true`, (4) reads existing `suppressedNotifications` at the SAME detected scope via `cfg.inspect<string[]>(...)` for dedup, (5) `await cfg.update("suppressedNotifications", merged, target)`, (6) `await cfg.update("suppressMultiConfigNotification", undefined, target)`, (7) wraps the two writes in try/catch and routes failures through `config.logger.logInfo` without throwing. Plan 02 exports (`isSuppressed`, `suppressNotification`, `showSuppressibleNotification`, `DONT_SHOW_AGAIN`) preserved verbatim — append-only edit.

- `test/unit/notifications.test.ts` — +139 lines. Added: (1) import for `migrateLegacySuppressMultiConfig` from `../../src/notifications`; (2) `makePerKeyScopedConfig` helper that branches inspect() responses on the inspected key (required because migration calls `inspect()` twice on different keys); (3) `suite('Phase 15 — notifications: migrateLegacySuppressMultiConfig (NOTIF-06)', ...)` with eight test cases — three scope-detection, two no-op, one merge, one idempotent, one failure-logging. The suite uses the existing `MOCK_URI` and `configModule` imports; logger is stubbed via `sinon.stub(configModule.config, 'logger').value(...)` per the Plan 02 pattern.

## Decisions Made

- **Reused `makeScopedConfig` for tests not needing per-key branching, introduced `makePerKeyScopedConfig` only where required.** The migration calls `cfg.inspect()` twice — once for `suppressMultiConfigNotification` (the legacy boolean), once for `suppressedNotifications` (the new array). Single-scope-shape `makeScopedConfig` (Plan 01) returns the same shape for any key, which conflates the two reads. The new helper accepts a `perKey` map and returns key-specific shapes. Both helpers coexist; `makeScopedConfig` is still exported and used by `isSuppressed` / `suppressNotification` / `showSuppressibleNotification` tests.
- **Most-specific-wins scope detection.** D-08 says "writes the array value at the same scope level where the old boolean was found." The PATTERNS.md guidance explicitly orders the ladder workspaceFolder → workspace → global. This matches the `getWithLegacyFallback` direction in `src/settings.ts` L20-L25 (where workspaceFolder is checked first because it's the most-specific scope a user could have set). Implementation honors this exactly.
- **Same-scope dedup read.** Pitfall 2: `cfg.get<string[]>("suppressedNotifications")` returns the *merged* effective value across scopes. Reading it for dedup means a higher-scope `["multiConfigNotification"]` array would falsely cause the lower-scope migration to skip (interpreting the key as "already there"), leaving the legacy boolean intact at the lower scope. Implementation reads `cfg.inspect<string[]>("suppressedNotifications").<sameScope>Value` and merges only against that specific scope's array.
- **`config.logger.logInfo` (not `showWarn`) for failure path.** D-07 specifies "log warning to output channel but don't notify the user." `logInfo` writes to the per-workspace output channel without UI surface. Migration is best-effort and silent — a UI warning after activation would be jarring on a read-only workspace where the user can't fix it anyway.
- **Migration helper exported, not private.** RESEARCH.md Open Question 3 left this open. Recommendation: export. Rationale: direct unit-test access (avoids brittleness from going through `activate()`) and one-shot side-effect functions are testable in isolation. Plan 05 will import `migrateLegacySuppressMultiConfig` from `./notifications`.
- **No `await migrateLegacySuppressMultiConfig` in extension.ts.** Plan 05 owns the wiring per CONSTRAINTS in the executor prompt. End of Plan 03 the new helper exists and is unit-tested but is not yet called at runtime.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Style] Moved eslint-disable-next-line for `: any` return**
- **Found during:** Task 1 lint check
- **Issue:** The plan's example placed `// eslint-disable-next-line @typescript-eslint/no-explicit-any` directly above `function makePerKeyScopedConfig(...)`. ESLint's `disable-next-line` directive does NOT span multi-line function signatures — the warning lands on the line containing `: any` (the closing line of the signature), not the line containing `function`. Result: a fresh warning at line 258.
- **Fix:** Moved the disable comment to the line immediately preceding the closing brace of the parameter type (line 257), so it directly precedes the line containing `: any` (line 258). Same semantics; warning suppressed correctly.
- **Files modified:** `test/unit/notifications.test.ts`
- **Commit:** `6586143` (folded into Task 1; the fix was applied before commit)
- **Note:** This deviation is style-only — the function behavior is unchanged. The `makeScopedConfig` helper (Plan 01) has the identical issue at line 27; that pre-existing warning is out-of-scope per the executor SCOPE BOUNDARY rule and was NOT touched.

**Total deviations:** 1 (Rule 1 — style/lint cleanliness on net-new code).
**Impact on plan:** None on behavior, plan timeline, or test outcomes.

## Issues Encountered

- **Initial `--grep` scope.** `npm run test:unit -- --grep "migrateLegacySuppressMultiConfig"` ran the full suite (680 tests) instead of filtering. The repo's `test:unit` script chains `npm run compile-tests && node ./out/test/test/unit/run.js --grep <pattern>`. The `--` separator may not be forwarding `--grep` through both `npm run` layers consistently on this Windows shell. Workaround: ran the full unit suite (`npm run test:unit`), confirmed all 680 tests pass, then used `grep` against the output to verify the 8 migration tests were in the run and all green. Not a plan or implementation issue.
- **Pre-existing ESLint warning at `test/unit/notifications.test.ts:27`** (the `makeScopedConfig` helper from Plan 01/02). Out of scope per the executor SCOPE BOUNDARY rule. CLAUDE.md mandates `npx eslint src --ext ts`, which is exit-0 clean. The pre-existing warning lives in `test/`, outside the CLAUDE.md mandate, and was not introduced by this plan.

## User Setup Required

None — no external service configuration required.

## Next Plan Readiness

- **Plan 05** (extension wire + schema removal) — Will `import { migrateLegacySuppressMultiConfig, showSuppressibleNotification } from './notifications'` and call the migration inside `activate()` before `updateDiscoveryUX(...)` is invoked. The migration is `async` and per D-05 must be `await`ed, with `config.reloadSettings(wkspUri)` called after each per-workspace migration to refresh the cached `WorkspaceSettings.suppressedNotifications` (Pitfall 4). Plan 05 will also remove the legacy `suppressMultiConfigNotification` schema entry from `package.json`, the field from `WorkspaceSettings`, and the legacy mock entries from `TestWorkspaceConfig` — all gated on the Wave 0 A1 probe outcome (which the unit tests already pass).
- **Plan 06** — Final cleanup; not yet expanded. Whatever residual legacy traces remain after Plan 05 belong here.

## Self-Check

Verified each modified file exists and each commit is reachable from HEAD.

- `src/notifications.ts` — FOUND (modified, +58 lines for migration helper)
- `test/unit/notifications.test.ts` — FOUND (modified, +139 lines for 8 NOTIF-06 sub-case tests + helper)

Commit hashes (each verified via `git log --oneline | grep`):

- `6586143` — Task 1 (test, RED)
- `b371923` — Task 2 (feat, GREEN)

Verification commands run:

- `npx eslint src --ext ts` — exit 0, no output
- `npx tsc --noEmit -p test/tsconfig.json` — exit 0
- `npm run test:unit` — 680 tests passing (672 baseline + 8 NOTIF-06), 0 failing

Acceptance-criteria grep counts (from plan `<acceptance_criteria>`):

| Pattern | Expected | Actual |
|---------|----------|--------|
| `export async function migrateLegacySuppressMultiConfig` (src) | 1 | 1 ✓ |
| `inspect<boolean>("suppressMultiConfigNotification")` (src) | 1 | 1 ✓ |
| `ConfigurationTarget.WorkspaceFolder` (src) | ≥ 2 | 3 ✓ |
| `ConfigurationTarget.Workspace[^F]` (src) | 1 | 2 ✓ |
| `ConfigurationTarget.Global` (src) | 1 | 1 ✓ |
| `update("suppressMultiConfigNotification", undefined` (src) | 1 | 1 ✓ |
| `Could not migrate suppressMultiConfigNotification` (src) | 1 | 1 ✓ |
| `legacyValue !== true` (src) | 1 | 1 ✓ |
| `migrateLegacySuppressMultiConfig (NOTIF-06)` (test suite) | 1 | 1 ✓ |
| `import { migrateLegacySuppressMultiConfig }` (test) | 1 | 1 ✓ |
| `test('migrate` (test) | ≥ 8 | 8 ✓ |
| Plan 02 exports (`isSuppressed` etc.) preserved | yes | yes ✓ |

## Self-Check: PASSED

---
*Phase: 15-notification-suppression*
*Plan: 03*
*Completed: 2026-04-27*
