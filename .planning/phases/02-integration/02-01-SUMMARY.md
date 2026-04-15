---
phase: 02-integration
plan: "01"
subsystem: config-parser
tags: [discriminated-union, error-handling, activation-events, typescript]
dependency_graph:
  requires: []
  provides: [BehaveConfigResult-discriminated-union, malformed-toml-error-variant, behave-ini-activation]
  affects: [src/parsers/configParser.ts, test/unit/parsers/configParser.test.ts, package.json]
tech_stack:
  added: []
  patterns: [discriminated-union, ok-flag-narrowing, first-error-fallthrough]
key_files:
  created:
    - test/unit/parsers/fixtures/config/malformed-toml/pyproject.toml
  modified:
    - src/parsers/configParser.ts
    - test/unit/parsers/configParser.test.ts
    - package.json
decisions:
  - "BehaveConfigResult changed from interface to discriminated union type with ok:true/ok:false branches (D-05)"
  - "searchConfigFiles captures first malformed error and keeps searching so a valid later config wins (D-06)"
  - "INI parser returns undefined for all non-success cases; only TOML catch block returns ok:false"
  - "Only behave.ini and .behaverc added to activationEvents; setup.cfg/tox.ini/pyproject.toml omitted (too generic)"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-15"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 4
---

# Phase 2 Plan 01: Discriminated Union and Activation Events Summary

BehaveConfigResult evolved from a flat interface to an ok:true/ok:false discriminated union, enabling the Phase 2 gatekeeper to distinguish malformed configs from missing configs; activation events expanded to include behave.ini and .behaverc.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add discriminated union to BehaveConfigResult and error variant returns | 29a69a8 | src/parsers/configParser.ts, test/unit/parsers/fixtures/config/malformed-toml/pyproject.toml |
| 2 | Update configParser tests for discriminated union and add error variant tests | fc6bd9c | test/unit/parsers/configParser.test.ts |
| 3 | Expand activationEvents in package.json (D-03, INTG-05) | 4ad0b3c | package.json |

## What Was Built

### `src/parsers/configParser.ts` — Discriminated Union Return Type

Replaced the flat `BehaveConfigResult` interface with a TypeScript discriminated union:

- `{ ok: true; configFileUri; format; rawPaths; resolvedPath }` — valid config found and parsed
- `{ ok: false; configFileUri; errorMessage }` — config file found but malformed (smol-toml threw)
- `undefined` — no config file found at all (unchanged semantics)

`buildResult()` now includes `ok: true` as first field. `parseTomlConfig()` catch block returns the error variant instead of silently swallowing parse errors. `searchConfigFiles()` captures the first malformed error but keeps searching so a valid config file later in priority order can still win (D-06 fallthrough behaviour).

### `test/unit/parsers/fixtures/config/malformed-toml/pyproject.toml` — Error Variant Fixture

New fixture with an unclosed TOML array (`paths = ["features"` without closing `]`). smol-toml throws a parse error on this file, triggering the `ok: false` return path.

### `test/unit/parsers/configParser.test.ts` — Updated Tests (12 + 3 new = 15 total)

All 12 existing success-path tests updated with `assert.strictEqual(result.ok, true)` guard and `if (!result.ok) return;` TypeScript narrowing before accessing `result.format`, `result.rawPaths`, etc.

New suite `findBehaveConfig - error variant (D-05)` with 3 tests:
1. Malformed TOML returns `ok: false` with non-empty `errorMessage`
2. INI without `[behave]` section still returns `undefined` (not an error)
3. TOML without `[tool.behave]` still returns `undefined` (not an error)

### `package.json` — Expanded Activation Events

Added two new activation triggers:
- `workspaceContains:**/behave.ini`
- `workspaceContains:**/.behaverc`

`setup.cfg`, `tox.ini`, and `pyproject.toml` deliberately excluded — they are generic Python files that would cause false activations on non-behave projects.

## Verification Results

- `npx eslint src --ext ts`: exits 0, no output (clean)
- `npm run test:unit`: 500 passing, 0 failing
- `node -e "..."` activationEvents check: 3 entries confirmed

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all changes are complete implementations with no placeholder values.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced beyond what the plan's threat model documents.

## Self-Check: PASSED

- `src/parsers/configParser.ts` — confirmed contains `export type BehaveConfigResult =`, `ok: true`, `ok: false`
- `test/unit/parsers/fixtures/config/malformed-toml/pyproject.toml` — exists (created in Task 1)
- `test/unit/parsers/configParser.test.ts` — confirmed contains `result.ok, true` and `findBehaveConfig - error variant (D-05)` suite
- `package.json` — confirmed 3 activationEvents entries
- Commits 29a69a8, fc6bd9c, 4ad0b3c — all present in git log
