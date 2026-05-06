---
phase: 18-address-v1-4-0-tech-debt-artifact-rollups-mock-cleanup
plan: 01
status: complete
requirements-completed: []
tags: [cleanup, cosmetic, v1.4.0-closure]
key-files:
  modified:
    - test/unit/vscode.mock.ts
    - src/common.ts
commit: 7778934
---

# Phase 18 Plan 01: v1.4.0 Audit Cosmetic Cleanup Summary

Closed both code-level items from `.planning/v1.4.0-MILESTONE-AUDIT.md` in a single commit (`7778934`). Deleted the unreachable 3-line `suppressMultiConfigNotification` fallback at `test/unit/vscode.mock.ts:171-173` (Phase 15 Finding 1 — the production migration helper switched to `cfg.inspect()` long ago, so this `cfg.get()` branch could never fire). Appended a 4-line WHY comment to the existing "Phase 17 fix" block in `src/common.ts` (around L345-L348) explaining that the read-time `discoveryDepth` re-read is a deliberate ad-hoc workaround — `activeProjectCache` outlives the settings that key it, and a proper `clearScanResultCache()`-paired invalidation is tracked as v1.4.0 follow-up tech debt. Zero behavior change. `npx eslint src --ext ts` exits clean and `npm run test:unit` reports **697 passing** (one more than the plan's 696 baseline because the suite grew between plan authoring and execution — no regressions). Grep confirms `suppressMultiConfigNotification` now appears in `test/unit/` only inside the two allow-listed Phase 15 test files (`notifications.test.ts`, `packageJsonSchema.test.ts`).

## Self-Check: PASSED

- File `test/unit/vscode.mock.ts` exists, no longer contains `suppressMultiConfigNotification`.
- File `src/common.ts` exists, contains the three sentinel phrases (`deliberate read-time`, `cache-invalidation hook`, `follow-up tech debt`) at lines 345/346/347.
- Commit `7778934` exists in `git log` on branch `auto-detect-behave-directory` with diff stat `+4 / −3` across the two intended files.
- Pre-existing uncommitted changes in `.planning/ROADMAP.md`, `.planning/STATE.md`, and the new phase 18 directory + `v1.4.0-MILESTONE-AUDIT.md` were left untouched per instructions.
