# Requirements: Auto-Discover Behave Projects

**Defined:** 2026-04-23
**Core Value:** Zero-configuration project discovery: tests appear in the Test Explorer without the user touching settings.json — and stay correct as the config evolves.

## v1.4.0 Requirements

Requirements for Deprecate featuresPath & Notification Suppression milestone.

### Deprecate featuresPath

- [x] **DEP-01**: `featuresPath` setting removed from package.json schema
- [x] **DEP-02**: On activation, if `featuresPath` has an explicit value at any scope, auto-migrate it to `featuresPaths[]` and remove the old key
- [x] **DEP-03**: Migration writes to the same scope level where `featuresPath` was found (workspaceFolder / workspace / global)
- [x] **DEP-04**: User sees a notification after migration: "Migrated featuresPath → featuresPaths"
- [x] **DEP-05**: Internal code that reads `featuresPath` is updated to only read `featuresPaths[]`
- [x] **DEP-06**: `testWorkspaceConfig` mock updated to remove `featuresPath` support
- [x] **DEP-07**: Unit tests cover migration logic (value present, value absent, already has featuresPaths)

### Notification Suppression

- [x] **NOTIF-01**: New `suppressedNotifications` setting in package.json — array of string notification keys, default `[]` (Phase 15)
- [x] **NOTIF-02**: Reusable module that checks suppression state and handles "Don't Show Again" by appending the key to `suppressedNotifications` (Phase 15)
- [x] **NOTIF-03**: "Don't Show Again" writes to `WorkspaceFolder` scope by default (Phase 15)
- [x] **NOTIF-04**: Existing multi-config notification migrated to use new infrastructure with key `multiConfigNotification` (Phase 15)
- [x] **NOTIF-05**: `suppressMultiConfigNotification` boolean setting removed from package.json (Phase 15)
- [x] **NOTIF-06**: Existing `suppressMultiConfigNotification: true` auto-migrated to `suppressedNotifications: ["multiConfigNotification"]` (Phase 15)
- [x] **NOTIF-07**: Unit tests for suppression module (check, suppress, migrate) (Phase 15 — 28 new tests, 683 total)
- [x] **NOTIF-08**: `testWorkspaceConfig` mock updated for new setting shape (Phase 15)

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### Notification Suppression

- **NOTIF-F01**: Additional notification types beyond multi-config (added as needed)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Migrate `projectPath` | Not deprecated; no plural successor needed |
| UI for managing suppressed notifications | Overkill for a string array setting |
| Per-project notification preferences | Covered by VS Code's native scope levels |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| NOTIF-01 | Phase 15 | ✓ Verified |
| NOTIF-02 | Phase 15 | ✓ Verified |
| NOTIF-03 | Phase 15 | ✓ Verified |
| NOTIF-04 | Phase 15 | ✓ Verified |
| NOTIF-05 | Phase 15 | ✓ Verified |
| NOTIF-06 | Phase 15 | ✓ Verified (real-VSCode smoke deferred to Phase 17) |
| NOTIF-07 | Phase 15 | ✓ Verified |
| NOTIF-08 | Phase 15 | ✓ Verified |
| DEP-01 | Phase 16 | Complete |
| DEP-02 | Phase 16 | ✓ Helper shipped (Plan 03); activation wiring lands in Plan 04 |
| DEP-03 | Phase 16 | ✓ Helper shipped (Plan 03); activation wiring lands in Plan 04 |
| DEP-04 | Phase 16 | Complete |
| DEP-05 | Phase 16 | Complete |
| DEP-06 | Phase 16 | Complete |
| DEP-07 | Phase 16 | Complete |

**Coverage:**
- v1.4.0 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-23*
*Last updated: 2026-04-23 after roadmap creation*
