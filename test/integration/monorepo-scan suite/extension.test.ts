import * as vscode from 'vscode';
import * as assert from 'assert';
import { TestSupport } from '../../../src/extension';
import { getAllTestItems, getScenarioTests, uriId } from '../../../src/common';
import { waitForTestTree } from '../suite-shared/waitForTestTree';

let instances: TestSupport;

function getWorkspaceUri(): vscode.Uri {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	assert.ok(workspaceFolders, 'workspace folders should exist');
	const wkspFolder = workspaceFolders.find(folder => folder.uri.path.includes('monorepo-scan'));
	assert.ok(wkspFolder, 'monorepo-scan workspace folder should exist');
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

suite('monorepo-scan suite', () => {

	let wkspUri: vscode.Uri;

	suiteSetup(async function () {
		this.timeout(60000);
		await setupTestSupport();
		wkspUri = getWorkspaceUri();
	});

	suiteTeardown(async () => {
		try {
			await vscode.workspace.getConfiguration('gs-behave-bdd').update('discoveryDepth', undefined, vscode.ConfigurationTarget.Workspace);
			await instances.configurationChangedHandler(undefined, undefined, true);
		} catch {
			// best-effort cleanup
		}
	});

	test('BFS scanner discovers subdirectory config', async function () {
		this.timeout(300000);
		const entry = instances.getDiscoveryEntry(wkspUri);
		assert.ok(entry, 'DiscoveryEntry should exist after BFS scan');
		assert.strictEqual(entry.source, 'config-file', 'discovery source should be config-file');
		assert.ok(
			entry.featuresUris[0].fsPath.includes('app-a') || entry.featuresUris[0].fsPath.includes('app-b'),
			`primary features root should be from a depth-1 app, got: ${entry.featuresUris[0].fsPath}`
		);
	});

	test('primary app scenarios visible in test tree', async function () {
		this.timeout(300000);
		const wkspId = uriId(wkspUri);
		const allItems = getAllTestItems(wkspId, instances.ctrl.items);
		const scenarios = getScenarioTests(instances.testData, allItems);
		assert.ok(scenarios.length > 0, 'at least one scenario should be visible from discovered config');
	});

	test('discoveryDepth=0 disables subdirectory scanning', async function () {
		this.timeout(300000);
		await vscode.workspace.getConfiguration('gs-behave-bdd').update(
			'discoveryDepth', 0, vscode.ConfigurationTarget.Workspace
		);
		// Trigger re-discovery (integration test guard blocks onDidChangeConfiguration)
		await instances.configurationChangedHandler(undefined, undefined, true);

		const state = await waitForTestTree(
			() => {
				const entry = instances.getDiscoveryEntry(wkspUri);
				if (!entry) return { noEntry: true as const };
				if (entry.source === 'config-file' && (
					entry.configFileUri?.fsPath.includes('app-a') ||
					entry.configFileUri?.fsPath.includes('app-b') ||
					entry.configFileUri?.fsPath.includes('app-c')
				)) {
					return undefined; // still seeing subdir config — not yet updated
				}
				return { entry };
			},
			{ intervalMs: 100, timeoutMs: 15000 }
		);

		if ('noEntry' in state) {
			assert.ok(true, 'no DiscoveryEntry when discoveryDepth=0 and no root config');
		} else {
			assert.notStrictEqual(state.entry!.source, 'config-file',
				'discoveryDepth=0 should not discover subdirectory configs');
		}
	});

	test('restoring discoveryDepth re-discovers subdirectory config', async function () {
		this.timeout(300000);
		await vscode.workspace.getConfiguration('gs-behave-bdd').update(
			'discoveryDepth', undefined, vscode.ConfigurationTarget.Workspace
		);
		// Trigger re-discovery (integration test guard blocks onDidChangeConfiguration)
		await instances.configurationChangedHandler(undefined, undefined, true);

		const state = await waitForTestTree(
			() => {
				const entry = instances.getDiscoveryEntry(wkspUri);
				if (!entry) return undefined;
				if (entry.source !== 'config-file') return undefined;
				return { entry };
			},
			{ intervalMs: 100, timeoutMs: 15000 }
		);

		assert.strictEqual(state.entry.source, 'config-file', 're-discovery should find config-file');
	});

}).timeout(900000);
