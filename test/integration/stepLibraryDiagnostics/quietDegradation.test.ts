// Integration tests for quiet degradation of step discovery:
// - a syntax-broken step file keeps its cached definitions (per-file isolation)
// - a brand-new broken file doesn't disturb existing definitions
// - a missing third-party import is stubbed and hinted, not fatal
// Runs in the "step library" example workspace.

import * as vscode from 'vscode';
import * as assert from 'assert';
import { TestSupport } from '../../../src/extension';

let testSupport: TestSupport;

function getWorkspaceUri(wkspName: string): vscode.Uri {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  assert.ok(workspaceFolders, 'workspace folders should exist');
  const wkspFolder = workspaceFolders.find(folder => folder.uri.path.includes(wkspName));
  assert.ok(wkspFolder, `workspace folder "${wkspName}" should exist`);
  return wkspFolder.uri;
}

async function ensureExtensionReady(): Promise<void> {
  const extension = vscode.extensions.getExtension('gabeseltzer.gs-behave-bdd');
  if (!extension) {
    throw new Error('Behave BDD extension not found');
  }
  testSupport = await extension.activate() as TestSupport;
  testSupport.config.integrationTestRun = true;
}

function getDiagnosticsForUri(uri: vscode.Uri): vscode.Diagnostic[] {
  const diags = testSupport.config.diagnostics.get(uri);
  return diags ? Array.from(diags) : [];
}

async function settleAndParse(wkspUri: vscode.Uri, caller: string) {
  // Let watcher-triggered debounces settle, then force a deterministic reparse
  await new Promise(resolve => setTimeout(resolve, 2000));
  const counts = await testSupport.parser.parseFilesForWorkspace(
    wkspUri, testSupport.testData, testSupport.ctrl, caller, false
  );
  assert.ok(counts, `${caller}: parse should return counts`);
  return counts;
}

suite('Quiet degradation of step discovery', () => {
  const projectName = 'step library';

  suiteSetup(async function () {
    this.timeout(60000);
    await ensureExtensionReady();
  });

  test('a syntax-broken step file keeps its cached step definitions', async function () {
    this.timeout(90000);

    const wkspUri = getWorkspaceUri(projectName);
    const stepsUri = vscode.Uri.joinPath(wkspUri, 'steps', 'example_steps.py');

    const initialCounts = await settleAndParse(wkspUri, 'quiet-baseline');
    assert.ok(initialCounts.stepFileStepsExceptCommentedOut > 0, 'baseline should have step definitions');
    assert.ok(initialCounts.stepMappings > 0, 'baseline should have step mappings');

    const originalContent = await vscode.workspace.fs.readFile(stepsUri);

    try {
      // Break the file: valid content followed by an unclosed def (WIP-save shape)
      const brokenContent = Buffer.concat([
        Buffer.from(originalContent),
        Buffer.from('\n\ndef broken_wip_function(:\n', 'utf8'),
      ]);
      await vscode.workspace.fs.writeFile(stepsUri, brokenContent);

      const brokenCounts = await settleAndParse(wkspUri, 'quiet-broken');

      // Per-file isolation + cache merge: the broken file's previous definitions survive
      assert.strictEqual(
        brokenCounts.stepFileStepsExceptCommentedOut, initialCounts.stepFileStepsExceptCommentedOut,
        'step definitions must be retained from cache while the file is broken'
      );
      assert.strictEqual(
        brokenCounts.stepMappings, initialCounts.stepMappings,
        'step mappings must be unchanged while the file is broken'
      );

      // The consequence is stated in the Problems pane, on the broken file
      const stepFileDiags = getDiagnosticsForUri(stepsUri);
      const loadFailure = stepFileDiags.find(d => d.code === 'step-load-failure');
      assert.ok(loadFailure,
        `broken file should carry a step-load-failure diagnostic (got codes: ${stepFileDiags.map(d => d.code).join(', ')})`);
      assert.strictEqual(loadFailure!.severity, vscode.DiagnosticSeverity.Warning);
    } finally {
      await vscode.workspace.fs.writeFile(stepsUri, originalContent);
    }

    const restoredCounts = await settleAndParse(wkspUri, 'quiet-restored');
    assert.strictEqual(restoredCounts.stepMappings, initialCounts.stepMappings,
      'restoring the file should return to baseline mappings');

    const clearedDiags = getDiagnosticsForUri(stepsUri).filter(d => d.code === 'step-load-failure');
    assert.strictEqual(clearedDiags.length, 0, 'step-load-failure diagnostic should clear after the fix');
  });

  test('a new broken file does not disturb existing step definitions', async function () {
    this.timeout(90000);

    const wkspUri = getWorkspaceUri(projectName);
    const newBrokenUri = vscode.Uri.joinPath(wkspUri, 'steps', 'zz_wip_broken.py');

    const initialCounts = await settleAndParse(wkspUri, 'newfile-baseline');

    try {
      await vscode.workspace.fs.writeFile(newBrokenUri, Buffer.from([
        'from behave import given',
        '',
        '@given("a half-typed step"',   // unclosed paren, line 3
        'def step_wip(context):',
        '    pass',
      ].join('\n'), 'utf8'));

      const brokenCounts = await settleAndParse(wkspUri, 'newfile-broken');

      assert.strictEqual(brokenCounts.stepMappings, initialCounts.stepMappings,
        'existing mappings must be untouched by an unrelated broken file');

      const diags = getDiagnosticsForUri(newBrokenUri);
      const loadFailure = diags.find(d => d.code === 'step-load-failure');
      assert.ok(loadFailure, 'the new broken file should carry a step-load-failure diagnostic');
      assert.strictEqual(loadFailure!.range.start.line, 2, 'diagnostic should sit on the broken line (0-indexed)');
    } finally {
      try { await vscode.workspace.fs.delete(newBrokenUri); } catch { /* already gone */ }
    }

    const restoredCounts = await settleAndParse(wkspUri, 'newfile-cleanup');
    assert.strictEqual(restoredCounts.stepMappings, initialCounts.stepMappings,
      'cleanup should return to baseline');
  });

  test('a missing third-party import is stubbed: steps load, import line gets a hint', async function () {
    this.timeout(90000);

    const wkspUri = getWorkspaceUri(projectName);
    const stubbedUri = vscode.Uri.joinPath(wkspUri, 'steps', 'zz_stubbed_import.py');

    const initialCounts = await settleAndParse(wkspUri, 'stub-baseline');

    try {
      await vscode.workspace.fs.writeFile(stubbedUri, Buffer.from([
        'from behave import given',
        'import not_a_real_module_xyz123',   // line 2 (1-indexed)
        '',
        '@given("a stub-guarded step")',
        'def step_stubbed(context):',
        '    not_a_real_module_xyz123.do_something()',
      ].join('\n'), 'utf8'));

      const stubbedCounts = await settleAndParse(wkspUri, 'stub-added');

      assert.strictEqual(
        stubbedCounts.stepFileStepsExceptCommentedOut, initialCounts.stepFileStepsExceptCommentedOut + 1,
        'the step must register even though its import is not installed'
      );

      const diags = getDiagnosticsForUri(stubbedUri);
      const hint = diags.find(d => d.code === 'missing-module-hint');
      assert.ok(hint,
        `import line should carry a missing-module hint (got codes: ${diags.map(d => d.code).join(', ')})`);
      assert.strictEqual(hint!.severity, vscode.DiagnosticSeverity.Information);
      assert.strictEqual(hint!.range.start.line, 1, 'hint should sit on the import line (0-indexed)');
      assert.ok(hint!.message.includes('not_a_real_module_xyz123'), hint!.message);
    } finally {
      try { await vscode.workspace.fs.delete(stubbedUri); } catch { /* already gone */ }
    }

    const cleanupCounts = await settleAndParse(wkspUri, 'stub-cleanup');
    assert.strictEqual(cleanupCounts.stepFileStepsExceptCommentedOut, initialCounts.stepFileStepsExceptCommentedOut,
      'cleanup should return to baseline');
  });
});
