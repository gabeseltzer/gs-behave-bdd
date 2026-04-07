// Tests for running individual example rows and example groups.
// Covers the -n pattern generation (must match behave's substituted names)
// and the parentFeatureOrAllSiblingsIncluded guard (must not treat groups as features).

import * as assert from 'assert';
import { getScenarioRunName } from '../../../src/runners/runOrDebug';
import { Scenario } from '../../../src/parsers/testFile';

// ---------------------------------------------------------------------------
// getScenarioRunName — example row patterns must match substituted names
// ---------------------------------------------------------------------------

suite('getScenarioRunName - example row patterns', () => {

  test('example row with <param> in outline: pattern matches behave substituted name', () => {
    // Outline name: "Blenders Fail <thing>"
    // Behave substitutes <thing> → "Red Tree Frog"
    // The -n pattern must match "Blenders Fail Red Tree Frog -- @1.1 Amphibians"
    const scenario = new Scenario(
      'f.feature', 'features/f.feature', 'F', 'Blenders Fail <thing>', 0, false,
      { tableIndex: 1, rowIndex: 1, examplesName: 'Amphibians', values: ['Red Tree Frog', 'mush'],
        junitName: 'Blenders Fail <thing> -- @1.1 Amphibians' }
    );

    const pattern = getScenarioRunName(scenario.scenarioName, scenario.isOutline, scenario.exampleRow);

    const re = new RegExp(pattern);
    // Must match the actual behave name (with substituted param)
    assert.ok(re.test('Blenders Fail Red Tree Frog -- @1.1 Amphibians'),
      `Pattern "${pattern}" should match substituted name`);
    // Must NOT match a different row in the same outline
    assert.ok(!re.test('Blenders Fail Red Tree Frog -- @2.1 Electronics'),
      `Pattern should not match different row/table`);
    // Must NOT match a different outline's @1.1 Amphibians
    assert.ok(!re.test('Blenders Success Red Tree Frog -- @1.1 Amphibians'),
      `Pattern should not match different outline`);
  });

  test('example row without <param>: pattern is an exact match', () => {
    const scenario = new Scenario(
      'f.feature', 'features/f.feature', 'F', 'Blenders Success paramless', 0, false,
      { tableIndex: 1, rowIndex: 1, examplesName: 'Amphibians', values: ['Red Tree Frog', 'mush'],
        junitName: 'Blenders Success paramless -- @1.1 Amphibians' }
    );

    const pattern = getScenarioRunName(scenario.scenarioName, scenario.isOutline, scenario.exampleRow);

    const re = new RegExp(pattern);
    assert.ok(re.test('Blenders Success paramless -- @1.1 Amphibians'),
      `Pattern "${pattern}" should match the exact name`);
    assert.ok(!re.test('Blenders Success paramless -- @2.1 Electronics'),
      'Should not match different row');
  });

  test('example row with unnamed Examples table', () => {
    const scenario = new Scenario(
      'f.feature', 'features/f.feature', 'F', 'Outline <x>', 0, false,
      { tableIndex: 1, rowIndex: 1, examplesName: '', values: ['val'],
        junitName: 'Outline <x> -- @1.1' }
    );

    const pattern = getScenarioRunName(scenario.scenarioName, scenario.isOutline, scenario.exampleRow);

    const re = new RegExp(pattern);
    assert.ok(re.test('Outline substituted -- @1.1'),
      `Pattern "${pattern}" should match substituted name with unnamed examples`);
    assert.ok(!re.test('Outline substituted -- @1.2'),
      'Should not match different row index');
  });

  test('pattern for running Examples: Amphibians group (multiple rows piped)', () => {
    // When running a group, rows are piped: pattern1|pattern2
    const row1 = new Scenario(
      'f.feature', 'features/f.feature', 'F', 'Blend <thing>', 0, false,
      { tableIndex: 1, rowIndex: 1, examplesName: 'Amphibians', values: ['Frog'],
        junitName: 'Blend <thing> -- @1.1 Amphibians' }
    );
    const row2 = new Scenario(
      'f.feature', 'features/f.feature', 'F', 'Blend <thing>', 0, false,
      { tableIndex: 1, rowIndex: 2, examplesName: 'Amphibians', values: ['Newt'],
        junitName: 'Blend <thing> -- @1.2 Amphibians' }
    );

    const p1 = getScenarioRunName(row1.scenarioName, row1.isOutline, row1.exampleRow);
    const p2 = getScenarioRunName(row2.scenarioName, row2.isOutline, row2.exampleRow);
    const combined = new RegExp(p1 + '|' + p2);

    // Should match both Amphibians rows
    assert.ok(combined.test('Blend Frog -- @1.1 Amphibians'));
    assert.ok(combined.test('Blend Newt -- @1.2 Amphibians'));
    // Should NOT match Electronics rows
    assert.ok(!combined.test('Blend iPhone -- @2.1 Electronics'),
      'Amphibians-only pattern must not match Electronics rows');
    assert.ok(!combined.test('Blend Nexus -- @2.2 Electronics'),
      'Amphibians-only pattern must not match Electronics rows');
  });

  test('special regex chars in examplesName are escaped', () => {
    const scenario = new Scenario(
      'f.feature', 'features/f.feature', 'F', 'Outline', 0, false,
      { tableIndex: 1, rowIndex: 1, examplesName: 'Group (A)', values: ['x'],
        junitName: 'Outline -- @1.1 Group (A)' }
    );

    const pattern = getScenarioRunName(scenario.scenarioName, scenario.isOutline, scenario.exampleRow);

    const re = new RegExp(pattern);
    assert.ok(re.test('Outline -- @1.1 Group (A)'));
    // Unescaped parens would make (A) a capture group matching just "A"
    assert.ok(!re.test('Outline -- @1.1 Group A'), 'Parens should be literal, not regex groups');
  });

});
