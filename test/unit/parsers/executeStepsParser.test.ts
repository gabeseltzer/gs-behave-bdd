// Unit tests for executeStepsParser module - execute_steps() call-site scanner

import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  scanExecuteSteps,
  parseExecuteStepsFileContent,
  getExecuteStepsCallSteps,
  deleteExecuteStepsCallSteps,
  getExecuteStepsCallStepAtLine,
} from '../../../src/parsers/executeStepsParser';

suite('executeStepsParser', () => {

  suite('scanExecuteSteps', () => {

    const fileUri = vscode.Uri.file('c:/exec-scan-test-1/steps/steps.py');

    test('triple double-quote literal with multiple steps produces one call step per keyword line', () => {
      const content = [
        'def test():',
        '    context.execute_steps("""',
        '        Given a thing',
        '        When another thing happens',
        '        Then a result occurs',
        '    """)',
      ].join('\n');
      const { callSteps, invalidLines } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 3, 'should find 3 call steps');
      assert.strictEqual(invalidLines.length, 0);
      assert.strictEqual(callSteps[0].stepType, 'given');
      assert.strictEqual(callSteps[0].range.start.line, 2);
      assert.strictEqual(callSteps[1].stepType, 'when');
      assert.strictEqual(callSteps[1].range.start.line, 3);
      assert.strictEqual(callSteps[2].stepType, 'then');
      assert.strictEqual(callSteps[2].range.start.line, 4);
    });

    test('triple single-quote literal with multiple steps produces one call step per keyword line', () => {
      const content = [
        "context.execute_steps('''",
        '    Given single quote step',
        "''')",
      ].join('\n');
      const { callSteps } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 1);
      assert.strictEqual(callSteps[0].stepType, 'given');
      assert.strictEqual(callSteps[0].range.start.line, 1);
      assert.strictEqual(callSteps[0].textWithoutType, 'single quote step');
    });

    test('single-line literal containing exactly one step produces one record', () => {
      const content = 'context.execute_steps("Given single line step")';
      const { callSteps } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 1);
      assert.strictEqual(callSteps[0].stepType, 'given');
      assert.strictEqual(callSteps[0].textWithoutType, 'single line step');
    });

    test('single-line literal containing a backslash-n escape is skipped', () => {
      const content = 'context.execute_steps("Given a\\nWhen b")';
      const { callSteps, invalidLines } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 0);
      assert.strictEqual(invalidLines.length, 0);
    });

    test('f-string prefix is skipped silently (lowercase)', () => {
      const content = [
        'name = "world"',
        'context.execute_steps(f"""',
        '    Given something {name}',
        '""")',
      ].join('\n');
      const { callSteps } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 0);
    });

    test('F-string prefix is skipped silently (uppercase)', () => {
      const content = [
        'context.execute_steps(F"""',
        '    Given something {name}',
        '""")',
      ].join('\n');
      const { callSteps } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 0);
    });

    test('b-prefix is skipped silently (lowercase)', () => {
      const content = [
        'context.execute_steps(b"""',
        '    Given bytes thing',
        '""")',
      ].join('\n');
      const { callSteps } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 0);
    });

    test('B-prefix is skipped silently (uppercase)', () => {
      const content = 'context.execute_steps(B"Given bytes thing")';
      const { callSteps } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 0);
    });

    test('u/U/r/R prefixes are scanned normally', () => {
      const content = [
        'context.execute_steps(u"""',
        '    Given u prefix thing',
        '""")',
      ].join('\n');
      const { callSteps } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 1);
      assert.strictEqual(callSteps[0].textWithoutType, 'u prefix thing');

      const content2 = 'context.execute_steps(R"Given r prefix thing")';
      const { callSteps: callSteps2 } = scanExecuteSteps(content2, fileUri);
      assert.strictEqual(callSteps2.length, 1);
      assert.strictEqual(callSteps2[0].textWithoutType, 'r prefix thing');
    });

    test('.format(...) suffix sets hasFormatPlaceholders on the call steps', () => {
      const content = [
        'context.execute_steps("""',
        '    Given a {0} thing',
        '""".format(x))',
      ].join('\n');
      const { callSteps } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 1);
      assert.strictEqual(callSteps[0].hasFormatPlaceholders, true);
    });

    test('% suffix sets hasFormatPlaceholders on the call steps', () => {
      const content = [
        'context.execute_steps("""',
        '    Given a %s thing',
        '""" % (x,))',
      ].join('\n');
      const { callSteps } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 1);
      assert.strictEqual(callSteps[0].hasFormatPlaceholders, true);
    });

    test('textwrap.dedent(...) wrapper is unwrapped and scanned', () => {
      const content = [
        'context.execute_steps(textwrap.dedent("""',
        '    Given dedented step',
        '"""))',
      ].join('\n');
      const { callSteps } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 1);
      assert.strictEqual(callSteps[0].textWithoutType, 'dedented step');
    });

    test('+ concatenation after the literal is skipped silently', () => {
      const content = 'context.execute_steps("Given a" + " thing")';
      const { callSteps } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 0);
    });

    test('implicit adjacent-string concatenation on the same line is skipped silently (CR-02)', () => {
      const content = 'context.execute_steps(\'Given a thing \' \'with more text\')';
      const { callSteps } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 0, 'adjacent-string concatenation would truncate the runtime step text');
    });

    test('implicit adjacent-string concatenation wrapped across lines is skipped silently (CR-02)', () => {
      const content = [
        "context.execute_steps('Given a thing '",
        "                      'with more text')",
      ].join('\n');
      const { callSteps } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 0, 'wrapped adjacent-string concatenation would truncate the runtime step text');
    });

    test('.join( suffix after the literal is skipped silently (CR-02)', () => {
      const content = 'context.execute_steps("Given a thing".join(parts))';
      const { callSteps } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 0);
    });

    test('.replace( suffix after the literal is skipped silently (CR-02)', () => {
      const content = [
        'context.execute_steps("""',
        '    Given a PLACEHOLDER thing',
        '""".replace("PLACEHOLDER", value))',
      ].join('\n');
      const { callSteps } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 0);
    });

    test('stray second argument after the literal is skipped silently (CR-02)', () => {
      const content = 'context.execute_steps("Given a thing", extra_arg)';
      const { callSteps } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 0);
    });

    test('unterminated triple-quote literal is skipped silently', () => {
      const content = [
        'context.execute_steps("""',
        '    Given unterminated step',
      ].join('\n');
      const { callSteps, invalidLines } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 0);
      assert.strictEqual(invalidLines.length, 0);
    });

    test('unterminated single-line literal is skipped silently', () => {
      const content = 'context.execute_steps("Given unterminated';
      const { callSteps } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 0);
    });

    test('non-literal (variable) argument produces zero records', () => {
      const content = 'context.execute_steps(my_step_var)';
      const { callSteps, invalidLines } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 0);
      assert.strictEqual(invalidLines.length, 0);
    });

    test('And inherits the previous step type within the same call', () => {
      const content = [
        'context.execute_steps("""',
        '    Given a thing',
        '    And another thing',
        '""")',
      ].join('\n');
      const { callSteps } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 2);
      assert.strictEqual(callSteps[1].stepType, 'given');
      assert.strictEqual(callSteps[1].isAmbiguousType, false);
    });

    test('But inherits the previous step type within the same call', () => {
      const content = [
        'context.execute_steps("""',
        '    When something happens',
        '    But not always',
        '""")',
      ].join('\n');
      const { callSteps } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 2);
      assert.strictEqual(callSteps[1].stepType, 'when');
      assert.strictEqual(callSteps[1].isAmbiguousType, false);
    });

    test('leading And with no prior step in the call is marked isAmbiguousType', () => {
      const content = [
        'context.execute_steps("""',
        '    And a leading and step',
        '""")',
      ].join('\n');
      const { callSteps } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 1);
      assert.strictEqual(callSteps[0].isAmbiguousType, true);
    });

    test('leading * with no prior step in the call is marked isAmbiguousType', () => {
      const content = [
        'context.execute_steps("""',
        '    * a leading star step',
        '""")',
      ].join('\n');
      const { callSteps } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 1);
      assert.strictEqual(callSteps[0].isAmbiguousType, true);
    });

    test('blank lines inside the literal are skipped', () => {
      const content = [
        'context.execute_steps("""',
        '    Given a thing',
        '',
        '    When another',
        '""")',
      ].join('\n');
      const { callSteps, invalidLines } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 2);
      assert.strictEqual(invalidLines.length, 0);
    });

    test('full-line # comment inside the literal is skipped', () => {
      const content = [
        'context.execute_steps("""',
        '    # this is a comment',
        '    Given a thing',
        '""")',
      ].join('\n');
      const { callSteps, invalidLines } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 1);
      assert.strictEqual(invalidLines.length, 0);
    });

    test('inline # is treated as part of the step text', () => {
      const content = [
        'context.execute_steps("""',
        '    Given a thing # trailing note',
        '""")',
      ].join('\n');
      const { callSteps } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 1);
      assert.ok(callSteps[0].text.includes('# trailing note'), 'inline # should be part of step text');
    });

    test('docstring block inside the literal is skipped (attaches to preceding step)', () => {
      const content = [
        "context.execute_steps('''",
        '    Given a thing with data',
        '        """',
        '        some docstring content',
        '        """',
        '    When done',
        "''')",
      ].join('\n');
      const { callSteps, invalidLines } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 2);
      assert.strictEqual(invalidLines.length, 0);
      assert.strictEqual(callSteps[0].stepType, 'given');
      assert.strictEqual(callSteps[1].stepType, 'when');
    });

    test('table row inside the literal is skipped', () => {
      const content = [
        "context.execute_steps('''",
        '    Given a thing',
        '        | col1 | col2 |',
        '        | a    | b    |',
        "''')",
      ].join('\n');
      const { callSteps, invalidLines } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 1);
      assert.strictEqual(invalidLines.length, 0);
    });

    test('commented-out call site produces zero records (CR-01)', () => {
      const content = '# context.execute_steps("Given a thing")';
      const { callSteps, invalidLines } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 0, 'commented-out call sites must not produce call steps');
      assert.strictEqual(invalidLines.length, 0);
    });

    test('indented commented-out multi-line call site produces zero records (CR-01)', () => {
      const content = [
        'def helper(context):',
        '    # context.execute_steps("""',
        '    #     Given a thing',
        '    # """)',
      ].join('\n');
      const { callSteps, invalidLines } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 0);
      assert.strictEqual(invalidLines.length, 0);
    });

    test('call site after a # on the same line produces zero records (CR-01)', () => {
      const content = 'x = 1  # see also context.execute_steps("Given a thing")';
      const { callSteps } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 0);
    });

    test('literal body mentioning execute_steps( is not rescanned as a nested call site (CR-01)', () => {
      const content = [
        'context.execute_steps("""',
        '    Given a step that itself mentions execute_steps("Given nested")',
        '""")',
      ].join('\n');
      const { callSteps } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 1, 'the consumed literal body must not be rescanned for call sites');
      assert.ok(callSteps[0].text.startsWith('Given a step that itself mentions'));
    });

    test('KNOWN LIMITATION: execute_steps example inside an enclosing docstring is still emitted (CR-01)', () => {
      // Fully eliminating this false positive needs a string-aware pre-pass over the .py file.
      // This test documents the current, known-limitation behavior so that any change to it
      // (fix or regression) is caught and the test updated deliberately.
      const content = [
        'def helper(context):',
        '    """Example: context.execute_steps("Given something")"""',
      ].join('\n');
      const { callSteps } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 1, 'docstring-enclosed examples are a documented false-positive limitation');
    });

    test('non-blank/non-comment/non-table/non-docstring line matching no keyword is an invalid-content record', () => {
      const content = [
        "context.execute_steps('''",
        '    Given a thing',
        '    this is not a valid step line',
        "''')",
      ].join('\n');
      const { callSteps, invalidLines } = scanExecuteSteps(content, fileUri);
      assert.strictEqual(callSteps.length, 1);
      assert.strictEqual(invalidLines.length, 1);
      assert.strictEqual(invalidLines[0].text, 'this is not a valid step line');
    });

  });

  suite('parseExecuteStepsFileContent', () => {

    test('caching: parse then getExecuteStepsCallSteps returns stored records', () => {
      const featuresUri = vscode.Uri.file('c:/exec-cache-test-1/features');
      const fileUri = vscode.Uri.file('c:/exec-cache-test-1/features/steps/steps.py');
      deleteExecuteStepsCallSteps(featuresUri);

      const content = [
        'context.execute_steps("""',
        '    Given cached thing',
        '""")',
      ].join('\n');
      const count = parseExecuteStepsFileContent(featuresUri, content, fileUri, 'test');
      assert.strictEqual(count, 1);

      const stored = getExecuteStepsCallSteps(featuresUri);
      assert.strictEqual(stored.length, 1);
    });

    test('per-file clear: re-parsing the same fileUri replaces, does not accumulate', () => {
      const featuresUri = vscode.Uri.file('c:/exec-cache-test-2/features');
      const fileUri = vscode.Uri.file('c:/exec-cache-test-2/features/steps/steps.py');
      deleteExecuteStepsCallSteps(featuresUri);

      const content = [
        'context.execute_steps("""',
        '    Given first parse',
        '""")',
      ].join('\n');
      parseExecuteStepsFileContent(featuresUri, content, fileUri, 'test');
      parseExecuteStepsFileContent(featuresUri, content, fileUri, 'test');

      const stored = getExecuteStepsCallSteps(featuresUri);
      assert.strictEqual(stored.length, 1, 're-parsing must not accumulate duplicate entries');
    });

    test('deleteExecuteStepsCallSteps clears to length 0', () => {
      const featuresUri = vscode.Uri.file('c:/exec-cache-test-3/features');
      const fileUri = vscode.Uri.file('c:/exec-cache-test-3/features/steps/steps.py');
      deleteExecuteStepsCallSteps(featuresUri);

      const content = [
        'context.execute_steps("""',
        '    Given a thing to delete',
        '""")',
      ].join('\n');
      parseExecuteStepsFileContent(featuresUri, content, fileUri, 'test');
      assert.strictEqual(getExecuteStepsCallSteps(featuresUri).length, 1);

      deleteExecuteStepsCallSteps(featuresUri);
      assert.strictEqual(getExecuteStepsCallSteps(featuresUri).length, 0);
    });

    test('getExecuteStepsCallStepAtLine returns the record at a known line and undefined off-line', () => {
      const featuresUri = vscode.Uri.file('c:/exec-cache-test-4/features');
      const fileUri = vscode.Uri.file('c:/exec-cache-test-4/features/steps/steps.py');
      deleteExecuteStepsCallSteps(featuresUri);

      const content = [
        'context.execute_steps("""',
        '    Given a thing at a known line',
        '""")',
      ].join('\n');
      parseExecuteStepsFileContent(featuresUri, content, fileUri, 'test');

      const atLine1 = getExecuteStepsCallStepAtLine(fileUri, 1);
      assert.ok(atLine1, 'should find a record at line 1');
      assert.strictEqual(atLine1?.stepType, 'given');

      const atLine99 = getExecuteStepsCallStepAtLine(fileUri, 99);
      assert.strictEqual(atLine99, undefined);
    });

  });

});
