// Unit tests for the post-Phase-16 precedence ladder in WorkspaceSettings constructor (TEST-12):
// featuresPaths (plural, non-empty after whitespace filter) > convention ["features"]
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
import { TestWorkspaceConfig } from '../../../src/testWorkspaceConfig';

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
  discoveryDepth: 3,
  discoveryStopOnFirstHit: false,
  suppressedNotifications: [],
};

function buildSettings(overrides: Record<string, unknown>): WorkspaceSettings {
  const cfg = makeConfig({ ...BASE_CFG, ...overrides });
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

    test('singular getter returns [0] of plural', () => {
      const s = buildSettings({ featuresPaths: ['first', 'second'] });
      assert.strictEqual(s.projectRelativeFeaturesPath, 'first');
      assert.strictEqual(s.featuresUri.toString(), s.featuresUris[0].toString());
    });
  });


  suite('Convention fallback (was R3 — still last rung)', () => {

    test('plural undefined falls to convention "features"', () => {
      const s = buildSettings({ featuresPaths: undefined });
      assert.strictEqual(s.projectRelativeFeaturesPaths.length, 1);
      assert.strictEqual(s.projectRelativeFeaturesPath, 'features');
    });
  });


  suite('empty-array treated as unset (Pitfall 4)', () => {

    test('featuresPaths=[] falls to convention "features"', () => {
      const s = buildSettings({ featuresPaths: [] });
      assert.strictEqual(s.projectRelativeFeaturesPaths.length, 1);
      assert.strictEqual(s.projectRelativeFeaturesPath, 'features');
    });
  });


  suite('all-empty plural falls to convention', () => {

    test('featuresPaths with only whitespace entries falls to convention "features"', () => {
      const s = buildSettings({ featuresPaths: ['', '  '] });
      assert.strictEqual(s.projectRelativeFeaturesPaths.length, 1);
      assert.strictEqual(s.projectRelativeFeaturesPath, 'features');
    });
  });


  suite('invalid-entry: "." rejection (D-07)', () => {

    test('"." entry causes WkspError with the generic short-toast shape', () => {
      // 260518-hyz Task 3: the thrown WkspError now carries the short toast text
      // (the verbose "... is not a valid ..." detail is logged to the output
      // channel before the throw, not embedded in the toast). For a single fatal
      // that isn't a simple project-path/features-path "not found" sentence,
      // buildFatalToast falls back to the generic "has invalid settings" shape.
      assert.throws(
        () => buildSettings({ featuresPaths: ['.'] }),
        (err: Error) => err.message.includes('invalid settings')
                     && err.message.includes('Tests cannot load')
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



  suite('TestWorkspaceConfig featuresPaths default (Pitfall 5)', () => {
    test('get("featuresPaths") returns [] when no featuresPaths passed', () => {
      const tc = new TestWorkspaceConfig({
        envVarOverrides: {},
        justMyCode: true,
        multiRootRunWorkspacesInParallel: true,
        runParallel: false,
        xRay: false,
      });
      const result = tc.get<string[]>('featuresPaths');
      assert.ok(Array.isArray(result), 'should return an array');
      assert.strictEqual(result.length, 0, 'should be empty array');
    });
  });

});
