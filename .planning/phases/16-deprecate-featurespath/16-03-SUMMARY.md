---
phase: 16-deprecate-featurespath
plan: 03
subsystem: notifications
tags: [vscode-extension, settings-migration, featurespath, dep-02, dep-03]

requires:
  - phase: 16-deprecate-featurespath
    plan: 02
    provides: |
      `migrateScopedSetting<TSrc, TDest>` primitive + `TransformResult<T>` discriminated union;
      `makePerKeyScopedConfig` test helper; baseline pass count 690.
provides:
  - "`migrateLegacyFeaturesPath(wkspUri): Promise<boolean>` exported from `src/notifications.ts`"
  - "`FEATURES_PATH_NAMESPACES = ['gs-behave-bdd', 'behave-vsc']` module-internal constant (D-02)"
  - "`normalizePathEntry(s)` module-internal helper with byte-identical regex to src/settings.ts:204 (D-07)"
  - "12 new unit tests covering cases (a)-(j) — every D-XX decision verified"
  - "New baseline pass count = 702 (was 690)"
affects: [16-04, 16-05, 16-06]

tech-stack:
  added: []
  patterns:
    - "Per-namespace iteration around the D-MOD primitive (Phase 16 wrapper shape)"
    - "Single-source-of-truth normalize regex shared with src/settings.ts:204 (Pitfall 9 mitigation)"

key-files:
  created:
    - .planning/phases/16-deprecate-featurespath/16-03-SUMMARY.md
  modified:
    - src/notifications.ts
    - test/unit/notifications.test.ts

key-decisions:
  - "Helper iterates `FEATURES_PATH_NAMESPACES` and aggregates `anyMigrated` via OR — wrapper itself never throws (D-05 carryforward through primitive's catch+logInfo)"
  - "Transform handles three cases inline: empty/whitespace skip-with-removal (D-08), post-normalization-empty skip-with-removal (defensive — handles '/' or '\\' alone), and merge-with-dedup (D-06/D-07)"
  - "`destNamespace: 'gs-behave-bdd'` hardcoded inside the wrapper — both source namespaces' values land in the canonical destination, behave-vsc.featuresPaths is NEVER written (D-02)"
  - "Defensive `typeof legacyValue !== 'string'` guard catches user-typed non-string singular values (e.g., a number) and removes them as bad data — VS Code surfaces type mismatches separately"

patterns-established:
  - "Wrapper-around-primitive shape: `for (const ns of NAMESPACES) await migrateScopedSetting({...})` — Plan 04 will not need to know about scope ladders"

requirements-completed: [DEP-02, DEP-03]

duration: ~10min
completed: 2026-04-29
---

# Phase 16 Plan 03: Implement `migrateLegacyFeaturesPath` wrapper

**The user-visible Phase 16 migration helper now exists and is fully unit-tested. It loops the two
source namespaces (`gs-behave-bdd`, `behave-vsc`), calls the D-MOD primitive once per namespace
with a transform that handles same-scope merge-with-dedup, empty-string skip, and literal `.`
migration, and returns `Promise<boolean>` reflecting whether any (namespace × scope) was
migrated. Plan 04 will wire this into `extension.ts` `activate()`.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-29
- **Completed:** 2026-04-29
- **Tasks:** 2/2
- **Files modified:** 2 (`src/notifications.ts`, `test/unit/notifications.test.ts`)

## New Wrapper Signature

```typescript
// src/notifications.ts
export async function migrateLegacyFeaturesPath(wkspUri: vscode.Uri): Promise<boolean> {
  let anyMigrated = false;
  for (const sourceNs of FEATURES_PATH_NAMESPACES) {
    const migrated = await migrateScopedSetting<string, string[]>({
      namespace: sourceNs,
      sourceKey: "featuresPath",
      destNamespace: "gs-behave-bdd",     // D-02: canonical destination
      destKey: "featuresPaths",
      wkspUri,
      transform: (legacyValue, existingArr) => {
        // D-08: empty/whitespace → remove source but skip dest write.
        if (legacyValue === undefined || typeof legacyValue !== 'string' || legacyValue.trim() === "") {
          return { kind: 'skipDest', removeSource: true };
        }
        const normalized = normalizePathEntry(legacyValue);
        if (normalized === "") {
          return { kind: 'skipDest', removeSource: true };
        }
        // D-06 / D-07: same-scope merge-with-dedup, post-normalization comparison.
        const current = Array.isArray(existingArr) ? [...existingArr] : [];
        if (current.some(p => normalizePathEntry(p) === normalized)) {
          return { kind: 'write', value: current };
        }
        return { kind: 'write', value: [...current, normalized] };
      },
    });
    anyMigrated = anyMigrated || migrated;
  }
  return anyMigrated;
}
```

## Test Results — Cases (a)-(j) → D-XX Coverage

| Case | Test name fragment | Decisions | Status |
|------|--------------------|-----------|--------|
| (a) | gs-behave-bdd singular at WorkspaceFolder writes plural + removes legacy | D-01, D-03 | ✓ |
| (b) | gs-behave-bdd singular at Workspace scope | D-01, D-03 | ✓ |
| (c) | gs-behave-bdd singular at Global scope | D-01, D-03 | ✓ |
| (d) | behave-vsc singular migrates to gs-behave-bdd.featuresPaths | D-02 | ✓ |
| (e1) | singular AND plural at same scope: merge | D-06 | ✓ |
| (e2) | singular `/main/` dedupes against existing `["main"]` post-normalization | D-07 (Pitfall 9) | ✓ |
| (f) | cross-scope independence: gs-behave-bdd at WF + behave-vsc at WS | D-04 | ✓ |
| (g1) | empty-string singular: skip dest write, remove legacy | D-08 | ✓ |
| (g2) | whitespace-only singular: skip dest write, remove legacy | D-08 | ✓ |
| (h) | `.` migrates literally — downstream guard handles fatal error | D-09 | ✓ |
| (i) | no legacy value at any scope in either namespace — no-op returns false | D-01 | ✓ |
| (j) | update rejection: logs via logInfo, does NOT throw, returns false | D-05 | ✓ |

## Verification Results

| Check | Command | Expected | Actual | Status |
|-------|---------|----------|--------|--------|
| Lint | `npx eslint src --ext ts` | exit 0, no output | exit 0, no output | ✓ |
| New wrapper tests | `--grep "migrateLegacyFeaturesPath"` | 12 passing | 12 passing | ✓ |
| Plan 02 primitive tests (regression bar) | `--grep "migrateScopedSetting"` | 7 passing | 7 passing | ✓ |
| Phase 15 helper tests (regression bar) | `--grep "migrateLegacySuppressMultiConfig"` | ≥ 8 passing | 9 passing | ✓ |
| Full unit suite | `npm run test:unit` | ≥ 702 passing | **702 passing** | ✓ |
| Pass-count delta | baseline + 12 | exactly +12 | +12 (690 → 702) | ✓ |
| Wrapper export shape | `grep -c "export async function migrateLegacyFeaturesPath" src/notifications.ts` | 1 | 1 | ✓ |
| Two-namespace constant | `grep -c "FEATURES_PATH_NAMESPACES" src/notifications.ts` | ≥ 2 | 2 | ✓ |
| Normalize helper present | `grep -c "function normalizePathEntry" src/notifications.ts` | 1 | 1 | ✓ |
| Cross-namespace dest | `grep -c 'destNamespace: "gs-behave-bdd"' src/notifications.ts` | 1 | 1 | ✓ |

## Self-Check: PASSED

- `src/notifications.ts` contains `migrateLegacyFeaturesPath`, `FEATURES_PATH_NAMESPACES`, and `normalizePathEntry` (verified by full unit-test run + grep).
- `test/unit/notifications.test.ts` contains the new suite with cases (a)-(j) — all 12 tests passing.
- Commits exist: `c53429e` (feat — wrapper), `284d2e7` (test — 12-test suite).

## Task Commits

1. **Task 1: Implement migrateLegacyFeaturesPath wrapper + normalizePathEntry helper** — `c53429e` (feat)
2. **Task 2: 12-test suite for migrateLegacyFeaturesPath** — `284d2e7` (test)

## Decisions Made

None beyond what the plan specified. Plan numbers said "10 unit tests covering cases (a)-(j)" but cases include (e1), (e2), (g1), (g2) split from the merged plan headings — yielding 12 tests total. This matches the plan's own action block (which enumerates 12 distinct test stubs) and acceptance_criteria (which greps for each case label individually).

## Deviations from Plan

**1. [Rule 1 - Bug] Removed dead-code assertion in case (d) test**

- **Found during:** Task 2 first review pass before commit.
- **Issue:** The originally drafted assertion `wroteBehaveVscPlural` had `&& false` in its predicate, making it a tautology that always evaluated `false`. Since both namespace stubs share `updateSpy`, you cannot distinguish destination namespaces via the spy alone — the (key, scope) tuple combined with call ordering is the actual D-02 invariant signal.
- **Fix:** Replaced the dead-code block with a clean `allKeys` array assertion proving the dest-write key is `featuresPaths` and the source-removal key is `featuresPath`, in that order — the call ordering uniquely identifies the namespace path through the primitive.
- **Files modified:** `test/unit/notifications.test.ts`
- **Commit:** Folded into `284d2e7` (test commit) before the commit was made.

## Handoff to Plan 04

- **Helper available:** `import { migrateLegacyFeaturesPath } from './notifications'` — call inside the per-workspace activation loop in `extension.ts` `activate()`, BEFORE `migrateLegacySuppressMultiConfig` (per D-18: data shape first, UX cleanup second).
- **Use the boolean return** to decide whether to fire the post-loop user-visible notification (D-11). Aggregate across workspaces with OR; if ANY workspace migrated, fire ONE notification.
- **No reloadSettings needed** for the new `featuresPaths` array — the cached `WorkspaceSettings.featuresPaths` will be re-read on the next config-change event after the migration's `update()` calls fire. Plan 04 may still want an explicit `config.reloadSettings(wkspUri)` for immediate consistency (matches Plan 05 of Phase 15 — Pitfall 4 carryforward).
- **Baseline = 702**: Plan 04's regression bar is `>= 702` after its activation-loop wiring + 4 structural tests land.
