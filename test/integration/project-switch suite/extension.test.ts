import * as vscode from 'vscode';
import * as assert from 'assert';
import { TestSupport } from '../../../src/extension';
import { getAllTestItems, uriId } from '../../../src/common';
import { waitForTestTree } from '../suite-shared/waitForTestTree';
import { getProjectList, getActiveProject, setActiveProject } from '../../../src/discovery/projectList';

let instances: TestSupport;

function getWorkspaceUri(): vscode.Uri {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	assert.ok(workspaceFolders, 'workspace folders should exist');
	const wkspFolder = workspaceFolders.find(folder => folder.uri.path.includes('project-switch'));
	assert.ok(wkspFolder, 'project-switch workspace folder should exist');
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

function getFeatureLabels(wkspUri: vscode.Uri): string[] {
	const wkspId = uriId(wkspUri);
	const allItems = getAllTestItems(wkspId, instances.ctrl.items);
	return allItems
		.filter(item => item.uri?.fsPath.endsWith('.feature'))
		.map(item => item.label);
}

function findFeatureUri(wkspUri: vscode.Uri, nameFragment: string): vscode.Uri | undefined {
	const wkspId = uriId(wkspUri);
	const allItems = getAllTestItems(wkspId, instances.ctrl.items);
	const match = allItems.find(item =>
		item.uri?.fsPath.endsWith('.feature') && item.label.includes(nameFragment)
	);
	return match?.uri;
}

suite('project-switch suite', () => {

	let wkspUri: vscode.Uri;

	suiteSetup(async function () {
		this.timeout(60000);
		await setupTestSupport();
		wkspUri = getWorkspaceUri();
		// Trigger initial discovery
		await instances.configurationChangedHandler(undefined, undefined, true);
		// Wait for initial tree to populate
		await waitForTestTree(
			() => {
				const labels = getFeatureLabels(wkspUri);
				return labels.length > 0 ? labels : undefined;
			},
			{ intervalMs: 100, timeoutMs: 15000 }
		);
	});

	test('initial discovery finds sub-project features', async function () {
		this.timeout(300000);
		const labels = getFeatureLabels(wkspUri);
		assert.ok(labels.length > 0, `at least one feature should be visible, got: ${JSON.stringify(labels)}`);
	});

	test('switch to beta and verify tree rebuilds', async function () {
		this.timeout(300000);
		const projects = getProjectList(wkspUri);
		assert.ok(projects.length >= 2, `should discover at least 2 projects, got ${projects.length}`);

		const betaEntry = projects.find(p => p.label.includes('beta'));
		assert.ok(betaEntry, `beta project should exist in project list, got: ${projects.map(p => p.label).join(', ')}`);

		setActiveProject(wkspUri, betaEntry);
		await instances.configurationChangedHandler(undefined, undefined, true);

		const result = await waitForTestTree(
			() => {
				const labels = getFeatureLabels(wkspUri);
				const hasBeta = labels.some(l => l.includes('Beta Project'));
				return hasBeta ? labels : undefined;
			},
			{ intervalMs: 100, timeoutMs: 15000 }
		);

		assert.ok(result.some(l => l.includes('Beta Project')), 'Beta Project feature should be visible');
		assert.ok(!result.some(l => l.includes('Alpha Project')), 'Alpha Project feature should NOT be visible after switch');
	});

	test('step navigation works after switching to beta', async function () {
		this.timeout(300000);
		const betaFeatureUri = findFeatureUri(wkspUri, 'Beta Project');
		assert.ok(betaFeatureUri, 'beta feature URI should exist in test tree');

		// Line 3 (0-indexed) = "Given the beta service is running"
		const stepFileStep = instances.getStepFileStepForFeatureFileStep(betaFeatureUri, 3);
		assert.ok(stepFileStep, 'step mapping should resolve for beta feature step');
		assert.ok(
			stepFileStep.uri.fsPath.includes('beta'),
			`step should resolve to beta steps file, got: ${stepFileStep.uri.fsPath}`
		);
	});

	test('switch back to alpha and verify tree rebuilds', async function () {
		this.timeout(300000);
		const projects = getProjectList(wkspUri);
		const alphaEntry = projects.find(p => p.label.includes('alpha'));
		assert.ok(alphaEntry, `alpha project should exist in project list, got: ${projects.map(p => p.label).join(', ')}`);

		setActiveProject(wkspUri, alphaEntry);
		await instances.configurationChangedHandler(undefined, undefined, true);

		const result = await waitForTestTree(
			() => {
				const labels = getFeatureLabels(wkspUri);
				const hasAlpha = labels.some(l => l.includes('Alpha Project'));
				return hasAlpha ? labels : undefined;
			},
			{ intervalMs: 100, timeoutMs: 15000 }
		);

		assert.ok(result.some(l => l.includes('Alpha Project')), 'Alpha Project feature should be visible after switching back');
		assert.ok(!result.some(l => l.includes('Beta Project')), 'Beta Project feature should NOT be visible after switching back');
	});

}).timeout(900000);
