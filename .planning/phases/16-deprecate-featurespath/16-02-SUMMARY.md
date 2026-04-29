---
phase: 16-deprecate-featurespath
plan: 02
subsystem: notifications
tags: [vscode-extension, settings-migration, refactor, modularity, regression-bar]

requires:
  - phase: 15-notification-suppression
    provides: |
      `migrateLegacySuppressMultiConfig` reference helper, the 8 sub-case regression bar,
      `makePerKeyScopedConfig` test helper (re-exported by Plan 01).
provides:
  - "`migrateScopedSetting<TSrc, TDest>` generic primitive with `TransformResult<T>` discriminated union"
  - "`TransformResult<T>` exported type for transform callback shape"
  - "Refactored `migrateLegacySuppressMultiConfig` delegating to primitive (Promise<void> preserved)"
  - "7 direct primitive unit tests covering both `write`/`skipDest` branches, cross-namespace writes, Pitfall 2 same-scope read, no-op, and rejection paths"
  - "New baseline pass count = 690 (was 683)"
affects: [16-03, 16-04]

tech-stack:
  added: []
  patterns:
    - "Discriminated-union return shape for migration transform callbacks (Pattern 1 in 16-RESEARCH.md)"
    - "Most-specific-scope-wins detection extracted into reusable primitive (D-MOD)"

key-files:
  created:
    - .planning/phases/16-deprecate-featurespath/16-02-SUMMARY.md
  modified:
    - src/notifications.ts
    - test/unit/notifications.test.ts

key-decisions:
  - "Primitive exported (not module-internal) so Task 2 can directly test the discriminated-union semantics"
  - "`removeSource` flag on `skipDest` branch preserves the Phase 15 `callCount === 0` contract while enabling Phase 16 blank-string drop semantics"
  - "Cross-namespace path: when `destNamespace` differs, primitive resolves a separate `getConfiguration` for the dest while reusing the source `cfg` for same-namespace migrations (no double-resolution overhead in the Phase 15 wrapper case)"

patterns-established:
  - "Generic scope-preserving migration primitive (D-MOD) — consumed by Phase 15 wrapper now, Plan 03 featuresPath wrapper next"

requirements-completed: [DEP-07]

duration: ~10min
completed: 2026-04-29
---

# Phase 16 Plan 02: Extract `migrateScopedSetting` primitive (D-MOD)

**The Phase 15 inspect-detect-scope-write-then-remove-legacy mechanics are now a generic
`migrateScopedSetting<TSrc, TDest>` primitive with a `TransformResult<T>` discriminated
union. `migrateLegacySuppressMultiConfig` delegates to it; all 8 existing Phase 15
sub-cases still pass (regression bar). 7 new direct primitive tests lock the
discriminated-union semantics for Plan 03's consumer.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-29
- **Completed:** 2026-04-29
- **Tasks:** 2/2
- **Files modified:** 2 (`src/notifications.ts`, `test/unit/notifications.test.ts`)

## Accomplishments

- **Primitive extracted:** New `migrateScopedSetting<TSrc, TDest>` async function in
  `src/notifications.ts` (D-MOD). Encapsulates inspect → most-specific-scope detection →
  same-scope dest read (Pitfall 2) → transform → write+remove at same target → never-throws
  rejection log.
- **Discriminated-union return contract:**
  ```typescript
  type TransformResult<T> =
    | { kind: 'write'; value: T }
    | { kind: 'skipDest'; removeSource: boolean };
  ```
- **Phase 15 wrapper refactored:** `migrateLegacySuppressMultiConfig` body shrank to a
  ~10-line `transform` callback; public `Promise<void>` signature unchanged.
- **Regression bar GREEN (D-MOD CONTEXT.md L46):** all 8 existing
  `migrateLegacySuppressMultiConfig` sub-cases at `test/unit/notifications.test.ts:289-388`
  pass against the refactored implementation — including the load-bearing `callCount === 0`
  assertion at L335 (legacyValue !== true case).
- **7 new direct primitive tests** added under
  `Phase 16 — notifications: migrateScopedSetting (D-MOD primitive)`, covering both
  TransformResult branches, cross-namespace writes, Pitfall 2 same-scope read,
  no-source-value no-op, and update-rejection log-and-return-false.

## Task Commits

1. **Task 1: Extract primitive + refactor Phase 15 helper** — `c83e785` (refactor)
2. **Task 2: Direct primitive unit tests** — `a89227e` (test)

## Diff Snippet — Refactored Phase 15 helper

```typescript
export async function migrateLegacySuppressMultiConfig(wkspUri: vscode.Uri): Promise<void> {
  await migrateScopedSetting<boolean, string[]>({
    namespace: "gs-behave-bdd",
    sourceKey: "suppressMultiConfigNotification",
    destKey: "suppressedNotifications",
    wkspUri,
    transform: (legacyValue, existingArr) => {
      if (legacyValue !== true) {
        return { kind: 'skipDest', removeSource: false };
      }
      const current = Array.isArray(existingArr) ? [...existingArr] : [];
      if (current.includes("multiConfigNotification")) {
        return { kind: 'write', value: current };
      }
      return { kind: 'write', value: [...current, "multiConfigNotification"] };
    },
  });
}
```

## Verification Results

| Check | Command | Expected | Actual | Status |
|-------|---------|----------|--------|--------|
| Lint | `npx eslint src --ext ts` | exit 0, no output | exit 0, no output | ✓ |
| Regression bar (Phase 15) | `npm run test:unit` (8 sub-cases under `--grep migrateLegacySuppressMultiConfig`) | 8 passing | 8 passing | ✓ |
| New primitive tests | `npm run test:unit` (7 sub-cases under `--grep migrateScopedSetting`) | 7 passing | 7 passing | ✓ |
| Full unit suite | `npm run test:unit` | ≥ 690 passing | **690 passing** | ✓ |
| Pass-count delta | baseline + 7 | exactly +7 | +7 (683 → 690) | ✓ |
| Primitive shape | `grep -c "function migrateScopedSetting" src/notifications.ts` | 1 | 1 | ✓ |
| TransformResult exported | `grep -c "type TransformResult" src/notifications.ts` | 1 | 1 | ✓ |
| Phase 15 wrapper delegates | `grep -c "await migrateScopedSetting" src/notifications.ts` | 1 | 1 | ✓ |
| Public signature preserved | `grep -c "^export async function migrateLegacySuppressMultiConfig" src/notifications.ts` | 1 | 1 | ✓ |

## Self-Check: PASSED

- `src/notifications.ts` exists and contains the primitive (verified by full unit-test run).
- `test/unit/notifications.test.ts` exists with new suite (verified by 690 pass count vs. 683 baseline = +7 new tests).
- Commits exist: `c83e785` (refactor) and `a89227e` (test).

## Decisions Made

None beyond what the plan specified — primitive shape, discriminated-union, and
delegation form all match the plan's `<action>` blocks verbatim.

## Deviations from Plan

None — plan executed exactly as written.

## Handoff to Plan 03

- **Primitive available:** `import { migrateScopedSetting }` from `src/notifications`. Plan 03's `migrateLegacyFeaturesPath` wrapper is a thin caller — no scope-ladder copy-paste needed.
- **TransformResult shape:** Plan 03's transform should return `{ kind: 'skipDest', removeSource: true }` for the blank-string D-08 case (drop legacy), matching the semantic locked in Test 2 of the new suite.
- **Cross-namespace works:** if Plan 03 needs to migrate `behave-vsc.featuresPath` → `gs-behave-bdd.featuresPaths`, pass `destNamespace: 'gs-behave-bdd'`. Test 4 in the new suite locks this contract.
- **Baseline = 690**: Plan 03's regression bar is `>= 690` after its wrapper + tests land.
