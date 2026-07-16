// Unit tests for the execute_steps go-to-definition provider
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { ExecuteStepsDefinitionProvider } from '../../../src/handlers/executeStepsDefinitionProvider';
import * as common from '../../../src/common';
import * as executeStepsParser from '../../../src/parsers/executeStepsParser';
import * as stepMappings from '../../../src/parsers/stepMappings';
import { ExecuteStepsCallStep } from '../../../src/parsers/executeStepsParser';
import { StepFileStep } from '../../../src/parsers/stepsParser';

suite('executeStepsDefinitionProvider', () => {
  let sandbox: sinon.SinonSandbox;
  const provider = new ExecuteStepsDefinitionProvider();

  const docUri = vscode.Uri.file('/test/features/steps/lib.py');
  const stepDefUri = vscode.Uri.file('/test/features/steps/steps.py');

  setup(() => { sandbox = sinon.createSandbox(); });
  teardown(() => sandbox.restore());

  function makeCallStep(line: number, startCol: number, text: string): ExecuteStepsCallStep {
    return new ExecuteStepsCallStep(
      `key-${line}`, docUri, 'lib.py',
      new vscode.Range(line, startCol, line, startCol + text.length),
      text, text.replace(/^\w+ /, ''), 'given', false,
    );
  }

  function makeStepDef(): StepFileStep {
    const sfs = new StepFileStep('skey', stepDefUri, 'steps.py', 'given', 'a precondition');
    sfs.functionDefinitionRange = new vscode.Range(12, 0, 12, 25);
    return sfs;
  }

  function mockDocument(): vscode.TextDocument {
    return { uri: docUri, languageId: 'python' } as unknown as vscode.TextDocument;
  }

  function setupStubs(opts: {
    isPython?: boolean;
    callStep?: ExecuteStepsCallStep | undefined;
    navReady?: boolean;
    stepDef?: StepFileStep | undefined;
  }) {
    sandbox.stub(common, 'couldBePythonStepsFile').returns(opts.isPython ?? true);
    sandbox.stub(executeStepsParser, 'getExecuteStepsCallStepAtLine').returns(opts.callStep);
    sandbox.stub(stepMappings, 'waitOnReadyForStepsNavigation').resolves(opts.navReady ?? true);
    sandbox.stub(stepMappings, 'getStepFileStepForExecuteStep').returns(opts.stepDef);
  }

  test('returns a LocationLink to the step definition with the step text as origin', async () => {
    const callStep = makeCallStep(5, 8, 'Given a precondition');
    const stepDef = makeStepDef();
    setupStubs({ callStep, stepDef });

    const result = await provider.provideDefinition(mockDocument(), new vscode.Position(5, 12));

    assert.ok(Array.isArray(result), 'expected a LocationLink[]');
    assert.strictEqual(result.length, 1);
    const link = result[0] as vscode.LocationLink;
    assert.strictEqual(link.originSelectionRange, callStep.range);
    assert.strictEqual(link.targetUri, stepDef.uri);
    assert.strictEqual(link.targetRange, stepDef.functionDefinitionRange);
    assert.strictEqual(link.targetSelectionRange, stepDef.functionDefinitionRange);
  });

  test('returns undefined for non-python files', async () => {
    setupStubs({ isPython: false, callStep: makeCallStep(5, 8, 'Given a precondition'), stepDef: makeStepDef() });

    const result = await provider.provideDefinition(mockDocument(), new vscode.Position(5, 12));
    assert.strictEqual(result, undefined);
  });

  test('returns undefined when there is no call step on the line', async () => {
    setupStubs({ callStep: undefined, stepDef: makeStepDef() });

    const result = await provider.provideDefinition(mockDocument(), new vscode.Position(5, 12));
    assert.strictEqual(result, undefined);
  });

  test('returns undefined when the position is on the line but outside the step text range', async () => {
    const callStep = makeCallStep(5, 8, 'Given a precondition');
    setupStubs({ callStep, stepDef: makeStepDef() });

    // position at col 2: on the call step's line but in the indentation before the string content
    const result = await provider.provideDefinition(mockDocument(), new vscode.Position(5, 2));
    assert.strictEqual(result, undefined, 'clicks outside the embedded step text must not navigate');
  });

  test('returns undefined when steps navigation is not ready (parse in progress)', async () => {
    const callStep = makeCallStep(5, 8, 'Given a precondition');
    setupStubs({ callStep, navReady: false, stepDef: makeStepDef() });

    const result = await provider.provideDefinition(mockDocument(), new vscode.Position(5, 12));
    assert.strictEqual(result, undefined);
  });

  test('returns undefined when the call step has no matching step definition', async () => {
    const callStep = makeCallStep(5, 8, 'Given an unmatched step here');
    setupStubs({ callStep, stepDef: undefined });

    const result = await provider.provideDefinition(mockDocument(), new vscode.Position(5, 12));
    assert.strictEqual(result, undefined);
  });
});
