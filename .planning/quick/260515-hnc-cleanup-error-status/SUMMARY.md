---
id: 260515-hnc
slug: cleanup-error-status
date: 2026-05-15
status: complete
---

# Summary: Handle behave's `cleanup_error` scenario status

## What changed

`src/parsers/junitParser.ts` now recognizes `cleanup_error` (emitted by behave when a cleanup hook fails) and treats it identically to `hook_error` / `error`. Affected locations:

- `updateTest` switch (line ~89) — reports the test as `errored`.
- `statusOutput` ternary (line ~103) — logs as `ERROR`.
- Ancestor-propagation check for outline rows (line ~111).
- Recognized-status guard in `CreateParseResult` (line ~150) — no longer throws on `cleanup_error`.
- `reportResult` switch (line ~528) — reports parent items as `errored`.
- Severity map (line ~541) — `cleanup_error: 3`, same as `hook_error`.

## Verification

- `npx eslint src --ext ts`: clean (exit 0, no output).
- `npm run test:unit`: 876 passing.

## Notes

The error surfaced in the user's `junitWatcher` against `TESTS-printer_license_server.xml` for scenario "Don't accept a biocompatible job". `cleanup_error` is a documented behave status (cleanup hook failure during `after_scenario`/`after_all`); the parser previously hard-failed on it instead of mapping it to an `errored` test result.
