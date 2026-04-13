// Unit tests for CodeLens provider module
// Tests for step definition reference count CodeLens in Python step files

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as common from '../../../src/common';
import * as stepMappings from '../../../src/parsers/stepMappings';
import * as stepsParser from '../../../src/parsers/stepsParser';
import { StepFileStep } from '../../../src/parsers/stepsParser';
import { StepMapping } from '../../../src/parsers/stepMappings';
import { FeatureFileStep } from '../../../src/parsers/featureParser';
import { StepCodeLensProvider, findDecoratorLine } from '../../../src/handlers/codeLensProvider';
import { parser } from '../../../src/extension';


suite('codeLensProvider', () => {
  let sandbox: sinon.SinonSandbox;
  let provider: StepCodeLensProvider;

  setup(() => {
    sandbox = sinon.createSandbox();
    provider = new StepCodeLensProvider();
  });
  teardown(() => sandbox.restore());


  function makeStepFileStep(uri: vscode.Uri, stepType: string, textAsRe: string, funcLine: number): StepFileStep {
    const step = new StepFileStep(
      `key${sepr}^${stepType}${sepr}${textAsRe}$`,
      uri,
      'steps.py',
      stepType,
      textAsRe,
    );
    step.functionDefinitionRange = new vscode.Range(funcLine, 0, funcLine, 20);
    return step;
  }

  const sepr = common.sepr;

  function makeFeatureFileStep(uri: vscode.Uri, line: number, text: string, stepType: string): FeatureFileStep {
    return new FeatureFileStep(
      'key', uri, 'test.feature',
      new vscode.Range(line, 0, line, text.length),
      text, text.replace(/^(Given|When|Then|And|But)\s+/i, ''), stepType
    );
  }

  function makeMockDocument(uri: vscode.Uri, content: string): vscode.TextDocument {
    const lines = content.split('\n');
    return {
      uri,
      getText: () => content,
      lineAt: (line: number) => ({
        text: lines[line] || '',
        range: new vscode.Range(line, 0, line, (lines[line] || '').length),
        rangeIncludingLineBreak: new vscode.Range(line, 0, line + 1, 0),
        firstNonWhitespaceCharacterIndex: (lines[line] || '').search(/\S/),
        isEmptyOrWhitespace: (lines[line] || '').trim() === '',
        lineNumber: line,
      }),
      lineCount: lines.length,
    } as unknown as vscode.TextDocument;
  }

  const mockCancelToken: vscode.CancellationToken = {
    isCancellationRequested: false,
    onCancellationRequested: () => ({ dispose: () => { /* mock */ } }),
  };


  suite('provideCodeLenses', () => {

    test('should return empty array when showStepReferenceCodeLens is false', async () => {
      const uri = vscode.Uri.file('/test/steps/steps.py');
      const doc = makeMockDocument(uri, '@given("a step")\ndef step_impl(context):\n    pass');
      sandbox.stub(vscode.workspace, 'getConfiguration').returns({
        get: (key: string) => key === 'showStepReferenceCodeLens' ? false : undefined,
        has: () => false,
        inspect: () => undefined,
        update: () => Promise.resolve(),
      } as unknown as vscode.WorkspaceConfiguration);

      const lenses = await provider.provideCodeLenses(doc, mockCancelToken);

      assert.strictEqual(lenses.length, 0);
    });

    test('should return empty array for non-steps file', async () => {
      const uri = vscode.Uri.file('/test/features/test.feature');
      const doc = makeMockDocument(uri, 'Feature: test');
      sandbox.stub(common, 'isStepsFile').returns(false);
      sandbox.stub(common, 'couldBePythonStepsFile').returns(false);

      const lenses = await provider.provideCodeLenses(doc, mockCancelToken);

      assert.strictEqual(lenses.length, 0);
    });

    test('should return empty array when no workspace settings found', async () => {
      const uri = vscode.Uri.file('/test/steps/steps.py');
      const doc = makeMockDocument(uri, '@given("a step")\ndef step_impl(context):\n    pass');
      sandbox.stub(common, 'isStepsFile').returns(true);
      sandbox.stub(common, 'couldBePythonStepsFile').returns(true);
      sandbox.stub(common, 'getWorkspaceSettingsForFile').returns(undefined);

      const lenses = await provider.provideCodeLenses(doc, mockCancelToken);

      assert.strictEqual(lenses.length, 0);
    });

    test('should return empty array when steps parse is not complete', async () => {
      const uri = vscode.Uri.file('/test/steps/steps.py');
      const doc = makeMockDocument(uri, '@given("a step")\ndef step_impl(context):\n    pass');
      sandbox.stub(common, 'isStepsFile').returns(true);
      sandbox.stub(common, 'couldBePythonStepsFile').returns(true);
      sandbox.stub(common, 'getWorkspaceSettingsForFile').returns({
        uri: vscode.Uri.file('/test'),
        featuresUri: vscode.Uri.file('/test/features'),
      } as ReturnType<typeof common.getWorkspaceSettingsForFile>);
      sandbox.stub(parser, 'initialStepsParseComplete').get(() => false);

      const lenses = await provider.provideCodeLenses(doc, mockCancelToken);

      assert.strictEqual(lenses.length, 0);
    });

    test('should return one CodeLens per step definition with reference count', async () => {
      const stepsUri = vscode.Uri.file('/test/steps/steps.py');
      const featuresUri = vscode.Uri.file('/test/features');
      const featureUri = vscode.Uri.file('/test/features/test.feature');

      const step1 = makeStepFileStep(stepsUri, 'given', 'a user exists', 1);
      const step2 = makeStepFileStep(stepsUri, 'when', 'user logs in', 5);

      const content = [
        '@given("a user exists")',      // 0 - decorator
        'def step_given_user(context):', // 1 - func
        '    pass',                      // 2
        '',                              // 3
        '@when("user logs in")',         // 4 - decorator
        'def step_when_login(context):', // 5 - func
        '    pass',                      // 6
      ].join('\n');

      const doc = makeMockDocument(stepsUri, content);

      sandbox.stub(common, 'isStepsFile').returns(true);
      sandbox.stub(common, 'couldBePythonStepsFile').returns(true);
      sandbox.stub(common, 'getWorkspaceSettingsForFile').returns({
        uri: vscode.Uri.file('/test'),
        featuresUri: featuresUri,
      } as ReturnType<typeof common.getWorkspaceSettingsForFile>);
      sandbox.stub(parser, 'initialStepsParseComplete').get(() => true);

      // step1 has 3 references, step2 has 1
      sandbox.stub(stepsParser, 'getStepFileSteps').returns([
        ['key1', step1],
        ['key2', step2],
      ]);

      const featureStep1 = makeFeatureFileStep(featureUri, 2, 'Given a user exists', 'given');
      const featureStep2 = makeFeatureFileStep(featureUri, 5, 'Given a user exists', 'given');
      const featureStep3 = makeFeatureFileStep(featureUri, 8, 'Given a user exists', 'given');
      const featureStep4 = makeFeatureFileStep(featureUri, 3, 'When user logs in', 'when');

      sandbox.stub(stepMappings, 'getStepMappingsForStepsFileFunction').callsFake(
        (_uri: vscode.Uri, lineNo: number) => {
          if (lineNo === 1) {
            return [
              new StepMapping(featuresUri, step1, featureStep1),
              new StepMapping(featuresUri, step1, featureStep2),
              new StepMapping(featuresUri, step1, featureStep3),
            ];
          }
          if (lineNo === 5) {
            return [
              new StepMapping(featuresUri, step2, featureStep4),
            ];
          }
          return [];
        }
      );

      const lenses = await provider.provideCodeLenses(doc, mockCancelToken);

      assert.strictEqual(lenses.length, 2, 'Should have one CodeLens per step definition');

      // First lens: step1 — decorator at line 0, func at line 1
      assert.strictEqual(lenses[0].range.start.line, 0, 'First lens should be at decorator line 0');
      assert.strictEqual(lenses[0].command?.title, '3 references');
      assert.strictEqual(lenses[0].command?.command, 'gs-behave-bdd.codeLensReferences');

      // Second lens: step2 — decorator at line 4, func at line 5
      assert.strictEqual(lenses[1].range.start.line, 4, 'Second lens should be at decorator line 4');
      assert.strictEqual(lenses[1].command?.title, '1 reference');
      assert.strictEqual(lenses[1].command?.command, 'gs-behave-bdd.codeLensReferences');
    });

    test('should show "0 references" for step with no feature file matches', async () => {
      const stepsUri = vscode.Uri.file('/test/steps/steps.py');
      const featuresUri = vscode.Uri.file('/test/features');

      const step = makeStepFileStep(stepsUri, 'given', 'an unused step', 1);

      const content = '@given("an unused step")\ndef step_unused(context):\n    pass';
      const doc = makeMockDocument(stepsUri, content);

      sandbox.stub(common, 'isStepsFile').returns(true);
      sandbox.stub(common, 'couldBePythonStepsFile').returns(true);
      sandbox.stub(common, 'getWorkspaceSettingsForFile').returns({
        uri: vscode.Uri.file('/test'),
        featuresUri: featuresUri,
      } as ReturnType<typeof common.getWorkspaceSettingsForFile>);
      sandbox.stub(parser, 'initialStepsParseComplete').get(() => true);
      sandbox.stub(stepsParser, 'getStepFileSteps').returns([['key1', step]]);
      sandbox.stub(stepMappings, 'getStepMappingsForStepsFileFunction').returns([]);

      const lenses = await provider.provideCodeLenses(doc, mockCancelToken);

      assert.strictEqual(lenses.length, 1);
      assert.strictEqual(lenses[0].command?.title, '0 references');
      assert.strictEqual(lenses[0].range.start.line, 0, 'Lens should be at decorator line');
    });

    test('should only include steps whose URI matches the document', async () => {
      const stepsUri = vscode.Uri.file('/test/steps/steps.py');
      const otherStepsUri = vscode.Uri.file('/test/steps/other_steps.py');
      const featuresUri = vscode.Uri.file('/test/features');

      const step1 = makeStepFileStep(stepsUri, 'given', 'this file step', 1);
      const step2 = makeStepFileStep(otherStepsUri, 'when', 'other file step', 1);

      const content = '@given("this file step")\ndef step_impl(context):\n    pass';
      const doc = makeMockDocument(stepsUri, content);

      sandbox.stub(common, 'isStepsFile').returns(true);
      sandbox.stub(common, 'couldBePythonStepsFile').returns(true);
      sandbox.stub(common, 'getWorkspaceSettingsForFile').returns({
        uri: vscode.Uri.file('/test'),
        featuresUri: featuresUri,
      } as ReturnType<typeof common.getWorkspaceSettingsForFile>);
      sandbox.stub(parser, 'initialStepsParseComplete').get(() => true);
      sandbox.stub(stepsParser, 'getStepFileSteps').returns([
        ['key1', step1],
        ['key2', step2],
      ]);
      sandbox.stub(stepMappings, 'getStepMappingsForStepsFileFunction').returns([]);

      const lenses = await provider.provideCodeLenses(doc, mockCancelToken);

      assert.strictEqual(lenses.length, 1, 'Should only show CodeLens for steps in this file');
    });

    test('should handle library steps file (couldBePythonStepsFile but not isStepsFile)', async () => {
      const libUri = vscode.Uri.file('/test/lib/common_steps.py');
      const featuresUri = vscode.Uri.file('/test/features');

      const step = makeStepFileStep(libUri, 'given', 'a library step', 1);

      const content = '@given("a library step")\ndef step_lib(context):\n    pass';
      const doc = makeMockDocument(libUri, content);

      sandbox.stub(common, 'isStepsFile').returns(false);
      sandbox.stub(common, 'couldBePythonStepsFile').returns(true);
      sandbox.stub(common, 'getWorkspaceSettingsForFile').returns({
        uri: vscode.Uri.file('/test'),
        featuresUri: featuresUri,
      } as ReturnType<typeof common.getWorkspaceSettingsForFile>);
      sandbox.stub(parser, 'initialStepsParseComplete').get(() => true);
      sandbox.stub(stepsParser, 'getStepFileSteps').returns([['key1', step]]);
      sandbox.stub(stepMappings, 'getStepMappingsForStepsFileFunction').returns([]);

      const lenses = await provider.provideCodeLenses(doc, mockCancelToken);

      assert.strictEqual(lenses.length, 1, 'Should work for library files too');
    });

    test('should deduplicate steps on the same function line', async () => {
      const stepsUri = vscode.Uri.file('/test/steps/steps.py');
      const featuresUri = vscode.Uri.file('/test/features');

      // Two step entries pointing to the same function line (e.g., @given + @when on same func,
      // or loaded by both step parser and behave loader)
      const step1 = makeStepFileStep(stepsUri, 'given', 'a shared step', 2);
      const step2 = makeStepFileStep(stepsUri, 'when', 'a shared step', 2);

      const content = '@given("a shared step")\n@when("a shared step")\ndef step_shared(context):\n    pass';
      const doc = makeMockDocument(stepsUri, content);

      sandbox.stub(common, 'isStepsFile').returns(true);
      sandbox.stub(common, 'couldBePythonStepsFile').returns(true);
      sandbox.stub(common, 'getWorkspaceSettingsForFile').returns({
        uri: vscode.Uri.file('/test'),
        featuresUri: featuresUri,
      } as ReturnType<typeof common.getWorkspaceSettingsForFile>);
      sandbox.stub(parser, 'initialStepsParseComplete').get(() => true);
      sandbox.stub(stepsParser, 'getStepFileSteps').returns([
        ['key1', step1],
        ['key2', step2],
      ]);
      sandbox.stub(stepMappings, 'getStepMappingsForStepsFileFunction').returns([]);

      const lenses = await provider.provideCodeLenses(doc, mockCancelToken);

      assert.strictEqual(lenses.length, 1, 'Should deduplicate to one CodeLens per function line');
    });

    test('should sort CodeLenses by line number', async () => {
      const stepsUri = vscode.Uri.file('/test/steps/steps.py');
      const featuresUri = vscode.Uri.file('/test/features');

      // Steps defined at lines 5, 1, 10 - should be returned sorted
      const step1 = makeStepFileStep(stepsUri, 'given', 'step at line 5', 5);
      const step2 = makeStepFileStep(stepsUri, 'when', 'step at line 1', 1);
      const step3 = makeStepFileStep(stepsUri, 'then', 'step at line 10', 10);

      const content = Array(12).fill('# line').join('\n');
      const doc = makeMockDocument(stepsUri, content);

      sandbox.stub(common, 'isStepsFile').returns(true);
      sandbox.stub(common, 'couldBePythonStepsFile').returns(true);
      sandbox.stub(common, 'getWorkspaceSettingsForFile').returns({
        uri: vscode.Uri.file('/test'),
        featuresUri: featuresUri,
      } as ReturnType<typeof common.getWorkspaceSettingsForFile>);
      sandbox.stub(parser, 'initialStepsParseComplete').get(() => true);
      sandbox.stub(stepsParser, 'getStepFileSteps').returns([
        ['key1', step1],
        ['key2', step2],
        ['key3', step3],
      ]);
      sandbox.stub(stepMappings, 'getStepMappingsForStepsFileFunction').returns([]);

      const lenses = await provider.provideCodeLenses(doc, mockCancelToken);

      assert.strictEqual(lenses.length, 3);
      assert.strictEqual(lenses[0].range.start.line, 1, 'First lens should be earliest line');
      assert.strictEqual(lenses[1].range.start.line, 5);
      assert.strictEqual(lenses[2].range.start.line, 10, 'Last lens should be latest line');
    });

  });


  suite('findDecoratorLine', () => {

    test('should find single decorator above function', () => {
      const uri = vscode.Uri.file('/test/steps/steps.py');
      const doc = makeMockDocument(uri, '@given("a step")\ndef step_impl(context):\n    pass');
      assert.strictEqual(findDecoratorLine(doc, 1), 0);
    });

    test('should find topmost stacked decorator', () => {
      const uri = vscode.Uri.file('/test/steps/steps.py');
      const content = [
        '@given("a step")',   // 0
        '@when("a step")',    // 1
        'def step_impl(context):', // 2
        '    pass',
      ].join('\n');
      const doc = makeMockDocument(uri, content);
      assert.strictEqual(findDecoratorLine(doc, 2), 0);
    });

    test('should skip blank lines between decorator and function', () => {
      const uri = vscode.Uri.file('/test/steps/steps.py');
      const content = [
        '@given("a step")',   // 0
        '',                   // 1
        'def step_impl(context):', // 2
      ].join('\n');
      const doc = makeMockDocument(uri, content);
      assert.strictEqual(findDecoratorLine(doc, 2), 0);
    });

    test('should skip comments between decorator and function', () => {
      const uri = vscode.Uri.file('/test/steps/steps.py');
      const content = [
        '@given("a step")',   // 0
        '# some comment',    // 1
        'def step_impl(context):', // 2
      ].join('\n');
      const doc = makeMockDocument(uri, content);
      assert.strictEqual(findDecoratorLine(doc, 2), 0);
    });

    test('should skip non-step decorators and find the step decorator above them', () => {
      const uri = vscode.Uri.file('/test/steps/steps.py');
      const content = [
        '@given("a step")',   // 0
        '@some_other_decorator', // 1
        'def step_impl(context):', // 2
      ].join('\n');
      const doc = makeMockDocument(uri, content);
      assert.strictEqual(findDecoratorLine(doc, 2), 0);
    });

    test('should return funcLine when no decorator found', () => {
      const uri = vscode.Uri.file('/test/steps/steps.py');
      const content = [
        'x = 1',             // 0
        'def step_impl(context):', // 1
      ].join('\n');
      const doc = makeMockDocument(uri, content);
      assert.strictEqual(findDecoratorLine(doc, 1), 1);
    });

    test('should handle function on first line of file', () => {
      const uri = vscode.Uri.file('/test/steps/steps.py');
      const doc = makeMockDocument(uri, 'def step_impl(context):\n    pass');
      assert.strictEqual(findDecoratorLine(doc, 0), 0);
    });

    test('should handle behave.given decorator', () => {
      const uri = vscode.Uri.file('/test/steps/steps.py');
      const content = [
        '@behave.given("a step")', // 0
        'def step_impl(context):', // 1
      ].join('\n');
      const doc = makeMockDocument(uri, content);
      assert.strictEqual(findDecoratorLine(doc, 1), 0);
    });

  });

});
