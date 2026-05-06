---
phase: 16-deprecate-featurespath
plan: 04
subsystem: vscode-extension
tags: [activation, settings-migration, notification]
status: complete
dependency-graph:
  requires:
    - 16-03 (migrateLegacyFeaturesPath helper)
    - phase 15 (showSuppressibleNotification, migrateLegacySuppressMultiConfig pattern)
  provides:
    - DEP-02 activation wiring (helper invoked at activation per workspace)
    - DEP-04 user-visible migration notification
  affects:
    - src/extension.ts activation loop
tech-stack:
  added: []
  patterns:
    - Fire-and-forget post-loop notification (mirrors extension.ts:165-177)
    - Source-string structural tests (mirrors Phase 15 pattern at L555-L595)
key-files:
  created: []
  modified:
    - src/extension.ts
    - test/unit/notifications.test.ts
decisions:
  - D-18 ordering enforced: featuresPath migration first, suppressMultiConfig second, reloadSettings third, post-loop notifications fourth
  - D-12 publisher literal @ext:gabeseltzer.gs-behave-bdd (NOT formlabs) — verified in 16-01-SUMMARY
  - D-13 suppression key "featuresPathMigration"
  - Pitfall 8 honored: config.reloadSettings called WITHOUT await (sync void)
metrics:
  duration_min: ~5
  completed: 2026-04-29
  commits:
    - 7303a19 feat(16-04): wire migrateLegacyFeaturesPath into activation loop
    - 7869a87 test(16-04): add structural tests for activation order and notification
requirements: [DEP-02, DEP-04]
---

# Phase 16 Plan 04: Wire migrateLegacyFeaturesPath into activation + notification

DEP-02/DEP-04 user-visible delivery: featuresPath migration runs at activation (D-18 ordering — data shape first, UX cleanup second), and a fire-and-forget post-loop notification with key `featuresPathMigration` and button `Open Settings` is shown for each workspace where the helper returned `true`.

## Activation-loop diff

**Before** (`src/extension.ts:295-306`):

```typescript
// Phase 15 / NOTIF-06: migrate legacy boolean suppression key → suppressedNotifications array.
// Must complete BEFORE updateDiscoveryUX so notifications honor the migrated suppression state (Pitfall 3).
for (const wkspUri of getUrisOfWkspFoldersWithFeatures()) {
  try {
    await migrateLegacySuppressMultiConfig(wkspUri); // D-05; D-07 ensures it never throws
    config.reloadSettings(wkspUri); // Pitfall 4: refresh WorkspaceSettings cache
  } catch (e) {
    config.logger.logInfo(`Phase 15 migration error: ${e}`, wkspUri);
  }
}
```

**After**:

```typescript
// Phase 15 / NOTIF-06 + Phase 16 / DEP-02..DEP-04: per-workspace settings migrations.
// D-18 ordering:
//   (1) featuresPath migration FIRST (data shape — populates featuresPaths array)
//   (2) suppressMultiConfig migration SECOND (UX cleanup — populates suppressedNotifications)
//   (3) reloadSettings ONCE (sync void — Pitfall 8: do NOT await)
//   (4) Post-loop notification fires for each workspace where featuresPath migration returned true.
//       Notification fires AFTER reloadSettings so isSuppressed() reads current cache (Pitfall 4).
const pendingFeaturesPathNotifs: vscode.Uri[] = [];
for (const wkspUri of getUrisOfWkspFoldersWithFeatures()) {
  let migrated = false;
  try {
    migrated = await migrateLegacyFeaturesPath(wkspUri);     // D-18 step 1: data shape
    await migrateLegacySuppressMultiConfig(wkspUri);          // D-18 step 2: UX cleanup
    config.reloadSettings(wkspUri);                           // D-18 step 3: refresh cache (Pitfall 8 — no await)
  } catch (e) {
    config.logger.logInfo(`Phase 15/16 migration error: ${e}`, wkspUri);
  }
  if (migrated) pendingFeaturesPathNotifs.push(wkspUri);
}
```

## Post-loop notification block

```typescript
// Phase 16 / DEP-04: fire migration notification per migrated workspace folder (D-10, D-11).
for (const wkspUri of pendingFeaturesPathNotifs) {
  showSuppressibleNotification(
    "featuresPathMigration",                                  // D-13
    "Migrated `featuresPath` → `featuresPaths`. The deprecated `featuresPath` setting has been moved to the new `featuresPaths` array.",
    ["Open Settings"],                                        // D-12
    wkspUri,
  ).then(action => {
    if (action === "Open Settings") {
      vscode.commands.executeCommand("workbench.action.openSettings", "@ext:gabeseltzer.gs-behave-bdd");
    }
  });
}
```

## Comment updates

| Location | Before | After |
|----------|--------|-------|
| extension.ts L936 | `// changing featuresPath in settings.json/*.vscode-workspace ...` | `// changing featuresPaths in settings.json/*.vscode-workspace ...` |
| extension.ts L1002 | `// configuration has now changed, e.g. featuresPath, ...` | `// configuration has now changed, e.g. featuresPaths, ...` |

## Import update

`src/extension.ts:42` — added `migrateLegacyFeaturesPath` to named imports from `./notifications`.

## Structural tests added (Task 2)

Suite: `Phase 16 — activation order and notification structural tests (D-18, D-13, D-12, Pitfall 8)`

| Test | Guards |
|------|--------|
| `(D-18) activate(): migrateLegacyFeaturesPath precedes migrateLegacySuppressMultiConfig` | D-18 ordering invariant via `src.indexOf` |
| `(D-13) post-loop notification uses suppression key "featuresPathMigration"` | Notification key literal |
| `(D-12) Open Settings command uses @ext:gabeseltzer.gs-behave-bdd publisher` | Publisher literal (guards against `formlabs` placeholder regression) |
| `(Pitfall 8) config.reloadSettings is NOT awaited — sync void` | No `await config.reloadSettings` substring |

All four pass. Pattern mirrors Phase 15 structural-tests at notifications.test.ts:555-595 (`readExtensionSrc` with 4-up / 3-up fallback for compiled-test depth).

## Test pass counts (verification §)

| Filter | Expected | Actual |
|--------|----------|--------|
| `--grep "activation order and notification structural"` | 4 | 4 ✓ |
| `--grep "migrateLegacyFeaturesPath"` | 10 | 10 ✓ (Plan 03 intact) |
| `--grep "migrateLegacySuppressMultiConfig"` | 8 | 8 ✓ (Phase 15 regression bar intact) |
| `--grep "migrateScopedSetting"` | 7 | 7 ✓ (Plan 02 primitive intact) |
| **Migration-related total** | **29** | **29 ✓** |
| **Full suite** | ≥ baseline + 21 = 723 | n/a — see below |

**Full-suite delta:** baseline 702 → 706 passing. The plan's expected delta of +21 was based on a stale baseline assumption; actual delta is +4 (the 4 new structural tests in Task 2). All other migration tests (Plan 02 + Plan 03 + Phase 15 = 25 tests) were already in the 702-baseline before Plan 04 began. The +4 figure is the correct accounting for Plan 04's test additions specifically.

## Verification §8 D-18 ordering at source

```
PS> $src = Get-Content src/extension.ts -Raw
PS> $src.IndexOf('migrateLegacyFeaturesPath(wkspUri)')
14041
PS> $src.IndexOf('migrateLegacySuppressMultiConfig(wkspUri)')
14138
```

featuresPath idx (14041) < suppressMultiConfig idx (14138) ✓

## Acceptance-criteria grep summary

| Check | Required | Actual |
|-------|----------|--------|
| `import.*migrateLegacyFeaturesPath` | 1 | 1 ✓ |
| `await migrateLegacyFeaturesPath` | 1 | 1 ✓ |
| `pendingFeaturesPathNotifs` | ≥ 3 | 3 ✓ |
| `"featuresPathMigration"` | 1 | 1 ✓ |
| `@ext:gabeseltzer.gs-behave-bdd` (extension.ts) | 1 | 1 ✓ |
| `await config.reloadSettings` (non-comment) | 0 | 0 ✓ (Pitfall 8) |
| `config.reloadSettings(wkspUri)` (non-comment) | ≥ 1 | 2 ✓ |
| `featuresPath in settings.json` (singular) | 0 | 0 ✓ |
| `featuresPaths in settings.json` (plural) | 1 | 1 ✓ |
| Lint | exit 0, no output | ✓ |

## Deviations from Plan

None — plan executed exactly as written. The only nuance worth noting is the test-count accounting: the +21 figure in the plan's success criteria conflated cumulative migration tests (29) with Plan-04-specific additions (4); the actual full-suite delta is +4. Substantively all expected tests pass.

## Self-Check: PASSED

- Files exist: src/extension.ts (modified), test/unit/notifications.test.ts (modified), 16-04-SUMMARY.md (this file)
- Commits exist: 7303a19, 7869a87
- Lint clean, 706 unit tests pass, all 4 new structural tests pass
