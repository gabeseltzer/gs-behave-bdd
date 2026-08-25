// Unit tests for the shared failure-message builder.
//
// Both result paths word failures through here, so the wording is asserted against
// what behave itself writes. The junit fixtures below are real: captured from
// example-projects/project A's group1_features/basic.feature, whose failing scenario
// produces type="AssertionError" with an EMPTY message (a bare Python assert carries
// no comparison), and whose missing step produces type="NoneType" message="None".
// That is why expected/actual extraction is deliberately narrow.

import * as assert from 'assert';
import * as vscode from 'vscode';
import { buildFailureMessage, failureText, findComparison } from '../../../src/runners/failureMessage';

suite('failureMessage', () => {

  const value = (m: vscode.TestMessage): string => {
    const v = m.message as unknown as { value?: string };
    return typeof v === 'string' ? v : (v.value ?? '');
  };


  suite('failureText', () => {

    test('words a failing step the way behave junit does', () => {
      const text = failureText(
        { keyword: 'When ', name: 'we implement a failing test', status: 'failed' },
        'ASSERT FAILED: ', 'failed');

      assert.match(text, /^Failing step: When we implement a failing test \.\.\. failed$/m);
      assert.match(text, /ASSERT FAILED:/);
    });

    test('an undefined step is described by its status', () => {
      const text = failureText(
        { keyword: 'When ', name: 'we have a missing step', status: 'undefined' },
        undefined, 'error');

      assert.strictEqual(text, 'Failing step: When we have a missing step ... undefined');
    });

    test('with no step and no error, the status is still shown', () => {
      // Otherwise the peek view is blank, which is what the streamed path used to do.
      assert.strictEqual(failureText(undefined, undefined, 'failed'), 'failed');
    });

    test('error text alone is used when no step is known', () => {
      assert.strictEqual(failureText(undefined, '  boom  ', 'failed'), 'boom');
    });

    test('a step with no status falls back to the scenario status', () => {
      const text = failureText({ keyword: 'Then ', name: 'x', status: null }, undefined, 'failed');
      assert.strictEqual(text, 'Failing step: Then x ... failed');
    });
  });


  suite('findComparison', () => {

    test('finds an inline expected/but got pair', () => {
      assert.deepStrictEqual(findComparison('expected mush but got toxic waste'),
        { expected: 'mush', actual: 'toxic waste' });
    });

    test('finds labelled Expected:/Actual: lines', () => {
      assert.deepStrictEqual(findComparison('AssertionError\nExpected: 3\nActual: 4'),
        { expected: '3', actual: '4' });
    });

    test('accepts "was" as well as "got"', () => {
      assert.deepStrictEqual(findComparison('Expected 7, but was 9'),
        { expected: '7', actual: '9' });
    });

    // A bare Python assert reaches us as an empty message, and unittest's "a != b"
    // does not say which side is expected - a guess would render a confidently
    // reversed diff, which is worse than no diff at all.
    test('does not invent a comparison from an unlabelled one', () => {
      assert.strictEqual(findComparison(''), undefined);
      assert.strictEqual(findComparison('ASSERT FAILED: '), undefined);
      assert.strictEqual(findComparison("AssertionError: 'a' != 'b'"), undefined);
      assert.strictEqual(findComparison('Failing step: When x ... failed'), undefined);
    });
  });


  suite('buildFailureMessage', () => {

    test('the summary line is emphasised and the body fenced', () => {
      const m = buildFailureMessage('Failing step: When x ... failed\nASSERT FAILED: nope');
      const v = value(m);

      assert.match(v, /\*\*Failing step/, 'summary should be bold');
      assert.match(v, /```/, 'body should be fenced');
      assert.match(v, /ASSERT FAILED: nope/);
    });

    // TestMessage renders a MarkdownString as markdown, so an unfenced traceback would
    // have its indentation reflowed and any * or _ in a value eaten.
    test('a traceback keeps its indentation inside the fence', () => {
      const traceback = 'Traceback:\n  File "steps/x.py", line 3, in step_impl\n    assert a_*_b == c';
      const v = value(buildFailureMessage('Failing step: Then y ... failed\n' + traceback));

      assert.match(v, /\n {2}File "steps\/x\.py", line 3, in step_impl\n/);
      assert.match(v, /assert a_\*_b == c/, 'markdown must not eat the asterisks');
    });

    test('a body containing a fence cannot close the block early', () => {
      const v = value(buildFailureMessage('summary\nsee ``` this'));
      const fences = v.match(/`{3,}/g) ?? [];
      assert.strictEqual(fences.length, 3, 'expected an opening fence, the inner run, and a closing fence');
      assert.ok(fences[0].length > 3, 'the outer fence must be wider than the inner run');
      assert.strictEqual(fences[0], fences[2], 'opening and closing fences must match');
    });

    test('a summary with markdown characters is escaped, not rendered', () => {
      const v = value(buildFailureMessage('Failing step: When I put *x* in a blender ... failed'));
      assert.match(v, /\\\*x\\\*/, 'asterisks in the step name must not become emphasis');
    });

    test('a single-line failure produces no empty fence', () => {
      const v = value(buildFailureMessage('failed'));
      assert.doesNotMatch(v, /```/, 'nothing to fence');
      assert.match(v, /\*\*failed\*\*/);
    });

    test('the location is attached when given', () => {
      const uri = vscode.Uri.file('/proj/features/x.feature');
      const at = new vscode.Position(9, 0);
      const m = buildFailureMessage('failed', new vscode.Location(uri, new vscode.Range(at, at)));

      assert.strictEqual(m.location?.range.start.line, 9);
      assert.strictEqual(m.location?.uri.path, uri.path);
    });

    test('a stated comparison becomes expectedOutput/actualOutput', () => {
      const m = buildFailureMessage('Failing step: Then it matches ... failed\nexpected mush but got toxic waste');

      assert.strictEqual(m.expectedOutput, 'mush');
      assert.strictEqual(m.actualOutput, 'toxic waste');
    });

    test('no diff fields are set when no comparison is stated', () => {
      const m = buildFailureMessage('Failing step: When x ... failed\nASSERT FAILED: ');

      assert.strictEqual(m.expectedOutput, undefined);
      assert.strictEqual(m.actualOutput, undefined);
    });
  });

});
