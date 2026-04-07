// Tests for Scenario Outline example row execution and junit result matching.
// These tests define the expected behavior for running individual example rows
// and matching their junit XML results.

import * as assert from 'assert';
import * as vscode from 'vscode';
import { getScenarioRunName } from '../../../src/runners/runOrDebug';
import { Scenario, ExampleRow, TestFile } from '../../../src/parsers/testFile';
import { WorkspaceSettings } from '../../../src/settings';
import { deleteFeatureFileSteps } from '../../../src/parsers/featureParser';

// ---------------------------------------------------------------------------
// Helper: build a minimal mock TestController
// ---------------------------------------------------------------------------

interface MockTestItem {
  id: string;
  label: string;
  uri?: vscode.Uri;
  range?: vscode.Range;
  children: { items: MockTestItem[]; replace(items: MockTestItem[]): void; forEach(cb: (item: MockTestItem) => void): void };
  parent?: MockTestItem;
  error?: string | vscode.MarkdownString;
}

function makeMockController() {
  const allItems: MockTestItem[] = [];
  const testData = new WeakMap<MockTestItem, Scenario>();

  function makeChildren(parent?: MockTestItem) {
    const items: MockTestItem[] = [];
    return {
      items,
      replace(newItems: MockTestItem[]) {
        items.splice(0, items.length, ...newItems);
      },
      forEach(cb: (item: MockTestItem) => void) {
        items.forEach(cb);
      },
    };
  }

  function createTestItem(id: string, label: string, uri?: vscode.Uri): MockTestItem {
    const item: MockTestItem = {
      id, label, uri,
      children: makeChildren(),
    };
    allItems.push(item);
    return item;
  }

  return { createTestItem, allItems, testData };
}

// ---------------------------------------------------------------------------
// getScenarioRunName — example rows
// ---------------------------------------------------------------------------

suite('getScenarioRunName', () => {

  test('normal scenario returns ^name$', () => {
    const pattern = getScenarioRunName('My Scenario', false);
    assert.strictEqual(pattern, '^My Scenario$');
  });

  test('outline without params returns ^name -- @', () => {
    const pattern = getScenarioRunName('Blend Success', true);
    assert.strictEqual(pattern, '^Blend Success -- @');
  });

  test('outline with <param> replaces params with .*', () => {
    const pattern = getScenarioRunName('Blend <thing>', true);
    assert.ok(pattern.startsWith('^Blend '));
    assert.ok(pattern.includes('.*'));
    assert.ok(pattern.endsWith(' -- @'));
  });

  test('example row produces exact-match pattern including -- @x.y suffix', () => {
    // Individual example rows should produce an exact-match pattern like:
    //   ^Blend Success -- @1\.1 Amphibians$
    // so that only that specific row is run.
    const junitName = 'Blend Success -- @1.1 Amphibians';
    const pattern = getScenarioRunName(junitName, false, true);

    // Must start with ^ and end with $
    assert.ok(pattern.startsWith('^'), `Expected pattern to start with ^, got: ${pattern}`);
    assert.ok(pattern.endsWith('$'), `Expected pattern to end with $, got: ${pattern}`);

    // The dot in @1.1 must be escaped so it does not match "any character"
    assert.ok(pattern.includes('\\.'), `Expected escaped dot in pattern, got: ${pattern}`);

    // The pattern should contain the core scenario name
    assert.ok(pattern.includes('Blend Success'), `Expected outline name in pattern, got: ${pattern}`);

    // Verify the pattern actually matches the junitName via regex
    const re = new RegExp(pattern);
    assert.ok(re.test(junitName), `Pattern should match junitName "${junitName}", got pattern: ${pattern}`);

    // And does NOT match a different row
    assert.ok(!re.test('Blend Success -- @1.2 Amphibians'), 'Pattern must not match a different row');
    assert.ok(!re.test('Blend Success -- @2.1 Electronics'), 'Pattern must not match another table');
  });

  test('example row with unnamed examples (empty examplesName) produces exact-match pattern', () => {
    const junitName = 'Outline -- @1.1';
    const pattern = getScenarioRunName(junitName, false, true);
    assert.ok(pattern.startsWith('^'));
    assert.ok(pattern.endsWith('$'));
    const re = new RegExp(pattern);
    assert.ok(re.test(junitName));
    assert.ok(!re.test('Outline -- @1.2'));
  });

  test('example row with special chars in scenario name are escaped', () => {
    const junitName = 'My (Special) Scenario -- @1.1 Test';
    const pattern = getScenarioRunName(junitName, false, true);
    const re = new RegExp(pattern);
    assert.ok(re.test(junitName), 'Pattern should match the junitName with special chars');
    assert.ok(!re.test('My (Special) Scenario -- @1.2 Test'), 'Pattern should not match different row');
  });

});

// ---------------------------------------------------------------------------
// TestFile.createScenarioTestItemsFromFeatureFileContent — children structure
// ---------------------------------------------------------------------------

suite('TestFile - Scenario Outline creates example row children', () => {
  const testUri = vscode.Uri.file('c:/test/features/outline.feature');
  const wkspUri = vscode.Uri.file('c:/test');
  const wkspSettings = { uri: wkspUri } as WorkspaceSettings;

  setup(() => {
    deleteFeatureFileSteps(vscode.Uri.file('c:/test/features'));
  });

  async function parseFeature(content: string) {
    const { createTestItem, testData } = makeMockController();
    const ctrl = { createTestItem } as unknown as vscode.TestController;

    const featureItem = createTestItem('feature-id', 'My Feature', testUri) as unknown as vscode.TestItem;
    (featureItem as unknown as MockTestItem).children = {
      items: [],
      replace(items: MockTestItem[]) { this.items.splice(0, this.items.length, ...items); },
      forEach(cb: (item: MockTestItem) => void) { this.items.forEach(cb); },
    };

    const tf = new TestFile();
    await tf.createScenarioTestItemsFromFeatureFileContent(
      wkspSettings, content, testData as unknown as WeakMap<vscode.TestItem, import('../../../src/parsers/testFile').BehaveTestData>,
      ctrl, featureItem, 'test'
    );

    return { featureItem: featureItem as unknown as MockTestItem, testData };
  }

  test('plain scenario has no children', async () => {
    const content = `
Feature: My Feature
  Scenario: Plain
    Given a step
`;
    const { featureItem } = await parseFeature(content);
    const scenarios = featureItem.children.items;
    assert.strictEqual(scenarios.length, 1, 'Should have 1 scenario');
    assert.strictEqual(scenarios[0].children.items.length, 0, 'Plain scenario should have no children');
  });

  test('Scenario Outline has example rows as children', async () => {
    const content = `
Feature: My Feature
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
    const { featureItem } = await parseFeature(content);
    const scenarios = featureItem.children.items;
    assert.strictEqual(scenarios.length, 1, 'Should have 1 outline');
    const outline = scenarios[0];
    assert.ok(outline.label === 'Blend Success', `Outline label should be "Blend Success", got: ${outline.label}`);

    const exampleRows = outline.children.items;
    assert.strictEqual(exampleRows.length, 3, 'Should have 3 example rows (1 + 2)');

    // First row: table 1, row 1
    assert.strictEqual(exampleRows[0].label, '@1.1 Red Tree Frog');
    // Second row: table 2, row 1
    assert.strictEqual(exampleRows[1].label, '@2.1 iPhone');
    // Third row: table 2, row 2
    assert.strictEqual(exampleRows[2].label, '@2.2 Nexus');
  });

  test('last Scenario Outline in file has its example rows (flush works at EOF)', async () => {
    const content = `
Feature: My Feature
  Scenario Outline: First Outline
    Given step

  Examples:
    | x |
    | a |

  Scenario Outline: Last Outline
    Given step

  Examples:
    | y |
    | 1 |
    | 2 |
`;
    const { featureItem } = await parseFeature(content);
    const scenarios = featureItem.children.items;
    assert.strictEqual(scenarios.length, 2, 'Should have 2 outlines');

    const lastOutline = scenarios[1];
    assert.ok(lastOutline.label === 'Last Outline', `Expected "Last Outline", got: ${lastOutline.label}`);
    assert.strictEqual(lastOutline.children.items.length, 2,
      'Last outline (at EOF) should have 2 example rows — tests that flush-at-EOF works');
  });

  test('example row Scenario data has correct junitName', async () => {
    const content = `
Feature: My Feature
  Scenario Outline: Blend Success
    Given step

  Examples: Amphibians
    | thing         |
    | Red Tree Frog |
`;
    const { featureItem, testData } = await parseFeature(content);
    const outline = featureItem.children.items[0];
    const rowItem = outline.children.items[0];
    const data = testData.get(rowItem) as unknown as Scenario;

    assert.ok(data, 'testData should contain the row item');
    assert.ok(data.exampleRow, 'Scenario should have exampleRow property set');
    assert.strictEqual(data.exampleRow?.junitName, 'Blend Success -- @1.1 Amphibians');
    assert.strictEqual(data.exampleRow?.tableIndex, 1);
    assert.strictEqual(data.exampleRow?.rowIndex, 1);
    assert.strictEqual(data.isOutline, false);
    assert.strictEqual(data.scenarioName, 'Blend Success');
  });

});

// ---------------------------------------------------------------------------
// ExampleRow junitName format (for junit matching contract)
// ---------------------------------------------------------------------------

suite('ExampleRow junitName format', () => {

  function makeRow(outlineName: string, tableIndex: number, rowIndex: number, examplesName: string): string {
    return `${outlineName} -- @${tableIndex}.${rowIndex}${examplesName ? ' ' + examplesName : ''}`;
  }

  test('named examples: "Blend Success -- @1.1 Amphibians"', () => {
    assert.strictEqual(makeRow('Blend Success', 1, 1, 'Amphibians'), 'Blend Success -- @1.1 Amphibians');
  });

  test('unnamed examples: "Blend Success -- @1.1" (no trailing space)', () => {
    const result = makeRow('Blend Success', 1, 1, '');
    assert.strictEqual(result, 'Blend Success -- @1.1');
    assert.ok(!result.endsWith(' '));
  });

  test('second table second row: "Blend Success -- @2.2 Electronics"', () => {
    assert.strictEqual(makeRow('Blend Success', 2, 2, 'Electronics'), 'Blend Success -- @2.2 Electronics');
  });

  test('matches what getScenarioRunName exact pattern will match (when implemented)', () => {
    const junitName = makeRow('Blend Success', 1, 1, 'Amphibians');
    const escaped = junitName.replace(/[".*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`^${escaped}$`);
    assert.ok(re.test(junitName));
    assert.ok(!re.test(makeRow('Blend Success', 1, 2, 'Amphibians')));
    assert.ok(!re.test(makeRow('Blend Success', 2, 1, 'Amphibians')));
    assert.ok(!re.test(makeRow('Blend Success', 1, 1, 'Electronics')));
  });

});
