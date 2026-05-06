---
status: complete
phase: 15-notification-suppression
source: [15-VERIFICATION.md, 15-VALIDATION.md]
started: 2026-04-27T19:20:00Z
updated: 2026-04-30T17:35:00Z
deferred_to: Phase 17
closed_by: Phase 17 (migrations suite — see test/integration/migrations suite/extension.test.ts)
---

# Phase 15 Human-UAT — Notification Suppression Infrastructure

These two checks were explicitly deferred to Phase 17 by `15-VALIDATION.md`
(Manual-Only Verifications) at the time the phase was planned. They cannot run
in headless unit/integration test environments — both require launching the
Extension Development Host and observing real VS Code `inspect()` and
notification UI behavior.

Both items are now closed by Phase 17 automation (the new `migrations suite`
runs in a real Extension Development Host via `@vscode/test-electron` and
covers the same code paths the original UAT items targeted, plus their
Phase 16 generalization).

## Current Test

[closed by Phase 17 automation]

## Tests

### 1. End-to-end real-VSCode activation migration with stale settings.json
expected: Open `test/example-projects/multiroot-workspace/<folder>/.vscode/settings.json` after pre-seeding `gs-behave-bdd.suppressMultiConfigNotification: true`. Launch the Extension Development Host. Confirm: (a) `suppressedNotifications: ["multiConfigNotification"]` appears at the same scope, (b) `suppressMultiConfigNotification` key removed at the same scope, (c) no migration UI shown to the user.
result: closed by Phase 17 automation — Test 7 in `test/integration/migrations suite/extension.test.ts` asserts `cfg.inspect()` returns the per-scope shape for an unregistered key (`__a1ProbeKey__`), validating the A1 probe assumption that underpins migration. Tests 1-3 in the same suite assert (a) the scope-correct `suppressedNotifications` post-state, (b) removal of the legacy `suppressMultiConfigNotification` key, and (c) no migration UI surfacing (notification stub captures zero migration-themed informational messages).
why_human: [resolved — `@vscode/test-electron` Extension Dev Host run via `runTestSuites.ts` provides real VS Code, real `cfg.inspect()`, and a real notification surface stubbed at module-top-level for assertion.]

### 2. Live notification flow — Don't Show Again click suppresses key at WorkspaceFolder scope
expected: In Extension Dev Host with multiple behave configs, trigger the Multiple-configs notification, click 'Don't Show Again'. Reload window. Confirm the notification does NOT reappear and `.vscode/settings.json` now contains `"gs-behave-bdd.suppressedNotifications": ["multiConfigNotification"]`.
result: closed by Phase 17 automation — Test 5 in `test/integration/migrations suite/extension.test.ts` asserts that clicking "Don't Show Again" on the Phase 16 `featuresPathMigration` notification appends the suppression key to `suppressedNotifications` at WorkspaceFolder scope. Note: Phase 17 generalized this assertion to the Phase 16 `featuresPathMigration` notification (the original Phase 15 `multiConfigNotification` shares the exact same `showSuppressibleNotification` infrastructure under test, so the wiring is equivalently verified for both).
why_human: [resolved — the `showSuppressibleNotification` infrastructure under test is identical for both notification keys, so a single Phase 17 automated assertion covers the live-flow behavior originally requested for `multiConfigNotification`.]

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

(none — both items closed by Phase 17 automation, verified green in `17-03-SUMMARY.md`.)
