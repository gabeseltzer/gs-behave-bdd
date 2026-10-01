import * as assert from 'assert';
import { getOutlineExampleRows, splitTableRow, substitutePlaceholders } from '../../../src/parsers/outlineExamples';

const FEATURE = [
  /* 0 */ "Feature: f",
  /* 1 */ "  Background:",
  /* 2 */ "    Given a <thing> in the background",
  /* 3 */ "  Scenario Outline: o",
  /* 4 */ "    Given I have <count> cukes",
  /* 5 */ "      | not | examples |",
  /* 6 */ "    And a step with a docstring",
  /* 7 */ '      """',
  /* 8 */ "      Given <not> a step",
  /* 9 */ '      """',
  /* 10 */ "    Examples: first",
  /* 11 */ "      | count | colour |",
  /* 12 */ "      | 5     | red    |",
  /* 13 */ "      | many  | blue   |",
  /* 14 */ "    @tagged",
  /* 15 */ "    Examples: second",
  /* 16 */ "      | count |",
  /* 17 */ "      | 7     |",
  /* 18 */ "  Scenario: plain",
  /* 19 */ "    Given I have <count> cukes",
];

suite('outlineExamples', () => {

  test('outline steps map to every Examples row of their outline', () => {
    const rows = getOutlineExampleRows(FEATURE);
    assert.deepStrictEqual([...rows.keys()], [4, 6]);
    assert.deepStrictEqual(rows.get(4)?.map(r => r.line), [12, 13, 17]);
    assert.strictEqual(rows.get(4)?.[1].cells.get("count")?.value, "many");
  });

  test('cell positions are those of the trimmed text', () => {
    const cell = getOutlineExampleRows(FEATURE).get(4)?.[1].cells.get("count");
    assert.deepStrictEqual(cell && [cell.line, cell.start, cell.end], [13, 8, 12]);
    assert.strictEqual(FEATURE[13].slice(8, 12), "many");
  });

  test('table rows are split on unescaped pipes and unescaped', () => {
    const cells = splitTableRow("  | a \\| b | c\\\\d |  ", 0);
    assert.deepStrictEqual(cells.map(c => c.value), ["a | b", "c\\d"]);
  });

  test('placeholders are filled from a row, tracking where each piece came from', () => {
    const [row] = getOutlineExampleRows(FEATURE).get(4) ?? [];
    const substituted = substitutePlaceholders("I have <count> cukes", row);
    assert.strictEqual(substituted.text, "I have 5 cukes");
    assert.strictEqual(substituted.unresolved, false);
    assert.deepStrictEqual(substituted.pieces.map(p => [p.start, p.end, p.originalStart, p.placeholder]),
      [[0, 7, 0, undefined], [7, 8, 7, "count"], [8, 14, 14, undefined]]);
  });

  test('a placeholder with no column is left in place and flagged', () => {
    const [row] = getOutlineExampleRows(FEATURE).get(4) ?? [];
    const substituted = substitutePlaceholders("a <nope> and <count>", row);
    assert.strictEqual(substituted.text, "a <nope> and 5");
    assert.strictEqual(substituted.unresolved, true);
  });
});
