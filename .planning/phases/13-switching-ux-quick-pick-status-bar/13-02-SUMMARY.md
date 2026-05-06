---
phase: 13-switching-ux-quick-pick-status-bar
plan: 02
subsystem: testing

tags: [unit-tests, mocha, sinon, quick-pick, status-bar]

requires:
  - phase: 13-switching-ux-quick-pick-status-bar
    provides: selectProjectHelpers.ts with buildQuickPickItems and computeStatusBarState

provides:
  - Unit test coverage for Select Project command helpers
  - ThemeIcon mock in vscode.mock.ts

affects: []

tech-stack:
  added: []
  patterns:
    - "Pure function extraction for testing VS Code closure-based code"

key-files:
  created:
    - test/unit/discovery/selectProject.test.ts
  modified:
    - test/unit/vscode.mock.ts

key-decisions:
  - "Extracted pure helper functions rather than testing activate() closures directly"
  - "Added ThemeIcon to vscode.mock.ts for test compatibility"

patterns-established:
  - "Test closures by extracting logic into pure helpers in *Helpers.ts companion modules"

requirements-completed:
  - TEST-02

duration: 8min
completed: 2026-04-23
---

# Phase 13 Plan 02: Unit Tests Summary

**21 unit tests covering quick-pick item building and status bar visibility logic via extracted pure helpers.**

## What Was Built

1. **selectProject.test.ts**: 21 tests in 2 suites:
   - `buildQuickPickItems` (10 tests): item count, active marker (✓ active), root label "(root)", config type in description, full path in detail, buttons array, entry reference, no-active case, empty list, em-dash separator.
   - `computeStatusBarState` (11 tests): hidden for 0/1 projects, hidden for manual mode, hidden for no active, visible for 2+ projects, text format "Behave: <label>", root label, tooltip content (count, hint, active name, config type).

2. **ThemeIcon mock**: Added to vscode.mock.ts for tests using ThemeIcon constructor.

## Task Completion

| Task | Status | Commit |
|------|--------|--------|
| 0: Extract helpers for testability | ✅ Complete | 2c0f811 |
| 1: Write unit tests | ✅ Complete | c72f3e2 |

## Deviations from Plan

- **[Rule 3 - Blocking] Helper extraction**: Plan noted tests might need to extract helpers. Created `src/discovery/selectProjectHelpers.ts` with `buildQuickPickItems` and `computeStatusBarState` pure functions, updated extension.ts to use them.
- **[Rule 3 - Blocking] ThemeIcon mock**: vscode.mock.ts lacked ThemeIcon class. Added minimal mock.

## Verification

- `npm run test:unit` — 655 tests passing (21 new)
- `npx eslint src --ext ts` — clean (exit 0)

## Next Steps

Phase 13 complete. Ready for verification or next phase.
