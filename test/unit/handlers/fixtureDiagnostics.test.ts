// Unit tests for fixture diagnostics module - initialStepsParseComplete guard
import * as assert from 'assert';
import * as vscode from 'vscode';
import { validateFixtureTags } from '../../../src/handlers/fixtureDiagnostics';
import * as sinon from 'sinon';
import * as common from '../../../src/common';
import * as featureParser from '../../../src/parsers/featureParser';
import * as fixtureParser from '../../../src/parsers/fixtureParser';
import { config } from '../../../src/configuration';
import { parser } from '../../../src/extension';

suite('fixtureDiagnostics', () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(parser, 'initialStepsParseComplete').get(() => true);
  });
  teardown(() => sandbox.restore());

  function setupValidateStubs(opts: {
    isFeature?: boolean;
    wkspSettings?: object | undefined;
    featureTags?: featureParser.FeatureTag[];
    fixtures?: fixtureParser.Fixture[];
    existingDiags?: vscode.Diagnostic[];
  }) {
    const mockUri = vscode.Uri.file('/test/features/test.feature');
    sandbox.stub(common, 'isFeatureFile').returns(opts.isFeature ?? true);
    sandbox.stub(common, 'getWorkspaceSettingsForFile').returns(
      'wkspSettings' in opts ? opts.wkspSettings as ReturnType<typeof common.getWorkspaceSettingsForFile>
        : { uri: mockUri, featuresUri: mockUri } as ReturnType<typeof common.getWorkspaceSettingsForFile>
    );
    sandbox.stub(featureParser, 'getFeatureTags').returns(opts.featureTags ?? []);
    sandbox.stub(fixtureParser, 'getFixtures').returns(opts.fixtures ?? []);
    sandbox.stub(fixtureParser, 'getFixtureByTag').returns(undefined);

    let currentDiags = opts.existingDiags ?? [];
    sandbox.stub(config.diagnostics, 'get').callsFake(() => currentDiags);
    const setStub = sandbox.stub(config.diagnostics, 'set');
    setStub.callsFake((uriOrEntries: unknown, diags?: unknown) => {
      if (!Array.isArray(uriOrEntries)) {
        currentDiags = (diags as vscode.Diagnostic[] | undefined) ?? [];
      }
    });

    return setStub;
  }

  suite('validateFixtureTags', () => {
    test('should skip validation when initial steps parse is not complete', () => {
      sandbox.restore();
      sandbox = sinon.createSandbox();
      sandbox.stub(parser, 'initialStepsParseComplete').get(() => false);
      const mockUri = vscode.Uri.file('/test/features/test.feature');
      const mockDocument = { uri: mockUri } as vscode.TextDocument;
      const setStub = setupValidateStubs({ isFeature: true });

      validateFixtureTags(mockDocument);

      assert.strictEqual(setStub.callCount, 0);
    });

    test('should skip non-feature files', () => {
      const mockUri = vscode.Uri.file('/test/steps/steps.py');
      const mockDocument = { uri: mockUri } as vscode.TextDocument;
      const setStub = setupValidateStubs({ isFeature: false });

      validateFixtureTags(mockDocument);

      assert.strictEqual(setStub.callCount, 0);
    });

    test('should skip when no workspace settings found', () => {
      const mockUri = vscode.Uri.file('/test/features/test.feature');
      const mockDocument = { uri: mockUri } as vscode.TextDocument;
      const setStub = setupValidateStubs({ wkspSettings: undefined });

      validateFixtureTags(mockDocument);

      assert.strictEqual(setStub.callCount, 0);
    });

    test('should proceed with validation when initial steps parse is complete', () => {
      const mockUri = vscode.Uri.file('/test/features/test.feature');
      const mockDocument = { uri: mockUri } as vscode.TextDocument;
      const setStub = setupValidateStubs({});

      validateFixtureTags(mockDocument);

      assert.strictEqual(setStub.callCount, 1);
    });
  });
});
