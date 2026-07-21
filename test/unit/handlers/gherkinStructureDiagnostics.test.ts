// Unit tests for gherkin structure diagnostics module
import * as assert from 'assert';
import * as vscode from 'vscode';
import { validateGherkinStructure, clearGherkinStructureDiagnostics } from '../../../src/handlers/gherkinStructureDiagnostics';
import * as sinon from 'sinon';
import * as common from '../../../src/common';
import * as featureParser from '../../../src/parsers/featureParser';
import { config } from '../../../src/configuration';
import { FeatureParseError } from '../../../src/parsers/featureParser';

suite('gherkinStructureDiagnostics', () => {
  let sandbox: sinon.SinonSandbox;
  const mockUri = vscode.Uri.file('/test/features/test.feature');

  setup(() => {
    sandbox = sinon.createSandbox();
  });
  teardown(() => sandbox.restore());

  // Helper to set up common stubs for validateGherkinStructure tests
  function setupValidateStubs(opts: {
    isFeature?: boolean;
    wkspSettings?: object | undefined;
    parseErrors?: FeatureParseError[];
    existingDiags?: vscode.Diagnostic[];
  }) {
    sandbox.stub(common, 'isFeatureFile').returns(opts.isFeature ?? true);
    sandbox.stub(common, 'getWorkspaceSettingsForFile').returns(
      'wkspSettings' in opts ? opts.wkspSettings as ReturnType<typeof common.getWorkspaceSettingsForFile>
        : { uri: mockUri, featuresUri: mockUri, featuresUris: [mockUri] } as ReturnType<typeof common.getWorkspaceSettingsForFile>
    );
    sandbox.stub(featureParser, 'getFeatureParseErrors').returns(opts.parseErrors ?? []);

    let currentDiags = opts.existingDiags ?? [];
    sandbox.stub(config.diagnostics, 'get').callsFake(() => currentDiags);
    const setStub = sandbox.stub(config.diagnostics, 'set');
    setStub.callsFake((uriOrEntries: unknown, diags?: unknown) => {
      if (Array.isArray(uriOrEntries)) {
        return;
      } else {
        currentDiags = (diags as vscode.Diagnostic[] | undefined) ?? [];
      }
    });

    return setStub;
  }

  function getDiagsFromSetStub(setStub: sinon.SinonStub): vscode.Diagnostic[] {
    return (setStub.firstCall.args as unknown as [vscode.Uri, vscode.Diagnostic[]])[1];
  }

  function makeParseError(line: number, message: string): FeatureParseError {
    return new FeatureParseError(
      `key${line}`, mockUri, 'test.feature',
      new vscode.Range(line, 4, line, 30), message
    );
  }

  suite('validateGherkinStructure', () => {
    test('should skip non-feature files', () => {
      const mockDocument = { uri: vscode.Uri.file('/test/steps/steps.py') } as vscode.TextDocument;
      const setStub = setupValidateStubs({ isFeature: false });

      validateGherkinStructure(mockDocument);

      assert.strictEqual(setStub.callCount, 0);
    });

    test('should skip when no workspace settings found', () => {
      const mockDocument = { uri: mockUri } as vscode.TextDocument;
      const setStub = setupValidateStubs({ wkspSettings: undefined });

      validateGherkinStructure(mockDocument);

      assert.strictEqual(setStub.callCount, 0);
    });

    test('should create an Error diagnostic for an invalid leading And/But', () => {
      const mockDocument = { uri: mockUri } as vscode.TextDocument;
      const expectedRange = new vscode.Range(3, 4, 3, 30);
      const parseError = new FeatureParseError(
        'key3', mockUri, 'test.feature', expectedRange,
        `'And' step has no preceding Given/When/Then step (and no Background step to inherit from). behave will fail to parse this feature.`
      );
      const setStub = setupValidateStubs({ parseErrors: [parseError] });

      validateGherkinStructure(mockDocument);

      assert.strictEqual(setStub.callCount, 1);
      const diags = getDiagsFromSetStub(setStub);
      assert.strictEqual(diags.length, 1);
      assert.strictEqual(diags[0].code, 'invalid-and-but-step');
      assert.strictEqual(diags[0].severity, vscode.DiagnosticSeverity.Error);
      assert.strictEqual(diags[0].source, 'gs-behave-bdd');
      assert.strictEqual(diags[0].range, expectedRange);
      assert.ok(diags[0].message.includes("'And'"));
    });

    test('should create no diagnostic when there are no parse errors', () => {
      const mockDocument = { uri: mockUri } as vscode.TextDocument;
      const setStub = setupValidateStubs({ parseErrors: [] });

      validateGherkinStructure(mockDocument);

      assert.strictEqual(setStub.callCount, 1);
      const diags = getDiagsFromSetStub(setStub);
      assert.strictEqual(diags.length, 0);
    });

    test('should create a diagnostic for each parse error', () => {
      const mockDocument = { uri: mockUri } as vscode.TextDocument;
      const setStub = setupValidateStubs({
        parseErrors: [makeParseError(3, 'bad And'), makeParseError(9, 'bad But')],
      });

      validateGherkinStructure(mockDocument);

      const diags = getDiagsFromSetStub(setStub);
      assert.strictEqual(diags.length, 2);
      assert.ok(diags.every(d => d.code === 'invalid-and-but-step'));
    });

    test('should preserve existing non-structure diagnostics', () => {
      const mockDocument = { uri: mockUri } as vscode.TextDocument;
      const stepDiag = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 10), 'Step not found', vscode.DiagnosticSeverity.Warning);
      stepDiag.code = 'step-not-found';
      const setStub = setupValidateStubs({
        parseErrors: [makeParseError(3, 'bad And')],
        existingDiags: [stepDiag],
      });

      validateGherkinStructure(mockDocument);

      const diags = getDiagsFromSetStub(setStub);
      assert.strictEqual(diags.length, 2);
      assert.strictEqual(diags[0].code, 'step-not-found');
      assert.strictEqual(diags[1].code, 'invalid-and-but-step');
    });

    test('should replace old structure diagnostics with new ones', () => {
      const mockDocument = { uri: mockUri } as vscode.TextDocument;
      const oldStructureDiag = new vscode.Diagnostic(new vscode.Range(2, 0, 2, 10), 'Old', vscode.DiagnosticSeverity.Error);
      oldStructureDiag.code = 'invalid-and-but-step';
      const setStub = setupValidateStubs({
        parseErrors: [makeParseError(9, 'new bad And')],
        existingDiags: [oldStructureDiag],
      });

      validateGherkinStructure(mockDocument);

      const diags = getDiagsFromSetStub(setStub);
      assert.strictEqual(diags.length, 1, 'old structure diagnostic should be replaced, not accumulated');
      assert.strictEqual(diags[0].range.start.line, 9);
    });
  });

  suite('clearGherkinStructureDiagnostics', () => {
    test('should remove structure diagnostics', () => {
      const structureDiag = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 10), 'Invalid', vscode.DiagnosticSeverity.Error);
      structureDiag.code = 'invalid-and-but-step';

      sandbox.stub(config.diagnostics, 'get').returns([structureDiag]);
      const setStub = sandbox.stub(config.diagnostics, 'set');

      clearGherkinStructureDiagnostics(mockUri);

      const filtered = (setStub.firstCall.args as unknown as [vscode.Uri, vscode.Diagnostic[]])[1];
      assert.strictEqual(filtered.length, 0);
    });

    test('should preserve step diagnostics when clearing structure diagnostics', () => {
      const stepDiag = new vscode.Diagnostic(new vscode.Range(5, 0, 5, 20), 'Step not found', vscode.DiagnosticSeverity.Warning);
      stepDiag.code = 'step-not-found';
      const structureDiag = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 10), 'Invalid', vscode.DiagnosticSeverity.Error);
      structureDiag.code = 'invalid-and-but-step';

      sandbox.stub(config.diagnostics, 'get').returns([stepDiag, structureDiag]);
      const setStub = sandbox.stub(config.diagnostics, 'set');

      clearGherkinStructureDiagnostics(mockUri);

      const filtered = (setStub.firstCall.args as unknown as [vscode.Uri, vscode.Diagnostic[]])[1];
      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].code, 'step-not-found');
    });
  });
});
