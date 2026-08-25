// Unit tests for NdjsonTail - turning behave's event stream into events.
//
// NdjsonTail is only the parse layer; getting lines off a file that is still being
// written belongs to LineTail and is tested in lineTail.test.ts (partial lines,
// offsets, split multi-byte characters). What is tested here is what those lines
// mean: valid events, malformed lines, blank lines, and the protocol handshake.
//
// Still exercised against a real file rather than a mock, so the two layers are
// covered as they actually compose.

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NdjsonTail, BehaveEvent, isSupportedProtocol } from '../../../src/runners/streamEvents';

suite('streamEvents', () => {

  let dir: string;
  let file: string;
  let tails: NdjsonTail[];

  setup(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-bdd-stream-'));
    file = path.join(dir, 'events.ndjson');
    tails = [];
  });

  teardown(() => {
    tails.forEach(t => t.dispose());
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    catch {
      // best effort
    }
  });

  /** A tail whose polling we drive by hand, so the tests are deterministic. */
  const makeTail = (received: BehaveEvent[]) => {
    // A very long interval means the timer never fires on its own; stop() performs
    // the read, which is exactly the "drain what is left" path used at run end.
    const tail = new NdjsonTail(file, events => received.push(...events), 1_000_000);
    tails.push(tail);
    tail.start();
    return tail;
  };

  const append = (text: string) => fs.appendFileSync(file, text, 'utf8');

  test('reads complete lines as events', () => {
    const received: BehaveEvent[] = [];
    const tail = makeTail(received);

    append('{"event":"scenario","phase":"end","line":3,"status":"passed"}\n');
    tail.stop();

    assert.strictEqual(received.length, 1);
    assert.strictEqual(received[0].event, 'scenario');
    assert.strictEqual(received[0].status, 'passed');
    assert.strictEqual(received[0].line, 3);
  });

  test('a missing file is not an error - behave has not opened it yet', () => {
    const received: BehaveEvent[] = [];
    const tail = makeTail(received);

    assert.ok(!fs.existsSync(file));
    assert.doesNotThrow(() => tail.stop());
    assert.strictEqual(received.length, 0);
  });

  test('a malformed line is skipped without losing the rest', () => {
    const received: BehaveEvent[] = [];
    const tail = makeTail(received);

    append('{"event":"scenario","phase":"end","line":1,"status":"passed"}\n');
    append('this is not json\n');
    append('{"event":"scenario","phase":"end","line":2,"status":"failed"}\n');
    tail.stop();

    assert.deepStrictEqual(received.map(e => e.line), [1, 2]);
  });

  test('blank lines are ignored', () => {
    const received: BehaveEvent[] = [];
    const tail = makeTail(received);

    append('\n\n{"event":"testrun","phase":"end"}\n\n');
    tail.stop();

    assert.strictEqual(received.length, 1);
  });

  test('stop drains what was written since the last poll', () => {
    const received: BehaveEvent[] = [];
    const tail = makeTail(received);

    // Nothing has been polled yet; stop() must still deliver these.
    append('{"event":"scenario","phase":"end","line":1,"status":"passed"}\n');
    append('{"event":"testrun","phase":"end"}\n');
    tail.stop();

    assert.strictEqual(received.length, 2, 'the final events must not be lost');
  });

  test('stop is idempotent and dispose after stop is safe', () => {
    const received: BehaveEvent[] = [];
    const tail = makeTail(received);
    append('{"event":"testrun","phase":"end"}\n');

    tail.stop();
    assert.doesNotThrow(() => tail.stop());
    assert.doesNotThrow(() => tail.dispose());
    assert.strictEqual(received.length, 1, 'a second stop must not redeliver events');
  });

  suite('isSupportedProtocol', () => {

    test('accepts the current protocol', () => {
      assert.ok(isSupportedProtocol({ event: 'testrun', phase: 'start', protocol: 1 }));
    });

    test('rejects a newer protocol, so results fall back to junit', () => {
      assert.ok(!isSupportedProtocol({ event: 'testrun', phase: 'start', protocol: 99 }));
    });

    test('accepts a handshake with no protocol field', () => {
      assert.ok(isSupportedProtocol({ event: 'testrun', phase: 'start' }));
    });

    test('ignores non-handshake events', () => {
      assert.ok(isSupportedProtocol({ event: 'scenario', phase: 'end', protocol: 99 }));
    });
  });
});
