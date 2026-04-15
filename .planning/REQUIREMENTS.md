# Requirements: Auto-Discover Behave Projects

**Defined:** 2026-04-15
**Core Value:** Zero-configuration project discovery: tests appear in the Test Explorer without the user touching settings.json.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Discovery

- [ ] **DISC-01**: Extension reads `behave.ini`, `.behaverc`, `setup.cfg`, `tox.ini`, `pyproject.toml` from workspace root to discover project config
- [ ] **DISC-02**: INI files parsed for `[behave]` section `paths` key with Python configparser continuation-line semantics
- [ ] **DISC-03**: TOML files parsed for `[tool.behave]` table `paths` key as native array
- [ ] **DISC-04**: Parsed paths resolved relative to config file directory
- [ ] **DISC-05**: Config file search follows behave's priority order (`behave.ini` > `.behaverc` > `setup.cfg` > `tox.ini` > `pyproject.toml`)
- [ ] **DISC-06**: Config files without `[behave]` / `[tool.behave]` section silently skipped

### Integration

- [ ] **INTG-01**: Discovery priority: explicit manual settings > config file > `features/` convention
- [ ] **INTG-02**: Explicit settings detected via `inspect()` checking `globalValue`, `workspaceValue`, and `workspaceFolderValue`
- [ ] **INTG-03**: Discovery results cached in module-level Map; gatekeeper reads cache only (< 1ms)
- [ ] **INTG-04**: Cache populated during activation; invalidated by workspace folder changes and settings changes
- [ ] **INTG-05**: Activation events expanded to `workspaceContains:**/behave.ini` and `workspaceContains:**/.behaverc`
- [ ] **INTG-06**: `WorkspaceSettings` gains `discoverySource` ("config-file" | "convention" | "settings") and `configFileUri` properties
- [ ] **INTG-07**: Existing users with explicit `projectPath`/`featuresPath` settings see zero behavior change

### UX

- [ ] **UX-01**: Output channel logs discovery results (source, project root, features path)
- [ ] **UX-02**: Malformed config files trigger warning notification with parse error details
- [ ] **UX-03**: Config parse failure falls back to `features/` convention
- [ ] **UX-04**: Status bar detail shows discovery source on hover
- [ ] **UX-05**: `projectPath` and `featuresPath` setting descriptions updated to frame as overrides

### Testing

- [ ] **TEST-01**: Unit tests for all 5 config file formats (INI + TOML)
- [ ] **TEST-02**: Unit tests for priority logic (settings > config > convention)
- [ ] **TEST-03**: Unit tests for path resolution relative to config directory
- [ ] **TEST-04**: Unit tests for edge cases (malformed files, missing sections, empty paths)
- [ ] **TEST-05**: Integration test with `config-only/` example project (no settings.json)
- [ ] **TEST-06**: Backward compat verified: existing example projects unchanged

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Multi-Path Discovery

- **DISC-07**: Subdirectory scanning (depth 3, configurable) to find config files in nested project dirs
- **DISC-08**: Multiple feature paths (`featuresUris[]`) from multi-value `paths=`
- **DISC-09**: Configurable `gs-behave-bdd.discoveryDepth` setting

### File Watching

- **WATCH-01**: File system watchers for behave config file changes (create/modify/delete)
- **WATCH-02**: Config file change triggers re-discovery with 500ms debounce
- **WATCH-03**: Cache invalidation via config file watchers

### Multi-Project

- **MULTI-01**: Multiple behave projects per workspace folder
- **MULTI-02**: `Behave BDD: Select Project` quick pick command

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| File system watchers for config changes | Milestone 2 — separate capability from initial discovery |
| Multi-project per workspace folder | Milestone 3 — requires project-selection UX |
| `Behave BDD: Select Project` command | Milestone 3 — depends on multi-project |
| Home directory configs (`~/.behaverc`) | Affects runtime behavior, not project structure |
| README documentation updates | Milestone 3 — polish |
| Subdirectory scanning | v2 — keep v1 simple with workspace root only |
| Multiple feature paths array | v2 — single path from config is sufficient for v1 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DISC-01 | Phase 1 | Pending |
| DISC-02 | Phase 1 | Pending |
| DISC-03 | Phase 1 | Pending |
| DISC-04 | Phase 1 | Pending |
| DISC-05 | Phase 1 | Pending |
| DISC-06 | Phase 1 | Pending |
| INTG-01 | Phase 2 | Pending |
| INTG-02 | Phase 2 | Pending |
| INTG-03 | Phase 2 | Pending |
| INTG-04 | Phase 2 | Pending |
| INTG-05 | Phase 2 | Pending |
| INTG-06 | Phase 2 | Pending |
| INTG-07 | Phase 2 | Pending |
| UX-01 | Phase 3 | Pending |
| UX-02 | Phase 3 | Pending |
| UX-03 | Phase 3 | Pending |
| UX-04 | Phase 3 | Pending |
| UX-05 | Phase 3 | Pending |
| TEST-01 | Phase 1 | Pending |
| TEST-02 | Phase 3 | Pending |
| TEST-03 | Phase 1 | Pending |
| TEST-04 | Phase 1 | Pending |
| TEST-05 | Phase 3 | Pending |
| TEST-06 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0

---
*Requirements defined: 2026-04-15*
*Last updated: 2026-04-15 after roadmap creation*
