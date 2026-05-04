---
phase: 16
slug: deprecate-featurespath
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-28
validated: 2026-05-04
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> **Reconstructed and validated 2026-05-04** from the per-plan SUMMARYs and `16-VERIFICATION.md`. Original draft was a template stub never filled during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Mocha 9.2.2 + Sinon 21.0.1 |
| **Config file** | `test/unit/.mocharc.cjs`; `test/unit/setup.ts` loads `vscode.mock.ts` |
| **Quick run command** | `npm run test:unit -- --grep "Phase 16\|featuresPath\|migrateScopedSetting\|migrateLegacyFeaturesPath"` |
| **Full suite command** | `npm run test:unit` |
| **Estimated runtime** | ~5s quick, ~12s full unit suite |

---

## Sampling Rate

- **After every task commit:** Run quick command above
- **After every plan wave:** Run `npm run test:unit` (full unit suite)
- **Before `/gsd-verify-work`:** `npm test` (lint + compile + unit + integration) must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Decision Refs | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|---------------|-----------------|-----------|-------------------|-------------|--------|
| 16-01-preflight | 01 | 1 | DEP-07 (prep) | — | Pre-flight publisher + baseline pass count + A1 probe; export `makePerKeyScopedConfig` | unit | `npm run test:unit -- --grep "makePerKeyScopedConfig\|A1.*inspect"` | ✅ | ✅ green |
| 16-02-primitive-write | 02 | 2 | DEP-07 | D-MOD | `migrateScopedSetting` writes dest then removes source | unit | `npm run test:unit -- --grep "migrateScopedSetting.*kind:'write'"` | ✅ | ✅ green |
| 16-02-primitive-skipDest-remove | 02 | 2 | DEP-07 | D-MOD, D-08 | `kind:'skipDest'` + `removeSource:true` removes source only (Phase 16 blank-string path) | unit | `npm run test:unit -- --grep "skipDest.*removeSource:true"` | ✅ | ✅ green |
| 16-02-primitive-skipDest-noop | 02 | 2 | DEP-07 | D-MOD | `kind:'skipDest'` + `removeSource:false` no-ops (Phase 15 legacyValue!==true contract) | unit | `npm run test:unit -- --grep "skipDest.*removeSource:false"` | ✅ | ✅ green |
| 16-02-primitive-regression | 02 | 2 | DEP-07 | D-MOD | Phase 15 8 sub-cases still pass after delegation refactor | unit | `npm run test:unit -- --grep "migrateLegacySuppressMultiConfig"` | ✅ | ✅ green (8/8) |
| 16-03-DEP-02-case-a | 03 | 3 | DEP-02, DEP-03 | D-01, D-03 | gs-behave-bdd singular at WorkspaceFolder migrates + removes legacy | unit | `npm run test:unit -- --grep "case a"` | ✅ | ✅ green |
| 16-03-DEP-02-case-b | 03 | 3 | DEP-02, DEP-03 | D-01, D-03 | gs-behave-bdd singular at Workspace scope | unit | `npm run test:unit -- --grep "case b"` | ✅ | ✅ green |
| 16-03-DEP-02-case-c | 03 | 3 | DEP-02, DEP-03 | D-01, D-03 | gs-behave-bdd singular at Global scope | unit | `npm run test:unit -- --grep "case c"` | ✅ | ✅ green |
| 16-03-DEP-02-case-d | 03 | 3 | DEP-02 | D-02 | behave-vsc singular migrates to canonical gs-behave-bdd.featuresPaths | unit | `npm run test:unit -- --grep "case d"` | ✅ | ✅ green |
| 16-03-DEP-02-case-e1 | 03 | 3 | DEP-02 | D-06 | Singular AND plural at same scope merge | unit | `npm run test:unit -- --grep "case e1"` | ✅ | ✅ green |
| 16-03-DEP-02-case-e2 | 03 | 3 | DEP-02 | D-07 | Singular "/main/" dedupes against existing ["main"] post-normalization | unit | `npm run test:unit -- --grep "case e2"` | ✅ | ✅ green |
| 16-03-DEP-02-case-f | 03 | 3 | DEP-02 | D-04 | Cross-scope independence: gs-behave-bdd at WF + behave-vsc at WS migrate independently | unit | `npm run test:unit -- --grep "case f"` | ✅ | ✅ green |
| 16-03-DEP-02-case-g1 | 03 | 3 | DEP-02 | D-08 | Empty-string singular: skip dest write, remove legacy | unit | `npm run test:unit -- --grep "case g1"` | ✅ | ✅ green |
| 16-03-DEP-02-case-g2 | 03 | 3 | DEP-02 | D-08 | Whitespace-only singular: skip dest write, remove legacy | unit | `npm run test:unit -- --grep "case g2"` | ✅ | ✅ green |
| 16-03-DEP-02-case-h | 03 | 3 | DEP-02 | D-09 | "." migrates literally — downstream guard handles fatal error | unit | `npm run test:unit -- --grep "case h"` | ✅ | ✅ green |
| 16-03-DEP-02-case-i | 03 | 3 | DEP-02 | D-01 | No legacy value at any scope in either namespace — no-op returns false | unit | `npm run test:unit -- --grep "case i"` | ✅ | ✅ green |
| 16-03-DEP-02-case-j | 03 | 3 | DEP-02 | D-05 | Update rejection: logs via logInfo, does NOT throw, returns false | unit | `npm run test:unit -- --grep "case j"` | ✅ | ✅ green |
| 16-04-DEP-02-wire-D-18 | 04 | 4 | DEP-02 | D-18 | activate(): migrateLegacyFeaturesPath precedes migrateLegacySuppressMultiConfig | unit (structural) | `npm run test:unit -- --grep "D-18.*activate"` | ✅ | ✅ green |
| 16-04-DEP-04-notification | 04 | 4 | DEP-04 | D-13 | Post-loop notification uses suppression key "featuresPathMigration" | unit (structural) | `npm run test:unit -- --grep "D-13.*post-loop notification"` | ✅ | ✅ green |
| 16-05-DEP-01-schema | 05 | 4 | DEP-01 | D-15..D-17 | Singular featuresPath absent from package.json schema | unit (schema) | `npm run test:unit -- --grep "legacy singular featuresPath key REMOVED"` | ✅ | ✅ green (added 2026-05-04) |
| 16-05-DEP-05-plural-only | 05 | 4 | DEP-05 | D-16 | Source-tree reads only `featuresPaths[]` — multiPathPrecedence + plural cascade | unit | `npm run test:unit -- --grep "Rung 1: plural set\|featuresPaths"` | ✅ | ✅ green |
| 16-05-DEP-06-mock | 05 | 4 | DEP-06 | — | TestWorkspaceConfig mock: only plural surface | unit | `npm run test:unit -- --grep "TestWorkspaceConfig featuresPaths default"` | ✅ | ✅ green |
| 16-06-DEP-05-cascade | 06 | 5 | DEP-05, DEP-06 | — | Test fixture cascade across 6 settings test files | unit | `npm run test:unit -- --grep "settings"` | ✅ | ✅ green |
| 16-06-DEP-07-aggregate | 06 | 5 | DEP-07 | — | Migration test suite count + Phase 15 D-MOD regression bar | unit | `npm run test:unit -- --grep "Phase 15\|Phase 16"` | ✅ | ✅ green |
| 16-06-full-suite | 06 | 5 | All DEP-* | — | Full unit suite green; no regressions | unit (full) | `npm run test:unit` | ✅ | ✅ green (697 passing) |
| 16-06-lint | 06 | 5 | — | — | Lint clean | lint | `npx eslint src --ext ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `test/unit/notifications.test.ts` extended with `Phase 16 — notifications: migrateScopedSetting (D-MOD primitive)` suite (4+ tests).
- [x] `test/unit/notifications.test.ts` extended with `Phase 16 — notifications: migrateLegacyFeaturesPath (DEP-02, DEP-03)` suite covering wrapper cases (a)-(j) — 12 tests.
- [x] `test/unit/notifications.test.ts` extended with `Phase 16 — activation order and notification structural tests (D-18, D-13, D-12, Pitfall 8)` suite — 2 structural tests.
- [x] `test/unit/packageJsonSchema.test.ts` extended with DEP-01 schema-absence test (added 2026-05-04 during this audit — fills the only gap).
- [x] Settings cascade fixture updates across 6 test files (Plan 06).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Status |
|----------|-------------|------------|--------|
| ~~End-to-end migration UX in real VSCode host~~ | DEP-02, DEP-04 cross-cutting | ~~Required real workspace + Extension Dev Host launch~~ | **CLOSED by Phase 17 automation** — `test/integration/migrations suite/extension.test.ts` covers `featuresPath` → `featuresPaths` migration in real VS Code (Tests 1-3, 5, 7) including the DSA flow on `featuresPathMigration`. |

*All phase behaviors now have automated verification (unit + real-VSCode integration).*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (notifications.test.ts Phase 16 suites + packageJsonSchema.test.ts DEP-01)
- [x] No watch-mode flags
- [x] Feedback latency < 30s (quick) / < 60s (full unit) — observed ~5s / ~12s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete (2026-05-04)

---

## Validation Audit 2026-05-04

| Metric | Count |
|--------|-------|
| Tasks audited | 26 |
| Gaps found | 1 |
| Resolved | 1 (DEP-01 schema-absence test added inline) |
| Escalated | 0 |
| Manual-only items | 1 → 0 (closed by Phase 17 automation) |

**Method:** Phase 16's original `16-VALIDATION.md` was a template stub never filled during execution. Reconstructed the per-task map from `16-VERIFICATION.md`, the per-plan SUMMARYs (16-01..16-06), and per-plan PLAN frontmatter `requirements:` lists. Cross-referenced each row's automated command against suite test descriptions in `test/unit/notifications.test.ts` and `test/unit/packageJsonSchema.test.ts`.

**Gap fix:** Added `legacy singular featuresPath key REMOVED from schema (DEP-01)` test to `test/unit/packageJsonSchema.test.ts` — symmetric to existing NOTIF-05 absence test. Asserts singular key is absent and plural key remains present. Suite went from 696 → 697 passing.

**Outcome:** Phase 16 is Nyquist-compliant. 1 test added, no escalations.
