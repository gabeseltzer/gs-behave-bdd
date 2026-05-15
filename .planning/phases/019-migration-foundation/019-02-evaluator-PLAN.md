---
phase: 019-migration-foundation
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - src/migrations/types.ts
  - src/migrations/registry.ts
  - src/migrations/completedMigrations.ts
  - src/migrations/evaluator.ts
  - src/migrations/index.ts
  - test/unit/migrations.test.ts
autonomous: true
requirements: [MIGRATE-04, MIGRATE-07, MIGRATE-08, MIGRATE-09, TEST-03]
must_haves:
  truths:
    - "`evaluateMigration(entry, wkspUri, hooks)` returns one classification per scope (Global / Workspace / WorkspaceFolder) and dispatches to case 1 / 2 / 3 logic per D-01."
    - "Case 1 (neither legacy nor canonical set at this scope) is handled silently inside the evaluator: marks Finished at that scope, no prompts, no copy (D-03)."
    - "Case 2 / case 3 detection invokes the injected `onCaseHit(case, entry, scope)` hook so Phase 21 can wire prompt UX without modifying the evaluator (D-03)."
    - "Empty / whitespace legacy values (string source) are classified as case 1, matching v1.4.0 D-08 skip-with-removal semantics (MIGRATE-08)."
    - "When a copy is required, the evaluator delegates to the v1.4.0 `migrateScopedSetting` primitive — no parallel implementations (MIGRATE-07)."
    - "`markMigrationFinishedAtScope(id, scope, wkspUri)` writes the migration ID into `gs-behave-bdd.completedMigrations` at the chosen scope; `isMigrationFinishedAtScope(id, scope, wkspUri)` reads it back via `inspect()` (never `get()`)."
    - "Per-scope independence (MIGRATE-09): each scope's `completedMigrations` is read and written via inspect()/update() at that target — Global / Workspace / WorkspaceFolder values do not bleed into one another."
  artifacts:
    - path: "src/migrations/types.ts"
      provides: "MigrationEntry interface (D-04) + MigrationCase enum / type"
      exports: ["MigrationEntry", "MigrationCase", "MigrationScope"]
    - path: "src/migrations/registry.ts"
      provides: "Empty registry array (D-05) — Phase 20 populates it"
      exports: ["MIGRATION_REGISTRY"]
    - path: "src/migrations/completedMigrations.ts"
      provides: "isMigrationFinishedAtScope, markMigrationFinishedAtScope helpers"
      exports: ["isMigrationFinishedAtScope", "markMigrationFinishedAtScope"]
    - path: "src/migrations/evaluator.ts"
      provides: "evaluateMigration(entry, wkspUri, hooks) — per-scope case 1/2/3 classifier + dispatcher"
      exports: ["evaluateMigration", "evaluateAllMigrations"]
    - path: "src/migrations/index.ts"
      provides: "Public barrel for the migrations module"
    - path: "test/unit/migrations.test.ts"
      provides: "Unit tests covering all 3 cases × all 3 scopes (TEST-03), plus mark/isFinished helpers, plus empty/whitespace classification (MIGRATE-08)"
  key_links:
    - from: "src/migrations/evaluator.ts"
      to: "src/notifications.ts migrateScopedSetting"
      via: "import + invoke when a copy is required"
      pattern: "migrateScopedSetting"
    - from: "src/migrations/completedMigrations.ts"
      to: "vscode.workspace.getConfiguration().inspect/update"
      via: "per-scope read via inspect(), per-scope write via update(target)"
      pattern: "completedMigrations"
---

<objective>
Build the Phase 19 migration plumbing module: the `MigrationEntry` interface (D-04), the empty registry (D-05), per-scope `evaluateMigration` (D-01, D-03) that classifies each VS Code scope as case 1/2/3 and routes copy work through the v1.4.0 `migrateScopedSetting` primitive, and the `markMigrationFinishedAtScope` / `isMigrationFinishedAtScope` helpers that read and write `gs-behave-bdd.completedMigrations` per-scope.

Phase 19 ships this as **infrastructure only** — the registry is empty, no activation-time call site is added, and no prompt UX is implemented. Phase 20 populates the registry; Phase 21 wires the `onCaseHit` hook to notifications; Phase 22 removes the silent v1.4.0 migration calls at `src/extension.ts:348-349`.

Purpose: Closes MIGRATE-04, MIGRATE-07, MIGRATE-08, MIGRATE-09, TEST-03. Unblocks Phases 20 and 21.
Output: Five files under `src/migrations/` plus `test/unit/migrations.test.ts`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/019-migration-foundation/019-CONTEXT.md
@CLAUDE.md
@AI_INSTRUCTIONS.md

<interfaces>
<!-- The evaluator wraps the existing v1.4.0 migration primitive. -->
<!-- migrateScopedSetting is the canonical copy/clear engine; do not reinvent. -->

From src/notifications.ts (already exported at lines 350-351):
```typescript
export type TransformResult<T> =
  | { kind: 'write'; value: T }
  | { kind: 'skipDest'; removeSource: boolean };

export async function migrateScopedSetting<TSrc, TDest>(opts: {
  namespace: string;
  sourceKey: string;
  destNamespace?: string;
  destKey: string;
  wkspUri: vscode.Uri;
  transform: (sourceVal: TSrc, destValAtSameScope: TDest | undefined) => TransformResult<TDest>;
}): Promise<boolean>;
```

W-02 LIMITATION (notifications.ts L130-L138): `migrateScopedSetting` migrates only the most-specific scope per invocation. Per D-02, the W-02 warning becomes obsolete for evaluator callers (the evaluator visits every scope in its own loop) — leave the warning in the primitive as defensive logging for any direct caller that bypasses the evaluator.

From vscode API:
```typescript
interface WorkspaceConfiguration {
  inspect<T>(key: string): { globalValue?: T; workspaceValue?: T; workspaceFolderValue?: T; defaultValue?: T } | undefined;
  update(key: string, value: any, target: ConfigurationTarget): Thenable<void>;
}
enum ConfigurationTarget { Global = 1, Workspace = 2, WorkspaceFolder = 3 }
```

From src/notifications.ts L155-L168 (canonical scope-detection ladder — mirror this pattern):
```typescript
if (insp.workspaceFolderValue !== undefined) {
  target = vscode.ConfigurationTarget.WorkspaceFolder;
  sourceVal = insp.workspaceFolderValue;
} else if (insp.workspaceValue !== undefined) {
  target = vscode.ConfigurationTarget.Workspace;
  sourceVal = insp.workspaceValue;
} else if (insp.globalValue !== undefined) {
  target = vscode.ConfigurationTarget.Global;
  sourceVal = insp.globalValue;
}
```

From test/unit/notifications.test.ts: existing patterns for stubbing `vscode.workspace.getConfiguration().inspect()` per scope. Use the same `makePerKeyScopedConfig` style helper (Phase 15 Plan 03 Decision) since the evaluator inspects two keys (sourceKey + completedMigrations).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Define MigrationEntry types, empty registry, and completedMigrations helpers</name>
  <read_first>
    - C:\code\gs-behave-bdd\src\notifications.ts (lines 110-250 — TransformResult shape, migrateScopedSetting signature, W-02 docblock; lines 350-351 — exports)
    - C:\code\gs-behave-bdd\.planning\phases\019-migration-foundation\019-CONTEXT.md (D-04 for the MigrationEntry shape; D-05 for the empty registry; per-scope semantics from MIGRATE-09)
    - C:\code\gs-behave-bdd\src\common.ts (read 1-30 for the import/export and `WkspError` shape; we follow the same module-style conventions)
    - C:\code\gs-behave-bdd\test\unit\notifications.test.ts (lines 1-150 — pick up the `makePerKeyScopedConfig`-style stub pattern and existing imports; reuse the same vscode mock surface)
    - C:\code\gs-behave-bdd\test\unit\vscode.mock.ts (confirm `ConfigurationTarget` enum is exported per Phase 15 Plan 02 Rule-3 deviation; we depend on it)
  </read_first>
  <files>
    src/migrations/types.ts,
    src/migrations/registry.ts,
    src/migrations/completedMigrations.ts,
    src/migrations/index.ts,
    test/unit/migrations.test.ts
  </files>
  <behavior>
    Tests for `markMigrationFinishedAtScope`:
    - Test 1.1: At each of the three scopes (Global / Workspace / WorkspaceFolder), with `completedMigrations` previously `undefined` at that scope, the helper writes `[entryId]` at the matching `ConfigurationTarget`.
    - Test 1.2: With `completedMigrations` previously `["other-id"]` at the chosen scope, the helper writes `["other-id", entryId]` at the matching target (append + dedup against the same-scope value only — Pitfall 2: never `cfg.get()` which merges scopes).
    - Test 1.3: With `completedMigrations` already containing `entryId` at the chosen scope, the helper does NOT call `update()` (idempotent — guards against duplicate writes that re-trigger config-change events).
    - Test 1.4: On `update()` rejection, the helper logs via `config.logger.logInfo` and returns normally (never throws — mirrors the v1.4.0 primitive contract).
    - Test 1.5: Reading other scopes' `completedMigrations` values DOES NOT cause writes at those scopes (per-scope independence per MIGRATE-09).

    Tests for `isMigrationFinishedAtScope`:
    - Test 2.1: Returns `true` only when `completedMigrations` at the queried scope contains the ID; reads via `inspect()` per-scope value, never via `get()` (assert by stubbing `inspect()` to return scope-specific arrays and `get()` to return a merged result the helper must NOT use).
    - Test 2.2: Returns `false` when the scope's value is `undefined` or an empty array.
    - Test 2.3: Returns `false` when only a *different* scope contains the ID (per MIGRATE-09 independence).
  </behavior>
  <action>
    **File 1 — `src/migrations/types.ts`**: Define the minimal `MigrationEntry` interface from D-04 verbatim, plus the supporting union types.
    ```typescript
    import * as vscode from 'vscode';
    import type { TransformResult } from '../notifications';

    /**
     * Phase 19 D-04: minimal MigrationEntry shape. Phase 20 may extend with
     * additional optional fields (e.g. `legacyCleanupNote`, `description`)
     * when concrete entries are registered. Keep this interface stable so
     * downstream phases can rely on it.
     */
    export interface MigrationEntry<TSrc = unknown, TDest = unknown> {
      readonly id: string;
      readonly sourceNamespace: string;
      readonly sourceKey: string;
      readonly destNamespace: string;
      readonly destKey: string;
      readonly transform: (src: TSrc, destAtSameScope: TDest | undefined) => TransformResult<TDest>;
    }

    /** Per-scope classification produced by the evaluator (REQUIREMENTS.md design reference). */
    export type MigrationCase = 1 | 2 | 3;

    /** The three VS Code scopes the evaluator visits per MIGRATE-04. */
    export type MigrationScope =
      | vscode.ConfigurationTarget.Global
      | vscode.ConfigurationTarget.Workspace
      | vscode.ConfigurationTarget.WorkspaceFolder;

    export const ALL_MIGRATION_SCOPES: readonly MigrationScope[] = [
      vscode.ConfigurationTarget.Global,
      vscode.ConfigurationTarget.Workspace,
      vscode.ConfigurationTarget.WorkspaceFolder,
    ] as const;
    ```

    **File 2 — `src/migrations/registry.ts`** (D-05 — empty in Phase 19):
    ```typescript
    import type { MigrationEntry } from './types';

    /**
     * Phase 19 D-05: registry intentionally empty. Phase 20 populates it with
     * the v1.4.0 refactors (migrateLegacyFeaturesPath, migrateLegacySuppressMultiConfig)
     * and the new behave-vsc -> gs-behave-bdd entries (MIGRATE-03).
     */
    export const MIGRATION_REGISTRY: readonly MigrationEntry[] = [];
    ```

    **File 3 — `src/migrations/completedMigrations.ts`**: helpers for reading/writing `gs-behave-bdd.completedMigrations` per-scope. Mirror the same-scope inspect/update pattern from `src/notifications.ts:194-227` (Pitfall 2: never `cfg.get()` — always inspect()). Per CONSENT-07 the namespace is `"gs-behave-bdd"` and the key is `"completedMigrations"`.

    Required exports:
    ```typescript
    export function isMigrationFinishedAtScope(id: string, scope: MigrationScope, wkspUri: vscode.Uri): boolean;
    export async function markMigrationFinishedAtScope(id: string, scope: MigrationScope, wkspUri: vscode.Uri): Promise<void>;
    ```

    Implementation notes:
    - Both helpers call `vscode.workspace.getConfiguration("gs-behave-bdd", wkspUri).inspect<string[]>("completedMigrations")` and pick the per-scope value (`globalValue` / `workspaceValue` / `workspaceFolderValue`).
    - `markMigrationFinishedAtScope`: read per-scope value, dedup, append `id`, call `cfg.update("completedMigrations", merged, scope)`. Wrap in try/catch; on rejection, `config.logger.logInfo` and return (mirrors the v1.4.0 contract).
    - Idempotency: if `id` already present at this scope, skip the `update()` call entirely.

    **File 4 — `src/migrations/index.ts`** (barrel for the public surface):
    ```typescript
    export type { MigrationEntry, MigrationCase, MigrationScope } from './types';
    export { ALL_MIGRATION_SCOPES } from './types';
    export { MIGRATION_REGISTRY } from './registry';
    export { isMigrationFinishedAtScope, markMigrationFinishedAtScope } from './completedMigrations';
    // evaluator exports added in Task 2 of this plan
    ```

    **File 5 — `test/unit/migrations.test.ts`** (initial test file; Task 2 will append evaluator tests). Cover behavior 1.1-1.5 and 2.1-2.3 above. Reuse the per-key scoped-config stub pattern from `test/unit/notifications.test.ts` (Phase 15 Plan 03 — `makePerKeyScopedConfig`).
  </action>
  <verify>
    <automated>npm run test:unit -- --grep "completedMigrations|markMigrationFinishedAtScope|isMigrationFinishedAtScope"</automated>
  </verify>
  <acceptance_criteria>
    - `npx tsc -p . --noEmit` (or webpack build) compiles cleanly with the new files.
    - All Task 1 unit tests pass; assert at least 8 distinct test cases (1.1-1.5 + 2.1-2.3).
    - Grep `cfg\.get\(` (no leading `inspect`) inside `src/migrations/completedMigrations.ts` returns 0 hits — Pitfall 2 enforcement.
    - `npx eslint src --ext ts` exits 0.
  </acceptance_criteria>
  <done>Types, registry, and per-scope completedMigrations helpers exist with passing unit tests; module is internally consistent and barrel-exported via `src/migrations/index.ts`.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement evaluateMigration with case 1/2/3 dispatch and full unit coverage</name>
  <read_first>
    - C:\code\gs-behave-bdd\src\notifications.ts (lines 143-249 — `migrateScopedSetting` body; lines 110-118 — `TransformResult` shape; line 350 — its export)
    - C:\code\gs-behave-bdd\.planning\phases\019-migration-foundation\019-CONTEXT.md (D-01, D-02, D-03 — evaluator vs primitive boundary; D-08 empty/whitespace skip-with-removal semantics)
    - C:\code\gs-behave-bdd\src\migrations\types.ts (just-written interface; ensure imports compile)
    - C:\code\gs-behave-bdd\src\migrations\completedMigrations.ts (just-written helpers; the evaluator calls `markMigrationFinishedAtScope` for case 1)
    - C:\code\gs-behave-bdd\test\unit\migrations.test.ts (Task 1 tests already in place; we append evaluator tests here)
  </read_first>
  <files>src/migrations/evaluator.ts, src/migrations/index.ts, test/unit/migrations.test.ts</files>
  <behavior>
    For each (entry × scope) classification, behavior MUST be:

    Case 1 — neither legacy nor canonical set at this scope:
      - No prompts, no copy.
      - Calls `markMigrationFinishedAtScope(entry.id, scope, wkspUri)`.
      - Calls `hooks.onCaseHit(1, entry, scope)` if provided.
      - Returns `{ scope, case: 1, action: 'finished' }`.

    Case 1 (per MIGRATE-08): legacy value is a string, but is empty or whitespace-only, and canonical not set at this scope.
      - Treat as case 1 silently AND remove the source (skip-with-removal — match v1.4.0 D-08).
      - Achieved by invoking `migrateScopedSetting` with a transform that returns `{ kind: 'skipDest', removeSource: true }` for the empty/whitespace case, then calling `markMigrationFinishedAtScope`.
      - Returns `{ scope, case: 1, action: 'finished' }`.

    Case 2 — legacy set, canonical not set at this scope:
      - The evaluator does NOT prompt (prompts ship in Phase 21).
      - Calls `hooks.onCaseHit(2, entry, scope)` if provided.
      - Returns `{ scope, case: 2, action: 'pending-user-choice' }` WITHOUT marking Finished — the Phase 21 prompt is responsible for marking Finished after the user chooses.
      - In Phase 19, with no hook wired in production, this is a no-op classification — exactly the "infrastructure only" contract from CONTEXT.md `<domain>`.

    Case 3 — both legacy and canonical set at this scope:
      - Same as case 2: `hooks.onCaseHit(3, entry, scope)`, return `{ case: 3, action: 'pending-user-choice' }`, do NOT mark Finished.

    Idempotency: if `isMigrationFinishedAtScope(entry.id, scope, wkspUri)` returns true, the evaluator returns `{ scope, case: <prior>, action: 'already-finished' }` without re-classifying or invoking the hook.

    Per-scope independence (MIGRATE-09): the evaluator iterates `ALL_MIGRATION_SCOPES` and treats each scope's classification independently. A case 1 at Global must not mark Finished at WorkspaceFolder.

    Per MIGRATE-07: the evaluator never reinvents copy/clear logic — when a copy is needed (Phase 21's case 2 / case 3 actions), it MUST go through `migrateScopedSetting`. Phase 19 only exercises the `skipDest + removeSource` path for the empty/whitespace case 1 sub-case.

    Test cases (TEST-03 — 3 cases × 3 scopes minimum):
    - Tests 3.1-3.3: Case 1 (neither set) at each of Global / Workspace / WorkspaceFolder — assert `markMigrationFinishedAtScope` called with correct target, no `migrateScopedSetting` invocation.
    - Tests 3.4-3.6: Case 2 (legacy set, canonical absent) at each scope — assert `onCaseHit(2, ...)` fired, NO `markMigrationFinishedAtScope` call, action === 'pending-user-choice'.
    - Tests 3.7-3.9: Case 3 (both set) at each scope — assert `onCaseHit(3, ...)` fired, NO `markMigrationFinishedAtScope` call, action === 'pending-user-choice'.
    - Test 3.10: MIGRATE-08 sub-case — legacy is `""` (empty string) at Workspace, canonical absent at Workspace — classified as case 1, `migrateScopedSetting` IS invoked once and the transform returns `{ kind: 'skipDest', removeSource: true }`, then `markMigrationFinishedAtScope` is called.
    - Test 3.11: MIGRATE-08 sub-case — legacy is `"   "` (whitespace) — same treatment as Test 3.10.
    - Test 3.12: Idempotency — when `completedMigrations` at the inspected scope already contains `entry.id`, the evaluator returns `{ action: 'already-finished' }` and DOES NOT invoke `onCaseHit`.
    - Test 3.13: Per-scope independence — entry classified as case 1 at Global only does not mark Finished at Workspace or WorkspaceFolder (assert exactly one `update()` call to `completedMigrations`, with target Global).
    - Test 3.14: `evaluateAllMigrations` (the exported convenience that loops registry + scopes) returns one classification per (entry × scope); with the empty Phase 19 registry it returns `[]`.
  </behavior>
  <action>
    Implement `src/migrations/evaluator.ts`. Required exports:
    ```typescript
    export interface EvaluatorHooks {
      onCaseHit?: (mcase: MigrationCase, entry: MigrationEntry, scope: MigrationScope) => void;
    }

    export interface EvaluationResult {
      scope: MigrationScope;
      case: MigrationCase;
      action: 'finished' | 'pending-user-choice' | 'already-finished';
    }

    export async function evaluateMigration(
      entry: MigrationEntry,
      wkspUri: vscode.Uri,
      hooks?: EvaluatorHooks,
    ): Promise<EvaluationResult[]>;

    export async function evaluateAllMigrations(
      wkspUri: vscode.Uri,
      hooks?: EvaluatorHooks,
      registry?: readonly MigrationEntry[], // defaults to MIGRATION_REGISTRY; injectable for tests
    ): Promise<EvaluationResult[]>;
    ```

    Implementation algorithm for `evaluateMigration`:
    1. For each scope in `ALL_MIGRATION_SCOPES`:
       a. Short-circuit on `isMigrationFinishedAtScope(entry.id, scope, wkspUri)` -> result `'already-finished'`.
       b. Read `vscode.workspace.getConfiguration(entry.sourceNamespace, wkspUri).inspect(entry.sourceKey)` and pick the per-scope value (Pitfall 2: never `get()`).
       c. Read `vscode.workspace.getConfiguration(entry.destNamespace, wkspUri).inspect(entry.destKey)` and pick the per-scope value.
       d. Classify:
          - sourceVal undefined AND destVal undefined -> case 1 (silent finish).
          - sourceVal is a string AND `sourceVal.trim() === ''` AND destVal undefined -> case 1 sub-case (MIGRATE-08): invoke `migrateScopedSetting` with a `{ kind: 'skipDest', removeSource: true }` transform to clear the empty source at this scope only. To force the primitive into THIS scope, the source must already be the most-specific scope per W-02 — that constraint is satisfied because the evaluator already verified the empty value lives at THIS scope. Then call `markMigrationFinishedAtScope`. Action: 'finished'.
          - sourceVal !== undefined AND destVal === undefined -> case 2: hooks.onCaseHit(2, entry, scope). Action: 'pending-user-choice'. Do NOT mark Finished here.
          - sourceVal !== undefined AND destVal !== undefined -> case 3: hooks.onCaseHit(3, entry, scope). Action: 'pending-user-choice'. Do NOT mark Finished here.
          - sourceVal === undefined AND destVal !== undefined -> case 1 (no migration needed at this scope; the canonical is already set). Mark Finished, no hook call. Action: 'finished'.
       e. For case 1 sub-case (empty/whitespace), emit `hooks.onCaseHit(1, entry, scope)` AFTER the cleanup completes — Phase 21 may want to log the cleanup, but it MUST NOT prompt.
    2. Return the array of results.

    Algorithm for `evaluateAllMigrations`: flatMap over `(registry ?? MIGRATION_REGISTRY)` -> `evaluateMigration(entry, wkspUri, hooks)`.

    Re-export both functions from `src/migrations/index.ts` (extend the barrel from Task 1).

    Implementation constraints:
    - All `update()` calls go through `markMigrationFinishedAtScope` (which already wraps try/catch + logger).
    - The empty/whitespace case 1 sub-case is the ONLY place where the evaluator invokes `migrateScopedSetting`. All other case 2 / case 3 copy work is deferred to Phase 21.
    - The evaluator never throws. Wrap each per-scope iteration in try/catch -> `config.logger.logInfo` and continue with the next scope.

    Append tests 3.1 through 3.14 to `test/unit/migrations.test.ts`. Use Sinon stubs for `vscode.workspace.getConfiguration` to drive `inspect()` per-scope return values; spy on `update()` calls and on the injected hook.
  </action>
  <verify>
    <automated>npm run test:unit -- --grep "evaluateMigration|evaluator|MIGRATE-08|MIGRATE-09"</automated>
  </verify>
  <acceptance_criteria>
    - All Task 2 unit tests pass (≥14 new tests covering all 3 cases × 3 scopes plus MIGRATE-08 + idempotency + independence + empty-registry sweep).
    - Grep `cfg\.get\(` inside `src/migrations/evaluator.ts` returns 0 hits (Pitfall 2 enforcement).
    - Grep `await migrateScopedSetting` inside `src/migrations/evaluator.ts` returns exactly 1 hit (the MIGRATE-08 empty/whitespace cleanup path) — pins MIGRATE-07 ("no parallel implementations") and the "infrastructure only" contract.
    - `npx eslint src --ext ts` exits 0.
    - `npm run test:unit` reports 0 failures (full suite).
    - `node -e "const m=require('./out/src/migrations'); if(!m.evaluateMigration||!m.evaluateAllMigrations||!m.MIGRATION_REGISTRY||m.MIGRATION_REGISTRY.length!==0) process.exit(1)"` exits 0 (verifies barrel exports + D-05 empty registry; adjust the require path to whatever the project's compiled-test output is, e.g. `out/test/src/migrations` — confirm during execution).
  </acceptance_criteria>
  <done>Per-scope evaluator with case 1/2/3 dispatch is implemented, exercised by ≥14 tests covering all required combinations, and routed through `migrateScopedSetting` for the only Phase 19 copy path (MIGRATE-08 cleanup). The registry remains empty per D-05; activation wiring lands in Phase 22.</done>
</task>

</tasks>

<verification>
- Unit tests: ≥22 new tests across `test/unit/migrations.test.ts`. `npm run test:unit` reports 0 failures.
- `npx eslint src --ext ts` exits 0.
- `grep -rn "MIGRATION_REGISTRY" src/migrations` shows the empty-array literal at one location (D-05).
- The `src/migrations/` directory contains exactly the five new files; no edits land in `src/extension.ts`, `src/notifications.ts`, or `package.json` in this plan.
</verification>

<success_criteria>
Phase 19 success criteria #2 and #4 satisfied:
- The evaluator inspects each unfinished migration × each VS Code scope and dispatches to case 1/2/3 logic; mark-Finished writes land at the correct scope; a fresh workspace folder starts with empty `completedMigrations` (Test 3.13 + per-scope inspect/update semantics).
- Empty / whitespace legacy values are treated as case 1 with skip-with-removal (Tests 3.10, 3.11); all migrations route through the existing `migrateScopedSetting` primitive (grep gate ensures exactly one call site).
</success_criteria>

<output>
After completion, create `.planning/phases/019-migration-foundation/019-02-SUMMARY.md` summarising the module layout, the evaluator algorithm, the test count delta, and any decisions deferred to Phase 21 (e.g. how the `onCaseHit` hook will be wired).
</output>
