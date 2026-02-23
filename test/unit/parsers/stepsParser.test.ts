// Unit tests for stepsParser module - step decorator pattern validation

import * as assert from 'assert';
import { stepFileDecoratorPattern } from '../../../src/parsers/stepsParser';

suite('stepsParser', () => {

  suite('stepFileDecoratorPattern', () => {
    let pattern: RegExp;

    suiteSetup(() => {
      pattern = new RegExp(`${stepFileDecoratorPattern}.*`, 'i');
    });

    suite('should match valid decorators', () => {
      test('should match @given(', () => {
        const line = '@given("text")';
        assert.ok(pattern.test(line), `Pattern should match: ${line}`);
      });

      test('should match @when(', () => {
        const line = '@when("text")';
        assert.ok(pattern.test(line), `Pattern should match: ${line}`);
      });

      test('should match @then(', () => {
        const line = '@then("text")';
        assert.ok(pattern.test(line), `Pattern should match: ${line}`);
      });

      test('should match @step(', () => {
        const line = '@step("text")';
        assert.ok(pattern.test(line), `Pattern should match: ${line}`);
      });

      test('should match @behave.given(', () => {
        const line = '@behave.given("text")';
        assert.ok(pattern.test(line), `Pattern should match: ${line}`);
      });

      test('should match @behave.when(', () => {
        const line = '@behave.when("text")';
        assert.ok(pattern.test(line), `Pattern should match: ${line}`);
      });

      test('should match @behave.then(', () => {
        const line = '@behave.then("text")';
        assert.ok(pattern.test(line), `Pattern should match: ${line}`);
      });

      test('should match @behave.step(', () => {
        const line = '@behave.step("text")';
        assert.ok(pattern.test(line), `Pattern should match: ${line}`);
      });

      test('should match with leading whitespace', () => {
        const line = '    @given("text")';
        assert.ok(pattern.test(line), `Pattern should match: ${line}`);
      });

      test('should match with tabs', () => {
        const line = '\t\t@when("text")';
        assert.ok(pattern.test(line), `Pattern should match: ${line}`);
      });

      test('should match with single quotes', () => {
        const line = "@step('text')";
        assert.ok(pattern.test(line), `Pattern should match: ${line}`);
      });

      test('should be case insensitive - uppercase decorator', () => {
        const line = '@GIVEN("text")';
        assert.ok(pattern.test(line), `Pattern should match: ${line}`);
      });

      test('should be case insensitive - mixed case', () => {
        const line = '@Given("text")';
        assert.ok(pattern.test(line), `Pattern should match: ${line}`);
      });

      test('should match with raw string prefix (u prefix)', () => {
        const line = '@step(u"text")';
        assert.ok(pattern.test(line), `Pattern should match: ${line}`);
      });
    });

    suite('should NOT match invalid decorators', () => {
      test('should NOT match @and(', () => {
        const line = '@and("text")';
        assert.ok(!pattern.test(line), `Pattern should NOT match: ${line}`);
      });

      test('should NOT match @but(', () => {
        const line = '@but("text")';
        assert.ok(!pattern.test(line), `Pattern should NOT match: ${line}`);
      });

      test('should NOT match @other(', () => {
        const line = '@other("text")';
        assert.ok(!pattern.test(line), `Pattern should NOT match: ${line}`);
      });

      test('should NOT match random decorator', () => {
        const line = '@random("text")';
        assert.ok(!pattern.test(line), `Pattern should NOT match: ${line}`);
      });

      test('should NOT match text without decorator', () => {
        const line = 'def my_function():';
        assert.ok(!pattern.test(line), `Pattern should NOT match: ${line}`);
      });

      test('should NOT match comment', () => {
        const line = '# @given("text")';
        assert.ok(!pattern.test(line), `Pattern should NOT match: ${line}`);
      });
    });

    suite('should extract step decorator group correctly', () => {
      test('should capture @given decorator', () => {
        const line = '@given("my step text")';
        const stepPattern = new RegExp(`${stepFileDecoratorPattern}`, 'i');
        const match = stepPattern.exec(line);
        assert.ok(match, 'Should match @given');
      });

      test('should capture @behave.when decorator', () => {
        const line = '@behave.when("my step text")';
        const stepPattern = new RegExp(`${stepFileDecoratorPattern}`, 'i');
        const match = stepPattern.exec(line);
        assert.ok(match, 'Should match @behave.when');
      });

      test('should handle multi-line context', () => {
        const lines = `@given("I have a precondition")
def step_impl(context):
    pass`;
        const firstLine = lines.split('\n')[0];
        assert.ok(pattern.test(firstLine), 'Should match first line of multi-line context');
      });
    });

  });

});
