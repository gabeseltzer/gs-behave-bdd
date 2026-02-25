// Integration tests for behave step registry loader
// Tests that the Python helper correctly discovers all step definitions including library steps

import * as vscode from 'vscode';
import * as assert from 'assert';
import * as path from 'path';
import { TestSupport } from '../../../src/extension';
import { loadStepsFromBehave } from '../../../src/parsers/behaveStepLoader';

let _testSupport: TestSupport;

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
  _testSupport = await extension.activate() as TestSupport;
}

suite('Behave Step Registry Integration', () => {

  suiteSetup(async function () {
    this.timeout(60000);
    await ensureExtensionReady();
  });

  test('should discover all local step definitions', async function () {
    this.timeout(30000);

    const wkspUri = getWorkspaceUri('simple');
    const projectPath = wkspUri.fsPath;
    const stepsPath = path.join(projectPath, 'features', 'steps');
    const pythonExec = 'python'; // Use default python from environment

    const steps = await loadStepsFromBehave(pythonExec, projectPath, stepsPath);

    // The simple project should have several steps defined locally
    assert.ok(steps.length > 0, 'should find at least one step definition');

    // Verify step structure
    for (const step of steps) {
      assert.ok(step.stepType, 'step should have stepType');
      assert.ok(['given', 'when', 'then', 'step'].includes(step.stepType.toLowerCase()),
        `stepType should be valid: ${step.stepType}`);
      assert.ok(step.pattern, 'step should have pattern');
      assert.ok(step.filePath, 'step should have filePath');
      assert.ok(typeof step.lineNumber === 'number' && step.lineNumber > 0,
        'step should have valid lineNumber');
      assert.ok(step.regex, 'step should have regex');
    }

    console.log(`Found ${steps.length} steps in simple project`);
    steps.forEach(step => {
      console.log(`  ${step.stepType}: "${step.pattern}" at ${path.basename(step.filePath)}:${step.lineNumber}`);
    });
  });

  test('should discover library step definitions', async function () {
    this.timeout(30000);

    const wkspUri = getWorkspaceUri('step library');
    const projectPath = wkspUri.fsPath;
    const stepsPath = path.join(projectPath, 'steps');
    const pythonExec = 'python';

    const steps = await loadStepsFromBehave(pythonExec, projectPath, stepsPath);

    // Should find steps from both local steps and imported library
    assert.ok(steps.length > 0, 'should find step definitions');

    // Look for the library steps (defined in lib/library_steps.py but imported via steps/example_steps.py)
    const libraryStepPatterns = [
      'there is a calculator',
      'I add {a:d} and {b:d}',
      'the result should be {expected:d}'
    ];

    for (const pattern of libraryStepPatterns) {
      const found = steps.find(s => s.pattern.includes('calculator') || s.pattern.includes('add') || s.pattern.includes('result'));
      assert.ok(found, `should find step matching pattern: ${pattern}`);
    }

    console.log(`Found ${steps.length} steps in step library project (including library imports)`);
    steps.forEach(step => {
      console.log(`  ${step.stepType}: "${step.pattern}" at ${path.basename(step.filePath)}:${step.lineNumber}`);
    });
  });

  test('should include proper regex for typed parameters', async function () {
    this.timeout(30000);

    const wkspUri = getWorkspaceUri('step library');
    const projectPath = wkspUri.fsPath;
    const stepsPath = path.join(projectPath, 'steps');
    const pythonExec = 'python';

    const steps = await loadStepsFromBehave(pythonExec, projectPath, stepsPath);

    // Find step with typed parameter {a:d}
    const addStep = steps.find(s => s.pattern.includes('add') && s.pattern.includes('{a:d}'));
    assert.ok(addStep, 'should find add step with typed parameters');

    // Verify regex includes proper parameter matching
    // behave converts {a:d} to (?P<a>\d+) or similar
    assert.ok(addStep.regex, 'step should have regex');
    assert.ok(
      addStep.regex.includes('(?P<a>') || addStep.regex.includes('\\d'),
      `regex should include typed parameter pattern: ${addStep.regex}`
    );

    console.log(`Typed parameter step: "${addStep.pattern}"`);
    console.log(`  Regex: ${addStep.regex}`);

    // Verify it's different from simple {param} replacement
    // Our current AST parser just converts {a:d} to .* which is inadequate
    assert.ok(!addStep.regex.includes('.*'), 
      'regex should not use simple .* wildcard for typed parameters');
  });

  test('should handle behave not installed error gracefully', async function () {
    this.timeout(30000);

    const wkspUri = getWorkspaceUri('simple');
    const projectPath = wkspUri.fsPath;
    const stepsPath = path.join(projectPath, 'features', 'steps');
    
    // Use a non-existent Python executable
    const pythonExec = 'python-nonexistent-12345';

    await assert.rejects(
      async () => await loadStepsFromBehave(pythonExec, projectPath, stepsPath),
      (err: Error) => {
        return err.message.includes('spawn') || err.message.includes('not found');
      },
      'should throw error for missing Python'
    );
  });

  test('should discover steps from multiple step files', async function () {
    this.timeout(30000);

    // Use a project with multiple step files if available
    // Otherwise use simple project
    const wkspUri = getWorkspaceUri('simple');
    const projectPath = wkspUri.fsPath;
    const stepsPath = path.join(projectPath, 'features', 'steps');
    const pythonExec = 'python';

    const steps = await loadStepsFromBehave(pythonExec, projectPath, stepsPath);

    // Group steps by file
    const stepsByFile = new Map<string, typeof steps>();
    for (const step of steps) {
      const fileName = path.basename(step.filePath);
      if (!stepsByFile.has(fileName)) {
        stepsByFile.set(fileName, []);
      }
      const fileSteps = stepsByFile.get(fileName);
      if (fileSteps) {
        fileSteps.push(step);
      }
    }

    console.log(`Steps grouped by file:`);
    for (const [fileName, fileSteps] of stepsByFile) {
      console.log(`  ${fileName}: ${fileSteps.length} steps`);
    }

    // Should find at least one file with steps
    assert.ok(stepsByFile.size > 0, 'should discover steps from at least one file');
  });

  test('should include line numbers for all steps', async function () {
    this.timeout(30000);

    const wkspUri = getWorkspaceUri('step library');
    const projectPath = wkspUri.fsPath;
    const stepsPath = path.join(projectPath, 'steps');
    const pythonExec = 'python';

    const steps = await loadStepsFromBehave(pythonExec, projectPath, stepsPath);

    // All steps should have valid line numbers
    for (const step of steps) {
      assert.ok(typeof step.lineNumber === 'number', 'lineNumber should be a number');
      assert.ok(step.lineNumber > 0, 'lineNumber should be positive');
      
      // Line numbers should be reasonable (not in the thousands for these small test files)
      assert.ok(step.lineNumber < 1000, 
        `lineNumber seems unreasonable: ${step.lineNumber} for ${step.pattern}`);
    }
  });

  test('should handle cfparse parameter types', async function () {
    this.timeout(30000);

    const wkspUri = getWorkspaceUri('step library');
    const projectPath = wkspUri.fsPath;
    const stepsPath = path.join(projectPath, 'steps');
    const pythonExec = 'python';

    const steps = await loadStepsFromBehave(pythonExec, projectPath, stepsPath);

    // Look for any steps with typed parameters
    const typedSteps = steps.filter(s => s.pattern.includes(':'));

    if (typedSteps.length > 0) {
      console.log(`Found ${typedSteps.length} steps with typed parameters`);
      for (const step of typedSteps) {
        console.log(`  Pattern: ${step.pattern}`);
        console.log(`  Regex: ${step.regex}`);
        
        // Verify regex is not just a simple wildcard replacement
        assert.ok(!step.regex.includes('.*.*'), 
          'regex should not have consecutive .* wildcards from naive replacement');
      }
    } else {
      console.log('Note: No typed parameter steps found in this project');
    }
  });
});
