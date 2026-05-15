# Roadmap: Auto-Discover Behave Projects

## Milestones

- ✅ **1.0.0 Auto-Discover Behave Projects** — Phases 1-3 (shipped 2026-04-16)
- ✅ **1.1.0 Config File Watching** — Phases 4-6 (shipped 2026-04-17)
- ✅ **1.2.0 Multi-Path & Monorepo-Aware Discovery** — Phases 7-11 (shipped 2026-04-22)
- ✅ **1.3.0 Project Switching** — Phases 12-14 (shipped 2026-04-23)
- ✅ **v1.4.0 Deprecate featuresPath & Notification Suppression** — Phases 15-18 (shipped 2026-05-04)
- ✅ **v1.5.0 Migration Consent & `behave-vsc` Cleanup** — Phases 19-23 (shipped 2026-05-15)
- 📋 **v1.6.0** — TBD (next milestone — duplicate-scenario detection rework)

## Phases

<details>
<summary>✅ 1.0.0 Auto-Discover Behave Projects (Phases 1-3) — SHIPPED 2026-04-16</summary>

- [x] Phase 1: Config Parsing (2/2 plans) — completed 2026-04-15
- [x] Phase 2: Integration (2/2 plans) — completed 2026-04-15
- [x] Phase 3: UX & Verification (2/2 plans) — completed 2026-04-16

Archive: [milestones/1.0.0-ROADMAP.md](milestones/1.0.0-ROADMAP.md)

</details>

<details>
<summary>✅ 1.1.0 Config File Watching (Phases 4-6) — SHIPPED 2026-04-17</summary>

- [x] Phase 4: Watcher & Run Guard (2/2 plans) — completed 2026-04-16
- [x] Phase 5: Integration Verification (5/5 plans) — completed 2026-04-17
- [x] Phase 6: 1.1.0 Tech Debt & Admin Cleanup (2/2 plans) — completed 2026-04-17

Archive: [milestones/1.1.0-ROADMAP.md](milestones/1.1.0-ROADMAP.md)

</details>

<details>
<summary>✅ 1.2.0 Multi-Path & Monorepo-Aware Discovery (Phases 7-11) — SHIPPED 2026-04-22</summary>

- [x] Phase 7: Internal Multi-Path Types (3/3 plans) — completed 2026-04-20
- [x] Phase 8: Parser / Test-Tree / Watcher Multi-Root Iteration (3/3 plans) — completed 2026-04-21
- [x] Phase 9: Subdirectory Config Scan (3/3 plans) — completed 2026-04-21
- [x] Phase 10: `featuresPaths` User-Facing Settings Key (1/1 plans) — completed 2026-04-21
- [x] Phase 11: UX Polish + Regression Hardening (3/3 plans) — completed 2026-04-21

Archive: [milestones/1.2.0-ROADMAP.md](milestones/1.2.0-ROADMAP.md)

</details>

<details>
<summary>✅ 1.3.0 Project Switching (Phases 12-14) — SHIPPED 2026-04-23</summary>

- [x] Phase 12: Project List Discovery & Persistence (2/2 plans) — completed 2026-04-23
- [x] Phase 13: Switching UX (Quick-Pick & Status Bar) (2/2 plans) — completed 2026-04-23
- [x] Phase 14: Rebuild, Integration Testing & Documentation (3/3 plans) — completed 2026-04-23

Archive: [milestones/v1.3.0-ROADMAP.md](milestones/v1.3.0-ROADMAP.md)

</details>

<details>
<summary>✅ v1.4.0 Deprecate featuresPath & Notification Suppression (Phases 15-18) — SHIPPED 2026-05-04</summary>

- [x] Phase 15: Notification Suppression Infrastructure (6/6 plans) — completed 2026-04-27
- [x] Phase 16: Deprecate featuresPath (6/6 plans) — completed 2026-04-29
- [x] Phase 17: Cross-Cutting Verification (3/3 plans) — completed 2026-04-30
- [x] Phase 18: Tech debt closure — artifact rollups + mock cleanup (2/2 plans) — completed 2026-05-04

Archive: [milestones/v1.4.0-ROADMAP.md](milestones/v1.4.0-ROADMAP.md)

</details>

<details>
<summary>✅ v1.5.0 Migration Consent & `behave-vsc` Cleanup (Phases 19-23) — SHIPPED 2026-05-15</summary>

- [x] Phase 19: Migration Foundation (4/4 plans) — completed 2026-05-07
- [x] Phase 20: Migration Registry (5/5 plans) — completed 2026-05-08
- [x] Phase 21: Consent UX (Case 2 & Case 3 Prompts) (3/3 plans) — completed 2026-05-11
- [x] Phase 22: Cleanup, Integration & Docs (3/3 plans) — completed 2026-05-12
- [x] Phase 23: Migrations Panel (Webview) (5/5 plans) — completed 2026-05-14

Archive: [milestones/v1.5.0-ROADMAP.md](milestones/v1.5.0-ROADMAP.md)
Audit: [milestones/v1.5.0-MILESTONE-AUDIT.md](milestones/v1.5.0-MILESTONE-AUDIT.md)

</details>

### 📋 v1.6.0 (Planned)

To be defined via `/gsd-new-milestone`. Seed: duplicate-scenario detection — stop using local regex to detect duplicates; lift duplicates (and their locations) directly from behave's output and surface them in the Problems pane.
