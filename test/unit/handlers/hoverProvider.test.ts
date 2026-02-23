// Unit tests for hoverProvider module
// Tests for extractStepDecoratorAndDocstring function with @step and other valid decorators

import * as assert from 'assert';
import { stepFileDecoratorPattern } from '../../../src/parsers/stepsParser';

// Mock function for testing (we'll test the extractStepDecoratorAndDocstring logic)
// Since this is a unit test, we need to extract and test the decorator extraction logic

suite('hoverProvider', () => {

  // Helper function that mirrors the extractStepDecoratorAndDocstring logic in hoverProvider.ts
  function extractStepDecoratorAndDocstring(content: string, functionLine: number) {
    const lines = content.split('\n');

    if (functionLine >= lines.length) {
      return undefined;
    }

    // Find the step decorator (the line(s) before the function definition)
    // Step decorators look like: @given('step pattern'), @when(u'pattern'), etc.
    let decorator = '';
    let decoratorStartLine = functionLine - 1;

    // Search backwards to find the decorator(s)
    while (decoratorStartLine >= 0) {
      const line = lines[decoratorStartLine].trim();

      // Check if this is a step decorator
      // Use the centralized pattern from stepsParser which excludes dead code decorators (@and, @but)
      const stepDecoratorRegex = new RegExp(stepFileDecoratorPattern, 'i');

      if (line.match(stepDecoratorRegex)) {
        // Found a step decorator, now read it (may be multi-line)
        let decoratorLine = line;
        let scanLine = decoratorStartLine;

        // Handle multi-line decorators
        while (scanLine < functionLine - 1 && !decoratorLine.includes(')')) {
          scanLine++;
          decoratorLine += ' ' + lines[scanLine].trim();
        }

        decorator = decoratorLine;
        break;
      } else if (line.startsWith('@')) {
        // Another decorator, keep searching backwards
        decoratorStartLine--;
      } else if (line === '' || line.startsWith('#')) {
        // Empty line or comment, keep searching
        decoratorStartLine--;
      } else if (line === ')' || line.startsWith('"') || line.startsWith("'")) {
        // Could be part of a multi-line decorator, keep searching
        decoratorStartLine--;
      } else if (line.startsWith('def ') || line.startsWith('class ')) {
        // Reached another function/class definition, stop searching
        break;
      } else {
        // Other code, keep searching (could be part of decorator content)
        decoratorStartLine--;
      }
    }

    if (!decorator) {
      return undefined;
    }

    // Extract docstring if present
    let docstring: string | undefined = undefined;
    let currentLine = functionLine + 1;

    // Skip empty lines
    while (currentLine < lines.length && lines[currentLine].trim() === '') {
      currentLine++;
    }

    if (currentLine < lines.length) {
      const nextLine = lines[currentLine].trim();

      // Check for docstring (""" or ''')
      if (nextLine.startsWith('"""') || nextLine.startsWith("'''")) {
        const docstringQuote = nextLine.substring(0, 3);
        const docstringLines: string[] = [];

        // Check if docstring ends on the same line
        if (nextLine.length > 3 && nextLine.substring(3).includes(docstringQuote)) {
          // Single-line docstring
          const endIndex = nextLine.indexOf(docstringQuote, 3);
          docstring = nextLine.substring(3, endIndex);
        } else {
          // Multi-line docstring
          docstringLines.push(nextLine.substring(3));
          currentLine++;

          while (currentLine < lines.length) {
            const line = lines[currentLine];
            if (line.trim().endsWith(docstringQuote)) {
              // Found the end of the docstring
              const endLine = line.trim();
              docstringLines.push(endLine.substring(0, endLine.length - 3));
              break;
            }
            docstringLines.push(line);
            currentLine++;
          }

          docstring = docstringLines
            .map(line => line.trim())
            .join('\n')
            .trim();
        }
      }
    }

    return {
      decorator,
      docstring
    };
  }

  suite('extractStepDecoratorAndDocstring', () => {

    suite('should match valid decorators', () => {

      test('should extract @step decorator', () => {
        const content = '@step("test step")\ndef test_function():\n    pass';
        const result = extractStepDecoratorAndDocstring(content, 1);
        assert.ok(result, 'Should find decorator');
        assert.strictEqual(result?.decorator, '@step("test step")', 'Should match @step decorator');
      });

      test('should extract @given decorator', () => {
        const content = '@given("I have a precondition")\ndef test_function():\n    pass';
        const result = extractStepDecoratorAndDocstring(content, 1);
        assert.ok(result, 'Should find decorator');
        assert.strictEqual(result?.decorator, '@given("I have a precondition")', 'Should match @given decorator');
      });

      test('should extract @when decorator', () => {
        const content = '@when("I do something")\ndef test_function():\n    pass';
        const result = extractStepDecoratorAndDocstring(content, 1);
        assert.ok(result, 'Should find decorator');
        assert.strictEqual(result?.decorator, '@when("I do something")', 'Should match @when decorator');
      });

      test('should extract @then decorator', () => {
        const content = '@then("result should be true")\ndef test_function():\n    pass';
        const result = extractStepDecoratorAndDocstring(content, 1);
        assert.ok(result, 'Should find decorator');
        assert.strictEqual(result?.decorator, '@then("result should be true")', 'Should match @then decorator');
      });

      test('should extract @behave.step decorator', () => {
        const content = '@behave.step("test step")\ndef test_function():\n    pass';
        const result = extractStepDecoratorAndDocstring(content, 1);
        assert.ok(result, 'Should find decorator');
        assert.strictEqual(result?.decorator, '@behave.step("test step")', 'Should match @behave.step decorator');
      });

      test('should extract @behave.given decorator', () => {
        const content = '@behave.given("I have setup")\ndef test_function():\n    pass';
        const result = extractStepDecoratorAndDocstring(content, 1);
        assert.ok(result, 'Should find decorator');
        assert.strictEqual(result?.decorator, '@behave.given("I have setup")', 'Should match @behave.given decorator');
      });

      test('should extract decorator with single quotes', () => {
        const content = "@step('test step')\ndef test_function():\n    pass";
        const result = extractStepDecoratorAndDocstring(content, 1);
        assert.ok(result, 'Should find decorator');
        assert.strictEqual(result?.decorator, "@step('test step')", 'Should match decorator with single quotes');
      });

      test('should extract decorator with leading whitespace', () => {
        const content = '    @step("test step")\ndef test_function():\n    pass';
        const result = extractStepDecoratorAndDocstring(content, 1);
        assert.ok(result, 'Should find decorator');
        assert.strictEqual(result?.decorator, '@step("test step")', 'Should match decorator with leading whitespace');
      });

    });

    suite('should NOT match dead code decorators', () => {

      test('should NOT match @and decorator', () => {
        const content = '@and("additional step")\ndef test_function():\n    pass';
        const result = extractStepDecoratorAndDocstring(content, 1);
        assert.strictEqual(result, undefined, 'Should NOT find @and decorator - it is dead code');
      });

      test('should NOT match @but decorator', () => {
        const content = '@but("negation")\ndef test_function():\n    pass';
        const result = extractStepDecoratorAndDocstring(content, 1);
        assert.strictEqual(result, undefined, 'Should NOT find @but decorator - it is dead code');
      });

    });

    suite('should handle multi-line decorators', () => {

      test('should extract multi-line @step decorator', () => {
        // Real-world multi-line decorator pattern as seen in behave projects
        const content = '@step(\n    "test step that is very long "\n    "and continues on next line"\n)\ndef test_function():\n    pass';
        const result = extractStepDecoratorAndDocstring(content, 4);
        assert.ok(result, 'Should find multi-line decorator');
        assert.ok(result?.decorator.includes('@step'), 'Should contain @step');
        assert.ok(result?.decorator.includes(')'), 'Should include closing parenthesis');
      });

      test('should extract decorator with multi-line pattern', () => {
        // Real-world multi-line decorator pattern with backslash continuation
        const content = '@given(\n    "user is logged in "\n    "and has permissions"\n)\ndef test_function():\n    pass';
        const result = extractStepDecoratorAndDocstring(content, 4);
        assert.ok(result, 'Should find multi-line decorator');
        assert.ok(result?.decorator.includes('@given'), 'Should contain @given');
      });

    });

    suite('should extract docstrings', () => {

      test('should extract single-line docstring', () => {
        const content = '@step("test")\ndef test_function():\n    """This is a docstring"""\n    pass';
        const result = extractStepDecoratorAndDocstring(content, 1);
        assert.ok(result, 'Should find decorator and docstring');
        assert.strictEqual(result?.docstring, 'This is a docstring', 'Should extract single-line docstring');
      });

      test('should extract multi-line docstring', () => {
        const content = '@step("test")\ndef test_function():\n    """\n    This is a multi-line\n    docstring\n    """\n    pass';
        const result = extractStepDecoratorAndDocstring(content, 1);
        assert.ok(result, 'Should find decorator and docstring');
        assert.ok(result?.docstring, 'Should extract multi-line docstring');
        assert.ok(result?.docstring?.includes('multi-line'), 'Should contain docstring content');
      });

      test('should handle decorator without docstring', () => {
        const content = '@step("test")\ndef test_function():\n    pass';
        const result = extractStepDecoratorAndDocstring(content, 1);
        assert.ok(result, 'Should find decorator');
        assert.strictEqual(result?.docstring, undefined, 'Should not have docstring');
      });

    });

    suite('should handle edge cases', () => {

      test('should handle function line beyond content', () => {
        const content = '@step("test")\ndef test_function():\n    pass';
        const result = extractStepDecoratorAndDocstring(content, 100);
        assert.strictEqual(result, undefined, 'Should return undefined for line beyond content');
      });

      test('should skip empty lines before function', () => {
        const content = '@step("test")\n\n\ndef test_function():\n    pass';
        const result = extractStepDecoratorAndDocstring(content, 3);
        assert.ok(result, 'Should find decorator despite empty lines');
        assert.strictEqual(result?.decorator, '@step("test")', 'Should match decorator');
      });

      test('should handle multiple decorators', () => {
        const content = '@fixture\n@step("test")\ndef test_function():\n    pass';
        const result = extractStepDecoratorAndDocstring(content, 2);
        assert.ok(result, 'Should find step decorator');
        assert.strictEqual(result?.decorator, '@step("test")', 'Should match @step, not @fixture');
      });

    });

  });

});
