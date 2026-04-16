---
status: partial
phase: 03-ux-verification
source: [03-VERIFICATION.md]
started: 2026-04-16T20:30:00.000Z
updated: 2026-04-16T21:15:00.000Z
---

## Current Test

[awaiting human testing — item 1]

## Tests

### 1. Malformed Config Warning Notification (ROADMAP SC-2)
expected: Open a workspace with truly malformed TOML (unclosed bracket). Warning notification appears with "Open Config File" and "Open Settings" buttons. Problems panel shows Warning diagnostic. Tests still appear via convention fallback.
result: [pending]

### 2. Output Channel Discovery Log
expected: Output channel shows discovery source, config file path, and features directory path as separate log lines after activation.
result: passed (verified via "Debug: config-only workspace" — output shows Discovery source: config-file, Config file: ...\behave.ini, Features directory: ...\features)

### 3. Full Integration Test Suite
expected: Run `npm run test` — all integration suites pass including config-only, pyproject-config, malformed-config. Existing example projects unchanged.
result: passed (verified during execution — all 17 suites green, 0 failures)

## Summary

total: 3
passed: 2
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
