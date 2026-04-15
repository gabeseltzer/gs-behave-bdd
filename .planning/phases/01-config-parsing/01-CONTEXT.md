# Phase 1: Config Parsing - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Parse all five behave config file formats (`behave.ini`, `.behaverc`, `setup.cfg`, `tox.ini`, `pyproject.toml`) and produce a resolved feature path. This phase delivers standalone parsing logic with unit tests — no integration with WorkspaceSettings or the gatekeeper (that's Phase 2).

</domain>

<decisions>
## Implementation Decisions

### Parser Return Shape
- **D-01:** The config parser exports a structured `BehaveConfigResult` interface: `{ configFileUri: vscode.Uri, format: 'ini' | 'toml', rawPaths: string[], resolvedPath: vscode.Uri }`. Returns `undefined` when no config is found or config has no `[behave]`/`[tool.behave]` section.
- **D-02:** The structured result provides everything Phase 2 needs (`configFileUri` maps to INTG-06's `configFileUri`, `format` informs `discoverySource`) without re-reading the config file.

### Multi-Path Handling
- **D-03:** Parse ALL paths from the config into `rawPaths[]`, but resolve only `rawPaths[0]` as `resolvedPath`. No warning or log about extra paths — this is a clean v2 upgrade path since the data is already captured.
- **D-04:** v1 single-path constraint (from project decisions) is enforced at the return type level, not the parse level.

### Test Fixture Strategy
- **D-05:** Tests use real config files on disk in `test/unit/parsers/fixtures/config/`. This exercises the full read-from-disk path and matches the existing fixtures pattern in the test suite.
- **D-06:** Fixture files include: standard configs for all 5 formats, malformed INI, INI without `[behave]` section, multi-path config, and TOML without `[tool.behave]` table.

### Module Organization
- **D-07:** Single `src/parsers/configParser.ts` file with `findBehaveConfig()` as the exported entry point and internal helpers (`parseIniConfig`, `parseTomlConfig`, `resolvePaths`, `searchConfigFiles`).
- **D-08:** Single corresponding test file: `test/unit/parsers/configParser.test.ts`.
- **D-09:** Matches existing parser module pattern (featureParser.ts, stepsParser.ts are each single files).

### Claude's Discretion
- Internal function signatures and helper decomposition within configParser.ts
- Exact regex patterns for INI continuation-line parsing (must match Python configparser behavior per DISC-02)
- Error handling internals (return undefined for missing/invalid configs — Phase 3 adds UX)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Behave Config Behavior
- `bundled/libs/behave/configuration.py` — Behave's own config parsing: `config_filenames()`, INI `paths` with `action="append"` → `splitlines()`, TOML `[tool.behave]` table, path resolution via `os.path.normpath(os.path.join(config_dir, p))`

### Extension Architecture
- `src/parsers/featureParser.ts` — Existing parser module pattern (naming, exports, module-level state)
- `src/parsers/stepsParser.ts` — Another parser module pattern reference
- `src/common.ts` lines 126-224 — `getUrisOfWkspFoldersWithFeatures()` gatekeeper (Phase 2 integration point)
- `src/settings.ts` lines 58-80 — `WorkspaceSettings` class (Phase 2 consumer of parser results)

### Test Patterns
- `test/unit/parsers/featureParser.test.ts` — Existing parser test pattern
- `test/unit/parsers/fixtures/` — Existing test fixture directory

### Requirements
- `.planning/REQUIREMENTS.md` — DISC-01 through DISC-06, TEST-01, TEST-03, TEST-04

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `smol-toml` (v1.6.0) already installed — use for TOML parsing in `parseTomlConfig`
- `vscode.Uri.joinPath()` and `vscode.Uri.file()` — use for path resolution (matches existing URI patterns)
- `uriId()` from `common.ts` — use for URI comparison in tests

### Established Patterns
- Parser modules export named functions (not classes): `getFeatureFileSteps()`, `getStepFileSteps()`
- Module-level Maps for caching (e.g., `featureFileSteps` Map in featureParser.ts)
- `fs.existsSync()` for synchronous file existence checks (performance-critical paths)
- `getActualWorkspaceSetting()` uses `inspect()` to detect explicit settings — this is the Phase 2 pattern for "settings override config"

### Integration Points
- `findBehaveConfig()` will be called by Phase 2's modified `getUrisOfWkspFoldersWithFeatures()` or `WorkspaceSettings` constructor
- Config file priority order (behave.ini > .behaverc > setup.cfg > tox.ini > pyproject.toml) is internal to the parser — Phase 2 just calls the entry point

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-config-parsing*
*Context gathered: 2026-04-15*
