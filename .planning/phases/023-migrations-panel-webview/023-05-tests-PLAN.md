---
phase: 023
plan_number: 5
slug: tests
status: planned
depends_on: [1, 2, 3, 4]
files_modified:
  - test/unit/migrations/panel.test.ts
  - test/unit/migrations/consent.test.ts
  - test/unit/migrations.test.ts
  - test/unit/vscode.mock.ts
requirements:
  - TEST-PANEL-LIFECYCLE
  - TEST-PANEL-RENDER
  - TEST-PANEL-MESSAGES
  - TEST-PANEL-MIGRATION-MODE
  - TEST-PANEL-EMPTY-STATE
  - TEST-RECHECK-REGRESSION
must_haves:
  truths:
    - "Unit suite covers `MigrationsPanel.createOrShow` singleton (first call creates, second call reveals)."
    - "Unit suite covers panel HTML — contains CSP meta with nonce, expected button data attrs per row, Migration Mode section with `aria-pressed` on current mode."
    - "Unit suite covers message handler routing: `dispatchAction` → `dispatchMigrationAction`, `recheck` → recheckMigrations command, `setMigrationMode` → `cfg.update(..., ConfigurationTarget.Global)`, invalid payloads dropped + logged."
    - "Unit suite covers dispose path (`currentPanel` nulled first, disposables drained)."
    - "Unit suite covers `onDidChangeConfiguration('gs-behave-bdd')` triggering `stateUpdate` postMessage."
    - "Unit suite covers empty-state rendering with a Recheck button."
    - "`consent.test.ts` asserts the single `Open Migrations Panel` toast button and that clicking it invokes `gs-behave-bdd.openMigrationsPanel` — no `summarizeDiagnostics` or `Open Problems` / `Open Settings` assertions remain."
    - "`migrations.test.ts` test 4.10 asserts the panel-open signal (showInformationMessage offered `Open Migrations Panel`, and selecting it executes the command), not diagnostic publishing."
    - "Full `npm run test:unit` is green."
  artifacts:
    - path: "test/unit/migrations/panel.test.ts"
      provides: "All Panel-01..Panel-05 unit coverage from 023-RESEARCH"
    - path: "test/unit/migrations/consent.test.ts"
      provides: "Updated toast-button assertions"
    - path: "test/unit/migrations.test.ts"
      provides: "Reshaped test 4.10"
    - path: "test/unit/vscode.mock.ts"
      provides: "Webview mock surface (finalized) + diagnostic-collection mock removed if unused"
  key_links:
    - from: "panel.test.ts"
      to: "MigrationsPanel"
      via: "import + stubbed dispatchMigrationAction"
      pattern: "import.*MigrationsPanel"
---

## Goal

Bring the unit suite back to green and add coverage for everything 023-01..04
introduced. Five new test areas in `panel.test.ts`; reshape `consent.test.ts`
toast assertions and `migrations.test.ts` test 4.10 to expect the panel-open
signal instead of diagnostic publishing; audit `vscode.mock.ts` for now-dead
mock surface.

## Why this plan exists

023-04 deliberately left two test files broken to keep the deletion diff
mechanical. This plan rebuilds them around the new surface and lands the
Panel-tier coverage that 023-RESEARCH §Validation Architecture identified as
Wave 0 gaps.

## Predicted test count trajectory (estimates; pin the direction)

Baseline at phase start: **855 unit tests passing.**

| After plan | Predicted count | Delta | Notes |
|---|---|---|---|
| 023-01 | ~865 | +10 | panel-lifecycle scaffold tests (added inline with mock); existing suite untouched. |
| 023-02 | ~870 | +5 | view-model shape tests; no panel.test.ts yet. |
| 023-03 | ~873 | +3 | Migration Mode read/write tests. |
| 023-04 | ~840 | -33 | **Knowingly broken state.** diagnostics.test.ts deleted (~30 tests); `consent.test.ts` toast tests + `migrations.test.ts` 4.10 fail (~3 tests). This is the handoff to 023-05. |
| 023-05 | ~870 | +30 | Full `panel.test.ts` (lifecycle / HTML / messages / dispose / config / empty state); reshape consent + 4.10. Net positive vs. baseline. |

Exact counts are estimates — the **direction** is the contract:
- Plans 01-03 add tests.
- Plan 04 deletes/breaks ~33 tests (intentional handoff).
- Plan 05 ends with the suite green and >baseline total.

## Tasks

### Task 1 — `vscode.mock.ts`: finalize the Webview mock; audit dead mock surface

Build on the minimal mock from 023-01 Task 4:

- Make `createWebviewPanel` return a mock whose `webview.postMessage` records
  every call into a module-level array `_postedMessages` (cleared between
  tests via a `_resetWebviewMock()` export).
- Capture every `onDidReceiveMessage` callback into `_messageHandlers` and
  every `onDidDispose` callback into `_disposeHandlers` so tests can fire them
  via the existing `_fireWebviewMessage(msg)` / `_disposeWebview()` helpers.
- Stub `webview.cspSource` as the literal string `'vscode-webview://mock'`.
- Stub `asWebviewUri(u)` to return `u` unchanged.

Audit `vscode.mock.ts` for now-dead mock surface from the deleted diagnostics
code (e.g., any `DiagnosticCollection` factory, `MIGRATION_DIAG_SOURCE`-aware
fixtures). If a search confirms no remaining test references them, delete the
mock surface. If `consent.test.ts` legacy helpers still reference them via
`summarizeDiagnostics`, the cleanup happens in Task 3.

### Task 2 — `test/unit/migrations/panel.test.ts`: new test file

Create `test/unit/migrations/panel.test.ts` with five `describe` blocks
matching the requirement IDs:

**2.1 — `createOrShow` singleton (Panel-01)**

- First call: assert `vscode.window.createWebviewPanel` was called once with
  `viewType === 'gs-behave-bdd.migrationsPanel'`.
- Second call without dispose: assert `createWebviewPanel` was NOT called
  again, and the mock panel's `reveal` was called.
- After `_disposeWebview()`: third call creates a new panel.

**2.2 — HTML rendering pins (Panel-02)**

- Capture the HTML assigned via `webview.html = …`. Assert it contains:
  - `<meta http-equiv="Content-Security-Policy"` with a `nonce-[A-Za-z0-9]{32}`.
  - A `<style nonce="…">` block with the same nonce.
  - A `<script nonce="…">` block with the same nonce.
  - The phrase `Migration Mode` and one `data-mode="prompt"` /
    `data-mode="migrate-and-delete"` / `data-mode="migrate-and-keep"` /
    `data-mode="skip"` button each.
- Pin a regression: assert NO occurrence of the literal `'Open Problems'` or
  `'Open Settings'` in the HTML.

**2.3 — Message routing (Panel-03)**

Stub `dispatchMigrationAction` and `vscode.commands.executeCommand` via Sinon.

> **Message-protocol direction (clarifier for future maintainers):** the
> extension→webview direction uses `{ kind: 'stateUpdate', viewModel }`.
> 023-RESEARCH.md contains a stale example showing `kind: 'setState'` — that
> example is wrong; the production protocol (per 023-02 Task 2 `_refresh()`)
> is `'stateUpdate'`. Tests must assert against `'stateUpdate'`. The
> webview→extension direction uses `{ kind: 'requestState' | 'dispatchAction'
> | 'recheck' | 'setMigrationMode' }`.

- Fire `{ kind: 'dispatchAction', args: validArgs }` via
  `_fireWebviewMessage`. After awaiting a `setImmediate` yield, assert
  `dispatchMigrationAction` was called with `validArgs` AND `webview.postMessage`
  was subsequently called with a `{ kind: 'stateUpdate', viewModel: … }`
  payload (the refresh).
- Fire `{ kind: 'dispatchAction', args: { entryId: 'not-in-registry', ... } }`.
  Assert `dispatchMigrationAction` was NOT called and a log line was emitted
  via `config.logger`.
- Fire `{ kind: 'recheck' }`. Assert
  `vscode.commands.executeCommand('gs-behave-bdd.recheckMigrations')` was
  invoked.
- Fire `{ kind: 'setMigrationMode', value: 'migrate-and-keep' }`. Assert
  `cfg.update` was called with `('migrationMode', 'migrate-and-keep',
  vscode.ConfigurationTarget.Global)`.
- Fire `{ kind: 'setMigrationMode', value: 'BOGUS' }`. Assert no `cfg.update`
  call.

**2.4 — Dispose path (Panel-04)**

- Open panel, then invoke the captured `onDidDispose` callback via
  `_disposeWebview()`. Assert:
  - `MigrationsPanel.currentPanel === undefined` (set FIRST per Pitfall 5).
  - Every disposable pushed during construction had `.dispose()` called.
  - Subsequent `_fireWebviewMessage` is a no-op (handler ref dropped).

**2.5 — Configuration-change re-render (Panel-05)**

- Capture the `onDidChangeConfiguration` callback registered during
  construction.
- Fire it with `{ affectsConfiguration: (s) => s === 'gs-behave-bdd' }`.
- Await `setImmediate`. Assert `webview.postMessage` was called with a
  `stateUpdate` payload.
- Fire it with `{ affectsConfiguration: () => false }`. Assert no additional
  `postMessage`.

Pattern reference: use the same Sinon spy/stub + `setImmediate` yield idiom
from `consent.test.ts:340-360` (per 023-PATTERNS §panel.test.ts analog).

### Task 3 — `consent.test.ts`: reshape toast assertions

**Pre-execution audit (run before editing):** confirm the exact call sites of
`summarizeDiagnostics` to delete. The plan-checker estimated ~7; the verified
count at planning time is **8 call sites** plus the function declaration:

```
test/unit/migrations/consent.test.ts:109  function summarizeDiagnostics(): DiagSummary {   ← declaration
test/unit/migrations/consent.test.ts:148  assert.strictEqual(summarizeDiagnostics().total, 0);
test/unit/migrations/consent.test.ts:166  const summary = summarizeDiagnostics();
test/unit/migrations/consent.test.ts:191  const summary = summarizeDiagnostics();
test/unit/migrations/consent.test.ts:209  assert.strictEqual(summarizeDiagnostics().total, 2);
test/unit/migrations/consent.test.ts:226  const summary = summarizeDiagnostics();
test/unit/migrations/consent.test.ts:278  assert.strictEqual(summarizeDiagnostics().total, 0);
test/unit/migrations/consent.test.ts:304  assert.strictEqual(summarizeDiagnostics().total, 0);
test/unit/migrations/consent.test.ts:320  assert.strictEqual(summarizeDiagnostics().total, 0);
```

Re-grep before editing in case the file has shifted:

```
Grep tool: pattern `summarizeDiagnostics`, path `test/unit`, output_mode `content`
```

Expect to delete the declaration (line 109) and 8 call sites (lines 148, 166,
191, 209, 226, 278, 304, 320). If the count differs at execution time,
re-audit before deleting.

Modify `test/unit/migrations/consent.test.ts`:

- Delete the `summarizeDiagnostics()` helper (line 109) and every assertion
  that calls it (8 call sites — see audit above).
- Delete the test `'Open Problems' button executes workbench.actions.view.problems`
  (line 342).
- Delete the two `'Open Settings'` tests (lines 362, 387).
- Add a replacement test:
  ```
  test("summary toast offers single 'Open Migrations Panel' button", async () => {
    // arrange: build a case-2 hit, stub showInformationMessage
    // act: await runConsentFlow(...)
    // assert: showStub was called with exactly one button arg, 'Open Migrations Panel'
  });

  test("'Open Migrations Panel' button executes gs-behave-bdd.openMigrationsPanel", async () => {
    showStub.resolves('Open Migrations Panel');
    await runConsentFlow(...);
    await new Promise(resolve => setImmediate(resolve));
    const call = execStub.getCalls().find(c => c.args[0] === 'gs-behave-bdd.openMigrationsPanel');
    assert.ok(call, 'expected openMigrationsPanel command to fire');
  });
  ```
- Update any other tests in the file that asserted on diagnostic-collection
  state (e.g., the `lines 148, 209, 226, 278, 304, 320` group from the audit).
  Replace with: "after dispatch, no diagnostic collection is touched"
  assertions OR delete if the test's purpose was specifically about the
  diagnostic surface.

Keep: all silent-mode tests (case-2 mode dispatch), all per-scope-failure
recovery tests, all dismissal tests — those don't touch the diagnostic surface.

### Task 4 — `migrations.test.ts` test 4.10: reshape

Modify `test/unit/migrations.test.ts` line 638:

Rename to: `'4.10: post-clear — case-2 legacy key surfaces summary toast that
opens the Migrations Panel (regression)'`.

Replace assertions:

- OLD: assert the diagnostic collection contained the expected (uri, message,
  code) entry.
- NEW:
  - Capture `showInformationMessage` calls; assert it was called once with
    `'Open Migrations Panel'` as the only button.
  - Stub `showInformationMessage` to resolve `'Open Migrations Panel'`.
  - After yielding via `setImmediate`, assert `vscode.commands.executeCommand`
    was invoked with `'gs-behave-bdd.openMigrationsPanel'`.

Pattern reference: 260513-o1k quick-task ("recheck-consent-flow") established
this test as the regression gate for the recheck → consent → user-prompt
chain. The same chain still applies; only the user-facing surface changes.

### Task 5 — Run the full suite + ESLint

```bash
npx eslint src --ext ts
npm run compile
npm run test:unit
```

All three must be clean. If `npm run test:unit` reveals stragglers (e.g., a
test in `consent.test.ts` that imports a now-deleted helper), fix in place —
this plan is the green-restoration gate for the phase.

## Verification

In addition to Task 5's commands, sample-run the previously-broken tests in
isolation to confirm:

```bash
npm run test:unit -- --grep "MigrationsPanel"
npm run test:unit -- --grep "summary toast"
npm run test:unit -- --grep "4.10"
```

Integration suite (smoke; CONTEXT.md asserts it's surface-agnostic):

```bash
npm run test:integration
```

If anything in the integration suite imports a deleted symbol (e.g., legacy
import of `MIGRATION_DIAG_SOURCE`), fix the import — but per CONTEXT.md and
023-PATTERNS, the suite drives through `dispatchMigrationAction` so no real
behavioral change is expected.

## Test coverage summary

| Req | Where | New / Updated |
|---|---|---|
| TEST-PANEL-LIFECYCLE | `panel.test.ts` §2.1 | new |
| TEST-PANEL-RENDER | `panel.test.ts` §2.2 | new |
| TEST-PANEL-MESSAGES | `panel.test.ts` §2.3 | new |
| TEST-PANEL-DISPOSE | `panel.test.ts` §2.4 | new |
| TEST-PANEL-CONFIG-RERENDER | `panel.test.ts` §2.5 | new |
| TEST-PANEL-MIGRATION-MODE | `panel.test.ts` §2.3 (setMigrationMode subcase) | new |
| TEST-PANEL-EMPTY-STATE | `panel.test.ts` §2.2 (empty-state HTML pin) | new — add a sixth describe block if §2.2 grows too big |
| TEST-RECHECK-REGRESSION | `migrations.test.ts` test 4.10 | updated |
| TEST-TOAST-BUTTON | `consent.test.ts` new tests | updated |

## Non-goals (this plan)

- New integration tests (the existing suite is surface-agnostic per CONTEXT.md
  Test inventory).
- DOM-level testing of the webview's rendered HTML. Assertions are
  string-match on the HTML output; no JSDOM, no headless Chromium.
- Coverage of `panelViewModel.buildViewModel`'s evaluator integration beyond
  what `panel.test.ts §2.2 / §2.5` indirectly exercise — add a small
  `panelViewModel.test.ts` only if a Task-5 run reveals an integration gap.
- Performance benchmarking, theme regression tests, localization tests.

## Risks

- **Test order coupling via `MigrationsPanel.currentPanel` singleton.** Static
  state survives across tests. Mitigation: a `beforeEach` that calls
  `(MigrationsPanel as any).currentPanel = undefined` and resets the mock
  capture arrays. Document in the file header.
- **`setImmediate` yield insufficient for nested `await` chains.** If a test
  flakes because `_refresh()` posts AFTER assertions run, switch to `await
  new Promise(r => setTimeout(r, 0))` or capture the `postMessage` promise
  directly. Mirror the consent-test idiom.
- **Integration suite latent import of a deleted symbol.** Unlikely per
  CONTEXT.md but possible. The 023-04 grep gate covers `src/`; rerun against
  `test/integration/` as part of Task 5 verification.
