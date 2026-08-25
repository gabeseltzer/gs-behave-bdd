// Tests for the Scenario Outline rollup message.
//
// A Scenario Outline has no runtime existence in behave: ScenarioOutlineBuilder treats
// it as a template and expands it into one generated scenario per example row, and
// there is no before_outline hook. behave therefore never prints a line for the outline
// itself, so nothing can be attributed to it and its node shows "The test case did not
// report any output" - on a node that is not a test case.
//
// The fix puts the useful information - WHICH row broke - in the MESSAGE, which never
// touches the run's output stream. Copying the rows' output onto the parent was the
// alternative and would have duplicated every outline's output in the terminal.

import * as assert from 'assert';
import * as vscode from 'vscode';
import { updateTest, RowOutcome } from '../../../src/parsers/junitParser';
import { WorkspaceSettings } from '../../../src/settings';
import { QueueItem } from '../../../src/extension';

suite('scenario outline rollup', () => {

  const featureUri = vscode.Uri.file('/proj/features/outline_mixed.feature');

  interface Call { kind: string; id: string; message?: string; locLine?: number }

  let calls: Call[];

  const msgText = (m: vscode.TestMessage): string => {
    const v = m.message as unknown as { value?: string };
    return typeof v === 'string' ? v : (v.value ?? '');
  };

  const makeRun = (name = 'run-rollup') => ({
    name,
    token: { isCancellationRequested: false },
    passed: (t: { id: string }) => calls.push({ kind: 'passed', id: t.id }),
    skipped: (t: { id: string }) => calls.push({ kind: 'skipped', id: t.id }),
    failed: (t: { id: string }, m: vscode.TestMessage) =>
      calls.push({ kind: 'failed', id: t.id, message: msgText(m), locLine: m.location?.range.start.line }),
    errored: (t: { id: string }, m: vscode.TestMessage) =>
      calls.push({ kind: 'errored', id: t.id, message: msgText(m), locLine: m.location?.range.start.line }),
  }) as unknown as vscode.TestRun;

  /** The outline PARENT as it reaches updateTest: the queued item, at its header line. */
  const outlineItem = (label = 'Blenders Fail <thing>'): QueueItem => ({
    test: {
      id: 'outline',
      label,
      uri: featureUri,
      // behave line 33 -> 0-based 32
      range: new vscode.Range(new vscode.Position(32, 0), new vscode.Position(32, 10)),
      parent: undefined,
    },
    scenario: { result: undefined, isOutline: true, exampleRow: undefined },
  } as unknown as QueueItem);

  const settings = { projectUri: vscode.Uri.file('/proj') } as unknown as WorkspaceSettings;

  const ROWS: RowOutcome[] = [
    { label: '@1.1 Red Tree Frog | mush', status: 'passed' },
    { label: '@2.1 ERROR | FAIL', status: 'failed' },
    { label: '@2.2 iPhone | toxic waste', status: 'passed' },
    { label: '@2.3 Galaxy Nexus | toxic waste', status: 'passed' },
  ];

  setup(() => { calls = []; });

  const runUpdate = (status: string, rows?: RowOutcome[], label?: string) => {
    updateTest(settings, makeRun(), false,
      { status, duration: 1, failedText: 'Failing step: When x ... failed\nASSERT FAILED:' },
      outlineItem(label), new Set<string>(), rows);
    return calls[0];
  };


  test('the message names every example row and its status', () => {
    const call = runUpdate('failed', ROWS);

    assert.strictEqual(call.kind, 'failed');
    for (const row of ROWS)
      assert.ok(call.message?.includes(row.label), `expected row ${row.label} in: ${call.message}`);
    assert.match(call.message ?? '', /ERROR \| FAIL\s+\.\.\. failed/);
    assert.match(call.message ?? '', /Red Tree Frog \| mush\s+\.\.\. passed/);
  });


  test('the summary counts the failing rows', () => {
    const call = runUpdate('failed', ROWS);
    assert.match(call.message ?? '', /1 of 4 example rows failed/);
  });


  test('a single row reads "row" rather than "rows"', () => {
    const call = runUpdate('failed', [{ label: '@1.1 only', status: 'failed' }]);
    assert.match(call.message ?? '', /1 of 1 example row failed/);
  });


  // The outline label routinely contains <param>. An unescaped "<" is the one
  // character here a renderer can take for markup rather than text.
  test('a <param> in the outline name survives as text', () => {
    const call = runUpdate('failed', ROWS, 'Blenders Fail <thing>');
    assert.match(call.message ?? '', /Blenders Fail/);
    assert.ok(!/<thing>/.test(call.message ?? ''),
      'the angle brackets should be escaped, not left raw');
    assert.match(call.message ?? '', /thing/, 'but the parameter name must still be readable');
  });


  test('the message is anchored on the outline header, not on a row', () => {
    // The outline header is what the user clicked on in the tree.
    const call = runUpdate('failed', ROWS);
    assert.strictEqual(call.locLine, 32, 'behave line 33 -> 0-based 32');
  });


  test('an errored outline gets the rollup too', () => {
    const call = runUpdate('hook_error', ROWS);
    assert.strictEqual(call.kind, 'errored');
    assert.match(call.message ?? '', /1 of 4 example rows failed/);
  });


  test('a passing outline carries no message at all', () => {
    // TestRun.passed() takes no message parameter - there is nowhere to put a rollup,
    // which is the same API limit that leaves a passing scenario with no message.
    const call = runUpdate('passed', ROWS);
    assert.strictEqual(call.kind, 'passed');
    assert.strictEqual(call.message, undefined);
  });


  // Without rows, the message must be exactly what it was before the rollup existed -
  // this is the path a plain scenario and a single-row run still take.
  test('without rows the message is the ordinary failure text', () => {
    const call = runUpdate('failed', undefined);

    assert.match(call.message ?? '', /Failing step: When x/);
    assert.doesNotMatch(call.message ?? '', /example row/,
      'a non-outline failure must not grow a rollup summary');
  });

});
