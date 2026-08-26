// Tests that a feature which behave will reject says so on its tree node.
//
// A Gherkin structural error - an And/But with no preceding Given/When/Then and no
// Background to inherit from - makes behave reject the whole file, so none of the
// scenarios under it will run. TestItem.error is documented for exactly this ("errors in
// test discovery, such as syntax errors") and puts it where someone looking at the tree
// wondering why a feature does nothing will see it. Before, it reached only the Problems
// pane, which you have to already be looking at.

import * as assert from 'assert';
import * as vscode from 'vscode';
import { getFeatureParseErrorsForFile, getFeatureParseErrors, deleteFeatureFileSteps } from '../../../src/parsers/featureParser';
import { TestFile } from '../../../src/parsers/testFile';
import { WorkspaceSettings } from '../../../src/settings';

suite('feature item error', () => {

  const featuresRoot = vscode.Uri.file('c:/test/features');
  const testUri = vscode.Uri.joinPath(featuresRoot, 'test.feature');
  const wkspSettings = { uri: vscode.Uri.file('c:/test') } as WorkspaceSettings;

  /** A test item with the surface createScenarioTestItemsFromFeatureFileContent touches. */
  const makeItem = (uri: vscode.Uri) => {
    const children: vscode.TestItem[] = [];
    return {
      id: uri.path,
      label: 'test.feature',
      uri,
      range: undefined as vscode.Range | undefined,
      error: undefined as string | vscode.MarkdownString | undefined,
      tags: [] as readonly vscode.TestTag[],
      children: {
        size: children.length,
        replace: (items: vscode.TestItem[]) => { children.splice(0, children.length, ...items); },
        forEach: (cb: (i: vscode.TestItem) => void) => children.forEach(cb),
      },
    } as unknown as vscode.TestItem;
  };

  const controller = {
    createTestItem: (id: string, label: string, uri?: vscode.Uri) => makeItem(uri ?? testUri),
  } as unknown as vscode.TestController;

  const build = async (content: string, uri = testUri) => {
    const item = makeItem(uri);
    await new TestFile().createScenarioTestItemsFromFeatureFileContent(
      wkspSettings, content, new WeakMap(), controller, item, 'test');
    return item;
  };

  setup(() => { deleteFeatureFileSteps(featuresRoot); });


  test('a feature behave will reject carries the reason on its node', async () => {
    // "And" with nothing before it and no Background: behave raises a ParserError.
    const item = await build(`
Feature: Broken
  Scenario: S
    And something
`);

    assert.ok(item.error, 'the node should carry an error');
    assert.match(String(item.error), /has no preceding Given\/When\/Then/);
  });


  test('the error names the line, so it can be found', async () => {
    const item = await build(`
Feature: Broken
  Scenario: S
    And something
`);
    // "And something" is line index 3, so 1-based line 4.
    assert.match(String(item.error), /^Line 4:/);
  });


  test('a valid feature carries no error', async () => {
    const item = await build(`
Feature: Fine
  Scenario: S
    Given something
    Then it works
`);
    assert.strictEqual(item.error, undefined);
  });


  test('a fixed feature clears the error it used to have', async () => {
    const broken = await build(`
Feature: Broken
  Scenario: S
    And something
`);
    assert.ok(broken.error, 'precondition: it started broken');

    const fixed = await build(`
Feature: Broken
  Scenario: S
    Given something
`);
    assert.strictEqual(fixed.error, undefined,
      'a reparse must clear a stale error, not leave the node marked broken forever');
  });


  // The per-file getter guards a trap the folder-level one cannot: keys are
  // "<uriId><sepr><line>", so a bare prefix match on the file's uriId also matches a
  // sibling whose name extends it.
  suite('getFeatureParseErrorsForFile', () => {

    test('does not pick up a sibling whose name extends this one', async () => {
      const shorter = vscode.Uri.joinPath(featuresRoot, 'test.feature');
      const longer = vscode.Uri.joinPath(featuresRoot, 'test.feature.bak.feature');

      await build(`
Feature: A
  Scenario: S
    And broken
`, shorter);
      await build(`
Feature: B
  Scenario: S
    And also broken
`, longer);

      assert.strictEqual(getFeatureParseErrorsForFile(shorter).length, 1,
        'only its own error - the sibling extends its path and must not match');
      assert.strictEqual(getFeatureParseErrorsForFile(longer).length, 1);
      assert.strictEqual(getFeatureParseErrors(featuresRoot).length, 2,
        'the folder-level getter still sees both');
    });
  });

});
