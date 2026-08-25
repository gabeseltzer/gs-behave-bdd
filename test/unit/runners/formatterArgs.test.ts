// Unit tests for getFormatterArgs - which behave formatters each spawn is given,
// and where each one's output goes.
//
// This is the crux of pass 4 and the easiest thing here to get quietly wrong, because
// behave pairs formatters to outfiles POSITIONALLY: make_formatters() zips
// config.format[i] with config.outputs[i] and falls back to stdout past the end, so an
// unpaired "-f pretty" is silently handed the NDJSON file and the human-readable output
// vanishes into it. Naming any formatter also suppresses behave's default, so "-f
// pretty" must be explicit whenever anything else is named.
//
// The four cases below are the whole matrix: run/debug against streaming on/off.

import * as assert from 'assert';
import * as vscode from 'vscode';
import { getFormatterArgs } from '../../../src/runners/runOrDebug';
import { STREAM_FORMATTER_NAME } from '../../../src/bundledBehave';

suite('getFormatterArgs', () => {

  const streamFileUri = vscode.Uri.file('/tmp/events/run-1/wksp/0-features.ndjson');

  const makeWr = (debug: boolean, streaming: boolean) => {
    const opened: string[] = [];
    const wr = {
      debug,
      streaming,
      run: { name: 'run-1' },
      wkspSettings: { name: 'wksp' },
      streamSession: streaming
        ? { open: (label: string) => { opened.push(label); return streamFileUri; } }
        : undefined,
    };
    return { wr, opened };
  };

  const call = (debug: boolean, streaming: boolean) => {
    const { wr, opened } = makeWr(debug, streaming);
    const args = getFormatterArgs(wr as unknown as Parameters<typeof getFormatterArgs>[0], 'features');
    return { args, opened };
  };

  /** Every "-f X" must be followed by its own "-o Y". */
  const pairs = (args: string[]) => {
    const out: { formatter: string, outfile: string }[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] !== '-f')
        continue;
      assert.strictEqual(args[i + 2], '-o',
        `formatter "${args[i + 1]}" must be followed by its own -o, got: ${JSON.stringify(args)}`);
      out.push({ formatter: args[i + 1], outfile: args[i + 3] });
    }
    return out;
  };


  test('a run with streaming off names nothing, leaving behave to its default', () => {
    const { args } = call(false, false);
    assert.deepStrictEqual(args, [],
      'naming a formatter would suppress behave\'s default pretty-to-stdout');
  });


  test('a run with streaming on sends pretty to stdout and the stream to its file', () => {
    const { args, opened } = call(false, true);
    const p = pairs(args);

    assert.deepStrictEqual(p, [
      { formatter: 'pretty', outfile: '-' },
      { formatter: STREAM_FORMATTER_NAME, outfile: `"${streamFileUri.fsPath}"` },
    ], '"-o -" is stdout, which is piped and filtered on a run');
    assert.deepStrictEqual(opened, ['features'], 'exactly one stream file per spawn');
  });


  test('a debug run sends pretty to a FILE, never to stdout', () => {
    const { args } = call(true, true);
    const p = pairs(args);

    assert.strictEqual(p[0].formatter, 'pretty');
    assert.notStrictEqual(p[0].outfile, '-',
      'stdout is the debug console on this path - it belongs to the user\'s own print() output');
    assert.ok(p[0].outfile.includes('debug.log'), `expected the debug output file, got: ${p[0].outfile}`);
    assert.strictEqual(p[1].formatter, STREAM_FORMATTER_NAME);
  });


  test('a debug run names pretty even with streaming OFF, or its output is lost', () => {
    const { args, opened } = call(true, false);
    const p = pairs(args);

    assert.strictEqual(p.length, 1, 'no event stream when streaming is off');
    assert.strictEqual(p[0].formatter, 'pretty');
    assert.ok(p[0].outfile.includes('debug.log'),
      'without this redirect behave writes to stdout and the Test Results panel gets nothing');
    assert.deepStrictEqual(opened, [], 'no stream file should be allocated');
  });


  test('the stream file is allocated exactly once per call - it is not pure', () => {
    const { wr, opened } = makeWr(false, true);
    const typed = wr as unknown as Parameters<typeof getFormatterArgs>[0];

    getFormatterArgs(typed, 'one');
    getFormatterArgs(typed, 'two');

    assert.deepStrictEqual(opened, ['one', 'two'],
      'open() starts a tail, so calling twice for one spawn would leak a tail');
  });


  test('every formatter in every case is explicitly paired', () => {
    for (const debug of [false, true]) {
      for (const streaming of [false, true]) {
        const { args } = call(debug, streaming);
        // pairs() asserts the -f/-o alternation; this pins that nothing trails it.
        const p = pairs(args);
        assert.strictEqual(args.length, p.length * 4,
          `unexpected extra args for debug=${debug} streaming=${streaming}: ${JSON.stringify(args)}`);
      }
    }
  });

});
