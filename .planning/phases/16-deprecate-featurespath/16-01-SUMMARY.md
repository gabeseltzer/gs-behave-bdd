---
phase: 16-deprecate-featurespath
plan: 01
subsystem: testing
tags: [vscode-extension, settings-migration, test-infrastructure, pre-flight]

requires:
  - phase: 15-notification-suppression
    provides: |
      `makePerKeyScopedConfig` test helper, `showSuppressibleNotification` wrapper,
      `migrateLegacySuppressMultiConfig` reference migration helper, A1 inspect()
      contract for unregistered keys.
provides:
  - Confirmed publisher literal `gabeseltzer` for Plan 04's openSettings argument
  - Re-validated A1 inspect() contract — Phase 15's load-bearing assumption still holds
  - Baseline unit-test pass count (683) — regression bar for Plan 02 D-MOD refactor
  - `makePerKeyScopedConfig` named export from `test/unit/notifications.test.ts` for Plans 02 & 03
affects: [16-02, 16-03, 16-04]

tech-stack:
  added: []
  patterns:
    - "Pre-flight verification of load-bearing facts before any production-code phase"

key-files:
  created:
    - .planning/phases/16-deprecate-featurespath/16-01-SUMMARY.md
  modified:
    - test/unit/notifications.test.ts

key-decisions:
  - "Lock baseline at 683 passing — Plan 02's regression bar is `>= 683` after primitive extraction"
  - "Joint-export form `export { makeScopedConfig, makePerKeyScopedConfig };` chosen over a second `export` statement to keep one named-export site in the file"

patterns-established:
  - "Pre-flight Wave 1 plan: verification-only + minimal mechanical edit, no production code"

requirements-completed: [DEP-07]

duration: ~5min
completed: 2026-04-29
---

# Phase 16 Plan 01: Pre-flight verification + helper export

**Three load-bearing facts locked in (publisher literal, A1 contract, 683-test baseline) and `makePerKeyScopedConfig` surfaced as a named export so Plans 02–03 can import it directly.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-29
- **Completed:** 2026-04-29
- **Tasks:** 2/2
- **Files modified:** 1 (`test/unit/notifications.test.ts`)

## Accomplishments

- **Publisher confirmed:** `package.json:280` → `"publisher": "gabeseltzer",` (exact literal Plan 04 will hardcode in the `@ext:gabeseltzer.gs-behave-bdd` openSettings call).
- **A1 contract still GREEN:** Both Wave 0 A1 probe sub-cases pass under `--grep "Wave 0: Assumption A1 probe"`:
  - `A1: inspect() returns workspaceFolderValue for unregistered key with settings.json value`
  - `A1: inspect() returns globalValue for unregistered key set globally`
- **Baseline pass count = 683** — recorded for Plan 02's "passing >= baseline" acceptance criterion after the D-MOD primitive extraction.
- **Joint export landed:** `export { makeScopedConfig, makePerKeyScopedConfig };` at exactly one site (`grep -c` returns 1); the prior single-export form is gone (`grep -c "^export { makeScopedConfig };$"` returns 0).

## Task Commits

1. **Task 1: Pre-flight verifications** — verification only (no commit)
2. **Task 2: Export `makePerKeyScopedConfig`** — `5210104` (test)

_No plan-metadata commit needed — frontmatter unchanged._

## Files Created/Modified

- `test/unit/notifications.test.ts` — single-line edit on the existing export statement adjacent to `makePerKeyScopedConfig`'s declaration. No behavioral change.
- `.planning/phases/16-deprecate-featurespath/16-01-SUMMARY.md` — this file.

## Decisions Made

None — plan executed exactly as written.

## Deviations from Plan

None — plan executed exactly as written.

## Diff Snippet

```diff
-export { makeScopedConfig };
+export { makeScopedConfig, makePerKeyScopedConfig };
```

## Verification Results

| Check | Command | Expected | Actual | Status |
|-------|---------|----------|--------|--------|
| Publisher literal | `grep -c '"publisher": "gabeseltzer"' package.json` | 1 | 1 | ✓ |
| A1 probe | `npx mocha … --grep "Wave 0: Assumption A1 probe"` | 2 passing | 2 passing | ✓ |
| Joint export present | `grep -c "export { makeScopedConfig, makePerKeyScopedConfig };" test/unit/notifications.test.ts` | 1 | 1 | ✓ |
| Old export gone | `grep -c "^export { makeScopedConfig };$" test/unit/notifications.test.ts` | 0 | 0 | ✓ |
| Lint | `npx eslint src --ext ts` | exit 0, no output | exit 0, no output | ✓ |
| Unit tests | `npm run test:unit` | exit 0, ≥ 683 passing | exit 0, **683 passing** | ✓ |

## Handoff to Plan 02

- **Baseline = 683**: Plan 02 must end with `>= 683` passing after the primitive extraction (D-MOD refactor of `migrateLegacySuppressMultiConfig`).
- `makePerKeyScopedConfig` is importable: `import { makePerKeyScopedConfig } from './notifications.test'` (or wherever Plan 03 places its new tests adjacent to the file).
- A1 inspect() contract is still the foundation for Phase 16's post-DEP-01 migration of an unregistered `featuresPath` key — no rework needed in Plan 03.
