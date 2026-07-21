// Unit tests for the execute_steps hover provider
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { ExecuteStepsHoverProvider } from '../../../src/handlers/executeStepsHoverProvider';
import * as common from '../../../src/common';
import * as executeStepsParser from '../../../src/parsers/executeStepsParser';
import * as stepMappings from '../../../src/parsers/stepMappings';
import { ExecuteStepsCallStep } from '../../../src/parsers/executeStepsParser';
import { StepFileStep } from '../../../src/parsers/stepsParser';

suite('executeStepsHoverProvider', () => {
  let sandbox: sinon.SinonSandbox;
  const provider = new ExecuteStepsHoverProvider();

  const docUri = vscode.Uri.file('/test/features/steps/lib.py');
  const stepDefUri = vscode.Uri.file('/test/features/steps/steps.py');

  const stepDefPythonContent = [
    '@given("a precondition")',
    'def step_precondition(context):',
    '    """Sets up the precondition."""',
    '    context.ok = True',
    '',
  ].join('\n');

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
    // decorator on line 0, def on line 1 of stepDefPythonContent
    sfs.functionDefinitionRange = new vscode.Range(1, 0, 1, 30);
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
    sandbox.stub(common, 'getContentFromFilesystem').resolves(stepDefPythonContent);
    sandbox.stub(common, 'isStepsFile').returns(true);
  }

  test('shows the step decorator and docstring, anchored to the embedded step text', async () => {
    const callStep = makeCallStep(5, 8, 'Given a precondition');
    setupStubs({ callStep, stepDef: makeStepDef() });

    const hover = await provider.provideHover(mockDocument(), new vscode.Position(5, 12));

    assert.ok(hover, 'expected a hover');
    assert.strictEqual(hover.range, callStep.range, 'hover must anchor to the embedded step text span');
    const markdown = (hover.contents[0] as vscode.MarkdownString).value;
    assert.ok(markdown.includes('@given("a precondition")'), `hover must show the decorator, got: ${markdown}`);
    assert.ok(markdown.includes('Sets up the precondition.'), `hover must show the docstring, got: ${markdown}`);
  });

  test('returns undefined for non-python files', async () => {
    setupStubs({ isPython: false, callStep: makeCallStep(5, 8, 'Given a precondition'), stepDef: makeStepDef() });
    assert.strictEqual(await provider.provideHover(mockDocument(), new vscode.Position(5, 12)), undefined);
  });

  test('returns undefined when there is no call step on the line', async () => {
    setupStubs({ callStep: undefined, stepDef: makeStepDef() });
    assert.strictEqual(await provider.provideHover(mockDocument(), new vscode.Position(5, 12)), undefined);
  });

  test('returns undefined when the position is outside the embedded step text', async () => {
    const callStep = makeCallStep(5, 8, 'Given a precondition');
    setupStubs({ callStep, stepDef: makeStepDef() });
    assert.strictEqual(await provider.provideHover(mockDocument(), new vscode.Position(5, 2)), undefined);
  });

  test('returns undefined when navigation is not ready', async () => {
    const callStep = makeCallStep(5, 8, 'Given a precondition');
    setupStubs({ callStep, navReady: false, stepDef: makeStepDef() });
    assert.strictEqual(await provider.provideHover(mockDocument(), new vscode.Position(5, 12)), undefined);
  });

  test('returns undefined when the embedded step has no matching definition', async () => {
    const callStep = makeCallStep(5, 8, 'Given an unmatched step');
    setupStubs({ callStep, stepDef: undefined });
    assert.strictEqual(await provider.provideHover(mockDocument(), new vscode.Position(5, 12)), undefined);
  });
});
