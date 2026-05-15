---
phase: 020-migration-registry
plan: 02
type: execute
wave: 2
depends_on: [020-01-scaffolding-PLAN.md]
files_modified:
  - src/migrations/plain.ts
  - src/migrations/registry.ts
  - test/unit/migrations/plain.test.ts
autonomous: true
requirements: [MIGRATE-03, TEST-04]
must_haves:
  truths:
    - "A `makePlainEntry` factory produces a `MigrationEntry` for any `behave-vsc.<key>` -> `gs-behave-bdd.<key>` plain-copy migration in one call."
    - "11 plain-copy entries are registered (the 15 keys from D-A1.3 minus the 4 transform-bearing keys)."
    - "Each plain entry, when run through the Phase 19 evaluator, performs a verbatim copy of legacy -> canonical at the most-specific scope where legacy is set."
    - "Idempotency holds (TEST-04): running the evaluator a second time after a Finished mark is a no-op."
  artifacts:
    - path: "src/migrations/plain.ts"
      provides: "makePlainEntry<T> factory + plainEntries readonly array (11 entries)"
      exports: ["makePlainEntry", "plainEntries"]
    - path: "src/migrations/registry.ts"
      provides: "MIGRATION_REGISTRY array now includes ...plainEntries"
    - path: "test/unit/migrations/plain.test.ts"
      provides: "Factory unit tests + per-entry case-1 and idempotency assertions"
  key_links:
    - from: "src/migrations/registry.ts"
      to: "src/migrations/plain.ts"
      via: "import { plainEntries }"
      pattern: "from ['\"]\\./plain['\"]"
    - from: "test/unit/migrations/plain.test.ts"
      to: "src/migrations"
      via: "evaluateMigration import"
      pattern: "evaluateMigration"
---

<objective>
Land the `makePlainEntry` factory and register the 11 plain-copy `behave-vsc.<key>` -> `gs-behave-bdd.<key>` entries (D-A1.3 minus the 4 transform-bearing keys: `featuresPath`, `suppressedNotifications`, `envVarPresets`, `envVarOverrides`). Add unit tests covering the factory shape, the case-1 silent finish (TEST-04 dimension b), and the `completedMigrations`-based skip (TEST-04 dimension a). The 4 transform-bearing keys are owned by Plans 03 and 04.

Purpose: prove the registry pattern at scale. Once 11 plain entries flow through the Phase 19 evaluator without behavioral changes to the rest of the system, Plans 03/04 can confidently add their transform-bearing entries on top.

Output: 1 new source file, 1 modified registry file, 1 new test file. No changes outside `src/migrations/` or `test/unit/migrations/`.
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
@test/unit/migrations.test.ts

<plain_keys_inventory>
The 11 keys this plan ships entries for (subset of CONTEXT.md D-A1.3 with the 4 transform-bearing keys removed):

| Source / Dest key | Type | Notes |
|---|---|---|
| projectPath | string | also explicit-checked in common.ts:222 / projectList.ts:180 |
| runParallel | boolean | |
| justMyCode | boolean | |
| xRay | boolean | window scope |
| verboseLogging | boolean | window scope; uncertain whether behave-vsc had it (D-A1.2 accepts case-1 silent) |
| multiRootRunWorkspacesInParallel | boolean | window scope |
| importStrategy | string enum | |
| stepDefinitionSearchTimeout | number | |
| discoveryDepth | number | new in v1.5.0; case-1 silent (D-A1.2) |
| discoveryStopOnFirstHit | boolean | new in v1.5.0; case-1 silent (D-A1.2) |
| activeEnvVarPreset | string | |

Total: 11. The 4 keys NOT in this plan (`featuresPath` -> Plan 03, `suppressedNotifications` -> Plan 04, `envVarPresets` -> Plan 04, `envVarOverrides` -> Plan 04) are transform-bearing.
</plain_keys_inventory>

<interfaces>
From `src/migrations/types.ts`:
```typescript
export interface MigrationEntry<TSrc = unknown, TDest = unknown> {
  readonly id: string;
  readonly sourceNamespace: string;
  readonly sourceKey: string;
  readonly destNamespace: string;
  readonly destKey: string;
  readonly transform: (src: TSrc, destAtSameScope: TDest | undefined) => TransformResult<TDest>;
}
```

From `src/notifications.ts:116`:
```typescript
type TransformResult<T> =
  | { kind: 'write'; value: T }
  | { kind: 'skipDest'; removeSource: boolean };
// re-exported at L350
```

From `src/migrations/index.ts` (already exported, available to tests):
```typescript
export { evaluateMigration, evaluateAllMigrations } from './evaluator';
export { isMigrationFinishedAtScope, markMigrationFinishedAtScope } from './completedMigrations';
export { ALL_MIGRATION_SCOPES } from './types';
```

Test stub helper (available in `test/unit/migrations.test.ts:33`):
```typescript
function makePerKeyScopedConfig(
  byKey: Record<string, ScopeValues>,
  updateSpy?: sinon.SinonSpy,
): { get; has; inspect; update };
```
This plan extracts/imports it — see Task 3 below.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement `makePlainEntry` factory + 11 plainEntries in src/migrations/plain.ts</name>
  <files>src/migrations/plain.ts</files>
  <behavior>
- Test 1 (in next task): `makePlainEntry('xRay')` returns a `MigrationEntry` with id `'xRay-from-behavevsc'`, sourceNamespace `'behave-vsc'`, sourceKey `'xRay'`, destNamespace `'gs-behave-bdd'`, destKey `'xRay'`.
- Test 2: `makePlainEntry('runParallel', 'runParallel')` (explicit destKey) is identical to `makePlainEntry('runParallel')`.
- Test 3: the factory's `transform(src, _existing)` returns `{ kind: 'write', value: src }` regardless of the existing dest value (plain entries are last-write-wins copies; case-3 is Phase 21 territory).
- Test 4: `plainEntries.length === 11`.
- Test 5: every id in `plainEntries` ends with `-from-behavevsc`.
  </behavior>
  <action>
Create `src/migrations/plain.ts`. Header comment cites CONTEXT.md D-A3.1 and the inventory in this plan.

```typescript
import type { MigrationEntry } from './types';

/**
 * Phase 20 D-A3.1: factory for the 11 plain-copy `behave-vsc.<key>` ->
 * `gs-behave-bdd.<key>` migration entries. Source namespace is always
 * `behave-vsc` and dest namespace is always `gs-behave-bdd` — they are not
 * parameters because they never vary for plain entries.
 *
 * The transform is unconditional `{ kind: 'write', value: src }`. The
 * Phase 19 evaluator (case 1/2/3 dispatch) gates this transform: it is only
 * invoked in case 2 (legacy set, canonical absent) where straight copy is
 * the right semantics. Case 3 is owned by Phase 21 and overrides the
 * transform's behavior via the action callback.
 */
export function makePlainEntry<T>(
  sourceKey: string,
  destKey: string = sourceKey,
): MigrationEntry<T, T> {
  return {
    id: `${sourceKey}-from-behavevsc`,
    sourceNamespace: 'behave-vsc',
    sourceKey,
    destNamespace: 'gs-behave-bdd',
    destKey,
    transform: (src) => ({ kind: 'write', value: src }),
  };
}

export const plainEntries: readonly MigrationEntry[] = [
  makePlainEntry<string>('projectPath'),
  makePlainEntry<boolean>('runParallel'),
  makePlainEntry<boolean>('justMyCode'),
  makePlainEntry<boolean>('xRay'),
  makePlainEntry<boolean>('verboseLogging'),
  makePlainEntry<boolean>('multiRootRunWorkspacesInParallel'),
  makePlainEntry<string>('importStrategy'),
  makePlainEntry<number>('stepDefinitionSearchTimeout'),
  makePlainEntry<number>('discoveryDepth'),
  makePlainEntry<boolean>('discoveryStopOnFirstHit'),
  makePlainEntry<string>('activeEnvVarPreset'),
];
```

Match the order in the inventory table for review-ability. No imports beyond `./types`.
  </action>
  <verify>
    <automated>npx eslint src --ext ts</automated>
    <automated>npm run compile</automated>
  </verify>
  <done>plain.ts exists; lint clean; compiles. Registry not yet wired (Task 3).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Test the factory + per-entry behavior in test/unit/migrations/plain.test.ts</name>
  <files>test/unit/migrations/plain.test.ts</files>
  <behavior>
TEST-04 dimensions covered for every plain entry:
- Dimension a: when `completedMigrations` at a scope already contains `entry.id`, evaluator returns `{ scope, case: 1, action: 'already-finished' }` and never calls `update()` (other than nothing) for that scope.
- Dimension b: when neither legacy nor canonical is set at a scope, evaluator returns `{ scope, case: 1, action: 'finished' }` and writes the entry id into `completedMigrations` at that scope (a single update call) — no transform-side write.

Plus factory-level tests (Behavior list from Task 1).
  </behavior>
  <action>
Create `test/unit/migrations/plain.test.ts`. Mirror the Sinon/per-test sandbox pattern from `test/unit/migrations.test.ts` (Phase 19 — copy the `makePerKeyScopedConfig` helper inline rather than refactoring it into a shared file in this plan; cross-cutting refactor is Plan 05's call). The helper handles the (sourceKey + completedMigrations) two-key inspect pattern that the evaluator drives.

Test layout:

```typescript
suite('Phase 20 — plain.ts factory', () => {
  test('makePlainEntry produces the documented shape', () => { ... });
  test('explicit destKey equals default destKey', () => { ... });
  test('transform returns { kind: write, value: src } unconditionally', () => { ... });
  test('plainEntries.length === 11', () => { ... });
  test('every plainEntries id ends with -from-behavevsc', () => { ... });
});

suite('Phase 20 — plain entries: TEST-04 idempotency (D-A5.2 dimension a)', () => {
  // Loop over all plainEntries; for each, stub completedMigrations at scope X
  // to include entry.id, then assert evaluator returns 'already-finished' and
  // makes zero update() calls.
  for (const entry of plainEntries) {
    test(`${entry.id} skipped when already in completedMigrations at WorkspaceFolder`, async () => {
      // Sinon stub vscode.workspace.getConfiguration to return makePerKeyScopedConfig
      // with completedMigrations.workspaceFolderValue = [entry.id], all other reads undefined.
      // Call evaluateMigration(entry, MOCK_URI). Assert action === 'already-finished' and
      // updateSpy.callCount === 0.
    });
  }
});

suite('Phase 20 — plain entries: TEST-04 case-1 silent finish (D-A5.2 dimension b)', () => {
  for (const entry of plainEntries) {
    test(`${entry.id} marks Finished at all scopes when nothing is set`, async () => {
      // Stub all reads as undefined. Call evaluateMigration. Assert all 3 results
      // have case: 1, action: 'finished'. Assert update was called exactly 3 times,
      // each with key === 'completedMigrations' and value containing entry.id.
    });
  }
});
```

Important: import `evaluateMigration`, `plainEntries`, `MIGRATION_REGISTRY` from `../../../src/migrations` and `../../../src/migrations/plain` respectively. Use Sinon to stub `vscode.workspace.getConfiguration` per-test in a beforeEach/afterEach sandbox. The `makePerKeyScopedConfig` body lifts verbatim from `test/unit/migrations.test.ts:33-59` — copy it into this file (DRY violation accepted; Plan 05 may consolidate).

Avoid any `cfg.get(` calls in production code paths under test (Pitfall 2 — gate enforced in Plan 05).
  </action>
  <verify>
    <automated>npx eslint src --ext ts</automated>
    <automated>npm run compile-tests &amp;&amp; node ./out/test/test/unit/run.js</automated>
  </verify>
  <done>22 new tests pass (5 factory + 11 idempotency + 11 case-1 silent finish, +/- depending on suite layout); full suite stays green; no regressions in `test/unit/migrations.test.ts` or `test/unit/notifications.test.ts`.</done>
</task>

<task type="auto">
  <name>Task 3: Wire plainEntries into MIGRATION_REGISTRY</name>
  <files>src/migrations/registry.ts</files>
  <action>
Edit `src/migrations/registry.ts`. Replace the empty array body with:

```typescript
import type { MigrationEntry } from './types';
import { plainEntries } from './plain';

/**
 * Phase 20 D-A4.4: aggregated registry. Final count is 17 entries:
 *   - 11 plain-copy entries from `./plain` (this commit)
 *   - 2 featuresPath entries from `./featuresPath` (Plan 03)
 *   - 1 suppressMultiConfig entry from `./suppressedNotifications` (Plan 04)
 *   - 2 envPresets entries from `./envPresets` (Plan 04)
 */
export const MIGRATION_REGISTRY: readonly MigrationEntry[] = [
  ...plainEntries,
  // featuresPath entries — added by Plan 03
  // suppressMultiConfig entry — added by Plan 04
  // envPresets entries — added by Plan 04
];
```

This commit transitions the registry from 0 to 11 entries. The Phase 19 evaluator picks them up automatically because it iterates `MIGRATION_REGISTRY` at runtime. NO changes to `extension.ts` in this plan — activation wiring is Plan 05.

After the edit, the `index.test.ts` invariant from Plan 01 still holds: 11 unique ids, all ending in `-from-behavevsc`.
  </action>
  <verify>
    <automated>npx eslint src --ext ts</automated>
    <automated>npm run compile-tests &amp;&amp; node ./out/test/test/unit/run.js</automated>
  </verify>
  <done>Registry has 11 entries; index.test.ts no-collision and naming-convention tests pass; full suite green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| (none new) | Same as Plan 01. The plain entries inherit the Phase 19 evaluator's hardened cfg.inspect()/update() boundary. The transform copies `behave-vsc` user-set values verbatim — no validation per CONTEXT `<deferred>`; downstream `WorkspaceSettings` constructor surfaces bad values. |

## STRIDE Threat Register

No new threats. The 11 entries are pure data + a one-line transform. They reuse Phase 19's threat mitigations:
- T-19-* mitigations (cfg.inspect Pitfall 2, never-throw contract, idempotency via completedMigrations) all carry forward unchanged.
- No new external surface. `behave-vsc.*` reads were already in place via `getWithLegacyFallback` (`src/settings.ts:16`); we are just exposing them through the registry's same-shape inspect path.
</threat_model>

<verification>
- `npx eslint src --ext ts` exits 0 after every task.
- `npm run test:unit` (full suite) green after each commit; baseline 739 -> ~761+ tests (5 factory + 11 idempotency + 11 case-1 = 27 new).
- `MIGRATION_REGISTRY.length === 11` after Task 3.
- No diff in `src/extension.ts`, `src/notifications.ts`, `src/settings.ts`, or any test file outside `test/unit/migrations/plain.test.ts`.
</verification>

<success_criteria>
- All 11 plain entries appear in the registry with the correct id shape.
- Factory + idempotency + case-1 silent-finish tests pass for every entry.
- Plan 01's `index.test.ts` registry-invariants test still passes (no id collisions; all ids match the convention).
- Existing `test/unit/notifications.test.ts` (the wrapper-import bar from Q2) continues to pass — Plan 02 does not touch the v1.4.0 wrappers.
</success_criteria>

<output>
After completion, create `.planning/phases/020-migration-registry/020-02-plain-entries-SUMMARY.md`.
</output>
