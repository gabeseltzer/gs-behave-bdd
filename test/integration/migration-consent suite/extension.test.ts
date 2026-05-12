import * as vscode from 'vscode';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import { TestSupport } from '../../../src/extension';
import {
	MIGRATION_REGISTRY,
	evaluateAllMigrations,
	runConsentFlow,
	readMigrationMode,
	type ConsentHit,
} from '../../../src/migrations';


let instances: TestSupport;

function getMigrationConsentWorkspaceUri(): vscode.Uri {
	const folders = vscode.workspace.workspaceFolders;
	assert.ok(folders, 'workspace folders should exist');
	const f = folders.find(x => x.uri.path.includes('migration-consent'));
	assert.ok(f, 'migration-consent workspace folder should exist');
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
	// Settle activation work — mirrors migrations suite pattern.
	await new Promise(t => setTimeout(t, 3000));
	return instances;
}


suite('migration-consent suite', () => {
	let wkspUri: vscode.Uri;
	let settingsPath: string;
	let case1Path: string;
	let case2Path: string;
	let case3Path: string;

	// Drive the consent flow without going through the
	// `gs-behave-bdd.recheckMigrations` command (which shows a QuickPick and
	// would require additional stubbing). Mirrors activate()'s wiring in
	// src/extension.ts: evaluateAllMigrations collects hits, runConsentFlow
	// then prompts. The recheck command is the user-facing way to re-trigger
	// this — see src/migrations/recheckCommand.ts.
	async function drive(): Promise<void> {
		const hits: ConsentHit[] = [];
		await evaluateAllMigrations(wkspUri, {
			onCaseHit: (mcase, entry, scope) => {
				if (mcase === 2 || mcase === 3) hits.push({ case: mcase, entry, scope });
			},
		});
		instances.config.reloadSettings(wkspUri);
		const mode = readMigrationMode(wkspUri);
		await runConsentFlow(wkspUri, hits, mode);
	}

	async function swapSettings(caseName: 'case-1' | 'case-2' | 'case-3'): Promise<void> {
		const src = caseName === 'case-1' ? case1Path : caseName === 'case-2' ? case2Path : case3Path;
		const body = fs.readFileSync(src, 'utf8');
		fs.writeFileSync(settingsPath, body, 'utf8');
		// Let VS Code's config watcher pick up the on-disk change.
		await new Promise(t => setTimeout(t, 500));
	}

	async function clearCompleted(): Promise<void> {
		const cfg = vscode.workspace.getConfiguration('gs-behave-bdd', wkspUri);
		await cfg.update('completedMigrations', undefined, vscode.ConfigurationTarget.WorkspaceFolder);
	}

	suiteSetup(async function () {
		this.timeout(60000);
		await setupTestSupport();
		wkspUri = getMigrationConsentWorkspaceUri();
		settingsPath = path.join(wkspUri.fsPath, '.vscode', 'settings.json');
		case1Path = path.join(wkspUri.fsPath, '.vscode', 'settings.case-1.json');
		case2Path = path.join(wkspUri.fsPath, '.vscode', 'settings.case-2.json');
		case3Path = path.join(wkspUri.fsPath, '.vscode', 'settings.case-3.json');
	});

	suiteTeardown(() => {
		// Restore baseline (case-1 = empty object) so the working tree stays clean.
		try {
			const baseline = fs.readFileSync(case1Path, 'utf8');
			fs.writeFileSync(settingsPath, baseline, 'utf8');
		} catch {
			// best-effort — never mask test failures with restore failures
		}
	});

	// Test 0 — Pre-flight: CLEANUP-01 runtime reads only canonical keys.
	// Seed only the legacy `behave-vsc.runParallel = true` (case-2 seed) and
	// confirm the runtime cache reflects the canonical default (false), not
	// the legacy value. This pins the cleanup that 022-01 landed.
	test('Test 0: post-cleanup runtime ignores legacy behave-vsc.* keys', async function () {
		this.timeout(30000);
		await clearCompleted();
		await swapSettings('case-2');
		instances.config.reloadSettings(wkspUri);
		const wkspSettings = instances.config.workspaceSettings[wkspUri.path];
		assert.ok(wkspSettings, 'workspace settings cache should be populated');
		assert.strictEqual(
			wkspSettings.runParallel, false,
			`runParallel should reflect the canonical default (false), not legacy behave-vsc.runParallel; got ${wkspSettings.runParallel}`,
		);
	});

	// Test 1: Case 1 silent finish — no legacy, no canonical for any entry.
	// Every registry entry hits case 1, ZERO prompts fire, every entry id ends
	// up in completedMigrations.
	test('Test 1: Case 1 silent — zero prompts, every registry id Finished', async function () {
		this.timeout(60000);
		const stub = vscode.window.showInformationMessage as unknown as sinon.SinonStub;
		stub.resetHistory();
		stub.callsFake((async () => undefined) as unknown as typeof vscode.window.showInformationMessage);

		await clearCompleted();
		await swapSettings('case-1');
		await drive();
		// Let the fire-and-forget consent flow settle (defensive — drive() awaits it).
		await new Promise(t => setTimeout(t, 2000));

		// Discriminator vs. "prompt fired and was dismissed": must be exactly zero calls.
		assert.strictEqual(
			stub.getCalls().length, 0,
			`Case 1 must fire ZERO showInformationMessage calls; got ${stub.getCalls().length}`,
		);

		const expectedIds = MIGRATION_REGISTRY.map(e => e.id);
		const completed =
			vscode.workspace.getConfiguration('gs-behave-bdd', wkspUri).get<string[]>('completedMigrations') ?? [];
		for (const id of expectedIds) {
			assert.ok(
				completed.includes(id),
				`expected '${id}' in completedMigrations, got: ${JSON.stringify(completed)}`,
			);
		}
	});

	// Test 2: Case 2 + 'Migrate & delete' — runParallel migration.
	// Legacy behave-vsc.runParallel = true, canonical unset → prompt fires →
	// stub returns 'Migrate & delete' → canonical written, legacy cleared,
	// migration id `runParallel-from-behavevsc` marked Finished.
	test('Test 2: Case 2 Migrate & delete migrates runParallel', async function () {
		this.timeout(60000);
		const stub = vscode.window.showInformationMessage as unknown as sinon.SinonStub;
		stub.resetHistory();
		stub.callsFake((async (_msg: string, ..._items: unknown[]) => {
			const buttons = _items.filter((x): x is string => typeof x === 'string');
			if (buttons.includes('Migrate & delete')) return 'Migrate & delete';
			return undefined;
		}) as unknown as typeof vscode.window.showInformationMessage);

		await clearCompleted();
		await swapSettings('case-2');
		await drive();
		await new Promise(t => setTimeout(t, 2000));

		const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
		assert.strictEqual(
			Object.prototype.hasOwnProperty.call(parsed, 'behave-vsc.runParallel'), false,
			`legacy key 'behave-vsc.runParallel' should be removed from settings.json after Migrate & delete; got: ${JSON.stringify(parsed)}`,
		);
		assert.strictEqual(
			parsed['gs-behave-bdd.runParallel'], true,
			`canonical 'gs-behave-bdd.runParallel' should be written as true; got: ${JSON.stringify(parsed)}`,
		);

		const cfg = vscode.workspace.getConfiguration('gs-behave-bdd', wkspUri);
		const insp = cfg.inspect<boolean>('runParallel');
		const canonScopeVal = insp?.workspaceFolderValue ?? insp?.workspaceValue;
		assert.strictEqual(
			canonScopeVal, true,
			'canonical runParallel should be set at the scope where the legacy lived',
		);

		const completed = cfg.get<string[]>('completedMigrations') ?? [];
		assert.ok(
			completed.includes('runParallel-from-behavevsc'),
			`expected 'runParallel-from-behavevsc' in completedMigrations, got: ${JSON.stringify(completed)}`,
		);
	});

	// Test 3: Case 3 + 'Overwrite & delete' — featuresPath migration.
	// Legacy behave-vsc.featuresPath = "features-alt" AND canonical
	// gs-behave-bdd.featuresPaths = ["features"] → 4-button prompt fires →
	// stub returns 'Overwrite & delete' → per consent.ts:185-204
	// runOverwriteAtScope passes undefined as destAtSameScope, so the
	// featuresPath transform produces a CLEAN OVERWRITE:
	// final featuresPaths === ['features-alt'] (prior canonical replaced).
	test('Test 3: Case 3 Overwrite & delete cleanly overwrites featuresPaths', async function () {
		this.timeout(60000);
		const stub = vscode.window.showInformationMessage as unknown as sinon.SinonStub;
		stub.resetHistory();
		stub.callsFake((async (_msg: string, ..._items: unknown[]) => {
			const buttons = _items.filter((x): x is string => typeof x === 'string');
			if (buttons.includes('Overwrite & delete')) return 'Overwrite & delete';
			return undefined;
		}) as unknown as typeof vscode.window.showInformationMessage);

		await clearCompleted();
		await swapSettings('case-3');
		await drive();
		await new Promise(t => setTimeout(t, 2000));

		// (3 — prompt fired) The case-3 prompt with the 4-button label set
		// must have fired at least once.
		assert.ok(
			stub.getCalls().some(c => c.args.some(a => a === 'Overwrite & delete')),
			'case-3 prompt with "Overwrite & delete" button should have fired',
		);

		// (3a — canonical contains overwrite value, exactly)
		const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
		const paths = parsed['gs-behave-bdd.featuresPaths'];
		assert.ok(Array.isArray(paths), `featuresPaths should be an array; got: ${JSON.stringify(paths)}`);
		assert.ok(
			paths.includes('features-alt'),
			`featuresPaths should include 'features-alt'; got: ${JSON.stringify(paths)}`,
		);
		assert.deepStrictEqual(
			paths, ['features-alt'],
			`featuresPaths should be exactly ['features-alt'] (clean overwrite per consent.ts:185-204 runOverwriteAtScope passes undefined as destAtSameScope); got: ${JSON.stringify(paths)}`,
		);

		// (3b — legacy key removed from settings.json)
		assert.strictEqual(
			Object.prototype.hasOwnProperty.call(parsed, 'behave-vsc.featuresPath'), false,
			`legacy 'behave-vsc.featuresPath' should be removed from settings.json after Overwrite & delete; got: ${JSON.stringify(parsed)}`,
		);

		// (3c — migration id marked Finished)
		const completed =
			vscode.workspace.getConfiguration('gs-behave-bdd', wkspUri).get<string[]>('completedMigrations') ?? [];
		assert.ok(
			completed.includes('featuresPath-from-behavevsc'),
			`expected 'featuresPath-from-behavevsc' in completedMigrations, got: ${JSON.stringify(completed)}`,
		);
	});

}).timeout(900000);
