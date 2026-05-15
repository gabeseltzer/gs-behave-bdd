---
phase: 021-consent-ux-case-2-case-3-prompts
plan: 02
subsystem: activation/migrations
tags: [activation, consent, migration, ux, phase-21, wiring]
requires:
  - src/migrations/index.ts (runConsentFlow, readMigrationMode, ConsentHit, evaluateAllMigrations)
  - src/migrations/evaluator.ts (EvaluatorHooks.onCaseHit signature)
provides:
  - "Activation-time wiring of the Phase 21 consent orchestrator (collect-then-prompt pattern, D-A3.4)"
  - "Non-blocking consent flow: runConsentFlow fired with `void` so user prompts do not gate activation"
affects:
  - "src/extension.ts (single migration block at ~line 335 rewritten; import grouped to multi-line)"
  - "test/unit/notifications.test.ts (two structural assertions loosened to match the new call signature)"
tech-stack:
  added: []
  patterns:
    - "Collect-then-prompt: evaluator hook accumulates case-2/case-3 ConsentHit[] per workspace; orchestrator runs after evaluator returns"
    - "Fire-and-forget orchestration: `void runConsentFlow(wkspUri, hits, mode)` — Promise intentionally not awaited"
    - "Defense-in-depth try/catch preserved around per-workspace work; error log re-labeled to Phase 21"
key-files:
  created: []
  modified:
    - "src/extension.ts (import expanded; migration block body rewritten; comment updated to D-A3.4)"
    - "test/unit/notifications.test.ts (substring assertions for `evaluateAllMigrations(wkspUri)` loosened to `evaluateAllMigrations(wkspUri` to accept the new hooks-arg shape)"
decisions:
  - "Used `type ConsentHit` inline in the destructured import (TS 4.5+ supports this; consistent with existing TS strict-mode style in the repo)"
  - "Did NOT introduce a separate `import type` line — kept all migrations imports under one statement for symmetry with the rest of extension.ts"
metrics:
  duration: "~10 minutes"
  completed: "2026-05-11"
  tasks_complete: "1 of 1"
  commits: 1
  unit_tests: "826 passing (no net regression; 2 structural tests updated to match new call shape)"
---

# Phase 021 Plan 02: Activation Wiring Summary

One-liner: Replaced the bare `evaluateAllMigrations(wkspUri)` call in `activate()` with the D-A3.4 collect-then-prompt pattern — an `onCaseHit` hook accumulates case-2/case-3 `ConsentHit[]`, then `runConsentFlow(wkspUri, hits, mode)` is fired with `void` so activation never blocks on user prompts.

## What Shipped

| Surface | Change |
|---|---|
| `src/extension.ts` import block | Expanded the `./migrations` import to bring in `runConsentFlow`, `readMigrationMode`, and `type ConsentHit` |
| `src/extension.ts` activation migration block | Replaced bare evaluator call with hooks-collect-then-prompt; `void runConsentFlow(...)` is the new tail; comment updated to reference D-A3.4 and CONSENT-01 |
| `test/unit/notifications.test.ts` | Two structural substring assertions widened to match the new call signature (see Deviations) |

The `Promise.all(getUrisOfWkspFoldersWithFeatures().map(...))` parallelism, the `config.reloadSettings(wkspUri)` call, and the outer try/catch are all preserved verbatim. The error log message was re-labeled `Phase 21 migration consent flow error` (it previously said `Phase 20 migration evaluator error`).

## Verification

- `npx eslint src --ext ts` → exit 0 with no output
- `npm run test:unit` → 826 passing (was 826 before; 2 structural tests updated to remain green, no functional tests changed)
- All acceptance criteria in the PLAN matched:
  - `runConsentFlow` appears once (the new fire-and-forget call)
  - `void runConsentFlow(wkspUri, hits, mode)` appears once
  - `readMigrationMode` appears once
  - `ConsentHit` appears in extension.ts (import + typed `hits` array)
  - `onCaseHit:` appears once
  - `if (mcase === 2 || mcase === 3)` filter present
  - `await runConsentFlow` does NOT appear (fire-and-forget invariant)
  - `Promise.all(` count unchanged
  - `config.reloadSettings(wkspUri)` still present
  - `src/notifications.ts` and `src/migrations/evaluator.ts` untouched

`tsc --noEmit` reports one pre-existing error in `node_modules/smol-toml/dist/error.d.ts` (`ErrorOptions` not found) — confirmed present on the parent merge-base before any edits in this plan. Out of scope per Scope Boundary rule; logged below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Loosened structural assertions in `notifications.test.ts`**

- **Found during:** Task 1 verification (`npm run test:unit`)
- **Issue:** Two tests in `test/unit/notifications.test.ts` did substring searches for the literal `'evaluateAllMigrations(wkspUri)'`. After this plan's edit, the call site is `evaluateAllMigrations(wkspUri, { onCaseHit: ... })` — a comma replaces the closing paren, so the substring no longer matched and both tests failed.
- **Fix:** Replaced both `'evaluateAllMigrations(wkspUri)'` literals with `'evaluateAllMigrations(wkspUri'` (drop the trailing `)`), which matches both pre-21 and post-21 call shapes. Added a comment explaining the change at both sites.
- **Why this counts as a bug, not a behavior change:** the tests' stated intent is "evaluateAllMigrations is the activation-time migration driver" — that invariant still holds. The over-specific substring was a maintenance hazard, not a contract.
- **Files modified:** `test/unit/notifications.test.ts` (two assertion lines + two adjacent comments)
- **Commit:** `c02c7b6` (combined with the task-1 source change so the working tree is lint+test-clean at the commit boundary)

### Pre-existing Out-of-Scope Issues (logged, not fixed)

- `tsc --noEmit` reports `error TS2304: Cannot find name 'ErrorOptions'` in `node_modules/smol-toml/dist/error.d.ts:28`. Reproduced on the parent merge-base before any edits in this plan. Likely a `@types/node` / `lib: es2022.error` config mismatch — outside the scope of a 10-LOC wiring change.

## Commits

| Hash | Message |
|---|---|
| `c02c7b6` | `feat(021-02): wire runConsentFlow into activation migration block` |

## Self-Check: PASSED

- `src/extension.ts` contains `runConsentFlow`, `readMigrationMode`, `ConsentHit`, `onCaseHit:`, and `mcase === 2 || mcase === 3` — verified by grep
- `void runConsentFlow(wkspUri, hits, mode)` present exactly once
- `await runConsentFlow` absent
- Commit `c02c7b6` exists on the worktree branch
- `npx eslint src --ext ts` clean
- `npm run test:unit` → 826 passing
