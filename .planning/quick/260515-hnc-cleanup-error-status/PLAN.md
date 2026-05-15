---
id: 260515-hnc
slug: cleanup-error-status
date: 2026-05-15
status: in-progress
---

# Quick Task: Handle behave's `cleanup_error` scenario status

## Problem

`junitWatcher` throws `Unrecognised behave scenario status result "cleanup_error"` when parsing a JUnit file containing a scenario with the `cleanup_error` outcome. Behave emits this status when a cleanup hook (e.g. `after_scenario`, `after_all`) fails — it is semantically a hook/error variant and should be reported as `errored` in the Test Explorer.

## Fix

In `src/parsers/junitParser.ts`, treat `cleanup_error` identically to `hook_error`/`error`:

- Line 89: add `case "cleanup_error":` alongside `"error"` / `"hook_error"` in `updateTest`'s switch.
- Line 103: include `"cleanup_error"` in the `statusOutput` ternary so it logs as `ERROR`.
- Line 111: include `"cleanup_error"` in the ancestor-propagation check so example-row failures bubble up.
- Line 150: add `"cleanup_error"` to the recognized-status guard so it no longer throws.
- Line 155: update the trailing comment to mention `cleanup_error`.
- Line 528: add `case "cleanup_error":` in `reportResult`'s switch.
- Line 541: add `"cleanup_error": 3` to the severity map.

## Verification

- `npx eslint src --ext ts` exits 0 with no output.
- `npm run test:unit` passes.
