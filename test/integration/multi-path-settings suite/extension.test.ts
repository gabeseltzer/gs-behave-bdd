import * as vscode from 'vscode';
import * as assert from 'assert';
import { TestSupport } from '../../../src/extension';
import { getAllTestItems, getScenarioTests, uriId } from '../../../src/common';

let instances: TestSupport;

function getWorkspaceUri(): vscode.Uri {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	assert.ok(workspaceFolders, 'workspace folders should exist');
	const wkspFolder = workspaceFolders.find(folder => folder.uri.path.includes('multi-path-settings'));
	assert.ok(wkspFolder, 'multi-path-settings workspace folder should exist');
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

suite('multi-path-settings suite', () => {

	let wkspUri: vscode.Uri;

	suiteSetup(async function () {
		this.timeout(60000);
		await setupTestSupport();
		wkspUri = getWorkspaceUri();
	});

	test('featuresPaths setting discovers both roots', async function () {
		this.timeout(300000);
		const entry = instances.getDiscoveryEntry(wkspUri);
		assert.ok(entry, 'DiscoveryEntry should exist');
		assert.strictEqual(entry.source, 'settings', 'discovery source should be settings');
		assert.strictEqual(entry.featuresUris.length, 2, 'should have 2 features roots from featuresPaths');

		const primary = findScenarioByName(instances, wkspUri, 'settings primary test one');
		assert.ok(primary, 'primary settings path scenario should be visible');

		const alt = findScenarioByName(instances, wkspUri, 'settings alternate test one');
		assert.ok(alt, 'alternate settings path scenario should be visible');
	});

	test('scenario counts match fixture layout', async function () {
		this.timeout(300000);
		const wkspId = uriId(wkspUri);
		const allItems = getAllTestItems(wkspId, instances.ctrl.items);
		const scenarios = getScenarioTests(instances.testData, allItems);
		assert.strictEqual(scenarios.length, 3, 'should have 3 total scenarios (2 + 1)');
	});

}).timeout(900000);
