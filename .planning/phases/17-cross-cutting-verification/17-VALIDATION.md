---
phase: 17
slug: cross-cutting-verification
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-30
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Mocha 9.x (TDD UI, `bail: true`) via `@vscode/test-electron` Dev Host launches |
| **Config file** | `test/integration/.mocharc.json` (existing); new suite added to `test/integration/runTestSuites.ts` |
| **Quick run command** | `npm run test:unit` |
| **Full suite command** | `npm test` (downloads VSCode, runs all 18+ integration suites + unit tests) |
| **Estimated runtime** | Unit: ~10s. Full integration: ~5-10 min (CI). Phase 17's new suite alone: ~30-60s. |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit` AND `npx eslint src --ext ts` (per repo CLAUDE.md). For Phase 17, also run `npm run compile-tests` to catch TS errors in the new test file.
- **After every plan wave:** Run the new migrations suite in isolation via debug launch ("multi-path-settings" pattern adapted) — full integration run reserved for end of phase.
- **Before `/gsd-verify-work`:** Full `npm test` must be green (all 655+ unit tests + all 18 existing integration suites + the new `migrations suite`).
- **Max feedback latency:** Unit + lint < 30s after commit. Single-suite integration run < 90s.

---

## Per-Task Verification Map

> Plans not yet authored — this map is provisional and updated by the planner during plan creation. Each task that produces a test file or fixture file lists the file existence + compile + selective run as its automated verify.

| Task ID    | Plan | Wave | Requirement(s) covered                | Test Type           | Automated Command                                                                         | File Exists | Status     |
|------------|------|------|----------------------------------------|---------------------|-------------------------------------------------------------------------------------------|-------------|------------|
| 17-01-01   | 01   | 1    | DEP-02, DEP-03, NOTIF-06 (fixture)    | fixture creation    | `test -f example-projects/migration-stale/.vscode/settings.json && test -f example-projects/migration-stale/.vscode/settings.template.json` | ❌ W0       | ⬜ pending |
| 17-01-02   | 01   | 1    | (fixture sanity)                       | unit-style assert   | `npm run compile-tests` exits 0 (fixture JSON parses; `behave.ini`/`pyproject.toml` valid) | ❌ W0       | ⬜ pending |
| 17-02-01   | 02   | 2    | NOTIF-06 (A1-probe), DEP-02..04        | integration suite   | `npm run compile-tests` exits 0; new `migrations suite` Mocha file compiles               | ❌ W0       | ⬜ pending |
| 17-02-02   | 02   | 2    | DEP-02..04, NOTIF-04, NOTIF-06         | integration suite   | Run new suite via Dev Host; assert 4-6 `it` blocks all green                                | ❌ W0       | ⬜ pending |
| 17-03-01   | 03   | 3    | (suite registration / regression gate) | full integration    | `npm test` exits 0 (all 18+ suites + new migrations suite green; 655+ unit tests green)   | ❌ W0       | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

> The exact `Task ID` numbering, plan boundaries, and per-task verification commands will be refined when PLAN.md files are written. The dimensions covered (fixture, integration suite, full regression) are stable.

---

## Wave 0 Requirements

Phase 17 has minimal Wave 0 because it ships **no new product code** and reuses
the existing test-runner infrastructure end-to-end:

- [ ] `example-projects/migration-stale/.vscode/settings.json` — pre-seeded stale-keys baseline (Phase 17 Plan 01 task; not a true Wave 0 since it IS the deliverable, not infrastructure)
- [ ] `example-projects/migration-stale/.vscode/settings.template.json` — restore baseline (D-08 mechanism)
- [ ] `example-projects/migration-stale/behave.ini` (or `pyproject.toml`) + `features/example.feature` — minimal so activation enters the migration loop
- [ ] `test/integration/migrations suite/index.ts` — Mocha entry; installs `vscode.window.showInformationMessage` stub before runner (RESEARCH §5.2.A)
- [ ] `test/integration/migrations suite/extension.test.ts` — test file scaffold

**Existing infrastructure covers everything else:**
- Mocha 9.x — already installed, configured at `test/integration/.mocharc.json`
- `@vscode/test-electron` — already installed, used by all 18 existing suites
- `sinon` — already installed, used by `test/integration/watcher-integration suite/runGuard.test.ts`
- Node `assert`, `fs`, `path` — built-in
- `TestSupport` activation handle — exported from `src/extension.ts`, used by all suites
- `index.helper.ts` `runner()` — shared Mocha runner, reused verbatim

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| (none) | — | All Phase 17 behaviors are now automated. | — |

**Note — closeout of prior manual debt:** Phase 15's `15-HUMAN-UAT.md` lists 2
deferred items (live `inspect()` per-scope contract + live notification + DSA
click). Phase 17 D-01..D-03 explicitly replaces both with automated `@vscode/test-electron`
integration tests. After Phase 17 ships green, Phase 15's HUMAN-UAT status
flips from `partial` to `complete (superseded by Phase 17 automation)`. The
Phase 17 plans MUST include a task that updates `15-HUMAN-UAT.md` accordingly
(or the planner explicitly defers it as a milestone-close artifact).

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (fixture + suite scaffold listed above)
- [ ] No watch-mode flags (mocha runs once per `runTests` call; no `--watch`)
- [ ] Feedback latency: unit + lint < 30s; new-suite-only run < 90s
- [ ] `nyquist_compliant: true` set in frontmatter (after planner verifies all `<automated>` blocks resolve to existing or Wave-0-listed files)

**Approval:** pending
