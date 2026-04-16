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
**Success Criteria** (what must be TRUE):
  1. Integration test edits a behave config file on disk and verifies the VS Code Test Explorer contains the updated test items after the debounce period
  2. Test suite runs green in CI alongside existing 17 integration test suites with no new flakiness
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Config Parsing | v1.0 | 2/2 | Complete | 2026-04-15 |
| 2. Integration | v1.0 | 2/2 | Complete | 2026-04-15 |
| 3. UX & Verification | v1.0 | 2/2 | Complete | 2026-04-16 |
| 4. Watcher & Run Guard | v1.1 | 0/2 | Not started | - |
| 5. Integration Verification | v1.1 | 0/? | Not started | - |
