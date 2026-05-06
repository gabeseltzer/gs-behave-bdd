---
phase: 15
slug: notification-suppression
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-27
validated: 2026-05-04
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 15-RESEARCH.md `## Validation Architecture` section.
> **Validated 2026-05-04:** All 23 mapped tasks have automated tests in the green unit suite (696 passing). Manual-Only item closed by Phase 17 automation (`migrations` integration suite, Tests 5 + 7).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Mocha 9.2.2 + Sinon 21.0.1 |
| **Config file** | `test/unit/.mocharc.cjs`; `test/unit/setup.ts` loads `vscode.mock.ts` |
| **Quick run command** | `npm run test:unit -- --grep "notifications\|suppressedNotifications"` |
| **Full suite command** | `npm run test:unit` |
| **Estimated runtime** | ~5s quick, ~12s full unit suite |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit -- --grep "notifications\|TestWorkspaceConfig\|suppressedNotifications"` (target ≤ 5s)
- **After every plan wave:** Run `npm run test:unit` (full unit suite)
- **Before `/gsd-verify-work`:** `npm test` (lint + compile + unit + integration) must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-01-A1 | 01 | 0 | — | — | N/A — assumption probe | unit | `npx mocha test/unit/notifications.test.ts --grep "A1.*inspect.*unregistered"` | ✅ | ✅ green |
| 15-01-NOTIF-01 | 01 | 1 | NOTIF-01 | — | N/A | unit (schema) | `npm run test:unit -- --grep "suppressedNotifications has correct array schema shape"` | ✅ | ✅ green |
| 15-02-NOTIF-02-check | 02 | 1 | NOTIF-02 | — | N/A | unit | `npx mocha test/unit/notifications.test.ts --grep "isSuppressed"` | ✅ | ✅ green |
| 15-02-NOTIF-02-suppress | 02 | 1 | NOTIF-02 | — | N/A | unit | `npx mocha test/unit/notifications.test.ts --grep "suppressNotification"` | ✅ | ✅ green |
| 15-02-NOTIF-02-dedup | 02 | 1 | NOTIF-02 (D-11) | — | N/A | unit | `npx mocha test/unit/notifications.test.ts --grep "dedup"` | ✅ | ✅ green |
| 15-02-NOTIF-03 | 02 | 1 | NOTIF-03 | — | Write scoped to WorkspaceFolder by default | unit | `npx mocha test/unit/notifications.test.ts --grep "WorkspaceFolder scope"` | ✅ | ✅ green |
| 15-02-NOTIF-04-key | 02 | 2 | NOTIF-04 | — | N/A | unit | `npx mocha test/unit/notifications.test.ts --grep "multiConfigNotification key"` | ✅ | ✅ green |
| 15-02-NOTIF-04-button | 02 | 2 | NOTIF-04 (D-04) | — | Wrapper does NOT leak "Don't Show Again" to caller | unit | `npx mocha test/unit/notifications.test.ts --grep "button passthrough"` | ✅ | ✅ green |
| 15-03-NOTIF-06-folder | 03 | 1 | NOTIF-06 (D-08) | — | Migration writes at exact source scope | unit | `npx mocha test/unit/notifications.test.ts --grep "migrate at WorkspaceFolder"` | ✅ | ✅ green |
| 15-03-NOTIF-06-workspace | 03 | 1 | NOTIF-06 (D-08) | — | Migration writes at exact source scope | unit | `npx mocha test/unit/notifications.test.ts --grep "migrate at Workspace scope"` | ✅ | ✅ green |
| 15-03-NOTIF-06-global | 03 | 1 | NOTIF-06 (D-08) | — | Migration writes at exact source scope | unit | `npx mocha test/unit/notifications.test.ts --grep "migrate at Global"` | ✅ | ✅ green |
| 15-03-NOTIF-06-noop | 03 | 1 | NOTIF-06 | — | `false`/absent → no write | unit | `npx mocha test/unit/notifications.test.ts --grep "migrate no-op"` | ✅ | ✅ green |
| 15-03-NOTIF-06-merge | 03 | 1 | NOTIF-06 (D-11) | — | Migration preserves existing entries | unit | `npx mocha test/unit/notifications.test.ts --grep "migrate merge"` | ✅ | ✅ green |
| 15-03-NOTIF-06-idempotent | 03 | 1 | NOTIF-06 (D-11) | — | Re-running migration is safe (no duplicates) | unit | `npx mocha test/unit/notifications.test.ts --grep "migrate idempotent"` | ✅ | ✅ green |
| 15-03-NOTIF-06-failure | 03 | 1 | NOTIF-06 (D-07) | — | Migration failure logs warn, does not throw | unit | `npx mocha test/unit/notifications.test.ts --grep "migrate failure"` | ✅ | ✅ green |
| 15-04-NOTIF-08 | 04 | 1 | NOTIF-08 | — | N/A | unit | `npm run test:unit -- --grep "TestWorkspaceConfig"` | ✅ | ✅ green |
| 15-04-NOTIF-08-cascade | 04 | 1 | NOTIF-08 | — | All existing settings tests pass after BASE_CFG update | unit | `npm run test:unit -- --grep "settings"` | ✅ | ✅ green |
| 15-05-NOTIF-05 | 05 | 2 | NOTIF-05 | — | Old key absent from schema | unit (schema) | `npm run test:unit -- --grep "legacy.*REMOVED from schema"` | ✅ | ✅ green |
| 15-05-NOTIF-04-wire | 05 | 2 | NOTIF-04 | — | extension.ts L165-L177 calls `showSuppressibleNotification("multiConfigNotification", ...)` | unit (extension flow) | `npm run test:unit -- --grep "extension.*multiConfigNotification"` | ✅ | ✅ green |
| 15-05-activation | 05 | 2 | NOTIF-06 + D-05 | — | `migrateLegacySuppressMultiConfig` called in activate() before notification fires | unit (activate flow) | `npm run test:unit -- --grep "activate.*migration order"` | ✅ | ✅ green |
| 15-06-NOTIF-07 | 06 | 3 | NOTIF-07 | — | All check/suppress/migrate paths green | unit (composite) | `npm run test:unit -- --grep "notifications"` | ✅ | ✅ green |
| 15-06-full-suite | 06 | 3 | All NOTIF-* | — | Full unit suite green; no regressions | unit (full) | `npm run test:unit` | ✅ | ✅ green (696 passing) |
| 15-06-lint | 06 | 3 | — | — | Lint clean | lint | `npx eslint src --ext ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `test/unit/notifications.test.ts` — created. Stubs and templates for NOTIF-02, NOTIF-03, NOTIF-04 (button passthrough), NOTIF-06 (eight sub-cases), NOTIF-07 all in place using inline `makeConfig` pattern (Pitfall #5 honored — no `TestWorkspaceConfig` for migration scope tests).
- [x] Schema validation — `test/unit/packageJsonSchema.test.ts` covers NOTIF-01 (correct array shape) + NOTIF-05 (legacy key REMOVED).
- [x] Existing `test/unit/settings/*.test.ts` cascade updated:
  - `suppressMultiConfigNotification` removed from BASE_CFG / `makeFakeWkspSettings`
  - `suppressedNotifications: []` present where required
- [x] Wave 0 probe for **Assumption A1** — `inspect()` of unregistered key with `settings.json` value returns `globalValue` / `workspaceValue` / `workspaceFolderValue`. Two probe tests green; gates the schema-removal task in Wave 2 (now satisfied).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Status |
|----------|-------------|------------|--------|
| ~~End-to-end activation migration in real VSCode host~~ | NOTIF-06 cross-cutting | ~~Required real workspace + VSCode launch~~ | **CLOSED by Phase 17 automation** — `test/integration/migrations suite/extension.test.ts` Tests 1-3 + 7 cover scope-correct post-state, legacy-key removal, no-UI assertion, and the A1 inspect contract on a real Extension Development Host launch via `@vscode/test-electron`. See `15-HUMAN-UAT.md`. |

*All phase behaviors now have automated verification (unit + real-VSCode integration).*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (notifications.test.ts + settings test cascade + A1 probe)
- [x] No watch-mode flags
- [x] Feedback latency < 30s (quick) / < 60s (full unit) — observed ~5s / ~12s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete (2026-05-04)

---

## Validation Audit 2026-05-04

| Metric | Count |
|--------|-------|
| Tasks audited | 23 |
| Gaps found | 0 |
| Resolved | 0 (n/a — all tasks already covered) |
| Escalated | 0 |
| Manual-only items | 1 → 0 (closed by Phase 17 automation) |

**Method:** Read existing 15-VALIDATION.md per-task map; cross-referenced each row's `Automated Command` against the Phase 15 + Phase 16 test descriptions in `test/unit/notifications.test.ts` and `test/unit/packageJsonSchema.test.ts`. Ran `npm run test:unit` — all 696 tests green, including every grep target in the verification map. The single Manual-Only item is now closed by the Phase 17 `migrations` integration suite (registered in `test/integration/runTestSuites.ts`, runs against `example-projects/migration-stale` fixture).

**Outcome:** Phase 15 is Nyquist-compliant. No test files generated, no escalations.
