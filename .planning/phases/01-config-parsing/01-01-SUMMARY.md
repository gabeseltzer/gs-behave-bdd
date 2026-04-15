---
phase: 01-config-parsing
plan: 01
subsystem: testing
tags: [smol-toml, ini-parser, toml-parser, behave, vscode-uri, typescript]

# Dependency graph
requires: []
provides:
  - "src/parsers/configParser.ts: findBehaveConfig() entry point + BehaveConfigResult interface"
  - "9 test fixture directories under test/unit/parsers/fixtures/config/"
affects:
  - 01-02 (unit tests for configParser.ts consume these fixtures)
  - 02-integration (WorkspaceSettings integration consumes findBehaveConfig)

# Tech tracking
tech-stack:
  added:
    - "smol-toml v1.6.0 (already installed): TOML parsing for pyproject.toml"
  patterns:
    - "Stateless parser module: no module-level Maps or caching (Phase 2 adds cache)"
    - "Hand-rolled INI parser matching Python configparser continuation-line semantics"
    - "CONFIG_FILES array for priority-ordered config file search"
    - "Return undefined on missing/invalid config (never throw from helpers)"

key-files:
  created:
    - src/parsers/configParser.ts
    - test/unit/parsers/fixtures/config/behave-ini/behave.ini
    - test/unit/parsers/fixtures/config/behaverc/.behaverc
    - test/unit/parsers/fixtures/config/setup-cfg/setup.cfg
    - test/unit/parsers/fixtures/config/tox-ini/tox.ini
    - test/unit/parsers/fixtures/config/pyproject-toml/pyproject.toml
    - test/unit/parsers/fixtures/config/no-behave-section/behave.ini
    - test/unit/parsers/fixtures/config/malformed-ini/behave.ini
    - test/unit/parsers/fixtures/config/no-tool-behave/pyproject.toml
    - test/unit/parsers/fixtures/config/multi-path/behave.ini
  modified:
    - test/tsconfig.json

key-decisions:
  - "Hand-rolled INI parser (not npm package): no npm package replicates Python configparser continuation-line semantics accurately"
  - "smol-toml for TOML parsing: already installed, CJS-compatible, TOML 1.0 spec compliant, ~5KB"
  - "Stateless module in Phase 1: caching added in Phase 2, not here"
  - "skipLibCheck in test/tsconfig.json: fixes pre-existing smol-toml/TS 4.5.5 ErrorOptions incompatibility"

patterns-established:
  - "Pattern: CONFIG_FILES const array with {filename, format} entries drives priority-ordered discovery"
  - "Pattern: parseIniConfig / parseTomlConfig helpers return undefined on any error, never throw"
  - "Pattern: resolvePaths checks both Unix and Windows absolute path prefixes"

requirements-completed: [DISC-01, DISC-02, DISC-03, DISC-04, DISC-05, DISC-06]

# Metrics
duration: 3min
completed: 2026-04-15
---

# Phase 01 Plan 01: Config Parser Module and Test Fixtures Summary

**Stateless `configParser.ts` module with hand-rolled INI parser and smol-toml TOML parser, reading all 5 behave config formats in priority order and resolving feature paths as `vscode.Uri`**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-15T19:24:14Z
- **Completed:** 2026-04-15T19:27:17Z
- **Tasks:** 2
- **Files modified:** 11 (1 parser module, 9 fixture files, 1 tsconfig)

## Accomplishments

- `src/parsers/configParser.ts` created: exports `BehaveConfigResult` interface and `findBehaveConfig()` function — the core Phase 1 deliverable
- 9 test fixture directories created under `test/unit/parsers/fixtures/config/`, covering all formats and edge cases
- Pre-existing smol-toml/TypeScript 4.5.5 type incompatibility resolved by adding `skipLibCheck: true` to `test/tsconfig.json`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create test fixture config files** - `a89b1b0` (chore)
2. **Task 2: Create configParser.ts parser module** - `9aebe81` (feat)

## Files Created/Modified

- `src/parsers/configParser.ts` - Core parser: `findBehaveConfig(wkspUri)` entry point, hand-rolled INI parser with continuation-line semantics, smol-toml TOML parser, path resolution via `vscode.Uri.joinPath`
- `test/unit/parsers/fixtures/config/behave-ini/behave.ini` - Standard behave.ini with `[behave] paths = features`
- `test/unit/parsers/fixtures/config/behaverc/.behaverc` - Same structure, different filename
- `test/unit/parsers/fixtures/config/setup-cfg/setup.cfg` - `[behave]` section alongside `[metadata]`
- `test/unit/parsers/fixtures/config/tox-ini/tox.ini` - `[behave]` section alongside `[tox]`
- `test/unit/parsers/fixtures/config/pyproject-toml/pyproject.toml` - `[tool.behave]` with `paths = ["features"]`
- `test/unit/parsers/fixtures/config/no-behave-section/behave.ini` - Has `[other]` but no `[behave]` (returns undefined)
- `test/unit/parsers/fixtures/config/malformed-ini/behave.ini` - Invalid INI syntax (returns undefined without throwing)
- `test/unit/parsers/fixtures/config/no-tool-behave/pyproject.toml` - Has `[tool.pytest]` but no `[tool.behave]` (returns undefined)
- `test/unit/parsers/fixtures/config/multi-path/behave.ini` - 3-path continuation-line fixture
- `test/tsconfig.json` - Added `skipLibCheck: true` to resolve smol-toml/TS 4.5.5 incompatibility

## Decisions Made

- Used hand-rolled INI parser instead of `ini` npm package — no npm package replicates Python configparser continuation-line semantics (indented lines = continuation, blank/comment lines break continuation)
- Used `smol-toml` for TOML parsing — already installed at v1.6.0, CJS-compatible, TOML 1.0 spec compliant
- Phase 1 is stateless (no module-level Maps) — caching is Phase 2's responsibility
- `skipLibCheck: true` added to `test/tsconfig.json` — fixes a pre-existing incompatibility where smol-toml v1.6.0 uses `ErrorOptions` (added in TypeScript 4.6) but the project targets TypeScript 4.5.5

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added `skipLibCheck` to fix pre-existing smol-toml/TypeScript 4.5.5 compilation error**
- **Found during:** Task 2 (configParser.ts parser module) — verification step `npm run test:unit`
- **Issue:** `smol-toml`'s `dist/error.d.ts` line 28 uses `ErrorOptions` which was added in TypeScript 4.6. The project uses TypeScript 4.5.5, causing `tsc -p test/tsconfig.json` to fail with `error TS2304: Cannot find name 'ErrorOptions'`. This failure was pre-existing (present even before Task 2 changes) but exposed during verification.
- **Fix:** Added `"skipLibCheck": true` to `test/tsconfig.json` — the standard approach for third-party library type definition incompatibilities
- **Files modified:** `test/tsconfig.json`
- **Verification:** `npm run test:unit` — 485 tests passing
- **Committed in:** `9aebe81` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 pre-existing bug, Rule 1)
**Impact on plan:** Fix was necessary for `npm run test:unit` to pass. `skipLibCheck` is the idiomatic TypeScript solution for third-party type definition version mismatches. No scope creep.

## Issues Encountered

- `smol-toml` v1.6.0 uses `ErrorOptions` (TypeScript 4.6+ built-in) which is absent in TypeScript 4.5.5. The webpack build (`npm run compile`) was unaffected because webpack uses ts-loader with different settings. The `tsc` test compilation path was broken. Fixed via `skipLibCheck: true` in test tsconfig.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `findBehaveConfig()` is ready for Plan 02 unit tests to consume via the 9 fixture directories
- All 9 fixture files are real files on disk matching behave's config format specifications
- Parser is stateless and standalone — no dependencies on `common.ts` or `configuration.ts`
- Plan 02 should create `test/unit/parsers/configParser.test.ts` using the Pattern 5 test structure from `01-PATTERNS.md`

---
*Phase: 01-config-parsing*
*Completed: 2026-04-15*
