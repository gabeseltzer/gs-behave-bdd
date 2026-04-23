---
phase: 13-switching-ux-quick-pick-status-bar
plan: 01
subsystem: ui

tags: [quick-pick, status-bar, vscode-commands, project-switching]

requires:
  - phase: 12-project-list-discovery-persistence
    provides: ProjectList module (getProjectList, getActiveProject, setActiveProject, isManualProjectPathMode)

provides:
  - gs-behave-bdd.selectProject command with quick-pick UI
  - Status bar indicator showing active project
  - Output channel logging for project switches and startup project list
  - Updated multi-config notification referencing Select Project command

affects: [13-02, 14-rebuild-on-switch]

tech-stack:
  added: []
  patterns:
    - "createQuickPick with ProjectQuickPickItem interface for button support"
    - "Module-level updateProjectStatusBarFn callback for cross-function status bar updates"

key-files:
  created: []
  modified:
    - package.json
    - src/extension.ts

key-decisions:
  - "Status bar positioned Left with priority 50"
  - "Root-level projects display as '(root)' in quick-pick and status bar"
  - "Status bar hidden when <=1 project or manual projectPath mode"
  - "Multi-config notification now says 'Select Project' instead of 'Open Settings'"
  - "Arrow function used for updateProjectStatusBar to satisfy ESLint no-inner-declarations"

patterns-established:
  - "Module-level callback pattern: updateProjectStatusBarFn bridges activate()-scoped closures with module-level functions"

requirements-completed:
  - UX-01
  - UX-02
  - UX-03
  - UX-04
  - UX-05
  - INT-03

duration: 12min
completed: 2026-04-23
---

# Phase 13 Plan 01: Select Project Command & Status Bar Summary

**Quick-pick project switcher with status bar indicator and output channel logging — full UX layer for multi-project workspaces.**

## What Was Built

1. **Select Project Command** (`gs-behave-bdd.selectProject`): Quick-pick listing all discovered projects with label, config type description, full config path detail, active marker (✓ active), and open-config action button.

2. **Status Bar Item**: Shows `Behave: <label>` on left side, hides when single project or manual mode, tooltip with project count and switch hint.

3. **Output Logging**: Single-line switch log (`Active project switched to: <label> (<configType>)`), bulleted startup list when multiple projects exist.

4. **Notification Update**: Phase 9's multi-config notification now references "Behave BDD: Select Project" with a "Select Project" button instead of "Open Settings".

5. **Legacy Alias**: `behave-vsc.selectProject` registered for migration compatibility.

## Task Completion

| Task | Status | Commit |
|------|--------|--------|
| 1: Register command + implement quick-pick + status bar + logging | ✅ Complete | 91abe63 |

## Deviations from Plan

- **[Rule 1 - Bug] ESLint no-inner-declarations**: The `updateProjectStatusBar` function declaration inside `activate()`'s try block triggered ESLint. Converted to `const` arrow function.
- **Module-level callback pattern**: Plan suggested storing a module-level variable reference. Implemented as `updateProjectStatusBarFn` arrow assigned inside `activate()`, called from `updateDiscoveryUX`. This is the cleanest way to bridge the closure scope.

## Verification

- `npx eslint src --ext ts` — clean (exit 0)
- `npm run test:unit` — 634 tests passing
- All 15 acceptance criteria verified programmatically

## Next Steps

Ready for Plan 02 (unit tests for command and status bar).
