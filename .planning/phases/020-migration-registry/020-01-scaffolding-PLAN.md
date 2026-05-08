---
phase: 020-migration-registry
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/migrations/types.ts
  - test/unit/migrations/index.test.ts
autonomous: true
requirements: [MIGRATE-01, MIGRATE-02, MIGRATE-03]
must_haves:
  truths:
    - "Entry id naming convention `<key>-from-behavevsc` / `<key>-self` is documented in source."
    - "A test asserts the registry has no id collisions and (eventually) contains exactly 17 entries."
  artifacts:
    - path: "src/migrations/types.ts"
      provides: "Updated docblock with id naming convention near MigrationEntry"
    - path: "test/unit/migrations/index.test.ts"
      provides: "Registry-level invariants — id uniqueness + count gate (Pitfall 3)"
  key_links:
    - from: "test/unit/migrations/index.test.ts"
      to: "src/migrations/registry.ts"
      via: "MIGRATION_REGISTRY import"
      pattern: "from.*src/migrations"
---

<objective>
Wave 0 / scaffolding plan. Resolve the three open questions left by RESEARCH.md, document the entry-id naming convention near `MigrationEntry`, and land the registry-level invariant test that guards against id collisions (Pitfall 3) and locks the final count at 17 once Wave 2 finishes.

Purpose: every later plan in Phase 20 depends on a stable id convention and a single failing test that lights up the moment any plan forgets an entry or duplicates an id.

Output: small docblock edit + one new test file. No transforms, no entries — those are Wave 2.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/020-migration-registry/020-CONTEXT.md
@.planning/phases/020-migration-registry/020-RESEARCH.md
@.planning/phases/020-migration-registry/020-VALIDATION.md
@.planning/phases/019-migration-foundation/019-CONTEXT.md

@src/migrations/types.ts
@src/migrations/registry.ts
@src/migrations/index.ts
@test/unit/migrations.test.ts

<resolved_open_questions>

**Q1 (test path) — RESOLVED: `test/unit/migrations/<area>.test.ts` (subdirectory under `test/unit/`).**

Reason: the Mocha runner at `test/unit/run.ts:22` globs `**/unit/**/*.test.js` against `out/test/`. Co-locating tests in `src/migrations/*.test.ts` (CONTEXT.md D-A3.2 literal text) compiles to `out/src/migrations/*.test.js` and is **not** picked up by the runner. VALIDATION.md's claim that "Mocha glob already includes `src/**/*.test.ts`" is incorrect — verified by Read. RESEARCH.md Pitfall 5 covers this exact failure mode and recommends the subdirectory layout. We therefore put new tests under `test/unit/migrations/` to match the existing Phase 19 file `test/unit/migrations.test.ts` (sibling, not child) and avoid a runner change.

**Q2 (wrapper exports) — RESOLVED: keep `migrateLegacySuppressMultiConfig` / `migrateLegacyFeaturesPath` as thin compatibility shims for v1.5.0; full deletion is Phase 22.**

Reason: `test/unit/notifications.test.ts` imports both at L10/L12 and exercises 8 + 12 sub-cases against them (L287-L600+). Those tests are the regression bar that pinned v1.4.0 behavior; deleting the exports breaks ~30 tests for no benefit during a refactor that's supposed to preserve behavior bit-for-bit. Plan 03 (featuresPath) and Plan 04 (suppressedNotifications) will refactor each wrapper's body to delegate to the lifted transform via `evaluateMigration` against a temporary one-entry registry slice. Public `Promise<void>` / `Promise<boolean>` signatures stay untouched.

**Q3 (activation wiring) — RESOLVED: Phase 20 must add the activation-time `evaluateAllMigrations` call.**

Reason: grep of `src/extension.ts` for `evaluateAllMigrations` returns 0 hits (verified). Phase 19 D-05 left the registry empty so wiring was deferred. Plan 05 wires `evaluateAllMigrations(wkspUri)` into the same per-workspace loop that currently runs the silent v1.4.0 migrations, then deletes `src/extension.ts:348-350`.
</resolved_open_questions>

<test_runner_caveat>
`npm run test:unit` invokes `node ./out/test/test/unit/run.js` directly — the run.js script does NOT parse argv, so `--grep` does not propagate (Phase 15 Plan 06 finding documented in STATE.md L137-L138). To filter by suite during plan-scoped sampling, fall back to running mocha directly:
```
npx mocha --require ./out/test/test/unit/setup.js --ui tdd "out/test/test/unit/migrations/**/*.test.js" --grep "<pattern>"
```
The compiled JS lives at `out/test/test/unit/migrations/<file>.test.js`. Make sure `npm run compile-tests` runs first.
</test_runner_caveat>

<interfaces>
From `src/migrations/types.ts` (existing — Phase 19):
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

From `src/migrations/registry.ts` (existing — Phase 19, populated by Plans 02-04):
```typescript
export const MIGRATION_REGISTRY: readonly MigrationEntry[] = [];
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Document entry-id naming convention in src/migrations/types.ts</name>
  <files>src/migrations/types.ts</files>
  <action>
Add a docblock near the `MigrationEntry` interface declaring the id naming convention used by Phase 20 and beyond (per CONTEXT.md `<specifics>` and Pitfall 3):

- `<key>-from-behavevsc` for cross-namespace entries that migrate `behave-vsc.<key>` -> `gs-behave-bdd.<key>` (the 15 plain + 1 featuresPath + 0 suppress + 2 env entries — 16 total of this shape).
- `<key>-self` for intra-namespace entries that migrate `gs-behave-bdd.<oldKey>` -> `gs-behave-bdd.<newKey>` (the 1 `featuresPath-self` + 1 `suppressMultiConfig-self` entries).

Keep the docblock terse — 6-10 lines. Place it directly above the `id` field of the `MigrationEntry` interface so readers landing on the field see the convention.

Do NOT change the interface shape. Per CONTEXT D-A4.5 we explicitly do not extend it; the docblock is documentation only.
  </action>
  <verify>
    <automated>npx eslint src/migrations/types.ts --ext ts</automated>
    <automated>npm run compile</automated>
  </verify>
  <done>types.ts contains an `<key>-from-behavevsc` / `<key>-self` docblock near MigrationEntry; lint clean; compiles.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add registry-level invariants test (id uniqueness + final count)</name>
  <files>test/unit/migrations/index.test.ts</files>
  <behavior>
- Test 1: every entry id in `MIGRATION_REGISTRY` is unique — `new Set(MIGRATION_REGISTRY.map(e => e.id)).size === MIGRATION_REGISTRY.length` (Pitfall 3 gate; lights up immediately if any later plan ships a duplicate).
- Test 2: every entry id matches one of the two documented shapes — regex `/-from-behavevsc$/` OR `/-self$/`. Asserting the convention prevents drift.
- Test 3 (gated by Plan 05): once the registry is fully populated, `MIGRATION_REGISTRY.length === 17` (D-A4.4). For Plan 01 land this as a `test.skip(...)` (or commented-out assertion with a TODO referencing Plan 05) so the test file ships green now and Plan 05 flips the skip to a hard assertion as part of its acceptance criteria.

This is a TDD task: write all three tests first; tests 1+2 must pass against the empty registry (vacuously true / vacuously empty), test 3 stays skipped until Plan 05.
  </behavior>
  <action>
Create `test/unit/migrations/index.test.ts`. Imports:

```typescript
import * as assert from 'assert';
import { MIGRATION_REGISTRY } from '../../../src/migrations';
```

Suite name: `Phase 20 — migrations registry invariants`. Three tests:

1. `'no duplicate entry ids (Pitfall 3)'` — assert `Set` size equals array length with a message that includes the offending duplicate ids on failure (helpful for Plan 02-04 debugging). Compute duplicates as `MIGRATION_REGISTRY.map(e => e.id).filter((id, i, a) => a.indexOf(id) !== i)`.

2. `'every id matches the documented naming convention'` — for each entry, assert `/-from-behavevsc$/.test(e.id) || /-self$/.test(e.id)`, with the failure message naming the offender.

3. `test.skip('registry contains exactly 17 entries (D-A4.4) — enabled by Plan 05')`, body asserts `assert.strictEqual(MIGRATION_REGISTRY.length, 17)`. Plan 05 is responsible for converting `test.skip(...)` to `test(...)`.

Ensure the parent directory exists (it doesn't yet). The file path translates to `out/test/test/unit/migrations/index.test.js` after compile, which the runner glob picks up.

NO production code changes in this task.
  </action>
  <verify>
    <automated>npx eslint src --ext ts</automated>
    <automated>npm run compile-tests &amp;&amp; node ./out/test/test/unit/run.js</automated>
  </verify>
  <done>New test file exists; full suite green; tests 1+2 pass against the (still empty) registry; test 3 is skipped with a clear TODO pointing at Plan 05.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| (none new) | Phase 20 is a refactor/new-module phase. The migration registry and tests do not introduce a new trust boundary; all existing boundaries (settings.json read, VS Code config write) are inherited from Phase 19's already-secured evaluator and the v1.4.0 `migrateScopedSetting` primitive. |

## STRIDE Threat Register

No new threats — this plan only adds documentation and a test file. The existing Phase 19 evaluator and primitive already mitigate STRIDE risks (input validation via `cfg.inspect()` shape, no privilege escalation, write-side errors absorbed via never-throw contract). Per CONTEXT.md threat-model note: "No new threats — refactor of existing v1.4.0 migration code into registry entries; reuses Phase 19's hardened evaluator and primitive."
</threat_model>

<verification>
- `npx eslint src --ext ts` exits 0.
- `npm run compile` succeeds.
- `npm run test:unit` (full suite via `node ./out/test/test/unit/run.js`) green.
- New test file `test/unit/migrations/index.test.ts` is picked up by the runner glob (suite line "Phase 20 — migrations registry invariants" appears in mocha output).
- `src/migrations/types.ts` contains a docblock referencing both `-from-behavevsc` and `-self` id shapes.
</verification>

<success_criteria>
- Both Q1 and Q3 resolutions are recorded in this plan's `<resolved_open_questions>` block above (Q2 is recorded by Plan 03/04 acceptance — the wrappers physically remain after this plan).
- Registry invariants test exists and passes.
- types.ts docblock exists and matches the convention names exactly (`-from-behavevsc`, `-self`).
- No regressions: existing 739 tests (per STATE.md L28) continue to pass.
</success_criteria>

<output>
After completion, create `.planning/phases/020-migration-registry/020-01-scaffolding-SUMMARY.md`.
</output>
