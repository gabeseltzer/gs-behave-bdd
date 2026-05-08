---
phase: 20
slug: migration-registry
status: planned
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-08
updated_by_planner: 2026-05-08
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Mocha 9.2.2 (unit), @vscode/test-electron (integration — not used by Phase 20) |
| **Config file** | `test/unit/run.ts` (compiled to `out/test/test/unit/run.js`) |
| **Quick run command** | `npm run test:unit` (full) — `--grep` does NOT propagate through `npm run test:unit` per Phase 15 Plan 06 finding (STATE.md L137-L138). For plan-scoped sampling, fall back to: `npx mocha --require ./out/test/test/unit/setup.js --ui tdd "out/test/test/unit/migrations/**/*.test.js" --grep "<pattern>"` after `npm run compile-tests`. |
| **Full suite command** | `npm run test:unit` |
| **Estimated runtime** | ~5–15 seconds (unit suite) |

Lint (mandatory after every TS edit per CLAUDE.md):
- `npx eslint src --ext ts` — exit 0 with no output = clean

---

## Sampling Rate

- **After every task commit:** Run `npx eslint src --ext ts` AND the plan-scoped mocha invocation for the affected migration group.
- **After every plan wave:** Run full `npm run test:unit`.
- **Before `/gsd-verify-work`:** Full unit suite green; lint clean across `src/`.
- **Max feedback latency:** ~15 seconds.

---

## Per-Task Verification Map

> All Phase 20 tasks are `unit` test type; the phase introduces no integration tests. The `Threat Ref` column is `—` for every task because Plan-level threat models flagged no new threats (refactor + new module phase reusing Phase 19's hardened evaluator and the v1.4.0 `migrateScopedSetting` primitive).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 1 | MIGRATE-01/02/03 | — | N/A (docblock edit only) | unit | `npx eslint src/migrations/types.ts --ext ts && npm run compile` | ✅ existing | ⬜ pending |
| 20-01-02 | 01 | 1 | MIGRATE-01/02/03 | — | N/A | unit | `npm run compile-tests && node ./out/test/test/unit/run.js` | ❌ create test/unit/migrations/index.test.ts | ⬜ pending |
| 20-02-01 | 02 | 2 | MIGRATE-03 | — | N/A | unit | `npm run compile && npx eslint src --ext ts` | ❌ create src/migrations/plain.ts | ⬜ pending |
| 20-02-02 | 02 | 2 | MIGRATE-03 / TEST-04 | — | N/A | unit | `npm run compile-tests && node ./out/test/test/unit/run.js` | ❌ create test/unit/migrations/plain.test.ts | ⬜ pending |
| 20-02-03 | 02 | 2 | MIGRATE-03 | — | N/A | unit | `npm run compile-tests && node ./out/test/test/unit/run.js` | ✅ edit src/migrations/registry.ts | ⬜ pending |
| 20-03-01 | 03 | 3 | MIGRATE-01 | — | N/A | unit | `npm run compile && npx eslint src --ext ts` | ❌ create src/migrations/featuresPath.ts | ⬜ pending |
| 20-03-02 | 03 | 3 | MIGRATE-01 / TEST-04 | — | N/A | unit | `npm run compile-tests && node ./out/test/test/unit/run.js` | ❌ create test/unit/migrations/featuresPath.test.ts | ⬜ pending |
| 20-03-03 | 03 | 3 | MIGRATE-01 | — | N/A (refactor preserves behavior) | unit | `npm run compile-tests && node ./out/test/test/unit/run.js` | ✅ edit src/notifications.ts + src/migrations/registry.ts | ⬜ pending |
| 20-04-01 | 04 | 4 | MIGRATE-02 / MIGRATE-03 | — | N/A | unit | `npm run compile && npx eslint src --ext ts` | ❌ create src/migrations/suppressedNotifications.ts | ⬜ pending |
| 20-04-02 | 04 | 4 | MIGRATE-02 / TEST-04 | — | N/A | unit | `npm run compile-tests && node ./out/test/test/unit/run.js` | ❌ create test/unit/migrations/suppressedNotifications.test.ts | ⬜ pending |
| 20-04-03 | 04 | 4 | MIGRATE-03 | — | T-20-04-01 (accept; same surface as v1.4.0 fallback) | unit | `npm run compile && npx eslint src --ext ts` | ❌ create src/migrations/envPresets.ts | ⬜ pending |
| 20-04-04 | 04 | 4 | MIGRATE-03 / TEST-04 | — | N/A (Pitfall 4 explicit in tests) | unit | `npm run compile-tests && node ./out/test/test/unit/run.js` | ❌ create test/unit/migrations/envPresets.test.ts | ⬜ pending |
| 20-04-05 | 04 | 4 | MIGRATE-02 / MIGRATE-03 | — | N/A | unit | `npm run compile-tests && node ./out/test/test/unit/run.js` | ✅ edit src/notifications.ts + src/migrations/registry.ts | ⬜ pending |
| 20-05-01 | 05 | 5 | MIGRATE-01 / MIGRATE-02 | T-20-05-01 (accept; activation latency negligible) | N/A | unit + structural grep | `npx eslint src --ext ts && npm run compile && powershell -NoProfile -Command "$src=Get-Content -Raw src/extension.ts; if($src -match 'migrateLegacyFeaturesPath\(wkspUri\)') {exit 1}; if($src -match 'migrateLegacySuppressMultiConfig\(wkspUri\)') {exit 1}; if(-not ($src -match 'evaluateAllMigrations')) {exit 1}; exit 0"` | ✅ edit src/extension.ts | ⬜ pending |
| 20-05-02 | 05 | 5 | MIGRATE-01 / MIGRATE-02 | — | N/A | unit | `npm run compile-tests && node ./out/test/test/unit/run.js` | ✅ edit test/unit/notifications.test.ts | ⬜ pending |
| 20-05-03 | 05 | 5 | MIGRATE-01/02/03 / TEST-04 | — | N/A | unit | `npm run compile-tests && node ./out/test/test/unit/run.js` | ✅ edit test/unit/migrations/index.test.ts | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Phase 20 introduces a new `test/unit/migrations/` subdirectory (NOT `src/migrations/*.test.ts` co-location — see RESEARCH.md Q1 resolution in Plan 01 `<resolved_open_questions>`). Wave 0 (Plan 01 — wave 1) creates:

- [x] `test/unit/migrations/index.test.ts` — registry-level invariants (Plan 01 Task 2). Asserts no id collisions, all ids match the documented convention, and (via test.skip until Plan 05) the final count of 17.
- [x] `src/migrations/types.ts` docblock for the `<key>-from-behavevsc` / `<key>-self` id convention (Plan 01 Task 1).
- [x] Decision recorded in Plan 01 `<resolved_open_questions>` block: tests live under `test/unit/migrations/<area>.test.ts`, NOT co-located in `src/`. The Mocha runner at `test/unit/run.ts:22` globs `**/unit/**/*.test.js` — co-located src/migrations/*.test.ts would compile to `out/src/migrations/*.test.js` and never run (Pitfall 5 from RESEARCH.md).
- [x] No framework install needed; Mocha + Sinon already in package.json.

The four downstream test files (plain, featuresPath, suppressedNotifications, envPresets) are created by their respective plans (02-04), not by Wave 0 — each plan owns its test file because the test depends on the source file landing in the same plan.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Activation no longer calls `migrateLegacyFeaturesPath` / `migrateLegacySuppressMultiConfig` directly | MIGRATE-01 (refactor part) | Smoke check that the deletion at `src/extension.ts:348-350` doesn't break activation in a real workspace | Open `example-projects/project A` in VS Code Insiders, confirm extension activates, no errors in Developer: Show Logs → Extension Host. |

*Note: full case-2/case-3 prompt UX is Phase 21's manual scope — not Phase 20's.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (test stub files for each migration group file — created by their owning plans, not by Plan 01)
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planner-approved
