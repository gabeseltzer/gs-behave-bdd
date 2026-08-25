// Unit tests for OutputAttributor - deciding which test item each line of behave's
// output belongs to.
//
// The fixtures here are REAL behave output, captured from a run of project A's
// group1_features/outline_mixed.feature with --color=on --show-source. That matters:
// the whole approach rests on the claim that behave's own pretty formatter appends
// " # <file>:<line>" to each scenario header, that the line is the example ROW's for
// an outline, and that step comments name a .py file instead - so the fixtures are
// the evidence, not an invention that happens to match the parser.

import * as assert from 'assert';
import * as vscode from 'vscode';
import { OutputAttributor } from '../../../src/runners/outputAttribution';
import { FeatureLineIndex } from '../../../src/runners/itemIndex';
import { QueueItem } from '../../../src/extension';

suite('outputAttribution', () => {

  const projectUri = vscode.Uri.file('/proj');
  const FEATURE = 'behave tests/some tests/group1_features/outline_mixed.feature';

  const makeItem = (id: string, relPath: string, zeroBasedLine: number): QueueItem => ({
    test: {
      id,
      uri: vscode.Uri.joinPath(projectUri, relPath),
      range: new vscode.Range(new vscode.Position(zeroBasedLine, 0), new vscode.Position(zeroBasedLine, 10)),
    },
    scenario: {},
  } as unknown as QueueItem);

  const attributorFor = (items: QueueItem[], fallback?: vscode.TestItem) =>
    new OutputAttributor(new FeatureLineIndex(items), projectUri, fallback);

  // Verbatim from the captured run (SGR included, cursor-up already resolved by
  // BehaveOutputFilter, which is what runs before this).
  const HEADER_ROW_1 =
    '  Scenario Outline: Blenders Success Red Tree Frog -- @1.1 Amphibians \x1b[90m # ' +
    FEATURE + ':10\x1b[0m';
  const HEADER_ROW_2 =
    '  Scenario Outline: Blenders Success iPhone -- @2.1 Consumer Electronics \x1b[90m # ' +
    FEATURE + ':14\x1b[0m';
  const FEATURE_HEADER =
    'Feature: Mixed outline\x1b[90m # ' + FEATURE + ':1\x1b[0m';
  const STEP_LINE =
    '    \x1b[32mGiven \x1b[0m\x1b[32mI put "\x1b[0m\x1b[32m\x1b[1mRed Tree Frog\x1b[0m' +
    '\x1b[32m" in a blender\x1b[0m\x1b[90m       # behave tests/some tests/steps/outline.feature.py:5\x1b[0m';


  test('a scenario header switches attribution to that scenario', () => {
    const row1 = makeItem('row1', FEATURE, 9); // behave line 10
    const a = attributorFor([row1]);

    assert.strictEqual(a.attribute(HEADER_ROW_1).test?.id, 'row1');
  });


  test('an outline example row is matched on its own data-row line', () => {
    const row1 = makeItem('row1', FEATURE, 9);  // behave line 10
    const row2 = makeItem('row2', FEATURE, 13); // behave line 14
    const a = attributorFor([row1, row2]);

    assert.strictEqual(a.attribute(HEADER_ROW_1).test?.id, 'row1');
    assert.strictEqual(a.attribute(HEADER_ROW_2).test?.id, 'row2');
  });


  test('following lines stay with the scenario until the next header', () => {
    const row1 = makeItem('row1', FEATURE, 9);
    const row2 = makeItem('row2', FEATURE, 13);
    const a = attributorFor([row1, row2]);

    a.attribute(HEADER_ROW_1);
    assert.strictEqual(a.attribute(STEP_LINE).test?.id, 'row1');
    assert.strictEqual(a.attribute('    some captured stdout').test?.id, 'row1');
    assert.strictEqual(a.attribute(HEADER_ROW_2).test?.id, 'row2');
    assert.strictEqual(a.attribute(STEP_LINE).test?.id, 'row2');
  });


  // The step comment names a step DEFINITION (.py), which is never in the index, so
  // it must leave attribution alone rather than clearing it.
  test('a step definition comment does not change attribution', () => {
    const row1 = makeItem('row1', FEATURE, 9);
    const a = attributorFor([row1]);

    a.attribute(HEADER_ROW_1);
    assert.strictEqual(a.attribute(STEP_LINE).test?.id, 'row1');
  });


  test('only the header line carries a location', () => {
    const row1 = makeItem('row1', FEATURE, 9);
    const a = attributorFor([row1]);

    const header = a.attribute(HEADER_ROW_1);
    assert.ok(header.location, 'the header should be clickable');
    assert.strictEqual(header.location?.range.start.line, 9);

    assert.strictEqual(a.attribute(STEP_LINE).location, undefined,
      'repeating one location down every body line would link the whole block to it');
  });


  // The Feature: line is in a known feature file but is not a queued scenario, so the
  // previous scenario has ended and its output must not absorb what follows.
  test('the feature header resets attribution to the fallback', () => {
    const fallback = { id: 'featureItem' } as unknown as vscode.TestItem;
    const row1 = makeItem('row1', FEATURE, 9);
    const a = attributorFor([row1], fallback);

    a.attribute(HEADER_ROW_1);
    assert.strictEqual(a.attribute(FEATURE_HEADER).test?.id, 'featureItem');
  });


  test('a scenario this run did not select falls back rather than mis-attributing', () => {
    const fallback = { id: 'featureItem' } as unknown as vscode.TestItem;
    const row1 = makeItem('row1', FEATURE, 9);
    const a = attributorFor([row1], fallback);

    a.attribute(HEADER_ROW_1);
    const unselected =
      '  Scenario: something else \x1b[90m # ' + FEATURE + ':99\x1b[0m';
    assert.strictEqual(a.attribute(unselected).test?.id, 'featureItem');
  });


  test('lines before the first header get the fallback item', () => {
    const fallback = { id: 'featureItem' } as unknown as vscode.TestItem;
    const a = attributorFor([makeItem('row1', FEATURE, 9)], fallback);

    assert.strictEqual(a.attribute('USING RUNNER: behave.runner:Runner').test?.id, 'featureItem');
  });


  test('text is passed through untouched', () => {
    const a = attributorFor([makeItem('row1', FEATURE, 9)]);
    assert.strictEqual(a.attribute(HEADER_ROW_1).text, HEADER_ROW_1,
      'attribution must not rewrite the visible output');
  });


  // In parallel mode BehaveOutputFilter has already prefixed every line, and the
  // source comment is anchored at the END of the line, so the prefix is irrelevant.
  test('a parallel-mode line prefix does not defeat matching', () => {
    const row1 = makeItem('row1', FEATURE, 9);
    const a = attributorFor([row1]);

    assert.strictEqual(a.attribute('[outline_mixed] ' + HEADER_ROW_1).test?.id, 'row1');
  });


  test('monochrome output (no SGR) still matches', () => {
    const row1 = makeItem('row1', FEATURE, 9);
    const a = attributorFor([row1]);

    const plain = '  Scenario Outline: Blenders Success Red Tree Frog -- @1.1 Amphibians  # ' + FEATURE + ':10';
    assert.strictEqual(a.attribute(plain).test?.id, 'row1');
  });


  test('a path containing spaces resolves (project A has two)', () => {
    const row1 = makeItem('row1', FEATURE, 9);
    const a = attributorFor([row1]);

    assert.ok(FEATURE.includes(' '), 'fixture should exercise spaces');
    assert.strictEqual(a.attribute(HEADER_ROW_1).test?.id, 'row1');
  });


  test('an indented line with no source comment stays with the scenario', () => {
    const row1 = makeItem('row1', FEATURE, 9);
    const a = attributorFor([row1]);

    a.attribute(HEADER_ROW_1);
    assert.strictEqual(a.attribute('      ASSERT FAILED:').test?.id, 'row1');
    assert.strictEqual(a.attribute('').test?.id, 'row1', 'a blank line is not a boundary');
  });


  // Everything behave prints inside a feature is indented; the run summary is not.
  // Without this the whole summary block was attributed to whichever scenario ran
  // last - confirmed against a real run, where the final example row collected 14
  // lines against 5 for every other row.
  test('the unindented run summary detaches from the last scenario', () => {
    const fallback = { id: 'featureItem' } as unknown as vscode.TestItem;
    const row1 = makeItem('row1', FEATURE, 9);
    const a = attributorFor([row1], fallback);

    a.attribute(HEADER_ROW_1);
    assert.strictEqual(a.attribute('Failing scenarios:').test?.id, 'featureItem');
    assert.strictEqual(a.attribute('0 features passed, 1 failed, 0 skipped').test?.id, 'featureItem');
  });


  test('the parallel-mode prefix does not hide the indentation boundary', () => {
    const fallback = { id: 'featureItem' } as unknown as vscode.TestItem;
    const row1 = makeItem('row1', FEATURE, 9);
    const a = new OutputAttributor(
      new FeatureLineIndex([row1]), projectUri, fallback, '[outline_mixed] ');

    a.attribute('[outline_mixed] ' + HEADER_ROW_1);
    assert.strictEqual(a.attribute('[outline_mixed]       ASSERT FAILED:').test?.id, 'row1',
      'still indented once the prefix is discounted');
    assert.strictEqual(a.attribute('[outline_mixed] Failing scenarios:').test?.id, 'featureItem');
  });


  test('a hash inside a scenario name does not throw or mis-resolve', () => {
    const fallback = { id: 'featureItem' } as unknown as vscode.TestItem;
    const row1 = makeItem('row1', FEATURE, 9);
    const a = attributorFor([row1], fallback);

    // Looks like a comment, but names no feature file we know.
    const odd = '  Scenario: issue #123:45 reproduction';
    assert.doesNotThrow(() => a.attribute(odd));
    assert.strictEqual(a.attribute(odd).test?.id, 'featureItem',
      'unresolvable comment must not become an attribution');
  });


  test('windows-style separators from behave resolve', () => {
    const row1 = makeItem('row1', 'features/simple.feature', 2); // behave line 3
    const a = attributorFor([row1]);

    const line = '  Scenario: x  # features\\simple.feature:3';
    assert.strictEqual(a.attribute(line).test?.id, 'row1');
  });

});
