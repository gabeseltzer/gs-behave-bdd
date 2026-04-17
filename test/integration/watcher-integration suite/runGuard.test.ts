import * as vscode from 'vscode';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import { TestSupport } from '../../../src/extension';
import { getAllTestItems, getScenarioTests, uriId, getUrisOfWkspFoldersWithFeatures, getDiscoveryEntry } from '../../../src/common';
import { checkRunGuard } from '../../../src/runners/testRunHandler';

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

function buildRequestForWorkspace(inst: TestSupport, wkspUri: vscode.Uri): vscode.TestRunRequest {
	const wkspId = uriId(wkspUri);
	const allItems = getAllTestItems(wkspId, inst.ctrl.items);
	const scenarios = getScenarioTests(inst.testData, allItems);
	// Use undefined (not empty array) for include when no scenarios — the ?? fallback in
	// checkRunGuard walks ctrl.items only when include is undefined/null, not [].
	const include = scenarios.length > 0 ? [scenarios[0]] : undefined;
	return new vscode.TestRunRequest(include);
}

function assertConfigErrorOnPyproject(wkspUri: vscode.Uri): void {
	// Sanity gate: if the parser precedence ever changes and behave.ini is no longer the first-hit winner,
	// this assertion catches it before the branch tests silently pass for the wrong reason.
	const entry = getDiscoveryEntry(wkspUri);
	assert.ok(entry, 'DiscoveryEntry should exist after cache refresh');
	assert.ok(entry.configError, 'configError must be populated after setup() — D-16 precedence trick failed if undefined');
	const errMsg = entry.configError.errorMessage;
	assert.ok(
		errMsg.toLowerCase().includes('pyproject.toml') || entry.configError.configFileUri.fsPath.endsWith('pyproject.toml'),
		`configError should reference pyproject.toml; got errorMessage="${errMsg}", configFileUri="${entry.configError.configFileUri.fsPath}"`
	);
}

suite('watcher-integration run guard', () => {

	let wkspUri: vscode.Uri;
	let behaveIniPath: string;
	let pyprojectPath: string;
	let behaveIniSnapshot: string | undefined;
	let showWarningMessageStub: sinon.SinonStub;
	let executeCommandStub: sinon.SinonStub;

	suiteSetup(async function () {
		this.timeout(60000);
		await setupTestSupport();
		wkspUri = getWorkspaceUri();
		behaveIniPath = path.join(wkspUri.fsPath, 'behave.ini');
		pyprojectPath = path.join(wkspUri.fsPath, 'pyproject.toml');
	});

	setup(() => {
		// D-16 precedence trick: behave.ini wins over pyproject.toml in configParser.ts precedence order.
		// To surface a malformed pyproject.toml as configError, we must remove behave.ini first.
		// Step 1: snapshot behave.ini content to memory (teardown restores it).
		behaveIniSnapshot = fs.readFileSync(behaveIniPath, 'utf8');
		// Step 2: unlink behave.ini so the parser advances past it.
		fs.unlinkSync(behaveIniPath);
		// Step 3: write malformed TOML. Unterminated table header + unterminated string — guaranteed smol-toml reject.
		fs.writeFileSync(pyprojectPath, '[tool.behave\nunterminated = "value\n', 'utf8');
		// Step 4: force cache refresh — this makes configParser retry, skip absent behave.ini, reach pyproject.toml,
		// fail to parse it, and populate DiscoveryEntry.configError.
		getUrisOfWkspFoldersWithFeatures(true);

		// Stub the modal UI so tests resolve deterministically without hanging CI.
		showWarningMessageStub = sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);
		executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves(undefined);
	});

	teardown(() => {
		sinon.restore();
		// Reverse the setup mutations in safe order:
		// 1. Unlink pyproject.toml (guarded by existsSync — best-effort).
		try {
			if (fs.existsSync(pyprojectPath)) fs.unlinkSync(pyprojectPath);
		} catch {
			// best-effort; don't mask test failures
		}
		// 2. Restore behave.ini from snapshot so subsequent suites / CI state stay clean.
		try {
			if (behaveIniSnapshot !== undefined) {
				fs.writeFileSync(behaveIniPath, behaveIniSnapshot, 'utf8');
			}
		} catch {
			// best-effort; don't mask test failures
		}
		behaveIniSnapshot = undefined;
		// 3. Refresh cache so leftover configError state doesn't leak to the next setup() or the next suite.
		getUrisOfWkspFoldersWithFeatures(true);
	});

	// GUARD-02, D-03: Run Anyway branch
	test('Run Anyway branch returns true (proceed)', async function () {
		this.timeout(60000);
		assertConfigErrorOnPyproject(wkspUri);
		showWarningMessageStub.resolves('Run Anyway');
		const request = buildRequestForWorkspace(instances, wkspUri);
		const result = await checkRunGuard(request, instances.ctrl);
		assert.strictEqual(result, true, 'Run Anyway should return true');
		assert.ok(showWarningMessageStub.calledOnce, 'warning should have been shown exactly once');
	});

	// GUARD-02, D-03: Open Config File branch
	test('Open Config File branch returns false and invokes vscode.open', async function () {
		this.timeout(60000);
		assertConfigErrorOnPyproject(wkspUri);
		showWarningMessageStub.resolves('Open Config File');
		const request = buildRequestForWorkspace(instances, wkspUri);
		const result = await checkRunGuard(request, instances.ctrl);
		assert.strictEqual(result, false, 'Open Config File should return false (cancel run)');
		assert.ok(executeCommandStub.calledOnce, 'vscode.commands.executeCommand should have been called');
		assert.strictEqual(executeCommandStub.firstCall.args[0], 'vscode.open', 'first arg must be "vscode.open"');
		const openedUri = executeCommandStub.firstCall.args[1] as vscode.Uri;
		assert.ok(openedUri.toString().endsWith('pyproject.toml'), `should open pyproject.toml, got: ${openedUri.toString()}`);
	});

	// GUARD-02, D-03: Cancel branch
	test('Cancel branch returns false', async function () {
		this.timeout(60000);
		assertConfigErrorOnPyproject(wkspUri);
		showWarningMessageStub.resolves('Cancel');
		const request = buildRequestForWorkspace(instances, wkspUri);
		const result = await checkRunGuard(request, instances.ctrl);
		assert.strictEqual(result, false, 'Cancel should return false');
		assert.ok(executeCommandStub.notCalled, 'vscode.open should NOT be called on Cancel');
	});

	// D-15, 05-CONTEXT specifics: warning message must include exact production-string fragments
	test('warning message contains filename and "parse errors" fragments', async function () {
		this.timeout(60000);
		assertConfigErrorOnPyproject(wkspUri);
		showWarningMessageStub.resolves('Cancel');
		const request = buildRequestForWorkspace(instances, wkspUri);
		await checkRunGuard(request, instances.ctrl);
		assert.ok(showWarningMessageStub.calledOnce, 'warning should have been shown');
		const msgArg: string = showWarningMessageStub.firstCall.args[0];
		assert.ok(msgArg.includes("'pyproject.toml'"), `message must contain "'pyproject.toml'", got: "${msgArg}"`);
		assert.ok(msgArg.includes('parse errors'), `message must contain "parse errors", got: "${msgArg}"`);
	});

}).timeout(900000);
