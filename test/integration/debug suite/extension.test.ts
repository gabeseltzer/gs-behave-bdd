import * as vscode from 'vscode';
import * as assert from 'assert';
import { TestSupport } from '../../../src/extension';
import { TestWorkspaceConfig, TestWorkspaceConfigWithWkspUri } from '../../../src/testWorkspaceConfig';
import { getAllTestItems, getScenarioTests, uriId } from '../../../src/common';

let instances: TestSupport;

function getWorkspaceUri(): vscode.Uri {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	assert.ok(workspaceFolders, 'workspace folders should exist');
	const wkspFolder = workspaceFolders.find(folder => folder.uri.path.includes('simple'));
	assert.ok(wkspFolder, 'simple workspace folder should exist');
	return wkspFolder.uri;
}

async function setupTestSupport(): Promise<TestSupport> {
	if (instances) return instances;
	const extension = vscode.extensions.getExtension('gabeseltzer.behave-vsc');
	assert.ok(extension);
	assert.ok(extension.isActive);
	instances = await extension.activate() as TestSupport;
	instances.config.integrationTestRun = true;
	await new Promise(t => setTimeout(t, 3000));
	return instances;
}

async function setupWorkspace(): Promise<{ wkspUri: vscode.Uri; instances: TestSupport }> {
	const wkspUri = getWorkspaceUri();
	const inst = await setupTestSupport();

	const testConfig = new TestWorkspaceConfig({
		runParallel: false, multiRootRunWorkspacesInParallel: false,
		envVarOverrides: undefined, projectPath: undefined, featuresPath: undefined,
		justMyCode: true, xRay: false,
	});

	await inst.configurationChangedHandler(undefined, new TestWorkspaceConfigWithWkspUri(testConfig, wkspUri));
	await inst.parser.parseFilesForWorkspace(wkspUri, inst.testData, inst.ctrl, 'debugSuiteSetup', false);

	return { wkspUri, instances: inst };
}

function findScenarioByName(instances: TestSupport, wkspUri: vscode.Uri, scenarioName: string): vscode.TestItem {
	const wkspId = uriId(wkspUri);
	const allItems = getAllTestItems(wkspId, instances.ctrl.items);
	const scenarios = getScenarioTests(instances.testData, allItems);
	const match = scenarios.find(item => item.label === scenarioName);
	assert.ok(match, `scenario "${scenarioName}" should exist`);
	return match;
}

suite('debug suite', () => {

	suiteSetup(async function () {
		this.timeout(60000);
		await setupTestSupport();
	});

	test('debug run completes with passing result', async function () {
		this.timeout(300000);

		const { wkspUri, instances } = await setupWorkspace();

		// Find only the passing scenario
		const passingScenario = findScenarioByName(instances, wkspUri, 'run a successful test');

		// Run debug with just this one scenario
		const runRequest = new vscode.TestRunRequest([passingScenario]);
		const results = await instances.runHandler(true, runRequest);

		// Assert results returned
		assert.ok(results, 'runHandler should return results');
		assert.ok(results.length > 0, 'should have at least one result');

		// Assert the scenario passed
		const passResult = results.find(r => r.scenario.scenarioName === 'run a successful test');
		assert.ok(passResult, 'should find result for passing scenario');
		assert.ok(passResult.scenario.result, 'result should not be undefined (was the run cancelled?)');
		assert.strictEqual(passResult.scenario.result, 'passed', 'passing scenario should have result "passed"');
	});
}).timeout(900000);
