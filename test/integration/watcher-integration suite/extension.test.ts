import * as vscode from 'vscode';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { TestSupport } from '../../../src/extension';
import { getAllTestItems, getScenarioTests, uriId } from '../../../src/common';
import { waitForTestTree } from '../suite-shared/waitForTestTree';

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

function findScenarioByName(inst: TestSupport, wkspUri: vscode.Uri, scenarioName: string): vscode.TestItem | undefined {
	const wkspId = uriId(wkspUri);
	const allItems = getAllTestItems(wkspId, inst.ctrl.items);
	const scenarios = getScenarioTests(inst.testData, allItems);
	return scenarios.find(item => item.label === scenarioName);
}

suite('watcher-integration suite', () => {

	let originalBehaveIni: string;
	let behaveIniPath: string;
	let wkspUri: vscode.Uri;

	suiteSetup(async function () {
		this.timeout(60000);
		await setupTestSupport();
		wkspUri = getWorkspaceUri();
		behaveIniPath = path.join(wkspUri.fsPath, 'behave.ini');
		// D-09: snapshot original content; suiteTeardown restores regardless of test outcomes.
		// D-08 tension: suiteTeardown (not per-test finally) is the authoritative restore — per-test finally
		// blocks are intentionally no-op because D-08 chains test state. See 05-03-PLAN.md §design_notes.
		originalBehaveIni = fs.readFileSync(behaveIniPath, 'utf8');
	});

	suiteTeardown(() => {
		// D-09: unconditionally restore baseline so CI working tree stays clean.
		// This is the AUTHORITATIVE restore mechanism — per-test finally blocks are no-op (D-08 chain preservation).
		if (originalBehaveIni !== undefined) {
			try {
				fs.writeFileSync(behaveIniPath, originalBehaveIni, 'utf8');
			} catch {
				// best-effort cleanup; don't mask test failures
			}
		}
	});

	// D-08 Test A: start from fixture-with-behave.ini, delete it, assert fallback to convention.
	test('delete behave.ini triggers fallback to convention', async function () {
		this.timeout(300000);
		try {
			assert.ok(fs.existsSync(behaveIniPath), 'precondition: behave.ini exists before delete');
			fs.unlinkSync(behaveIniPath);

			// Wait for: (a) cache entry source flipped to convention, (b) the default-path scenario still visible in tree.
			// D-11/D-12: 100ms poll, 15000ms timeout — covers 500ms debounce + parse + Windows FS watcher latency (1-5s for delete events).
			const state = await waitForTestTree(
				() => {
					const entry = instances.getDiscoveryEntry(wkspUri);
					if (!entry) return undefined;
					if (entry.source !== 'convention') return undefined;
					const scenario = findScenarioByName(instances, wkspUri, 'run a successful test');
					if (!scenario) return undefined;
					return { entry, scenario };
				},
				{ intervalMs: 100, timeoutMs: 15000 }
			);

			// D-17/D-18: assert on observable state (cache + tree), not logs.
			assert.strictEqual(state.entry.source, 'convention', 'after delete, source should be convention');
			assert.strictEqual(state.entry.configError, undefined, 'no configError expected on clean delete');
			assert.ok(state.scenario, "'run a successful test' scenario should be visible under convention discovery");
		} finally {
			// D-08/D-09 tension: this finally block is INTENTIONALLY no-op.
			// Any restore logic here would break D-08 — Test B requires the "no config" state.
			// suiteTeardown is the authoritative restore. See 05-03-PLAN.md §design_notes.
		}
	});

	// D-08 Test B: starts from no-config state left by Test A.
	test('create behave.ini with paths = features-alt triggers re-discovery to alternate path', async function () {
		this.timeout(300000);
		try {
			assert.ok(!fs.existsSync(behaveIniPath), 'precondition: behave.ini does not exist at start of Test B (set up by Test A)');
			fs.writeFileSync(behaveIniPath, '[behave]\npaths = features-alt\n', 'utf8');

			const state = await waitForTestTree(
				() => {
					const entry = instances.getDiscoveryEntry(wkspUri);
					if (!entry) return undefined;
					if (entry.source !== 'config-file') return undefined;
					if (!entry.featuresUris[0].fsPath.endsWith('features-alt')) return undefined;
					return { entry };
				},
				{ intervalMs: 100, timeoutMs: 15000 }
			);

			assert.strictEqual(state.entry.source, 'config-file', 'after create, source should be config-file');
			assert.strictEqual(state.entry.configError, undefined, 'no configError on fresh valid config');
			assert.ok(state.entry.featuresUris[0].fsPath.endsWith('features-alt'), 'featuresUris[0] should point to features-alt');
		} finally {
			// D-08/D-09 tension: no-op by design — Test C depends on Test B's "paths = features-alt" end state.
			// See 05-03-PLAN.md §design_notes.
		}
	});

	// D-08 Test C: starts from Test B's state (paths = features-alt), switch back to paths = features.
	test('change behave.ini to paths = features triggers re-discovery back to default path', async function () {
		this.timeout(300000);
		try {
			assert.ok(fs.existsSync(behaveIniPath), 'precondition: behave.ini exists at start of Test C');
			fs.writeFileSync(behaveIniPath, '[behave]\npaths = features\n', 'utf8');

			const state = await waitForTestTree(
				() => {
					const entry = instances.getDiscoveryEntry(wkspUri);
					if (!entry) return undefined;
					if (entry.source !== 'config-file') return undefined;
					if (!entry.featuresUris[0].fsPath.endsWith('features')) return undefined;
					if (entry.featuresUris[0].fsPath.endsWith('features-alt')) return undefined;
					const scenario = findScenarioByName(instances, wkspUri, 'run a successful test');
					const altScenario = findScenarioByName(instances, wkspUri, 'alternate path discovery');
					if (!scenario) return undefined;
					if (altScenario) return undefined; // alt scenario must be gone
					return { entry, scenario };
				},
				{ intervalMs: 100, timeoutMs: 15000 }
			);

			assert.strictEqual(state.entry.source, 'config-file', 'after change, source should remain config-file');
			assert.ok(state.entry.featuresUris[0].fsPath.endsWith('features'), 'featuresUris[0] should point back to features/');
			assert.ok(!state.entry.featuresUris[0].fsPath.endsWith('features-alt'), 'featuresUris[0] should NOT end with features-alt');
			assert.ok(state.scenario, "'run a successful test' scenario should reappear");
		} finally {
			// D-08/D-09 tension: no-op by design — suiteTeardown restores originalBehaveIni after this test.
			// See 05-03-PLAN.md §design_notes.
		}
	});

}).timeout(900000);
