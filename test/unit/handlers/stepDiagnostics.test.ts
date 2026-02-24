// Unit tests for step diagnostics module
import * as assert from 'assert';
import * as vscode from 'vscode';
import { validateStepDefinitions, clearStepDiagnostics } from '../../../src/handlers/stepDiagnostics';
import * as sinon from 'sinon';
import * as common from '../../../src/common';
import * as featureParser from '../../../src/parsers/featureParser';
import * as stepMappings from '../../../src/parsers/stepMappings';
import * as stepsParser from '../../../src/parsers/stepsParser';
import { config } from '../../../src/configuration';
import { FeatureFileStep } from '../../../src/parsers/featureParser';

suite('stepDiagnostics', () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => sandbox = sinon.createSandbox());
  teardown(() => sandbox.restore());

  // Helper to set up common stubs for validateStepDefinitions tests
  function setupValidateStubs(opts: {
    isFeature?: boolean;
    wkspSettings?: object | undefined;
    featureSteps?: [string, FeatureFileStep][];
    stepMatch?: stepsParser.StepFileStep | undefined;
    existingDiags?: vscode.Diagnostic[];
    allStepDefs?: [string, stepsParser.StepFileStep][];
  }) {
    const mockUri = vscode.Uri.file('/test/features/test.feature');
    sandbox.stub(common, 'isFeatureFile').returns(opts.isFeature ?? true);
    sandbox.stub(common, 'getWorkspaceSettingsForFile').returns(
      'wkspSettings' in opts ? opts.wkspSettings as ReturnType<typeof common.getWorkspaceSettingsForFile>
        : { uri: mockUri, featuresUri: mockUri, stepsSearchUri: vscode.Uri.file('/test/features/steps') } as ReturnType<typeof common.getWorkspaceSettingsForFile>
    );
    sandbox.stub(featureParser, 'getFeatureFileSteps').returns(opts.featureSteps ?? []);
    sandbox.stub(stepMappings, 'getStepFileStepForFeatureFileStep').returns(opts.stepMatch);
    sandbox.stub(stepsParser, 'getStepFileSteps').returns(opts.allStepDefs ?? []);

    // Make diagnostics.get/set stateful to properly test clearStepDiagnostics behavior
    let currentDiags = opts.existingDiags ?? [];
    sandbox.stub(config.diagnostics, 'get').callsFake(() => currentDiags);
    const setStub = sandbox.stub(config.diagnostics, 'set');
    setStub.callsFake((uriOrEntries: unknown, diags?: unknown) => {
      // Handle both overloads of set()
      if (Array.isArray(uriOrEntries)) {
        // set(entries: [Uri, Diagnostic[] | undefined][])
        // For now, we only handle single uri case in tests
        return;
      } else {
        // set(uri: Uri, diagnostics: Diagnostic[] | undefined)
        currentDiags = (diags as vscode.Diagnostic[] | undefined) ?? [];
      }
    });

    return setStub;
  }

  function getDiagsFromSetStub(setStub: sinon.SinonStub): vscode.Diagnostic[] {
    return (setStub.firstCall.args as unknown as [vscode.Uri, vscode.Diagnostic[]])[1];
  }

  suite('validateStepDefinitions', () => {
    test('should skip non-feature files', () => {
      const mockUri = vscode.Uri.file('/test/steps/steps.py');
      const mockDocument = { uri: mockUri } as vscode.TextDocument;
      const setStub = setupValidateStubs({ isFeature: false });

      validateStepDefinitions(mockDocument);

      assert.strictEqual(setStub.callCount, 0);
    });

    test('should skip when no workspace settings found', () => {
      const mockUri = vscode.Uri.file('/test/features/test.feature');
      const mockDocument = { uri: mockUri } as vscode.TextDocument;
      const setStub = setupValidateStubs({ wkspSettings: undefined });

      validateStepDefinitions(mockDocument);

      assert.strictEqual(setStub.callCount, 0);
    });

    test('should create diagnostic for unmatched step', () => {
      const mockUri = vscode.Uri.file('/test/features/test.feature');
      const mockDocument = { uri: mockUri } as vscode.TextDocument;
      const featureFileStep = new FeatureFileStep(
        'key1', mockUri, 'test.feature',
        new vscode.Range(5, 4, 5, 25), 'Given test step', 'test step', 'given'
      );
      const setStub = setupValidateStubs({
        featureSteps: [['key1', featureFileStep]],
        stepMatch: undefined,
      });

      validateStepDefinitions(mockDocument);

      assert.strictEqual(setStub.callCount, 1);
      const diags = getDiagsFromSetStub(setStub);
      assert.strictEqual(diags.length, 1);
      assert.strictEqual(diags[0].code, 'step-not-found');
    });

    test('should not create diagnostic for matched step', () => {
      const mockUri = vscode.Uri.file('/test/features/test.feature');
      const mockDocument = { uri: mockUri } as vscode.TextDocument;
      const featureFileStep = new FeatureFileStep(
        'key1', mockUri, 'test.feature',
        new vscode.Range(5, 4, 5, 25), 'Given test step', 'test step', 'given'
      );
      const stepFilStep = new stepsParser.StepFileStep(
        'skey1', vscode.Uri.file('/test/steps/steps.py'), 'steps.py', 'given',
        new vscode.Range(1, 0, 1, 20), 'test step'
      );
      const setStub = setupValidateStubs({
        featureSteps: [['key1', featureFileStep]],
        stepMatch: stepFilStep,
      });

      validateStepDefinitions(mockDocument);

      assert.strictEqual(setStub.callCount, 1);
      const diags = getDiagsFromSetStub(setStub);
      assert.strictEqual(diags.length, 0);
    });

    test('diagnostic should have Warning severity', () => {
      const mockUri = vscode.Uri.file('/test/features/test.feature');
      const mockDocument = { uri: mockUri } as vscode.TextDocument;
      const featureFileStep = new FeatureFileStep(
        'key1', mockUri, 'test.feature',
        new vscode.Range(3, 4, 3, 30), 'When user clicks button', 'user clicks button', 'when'
      );
      const setStub = setupValidateStubs({
        featureSteps: [['key1', featureFileStep]],
        stepMatch: undefined,
      });

      validateStepDefinitions(mockDocument);

      const diags = getDiagsFromSetStub(setStub);
      assert.strictEqual(diags[0].severity, vscode.DiagnosticSeverity.Warning);
    });

    test('diagnostic should have correct source', () => {
      const mockUri = vscode.Uri.file('/test/features/test.feature');
      const mockDocument = { uri: mockUri } as vscode.TextDocument;
      const featureFileStep = new FeatureFileStep(
        'key1', mockUri, 'test.feature',
        new vscode.Range(3, 4, 3, 30), 'When user clicks button', 'user clicks button', 'when'
      );
      const setStub = setupValidateStubs({
        featureSteps: [['key1', featureFileStep]],
        stepMatch: undefined,
      });

      validateStepDefinitions(mockDocument);

      const diags = getDiagsFromSetStub(setStub);
      assert.strictEqual(diags[0].source, 'behave-vsc');
    });

    test('diagnostic message should contain search information', () => {
      const mockUri = vscode.Uri.file('/test/features/test.feature');
      const mockDocument = { uri: mockUri } as vscode.TextDocument;
      const featureFileStep = new FeatureFileStep(
        'key1', mockUri, 'test.feature',
        new vscode.Range(7, 4, 7, 40), 'Then result is displayed', 'result is displayed', 'then'
      );
      const setStub = setupValidateStubs({
        featureSteps: [['key1', featureFileStep]],
        stepMatch: undefined,
      });

      validateStepDefinitions(mockDocument);

      const diags = getDiagsFromSetStub(setStub);
      assert.ok(diags[0].message.includes('No step definition found'));
      assert.ok(diags[0].message.includes('Searched'));
    });

    test('should use feature file step range for diagnostic range', () => {
      const mockUri = vscode.Uri.file('/test/features/test.feature');
      const mockDocument = { uri: mockUri } as vscode.TextDocument;
      const expectedRange = new vscode.Range(10, 8, 10, 35);
      const featureFileStep = new FeatureFileStep(
        'key1', mockUri, 'test.feature',
        expectedRange, 'Given something', 'something', 'given'
      );
      const setStub = setupValidateStubs({
        featureSteps: [['key1', featureFileStep]],
        stepMatch: undefined,
      });

      validateStepDefinitions(mockDocument);

      const diags = getDiagsFromSetStub(setStub);
      assert.strictEqual(diags[0].range, expectedRange);
    });

    test('should preserve existing non-step diagnostics', () => {
      const mockUri = vscode.Uri.file('/test/features/test.feature');
      const mockDocument = { uri: mockUri } as vscode.TextDocument;
      const fixtureDiag = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 10), 'Fixture not found', vscode.DiagnosticSeverity.Error);
      fixtureDiag.code = 'fixture-not-found';
      const featureFileStep = new FeatureFileStep(
        'key1', mockUri, 'test.feature',
        new vscode.Range(5, 4, 5, 20), 'Given missing', 'missing', 'given'
      );
      const setStub = setupValidateStubs({
        featureSteps: [['key1', featureFileStep]],
        stepMatch: undefined,
        existingDiags: [fixtureDiag],
      });

      validateStepDefinitions(mockDocument);

      const diags = getDiagsFromSetStub(setStub);
      assert.strictEqual(diags.length, 2);
      assert.strictEqual(diags[0].code, 'fixture-not-found');
      assert.strictEqual(diags[1].code, 'step-not-found');
    });

    test('should replace old step diagnostics with new ones', () => {
      const mockUri = vscode.Uri.file('/test/features/test.feature');
      const mockDocument = { uri: mockUri } as vscode.TextDocument;
      const oldStepDiag = new vscode.Diagnostic(new vscode.Range(2, 0, 2, 10), 'Old step', vscode.DiagnosticSeverity.Warning);
      oldStepDiag.code = 'step-not-found';
      const featureFileStep = new FeatureFileStep(
        'key1', mockUri, 'test.feature',
        new vscode.Range(5, 4, 5, 20), 'Given new missing', 'new missing', 'given'
      );
      const setStub = setupValidateStubs({
        featureSteps: [['key1', featureFileStep]],
        stepMatch: undefined,
        existingDiags: [oldStepDiag],
      });

      validateStepDefinitions(mockDocument);

      const diags = getDiagsFromSetStub(setStub);
      assert.strictEqual(diags.length, 1);
      assert.ok(diags[0].message.includes('No step definition found'));
    });

    test('should include step count and file count in diagnostic message', () => {
      const mockUri = vscode.Uri.file('/test/features/test.feature');
      const mockDocument = { uri: mockUri } as vscode.TextDocument;
      const featureFileStep = new FeatureFileStep(
        'key1', mockUri, 'test.feature',
        new vscode.Range(5, 4, 5, 20), 'Given missing', 'missing', 'given'
      );
      const stepDef1 = new stepsParser.StepFileStep(
        'skey1', vscode.Uri.file('/test/steps/common.py'), 'common.py', 'given',
        new vscode.Range(1, 0, 1, 20), 'test step 1'
      );
      const stepDef2 = new stepsParser.StepFileStep(
        'skey2', vscode.Uri.file('/test/steps/login.py'), 'login.py', 'when',
        new vscode.Range(5, 0, 5, 25), 'test step 2'
      );
      const setStub = setupValidateStubs({
        featureSteps: [['key1', featureFileStep]],
        stepMatch: undefined,
        allStepDefs: [['skey1', stepDef1], ['skey2', stepDef2]],
      });

      validateStepDefinitions(mockDocument);

      const diags = getDiagsFromSetStub(setStub);
      const message = diags[0].message;
      assert.ok(message.includes('Searched'));
      assert.ok(message.includes('2 step definitions'));
      assert.ok(message.includes('2 files'));
    });

    test('should handle zero step definitions (initial parsing)', () => {
      const mockUri = vscode.Uri.file('/test/features/test.feature');
      const mockDocument = { uri: mockUri } as vscode.TextDocument;
      const featureFileStep = new FeatureFileStep(
        'key1', mockUri, 'test.feature',
        new vscode.Range(5, 4, 5, 20), 'Given test step', 'test step', 'given'
      );
      const setStub = setupValidateStubs({
        featureSteps: [['key1', featureFileStep]],
        stepMatch: undefined,
        allStepDefs: [], // No step definitions loaded yet
      });

      validateStepDefinitions(mockDocument);

      assert.strictEqual(setStub.callCount, 1);
      const diags = getDiagsFromSetStub(setStub);
      assert.strictEqual(diags.length, 1);
      assert.strictEqual(diags[0].code, 'step-not-found');
      const message = diags[0].message;
      assert.ok(message.includes('Searched 0 step definitions in 0 files'),
        `Expected message to indicate 0 definitions, got: ${message}`);
    });

    test('should create diagnostics for multiple unmatched steps', () => {
      const mockUri = vscode.Uri.file('/test/features/test.feature');
      const mockDocument = { uri: mockUri } as vscode.TextDocument;
      const step1 = new FeatureFileStep(
        'key1', mockUri, 'test.feature',
        new vscode.Range(5, 4, 5, 20), 'Given first step', 'first step', 'given'
      );
      const step2 = new FeatureFileStep(
        'key2', mockUri, 'test.feature',
        new vscode.Range(6, 4, 6, 25), 'When second step', 'second step', 'when'
      );
      const step3 = new FeatureFileStep(
        'key3', mockUri, 'test.feature',
        new vscode.Range(7, 4, 7, 22), 'Then third step', 'third step', 'then'
      );
      const setStub = setupValidateStubs({
        featureSteps: [['key1', step1], ['key2', step2], ['key3', step3]],
        stepMatch: undefined,
      });

      validateStepDefinitions(mockDocument);

      const diags = getDiagsFromSetStub(setStub);
      assert.strictEqual(diags.length, 3, 'Should create diagnostic for each unmatched step');
      assert.strictEqual(diags[0].range, step1.range);
      assert.strictEqual(diags[1].range, step2.range);
      assert.strictEqual(diags[2].range, step3.range);
    });

    test('should create diagnostics only for unmatched steps', () => {
      const mockUri = vscode.Uri.file('/test/features/test.feature');
      const mockDocument = { uri: mockUri } as vscode.TextDocument;

      const matchedStep = new FeatureFileStep(
        'key1', mockUri, 'test.feature',
        new vscode.Range(5, 4, 5, 20), 'Given matched step', 'matched step', 'given'
      );
      const unmatchedStep = new FeatureFileStep(
        'key2', mockUri, 'test.feature',
        new vscode.Range(6, 4, 6, 25), 'When unmatched step', 'unmatched step', 'when'
      );

      const matchedStepDef = new stepsParser.StepFileStep(
        'skey1', vscode.Uri.file('/test/steps/steps.py'), 'steps.py', 'given',
        new vscode.Range(1, 0, 1, 20), 'matched step'
      );

      sandbox.stub(common, 'isFeatureFile').returns(true);
      sandbox.stub(common, 'getWorkspaceSettingsForFile').returns({
        uri: mockUri,
        featuresUri: mockUri,
        stepsSearchUri: vscode.Uri.file('/test/features/steps')
      } as ReturnType<typeof common.getWorkspaceSettingsForFile>);
      sandbox.stub(featureParser, 'getFeatureFileSteps').returns([
        ['key1', matchedStep],
        ['key2', unmatchedStep]
      ]);

      // Mock getStepFileStepForFeatureFileStep to return match for first step only
      const getStepStub = sandbox.stub(stepMappings, 'getStepFileStepForFeatureFileStep');
      getStepStub.withArgs(mockUri, 5).returns(matchedStepDef);
      getStepStub.withArgs(mockUri, 6).returns(undefined);

      sandbox.stub(stepsParser, 'getStepFileSteps').returns([['skey1', matchedStepDef]]);
      sandbox.stub(config.diagnostics, 'get').returns([]);
      const setStub = sandbox.stub(config.diagnostics, 'set');

      validateStepDefinitions(mockDocument);

      const diags = getDiagsFromSetStub(setStub);
      assert.strictEqual(diags.length, 1, 'Should only create diagnostic for unmatched step');
      assert.strictEqual(diags[0].range, unmatchedStep.range);
      assert.ok(diags[0].message.includes('No step definition found'));
    });

    test('should update diagnostics when steps become matched', () => {
      const mockUri = vscode.Uri.file('/test/features/test.feature');
      const mockDocument = { uri: mockUri } as vscode.TextDocument;

      const step = new FeatureFileStep(
        'key1', mockUri, 'test.feature',
        new vscode.Range(5, 4, 5, 20), 'Given test step', 'test step', 'given'
      );

      // First validation: step is unmatched
      let setStub = setupValidateStubs({
        featureSteps: [['key1', step]],
        stepMatch: undefined,
        allStepDefs: [],
      });

      validateStepDefinitions(mockDocument);

      let diags = getDiagsFromSetStub(setStub);
      assert.strictEqual(diags.length, 1, 'Should have diagnostic for unmatched step');

      sandbox.restore();
      sandbox = sinon.createSandbox();

      // Second validation: step is now matched
      const stepDef = new stepsParser.StepFileStep(
        'skey1', vscode.Uri.file('/test/steps/steps.py'), 'steps.py', 'given',
        new vscode.Range(1, 0, 1, 20), 'test step'
      );

      setStub = setupValidateStubs({
        featureSteps: [['key1', step]],
        stepMatch: stepDef,
        allStepDefs: [['skey1', stepDef]],
        existingDiags: diags, // Existing diagnostic from previous validation
      });

      validateStepDefinitions(mockDocument);

      diags = getDiagsFromSetStub(setStub);
      assert.strictEqual(diags.length, 0, 'Should clear diagnostic when step becomes matched');
    });

    test('should show correct file path in diagnostic message', () => {
      const mockUri = vscode.Uri.file('/test/features/test.feature');
      const mockDocument = { uri: mockUri } as vscode.TextDocument;
      const stepsSearchUri = vscode.Uri.file('/test/features/steps');

      const step = new FeatureFileStep(
        'key1', mockUri, 'test.feature',
        new vscode.Range(5, 4, 5, 20), 'Given test step', 'test step', 'given'
      );

      sandbox.stub(common, 'isFeatureFile').returns(true);
      sandbox.stub(common, 'getWorkspaceSettingsForFile').returns({
        uri: mockUri,
        featuresUri: mockUri,
        stepsSearchUri: stepsSearchUri
      } as ReturnType<typeof common.getWorkspaceSettingsForFile>);
      sandbox.stub(featureParser, 'getFeatureFileSteps').returns([['key1', step]]);
      sandbox.stub(stepMappings, 'getStepFileStepForFeatureFileStep').returns(undefined);
      sandbox.stub(stepsParser, 'getStepFileSteps').returns([]);
      sandbox.stub(config.diagnostics, 'get').returns([]);
      const setStub = sandbox.stub(config.diagnostics, 'set');

      // Stub vscode.workspace.asRelativePath to return a predictable path
      const asRelativePathStub = sandbox.stub(vscode.workspace, 'asRelativePath');
      asRelativePathStub.withArgs(stepsSearchUri).returns('features/steps');

      validateStepDefinitions(mockDocument);

      const diags = getDiagsFromSetStub(setStub);
      assert.ok(diags[0].message.includes('features/steps'),
        `Expected message to include search path, got: ${diags[0].message}`);
    });

    test('library steps should not be marked as undefined', () => {
      const mockUri = vscode.Uri.file('/test/features/test.feature');
      const mockDocument = { uri: mockUri } as vscode.TextDocument;

      const featureFileStep = new FeatureFileStep(
        'key1', mockUri, 'test.feature',
        new vscode.Range(5, 4, 5, 25), 'Given user is logged in', 'user is logged in', 'given'
      );

      // Step from a library file (not in steps/ folder)
      const libraryStepDef = new stepsParser.StepFileStep(
        'lib-key1', vscode.Uri.file('/test/lib/common_steps.py'), 'common_steps.py', 'given',
        new vscode.Range(3, 0, 3, 28), 'user is logged in'
      );

      const setStub = setupValidateStubs({
        featureSteps: [['key1', featureFileStep]],
        stepMatch: libraryStepDef,
        allStepDefs: [['lib-key1', libraryStepDef]],
      });

      validateStepDefinitions(mockDocument);

      const diags = getDiagsFromSetStub(setStub);
      assert.strictEqual(diags.length, 0, 'Library step should not create diagnostic');
    });

    test('actually missing steps should still show diagnostic even with library steps present', () => {
      const mockUri = vscode.Uri.file('/test/features/test.feature');
      const mockDocument = { uri: mockUri } as vscode.TextDocument;

      const localStep = new FeatureFileStep(
        'key1', mockUri, 'test.feature',
        new vscode.Range(5, 4, 5, 25), 'Given user is logged in', 'user is logged in', 'given'
      );

      const missingStep = new FeatureFileStep(
        'key2', mockUri, 'test.feature',
        new vscode.Range(6, 4, 6, 30), 'When user does something', 'user does something', 'when'
      );

      // Step from library file
      const libraryStepDef = new stepsParser.StepFileStep(
        'lib-key1', vscode.Uri.file('/test/lib/common_steps.py'), 'common_steps.py', 'given',
        new vscode.Range(3, 0, 3, 28), 'user is logged in'
      );

      sandbox.stub(common, 'isFeatureFile').returns(true);
      sandbox.stub(common, 'getWorkspaceSettingsForFile').returns({
        uri: mockUri,
        featuresUri: mockUri,
        stepsSearchUri: vscode.Uri.file('/test/features/steps')
      } as ReturnType<typeof common.getWorkspaceSettingsForFile>);
      sandbox.stub(featureParser, 'getFeatureFileSteps').returns([
        ['key1', localStep],
        ['key2', missingStep]
      ]);

      const getStepStub = sandbox.stub(stepMappings, 'getStepFileStepForFeatureFileStep');
      getStepStub.withArgs(mockUri, 5).returns(libraryStepDef); // Local step matches library step
      getStepStub.withArgs(mockUri, 6).returns(undefined); // Missing step

      sandbox.stub(stepsParser, 'getStepFileSteps').returns([['lib-key1', libraryStepDef]]);
      sandbox.stub(config.diagnostics, 'get').returns([]);
      const setStub = sandbox.stub(config.diagnostics, 'set');

      validateStepDefinitions(mockDocument);

      const diags = getDiagsFromSetStub(setStub);
      assert.strictEqual(diags.length, 1, 'Should create diagnostic for missing step');
      assert.strictEqual(diags[0].range, missingStep.range, 'Diagnostic should be for missing step');
      assert.ok(diags[0].message.includes('No step definition found'));
    });
  });

  suite('clearStepDiagnostics', () => {
    test('should remove step diagnostics', () => {
      const mockUri = vscode.Uri.file('/test.feature');
      const stepDiag = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 10), 'Step not found', vscode.DiagnosticSeverity.Warning);
      stepDiag.code = 'step-not-found';

      sandbox.stub(config.diagnostics, 'get').returns([stepDiag]);
      const setStub = sandbox.stub(config.diagnostics, 'set');

      clearStepDiagnostics(mockUri);

      const filtered = (setStub.firstCall.args as unknown as [vscode.Uri, vscode.Diagnostic[]])[1];
      assert.strictEqual(filtered.length, 0);
    });

    test('should preserve fixture diagnostics when clearing step diagnostics', () => {
      const mockUri = vscode.Uri.file('/test.feature');
      const fixtureDiag = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 10), 'Fixture not found', vscode.DiagnosticSeverity.Error);
      fixtureDiag.code = 'fixture-not-found';
      const stepDiag = new vscode.Diagnostic(new vscode.Range(5, 0, 5, 20), 'Step not found', vscode.DiagnosticSeverity.Warning);
      stepDiag.code = 'step-not-found';

      sandbox.stub(config.diagnostics, 'get').returns([fixtureDiag, stepDiag]);
      const setStub = sandbox.stub(config.diagnostics, 'set');

      clearStepDiagnostics(mockUri);

      assert.strictEqual(setStub.callCount, 1);
      const filtered = (setStub.firstCall.args as unknown as [vscode.Uri, vscode.Diagnostic[]])[1];
      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].code, 'fixture-not-found');
    });

    test('should handle empty diagnostics list', () => {
      const mockUri = vscode.Uri.file('/test.feature');

      sandbox.stub(config.diagnostics, 'get').returns([]);
      const setStub = sandbox.stub(config.diagnostics, 'set');

      clearStepDiagnostics(mockUri);

      assert.strictEqual(setStub.callCount, 1);
      const filtered = (setStub.firstCall.args as unknown as [vscode.Uri, vscode.Diagnostic[]])[1];
      assert.strictEqual(filtered.length, 0);
    });
  });
});