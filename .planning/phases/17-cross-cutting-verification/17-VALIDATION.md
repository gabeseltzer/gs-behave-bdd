---
phase: 17
slug: cross-cutting-verification
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-30
validated: 2026-05-04
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> **Validated 2026-05-04:** All Wave 0 deliverables shipped, the new `migrations` integration suite (7 tests) is registered in `runTestSuites.ts` and runs green via `npm test`. Phase 17's bug-fix in `src/common.ts` (commit c08ced5) is exercised by the existing `monorepo-scan` integration suite.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Mocha 9.x (TDD UI, `bail: true`) via `@vscode/test-electron` Dev Host launches |
| **Config file** | `test/integration/.mocharc.json` (existing); new suite registered in `test/integration/runTestSuites.ts` |
| **Quick run command** | `npm run test:unit` |
| **Full suite command** | `npm test` (downloads VSCode, runs all 18+ integration suites + unit tests) |
| **Estimated runtime** | Unit: ~12s. Full integration: ~5-10 min (CI). Phase 17's new suite alone: ~30-60s. |

---

## Sampling Rate

- **After every task commit:** `npm run test:unit` AND `npx eslint src --ext ts` (per repo CLAUDE.md). Plus `npm run compile-tests` for TS errors in new test files.
- **After every plan wave:** New `migrations` suite in isolation via debug launch — full integration run reserved for end of phase.
- **Before `/gsd-verify-work`:** Full `npm test` must be green (all 18 existing integration suites + the new `migrations suite` + 696+ unit tests).
- **Max feedback latency:** Unit + lint < 30s after commit. Single-suite integration run < 90s.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement(s) | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-----------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | DEP-02, DEP-03, NOTIF-06 (fixture) | fixture creation | `test -f example-projects/migration-stale/.vscode/settings.json && test -f example-projects/migration-stale/.vscode/settings.template.json && test -f example-projects/migration-stale/behave.ini` | ✅ | ✅ green |
| 17-01-02 | 01 | 1 | (fixture sanity) | compile gate | `npm run compile-tests` exits 0 | ✅ | ✅ green |
| 17-02-01 | 02 | 2 | NOTIF-06 (A1-probe), DEP-02..04 | integration suite scaffold | `npm run compile-tests` — `test/integration/migrations suite/{index.ts, extension.test.ts}` compile clean | ✅ | ✅ green |
| 17-02-02-test1 | 02 | 2 | DEP-02, DEP-05, NOTIF-06 | integration | "post-activation settings.json: legacy keys removed, canonical keys written" | ✅ | ✅ green |
| 17-02-02-test2 | 02 | 2 | DEP-03, NOTIF-06 (D-08) | integration | "post-activation cfg.inspect(): canonical keys at user scope, legacy at no scope" | ✅ | ✅ green |
| 17-02-02-test3 | 02 | 2 | DEP-02 + NOTIF-06 + D-18 | integration | "post-activation cache reflects both migrations (D-18 reloadSettings ran AFTER both helpers)" | ✅ | ✅ green |
| 17-02-02-test4 | 02 | 2 | DEP-04 | integration | "migration notification call shape: message + Open Settings + DSA button" | ✅ | ✅ green |
| 17-02-02-test5 | 02 | 2 | NOTIF-03, NOTIF-04, DEP-04 | integration | "clicking 'Don't Show Again' on migration notification suppresses it" | ✅ | ✅ green |
| 17-02-02-test6 | 02 | 2 | DEP-04 (Open Settings UX) | integration | "clicking 'Open Settings' runs workbench.action.openSettings with the extension scope" | ✅ | ✅ green |
| 17-02-02-test7 | 02 | 2 | NOTIF-06 A1 contract | integration | "A1 probe: cfg.inspect() returns per-scope shape for a registered key" | ✅ | ✅ green |
| 17-03-01 | 03 | 3 | suite registration | structural | `grep "migrations suite" test/integration/runTestSuites.ts` | ✅ | ✅ green (commit 27e5af3) |
| 17-03-02 | 03 | 3 | full regression gate | full integration | `npm test` exits 0 (18+ integration suites + 696+ unit tests) | ✅ | ✅ green (per 17-03-SUMMARY) |
| 17-03-03 | 03 | 3 | Phase 12 cache regression fix | exercised by existing suite | `monorepo-scan suite > discoveryDepth=0 disables subdirectory scanning` | ✅ | ✅ green (commit c08ced5) |
| 17-03-04 | 03 | 3 | 15-HUMAN-UAT closeout | doc artifact | `grep "status: complete" .planning/phases/15-notification-suppression/15-HUMAN-UAT.md` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Phase 17 ships **no new product code** (the `src/common.ts` fix was a bug-fix discovered by the regression gate, not a Phase 17 requirement). All Wave 0 deliverables are infrastructure:

- [x] `example-projects/migration-stale/.vscode/settings.json` — pre-seeded stale-keys baseline
- [x] `example-projects/migration-stale/.vscode/settings.template.json` — restore baseline (D-08 mechanism)
- [x] `example-projects/migration-stale/behave.ini` + `features/` + `features-alt/` — minimal so activation enters the migration loop
- [x] `test/integration/migrations suite/index.ts` — Mocha entry; installs `vscode.window.showInformationMessage` stub before runner (RESEARCH §5.2.A)
- [x] `test/integration/migrations suite/extension.test.ts` — 7 tests covering migration outcomes, A1 probe, DSA + Open Settings flows

**Existing infrastructure reused (no new install needed):** Mocha 9.x, `@vscode/test-electron`, sinon, `TestSupport` activation handle, `index.helper.ts` `runner()`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Status |
|----------|-------------|------------|--------|
| (none) | — | All Phase 17 behaviors are now automated. | — |

**Closeout of prior manual debt:** Phase 15's `15-HUMAN-UAT.md` previously listed 2 deferred items (live `inspect()` per-scope contract + live notification DSA flow). Phase 17 D-01..D-03 replaced both with automated `@vscode/test-electron` integration tests (Tests 5 + 7 above). Phase 15 HUMAN-UAT is now `status: complete (closed by Phase 17 automation)`.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (fixture + suite scaffold + suite registration)
- [x] No watch-mode flags (Mocha runs once per `runTests` call; no `--watch`)
- [x] Feedback latency: unit + lint < 30s; new-suite-only run < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete (2026-05-04)

---

## Validation Audit 2026-05-04

| Metric | Count |
|--------|-------|
| Tasks audited | 14 |
| Gaps found | 0 |
| Resolved | 0 (n/a — all tasks already covered) |
| Escalated | 0 |
| Manual-only items | 0 |

**Method:** Verified the 5 provisional rows of the original per-task map against the filesystem, then expanded into the 14 task map above by enumerating the 7 integration tests in `test/integration/migrations suite/extension.test.ts`. Confirmed `runTestSuites.ts` registers the `migrations suite` against `example-projects/migration-stale` (commit 27e5af3). Phase 17's bug-fix in `src/common.ts` (commit c08ced5) is exercised by the pre-existing `monorepo-scan` integration suite — the failing test that surfaced the regression is now green.

**Outcome:** Phase 17 is Nyquist-compliant. No test files added, no escalations. Phase 17 not only achieves its own Nyquist coverage but also closes Phase 15's HUMAN-UAT manual-only debt by replacing it with automated `@vscode/test-electron` integration tests.

---

## Note — Environmental flake

Full `npm test` runs on developer machines with the developer's VS Code instance open hit an environmental mutex flake in `multiroot suite` (`AssertionError: assert(instances)` due to `CrossAppIPC` mutex contention). Multiroot fixtures all have depth-0 root-level configs, so the Phase 12 fix is a logical no-op for them; both pre-fix and post-fix runs exhibit this flake when the dev's VS Code is open. **Recommendation:** run `npm test` in CI or with the developer's VS Code closed. Documented in `17-03-SUMMARY.md`. Not a regression introduced by Phase 17.
