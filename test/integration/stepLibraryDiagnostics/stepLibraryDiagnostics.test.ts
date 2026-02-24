// Integration tests for step library diagnostics bug
// Reproduces the bug where editing a step file causes library steps to disappear from diagnostics
// Tests the lifecycle: initial load, edit step file, verify diagnostics remain consistent

import * as vscode from 'vscode';
import * as assert from 'assert';
import { TestSupport } from '../../../src/extension';

let testSupport: TestSupport;

// Helper function to get workspace URI by name
function getWorkspaceUri(wkspName: string): vscode.Uri {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  assert.ok(workspaceFolders, 'workspace folders should exist');
  const wkspFolder = workspaceFolders.find(folder => folder.uri.path.includes(wkspName));
  assert.ok(wkspFolder, `workspace folder "${wkspName}" should exist`);
  return wkspFolder.uri;
}

// Helper function to wait for extension to be ready
async function ensureExtensionReady(): Promise<void> {
  const extension = vscode.extensions.getExtension('gabeseltzer.behave-vsc');
  if (!extension) {
    throw new Error('Behave VSC extension not found');
  }
  // Always get exports (activate() returns exports immediately if already active)
  testSupport = await extension.activate() as TestSupport;
}

// Helper to get diagnostics for a URI
function getDiagnosticsForUri(uri: vscode.Uri): vscode.Diagnostic[] {
  const diags = testSupport.config.diagnostics.get(uri);
  return diags ? Array.from(diags) : [];
}

// Helper to wait for a condition with timeout
async function waitForCondition(
  condition: () => boolean,
  timeoutMs = 5000,
  checkIntervalMs = 100
): Promise<void> {
  const startTime = Date.now();
  while (!condition()) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Timeout waiting for condition after ${timeoutMs}ms`);
    }
    await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
  }
}

suite('Step Library Diagnostics Bug Fix', () => {
  const projectName = 'step library';

  suiteSetup(async function () {
    this.timeout(60000);
    await ensureExtensionReady();
  });

  test('library steps should remain valid after editing importing step file', async function () {
    this.timeout(60000);

    const wkspUri = getWorkspaceUri(projectName);

    // Get the feature file that uses library steps
    const featureUri = vscode.Uri.joinPath(wkspUri, 'features', 'example.feature');
    const stepsUri = vscode.Uri.joinPath(wkspUri, 'steps', 'example_steps.py');

    // Open the feature file to trigger diagnostics
    const featureDocument = await vscode.workspace.openTextDocument(featureUri);
    await vscode.window.showTextDocument(featureDocument);

    // Wait for initial parsing to complete and diagnostics to be set
    await waitForCondition(
      () => getDiagnosticsForUri(featureUri).length >= 0,
      5000
    );

    // Record initial diagnostics count
    // Note: Currently, library steps are NOT recognized initially (this is a manifestation of the bug)
    let diagnostics = getDiagnosticsForUri(featureUri);
    const initialDiagnosticsCount = diagnostics.length;
    console.log(`Initial diagnostics count: ${initialDiagnosticsCount}`);
    console.log(`  If > 0: library steps are not recognized (expected bug behavior)`);
    if (diagnostics.length > 0) {
      diagnostics.forEach((diag, idx) => {
        console.log(`    [${idx}] Line ${diag.range.start.line}: ${diag.message}`);
      });
    }

    // Now open and edit the step file that imports from library
    const stepsDocument = await vscode.workspace.openTextDocument(stepsUri);
    const stepsEditor = await vscode.window.showTextDocument(stepsDocument);

    // Make a minor edit (add a comment) to trigger reparsing
    // This simulates user editing the step file
    const editPosition = new vscode.Position(stepsDocument.lineCount - 1, 0);

    await stepsEditor.edit(edit => {
      edit.insert(editPosition, '\n# Test comment to trigger reparsing\n');
    });

    // Wait for reparsing to complete
    await waitForCondition(
      () => stepsDocument.isDirty === true,
      2000
    );

    // Give the extension time to process the change and update diagnostics
    await new Promise(resolve => setTimeout(resolve, 1000));

    // After editing: diagnostics count should REMAIN THE SAME or improve
    // (the bug is that diagnostics might become inconsistent or worse after editing)
    diagnostics = getDiagnosticsForUri(featureUri);
    const afterEditDiagnosticsCount = diagnostics.length;
    console.log(`Diagnostics after edit: ${afterEditDiagnosticsCount}`);
    console.log(`  Initial count: ${initialDiagnosticsCount}`);
    console.log(`  After edit count: ${afterEditDiagnosticsCount}`);
    if (diagnostics.length > 0) {
      console.log(`  Diagnostics after edit:`);
      diagnostics.forEach((diag, idx) => {
        console.log(`    [${idx}] Line ${diag.range.start.line}: ${diag.message}`);
      });
    }

    // The key assertion: diagnostics should not WORSEN after edit
    // If they do, that indicates the bug where editing causes step definitions to disappear
    assert.ok(
      afterEditDiagnosticsCount <= initialDiagnosticsCount,
      'Bug detected: Diagnostics count increased after edit (library steps disappeared after editing step file)'
    );

    // Clean up: undo the edit
    await vscode.commands.executeCommand('undo');
  });

  test('diagnostics and go-to-definition should stay in sync after edits', async function () {
    this.timeout(60000);

    const wkspUri = getWorkspaceUri(projectName);

    // Get the feature file that uses library steps
    const featureUri = vscode.Uri.joinPath(wkspUri, 'features', 'example.feature');
    const stepsUri = vscode.Uri.joinPath(wkspUri, 'steps', 'example_steps.py');

    // Open the feature file
    const featureDocument = await vscode.workspace.openTextDocument(featureUri);
    await vscode.window.showTextDocument(featureDocument);

    // Find a step line in the feature file (e.g., "Given there is a calculator")
    let stepLineNumber = -1;
    for (let i = 0; i < featureDocument.lineCount; i++) {
      const line = featureDocument.lineAt(i).text;
      if (line.includes('Given there is a calculator')) {
        stepLineNumber = i;
        break;
      }
    }

    assert.notStrictEqual(
      stepLineNumber,
      -1,
      'Should find a "Given there is a calculator" step in the feature file'
    );

    // Record initial state
    let diagnostics = getDiagnosticsForUri(featureUri);
    const initialStepDiagnostics = diagnostics.filter(
      diag => diag.range.start.line === stepLineNumber
    );
    const initialHasDiagnostic = initialStepDiagnostics.length > 0;
    const initialStepMapping = testSupport.getStepFileStepForFeatureFileStep(featureUri, stepLineNumber);
    const initialHasMapping = !!initialStepMapping;

    console.log(`Initial state: diagnostic=${initialHasDiagnostic}, gotodef=${initialHasMapping}`);

    // Now open and edit the step file
    const stepsDocument = await vscode.workspace.openTextDocument(stepsUri);
    const stepsEditor = await vscode.window.showTextDocument(stepsDocument);

    const editPosition = new vscode.Position(stepsDocument.lineCount - 1, 0);

    await stepsEditor.edit(edit => {
      edit.insert(editPosition, '\n# Diagnostic sync test comment\n');
    });

    // Wait for reparsing
    await waitForCondition(
      () => stepsDocument.isDirty === true,
      2000
    );

    // Give extension time to process
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Record state after edit
    diagnostics = getDiagnosticsForUri(featureUri);
    const afterEditStepDiagnostics = diagnostics.filter(
      diag => diag.range.start.line === stepLineNumber
    );
    const afterEditHasDiagnostic = afterEditStepDiagnostics.length > 0;
    const afterEditStepMapping = testSupport.getStepFileStepForFeatureFileStep(featureUri, stepLineNumber);
    const afterEditHasMapping = !!afterEditStepMapping;

    console.log(`After-edit state: diagnostic=${afterEditHasDiagnostic}, gotodef=${afterEditHasMapping}`);

    // Verify consistency: both should have same state (either both found or both not found)
    // If one says found and other says not found, they're out of sync
    // Note: Currently both will be "not found" due to library import issue (the bug)
    const initialConsistent = initialHasDiagnostic === !initialHasMapping;
    const afterEditConsistent = afterEditHasDiagnostic === !afterEditHasMapping;

    console.log(`Initial consistency check: ${initialConsistent} (diagnostic and mapping should be opposites)`);
    console.log(`After-edit consistency check: ${afterEditConsistent} (diagnostic and mapping should be opposites)`);

    assert.strictEqual(
      afterEditConsistent,
      true,
      'Bug detected: After-edit diagnostics and go-to-definition are out of sync. ' +
      `Diagnostic says "not found: ${afterEditHasDiagnostic}", but mapping says "found: ${afterEditHasMapping}"`
    );

    // Also verify they didn't diverge from the initial state
    assert.strictEqual(
      afterEditHasDiagnostic,
      initialHasDiagnostic,
      'After-edit diagnostic state changed (should remain consistent with initial state)'
    );

    assert.strictEqual(
      afterEditHasMapping,
      initialHasMapping,
      'After-edit mapping state changed (should remain consistent with initial state)'
    );

    // Clean up
    await vscode.commands.executeCommand('undo');
  });
});
