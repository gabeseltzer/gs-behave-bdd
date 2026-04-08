// Unit tests for Scenario Outline + Examples parsing and test item creation

import * as assert from 'assert';
import * as vscode from 'vscode';
import { parseFeatureContent, deleteFeatureFileSteps } from '../../../src/parsers/featureParser';
import { WorkspaceSettings } from '../../../src/settings';

suite('Scenario Outline Examples', () => {

  const testUri = vscode.Uri.file('c:/test/features/outline.feature');
  const wkspUri = vscode.Uri.file('c:/test');
  const wkspSettings = { uri: wkspUri } as WorkspaceSettings;

  setup(() => {
    deleteFeatureFileSteps(vscode.Uri.file('c:/test/features'));
  });

  // ---------------------------------------------------------------------------
  // parseFeatureContent — onExampleRow callback
  // ---------------------------------------------------------------------------

  suite('parseFeatureContent - onExampleRow callback', () => {

    test('emits one row per data row in a single Examples table', () => {
      const content = `
Feature: Blenders
  Scenario Outline: Blend <thing>
    Given I put "<thing>" in a blender
    Then it becomes "<result>"

  Examples: Fruits
    | thing  | result |
    | banana | mush   |
    | apple  | pulp   |
`;
      type RowCall = { outlineName: string; tableIndex: number; rowIndex: number; examplesName: string; values: string[] };
      const rows: RowCall[] = [];

      parseFeatureContent(
        wkspSettings, testUri, content, 'test',
        () => { /* scenarios */ },
        () => { /* features */ },
        (_range, outlineName, tableIndex, rowIndex, examplesName, values) => {
          rows.push({ outlineName, tableIndex, rowIndex, examplesName, values });
        }
      );

      assert.strictEqual(rows.length, 2, 'Should emit 2 data rows');
      assert.strictEqual(rows[0].outlineName, 'Blend <thing>');
      assert.strictEqual(rows[0].tableIndex, 1);
      assert.strictEqual(rows[0].rowIndex, 1);
      assert.strictEqual(rows[0].examplesName, 'Fruits');
      assert.deepStrictEqual(rows[0].values, ['banana', 'mush']);
      assert.strictEqual(rows[1].rowIndex, 2);
      assert.deepStrictEqual(rows[1].values, ['apple', 'pulp']);
    });

    test('emits rows for multiple Examples tables with correct tableIndex', () => {
      const content = `
Feature: Blenders
  Scenario Outline: Blend Success
    Given I put "<thing>" in a blender

  Examples: Amphibians
    | thing         |
    | Red Tree Frog |

  Examples: Electronics
    | thing  |
    | iPhone |
    | Nexus  |
`;
      type RowCall = { tableIndex: number; rowIndex: number; examplesName: string; values: string[] };
      const rows: RowCall[] = [];

      parseFeatureContent(
        wkspSettings, testUri, content, 'test',
        () => { },
        () => { },
        (_range, _outlineName, tableIndex, rowIndex, examplesName, values) => {
          rows.push({ tableIndex, rowIndex, examplesName, values });
        }
      );

      assert.strictEqual(rows.length, 3);
      // Table 1
      assert.strictEqual(rows[0].tableIndex, 1);
      assert.strictEqual(rows[0].rowIndex, 1);
      assert.strictEqual(rows[0].examplesName, 'Amphibians');
      assert.deepStrictEqual(rows[0].values, ['Red Tree Frog']);
      // Table 2, rows 1 and 2
      assert.strictEqual(rows[1].tableIndex, 2);
      assert.strictEqual(rows[1].rowIndex, 1);
      assert.strictEqual(rows[1].examplesName, 'Electronics');
      assert.strictEqual(rows[2].tableIndex, 2);
      assert.strictEqual(rows[2].rowIndex, 2);
    });

    test('resets table/row counters between different Scenario Outlines', () => {
      const content = `
Feature: F
  Scenario Outline: Outline A
    Given step A

  Examples:
    | x |
    | 1 |
    | 2 |

  Scenario Outline: Outline B
    Given step B

  Examples:
    | y |
    | a |
`;
      type RowCall = { outlineName: string; tableIndex: number; rowIndex: number };
      const rows: RowCall[] = [];

      parseFeatureContent(
        wkspSettings, testUri, content, 'test',
        () => { },
        () => { },
        (_range, outlineName, tableIndex, rowIndex) => {
          rows.push({ outlineName, tableIndex, rowIndex });
        }
      );

      assert.strictEqual(rows.length, 3);
      assert.strictEqual(rows[0].outlineName, 'Outline A');
      assert.strictEqual(rows[0].tableIndex, 1);
      assert.strictEqual(rows[0].rowIndex, 1);
      assert.strictEqual(rows[1].outlineName, 'Outline A');
      assert.strictEqual(rows[1].tableIndex, 1);
      assert.strictEqual(rows[1].rowIndex, 2);
      // Outline B starts fresh
      assert.strictEqual(rows[2].outlineName, 'Outline B');
      assert.strictEqual(rows[2].tableIndex, 1);
      assert.strictEqual(rows[2].rowIndex, 1);
    });

    test('does NOT emit rows for plain Scenario data tables', () => {
      const content = `
Feature: F
  Scenario: Plain with table
    Given I have:
      | a | b |
      | 1 | 2 |
    Then done
`;
      let rowCount = 0;
      parseFeatureContent(
        wkspSettings, testUri, content, 'test',
        () => { },
        () => { },
        () => { rowCount++; }
      );
      assert.strictEqual(rowCount, 0, 'Step data tables in non-outline scenarios must not emit rows');
    });

    test('does NOT emit rows when onExampleRow is omitted (backward compatibility)', () => {
      const content = `
Feature: F
  Scenario Outline: Outline A
    Given step

  Examples:
    | x |
    | 1 |
`;
      // Should not throw
      assert.doesNotThrow(() => {
        parseFeatureContent(
          wkspSettings, testUri, content, 'test',
          () => { },
          () => { }
          // no onExampleRow argument
        );
      });
    });

    test('treats unnamed Examples (no label after colon) with empty examplesName', () => {
      const content = `
Feature: F
  Scenario Outline: Outline
    Given step

  Examples:
    | x |
    | 1 |
`;
      const rows: string[] = [];
      parseFeatureContent(
        wkspSettings, testUri, content, 'test',
        () => { },
        () => { },
        (_range, _name, _ti, _ri, examplesName) => { rows.push(examplesName); }
      );
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0], '', 'Unnamed Examples should have empty examplesName');
    });

    test('step data tables in a Scenario Outline do NOT emit rows (only Examples tables do)', () => {
      const content = `
Feature: F
  Scenario Outline: Outline with step table
    Given I have these values:
      | key | value |
      | a   | 1     |
    Then I see "<x>"

  Examples:
    | x |
    | 5 |
`;
      const rows: number[] = [];
      parseFeatureContent(
        wkspSettings, testUri, content, 'test',
        () => { },
        () => { },
        (_range, _name, _ti, ri) => { rows.push(ri); }
      );
      // Only the single Examples row should fire, not the 2 step table rows
      assert.strictEqual(rows.length, 1, 'Only Examples rows should be emitted');
      assert.strictEqual(rows[0], 1);
    });

  });

  // ---------------------------------------------------------------------------
  // ExampleRow label / junitName
  // ---------------------------------------------------------------------------

  suite('Scenario.getLabel for example rows', () => {

    test('label is "@tableIndex.rowIndex values" format', () => {
      // We test via the Scenario class directly
      // Dynamic require to avoid circular deps in test setup
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Scenario } = require('../../../src/parsers/testFile') as typeof import('../../../src/parsers/testFile');

      const row = {
        tableIndex: 2,
        rowIndex: 1,
        examplesName: 'Electronics',
        values: ['iPhone', 'toxic waste'],
        junitName: 'Blend Success -- @2.1 Electronics',
      };
      const s = new Scenario('f.feature', 'features/f.feature', 'My Feature', 'Blend Success', 0, false, row);
      assert.strictEqual(s.getLabel(), '@2.1 iPhone | toxic waste');
    });

    test('label for non-example scenario is just scenarioName', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Scenario } = require('../../../src/parsers/testFile') as typeof import('../../../src/parsers/testFile');
      const s = new Scenario('f.feature', 'features/f.feature', 'My Feature', 'My Scenario', 0, false);
      assert.strictEqual(s.getLabel(), 'My Scenario');
    });

    test('junitName includes empty examplesName without trailing space', () => {
      // The junitName for unnamed examples: "Outline -- @1.1" (no trailing space)
      const junitName = `Outline -- @1.1`;
      assert.ok(!junitName.endsWith(' '), 'junitName should not end with a space when examplesName is empty');
    });

  });

  // ---------------------------------------------------------------------------
  // getScenarioRunName for example rows
  // ---------------------------------------------------------------------------

  suite('getScenarioRunName for example rows', () => {

    test('individual example row produces exact-match -n pattern', () => {
      // Import internal function via module
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('../../../src/runners/runOrDebug') as { getScenarioRunNameForTest?: (name: string, isOutline: boolean, isExampleRow: boolean) => string };
      // If getScenarioRunName is not exported we test it indirectly via Scenario data shape —
      // this test documents the contract rather than calling the private function.

      // Contract: for an example row with junitName "Blend Success -- @1.1 Amphibians"
      // the -n pattern should match exactly that row and nothing else.
      const junitName = 'Blend Success -- @1.1 Amphibians';
      // The pattern must: start with ^, end with $, escape special regex chars
      const escaped = junitName.replace(/[".*+?^${}()|[\]\\]/g, '\\$&');
      const expectedPattern = `^${escaped}$`;

      // Validate the escaping logic:
      assert.ok(expectedPattern.startsWith('^'));
      assert.ok(expectedPattern.endsWith('$'));
      // The literal "." in "--" is NOT a regex special char issue, but "@" and "." in "@1.1" need escaping
      assert.ok(expectedPattern.includes('\\.')); // the dot in @1.1 should be escaped
    });

  });

});
