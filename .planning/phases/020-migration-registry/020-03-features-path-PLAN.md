---
phase: 020-migration-registry
plan: 03
type: execute
wave: 3
depends_on: [020-01-scaffolding-PLAN.md, 020-02-plain-entries-PLAN.md]
files_modified:
  - src/migrations/featuresPath.ts
  - src/migrations/registry.ts
  - src/notifications.ts
  - test/unit/migrations/featuresPath.test.ts
autonomous: true
requirements: [MIGRATE-01, MIGRATE-03, TEST-04]
must_haves:
  truths:
    - "`featuresPathMergeWithDedup` is a pure function exported from src/migrations/featuresPath.ts that preserves byte-identical v1.4.0 merge-with-dedup semantics."
    - "Two registry entries reference it: `featuresPath-self` (gs-behave-bdd.featuresPath -> gs-behave-bdd.featuresPaths) and `featuresPath-from-behavevsc` (behave-vsc.featuresPath -> gs-behave-bdd.featuresPaths)."
    - "The v1.4.0 wrapper `migrateLegacyFeaturesPath` continues to export the same `Promise<boolean>` signature and behavior so `test/unit/notifications.test.ts` still passes (Q2 — keep shim)."
    - "The migration regression bar (12 sub-cases in notifications.test.ts) stays green."
  artifacts:
    - path: "src/migrations/featuresPath.ts"
      provides: "featuresPathMergeWithDedup transform + featuresPathEntries (length 2)"
      exports: ["featuresPathMergeWithDedup", "featuresPathEntries"]
    - path: "src/migrations/registry.ts"
      provides: "MIGRATION_REGISTRY now spreads ...featuresPathEntries (registry size 11 -> 13)"
    - path: "src/notifications.ts"
      provides: "migrateLegacyFeaturesPath wrapper refactored to delegate to the lifted transform; FEATURES_PATH_NAMESPACES const removed"
    - path: "test/unit/migrations/featuresPath.test.ts"
      provides: "Transform unit tests (case-by-case) + per-entry TEST-04 coverage"
  key_links:
    - from: "src/migrations/registry.ts"
      to: "src/migrations/featuresPath.ts"
      via: "import { featuresPathEntries }"
      pattern: "from ['\"]\\./featuresPath['\"]"
    - from: "src/notifications.ts"
      to: "src/migrations/featuresPath.ts"
      via: "import { featuresPathMergeWithDedup }"
      pattern: "featuresPathMergeWithDedup"
---

<objective>
Lift `migrateLegacyFeaturesPath`'s transform body into `src/migrations/featuresPath.ts` as a pure exported function `featuresPathMergeWithDedup`, register two entries (`featuresPath-self` and `featuresPath-from-behavevsc`) referencing it, and refactor the existing `migrateLegacyFeaturesPath` wrapper to delegate to the lifted transform via the v1.4.0 primitive — keeping its public `Promise<boolean>` signature so `test/unit/notifications.test.ts` 12 sub-cases stay green (Q2 from Plan 01).

Purpose: split the v1.4.0 monolith into (transform fn) + (wrapper that loops namespaces) + (registry entries). Plan 05 deletes the activation-time call to the wrapper; the wrapper itself stays as a shim through v1.5.0 to preserve the regression test bar.

Output: 1 new source file, 1 modified registry, 1 surgically-edited notifications.ts, 1 new test file. Touches `src/notifications.ts` to lift the transform body — but the public surface (signature, semantics) of `migrateLegacyFeaturesPath` does not change.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/020-migration-registry/020-CONTEXT.md
@.planning/phases/020-migration-registry/020-RESEARCH.md
@.planning/phases/020-migration-registry/020-01-scaffolding-PLAN.md

@src/migrations/types.ts
@src/migrations/registry.ts
@src/migrations/evaluator.ts
@src/notifications.ts
@src/common.ts
@test/unit/notifications.test.ts

<lift_scope>
The exact byte-region of `src/notifications.ts` to lift:

- **Transform body** — lines 325-343 (the `transform: (legacyValue, existingArr) => { ... }` body inside `migrateLegacyFeaturesPath`). Lift verbatim. Imports needed in the new file: `normalizeFeaturesPathEntry` from `'../common'` and `TransformResult` from `'../notifications'`.
- **`FEATURES_PATH_NAMESPACES` const** — line 286-287. After lift, this const exists only inside the wrapper at `src/notifications.ts:316-348` so we either keep it inline (1 line) or delete it once the wrapper loops over a literal `['gs-behave-bdd', 'behave-vsc']` array. Recommendation: delete the const — Phase 22 deletes the wrapper entirely so minimizing the v1.4.0 footprint is preferable.
- **`normalizePathEntry` alias** — line 292. Keep the alias in `notifications.ts` if the wrapper still uses it; otherwise delete (the wrapper after refactor calls `featuresPathMergeWithDedup` and no longer needs the alias).

What NOT to touch in `notifications.ts`:
- `migrateScopedSetting` (lines 143-249) — primitive untouched per Phase 19 D-01.
- `TransformResult` type (line 116) — unchanged.
- `migrateLegacySuppressMultiConfig` (lines 261-282) — owned by Plan 04.
- The `export { migrateScopedSetting }` at L350 — keep.
- The `export type { TransformResult }` at L351 — keep.
</lift_scope>

<interfaces>
From `src/common.ts`:
```typescript
export function normalizeFeaturesPathEntry(p: string): string;
```

From `src/notifications.ts:116`:
```typescript
export type TransformResult<T> =
  | { kind: 'write'; value: T }
  | { kind: 'skipDest'; removeSource: boolean };
```

From `src/migrations/types.ts`:
```typescript
export interface MigrationEntry<TSrc = unknown, TDest = unknown> { ... }
```

Plan 02 already wired `plainEntries` into `MIGRATION_REGISTRY`. This plan adds two more entries via `...featuresPathEntries`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Lift transform into src/migrations/featuresPath.ts + define 2 entries</name>
  <files>src/migrations/featuresPath.ts</files>
  <behavior>
- Test 1: `featuresPathMergeWithDedup(undefined, [])` returns `{ kind: 'skipDest', removeSource: true }`.
- Test 2: `featuresPathMergeWithDedup('', [])` and `featuresPathMergeWithDedup('   ', [])` both return `{ kind: 'skipDest', removeSource: true }`.
- Test 3: `featuresPathMergeWithDedup('features', undefined)` returns `{ kind: 'write', value: ['features'] }`.
- Test 4: `featuresPathMergeWithDedup('features', ['features'])` returns `{ kind: 'write', value: ['features'] }` (dedup hit; primitive still removes source).
- Test 5: `featuresPathMergeWithDedup('features', ['tests'])` returns `{ kind: 'write', value: ['tests', 'features'] }` (append).
- Test 6: post-normalization-empty input (e.g. `'/'`) returns `{ kind: 'skipDest', removeSource: true }`.
- Test 7: `featuresPathEntries.length === 2`; ids `'featuresPath-self'` and `'featuresPath-from-behavevsc'`.
- Test 8: both entries reference the same `transform` reference (`featuresPathEntries[0].transform === featuresPathEntries[1].transform`) — proves D-A4.1 "sharing one exported transform".
  </behavior>
  <action>
Create `src/migrations/featuresPath.ts`:

```typescript
import type { MigrationEntry } from './types';
import type { TransformResult } from '../notifications';
import { normalizeFeaturesPathEntry } from '../common';

/**
 * Phase 20 D-A4.1: lifted from `src/notifications.ts:325-343` (the inner
 * `transform` body of v1.4.0's `migrateLegacyFeaturesPath`). Behavior is
 * byte-identical — same dedup regex, same skip-with-removal semantics,
 * same merge order. The 12 sub-case regression bar in
 * `test/unit/notifications.test.ts:601+` still pins this function via
 * the wrapper that delegates to it.
 *
 * Used by both registry entries below — D-A4.1 mandates that
 * featuresPath-self and featuresPath-from-behavevsc share one transform
 * reference (so the regression bar covers both wirings).
 */
export const featuresPathMergeWithDedup = (
  legacyValue: string | undefined,
  existingArr: string[] | undefined,
): TransformResult<string[]> => {
  if (legacyValue === undefined || typeof legacyValue !== 'string' || legacyValue.trim() === '') {
    return { kind: 'skipDest', removeSource: true };
  }
  const normalized = normalizeFeaturesPathEntry(legacyValue);
  if (normalized === '') {
    return { kind: 'skipDest', removeSource: true };
  }
  const current = Array.isArray(existingArr) ? [...existingArr] : [];
  if (current.some((p) => normalizeFeaturesPathEntry(p) === normalized)) {
    return { kind: 'write', value: current };
  }
  return { kind: 'write', value: [...current, normalized] };
};

/**
 * D-A4.1 / D-A4.2: two entries sharing one transform.
 *  - `featuresPath-self`           — gs-behave-bdd.featuresPath -> gs-behave-bdd.featuresPaths (intra-namespace; v1.4.0 singular -> plural).
 *  - `featuresPath-from-behavevsc` — behave-vsc.featuresPath    -> gs-behave-bdd.featuresPaths (cross-namespace).
 * Per D-A4.2 each gets its own `completedMigrations` slot — the user can
 * complete one without affecting the other.
 */
export const featuresPathEntries: readonly MigrationEntry[] = [
  {
    id: 'featuresPath-self',
    sourceNamespace: 'gs-behave-bdd',
    sourceKey: 'featuresPath',
    destNamespace: 'gs-behave-bdd',
    destKey: 'featuresPaths',
    transform: featuresPathMergeWithDedup as MigrationEntry['transform'],
  },
  {
    id: 'featuresPath-from-behavevsc',
    sourceNamespace: 'behave-vsc',
    sourceKey: 'featuresPath',
    destNamespace: 'gs-behave-bdd',
    destKey: 'featuresPaths',
    transform: featuresPathMergeWithDedup as MigrationEntry['transform'],
  },
];
```

The `as MigrationEntry['transform']` cast is necessary because the interface uses `unknown` for the type parameters by default; the lifted transform is concretely typed. This matches the Phase 19 plan-02 evaluator pattern and is preferable to widening the interface (rejected by D-A4.5).
  </action>
  <verify>
    <automated>npx eslint src --ext ts</automated>
    <automated>npm run compile</automated>
  </verify>
  <done>featuresPath.ts compiles; lint clean; exports both `featuresPathMergeWithDedup` and `featuresPathEntries`.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Test the transform + 2 entries in test/unit/migrations/featuresPath.test.ts</name>
  <files>test/unit/migrations/featuresPath.test.ts</files>
  <behavior>
See Task 1 behavior list (8 tests). Plus per-entry TEST-04 dimensions a + b (4 more tests — 2 per entry):
- For each of the 2 entries: `completedMigrations`-based skip at WorkspaceFolder scope returns `'already-finished'` with zero update calls.
- For each of the 2 entries: case-1 silent finish (neither legacy nor canonical set at any scope) marks Finished at all 3 scopes.
  </behavior>
  <action>
Create `test/unit/migrations/featuresPath.test.ts`. Pattern matches `plain.test.ts` (Plan 02 Task 2). Three suites:

1. `Phase 20 — featuresPathMergeWithDedup transform` — tests 1-6 from Behavior, pure unit tests of the lifted function. No vscode stubs needed (function is pure).

2. `Phase 20 — featuresPath entries: structure` — tests 7-8 from Behavior. Imports `featuresPathEntries` directly.

3. `Phase 20 — featuresPath entries: TEST-04 (D-A5.2 a + b)` — for each of `featuresPathEntries`, the same idempotency-skip and case-1-silent-finish patterns from `plain.test.ts`. Reuse the `makePerKeyScopedConfig` helper (copy inline as in Plan 02; cross-cutting consolidation deferred to Plan 05).

Note: this test file does NOT cover the case-2 transform end-to-end (legacy set, canonical absent, evaluator returns `pending-user-choice`). That path is exercised by the existing 12 sub-cases in `test/unit/notifications.test.ts:601+` via the wrapper, which Task 3 keeps green.
  </action>
  <verify>
    <automated>npx eslint src --ext ts</automated>
    <automated>npm run compile-tests &amp;&amp; node ./out/test/test/unit/run.js</automated>
  </verify>
  <done>~12 new tests pass; suite green.</done>
</task>

<task type="auto">
  <name>Task 3: Refactor migrateLegacyFeaturesPath wrapper + delete FEATURES_PATH_NAMESPACES + wire registry</name>
  <files>src/notifications.ts, src/migrations/registry.ts</files>
  <action>
Two surgical edits:

**Edit A — `src/notifications.ts`:** refactor the wrapper to import the lifted transform.

1. Add import near the top of the file (after the `normalizeFeaturesPathEntry` import on L4):
   ```typescript
   import { featuresPathMergeWithDedup } from './migrations/featuresPath';
   ```

2. Delete `FEATURES_PATH_NAMESPACES` (L286-L287) and the `normalizePathEntry` alias on L292 — both become dead code.

3. Replace the body of `migrateLegacyFeaturesPath` (L316-L348) with a delegation that loops the two source namespaces and reuses the lifted transform:

   ```typescript
   export async function migrateLegacyFeaturesPath(wkspUri: vscode.Uri): Promise<boolean> {
     let anyMigrated = false;
     for (const sourceNs of ['gs-behave-bdd', 'behave-vsc'] as const) {
       const migrated = await migrateScopedSetting<string, string[]>({
         namespace: sourceNs,
         sourceKey: 'featuresPath',
         destNamespace: 'gs-behave-bdd',
         destKey: 'featuresPaths',
         wkspUri,
         transform: featuresPathMergeWithDedup,
       });
       anyMigrated = anyMigrated || migrated;
     }
     return anyMigrated;
   }
   ```

   Public signature, behavior, and per-namespace ordering are byte-identical to v1.4.0 — only the transform body now lives in `src/migrations/featuresPath.ts`. The 12-sub-case regression bar at `test/unit/notifications.test.ts:601+` continues to bind.

   The unused JSDoc D-references (D-02, D-04, D-07, D-09 etc.) above the function can be trimmed to a short note: `/** Phase 20 D-A4.1: refactored to delegate to featuresPathMergeWithDedup. Public Promise<boolean> signature preserved through v1.5.0; full deletion is Phase 22. */`. Keep at minimum the "Never throws" line and a pointer to the registry entry id.

**Edit B — `src/migrations/registry.ts`:** spread `featuresPathEntries` into the array. After Plan 02 the file looks like:

   ```typescript
   import type { MigrationEntry } from './types';
   import { plainEntries } from './plain';
   // ...
   export const MIGRATION_REGISTRY: readonly MigrationEntry[] = [
     ...plainEntries,
     // featuresPath entries — added by Plan 03
     ...
   ];
   ```

   Update to:

   ```typescript
   import type { MigrationEntry } from './types';
   import { plainEntries } from './plain';
   import { featuresPathEntries } from './featuresPath';
   // ...
   export const MIGRATION_REGISTRY: readonly MigrationEntry[] = [
     ...plainEntries,
     ...featuresPathEntries,
     // suppressMultiConfig entry — added by Plan 04
     // envPresets entries — added by Plan 04
   ];
   ```

After this commit registry size goes from 11 -> 13. Plan 01's index.test.ts invariants (no collisions, all ids match the convention) still hold: 11 `*-from-behavevsc` plus `featuresPath-self` and `featuresPath-from-behavevsc` (one of these duplicates `projectPath`'s shape, which is the deliberate per-D-A4.4 count of 17 across all plans).
  </action>
  <verify>
    <automated>npx eslint src --ext ts</automated>
    <automated>npm run compile-tests &amp;&amp; node ./out/test/test/unit/run.js</automated>
  </verify>
  <done>Wrapper still callable from `test/unit/notifications.test.ts` (12 sub-cases pass); registry has 13 entries; full suite green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| (none new) | Same as Plan 01. The lifted transform is a pure function — same input domain (string | undefined), same output domain (TransformResult<string[]>), same dedup logic with `normalizeFeaturesPathEntry`. |

## STRIDE Threat Register

No new threats. Lifting the transform body to a new module is structural, not behavioral. The path-normalization regex inside `normalizeFeaturesPathEntry` is unchanged (Phase 16 W-07 single source of truth — verified by grep), so injection-shaped paths cannot bypass dedup any differently than they could in v1.4.0. The 12-sub-case regression bar at `test/unit/notifications.test.ts:601+` is the active mitigation.
</threat_model>

<verification>
- `npx eslint src --ext ts` exits 0 after each task.
- `npm run test:unit` green after each commit.
- `migrateLegacyFeaturesPath` 12 sub-cases (cases (a)-(j) in notifications.test.ts) all pass.
- New `test/unit/migrations/featuresPath.test.ts` adds ~12 tests.
- `MIGRATION_REGISTRY.length === 13` after Task 3.
- Grep `src/notifications.ts` confirms `FEATURES_PATH_NAMESPACES` and `normalizePathEntry` aliases are gone.
- The activation-ordering structural test at `test/unit/notifications.test.ts:876` (which greps `extension.ts` for `migrateLegacyFeaturesPath(wkspUri)`) still passes — Plan 03 does NOT change `extension.ts`, that's Plan 05's job.
</verification>

<success_criteria>
- 2 new entries in registry (`featuresPath-self`, `featuresPath-from-behavevsc`); transform shared by reference.
- v1.4.0 wrapper continues to work end-to-end via the lifted transform.
- New transform-level tests + per-entry idempotency tests + Plan 01 invariants all green.
- No behavioral diff in v1.4.0 features-path migration (regression bar GREEN).
</success_criteria>

<output>
After completion, create `.planning/phases/020-migration-registry/020-03-features-path-SUMMARY.md`.
</output>
