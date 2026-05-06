---
phase: 04
slug: watcher-run-guard
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-17
reconstructed_from_artifacts: true
---

# Phase 04 — Validation Strategy

> Per-phase validation contract. Reconstructed retroactively after phase completion
> because `nyquist_validation` was disabled at plan-phase time. All gaps have been
> filled via `/gsd-validate-phase`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Mocha 9.2.2 + Sinon 21.0.1 (fake timers) |
| **Config file** | `test/tsconfig.json` |
| **Quick run command** | `npm run test:unit` |
| **Full suite command** | `npm run test:unit` |
| **Estimated runtime** | ~13 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit`
- **After every plan wave:** Run `npm run test:unit`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | WATCH-01 | T-04-01 | Watcher glob covers all 5 behave config filenames (no silent file-type drop) | unit | `npm run test:unit` | ✅ | ✅ green |
| 04-01-01 | 01 | 1 | WATCH-02 | — | All three events (create/change/delete) route through debounced handler | unit | `npm run test:unit` | ✅ | ✅ green |
| 04-01-01 | 01 | 1 | WATCH-03 | T-04-02 | 500ms debounce prevents re-parse storm from rapid filesystem events | unit | `npm run test:unit` | ✅ | ✅ green |
| 04-01-01 | 01 | 1 | WATCH-04 | — | Re-discovery is silent — no notification popup on normal changes | unit | `npm run test:unit` | ✅ | ✅ green |
| 04-01-01 | 01 | 1 | WATCH-05 | — | `startWatchingConfigFiles` returns watcher array with callable `dispose()` (unit-testable portion) | unit | `npm run test:unit` | ✅ | ✅ green |
| 04-01-01 | 01 | 1 | WATCH-06 | — | `onConfigChanged` called with `clearNotifiedErrors=true` — fix-then-break cycles re-notify | unit | `npm run test:unit` | ✅ | ✅ green |
| 04-01-02 | 01 | 1 | TEST-07 | — | 11 unit tests cover debounce timing, independent timers, all 3 events, clear, URI scheme filter, glob, silence, dispose, clearNotifiedErrors | unit | `npm run test:unit` | ✅ | ✅ green |
| 04-02-01 | 02 | 1 | GUARD-01 | T-04-04 | `checkRunGuard` reads `configError` from `getDiscoveryEntry` before creating TestRun | unit | `npm run test:unit` | ✅ | ✅ green |
| 04-02-01 | 02 | 1 | GUARD-02 | T-04-05 | Warning dialog shows exactly three buttons: Run Anyway / Open Config File / Cancel | unit | `npm run test:unit` | ✅ | ✅ green |
| 04-02-01 | 02 | 1 | GUARD-03 | — | Guard fires for debug=true sessions and cancels before TestRun is created | unit | `npm run test:unit` | ✅ | ✅ green |
| 04-02-01 | 02 | 1 | GUARD-04 | — | Guard checks only workspaces whose tests are actually queued | unit | `npm run test:unit` | ✅ | ✅ green |
| 04-02-02 | 02 | 1 | TEST-09 | — | 9 unit tests cover all `checkRunGuard` response paths and workspace scoping | unit | `npm run test:unit` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure (Mocha + Sinon + vscode.mock) covers all phase requirements.
No Wave 0 scaffolding was needed; `test/unit/vscode.mock.ts` was extended during Plan 01
execution to add `createFileSystemWatcher` and `RelativePattern` stubs.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Watcher dispose actually stops future events | WATCH-05 (full contract) | Unit test mocks capture handler refs; mock `dispose()` does not unsubscribe. Behavior is part of VS Code's `FileSystemWatcher` API contract and only verifiable against a real watcher. | Open a VS Code workspace with a behave config, trigger a workspace folder change, then save the config file — confirm re-discovery fires only via the recreated watcher. Covered operationally by TEST-08 in Phase 5 (integration). |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-17 (reconstructed and gap-filled)

---

## Validation Audit 2026-04-17

| Metric | Count |
|--------|-------|
| Gaps found | 6 |
| Resolved | 6 |
| Escalated to manual-only | 1 (WATCH-05 dispose-stops-events portion only) |

**Tests added:**
- `test/unit/watchers/configWatcher.test.ts` — WATCH-01 glob, WATCH-04 silent, WATCH-05 dispose-callable, WATCH-06 clearNotifiedErrors
- `test/unit/runners/testRunHandler.test.ts` — GUARD-03 debug path

**Before:** 539 passing · **After:** 544 passing · 0 failures.
