---
phase: 10
slug: featurespaths-user-facing-setting
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Mocha 9.2.2 + Sinon 21.0.1 |
| **Config file** | `test/tsconfig.json` |
| **Quick run command** | `npm run test:unit` |
| **Full suite command** | `npm run test:unit` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit`
- **After every plan wave:** Run `npx eslint src --ext ts && npm run test:unit`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | MP-03a | unit | `npm run test:unit` | ✅ (Phase 7 tests) | ⬜ pending |
| 10-01-02 | 01 | 1 | MP-03b,c,d,e | unit | `npm run test:unit` | ❌ W0 (new tests) | ⬜ pending |
| 10-02-01 | 02 | 1 | MP-03a | manifest | `npx eslint src --ext ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Unit tests for "both set" info log (fires when both `featuresPath` and `featuresPaths` explicit)
- [ ] Unit tests for "both set" info log NOT firing when only plural is set
- [ ] Unit tests for `hasExplicitNonEmptyArraySetting` — non-empty array true, empty array false, undefined false
- [ ] Unit test verifying `TestWorkspaceConfig.get("featuresPaths")` returns `[]` when not set (post-declaration default)

*Existing Phase 7 TEST-12 unit tests already cover precedence matrix (plural/singular/both/neither/empty array).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| VS Code Settings UI renders `featuresPaths` with "Add Item" widget | MP-03 | UI rendering by VS Code host | Open Settings, search "featuresPaths", verify array widget appears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
