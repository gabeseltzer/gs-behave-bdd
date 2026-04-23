# Roadmap: Auto-Discover Behave Projects

## Milestones

- **1.0.0 Auto-Discover Behave Projects** — Phases 1-3 (shipped 2026-04-16)
- **1.1.0 Config File Watching** — Phases 4-6 (shipped 2026-04-17)
- **1.2.0 Multi-Path & Monorepo-Aware Discovery** — Phases 7-11 (shipped 2026-04-22)
- **1.3.0 Project Switching** — Phases 12-14

## Phases

<details>
<summary>1.0.0 Auto-Discover Behave Projects (Phases 1-3) — SHIPPED 2026-04-16</summary>

- [x] Phase 1: Config Parsing (2/2 plans) — completed 2026-04-15
- [x] Phase 2: Integration (2/2 plans) — completed 2026-04-15
- [x] Phase 3: UX & Verification (2/2 plans) — completed 2026-04-16

Archive: [milestones/1.0.0-ROADMAP.md](milestones/1.0.0-ROADMAP.md)

</details>

<details>
<summary>1.1.0 Config File Watching (Phases 4-6) — SHIPPED 2026-04-17</summary>

- [x] Phase 4: Watcher & Run Guard (2/2 plans) — completed 2026-04-16
- [x] Phase 5: Integration Verification (5/5 plans) — completed 2026-04-17
- [x] Phase 6: 1.1.0 Tech Debt & Admin Cleanup (2/2 plans) — completed 2026-04-17

Archive: [milestones/1.1.0-ROADMAP.md](milestones/1.1.0-ROADMAP.md)

</details>

<details>
<summary>1.2.0 Multi-Path & Monorepo-Aware Discovery (Phases 7-11) — SHIPPED 2026-04-22</summary>

- [x] Phase 7: Internal Multi-Path Types (3/3 plans) — completed 2026-04-20
- [x] Phase 8: Parser / Test-Tree / Watcher Multi-Root Iteration (3/3 plans) — completed 2026-04-21
- [x] Phase 9: Subdirectory Config Scan (3/3 plans) — completed 2026-04-21
- [x] Phase 10: `featuresPaths` User-Facing Settings Key (1/1 plans) — completed 2026-04-21
- [x] Phase 11: UX Polish + Regression Hardening (3/3 plans) — completed 2026-04-21

Archive: [milestones/1.2.0-ROADMAP.md](milestones/1.2.0-ROADMAP.md)

</details>

### 1.3.0 Project Switching (Phases 12-14)

- [x] **Phase 12: Project List Discovery & Persistence** - Scanner promotes all configs as switchable projects; active selection persisted and auto-selected (completed 2026-04-23)
- [ ] **Phase 13: Switching UX (Quick-Pick & Status Bar)** - Select Project command, status bar indicator, output channel logging
- [ ] **Phase 14: Rebuild, Integration Testing & Documentation** - Switch triggers tree + step rebuild; integration test; README additions

## Phase Details

### Phase 12: Project List Discovery & Persistence
**Goal**: Extension discovers all behave projects in a workspace and maintains a persistent project list with one active selection
**Depends on**: Phase 11 (existing scanner infrastructure from 1.2.0)
**Requirements**: DISC-01, DISC-02, DISC-03, DISC-04, DISC-05, INT-04, TEST-01
**Success Criteria** (what must be TRUE):
  1. Scanner returns all discovered configs and stores them in a project list (not just first-match-wins)
  2. Active project selection survives VS Code reload via `workspaceState` persistence
  3. First discovered project is auto-selected when no prior selection exists
  4. Single-project workspaces and manual `projectPath` users see zero behavior change
  5. Config file creation/deletion/modification updates the project list in real time
**Plans:** 2/2 plans complete

Plans:
- [x] 12-01-PLAN.md — ProjectList module with types, CRUD, persistence, auto-selection, fallback + unit tests
- [x] 12-02-PLAN.md — Wire project list into extension activation, discovery cache, and config watcher

### Phase 13: Switching UX (Quick-Pick & Status Bar)
**Goal**: Users can see which project is active and switch between discovered projects via command palette or status bar
**Depends on**: Phase 12
**Requirements**: UX-01, UX-02, UX-03, UX-04, UX-05, INT-03, TEST-02
**Success Criteria** (what must be TRUE):
  1. "Behave BDD: Select Project" command appears in palette and shows a quick-pick with project labels and config file types
  2. Status bar shows the active project's workspace-relative directory and clicking it opens the quick-pick
  3. Status bar item is hidden when only one project exists or `projectPath` is manually set
  4. Discovery output channel log shows which project is active and lists available alternatives
**Plans**: TBD

### Phase 14: Rebuild, Integration Testing & Documentation
**Goal**: Switching the active project triggers full tree and step mapping rebuild; end-to-end integration test verifies the flow; README documents the complete discovery feature set
**Depends on**: Phase 13
**Requirements**: INT-01, INT-02, TEST-03, DOC-01
**Success Criteria** (what must be TRUE):
  1. After switching projects, the Test Explorer shows the new project's features and scenarios
  2. Go-to-step, hover, and completion reflect the new project's step definitions after a switch
  3. Integration test with a multi-project fixture verifies tree rebuilds after switching
  4. README covers auto-discovery, multi-path configs, monorepo scanning, and project switching with examples
**Plans**: TBD

## Backlog

### Phase 999.1: Deprecate `featuresPath` + Reusable Notification Suppression (BACKLOG)

**Goal:** Deprecate the singular `featuresPath` setting in favor of `featuresPaths`, with a migration popup and reusable infrastructure for future deprecations.

**Scope:**
- Mark `featuresPath` as deprecated in package.json (`markdownDeprecationMessage`)
- Show a deprecation notification when singular setting is detected, with 3 buttons:
  - **Migrate** — auto-convert `featuresPath: "x"` → `featuresPaths: ["x"]` in the user's settings
  - **Dismiss for now** — suppress until next session
  - **Never ask again** — permanently suppress via a reusable mechanism
- Reusable deprecation warning/migration utility (expect more deprecations in future milestones)
- Reusable "never ask again" infrastructure: single `suppressedNotifications: string[]` setting (list of notification IDs) instead of per-notification boolean settings
- Update setting description to indicate deprecation

**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Config Parsing | 1.0.0 | 2/2 | Complete | 2026-04-15 |
| 2. Integration | 1.0.0 | 2/2 | Complete | 2026-04-15 |
| 3. UX & Verification | 1.0.0 | 2/2 | Complete | 2026-04-16 |
| 4. Watcher & Run Guard | 1.1.0 | 2/2 | Complete | 2026-04-16 |
| 5. Integration Verification | 1.1.0 | 5/5 | Complete | 2026-04-17 |
| 6. 1.1.0 Tech Debt & Admin Cleanup | 1.1.0 | 2/2 | Complete | 2026-04-17 |
| 7. Internal Multi-Path Types | 1.2.0 | 3/3 | Complete | 2026-04-20 |
| 8. Parser / Test-Tree / Watcher Multi-Root Iteration | 1.2.0 | 3/3 | Complete | 2026-04-21 |
| 9. Subdirectory Config Scan | 1.2.0 | 3/3 | Complete | 2026-04-21 |
| 10. `featuresPaths` User-Facing Settings Key | 1.2.0 | 1/1 | Complete | 2026-04-21 |
| 11. UX Polish + Regression Hardening | 1.2.0 | 3/3 | Complete | 2026-04-21 |
| 12. Project List Discovery & Persistence | 1.3.0 | 2/2 | Complete   | 2026-04-23 |
| 13. Switching UX (Quick-Pick & Status Bar) | 1.3.0 | 0/? | Not started | - |
| 14. Rebuild, Integration Testing & Documentation | 1.3.0 | 0/? | Not started | - |
