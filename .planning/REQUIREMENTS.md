# Requirements: Config File Watching

**Defined:** 2026-04-16
**Core Value:** Zero-configuration project discovery: tests appear in the Test Explorer without the user touching settings.json.
**Milestone:** v1.1

## v1.1 Requirements

Requirements for config file watching and malformed config run guard. Each maps to roadmap phases.

### Config File Watching

- [ ] **WATCH-01**: FileSystemWatcher monitors all 5 behave config files (`behave.ini`, `.behaverc`, `setup.cfg`, `tox.ini`, `pyproject.toml`) at each workspace root
- [ ] **WATCH-02**: Watcher fires on create, change, and delete events
- [ ] **WATCH-03**: Config file changes debounced at 500ms before triggering re-discovery
- [ ] **WATCH-04**: Re-discovery silently updates test tree and logs to output channel (no notification on normal changes)
- [ ] **WATCH-05**: Per-workspace watcher lifecycle: watchers disposed and recreated when workspace folders change
- [ ] **WATCH-06**: Notification dedup cleared per-workspace on watcher-triggered re-discovery so fix-then-break cycles re-notify

### Malformed Config Run Guard

- [ ] **GUARD-01**: Test run checks discovery cache (`getDiscoveryEntry`) for `configError` before executing behave
- [ ] **GUARD-02**: Warning shown with "Run Anyway" / "Open Config File" / "Cancel" options (non-blocking)
- [ ] **GUARD-03**: Guard applies to both regular test runs and debug sessions
- [ ] **GUARD-04**: Guard scoped to workspaces whose tests are actually queued, not all workspaces

### Testing

- [ ] **TEST-07**: Unit tests for watcher debounce logic and lifecycle management (dispose/recreate)
- [x] **TEST-08**: Integration test verifying config file change triggers test tree rebuild
- [ ] **TEST-09**: Unit test for run guard configError check and user response handling

## Future Requirements

Deferred to later milestones. Tracked but not in current roadmap.

### Multi-Path Discovery

- **DISC-07**: Subdirectory scanning (depth 3, configurable) to find config files in nested project dirs
- **DISC-08**: Multiple feature paths (`featuresUris[]`) from multi-value `paths=`

### Multi-Project

- **MULTI-01**: Multiple behave projects per workspace folder
- **MULTI-02**: `Behave BDD: Select Project` quick pick command

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Home directory config watching (`~/.behaverc`) | Affects runtime behavior, not project structure |
| Inline "Fix Config" code action | Nice-to-have differentiator, not table stakes for v1.1 |
| Subdirectory config scanning | v2 — keep v1.1 focused on workspace root watching |
| Hard-blocking run guard (no "Run Anyway") | Anti-feature — user must always be able to proceed |
| "Reload Window" prompt on config change | Anti-feature — ESLint explicitly removed this pattern |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| WATCH-01 | Phase 4 | Pending |
| WATCH-02 | Phase 4 | Pending |
| WATCH-03 | Phase 4 | Pending |
| WATCH-04 | Phase 4 | Pending |
| WATCH-05 | Phase 4 | Pending |
| WATCH-06 | Phase 4 | Pending |
| GUARD-01 | Phase 4 | Pending |
| GUARD-02 | Phase 4 | Pending |
| GUARD-03 | Phase 4 | Pending |
| GUARD-04 | Phase 4 | Pending |
| TEST-07 | Phase 4 | Pending |
| TEST-08 | Phase 5 | Complete |
| TEST-09 | Phase 4 | Pending |

**Coverage:**
- v1.1 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0

---
*Requirements defined: 2026-04-16*
*Last updated: 2026-04-16 — traceability populated after roadmap creation*
