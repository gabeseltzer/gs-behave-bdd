---
phase: 022-cleanup-integration-docs
plan: 02
type: execute
wave: 2
depends_on: ["022-01"]
files_modified:
  - example-projects/migration-consent/behave.ini
  - example-projects/migration-consent/features/environment.py
  - example-projects/migration-consent/features/example.feature
  - example-projects/migration-consent/features/steps/steps.py
  - example-projects/migration-consent/.vscode/settings.case-1.json
  - example-projects/migration-consent/.vscode/settings.case-2.json
  - example-projects/migration-consent/.vscode/settings.case-3.json
  - example-projects/migration-consent/.vscode/settings.json
  - test/integration/migration-consent suite/index.ts
  - test/integration/migration-consent suite/extension.test.ts
  - test/integration/runTestSuites.ts
autonomous: true
requirements:
  - TEST-07

must_haves:
  truths:
    - "A fixture at example-projects/migration-consent/ has behave.ini, a features/ folder with at least one feature + steps file, and three per-case settings templates"
    - "The new integration suite at test/integration/migration-consent suite/ activates the extension and exercises Case 1 silent, Case 2 (Migrate & delete), and Case 3 (Overwrite & delete)"
    - "Each scenario asserts the post-activation state: completedMigrations contains the migration ID, and the legacy/canonical keys are in the expected per-case shape"
    - "The new suite is registered in test/integration/runTestSuites.ts and launches against example-projects/migration-consent"
    - "Tests use sinon.stub(vscode.window, 'showInformationMessage') installed at module-load time (mirrors the migrations-suite pattern in index.ts) so prompts never block CI"
  artifacts:
    - path: "example-projects/migration-consent/.vscode/settings.case-2.json"
      provides: "Case 2 seed: behave-vsc.runParallel = true, gs-behave-bdd.runParallel unset"
      contains: "behave-vsc.runParallel"
    - path: "example-projects/migration-consent/.vscode/settings.case-3.json"
      provides: "Case 3 seed: both behave-vsc.featuresPath and gs-behave-bdd.featuresPaths set"
      contains: "gs-behave-bdd.featuresPaths"
    - path: "test/integration/migration-consent suite/extension.test.ts"
      provides: "Three scenario tests against the post-cleanup runtime"
      contains: "migration-consent suite"
  key_links:
    - from: "test/integration/runTestSuites.ts"
      to: "test/integration/migration-consent suite/index.ts"
      via: "runTests({ extensionTestsPath: …'./migration-consent suite' }) launched against example-projects/migration-consent"
      pattern: "migration-consent suite"
    - from: "test/integration/migration-consent suite/extension.test.ts"
      to: "src/migrations/consent.ts handlers"
      via: "sinon stub on showInformationMessage returns 'Migrate & delete' / 'Overwrite & delete' / dismissal"
      pattern: "(Migrate & delete|Overwrite & delete)"
---

<objective>
Prove the consent flow works end-to-end in real VS Code by building a dedicated fixture + suite that exercises all three migration cases against the post-CLEANUP-01 runtime. Per D-C2 and REQUIREMENTS.md lines 14-16 (Case 1/2/3 contract) and line 30 (CONSENT-03 Overwrite & delete = "Overwrite canonical with legacy, delete legacy"):

1. **Case 1 silent finish:** seed neither legacy nor canonical for any registry migration ID → every entry hits case 1 → all marked Finished silently, ZERO prompts fire (of any kind, for any entry).
2. **Case 2 with `Migrate & delete`:** seed `behave-vsc.runParallel = true`, leave `gs-behave-bdd.runParallel` unset. After activation, the prompt fires for migration ID `runParallel-from-behavevsc` → stub returns `'Migrate & delete'` → canonical written (`gs-behave-bdd.runParallel = true`), legacy cleared, migration marked Finished. (Using `runParallel` rather than `featuresPath` keeps the fixture small and avoids interaction with the v1.4.0 wrapper shims.)
3. **Case 3 with `Overwrite & delete`:** seed BOTH `behave-vsc.featuresPath = "features-alt"` AND `gs-behave-bdd.featuresPaths = ["features"]`. Prompt fires with the 4-button shape for migration ID `featuresPath-from-behavevsc` → stub returns `'Overwrite & delete'` → per `src/migrations/consent.ts:185-204` (`runOverwriteAtScope` passes `undefined` as `destAtSameScope`), the featuresPath transform produces a CLEAN OVERWRITE (NOT a merge): final `gs-behave-bdd.featuresPaths === ['features-alt']` (legacy value wins, prior canonical `['features']` is replaced). Legacy key cleared, migration Finished.

Migration entry IDs (resolved from `src/migrations/plain.ts:25` and `src/migrations/featuresPath.ts:57`):
- `runParallel` migration: `runParallel-from-behavevsc` (via `makePlainEntry('runParallel')` → `${sourceKey}-from-behavevsc`).
- `featuresPath` migration: `featuresPath-from-behavevsc` (literal `id: 'featuresPath-from-behavevsc'` at `featuresPath.ts:57`).

Recheck command ID (resolved from `package.json:169` `contributes.commands`):
- `gs-behave-bdd.recheckMigrations` (verbatim).

Purpose: unit tests (`test/unit/migrations/consent.test.ts`, 23 scenarios from Phase 21) already cover the action × mode matrix. The job of TEST-07 is to prove the *VS Code seam* — prompt registration, button activation, notification → action dispatch — works in a real Extension Development Host.

Output:
- One new fixture under `example-projects/migration-consent/` with behave.ini + features tree + three `.vscode/settings.case-N.json` templates.
- One new suite at `test/integration/migration-consent suite/` with `index.ts` (mirroring the migrations suite's pre-activation stub install) and `extension.test.ts` (three smoke tests).
- One new `runTests` block in `test/integration/runTestSuites.ts` that launches the suite against the fixture.

Invariants:
- The fixture follows the `migration-stale` template-swap pattern: scenarios overwrite `settings.json` from a `settings.case-N.json` template at the start of each test, and the `suiteTeardown` restores a baseline so the working tree stays clean.
- The suite asserts the post-Plan-01 cleanup runtime — i.e. the extension reads only `gs-behave-bdd.*` after migration completes; legacy keys are no longer honored by the runtime even when they linger in settings.json (which is the whole point of CLEANUP-01).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/022-cleanup-integration-docs/022-CONTEXT.md
@.planning/phases/021-consent-ux-case-2-case-3-prompts/021-CONTEXT.md
@example-projects/migration-stale/behave.ini
@example-projects/migration-stale/.vscode/settings.template.json
@test/integration/migrations suite/index.ts
@test/integration/migrations suite/extension.test.ts
@test/integration/runTestSuites.ts

<interfaces>
<!-- Consent module's button label contract (verbatim from src/migrations/consent.ts:322-324) -->

```typescript
// Case 2 buttons:
['Migrate & delete', 'Migrate & keep', "Don't migrate"]
// Case 3 buttons:
['Overwrite & delete', 'Overwrite & keep', 'Keep canonical', 'Keep both']
```

The integration test's stub MUST return one of these literal strings to trigger a handler. Returning any other string falls through `handlerForButton()` to the dismissal path.

<!-- Case 3 overwrite semantics (src/migrations/consent.ts:185-204 runOverwriteAtScope) -->
```typescript
// D-A5.3: pass undefined as destAtSameScope so the entry transform produces a
// clean replacement value (overwrite semantics) instead of a merge.
transform: (src, _destAtSameScope) => {
  const r = entry.transform(src, undefined);  // destAtSameScope = undefined
  if (r.kind === 'write') return { kind: 'write', value: r.value, removeSource };
  ...
}
```
For featuresPath: `featuresPathMergeWithDedup('features-alt', undefined)` → returns `{kind:'write', value: ['features-alt']}` because `existingArr` is undefined → `current = []` → `[...current, 'features-alt']` = `['features-alt']`. Clean overwrite, prior canonical `['features']` is replaced entirely.

<!-- Migration entry IDs (verbatim from src/migrations/plain.ts:25 + featuresPath.ts:57) -->
- `runParallel-from-behavevsc`
- `featuresPath-from-behavevsc`

<!-- Recheck command (verbatim from package.json:169) -->
- `gs-behave-bdd.recheckMigrations`

<!-- TestSupport handle (src/extension.ts) -->
```typescript
export type TestSupport = {
  config: Configuration;
  // … other internals exposed for integration tests
};
```

<!-- Pre-activation stub pattern (verbatim from test/integration/migrations suite/index.ts) -->
```typescript
sinon.stub(vscode.window, 'showInformationMessage').callsFake(
  (async (..._args: unknown[]) => undefined) as unknown as typeof vscode.window.showInformationMessage
);
export function run(): Promise<void> {
  return runner("**/migration-consent suite/**.test.js");
}
```

The default stub returns `undefined` (dismissal). Per-test `stub.callsFake(…)` overrides drive Migrate & delete / Overwrite & delete outcomes. Activation fires once for the whole suite (workspaceContains trigger), so the pre-test template swap + `await config.reloadSettings(wkspUri)` + manual re-invocation via the recheck command is required for per-test scenarios.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create example-projects/migration-consent/ fixture (behave.ini + features tree + three settings templates)</name>
  <files>example-projects/migration-consent/behave.ini, example-projects/migration-consent/features/environment.py, example-projects/migration-consent/features/example.feature, example-projects/migration-consent/features/steps/steps.py, example-projects/migration-consent/.vscode/settings.case-1.json, example-projects/migration-consent/.vscode/settings.case-2.json, example-projects/migration-consent/.vscode/settings.case-3.json, example-projects/migration-consent/.vscode/settings.json</files>
  <read_first>
    - example-projects/migration-stale/behave.ini (target shape)
    - example-projects/migration-stale/features/example.feature (target shape)
    - example-projects/migration-stale/features/environment.py (target shape if non-empty)
    - example-projects/migration-stale/features/steps/steps.py (target shape)
    - example-projects/migration-stale/.vscode/settings.template.json
  </read_first>
  <action>
    Create the fixture under `example-projects/migration-consent/` matching the `migration-stale` shape:

    1. `example-projects/migration-consent/behave.ini`:
       ```ini
       [behave]
       paths = features
       ```

    2. `example-projects/migration-consent/features/example.feature`:
       ```gherkin
       Feature: Consent flow smoke

         Scenario: trivial pass
           Given a passing step
       ```

    3. `example-projects/migration-consent/features/steps/steps.py`:
       ```python
       from behave import given

       @given('a passing step')
       def step_impl(context):
           pass
       ```

    4. `example-projects/migration-consent/features/environment.py` — empty file (matches the migration-stale shape).

    5. `example-projects/migration-consent/.vscode/settings.case-1.json` — Case 1 baseline (neither legacy nor canonical set for any migration). Keep the file small but valid:
       ```json
       {}
       ```

    6. `example-projects/migration-consent/.vscode/settings.case-2.json` — Case 2 seed (legacy `runParallel` set, canonical unset):
       ```json
       {
         "behave-vsc.runParallel": true
       }
       ```

    7. `example-projects/migration-consent/.vscode/settings.case-3.json` — Case 3 seed (BOTH legacy `behave-vsc.featuresPath` AND canonical `gs-behave-bdd.featuresPaths` set; canonical points at the fixture's existing `features` folder, legacy points at `features-alt`). Per the overwrite semantics documented in `<interfaces>`, after the user picks *Overwrite & delete* the canonical value becomes exactly `['features-alt']` (clean replacement, not a merge):
       ```json
       {
         "behave-vsc.featuresPath": "features-alt",
         "gs-behave-bdd.featuresPaths": ["features"]
       }
       ```

    8. `example-projects/migration-consent/.vscode/settings.json` — start identical to `settings.case-1.json` (the baseline). The integration test will overwrite this file per scenario, then `suiteTeardown` will restore it from `settings.case-1.json`.

    Note: do NOT create `features-alt/` as a folder. Case 3 has the legacy value pointing at a *string* "features-alt"; the test asserts the migration *replaced the canonical array with `['features-alt']`* — it does NOT need to assert the path resolves on disk (that's a different validator).
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');for(const f of ['example-projects/migration-consent/behave.ini','example-projects/migration-consent/features/example.feature','example-projects/migration-consent/features/steps/steps.py','example-projects/migration-consent/.vscode/settings.case-1.json','example-projects/migration-consent/.vscode/settings.case-2.json','example-projects/migration-consent/.vscode/settings.case-3.json','example-projects/migration-consent/.vscode/settings.json']) if(!fs.existsSync(f)) {console.error('MISSING',f);process.exit(1);} console.log('OK');"</automated>
  </verify>
  <acceptance_criteria>
    - `ls example-projects/migration-consent/.vscode/` lists `settings.case-1.json`, `settings.case-2.json`, `settings.case-3.json`, `settings.json`.
    - `ls example-projects/migration-consent/features/steps/` lists `steps.py`.
    - `cat example-projects/migration-consent/.vscode/settings.case-2.json` contains the string `"behave-vsc.runParallel"`.
    - `cat example-projects/migration-consent/.vscode/settings.case-3.json` contains BOTH `"behave-vsc.featuresPath"` AND `"gs-behave-bdd.featuresPaths"`.
    - `node -e "JSON.parse(require('fs').readFileSync('example-projects/migration-consent/.vscode/settings.case-3.json','utf8'))"` exits 0 (valid JSON).
  </acceptance_criteria>
  <done>
    The fixture parallels `migration-stale` in structure and contains the three case templates.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create test/integration/migration-consent suite/ (index.ts + extension.test.ts) with three scenario tests</name>
  <files>test/integration/migration-consent suite/index.ts, test/integration/migration-consent suite/extension.test.ts</files>
  <read_first>
    - test/integration/migrations suite/index.ts (full file — pre-activation stub pattern)
    - test/integration/migrations suite/extension.test.ts (full file — setupTestSupport, suiteTeardown template restore, stub.callsFake per-test override patterns)
    - src/migrations/consent.ts (lines 280-365 — confirm runConsentFlow signature + the exact button labels)
    - src/migrations/registry.ts or wherever `getRegistry()` is exported (to drive the "all registry IDs in completedMigrations" assertion in Test 1)
    - .planning/phases/022-cleanup-integration-docs/022-CONTEXT.md (D-C2)
  </read_first>
  <action>
    1. Create `test/integration/migration-consent suite/index.ts` — verbatim adaptation of the migrations-suite version, only the glob changes:
       ```typescript
       import * as vscode from 'vscode';
       import * as sinon from 'sinon';
       import { runner } from "../index.helper";

       // Install the stub BEFORE runner() returns. Activation fires during
       // workspace open (workspaceContains:**/*.feature), BEFORE any test
       // file's suiteSetup. Default behavior: dismiss (return undefined);
       // per-test overrides drive the Migrate & delete / Overwrite & delete
       // paths via stub.callsFake().
       sinon.stub(vscode.window, 'showInformationMessage').callsFake(
         (async (..._args: unknown[]) => undefined) as unknown as typeof vscode.window.showInformationMessage
       );

       export function run(): Promise<void> {
         return runner("**/migration-consent suite/**.test.js");
       }
       ```

    2. Create `test/integration/migration-consent suite/extension.test.ts`:

       Imports + setup helpers mirror the migrations suite:
       ```typescript
       import * as vscode from 'vscode';
       import * as assert from 'assert';
       import * as fs from 'fs';
       import * as path from 'path';
       import * as sinon from 'sinon';
       import { TestSupport } from '../../../src/extension';
       ```

       Helpers: `getMigrationConsentWorkspaceUri()` (find folder by name `migration-consent`), `setupTestSupport()` (activates extension once, sets `integrationTestRun = true`, settles 3s).

       In `suiteSetup`, record paths to `settings.json`, `settings.case-1.json`, `settings.case-2.json`, `settings.case-3.json`. Add a helper `swapSettings(caseName: 'case-1'|'case-2'|'case-3')` that:
         - Reads `settings.case-N.json`, writes it into `settings.json`.
         - Awaits ~500ms for VS Code's config watcher to pick up the change.

       `suiteTeardown`: restore `settings.json` from `settings.case-1.json` (the baseline). Best-effort `try { ... } catch {}`.

       Tests — three scenarios. Each test:
         - Sets the stub behavior (default dismissal vs. specific button return).
         - Calls `swapSettings(caseName)`.
         - Re-drives the consent flow via `await vscode.commands.executeCommand('gs-behave-bdd.recheckMigrations')` (verbatim command ID from package.json:169).
         - Waits 2s for the async cascade to settle.

       **Test 1: Case 1 silent finish.** Stub default (dismiss). `swapSettings('case-1')`. Drive recheck via `await vscode.commands.executeCommand('gs-behave-bdd.recheckMigrations')`. Wait 2s. Assert:
         - **Zero prompts of any kind fired:** `assert.strictEqual(stub.getCalls().length, 0, 'no showInformationMessage calls should fire when both legacy and canonical are unset for every registry entry')`. This discriminates from "some prompt fired and was dismissed by default stub" — a default-dismissal stub returning undefined ALSO produces a passing `.length > 0` check if any prompt fires, so the assertion MUST be `=== 0`.
         - **Every registry entry was Finished:** import the registry (e.g. `import { getRegistry } from '../../../src/migrations/registry';` — verify the exact module + export at execute time) and assert that `completedMigrations` at the WorkspaceFolder scope contains every entry ID:
           ```typescript
           const expectedIds = getRegistry().map(e => e.id);
           const completed = vscode.workspace.getConfiguration('gs-behave-bdd', wkspUri).get<string[]>('completedMigrations') ?? [];
           for (const id of expectedIds) {
             assert.ok(completed.includes(id), `expected ${id} in completedMigrations, got: ${JSON.stringify(completed)}`);
           }
           ```
         - This pair (zero prompts AND full registry coverage) is the only combination that proves "every entry hit case 1 and was silently finished" rather than "some prompt fired but was dismissed."

       **Test 2: Case 2 with Migrate & delete.** Pre-test: clear `completedMigrations` at WorkspaceFolder scope (`await cfg.update('completedMigrations', undefined, vscode.ConfigurationTarget.WorkspaceFolder)`) so previous test state doesn't suppress. Stub returns `'Migrate & delete'` when the prompt args include the literal `'Migrate & delete'` button name. `swapSettings('case-2')`. Drive recheck. Wait 2s. Assert:
         - Final `settings.json` content (read from disk via `JSON.parse(fs.readFileSync(settingsPath, 'utf8'))`) has `'gs-behave-bdd.runParallel' === true` AND the key `'behave-vsc.runParallel'` is absent (`obj.hasOwnProperty('behave-vsc.runParallel') === false`).
         - `vscode.workspace.getConfiguration('gs-behave-bdd', wkspUri).inspect('runParallel')?.workspaceFolderValue === true` (or `workspaceValue` — accept either, since the migration writes at the scope where the legacy lived).
         - The migration ID `runParallel-from-behavevsc` (literal string, resolved from `src/migrations/plain.ts:25`) appears in `completedMigrations`.

       **Test 3: Case 3 with Overwrite & delete.** Pre-test: clear `completedMigrations` at WorkspaceFolder scope. Stub returns `'Overwrite & delete'` when the prompt args include the literal `'Overwrite & delete'`. `swapSettings('case-3')`. Drive recheck. Wait 2s. Assert (split into two unambiguous checks per REQUIREMENTS.md line 30 — CONSENT-03 *Overwrite canonical with legacy, delete legacy*):
         - **(3a) Canonical contains the overwritten value, exactly:** read settings.json and parse:
           ```typescript
           const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
           const paths = parsed['gs-behave-bdd.featuresPaths'];
           assert.ok(Array.isArray(paths), 'featuresPaths should be an array');
           assert.ok(paths.includes('features-alt'), `featuresPaths should include 'features-alt', got: ${JSON.stringify(paths)}`);
           assert.deepStrictEqual(paths, ['features-alt'], `featuresPaths should be exactly ['features-alt'] (clean overwrite per consent.ts:185-204 runOverwriteAtScope passes undefined as destAtSameScope), got: ${JSON.stringify(paths)}`);
           ```
         - **(3b) Legacy key is removed from settings.json (not just left as a JSON key):**
           ```typescript
           assert.strictEqual(parsed.hasOwnProperty('behave-vsc.featuresPath'), false, `legacy key behave-vsc.featuresPath should be removed from settings.json after Overwrite & delete`);
           ```
         - The case-3 prompt fired at least once: `assert.ok(stub.getCalls().some(c => c.args.some(a => typeof a === 'string' && a === 'Overwrite & delete') || c.args.some(a => a === 'Overwrite & delete')), 'case-3 prompt with Overwrite & delete button should have fired')` — adjust the call-arg shape to match `showInformationMessage(message, ...buttons)` where buttons are trailing positional string args.
         - Migration ID `featuresPath-from-behavevsc` (literal string, resolved from `src/migrations/featuresPath.ts:57`) appears in `completedMigrations`.

       Wrap `suite('migration-consent suite', () => { … }).timeout(900000);` mirroring the migrations suite's outer timeout.

       Add a fourth pre-flight sanity test that runs FIRST:

       **Test 0: post-cleanup runtime asserts canonical-only reads.** This pins CLEANUP-01: with `behave-vsc.featuresPath` set in settings.json and `gs-behave-bdd.featuresPaths` unset (i.e. before migration runs — swap a custom seed identical to case-3 *except* with the canonical removed, OR just assert against case-2's runParallel: legacy true, canonical unset → runtime sees the canonical default `false`, NOT the legacy `true`). The cleanest assertion: `instances.config.workspaceSettings[wkspUri.path].runParallel === false` (the default), proving the legacy ladder is gone. Use `instances.config.reloadSettings(wkspUri)` before reading.

       **Important pre-flight:** prior to each test that drives recheck, clear `completedMigrations` at the WorkspaceFolder scope with `await cfg.update('completedMigrations', undefined, vscode.ConfigurationTarget.WorkspaceFolder)` so previous tests' Finished state doesn't suppress the next test's prompt.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `ls "test/integration/migration-consent suite/"` lists `index.ts` and `extension.test.ts`.
    - `grep -c "migration-consent suite" "test/integration/migration-consent suite/index.ts"` returns at least 1.
    - `grep -c "Case 1" "test/integration/migration-consent suite/extension.test.ts"` returns at least 1.
    - `grep -c "Migrate & delete" "test/integration/migration-consent suite/extension.test.ts"` returns at least 1.
    - `grep -c "Overwrite & delete" "test/integration/migration-consent suite/extension.test.ts"` returns at least 1.
    - `grep -c "completedMigrations" "test/integration/migration-consent suite/extension.test.ts"` returns at least 2.
    - `grep -c "stub.getCalls().length" "test/integration/migration-consent suite/extension.test.ts"` returns at least 1 (Test 1's zero-calls discriminator).
    - `grep -c "getRegistry" "test/integration/migration-consent suite/extension.test.ts"` returns at least 1 (Test 1's full-registry-coverage check).
    - `grep -c "deepStrictEqual" "test/integration/migration-consent suite/extension.test.ts"` returns at least 1 (Test 3's exact-array assertion `['features-alt']`).
    - `grep -c "hasOwnProperty" "test/integration/migration-consent suite/extension.test.ts"` returns at least 1 (Test 3's legacy-key-removed check).
    - `grep -c "runParallel-from-behavevsc" "test/integration/migration-consent suite/extension.test.ts"` returns at least 1 (literal migration ID).
    - `grep -c "featuresPath-from-behavevsc" "test/integration/migration-consent suite/extension.test.ts"` returns at least 1 (literal migration ID).
    - `grep -c "gs-behave-bdd.recheckMigrations" "test/integration/migration-consent suite/extension.test.ts"` returns at least 1 (literal command ID).
    - `npx tsc --noEmit` exits 0.
    - `npx eslint src --ext ts` exits 0 (note: integration tests live under test/, not src/, but the test tsconfig should still cover them — verify integration tests compile via the existing test build step `npm run pretest` or equivalent).
  </acceptance_criteria>
  <done>
    The suite compiles, the index.ts mirrors the established pre-activation stub pattern, and three scenario tests + one cleanup-pin test exercise the consent flow against the new fixture. Test 1's assertions discriminate "no prompt fired" from "prompt fired and was dismissed." Test 3's assertions cleanly separate "canonical contains the overwrite value" from "legacy JSON key is removed."
  </done>
</task>

<task type="auto">
  <name>Task 3: Register the new suite in test/integration/runTestSuites.ts</name>
  <files>test/integration/runTestSuites.ts</files>
  <read_first>
    - test/integration/runTestSuites.ts (existing migrations suite registration at ~L204-211 for the exact shape to mirror)
  </read_first>
  <action>
    At the end of `runTestSuites()` in `test/integration/runTestSuites.ts`, immediately after the existing migration-stale `runTests({...})` call (~L204-211) and BEFORE the `console.log("test run complete")` line, add:

    ```typescript
    launchArgs = ["example-projects/migration-consent"];
    extensionTestsPath = getShortPathOnWindows(path.resolve(__dirname, './migration-consent suite'));
    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs
    });
    ```

    Place it directly after the existing migration-stale block so the two migration suites run consecutively.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "migration-consent suite" test/integration/runTestSuites.ts` returns at least one match.
    - `grep -n "example-projects/migration-consent" test/integration/runTestSuites.ts` returns at least one match.
    - `npx tsc --noEmit` exits 0.
    - `npx eslint src --ext ts` exits 0.
  </acceptance_criteria>
  <done>
    `runTestSuites.ts` launches the new suite against the new fixture. Manual smoke (deferred to the user / Phase verification — not part of acceptance for this plan) confirms it runs green in real VS Code.
  </done>
</task>

</tasks>

<verification>
- `ls example-projects/migration-consent/` lists `behave.ini`, `features/`, `.vscode/`.
- `ls "test/integration/migration-consent suite/"` lists `index.ts` and `extension.test.ts`.
- `grep -n "migration-consent suite" test/integration/runTestSuites.ts` matches.
- `npx tsc --noEmit` and `npx eslint src --ext ts` are clean.
- `npm run test:unit` is still green (unchanged from Plan 01's baseline).
- Real-VS-Code integration run (`npm run test:integration`) is deferred to phase verification — it requires the Extension Development Host and is environment-dependent.
</verification>

<success_criteria>
1. A new fixture at `example-projects/migration-consent/` with three per-case settings templates and a minimal behave project structure.
2. A new `migration-consent suite/` with three smoke tests (Case 1, Case 2 Migrate & delete, Case 3 Overwrite & delete) plus a cleanup-pin sanity test.
3. The suite is registered in `runTestSuites.ts` and launches against the new fixture.
4. Project compiles + lints clean; unit tests remain green.
</success_criteria>

<output>
After completion, create `.planning/phases/022-cleanup-integration-docs/022-02-integration-test-SUMMARY.md` covering:
- Migration entry IDs used (the exact strings `runParallel-from-behavevsc` and `featuresPath-from-behavevsc`)
- Exact mechanism used to re-drive the consent flow per test (recheck command `gs-behave-bdd.recheckMigrations`)
- Any local-only run of `npm run test:integration` results (note if deferred to phase verification)
</output>
