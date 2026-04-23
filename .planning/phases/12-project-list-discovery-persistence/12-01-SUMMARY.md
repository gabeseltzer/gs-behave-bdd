---
phase: 12-project-list-discovery-persistence
plan: 01
status: complete
started: 2026-04-23T18:10:00Z
completed: 2026-04-23T18:25:00Z
---

# Plan 12-01 Summary: ProjectList Module

## What Was Built

Self-contained data layer (`src/discovery/projectList.ts`) for managing discovered behave projects per workspace. Stores all scanner-discovered configs as switchable project entries, persists active selection via `workspaceState`, handles auto-selection and fallback logic, and provides CRUD operations.

## Key Files

### Created
- `src/discovery/projectList.ts` — ProjectList module with 10 exported functions + ProjectEntry interface
- `test/unit/discovery/projectList.test.ts` — 14 unit tests covering all operations

## Key Decisions

- Persistence key format: `gs-behave-bdd.activeProject.<uriId>` storing `{ configFilePath: string }`
- Scanner order maintained in storage (depth ASC, configPriority ASC); presentation ordering deferred to Phase 13
- `restoreOrAutoSelectActive` is internal (not exported) — called automatically by `rebuildProjectList`
- `workspaceState.update()` fire-and-forget (no await) per VS Code persistence semantics
- `isManualProjectPathMode` reads workspace config inline using `hasExplicitSetting` from common.ts

## Verification

- ESLint: 0 errors
- Unit tests: 14/14 passing (634 total passing)

## Self-Check: PASSED
