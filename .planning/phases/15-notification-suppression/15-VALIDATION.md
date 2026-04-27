---
phase: 15
slug: notification-suppression
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-27
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 15-RESEARCH.md `## Validation Architecture` section.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Mocha 9.2.2 + Sinon 21.0.1 |
| **Config file** | `test/unit/.mocharc.cjs`; `test/unit/setup.ts` loads `vscode.mock.ts` |
| **Quick run command** | `npm run test:unit -- --grep "notifications\|suppressedNotifications"` |
| **Full suite command** | `npm run test:unit` |
| **Estimated runtime** | ~5s quick, ~30s full unit suite |

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
| 15-01-A1 | 01 | 0 | — | — | N/A — assumption probe | unit | `npx mocha test/unit/notifications.test.ts --grep "A1.*inspect.*unregistered"` | ❌ W0 | ⬜ pending |
| 15-01-NOTIF-01 | 01 | 1 | NOTIF-01 | — | N/A | unit (schema) | `node -e "const p=require('./package.json'); const s=p.contributes.configuration.properties['gs-behave-bdd.suppressedNotifications']; if(s.type!=='array'\|\|s.items.type!=='string'\|\|!Array.isArray(s.default)\|\|s.default.length!==0) process.exit(1)"` | ❌ W0 | ⬜ pending |
| 15-02-NOTIF-02-check | 02 | 1 | NOTIF-02 | — | N/A | unit | `npx mocha test/unit/notifications.test.ts --grep "isSuppressed"` | ❌ W0 | ⬜ pending |
| 15-02-NOTIF-02-suppress | 02 | 1 | NOTIF-02 | — | N/A | unit | `npx mocha test/unit/notifications.test.ts --grep "suppressNotification"` | ❌ W0 | ⬜ pending |
| 15-02-NOTIF-02-dedup | 02 | 1 | NOTIF-02 (D-11) | — | N/A | unit | `npx mocha test/unit/notifications.test.ts --grep "dedup"` | ❌ W0 | ⬜ pending |
| 15-02-NOTIF-03 | 02 | 1 | NOTIF-03 | — | Write scoped to WorkspaceFolder by default | unit | `npx mocha test/unit/notifications.test.ts --grep "WorkspaceFolder scope"` | ❌ W0 | ⬜ pending |
| 15-02-NOTIF-04-key | 02 | 2 | NOTIF-04 | — | N/A | unit | `npx mocha test/unit/notifications.test.ts --grep "multiConfigNotification key"` | ❌ W0 | ⬜ pending |
| 15-02-NOTIF-04-button | 02 | 2 | NOTIF-04 (D-04) | — | Wrapper does NOT leak "Don't Show Again" to caller | unit | `npx mocha test/unit/notifications.test.ts --grep "button passthrough"` | ❌ W0 | ⬜ pending |
| 15-03-NOTIF-06-folder | 03 | 1 | NOTIF-06 (D-08) | — | Migration writes at exact source scope | unit | `npx mocha test/unit/notifications.test.ts --grep "migrate.*WorkspaceFolder"` | ❌ W0 | ⬜ pending |
| 15-03-NOTIF-06-workspace | 03 | 1 | NOTIF-06 (D-08) | — | Migration writes at exact source scope | unit | `npx mocha test/unit/notifications.test.ts --grep "migrate.*Workspace$"` | ❌ W0 | ⬜ pending |
| 15-03-NOTIF-06-global | 03 | 1 | NOTIF-06 (D-08) | — | Migration writes at exact source scope | unit | `npx mocha test/unit/notifications.test.ts --grep "migrate.*Global"` | ❌ W0 | ⬜ pending |
| 15-03-NOTIF-06-noop | 03 | 1 | NOTIF-06 | — | `false`/absent → no write (no spurious user-visible config churn) | unit | `npx mocha test/unit/notifications.test.ts --grep "migrate.*no-op"` | ❌ W0 | ⬜ pending |
| 15-03-NOTIF-06-merge | 03 | 1 | NOTIF-06 (D-11) | — | Migration preserves existing entries | unit | `npx mocha test/unit/notifications.test.ts --grep "migrate.*merge"` | ❌ W0 | ⬜ pending |
| 15-03-NOTIF-06-idempotent | 03 | 1 | NOTIF-06 (D-11) | — | Re-running migration is safe (no duplicates) | unit | `npx mocha test/unit/notifications.test.ts --grep "migrate.*idempotent"` | ❌ W0 | ⬜ pending |
| 15-03-NOTIF-06-failure | 03 | 1 | NOTIF-06 (D-07) | — | Migration failure logs warn, does not throw, does not show user notification | unit | `npx mocha test/unit/notifications.test.ts --grep "migrate.*failure"` | ❌ W0 | ⬜ pending |
| 15-04-NOTIF-08 | 04 | 1 | NOTIF-08 | — | N/A | unit | `npx mocha test/unit/settings/multiPathPrecedence.test.ts --grep "TestWorkspaceConfig suppressedNotifications"` | ❌ W0 | ⬜ pending |
| 15-04-NOTIF-08-cascade | 04 | 1 | NOTIF-08 | — | All existing settings tests still pass after BASE_CFG update | unit | `npm run test:unit -- --grep "settings"` | ✅ existing | ⬜ pending |
| 15-05-NOTIF-05 | 05 | 2 | NOTIF-05 | — | Old key absent from schema | unit (schema) | `node -e "const p=require('./package.json'); if('gs-behave-bdd.suppressMultiConfigNotification' in p.contributes.configuration.properties) process.exit(1)"` | ❌ W0 | ⬜ pending |
| 15-05-NOTIF-04-wire | 05 | 2 | NOTIF-04 | — | extension.ts L141-L181 calls `showSuppressibleNotification("multiConfigNotification", ...)` | unit (extension flow) | `npx mocha test/unit/notifications.test.ts --grep "extension.*multiConfigNotification"` | ❌ W0 | ⬜ pending |
| 15-05-activation | 05 | 2 | NOTIF-06 + D-05 | — | `migrateLegacySuppressMultiConfig` called in activate() before notification fires | unit (activate flow) | `npx mocha test/unit/notifications.test.ts --grep "activate.*migration order"` | ❌ W0 | ⬜ pending |
| 15-06-NOTIF-07 | 06 | 3 | NOTIF-07 | — | All check/suppress/migrate paths green | unit (composite) | `npm run test:unit -- --grep "notifications"` | ❌ W0 | ⬜ pending |
| 15-06-full-suite | 06 | 3 | All NOTIF-* | — | Full unit suite green; no regressions | unit (full) | `npm run test:unit` | ✅ existing | ⬜ pending |
| 15-06-lint | 06 | 3 | — | — | Lint clean | lint | `npx eslint src --ext ts` | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/unit/notifications.test.ts` — new test file. Stubs and template scaffolding for NOTIF-02, NOTIF-03, NOTIF-04 (button passthrough), NOTIF-06 (six sub-cases including merge / idempotent / failure / no-op), NOTIF-07. Use the `makeConfig` inline pattern (see `test/unit/settings/multiPathPrecedence.test.ts` L22-L70) for scope-aware `inspect()`/`update()` mocking — DO NOT use `TestWorkspaceConfig` for migration scope tests (see Pitfall #5).
- [ ] Schema validation — inline `node -e` checks for NOTIF-01 and NOTIF-05. May live as a small `test/unit/packageJsonSchema.test.ts`.
- [ ] Update existing `test/unit/settings/*.test.ts` files (`multiPathPrecedence.test.ts`, `verboseLogging.test.ts`, `projectUriDerivation.test.ts`, `logSettingsPlural.test.ts`):
  - Remove `suppressMultiConfigNotification` from BASE_CFG / makeFakeWkspSettings
  - Add `suppressedNotifications: []` where required
- [ ] Wave 0 probe for **Assumption A1**: confirm `cfg.inspect("suppressMultiConfigNotification")` returns `globalValue`/`workspaceValue`/`workspaceFolderValue` for an unregistered key that still has a value in `settings.json`. Probe lives in `test/unit/notifications.test.ts` and gates the schema-removal task in Wave 2.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end activation migration in real VSCode host (deferred to Phase 17) | NOTIF-06 cross-cutting | Requires real workspace with stale `suppressMultiConfigNotification: true` in `.vscode/settings.json` and a real VSCode launch | Open `test/example-projects/multiroot-workspace/`, set `gs-behave-bdd.suppressMultiConfigNotification: true` in one folder's `.vscode/settings.json`, launch Extension Development Host, confirm: (a) `suppressedNotifications: ["multiConfigNotification"]` appears at same scope, (b) old key gone, (c) no user-facing notification of migration |

*All other phase behaviors have automated unit-test verification via `notifications.test.ts`.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (notifications.test.ts + settings test cascade + A1 probe)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (quick) / < 60s (full unit)
- [ ] `nyquist_compliant: true` set in frontmatter (after Wave 0 completes)

**Approval:** pending
