// Unit tests for projectUri derivation from config-file discovery.
// When no explicit projectPath is set and discovery found a config in a subdirectory,
// projectUri should be derived from the config file's parent directory.

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as fs from 'fs';
import * as common from '../../../src/common';
import * as configModule from '../../../src/configuration';
import { WorkspaceSettings, WindowSettings } from '../../../src/settings';
import type { DiscoveryEntry } from '../../../src/common';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscode = require('vscode');

const MOCK_WKSP_URI = vscode.Uri.file('/fake/workspace');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeConfig(values: Record<string, unknown>, explicitKeys?: Set<string>): any {
  return {
    get: (key: string) => values[key],
    has: () => false,
    inspect: (key: string) => ({
      key,
      defaultValue: undefined,
      globalValue: undefined,
      workspaceValue: explicitKeys?.has(key) ? values[key] : undefined,
      workspaceFolderValue: undefined,
    }),
    update: () => Promise.resolve(),
  };
}

function makeWinSettings(): WindowSettings {
  return new WindowSettings(makeConfig({
    multiRootRunWorkspacesInParallel: true,
    xRay: false,
    verboseLogging: false,
  }));
}

function mockLogger() {
  return {
    logInfo: sinon.stub(),
    logInfoAllWksps: sinon.stub(),
    showWarn: sinon.stub(),
  } as unknown as import('../../../src/logger').Logger;
}

const BASE_CFG = {
  envVarOverrides: {},
  envVarPresets: {},
  activeEnvVarPreset: '',
  projectPath: '',
  justMyCode: true,
  runParallel: false,
  importStrategy: 'useBundled',
  stepDefinitionSearchTimeout: 20,
  discoveryDepth: 3,
  discoveryStopOnFirstHit: false,
  suppressedNotifications: [],
};

suite('projectUri derivation from config-file discovery', () => {

  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(fs, 'existsSync').returns(true);
    sandbox.stub(common, 'getWorkspaceFolder').returns({ uri: MOCK_WKSP_URI, name: 'test', index: 0 });
    sandbox.stub(common, 'getDiscoveryEntry').returns(undefined);
    sandbox.stub(common, 'findSubdirectorySync').returns('steps');
    sandbox.stub(common, 'getUrisOfWkspFoldersWithFeatures').returns([MOCK_WKSP_URI]);
    sandbox.stub(configModule.config, 'extensionTempFilesUri').value(vscode.Uri.file('/tmp/gs-behave-bdd'));
  });

  teardown(() => {
    sandbox.restore();
  });


  test('config-file in subdirectory sets projectUri to config parent dir', () => {
    const configFileUri = vscode.Uri.joinPath(MOCK_WKSP_URI, 'autotest', 'behave.ini');
    const autotestUri = vscode.Uri.joinPath(MOCK_WKSP_URI, 'autotest');
    const featuresUri = vscode.Uri.joinPath(autotestUri, 'features');

    const entry: DiscoveryEntry = {
      source: 'config-file',
      configFileUri,
      featuresUris: [featuresUri],
    };

    // projectPath not explicitly set (inspect returns undefined for workspaceValue)
    const cfg = makeConfig({ ...BASE_CFG });
    const s = new WorkspaceSettings(MOCK_WKSP_URI, cfg, makeWinSettings(), mockLogger(), entry);

    assert.ok(
      s.projectUri.fsPath.replace(/\\/g, '/').endsWith('/fake/workspace/autotest'),
      `projectUri should be config parent dir, got: ${s.projectUri.fsPath}`
    );
    assert.strictEqual(
      s.workspaceRelativeProjectPath, 'autotest',
      'workspaceRelativeProjectPath should be "autotest"'
    );
  });


  test('config-file at workspace root keeps projectUri as workspace root', () => {
    const configFileUri = vscode.Uri.joinPath(MOCK_WKSP_URI, 'behave.ini');
    const featuresUri = vscode.Uri.joinPath(MOCK_WKSP_URI, 'features');

    const entry: DiscoveryEntry = {
      source: 'config-file',
      configFileUri,
      featuresUris: [featuresUri],
    };

    const cfg = makeConfig({ ...BASE_CFG });
    const s = new WorkspaceSettings(MOCK_WKSP_URI, cfg, makeWinSettings(), mockLogger(), entry);

    assert.ok(
      s.projectUri.fsPath.replace(/\\/g, '/').endsWith('/fake/workspace'),
      `projectUri should be workspace root, got: ${s.projectUri.fsPath}`
    );
    assert.strictEqual(s.workspaceRelativeProjectPath, '', 'workspaceRelativeProjectPath should be empty');
  });


  test('explicit projectPath overrides config-file directory', () => {
    const configFileUri = vscode.Uri.joinPath(MOCK_WKSP_URI, 'autotest', 'behave.ini');
    const featuresUri = vscode.Uri.joinPath(MOCK_WKSP_URI, 'other', 'features');

    const entry: DiscoveryEntry = {
      source: 'config-file',
      configFileUri,
      featuresUris: [featuresUri],
    };

    // Simulate explicit projectPath in settings — inspect returns workspaceValue
    const cfgValues = { ...BASE_CFG, projectPath: 'other' };
    const cfg = makeConfig(cfgValues, new Set(['projectPath']));

    const s = new WorkspaceSettings(MOCK_WKSP_URI, cfg, makeWinSettings(), mockLogger(), entry);

    assert.ok(
      s.projectUri.fsPath.replace(/\\/g, '/').endsWith('/fake/workspace/other'),
      `explicit projectPath should win, got: ${s.projectUri.fsPath}`
    );
    assert.strictEqual(s.workspaceRelativeProjectPath, 'other');
  });


  test('convention discovery does NOT change projectUri', () => {
    const featuresUri = vscode.Uri.joinPath(MOCK_WKSP_URI, 'features');

    const entry: DiscoveryEntry = {
      source: 'convention',
      featuresUris: [featuresUri],
    };

    const cfg = makeConfig({ ...BASE_CFG });
    const s = new WorkspaceSettings(MOCK_WKSP_URI, cfg, makeWinSettings(), mockLogger(), entry);

    assert.ok(
      s.projectUri.fsPath.replace(/\\/g, '/').endsWith('/fake/workspace'),
      `convention discovery should keep projectUri as workspace root, got: ${s.projectUri.fsPath}`
    );
    assert.strictEqual(s.workspaceRelativeProjectPath, '');
  });

});
