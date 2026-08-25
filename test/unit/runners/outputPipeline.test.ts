// Unit tests for RunOutputPipeline - the one chain that turns behave's raw output
// into attributed text on a TestRun.
//
// The pass-4 test that matters is the last suite here: run-vs-debug agreement. A
// normal run feeds this pipeline chunks off a pipe; a debug run feeds it lines off a
// tailed file. If those two produce different output, a debug run does not look like
// a run, which is the entire complaint pass 4 exists to answer. Everything above it
// is the supporting detail that makes that comparison meaningful rather than vacuous.
//
// The fixture is REAL behave output (project A, group1_features/outline_mixed.feature,
// --color=on --show-source), same provenance as outputAttribution.test.ts.

import * as assert from 'assert';
import * as vscode from 'vscode';
import { FeatureLineIndex } from '../../../src/runners/itemIndex';
import { RunOutputPipeline } from '../../../src/runners/outputPipeline';
import { QueueItem } from '../../../src/extension';

suite('outputPipeline', () => {

  const projectUri = vscode.Uri.file('/proj');
  const FEATURE = 'behave tests/some tests/group1_features/outline_mixed.feature';

  type Appended = { text: string, location?: vscode.Location, test?: vscode.TestItem };

  const makeItem = (id: string, zeroBasedLine: number): QueueItem => ({
    test: {
      id,
      uri: vscode.Uri.joinPath(projectUri, FEATURE),
      range: new vscode.Range(new vscode.Position(zeroBasedLine, 0), new vscode.Position(zeroBasedLine, 10)),
    },
    scenario: {},
  } as unknown as QueueItem);

  const makeRun = (appended: Appended[]) => ({
    name: 'run-1',
    appendOutput: (text: string, location?: vscode.Location, test?: vscode.TestItem) =>
      appended.push({ text, location, test }),
  } as unknown as vscode.TestRun);

  const makePipeline = (appended: Appended[], items: QueueItem[], prefix = "", fallback?: vscode.TestItem) =>
    new RunOutputPipeline(makeRun(appended), new FeatureLineIndex(items), projectUri, prefix, fallback);

  // Verbatim from the captured run.
  const HEADER_ROW_1 =
    '  Scenario Outline: Blenders Success Red Tree Frog -- @1.1 Amphibians \x1b[90m # ' +
    FEATURE + ':10\x1b[0m';
  const HEADER_ROW_2 =
    '  Scenario Outline: Blenders Success iPhone -- @2.1 Consumer Electronics \x1b[90m # ' +
    FEATURE + ':14\x1b[0m';

  const SAMPLE = [
    'Feature: Mixed outline\x1b[90m # ' + FEATURE + ':1\x1b[0m',
    '',
    HEADER_ROW_1,
    '    \x1b[32mGiven \x1b[0mI put things in a blender\x1b[0m',
    '    captured stdout for row 1',
    '',
    HEADER_ROW_2,
    '    \x1b[32mGiven \x1b[0mI put other things in a blender\x1b[0m',
    '',
    '1 feature passed, 0 failed',
  ].join('\n') + '\n';


  suite('attribution and blocking', () => {

    test('attributes each line to the scenario whose header precedes it', () => {
      const appended: Appended[] = [];
      const pipeline = makePipeline(appended, [makeItem('row1', 9), makeItem('row2', 13)]);

      pipeline.write('stdout', SAMPLE);
      pipeline.flushAll();

      const row1Text = appended.filter(a => a.test?.id === 'row1').map(a => a.text).join('');
      const row2Text = appended.filter(a => a.test?.id === 'row2').map(a => a.text).join('');

      assert.ok(row1Text.includes('captured stdout for row 1'), 'row 1 body should be its own');
      assert.ok(!row2Text.includes('captured stdout for row 1'), 'row 1 body must not leak into row 2');
      assert.ok(row2Text.includes('I put other things in a blender'), 'row 2 should get its own step');
    });


    test('the unindented summary is not absorbed into the last scenario', () => {
      const appended: Appended[] = [];
      const pipeline = makePipeline(appended, [makeItem('row1', 9), makeItem('row2', 13)]);

      pipeline.write('stdout', SAMPLE);
      pipeline.flushAll();

      const row2Text = appended.filter(a => a.test?.id === 'row2').map(a => a.text).join('');
      assert.ok(!row2Text.includes('1 feature passed'),
        'an unindented line ends the scenario block - otherwise the last row absorbs the summary');
    });


    test('only a header line carries a location', () => {
      const appended: Appended[] = [];
      const pipeline = makePipeline(appended, [makeItem('row1', 9), makeItem('row2', 13)]);

      pipeline.write('stdout', SAMPLE);
      pipeline.flushAll();

      const located = appended.filter(a => a.location);
      assert.strictEqual(located.length, 2, 'exactly the two scenario headers should be located');
      for (const a of located)
        assert.ok(a.text.includes('Scenario Outline:'), `located block should be a header, got: ${a.text}`);
    });


    test('every emitted line ends CRLF - TestRun output is rendered by a terminal', () => {
      const appended: Appended[] = [];
      const pipeline = makePipeline(appended, [makeItem('row1', 9)]);

      pipeline.write('stdout', SAMPLE);
      pipeline.flushAll();

      for (const a of appended)
        assert.ok(a.text.endsWith('\r\n'), `block should end CRLF, got: ${JSON.stringify(a.text)}`);
    });

  });


  suite('streams', () => {

    test('stdout and stderr are reassembled separately', () => {
      const appended: Appended[] = [];
      const pipeline = makePipeline(appended, [makeItem('row1', 9)]);

      // Interleave two half-lines. If the two streams shared a buffer these would
      // splice into each other rather than each completing on its own.
      pipeline.write('stdout', '    from st');
      pipeline.write('stderr', '    from st');
      pipeline.write('stdout', 'dout\n');
      pipeline.write('stderr', 'derr\n');
      pipeline.flushAll();

      const all = appended.map(a => a.text).join('');
      assert.ok(all.includes('from stdout'), `expected an intact stdout line, got: ${JSON.stringify(all)}`);
      assert.ok(all.includes('from stderr'), `expected an intact stderr line, got: ${JSON.stringify(all)}`);
    });


    test('writeDirect is unattributed and converts LF to CRLF', () => {
      const appended: Appended[] = [];
      const pipeline = makePipeline(appended, [makeItem('row1', 9)]);

      pipeline.writeDirect('\nbehave -i features\n');

      assert.strictEqual(appended.length, 1);
      assert.strictEqual(appended[0].text, '\r\nbehave -i features\r\n');
      assert.strictEqual(appended[0].test, undefined, 'the command banner belongs to the run, not a scenario');
    });


    test('a partial final line is released by flush', () => {
      const appended: Appended[] = [];
      const pipeline = makePipeline(appended, [makeItem('row1', 9)]);

      pipeline.write('stdout', '    no trailing newline');
      assert.strictEqual(appended.length, 0, 'an incomplete line is held');

      pipeline.flushAll();
      const all = appended.map(a => a.text).join('');
      assert.ok(all.includes('no trailing newline'), 'flush must release it');
    });

  });


  // The pass-4 safety net.
  suite('run-vs-debug agreement', () => {

    /** Collect what the pipeline appends for a given delivery of the same bytes. */
    const collect = (feed: (p: RunOutputPipeline) => void): Appended[] => {
      const appended: Appended[] = [];
      const pipeline = makePipeline(appended, [makeItem('row1', 9), makeItem('row2', 13)]);
      feed(pipeline);
      pipeline.flushAll();
      return appended;
    };

    /** How a RUN delivers: arbitrary chunks off a pipe, split anywhere. */
    const asRun = (chunkSize: number) => (p: RunOutputPipeline) => {
      for (let i = 0; i < SAMPLE.length; i += chunkSize)
        p.write('stdout', SAMPLE.slice(i, i + chunkSize));
    };

    /** How a DEBUG run delivers: whole lines, batched, off LineTail. */
    const asDebug = (batchSize: number) => (p: RunOutputPipeline) => {
      const lines = SAMPLE.split('\n');
      if (lines[lines.length - 1] === '')
        lines.pop(); // SAMPLE ends with a newline; LineTail would not emit a trailing empty line
      for (let i = 0; i < lines.length; i += batchSize)
        p.write('debug', lines.slice(i, i + batchSize).join('\n') + '\n');
    };

    /**
     * Flatten blocks to one record per LINE.
     *
     * Block boundaries are deliberately not compared: a block cannot span two
     * write() calls, so chunk size changes how consecutive lines are grouped into
     * appendOutput calls. That grouping is an optimisation - the contract is which
     * item each LINE is attributed to, and whether it is located. (A located line
     * always starts its own block and never absorbs the next one, so "located" is
     * a property of the line, not of the grouping.)
     */
    const shape = (appended: Appended[]) =>
      appended.flatMap(a => {
        const lines = a.text.split('\r\n');
        if (lines[lines.length - 1] === '')
          lines.pop();
        return lines.map(text => ({ text, test: a.test?.id, located: !!a.location }));
      });

    test('a debug run produces byte-identical attributed output to a run', () => {
      const run = collect(asRun(4096));
      const debug = collect(asDebug(1000));

      assert.deepStrictEqual(shape(debug), shape(run),
        'the debug path must differ from the run path only in how bytes arrive, not in what is emitted');
      assert.strictEqual(debug.map(a => a.text).join(''), run.map(a => a.text).join(''),
        'and the raw text must be byte-identical too');
    });


    test('agreement holds however the bytes are split', () => {
      // 7 bytes at a time splits escape sequences and multi-byte characters mid-way;
      // one line at a time is the smallest batch LineTail can deliver.
      const reference = shape(collect(asRun(4096)));

      assert.deepStrictEqual(shape(collect(asRun(7))), reference, 'run, 7-byte chunks');
      assert.deepStrictEqual(shape(collect(asRun(1))), reference, 'run, 1-byte chunks');
      assert.deepStrictEqual(shape(collect(asDebug(1))), reference, 'debug, one line per read');
      assert.deepStrictEqual(shape(collect(asDebug(3))), reference, 'debug, three lines per read');
    });


    test('the comparison is not vacuous - it has real attributed content to compare', () => {
      const run = collect(asRun(4096));

      assert.ok(shape(run).length > 5, `expected several attributed lines, got ${shape(run).length}`);
      assert.ok(run.some(a => a.test?.id === 'row1'), 'row1 must appear');
      assert.ok(run.some(a => a.test?.id === 'row2'), 'row2 must appear');
      assert.ok(run.some(a => a.location), 'at least one located header must appear');
    });

  });

});
