---
phase: 07-internal-multi-path-types
plan: 01
subsystem: parsers
tags: [parser, types, multi-path, windows-normalization]
requires: []
provides: [BehaveConfigResult.resolvedPaths, normalizeSeparators]
affects: [src/common.ts]
tech-stack:
  added: []
  patterns: [plural-type-with-singular-compat]
key-files:
  created:
    - test/unit/parsers/fixtures/config/windows-backslash/behave.ini
  modified:
    - src/parsers/configParser.ts
    - src/common.ts
    - test/unit/parsers/configParser.test.ts
key-decisions:
  - "normalizeSeparators uses replaceAll('\\\\', '/') matching existing precedent in runOrDebug.ts"
  - "Bridge patch in common.ts reads configResult.resolvedPaths[0] — temporary until Plan 02"
requirements-completed: [MP-02, TEST-12]
duration: "4 min"
completed: "2026-04-20"
---

# Phase 7 Plan 01: configParser Plural Types Summary

Renamed `BehaveConfigResult.resolvedPath: Uri` to `resolvedPaths: Uri[]` and taught `resolvePaths` to map every rawPaths entry through a new `normalizeSeparators` helper for Windows backslash handling.

## Duration

Started: 2026-04-20 | Completed: 2026-04-20 | Duration: ~4 min

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | RED: failing tests for plural rename + Windows normalization | `6cf8673` | configParser.test.ts, windows-backslash/behave.ini |
| 2 | GREEN: implement plural type, normalizeSeparators, bridge common.ts | `eb61e9e` | configParser.ts, common.ts |

## What Was Built

- `BehaveConfigResult.ok:true` now carries `resolvedPaths: vscode.Uri[]` (was singular `resolvedPath: Uri`)
- `resolvePaths()` maps every rawPaths entry through normalization + absolute/relative resolution
- Private `normalizeSeparators()` helper converts `\` → `/` before URI construction (D-10)
- Multi-path test asserts `resolvedPaths.length === 3` on the 3-path fixture
- Windows backslash test suite: 2 cases (relative normalization + absolute drive letter)
- Bridge patch in `src/common.ts` Branch B reads `configResult.resolvedPaths[0]` to keep compile green

## Test Results

- 546 unit tests passing (was 539 baseline)
- Lint: `npx eslint src --ext ts` exit 0

## Deviations from Plan

None — plan executed exactly as written.

## Next

Plan 02 picks up at `DiscoveryEntry.featuresUri → featuresUris: Uri[]` rename in `common.ts` + `extension.ts`.
