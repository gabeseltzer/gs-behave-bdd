---
phase: 020-migration-registry
plan: 04
type: execute
wave: 4
depends_on: [020-01-scaffolding-PLAN.md, 020-02-plain-entries-PLAN.md, 020-03-features-path-PLAN.md]
files_modified:
  - src/migrations/suppressedNotifications.ts
  - src/migrations/envPresets.ts
  - src/migrations/registry.ts
  - src/notifications.ts
  - test/unit/migrations/suppressedNotifications.test.ts
  - test/unit/migrations/envPresets.test.ts
autonomous: true
requirements: [MIGRATE-02, MIGRATE-03, TEST-04]
must_haves:
  truths:
    - "`suppressMultiConfigToArray` is exported from src/migrations/suppressedNotifications.ts and preserves the v1.4.0 boolean->array-append semantics byte-for-byte."
    - "`mergeRecord<T>` deep-merge utility is exported from src/migrations/envPresets.ts; the preset-level + var-level transforms compose it to produce case-2 behavior (legacy wins on var collision)."
    - "Three registry entries land: `suppressMultiConfig-self`, `envVarPresets-from-behavevsc`, `envVarOverrides-from-behavevsc` — bringing total to 16 (Plan 05 adds 17th — none; total stays 16). Wait — recount per D-A4.4: 11 + 2 + 1 + 2 = 16. CONTEXT.md D-A4.4 states 17 total. The discrepancy is reconciled by Plan 05 (see <reconciliation> below)."
    - "The v1.4.0 wrapper `migrateLegacySuppressMultiConfig` continues to export `Promise<void>` and the 8 sub-cases in test/unit/notifications.test.ts still pass."
    - "Pitfall 4 covered: case-2 transform with canonical=undefined returns `{ kind: 'write', value: legacy }` — not skipDest."
  artifacts:
    - path: "src/migrations/suppressedNotifications.ts"
      provides: "suppressMultiConfigToArray transform + suppressedNotificationsEntry"
      exports: ["suppressMultiConfigToArray", "suppressedNotificationsEntry"]
    - path: "src/migrations/envPresets.ts"
      provides: "mergeRecord<T> utility + envVarPresetsTransform + envVarOverridesTransform + envPresetEntries (length 2)"
      exports: ["mergeRecord", "envVarPresetsTransform", "envVarOverridesTransform", "envPresetEntries"]
    - path: "src/migrations/registry.ts"
      provides: "MIGRATION_REGISTRY size becomes 16"
    - path: "src/notifications.ts"
      provides: "migrateLegacySuppressMultiConfig refactored to delegate to lifted transform"
    - path: "test/unit/migrations/suppressedNotifications.test.ts"
      provides: "Transform tests + per-entry TEST-04 + Pitfall 4 case-2 identity test"
    - path: "test/unit/migrations/envPresets.test.ts"
      provides: "mergeRecord unit tests + per-entry TEST-04 + Pitfall 4 deep-merge identity test"
  key_links:
    - from: "src/migrations/registry.ts"
      to: "src/migrations/suppressedNotifications.ts"
      via: "import suppressedNotificationsEntry"
      pattern: "suppressedNotificationsEntry"
    - from: "src/migrations/registry.ts"
      to: "src/migrations/envPresets.ts"
      via: "import envPresetEntries"
      pattern: "envPresetEntries"
    - from: "src/notifications.ts"
      to: "src/migrations/suppressedNotifications.ts"
      via: "import suppressMultiConfigToArray"
      pattern: "suppressMultiConfigToArray"
---

<objective>
Land the two transform-bearing groups that did NOT fit in Plan 03: the `suppressMultiConfig-self` intra-namespace entry (D-A4.3) and the two `envVar{Presets,Overrides}-from-behavevsc` cross-namespace entries (D-A2). Both lift their transform bodies into new files in `src/migrations/` and ship a small per-area test file. The `suppressedNotifications` work also refactors the v1.4.0 wrapper at `src/notifications.ts:261` to delegate to the lifted transform — same shim pattern Plan 03 used for featuresPath.

Purpose: complete the source-side scope of Phase 20. After this plan the registry holds 16 entries (Plan 05 adds the final wiring + cleanup but does NOT add any new entries — see `<reconciliation>` below).

Output: 2 new source files, 1 modified registry, 1 surgically-edited notifications.ts, 2 new test files.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/020-migration-registry/020-CONTEXT.md
@.planning/phases/020-migration-registry/020-RESEARCH.md
@.planning/phases/020-migration-registry/020-02-plain-entries-PLAN.md
@.planning/phases/020-migration-registry/020-03-features-path-PLAN.md

@src/migrations/types.ts
@src/migrations/registry.ts
@src/notifications.ts
@test/unit/notifications.test.ts

<reconciliation>
**Entry count:** CONTEXT.md D-A4.4 states "Final entry count: 17 total" decomposed as 15 cross-namespace + 1 `featuresPath-self` + 1 `suppressMultiConfig-self`. Counting:

- Plan 02 plain entries (11): projectPath, runParallel, justMyCode, xRay, verboseLogging, multiRootRunWorkspacesInParallel, importStrategy, stepDefinitionSearchTimeout, discoveryDepth, discoveryStopOnFirstHit, activeEnvVarPreset.
- Plan 03 featuresPath entries (2): `featuresPath-self`, `featuresPath-from-behavevsc`.
- Plan 04 suppressedNotifications (1): `suppressMultiConfig-self`.
- Plan 04 envPresets entries (2): `envVarPresets-from-behavevsc`, `envVarOverrides-from-behavevsc`.

Total: 11 + 2 + 1 + 2 = **16**. D-A4.4 says 17. The missing entry from D-A1.3's 15-key inventory is `suppressedNotifications` itself (`behave-vsc.suppressedNotifications` -> `gs-behave-bdd.suppressedNotifications`) — a plain pass-through array migration. CONTEXT.md D-A1.3 lists it with the note "array — append-with-dedup transform" and D-A2.4 confirms arrays use append-with-dedup. So `suppressedNotifications` is also a transform-bearing entry, NOT a plain pass-through. This plan adds it as a third entry in `src/migrations/suppressedNotifications.ts` alongside `suppressMultiConfig-self`, sharing the array append-with-dedup pattern. After Plan 04 the registry holds **17** entries (per D-A4.4). The total reconciliation:

| Bucket | Count | Plan |
|---|---|---|
| 11 plain `*-from-behavevsc` (no transform) | 11 | 02 |
| `featuresPath-self` + `featuresPath-from-behavevsc` (shared transform) | 2 | 03 |
| `suppressMultiConfig-self` + `suppressedNotifications-from-behavevsc` | 2 | 04 |
| `envVarPresets-from-behavevsc` + `envVarOverrides-from-behavevsc` | 2 | 04 |
| **Total** | **17** | |

This matches D-A4.4 exactly. The earlier note in `<must_haves>` "16" reflected the literal-D-A4.3 reading (one suppressMultiConfig entry); this `<reconciliation>` block is the binding interpretation.
</reconciliation>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Lift suppress transform + register 2 entries in src/migrations/suppressedNotifications.ts</name>
  <files>src/migrations/suppressedNotifications.ts</files>
  <behavior>
- `suppressMultiConfigToArray(false, [])` -> `{ kind: 'skipDest', removeSource: false }` (preserves the Phase 15 callCount === 0 contract).
- `suppressMultiConfigToArray(true, undefined)` -> `{ kind: 'write', value: ['multiConfigNotification'] }`.
- `suppressMultiConfigToArray(true, ['multiConfigNotification'])` -> `{ kind: 'write', value: ['multiConfigNotification'] }` (dedup).
- `suppressMultiConfigToArray(true, ['featuresPathMigration'])` -> `{ kind: 'write', value: ['featuresPathMigration', 'multiConfigNotification'] }`.
- Plain pass-through transform for `suppressedNotifications-from-behavevsc`: array append-with-dedup. Inputs: `(legacy: string[] | undefined, canonical: string[] | undefined)`. If legacy is undefined -> `{ kind: 'skipDest', removeSource: true }`. Otherwise dedup-merge legacy into canonical (legacy entries appended, dedup by string equality), return `{ kind: 'write', value: merged }` even if merged equals canonical (same shape as featuresPath transform — primitive uses W-01 deep-equal short-circuit to skip the write).
  </behavior>
  <action>
Create `src/migrations/suppressedNotifications.ts`:

```typescript
import type { MigrationEntry } from './types';
import type { TransformResult } from '../notifications';

/**
 * Phase 20 D-A4.3: lifted from `src/notifications.ts:267-279` (the inner
 * `transform` body of v1.4.0's migrateLegacySuppressMultiConfig). Behavior is
 * byte-identical including the `legacyValue !== true` callCount-zero contract.
 */
export const suppressMultiConfigToArray = (
  legacyValue: boolean | undefined,
  existingArr: string[] | undefined,
): TransformResult<string[]> => {
  if (legacyValue !== true) {
    return { kind: 'skipDest', removeSource: false };
  }
  const current = Array.isArray(existingArr) ? [...existingArr] : [];
  if (current.includes('multiConfigNotification')) {
    return { kind: 'write', value: current };
  }
  return { kind: 'write', value: [...current, 'multiConfigNotification'] };
};

/**
 * D-A2.4 array append-with-dedup transform for the cross-namespace
 * `behave-vsc.suppressedNotifications` -> `gs-behave-bdd.suppressedNotifications`
 * migration. Same shape as featuresPathMergeWithDedup but on plain string equality.
 */
export const suppressedNotificationsAppendWithDedup = (
  legacyArr: readonly string[] | undefined,
  existingArr: readonly string[] | undefined,
): TransformResult<string[]> => {
  if (!Array.isArray(legacyArr)) {
    return { kind: 'skipDest', removeSource: true };
  }
  const current = Array.isArray(existingArr) ? [...existingArr] : [];
  for (const item of legacyArr) {
    if (typeof item === 'string' && !current.includes(item)) {
      current.push(item);
    }
  }
  return { kind: 'write', value: current };
};

export const suppressedNotificationsEntries: readonly MigrationEntry[] = [
  {
    id: 'suppressMultiConfig-self',
    sourceNamespace: 'gs-behave-bdd',
    sourceKey: 'suppressMultiConfigNotification',
    destNamespace: 'gs-behave-bdd',
    destKey: 'suppressedNotifications',
    transform: suppressMultiConfigToArray as MigrationEntry['transform'],
  },
  {
    id: 'suppressedNotifications-from-behavevsc',
    sourceNamespace: 'behave-vsc',
    sourceKey: 'suppressedNotifications',
    destNamespace: 'gs-behave-bdd',
    destKey: 'suppressedNotifications',
    transform: suppressedNotificationsAppendWithDedup as MigrationEntry['transform'],
  },
];
```

Note: the array-append-with-dedup transform mirrors `featuresPathMergeWithDedup` but applies plain string equality (no path normalization). The `_-from-behavevsc` id matches Plan 01's documented convention.
  </action>
  <verify>
    <automated>npx eslint src --ext ts</automated>
    <automated>npm run compile</automated>
  </verify>
  <done>File compiles; lint clean; both transforms exported; entries array length 2.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Test suppressedNotifications transforms + entries</name>
  <files>test/unit/migrations/suppressedNotifications.test.ts</files>
  <behavior>
Same test layout pattern as Plan 03 Task 2. Three suites:
1. `Phase 20 — suppressMultiConfigToArray transform` — 4-5 tests covering the cases in Task 1's behavior bullet.
2. `Phase 20 — suppressedNotificationsAppendWithDedup transform` — undefined input, empty array, dedup, append, mixed types.
3. `Phase 20 — suppressedNotifications entries: TEST-04` — for each of the 2 entries, idempotency-skip + case-1 silent finish (4 tests).
  </behavior>
  <action>
Create `test/unit/migrations/suppressedNotifications.test.ts`. Same `makePerKeyScopedConfig` helper-copy pattern as Plan 02. Imports:
```typescript
import * as assert from 'assert';
import * as sinon from 'sinon';
import {
  suppressMultiConfigToArray,
  suppressedNotificationsAppendWithDedup,
  suppressedNotificationsEntries,
} from '../../../src/migrations/suppressedNotifications';
import { evaluateMigration, ALL_MIGRATION_SCOPES } from '../../../src/migrations';
```
Tests as enumerated above.
  </action>
  <verify>
    <automated>npx eslint src --ext ts</automated>
    <automated>npm run compile-tests &amp;&amp; node ./out/test/test/unit/run.js</automated>
  </verify>
  <done>~13 tests pass; full suite green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Implement mergeRecord + 2 envPresets entries in src/migrations/envPresets.ts</name>
  <files>src/migrations/envPresets.ts</files>
  <behavior>
- `mergeRecord({a:1}, undefined, (l,c)=>l)` -> `{a:1}` (degenerates to identity per D-A2.2 / Pitfall 4).
- `mergeRecord(undefined, {a:1}, ...)` -> `{a:1}`.
- `mergeRecord({a:1, b:2}, {b:99, c:3}, (l,c)=>l)` -> `{b:2, c:3, a:1}` (legacy wins on collision; key order: canonical first, then legacy-only).
- envVarPresets transform with `(legacy={p:{X:1}}, canonical=undefined)` returns `{ kind: 'write', value: {p:{X:1}} }` — NOT skipDest (Pitfall 4 explicit).
- envVarPresets transform with `(legacy={p:{X:1}}, canonical={p:{X:99,Y:2}})` returns `{ kind: 'write', value: {p:{X:1, Y:2}} }` (legacy X wins over canonical X; canonical Y kept).
- envVarOverrides transform shape: single-level mergeRecord (no inner record).
  </behavior>
  <action>
Create `src/migrations/envPresets.ts`:

```typescript
import type { MigrationEntry } from './types';
import type { TransformResult } from '../notifications';

/**
 * Phase 20 D-A2.1 / D-A3.1: generic two-record merge utility.
 * - Caller supplies the inner-merge function.
 * - Case 2 (canonical undefined): degenerates to identity over `legacy`.
 *   Pitfall 4: this is correct — the transform must still return
 *   `{ kind: 'write', ... }` so the primitive copies legacy into canonical.
 * - Case 3 (both present): Phase 21 wires action callbacks to merge
 *   direction. Phase 20 only ships the case-2 path.
 */
export function mergeRecord<T>(
  legacy: Record<string, T> | undefined,
  canonical: Record<string, T> | undefined,
  mergeValue: (legacyVal: T, canonicalVal: T) => T,
): Record<string, T> {
  const out: Record<string, T> = { ...(canonical ?? {}) };
  for (const [k, lv] of Object.entries(legacy ?? {})) {
    out[k] = (k in out) ? mergeValue(lv, out[k]) : lv;
  }
  return out;
}

/**
 * envVarPresets — preset-level mergeRecord, var-level mergeRecord with
 * legacy-wins-on-collision (the case-2 / overwrite-* direction). Phase 21
 * will swap the inner mergeValue to honor case-3 user choices.
 */
export const envVarPresetsTransform = (
  legacy: Record<string, Record<string, string>> | undefined,
  canonical: Record<string, Record<string, string>> | undefined,
): TransformResult<Record<string, Record<string, string>>> => {
  if (legacy === undefined || legacy === null || typeof legacy !== 'object') {
    return { kind: 'skipDest', removeSource: true };
  }
  const merged = mergeRecord(legacy, canonical, (lp, cp) =>
    mergeRecord(lp, cp, (lv) => lv), // legacy wins on var collision
  );
  return { kind: 'write', value: merged };
};

/**
 * envVarOverrides — single-level mergeRecord (var name -> string), legacy wins.
 */
export const envVarOverridesTransform = (
  legacy: Record<string, string> | undefined,
  canonical: Record<string, string> | undefined,
): TransformResult<Record<string, string>> => {
  if (legacy === undefined || legacy === null || typeof legacy !== 'object') {
    return { kind: 'skipDest', removeSource: true };
  }
  return { kind: 'write', value: mergeRecord(legacy, canonical, (lv) => lv) };
};

export const envPresetEntries: readonly MigrationEntry[] = [
  {
    id: 'envVarPresets-from-behavevsc',
    sourceNamespace: 'behave-vsc',
    sourceKey: 'envVarPresets',
    destNamespace: 'gs-behave-bdd',
    destKey: 'envVarPresets',
    transform: envVarPresetsTransform as MigrationEntry['transform'],
  },
  {
    id: 'envVarOverrides-from-behavevsc',
    sourceNamespace: 'behave-vsc',
    sourceKey: 'envVarOverrides',
    destNamespace: 'gs-behave-bdd',
    destKey: 'envVarOverrides',
    transform: envVarOverridesTransform as MigrationEntry['transform'],
  },
];
```
  </action>
  <verify>
    <automated>npx eslint src --ext ts</automated>
    <automated>npm run compile</automated>
  </verify>
  <done>File compiles; lint clean; mergeRecord + 2 transforms + 2 entries exported.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Test mergeRecord + envPresets entries (Pitfall 4 explicit)</name>
  <files>test/unit/migrations/envPresets.test.ts</files>
  <behavior>
- mergeRecord 6 unit cases as above.
- envVarPresetsTransform with `(legacy={a:{X:1}}, canonical=undefined)` returns `{kind:'write', value:{a:{X:1}}}` — Pitfall 4 dedicated assertion.
- envVarPresetsTransform deep-merge collision case as in Behavior list.
- envVarOverridesTransform single-level test.
- Per-entry TEST-04 a + b for both entries (4 tests).
  </behavior>
  <action>
Create `test/unit/migrations/envPresets.test.ts` mirroring Plan 03's pattern. Pure-function tests need no vscode stubs. Per-entry idempotency/silent-finish tests use the `makePerKeyScopedConfig` helper copied inline.
  </action>
  <verify>
    <automated>npx eslint src --ext ts</automated>
    <automated>npm run compile-tests &amp;&amp; node ./out/test/test/unit/run.js</automated>
  </verify>
  <done>~14 tests pass; full suite green.</done>
</task>

<task type="auto">
  <name>Task 5: Refactor migrateLegacySuppressMultiConfig wrapper + wire registry to 17</name>
  <files>src/notifications.ts, src/migrations/registry.ts</files>
  <action>
**Edit A — `src/notifications.ts`:** add the import and replace the wrapper body:

1. Near top of file (after the featuresPathMergeWithDedup import added by Plan 03):
   ```typescript
   import { suppressMultiConfigToArray } from './migrations/suppressedNotifications';
   ```

2. Replace the body of `migrateLegacySuppressMultiConfig` (L261-L282) — keep public `Promise<void>` signature:
   ```typescript
   export async function migrateLegacySuppressMultiConfig(wkspUri: vscode.Uri): Promise<void> {
     await migrateScopedSetting<boolean, string[]>({
       namespace: 'gs-behave-bdd',
       sourceKey: 'suppressMultiConfigNotification',
       destKey: 'suppressedNotifications',
       wkspUri,
       transform: suppressMultiConfigToArray,
     });
   }
   ```
   Preserves all 8 sub-cases in `test/unit/notifications.test.ts:287+`.

3. Trim the docblock above the wrapper to a one-line note pointing at the registry entry id (`suppressMultiConfig-self`) and noting that Phase 22 deletes the wrapper.

**Edit B — `src/migrations/registry.ts`:** add both new groups. Final state:

```typescript
import type { MigrationEntry } from './types';
import { plainEntries } from './plain';
import { featuresPathEntries } from './featuresPath';
import { suppressedNotificationsEntries } from './suppressedNotifications';
import { envPresetEntries } from './envPresets';

/**
 * Phase 20 D-A4.4: aggregated registry. 17 total entries (see 020-04 plan reconciliation).
 *   - 11 plain-copy entries from `./plain`
 *   - 2 featuresPath entries from `./featuresPath`
 *   - 2 suppressedNotifications entries from `./suppressedNotifications`
 *   - 2 envPresets entries from `./envPresets`
 */
export const MIGRATION_REGISTRY: readonly MigrationEntry[] = [
  ...plainEntries,
  ...featuresPathEntries,
  ...suppressedNotificationsEntries,
  ...envPresetEntries,
];
```

After this commit `MIGRATION_REGISTRY.length === 17`. Plan 01's `index.test.ts` Test 3 (the skipped count assertion) is still skipped — Plan 05 flips it to a hard assertion as part of its acceptance criteria.

The Plan 01 invariants (no id collisions, all ids match the convention) MUST stay green: 17 unique ids, all ending in `-from-behavevsc` or `-self`.
  </action>
  <verify>
    <automated>npx eslint src --ext ts</automated>
    <automated>npm run compile-tests &amp;&amp; node ./out/test/test/unit/run.js</automated>
  </verify>
  <done>Registry size 17; existing 8 sub-cases for migrateLegacySuppressMultiConfig still pass; full suite green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| (none new) | The two transforms are pure functions. envPresets reads object-shaped values (Record<string, *>) — `mergeRecord` defensively spreads with `?? {}` so prototype-pollution-shaped legacy values cannot reach the dest unless they were already in `canonical`. The `Object.entries` iteration only walks own enumerable properties (per spec) so a malicious `__proto__` value in legacy would land as a literal key, not as a prototype mutation. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-04-01 | Tampering | mergeRecord | accept | Worst case: a malicious `behave-vsc.envVarPresets` value with hostile keys lands in `gs-behave-bdd.envVarPresets`. Same threat surface as v1.4.0 `getWithLegacyFallback` already exposed (it returns the legacy value unmodified). The downstream `WorkspaceSettings` constructor's runtime validation surfaces malformed env-var values. No new attack surface. |
</threat_model>

<verification>
- `npx eslint src --ext ts` exits 0 after every task.
- Full unit suite green after every commit.
- After Task 5: `MIGRATION_REGISTRY.length === 17`; Plan 01 invariants pass.
- 8 sub-cases in `test/unit/notifications.test.ts:287+` for `migrateLegacySuppressMultiConfig` still pass.
- Activation-ordering structural test at `test/unit/notifications.test.ts:570` (greps `extension.ts` for `migrateLegacySuppressMultiConfig(wkspUri)`) still passes — this plan does NOT touch extension.ts.
</verification>

<success_criteria>
- 5 new entries shipped (1 self + 1 cross-ns suppressedNotifications + 1 self + 2 cross-ns envPresets) — total registry 17.
- Both v1.4.0 wrappers continue to pass their existing test bars.
- Pitfall 4 covered with an explicit assertion in envPresets.test.ts.
- No new threats; all transforms are pure functions.
</success_criteria>

<output>
After completion, create `.planning/phases/020-migration-registry/020-04-suppress-and-env-SUMMARY.md`.
</output>
