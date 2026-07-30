// Tests for the verbose diagnostic logging added for "the extension silently does nothing"
// bug reports:
// - Logger.logVerbose writes to the output channel only when verboseLogging is on
// - verboseLoggingEnabled() never throws, even when settings are broken
// - logStepResolutionContext explains WHY a step failed to resolve

import * as assert from 'assert';
import * as sinon from 'sinon';
import { Logger, verboseLoggingEnabled } from '../../../src/logger';
import * as configModule from '../../../src/configuration';
import * as loggerModule from '../../../src/logger';
import * as commonModule from '../../../src/common';
import * as stepsParserModule from '../../../src/parsers/stepsParser';
import * as stepMappingsModule from '../../../src/parsers/stepMappings';
import * as featureParserModule from '../../../src/parsers/featureParser';
import { logStepResolutionContext } from '../../../src/handlers/providerHelpers';
import { buildDiagnosticReport } from '../../../src/handlers/diagnosticReportHandler';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscode = require('vscode');


function stubVerboseLogging(enabled: boolean) {
  sinon.stub(configModule.config, 'globalSettings').get(() => ({
    multiRootRunWorkspacesInParallel: true,
    xRay: false,
    verboseLogging: enabled,
  }));
}


suite('verbose diagnostic logging', () => {

  teardown(() => {
    sinon.restore();
  });


  suite('verboseLoggingEnabled', () => {

    test('returns false when verboseLogging is off', () => {
      stubVerboseLogging(false);
      assert.strictEqual(verboseLoggingEnabled(), false);
    });

    test('returns true when verboseLogging is on', () => {
      stubVerboseLogging(true);
      assert.strictEqual(verboseLoggingEnabled(), true);
    });

    test('returns false (does not throw) when settings cannot be read', () => {
      // a broken user config makes the globalSettings getter throw - a logging call must
      // never be the thing that surfaces that
      sinon.stub(configModule.config, 'globalSettings').get(() => { throw new Error("bad config"); });
      assert.strictEqual(verboseLoggingEnabled(), false);
    });

  });


  suite('Logger.logVerbose', () => {

    const wkspUri = vscode.Uri.file('/fake/workspace');
    let appended: string[];

    setup(() => {
      appended = [];
      sinon.stub(vscode.window, 'createOutputChannel').returns({
        append: () => { /* unused */ },
        appendLine: (t: string) => appended.push(t),
        clear: () => { /* unused */ },
        show: () => { /* unused */ },
        hide: () => { /* unused */ },
        dispose: () => { /* unused */ },
        replace: () => { /* unused */ },
        name: 'Behave BDD',
      });
    });

    test('writes nothing when verboseLogging is off', () => {
      stubVerboseLogging(false);
      new Logger().logVerbose("should not appear", wkspUri);
      assert.deepStrictEqual(appended, []);
    });

    test('writes to the workspace output channel with a [verbose] prefix when on', () => {
      stubVerboseLogging(true);
      new Logger().logVerbose("step navigation: gave up", wkspUri);
      assert.deepStrictEqual(appended, ["[verbose] step navigation: gave up"]);
    });

    test('does not throw when no wkspUri is supplied and no channels exist', () => {
      stubVerboseLogging(true);
      assert.doesNotThrow(() => new Logger().logVerbose("no channels yet"));
    });

  });


  suite('logStepResolutionContext', () => {

    const featureUri = vscode.Uri.file('/fake/workspace/features/thing.feature');

    // WorkspaceSettings-shaped stub; only the fields the helper reads are populated
    function makeWkspSettings(opts: { fileInFeatures: boolean }) {
      return {
        projectUri: vscode.Uri.file('/fake/workspace'),
        featuresUris: [vscode.Uri.file('/fake/workspace/features')],
        featuresUri: vscode.Uri.file('/fake/workspace/features'),
        discoverySource: 'behave.ini',
        configFileUri: vscode.Uri.file('/fake/workspace/behave.ini'),
        isFileInFeatures: () => opts.fileInFeatures,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
    }

    test('returns an empty string when verboseLogging is off (callers pay nothing)', () => {
      sinon.stub(loggerModule, 'verboseLoggingEnabled').returns(false);
      assert.strictEqual(logStepResolutionContext(featureUri), "");
    });

    test('reports missing workspace settings', () => {
      sinon.stub(loggerModule, 'verboseLoggingEnabled').returns(true);
      sinon.stub(commonModule, 'getWorkspaceSettingsForFile').returns(undefined);

      const detail = logStepResolutionContext(featureUri);
      assert.ok(detail.includes('no workspace settings for this file'), detail);
    });

    test('names a features-path misconfiguration when the file is outside every features path', () => {
      sinon.stub(loggerModule, 'verboseLoggingEnabled').returns(true);
      sinon.stub(commonModule, 'getWorkspaceSettingsForFile').returns(makeWkspSettings({ fileInFeatures: false }));

      const detail = logStepResolutionContext(featureUri);
      assert.ok(detail.includes('NOT inside any configured features path'), detail);
      assert.ok(detail.includes('featuresPaths'), detail);
    });

    test('calls out zero loaded step definitions', () => {
      sinon.stub(loggerModule, 'verboseLoggingEnabled').returns(true);
      sinon.stub(commonModule, 'getWorkspaceSettingsForFile').returns(makeWkspSettings({ fileInFeatures: true }));
      sinon.stub(stepsParserModule, 'getStepFileSteps').returns([]);
      sinon.stub(stepMappingsModule, 'getStepMappings').returns([]);

      const detail = logStepResolutionContext(featureUri);
      assert.ok(detail.includes('ZERO step definitions were loaded'), detail);
    });

    test('points at a pattern mismatch when definitions exist but none matched', () => {
      sinon.stub(loggerModule, 'verboseLoggingEnabled').returns(true);
      sinon.stub(commonModule, 'getWorkspaceSettingsForFile').returns(makeWkspSettings({ fileInFeatures: true }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sinon.stub(stepsParserModule, 'getStepFileSteps').returns([['k', {} as any]]);
      sinon.stub(stepMappingsModule, 'getStepMappings').returns([]);

      const detail = logStepResolutionContext(featureUri);
      assert.ok(detail.includes('step definitions ARE loaded but none matched'), detail);
      assert.ok(detail.includes('step definitions loaded: 1'), detail);
    });

  });


  suite('buildDiagnosticReport', () => {

    const wkspUri = vscode.Uri.file('/fake/workspace');

    setup(() => {
      stubVerboseLogging(false);
    });

    test('warns loudly when no workspace folder was recognised as a behave project', async () => {
      sinon.stub(commonModule, 'getUrisOfWkspFoldersWithFeatures').returns([]);

      const report = await buildDiagnosticReport();

      assert.ok(report.includes('===== Behave BDD diagnostic report ====='), report);
      assert.ok(report.includes('No workspace folder was recognised as a behave project'), report);
      // ms-python is absent from the mock, and that is fatal for this extension - say so
      assert.ok(report.includes('NOT INSTALLED'), report);
    });

    test('reports resolved paths and calls out zero loaded step definitions', async () => {
      sinon.stub(commonModule, 'getUrisOfWkspFoldersWithFeatures').returns([wkspUri]);
      sinon.stub(configModule.config, 'isWorkspaceSettingsFailed').returns(false);
      sinon.stub(configModule.config, 'getPythonExecutable').resolves('/usr/bin/python3');
      sinon.stub(configModule.config, 'workspaceSettings').get(() => ({
        [wkspUri.path]: {
          name: 'fake',
          projectUri: wkspUri,
          discoverySource: 'behave.ini',
          configFileUri: vscode.Uri.file('/fake/workspace/behave.ini'),
          featuresUris: [vscode.Uri.file('/fake/workspace/features')],
          featuresUri: vscode.Uri.file('/fake/workspace/features'),
          stepsSearchUris: [vscode.Uri.file('/fake/workspace/features')],
          importStrategy: 'useBundled',
          stepDefinitionSearchTimeout: 20,
          activeEnvVarPreset: '',
          envVarPresets: {},
        },
      }));
      sinon.stub(featureParserModule, 'getFeatureFileSteps').returns([['k', {}]] as never);
      sinon.stub(stepsParserModule, 'getStepFileSteps').returns([]);
      sinon.stub(stepMappingsModule, 'getStepMappings').returns([]);

      const report = await buildDiagnosticReport();

      assert.ok(report.includes('/usr/bin/python3'), report);
      assert.ok(report.includes('discovery source:  behave.ini'), report);
      assert.ok(report.includes('loaded step definitions:   0'), report);
      assert.ok(report.includes('ZERO step definitions loaded'), report);
      // the report is useful without verboseLogging, but should say it gets better with it
      assert.ok(report.includes('turn on gs-behave-bdd.verboseLogging'), report);
    });

    test('surfaces a workspace whose settings failed to load', async () => {
      sinon.stub(commonModule, 'getUrisOfWkspFoldersWithFeatures').returns([wkspUri]);
      sinon.stub(configModule.config, 'isWorkspaceSettingsFailed').returns(true);

      const report = await buildDiagnosticReport();

      assert.ok(report.includes('settings FAILED to load for this workspace'), report);
    });

  });

});
