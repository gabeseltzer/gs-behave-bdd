// Unit tests for step auto-completion inside execute_steps strings.
// Uses the REAL scanExecuteSteps scanner over mock document content - only the
// step-definition cache and workspace settings are stubbed.
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { executeStepsAutoCompleteProvider } from '../../../src/handlers/executeStepsAutoCompleteProvider';
import * as common from '../../../src/common';
import * as stepsParser from '../../../src/parsers/stepsParser';
import { StepFileStep } from '../../../src/parsers/stepsParser';

suite('executeStepsAutoCompleteProvider', () => {
  let sandbox: sinon.SinonSandbox;

  const docUri = vscode.Uri.file('/test/features/steps/lib.py');
  const stepDefUri = vscode.Uri.file('/test/features/steps/steps.py');
  const featuresUri = vscode.Uri.file('/test/features');
  const sepr = common.sepr;

  setup(() => { sandbox = sinon.createSandbox(); });
  teardown(() => sandbox.restore());

  function makeStepDefEntry(stepType: string, textAsRe: string): [string, StepFileStep] {
    // getStepFileSteps strips the leading uriId prefix by default, so returned keys
    // start with ^<stepType>| - mirror that shape here
    const key = `^${stepType}${sepr}${textAsRe}$`;
    return [key, new StepFileStep(key, stepDefUri, 'steps.py', stepType, textAsRe)];
  }

  function mockDocument(content: string): vscode.TextDocument {
    const lines = content.split('\n');
    return {
      uri: docUri,
      languageId: 'python',
      getText: () => content,
      lineAt: (lineOrPos: number | vscode.Position) => {
        const line = typeof lineOrPos === 'number' ? lineOrPos : lineOrPos.line;
        return { text: lines[line] ?? '', lineNumber: line };
      },
      lineCount: lines.length,
    } as unknown as vscode.TextDocument;
  }

  function setupStubs(stepDefs: [string, StepFileStep][]) {
    sandbox.stub(common, 'couldBePythonStepsFile').returns(true);
    sandbox.stub(common, 'getWorkspaceSettingsForFile').returns(
      { uri: vscode.Uri.file('/test'), featuresUri } as ReturnType<typeof common.getWorkspaceSettingsForFile>);
    sandbox.stub(stepsParser, 'getStepFileSteps').returns(stepDefs);
  }

  test('suggests matching step defs for a Given line inside an execute_steps literal', () => {
    setupStubs([
      makeStepDefEntry('given', 'a machine named .*'),
      makeStepDefEntry('when', 'the machine runs'),
    ]);
    const content = 'def helper(context):\n    context.execute_steps("""\n        Given a machine\n    """)\n';
    const document = mockDocument(content);

    // cursor at end of "        Given a machine" (line 2)
    const items = executeStepsAutoCompleteProvider.provideCompletionItems(document, new vscode.Position(2, 23));

    assert.ok(items, 'expected completion items');
    assert.strictEqual(items.length, 1, 'only the given-bucket def matching the typed prefix should be suggested');
    assert.strictEqual(items[0].label, 'a machine named ?');
  });

  test('suggests nothing on python lines outside execute_steps literals', () => {
    setupStubs([makeStepDefEntry('given', 'a machine named .*')]);
    // a comment line that LOOKS like a step but is not inside a literal
    const content = 'def helper(context):\n    x = 1  # noqa\n    given_text = "Given a machine"\n';
    const document = mockDocument('Given a machine\n' + content);

    const items = executeStepsAutoCompleteProvider.provideCompletionItems(document, new vscode.Position(0, 15));
    assert.strictEqual(items, undefined, 'a step-looking line outside any execute_steps literal must get no suggestions');
  });

  test('And inherits the previous concrete step type inside the literal', () => {
    setupStubs([
      makeStepDefEntry('when', 'the machine runs .*'),
      makeStepDefEntry('given', 'the machine runs slowly'),
    ]);
    const content = 'context.execute_steps("""\n    When the machine starts\n    And the machine runs\n""")\n';
    const document = mockDocument(content);

    const items = executeStepsAutoCompleteProvider.provideCompletionItems(document, new vscode.Position(2, 24));

    assert.ok(items);
    assert.strictEqual(items.length, 1, 'And after When must only suggest @when/@step defs');
    assert.strictEqual(items[0].label, 'the machine runs ?');
  });

  test('also suggests generic @step-bucket definitions', () => {
    setupStubs([makeStepDefEntry('step', 'anything at all')]);
    const content = 'context.execute_steps("Then anything")\n';
    const document = mockDocument(content);

    const items = executeStepsAutoCompleteProvider.provideCompletionItems(document, new vscode.Position(0, 36));

    assert.ok(items);
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].label, 'anything at all');
  });
});
