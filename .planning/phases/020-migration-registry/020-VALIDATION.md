---
phase: 20
slug: migration-registry
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-08
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Mocha 9.2.2 (unit), @vscode/test-electron (integration — not used by Phase 20) |
| **Config file** | `test/unit/.mocharc.json` |
| **Quick run command** | `npm run test:unit -- --grep "<plan-scoped pattern>"` |
| **Full suite command** | `npm run test:unit` |
| **Estimated runtime** | ~5–15 seconds (unit suite) |

Lint (mandatory after every TS edit per CLAUDE.md):
- `npx eslint src --ext ts` — exit 0 with no output = clean

---

## Sampling Rate

- **After every task commit:** Run `npx eslint src --ext ts` AND the plan-scoped `npm run test:unit -- --grep` for the affected migration group.
- **After every plan wave:** Run full `npm run test:unit`.
- **Before `/gsd-verify-work`:** Full unit suite green; lint clean across `src/`.
- **Max feedback latency:** ~15 seconds.

---

## Per-Task Verification Map

> Populated by the planner once PLAN.md files exist. The planner MUST emit one row per task. Test type is `unit` for all Phase 20 tasks (no integration tests added in this phase).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 20-XX-XX | XX | N | MIGRATE-0X / TEST-04 | — | N/A (refactor; no new threats) | unit | `npm run test:unit -- --grep "<entry>"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Phase 20 introduces a new `src/migrations/` directory. Wave 0 must scaffold:

- [ ] `src/migrations/types.ts` — re-exports `MigrationEntry` from Phase 19; documents `<key>-from-behavevsc` / `<key>-self` id convention.
- [ ] `src/migrations/index.ts` — exports `migrations: MigrationEntry[]` (initially empty; populated as later waves land entries).
- [ ] `src/migrations/plain.test.ts` — stubs for plain-entry factory tests.
- [ ] `src/migrations/featuresPath.test.ts` — stubs for `featuresPathMergeWithDedup` + 2 entries (TEST-04 dimensions a + b per entry).
- [ ] `src/migrations/suppressedNotifications.test.ts` — stubs for `suppressMultiConfigToArray` + 1 entry.
- [ ] `src/migrations/envPresets.test.ts` — stubs for `mergeRecord` utility + envVarPresets / envVarOverrides entries.
- [ ] Decision recorded in `RESEARCH.md` Open Question Q1 (test path glob: co-located in `src/migrations/*.test.ts` — matches existing `src/notifications.test.ts` pattern).

Mocha glob already includes `src/**/*.test.ts` per existing config — no framework install needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Activation no longer calls `migrateLegacyFeaturesPath` / `migrateLegacySuppressMultiConfig` directly | MIGRATE-01 (refactor part) | Smoke check that the deletion at `src/extension.ts:348-349` doesn't break activation in a real workspace | Open `example-projects/project A` in VS Code Insiders, confirm extension activates, no errors in Developer: Show Logs → Extension Host. |

*Note: full case-2/case-3 prompt UX is Phase 21's manual scope — not Phase 20's.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (test stub files for each migration group file)
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter (set by planner once per-task map is filled)

**Approval:** pending
