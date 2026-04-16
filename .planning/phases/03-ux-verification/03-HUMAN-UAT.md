---
status: partial
phase: 03-ux-verification
source: [03-VERIFICATION.md]
started: 2026-04-16T20:30:00.000Z
updated: 2026-04-16T20:30:00.000Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Malformed Config Warning Notification (ROADMAP SC-2)
expected: Open a workspace with truly malformed TOML (unclosed bracket). Warning notification appears with "Open Config File" and "Open Settings" buttons. Problems panel shows Warning diagnostic. Tests still appear via convention fallback.
result: [pending]

### 2. Status Bar Hover Tooltip
expected: Open a .feature file in a config-only workspace. Hover over "Behave: Ready" status bar item. Tooltip shows Source, Config, and Features path.
result: [pending]

### 3. Output Channel Discovery Log
expected: Check the Behave BDD output channel for "Discovered via config-file (behave.ini): /path" line after activation.
result: [pending]

### 4. Full Integration Test Suite
expected: Run `npm run test` — all integration suites pass including config-only, pyproject-config, malformed-config. Existing example projects unchanged.
result: passed (verified during execution — all 17 suites green, 0 failures)

## Summary

total: 4
passed: 1
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
