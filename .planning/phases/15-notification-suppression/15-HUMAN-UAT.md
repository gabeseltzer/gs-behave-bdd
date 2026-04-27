---
status: partial
phase: 15-notification-suppression
source: [15-VERIFICATION.md, 15-VALIDATION.md]
started: 2026-04-27T19:20:00Z
updated: 2026-04-27T19:20:00Z
deferred_to: Phase 17
---

# Phase 15 Human-UAT — Notification Suppression Infrastructure

These two checks were explicitly deferred to Phase 17 by `15-VALIDATION.md`
(Manual-Only Verifications) at the time the phase was planned. They cannot run
in headless unit/integration test environments — both require launching the
Extension Development Host and observing real VS Code `inspect()` and
notification UI behavior.

## Current Test

[awaiting Phase 17 manual smoke]

## Tests

### 1. End-to-end real-VSCode activation migration with stale settings.json
expected: Open `test/example-projects/multiroot-workspace/<folder>/.vscode/settings.json` after pre-seeding `gs-behave-bdd.suppressMultiConfigNotification: true`. Launch the Extension Development Host. Confirm: (a) `suppressedNotifications: ["multiConfigNotification"]` appears at the same scope, (b) `suppressMultiConfigNotification` key removed at the same scope, (c) no migration UI shown to the user.
result: [pending — Phase 17]
why_human: Requires VSCode Insiders/Stable launch via `@vscode/test-electron`. The Wave 0 A1 probe documents the EXPECTED contract; only real VS Code can confirm `cfg.inspect()` truly returns scope values for an unregistered key whose value still lives in settings.json.

### 2. Live notification flow — Don't Show Again click suppresses key at WorkspaceFolder scope
expected: In Extension Dev Host with multiple behave configs, trigger the Multiple-configs notification, click 'Don't Show Again'. Reload window. Confirm the notification does NOT reappear and `.vscode/settings.json` now contains `"gs-behave-bdd.suppressedNotifications": ["multiConfigNotification"]`.
result: [pending — Phase 17]
why_human: VS Code notification UI cannot be exercised by unit tests; structural and unit tests cover the wiring shape but not the live UX.

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps

(none yet — open Phase 17 to run these checks)
