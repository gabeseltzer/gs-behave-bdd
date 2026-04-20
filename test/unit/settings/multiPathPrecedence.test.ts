// Unit tests for D-11 precedence ladder in WorkspaceSettings constructor (TEST-12):
// featuresPaths (plural) > featuresPath (singular) > convention ["features"]
//
// Constructs real WorkspaceSettings instances with stubbed external dependencies
// to verify the precedence chain produces correct plural/singular field values.

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as fs from 'fs';
import * as common from '../../../src/common';
import * as configModule from '../../../src/configuration';
import { WorkspaceSettings, WindowSettings } from '../../../src/settings';
import { Logger } from '../../../src/logger';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscode = require('vscode');

const MOCK_URI = vscode.Uri.file('/fake/workspace');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeConfig(values: Record<string, unknown>): any {
  return {
    get: (key: string) => values[key],
    has: () => false,
    inspect: (key: string) => ({
      key,
      defaultValue: undefined,
      globalValue: undefined,
      workspaceValue: values[key],
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

function mockLogger(): Logger {
  return {
    logInfo: sinon.stub(),
    logInfoAllWksps: sinon.stub(),
    showWarn: sinon.stub(),
  } as unknown as Logger;
}

// Base config values that every WorkspaceSettings constructor call needs
const BASE_CFG = {
  envVarOverrides: {},
  envVarPresets: {},
  activeEnvVarPreset: '',
  projectPath: '',
  justMyCode: true,
  runParallel: false,
  importStrategy: 'useBundled',
  stepDefinitionSearchTimeout: 20,
};

function buildSettings(overrides: Record<string, unknown>): WorkspaceSettings {
  const cfg = makeConfig({ ...BASE_CFG, featuresPath: 'features', ...overrides });
  return new WorkspaceSettings(MOCK_URI, cfg, makeWinSettings(), mockLogger());
}


suite('multiPathPrecedence (TEST-12, D-11)', () => {

  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(fs, 'existsSync').returns(true);
    sandbox.stub(common, 'getWorkspaceFolder').returns({ uri: MOCK_URI, name: 'test', index: 0 });
    sandbox.stub(common, 'getDiscoveryEntry').returns(undefined);
    sandbox.stub(common, 'findSubdirectorySync').returns('steps');
    sandbox.stub(common, 'getUrisOfWkspFoldersWithFeatures').returns([MOCK_URI]);
    sandbox.stub(configModule.config, 'extensionTempFilesUri').value(vscode.Uri.file('/tmp/gs-behave-bdd'));
  });

  teardown(() => {
    sandbox.restore();
  });


  suite('Rung 1: plural set (featuresPaths wins)', () => {

    test('SC#3: featuresPaths=[features,features-alt] produces featuresUris.length === 2', () => {
      const s = buildSettings({ featuresPaths: ['features', 'features-alt'] });
      assert.strictEqual(s.featuresUris.length, 2);
      assert.ok(s.featuresUris[0].fsPath.endsWith('features'));
      assert.ok(s.featuresUris[1].fsPath.includes('features-alt'));
    });

    test('plural wins even when singular is also set', () => {
      const s = buildSettings({ featuresPaths: ['a', 'b'], featuresPath: 'c' });
      assert.strictEqual(s.projectRelativeFeaturesPaths.length, 2);
      assert.strictEqual(s.projectRelativeFeaturesPaths[0], 'a');
      assert.strictEqual(s.projectRelativeFeaturesPaths[1], 'b');
    });

    test('singular getter returns [0] of plural', () => {
      const s = buildSettings({ featuresPaths: ['first', 'second'] });
      assert.strictEqual(s.projectRelativeFeaturesPath, 'first');
      assert.strictEqual(s.featuresUri.toString(), s.featuresUris[0].toString());
    });
  });


  suite('Rung 2: singular set (featuresPaths absent)', () => {

    test('singular featuresPath used when featuresPaths is undefined', () => {
      const s = buildSettings({ featuresPaths: undefined, featuresPath: 'my-tests' });
      assert.strictEqual(s.projectRelativeFeaturesPaths.length, 1);
      assert.strictEqual(s.projectRelativeFeaturesPath, 'my-tests');
    });
  });


  suite('Rung 3: neither set (convention fallback)', () => {

    test('empty featuresPath falls to convention "features"', () => {
      const s = buildSettings({ featuresPaths: undefined, featuresPath: '' });
      assert.strictEqual(s.projectRelativeFeaturesPaths.length, 1);
      assert.strictEqual(s.projectRelativeFeaturesPath, 'features');
    });
  });


  suite('empty-array treated as unset (Pitfall 4)', () => {

    test('featuresPaths=[] falls to singular', () => {
      const s = buildSettings({ featuresPaths: [], featuresPath: 'custom' });
      assert.strictEqual(s.projectRelativeFeaturesPaths.length, 1);
      assert.strictEqual(s.projectRelativeFeaturesPath, 'custom');
    });
  });


  suite('all-empty plural falls to singular', () => {

    test('featuresPaths with only whitespace entries falls to singular', () => {
      const s = buildSettings({ featuresPaths: ['', '  '], featuresPath: 'fallback' });
      assert.strictEqual(s.projectRelativeFeaturesPaths.length, 1);
      assert.strictEqual(s.projectRelativeFeaturesPath, 'fallback');
    });
  });


  suite('invalid-entry: "." rejection (D-07)', () => {

    test('"." entry causes WkspError with expected message', () => {
      assert.throws(
        () => buildSettings({ featuresPaths: ['.'] }),
        (err: Error) => err.message.includes('not a valid')
      );
    });
  });


  suite('leading/trailing separator stripping', () => {

    test('leading and trailing forward slashes are stripped', () => {
      const s = buildSettings({ featuresPaths: ['/features/'] });
      assert.strictEqual(s.projectRelativeFeaturesPath, 'features');
    });

    test('leading and trailing backslashes are stripped', () => {
      const s = buildSettings({ featuresPaths: ['\\features\\'] });
      assert.strictEqual(s.projectRelativeFeaturesPath, 'features');
    });
  });


  suite('per-entry computed fields', () => {

    test('stepsSearchUris has same length as featuresUris', () => {
      const s = buildSettings({ featuresPaths: ['features', 'features-alt'] });
      assert.strictEqual(s.stepsSearchUris.length, s.featuresUris.length);
    });

    test('workspaceRelativeFeaturesPaths includes projectPath prefix', () => {
      const s = buildSettings({
        projectPath: 'project',
        featuresPaths: ['a', 'b'],
      });
      assert.strictEqual(s.workspaceRelativeFeaturesPaths[0], 'project/a');
      assert.strictEqual(s.workspaceRelativeFeaturesPaths[1], 'project/b');
    });
  });

});
