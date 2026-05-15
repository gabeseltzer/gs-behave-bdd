---
phase: 021-consent-ux-case-2-case-3-prompts
plan: 03
subsystem: tests/migrations
tags: [tests, consent, migration, ux, phase-21, unit-tests, mocha, sinon]
requires:
  - src/migrations/consent.ts (runConsentFlow + helpers, Plan 01 output)
  - src/migrations/index.ts (re-export surface)
  - test/unit/vscode.mock.ts (ConfigurationTarget enum, getConfiguration / window stubs)
provides:
  - "Unit-test coverage pinning the Phase 21 consent UX contract (TEST-01 + TEST-02 per D-A9.3)"
  - "Regression safety net for case-2 / case-3 action handlers, grouping (D-A1), and audit logging (D-A6.1)"
affects:
  - "test/unit/migrations/consent.test.ts (new file, 23 tests)"
tech-stack:
  added: []
  patterns:
    - "Per-(namespace × key) inspect/update stub (makePerKeyScopedConfig) — same shape as plain.test.ts"
    - "Stub vscode.window.showInformationMessage with .resolves() / .onFirstCall().resolves() to drive each action branch"
    - "Sequential-await proof: stub the first prompt with a setTimeout-delayed Promise and verify the second prompt only fires after the first resolves"
    - "Test-driven assertion on visible side effects only — cfg.update args + logger.logInfo lines + showInformationMessage calls; no direct primitive imports"
key-files:
  created:
    - "test/unit/migrations/consent.test.ts (~605 lines, 23 tests across 5 suites)"
  modified: []
decisions:
  - "Identity-transform MigrationEntry stubs sufficient — assertions are on cfg.update args, not transform internals"
  - "Distinct sourceKey / destKey per test entry (`<id>__src` / `<id>__dest`) so the per-key inspect stub never conflates legacy vs canonical reads"
  - "Audit-log assertions filter by `entry.id` prefix to tolerate unrelated logger.logInfo invocations from helpers (e.g. W-02 stale-scope warnings) — the contract is 'exactly one for this action', not 'exactly one total'"
  - "Group-sort test uses entry ids `aaa-early` / `zzz-late` so alphabetical order is unambiguous and the orchestrator's sort behavior is verifiable from the prompt message strings (case-2 includes sourceKey; case-3 starts with 'Both `…`')"
  - "Sequential-await test uses a setTimeout-delayed first stub and a fakes-counter to assert ordering — same pattern used in test/unit/notifications.test.ts"
metrics:
  duration: "~20 minutes"
  completed: "2026-05-11"
  tasks_complete: "1 of 1"
  commits: 1
  unit_tests: "849 passing (826 baseline + 23 new — zero regressions)"
---

# Phase 021 Plan 03: Consent Tests Summary

One-liner: Pinned the Phase 21 consent UX contract with 23 Mocha/Sinon unit tests in `test/unit/migrations/consent.test.ts` — every case-2 action, every case-3 action, every silent migrationMode path, dismissal, grouping (single-case + mixed-case), deterministic sort order, sequential await, and per-action audit-log invariants are now regression-protected.

## What Shipped

| Suite | Tests | What it pins |
|---|---|---|
| `case 2 prompt (migrationMode = prompt)` | 6 | The 3 case-2 actions, dismissal, "exactly one logInfo per action", exact button-label array |
| `case 2 silent (migrationMode != prompt)` | 3 | Silent migrate-and-delete / migrate-and-keep / skip — no prompt, correct side effects |
| `case 3 prompt (always)` | 7 | The 4 case-3 actions, dismissal, **case 3 prompts even when migrationMode = skip** (D-A4.3), exact button-label array |
| `grouping (D-A1)` | 4 | Same-case-2-scopes → 1 prompt; case-2 + case-3 same entry → 2 prompts; sequential await ordering; deterministic group sort (entry.id asc, then case asc) |
| `audit logging (D-A6)` | 3 | All 7 actions emit exactly one success line; dismissal emits one line with raw scope name; skip silent path emits one line per scope |

Total: **23 tests**, all green; unit suite goes 826 → **849 passing**, zero regressions.

## Verification

- `npx eslint test/unit/migrations/consent.test.ts` → exit 0, no output
- `npx eslint src --ext ts` → exit 0, no output (src untouched but verified per CLAUDE.md mandate)
- `npm run test:unit` → **849 passing** (13s), all 23 new tests under `Phase 21 — consent.ts` listed and ✔
- All acceptance criteria in the PLAN matched:
  - File exists, ≥1 `suite('Phase 21 — consent.ts'`, all 5 sub-suite names present
  - All 7 verbatim button-label strings appear ≥ 2× each (asserted + driven through `showStub.resolves`)
  - `showInformationMessage` referenced 14× (stubbed + asserted across cases)
  - `case 3 still prompts when migrationMode = skip` test present and passing (D-A4.3)
  - `test(` count: 23 (well above the ≥ 20 lower bound)

## Deviations from Plan

None — the plan was executed exactly as written. The only minor implementation choice (audit-log assertions filter by `entry.id` prefix instead of a strict total-call-count check on `logger.logInfo`) is documented in `decisions[]` above and matches the plan's "exactly one logInfo line per **dispatched action**" wording rather than "exactly one logInfo line **total**".

## Commits

| Hash | Message |
|---|---|
| `24ff1a5` | `test(021-03): add unit tests for runConsentFlow` |

## Self-Check: PASSED

- `test/unit/migrations/consent.test.ts` exists (verified via Write + git ls-files)
- Commit `24ff1a5` exists on `gabes/migration-consent`
- `npm run test:unit` → 849 passing, including all 23 new `Phase 21 — consent.ts` tests
- `npx eslint test/unit/migrations/consent.test.ts` clean
- `npx eslint src --ext ts` clean
