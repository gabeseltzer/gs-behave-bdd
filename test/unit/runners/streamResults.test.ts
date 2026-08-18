// Unit tests for StreamResultReporter - mapping behave's NDJSON events onto test items.
//
// The mapping is on feature file + 1-based line, which is unique for plain scenarios
// AND for Scenario Outline example rows (behave reports a generated example scenario
// at the line of its own data row). That replaces the junit path's string matching,
// where a miss throws and discards every remaining result in the file.

import * as assert from 'assert';
import * as vscode from 'vscode';
import { StreamResultReporter, isSettledByStream, markSettled, clearSettled } from '../../../src/runners/streamResults';
import { BehaveEvent } from '../../../src/runners/streamEvents';
import { QueueItem } from '../../../src/extension';

suite('streamResults', () => {

  const projectUri = vscode.Uri.file('/proj');

  interface Call { kind: string; id: string; duration?: number; message?: string }

  let calls: Call[];

  const makeRun = () => ({
    started: (t: { id: string }) => calls.push({ kind: 'started', id: t.id }),
    passed: (t: { id: string }, d?: number) => calls.push({ kind: 'passed', id: t.id, duration: d }),
    skipped: (t: { id: string }) => calls.push({ kind: 'skipped', id: t.id }),
    failed: (t: { id: string }, m: vscode.TestMessage, d?: number) =>
      calls.push({ kind: 'failed', id: t.id, duration: d, message: String(m.message) }),
    errored: (t: { id: string }, m: vscode.TestMessage, d?: number) =>
      calls.push({ kind: 'errored', id: t.id, duration: d, message: String(m.message) }),
  }) as unknown as vscode.TestRun;

  /** A queue item whose test item sits at a 0-based line (behave line - 1). */
  const makeItem = (id: string, relPath: string, zeroBasedLine: number): QueueItem => ({
    test: {
      id,
      uri: vscode.Uri.joinPath(projectUri, relPath),
      range: new vscode.Range(new vscode.Position(zeroBasedLine, 0), new vscode.Position(zeroBasedLine, 10)),
    },
    scenario: { result: undefined },
  } as unknown as QueueItem);

  const ev = (over: Partial<BehaveEvent>): BehaveEvent => ({
    event: 'scenario', phase: 'end', file: 'features/simple.feature', line: 3, ...over,
  });

  setup(() => { calls = []; });

  test('maps a passed scenario by file and line', () => {
    const item = makeItem('s1', 'features/simple.feature', 2); // behave line 3
    const r = new StreamResultReporter(makeRun(), projectUri, [item]);

    r.handle([ev({ status: 'passed', duration: 0.25 })]);

    assert.deepStrictEqual(calls, [{ kind: 'passed', id: 's1', duration: 250 }]);
  });

  test('marks only the executing scenario as started', () => {
    const a = makeItem('s1', 'features/simple.feature', 2);
    const b = makeItem('s2', 'features/simple.feature', 7);
    const r = new StreamResultReporter(makeRun(), projectUri, [a, b]);

    r.handle([ev({ phase: 'start', line: 3 })]);

    assert.deepStrictEqual(calls, [{ kind: 'started', id: 's1' }],
      'the other queued scenario must not be started');
  });

  test('a failed scenario carries the error text as the message', () => {
    const item = makeItem('s1', 'features/simple.feature', 7);
    const r = new StreamResultReporter(makeRun(), projectUri, [item]);

    r.handle([ev({ line: 8, status: 'failed', error: '  ASSERT FAILED: nope  ' })]);

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].kind, 'failed');
    assert.strictEqual(calls[0].message, 'ASSERT FAILED: nope');
  });

  test('hook_error and cleanup_error are reported as errored, not failed', () => {
    const a = makeItem('s1', 'features/simple.feature', 2);
    const b = makeItem('s2', 'features/simple.feature', 7);
    const r = new StreamResultReporter(makeRun(), projectUri, [a, b]);

    r.handle([
      ev({ line: 3, status: 'hook_error', error: 'before_scenario blew up' }),
      ev({ line: 8, status: 'cleanup_error', error: 'cleanup blew up' }),
    ]);

    assert.deepStrictEqual(calls.map(c => c.kind), ['errored', 'errored']);
  });

  test('skipped and untested both report as skipped', () => {
    const a = makeItem('s1', 'features/simple.feature', 2);
    const b = makeItem('s2', 'features/simple.feature', 7);
    const r = new StreamResultReporter(makeRun(), projectUri, [a, b]);

    r.handle([ev({ line: 3, status: 'skipped' }), ev({ line: 8, status: 'untested' })]);

    assert.deepStrictEqual(calls.map(c => c.kind), ['skipped', 'skipped']);
  });

  // The whole point of line-based mapping: outline rows are distinguished by their
  // own data-row line, so no name matching or <param> regex is needed.
  test('distinguishes Scenario Outline example rows by row line', () => {
    const row1 = makeItem('outline/row1', 'features/outline.feature', 9);  // behave line 10
    const row2 = makeItem('outline/row2', 'features/outline.feature', 13); // behave line 14
    const r = new StreamResultReporter(makeRun(), projectUri, [row1, row2]);

    r.handle([
      ev({ file: 'features/outline.feature', line: 14, status: 'failed', error: 'boom' }),
      ev({ file: 'features/outline.feature', line: 10, status: 'passed' }),
    ]);

    assert.deepStrictEqual(calls.map(c => `${c.kind}:${c.id}`),
      ['failed:outline/row2', 'passed:outline/row1']);
  });

  test('same line in a different feature file does not collide', () => {
    const a = makeItem('a3', 'features/a.feature', 2);
    const b = makeItem('b3', 'features/b.feature', 2);
    const r = new StreamResultReporter(makeRun(), projectUri, [a, b]);

    r.handle([ev({ file: 'features/b.feature', line: 3, status: 'passed' })]);

    assert.deepStrictEqual(calls, [{ kind: 'passed', id: 'b3', duration: undefined }]);
  });

  test('accepts backslash separators from behave on windows', () => {
    const item = makeItem('s1', 'features/simple.feature', 2);
    const r = new StreamResultReporter(makeRun(), projectUri, [item]);

    r.handle([ev({ file: 'features\\simple.feature', line: 3, status: 'passed' })]);

    assert.strictEqual(calls.length, 1, 'a windows-style path should still resolve');
  });

  test('an unknown file or line is ignored rather than throwing', () => {
    const item = makeItem('s1', 'features/simple.feature', 2);
    const r = new StreamResultReporter(makeRun(), projectUri, [item]);

    assert.doesNotThrow(() => r.handle([
      ev({ line: 999, status: 'passed' }),
      ev({ file: 'features/nope.feature', line: 3, status: 'passed' }),
      ev({ file: null, line: null, status: 'passed' }),
    ]));
    assert.deepStrictEqual(calls, [], 'nothing should be reported');
  });

  test('an unrecognised status is ignored rather than throwing', () => {
    const item = makeItem('s1', 'features/simple.feature', 2);
    const r = new StreamResultReporter(makeRun(), projectUri, [item]);

    assert.doesNotThrow(() => r.handle([ev({ status: 'wat' })]));
    assert.deepStrictEqual(calls, []);
  });

  test('step and feature events do not touch item state', () => {
    const item = makeItem('s1', 'features/simple.feature', 2);
    const r = new StreamResultReporter(makeRun(), projectUri, [item]);

    r.handle([
      { event: 'feature', phase: 'end', file: 'features/simple.feature', line: 1, status: 'failed' },
      { event: 'step', phase: 'end', file: 'features/simple.feature', line: 3, status: 'failed' },
      { event: 'testrun', phase: 'end' },
    ]);

    assert.deepStrictEqual(calls, []);
  });

  test('reportedIds records settled scenarios so junit can skip them', () => {
    const a = makeItem('s1', 'features/simple.feature', 2);
    const b = makeItem('s2', 'features/simple.feature', 7);
    const r = new StreamResultReporter(makeRun(), projectUri, [a, b]);

    r.handle([ev({ line: 3, status: 'passed' }), ev({ line: 8, phase: 'start' })]);

    assert.deepStrictEqual([...r.reportedIds], ['s1'],
      'only the scenario that reached a terminal status should be recorded');
  });

  // JUnit is demoted to a verifier: it still runs, but must not re-derive a result
  // the stream already settled - doing so re-exposes its name matching, where a miss
  // throws and discards every remaining result in the file.
  suite('settled registry (junit demotion)', () => {

    test('a settled scenario is recorded against its run', () => {
      const item = makeItem('s1', 'features/simple.feature', 2);
      const run = makeRun() as unknown as { name?: string };
      run.name = 'run-1';
      const r = new StreamResultReporter(run as unknown as vscode.TestRun, projectUri, [item]);

      assert.ok(!isSettledByStream('run-1', 's1'), 'not settled before any event');
      r.handle([ev({ status: 'passed' })]);
      assert.ok(isSettledByStream('run-1', 's1'), 'settled after a terminal status');

      clearSettled('run-1');
      assert.ok(!isSettledByStream('run-1', 's1'), 'cleared when the run ends');
    });

    test('a started-but-unfinished scenario is not settled', () => {
      const item = makeItem('s1', 'features/simple.feature', 2);
      const run = makeRun() as unknown as { name?: string };
      run.name = 'run-2';
      const r = new StreamResultReporter(run as unknown as vscode.TestRun, projectUri, [item]);

      r.handle([ev({ phase: 'start' })]);
      assert.ok(!isSettledByStream('run-2', 's1'));
      clearSettled('run-2');
    });

    test('runs do not leak into each other', () => {
      const item = makeItem('s1', 'features/simple.feature', 2);
      const run = makeRun() as unknown as { name?: string };
      run.name = 'run-3';
      const r = new StreamResultReporter(run as unknown as vscode.TestRun, projectUri, [item]);
      r.handle([ev({ status: 'passed' })]);

      assert.ok(!isSettledByStream('run-4', 's1'), 'a different run must not see it');
      clearSettled('run-3');
    });

    test('an undefined run name is handled without throwing', () => {
      assert.doesNotThrow(() => markSettled(undefined, 's1'));
      assert.ok(!isSettledByStream(undefined, 's1'));
      assert.doesNotThrow(() => clearSettled(undefined));
    });
  });

  test('sets scenario.result so downstream code sees the outcome', () => {
    const item = makeItem('s1', 'features/simple.feature', 2);
    const r = new StreamResultReporter(makeRun(), projectUri, [item]);

    r.handle([ev({ status: 'failed', error: 'boom' })]);

    assert.strictEqual(item.scenario.result, 'failed');
  });
});
