# Requirements: Auto-Discover Behave Projects

**Defined:** 2026-04-23
**Core Value:** Zero-configuration project discovery: tests appear in the Test Explorer without the user touching settings.json — and stay correct as the config evolves.

## v1.4.0 Requirements

Requirements for Deprecate featuresPath & Notification Suppression milestone.

### Deprecate featuresPath

- [ ] **DEP-01**: `featuresPath` setting removed from package.json schema
- [ ] **DEP-02**: On activation, if `featuresPath` has an explicit value at any scope, auto-migrate it to `featuresPaths[]` and remove the old key
- [ ] **DEP-03**: Migration writes to the same scope level where `featuresPath` was found (workspaceFolder / workspace / global)
- [ ] **DEP-04**: User sees a notification after migration: "Migrated featuresPath → featuresPaths"
- [ ] **DEP-05**: Internal code that reads `featuresPath` is updated to only read `featuresPaths[]`
- [ ] **DEP-06**: `testWorkspaceConfig` mock updated to remove `featuresPath` support
- [ ] **DEP-07**: Unit tests cover migration logic (value present, value absent, already has featuresPaths)

### Notification Suppression

- [ ] **NOTIF-01**: New `suppressedNotifications` setting in package.json — array of string notification keys, default `[]`
- [ ] **NOTIF-02**: Reusable module that checks suppression state and handles "Don't Show Again" by appending the key to `suppressedNotifications`
- [ ] **NOTIF-03**: "Don't Show Again" writes to `WorkspaceFolder` scope by default
- [ ] **NOTIF-04**: Existing multi-config notification migrated to use new infrastructure with key `multiConfigNotification`
- [ ] **NOTIF-05**: `suppressMultiConfigNotification` boolean setting removed from package.json
- [ ] **NOTIF-06**: Existing `suppressMultiConfigNotification: true` auto-migrated to `suppressedNotifications: ["multiConfigNotification"]`
- [ ] **NOTIF-07**: Unit tests for suppression module (check, suppress, migrate)
- [ ] **NOTIF-08**: `testWorkspaceConfig` mock updated for new setting shape

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
| DEP-01 | TBD | Pending |
| DEP-02 | TBD | Pending |
| DEP-03 | TBD | Pending |
| DEP-04 | TBD | Pending |
| DEP-05 | TBD | Pending |
| DEP-06 | TBD | Pending |
| DEP-07 | TBD | Pending |
| NOTIF-01 | TBD | Pending |
| NOTIF-02 | TBD | Pending |
| NOTIF-03 | TBD | Pending |
| NOTIF-04 | TBD | Pending |
| NOTIF-05 | TBD | Pending |
| NOTIF-06 | TBD | Pending |
| NOTIF-07 | TBD | Pending |
| NOTIF-08 | TBD | Pending |

**Coverage:**
- v1.4.0 requirements: 15 total
- Mapped to phases: 0
- Unmapped: 15 ⚠️

---
*Requirements defined: 2026-04-23*
*Last updated: 2026-04-23 after milestone v1.4.0 started*
