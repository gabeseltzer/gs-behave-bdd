# Phase 5: Integration Verification - Pattern Map

**Mapped:** 2026-04-17
**Files analyzed:** 6 (5 new + 1 modified)
**Analogs found:** 6 / 6 (all exact role + data-flow matches)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `test/integration/watcher-integration suite/extension.test.ts` | integration test entrypoint (dynamic mutation) | event-driven + fs mutation | `test/integration/debug suite/extension.test.ts` | **exact** (closest structural match — dynamic logic, not SharedWorkspaceTests harness) |
| `test/integration/watcher-integration suite/runGuard.test.ts` *(optional split per D-10 / specifics)* | integration test entrypoint (stub-driven) | request-response with stubbed UI | `test/unit/runners/testRunHandler.test.ts` §`checkRunGuard` suite (lines 141-320+) | **exact** (same SUT, same sinon pattern) |
| `test/integration/watcher-integration suite/index.ts` | suite glob loader | re-export | `test/integration/debug suite/index.ts` | **exact** |
| `test/integration/suite-shared/waitForTestTree.ts` | shared test helper (poll primitive) | polling/async | *no direct analog — see "No Analog Found"* | **none** (novel helper — build from RESEARCH.md) |
| `example-projects/watcher-integration/` (fixture dir) | test fixture | fs layout | `example-projects/config-only/` | **exact** (plus `features-alt/` sibling per D-06) |
| `test/integration/runTestSuites.ts` *(modification)* | suite orchestrator append | batch orchestration | Existing entries in same file (lines 131-156) | **exact** (append-only pattern) |

---

## Pattern Assignments

### `test/integration/watcher-integration suite/extension.test.ts` (integration test entrypoint)

**Primary analog:** `test/integration/debug suite/extension.test.ts`
**Why this over `config-only suite/extension.test.ts`:** Phase 5 tests need dynamic fixture mutation, `ctrl.items` inspection, and custom per-test logic — not the generic `SharedWorkspaceTests.runDefault/Parallel/Together` triple. `debug suite` is the only existing integration suite that (a) activates the extension directly, (b) captures `TestSupport`, (c) defines custom `test()` blocks with bespoke assertions, and (d) uses `getAllTestItems` + `getScenarioTests` against `instances.ctrl.items` — exactly Phase 5's shape.

**Imports pattern** (copy from `debug suite/extension.test.ts:1-6`):
```typescript
import * as vscode from 'vscode';
import * as assert from 'assert';
import { TestSupport } from '../../../src/extension';
import { TestWorkspaceConfig, TestWorkspaceConfigWithWkspUri } from '../../../src/testWorkspaceConfig';
import { getAllTestItems, getScenarioTests, uriId, getDiscoveryEntry } from '../../../src/common';
```
Add for Phase 5:
```typescript
import * as fs from 'fs';
import * as path from 'path';
import { waitForTestTree } from '../suite-shared/waitForTestTree';
```

**Activation bootstrap pattern** (copy from `debug suite/extension.test.ts:8-27`, note the module-level `instances` singleton and the `integrationTestRun = true` flag — this is load-bearing because `configurationChangedHandler` has an early-exit on that flag per PITFALL-14):
```typescript
let instances: TestSupport;

function getWorkspaceUri(): vscode.Uri {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	assert.ok(workspaceFolders, 'workspace folders should exist');
	const wkspFolder = workspaceFolders.find(folder => folder.uri.path.includes('watcher-integration'));
	assert.ok(wkspFolder, 'watcher-integration workspace folder should exist');
	return wkspFolder.uri;
}

async function setupTestSupport(): Promise<TestSupport> {
	if (instances) return instances;
	const extension = vscode.extensions.getExtension('gabeseltzer.gs-behave-bdd');
	assert.ok(extension);
	assert.ok(extension.isActive);
	instances = await extension.activate() as TestSupport;
	instances.config.integrationTestRun = true;
	await new Promise(t => setTimeout(t, 3000));
	return instances;
}
```

**Suite / suiteSetup / suiteTeardown shape** (copy shape from `debug suite/extension.test.ts:54-59` and `config-only suite/extension.test.ts:6-20`; combine with snapshot-restore per D-09):
```typescript
suite('watcher-integration suite', () => {

	let originalBehaveIni: string;
	let behaveIniPath: string;

	suiteSetup(async function () {
		this.timeout(60000);
		await setupTestSupport();
		const wkspUri = getWorkspaceUri();
		behaveIniPath = path.join(wkspUri.fsPath, 'behave.ini');
		originalBehaveIni = fs.readFileSync(behaveIniPath, 'utf8');  // D-09: snapshot
	});

	suiteTeardown(() => {
		// D-09: restore original content regardless of test outcomes
		if (originalBehaveIni !== undefined) {
			fs.writeFileSync(behaveIniPath, originalBehaveIni, 'utf8');
		}
	});

	// ...tests A/B/C here...

}).timeout(900000);
```

**Per-test try/finally restore pattern** (D-09; no direct analog in existing suites — build from scratch, but keep style consistent with surrounding code):
```typescript
test('delete behave.ini → test tree falls back to convention', async function () {
	this.timeout(300000);
	try {
		fs.unlinkSync(behaveIniPath);
		await waitForTestTree(
			() => { /* predicate: source === 'convention' AND features/ scenarios visible */ },
			{ intervalMs: 100, timeoutMs: 5000 }
		);
		// ...assertions on getDiscoveryEntry(wkspUri) and ctrl.items...
	} finally {
		// restore only if test threw mid-run; pass-case leaves state for next test (D-08 linear sequence)
	}
});
```

**Tree inspection pattern** (copy from `debug suite/extension.test.ts:45-52`):
```typescript
function findScenarioByName(instances: TestSupport, wkspUri: vscode.Uri, scenarioName: string): vscode.TestItem | undefined {
	const wkspId = uriId(wkspUri);
	const allItems = getAllTestItems(wkspId, instances.ctrl.items);
	const scenarios = getScenarioTests(instances.testData, allItems);
	return scenarios.find(item => item.label === scenarioName);
}
```
Use this both inside the `waitForTestTree` predicate and in post-wait assertions.

**Cache-state assertion pattern** (D-17, D-18 — uses `getDiscoveryEntry` from `src/common.ts:164`):
```typescript
const entry = getDiscoveryEntry(wkspUri);
assert.strictEqual(entry?.source, 'convention', 'after delete, source should be convention');
assert.strictEqual(entry?.configError, undefined, 'no configError on clean delete');
```

---

### `test/integration/watcher-integration suite/runGuard.test.ts` (if split per specifics)

**Primary analog:** `test/unit/runners/testRunHandler.test.ts` lines 141-320+ (the entire `suite('checkRunGuard', ...)` block).

**Sinon stub pattern for `showWarningMessage`** (copy verbatim shape from `testRunHandler.test.ts:193-211`):
```typescript
let showWarningMessageStub: sinon.SinonStub;
let executeCommandStub: sinon.SinonStub;

setup(() => {
	showWarningMessageStub = sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);
	executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves(undefined);
});

teardown(() => {
	sinon.restore();
});
```

**Three-branch assertion pattern** (copy per-test shape from `testRunHandler.test.ts:226-283`):
```typescript
test('Run Anyway branch proceeds with run', async () => {
	showWarningMessageStub.resolves('Run Anyway');
	const result = await checkRunGuard(request, instances.ctrl);
	assert.strictEqual(result, true);
});

test('Open Config File branch calls vscode.open and cancels run', async () => {
	showWarningMessageStub.resolves('Open Config File');
	const result = await checkRunGuard(request, instances.ctrl);
	assert.strictEqual(result, false);
	assert.ok(executeCommandStub.calledOnce);
	assert.strictEqual(executeCommandStub.firstCall.args[0], 'vscode.open');
});

test('Cancel branch returns false', async () => {
	showWarningMessageStub.resolves('Cancel');
	const result = await checkRunGuard(request, instances.ctrl);
	assert.strictEqual(result, false);
});
```

**Message-fragment assertion** (copy from `testRunHandler.test.ts:285-298`; ties to the exact production string in `testRunHandler.ts:125`):
```typescript
assert.ok(showWarningMessageStub.calledOnce);
const msgArg: string = showWarningMessageStub.firstCall.args[0];
assert.ok(msgArg.includes("'behave.ini'"), `Message should contain filename, got: "${msgArg}"`);
assert.ok(msgArg.includes('parse errors'), 'Message should reference parse errors');
```

**Key difference from the unit test analog:** the integration test must NOT stub `getDiscoveryEntry` / `getUrisOfWkspFoldersWithFeatures` — those must run against the real extension host. Instead, mutate the fixture's config file to induce a real `configError`, then force cache refresh via `getUrisOfWkspFoldersWithFeatures(true)` (the same call the production watcher uses — see `configWatcher.ts:56`). Import `checkRunGuard` from `src/runners/testRunHandler`:
```typescript
import { checkRunGuard } from '../../../src/runners/testRunHandler';
```

**Fixture mutation for malformed state** (D-16 — write bad TOML to a separate file, NOT the `behave.ini` the watcher tests manipulate):
```typescript
setup(() => {
	fs.writeFileSync(pyprojectPath, '[tool.behave\npaths = [', 'utf8'); // unterminated TOML
	getUrisOfWkspFoldersWithFeatures(true); // force cache invalidation so configError is populated
});

teardown(() => {
	fs.writeFileSync(pyprojectPath, originalPyproject, 'utf8');
	getUrisOfWkspFoldersWithFeatures(true);
	sinon.restore();
});
```

---

### `test/integration/watcher-integration suite/index.ts` (suite glob loader)

**Analog:** `test/integration/debug suite/index.ts` (copy verbatim, only change the glob string).

**Full content** (exact — same as `debug suite/index.ts` / `config-only suite/index.ts` / `malformed-config suite/index.ts`):
```typescript
import { runner } from "../index.helper";

export function run(): Promise<void> {
	return runner("**/watcher-integration suite/**.test.js");
}
```
The glob `**.test.js` picks up both `extension.test.js` and `runGuard.test.js` if the suite file is split — no index change needed between single-file and split-file layouts (matches the specifics note about file-split discretion).

---

### `test/integration/suite-shared/waitForTestTree.ts` (shared polling helper)

**No direct analog** — there's no existing poll helper in the codebase. Build pattern from:
- Debounce constant to beat: `DEBOUNCE_MS = 500` in `src/watchers/configWatcher.ts:10`
- Existing poll-ish pattern (for reference style): `setLock` in `extension.test.helpers.ts:319-358` uses a `for` loop with `setTimeout` and tracks elapsed time — the shape to echo, though that's a lock primitive not a predicate poll.

**Module style convention** (match surrounding `suite-shared/` files — named exports, no default export, no barrel):
```typescript
// test/integration/suite-shared/waitForTestTree.ts

export interface WaitOptions {
	intervalMs: number;
	timeoutMs: number;
}

export async function waitForTestTree<T>(
	predicate: () => T | undefined,
	options: WaitOptions
): Promise<T> {
	const start = Date.now();
	let lastSeen: T | undefined;
	while (Date.now() - start < options.timeoutMs) {
		lastSeen = predicate();
		if (lastSeen !== undefined) return lastSeen;
		await new Promise(t => setTimeout(t, options.intervalMs));
	}
	throw new Error(
		`waitForTestTree: predicate did not match within ${options.timeoutMs}ms. ` +
		`Last seen: ${JSON.stringify(lastSeen)}`
	);
}
```

**Style notes from surrounding code:**
- Named `export` (not `export default`) — matches `suite-shared/shared.workspace.tests.ts:13` and `suite-shared/expectedResults.helpers.ts:20`.
- Tab indent (matches `debug suite/extension.test.ts` and `simple suite/extension.test.ts`).
- No relative-path imports needed for this file (self-contained).
- Per CLAUDE.md / AI_INSTRUCTIONS.md: return type annotations explicit on async functions.

---

### `example-projects/watcher-integration/` (fixture directory)

**Primary analog:** `example-projects/config-only/` — clone layout exactly, then add `features-alt/`.

**Source layout to clone** (from `example-projects/config-only/`):
```
config-only/
├── behave.ini                  → "[behave]\npaths = features\n"
└── features/
    ├── discovery.feature       → "Feature: Config Only Discovery" + 3 scenarios
    ├── environment.py          → before_scenario/after_scenario (skip handler)
    └── steps/
        └── steps.py            → @given/@when/@then for "behave installed" / "successful_or_failing test" / "see the result"
```

**Target layout for Phase 5 fixture** (add `features-alt/` per D-06, rename feature per specifics):
```
watcher-integration/
├── behave.ini                  → "[behave]\npaths = features\n"  (matches config-only exactly)
├── features/
│   ├── discovery.feature       → rename Feature: to "Watcher Integration Discovery" (or similar distinct label)
│   ├── environment.py          → copy verbatim from config-only
│   └── steps/
│       └── steps.py            → copy verbatim from config-only
└── features-alt/               → NEW (D-06, specifics: distinct scenario label)
    ├── alt.feature             → "Feature: Alternate Path Discovery" / "Scenario: alternate path discovery"
    ├── environment.py          → copy verbatim from config-only
    └── steps/
        └── steps.py            → copy verbatim from config-only
```

**Exact content to copy verbatim**

`behave.ini` (from `example-projects/config-only/behave.ini`):
```ini
[behave]
paths = features
```

`features/environment.py` and `features-alt/environment.py` (from `example-projects/config-only/features/environment.py`):
```python
# ruff: noqa
from behave import model


def before_scenario(context, scenario: model.Scenario):
    if "skip" in scenario.effective_tags:
        scenario.skip("Marked with @skip")
        return


def after_scenario(context, scenario: model.Scenario):
    if "skip" in scenario.effective_tags:
        scenario.skip("Marked with @skip")
        return
```

`features/steps/steps.py` and `features-alt/steps/steps.py` (from `example-projects/config-only/features/steps/steps.py`):
```python
# ruff: noqa
from behave import *

@given("we have behave installed")
@given("we have (behave) installed")
def step_inst(context):
    pass


@when("we implement a {successful_or_failing} test")
@when('"we" implement a [{successful_or_failing}] test')
def step_impl(context, successful_or_failing):
    assert successful_or_failing == "successful"


@then("we will see the result")
@then("we will *see* the result")
def step_res(context):
    assert 1 == 1
```

`features/discovery.feature` (reshape from `config-only/features/discovery.feature` — rename to a distinct Feature label so the watcher tests can grep on it):
```gherkin
Feature: Watcher Integration Discovery

   Scenario: run a successful test
      Given we have behave installed
      When we implement a successful test
      Then we will see the result
```

`features-alt/alt.feature` (new — per specifics, distinct label for grep-assertion):
```gherkin
Feature: Alternate Path Discovery

   Scenario: alternate path discovery
      Given we have behave installed
      When we implement a successful test
      Then we will see the result
```

**Do NOT include:** `__pycache__/` (present in config-only but is git-ignored build output).

**Do NOT add a `pyproject.toml`** to the base fixture — add it only if the run-guard test mutation strategy goes with TOML (D-16 gives a choice of TOML or behave.ini syntax error). If TOML route chosen, the malformed pyproject is written in the run-guard test's `setup`, not committed to the repo.

---

### `test/integration/runTestSuites.ts` (append-only modification)

**Analog:** existing entries in same file, lines 131-156 (the `config-only` and `malformed-config` entries are closest because they also use unquoted `launchArgs` with a simple directory name).

**Exact pattern to append** (model on lines 149-156 — `malformed-config` suite entry; append immediately after it, before the closing `console.log("test run complete")` on line 158):
```typescript
launchArgs = ["example-projects/watcher-integration"];
extensionTestsPath = getShortPathOnWindows(path.resolve(__dirname, './watcher-integration suite'));
await runTests({
  vscodeExecutablePath,
  extensionDevelopmentPath,
  extensionTestsPath,
  launchArgs
});
```

**Style notes:**
- 2-space indent (matches the file).
- `launchArgs = [...]` reassignment before each block (the file re-uses the same `let launchArgs` and `let extensionTestsPath` declared on lines 37-38).
- `launchArgs` uses plain `"..."` (no nested quotes) because `watcher-integration` has no spaces — same convention as `config-only` entry on line 131 and `malformed-config` entry on line 149. Contrast: entries with spaces in path names use `` `"..."` `` template literals with inner double quotes (e.g. `"nested project"` on line 50, `"sibling steps folder 1"` on line 59).
- No comment needed — the file's other suite entries have no per-suite comment.

**Do NOT:**
- Add a `console.log` for this suite.
- Touch `runDebugSuite.ts` (separate entry for `/debug suite`).
- Reorder existing entries.
- Change `package.json` scripts — `runTestSuites.ts` is the single entry point.

---

## Shared Patterns

### Extension activation (applies to `extension.test.ts` and `runGuard.test.ts`)

**Source:** `test/integration/debug suite/extension.test.ts:8-27` (`setupTestSupport`)

Both Phase 5 test files in the watcher suite share the same extension host (same `instances` singleton). When the suite is split across two files, the module-level `let instances` lives in each file but they both resolve to the same underlying `TestSupport` because `extension.activate()` is idempotent — the second `await` returns the cached instance from the activation cache (see `getTestSupportFromExtension` in `extension.test.helpers.ts:363-396`, lines 366-367: `if (extInstances) return extInstances;`).

Copy this pattern exactly — **must** include `instances.config.integrationTestRun = true` after activation, and **must** include the 3000ms sleep after activation to let async init complete (same values as `debug suite` and `extension.test.helpers.ts:391`).

### Cache invalidation between mutations (applies to watcher tests)

**Source:** `src/watchers/configWatcher.ts:56`

Production code invalidates the discovery cache via `getUrisOfWkspFoldersWithFeatures(true)` (the `forceRefresh` flag, defined in `src/common.ts:168`). Tests should rely on the watcher to do this automatically after the 500ms debounce — the whole point of Phase 5 is verifying the watcher triggers it. Do NOT call `getUrisOfWkspFoldersWithFeatures(true)` in watcher tests; it would mask a watcher failure. The `runGuard` test is different (no watcher under test) — there, explicitly call `getUrisOfWkspFoldersWithFeatures(true)` in `setup` to force the cache to pick up the malformed pyproject before invoking `checkRunGuard`.

### Error handling in integration tests

**Source:** `test/integration/debug suite/extension.test.ts:121-124` (the `try { ... } finally { ... }` block around breakpoint setup)

Pattern to mirror for fixture mutation: mutation inside `try`, restoration inside `finally`, assertions inside `try` before the finally. Prevents CI poisoning if an assertion throws mid-test (D-09).

### Sinon sandbox lifecycle

**Source:** `test/unit/runners/testRunHandler.test.ts:193-211`

Exact shape: stubs declared at suite scope, created in `setup()`, restored with `sinon.restore()` in `teardown()`. Do NOT use `sinon.createSandbox()` for this suite — the existing unit-test pattern is the global `sinon.stub()` + `sinon.restore()` form, and consistency matters more than micro-isolation here. (`sinon.createSandbox()` does not appear anywhere in the test tree — confirmed via grep.)

---

## No Analog Found

| File | Role | Data Flow | Reason | Fallback |
|------|------|-----------|--------|----------|
| `test/integration/suite-shared/waitForTestTree.ts` | poll-until-predicate primitive | async polling | No existing poll helper — `setLock` in `extension.test.helpers.ts` is the nearest "loop with timeout" shape but solves a different problem (mutex, not predicate wait). | Build from scratch using the style notes under "Pattern Assignments" above; it is ~25 LOC. |

---

## Metadata

**Analog search scope:**
- `test/integration/**/*.ts` — all existing suites and shared helpers
- `test/unit/runners/testRunHandler.test.ts` — existing sinon pattern for `checkRunGuard`
- `example-projects/config-only/`, `example-projects/malformed-config/` — fixture templates
- `src/watchers/configWatcher.ts`, `src/runners/testRunHandler.ts`, `src/common.ts`, `src/extension.ts` — SUT to understand observable state

**Files scanned:** ~25 test files, 4 production files, 2 fixture trees.

**Key insight for planner:** The `debug suite` is the single most-underused analog in this codebase — it's the only integration suite that breaks from the `SharedWorkspaceTests` harness to do per-test custom logic. Phase 5 should reference it as its primary skeleton, not the `config-only` / `malformed-config` suites (those suites use `SharedWorkspaceTests` and are poor fits for this phase's dynamic-mutation shape).

**Lint reminder for planner:** Per CLAUDE.md the required lint is `npx eslint src --ext ts` — that scope does NOT include `test/`. However, `test/tsconfig.json` extends the root strict config and webpack/tsc compilation of tests will fail on TS errors. The planner should instruct implementers to also run `npm run test:unit` to catch compile regressions in test/ TypeScript (unit tests import the same shared test helpers that the new integration suite will use).

**Pattern extraction date:** 2026-04-17
