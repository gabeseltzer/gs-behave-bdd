# Roadmap: Auto-Discover Behave Projects

## Milestones

- **v1.0 Auto-Discover Behave Projects** — Phases 1-3 (shipped 2026-04-16)
- **v1.1 Config File Watching** — Phases 4-5 (current)

## Phases

<details>
<summary>v1.0 Auto-Discover Behave Projects (Phases 1-3) — SHIPPED 2026-04-16</summary>

- [x] Phase 1: Config Parsing (2/2 plans) — completed 2026-04-15
- [x] Phase 2: Integration (2/2 plans) — completed 2026-04-15
- [x] Phase 3: UX & Verification (2/2 plans) — completed 2026-04-16

</details>

### v1.1 Config File Watching

- [ ] **Phase 4: Watcher & Run Guard** - Config file watchers with debounce + malformed-config run guard with unit tests
- [ ] **Phase 5: Integration Verification** - End-to-end integration test confirming config file change triggers test tree rebuild
- [ ] **Phase 6: v1.1 Tech Debt & Admin Cleanup** - Close code review findings and planning hygiene from v1.1 milestone audit

## Phase Details

### Phase 4: Watcher & Run Guard
**Goal**: Users see the test tree update automatically when a behave config file changes, and are warned before running tests against a workspace with a malformed config
**Depends on**: Phase 3 (v1.0)
**Requirements**: WATCH-01, WATCH-02, WATCH-03, WATCH-04, WATCH-05, WATCH-06, GUARD-01, GUARD-02, GUARD-03, GUARD-04, TEST-07, TEST-09
**Success Criteria** (what must be TRUE):
  1. User saves a change to `behave.ini` (or any of the 5 config formats) and the VS Code Test Explorer updates within 1 second without any manual action
  2. User creates a new `behave.ini` in a workspace root and the test tree rebuilds automatically; user deletes it and discovery falls back to convention
  3. User clicks "Run Tests" in a workspace whose config file has a parse error and sees a warning popup with "Run Anyway", "Open Config File", and "Cancel" options — the run does not proceed until the user chooses
  4. Warning popup fires for both regular test runs and debug sessions (GUARD-03)
  5. In a multi-root workspace, a malformed config in one folder does not block test runs in healthy folders
**Plans:** 2 plans
Plans:
- [x] 04-01-PLAN.md — Config file watcher with debounce + extension.ts wiring + watcher unit tests
- [x] 04-02-PLAN.md — Run guard in testRunHandler + run guard unit tests

### Phase 5: Integration Verification
**Goal**: The watcher + run guard behavior is verified end-to-end through an automated integration test so regressions are caught at CI time
**Depends on**: Phase 4
**Requirements**: TEST-08
**Gap Closure**: Closes TEST-08 (unsatisfied) and the `config-edit → test-tree-update` flow gap from v1.1-MILESTONE-AUDIT.md. Automated coverage obsoletes the 5 human UAT items pending for Phase 4.
**Success Criteria** (what must be TRUE):
  1. Integration test edits a behave config file on disk and verifies the VS Code Test Explorer contains the updated test items after the debounce period
  2. Test suite runs green in CI alongside existing 17 integration test suites with no new flakiness
**Plans:** 5 plans
Plans:
- [ ] 05-01-PLAN.md — Fixture scaffolding: example-projects/watcher-integration/ with behave.ini + features/ + features-alt/
- [ ] 05-02-PLAN.md — Shared poll helper: test/integration/suite-shared/waitForTestTree.ts
- [ ] 05-03-PLAN.md — Watcher integration suite: delete/create/change tests in extension.test.ts + index.ts
- [ ] 05-04-PLAN.md — Run-guard integration suite: three-branch tests in runGuard.test.ts
- [ ] 05-05-PLAN.md — Register 18th suite in runTestSuites.ts + three-runs flakiness gate + close TEST-08

### Phase 6: v1.1 Tech Debt & Admin Cleanup
**Goal**: Close code review findings and planning hygiene issues identified by the v1.1 milestone audit so v1.1 ships clean
**Depends on**: Phase 4 (code fixes target Phase 4 source files)
**Requirements**: None (tech debt + admin hygiene, no new REQ-IDs)
**Gap Closure**: Closes audit `tech_debt` section — WR-01, WR-02, IN-01, IN-02 code review findings + 2 admin hygiene items
**Success Criteria** (what must be TRUE):
  1. `src/runners/testRunHandler.ts` — `completed` diagLog fires on success (moved into finally), all `==` replaced with `===`, stray `}` removed from template literal at line 464
  2. `src/watchers/configWatcher.ts` — `configDebounceTimers` Map key normalized via `uriId()` (or decision documented in code comment)
  3. `.planning/phases/04-watcher-run-guard/04-02-SUMMARY.md` has `requirements_completed: [GUARD-01, GUARD-02, GUARD-03, GUARD-04, TEST-09]` in YAML frontmatter
  4. `.planning/REQUIREMENTS.md` traceability table shows 12 satisfied v1.1 requirements as `[x]` / Complete (only TEST-08 remains Pending until Phase 5 executes)
  5. `npx eslint src --ext ts` and `npm run test:unit` both pass clean after code fixes
**Plans:** 2 plans
Plans:
- [x] 06-01-PLAN.md — Code fixes: WR-01, WR-02, IN-01, IN-02 in testRunHandler.ts + configWatcher.ts
- [x] 06-02-PLAN.md — Admin: requirements_completed frontmatter + REQUIREMENTS.md traceability updates

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Config Parsing | v1.0 | 2/2 | Complete | 2026-04-15 |
| 2. Integration | v1.0 | 2/2 | Complete | 2026-04-15 |
| 3. UX & Verification | v1.0 | 2/2 | Complete | 2026-04-16 |
| 4. Watcher & Run Guard | v1.1 | 2/2 | Code-complete (UAT pending; obsoleted by Phase 5) | - |
| 5. Integration Verification | v1.1 | 0/5 | Planned | - |
| 6. v1.1 Tech Debt & Admin Cleanup | v1.1 | 2/2 | Complete | 2026-04-17 |
