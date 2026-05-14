/**
 * panelViewModel.buildViewModel unit tests — quick task 260514-mur.
 *
 * Covers the single-folder de-duplication: in a single-folder workspace,
 * `.vscode/settings.json` is the single source for both Workspace and
 * WorkspaceFolder scopes, so the evaluator surfaces the same legacy key at
 * both. buildViewModel must suppress the WorkspaceFolder hit to avoid
 * rendering duplicate panel rows. Multi-root workspaces (workspaceFile
 * defined) must continue to emit both rows because the scopes are
 * genuinely independent there.
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as configModule from '../../../src/configuration';
import * as evaluatorModule from '../../../src/migrations/evaluator';
import { buildViewModel } from '../../../src/migrations/panelViewModel';
import type { MigrationEntry } from '../../../src/migrations';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscode = require('vscode');

const MOCK_FOLDER = { uri: vscode.Uri.file('/fake/workspace'), name: 'workspace', index: 0 };

const TEST_ENTRY: MigrationEntry<unknown, unknown> = {
  id: 'test-entry',
  sourceNamespace: 'behave-vsc',
  sourceKey: 'justMyCode',
  destNamespace: 'gs-behave-bdd',
  destKey: 'justMyCode',
  transform: () => ({ kind: 'skipDest', removeSource: false }),
};

function stubLogger(): void {
  sinon.stub(configModule.config, 'logger').value({ logInfo: sinon.spy() });
}

suite('buildViewModel — single-folder de-duplication (260514-mur)', () => {

  setup(() => {
    stubLogger();
    sinon.stub(vscode.workspace, 'workspaceFolders').value([MOCK_FOLDER]);
  });

  teardown(() => sinon.restore());

  test('single-folder mode: legacy key set at Workspace+WorkspaceFolder emits ONE row at Workspace', async () => {
    sinon.stub(vscode.workspace, 'workspaceFile').value(undefined);

    sinon.stub(evaluatorModule, 'evaluateAllMigrations').callsFake(async (_uri, hooks) => {
      // Simulate VS Code's single-folder behavior: same value reported at both scopes.
      hooks?.onCaseHit?.(2, TEST_ENTRY, vscode.ConfigurationTarget.Workspace);
      hooks?.onCaseHit?.(2, TEST_ENTRY, vscode.ConfigurationTarget.WorkspaceFolder);
      return [];
    });

    const vm = await buildViewModel();

    assert.strictEqual(vm.rows.length, 1, 'expected single de-duplicated row in single-folder mode');
    assert.strictEqual(vm.rows[0].scope, vscode.ConfigurationTarget.Workspace);
    assert.strictEqual(vm.empty, false);
  });

  test('multi-root mode: legacy key set at Workspace+WorkspaceFolder emits BOTH rows', async () => {
    sinon.stub(vscode.workspace, 'workspaceFile').value(vscode.Uri.file('/fake/x.code-workspace'));

    sinon.stub(evaluatorModule, 'evaluateAllMigrations').callsFake(async (_uri, hooks) => {
      hooks?.onCaseHit?.(2, TEST_ENTRY, vscode.ConfigurationTarget.Workspace);
      hooks?.onCaseHit?.(2, TEST_ENTRY, vscode.ConfigurationTarget.WorkspaceFolder);
      return [];
    });

    const vm = await buildViewModel();

    assert.strictEqual(vm.rows.length, 2, 'multi-root mode must keep both scopes (they are independent)');
    const scopes = vm.rows.map(r => r.scope).sort();
    assert.deepStrictEqual(
      scopes,
      [vscode.ConfigurationTarget.Workspace, vscode.ConfigurationTarget.WorkspaceFolder].sort(),
    );
  });

  test('single-folder mode: WorkspaceFolder-only hit is suppressed (no row)', async () => {
    // Edge case: evaluator reports WorkspaceFolder but not Workspace — still phantom
    // in single-folder mode because `.vscode/settings.json` is reported via the
    // workspaceValue path in practice. Suppressing prevents a stray ghost row.
    sinon.stub(vscode.workspace, 'workspaceFile').value(undefined);

    sinon.stub(evaluatorModule, 'evaluateAllMigrations').callsFake(async (_uri, hooks) => {
      hooks?.onCaseHit?.(2, TEST_ENTRY, vscode.ConfigurationTarget.WorkspaceFolder);
      return [];
    });

    const vm = await buildViewModel();

    assert.strictEqual(vm.rows.length, 0);
    assert.strictEqual(vm.empty, true);
  });

  test('case 3 with equal values collapses to 2 buttons (Delete old value / Skip)', async () => {
    sinon.stub(vscode.workspace, 'workspaceFile').value(undefined);

    sinon.stub(evaluatorModule, 'evaluateAllMigrations').callsFake(async (_uri, hooks) => {
      hooks?.onCaseHit?.(3, TEST_ENTRY, vscode.ConfigurationTarget.Workspace, { equalValues: true });
      return [];
    });

    const vm = await buildViewModel();

    assert.strictEqual(vm.rows.length, 1);
    assert.strictEqual(vm.rows[0].buttons.length, 2);
    assert.deepStrictEqual(
      vm.rows[0].buttons.map(b => b.action),
      ['keep-canonical-and-delete-legacy', 'keep-both'],
    );
    assert.deepStrictEqual(
      vm.rows[0].buttons.map(b => b.label),
      ['Delete old value', 'Skip'],
    );
  });

  test('case 3 with differing values keeps the full 4-button set', async () => {
    sinon.stub(vscode.workspace, 'workspaceFile').value(undefined);

    sinon.stub(evaluatorModule, 'evaluateAllMigrations').callsFake(async (_uri, hooks) => {
      hooks?.onCaseHit?.(3, TEST_ENTRY, vscode.ConfigurationTarget.Workspace, { equalValues: false });
      return [];
    });

    const vm = await buildViewModel();

    assert.strictEqual(vm.rows.length, 1);
    assert.strictEqual(vm.rows[0].buttons.length, 4);
    assert.deepStrictEqual(
      vm.rows[0].buttons.map(b => b.action),
      ['overwrite-and-delete', 'overwrite-and-keep', 'keep-canonical-and-delete-legacy', 'keep-both'],
    );
  });

  test('case 3 with missing equalValues meta defaults to full 4-button set', async () => {
    // Defensive: if a future caller forgets to pass meta, fall back to the full
    // conflict-resolution set so the user never silently loses the overwrite options.
    sinon.stub(vscode.workspace, 'workspaceFile').value(undefined);

    sinon.stub(evaluatorModule, 'evaluateAllMigrations').callsFake(async (_uri, hooks) => {
      hooks?.onCaseHit?.(3, TEST_ENTRY, vscode.ConfigurationTarget.Workspace);
      return [];
    });

    const vm = await buildViewModel();

    assert.strictEqual(vm.rows.length, 1);
    assert.strictEqual(vm.rows[0].buttons.length, 4);
  });

  test('single-folder mode: Global-scope hit is unaffected by the WorkspaceFolder suppression', async () => {
    sinon.stub(vscode.workspace, 'workspaceFile').value(undefined);

    sinon.stub(evaluatorModule, 'evaluateAllMigrations').callsFake(async (_uri, hooks) => {
      hooks?.onCaseHit?.(2, TEST_ENTRY, vscode.ConfigurationTarget.Global);
      return [];
    });

    const vm = await buildViewModel();

    assert.strictEqual(vm.rows.length, 1);
    assert.strictEqual(vm.rows[0].scope, vscode.ConfigurationTarget.Global);
  });
});
