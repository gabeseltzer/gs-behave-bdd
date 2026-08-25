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

  interface Call {
    kind: string; id: string; duration?: number; message?: string;
    locLine?: number; expected?: string; actual?: string;
  }

  /** TestMessage.message is a MarkdownString now, so read its rendered value. */
  const msgText = (m: vscode.TestMessage): string => {
    const v = m.message as unknown as { value?: string };
    return typeof v === 'string' ? v : (v.value ?? '');
  };

  const detail = (m: vscode.TestMessage) => ({
    message: msgText(m),
    locLine: m.location?.range.start.line,
    expected: m.expectedOutput,
    actual: m.actualOutput,
  });

  let calls: Call[];

  const makeRun = () => ({
    started: (t: { id: string }) => calls.push({ kind: 'started', id: t.id }),
    passed: (t: { id: string }, d?: number) => calls.push({ kind: 'passed', id: t.id, duration: d }),
    skipped: (t: { id: string }) => calls.push({ kind: 'skipped', id: t.id }),
    failed: (t: { id: string }, m: vscode.TestMessage, d?: number) =>
      calls.push({ kind: 'failed', id: t.id, duration: d, ...detail(m) }),
    errored: (t: { id: string }, m: vscode.TestMessage, d?: number) =>
      calls.push({ kind: 'errored', id: t.id, duration: d, ...detail(m) }),
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

  // Verified against a real behave run: the scenario "end" event carries only status
  // and duration. The error text and the failing step's line arrive on the STEP event
  // just before it, so the reporter has to hold that and use it here - without which
  // every streamed failure showed the bare word "failed", strictly less than the junit
  // path already reported for the same scenario.
  test('a failed scenario takes its message from the failing step event', () => {
    const item = makeItem('s1', 'features/simple.feature', 7); // behave line 8
    const r = new StreamResultReporter(makeRun(), projectUri, [item]);

    r.handle([
      ev({ phase: 'start', line: 8 }),
      ev({
        event: 'step', line: 10, keyword: 'When ', name: 'we implement a failing test',
        status: 'failed', error: '  ASSERT FAILED: nope  ',
      }),
      ev({ line: 8, status: 'failed' }),
    ]);

    const failed = calls.find(c => c.kind === 'failed');
    assert.ok(failed, 'expected a failed call');
    assert.match(failed.message ?? '', /Failing step: When we implement a failing test/);
    assert.match(failed.message ?? '', /ASSERT FAILED: nope/);
  });

  test('the failure is anchored on the failing step line, not the scenario header', () => {
    const item = makeItem('s1', 'features/simple.feature', 7); // behave line 8
    const r = new StreamResultReporter(makeRun(), projectUri, [item]);

    r.handle([
      ev({ phase: 'start', line: 8 }),
      ev({ event: 'step', line: 10, keyword: 'When ', name: 'boom', status: 'failed', error: 'nope' }),
      ev({ line: 8, status: 'failed' }),
    ]);

    // behave line 10 -> 0-based 9. The scenario header would be 7.
    assert.strictEqual(calls.find(c => c.kind === 'failed')?.locLine, 9);
  });

  test('falls back to the scenario range when no step event identified a failure', () => {
    const item = makeItem('s1', 'features/simple.feature', 7);
    const r = new StreamResultReporter(makeRun(), projectUri, [item]);

    r.handle([ev({ phase: 'start', line: 8 }), ev({ line: 8, status: 'failed' })]);

    const failed = calls.find(c => c.kind === 'failed');
    assert.strictEqual(failed?.locLine, 7, 'should anchor on the scenario header');
    assert.match(failed?.message ?? '', /failed/);
  });

  test('the FIRST bad step is the reported cause, not a later skipped one', () => {
    const item = makeItem('s1', 'features/simple.feature', 7);
    const r = new StreamResultReporter(makeRun(), projectUri, [item]);

    r.handle([
      ev({ phase: 'start', line: 8 }),
      ev({ event: 'step', line: 9, keyword: 'Given ', name: 'ok', status: 'passed' }),
      ev({ event: 'step', line: 10, keyword: 'When ', name: 'the real cause', status: 'failed', error: 'boom' }),
      ev({ event: 'step', line: 11, keyword: 'Then ', name: 'never ran', status: 'undefined' }),
      ev({ line: 8, status: 'failed' }),
    ]);

    const failed = calls.find(c => c.kind === 'failed');
    assert.match(failed?.message ?? '', /the real cause/);
    assert.strictEqual(failed?.locLine, 9, 'behave line 10 -> 0-based 9');
  });

  test('a failing step does not leak into the NEXT scenario on the same stream', () => {
    const a = makeItem('s1', 'features/simple.feature', 7);
    const b = makeItem('s2', 'features/simple.feature', 20);
    const r = new StreamResultReporter(makeRun(), projectUri, [a, b]);

    r.handle([
      ev({ phase: 'start', line: 8 }),
      ev({ event: 'step', line: 10, keyword: 'When ', name: 'first failure', status: 'failed', error: 'boom' }),
      ev({ line: 8, status: 'failed' }),
      ev({ phase: 'start', line: 21 }),
      ev({ line: 21, status: 'failed' }),
    ]);

    const second = calls.filter(c => c.kind === 'failed').find(c => c.id === 's2');
    assert.ok(second);
    assert.doesNotMatch(second.message ?? '', /first failure/,
      'the previous scenario failing step must not be reused');
  });

  // In parallel mode every behave process feeds ONE reporter, so failing-step state
  // has to be per stream or a failure lands on whichever scenario reported next.
  test('failing steps are tracked per stream, not globally', () => {
    const a = makeItem('s1', 'featuresA/a.feature', 7);
    const b = makeItem('s2', 'featuresB/b.feature', 7);
    const r = new StreamResultReporter(makeRun(), projectUri, [a, b]);

    r.handle([ev({ phase: 'start', file: 'featuresA/a.feature', line: 8 })], 'stream-a');
    r.handle([ev({ phase: 'start', file: 'featuresB/b.feature', line: 8 })], 'stream-b');
    r.handle([ev({
      event: 'step', file: 'featuresA/a.feature', line: 10,
      keyword: 'When ', name: 'only A broke', status: 'failed', error: 'boom',
    })], 'stream-a');
    r.handle([ev({ file: 'featuresB/b.feature', line: 8, status: 'failed' })], 'stream-b');
    r.handle([ev({ file: 'featuresA/a.feature', line: 8, status: 'failed' })], 'stream-a');

    const bFail = calls.filter(c => c.kind === 'failed').find(c => c.id === 's2');
    const aFail = calls.filter(c => c.kind === 'failed').find(c => c.id === 's1');
    assert.doesNotMatch(bFail?.message ?? '', /only A broke/,
      'stream B must not inherit stream A failing step');
    assert.match(aFail?.message ?? '', /only A broke/);
  });

  test('a stated expected/actual comparison becomes a diff', () => {
    const item = makeItem('s1', 'features/simple.feature', 7);
    const r = new StreamResultReporter(makeRun(), projectUri, [item]);

    r.handle([
      ev({ phase: 'start', line: 8 }),
      ev({
        event: 'step', line: 10, keyword: 'Then ', name: 'it matches', status: 'failed',
        error: 'AssertionError: expected mush but got toxic waste',
      }),
      ev({ line: 8, status: 'failed' }),
    ]);

    const failed = calls.find(c => c.kind === 'failed');
    assert.strictEqual(failed?.expected, 'mush');
    assert.strictEqual(failed?.actual, 'toxic waste');
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

  // Step events now feed the failing-step detail used above, but they still must not
  // report a result themselves - only the scenario event settles an item.
  test('step and feature events do not report a result', () => {
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


  // Pass 5. Every step event is kept, not just the one that broke the scenario, so
  // the failure message can show what ran before it and what never ran after it.
  suite('step trail', () => {

    const step = (over: Partial<BehaveEvent>): BehaveEvent => ({
      event: 'step', phase: 'end', file: 'features/simple.feature', ...over,
    });

    const PASSED = step({ keyword: 'Given ', name: 'we have a blender', line: 4, status: 'passed' });
    const FAILED = step({ keyword: 'When ', name: 'we blend', line: 5, status: 'failed', error: 'ASSERT FAILED' });
    const SKIPPED = step({ keyword: 'Then ', name: 'it is smooth', line: 6, status: 'skipped' });

    test('the whole trail is shown, not just the failing step', () => {
      const item = makeItem('s1', 'features/simple.feature', 2);
      const r = new StreamResultReporter(makeRun(), projectUri, [item]);

      r.handle([step({ ...PASSED }), step({ ...FAILED }), step({ ...SKIPPED }),
        ev({ status: 'failed' })]);

      const message = calls.find(c => c.kind === 'failed')?.message ?? '';
      assert.match(message, /we have a blender/, 'the step that passed is context');
      assert.match(message, /we blend/, 'the step that failed');
      assert.match(message, /it is smooth/, 'the step that never ran');
    });

    test('the failing step is still the FIRST bad one', () => {
      // behave stops at the first failure; later steps report skipped or undefined,
      // and naming one of those would bury the cause.
      const item = makeItem('s1', 'features/simple.feature', 2);
      const r = new StreamResultReporter(makeRun(), projectUri, [item]);

      r.handle([step({ ...PASSED }), step({ ...FAILED }),
        step({ keyword: 'Then ', name: 'later', line: 6, status: 'undefined' }),
        ev({ status: 'failed' })]);

      const message = calls.find(c => c.kind === 'failed')?.message ?? '';
      assert.match(message, /Failing step: When we blend/, `summary should name the first bad step: ${message}`);
      assert.strictEqual(calls.find(c => c.kind === 'failed')?.locLine, 4,
        'and anchor on its line (behave line 5 -> 0-based 4)');
    });

    test('a scenario does not inherit the previous scenario trail', () => {
      const one = makeItem('s1', 'features/simple.feature', 2);  // behave line 3
      const two = makeItem('s2', 'features/simple.feature', 9);  // behave line 10
      const r = new StreamResultReporter(makeRun(), projectUri, [one, two]);

      r.handle([
        ev({ phase: 'start', line: 3 }), step({ ...PASSED }), step({ ...FAILED }), ev({ status: 'failed', line: 3 }),
        ev({ phase: 'start', line: 10 }),
        step({ keyword: 'Given ', name: 'a fresh start', line: 11, status: 'passed' }),
        step({ keyword: 'When ', name: 'it breaks', line: 12, status: 'failed' }),
        ev({ status: 'failed', line: 10 }),
      ]);

      const second = calls.filter(c => c.kind === 'failed').find(c => c.id === 's2')?.message ?? '';
      assert.match(second, /a fresh start/);
      assert.doesNotMatch(second, /we have a blender/, 'the first scenario steps must not leak in');
    });

    // The hazard handle(events, spawnId) exists for: in parallel mode several behave
    // processes feed one reporter, and a single shared trail would interleave them.
    test('two streams do not blend their trails', () => {
      const one = makeItem('s1', 'features/one.feature', 2);
      const two = makeItem('s2', 'features/two.feature', 2);
      const r = new StreamResultReporter(makeRun(), projectUri, [one, two]);

      const aStep = (over: Partial<BehaveEvent>) => step({ file: 'features/one.feature', ...over });
      const bStep = (over: Partial<BehaveEvent>) => step({ file: 'features/two.feature', ...over });

      // Interleaved, as two processes writing concurrently would be.
      r.handle([aStep({ keyword: 'Given ', name: 'alpha one', line: 4, status: 'passed' })], 'A');
      r.handle([bStep({ keyword: 'Given ', name: 'bravo one', line: 4, status: 'passed' })], 'B');
      r.handle([aStep({ keyword: 'When ', name: 'alpha breaks', line: 5, status: 'failed' })], 'A');
      r.handle([bStep({ keyword: 'When ', name: 'bravo breaks', line: 5, status: 'failed' })], 'B');
      r.handle([ev({ file: 'features/one.feature', status: 'failed' })], 'A');
      r.handle([ev({ file: 'features/two.feature', status: 'failed' })], 'B');

      const a = calls.filter(c => c.kind === 'failed').find(c => c.id === 's1')?.message ?? '';
      const b = calls.filter(c => c.kind === 'failed').find(c => c.id === 's2')?.message ?? '';

      assert.match(a, /alpha one/);
      assert.doesNotMatch(a, /bravo/, 'stream B steps must not appear in stream A failure');
      assert.match(b, /bravo one/);
      assert.doesNotMatch(b, /alpha/, 'stream A steps must not appear in stream B failure');
    });

    test('a hook error having run no steps still produces a message', () => {
      // Otherwise the peek view is blank, which is the regression pass 3 fixed.
      const item = makeItem('s1', 'features/simple.feature', 2);
      const r = new StreamResultReporter(makeRun(), projectUri, [item]);

      r.handle([ev({ status: 'hook_error', error: 'before_scenario blew up' })]);

      const message = calls.find(c => c.kind === 'errored')?.message ?? '';
      // Escaped underscore: with no step, the error IS the summary line, and the
      // summary is markdown-escaped - otherwise before_scenario ... after_scenario
      // would render as italics.
      assert.match(message, /before\\_scenario blew up/);
      assert.doesNotMatch(message, /\.\.\. /, 'no trail to draw, so no step lines');
    });

    test('a passing scenario reports no message at all', () => {
      // TestRun.passed() takes no message - there is nowhere to put a trail, which is
      // why the output view remains the only surface a green scenario has.
      const item = makeItem('s1', 'features/simple.feature', 2);
      const r = new StreamResultReporter(makeRun(), projectUri, [item]);

      r.handle([step({ ...PASSED }), ev({ status: 'passed' })]);

      assert.deepStrictEqual(calls, [{ kind: 'passed', id: 's1', duration: undefined }]);
    });
  });
});
