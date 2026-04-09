// Tests for the verboseLogging setting:
// - WindowSettings reads the boolean correctly
// - logSettings summarises presets by default (verboseLogging=false)
// - logSettings dumps full preset contents when verboseLogging=true

import * as assert from 'assert';
import * as sinon from 'sinon';
import { WindowSettings, WorkspaceSettings } from '../../../src/settings';
import * as configModule from '../../../src/configuration';
import * as commonModule from '../../../src/common';

// Reuse the makeConfig helper pattern from legacyFallback tests
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


suite('verboseLogging setting', () => {

  suite('WindowSettings reads verboseLogging', () => {

    test('defaults to false', () => {
      const cfg = makeConfig(WIN_DEFAULTS);
      const settings = new WindowSettings(cfg);
      assert.strictEqual(settings.verboseLogging, false);
    });

    test('reads true when explicitly set', () => {
      const cfg = makeConfig({ ...WIN_DEFAULTS, verboseLogging: true });
      const settings = new WindowSettings(cfg);
      assert.strictEqual(settings.verboseLogging, true);
    });

    test('legacy fallback uses legacy value when new key is not explicit', () => {
      const newCfg = makeConfig(WIN_DEFAULTS); // not in explicitKeys
      const legacyCfg = makeConfig({ verboseLogging: true });
      const settings = new WindowSettings(newCfg, legacyCfg);
      assert.strictEqual(settings.verboseLogging, true);
    });

    test('new explicit value wins over legacy', () => {
      const newCfg = makeConfig({ ...WIN_DEFAULTS, verboseLogging: false }, ['verboseLogging']);
      const legacyCfg = makeConfig({ verboseLogging: true });
      const settings = new WindowSettings(newCfg, legacyCfg);
      assert.strictEqual(settings.verboseLogging, false);
    });
  });


  suite('logSettings preset output', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vscode = require('vscode');
    const mockUri = vscode.Uri.file('/fake/workspace');

    // Minimal fake WorkspaceSettings-shaped object for calling logSettings via prototype
    function makeFakeWkspSettings(presets: { [name: string]: { [k: string]: string } }) {
      return {
        envVarPresets: presets,
        envVarOverrides: {},
        activeEnvVarPreset: '',
        justMyCode: true,
        runParallel: false,
        importStrategy: 'useBundled',
        stepDefinitionSearchTimeout: 20,
        workspaceRelativeProjectPath: '',
        projectRelativeFeaturesPath: 'features',
        uri: mockUri,
        name: 'test-workspace',
        id: 'test-id',
        projectUri: vscode.Uri.file('/fake/workspace'),
        featuresUri: vscode.Uri.file('/fake/workspace/features'),
        stepsSearchUri: vscode.Uri.file('/fake/workspace/features'),
        workspaceRelativeFeaturesPath: 'features',
        _warnings: [],
        _fatalErrors: [],
      };
    }

    let getUrisStub: sinon.SinonStub;

    setup(() => {
      // Stub getUrisOfWkspFoldersWithFeatures to return our mock URI
      getUrisStub = sinon.stub(commonModule, 'getUrisOfWkspFoldersWithFeatures').returns([mockUri]);
      // Stub config.extensionTempFilesUri
      sinon.stub(configModule.config, 'extensionTempFilesUri').value(vscode.Uri.file('/tmp/gs-behave-bdd'));
    });

    teardown(() => {
      sinon.restore();
    });

    function callLogSettings(
      fakeWksp: ReturnType<typeof makeFakeWkspSettings>,
      verboseLogging: boolean
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
      // loggedText is like "\ntest-workspace workspace settings:\n{...json...}"
      const jsonStart = loggedText.indexOf('{');
      return JSON.parse(loggedText.substring(jsonStart));
    }


    test('verboseLogging=false logs preset count instead of contents (multiple presets)', () => {
      const fakeWksp = makeFakeWkspSettings({
        dev: { API_URL: 'http://localhost:3000' },
        staging: { API_URL: 'https://staging.example.com' },
      });

      const loggedText = callLogSettings(fakeWksp, false);
      const settings = parseLoggedSettings(loggedText);

      assert.strictEqual(settings['envVarPresets'], '2 presets loaded');
    });

    test('verboseLogging=false logs singular "preset" for exactly 1 preset', () => {
      const fakeWksp = makeFakeWkspSettings({
        dev: { API_URL: 'http://localhost:3000' },
      });

      const loggedText = callLogSettings(fakeWksp, false);
      const settings = parseLoggedSettings(loggedText);

      assert.strictEqual(settings['envVarPresets'], '1 preset loaded');
    });

    test('verboseLogging=false logs "0 presets loaded" when no presets configured', () => {
      const fakeWksp = makeFakeWkspSettings({});

      const loggedText = callLogSettings(fakeWksp, false);
      const settings = parseLoggedSettings(loggedText);

      assert.strictEqual(settings['envVarPresets'], '0 presets loaded');
    });

    test('verboseLogging=true logs full preset contents', () => {
      const presets = {
        dev: { API_URL: 'http://localhost:3000', DEBUG: 'true' },
        staging: { API_URL: 'https://staging.example.com' },
      };
      const fakeWksp = makeFakeWkspSettings(presets);

      const loggedText = callLogSettings(fakeWksp, true);
      const settings = parseLoggedSettings(loggedText);

      // When verbose, the full object should be logged (not a summary string)
      assert.deepStrictEqual(settings['envVarPresets'], presets);
    });

    test('verboseLogging=true with empty presets logs empty object', () => {
      const fakeWksp = makeFakeWkspSettings({});

      const loggedText = callLogSettings(fakeWksp, true);
      const settings = parseLoggedSettings(loggedText);

      assert.deepStrictEqual(settings['envVarPresets'], {});
    });

    test('preset values are not present in log output when verboseLogging=false', () => {
      const fakeWksp = makeFakeWkspSettings({
        secret: { SECRET_KEY: 'super-secret-value-12345' },
      });

      const loggedText = callLogSettings(fakeWksp, false);

      assert.ok(!loggedText.includes('super-secret-value-12345'),
        'sensitive preset values should not appear in log output');
      assert.ok(!loggedText.includes('SECRET_KEY'),
        'preset variable names should not appear in log output');
      assert.ok(loggedText.includes('1 preset loaded'),
        'should show count summary instead');
    });
  });

});
