---
phase: 15-notification-suppression
plan: 04
subsystem: configuration
tags: [test-mock, fixtures, configuration, settings]

requires:
  - phase: 15-notification-suppression
    plan: 01
    provides: "WorkspaceSettings.suppressedNotifications field; package.json schema; four cascading settings test fixtures already carrying suppressedNotifications: []"
provides:
  - "TestWorkspaceConfig mock surface for `suppressedNotifications: string[]` setting (private field, optional constructor param, get/inspect switch cases)"
  - "Mock returns `[]` from `get('suppressedNotifications')` when not passed (matches package.json default)"
  - "Mock returns `undefined` from `inspect('suppressedNotifications').workspaceFolderValue` when not passed (mirrors featuresPaths fidelity behavior)"
affects:
  - "Future tests that need to construct TestWorkspaceConfig with explicit suppressedNotifications arrays"
  - "15-05-extension-wire-and-schema-removal (Plan 05 will remove legacy suppressMultiConfigNotification mock entries)"

tech-stack:
  added: []
  patterns:
    - "TestWorkspaceConfig array setting mirror (followed featuresPaths template at L17 / L40 / L57 / L90-L91 / L148-L150 exactly)"
    - "Coexisting legacy and new keys (suppressMultiConfigNotification kept alongside suppressedNotifications) — supports Wave 2 parallel landing without breaking pre-existing settings tests"

key-files:
  created: []
  modified:
    - src/testWorkspaceConfig.ts

key-decisions:
  - "Followed `featuresPaths` array precedent exactly: `?? []` fallback in `get()` (matches package.json default), no fallback in `inspect()`, no `getExpected()` case"
  - "Both legacy `suppressMultiConfigNotification` and new `suppressedNotifications` fields, constructor params, and switch cases coexist in the mock until Plan 05/06 cleanup"

patterns-established:
  - "Single-task plan structure when fixture cascade is folded into parent plan (BLOCKER B-2 fold in Plan 01 left only the mock surgery here)"

requirements-completed: [NOTIF-08]

duration: ~10min
completed: 2026-04-27
---

# Phase 15 Plan 04: TestWorkspaceConfig Mock Surgery for suppressedNotifications Summary

**Adds `suppressedNotifications` mock support to `TestWorkspaceConfig` (private field, optional constructor param, `get()` and `inspect()` switch cases), mirroring the `featuresPaths` array pattern exactly. Legacy `suppressMultiConfigNotification` mock entries preserved for Plan 05/06 cleanup. Full unit suite still green at 672 tests.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-27 (sequential executor invocation, after Plan 02 commit `a8d35ad`)
- **Completed:** 2026-04-27
- **Tasks:** 1
- **Files modified:** 1 (src/testWorkspaceConfig.ts)
- **Files created:** 0

## Accomplishments

- NOTIF-08 (mock surface): `TestWorkspaceConfig` now accepts `suppressedNotifications?: string[]` as an optional constructor parameter and exposes it via `get('suppressedNotifications')` and `inspect('suppressedNotifications')`.
- `get('suppressedNotifications')` returns `[]` by default (matches `package.json` schema `default: []`), or the passed array when provided — mirrors the `featuresPaths` `?? []` fallback at L90-L91.
- `inspect('suppressedNotifications')` returns the value via `workspaceFolderValue` (the existing `TestWorkspaceConfig.inspect()` fidelity behavior — only that scope is populated; this is a known fidelity gap acknowledged in Plan 03 / RESEARCH.md Pitfall 5).
- Legacy `suppressMultiConfigNotification` mock entries (private field, constructor param, `get()` case, `inspect()` case, `getExpected()` case) all preserved verbatim — Plan 05/06 cleanup removes them.
- No `getExpected()` case added for the new array key (matches `featuresPaths` precedent — array settings are not exercised by `getExpected()` consumers).
- ESLint clean across `src/` (exit 0 with no output).
- Test compile (`tsc -p test/tsconfig.json`) clean.
- Full unit suite GREEN: 672 tests passing (same as Plan 02 baseline; this plan adds no new tests but verifies the four cascading fixture files from Plan 01 still pass with the new mock surface).

## Task Commits

1. **Task 1: Add `suppressedNotifications` to TestWorkspaceConfig mock (preserve legacy entries)** — `f4ec0bc` (feat)

## Files Created/Modified

### Modified

- `src/testWorkspaceConfig.ts` — 6 logical edits:
  1. Added `private suppressedNotifications: string[] | undefined;` immediately after the legacy `suppressMultiConfigNotification` field declaration (around L27 area).
  2. Added `suppressedNotifications` to the constructor's destructured-parameter list (after `suppressMultiConfigNotification` at L33).
  3. Added `suppressedNotifications?: string[] | undefined` to the constructor's TypeScript type annotation block (after `suppressMultiConfigNotification?` at L50).
  4. Added `this.suppressedNotifications = suppressedNotifications;` in the constructor body, immediately after the legacy assignment at L67.
  5. Added `case "suppressedNotifications": return <T><unknown>(this.suppressedNotifications ?? []);` to the `get()` switch, immediately after the legacy `case "suppressMultiConfigNotification"` block.
  6. Added `case "suppressedNotifications": response = <T><unknown>this.suppressedNotifications; break;` to the `inspect()` switch, immediately after the legacy `case "suppressMultiConfigNotification"` block.

  Net delta: +10 lines, -2 lines (the `default:` case before-context was the natural anchor for both new switch cases).

## Decisions Made

- **Mirror `featuresPaths` array pattern exactly** — Per PATTERNS.md L355-L417 and the plan's `<interfaces>` block, `featuresPaths` is the established array-setting precedent for `TestWorkspaceConfig`. Followed each of its five touch points (field declaration, constructor param, constructor type annotation, constructor assignment, `get()` case with `?? []` fallback, `inspect()` case without fallback). Did NOT add a `getExpected()` case because `featuresPaths` has none (PATTERNS.md L357 explicit precedent).
- **Coexist with legacy** — Per BLOCKER B-2 fix in Plan 01 and `<behavior>` step 7 of this plan, all `suppressMultiConfigNotification` references are preserved. The mock now has both shapes alive simultaneously. Plan 05/06 cleanup removes the legacy entries gated on the Wave 0 A1 probe outcome.
- **No new ad-hoc tests added** — The plan's optional `TestWorkspaceConfig suppressedNotifications default (NOTIF-08)` test block (PATTERNS.md L478-L508) is exercised implicitly by the four cascading fixture files Plan 01 already updated. Adding the explicit two-test block was not required by the plan's `<acceptance_criteria>` — only the grep-and-suite criteria were required, and all are satisfied. Skipped to keep this plan minimal-surface per its single-task scope.

## Deviations from Plan

None — plan executed exactly as written.

The plan body specifies six discrete edits to `src/testWorkspaceConfig.ts` (field, constructor destructure, constructor type, constructor assignment, `get()` case, `inspect()` case); all six landed in a single atomic commit. No auto-fixed bugs (Rule 1), no missing critical functionality added (Rule 2), no blocking issues (Rule 3), no architectural changes (Rule 4).

**Total deviations:** 0
**Impact on plan:** None.

## Issues Encountered

- **`tsc --noEmit -p .` reports a pre-existing `smol-toml` ErrorOptions error.** This is the same baseline noise documented in Plan 01's Issues Encountered §2 — unrelated to Plan 04 changes. The test compile (`tsc -p test/tsconfig.json`) is clean, lint is clean, and the full unit suite is green — the pre-existing typecheck noise is out-of-scope per the deviation-rule SCOPE BOUNDARY clause.

## User Setup Required

None — no external service configuration required.

## Next Plan Readiness

- **Plan 03** (migration `migrateLegacySuppressMultiConfig`) — Unaffected by this plan. Migration tests use the inline `makeScopedConfig` helper from `test/unit/notifications.test.ts` (Pitfall 5: `TestWorkspaceConfig.inspect()` only populates `workspaceFolderValue`, so migration tests that need `globalValue`/`workspaceValue` must use the inline helper).
- **Plan 05** (extension wire + schema removal) — Will remove the legacy `suppressMultiConfigNotification` private field, constructor destructure entry, type annotation entry, constructor assignment, `get()` case, `inspect()` case, AND `getExpected()` case from `src/testWorkspaceConfig.ts`. The new `suppressedNotifications` mock surface stays. This plan ends with both alive; Plan 05 ends with only the new key.

## Self-Check

Verified the modified file exists and the commit is reachable from HEAD.

- `src/testWorkspaceConfig.ts` — FOUND (modified)

Commit hash (verified via `git log --oneline | grep`):

- `f4ec0bc` — Task 1 (feat)

Verification commands run:

- `npx eslint src --ext ts` — exit 0, no output
- `npx tsc --noEmit -p test/tsconfig.json` — exit 0
- `npm run test:unit` — 672 tests passing, 0 failing

Acceptance-criteria grep counts:

| Pattern | Expected | Actual |
|---------|----------|--------|
| `private suppressedNotifications` | 1 | 1 ✓ |
| `private suppressMultiConfigNotification` | 1 | 1 ✓ |
| `case "suppressedNotifications"` | ≥ 2 | 2 ✓ |
| `case "suppressMultiConfigNotification"` | ≥ 3 | 3 ✓ |
| `this.suppressedNotifications = suppressedNotifications` | 1 | 1 ✓ |
| `this.suppressedNotifications ?? []` | 1 | 1 ✓ |

## Self-Check: PASSED

---
*Phase: 15-notification-suppression*
*Plan: 04*
*Completed: 2026-04-27*
