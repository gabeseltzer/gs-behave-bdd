// Tests for logSettings plural output:
// - When WorkspaceSettings has multiple featuresUris, fullFeaturesPaths shows both comma-separated
// - When WorkspaceSettings has multiple projectRelativeFeaturesPaths, featuresPaths shows both comma-separated
// - Single-path control test still works

import * as assert from 'assert';
import * as sinon from 'sinon';
import { WindowSettings, WorkspaceSettings } from '../../../src/settings';
import * as configModule from '../../../src/configuration';
import * as commonModule from '../../../src/common';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeConfig(values: Record<string, unknown>, explicitKeys: string[] = []): any {
  return {
    get: (key: string) => values[key],
    has: () => false,
    inspect: (key: string) => ({
      key,
      defaultValue: undefined,
      globalValue: undefined,
      workspaceValue: explicitKeys.includes(key) ? values[key] : undefined,
      workspaceFolderValue: undefined,
    }),
    update: () => Promise.resolve(),
  };
}

const WIN_DEFAULTS = { multiRootRunWorkspacesInParallel: true, xRay: false, verboseLogging: false };


suite('logSettings plural output', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const vscode = require('vscode');
  const mockUri = vscode.Uri.file('/fake/workspace');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeFakeWkspSettings(overrides: Record<string, unknown> = {}): any {
    return {
      envVarPresets: {},
      envVarOverrides: {},
      activeEnvVarPreset: '',
      justMyCode: true,
      runParallel: false,
      importStrategy: 'useBundled',
      stepDefinitionSearchTimeout: 20,
      discoveryDepth: 3,
      discoveryStopOnFirstHit: false,
      suppressMultiConfigNotification: false,
      workspaceRelativeProjectPath: '',
      projectRelativeFeaturesPath: 'features',
      uri: mockUri,
      name: 'test-workspace',
      id: 'test-id',
      projectUri: vscode.Uri.file('/fake/workspace'),
      featuresUri: vscode.Uri.file('/fake/workspace/features'),
      featuresUris: [vscode.Uri.file('/fake/workspace/features')],
      stepsSearchUri: vscode.Uri.file('/fake/workspace/features'),
      stepsSearchUris: [vscode.Uri.file('/fake/workspace/features')],
      workspaceRelativeFeaturesPath: 'features',
      workspaceRelativeFeaturesPaths: ['features'],
      projectRelativeFeaturesPaths: ['features'],
      discoverySource: 'convention',
      configFileUri: undefined,
      _warnings: [],
      _fatalErrors: [],
      ...overrides,
    };
  }

  let getUrisStub: sinon.SinonStub;

  setup(() => {
    getUrisStub = sinon.stub(commonModule, 'getUrisOfWkspFoldersWithFeatures').returns([mockUri]);
    sinon.stub(configModule.config, 'extensionTempFilesUri').value(vscode.Uri.file('/tmp/gs-behave-bdd'));
  });

  teardown(() => {
    sinon.restore();
  });

  function callLogSettings(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fakeWksp: any,
    verboseLogging = false
  ): string {
    const winSettings = new WindowSettings(
      makeConfig({ ...WIN_DEFAULTS, verboseLogging })
    );

    let loggedText = '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockLogger: any = {
      logInfo: (text: string, _uri: unknown) => { loggedText = text; },
      logInfoAllWksps: () => { /* ignore instance settings log */ },
    };

    WorkspaceSettings.prototype.logSettings.call(
      fakeWksp,
      mockLogger,
      winSettings
    );

    return loggedText;
  }

  function parseLoggedSettings(loggedText: string): Record<string, unknown> {
    const jsonStart = loggedText.indexOf('{');
    return JSON.parse(loggedText.substring(jsonStart));
  }


  test('plural featuresUris are comma-separated in fullFeaturesPaths', () => {
    const fakeWksp = makeFakeWkspSettings({
      featuresUris: [
        vscode.Uri.file('/fake/workspace/features'),
        vscode.Uri.file('/fake/workspace/features-alt'),
      ],
      projectRelativeFeaturesPaths: ['features', 'features-alt'],
    });

    const loggedText = callLogSettings(fakeWksp);
    const settings = parseLoggedSettings(loggedText);

    const fullPaths = settings['fullFeaturesPaths'] as string;
    assert.ok(fullPaths.includes('/fake/workspace/features'), 'should contain first path');
    assert.ok(fullPaths.includes('/fake/workspace/features-alt'), 'should contain second path');
    assert.ok(fullPaths.includes(', '), 'should be comma-separated');
  });

  test('plural projectRelativeFeaturesPaths are comma-separated in featuresPaths', () => {
    const fakeWksp = makeFakeWkspSettings({
      featuresUris: [
        vscode.Uri.file('/fake/workspace/features'),
        vscode.Uri.file('/fake/workspace/features-alt'),
      ],
      projectRelativeFeaturesPaths: ['features', 'features-alt'],
    });

    const loggedText = callLogSettings(fakeWksp);
    const settings = parseLoggedSettings(loggedText);

    assert.strictEqual(settings['featuresPaths'], 'features, features-alt');
  });

  test('single-path control: featuresPaths shows single path without comma', () => {
    const fakeWksp = makeFakeWkspSettings({
      featuresUris: [vscode.Uri.file('/fake/workspace/features')],
      projectRelativeFeaturesPaths: ['features'],
    });

    const loggedText = callLogSettings(fakeWksp);
    const settings = parseLoggedSettings(loggedText);

    assert.strictEqual(settings['featuresPaths'], 'features');
    assert.ok(!(settings['featuresPaths'] as string).includes(','), 'single path should have no comma');
  });

});
