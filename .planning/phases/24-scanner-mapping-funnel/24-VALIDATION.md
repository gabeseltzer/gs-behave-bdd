---
phase: 24
slug: scanner-mapping-funnel
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-16
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Mocha 9.2.2 + Sinon 21 (vscode require-hook mock via `test/unit/setup.ts`) |
| **Config file** | `.mocharc.json` (unit tier) |
| **Quick run command** | `npm run test:unit` |
| **Full suite command** | `npx eslint src --ext ts && npm run test:unit` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit`
- **After every plan wave:** Run `npx eslint src --ext ts && npm run test:unit`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 24-01-01 | 01 | 1 | REFS-01..03 (foundation) | T-24-01 | Scanner regexes are linear (no catastrophic backtracking) | unit | `npm run test:unit` | ❌ W0 (test file created in-plan) | ⬜ pending |
| 24-01-02 | 01 | 1 | REFS-01..03 (foundation) | — | N/A | unit | `npm run test:unit` | ❌ W0 (test file created in-plan) | ⬜ pending |
| 24-02-01 | 02 | 2 | REFS-01, REFS-02, REFS-03, REFS-04 | — | N/A | unit | `npm run test:unit` | ❌ W0 (test file created in-plan) | ⬜ pending |
| 24-02-02 | 02 | 2 | REFS-01..03 | — | N/A | unit | `npm run test:unit` | ❌ W0 (test file created in-plan) | ⬜ pending |
| 24-03-01 | 03 | 3 | REFS-01..04 (wiring) | — | N/A | unit | `npm run test:unit` (full existing suite green = REFS-04) | ✅ | ⬜ pending |
| 24-03-02 | 03 | 3 | REFS-01..04 (wiring) | — | N/A | unit | `npm run test:unit` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — Mocha/Sinon unit tier and the vscode mock already exist; new suites (`test/unit/parsers/executeStepsParser.test.ts`, `test/unit/parsers/executeStepsMappings.test.ts`) follow the established real-module + unique-fake-URI isolation pattern from `stepMappingRegexCache.test.ts`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CodeLens count / references tree in a live editor | REFS-01..03 | Real-VSCode surfaces; automated integration coverage lands in Phase 27 | F5 dev host on a workspace with an execute_steps call; check step-def CodeLens count and Find All Step References include the call site |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (new test files are created within their own plans' tasks)
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-16 (plan-checker pass: 0 blockers; warnings resolved)
