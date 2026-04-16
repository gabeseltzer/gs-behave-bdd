---
status: partial
phase: 04-watcher-run-guard
source: [04-VERIFICATION.md]
started: 2026-04-16T23:30:00.000Z
updated: 2026-04-16T23:30:00.000Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Config file change triggers test tree update
expected: Save behave.ini (or any of the 5 config formats) and observe the VS Code Test Explorer updates within ~1 second without any manual action
result: [pending]

### 2. Config file create/delete lifecycle
expected: Create a new behave.ini in a workspace root and observe the test tree rebuilds automatically; delete it and discovery falls back to convention
result: [pending]

### 3. Run guard warning on malformed config
expected: Click "Run Tests" in a workspace whose config file has a parse error and see a warning popup with "Run Anyway", "Open Config File", and "Cancel" options — the run does not proceed until the user chooses
result: [pending]

### 4. Debug session guard
expected: Click "Debug Tests" in a workspace whose config file has a parse error and see the same warning popup (GUARD-03)
result: [pending]

### 5. Multi-root workspace isolation
expected: In a multi-root workspace, a malformed config in one folder does not block test runs in healthy folders
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
