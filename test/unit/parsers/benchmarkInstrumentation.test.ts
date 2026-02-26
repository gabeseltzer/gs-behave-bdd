// Tests for benchmark instrumentation in the parsing pipeline
// Verifies that storeBehaveStepDefinitions and convertPatternToTextAsRe work correctly

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { deleteStepFileSteps, getStepFileSteps } from '../../../src/parsers/stepsParser';
import { storeBehaveStepDefinitions, convertPatternToTextAsRe } from '../../../src/parsers/stepsParserBehaveAdapter';
import type { BehaveStepDefinition } from '../../../src/parsers/behaveStepLoader';

suite('benchmarkInstrumentation', () => {

  suite('convertPatternToTextAsRe', () => {

    test('should return empty string for empty input', () => {
      assert.strictEqual(convertPatternToTextAsRe(''), '');
    });

    test('should return plain text unchanged', () => {
      assert.strictEqual(convertPatternToTextAsRe('I have a calculator'), 'I have a calculator');
    });

    test('should replace {param} with .*', () => {
      const result = convertPatternToTextAsRe('I add {a} and {b}');
      assert.strictEqual(result, 'I add .* and .*');
    });

    test('should replace typed params {param:d} with .*', () => {
      const result = convertPatternToTextAsRe('I add {a:d} and {b:d}');
      assert.strictEqual(result, 'I add .* and .*');
    });

    test('should escape regex special characters', () => {
      const result = convertPatternToTextAsRe('the result is (something)');
      assert.ok(result.includes('\\('), 'Should escape (');
      assert.ok(result.includes('\\)'), 'Should escape )');
    });

    test('should escape dollar sign', () => {
      const result = convertPatternToTextAsRe('cost is $100');
      assert.ok(result.includes('\\$'), 'Should escape $');
    });
  });


  suite('storeBehaveStepDefinitions', () => {

    const featuresUri = vscode.Uri.file('c:/project/features');
    let readFileStub: sinon.SinonStub;

    setup(() => {
      deleteStepFileSteps(featuresUri);
      readFileStub = sinon.stub(fs.promises, 'readFile');
    });

    teardown(() => {
      readFileStub.restore();
      deleteStepFileSteps(featuresUri);
    });

    test('should store definitions and return count', async () => {
      const fileContent = `from behave import given, when, then

@given('I have a calculator')
def step_impl(context):
    pass

@when('I add {a:d} and {b:d}')
def step_add(context, a, b):
    context.result = a + b
`;
      readFileStub.resolves(fileContent);

      const definitions: BehaveStepDefinition[] = [
        {
          stepType: 'given',
          pattern: 'I have a calculator',
          filePath: 'c:/project/features/steps/calc.py',
          lineNumber: 3,
          regex: '^I have a calculator$'
        },
        {
          stepType: 'when',
          pattern: 'I add {a:d} and {b:d}',
          filePath: 'c:/project/features/steps/calc.py',
          lineNumber: 7,
          regex: '^I add (?P<a>\\d+) and (?P<b>\\d+)$'
        }
      ];

      const count = await storeBehaveStepDefinitions(featuresUri, definitions);
      assert.strictEqual(count, 2);

      const steps = getStepFileSteps(featuresUri);
      assert.strictEqual(steps.length, 2);
    });

    test('should return 0 for empty definitions array', async () => {
      const count = await storeBehaveStepDefinitions(featuresUri, []);
      assert.strictEqual(count, 0);
    });

    test('should batch-read all unique files upfront and only read each file once', async () => {
      const fileContent = `@given('step one')
def step_one(context):
    pass

@when('step two')
def step_two(context):
    pass
`;
      readFileStub.resolves(fileContent);

      const definitions: BehaveStepDefinition[] = [
        {
          stepType: 'given',
          pattern: 'step one',
          filePath: 'c:/project/features/steps/shared.py',
          lineNumber: 1,
          regex: '^step one$'
        },
        {
          stepType: 'when',
          pattern: 'step two',
          filePath: 'c:/project/features/steps/shared.py',
          lineNumber: 5,
          regex: '^step two$'
        }
      ];

      await storeBehaveStepDefinitions(featuresUri, definitions);

      // fs.promises.readFile should be called only once for the same file path
      assert.strictEqual(readFileStub.callCount, 1, 'readFile should be called once due to batch dedup');
    });

    test('should handle file read errors gracefully', async () => {
      readFileStub.rejects(new Error('ENOENT: no such file'));

      const definitions: BehaveStepDefinition[] = [
        {
          stepType: 'given',
          pattern: 'I have a step',
          filePath: 'c:/project/features/steps/missing.py',
          lineNumber: 1,
          regex: '^I have a step$'
        }
      ];

      // Should not throw
      const count = await storeBehaveStepDefinitions(featuresUri, definitions);
      // Step should still be stored (with undefined file content)
      assert.strictEqual(count, 1);
    });

    test('should read different files separately', async () => {
      const fileContentA = `@given('step A')
def step_a(context):
    pass
`;
      const fileContentB = `@when('step B')
def step_b(context):
    pass
`;
      readFileStub.withArgs('c:/project/features/steps/a.py', 'utf8').resolves(fileContentA);
      readFileStub.withArgs('c:/project/features/steps/b.py', 'utf8').resolves(fileContentB);

      const definitions: BehaveStepDefinition[] = [
        {
          stepType: 'given',
          pattern: 'step A',
          filePath: 'c:/project/features/steps/a.py',
          lineNumber: 1,
          regex: '^step A$'
        },
        {
          stepType: 'when',
          pattern: 'step B',
          filePath: 'c:/project/features/steps/b.py',
          lineNumber: 1,
          regex: '^step B$'
        }
      ];

      await storeBehaveStepDefinitions(featuresUri, definitions);

      // readFile should be called twice (once per unique file)
      assert.strictEqual(readFileStub.callCount, 2, 'readFile should be called once per unique file');
    });
  });

});
