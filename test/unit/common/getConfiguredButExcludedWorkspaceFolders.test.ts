// Regression: extension.ts uses this helper to find workspace folders that
// opted in to behave (have explicit projectPath or featuresPaths) but were
// filtered out of discovery (typically: configured path doesn't exist).
// Those workspaces are then marked fatal on the parser so the language-status
// item flips to Error severity.

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { getConfiguredButExcludedWorkspaceFolders } from '../../../src/common';

suite('getConfiguredButExcludedWorkspaceFolders (260518-hyz follow-up)', () => {
  function makeFolder(path: string, name: string): vscode.WorkspaceFolder {
    return { uri: vscode.Uri.file(path), name, index: 0 };
  }

  function makeConfigMock(opts: {
    projectPathSetAt?: 'workspaceValue' | 'workspaceFolderValue' | 'globalValue',
    featuresPathsSetAt?: 'workspaceValue' | 'workspaceFolderValue' | 'globalValue',
    featuresPathsValue?: string[],
  } = {}): vscode.WorkspaceConfiguration {
    const projInspect = {
      key: 'projectPath',
      defaultValue: '',
      ...(opts.projectPathSetAt ? { [opts.projectPathSetAt]: 'autotest' } : {}),
    };
    const featInspect = {
      key: 'featuresPaths',
      defaultValue: [],
      ...(opts.featuresPathsSetAt ? { [opts.featuresPathsSetAt]: opts.featuresPathsValue ?? ['features'] } : {}),
    };
    return {
      get: () => undefined,
      has: () => false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inspect: (key: string) => (key === 'projectPath' ? projInspect : featInspect) as any,
      update: () => Promise.resolve(),
    } as unknown as vscode.WorkspaceConfiguration;
  }

  teardown(() => sinon.restore());

  test('returns [] when workspaceFolders is undefined', () => {
    const result = getConfiguredButExcludedWorkspaceFolders(undefined, []);
    assert.deepStrictEqual(result, []);
  });

  test('returns [] when every folder is in the discovered set', () => {
    const f1 = makeFolder('c:/wksp1', 'w1');
    const f2 = makeFolder('c:/wksp2', 'w2');
    sinon.stub(vscode.workspace, 'getConfiguration').returns(makeConfigMock({ projectPathSetAt: 'workspaceValue' }));

    const result = getConfiguredButExcludedWorkspaceFolders([f1, f2], [f1.uri, f2.uri]);

    assert.deepStrictEqual(result, [],
      'when every folder was discovered, no folder is "excluded" — even ones with explicit settings');
  });

  test('returns folders that are NOT in discovered AND have projectPath explicitly set', () => {
    const excluded = makeFolder('c:/excluded', 'excluded');
    const ok = makeFolder('c:/ok', 'ok');
    sinon.stub(vscode.workspace, 'getConfiguration').callsFake((_section, scope) => {
      const uri = (scope as vscode.Uri | undefined)?.path ?? '';
      return uri.includes('/excluded')
        ? makeConfigMock({ projectPathSetAt: 'workspaceValue' })
        : makeConfigMock(); // no settings
    });

    const result = getConfiguredButExcludedWorkspaceFolders([excluded, ok], [ok.uri]);

    assert.strictEqual(result.length, 1, 'one folder is configured-but-excluded');
    assert.strictEqual(result[0].path, excluded.uri.path);
  });

  test('returns folders excluded by discovery that have featuresPaths explicitly set (non-empty)', () => {
    const excluded = makeFolder('c:/excluded-with-fp', 'fp');
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makeConfigMock({ featuresPathsSetAt: 'workspaceValue', featuresPathsValue: ['features'] })
    );

    const result = getConfiguredButExcludedWorkspaceFolders([excluded], []);

    assert.strictEqual(result.length, 1,
      'featuresPaths explicitly set with non-empty array must qualify as "configured"');
    assert.strictEqual(result[0].path, excluded.uri.path);
  });

  test('does NOT include folders excluded by discovery that have NO explicit gs-behave-bdd settings', () => {
    const folder = makeFolder('c:/unconfigured', 'unconfigured');
    sinon.stub(vscode.workspace, 'getConfiguration').returns(makeConfigMock()); // no settings

    const result = getConfiguredButExcludedWorkspaceFolders([folder], []);

    assert.deepStrictEqual(result, [],
      'a folder without explicit projectPath OR featuresPaths is not opted in — must not be flagged');
  });

  test('empty featuresPaths array is NOT treated as configured (must be non-empty)', () => {
    const folder = makeFolder('c:/empty-fp', 'empty-fp');
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makeConfigMock({ featuresPathsSetAt: 'workspaceValue', featuresPathsValue: [] })
    );

    const result = getConfiguredButExcludedWorkspaceFolders([folder], []);

    assert.deepStrictEqual(result, [],
      'an explicitly-set empty array is not a meaningful opt-in — must not be flagged');
  });

  test('honors projectPath set at any scope (workspaceValue / folderValue / globalValue)', () => {
    const scopes: Array<'workspaceValue' | 'workspaceFolderValue' | 'globalValue'> = [
      'workspaceValue', 'workspaceFolderValue', 'globalValue'
    ];
    for (const scope of scopes) {
      sinon.restore();
      const folder = makeFolder(`c:/${scope}`, scope);
      sinon.stub(vscode.workspace, 'getConfiguration').returns(
        makeConfigMock({ projectPathSetAt: scope })
      );
      const result = getConfiguredButExcludedWorkspaceFolders([folder], []);
      assert.strictEqual(result.length, 1, `projectPath set at ${scope} must qualify as configured`);
    }
  });
});
