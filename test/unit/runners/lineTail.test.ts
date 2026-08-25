// Unit tests for LineTail - reading a file while another process appends to it.
//
// Deliberately exercised against a real file rather than a mock: the whole point of
// this class is that it reads a file another process is writing, including partial
// lines and reads that land mid-character. These cases used to live in
// streamEvents.test.ts; they moved here with the transport itself, because they are
// about getting bytes off a growing file, not about what those bytes mean.

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LineTail } from '../../../src/runners/lineTail';

suite('lineTail', () => {

  let dir: string;
  let file: string;
  let tails: LineTail[];

  setup(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-bdd-linetail-'));
    file = path.join(dir, 'output.log');
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
  const makeTail = (received: string[]) => {
    // A very long interval means the timer never fires on its own; stop() performs
    // the read, which is exactly the "drain what is left" path used at run end.
    const tail = new LineTail(file, lines => received.push(...lines), 1_000_000);
    tails.push(tail);
    tail.start();
    return tail;
  };

  const append = (text: string) => fs.appendFileSync(file, text, 'utf8');

  test('delivers complete lines', () => {
    const received: string[] = [];
    const tail = makeTail(received);

    append('first\nsecond\n');
    tail.stop();

    assert.deepStrictEqual(received, ['first', 'second']);
  });

  test('a missing file is not an error - the writer has not opened it yet', () => {
    const received: string[] = [];
    const tail = makeTail(received);

    assert.ok(!fs.existsSync(file));
    assert.doesNotThrow(() => tail.stop());
    assert.strictEqual(received.length, 0);
  });

  test('holds a partial line until its newline arrives', () => {
    const received: string[] = [];
    const tail = makeTail(received);

    append('half a li');
    tail['read']();  // eslint-disable-line dot-notation
    // NOTE: length rather than deepStrictEqual(received, []) - comparing against an
    // empty literal narrows `received` to never[] for the rest of the test.
    assert.strictEqual(received.length, 0, 'an incomplete line must not be delivered');

    append('ne\n');
    tail['read']();  // eslint-disable-line dot-notation
    assert.deepStrictEqual(received, ['half a line']);
  });

  test('resumes from its offset rather than re-reading', () => {
    const received: string[] = [];
    const tail = makeTail(received);

    append('one\n');
    tail['read']();  // eslint-disable-line dot-notation
    append('two\n');
    tail.stop();

    assert.deepStrictEqual(received, ['one', 'two'], 'each line delivered exactly once');
  });

  test('a multi-byte character split across reads is not corrupted', () => {
    const received: string[] = [];
    const tail = makeTail(received);

    const text = 'café ✓ done\n';
    const bytes = Buffer.from(text, 'utf8');
    const cut = bytes.indexOf(Buffer.from('é', 'utf8')[0]) + 1; // mid-character
    fs.appendFileSync(file, bytes.subarray(0, cut));
    tail['read']();  // eslint-disable-line dot-notation
    fs.appendFileSync(file, bytes.subarray(cut));
    tail.stop();

    assert.deepStrictEqual(received, ['café ✓ done']);
  });

  test('blank lines are preserved - behave separates scenarios with them', () => {
    const received: string[] = [];
    const tail = makeTail(received);

    append('a\n\n\nb\n');
    tail.stop();

    assert.deepStrictEqual(received, ['a', '', '', 'b'],
      'dropping blank lines is the caller\'s decision, not the transport\'s');
  });

  test('stop drains what was written since the last poll', () => {
    const received: string[] = [];
    const tail = makeTail(received);

    // Nothing has been polled yet; stop() must still deliver these.
    append('one\ntwo\n');
    tail.stop();

    assert.deepStrictEqual(received, ['one', 'two'], 'the final lines must not be lost');
  });

  test('stop releases a last line that has no trailing newline', () => {
    const received: string[] = [];
    const tail = makeTail(received);

    // behave's own output always ends with a newline, but a killed process's need
    // not - and on the debug path that would silently swallow its last line.
    append('complete\nno newline here');
    tail.stop();

    assert.deepStrictEqual(received, ['complete', 'no newline here']);
  });

  test('stop is idempotent and dispose after stop is safe', () => {
    const received: string[] = [];
    const tail = makeTail(received);
    append('only\n');

    tail.stop();
    assert.doesNotThrow(() => tail.stop());
    assert.doesNotThrow(() => tail.dispose());
    assert.deepStrictEqual(received, ['only'], 'a second stop must not redeliver lines');
  });

});
