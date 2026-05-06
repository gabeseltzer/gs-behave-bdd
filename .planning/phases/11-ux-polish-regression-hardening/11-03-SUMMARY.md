---
phase: 11-ux-polish-regression-hardening
plan: 03
subsystem: testing
tags: [integration-tests, flakiness-gate, windows, ci]

requires:
  - phase: 11-ux-polish-regression-hardening
    plan: 01
    provides: multi-path, multi-path-settings, monorepo-scan fixtures
  - phase: 11-ux-polish-regression-hardening
    plan: 02
    provides: integration test suites for all three fixtures

provides:
  - Verified 3× consecutive Windows integration test passes with zero flaky failures

affects: []

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - src/settings.ts
    - src/common.ts
    - src/logger.ts
    - src/extension.ts
    - src/testWorkspaceConfig.ts
    - test/integration/monorepo-scan suite/extension.test.ts

key-decisions:
  - "8 pre-existing bugs discovered and fixed during the flakiness gate before all suites passed"
  - "Logger ensureChannel() lazy-init pattern prevents crashes when workspace folders list is empty during early activation"
  - "WorkspaceSettings Rung 3 (config-file discovery paths) gated on hasExplicitSetting to prevent package.json defaults from shadowing config-file discovery"
  - "getUrisOfWkspFoldersWithFeatures returns empty array instead of throwing on 0 folders — allows BFS scanner to run after activate"
  - "configurationChangedHandler forceFullRefresh parameter bypasses integration test guard for real settings changes"

patterns-established:
  - "flakiness-gate: 3× consecutive passes required before milestone close, matching v1.1 Phase 5 precedent"

requirements-completed: [TEST-15]

duration: 3h
completed: 2026-04-21
---

## Summary

Completed the 3× Windows CI flakiness gate checkpoint. During the process, 8 bugs were discovered and fixed across the discovery, settings, logger, and extension systems. After all fixes, the full integration test suite (17 suites) passed 3 consecutive runs on Windows with zero failures and zero retries.

## Bugs Fixed

1. **WorkspaceSettings ignored config-file discovery paths** — Added Rung 3 in precedence ladder
2. **package.json default shadowed config-file discovery** — Gated Rung 2 on `hasExplicitSetting()`
3. **Plural featuresPaths not processed in Branch A** — Added plural handling before singular path logic
4. **0-folder throw killed activate()** — Changed to return empty array
5. **Logger crash on empty workspace folders** — Added early return + `ensureChannel()` lazy init
6. **Integration test guard blocked real settings changes** — Added `forceFullRefresh` bypass
7. **BFS re-scan missing after discoveryDepth change** — Added re-scan block in configurationChangedHandler
8. **TestWorkspaceConfig missing discovery fields** — Added discoveryDepth, discoveryStopOnFirstHit, suppressMultiConfigNotification

## Verification

- 3× consecutive `npm run test:integration` — all 17 suites pass, exit code 0
- Zero `--retries` or `.skip` in any new test file
- 614 unit tests pass, lint clean
