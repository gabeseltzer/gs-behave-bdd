import * as vscode from 'vscode';
import * as assert from 'assert';
import { TestSupport } from '../../../src/extension';
import { TestWorkspaceConfig, TestWorkspaceConfigWithWkspUri } from '../../../src/testWorkspaceConfig';
import { getAllTestItems, getScenarioTests, uriId } from '../../../src/common';
import { createDebugTracker } from './debugHelpers';

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
	const extension = vscode.extensions.getExtension('gabeseltzer.behave-vsc-gs');
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

	test('debug session hits source breakpoint and continues', async function () {
		this.timeout(300000);

		const { wkspUri, instances } = await setupWorkspace();

		// Find the passing scenario (it hits step_inst which has `pass` on line 7)
		const passingScenario = findScenarioByName(instances, wkspUri, 'run a successful test');

		// Add a breakpoint at line 7 (0-indexed: line 6) of steps.py — the `pass` statement in step_inst
		const stepsUri = vscode.Uri.joinPath(wkspUri, 'features', 'steps', 'steps.py');
		const breakpointLocation = new vscode.Location(stepsUri, new vscode.Position(6, 0));
		const breakpoint = new vscode.SourceBreakpoint(breakpointLocation, true);

		// Register the debug tracker to intercept stopped events and auto-continue
		const tracker = createDebugTracker();

		try {
			vscode.debug.addBreakpoints([breakpoint]);

			const runRequest = new vscode.TestRunRequest([passingScenario]);
			const results = await instances.runHandler(true, runRequest);

			// Assert the breakpoint was hit
			assert.ok(tracker.result.breakpointHit, 'breakpoint should have been hit');
			assert.ok(
				tracker.result.stoppedEvents.some(e => e.reason === 'breakpoint'),
				'should have a stopped event with reason "breakpoint"'
			);

			// Assert the run still completed with correct results
			assert.ok(results, 'runHandler should return results');
			assert.ok(results.length > 0, 'should have at least one result');
			const passResult = results.find(r => r.scenario.scenarioName === 'run a successful test');
			assert.ok(passResult, 'should find result for passing scenario');
			assert.ok(passResult.scenario.result, 'result should not be undefined (was the run cancelled?)');
			assert.strictEqual(passResult.scenario.result, 'passed', 'scenario should still pass after breakpoint continue');
		}
		finally {
			vscode.debug.removeBreakpoints([breakpoint]);
			tracker.dispose();
		}
	});

	test('debug session pauses on raised exception and continues', async function () {
		this.timeout(300000);

		const { wkspUri, instances } = await setupWorkspace();

		// Find the failing scenario — it hits `assert successful_or_failing == "successful"` which raises AssertionError
		const failingScenario = findScenarioByName(instances, wkspUri, 'run a failing test');

		// Register the debug tracker with exception breakpoint interception enabled
		// This injects 'raised' into the setExceptionBreakpoints DAP request filters
		const tracker = createDebugTracker({ interceptExceptionBreakpoints: true });

		try {
			const runRequest = new vscode.TestRunRequest([failingScenario]);
			const results = await instances.runHandler(true, runRequest);

			// Assert an exception pause was detected
			assert.ok(tracker.result.exceptionHit, 'should have paused on a raised exception');
			assert.ok(
				tracker.result.stoppedEvents.some(e => e.reason === 'exception'),
				'should have a stopped event with reason "exception"'
			);

			// Assert the run still completed (the tracker auto-continued)
			assert.ok(results, 'runHandler should return results');
			assert.ok(results.length > 0, 'should have at least one result');
			const failResult = results.find(r => r.scenario.scenarioName === 'run a failing test');
			assert.ok(failResult, 'should find result for failing scenario');
			assert.ok(failResult.scenario.result, 'result should not be undefined (was the run cancelled?)');
			assert.ok(
				failResult.scenario.result.startsWith('failed'),
				`failing scenario should have result starting with "failed", got: "${failResult.scenario.result}"`
			);
		}
		finally {
			tracker.dispose();
		}
	});
}).timeout(900000);
