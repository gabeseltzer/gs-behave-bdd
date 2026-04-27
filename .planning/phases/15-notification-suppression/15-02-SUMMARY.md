---
phase: 15-notification-suppression
plan: 02
subsystem: notifications
tags: [notifications, suppression, vscode-api, async, test, tdd]

requires:
  - phase: 15-notification-suppression
    plan: 01
    provides: "WorkspaceSettings.suppressedNotifications field; package.json schema; makeScopedConfig test helper; ConfigurationTarget-free Wave 0 A1 probe"
provides:
  - "src/notifications.ts module exporting isSuppressed, suppressNotification, showSuppressibleNotification"
  - "DONT_SHOW_AGAIN single module constant (anti-divergence per RESEARCH.md)"
  - "vscode.ConfigurationTarget enum in test/unit/vscode.mock.ts (downstream plans 03/05 can rely on it)"
  - "13 new unit tests covering NOTIF-02 (check + suppress + dedup), NOTIF-03 (WorkspaceFolder scope assertion), NOTIF-04 (button passthrough + DSA interception)"
affects:
  - "15-03-migration (will compose suppressNotification with same dedup pattern)"
  - "15-05-extension-wire-and-schema-removal (will replace inline notification block at extension.ts L141-L181 with showSuppressibleNotification call)"

tech-stack:
  added: []
  patterns:
    - "Plain-function module style (D-01) — no class/namespace wrapper, mirrors src/common.ts"
    - "Inspect-not-get dedup (Pitfall 2): suppressNotification reads inspect().workspaceFolderValue for dedup (avoids merged-scope false positives)"
    - "Single DONT_SHOW_AGAIN constant referenced at append site and intercept site (T-15-04 mitigation)"
    - "Warn-and-continue on update() rejection: try/catch + config.logger.logInfo (matches existing extension.ts L177-L178 fire-and-forget shape)"

key-files:
  created:
    - src/notifications.ts
  modified:
    - test/unit/notifications.test.ts
    - test/unit/vscode.mock.ts

key-decisions:
  - "Used non-assertion-free guard (`const wfv = insp ? insp.workspaceFolderValue : undefined`) for inspect().workspaceFolderValue to avoid no-non-null-assertion ESLint complaint while preserving Array.isArray narrowing"
  - "Added ConfigurationTarget enum to vscode.mock.ts as a Rule 3 deviation — required for `vscode.ConfigurationTarget.WorkspaceFolder` to evaluate in unit tests; the wave-0 A1 probe didn't reference it but every Plan 02 test does"

patterns-established:
  - "Phase 15 wrappers always read suppression state from cached WorkspaceSettings (config.workspaceSettings[wkspUri.path]), never from a fresh getConfiguration().get() call"
  - "Phase 15 wrappers never throw — failures route through config.logger.logInfo so callers can stay fire-and-forget"

requirements-completed: [NOTIF-02, NOTIF-03, NOTIF-04]

duration: ~15min
completed: 2026-04-27
---

# Phase 15 Plan 02: notifications.ts Core API Summary

**Adds `src/notifications.ts` exporting `isSuppressed`, `suppressNotification`, and `showSuppressibleNotification` (plus a single `DONT_SHOW_AGAIN` module constant), backed by 13 new unit tests covering NOTIF-02/03/04. The wrapper is implemented but not yet wired into `extension.ts` — Plan 05 owns that.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-27 (sequential executor invocation, after Plan 01 commit `a7bcc5b`)
- **Completed:** 2026-04-27
- **Tasks:** 2 (TDD cycle: RED then GREEN)
- **Files created:** 1 (`src/notifications.ts`)
- **Files modified:** 2 (`test/unit/notifications.test.ts`, `test/unit/vscode.mock.ts`)

## Accomplishments

- NOTIF-02 (check) lands: `isSuppressed(key, wkspUri)` reads `config.workspaceSettings[wkspUri.path].suppressedNotifications` and returns `true` only when the key is in the cached array. Cache-entry-missing and `suppressedNotifications`-undefined cases both return `false`.
- NOTIF-02 (suppress) lands: `suppressNotification(key, wkspUri)` reads `inspect().workspaceFolderValue` (not `cfg.get()` — Pitfall 2), dedups against the WorkspaceFolder-scope value (D-11), and appends `[...current, key]` only when the key is absent.
- NOTIF-03 enforced: the third arg of `cfg.update()` is asserted to be `vscode.ConfigurationTarget.WorkspaceFolder` in every test that exercises the write path.
- NOTIF-04 (button passthrough) lands: `showSuppressibleNotification(key, message, buttons, wkspUri)` returns the user's clicked button label (e.g. `'Select Project'`) and returns `undefined` only when suppressed, dismissed, or DSA was clicked. The DSA branch internally calls `suppressNotification`, never leaking `"Don't Show Again"` to the caller (D-04).
- DSA literal is centralized: `const DONT_SHOW_AGAIN = "Don't Show Again"` is defined once at module scope, referenced at the append site (line 64) and the intercept site (line 67) — T-15-04 mitigation.
- Failure path covered: when `cfg.update()` rejects, the function logs via `config.logger.logInfo` with a message containing the key and does NOT throw (T-15-07 mitigation).
- 13 new unit tests added, all passing. Full unit suite GREEN: 672 tests passing (659 baseline from Plan 01 + 13 new).
- ESLint clean across `src/`.

## Task Commits

1. **Task 1: Write failing tests for isSuppressed, suppressNotification, showSuppressibleNotification (RED)** — `4e112f9` (test)
2. **Task 2: Implement src/notifications.ts to make tests pass (GREEN); add ConfigurationTarget enum to vscode.mock.ts** — `5978e5a` (feat)

## Files Created/Modified

### Created

- `src/notifications.ts` — 71 lines. Exports three plain async functions and one module-level `DONT_SHOW_AGAIN` constant. Per D-01 there is no class wrapper. Imports only `vscode` (namespace) and `config` from `./configuration`.

### Modified

- `test/unit/notifications.test.ts` — Added imports for `configModule` and the three exports from `src/notifications`. Appended three new `suite()` blocks (`isSuppressed`, `suppressNotification`, `showSuppressibleNotification`) totaling 13 new tests. Wave-0 A1 probe and `makeScopedConfig` export from Plan 01 preserved.
- `test/unit/vscode.mock.ts` — Added `ConfigurationTarget` enum (`Global=1`, `Workspace=2`, `WorkspaceFolder=3`) immediately after the existing `FileType` enum. Without this, `vscode.ConfigurationTarget.WorkspaceFolder` evaluates as `undefined.WorkspaceFolder` and the `cfg.update(...)` expression throws TypeError before reaching the spy.

## Decisions Made

- **Non-null assertion avoidance** — The plan's example used `insp!.workspaceFolderValue!` after `Array.isArray(insp?.workspaceFolderValue)`. The plan's fallback note explicitly suggested rewriting as a separate `wfv` variable if ESLint complains. We took the safer fallback path proactively (`const wfv = insp ? insp.workspaceFolderValue : undefined; const current = Array.isArray(wfv) ? wfv : []`) — same semantics, zero non-null assertions, ESLint clean from the first run.
- **Rule 3 deviation: ConfigurationTarget mock** — The vscode mock did not declare `ConfigurationTarget`. The wave-0 A1 probe didn't need it (it only exercises `inspect()`), but Plan 02 tests assert `vscode.ConfigurationTarget.WorkspaceFolder` strictly and the `suppressNotification` implementation references it. Without the enum the expression evaluates to TypeError, which the implementation catches and routes to `config.logger.logInfo`. That made test 1 (write) and test 2 (append) fail with `updateSpy.callCount === 0` and made test 4 (failure logs) pass for the wrong reason. Fix: add the enum to the mock with the canonical numeric values from VS Code's API. This is a blocking-issue fix per Rule 3 — necessary to complete the current task.
- **Rejection logging via config.logger.logInfo** — The plan specified `logInfo` (not `showWarn`) for the warn-and-continue path. We honored that exactly. `showWarn` would surface a UI warning, which is undesirable for a fire-and-forget DSA write that the user has already approved.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `ConfigurationTarget` enum to `test/unit/vscode.mock.ts`**
- **Found during:** Task 2 (running tests after implementation)
- **Issue:** `vscode.ConfigurationTarget` was undefined in the unit-test mock. Reading `.WorkspaceFolder` on undefined threw a TypeError that was caught by `suppressNotification`'s try/catch, suppressing 3 tests (write, append, DSA) that asserted the spy was called.
- **Fix:** Added an `enum ConfigurationTarget { Global = 1, Workspace = 2, WorkspaceFolder = 3 }` after the existing `FileType` enum in `test/unit/vscode.mock.ts`. Values match VS Code's published API. No source code change required.
- **Files modified:** `test/unit/vscode.mock.ts`
- **Commit:** `5978e5a` (folded into Task 2 because both changes are required for the same TDD GREEN gate)

**Total deviations:** 1 (Rule 3 — necessary mock infrastructure for new tests)
**Impact on plan:** Negligible. The fix is constrained to the test mock and unblocks all Plan 02 tests; no production code drift.

## Issues Encountered

- **Initial test run RED for the right reason** — the import of `src/notifications.ts` failed at TS compile time before any test could execute. Confirmed RED state, then proceeded to GREEN. Standard TDD flow, not an issue.
- **Three tests still RED after implementation landed** — `vscode.ConfigurationTarget` undefined in mock. Diagnosed by reading the failing tests' assertions side-by-side with `vscode.mock.ts`. Resolved by adding the enum (see Deviation 1).

## User Setup Required

None — no external service configuration required.

## Next Plan Readiness

- **Plan 03** (migration `migrateLegacySuppressMultiConfig`) can now compose `suppressNotification` for the dedup-and-append phase OR replicate the inspect+update pattern directly with three-scope detection. The `makeScopedConfig` helper supports per-scope shapes for migration tests. The `ConfigurationTarget` enum in the mock unblocks any migration test that needs to assert the write target.
- **Plan 04** (`testWorkspaceConfig.ts` mock surgery) is unaffected by this plan — separate code paths.
- **Plan 05** (extension wire + schema removal) is the consumer of `showSuppressibleNotification`. The wrapper's signature (`(key, message, buttons, wkspUri) => Promise<string | undefined>`) is locked. Plan 05 will replace `extension.ts` L141-L181 with a single `showSuppressibleNotification(...).then(action => ...)` call.

## Self-Check

Verified each created/modified file exists and each commit is reachable from HEAD.

- `src/notifications.ts` — FOUND (created, 71 lines)
- `test/unit/notifications.test.ts` — FOUND (modified)
- `test/unit/vscode.mock.ts` — FOUND (modified, ConfigurationTarget enum added)

Commit hashes (each verified via `git log --oneline | grep`):

- `4e112f9` — Task 1 (test)
- `5978e5a` — Task 2 (feat)

Verification commands run:

- `npx eslint src --ext ts` — exit 0, no output
- `npm run test:unit` — 672 tests passing (13 new), 0 failing

## Self-Check: PASSED

---
*Phase: 15-notification-suppression*
*Plan: 02*
*Completed: 2026-04-27*
