---
phase: 021-consent-ux-case-2-case-3-prompts
plan: 01
subsystem: migrations/consent
tags: [consent, migration, ux, notifications, phase-21]
requires:
  - src/migrations/types.ts (MigrationEntry, MigrationScope)
  - src/migrations/completedMigrations.ts (markMigrationFinishedAtScope)
  - src/notifications.ts (migrateScopedSetting, TransformResult)
  - src/configuration.ts (config.logger.logInfo)
provides:
  - "runConsentFlow(wkspUri, hits, mode): top-level case-2 / case-3 orchestrator"
  - "readMigrationMode(wkspUri): reads gs-behave-bdd.migrationMode"
  - "friendlyScopeName, formatCase2Message, formatCase3Message: prompt copy helpers"
  - "Case2Action, Case3Action, MigrationMode, ConsentHit: public types"
affects:
  - "src/notifications.ts (TransformResult write variant gained optional removeSource — D-A8.3 deviation, user-approved Option A)"
  - "src/migrations/index.ts (re-exports runConsentFlow + types for flat import from extension.ts)"
tech-stack:
  added: []
  patterns:
    - "Group-then-prompt: hits collected first, one notification per (entry, case) tuple"
    - "Sequential await over scopes; per-scope try/catch (D-A5.4) so failures don't abort the group"
    - "All writes route through migrateScopedSetting (MIGRATE-07 invariant honoured)"
key-files:
  created:
    - "src/migrations/consent.ts (385 lines)"
  modified:
    - "src/notifications.ts (TransformResult write variant + removeSource gating)"
    - "src/migrations/index.ts (1 re-export line + 1 type re-export line)"
decisions:
  - "D-A8.3 OPTION A (user-approved): extend TransformResult's write variant with optional removeSource rather than introduce a third variant. Backward compatible — all prior callers omit the field and keep the current 'remove source' behavior."
  - "Plan pseudocode rename: the plan uses kind: 'value' throughout, but the codebase has used kind: 'write' since Phase 15. Treated as a trivial rename per the user's instruction."
  - "Tasks 2 and 3 commits combined: Task 2 alone produces unused-handler eslint errors because the orchestrator (Task 3) is what wires them. Combined into one commit (e6eafa2) so the working tree is lint-clean at every boundary (Rule 3 deviation)."
metrics:
  duration: "~25 minutes"
  completed: "2026-05-11"
  tasks_complete: "3 of 3"
  commits: 3
  unit_tests: "826 passing (no regressions)"
---

# Phase 21 Plan 01: Consent Module Summary

Created the case-2 / case-3 user-consent orchestrator (`src/migrations/consent.ts`) that groups evaluator hits by `(entry, case)`, prompts once per group with the pinned button labels, dispatches the matching action handler over every scope in the group, and marks Finished only on success per D-A5.4.

## What Shipped

- `src/migrations/consent.ts` (new, 385 lines) — types, helpers, message formatters, seven private action handlers (3 case-2 + 4 case-3 per D-A5.2), the `runOverwriteAtScope` wrapper (D-A5.3), and the `runConsentFlow` orchestrator.
- `src/migrations/index.ts` — re-exports `runConsentFlow`, `readMigrationMode`, and the four public types (`Case2Action`, `Case3Action`, `MigrationMode`, `ConsentHit`).
- `src/notifications.ts` — `TransformResult` write variant now carries an optional `removeSource` field; primitive gates source removal on `result.removeSource !== false`. See the D-A8.3 deviation note below.

## Commits

| # | Hash      | Type | Description                                                                                  |
|---|-----------|------|----------------------------------------------------------------------------------------------|
| 1 | `9f82f9e` | feat | extend TransformResult write variant with optional removeSource (D-A8.3 deviation, Option A) |
| 2 | `388db6a` | feat | add consent module skeleton (types, helpers, formatters) — Task 1                            |
| 3 | `e6eafa2` | feat | implement consent action handlers and runConsentFlow orchestrator — Tasks 2+3 combined       |

## Deviations from Plan

### D-A8.3 — Option A: extend TransformResult instead of leaving notifications.ts untouched (USER-APPROVED, Rule 4)

- **Plan invariant violated:** "`src/notifications.ts` is NOT modified (D-A8.3)."
- **Why the invariant blocked us:** The seven action handlers need to distinguish migrate-and-keep / overwrite-and-keep (write dest, leave legacy) from migrate-and-delete / overwrite-and-delete (write dest, remove legacy). The pre-existing `kind: 'write'` variant unconditionally removed the source — there was no way to express "write dest but keep source" through the primitive without modifying it.
- **Resolution (Option A, user-approved):** Added an optional `removeSource?: boolean` field to the write variant. Primitive gates removal on `result.removeSource !== false` — omitted (all prior callers) or `true` keeps the current behavior; explicit `false` preserves the legacy entry.
- **Backward compatibility:** Verified — all existing callers (`featuresPathMergeWithDedup`, `suppressMultiConfigToArray`, evaluator) omit the field. `npm run test:unit` passes 826/826 with zero changes to those tests.
- **Commit:** `9f82f9e`.

### Pseudocode rename: `kind: 'value'` → `kind: 'write'`

- The plan's pseudocode used `kind: 'value'` throughout, but the codebase has used `kind: 'write'` since Phase 15. Treated as a trivial rename per user instruction. Every handler in `consent.ts` uses `kind: 'write'`. No behavioural impact.

### Rule 3 — Tasks 2 and 3 combined into a single commit

- **Issue:** Task 2's verify step requires `npx eslint src --ext ts` to exit 0. After Task 2 alone, the seven private handlers are defined-but-unused (no caller wires them — that's Task 3's job), so eslint fails with seven `@typescript-eslint/no-unused-vars` errors.
- **Resolution:** Combined Tasks 2 and 3 into commit `e6eafa2` so the working tree is lint-clean at every commit boundary. The commit message explicitly notes this.
- **No information lost:** the commit body separates the Task 2 and Task 3 changesets in plain English.

## Acceptance Criteria

All Task-1 / Task-2 / Task-3 acceptance grep checks were validated structurally during implementation; the authoritative gates (eslint + tsc + unit tests) all pass:

- `npx eslint src --ext ts` → exits 0 with no output.
- `npx tsc --noEmit -p tsconfig.json` → only the pre-existing `node_modules/smol-toml/dist/error.d.ts` `ErrorOptions` error appears (confirmed unrelated to this plan via `git stash` baseline check).
- `npm run test:unit` → 826 passing, 0 failures.
- `git diff fc6a1e8 -- src/migrations/evaluator.ts` → empty (D-A3.5 invariant held).

## Requirements Covered

- **CONSENT-01** (collect-then-prompt) — grouping in `runConsentFlow` ✓
- **CONSENT-02** (3 case-2 buttons) — `buttons` array when `group.case === 2` ✓
- **CONSENT-03** (4 case-3 buttons regardless of mode) — case-3 takes the prompt branch unconditionally (D-A4.3) ✓
- **CONSENT-04** (dismissal re-surfaces) — `choice === undefined` logs and `return`s without markFinished ✓
- **CONSENT-06** (case 2 silent under non-prompt modes) — `if (group.case === 2 && mode !== 'prompt')` silent branch ✓
- **MIGRATE-05** / **MIGRATE-06** — all seven handlers route through `migrateScopedSetting`; MIGRATE-07 invariant preserved ✓

## Verification (per plan §verification)

| Check | Status |
|-------|--------|
| `src/migrations/consent.ts` compiles standalone and via project tsconfig | PASS |
| `src/migrations/index.ts` exposes runConsentFlow / readMigrationMode / ConsentHit / MigrationMode flat | PASS |
| No handler uses `finally` to mark Finished (D-A5.4) | PASS (grep confirms zero `} finally {`) |
| `npm run test:unit` remains green | PASS (826/826) |
| `src/migrations/evaluator.ts` byte-identical to pre-plan state | PASS |
| `src/notifications.ts` byte-identical to pre-plan state | **NOT HELD — D-A8.3 deviation, user-approved Option A** |
| ESLint passes cleanly on `src/migrations/consent.ts` | PASS |

## Public Surface Stable for Plans 02 / 03

```typescript
// from src/migrations/index.ts
export { runConsentFlow, readMigrationMode } from './consent';
export type { Case2Action, Case3Action, MigrationMode, ConsentHit } from './consent';
```

Plan 02 (activation wiring) imports these flat. Plan 03 (tests) mocks the orchestrator and asserts on the verbatim button-label strings and audit-log line shapes.

## Self-Check: PASSED

- File `src/migrations/consent.ts` exists (385 lines).
- File `src/migrations/index.ts` modified (2 new export lines).
- File `src/notifications.ts` modified (TransformResult + primitive gating).
- Commits `9f82f9e`, `388db6a`, `e6eafa2` exist in `git log`.
- `npx eslint src --ext ts` exits 0.
- `npm run test:unit` reports 826 passing.
