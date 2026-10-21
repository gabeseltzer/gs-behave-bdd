// Unit tests for the pure step-definition snippet builder used by the
// "create step definition" quick-fixes.
import * as assert from 'assert';
import { buildStepDefinitionEdits, getActiveStepMatcher, StepDefinitionSource } from '../../../src/handlers/stepDefinitionSnippet';

suite('stepDefinitionSnippet', () => {

  function source(overrides: Partial<StepDefinitionSource> = {}): StepDefinitionSource {
    return {
      stepType: 'given',
      stepText: 'Given a user exists',
      textWithoutType: 'a user exists',
      inOutline: false,
      hasTable: false,
      hasDocString: false,
      ...overrides,
    };
  }

  const importedFile = 'from behave import given, when, then\n\n\n@given("something")\ndef step_impl(context):\n    pass\n';

  test('appends behave\'s canonical skeleton after two blank lines', () => {
    const result = buildStepDefinitionEdits(source(), importedFile);
    assert.strictEqual(result.importEdit, undefined);
    assert.strictEqual(result.appendText,
      '\n\n@given("a user exists")\ndef step_impl(context):\n    raise NotImplementedError("STEP: Given a user exists")\n');
    assert.strictEqual(result.raiseStatement, 'raise NotImplementedError("STEP: Given a user exists")');
  });

  test('pads a file with no trailing newline', () => {
    const result = buildStepDefinitionEdits(source(), importedFile.trimEnd());
    assert.ok(result.appendText.startsWith('\n\n\n@given'), JSON.stringify(result.appendText));
  });

  test('uses the resolved step type for And/But/* steps', () => {
    const result = buildStepDefinitionEdits(source({ stepType: 'then', stepText: 'And it works' }), importedFile);
    assert.ok(result.appendText.includes('@then("a user exists")'));
    assert.ok(result.appendText.includes('"STEP: And it works"'));
  });

  test('doubles literal braces for the default parse matcher', () => {
    const result = buildStepDefinitionEdits(source({ textWithoutType: 'the json {"a": 1} is sent' }), importedFile);
    assert.ok(result.appendText.includes('@given("the json {{\\"a\\": 1}} is sent")'), result.appendText);
  });

  test('escapes backslashes and quotes', () => {
    const result = buildStepDefinitionEdits(source({ textWithoutType: 'path C:\\temp is "ok"' }), importedFile);
    assert.ok(result.appendText.includes('@given("path C:\\\\temp is \\"ok\\"")'), result.appendText);
  });

  test('follows the file\'s single-quote style', () => {
    const file = "from behave import given\n\n@given('one')\ndef a(context):\n    pass\n\n@given('two')\ndef b(context):\n    pass\n";
    const result = buildStepDefinitionEdits(source({ textWithoutType: "it's here" }), file);
    assert.ok(result.appendText.includes("@given('it\\'s here')"), result.appendText);
  });

  test('regex-escapes and anchors when the file uses the re matcher', () => {
    const file = 'from behave import given, use_step_matcher\nuse_step_matcher("re")\n';
    const result = buildStepDefinitionEdits(source({ textWithoutType: 'it costs $5.00 (each)' }), file);
    assert.ok(result.appendText.includes('@given("^it costs \\\\$5\\\\.00 \\\\(each\\\\)$")'), result.appendText);
  });

  test('the matcher in effect at the end of the file wins', () => {
    assert.strictEqual(getActiveStepMatcher('use_step_matcher("re")\nx\nuse_step_matcher("parse")\n'), 'parse');
    assert.strictEqual(getActiveStepMatcher('step_matcher("re")\n'), 're');
    assert.strictEqual(getActiveStepMatcher(''), 'parse');
  });

  test('turns outline placeholders into parameters', () => {
    const result = buildStepDefinitionEdits(source({
      inOutline: true, textWithoutType: 'I eat <count> of <fruit name> then <count> more',
    }), importedFile);
    assert.ok(result.appendText.includes('@given("I eat {count} of {fruit_name} then {count} more")'), result.appendText);
    assert.ok(result.appendText.includes('def step_impl(context, count, fruit_name):'), result.appendText);
  });

  test('turns outline placeholders into named groups for the re matcher', () => {
    const file = 'from behave import given\nuse_step_matcher("re")\n';
    const result = buildStepDefinitionEdits(source({ inOutline: true, textWithoutType: 'I have <n> items' }), file);
    assert.ok(result.appendText.includes('@given("^I have (?P<n>.+) items$")'), result.appendText);
    assert.ok(result.appendText.includes('def step_impl(context, n):'));
  });

  test('leaves angle brackets literal outside an outline', () => {
    const result = buildStepDefinitionEdits(source({ textWithoutType: 'the <b> tag is bold' }), importedFile);
    assert.ok(result.appendText.includes('@given("the <b> tag is bold")'));
    assert.ok(result.appendText.includes('def step_impl(context):'));
  });

  test('hints at context.table and context.text', () => {
    const result = buildStepDefinitionEdits(source({ hasTable: true, hasDocString: true }), importedFile);
    assert.ok(result.appendText.includes("    # context.table holds the step's data table\n"));
    assert.ok(result.appendText.includes("    # context.text holds the step's doc string\n"));
  });

  test('uses the behave. prefix when the file does', () => {
    const file = 'import behave\n\n@behave.given("x")\ndef step_impl(context):\n    pass\n';
    const result = buildStepDefinitionEdits(source({ stepType: 'when' }), file);
    assert.ok(result.appendText.includes('@behave.when("a user exists")'));
    assert.strictEqual(result.importEdit, undefined);
  });

  suite('behave import', () => {
    test('extends an existing import that lacks the decorator', () => {
      const result = buildStepDefinitionEdits(source({ stepType: 'step' }), importedFile);
      assert.deepStrictEqual(result.importEdit, { line: 0, replace: true, text: 'from behave import given, when, then, step' });
    });

    test('leaves star and parenthesised imports alone', () => {
      assert.strictEqual(buildStepDefinitionEdits(source(), 'from behave import *\n').importEdit, undefined);
      assert.strictEqual(buildStepDefinitionEdits(source(), 'from behave import (\n    when,\n)\n').importEdit, undefined);
    });

    test('adds an import after the leading imports when there is none', () => {
      const file = 'import os\nfrom pathlib import (\n    Path,\n)\n\n\ndef helper():\n    import sys\n';
      const result = buildStepDefinitionEdits(source(), file);
      assert.deepStrictEqual(result.importEdit, { line: 4, replace: false, text: 'from behave import given, when, then' });
    });

    test('adds an import at the top of a file without imports', () => {
      const result = buildStepDefinitionEdits(source({ stepType: 'step' }), '');
      assert.deepStrictEqual(result.importEdit, { line: 0, replace: false, text: 'from behave import given, when, then, step' });
      assert.ok(result.appendText.startsWith('\n\n@step('));
    });
  });
});
