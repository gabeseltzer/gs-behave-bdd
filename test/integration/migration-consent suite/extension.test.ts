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
	dispatchMigrationAction,
} from '../../../src/migrations';

// 023-04: getDiagnosticCollection / decodeDiagnosticCode were deleted along
// with the Problems-pane surface. These local shims keep this file compiling;
// 023-05 will reshape the (already surface-agnostic, per CONTEXT.md) assertions
// below around the panel signal. Tests using these will fail at runtime in the
// interim — expected and documented in 023-04 SUMMARY.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDiagnosticCollection(): { forEach(cb: (uri: any, diags: any[]) => void): void } {
	return { forEach: () => undefined };
}
function decodeDiagnosticCode(_code: unknown): { entryId: string; case: 2 | 3; scope: number } | undefined {
	return undefined;
}


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
	// 260513-oh5 contract: drive() publishes the diagnostic + summary toast,
	// then we invoke dispatchMigrationAction directly (the same code path the
	// Code Action quick-fix triggers). Asserts the post-action settings.json
	// shape is unchanged from the prior toast-driven design.
	test('Test 2: Case 2 Migrate & delete migrates runParallel', async function () {
		this.timeout(60000);
		const stub = vscode.window.showInformationMessage as unknown as sinon.SinonStub;
		stub.resetHistory();
		// Summary toast has no buttons — return undefined so it's a pure no-op.
		stub.callsFake((async () => undefined) as unknown as typeof vscode.window.showInformationMessage);

		await clearCompleted();
		await swapSettings('case-2');
		await drive();
		await new Promise(t => setTimeout(t, 2000));

		// (2 — summary toast fired) The single summary toast must have fired,
		// signaling the user that there's a migration to handle in the Problems
		// pane.
		assert.ok(
			stub.getCalls().length >= 1,
			`expected summary toast to fire (got ${stub.getCalls().length} calls)`,
		);
		const summaryFired = stub.getCalls().some(c => /legacy behave-vsc setting/.test(String(c.args[0])));
		assert.ok(summaryFired, 'expected at least one summary toast naming the legacy keys');

		// (2 — diagnostic published) Locate the runParallel case-2 diagnostic
		// at WorkspaceFolder scope, then dispatch the migrate-and-delete action.
		const diagCollection = getDiagnosticCollection();
		let runParallelDiag: { code: string; scope: number } | undefined;
		diagCollection.forEach((_uri, diags) => {
			for (const d of diags) {
				const decoded = decodeDiagnosticCode(d.code);
				if (!decoded) continue;
				if (decoded.entryId === 'runParallel-from-behavevsc' && decoded.case === 2) {
					runParallelDiag = { code: String(d.code), scope: decoded.scope };
				}
			}
		});
		assert.ok(runParallelDiag, 'expected a runParallel-from-behavevsc case-2 diagnostic to be published');

		await dispatchMigrationAction({
			entryId: 'runParallel-from-behavevsc',
			case: 2,
			scope: runParallelDiag.scope as 1 | 2 | 3,
			action: 'migrate-and-delete',
			wkspUri: wkspUri.toString(),
		});
		// Let VS Code persist the cfg.update() writes to disk.
		await new Promise(t => setTimeout(t, 500));

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
	// 260513-oh5 contract: drive() publishes a case-3 diagnostic (case-3
	// always prompts regardless of migrationMode — D-A4.3), then we invoke
	// dispatchMigrationAction directly to perform the clean overwrite that
	// runOverwriteAtScope guarantees (per consent.ts: passes undefined as
	// destAtSameScope so the transform produces the legacy value verbatim).
	test('Test 3: Case 3 Overwrite & delete cleanly overwrites featuresPaths', async function () {
		this.timeout(60000);
		const stub = vscode.window.showInformationMessage as unknown as sinon.SinonStub;
		stub.resetHistory();
		stub.callsFake((async () => undefined) as unknown as typeof vscode.window.showInformationMessage);

		await clearCompleted();
		await swapSettings('case-3');
		await drive();
		await new Promise(t => setTimeout(t, 2000));

		// (3 — summary toast fired) Case 3 still prompts via the summary toast.
		assert.ok(
			stub.getCalls().some(c => /legacy behave-vsc setting/.test(String(c.args[0]))),
			'expected summary toast for the case-3 hit',
		);

		// (3 — case-3 diagnostic for featuresPath published)
		const diagCollection = getDiagnosticCollection();
		let featuresPathDiag: { scope: number } | undefined;
		diagCollection.forEach((_uri, diags) => {
			for (const d of diags) {
				const decoded = decodeDiagnosticCode(d.code);
				if (!decoded) continue;
				if (decoded.entryId === 'featuresPath-from-behavevsc' && decoded.case === 3) {
					featuresPathDiag = { scope: decoded.scope };
				}
			}
		});
		assert.ok(featuresPathDiag, 'expected a featuresPath-from-behavevsc case-3 diagnostic');

		await dispatchMigrationAction({
			entryId: 'featuresPath-from-behavevsc',
			case: 3,
			scope: featuresPathDiag.scope as 1 | 2 | 3,
			action: 'overwrite-and-delete',
			wkspUri: wkspUri.toString(),
		});
		await new Promise(t => setTimeout(t, 500));

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
			`featuresPaths should be exactly ['features-alt'] (clean overwrite — runOverwriteAtScope passes undefined as destAtSameScope); got: ${JSON.stringify(paths)}`,
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
