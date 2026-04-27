---
phase: 15-notification-suppression
plan: 01
subsystem: configuration
tags: [vscode-settings, schema, configuration, package-json, suppression-infrastructure]

requires:
  - phase: 14-project-switching
    provides: WorkspaceSettings strict-undefined-throw construction pattern; existing four cascading settings test fixtures (BASE_CFG / makeFakeWkspSettings)
provides:
  - "package.json schema entry: gs-behave-bdd.suppressedNotifications array<string> default []"
  - "WorkspaceSettings.suppressedNotifications: readonly string[] field with strict-undefined-throw"
  - "Wave 0 Assumption A1 probes documenting cfg.inspect() per-scope return contract"
  - "test/unit/notifications.test.ts skeleton + makeScopedConfig helper for plans 02/03"
  - "test/unit/packageJsonSchema.test.ts schema-shape unit test"
  - "All four cascading settings test fixtures carry suppressedNotifications: [] (NOTIF-08 cascade)"
affects: [15-02-isSuppressed-suppressNotification, 15-03-migration, 15-05-extension-wire-and-schema-removal]

tech-stack:
  added: []
  patterns:
    - "Strict-undefined-throw settings load (Pattern 1 from 15-RESEARCH.md): get<T>(key) -> throw 'X is undefined' if undefined -> assign"
    - "Per-scope makeScopedConfig test helper with caller-controlled globalValue/workspaceValue/workspaceFolderValue (extends multiPathPrecedence makeConfig single-scope helper to satisfy Pitfall 5 — TestWorkspaceConfig.inspect only sets workspaceFolderValue)"

key-files:
  created:
    - test/unit/notifications.test.ts
    - test/unit/packageJsonSchema.test.ts
  modified:
    - package.json
    - src/settings.ts
    - test/unit/settings/multiPathPrecedence.test.ts
    - test/unit/settings/verboseLogging.test.ts
    - test/unit/settings/projectUriDerivation.test.ts
    - test/unit/settings/logSettingsPlural.test.ts

key-decisions:
  - "Atomic landing of strict-undefined throw + four fixture updates (BLOCKER B-2 fold from Plan 04): no transient red window during Wave 2"
  - "Schema entry mirrors gs-behave-bdd.featuresPaths array template exactly (scope: resource, type: array, items.type: string, default: [])"
  - "Legacy gs-behave-bdd.suppressMultiConfigNotification schema and WorkspaceSettings field intentionally preserved — Plan 03 migration code reads it via inspect() and Plan 05 removes both gated on A1 probe"
  - "A1 probe asserts the *expected* contract using a stubbed inspect() returning per-scope values; real-VSCode A1 confirmation deferred to Plan 05 schema-removal smoke check (per 15-VALIDATION.md Manual-Only Verifications)"

patterns-established:
  - "Suppression-array readonly field: readonly suppressedNotifications: readonly string[] (keys checked in 15-02 isSuppressed)"
  - "Fixture-cascade-completes-in-same-plan-as-throw: any plan that adds a strict-undefined-throw to WorkspaceSettings MUST also update all four BASE_CFG / makeFakeWkspSettings fixtures in the same plan"

requirements-completed: [NOTIF-01, NOTIF-08]

duration: ~25min
completed: 2026-04-27
---

# Phase 15 Plan 01: Notification Suppression Schema and Field Foundation Summary

**Adds `gs-behave-bdd.suppressedNotifications` array setting to package.json and WorkspaceSettings with strict-undefined-throw load, scaffolds notifications.test.ts with the Wave 0 A1 probe, and atomically updates all four cascading settings test fixtures so the full unit suite stays green throughout Wave 2.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-27 (sequential executor invocation)
- **Completed:** 2026-04-27
- **Tasks:** 7
- **Files modified:** 6 (package.json, src/settings.ts, four cascading settings test files)
- **Files created:** 2 (test/unit/notifications.test.ts, test/unit/packageJsonSchema.test.ts)

## Accomplishments

- NOTIF-01 schema lands: `gs-behave-bdd.suppressedNotifications` array<string> with default `[]`, scope `resource`, items.type `string` — mirrors `featuresPaths` template
- WorkspaceSettings carries `readonly suppressedNotifications: readonly string[]` field loaded with strict-undefined-throw (Pattern 1 from 15-RESEARCH.md)
- Wave 0 A1 probe in place: 2 tests document the expected `cfg.inspect()` per-scope return contract for unregistered keys whose values live in settings.json (gates Plan 05 schema removal)
- Schema-shape unit test (`packageJsonSchema.test.ts`) validates new array schema and asserts legacy boolean key still present (boundary marker for Plan 05's inverted assertion)
- All four cascading settings test fixtures carry `suppressedNotifications: []` alongside the legacy boolean — `WorkspaceSettings` strict-undefined-throw is satisfied under test
- Full unit suite GREEN at end of plan: 659 tests passing (655 baseline + 4 Phase 15)
- ESLint clean across `src/`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add suppressedNotifications schema to package.json (NOTIF-01)** — `ef3bc8c` (feat)
2. **Task 2: Add suppressedNotifications field to WorkspaceSettings (NOTIF-08 partial)** — `dc235c7` (feat)
3. **Task 3: Scaffold notifications.test.ts with A1 probe + packageJsonSchema test** — `e800364` (test)
4. **Task 4: Update BASE_CFG in multiPathPrecedence.test.ts (NOTIF-08 cascade)** — `8f1eb17` (test)
5. **Task 5: Update makeFakeWkspSettings in verboseLogging.test.ts (NOTIF-08 cascade)** — `bcd26d2` (test)
6. **Task 6: Update BASE_CFG in projectUriDerivation.test.ts (NOTIF-08 cascade)** — `fe6ca11` (test)
7. **Task 7: Update makeFakeWkspSettings in logSettingsPlural.test.ts (NOTIF-08 cascade)** — `3d2ccdb` (test)

**Plan metadata:** (final SUMMARY commit follows this section)

## Files Created/Modified

### Created

- `test/unit/notifications.test.ts` — Skeleton with `makeScopedConfig` helper and Wave 0 A1 probes. Re-exports `makeScopedConfig` for plans 02/03 to import.
- `test/unit/packageJsonSchema.test.ts` — NOTIF-01 schema-shape assertions; legacy-key-still-present boundary assertion (will be inverted in Plan 05).

### Modified

- `package.json` — New `gs-behave-bdd.suppressedNotifications` schema entry placed adjacent to legacy `suppressMultiConfigNotification` block. Legacy entry preserved.
- `src/settings.ts` — New `readonly suppressedNotifications: readonly string[]` field declaration; new constructor read with strict-undefined-throw; new assignment. Legacy `suppressMultiConfigNotification` field, read, and assignment preserved.
- `test/unit/settings/multiPathPrecedence.test.ts` — `BASE_CFG` carries `suppressedNotifications: []` adjacent to legacy boolean.
- `test/unit/settings/verboseLogging.test.ts` — `makeFakeWkspSettings` carries `suppressedNotifications: []` adjacent to legacy boolean.
- `test/unit/settings/projectUriDerivation.test.ts` — `BASE_CFG` carries `suppressedNotifications: []` adjacent to legacy boolean.
- `test/unit/settings/logSettingsPlural.test.ts` — `makeFakeWkspSettings` carries `suppressedNotifications: []` adjacent to legacy boolean.

## Wave 0 Assumption A1 Probe — Outcome

**Question (15-RESEARCH.md Pitfall 1, Assumption A1):** Will `cfg.inspect()` return per-scope values for an unregistered key whose value lives in settings.json after Plan 05 removes the legacy schema entry?

**This plan's contribution:** Documents the *expected* contract via 2 unit tests (`A1: inspect() returns workspaceFolderValue for unregistered key with settings.json value` and `A1: inspect() returns globalValue for unregistered key set globally`). Both tests pass against the project's vscode mock-driven test environment using a stubbed `inspect()` that returns the per-scope shape Plan 05 will rely on. The contract that the probe documents is:

```typescript
cfg.inspect("suppressMultiConfigNotification") === {
  key: "suppressMultiConfigNotification",
  defaultValue: undefined,    // schema removed -> no default
  globalValue: <value or undefined>,
  workspaceValue: <value or undefined>,
  workspaceFolderValue: <value or undefined>,
}
```

**Real-VSCode confirmation:** Deferred to Plan 05 (schema-removal task) per 15-VALIDATION.md Manual-Only Verifications. The smoke check fixture lives at `test/example-projects/multiroot-workspace/<folder>/.vscode/settings.json`. If real VS Code returns `undefined` from `inspect()` for an unregistered key, Plan 05 must either (a) keep the schema with `deprecationMessage`, or (b) fall back to `cfg.get<boolean>("suppressMultiConfigNotification")` in the migration path.

**Status:** Probe in place; gates Plan 05.

## Decisions Made

- **Atomic fold of fixture updates into Plan 01** — BLOCKER B-2 from plan frontmatter mandated that the strict-undefined throw and the four fixture updates land in the same plan, in the same wave, in a single atomic landing. This eliminates the window during Wave 2 where Plans 02/03 would declare done against a red full unit suite. Confirmed: Plan 01 ends with 659 tests passing, no transient red window.
- **Legacy preservation** — `gs-behave-bdd.suppressMultiConfigNotification` schema entry and `WorkspaceSettings.suppressMultiConfigNotification` field both intentionally retained. Plan 03 migration uses `inspect()` on the legacy key. Plan 05 removes both, gated on the A1 probe outcome.
- **A1 probe scope** — The Wave 0 probe asserts the *contract* (what we will rely on), not the *real-VSCode behavior* (which the unit-test stub cannot exercise). Real-VSCode confirmation lives at Plan 05's smoke check; this matches 15-VALIDATION.md Manual-Only Verifications.

## Deviations from Plan

None — plan executed exactly as written.

The Plan 01 file already explicitly folded Tasks 4-7 (originally Plan 04 fixture updates) per BLOCKER B-2; this fold was honored exactly. Tasks 1-7 each landed with their own atomic commit. No auto-fixed bugs (Rule 1), no missing critical functionality added (Rule 2), no blocking issues (Rule 3), no architectural changes (Rule 4).

**Total deviations:** 0
**Impact on plan:** None.

## Issues Encountered

- **`__dirname` resolution for `package.json` path in `packageJsonSchema.test.ts`:** Compiled tests run from `out/test/test/unit/`, requiring `../../../../package.json` (4 levels up), but the source layout suggested `../../../` (3 levels). Resolved by checking both candidate paths and falling back if the 4-level path does not exist. This is robust to either compile layout. Discovered before commit, not after — no follow-up needed.
- **`tsc --noEmit -p .` reports a pre-existing `smol-toml` ErrorOptions error.** This is unrelated to Plan 01 changes and matches the baseline. The test compile (`tsc -p test/tsconfig.json`) is clean, lint is clean, and the full unit suite is green — the pre-existing typecheck noise is out-of-scope per the deviation-rule SCOPE BOUNDARY clause.

## User Setup Required

None — no external service configuration required.

## Next Plan Readiness

- **Plan 02** (Wave 2: `isSuppressed` + `suppressNotification`) can import `makeScopedConfig` directly from `test/unit/notifications.test.ts` — no helper duplication.
- **Plan 03** (Wave 2: migration) can use the same per-scope helper to exercise globalValue/workspaceValue/workspaceFolderValue migration paths (Pitfall 5 dodged).
- **Plan 04** (Wave 2: `TestWorkspaceConfig` mock surgery) is now strictly scoped to the single remaining task (the mock fields and the new `TestWorkspaceConfig suppressedNotifications default (NOTIF-08)` coverage suite). The four cascading-fixture updates that were originally Plan 04 Tasks 2-5 are now done.
- **Plan 05** (Wave 3: extension wire + schema removal) is gated on the A1 probe outcome. Plan 05's schema-removal task should be paired with the integration smoke check from 15-VALIDATION.md before flipping the `legacy ... STILL present` assertion in `packageJsonSchema.test.ts`.

## Self-Check

Verified each created file exists and each commit is reachable from HEAD.

- `package.json` — FOUND (modified)
- `src/settings.ts` — FOUND (modified)
- `test/unit/notifications.test.ts` — FOUND (created)
- `test/unit/packageJsonSchema.test.ts` — FOUND (created)
- `test/unit/settings/multiPathPrecedence.test.ts` — FOUND (modified)
- `test/unit/settings/verboseLogging.test.ts` — FOUND (modified)
- `test/unit/settings/projectUriDerivation.test.ts` — FOUND (modified)
- `test/unit/settings/logSettingsPlural.test.ts` — FOUND (modified)

Commit hashes (each verified via `git log --oneline | grep`):

- `ef3bc8c` — Task 1
- `dc235c7` — Task 2
- `e800364` — Task 3
- `8f1eb17` — Task 4
- `bcd26d2` — Task 5
- `fe6ca11` — Task 6
- `3d2ccdb` — Task 7

## Self-Check: PASSED

---
*Phase: 15-notification-suppression*
*Plan: 01*
*Completed: 2026-04-27*
