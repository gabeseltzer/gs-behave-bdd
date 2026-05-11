---
phase: 021-consent-ux-case-2-case-3-prompts
plan: 03
type: execute
wave: 2
depends_on: ["021-01"]
files_modified:
  - test/unit/migrations/consent.test.ts
autonomous: true
requirements:
  - TEST-01
  - TEST-02

must_haves:
  truths:
    - "Every case-2 action is unit-tested: migrate-and-delete, migrate-and-keep, dont-migrate"
    - "Every case-3 action is unit-tested: overwrite-and-delete, overwrite-and-keep, keep-canonical-and-delete-legacy, keep-both"
    - "Dismissal at case 2 and case 3 leaves the migration unfinished (markMigrationFinishedAtScope NOT called) and emits exactly one audit log line"
    - "migrationMode=migrate-and-delete | migrate-and-keep | skip runs case 2 silently; case 3 always prompts even when migrationMode=skip"
    - "An entry hitting the same case at 2 scopes produces 1 notification; the chosen action runs at both scopes; both scopes are marked Finished"
    - "An entry hitting case 2 at one scope and case 3 at another produces 2 notifications"
    - "Every successfully dispatched action emits exactly one logInfo line (audit trail) on the success path"
  artifacts:
    - path: "test/unit/migrations/consent.test.ts"
      provides: "TEST-01 + TEST-02 coverage"
      min_lines: 350
      contains: "suite('Phase 21"
  key_links:
    - from: "test/unit/migrations/consent.test.ts"
      to: "src/migrations/consent.ts"
      via: "import runConsentFlow"
      pattern: "from ['\"]\\.\\.\\/.+\\/migrations(\\/consent|\\b)"
---

> **Shell portability note:** The grep-based acceptance criteria below assume Git Bash. PowerShell users can run the equivalent `Select-String` commands. The `<automated>` verify lines (eslint + tsc + unit tests) are the authoritative cross-shell check; the grep assertions are advisory pre-flight signals.

<objective>
Create `test/unit/migrations/consent.test.ts` with comprehensive unit coverage of `runConsentFlow` per D-A9.3. Covers TEST-01 (case 2 actions × 3 + dismissal + 3 silent migrationMode paths) and TEST-02 (case 3 actions × 4 + dismissal + case 3 prompts even when migrationMode=skip), plus grouping, mixed-case, and audit-log assertions.

Purpose: pins the consent UX behavior so future refactors can't silently regress the contract. Plan 01 ships the orchestrator; Plan 03 ships the safety net.

Output:
- `test/unit/migrations/consent.test.ts` (new file, ~350-500 lines).

Invariants:
- Mocking strategy mirrors `test/unit/migrations/plain.test.ts` (D-A9.2): stub `vscode.window.showInformationMessage`, stub `vscode.workspace.getConfiguration().inspect()` / `.update()`, stub `config.logger`.
- No real VS Code APIs invoked — pure Sinon stubs.
- The test file does NOT import `migrateScopedSetting` directly; it asserts on the visible side effects (cfg.update calls + markMigrationFinishedAtScope writes + logger.logInfo calls + showInformationMessage calls).
- Tests pin success-path behavior. The "exactly one logInfo line per action" invariant is well-defined on the success path because Plan 01 Task 2 emits the audit log ONLY after the primitive resolves successfully (D-A5.4 — no `finally` blocks).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/021-consent-ux-case-2-case-3-prompts/021-CONTEXT.md
@test/unit/migrations/plain.test.ts
@src/migrations/consent.ts
@CLAUDE.md

<interfaces>
Public surface under test (from Plan 01):
```typescript
export type Case2Action = 'migrate-and-delete' | 'migrate-and-keep' | 'dont-migrate';
export type Case3Action = 'overwrite-and-delete' | 'overwrite-and-keep' | 'keep-canonical-and-delete-legacy' | 'keep-both';
export type MigrationMode = 'prompt' | 'migrate-and-delete' | 'migrate-and-keep' | 'skip';
export interface ConsentHit { case: 2 | 3; entry: MigrationEntry; scope: MigrationScope; }
export function readMigrationMode(wkspUri: vscode.Uri): MigrationMode;
export function friendlyScopeName(scope: MigrationScope): string;
export function formatCase2Message(entry: MigrationEntry, scopes: readonly MigrationScope[]): string;
export function formatCase3Message(entry: MigrationEntry, scopes: readonly MigrationScope[]): string;
export async function runConsentFlow(wkspUri, hits, mode): Promise<void>;
```

Button labels (PINNED — tests assert exact strings):
- Case 2: `'Migrate & delete'`, `'Migrate & keep'`, `"Don't migrate"`
- Case 3: `'Overwrite & delete'`, `'Overwrite & keep'`, `'Keep canonical'`, `'Keep both'`
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create test/unit/migrations/consent.test.ts with the full suite</name>
  <files>test/unit/migrations/consent.test.ts</files>

  <read_first>
    - test/unit/migrations/plain.test.ts (test fixture style + stub patterns to mirror — D-A9.2)
    - src/migrations/consent.ts (file under test — Plan 01 output)
    - .planning/phases/021-consent-ux-case-2-case-3-prompts/021-CONTEXT.md § D-A9 (required test coverage matrix)
    - test/unit/vscode.mock.ts if present (look for an existing vscode require mock — use it; otherwise replicate plain.test.ts shim style)
  </read_first>

  <action>
Create `test/unit/migrations/consent.test.ts`. Structure (use mocha `suite` / `test` per repo convention):

**Header:**
```typescript
import * as assert from 'assert';
import * as sinon from 'sinon';
import * as configModule from '../../../src/configuration';
import { runConsentFlow, type ConsentHit } from '../../../src/migrations';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscode = require('vscode');

const MOCK_URI = vscode.Uri.file('/fake/workspace');

// Build a MigrationEntry stub with identity transform — sufficient for every
// test case below since we assert on the cfg.update calls the primitive makes,
// not on the entry's transform internals.
function makeEntry(id: string): import('../../../src/migrations').MigrationEntry {
  return {
    id,
    sourceNamespace: 'behave-vsc',
    sourceKey: id.replace(/-from-behavevsc$/, ''),
    destNamespace: 'gs-behave-bdd',
    destKey: id.replace(/-from-behavevsc$/, ''),
    transform: (src, _dest) => ({ kind: 'value', value: src }),
  };
}
```

**Shared mocking helpers** (mirror `plain.test.ts` style):
- A factory that returns a fake `vscode.workspace.getConfiguration` per-namespace with `inspect()` / `update()` spies, parametrised by which (namespace × key) pairs have which `globalValue` / `workspaceValue` / `workspaceFolderValue`.
- A stub `loggerSpy = { logInfo: sinon.spy() }` injected via `sinon.stub(configModule.config, 'logger').value(loggerSpy)`.
- A `showStub = sinon.stub(vscode.window, 'showInformationMessage')`. Tests configure return value via `showStub.resolves('Migrate & delete')` etc.
- Standard `setup()` / `teardown()` to `sinon.restore()` between tests.

**Test suites** — implement ALL of the following. Each `test()` MUST include assertion(s) on (a) which button labels were shown, (b) which cfg.update calls fired, (c) which markMigrationFinishedAtScope writes fired (via cfg.update on `gs-behave-bdd.completedMigrations`), and (d) which logger.logInfo lines fired.

```
suite('Phase 21 — consent.ts', () => {

  suite('case 2 prompt (migrationMode = prompt)', () => {
    test('action: Migrate & delete runs migrate semantic and marks Finished', ...);
    test('action: Migrate & keep runs migrate semantic without removeSource and marks Finished', ...);
    test("action: Don't migrate is a no-op write but marks Finished", ...);
    test('dismissal (undefined) does NOT mark Finished and emits one "dismissed" log line', ...);
    test('exactly one logInfo line per dispatched action (success path)', ...);
    test('button labels are exactly ["Migrate & delete", "Migrate & keep", "Don\\'t migrate"]', ...);
  });

  suite('case 2 silent (migrationMode != prompt)', () => {
    test('migrationMode=migrate-and-delete runs silently, no showInformationMessage call', ...);
    test('migrationMode=migrate-and-keep runs silently, no showInformationMessage call', ...);
    test('migrationMode=skip marks Finished without writing, logs "skip at <Scope>"', ...);
  });

  suite('case 3 prompt (always)', () => {
    test('action: Overwrite & delete overwrites canonical and removes source', ...);
    test('action: Overwrite & keep overwrites canonical and keeps source', ...);
    test('action: Keep canonical clears legacy without writing canonical', ...);
    test('action: Keep both is a no-op write but marks Finished', ...);
    test('dismissal (undefined) does NOT mark Finished and emits one "dismissed" log line', ...);
    test('case 3 still prompts when migrationMode = skip (D-A4.3)', async () => {
      // Pre-condition: hits=[{case:3, ...}], mode='skip'
      // Expectation: showInformationMessage IS called once with the four case-3 labels
    });
    test('button labels are exactly ["Overwrite & delete", "Overwrite & keep", "Keep canonical", "Keep both"]', ...);
  });

  suite('grouping (D-A1)', () => {
    test('one entry hitting the same case at 2 scopes → 1 notification covering both scopes', async () => {
      // hits = [
      //   { case: 2, entry: e, scope: vscode.ConfigurationTarget.Workspace },
      //   { case: 2, entry: e, scope: vscode.ConfigurationTarget.Global },
      // ]
      // assert: showStub called exactly once
      // assert: chosen action runs twice (once per scope)
      // assert: markFinished writes at both scopes (cfg.update on completedMigrations at both Workspace and Global)
    });
    test('one entry hitting case 2 at one scope and case 3 at another → 2 notifications (D-A1.2)', async () => {
      // hits = [{case:2, e, Workspace}, {case:3, e, WorkspaceFolder}]
      // assert: showStub called exactly twice
      // assert: first call uses case-2 button set (3 buttons), second uses case-3 set (4 buttons)
    });
    test('groups are processed sequentially (showStub call N+1 only fires after call N resolves)', ...);
    test('groups are sorted deterministically: by entry.id then by case (2 before 3)', ...);
  });

  suite('audit logging (D-A6)', () => {
    test('each of the 7 explicit actions emits exactly one logInfo line on success', ...);
    test('dismissal emits exactly one "dismissed" logInfo line with the raw scope name', ...);
    test('migrationMode=skip silent path emits one "skip at <Scope>" logInfo line per scope', ...);
  });

});
```

Implementation notes:
- For `markMigrationFinishedAtScope` assertions, locate the cfg.update call where the first arg is `'completedMigrations'`. Assert: the third arg is the expected `MigrationScope` enum value (use `vscode.ConfigurationTarget.Workspace` etc.), and the second arg is an array containing the entry id.
- For the "Keep canonical" (a.k.a. `keep-canonical-and-delete-legacy`) test, assert that cfg.update on the canonical key is NOT called (only the legacy clear + completedMigrations write fire). The primitive's `kind: 'skipDest'` path achieves this — verify via cfg.update spy call args.
- For "Overwrite & delete" / "Overwrite & keep" tests, set the canonical (`gs-behave-bdd.<key>`) to a non-empty value at the same scope in the inspect stub, then assert the canonical gets overwritten with the legacy value (the entry's identity transform receives `undefined` for destAtSameScope per D-A5.3, so the result equals the legacy value).
- For `showInformationMessage` argument assertions, the second arg is `{ modal: false }` and the rest are the button strings. Use `showStub.firstCall.args.slice(2)` to extract buttons and compare with `assert.deepStrictEqual` against the verbatim arrays from D-A2.2 / D-A2.3.
- Sequential-await test: have `showStub.onFirstCall().returns(new Promise(resolve => setTimeout(() => resolve('Migrate & delete'), 20)))` and `showStub.onSecondCall().resolves('Migrate & keep')`. Use a counter incremented inside the showStub fake to assert second call only happens after first resolves.
- All success-path tests use stubbed primitives that resolve cleanly, so the "exactly one logInfo line per action" invariant holds without ambiguity. Per Plan 01 Task 2 (no `finally` blocks), a primitive failure would mean the handler throws BEFORE the audit log is emitted; testing that failure path is not required by D-A9.3.

All tests must `await runConsentFlow(MOCK_URI, hits, mode)` before assertions.

After writing, run `npm run test:unit` and verify ALL new tests pass. If any fail, fix the test (not the source, unless the source is genuinely wrong — in which case open a discussion with the user before editing `consent.ts`).
  </action>

  <verify>
    <automated>npx eslint test --ext ts && npm run test:unit -- --grep "Phase 21 — consent"</automated>
  </verify>

  <acceptance_criteria>
    - File `test/unit/migrations/consent.test.ts` exists.
    - `grep -c "suite('Phase 21 — consent.ts'" test/unit/migrations/consent.test.ts` returns `1`.
    - `grep -c "case 2 prompt" test/unit/migrations/consent.test.ts` ≥ `1`.
    - `grep -c "case 2 silent" test/unit/migrations/consent.test.ts` ≥ `1`.
    - `grep -c "case 3 prompt" test/unit/migrations/consent.test.ts` ≥ `1`.
    - `grep -c "grouping" test/unit/migrations/consent.test.ts` ≥ `1`.
    - `grep -c "audit logging" test/unit/migrations/consent.test.ts` ≥ `1`.
    - All seven button labels appear verbatim in assertions:
      - `grep -c "'Migrate & delete'" test/unit/migrations/consent.test.ts` ≥ `2` (asserted + used in showStub.resolves)
      - `grep -c "'Migrate & keep'" test/unit/migrations/consent.test.ts` ≥ `2`
      - `grep -c "\"Don't migrate\"" test/unit/migrations/consent.test.ts` ≥ `2`
      - `grep -c "'Overwrite & delete'" test/unit/migrations/consent.test.ts` ≥ `2`
      - `grep -c "'Overwrite & keep'" test/unit/migrations/consent.test.ts` ≥ `2`
      - `grep -c "'Keep canonical'" test/unit/migrations/consent.test.ts` ≥ `2`
      - `grep -c "'Keep both'" test/unit/migrations/consent.test.ts` ≥ `2`
    - `grep -c "showInformationMessage" test/unit/migrations/consent.test.ts` ≥ `3` (stubbed + asserted multiple times).
    - `grep -c "migrationMode = skip" test/unit/migrations/consent.test.ts | grep -v '^#'` — alternate: `grep -c "case 3 still prompts when migrationMode = skip" test/unit/migrations/consent.test.ts` ≥ `1`.
    - Total `test(` count: `grep -c "^\\s*test(" test/unit/migrations/consent.test.ts` ≥ `20` (rough lower bound — the listed cases sum to ~22).
    - `npx eslint test --ext ts` exits 0 with no output.
    - `npm run test:unit` exits 0 — every new test passes AND no prior test regresses.
  </acceptance_criteria>

  <done>The test file exists with the full suite outlined above, every required scenario from D-A9.3 has a matching `test()`, button-label strings are pinned verbatim, and the entire unit suite passes including the new file.</done>
</task>

</tasks>

<verification>
- `test/unit/migrations/consent.test.ts` exists with ≥ 20 tests organized by case-2/case-2-silent/case-3/grouping/audit-logging suites.
- `npm run test:unit` exits 0; new suite is included in the run.
- ESLint clean on `test/`.
- No changes to `src/` or other test files — this plan is test-only.
</verification>

<success_criteria>
- TEST-01: case 2 prompt fully covered (3 actions + dismissal + 3 silent migrationMode values).
- TEST-02: case 3 prompt fully covered (4 actions + dismissal + case 3 prompts when migrationMode = skip).
- Grouping behavior (D-A1.1/1.2/1.3), tie-break sort order, and audit logging (D-A6.1) are pinned.
</success_criteria>

<output>
After completion, create `.planning/phases/021-consent-ux-case-2-case-3-prompts/021-03-tests-SUMMARY.md`.
</output>
