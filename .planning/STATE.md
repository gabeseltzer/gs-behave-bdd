---
gsd_state_version: 1.0
milestone: v1.4.0
milestone_name: Deprecate featuresPath & Notification Suppression
status: active
last_updated: "2026-04-23T23:30:00Z"
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-23 — milestone v1.4.0 started)

**Core value:** Zero-configuration project discovery: tests appear in the Test Explorer without the user touching settings.json — and stay correct as the config evolves.
**Current focus:** Roadmap defined; ready to plan Phase 15

## Current Position

Phase: 15 — Notification Suppression Infrastructure (not started)
Plan: —
Status: Ready to plan
Last activity: 2026-04-23 — Milestone v1.4.0 roadmap created (3 phases, 15 requirements)

## Performance Metrics

**Velocity (cumulative):**

- Milestones shipped: 4 (1.0.0 2026-04-16, 1.1.0 2026-04-17, 1.2.0 2026-04-22, 1.3.0 2026-04-23)
- Total phases completed: 14 (1.0.0: 1-3, 1.1.0: 4-6, 1.2.0: 7-11, 1.3.0: 12-14)
- Total plans completed: 35 (1.0.0: 6, 1.1.0: 9, 1.2.0: 13, 1.3.0: 7)

## Accumulated Context

### Decisions

Full decision log in PROJECT.md Key Decisions table and per-milestone archives:

- 1.0.0: `.planning/milestones/1.0.0-ROADMAP.md`
- 1.1.0: `.planning/milestones/1.1.0-ROADMAP.md`
- 1.2.0: `.planning/milestones/1.2.0-ROADMAP.md`
- 1.3.0: `.planning/milestones/v1.3.0-ROADMAP.md`

### v1.4.0 Decisions

- Migration notification: show user-visible notification after `featuresPath` → `featuresPaths[]` migration
- Suppression infrastructure: single `suppressedNotifications` string array setting (not per-key booleans)
- Suppression writes to WorkspaceFolder scope by default
- Setting is visible in settings UI (not hidden in workspaceState)
