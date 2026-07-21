// Unit tests for execute_steps diagnostics module
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import {
  validateExecuteSteps, clearExecuteStepsDiagnostics,
  EXECUTE_STEPS_STEP_NOT_FOUND, EXECUTE_STEPS_INVALID_CONTENT,
} from '../../../src/handlers/executeStepsDiagnostics';
import * as common from '../../../src/common';
import * as stepMappings from '../../../src/parsers/stepMappings';
import * as stepsParser from '../../../src/parsers/stepsParser';
import { ExecuteStepsCallStep, ExecuteStepsInvalidLine } from '../../../src/parsers/executeStepsParser';
import { config } from '../../../src/configuration';
import { parser } from '../../../src/extension';

suite('executeStepsDiagnostics', () => {
  let sandbox: sinon.SinonSandbox;

  const mockUri = vscode.Uri.file('/test/features/steps/lib.py');
  const wkspRoot = vscode.Uri.file('/test');
  const featuresUri = vscode.Uri.file('/test/features');

  setup(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(parser, 'initialStepsParseComplete').get(() => true);
  });
  teardown(() => sandbox.restore());

  function makeCallStep(stepType: string, textWithoutType: string, opts?: {
    line?: number;
    hasFormatPlaceholders?: boolean;
  }): ExecuteStepsCallStep {
    const line = opts?.line ?? 2;
    const text = `${stepType.charAt(0).toUpperCase()}${stepType.slice(1)} ${textWithoutType}`;
    return new ExecuteStepsCallStep(
      `key-${line}`, mockUri, 'lib.py',
      new vscode.Range(line, 8, line, 8 + text.length),
      text, textWithoutType, stepType,
      opts?.hasFormatPlaceholders ?? false,
    );
  }

  function setupStubs(opts: {
    isPython?: boolean;
    wkspSettings?: object | undefined;
    matches?: { callStep: ExecuteStepsCallStep; stepFileStep: stepsParser.StepFileStep | null }[];
    invalidLines?: ExecuteStepsInvalidLine[];
    existingDiags?: vscode.Diagnostic[];
    allStepDefs?: [string, stepsParser.StepFileStep][];
  }) {
    sandbox.stub(common, 'couldBePythonStepsFile').returns(opts.isPython ?? true);
    sandbox.stub(common, 'getWorkspaceSettingsForFile').returns(
      'wkspSettings' in opts ? opts.wkspSettings as ReturnType<typeof common.getWorkspaceSettingsForFile>
        : { uri: wkspRoot, featuresUri: featuresUri, featuresUris: [featuresUri], stepsSearchUri: vscode.Uri.file('/test/features/steps') } as ReturnType<typeof common.getWorkspaceSettingsForFile>
    );
    sandbox.stub(stepMappings, 'matchExecuteStepsContent').returns({
      matches: opts.matches ?? [],
      invalidLines: opts.invalidLines ?? [],
    });
    sandbox.stub(stepsParser, 'getStepFileSteps').returns(opts.allStepDefs ?? []);

    let currentDiags = opts.existingDiags ?? [];
    sandbox.stub(config.diagnostics, 'get').callsFake(() => currentDiags);
    const setStub = sandbox.stub(config.diagnostics, 'set');
    setStub.callsFake((uriOrEntries: unknown, diags?: unknown) => {
      if (!Array.isArray(uriOrEntries))
        currentDiags = (diags as vscode.Diagnostic[] | undefined) ?? [];
    });
    return setStub;
  }

  function getDiagsFromSetStub(setStub: sinon.SinonStub): vscode.Diagnostic[] {
    return (setStub.firstCall.args as unknown as [vscode.Uri, vscode.Diagnostic[]])[1];
  }

  function mockDocument(): vscode.TextDocument {
    return { uri: mockUri, getText: () => 'irrelevant - matchExecuteStepsContent is stubbed' } as unknown as vscode.TextDocument;
  }

  suite('guards', () => {
    test('skips when initial steps parse is not complete', () => {
      sandbox.restore();
      sandbox = sinon.createSandbox();
      sandbox.stub(parser, 'initialStepsParseComplete').get(() => false);
      const setStub = setupStubs({});

      validateExecuteSteps(mockDocument());
      assert.strictEqual(setStub.callCount, 0);
    });

    test('skips non-python files', () => {
      const setStub = setupStubs({ isPython: false });
      validateExecuteSteps(mockDocument());
      assert.strictEqual(setStub.callCount, 0);
    });

    test('skips when no workspace settings found', () => {
      const setStub = setupStubs({ wkspSettings: undefined });
      validateExecuteSteps(mockDocument());
      assert.strictEqual(setStub.callCount, 0);
    });
  });

  suite('step-not-found diagnostics', () => {
    test('creates a Warning with the correct code, source, and range for an unmatched step', () => {
      const callStep = makeCallStep('given', 'a missing step');
      const setStub = setupStubs({ matches: [{ callStep, stepFileStep: null }] });

      validateExecuteSteps(mockDocument());

      assert.strictEqual(setStub.callCount, 1);
      const diags = getDiagsFromSetStub(setStub);
      assert.strictEqual(diags.length, 1);
      assert.strictEqual(diags[0].code, EXECUTE_STEPS_STEP_NOT_FOUND);
      assert.strictEqual(diags[0].severity, vscode.DiagnosticSeverity.Warning);
      assert.strictEqual(diags[0].source, 'gs-behave-bdd');
      assert.strictEqual(diags[0].range, callStep.range);
    });

    test('creates no diagnostic for a matched step', () => {
      const callStep = makeCallStep('given', 'a matched step');
      const stepDef = new stepsParser.StepFileStep(
        'skey1', vscode.Uri.file('/test/features/steps/steps.py'), 'steps.py', 'given', 'a matched step');
      const setStub = setupStubs({ matches: [{ callStep, stepFileStep: stepDef }] });

      validateExecuteSteps(mockDocument());

      const diags = getDiagsFromSetStub(setStub);
      assert.strictEqual(diags.length, 0);
    });

    test('message contains search information (step and file counts)', () => {
      const callStep = makeCallStep('when', 'nothing matches this');
      const stepDef1 = new stepsParser.StepFileStep(
        'skey1', vscode.Uri.file('/test/features/steps/a.py'), 'a.py', 'given', 'x');
      const stepDef2 = new stepsParser.StepFileStep(
        'skey2', vscode.Uri.file('/test/features/steps/b.py'), 'b.py', 'when', 'y');
      const setStub = setupStubs({
        matches: [{ callStep, stepFileStep: null }],
        allStepDefs: [['skey1', stepDef1], ['skey2', stepDef2]],
      });

      validateExecuteSteps(mockDocument());

      const diags = getDiagsFromSetStub(setStub);
      assert.ok(diags[0].message.includes('No step definition found'));
      assert.ok(diags[0].message.includes('2 step definitions'));
      assert.ok(diags[0].message.includes('2 files'));
    });

    test('suppresses unmatched placeholder-bearing lines of format literals', () => {
      const dynamicStep = makeCallStep('given', 'a user named {name}', { hasFormatPlaceholders: true });
      const setStub = setupStubs({ matches: [{ callStep: dynamicStep, stepFileStep: null }] });

      validateExecuteSteps(mockDocument());

      const diags = getDiagsFromSetStub(setStub);
      assert.strictEqual(diags.length, 0, 'dynamic line of a .format literal must not be flagged');
    });

    test('still flags placeholder-free lines of format literals', () => {
      const staticStep = makeCallStep('given', 'a static missing step', { hasFormatPlaceholders: true });
      const setStub = setupStubs({ matches: [{ callStep: staticStep, stepFileStep: null }] });

      validateExecuteSteps(mockDocument());

      const diags = getDiagsFromSetStub(setStub);
      assert.strictEqual(diags.length, 1, 'static line of a .format literal is still validated');
      assert.strictEqual(diags[0].code, EXECUTE_STEPS_STEP_NOT_FOUND);
    });
  });

  suite('invalid-content diagnostics', () => {
    test('creates an Error with the correct code for an invalid line', () => {
      const invalid = new ExecuteStepsInvalidLine(mockUri, new vscode.Range(3, 8, 3, 20), '@tag junk line');
      const setStub = setupStubs({ invalidLines: [invalid] });

      validateExecuteSteps(mockDocument());

      const diags = getDiagsFromSetStub(setStub);
      assert.strictEqual(diags.length, 1);
      assert.strictEqual(diags[0].code, EXECUTE_STEPS_INVALID_CONTENT);
      assert.strictEqual(diags[0].severity, vscode.DiagnosticSeverity.Error);
      assert.strictEqual(diags[0].source, 'gs-behave-bdd');
      assert.strictEqual(diags[0].range, invalid.range);
      assert.ok(diags[0].message.includes('ParserError'));
    });

    test('suppresses invalid lines containing format placeholders', () => {
      const dynamicInvalid = new ExecuteStepsInvalidLine(mockUri, new vscode.Range(3, 8, 3, 20), '{steps_block}');
      const setStub = setupStubs({ invalidLines: [dynamicInvalid] });

      validateExecuteSteps(mockDocument());

      const diags = getDiagsFromSetStub(setStub);
      assert.strictEqual(diags.length, 0, 'a placeholder line may expand to valid steps at runtime');
    });

    test('reports both diagnostic kinds together', () => {
      const callStep = makeCallStep('given', 'a missing step');
      const invalid = new ExecuteStepsInvalidLine(mockUri, new vscode.Range(4, 8, 4, 20), 'Scenario: nope');
      const setStub = setupStubs({
        matches: [{ callStep, stepFileStep: null }],
        invalidLines: [invalid],
      });

      validateExecuteSteps(mockDocument());

      const diags = getDiagsFromSetStub(setStub);
      assert.strictEqual(diags.length, 2);
      assert.deepStrictEqual(
        diags.map(d => d.code).sort(),
        [EXECUTE_STEPS_INVALID_CONTENT, EXECUTE_STEPS_STEP_NOT_FOUND].sort(),
      );
    });
  });

  suite('diagnostics preservation', () => {
    test('preserves diagnostics owned by other validators', () => {
      const featureStepDiag = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 10), 'other', vscode.DiagnosticSeverity.Warning);
      featureStepDiag.code = 'step-not-found';
      const fixtureDiag = new vscode.Diagnostic(new vscode.Range(1, 0, 1, 10), 'other', vscode.DiagnosticSeverity.Error);
      fixtureDiag.code = 'fixture-not-found';

      const callStep = makeCallStep('given', 'a missing step');
      const setStub = setupStubs({
        matches: [{ callStep, stepFileStep: null }],
        existingDiags: [featureStepDiag, fixtureDiag],
      });

      validateExecuteSteps(mockDocument());

      const diags = getDiagsFromSetStub(setStub);
      assert.strictEqual(diags.length, 3);
      assert.strictEqual(diags[0].code, 'step-not-found');
      assert.strictEqual(diags[1].code, 'fixture-not-found');
      assert.strictEqual(diags[2].code, EXECUTE_STEPS_STEP_NOT_FOUND);
    });

    test('replaces its own stale diagnostics on re-validation', () => {
      const staleWarning = new vscode.Diagnostic(new vscode.Range(9, 0, 9, 10), 'stale', vscode.DiagnosticSeverity.Warning);
      staleWarning.code = EXECUTE_STEPS_STEP_NOT_FOUND;
      const staleError = new vscode.Diagnostic(new vscode.Range(10, 0, 10, 10), 'stale', vscode.DiagnosticSeverity.Error);
      staleError.code = EXECUTE_STEPS_INVALID_CONTENT;

      // everything now matches / no invalid lines -> both stale diagnostics must clear
      const callStep = makeCallStep('given', 'now matched');
      const stepDef = new stepsParser.StepFileStep(
        'skey1', vscode.Uri.file('/test/features/steps/steps.py'), 'steps.py', 'given', 'now matched');
      const setStub = setupStubs({
        matches: [{ callStep, stepFileStep: stepDef }],
        existingDiags: [staleWarning, staleError],
      });

      validateExecuteSteps(mockDocument());

      const diags = getDiagsFromSetStub(setStub);
      assert.strictEqual(diags.length, 0, 'stale execute_steps diagnostics must be replaced, not accumulated');
    });
  });

  suite('clearExecuteStepsDiagnostics', () => {
    test('removes only execute_steps diagnostics', () => {
      const otherDiag = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 10), 'other', vscode.DiagnosticSeverity.Warning);
      otherDiag.code = 'step-not-found';
      const execWarning = new vscode.Diagnostic(new vscode.Range(1, 0, 1, 10), 'exec', vscode.DiagnosticSeverity.Warning);
      execWarning.code = EXECUTE_STEPS_STEP_NOT_FOUND;
      const execError = new vscode.Diagnostic(new vscode.Range(2, 0, 2, 10), 'exec', vscode.DiagnosticSeverity.Error);
      execError.code = EXECUTE_STEPS_INVALID_CONTENT;

      sandbox.stub(config.diagnostics, 'get').returns([otherDiag, execWarning, execError]);
      const setStub = sandbox.stub(config.diagnostics, 'set');

      clearExecuteStepsDiagnostics(mockUri);

      const filtered = (setStub.firstCall.args as unknown as [vscode.Uri, vscode.Diagnostic[]])[1];
      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].code, 'step-not-found');
    });

    test('handles empty diagnostics list', () => {
      sandbox.stub(config.diagnostics, 'get').returns([]);
      const setStub = sandbox.stub(config.diagnostics, 'set');

      clearExecuteStepsDiagnostics(mockUri);

      const filtered = (setStub.firstCall.args as unknown as [vscode.Uri, vscode.Diagnostic[]])[1];
      assert.strictEqual(filtered.length, 0);
    });
  });
});
