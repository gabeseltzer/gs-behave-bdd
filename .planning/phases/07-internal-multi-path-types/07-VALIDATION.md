---
phase: 7
slug: internal-multi-path-types
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Mocha 9.2.2 + Sinon 21.0.1 |
| **Config file** | `test/unit/.mocharc.json` (existing; no changes) |
| **Quick run command** | `npm run test:unit -- --grep "TEST-12"` |
| **Full suite command** | `npm run test:unit` |
| **Lint command** | `npx eslint src --ext ts` (CLAUDE.md mandate) |
| **Type-check command** | `npx tsc --noEmit` |
| **Estimated runtime** | ~10–20 seconds (unit suite) |

---

## Sampling Rate

- **After every task commit:** `npx eslint src --ext ts` + `npm run test:unit -- --grep "<feature>"` scoped to tests added in that commit.
- **After every commit pair (configParser+common, etc.):** `npm run test:unit` full suite + `npm run compile` (catches TS strict-mode errors).
- **Before `/gsd-verify-work`:** Full unit suite green + `npx eslint src --ext ts` clean + `npm run compile` clean. Integration suite sampled once as non-regression check.
- **Max feedback latency:** ~20 seconds (unit suite runtime).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 7-01-01 | 01 | 1 | MP-02 | — | `resolvedPath` → `resolvedPaths: Uri[]` on `BehaveConfigResult` | unit | `npm run test:unit -- --grep "resolvedPaths"` | ❌ W0 — update `test/unit/parsers/configParser.test.ts:148-166` | ⬜ pending |
| 7-01-02 | 01 | 1 | MP-02, TEST-12 | V5 | Windows backslash normalization in `resolvePaths` (D-10) | unit | `npm run test:unit -- --grep "Windows backslash"` | ❌ W0 — new cases in `configParser.test.ts` | ⬜ pending |
| 7-02-01 | 02 | 1 | MP-02 | — | `DiscoveryEntry.featuresUri` → `featuresUris: Uri[]` (length-1 in all single-path branches) | compile | `npx tsc --noEmit` | ✅ built-in | ⬜ pending |
| 7-02-02 | 02 | 1 | MP-02 | — | `getFeaturesRootForFile(wkspSettings, fileUri)` module helper (D-09) | unit | `npm run test:unit -- --grep "getFeaturesRootForFile"` | ❌ W0 — new file `test/unit/common/getFeaturesRootForFile.test.ts` | ⬜ pending |
| 7-03-01 | 03 | 2 | MP-02 | — | Four plural fields on `WorkspaceSettings` + singular getters returning `[0]` (D-03, D-05) | unit | `npm run test:unit -- --grep "singular getter"` | ❌ W0 — new file `test/unit/settings/multiPathPrecedence.test.ts` | ⬜ pending |
| 7-03-02 | 03 | 2 | TEST-12 | V5 | Precedence matrix (plural / singular / both / neither / empty array) per D-11 | unit | `npm run test:unit -- --grep "TEST-12"` | ❌ W0 — `multiPathPrecedence.test.ts` | ⬜ pending |
| 7-03-03 | 03 | 2 | MP-02, SC#4 | V5 | `"."` rejection preserved per-entry (D-07) | unit | `npm run test:unit -- --grep "Invalid-entry"` | ❌ W0 — `multiPathPrecedence.test.ts` | ⬜ pending |
| 7-03-04 | 03 | 2 | MP-02 | — | `isFileInFeatures(uri)` on `WorkspaceSettings` (D-08) | unit | `npm run test:unit -- --grep "isFileInFeatures"` | ❌ W0 — new file `test/unit/settings/isFileInFeatures.test.ts` | ⬜ pending |
| 7-03-05 | 03 | 2 | MP-02 | — | `testWorkspaceConfig.ts` mirrors plural fields + accepts plural input (D-13, D-14) | unit | `npm run test:unit` (any test using harness) | ❌ W0 — update `testWorkspaceConfig.ts` + existing tests import path | ⬜ pending |
| 7-03-06 | 03 | 2 | TEST-12, SC#3 | — | `featuresUris.length === 2` when INI/harness supplies two paths | unit | `npm run test:unit -- --grep "length === 2"` | ❌ W0 — `multiPathPrecedence.test.ts` "Plural set only" suite | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/unit/settings/multiPathPrecedence.test.ts` — TEST-12 precedence matrix + SC#3 length-2 + D-07 rejection + settings-layer Windows normalization (≥ 10 tests)
- [ ] `test/unit/settings/isFileInFeatures.test.ts` — D-08 helper coverage (≥ 5 tests)
- [ ] `test/unit/common/getFeaturesRootForFile.test.ts` — D-09 helper coverage (≥ 3 tests)
- [ ] Update `test/unit/parsers/configParser.test.ts:148-166` — migrate `result.resolvedPath` to `result.resolvedPaths[0]`; add length-3 assertion on existing 3-path fixture; add 2 new Windows-normalization cases at parser layer
- [ ] No framework install — Mocha + Sinon already present
- [ ] No new shared fixtures — reuse existing `test/unit/parsers/fixtures/config/multi-path/`; settings tests inject via `makeConfig` helper pattern from `discoveryPriority.test.ts`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Single-path workspace unchanged | SC#1 | User-visible behavior check (extension host cannot be scripted fully) | Open `example-projects/simple/` in Extension Development Host; confirm Test Explorer tree populates identically to v1.1 (same scenarios, same order, same run/debug behavior) |

*Note: SC#1 also covered by existing integration test suites (`simple/`, `sibling steps folder/`) run via `npm run test:integration`. Manual smoke is optional belt-and-suspenders.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (3 new test files + 1 test file update)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter after all Wave 0 items land

**Approval:** pending
