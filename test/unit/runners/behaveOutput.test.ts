// Unit tests for BehaveOutputFilter.
//
// These replace the old cleanBehaveText tests in common.test.ts. That function
// stripped the ESC byte and the literal strings "[33m"/"[0m" and nothing else,
// which left every other SGR code visible as text - the reason behave's colour
// could not be switched on. The filter keeps colour, drops cursor motion, and
// resolves behave's two-pass step drawing.

import * as assert from 'assert';
import { BehaveOutputFilter } from '../../../src/runners/behaveOutput';

// behave's own sequences (bundled/libs/behave/formatter/ansi_escapes.py)
const GREY = '\x1b[90m';   // Status.executing, and comments
const GREEN = '\x1b[32m';  // passed
const RED = '\x1b[31m';    // failed
const RESET = '\x1b[0m';
const UP1 = '\x1b[1A';

suite('behaveOutput', () => {

  const writeAll = (filter: BehaveOutputFilter, ...chunks: string[]): string[] => {
    const out: string[] = [];
    for (const chunk of chunks)
      out.push(...filter.write(chunk));
    out.push(...filter.flush());
    return out;
  };

  suite('line assembly', () => {

    test('emits only complete lines, holding the partial tail', () => {
      const filter = new BehaveOutputFilter();
      assert.deepStrictEqual(filter.write('one\ntw'), ['one']);
      assert.deepStrictEqual(filter.write('o\n'), ['two']);
    });

    test('flush releases a final line with no trailing newline', () => {
      const filter = new BehaveOutputFilter();
      assert.deepStrictEqual(filter.write('no newline'), []);
      assert.deepStrictEqual(filter.flush(), ['no newline']);
    });

    test('flush on an empty filter emits nothing', () => {
      assert.deepStrictEqual(new BehaveOutputFilter().flush(), []);
    });

    test('strips the CR of CRLF line endings', () => {
      assert.deepStrictEqual(writeAll(new BehaveOutputFilter(), 'a\r\nb\r\n'), ['a', 'b']);
    });

    test('reassembles an escape sequence split across chunks', () => {
      // The ESC and the rest of the sequence arrive separately - the reason the
      // filter is stateful rather than a per-chunk string replace.
      const out = writeAll(new BehaveOutputFilter(), 'text \x1b', '[32mgreen' + RESET + '\n');
      assert.deepStrictEqual(out, ['text \x1b[32mgreen' + RESET]);
    });

    test('reassembles a multi-byte character split across chunks', () => {
      // A decoded string can still be split mid-word; the point is that nothing
      // is emitted until the line is whole.
      const out = writeAll(new BehaveOutputFilter(), 'caf', 'é au lait\n');
      assert.deepStrictEqual(out, ['café au lait']);
    });

    test('a line split across three chunks emits once', () => {
      const out = writeAll(new BehaveOutputFilter(), 'Scen', 'ario: ', 'A\n');
      assert.deepStrictEqual(out, ['Scenario: A']);
    });
  });

  suite('escape handling', () => {

    test('keeps SGR colour', () => {
      const line = `    ${GREEN}Given ${RESET}${GREEN}we have behave installed${RESET}`;
      assert.deepStrictEqual(writeAll(new BehaveOutputFilter(), line + '\n'), [line]);
    });

    test('strips cursor motion other than the leading rewrite', () => {
      const out = writeAll(new BehaveOutputFilter(), 'a\x1b[2Kb\x1b[3Gc\n');
      assert.deepStrictEqual(out, ['abc']);
    });

    test('strips OSC sequences', () => {
      const out = writeAll(new BehaveOutputFilter(), '\x1b]0;window title\x07text\n');
      assert.deepStrictEqual(out, ['text']);
    });

    test('applies carriage-return overwrite within a line', () => {
      // Progress-style output rewinds to column 0; only the last write is visible.
      const out = writeAll(new BehaveOutputFilter(), 'first\rsecond\n');
      assert.deepStrictEqual(out, ['second']);
    });

    test('monochrome output passes through unchanged', () => {
      const lines = ['Feature: Simple', '', '  Scenario: run a successful test',
        '    Given we have behave installed'];
      const out = writeAll(new BehaveOutputFilter(), lines.join('\n') + '\n');
      assert.deepStrictEqual(out, lines);
    });
  });

  suite('grey-then-rewrite resolution', () => {

    test('emits the resolved step once, not the executing pass', () => {
      const grey = `    ${GREY}Given ${RESET}${GREY}we have behave installed${RESET}`;
      const green = `    ${GREEN}Given ${RESET}${GREEN}we have behave installed${RESET}`;
      const out = writeAll(new BehaveOutputFilter(), `${grey}\n${UP1}${green}\n`);
      assert.deepStrictEqual(out, [green]);
    });

    test('a failed step resolves to red', () => {
      const grey = `    ${GREY}When ${RESET}${GREY}we implement a failing test${RESET}`;
      const red = `    ${RED}When ${RESET}${RED}we implement a failing test${RESET}`;
      const out = writeAll(new BehaveOutputFilter(), `${grey}\n${UP1}${red}\n`);
      assert.deepStrictEqual(out, [red]);
    });

    test('resolves a multi-line block, e.g. a step with a table', () => {
      // behave moves up over the step line plus its multiline content
      // (pretty.py: lines = step_lines + 1 + table rows + 1) and redraws all of it.
      const grey = `    ${GREY}Given a table${RESET}`;
      const green = `    ${GREEN}Given a table${RESET}`;
      const out = writeAll(new BehaveOutputFilter(),
        `${grey}\n      | a | b |\n      | 1 | 2 |\n` +
        `\x1b[3A${green}\n      | a | b |\n      | 1 | 2 |\n`);
      assert.deepStrictEqual(out, [green, '      | a | b |', '      | 1 | 2 |']);
    });

    test('an unresolved executing line is still emitted, not swallowed', () => {
      // If behave is killed mid-step the rewrite never arrives; the grey line must
      // not be lost.
      const grey = `    ${GREY}Given we have behave installed${RESET}`;
      assert.deepStrictEqual(writeAll(new BehaveOutputFilter(), grey + '\n'), [grey]);
    });

    test('a held block is released when a non-step line follows', () => {
      const grey = `    ${GREY}Given a step${RESET}`;
      const out = writeAll(new BehaveOutputFilter(), `${grey}\n  Scenario: next\n`);
      assert.deepStrictEqual(out, [grey, '  Scenario: next']);
    });

    test('a rewrite split across chunks still resolves', () => {
      const grey = `    ${GREY}Given a step${RESET}`;
      const green = `    ${GREEN}Given a step${RESET}`;
      const out = writeAll(new BehaveOutputFilter(), `${grey}\n\x1b[1`, `A${green}\n`);
      assert.deepStrictEqual(out, [green]);
    });

    test('a grey comment after step text does not make the line rewritable', () => {
      // "comments" uses the same grey as "executing", so the filter tests the
      // FIRST SGR of the line rather than looking for grey anywhere in it.
      const line = `    ${GREEN}Given a step${RESET}${GREY}   # steps.py:4${RESET}`;
      assert.deepStrictEqual(writeAll(new BehaveOutputFilter(), line + '\n'), [line]);
    });

    test('consecutive steps each resolve independently', () => {
      const g = (kw: string) => `    ${GREY}${kw} a step${RESET}`;
      const c = (kw: string) => `    ${GREEN}${kw} a step${RESET}`;
      const out = writeAll(new BehaveOutputFilter(),
        `${g('Given')}\n${UP1}${c('Given')}\n${g('When')}\n${UP1}${c('When')}\n`);
      assert.deepStrictEqual(out, [c('Given'), c('When')]);
    });
  });

  suite('prefix', () => {

    test('prefixes every emitted line', () => {
      const out = writeAll(new BehaveOutputFilter('[basic] '), 'one\ntwo\n');
      assert.deepStrictEqual(out, ['[basic] one', '[basic] two']);
    });

    test('prefixes a resolved step line', () => {
      const grey = `    ${GREY}Given a step${RESET}`;
      const green = `    ${GREEN}Given a step${RESET}`;
      const out = writeAll(new BehaveOutputFilter('[basic] '), `${grey}\n${UP1}${green}\n`);
      assert.deepStrictEqual(out, ['[basic] ' + green]);
    });

    test('prefixes a flushed partial line', () => {
      const filter = new BehaveOutputFilter('[basic] ');
      filter.write('tail');
      assert.deepStrictEqual(filter.flush(), ['[basic] tail']);
    });
  });
});
