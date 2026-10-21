// Regression tests: re-parses that happen while a feature file has unsaved edits (the test
// tree's resolveHandler expanding the file, a forced full refresh) must parse the editor's
// text, not the file on disk - otherwise they silently revert the live parse and the
// unsaved steps lose their test items, step mappings and diagnostics.

import * as vscode from 'vscode';
import * as assert from 'assert';
import { TestSupport } from '../../../src/extension';

let testSupport: TestSupport;

function getWorkspaceUri(): vscode.Uri {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  assert.ok(workspaceFolders, 'workspace folders should exist');
  return workspaceFolders[0].uri;
}

async function ensureExtensionReady(): Promise<void> {
  const extension = vscode.extensions.getExtension('gabeseltzer.gs-behave-bdd');
  if (!extension) {
    throw new Error('Behave BDD extension not found');
  }
  testSupport = await extension.activate() as TestSupport;
  testSupport.config.integrationTestRun = true;
}

async function waitForCondition(condition: () => boolean, timeoutMs = 10000, checkIntervalMs = 100): Promise<void> {
  const startTime = Date.now();
  while (!condition()) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Timeout waiting for condition after ${timeoutMs}ms`);
    }
    await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
  }
}

// the feature file's own test item (found top-down, so before its scenario children)
function findFileItem(items: vscode.TestItemCollection, uri: vscode.Uri): vscode.TestItem | undefined {
  let found: vscode.TestItem | undefined;
  items.forEach(item => {
    if (found)
      return;
    if (item.uri?.toString() === uri.toString())
      found = item;
    else
      found = findFileItem(item.children, uri);
  });
  return found;
}

function scenarioLabels(featureUri: vscode.Uri): string[] {
  const fileItem = findFileItem(testSupport.ctrl.items, featureUri);
  const labels: string[] = [];
  fileItem?.children.forEach(child => labels.push(child.label));
  return labels;
}

suite('unsaved feature edits survive re-parses', () => {

  suiteSetup(async function () {
    this.timeout(60000);
    await ensureExtensionReady();
    await testSupport.parser.stepsParseComplete(20000, "unsavedFeatureEdits-suiteSetup");
  });

  test('tree expansion and a full refresh keep the unsaved scenario and its step mapping', async function () {
    this.timeout(60000);

    const featureUri = vscode.Uri.joinPath(getWorkspaceUri(), 'features', 'machine.feature');
    const document = await vscode.workspace.openTextDocument(featureUri);
    const editor = await vscode.window.showTextDocument(document);

    try {
      // an unsaved scenario whose step matches an existing definition
      const end = document.lineAt(document.lineCount - 1).range.end;
      await editor.edit(edit => edit.insert(end, '\n\n  Scenario: Unsaved scenario\n    Given the machine is ready\n'));
      const stepLine = [...Array(document.lineCount).keys()].reverse()
        .find(i => document.lineAt(i).text.includes('Given the machine is ready'));
      assert.ok(stepLine !== undefined);

      const isLive = () => scenarioLabels(featureUri).includes('Unsaved scenario') &&
        testSupport.getStepFileStepForFeatureFileStep(featureUri, stepLine) !== undefined;
      await waitForCondition(isLive, 15000);

      // expanding the file in the test tree re-parses it
      const fileItem = findFileItem(testSupport.ctrl.items, featureUri);
      assert.ok(fileItem, 'expected a test item for the feature file');
      await testSupport.ctrl.resolveHandler?.(fileItem);
      assert.ok(scenarioLabels(featureUri).includes('Unsaved scenario'),
        `resolveHandler dropped the unsaved scenario: ${scenarioLabels(featureUri).join(' | ')}`);

      // a forced full refresh re-parses every feature file
      await testSupport.configurationChangedHandler(undefined, undefined, true);
      await testSupport.parser.stepsParseComplete(20000, "unsavedFeatureEdits-refresh");
      await waitForCondition(isLive, 15000).catch(() => undefined);
      assert.ok(isLive(),
        `full refresh dropped the unsaved scenario or its mapping: ${scenarioLabels(featureUri).join(' | ')}`);
    }
    finally {
      await vscode.window.showTextDocument(document);
      await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    }
  });
});
