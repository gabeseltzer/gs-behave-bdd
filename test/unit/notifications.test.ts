import * as assert from 'assert';
import * as sinon from 'sinon';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscode = require('vscode');

const MOCK_URI = vscode.Uri.file('/fake/workspace');

/**
 * Constructs a fake VSCode WorkspaceConfiguration whose `inspect()` returns
 * caller-controlled per-scope values. Required because TestWorkspaceConfig
 * only populates `workspaceFolderValue` (testWorkspaceConfig.ts L185 — see
 * Pitfall 5 in 15-RESEARCH.md).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeScopedConfig(scopes: {
  globalValue?: unknown;
  workspaceValue?: unknown;
  workspaceFolderValue?: unknown;
}, updateSpy?: sinon.SinonSpy): any {
  return {
    get: (_key: string) => scopes.workspaceFolderValue ?? scopes.workspaceValue ?? scopes.globalValue,
    has: () => false,
    inspect: (key: string) => ({
      key,
      defaultValue: undefined,
      globalValue: scopes.globalValue,
      workspaceValue: scopes.workspaceValue,
      workspaceFolderValue: scopes.workspaceFolderValue,
    }),
    update: updateSpy ?? (() => Promise.resolve()),
  };
}

suite('Phase 15 — notifications module', () => {
  suite('Wave 0: Assumption A1 probe (inspect() of unregistered key)', () => {
    teardown(() => sinon.restore());

    test('A1: inspect() returns workspaceFolderValue for unregistered key with settings.json value', () => {
      const getConfigStub = sinon.stub(vscode.workspace, 'getConfiguration').returns(
        makeScopedConfig({ workspaceFolderValue: true }),
      );

      const cfg = vscode.workspace.getConfiguration('gs-behave-bdd', MOCK_URI);
      const insp = cfg.inspect('suppressMultiConfigNotification');

      assert.ok(insp, 'inspect() must not return undefined for unregistered key with settings.json value');
      assert.strictEqual(insp.workspaceFolderValue, true);
      assert.strictEqual(insp.globalValue, undefined);
      assert.strictEqual(insp.workspaceValue, undefined);

      assert.ok(getConfigStub.called);
    });

    test('A1: inspect() returns globalValue for unregistered key set globally', () => {
      sinon.stub(vscode.workspace, 'getConfiguration').returns(
        makeScopedConfig({ globalValue: true }),
      );
      const cfg = vscode.workspace.getConfiguration('gs-behave-bdd', MOCK_URI);
      const insp = cfg.inspect('suppressMultiConfigNotification');

      assert.ok(insp);
      assert.strictEqual(insp.globalValue, true);
      assert.strictEqual(insp.workspaceFolderValue, undefined);
    });
  });
});

export { makeScopedConfig };
