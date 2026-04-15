# Phase 1: Config Parsing - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-15
**Phase:** 1-Config Parsing
**Areas discussed:** Parser return shape, Multi-path handling, Test fixture strategy, Module organization

---

## Parser Return Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Structured result (Recommended) | Return an object like { configFileUri, format, paths, resolvedPath } — Phase 2 gets everything it needs without re-reading the config. Maps directly to INTG-06 requirements. | ✓ |
| Minimal path only | Return just the resolved Uri (or undefined). Keeps Phase 1 simple; Phase 2 would need to call back into the parser for metadata. | |
| Tuple: path + source | Return [resolvedPath, configFileUri] — enough for Phase 2 without a full interface. Lightweight middle ground. | |

**User's choice:** Structured result
**Notes:** None — straightforward selection of the recommended approach.

---

## Multi-Path Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Parse all, resolve first (Recommended) | Store all raw paths in rawPaths[] for future use, but resolvedPath uses paths[0] only. No warning — clean upgrade path to v2 multi-path support since the data is already captured. | ✓ |
| Parse all, warn about extras | Same as above but log a diagLog() message noting that extra paths were found and only the first is used. | |
| Parse first only | Stop parsing after the first path value. Simpler but loses the raw data — v2 would need to re-parse configs. | |

**User's choice:** Parse all, resolve first
**Notes:** None — data preservation for v2 upgrade was the deciding factor.

---

## Test Fixture Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Real fixture files (Recommended) | Create actual .ini/.toml files in test/unit/parsers/fixtures/config/. Tests call the parser with a path to real files. Matches existing pattern. | ✓ |
| Inline strings + parseContent() | Export a parseContent(text, format) function that tests call directly with string literals. Faster, no disk I/O. | |
| Both: fixture files + parseContent() | Export parseContent() for unit tests plus fixture-file tests for the full path. More test code to maintain. | |

**User's choice:** Real fixture files
**Notes:** None — consistency with existing test patterns was the deciding factor.

---

## Module Organization

| Option | Description | Selected |
|--------|-------------|----------|
| Single configParser.ts (Recommended) | One file with the main findBehaveConfig() entry point plus internal helpers for INI vs TOML parsing. Matches existing pattern. | ✓ |
| Split: INI + TOML files | iniConfigParser.ts for the 4 INI formats, tomlConfigParser.ts for pyproject.toml, plus a configParser.ts orchestrator. | |

**User's choice:** Single configParser.ts
**Notes:** None — consistency with existing single-file parser pattern (featureParser.ts, stepsParser.ts).

## Claude's Discretion

- Internal function signatures and helper decomposition
- Exact regex patterns for INI continuation-line parsing
- Error handling internals (return undefined for missing/invalid configs)

## Deferred Ideas

None — discussion stayed within phase scope.
