# Requirements: v1.3.0 Project Switching

**Defined:** 2026-04-22
**Core Value:** Zero-configuration project discovery: tests appear in the Test Explorer without the user touching settings.json — and stay correct as the config evolves.

## v1.3.0 Requirements

Requirements for project switching milestone. Each maps to roadmap phases.

### Discovery

- [ ] **DISC-01**: Scanner promotes all discovered configs as a switchable project list (no more first-match-wins discard)
- [ ] **DISC-02**: Active project selection persisted in `workspaceState` (survives reload)
- [ ] **DISC-03**: Auto-select first discovered config when no prior selection exists
- [ ] **DISC-04**: `projectPath` manual override = single project mode, no switching UI shown
- [ ] **DISC-05**: Config watcher updates project list when configs are created, deleted, or modified on disk

### Switching UX

- [ ] **UX-01**: `Behave BDD: Select Project` command registered in command palette (quick-pick showing all discovered projects)
- [ ] **UX-02**: Status bar item showing active project label (workspace-relative config directory)
- [ ] **UX-03**: Clicking status bar item opens the Select Project quick-pick
- [ ] **UX-04**: Status bar item hidden when only one project discovered or `projectPath` is set
- [ ] **UX-05**: Quick-pick shows project label + config file type as description (e.g. "backend — behave.ini")

### Integration

- [ ] **INT-01**: Switching active project triggers full test tree rebuild with the new project's features
- [ ] **INT-02**: Switching active project triggers step mapping rebuild (go-to-step, hover, completion use new project's steps)
- [ ] **INT-03**: Discovery output channel log shows active project + lists available alternatives
- [ ] **INT-04**: Backward compat: single-project workspaces see zero behavior change (no status bar, no quick-pick)

### Testing

- [ ] **TEST-01**: Unit tests for project list management (add, remove, persist, auto-select)
- [ ] **TEST-02**: Unit tests for quick-pick command and status bar lifecycle
- [ ] **TEST-03**: Integration test with multi-project fixture (switch project, verify tree rebuilds)

### Documentation

- [ ] **DOC-01**: Incremental README additions covering auto-discovery, multi-path, monorepo scanning, and project switching

## Future Requirements

Deferred to later milestones. Tracked but not in current roadmap.

### Multi-Project Simultaneous

- **MULTI-01**: All discovered projects active simultaneously in the Test Explorer
- **MULTI-02**: Project node in test tree (Workspace > Project > features > scenarios)
- **MULTI-03**: Run All at workspace level runs every project's features

### Per-Project Settings

- **PROJ-01**: Per-project env var overrides
- **PROJ-02**: Per-project tag filters

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| All projects active simultaneously | Future milestone; one-active-at-a-time is simpler and sufficient |
| Per-project settings overrides | Future milestone; workspace-level settings apply to active project |
| Per-project Python interpreter | Multi-root workspace handles this; massive complexity for niche case |
| Project-scoped step definitions | Behave loads steps globally; scoping would diverge from runtime |
| Separate output channels per project | UX clutter; prefix log lines with project label instead |
| `featuresPath` deprecation | Backlog Phase 999.1; orthogonal to project switching |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DISC-01 | Phase 12 | Pending |
| DISC-02 | Phase 12 | Pending |
| DISC-03 | Phase 12 | Pending |
| DISC-04 | Phase 12 | Pending |
| DISC-05 | Phase 12 | Pending |
| UX-01 | Phase 13 | Pending |
| UX-02 | Phase 13 | Pending |
| UX-03 | Phase 13 | Pending |
| UX-04 | Phase 13 | Pending |
| UX-05 | Phase 13 | Pending |
| INT-01 | Phase 14 | Pending |
| INT-02 | Phase 14 | Pending |
| INT-03 | Phase 13 | Pending |
| INT-04 | Phase 12 | Pending |
| TEST-01 | Phase 12 | Pending |
| TEST-02 | Phase 13 | Pending |
| TEST-03 | Phase 14 | Pending |
| DOC-01 | Phase 14 | Pending |

**Coverage:**
- v1.3.0 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-22*
*Last updated: 2026-04-23*
