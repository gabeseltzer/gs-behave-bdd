// Tests for Scenario Outline → Examples group → individual row hierarchy.
// These define the expected behavior for the intermediate Examples group
// node that allows running all rows in one Examples table at once.

import * as assert from 'assert';
import * as vscode from 'vscode';
import { parseFeatureContent, deleteFeatureFileSteps } from '../../../src/parsers/featureParser';
import { Scenario, ScenarioExamplesGroup, TestFile, BehaveTestData } from '../../../src/parsers/testFile';
import { WorkspaceSettings } from '../../../src/settings';

// ---------------------------------------------------------------------------
// Minimal mock TestController (same pattern as scenarioOutlineRunAndResults)
// ---------------------------------------------------------------------------

interface MockTestItem {
  id: string;
  label: string;
  uri?: vscode.Uri;
  range?: vscode.Range;
  children: { items: MockTestItem[]; replace(items: MockTestItem[]): void; forEach(cb: (item: MockTestItem) => void): void };
  error?: string | vscode.MarkdownString;
}

function makeMockController() {
  const testData = new WeakMap<object, BehaveTestData>();

  function makeChildren() {
    const items: MockTestItem[] = [];
    return {
      items,
      replace(newItems: MockTestItem[]) { items.splice(0, items.length, ...newItems); },
      forEach(cb: (item: MockTestItem) => void) { items.forEach(cb); },
    };
  }

  function createTestItem(id: string, label: string, uri?: vscode.Uri): MockTestItem {
    return { id, label, uri, children: makeChildren() };
  }

  return { createTestItem, testData };
}

async function parseFeature(content: string, wkspSettings: WorkspaceSettings, testUri: vscode.Uri) {
  const { createTestItem, testData } = makeMockController();
  const ctrl = { createTestItem } as unknown as vscode.TestController;

  const featureItem = createTestItem('feature-id', 'My Feature', testUri);
  (featureItem as unknown as MockTestItem).children = {
    items: [],
    replace(items: MockTestItem[]) { this.items.splice(0, this.items.length, ...items); },
    forEach(cb: (item: MockTestItem) => void) { this.items.forEach(cb); },
  };

  const tf = new TestFile();
  await tf.createScenarioTestItemsFromFeatureFileContent(
    wkspSettings, content,
    testData as unknown as WeakMap<vscode.TestItem, BehaveTestData>,
    ctrl, featureItem as unknown as vscode.TestItem, 'test'
  );

  return { featureItem, testData };
}

// ---------------------------------------------------------------------------
// parseFeatureContent — onExamplesGroup callback
// ---------------------------------------------------------------------------

suite('parseFeatureContent - onExamplesGroup callback', () => {
  const testUri = vscode.Uri.file('c:/test/features/outline.feature');
  const wkspUri = vscode.Uri.file('c:/test');
  const wkspSettings = { uri: wkspUri } as WorkspaceSettings;

  setup(() => deleteFeatureFileSteps(vscode.Uri.file('c:/test/features')));

  test('fires once per Examples table', () => {
    const content = `
Feature: F
  Scenario Outline: Blend Success
    Given step

  Examples: Amphibians
    | thing         |
    | Red Tree Frog |

  Examples: Electronics
    | thing  |
    | iPhone |
    | Nexus  |
`;
    type GroupCall = { outlineName: string; tableIndex: number; examplesName: string };
    const groups: GroupCall[] = [];

    parseFeatureContent(
      wkspSettings, testUri, content, 'test',
      () => { }, () => { }, () => { },
      (_range, outlineName, tableIndex, examplesName) => {
        groups.push({ outlineName, tableIndex, examplesName });
      }
    );

    assert.strictEqual(groups.length, 2);
    assert.strictEqual(groups[0].outlineName, 'Blend Success');
    assert.strictEqual(groups[0].tableIndex, 1);
    assert.strictEqual(groups[0].examplesName, 'Amphibians');
    assert.strictEqual(groups[1].tableIndex, 2);
    assert.strictEqual(groups[1].examplesName, 'Electronics');
  });

  test('fires before the rows belonging to that table', () => {
    const content = `
Feature: F
  Scenario Outline: O
    Given step

  Examples: First
    | x |
    | a |
    | b |

  Examples: Second
    | x |
    | c |
`;
    const events: string[] = [];

    parseFeatureContent(
      wkspSettings, testUri, content, 'test',
      () => { }, () => { },
      (_r, _o, _ti, ri, en) => events.push(`row:${en || '?'}:${ri}`),
      (_r, _o, _ti, en) => events.push(`group:${en}`)
    );

    // group fires before its rows
    assert.deepStrictEqual(events, [
      'group:First',
      'row:First:1',
      'row:First:2',
      'group:Second',
      'row:Second:1',
    ]);
  });

  test('resets between different Scenario Outlines', () => {
    const content = `
Feature: F
  Scenario Outline: A
    Given step
  Examples:
    | x |
    | 1 |

  Scenario Outline: B
    Given step
  Examples:
    | x |
    | 2 |
`;
    type GroupCall = { outlineName: string; tableIndex: number };
    const groups: GroupCall[] = [];

    parseFeatureContent(
      wkspSettings, testUri, content, 'test',
      () => { }, () => { }, () => { },
      (_r, outlineName, tableIndex) => groups.push({ outlineName, tableIndex })
    );

    assert.strictEqual(groups.length, 2);
    assert.strictEqual(groups[0].outlineName, 'A');
    assert.strictEqual(groups[0].tableIndex, 1);
    assert.strictEqual(groups[1].outlineName, 'B');
    assert.strictEqual(groups[1].tableIndex, 1, 'tableIndex resets for each new outline');
  });

  test('does not fire for plain Scenarios', () => {
    const content = `
Feature: F
  Scenario: Plain
    Given step
    | a | b |
    | 1 | 2 |
`;
    let count = 0;
    parseFeatureContent(
      wkspSettings, testUri, content, 'test',
      () => { }, () => { }, () => { },
      () => { count++; }
    );
    assert.strictEqual(count, 0);
  });

  test('backward compatible — omitting onExamplesGroup does not throw', () => {
    const content = `
Feature: F
  Scenario Outline: O
    Given step
  Examples:
    | x |
    | 1 |
`;
    assert.doesNotThrow(() => {
      parseFeatureContent(
        wkspSettings, testUri, content, 'test',
        () => { }, () => { }, () => { }
        // no onExamplesGroup argument
      );
    });
  });

  test('unnamed Examples has empty examplesName', () => {
    const content = `
Feature: F
  Scenario Outline: O
    Given step
  Examples:
    | x |
    | 1 |
`;
    const names: string[] = [];
    parseFeatureContent(
      wkspSettings, testUri, content, 'test',
      () => { }, () => { }, () => { },
      (_r, _o, _ti, name) => names.push(name)
    );
    assert.strictEqual(names[0], '');
  });
});

// ---------------------------------------------------------------------------
// TestFile tree structure with Examples groups
// ---------------------------------------------------------------------------

suite('TestFile - ScenarioExamplesGroup intermediate nodes', () => {
  const testUri = vscode.Uri.file('c:/test/features/outline.feature');
  const wkspUri = vscode.Uri.file('c:/test');
  const wkspSettings = { uri: wkspUri } as WorkspaceSettings;

  setup(() => deleteFeatureFileSteps(vscode.Uri.file('c:/test/features')));

  test('outline children are ScenarioExamplesGroup nodes, not raw rows', async () => {
    const content = `
Feature: My Feature
  Scenario Outline: Blend Success
    Given step

  Examples: Amphibians
    | thing         |
    | Red Tree Frog |

  Examples: Electronics
    | thing  |
    | iPhone |
    | Nexus  |
`;
    const { featureItem, testData } = await parseFeature(content, wkspSettings, testUri);
    const outline = featureItem.children.items[0];
    assert.ok(outline, 'Outline item should exist');

    const groupItems = outline.children.items;
    assert.strictEqual(groupItems.length, 2, 'Outline should have 2 Examples group children');

    const firstGroup = groupItems[0];
    const firstGroupData = testData.get(firstGroup) as unknown as ScenarioExamplesGroup;
    assert.ok(firstGroupData instanceof ScenarioExamplesGroup,
      `First child should be ScenarioExamplesGroup, got: ${firstGroupData?.constructor?.name}`);
    assert.strictEqual(firstGroupData.examplesName, 'Amphibians');
    assert.strictEqual(firstGroupData.tableIndex, 1);
    assert.strictEqual(firstGroupData.scenarioName, 'Blend Success');

    const secondGroup = groupItems[1];
    const secondGroupData = testData.get(secondGroup) as unknown as ScenarioExamplesGroup;
    assert.ok(secondGroupData instanceof ScenarioExamplesGroup);
    assert.strictEqual(secondGroupData.examplesName, 'Electronics');
    assert.strictEqual(secondGroupData.tableIndex, 2);
  });

  test('each ScenarioExamplesGroup contains its row Scenarios as children', async () => {
    const content = `
Feature: My Feature
  Scenario Outline: Blend Success
    Given step

  Examples: Amphibians
    | thing         |
    | Red Tree Frog |

  Examples: Electronics
    | thing  |
    | iPhone |
    | Nexus  |
`;
    const { featureItem, testData } = await parseFeature(content, wkspSettings, testUri);
    const outline = featureItem.children.items[0];
    const [groupA, groupB] = outline.children.items;

    // Group A: 1 row
    assert.strictEqual(groupA.children.items.length, 1, 'Amphibians group should have 1 row');
    const rowA1Data = testData.get(groupA.children.items[0]) as unknown as Scenario;
    assert.ok(rowA1Data instanceof Scenario);
    assert.strictEqual(rowA1Data.exampleRow?.junitName, 'Blend Success -- @1.1 Amphibians');

    // Group B: 2 rows
    assert.strictEqual(groupB.children.items.length, 2, 'Electronics group should have 2 rows');
    const rowB1Data = testData.get(groupB.children.items[0]) as unknown as Scenario;
    assert.strictEqual(rowB1Data.exampleRow?.junitName, 'Blend Success -- @2.1 Electronics');
    const rowB2Data = testData.get(groupB.children.items[1]) as unknown as Scenario;
    assert.strictEqual(rowB2Data.exampleRow?.junitName, 'Blend Success -- @2.2 Electronics');
  });

  test('ScenarioExamplesGroup label is the examples name when named', async () => {
    const content = `
Feature: My Feature
  Scenario Outline: O
    Given step
  Examples: My Group
    | x |
    | 1 |
`;
    const { featureItem } = await parseFeature(content, wkspSettings, testUri);
    const outline = featureItem.children.items[0];
    const group = outline.children.items[0];
    assert.strictEqual(group.label, 'My Group');
  });

  test('ScenarioExamplesGroup label falls back to "Examples" when unnamed', async () => {
    const content = `
Feature: My Feature
  Scenario Outline: O
    Given step
  Examples:
    | x |
    | 1 |
`;
    const { featureItem } = await parseFeature(content, wkspSettings, testUri);
    const outline = featureItem.children.items[0];
    const group = outline.children.items[0];
    assert.strictEqual(group.label, 'Examples');
  });

  test('last Examples group at EOF is flushed correctly', async () => {
    const content = `
Feature: My Feature
  Scenario Outline: O
    Given step

  Examples: First
    | x |
    | a |

  Examples: Last
    | x |
    | b |
    | c |
`;
    const { featureItem } = await parseFeature(content, wkspSettings, testUri);
    const outline = featureItem.children.items[0];
    const groups = outline.children.items;
    assert.strictEqual(groups.length, 2, 'Should have 2 groups');

    const lastGroup = groups[1];
    assert.strictEqual(lastGroup.label, 'Last');
    assert.strictEqual(lastGroup.children.items.length, 2,
      'Last group (at EOF) should have 2 rows — tests EOF flush');
  });

  test('multiple outlines each get their own group structure', async () => {
    const content = `
Feature: My Feature
  Scenario Outline: Outline A
    Given step
  Examples: GroupA
    | x |
    | 1 |
    | 2 |

  Scenario Outline: Outline B
    Given step
  Examples: GroupB
    | x |
    | 3 |
`;
    const { featureItem } = await parseFeature(content, wkspSettings, testUri);
    const [outlineA, outlineB] = featureItem.children.items;

    assert.strictEqual(outlineA.children.items.length, 1, 'Outline A: 1 group');
    assert.strictEqual(outlineA.children.items[0].children.items.length, 2, 'Group A: 2 rows');

    assert.strictEqual(outlineB.children.items.length, 1, 'Outline B: 1 group');
    assert.strictEqual(outlineB.children.items[0].children.items.length, 1, 'Group B: 1 row');
  });

  test('plain scenario still has no children', async () => {
    const content = `
Feature: My Feature
  Scenario: Plain
    Given step
`;
    const { featureItem } = await parseFeature(content, wkspSettings, testUri);
    const scenario = featureItem.children.items[0];
    assert.strictEqual(scenario.children.items.length, 0);
  });
});
