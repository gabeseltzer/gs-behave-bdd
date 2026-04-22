# Roadmap: Auto-Discover Behave Projects

## Milestones

- **1.0.0 Auto-Discover Behave Projects** — Phases 1-3 (shipped 2026-04-16)
- **1.1.0 Config File Watching** — Phases 4-6 (shipped 2026-04-17)
- **1.2.0 Multi-Path & Monorepo-Aware Discovery** — Phases 7-11 (shipped 2026-04-22)

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
| 10. `featuresPaths` User-Facing Settings Key | 1.2.0 | 1/1 | Complete    | 2026-04-21 |
| 11. UX Polish + Regression Hardening | 1.2.0 | 3/3 | Complete   | 2026-04-21 |
