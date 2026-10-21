// Integration tests for the feature-file "create step definition" quick-fix: the lightbulb
// is offered on an undefined step, applying it leaves the stub unsaved in the target file
// (an existing steps file, or a new one), and once saved the stub really matches the step.
// Step definitions are loaded from disk, so the step only resolves after the save.

import * as vscode from 'vscode';
import * as assert from 'assert';
import { TestSupport } from '../../../src/extension';

const CREATE_STEP_DEFINITION_COMMAND = 'gs-behave-bdd.createStepDefinition';
const UNDEFINED_STEP = 'And the widget is calibrated';

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

function hasStepNotFound(uri: vscode.Uri, line: number): boolean {
  const diags = testSupport.config.diagnostics.get(uri) ?? [];
  return diags.some(d => d.code === 'step-not-found' && d.range.start.line === line);
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

// writes UNDEFINED_STEP to disk after the feature's last step, opens the feature and waits
// for the step's Warning; returns the step's line
async function addUndefinedStep(featureUri: vscode.Uri, originalContent: string): Promise<number> {
  const lines = originalContent.split(/\r?\n/);
  const lastStepLine = [...lines.keys()].reverse().find(i => /^\s*(Given|When|Then|And|But)\s/.test(lines[i]));
  assert.ok(lastStepLine !== undefined, 'expected a step in the feature file');
  lines.splice(lastStepLine + 1, 0, `    ${UNDEFINED_STEP}`);
  await vscode.workspace.fs.writeFile(featureUri, Buffer.from(lines.join('\n')));

  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(featureUri));
  const line = lastStepLine + 1;
  await waitForCondition(() => hasStepNotFound(featureUri, line), 15000);
  return line;
}

// go-to-definition on the step lands in the target file (i.e. the generated stub matches)
async function assertStepResolvesTo(featureUri: vscode.Uri, line: number, targetUri: vscode.Uri) {
  const document = await vscode.workspace.openTextDocument(featureUri);
  const position = new vscode.Position(line, document.lineAt(line).text.indexOf('widget'));
  let uris: string[] = [];
  for (let i = 0; i < 30; i++) {
    const locations = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
      'vscode.executeDefinitionProvider', featureUri, position) ?? [];
    uris = locations.map(l => ('targetUri' in l ? l.targetUri : l.uri).toString());
    if (uris.includes(targetUri.toString()))
      return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.fail(`expected a definition in ${targetUri.toString()}, got: ${uris.join(' | ')}`);
}

// reverts every dirty editor first, so closing them can never block on a save prompt
async function revertAllAndClose() {
  for (const document of vscode.workspace.textDocuments.filter(d => d.isDirty)) {
    await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand('workbench.action.files.revert');
  }
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

async function readText(uri: vscode.Uri): Promise<string> {
  return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
}

suite('create step definition quick-fix', () => {
  let featureUri: vscode.Uri;
  let originalFeature: string;

  suiteSetup(async function () {
    this.timeout(60000);
    await ensureExtensionReady();
    await testSupport.parser.stepsParseComplete(20000, "createStepDefinition-suiteSetup");
    featureUri = vscode.Uri.joinPath(getWorkspaceUri(), 'features', 'machine.feature');
    originalFeature = await readText(featureUri);
  });

  teardown(async () => {
    await revertAllAndClose();
    await vscode.workspace.fs.writeFile(featureUri, Buffer.from(originalFeature));
  });

  test('offers a preferred fix plus a picker; the stub is left unsaved and matches once saved', async function () {
    this.timeout(60000);

    const stepsUri = vscode.Uri.joinPath(getWorkspaceUri(), 'features', 'steps', 'steps.py');
    const originalSteps = await readText(stepsUri);

    try {
      const line = await addUndefinedStep(featureUri, originalFeature);
      const featureDoc = await vscode.workspace.openTextDocument(featureUri);
      const lineText = featureDoc.lineAt(line).text;
      const range = new vscode.Range(line, lineText.indexOf('And'), line, lineText.length);

      const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
        'vscode.executeCodeActionProvider', featureUri, range);
      const titles = actions?.map(a => a.title) ?? [];
      const preferred = actions?.find(a => a.title.startsWith('Create step definition in ') && a.isPreferred);
      assert.ok(preferred?.command, `expected a preferred create-step quick-fix, got: ${titles.join(' | ')}`);
      assert.ok(titles.includes('Create step definition in…'), `expected the picker quick-fix, got: ${titles.join(' | ')}`);

      const targetUri = preferred.command.arguments?.[2] as vscode.Uri;
      assert.strictEqual(targetUri.toString(), stepsUri.toString(), 'steps.py holds this feature\'s other steps');
      await vscode.commands.executeCommand(preferred.command.command, ...(preferred.command.arguments ?? []));

      // the stub lands unsaved in the target, with the resolved (Then) step type
      const targetDoc = await vscode.workspace.openTextDocument(targetUri);
      assert.ok(targetDoc.isDirty, 'the steps file should be left unsaved');
      assert.ok(targetDoc.getText().includes('@then("the widget is calibrated")'), targetDoc.getText());

      await targetDoc.save();
      await assertStepResolvesTo(featureUri, line, targetUri);
      await waitForCondition(() => !hasStepNotFound(featureUri, line), 15000);
    }
    finally {
      await revertAllAndClose();
      await vscode.workspace.fs.writeFile(stepsUri, Buffer.from(originalSteps));
    }
  });

  test('a new steps file is created unsaved and its stub matches once saved', async function () {
    this.timeout(60000);

    const newUri = vscode.Uri.joinPath(getWorkspaceUri(), 'features', 'steps', 'quickfix_new_steps.py');

    try {
      const line = await addUndefinedStep(featureUri, originalFeature);

      await vscode.commands.executeCommand(CREATE_STEP_DEFINITION_COMMAND, featureUri, line, newUri, true);

      const newDoc = await vscode.workspace.openTextDocument(newUri);
      assert.ok(newDoc.isDirty, 'the new steps file should be left unsaved');
      assert.strictEqual(newDoc.lineAt(0).text, 'from behave import given, when, then');
      assert.ok(newDoc.getText().includes('@then("the widget is calibrated")'), newDoc.getText());

      await newDoc.save();
      await assertStepResolvesTo(featureUri, line, newUri);
    }
    finally {
      await revertAllAndClose();
      await vscode.workspace.fs.delete(newUri).then(undefined, () => undefined);
    }
  });
});
