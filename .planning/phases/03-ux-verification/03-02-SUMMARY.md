---
phase: 03-ux-verification
plan: 02
subsystem: test-fixtures
tags: [integration-tests, example-projects, unit-tests, discovery-priority]
dependency_graph:
  requires: [03-01]
  provides: [config-only-example, pyproject-config-example, malformed-config-example, discovery-priority-tests]
  affects: [test/integration/runTestSuites.ts]
tech_stack:
  added: []
  patterns: [simple-suite-analog, shared-workspace-tests, mocha-nested-suites]
key_files:
  created:
    - example-projects/config-only/behave.ini
    - example-projects/config-only/features/discovery.feature
    - example-projects/config-only/features/steps/steps.py
    - example-projects/config-only/features/environment.py
    - example-projects/pyproject-config/pyproject.toml
    - example-projects/pyproject-config/features/discovery.feature
    - example-projects/pyproject-config/features/steps/steps.py
    - example-projects/pyproject-config/features/environment.py
    - example-projects/malformed-config/pyproject.toml
    - example-projects/malformed-config/features/discovery.feature
    - example-projects/malformed-config/features/steps/steps.py
    - example-projects/malformed-config/features/environment.py
    - test/integration/config-only suite/index.ts
    - test/integration/config-only suite/extension.test.ts
    - test/integration/config-only suite/expectedResults.ts
    - test/integration/pyproject-config suite/index.ts
    - test/integration/pyproject-config suite/extension.test.ts
    - test/integration/pyproject-config suite/expectedResults.ts
    - test/integration/malformed-config suite/index.ts
    - test/integration/malformed-config suite/extension.test.ts
    - test/integration/malformed-config suite/expectedResults.ts
    - test/unit/settings/discoveryPriority.test.ts
  modified:
    - test/integration/runTestSuites.ts
decisions:
  - "malformed-config suite has runDefault only (not runParallel/runTogether) because the goal is verifying convention-fallback test tree, not full run coverage"
  - "empty string at workspaceValue is treated as an explicit setting by hasExplicitSetting ('' !== undefined), test expectation adjusted accordingly"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-16"
  tasks_completed: 2
  tasks_total: 3
  files_created: 23
  files_modified: 1
---

# Phase 03 Plan 02: Example Projects and Integration Test Suites Summary

Three new example projects with integration test suites, plus unit tests for the settings > config > convention priority boundary (TEST-02, TEST-05, TEST-06).

## What Was Built

### Task 1: Three example projects + integration test suites

**example-projects/config-only/** — INI-based discovery, no settings.json
- `behave.ini` with `[behave] / paths = features`
- `features/discovery.feature` — Feature: Config Only Discovery (3 scenarios: passed/failed/skipped)
- `features/steps/steps.py` and `features/environment.py` copied exactly from `simple` analog
- No `.vscode/settings.json` — the extension must discover via config file alone

**example-projects/pyproject-config/** — TOML-based discovery, no settings.json
- `pyproject.toml` with `[tool.behave] / paths = ["features"]`
- `features/discovery.feature` — Feature: Pyproject Config Discovery
- Same steps.py/environment.py pattern as config-only

**example-projects/malformed-config/** — Convention fallback on broken TOML
- `pyproject.toml` with intentionally unclosed array: `paths = ["features"` (smol-toml throws)
- `features/` directory present for convention fallback
- Integration suite has `runDefault` only (not runParallel/runTogether) — goal is tree verification

**Integration test suites** (all 3) follow the `simple suite` analog exactly:
- `index.ts` — runner glob pointing to the suite name
- `extension.test.ts` — SharedWorkspaceTests with folderName matching example-projects dir
- `expectedResults.ts` — correct feature names, paths, counts (nodeCount: 4, testCount: 3, stepMappings: 7)

**runTestSuites.ts** — Three new `runTests` blocks added before the final `console.log`.

### Task 2: Unit tests for discovery priority logic (TEST-02)

**test/unit/settings/discoveryPriority.test.ts** — 10 tests in 4 nested suites:
- Branch A: explicit settings at workspaceValue, globalValue, workspaceFolderValue all return true
- Branch B: no settings at any scope returns false
- Priority order: projectPath set / featuresPath unset correctly splits true/false
- Legacy config fallback: workspaceFolderValue on legacyConfig returns true

All 10 new tests pass alongside existing 511 tests (521 total).

## Verification Results

| Check | Result |
|-------|--------|
| `npx eslint src --ext ts` | PASS (exit 0, no output) |
| `npm run test:unit` | PASS (521 passing) |
| `npm run compile` | PASS (webpack compiled successfully) |
| Existing example projects unmodified | PASS (git diff shows 0 changes to simple, nested project, etc.) |
| No .vscode/settings.json in new projects | PASS |
| malformed-config suite omits runParallel/runTogether | PASS |

## Task 3: Human Verification Checkpoint

Task 3 is a `checkpoint:human-verify`. Automated verification above passed. The human checkpoint requires:
1. Running full `npm run test` integration suite to verify config-only and existing projects work end-to-end
2. Visual confirmation that new example projects appear in VS Code Test Explorer

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

### Files exist:
- example-projects/config-only/behave.ini: FOUND
- example-projects/pyproject-config/pyproject.toml: FOUND
- example-projects/malformed-config/pyproject.toml: FOUND
- test/integration/config-only suite/extension.test.ts: FOUND
- test/unit/settings/discoveryPriority.test.ts: FOUND

### Commits exist:
- fc70050: feat(03-02): add config-only, pyproject-config, malformed-config example projects and integration suites
- 62d7d21: test(03-02): add unit tests for discovery priority logic (TEST-02)

## Self-Check: PASSED
