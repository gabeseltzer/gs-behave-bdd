---
phase: 17-cross-cutting-verification
plan: 01
subsystem: testing
tags: [fixture, migration, integration-test, vscode-settings]

requires:
  - phase: 15-notification-suppression
    provides: suppressMultiConfigNotification → suppressedNotifications migration helper
  - phase: 16-features-paths-migration
    provides: featuresPath → featuresPaths migration (canonical + cross-namespace)
provides:
  - "example-projects/migration-stale/ test fixture pre-seeded with all three legacy keys"
  - "settings.template.json restore baseline (byte-identical to settings.json) for Plan 02 suiteTeardown"
affects: [17-02, 17-03]

tech-stack:
  added: []
  patterns: ["template-restore via byte-identical sibling JSON file (avoids git checkout shell calls)"]

key-files:
  created:
    - example-projects/migration-stale/behave.ini
    - example-projects/migration-stale/features/example.feature
    - example-projects/migration-stale/features/steps/steps.py
    - example-projects/migration-stale/features/environment.py
    - example-projects/migration-stale/.vscode/settings.json
    - example-projects/migration-stale/.vscode/settings.template.json
  modified: []

key-decisions:
  - "Fixture name: migration-stale (kebab-case, matches multi-path/malformed-config conventions, no spaces)"
  - "Single-folder WorkspaceFolder scope (Option A from RESEARCH.md §3.2) — Global scope is unwritable from a committed fixture"
  - "behave.ini is the only behave config — single config source so test failures point at migration loop, not config-discovery ambiguity"
  - "Different values for gs-behave-bdd.featuresPath ('features') and behave-vsc.featuresPath ('features-alt') so Plan 02 can assert dedup behavior"
  - "Did NOT pre-seed featuresPaths or suppressedNotifications — migration must CREATE those keys; pre-seeding would mask migration bugs"

patterns-established:
  - "Template-restore: ship a sibling .vscode/settings.template.json byte-identical to settings.json; suiteTeardown copies it back. Cross-platform, no git dependency."

requirements-completed: [DEP-02, DEP-03, DEP-04, NOTIF-04, NOTIF-06]

completed: 2026-04-30
---

# Phase 17 Plan 01: Migration-Stale Fixture Created

**New test fixture at `example-projects/migration-stale/` pre-seeds all three Phase 15+16 legacy settings keys at WorkspaceFolder scope, ready for Plan 02's combined-coverage Dev Host test.**

## Accomplishments
- Six fixture files committed under `example-projects/migration-stale/`
- `.vscode/settings.json` seeds the three pre-migration keys: `gs-behave-bdd.featuresPath`, `behave-vsc.featuresPath`, `gs-behave-bdd.suppressMultiConfigNotification: true`
- `.vscode/settings.template.json` is byte-identical to `settings.json` so Plan 02's `suiteTeardown` can restore the baseline deterministically
- Minimal behave config + features tree so `getUrisOfWkspFoldersWithFeatures()` discovers the workspace and the activation migration loop fires

## Task Commits

1. **Task 1: Create minimal behave config + features tree** — `a80f40a` (feat)
2. **Task 2: Add seeded settings.json + restore template** — `5c870fd` (feat)

## Files Created
- `example-projects/migration-stale/behave.ini` — `[behave]\npaths = features`
- `example-projects/migration-stale/features/example.feature` — 1 Feature, 1 Scenario, 3 steps
- `example-projects/migration-stale/features/steps/steps.py` — pass-through impls for the 3 step phrases
- `example-projects/migration-stale/features/environment.py` — byte-equivalent of multi-path fixture's environment hooks
- `example-projects/migration-stale/.vscode/settings.json` — seeded pre-migration state (3 keys)
- `example-projects/migration-stale/.vscode/settings.template.json` — restore baseline (identical to settings.json)

## Exact Seeded Values (for Plan 02 assertions)

```json
{
  "gs-behave-bdd.featuresPath": "features",
  "behave-vsc.featuresPath": "features-alt",
  "gs-behave-bdd.suppressMultiConfigNotification": true
}
```

**Expected post-activation state Plan 02 must assert:**

```json
{
  "gs-behave-bdd.featuresPaths": ["features", "features-alt"],
  "gs-behave-bdd.suppressedNotifications": ["multiConfigNotification"]
}
```

(Order of `featuresPaths` array elements is implementation-defined by the Phase 16 migration — Plan 02 should assert the set, not sequence, unless Phase 16 SUMMARY specifies otherwise.)

## Restore Mechanism (Plan 02 must implement)

`suiteTeardown` reads `.vscode/settings.template.json` and copies its contents over `.vscode/settings.json` (use `fs.copyFileSync` or `fs.writeFileSync(JSON.stringify(JSON.parse(template)))`). Do NOT use `git checkout` — works on Windows + macOS + Linux + CI without git on PATH.

## Deviations from Plan

None — both tasks executed exactly as specified.

## Verification

- All six files exist (Test-Path verified)
- `settings.json` and `settings.template.json` SHA256 hashes match (byte-identical)
- Both JSON files parse via `JSON.parse`
- `npx eslint src --ext ts` exits 0 (no source regression)
- `npm run compile-tests` exits 0 (test/tsconfig.json still compiles)
