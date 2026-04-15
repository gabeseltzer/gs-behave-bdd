# Roadmap: Auto-Discover Behave Projects

## Overview

This milestone adds zero-configuration project discovery to the gs-behave-bdd VS Code extension. Phase 1 builds the config-file parsers for all five behave config formats (INI and TOML). Phase 2 wires those parsers into WorkspaceSettings and the activation/gatekeeper layer so discovery actually drives the extension. Phase 3 surfaces discovery to the user via logs, warnings, and status bar annotations, then validates the full flow with integration tests and backward-compat checks.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Config Parsing** - Parse all five behave config formats and resolve paths
- [ ] **Phase 2: Integration** - Wire parsers into WorkspaceSettings and the gatekeeper
- [ ] **Phase 3: UX & Verification** - Surface discovery to users and validate end-to-end

## Phase Details

### Phase 1: Config Parsing
**Goal**: The extension can read any of behave's five config file formats and produce a resolved feature path
**Depends on**: Nothing (first phase)
**Requirements**: DISC-01, DISC-02, DISC-03, DISC-04, DISC-05, DISC-06, TEST-01, TEST-03, TEST-04
**Success Criteria** (what must be TRUE):
  1. Given a workspace root with `behave.ini`, the parser returns the `paths` value from the `[behave]` section
  2. Given a workspace root with `pyproject.toml`, the parser returns the `paths` array from `[tool.behave]`
  3. When multiple config files are present, the parser respects behave's priority order (behave.ini wins over .behaverc, etc.)
  4. Parsed paths are resolved as absolute URIs relative to the config file's directory
  5. Config files with no `[behave]` / `[tool.behave]` section are silently skipped without error
**Plans:** 2 plans

Plans:
- [x] 01-01-PLAN.md -- Config parser module and test fixtures
- [x] 01-02-PLAN.md -- Unit tests for all formats, path resolution, and edge cases

### Phase 2: Integration
**Goal**: Discovery results from config parsers drive WorkspaceSettings so the extension activates on behave projects with no settings.json
**Depends on**: Phase 1
**Requirements**: INTG-01, INTG-02, INTG-03, INTG-04, INTG-05, INTG-06, INTG-07
**Success Criteria** (what must be TRUE):
  1. Opening a folder with `behave.ini` (and no settings.json) causes the extension to activate and tests appear in Test Explorer
  2. A user with explicit `projectPath`/`featuresPath` in settings.json sees identical behavior to before this milestone
  3. `WorkspaceSettings` exposes `discoverySource` ("config-file" | "convention" | "settings") and `configFileUri` that reflect how the path was resolved
  4. The gatekeeper (`getUrisOfWkspFoldersWithFeatures()`) reads only from cache and completes in < 1ms after initial activation
  5. Changing workspace settings or adding/removing workspace folders invalidates the cache and triggers re-discovery
**Plans**: TBD

### Phase 3: UX & Verification
**Goal**: Users can see how the extension discovered their project, parse errors are surfaced gracefully, and all scenarios are validated by tests
**Depends on**: Phase 2
**Requirements**: UX-01, UX-02, UX-03, UX-04, UX-05, TEST-02, TEST-05, TEST-06
**Success Criteria** (what must be TRUE):
  1. The output channel shows a discovery log entry (source, project root, features path) every time discovery runs
  2. A malformed config file triggers a VS Code warning notification with the parse error details, and the extension falls back to the `features/` convention
  3. The status bar item's hover detail identifies whether the project was discovered via config file, convention, or explicit settings
  4. An integration test using the `config-only/` example project (no settings.json) passes end-to-end in CI
  5. All existing example projects with `.vscode/settings.json` pass their existing tests without modification
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Config Parsing | 0/2 | Planned | - |
| 2. Integration | 0/? | Not started | - |
| 3. UX & Verification | 0/? | Not started | - |
