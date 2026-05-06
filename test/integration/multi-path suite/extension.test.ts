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
	const wkspFolder = workspaceFolders.find(folder =>
		folder.uri.path.endsWith('/multi-path') || folder.uri.path.endsWith('\\multi-path')
	);
	assert.ok(wkspFolder, 'multi-path workspace folder should exist');
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

suite('multi-path suite', () => {

	let originalBehaveIni: string;
	let behaveIniPath: string;
	let wkspUri: vscode.Uri;

	suiteSetup(async function () {
		this.timeout(60000);
		await setupTestSupport();
		wkspUri = getWorkspaceUri();
		behaveIniPath = path.join(wkspUri.fsPath, 'behave.ini');
		originalBehaveIni = fs.readFileSync(behaveIniPath, 'utf8');
	});

	suiteTeardown(() => {
		if (originalBehaveIni !== undefined) {
			try {
				fs.writeFileSync(behaveIniPath, originalBehaveIni, 'utf8');
			} catch {
				// best-effort cleanup
			}
		}
	});

	test('single-path baseline shows only features/ scenarios', async function () {
		this.timeout(300000);
		const entry = instances.getDiscoveryEntry(wkspUri);
		assert.ok(entry, 'DiscoveryEntry should exist');
		assert.strictEqual(entry.source, 'config-file');
		assert.strictEqual(entry.featuresUris.length, 1, 'should have exactly 1 features root');

		const primaryScenario = findScenarioByName(instances, wkspUri, 'primary path test one');
		assert.ok(primaryScenario, 'primary path scenario should be visible');

		const altScenario = findScenarioByName(instances, wkspUri, 'alternate path test one');
		assert.strictEqual(altScenario, undefined, 'alternate path scenario should NOT be visible');
	});

	test('edit behave.ini to multi-path shows both roots', async function () {
		this.timeout(300000);
		fs.writeFileSync(behaveIniPath, '[behave]\npaths = features\n  features-alt\n', 'utf8');

		const state = await waitForTestTree(
			() => {
				const entry = instances.getDiscoveryEntry(wkspUri);
				if (!entry) return undefined;
				if (entry.featuresUris.length !== 2) return undefined;
				const primary = findScenarioByName(instances, wkspUri, 'primary path test one');
				const alt = findScenarioByName(instances, wkspUri, 'alternate path test one');
				if (!primary || !alt) return undefined;
				return { entry, primary, alt };
			},
			{ intervalMs: 100, timeoutMs: 15000 }
		);

		assert.strictEqual(state.entry.featuresUris.length, 2, 'should have 2 features roots');
		assert.ok(state.primary, 'primary scenario visible after multi-path edit');
		assert.ok(state.alt, 'alternate scenario visible after multi-path edit');
	});

	test('revert behave.ini to single-path hides alternate root', async function () {
		this.timeout(300000);
		fs.writeFileSync(behaveIniPath, '[behave]\npaths = features\n', 'utf8');

		const state = await waitForTestTree(
			() => {
				const entry = instances.getDiscoveryEntry(wkspUri);
				if (!entry) return undefined;
				if (entry.featuresUris.length !== 1) return undefined;
				const primary = findScenarioByName(instances, wkspUri, 'primary path test one');
				if (!primary) return undefined;
				const alt = findScenarioByName(instances, wkspUri, 'alternate path test one');
				if (alt) return undefined;
				return { entry, primary };
			},
			{ intervalMs: 100, timeoutMs: 15000 }
		);

		assert.strictEqual(state.entry.featuresUris.length, 1, 'should have 1 features root after revert');
		assert.ok(state.primary, 'primary scenario still visible after revert');
	});

}).timeout(900000);
