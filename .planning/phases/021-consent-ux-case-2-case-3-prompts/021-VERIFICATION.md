---
phase: 021-consent-ux-case-2-case-3-prompts
verified: 2026-05-11T20:00:00Z
status: passed
score: 9/9 must-haves verified
overrides_applied: 0
---

# Phase 21: Consent UX (Case 2 & Case 3 Prompts) — Verification Report

**Phase Goal:** Wire the Phase 19 evaluator's `onCaseHit` seam to user-facing prompts and implement the case 2 / case 3 action handlers. On activation: case 1 stays silent; case 2 prompts (or runs silently under non-`prompt` modes); case 3 always prompts with four actions; any chosen action marks Finished at every grouped scope; dismissal leaves migrations unfinished.

**Verified:** 2026-05-11
**Status:** PASSED

## Gate Results

| Gate | Result | Detail |
|---|---|---|
| `npx eslint src --ext ts` | PASS | Exit 0, no output |
| `npm run test:unit` | PASS | **849 passing** (13s); 826 baseline + 23 new Phase 21 tests; zero regressions |
| Activation wiring (`src/extension.ts:336-363`) | PASS | Collect-then-prompt pattern present; `void runConsentFlow(...)` fire-and-forget (no `await`); `onCaseHit` hook filters case 2/3; `Promise.all` parallelism preserved; outer try/catch preserved |
| `runConsentFlow` not awaited | PASS | `grep -c "await runConsentFlow" src/extension.ts` = 0 |

## Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | runConsentFlow groups hits by (entry, case) and shows one notification per group | VERIFIED | `src/migrations/consent.ts:271-291` (Map keyed by `${entry.id}::${case}`); test suite `grouping (D-A1)` — 4 tests pass |
| 2 | Case 2 prompt mode shows 3 buttons; case 3 always shows 4 buttons | VERIFIED | `consent.ts:322-324` button arrays verbatim; tests `case 2 prompt` (6 tests) and `case 3 prompt (always)` (7 tests) pass |
| 3 | Case 2 + non-prompt mode runs silently and marks Finished | VERIFIED | `consent.ts:298-317` silent branch; tests `case 2 silent` (3 tests) pass |
| 4 | Each explicit action marks Finished at all grouped scopes only on success | VERIFIED | All 7 handlers (`consent.ts:112-183`) call `markMigrationFinishedAtScope` AFTER primitive resolves; no `try/finally` (grep confirmed 0) |
| 5 | Per-scope write failure: failing scope NOT marked Finished; loop continues | VERIFIED | `consent.ts:371-385` `dispatchOverScopes` wraps each handler in try/catch with continue; D-A5.4 compliant |
| 6 | Dismissal does NOT mark Finished; emits one audit-log line | VERIFIED | `consent.ts:328-336` undefined-choice branch; tests pin "dismissed at ... will re-surface" log line shape |
| 7 | Every dispatched action emits exactly one logger.logInfo line | VERIFIED | 7 handlers each emit one `config.logger.logInfo` (grep count ≥ 7); audit-logging suite (3 tests) pins this |
| 8 | All config writes route through migrateScopedSetting (MIGRATE-07) | VERIFIED | 5 write handlers all call `migrateScopedSetting`; 2 no-op handlers correctly skip it; no parallel implementations |
| 9 | Case 3 prompts even when migrationMode = skip (D-A4.3) | VERIFIED | `consent.ts:298` silent branch gated by `group.case === 2`; test `case 3 still prompts when migrationMode = skip` passes |

**Score: 9/9 truths verified**

## Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/migrations/consent.ts` | runConsentFlow orchestrator + 7 handlers + helpers + types | VERIFIED | 385 lines; all expected exports (`runConsentFlow`, `readMigrationMode`, `friendlyScopeName`, `formatCase2Message`, `formatCase3Message`, `Case2Action`, `Case3Action`, `MigrationMode`, `ConsentHit`); all 7 internal handlers + `runOverwriteAtScope` + `describeScope` present |
| `src/migrations/index.ts` | Flat re-export surface | VERIFIED | Lines 8-9: `export { runConsentFlow, readMigrationMode }` + `export type { Case2Action, Case3Action, MigrationMode, ConsentHit }` |
| `src/extension.ts` activation block | runConsentFlow wired fire-and-forget | VERIFIED | Lines 336-363: collect-then-prompt with `onCaseHit` hook + `void runConsentFlow(...)` |
| `test/unit/migrations/consent.test.ts` | TEST-01 + TEST-02 coverage | VERIFIED | 976 lines; 23 tests across 5 suites; all green |
| `src/notifications.ts` (D-A8.3 deviation) | TransformResult write variant + optional `removeSource` | VERIFIED | Lines 112-124 + 216-241 — Option A deviation user-approved; documented in 021-01-SUMMARY.md |

## Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| `src/extension.ts` | `./migrations` (runConsentFlow, readMigrationMode, ConsentHit) | typed import + invocation in activate() | WIRED |
| `src/extension.ts` evaluator call | ConsentHit collector | `onCaseHit:` arrow fn pushing to `hits[]` | WIRED |
| `src/migrations/consent.ts` | `migrateScopedSetting` (src/notifications.ts) | imported + invoked in 5 write handlers | WIRED |
| `src/migrations/consent.ts` | `markMigrationFinishedAtScope` | imported + invoked in all 7 handler success paths | WIRED |
| `src/migrations/index.ts` | `./consent` | re-export of public surface | WIRED |
| `test/unit/migrations/consent.test.ts` | `runConsentFlow` | imported from `../../../src/migrations` | WIRED |

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| CONSENT-01 | 021-01, 021-02 | Activation scans migrations; case 2/3 hits show non-blocking notifications | SATISFIED | `extension.ts:344-356` collect-then-prompt with `void runConsentFlow` (fire-and-forget); `consent.ts:289-291` sequential grouping |
| CONSENT-02 | 021-01 | Case 2 prompt with 3 actions (Migrate & delete / Migrate & keep / Don't migrate); marks Finished | SATISFIED | `consent.ts:322-324` button array; handlers `runMigrateAndDelete`/`runMigrateAndKeep`/`runDontMigrate` mark Finished; 6 tests under `case 2 prompt` |
| CONSENT-03 | 021-01 | Case 3 always prompts (regardless of migrationMode) with 4 actions; marks Finished | SATISFIED | `consent.ts:298` (silent branch gated on `case === 2`); `consent.ts:324` 4-button array; 7 tests under `case 3 prompt (always)` including the `migrationMode=skip` test (D-A4.3) |
| CONSENT-04 | 021-01 | Dismissal leaves migration unfinished, re-surfaces next activation | SATISFIED | `consent.ts:328-336` returns without markFinished; tests `dismissal (undefined) does NOT mark Finished` pass for both case 2 and case 3 |
| CONSENT-06 | 021-01 | Case 2 runs silently for migrate-and-delete/migrate-and-keep/skip modes; case 3 still prompts | SATISFIED | `consent.ts:298-317` silent branch covers all three modes; 3 tests under `case 2 silent` pass |
| MIGRATE-05 | 021-01 | Case 2 actions implemented via migrateScopedSetting primitive | SATISFIED | `runMigrateAndDelete`, `runMigrateAndKeep`, `runDontMigrate` (consent.ts:112-150); first two route through `migrateScopedSetting` |
| MIGRATE-06 | 021-01 | Case 3 actions implemented via migrateScopedSetting primitive | SATISFIED | `runOverwriteAndDelete`, `runOverwriteAndKeep`, `runKeepCanonicalAndDeleteLegacy`, `runKeepBoth` (consent.ts:154-183); first three route through primitive (Keep both is intentional no-op) |
| TEST-01 | 021-03 | Unit tests for case 2 prompt: 3 actions + dismissal + 3 silent migrationMode paths | SATISFIED | `test/unit/migrations/consent.test.ts` suites `case 2 prompt` (6 tests) + `case 2 silent` (3 tests) — all 9 green |
| TEST-02 | 021-03 | Unit tests for case 3 prompt: 4 actions + dismissal + case 3 prompts even when migrationMode=skip | SATISFIED | `test/unit/migrations/consent.test.ts` suite `case 3 prompt (always)` — 7 tests green including the D-A4.3 skip-prompts test |

**All 9 Phase 21 requirements: SATISFIED.**

## D-A8.3 Deviation (Documented & Accepted)

- **What:** `src/notifications.ts` was modified in Phase 21 — the plan invariant said it must not be modified.
- **Why:** Action handlers needed to express "write dest, keep source" (migrate-and-keep / overwrite-and-keep). The pre-existing `kind: 'write'` variant unconditionally removed the source.
- **Resolution:** Option A — extended `TransformResult`'s write variant with optional `removeSource?: boolean`; primitive gates removal on `result.removeSource !== false`. All pre-existing callers omit the field and keep current behavior.
- **User approval:** Documented in `021-01-SUMMARY.md` § "Deviations from Plan" with the explicit "USER-APPROVED" tag.
- **Backward compat verified:** 826 baseline tests passed unchanged after the change; total now 849 with 23 new Phase 21 tests.

## Anti-Patterns Found

None. ESLint clean on `src --ext ts`; no TODO/FIXME/placeholder strings introduced in Phase 21 files; no empty handlers; no `} finally {` blocks in `consent.ts` (D-A5.4 invariant held).

## Human Verification Required

None. All success criteria are evidence-checkable from code + unit tests. The notification UI itself (visual button rendering, modal: false behavior) is exercised by VS Code's standard `showInformationMessage` primitive — Phase 22 (TEST-07) will add real-VSCode integration coverage of the end-to-end prompt flow.

## Summary

**PASS.** All 9 truths verified, all 9 requirements satisfied, both gates green (ESLint clean; 849/849 unit tests passing — up from 826 baseline). The D-A8.3 deviation is intentional, user-approved, and documented. The activation wiring is exactly the D-A3.4 collect-then-prompt pattern with `void runConsentFlow(...)` fire-and-forget. Phase 21 is ready for Phase 22.

---

_Verified: 2026-05-11_
_Verifier: Claude (gsd-verifier)_
