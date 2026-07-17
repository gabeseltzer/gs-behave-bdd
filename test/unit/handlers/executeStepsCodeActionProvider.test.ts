// Unit tests for the execute_steps "create step definition" quick-fix.
// Uses the REAL scanExecuteSteps over mock document content; step-def cache,
// workspace settings, and openTextDocument are stubbed.
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { ExecuteStepsCodeActionProvider, pickTargetStepsFile } from '../../../src/handlers/executeStepsCodeActionProvider';
import { EXECUTE_STEPS_STEP_NOT_FOUND } from '../../../src/handlers/executeStepsDiagnostics';
import * as common from '../../../src/common';
import * as stepsParser from '../../../src/parsers/stepsParser';
import { StepFileStep } from '../../../src/parsers/stepsParser';

suite('executeStepsCodeActionProvider', () => {
  let sandbox: sinon.SinonSandbox;
  const provider = new ExecuteStepsCodeActionProvider();

  const stepsFileUri = vscode.Uri.file('/test/features/steps/steps.py');
  const featuresUri = vscode.Uri.file('/test/features');

  setup(() => { sandbox = sinon.createSandbox(); });
  teardown(() => sandbox.restore());

  // content places an undefined embedded step on line 2
  const content = 'def helper(context):\n    context.execute_steps("""\n        When some new step here\n    """)\n';
  const stepTextStart = '        '.length;
  const stepText = 'When some new step here';

  function mockDocument(uri: vscode.Uri): vscode.TextDocument {
    const lines = content.split('\n');
    return {
      uri,
      languageId: 'python',
      getText: (range?: vscode.Range) => {
        if (!range) return content;
        return lines[range.start.line].substring(range.start.character, range.end.character);
      },
      lineCount: lines.length,
    } as unknown as vscode.TextDocument;
  }

  function makeNotFoundDiagnostic(): vscode.Diagnostic {
    const diag = new vscode.Diagnostic(
      new vscode.Range(2, stepTextStart, 2, stepTextStart + stepText.length),
      'No step definition found', vscode.DiagnosticSeverity.Warning);
    diag.code = EXECUTE_STEPS_STEP_NOT_FOUND;
    return diag;
  }

  function setupStubs(opts: { isPython?: boolean; targetContent?: string }) {
    sandbox.stub(common, 'couldBePythonStepsFile').returns(opts.isPython ?? true);
    sandbox.stub(common, 'getWorkspaceSettingsForFile').returns(
      { uri: vscode.Uri.file('/test'), featuresUri } as ReturnType<typeof common.getWorkspaceSettingsForFile>);
    sandbox.stub(stepsParser, 'getStepFileSteps').returns([]);
    sandbox.stub(vscode.workspace, 'openTextDocument').resolves({
      uri: stepsFileUri,
      lineCount: (opts.targetContent ?? 'x = 1\n').split('\n').length,
      getText: () => opts.targetContent ?? 'x = 1\n',
    } as unknown as vscode.TextDocument);
  }

  function makeContext(diags: vscode.Diagnostic[]): vscode.CodeActionContext {
    return { diagnostics: diags } as unknown as vscode.CodeActionContext;
  }

  test('offers a create-step-definition quick-fix for a not-found diagnostic', async () => {
    setupStubs({});
    const document = mockDocument(stepsFileUri);
    const diag = makeNotFoundDiagnostic();

    const actions = await provider.provideCodeActions(document, diag.range, makeContext([diag]));

    assert.ok(actions && actions.length === 1, 'expected exactly one quick-fix');
    const action = actions[0];
    assert.strictEqual(action.title, 'Create step definition "some new step here"');
    assert.strictEqual(action.isPreferred, true);
    assert.deepStrictEqual(action.diagnostics, [diag]);

    // the edit appends behave's canonical skeleton with the RESOLVED step type
    const edit = action.edit as unknown as { inserts: { uri: vscode.Uri; newText: string }[] };
    assert.strictEqual(edit.inserts.length, 1);
    assert.ok(common.urisMatch(edit.inserts[0].uri, stepsFileUri), 'skeleton must go into the current steps file');
    const text = edit.inserts[0].newText;
    assert.ok(text.includes('@when("some new step here")'), `expected @when decorator, got: ${text}`);
    assert.ok(text.includes('def step_impl(context):'));
    assert.ok(text.includes('raise NotImplementedError("STEP: when some new step here")'));
  });

  test('offers nothing when there are no execute_steps diagnostics', async () => {
    setupStubs({});
    const document = mockDocument(stepsFileUri);
    const otherDiag = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 5), 'other', vscode.DiagnosticSeverity.Error);
    otherDiag.code = 'some-other-code';

    const actions = await provider.provideCodeActions(document, otherDiag.range, makeContext([otherDiag]));
    assert.strictEqual(actions, undefined);
  });

  test('offers nothing for non-python files', async () => {
    setupStubs({ isPython: false });
    const document = mockDocument(stepsFileUri);
    const diag = makeNotFoundDiagnostic();

    const actions = await provider.provideCodeActions(document, diag.range, makeContext([diag]));
    assert.strictEqual(actions, undefined);
  });

  suite('pickTargetStepsFile', () => {
    test('returns the current file when it is a steps file', () => {
      sandbox.stub(common, 'isStepsFile').returns(true);
      const result = pickTargetStepsFile(stepsFileUri, featuresUri);
      assert.ok(result && common.urisMatch(result, stepsFileUri));
    });

    test('falls back to the steps file with the most definitions', () => {
      const helperUri = vscode.Uri.file('/test/features/helpers/util.py');
      const bigStepsUri = vscode.Uri.file('/test/features/steps/big.py');
      const smallStepsUri = vscode.Uri.file('/test/features/steps/small.py');
      // current file is NOT a steps file; big.py has 2 defs, small.py has 1
      sandbox.stub(common, 'isStepsFile').callsFake(uri => uri.path.includes('/steps/'));
      sandbox.stub(stepsParser, 'getStepFileSteps').returns([
        ['k1', new StepFileStep('k1', bigStepsUri, 'big.py', 'given', 'a')],
        ['k2', new StepFileStep('k2', bigStepsUri, 'big.py', 'when', 'b')],
        ['k3', new StepFileStep('k3', smallStepsUri, 'small.py', 'then', 'c')],
      ]);

      const result = pickTargetStepsFile(helperUri, featuresUri);
      assert.ok(result && common.urisMatch(result, bigStepsUri), `expected big.py, got ${result?.path}`);
    });
  });
});
