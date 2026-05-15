---
phase: 020-migration-registry
plan: 05
type: execute
wave: 5
depends_on: [020-01-scaffolding-PLAN.md, 020-02-plain-entries-PLAN.md, 020-03-features-path-PLAN.md, 020-04-suppress-and-env-PLAN.md]
files_modified:
  - src/extension.ts
  - test/unit/migrations/index.test.ts
  - test/unit/notifications.test.ts
autonomous: true
requirements: [MIGRATE-01, MIGRATE-02, MIGRATE-03, TEST-04]
must_haves:
  truths:
    - "`src/extension.ts:348-350` no longer calls `migrateLegacyFeaturesPath` or `migrateLegacySuppressMultiConfig` directly during activation."
    - "`evaluateAllMigrations(wkspUri)` is invoked once per workspace folder during activation — replacing the silent v1.4.0 calls."
    - "Plan 01's index.test.ts Test 3 (`MIGRATION_REGISTRY.length === 17`) is no longer skipped — it asserts hard."
    - "The two structural ordering tests in test/unit/notifications.test.ts that grep extension.ts for the deleted call sites are removed (or updated to assert absence) so the suite stays green after deletion."
    - "Phase 21's prompt UX still has its hook contract — `evaluateAllMigrations(wkspUri, hooks)` is called with a placeholder hooks object that Phase 21 will populate."
  artifacts:
    - path: "src/extension.ts"
      provides: "Activation calls evaluateAllMigrations per workspace; v1.4.0 silent migration calls deleted; pendingFeaturesPathNotifs derivation removed (D-A6.1)."
    - path: "test/unit/migrations/index.test.ts"
      provides: "Test 3 (registry length === 17) flipped from .skip to hard assertion."
    - path: "test/unit/notifications.test.ts"
      provides: "Activation-ordering grep tests at L570 + L876 deleted or rewritten as 'extension.ts must NOT contain these call expressions' assertions."
  key_links:
    - from: "src/extension.ts"
      to: "src/migrations/index.ts"
      via: "import { evaluateAllMigrations }"
      pattern: "evaluateAllMigrations"
---

<objective>
Final wiring plan. Replace the activation-time silent calls to `migrateLegacyFeaturesPath` and `migrateLegacySuppressMultiConfig` (per D-A6.1) with a single `evaluateAllMigrations(wkspUri)` call, flip Plan 01's skipped registry-count assertion to a hard pin, and update the v1.4.0 structural ordering tests in `test/unit/notifications.test.ts` so the suite stays green after the deletion.

Purpose: close the loop. Once this plan lands, the extension reads the entire registry through the Phase 19 evaluator at activation. No new entries, no new transforms — strictly wiring + cleanup.

Output: edited `src/extension.ts`, edited test files. After this plan Phase 20 is functionally complete.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/020-migration-registry/020-CONTEXT.md
@.planning/phases/020-migration-registry/020-RESEARCH.md
@.planning/phases/020-migration-registry/020-01-scaffolding-PLAN.md
@.planning/phases/020-migration-registry/020-04-suppress-and-env-PLAN.md

@src/extension.ts
@src/migrations/evaluator.ts
@src/migrations/index.ts
@test/unit/migrations/index.test.ts
@test/unit/notifications.test.ts

<wiring_design>

The current activation block (`src/extension.ts:330-381`) does roughly:
```typescript
// L345-359
const migrationResults = await Promise.all(
  getUrisOfWkspFoldersWithFeatures().map(async (wkspUri) => {
    let migrated = false;
    try {
      migrated = await migrateLegacyFeaturesPath(wkspUri);     // <-- DELETE
      await migrateLegacySuppressMultiConfig(wkspUri);          // <-- DELETE
      config.reloadSettings(wkspUri);                           // <-- KEEP (needed after evaluator runs)
    } catch (e) {
      config.logger.logInfo(`Phase 15/16 migration error: ${e}`, wkspUri);
    }
    return { wkspUri, migrated };
  }),
);
const pendingFeaturesPathNotifs: vscode.Uri[] = migrationResults
  .filter(r => r.migrated)
  .map(r => r.wkspUri);

// L367-381
for (const wkspUri of pendingFeaturesPathNotifs) {
  showSuppressibleNotification(...featuresPathMigration...);   // <-- DELETE
}
```

Phase 20 D-A6.1 reduces this to:

```typescript
await Promise.all(
  getUrisOfWkspFoldersWithFeatures().map(async (wkspUri) => {
    try {
      // Phase 20 D-A6.1: evaluator drives every registered migration.
      // Phase 21 will inject a hooks object that wires case 2 / case 3
      // notifications; Phase 20 ships an empty hooks object so the
      // evaluator runs case-1 silent finishes and emits the
      // pending-user-choice classification for case 2 / case 3 entries
      // (which Phase 21's hook will then act on).
      await evaluateAllMigrations(wkspUri);
      config.reloadSettings(wkspUri);
    } catch (e) {
      // Defense-in-depth: evaluator never throws (Phase 19 D-03), but
      // reloadSettings is not contracted to never throw.
      config.logger.logInfo(`Phase 20 migration evaluator error: ${e}`, wkspUri);
    }
  }),
);
```

Notes:
- `Promise.all` is preserved — per-workspace parallelism (B-03 from Phase 16) is still desired.
- `migrationResults` and `pendingFeaturesPathNotifs` are deleted because the post-loop `showSuppressibleNotification("featuresPathMigration", ...)` block (L364-L381) is gone — the migration notification was a v1.4.0 silent-migration affordance that becomes Phase 21's case-2 prompt territory.
- The `featuresPathMigration` suppression key is NOT removed from `gs-behave-bdd.suppressedNotifications` (it's user-set) — but the notification it suppressed no longer fires from this code path. If any user has it suppressed, that's harmless — the entry simply lingers in their settings.json as a no-op suppressor.
- Unused imports (`migrateLegacySuppressMultiConfig`, `migrateLegacyFeaturesPath`, `showSuppressibleNotification` if no other call sites remain) are pruned — but the functions in `src/notifications.ts` stay exported for the test bar (Q2 keep-shim).

</wiring_design>

<test_surgery>

Three test sites in `test/unit/notifications.test.ts` reference the deleted call patterns:

1. **L570:** `test('activate.*migration order: migrateLegacySuppressMultiConfig precedes updateDiscoveryUX', ...)` — tests that the call expression appears before `updateDiscoveryUX(getUrisOfWkspFoldersWithFeatures()`. After deletion the call expression is gone. **Action: replace with an inverted test** — assert that the literal string `migrateLegacySuppressMultiConfig(wkspUri)` does NOT appear in `extension.ts`. The new test is a regression bar for D-A6.1.

2. **L876:** `test('(D-18) activate(): migrateLegacyFeaturesPath precedes migrateLegacySuppressMultiConfig', ...)` — same shape, different pair. **Action: same — replace with an absence assertion** for both `migrateLegacyFeaturesPath(wkspUri)` and `migrateLegacySuppressMultiConfig(wkspUri)` in `extension.ts`.

3. **L880-L881** (within the L876 test): assertion messages reference `extension.ts`. Update.

Add ONE new structural test asserting the new wiring is present:

```typescript
test('Phase 20 D-A6.1: extension.ts calls evaluateAllMigrations during activation', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'src', 'extension.ts'), 'utf8');
  assert.ok(
    src.includes('evaluateAllMigrations'),
    'extension.ts must call evaluateAllMigrations during activation (D-A6.1)',
  );
  assert.ok(
    !src.includes('migrateLegacyFeaturesPath(wkspUri)'),
    'D-A6.1: migrateLegacyFeaturesPath direct call site must be deleted',
  );
  assert.ok(
    !src.includes('migrateLegacySuppressMultiConfig(wkspUri)'),
    'D-A6.1: migrateLegacySuppressMultiConfig direct call site must be deleted',
  );
});
```

Place it in the same suite block where the deleted tests lived; or in `test/unit/migrations/index.test.ts` (preferred — it's the natural home for registry/wiring invariants).

</test_surgery>

<interfaces>
From `src/migrations/index.ts`:
```typescript
export { evaluateAllMigrations, type EvaluatorHooks } from './evaluator';
```

From `src/migrations/evaluator.ts:149`:
```typescript
export async function evaluateAllMigrations(
  wkspUri: vscode.Uri,
  hooks?: EvaluatorHooks,
  registry?: readonly MigrationEntry[],
): Promise<EvaluationResult[]>;
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Wire evaluateAllMigrations into extension.ts activation; delete v1.4.0 silent calls</name>
  <files>src/extension.ts</files>
  <action>
Open `src/extension.ts`. Two edits:

**A) Update imports (around L42):**
```typescript
import { showSuppressibleNotification } from './notifications';
```
Drop `migrateLegacySuppressMultiConfig` and `migrateLegacyFeaturesPath` from the import list. Verify (via grep within the file) that `showSuppressibleNotification` is still used elsewhere — if no other usage remains after this plan, drop it too. (Likely still used elsewhere; verify before deleting.)

Add at appropriate import group:
```typescript
import { evaluateAllMigrations } from './migrations';
```

**B) Replace the activation block at L345-L381** with the simplified version from the `<wiring_design>` block. Specifically:

Delete:
- The `migrationResults` Promise.all that calls `migrateLegacyFeaturesPath` and `migrateLegacySuppressMultiConfig` (L345-L359).
- The `pendingFeaturesPathNotifs` derivation (L360-L362).
- The `for (const wkspUri of pendingFeaturesPathNotifs)` block that fires `showSuppressibleNotification("featuresPathMigration", ...)` (L364-L381).

Replace with the simplified Promise.all from `<wiring_design>` that calls `evaluateAllMigrations(wkspUri)` per workspace.

Keep the surrounding comments at L330-L344 trimmed to a one-line note: `// Phase 20 D-A6.1: evaluator drives every registered migration. Phase 21 will inject hooks for case 2 / case 3 prompts.`

Preserve `config.reloadSettings(wkspUri)` inside the per-workspace block — necessary so any value the evaluator wrote (e.g. plain entries copying `behave-vsc.runParallel` -> `gs-behave-bdd.runParallel`) is reflected in the cached `WorkspaceSettings` before `updateDiscoveryUX` runs (Pitfall 4 carryforward from v1.4.0).
  </action>
  <verify>
    <automated>npx eslint src --ext ts</automated>
    <automated>npm run compile</automated>
    <automated>powershell -NoProfile -Command "$src = Get-Content -Raw 'src/extension.ts'; if ($src -match 'migrateLegacyFeaturesPath\(wkspUri\)') { exit 1 }; if ($src -match 'migrateLegacySuppressMultiConfig\(wkspUri\)') { exit 1 }; if (-not ($src -match 'evaluateAllMigrations')) { exit 1 }; exit 0"</automated>
  </verify>
  <done>extension.ts no longer contains the deleted call sites; contains `evaluateAllMigrations`; lint and compile clean.</done>
</task>

<task type="auto">
  <name>Task 2: Update structural tests in test/unit/notifications.test.ts</name>
  <files>test/unit/notifications.test.ts</files>
  <action>
Open `test/unit/notifications.test.ts`. Two edits:

**A) Delete or rewrite the L570 test** (`'activate.*migration order: migrateLegacySuppressMultiConfig precedes updateDiscoveryUX'`). After D-A6.1 the precedence relationship is no longer asserted at this layer — the evaluator owns ordering. Recommendation: **delete** the test (it's testing a guarantee the new wiring no longer makes). The replacement absence assertion goes into `test/unit/migrations/index.test.ts` per Task 3.

**B) Delete or rewrite the L876 test** (`'(D-18) activate(): migrateLegacyFeaturesPath precedes migrateLegacySuppressMultiConfig'`). Same reasoning: D-18 ordering is no longer relevant after D-A6.1 deletes both calls. **Delete the test.**

Do NOT delete:
- The 12 sub-case tests for `migrateLegacyFeaturesPath` (L601+) — they pin the wrapper-via-lifted-transform behavior (Q2 shim). These are still imported and called directly.
- The 8 sub-case tests for `migrateLegacySuppressMultiConfig` (L287+) — same.
- The L11/L12 imports of the wrappers themselves — Plan 03 / Plan 04 kept the exports intentionally.
  </action>
  <verify>
    <automated>npx eslint src --ext ts</automated>
    <automated>npm run compile-tests &amp;&amp; node ./out/test/test/unit/run.js</automated>
  </verify>
  <done>Two structural tests deleted; ~30 wrapper-behavior tests still pass; full suite green.</done>
</task>

<task type="auto">
  <name>Task 3: Flip Plan 01's skipped count assertion to hard + add wiring-presence test</name>
  <files>test/unit/migrations/index.test.ts</files>
  <action>
Open `test/unit/migrations/index.test.ts` (created by Plan 01). Two edits:

**A) Convert the `test.skip` for the count to a hard `test`:**
```typescript
test('registry contains exactly 17 entries (D-A4.4)', () => {
  assert.strictEqual(MIGRATION_REGISTRY.length, 17, 'D-A4.4 mandates 17 entries');
});
```

**B) Add a new test for D-A6.1 wiring presence + absence (replacing the deleted notifications.test.ts structural tests):**
```typescript
test('Phase 20 D-A6.1: extension.ts wires evaluateAllMigrations and deletes v1.4.0 silent calls', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'src', 'extension.ts'),
    'utf8',
  );
  assert.ok(src.includes('evaluateAllMigrations'),
    'extension.ts must call evaluateAllMigrations during activation');
  assert.ok(!src.includes('migrateLegacyFeaturesPath(wkspUri)'),
    'D-A6.1: migrateLegacyFeaturesPath direct call site must be deleted');
  assert.ok(!src.includes('migrateLegacySuppressMultiConfig(wkspUri)'),
    'D-A6.1: migrateLegacySuppressMultiConfig direct call site must be deleted');
});
```

Note: the `__dirname` at runtime is `out/test/test/unit/migrations` (compiled JS). Walking up 3 levels lands at `out/test/`; we then need to walk up one more to the project root and into `src/`. Adjust path-walks accordingly:
```typescript
path.join(__dirname, '..', '..', '..', '..', '..', 'src', 'extension.ts')
```

Verify by reading `test/unit/notifications.test.ts:572-573` for the existing pattern (it uses `'..', '..', '..', '..', 'src', 'extension.ts'` — copy that exact path expression).
  </action>
  <verify>
    <automated>npx eslint src --ext ts</automated>
    <automated>npm run compile-tests &amp;&amp; node ./out/test/test/unit/run.js</automated>
  </verify>
  <done>Hard count assertion passes; wiring presence/absence test passes; full suite green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| (none new) | The wiring change replaces two silent direct calls with one evaluator call. The evaluator's read/write surface is identical to the v1.4.0 wrappers' (both go through `migrateScopedSetting` per MIGRATE-07). No new trust boundary. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-05-01 | Denial of Service | Activation loop | accept | The evaluator visits 17 entries × 3 scopes = 51 `inspect()` calls per workspace, all in-memory cache hits per VS Code's WorkspaceConfiguration impl. Same order of magnitude as the v1.4.0 silent loop (which did 4 `inspect()` calls per workspace through the wrappers). Activation latency increase is negligible. The Phase 16 B-03 across-workspaces parallelism is preserved. |
</threat_model>

<verification>
- `npx eslint src --ext ts` exits 0.
- `npm run compile` succeeds.
- Full unit suite green.
- `MIGRATION_REGISTRY.length === 17` hard-asserted.
- `extension.ts` grep gates: contains `evaluateAllMigrations`, does NOT contain `migrateLegacyFeaturesPath(wkspUri)` or `migrateLegacySuppressMultiConfig(wkspUri)`.
- Wrapper functions still exported from `src/notifications.ts` (Q2 shim); their direct test bars (8 + 12 sub-cases) still pass.
- Manual smoke (recorded in 020-VALIDATION.md Manual-Only Verifications): open `example-projects/project A` in VS Code Insiders, confirm extension activates with no errors in Extension Host log.
</verification>

<success_criteria>
- All Phase 20 D-A* requirements are implemented:
  - D-A1.* — 11 plain entries + 4 transform-bearing cross-namespace entries (Plans 02-04).
  - D-A2.* — mergeRecord utility + envPresets transforms (Plan 04).
  - D-A3.* — file layout under `src/migrations/`; test layout under `test/unit/migrations/` (per Plan 01 Q1).
  - D-A4.* — 17 entries; intra-namespace + cross-namespace pairs.
  - D-A5.* — TEST-04 dimensions (a) and (b) covered per entry.
  - D-A6.* — silent activation calls deleted (this plan).
- All four mapped requirements (MIGRATE-01, MIGRATE-02, MIGRATE-03, TEST-04) are testable from the new files.
- `test/unit/migrations.test.ts` (Phase 19 evaluator suite) continues to pass.
- `test/unit/notifications.test.ts` wrapper tests continue to pass.
</success_criteria>

<output>
After completion, create `.planning/phases/020-migration-registry/020-05-activation-wiring-SUMMARY.md`.
</output>
