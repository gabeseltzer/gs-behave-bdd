// Tests for integration of behaveStepLoader with stepsParser
// Verifies that BehaveStepDefinition can be converted to StepFileStep

import * as assert from 'assert';
import * as vscode from 'vscode';
import { deleteStepFileSteps, parseRepWildcard } from '../../../src/parsers/stepsParser';
import { createStepFileStepFromBehaveDefinition } from '../../../src/parsers/stepsParserBehaveAdapter';
import type { BehaveStepDefinition } from '../../../src/parsers/behaveStepLoader';

suite('stepsParser x behaveStepLoader integration', () => {

  suite('createStepFileStepFromBehaveDefinition', () => {

    const featuresUri = vscode.Uri.file('c:/project/features');
    const stepsUri = vscode.Uri.file('c:/project/features/steps/example_steps.py');

    test('should convert behave definition with no parameters', () => {
      const behaveDef: BehaveStepDefinition = {
        stepType: 'given',
        pattern: 'I have a calculator',
        filePath: 'c:/project/features/steps/example_steps.py',
        lineNumber: 5,
        regex: '^I have a calculator$'
      };

      const stepFileStep = createStepFileStepFromBehaveDefinition(
        featuresUri,
        stepsUri,
        behaveDef
      );

      assert.strictEqual(stepFileStep.stepType, 'given');
      assert.strictEqual(stepFileStep.fileName, 'example_steps.py');
      assert.strictEqual(stepFileStep.textAsRe, 'I have a calculator');
      assert.strictEqual(stepFileStep.functionDefinitionRange.start.line, 4); // 1-indexed -> 0-indexed
    });

    test('should convert behave definition with simple parameter {type}', () => {
      const behaveDef: BehaveStepDefinition = {
        stepType: 'when',
        pattern: 'I add {a} and {b}',
        filePath: 'c:/project/features/steps/calc_steps.py',
        lineNumber: 10,
        regex: '^I add (?P<a>\\d+) and (?P<b>\\d+)$'
      };

      const stepFileStep = createStepFileStepFromBehaveDefinition(
        featuresUri,
        stepsUri,
        behaveDef
      );

      assert.strictEqual(stepFileStep.stepType, 'when');
      // textAsRe should convert {a} and {b} to .*
      assert.strictEqual(stepFileStep.textAsRe, `I add .* and .*`);
      assert.ok(stepFileStep.textAsRe.includes(parseRepWildcard));
    });

    test('should handle typed parameters {param:type}', () => {
      const behaveDef: BehaveStepDefinition = {
        stepType: 'when',
        pattern: 'I add {a:d} and {b:d}',
        filePath: 'c:/project/features/steps/calc_steps.py',
        lineNumber: 15,
        regex: '^I add (?P<a>\\d+) and (?P<b>\\d+)$'
      };

      const stepFileStep = createStepFileStepFromBehaveDefinition(
        featuresUri,
        stepsUri,
        behaveDef
      );

      assert.strictEqual(stepFileStep.stepType, 'when');
      // Typed parameters like {a:d} should also become .*
      assert.strictEqual(stepFileStep.textAsRe, `I add .* and .*`);
    });

    test('should escape regex special characters in pattern', () => {
      const behaveDef: BehaveStepDefinition = {
        stepType: 'then',
        pattern: 'the result is (.*) and cost is $100',
        filePath: 'c:/project/features/steps/calc_steps.py',
        lineNumber: 20,
        regex: '^the result is (.+) and cost is \\$100$'
      };

      const stepFileStep = createStepFileStepFromBehaveDefinition(
        featuresUri,
        stepsUri,
        behaveDef
      );

      // Special chars like ( ) . $ should be escaped, except { }
      assert.ok(stepFileStep.textAsRe.includes('\\('));
      assert.ok(stepFileStep.textAsRe.includes('\\)'));
      assert.ok(stepFileStep.textAsRe.includes('\\$'));
    });

    test('should create proper key for step mapping', () => {
      const behaveDef: BehaveStepDefinition = {
        stepType: 'given',
        pattern: 'I have 5 apples',
        filePath: 'c:/project/features/steps/example_steps.py',
        lineNumber: 5,
        regex: '^I have 5 apples$'
      };

      const stepFileStep = createStepFileStepFromBehaveDefinition(
        featuresUri,
        stepsUri,
        behaveDef
      );

      // Key should follow pattern: <featuresUriId>|^<stepType>|<textAsRe>$
      assert.ok(stepFileStep.key.includes('^given'));
      assert.ok(stepFileStep.key.includes('I have 5 apples$'));
    });

    test('should handle empty pattern', () => {
      const behaveDef: BehaveStepDefinition = {
        stepType: 'step',
        pattern: '',
        filePath: 'c:/project/features/steps/test.py',
        lineNumber: 1,
        regex: ''
      };

      // Should not throw
      const stepFileStep = createStepFileStepFromBehaveDefinition(
        featuresUri,
        stepsUri,
        behaveDef
      );

      assert.strictEqual(stepFileStep.textAsRe, '');
    });

    test('should handle step type case normalization', () => {
      const behaveDef: BehaveStepDefinition = {
        stepType: 'GIVEN', // uppercase from behave
        pattern: 'test',
        filePath: 'c:/project/features/steps/test.py',
        lineNumber: 1,
        regex: '^test$'
      };

      const stepFileStep = createStepFileStepFromBehaveDefinition(
        featuresUri,
        stepsUri,
        behaveDef
      );

      // Should normalize to lowercase
      assert.strictEqual(stepFileStep.stepType, 'given');
    });

  });

  suite('integration: convert and store behave definitions', () => {

    const featuresUri = vscode.Uri.file('c:/project/features');
    const stepsUri = vscode.Uri.file('c:/project/features/steps/example.py');

    teardown(() => {
      deleteStepFileSteps(featuresUri);
    });

    test('should be able to store converted behave definition', () => {
      const behaveDefinitions: BehaveStepDefinition[] = [
        {
          stepType: 'given',
          pattern: 'I have a calculator',
          filePath: stepsUri.fsPath,
          lineNumber: 5,
          regex: '^I have a calculator$'
        },
        {
          stepType: 'when',
          pattern: 'I add {a} and {b}',
          filePath: stepsUri.fsPath,
          lineNumber: 10,
          regex: '^I add (?P<a>\\d+) and (?P<b>\\d+)$'
        }
      ];

      // Store converted definitions (this would be done by fileParser)
      for (const behaveDef of behaveDefinitions) {
        const stepFileStep = createStepFileStepFromBehaveDefinition(
          featuresUri,
          stepsUri,
          behaveDef
        );
        // In real usage, this would be called by stepsParser internal storage
        // For now, we're just verifying the conversion works
        assert.ok(stepFileStep.key);
      }
    });

  });

});
