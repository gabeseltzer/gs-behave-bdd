# Phase 17: Cross-Cutting Verification — Research

**Date:** 2026-04-30
**Phase:** 17-cross-cutting-verification
**Goal:** End-to-end regression pass across both migrations (Phase 15 + Phase 16)
**Phase requirement IDs:** Verification of DEP-* and NOTIF-* (no new REQ-IDs introduced)

This research answers: **what does the planner need to know to plan Phase 17 well?**
Per CONTEXT.md, Phase 17 ships **no new product code** — all work is integration tests
under `test/integration/` plus a new fixture under `example-projects/`. The research
below targets the seven concrete planning questions raised in CONTEXT.md (D-01..D-09 +
"Discretion" items) and grounds each answer in code patterns already present in the
repo.

---

## 1. Standard Stack (already in repo)

The planner does NOT need to evaluate libraries — every dependency required by
Phase 17 is already in use by the existing 18 integration suites:

| Layer                  | Library / API                                                    | Status   | Reference in repo                                               |
|------------------------|------------------------------------------------------------------|----------|------------------------------------------------------------------|
| Test runner            | Mocha (TDD UI, `bail: true`)                                     | in use   | [test/integration/index.helper.ts](test/integration/index.helper.ts) |
| Dev Host launcher      | `@vscode/test-electron` (`runTests`, `downloadAndUnzipVSCode`)   | in use   | [test/integration/runTestSuites.ts](test/integration/runTestSuites.ts) |
| Stubbing               | `sinon` (stubs + `sinon.restore()` in teardown)                  | in use   | [test/integration/watcher-integration suite/runGuard.test.ts](test/integration/watcher-integration%20suite/runGuard.test.ts#L5) |
| Assertions             | Node `assert` (strict)                                           | in use   | every existing `*.test.ts`                                      |
| Config inspection      | `vscode.workspace.getConfiguration().inspect<T>(key)`            | in use   | [src/notifications.ts](src/notifications.ts#L37) and the migration loop |
| Config mutation        | `vscode.workspace.getConfiguration().update(key, value, target)` | in use   | [test/integration/monorepo-scan suite/extension.test.ts](test/integration/monorepo-scan%20suite/extension.test.ts#L40) |
| File snapshot/restore  | Node `fs.readFileSync` / `fs.writeFileSync`                      | in use   | [test/integration/watcher-integration suite/runGuard.test.ts](test/integration/watcher-integration%20suite/runGuard.test.ts#L75) |
| Fixture loading        | Pre-committed `example-projects/<name>/.vscode/settings.json`    | in use   | 11 existing fixtures, e.g. [example-projects/multi-path-settings/.vscode/settings.json](example-projects/multi-path-settings/.vscode/settings.json) |

**Don't hand-roll:**
- ❌ Custom Dev Host launcher → use the same `runTests({ vscodeExecutablePath, extensionDevelopmentPath, extensionTestsPath, launchArgs })` block as every other suite in `runTestSuites.ts`.
- ❌ Custom stub framework or notification mock → `sinon.stub(vscode.window, 'showInformationMessage').resolves(<button-label>)` is already the pattern (see §5).
- ❌ Custom test-fixture lifecycle library → snapshot-in-setup / write-back-in-teardown using `fs` is already the pattern (§4).
- ❌ Programmatic settings.json seeding per test → CONTEXT.md D-08 explicitly chooses pre-committed fixture; matches all 11 existing fixtures.

---

## 2. Architecture Patterns (already established)

### 2.1 Integration suite structure (from existing suites)

Every existing integration suite follows the same shape — Phase 17's
`migrations.test.ts` (or `migrations suite/extension.test.ts`) MUST follow it too:

```text
test/integration/<name> suite/
├── index.ts                  # Mocha entry; calls runner('**/<name> suite/**.test.js')
└── extension.test.ts         # suite('<name>', () => { suiteSetup, setup, test, teardown })
```

The `index.ts` is a 4-line file (template from
[test/integration/multi-path suite/index.ts](test/integration/multi-path%20suite/index.ts)):

```ts
import { runner } from "../index.helper";
export function run(): Promise<void> {
  return runner("**/migrations suite/**.test.js");
}
```

The suite file follows the pattern from
[test/integration/watcher-integration suite/runGuard.test.ts](test/integration/watcher-integration%20suite/runGuard.test.ts#L51-L120):

1. `suiteSetup(async function () { this.timeout(60000); … })` — activate extension once.
2. `setup(() => { … snapshot fixture, install stubs … })`
3. `test('…', async function () { this.timeout(300000); … })`
4. `teardown(() => { sinon.restore(); … restore fixture … })`

### 2.2 Extension activation handle

All existing suites get the activated `TestSupport` instance via:

```ts
const extension = vscode.extensions.getExtension('gabeseltzer.gs-behave-bdd');
assert.ok(extension);
assert.ok(extension.isActive);
const instances = await extension.activate() as TestSupport;
instances.config.integrationTestRun = true;
await new Promise(t => setTimeout(t, 3000));   // settle activation work
```

Pattern source: [test/integration/monorepo-scan suite/extension.test.ts](test/integration/monorepo-scan%20suite/extension.test.ts#L17-L26).

**Implication for Phase 17:** the migration loop runs during `activate()` — by the
time `await extension.activate()` resolves, both `migrateLegacyFeaturesPath` and
`migrateLegacySuppressMultiConfig` have already executed for every workspace
folder (per [src/extension.ts L295-L320](src/extension.ts#L295)). Tests assert the
**post-activation state** of `.vscode/settings.json` and the runtime
`inspect()` API. There is no API to "trigger migration on demand" — the test
pattern is: launch Dev Host → activate → inspect outcome.

### 2.3 Per-suite Dev Host launch (D-05 single-fixture choice)

Each `runTests({ launchArgs: [<fixture-path>], extensionTestsPath: <suite-dir> })`
call in `runTestSuites.ts` spawns a fresh Dev Host process. This matters because:

- The migration loop is **idempotent at the data-shape level** (D-08: empty source
  → still removes the source key) but **not re-runnable in the same Dev Host**:
  once the source key is removed, the next activation has nothing to migrate.
- D-05's single-fixture decision relies on `before/it` blocks **inside the same
  Dev Host launch** — the activation happens ONCE per `runTests()` call, so all
  assertions about the Phase 15 + Phase 16 + D-18 ordering outcomes share the
  same activation pass.
- Multiple `it()` blocks asserting different aspects of the same post-activation
  state is the established pattern (see [test/integration/monorepo-scan suite/extension.test.ts](test/integration/monorepo-scan%20suite/extension.test.ts) — 4 tests share one activation).

### 2.4 Migration code reads — what tests actually verify

The migration logic black-box-verified by Phase 17 is at:

- [src/extension.ts L295-L320](src/extension.ts#L295) — the per-workspace activation loop.
  Order: `migrateLegacyFeaturesPath(wkspUri)` → `migrateLegacySuppressMultiConfig(wkspUri)` → `config.reloadSettings(wkspUri)` → push to `pendingFeaturesPathNotifs` if migrated.
- [src/notifications.ts L174-L195](src/notifications.ts#L174) — `migrateLegacySuppressMultiConfig`.
- [src/notifications.ts L232-L266](src/notifications.ts#L232) — `migrateLegacyFeaturesPath` (loops over both namespaces `gs-behave-bdd` + `behave-vsc`).
- [src/notifications.ts L100-L160](src/notifications.ts#L100) — `migrateScopedSetting` primitive (most-specific-scope detection via `inspect()`).
- [src/extension.ts L320-L340](src/extension.ts#L320) — fire-and-forget notification with "Open Settings" button + DSA via `showSuppressibleNotification`.

Tests **do not import** these helpers directly — D-05 calls for activation-driven
black-box verification. Tests import:

- `vscode` (for `getConfiguration`, `inspect`, `update`, `window.showInformationMessage` stub).
- `sinon` (for stubbing the notification UI).
- `assert` (Node strict).
- `fs`, `path` (for fixture snapshot/restore).
- Optionally `TestSupport` from `../../../src/extension` if the spy on
  `config.logger.logInfo` is used to verify D-18 ordering (see §6).

---

## 3. New Fixture: `example-projects/<migration-stale>/`

The planner picks the exact directory name. This research recommends
**`example-projects/migration-stale/`** because:
- Matches the existing kebab-case convention (`multi-path`, `multi-path-settings`, `monorepo-scan`, `pyproject-config`, `malformed-config`, `multiroot bad features path`).
- Names the *condition* the fixture seeds, mirroring `malformed-config` (which seeds a malformed pyproject.toml).
- Short — fits without `"…"` quoting in `runTestSuites.ts` `launchArgs` (compare to `"example-projects/nested project"`).

### 3.1 Required fixture contents

Minimum for activation to enter the migration loop and for D-04..D-07 of Phase 16
(both namespaces, multi-scope independence, dedup) to be exercised:

```text
example-projects/migration-stale/
├── .vscode/
│   └── settings.json         # pre-seeded with stale keys at varying scopes
├── features/
│   └── example.feature       # minimal Gherkin so getUrisOfWkspFoldersWithFeatures() returns this folder
├── steps/
│   └── steps.py              # minimal step impl so feature parses (or omit if not asserted)
└── behave.ini OR pyproject.toml   # minimal so config-file discovery completes
```

**Why `features/` is mandatory:** the migration loop iterates
`getUrisOfWkspFoldersWithFeatures()` ([src/extension.ts L306](src/extension.ts#L306)).
A workspace with no detectable features is skipped — the migrations never run and
the test asserts nothing.

### 3.2 Seeding for D-05 + D-07 + D-09 + D-18 coverage in one fixture

CONTEXT.md §Specifics requires the fixture to seed:

| Key                                                   | Scope                       | Purpose                                                          |
|-------------------------------------------------------|-----------------------------|------------------------------------------------------------------|
| `gs-behave-bdd.featuresPath`                          | WorkspaceFolder OR Workspace | Phase 16 D-02 in the canonical namespace; D-18 ordering (runs first) |
| `behave-vsc.featuresPath`                             | a different scope           | Phase 16 D-02 cross-namespace; D-04 scope independence          |
| `gs-behave-bdd.suppressMultiConfigNotification: true` | a third scope (or overlapping) | Phase 15 migration; D-18 step 2 (UX cleanup)                  |

**Important constraint on `.vscode/settings.json`:** a single-folder fixture (the
shape of all existing `example-projects/<name>/`) writes to
**WorkspaceFolder scope** when the file lives at `<folder>/.vscode/settings.json`.
A multi-root `.code-workspace` file writes to **Workspace scope**. Since Phase 17
needs to exercise multi-scope behavior in **one** fixture, the planner has two
viable shapes:

**Option A — single-folder fixture, all three keys at WorkspaceFolder scope.**
- Trivial setup — one `.vscode/settings.json` with three keys.
- Verifies: Phase 15 migration + Phase 16 migration (both namespaces) + D-18 ordering + D-04 (cross-namespace).
- Does NOT verify cross-scope independence (D-04 scope axis) — but Phase 16 D-04 has both axes (cross-namespace AND cross-scope); the cross-namespace axis IS exercised here, and the cross-scope axis is already covered by Phase 16 unit tests.
- **Recommendation:** ship Option A.

**Option B — `.code-workspace` multi-root fixture mixing WorkspaceFolder + Workspace + Global scopes.**
- More faithful to D-09 ("varying scopes") but Global scope is not writable from a
  pre-committed fixture — it lives in the user's `~/.config/Code/User/settings.json`,
  not the workspace. Tests would need to write Global at `setup()` and clear at
  `teardown()` — additional cross-process state risk.
- The repo's existing multi-root fixture is `example-projects/multiroot.code-workspace`
  (referenced from `runTestSuites.ts` L104) — it's a single `.code-workspace` file
  that wraps multiple folders. Phase 17 could use a similar shape if Workspace +
  WorkspaceFolder coverage is desired.
- **Trade-off:** more complexity, higher flake risk, marginal coverage gain over
  what unit tests already prove. Recommend deferring unless the planner finds a
  specific gap.

**Planner decision required:** Option A vs Option B. This research recommends
Option A; if the planner picks B, the fixture lives at
`example-projects/migration-stale.code-workspace` + child folder(s).

### 3.3 Example seed file (Option A)

```jsonc
// example-projects/migration-stale/.vscode/settings.json
{
  "gs-behave-bdd.featuresPath": "features",
  "behave-vsc.featuresPath": "features-alt",
  "gs-behave-bdd.suppressMultiConfigNotification": true
}
```

After activation, the post-state should be (asserted by both file content AND
`inspect()` per D-09):

```jsonc
{
  "gs-behave-bdd.featuresPaths": ["features", "features-alt"],
  "gs-behave-bdd.suppressedNotifications": ["multiConfigNotification"]
}
```

Note — the migration writes to the **same scope** as the source key, and Phase 16
D-07 dedups normalized entries. Both `features` and `features-alt` survive because
`normalizePathEntry("features") !== normalizePathEntry("features-alt")`.

### 3.4 Fixture reset mechanism (closes D-08)

The repo already has the answer — see
[test/integration/watcher-integration suite/runGuard.test.ts L74-L107](test/integration/watcher-integration%20suite/runGuard.test.ts#L74):

```ts
let settingsSnapshot: string | undefined;

setup(() => {
  settingsSnapshot = fs.readFileSync(settingsPath, 'utf8');
  // ... mutate fixture for this test if needed ...
});

teardown(() => {
  try {
    if (settingsSnapshot !== undefined) {
      fs.writeFileSync(settingsPath, settingsSnapshot, 'utf8');
    }
  } catch { /* best-effort */ }
  settingsSnapshot = undefined;
});
```

**For Phase 17 specifically:** the migration loop runs once per Dev Host launch
during `activate()` and mutates the fixture's `.vscode/settings.json`. Snapshot
once at `suiteSetup` time and restore once at `suiteTeardown` time:

```ts
let settingsSnapshot: string;
const settingsPath = path.join(wkspUri.fsPath, '.vscode', 'settings.json');

suiteSetup(async function () {
  this.timeout(60000);
  // Snapshot BEFORE we await activate() — the activation already ran when
  // extensions.getExtension(...).isActive became true, but the file on disk
  // reflects the post-migration state. The pre-migration baseline lives in git.
  // So instead: read the baseline from git via `git show :./settings.json`,
  // OR keep a sibling .template file, OR snapshot from a checked-in copy.
  settingsSnapshot = fs.readFileSync(settingsTemplatePath, 'utf8');
  await setupTestSupport();
});

suiteTeardown(() => {
  fs.writeFileSync(settingsPath, settingsSnapshot, 'utf8');
});
```

**Key gotcha:** activation runs **before** `suiteSetup` in `@vscode/test-electron`
because the Dev Host process loads the extension when the workspace opens, which
happens before the test runner starts. So `setup()` cannot snapshot the baseline
"as committed" — by the time it runs, the file already reflects the post-migration
state.

**Three viable mechanisms — planner picks one:**

1. **Sibling `.template.json` file (RECOMMENDED).** Commit
   `.vscode/settings.template.json` containing the pre-migration baseline.
   `suiteTeardown` copies it back over `.vscode/settings.json`. Pros: deterministic,
   no shell calls, works on Windows + macOS + Linux + CI. Cons: one extra
   committed file. Matches the discoverability of the current convention (every
   fixture has a single committed baseline).

2. **`git checkout -- .vscode/settings.json` in `suiteTeardown`.** Pros: zero extra
   files. Cons: requires `git` on PATH (true in CI but a soft dependency); fails
   if user's tree has unrelated staged changes to the file; cross-platform shell
   spawning has edge cases (Windows path quoting). **Not recommended.**

3. **In-memory snapshot read AT BUILD TIME** (`compile-tests` step copies the
   committed baseline into a `.snapshot` constant in the compiled test JS). Adds
   webpack/tsc complexity. **Not recommended.**

**Recommendation:** Option 1 (`.template.json` sibling file). Single new file,
zero shell calls, matches the "committed-baseline-fixture" mental model.

---

## 4. Fixture snapshot/restore pattern (full example)

```ts
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

function getMigrationStaleWorkspaceUri(): vscode.Uri {
  const folders = vscode.workspace.workspaceFolders;
  assert.ok(folders, 'workspace folders should exist');
  const f = folders.find(x => x.uri.path.includes('migration-stale'));
  assert.ok(f, 'migration-stale workspace folder should exist');
  return f.uri;
}

suite('migrations suite', () => {
  let wkspUri: vscode.Uri;
  let settingsPath: string;
  let templatePath: string;

  suiteSetup(async function () {
    this.timeout(60000);
    await setupTestSupport();                          // §2.2 pattern
    wkspUri = getMigrationStaleWorkspaceUri();
    settingsPath = path.join(wkspUri.fsPath, '.vscode', 'settings.json');
    templatePath = path.join(wkspUri.fsPath, '.vscode', 'settings.template.json');
  });

  suiteTeardown(() => {
    // Restore the pre-migration baseline so subsequent test runs (and CI working
    // tree) start from a known-stale state.
    try {
      const baseline = fs.readFileSync(templatePath, 'utf8');
      fs.writeFileSync(settingsPath, baseline, 'utf8');
    } catch { /* best-effort — never mask test failures */ }
  });

  // ... tests ...
});
```

---

## 5. Notification UI testing (closes the largest open question in CONTEXT.md)

CONTEXT.md §Specifics flags this as an unresolved area:

> The DSA-click flow requires invoking `vscode.window.showInformationMessage` and
> simulating a button click. The repo's existing integration tests don't currently
> exercise notification UI; the planner will need to research how
> `@vscode/test-electron` handles notification interaction (likely via stubbing
> `vscode.window.showInformationMessage` from within the activated extension's test
> entry-point, or via the Electron-level UI driver).

**The repo DOES already exercise this.** See
[test/integration/watcher-integration suite/runGuard.test.ts L85-L86](test/integration/watcher-integration%20suite/runGuard.test.ts#L85):

```ts
showWarningMessageStub = sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);
executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves(undefined);
```

The stub runs **inside the Dev Host process** (the test file is loaded into the
extension host via `extensionTestsPath`, so it shares the `vscode` module instance
with the activated extension). Stubs installed on `vscode.window.<method>` are
visible to the extension code that calls them.

### 5.1 The challenge specific to Phase 17

The Phase 16 migration notification fires from the activation loop — see
[src/extension.ts L322-L338](src/extension.ts#L322):

```ts
for (const wkspUri of pendingFeaturesPathNotifs) {
  showSuppressibleNotification(
    "featuresPathMigration",
    "Migrated `featuresPath` → `featuresPaths`. ...",
    ["Open Settings"],
    wkspUri,
  ).then(action => {
    if (action === "Open Settings") {
      vscode.commands.executeCommand("workbench.action.openSettings", "@ext:gabeseltzer.gs-behave-bdd");
    }
  });
}
```

`showSuppressibleNotification` internally calls
`vscode.window.showInformationMessage` ([src/notifications.ts L65](src/notifications.ts#L65)).

**Activation runs BEFORE the test runner starts.** By the time `suiteSetup` runs,
`showInformationMessage` has already been called with the un-stubbed real VS Code
implementation — which displays the notification but never resolves it (no human
clicks). The fire-and-forget `.then(action => …)` chain hangs.

**This means the stub-after-activation pattern WILL NOT WORK for asserting the
notification fires on the migration activation.**

### 5.2 Two viable patterns — planner picks one

#### Pattern 5.2.A — Stub at module load time via `extensionTestsPath` entry

The `index.ts` referenced by `extensionTestsPath` runs **before** the Mocha test
files load. If the stub is installed there, it's already in place when the
extension activates.

```ts
// test/integration/migrations suite/index.ts
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { runner } from "../index.helper";

export function run(): Promise<void> {
  // Install the stub before any test file loads. The activated extension will
  // call this stub instead of the real notification UI.
  // We can't import sinon-restore-on-shutdown — the stub lives for the entire
  // Dev Host process lifetime (which is one suite run). This is acceptable
  // because the migrations suite is the only consumer of this Dev Host launch.
  sinon.stub(vscode.window, 'showInformationMessage').callsFake(
    async (_msg: string, ..._items: string[]) => {
      // Default behavior: dismiss (returns undefined). Specific tests can
      // re-stub to simulate button clicks (see Pattern 5.2.B for that).
      return undefined;
    }
  );
  return runner("**/migrations suite/**.test.js");
}
```

Caveat: once the stub fires during activation, it has consumed the call. To assert
what arguments the activation passed, **the stub must record the call** — sinon
stubs do this automatically (`stub.firstCall.args`). The test then asserts:

```ts
test('migration notification fires for migrated workspace', () => {
  const stub = vscode.window.showInformationMessage as unknown as sinon.SinonStub;
  const calls = stub.getCalls();
  const migrationCall = calls.find(c => String(c.args[0]).includes('Migrated `featuresPath`'));
  assert.ok(migrationCall, 'expected migration notification to be shown during activation');
  assert.ok(migrationCall.args.includes("Open Settings"), 'expected "Open Settings" button');
  assert.ok(migrationCall.args.includes("Don't Show Again"), 'expected DSA button (added by showSuppressibleNotification)');
});
```

**Risk:** the stub catches **every** `showInformationMessage` call during
activation — including the existing Phase 15 multi-config notification path
(extension.ts L165-L177) if the fixture also triggers that. Tests must filter by
message content (as above).

#### Pattern 5.2.B — Simulate DSA click + assert post-state

To verify the DSA flow end-to-end, the stub for the DSA-click test re-routes the
return value:

```ts
test('clicking "Don\'t Show Again" suppresses migration notification', async () => {
  const stub = vscode.window.showInformationMessage as unknown as sinon.SinonStub;
  // Re-stub to return DSA when called with the migration message.
  stub.callsFake(async (msg: string, ...items: string[]) => {
    if (msg.includes('Migrated `featuresPath`') && items.includes("Don't Show Again")) {
      return "Don't Show Again";
    }
    return undefined;
  });

  // Trigger a fresh notification by re-invoking the helper directly (the
  // activation-time call has already resolved).
  await showSuppressibleNotification(
    "featuresPathMigration",
    "Migrated `featuresPath` → `featuresPaths`. ...",
    ["Open Settings"],
    wkspUri,
  );

  // showSuppressibleNotification internally calls suppressNotification on DSA.
  // Assert the post-state: suppressedNotifications now contains "featuresPathMigration".
  const cfg = vscode.workspace.getConfiguration("gs-behave-bdd", wkspUri);
  const suppressed = cfg.inspect<string[]>("suppressedNotifications");
  assert.ok(
    suppressed?.workspaceFolderValue?.includes("featuresPathMigration"),
    'DSA click should suppress featuresPathMigration at WorkspaceFolder scope'
  );
});
```

**Note:** this DOES re-import `showSuppressibleNotification` from the production
source — the only Phase 17 test that does so. The activation-driven assertions
remain pure black-box (per D-05).

#### Pattern 5.2.C — "Open Settings" button click

```ts
test('clicking "Open Settings" runs the openSettings command', async () => {
  const stub = vscode.window.showInformationMessage as unknown as sinon.SinonStub;
  stub.callsFake(async () => "Open Settings");

  const execStub = sinon.stub(vscode.commands, 'executeCommand').resolves(undefined);

  await showSuppressibleNotification(
    "featuresPathMigration",
    "Migrated `featuresPath` → `featuresPaths`. ...",
    ["Open Settings"],
    wkspUri,
  ).then(action => {
    if (action === "Open Settings") {
      vscode.commands.executeCommand("workbench.action.openSettings", "@ext:gabeseltzer.gs-behave-bdd");
    }
  });

  assert.ok(execStub.calledWith("workbench.action.openSettings", "@ext:gabeseltzer.gs-behave-bdd"));
  execStub.restore();
});
```

### 5.3 What about the activation-time notification specifically?

The activation-time notification firing is verified by
**Pattern 5.2.A's call-history assertion** (the suite-init stub captures the call
even though the test file loads after activation). The actual UI-click branches
(DSA, "Open Settings") are verified by **Pattern 5.2.B and 5.2.C** by re-invoking
`showSuppressibleNotification` directly with a configured stub. This is the
cleanest split:

- Activation-time = "did the notification fire?" → Pattern 5.2.A (call-history).
- Click flows = "what happens when user clicks?" → Pattern 5.2.B/C (re-invoke + new stub return).

This split is necessary because activation happens before the test can install
behavior-specific stubs.

---

## 6. D-18 ordering invariant — assertion strategies

CONTEXT.md §Specifics offers two paths:

> Direct ordering can be asserted by spying on `config.logger.logInfo` calls if
> needed (each migration logs distinct messages), or accepted as implicit if the
> post-state is correct.

### 6.1 Implicit (post-state only) — RECOMMENDED

Phase 16's migration writes `featuresPaths` and removes `featuresPath`. Phase 15's
migration writes `suppressedNotifications` and removes `suppressMultiConfigNotification`.
After activation completes, both keys gone + both new keys present = both ran.

If the order were reversed (Phase 15 first, then Phase 16), the result is
**identical** because:
- Phase 15 mutates `suppressedNotifications` only.
- Phase 16 mutates `featuresPaths` only.
- They write to disjoint keys; ordering is observable only via timing of
  `reloadSettings()` cache state during activation.

**The user-observable invariant from D-18 is "reloadSettings happens AFTER both
migrations".** This is verified by checking that the post-activation
`config.workspaceSettings[wkspUri.path]` cache reflects both migrations — which is
what the existing `instances.config.workspaceSettings[wkspUri.path]` accessor
returns.

```ts
test('post-migration cache reflects both migrations (D-18 reloadSettings ran)', () => {
  const wkspSettings = instances.config.workspaceSettings[wkspUri.path];
  assert.ok(wkspSettings, 'workspace settings cache should be populated');
  assert.ok(
    wkspSettings.featuresPaths.includes('features') && wkspSettings.featuresPaths.includes('features-alt'),
    'cached featuresPaths should reflect Phase 16 migration'
  );
  assert.ok(
    wkspSettings.suppressedNotifications.includes('multiConfigNotification'),
    'cached suppressedNotifications should reflect Phase 15 migration'
  );
});
```

### 6.2 Explicit (logger spy) — only if §6.1 isn't sufficient

`config.logger.logInfo` is called by the migration helpers when `update()` rejects
([src/notifications.ts L155](src/notifications.ts#L155)) — NOT in the happy path.
So a logger spy can only assert ordering on failure paths, not on the happy path
the fixture exercises. **Not useful for Phase 17.** Skip.

### 6.3 If the planner wants real call-order proof

The cleanest direct proof is to spy on `migrateLegacyFeaturesPath` and
`migrateLegacySuppressMultiConfig` themselves (sinon.spy on the module exports)
**before activation**. Pattern 5.2.A's "stub-at-suite-index" mechanism applies —
add the spies in `index.ts` before `runner(...)`. Then assert
`spy16.calledBefore(spy15)`.

**Trade-off:** crosses the black-box boundary (D-05 prefers activation-driven
assertion). Recommended only if §6.1 is rejected during planning.

---

## 7. The A1-probe standalone test (closes Phase 15 HUMAN-UAT #1)

CONTEXT.md D-02 specifies a 10-line standalone test. Pattern:

```ts
test('A1: cfg.inspect() returns per-scope shape for unregistered key', async () => {
  const cfg = vscode.workspace.getConfiguration('gs-behave-bdd', wkspUri);
  // Write an unregistered key at WorkspaceFolder scope.
  await cfg.update('__a1ProbeKey__', 'probe-value', vscode.ConfigurationTarget.WorkspaceFolder);
  try {
    const insp = cfg.inspect<string>('__a1ProbeKey__');
    assert.ok(insp, 'inspect() should return a result for unregistered keys');
    assert.strictEqual(insp.workspaceFolderValue, 'probe-value', 'workspaceFolderValue should reflect the write');
    assert.strictEqual(insp.workspaceValue, undefined, 'workspaceValue should be undefined');
    assert.strictEqual(insp.globalValue, undefined, 'globalValue should be undefined');
  } finally {
    // Always clean up the probe key — it's persisted to .vscode/settings.json.
    await cfg.update('__a1ProbeKey__', undefined, vscode.ConfigurationTarget.WorkspaceFolder);
  }
});
```

**Where this test lives:** CONTEXT.md says "any minimal fixture (or a temp dir)".
Recommendation: put it inside `migrations.test.ts` (the same suite as the
combined-fixture tests), guarded by a separate `suite('A1 inspect() probe', …)`
block. One Dev Host launch covers both. The probe key is cleaned up in `finally`,
so it doesn't leak into the migration assertions.

**Important:** the `cfg.update()` call writes to the fixture's
`.vscode/settings.json` mid-test. The `finally` clause removes the key. The
suite-level template restore (§4) is the safety net if the cleanup itself fails.

---

## 8. Common pitfalls (from migration code + integration patterns)

| # | Pitfall                                                                                                       | Mitigation                                                                                                                       |
|---|---------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------|
| 1 | Activation runs before test runner starts → can't stub `showInformationMessage` from inside `suiteSetup`.     | Stub at `index.ts` (suite entry) — see §5.2.A.                                                                                   |
| 2 | `cfg.get()` merges all scopes; never use it to assert scope-specific outcomes.                                | Always use `cfg.inspect<T>(key).workspaceFolderValue` / `.workspaceValue` / `.globalValue`. Same as production code at [src/notifications.ts L37](src/notifications.ts#L37). |
| 3 | Fixture `.vscode/settings.json` mutated by activation → next test run starts in post-migration state.         | `.vscode/settings.template.json` sibling + `suiteTeardown` write-back (§4). Verify via `git status` after a test run is clean.   |
| 4 | `await new Promise(t => setTimeout(t, 3000))` after activation — flake-prone.                                  | Established convention; keep the 3000ms settle. Migration loop is `await`-ed inside `activate()`, so this is paranoia-margin only. |
| 5 | Mocha `bail: true` is set in the runner — first failure aborts the suite.                                     | Order tests so the cheapest assertions run first (post-state checks before notification stubs).                                 |
| 6 | `sinon.restore()` only restores stubs created via `sinon.<method>` (not `sinon.stub()` on imported objects). | The `index.ts`-installed stub never calls `restore()` — Dev Host process exits at end of suite anyway.                          |
| 7 | Two namespaces (`gs-behave-bdd`, `behave-vsc`) — both `featuresPath` keys must be in the seed.                | Per D-07. Verify the `behave-vsc.featuresPath` value lands in `gs-behave-bdd.featuresPaths` (D-02 cross-namespace consolidation). |
| 8 | `normalizePathEntry` regex must match between [src/notifications.ts L210](src/notifications.ts#L210) and [src/settings.ts L204](src/settings.ts#L204). | Phase 17 verifies via outcome — if dedup over-removes or under-removes, assertions on `featuresPaths.length` catch it.       |
| 9 | The migration fires the notification **only if Phase 16 migration returned `migrated === true`**.            | Fixture must seed at least one `featuresPath` key (in either namespace) for the notification path to fire.                       |
| 10 | Suite registration order in `runTestSuites.ts` matters — earlier suites can leave global state.              | Add the migrations suite at the **end** of `runTestSuites.ts` (matches the convention of newer suites being appended).          |

---

## 9. Validation Architecture (Nyquist Dimensions)

Phase 17's tests validate the migration system across these dimensions:

### Dim 1 — Function-level correctness
Already covered by unit tests on `migrateLegacyFeaturesPath` / `migrateLegacySuppressMultiConfig`. Phase 17 does NOT re-cover this dimension.

### Dim 2 — Module-level integration
The `migrateScopedSetting` primitive + the two callers — covered by unit tests.
Phase 17 does NOT re-cover this dimension.

### Dim 3 — Subsystem boundaries (NEW for Phase 17)
The activation loop in [src/extension.ts L295-L320](src/extension.ts#L295) integrates:
- `getUrisOfWkspFoldersWithFeatures()` (workspace discovery)
- Two migration helpers
- `config.reloadSettings()` (cache refresh)
- The pending-notification queue
- `showSuppressibleNotification()` (notification UI gated on `suppressedNotifications`)

**Test:** activation against the seeded fixture, assert post-activation cache
state via `instances.config.workspaceSettings[wkspUri.path]` (§6.1).

### Dim 4 — End-to-end user contract (NEW for Phase 17)
The user-observable contract is: "open a workspace with stale settings → after
activation, the new settings keys reflect the migrated values, the old keys are
gone, and a notification fires once."

**Test:** assert all three:
- `inspect().workspaceFolderValue` for `featuresPaths` and `suppressedNotifications` matches expected.
- `inspect().workspaceFolderValue` for `featuresPath` and `suppressMultiConfigNotification` is undefined.
- `showInformationMessage` stub recorded at least one call with the migration message.

### Dim 5 — Cross-system contract (VS Code API contract)
The A1-probe (§7) verifies VS Code's `inspect()` API behaves the way the
migration code assumes. Standalone test, no fixture mutation.

### Dim 6 — Failure modes
Phase 16/15 unit tests cover failure modes (rejected `update()` → log-and-continue).
Phase 17 does NOT re-cover.

### Dim 7 — Performance
Out of scope per CONTEXT.md §Deferred ("performance/load testing of activation
under many migrations — out of scope").

### Dim 8 — Regression gate (NEW for Phase 17 — the headline value)
**The single most important assertion bundle:** the fixture acts as a permanent
regression gate. Any future change to `migrateLegacyFeaturesPath`,
`migrateLegacySuppressMultiConfig`, the activation order, or `reloadSettings`
that breaks the user-observable contract **immediately fails this suite in CI**.

This is why CONTEXT.md D-09 chose belt-and-suspenders (file content + `inspect()`
API): file content catches "we wrote the wrong thing"; `inspect()` catches "VS
Code reads what we wrote at the wrong scope".

---

## 10. Architectural Responsibility Map

| Responsibility                                          | Layer                              | Phase 17 file                                     |
|---------------------------------------------------------|------------------------------------|---------------------------------------------------|
| Seed pre-migration state                                | Fixture                            | `example-projects/migration-stale/.vscode/settings.json` |
| Baseline for restore                                    | Fixture                            | `example-projects/migration-stale/.vscode/settings.template.json` |
| Minimal features dir (so migration loop fires)          | Fixture                            | `example-projects/migration-stale/features/example.feature` + `behave.ini` or `pyproject.toml` |
| Suite Mocha entry                                       | Suite index                        | `test/integration/migrations suite/index.ts`      |
| Stub `showInformationMessage` at suite-load time        | Suite index                        | same — installed before `runner(...)` returns     |
| Per-suite Dev Host launch registration                  | Top-level test runner              | `test/integration/runTestSuites.ts` (new entry)   |
| Activation outcome assertions (D-09 belt-and-suspenders) | Suite test file                   | `test/integration/migrations suite/extension.test.ts` |
| A1-probe standalone test                                | Suite test file                    | same (separate `suite()` block)                   |
| DSA-click flow assertion                                | Suite test file                    | same (re-invokes `showSuppressibleNotification`)  |
| "Open Settings" button assertion                        | Suite test file                    | same                                              |
| Fixture restore                                         | Suite test file (`suiteTeardown`)  | same                                              |

---

## 11. Open questions for the planner (small, planner's discretion)

These items remain genuinely planner-discretion — research did not narrow them:

1. **Suite directory shape:** `test/integration/migrations suite/` (matches the
   established `<name> suite/` fixture-tied convention) vs `test/integration/migrations.test.ts`
   as a top-level cross-cutting test. **Research recommendation:** `migrations
   suite/` because it IS fixture-tied (the new `example-projects/migration-stale/`).
   Matches all other fixture-bound suites.

2. **Number of `it()` blocks:** one big test asserting many properties (faster, less
   mocha overhead, larger fault domain on failure) vs several focused tests sharing
   `before` setup (more granular failure messages, cleaner names). **Research
   recommendation:** 4-6 focused tests, mostly assertion-only after a single
   `before` populates a fixture-state struct. Matches the
   [test/integration/monorepo-scan suite/extension.test.ts](test/integration/monorepo-scan%20suite/extension.test.ts) shape.

3. **Whether to install the `showInformationMessage` stub at suite-index time** (§5.2.A)
   vs accept that the activation-time notification call goes to the real UI and
   only test the DSA flow via direct `showSuppressibleNotification` invocation.
   **Research recommendation:** install at suite-index time. Captures the
   activation call (proves it fired) AND prevents a real popup from appearing
   when running tests interactively from VS Code.

4. **Failure-handling protocol if the integration tests catch a real bug in
   shipped Phase 15/16 code.** Per CONTEXT.md, not pre-decided. Research has no
   opinion — depends on the bug's blast radius when surfaced.

5. **CHANGELOG / README / milestone retro.** Per CONTEXT.md, deferred. Research
   has no opinion — these are milestone-close artifacts orthogonal to Phase 17's
   regression-gate purpose.

---

## 12. Summary for the planner

Phase 17 has **one fixture, one suite, and one notification stubbing pattern** to
build:

- **Fixture:** `example-projects/migration-stale/` with `.vscode/settings.json`
  (3 stale keys), `.vscode/settings.template.json` (baseline for restore),
  minimal `features/` + config file. ~5 small files.

- **Suite:** `test/integration/migrations suite/` — `index.ts` (suite-entry stub
  install + Mocha runner) + `extension.test.ts` (4-6 tests covering activation
  outcome, DSA flow, "Open Settings" flow, A1-probe). ~150-250 lines.

- **Wiring:** one `runTests({...})` block appended to
  [test/integration/runTestSuites.ts](test/integration/runTestSuites.ts) launching
  the new fixture against the new suite. ~7 lines.

- **No production code changes.** All assertions black-box-verify the activation
  loop's outcome — the migration helpers, the notification helper, and
  `reloadSettings` are exercised through `activate()`, never imported directly
  (with one tactical exception: `showSuppressibleNotification` is re-invoked in
  the DSA + "Open Settings" tests because activation-time call has already
  resolved by the time those tests run).

Every external dependency — Mocha, sinon, `@vscode/test-electron`, `vscode` API,
Node `fs` — is already in the test stack. **Zero new dependencies to add.** The
only research-derived recommendation that's a "decision" rather than a "pattern
match" is the **`.vscode/settings.template.json` baseline-restore mechanism**
(§4 Option 1).
