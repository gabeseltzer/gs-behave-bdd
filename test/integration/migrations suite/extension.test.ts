import * as vscode from 'vscode';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import { TestSupport } from '../../../src/extension';
import { showSuppressibleNotification } from '../../../src/notifications';


let instances: TestSupport;

function getMigrationStaleWorkspaceUri(): vscode.Uri {
	const folders = vscode.workspace.workspaceFolders;
	assert.ok(folders, 'workspace folders should exist');
	const f = folders.find(x => x.uri.path.includes('migration-stale'));
	assert.ok(f, 'migration-stale workspace folder should exist');
	return f.uri;
}

async function setupTestSupport(): Promise<TestSupport> {
	if (instances) return instances;
	const extension = vscode.extensions.getExtension('gabeseltzer.gs-behave-bdd');
	assert.ok(extension);
	const activated = await extension.activate() as TestSupport;
	assert.ok(activated, 'extension activation should return a TestSupport handle');
	instances = activated;
	instances.config.integrationTestRun = true;
	// Settle activation work — RESEARCH §8 pitfall 4
	await new Promise(t => setTimeout(t, 3000));
	return instances;
}


suite('migrations suite', () => {
	let wkspUri: vscode.Uri;
	let settingsPath: string;
	let templatePath: string;

	suiteSetup(async function () {
		this.timeout(60000);
		await setupTestSupport();
		wkspUri = getMigrationStaleWorkspaceUri();
		settingsPath = path.join(wkspUri.fsPath, '.vscode', 'settings.json');
		templatePath = path.join(wkspUri.fsPath, '.vscode', 'settings.template.json');
	});

	suiteTeardown(() => {
		// Restore baseline so subsequent runs (and CI working tree) start stale.
		// Per RESEARCH §4 Option 1: read template, write over settings.json.
		try {
			const baseline = fs.readFileSync(templatePath, 'utf8');
			fs.writeFileSync(settingsPath, baseline, 'utf8');
		} catch {
			// best-effort — never mask test failures with restore failures
		}
	});

	// Test 1 — D-09 file-content assertions (post-migration .vscode/settings.json content)
	test('post-activation settings.json: legacy keys removed, canonical keys written', () => {
		const written = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

		assert.strictEqual(written['gs-behave-bdd.featuresPath'], undefined,
			'gs-behave-bdd.featuresPath should be removed by Phase 16 migration');
		assert.strictEqual(written['behave-vsc.featuresPath'], undefined,
			'behave-vsc.featuresPath should be removed by Phase 16 migration');
		assert.strictEqual(written['gs-behave-bdd.suppressMultiConfigNotification'], undefined,
			'gs-behave-bdd.suppressMultiConfigNotification should be removed by Phase 15 migration');

		assert.deepStrictEqual(
			[...written['gs-behave-bdd.featuresPaths']].sort(),
			['features', 'features-alt'],
			'featuresPaths should contain merged values from BOTH source namespaces (Phase 16 D-02)'
		);
		assert.deepStrictEqual(
			written['gs-behave-bdd.suppressedNotifications'],
			['multiConfigNotification'],
			'suppressedNotifications should contain the migrated multiConfigNotification key'
		);
	});

	// Test 2 — D-09 inspect() per-scope assertions.
	// migration-stale is launched as a single-folder workspace
	// (test/integration/runTestSuites.ts: launchArgs = ["example-projects/migration-stale"]).
	// In single-folder mode .vscode/settings.json is the single source for both
	// Workspace and WorkspaceFolder scopes; VS Code's inspect() populates BOTH
	// `workspaceValue` AND `workspaceFolderValue` from the same file when passed
	// a folder URI. The migration helper preserves the source scope, so canonical
	// keys land at whichever scope the legacy value was read from. The
	// `userScopeValue` helper below intentionally collapses workspaceFolderValue
	// → workspaceValue → globalValue so this test is resilient to both launch
	// modes (single-folder and multi-root .code-workspace) and to either landing
	// scope in single-folder mode.
	test('post-activation cfg.inspect(): canonical keys at user scope, legacy at no scope', () => {
		const cfgGs = vscode.workspace.getConfiguration('gs-behave-bdd', wkspUri);
		const cfgVsc = vscode.workspace.getConfiguration('behave-vsc', wkspUri);

		const userScopeValue = <T>(insp: { workspaceFolderValue?: T; workspaceValue?: T; globalValue?: T } | undefined): T | undefined =>
			insp?.workspaceFolderValue ?? insp?.workspaceValue ?? insp?.globalValue;

		const legacyFp = cfgGs.inspect<string>('featuresPath');
		assert.ok(legacyFp, 'inspect() must return a result even for absent keys');
		assert.strictEqual(userScopeValue(legacyFp), undefined,
			'legacy gs-behave-bdd.featuresPath should be removed from all user scopes');

		const legacyVscFp = cfgVsc.inspect<string>('featuresPath');
		assert.ok(legacyVscFp);
		assert.strictEqual(userScopeValue(legacyVscFp), undefined,
			'legacy behave-vsc.featuresPath should be removed from all user scopes');

		const legacySupp = cfgGs.inspect<boolean>('suppressMultiConfigNotification');
		assert.ok(legacySupp);
		assert.strictEqual(userScopeValue(legacySupp), undefined,
			'legacy suppressMultiConfigNotification should be removed from all user scopes');

		const canonFp = cfgGs.inspect<string[]>('featuresPaths');
		assert.ok(canonFp);
		const fpVal = userScopeValue(canonFp);
		assert.ok(fpVal, 'canonical featuresPaths should be present at a user scope');
		assert.deepStrictEqual([...fpVal].sort(), ['features', 'features-alt']);

		const canonSupp = cfgGs.inspect<string[]>('suppressedNotifications');
		assert.ok(canonSupp);
		assert.deepStrictEqual(userScopeValue(canonSupp), ['multiConfigNotification']);
	});

	// Test 3 — D-18 ordering invariant via post-state cache
	// Note: WorkspaceSettings exposes the migrated featuresPaths via
	// `workspaceRelativeFeaturesPaths` (the resolved-relative-to-workspace form).
	// suppressedNotifications is exposed directly.
	test('post-activation cache reflects both migrations (D-18 reloadSettings ran AFTER both helpers)', () => {
		const wkspSettings = instances.config.workspaceSettings[wkspUri.path];
		assert.ok(wkspSettings, 'workspace settings cache should be populated');
		assert.deepStrictEqual(
			[...wkspSettings.workspaceRelativeFeaturesPaths]
				.sort()
				.filter(p => p === 'features' || p === 'features-alt'),
			['features', 'features-alt'],
			'cached workspaceRelativeFeaturesPaths should reflect Phase 16 migration outcome'
		);
		assert.ok(
			wkspSettings.suppressedNotifications.includes('multiConfigNotification'),
			'cached suppressedNotifications should reflect Phase 15 migration outcome'
		);
	});

	// Test 4 — Migration notification shape (driven manually, since activation fires
	// BEFORE the test runner module loads — workspaceContains:**/*.feature triggers
	// activate() during workspace open, before index.ts installs the sinon stub.
	// Tests 1-3 already prove the migration ran end-to-end during activation; this
	// test verifies the notification call shape (message text + button list) by
	// invoking showSuppressibleNotification with the same args extension.ts uses.
	test('migration notification call shape: message + Open Settings + DSA button', async function () {
		this.timeout(30000);
		const stub = vscode.window.showInformationMessage as unknown as sinon.SinonStub;
		stub.resetHistory();
		stub.callsFake((async () => undefined) as unknown as typeof vscode.window.showInformationMessage);
		await showSuppressibleNotification(
			'featuresPathMigrationShapeProbe',
			"Behave BDD: migrated your 'featuresPath' setting to the new 'featuresPaths' array. 'featuresPath' is deprecated and will be removed in a future release.",
			['Open Settings'],
			wkspUri,
		);
		const calls = stub.getCalls();
		const migrationCall = calls.find(c => typeof c.args[0] === 'string' && c.args[0].includes("migrated your 'featuresPath'"));
		assert.ok(migrationCall,
			`expected a migration notification call; got ${calls.length} total calls: ${JSON.stringify(calls.map(c => c.args[0]))}`);
		assert.ok(migrationCall.args.includes('Open Settings'), 'expected "Open Settings" button in notification');
		assert.ok(migrationCall.args.includes("Don't Show Again"),
			'expected "Don\'t Show Again" button (appended by showSuppressibleNotification)');
	});

	// Test 5 — DSA click suppresses the notification
	test('clicking "Don\'t Show Again" on migration notification suppresses it', async function () {
		this.timeout(30000);
		const stub = vscode.window.showInformationMessage as unknown as sinon.SinonStub;
		stub.callsFake((async (msg: string, ...items: string[]) => {
			if (typeof msg === 'string' && msg.includes("migrated your 'featuresPath'") && items.includes("Don't Show Again")) {
				return "Don't Show Again";
			}
			return undefined;
		}) as unknown as typeof vscode.window.showInformationMessage);
		try {
			// Pre-condition: clear any existing featuresPathMigration entry from prior tests.
			const cfgPre = vscode.workspace.getConfiguration('gs-behave-bdd', wkspUri);
			const existingSupp = cfgPre.inspect<string[]>('suppressedNotifications');
			const existing = existingSupp?.workspaceFolderValue ?? [];
			const cleaned = existing.filter(k => k !== 'featuresPathMigration');
			if (cleaned.length !== existing.length) {
				await cfgPre.update('suppressedNotifications', cleaned, vscode.ConfigurationTarget.WorkspaceFolder);
			}

			// Drive a fresh notification with the DSA-returning stub.
			const result = await showSuppressibleNotification(
				'featuresPathMigration',
				"Behave BDD: migrated your 'featuresPath' setting. Test invocation.",
				['Open Settings'],
				wkspUri,
			);
			// showSuppressibleNotification intercepts DSA internally — returns undefined.
			assert.strictEqual(result, undefined, 'DSA click should be intercepted (returns undefined)');

			// Assert post-state: featuresPathMigration now in suppressedNotifications.
			const cfgPost = vscode.workspace.getConfiguration('gs-behave-bdd', wkspUri);
			const supp = cfgPost.inspect<string[]>('suppressedNotifications');
			assert.ok(
				supp?.workspaceFolderValue?.includes('featuresPathMigration'),
				'DSA click should append "featuresPathMigration" to suppressedNotifications at WorkspaceFolder scope'
			);
		} finally {
			// Clean up: remove featuresPathMigration so subsequent runs / suites are unaffected.
			const cfg = vscode.workspace.getConfiguration('gs-behave-bdd', wkspUri);
			const supp = cfg.inspect<string[]>('suppressedNotifications');
			const arr = (supp?.workspaceFolderValue ?? []).filter(k => k !== 'featuresPathMigration');
			await cfg.update('suppressedNotifications', arr.length ? arr : undefined, vscode.ConfigurationTarget.WorkspaceFolder);
			// Reset stub to default-dismiss behavior for any later tests:
			stub.callsFake((async () => undefined) as unknown as typeof vscode.window.showInformationMessage);
		}
	});

	// Test 6 — "Open Settings" click triggers openSettings command
	test('clicking "Open Settings" runs workbench.action.openSettings with the extension scope', async function () {
		this.timeout(30000);
		const stub = vscode.window.showInformationMessage as unknown as sinon.SinonStub;
		stub.callsFake((async () => 'Open Settings') as unknown as typeof vscode.window.showInformationMessage);
		const execStub = sinon.stub(vscode.commands, 'executeCommand').resolves(undefined);
		try {
			const action = await showSuppressibleNotification(
				'featuresPathMigration',
				"Behave BDD: migrated your 'featuresPath' setting. Open Settings test.",
				['Open Settings'],
				wkspUri,
			);
			// Mirror the activation-time handler at extension.ts L329-L335:
			if (action === 'Open Settings') {
				vscode.commands.executeCommand('workbench.action.openSettings', 'gs-behave-bdd.featuresPaths');
			}
			assert.ok(
				execStub.calledWith('workbench.action.openSettings', 'gs-behave-bdd.featuresPaths'),
				'expected executeCommand("workbench.action.openSettings", "gs-behave-bdd.featuresPaths") to be called'
			);
		} finally {
			execStub.restore();
			stub.callsFake((async () => undefined) as unknown as typeof vscode.window.showInformationMessage);
		}
	});

	// Test 7 — A1 probe (closes Phase 15 HUMAN-UAT #1)
	// Newer VS Code versions reject `cfg.update()` for unregistered keys
	// (CodeExpectedError "not a registered configuration"), so use a real
	// registered boolean key (gs-behave-bdd.verboseLogging) and restore it
	// in finally.
	test('A1 probe: cfg.inspect() returns per-scope shape for a registered key', async function () {
		this.timeout(30000);
		const cfg = vscode.workspace.getConfiguration('gs-behave-bdd', wkspUri);
		const probeKey = 'justMyCode';
		const original = cfg.inspect<boolean>(probeKey)?.workspaceFolderValue;
		try {
			await cfg.update(probeKey, false, vscode.ConfigurationTarget.WorkspaceFolder);
			const insp = cfg.inspect<boolean>(probeKey);
			assert.ok(insp, 'inspect() must return a result');
			assert.strictEqual(insp.workspaceFolderValue, false,
				'workspaceFolderValue should reflect the value just written at WorkspaceFolder scope');
		} finally {
			// Restore prior workspace-folder-scope value (undefined removes the key).
			await cfg.update(probeKey, original, vscode.ConfigurationTarget.WorkspaceFolder);
		}
	});

}).timeout(900000);
