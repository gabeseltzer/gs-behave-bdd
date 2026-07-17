// Unit tests for step-load diagnostics: per-file load failures and
// missing-module (stubbed import) hints.
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { config } from '../../../src/configuration';
import * as commonModule from '../../../src/common';
import {
  setStepLoadDiagnostics, clearStepLoadDiagnostics,
  setMissingModuleHints, clearMissingModuleHints
} from '../../../src/handlers/stepLoadDiagnostics';
import type { FailedFileInfo } from '../../../src/parsers/behaveLoader';

suite('stepLoadDiagnostics', () => {
  let sandbox: sinon.SinonSandbox;
  let diagStore: Map<string, vscode.Diagnostic[]>;

  setup(() => {
    sandbox = sinon.createSandbox();
    diagStore = new Map();

    sandbox.stub(config.diagnostics, 'get').callsFake((uri: vscode.Uri) => {
      return diagStore.get(uri.toString()) || [];
    });
    sandbox.stub(config.diagnostics, 'set').callsFake(
      (uriOrEntries: unknown, diags?: unknown) => {
        if (uriOrEntries instanceof vscode.Uri) {
          diagStore.set(uriOrEntries.toString(), (diags as vscode.Diagnostic[]) || []);
        }
      }
    );
  });

  teardown(() => {
    clearStepLoadDiagnostics();
    clearMissingModuleHints();
    sandbox.restore();
  });

  suite('setStepLoadDiagnostics', () => {
    const syntaxFailure: FailedFileInfo = {
      filePath: '/proj/steps/broken.py', lineNumber: 3, column: 7,
      errorMessage: "'(' was never closed", kind: 'syntax'
    };

    test('creates a Warning diagnostic at the failing line (1-indexed to 0-indexed)', () => {
      setStepLoadDiagnostics([syntaxFailure]);

      const uri = vscode.Uri.file('/proj/steps/broken.py');
      const diags = diagStore.get(uri.toString()) || [];
      assert.strictEqual(diags.length, 1);
      assert.strictEqual(diags[0].severity, vscode.DiagnosticSeverity.Warning,
        'Warning, not Error - the language server already marks the code problem itself');
      assert.strictEqual(diags[0].code, 'step-load-failure');
      assert.strictEqual(diags[0].source, 'gs-behave-bdd');
      assert.strictEqual(diags[0].range.start.line, 2, 'line should be 0-indexed');
    });

    test('message states the step-discovery consequence, per kind', () => {
      const importFailure: FailedFileInfo = {
        filePath: '/proj/steps/imports.py', lineNumber: 2, column: 0,
        errorMessage: "ImportError: cannot import name 'gone'", kind: 'import'
      };
      setStepLoadDiagnostics([syntaxFailure, importFailure]);

      const syntaxDiag = (diagStore.get(vscode.Uri.file('/proj/steps/broken.py').toString()) || [])[0];
      assert.ok(syntaxDiag.message.includes("doesn't compile"), syntaxDiag.message);
      assert.ok(syntaxDiag.message.includes('last good definitions'), syntaxDiag.message);

      const importDiag = (diagStore.get(vscode.Uri.file('/proj/steps/imports.py').toString()) || [])[0];
      assert.ok(importDiag.message.includes('failed to import'), importDiag.message);
    });

    test('setting new diagnostics clears previous ones (fix-then-break another file)', () => {
      setStepLoadDiagnostics([syntaxFailure]);
      const otherFailure: FailedFileInfo = {
        filePath: '/proj/steps/other.py', lineNumber: 1, column: 0,
        errorMessage: 'RuntimeError: boom', kind: 'error'
      };
      setStepLoadDiagnostics([otherFailure]);

      const brokenDiags = diagStore.get(vscode.Uri.file('/proj/steps/broken.py').toString()) || [];
      assert.strictEqual(brokenDiags.length, 0, 'fixed file should have its diagnostic cleared');
      const otherDiags = diagStore.get(vscode.Uri.file('/proj/steps/other.py').toString()) || [];
      assert.strictEqual(otherDiags.length, 1);
    });

    test('preserves diagnostics from other sources on the same file', () => {
      const uri = vscode.Uri.file('/proj/steps/broken.py');
      const foreign = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), 'duplicate', vscode.DiagnosticSeverity.Error);
      foreign.code = 'duplicate-step-definition';
      diagStore.set(uri.toString(), [foreign]);

      setStepLoadDiagnostics([syntaxFailure]);
      clearStepLoadDiagnostics();

      const remaining = diagStore.get(uri.toString()) || [];
      assert.strictEqual(remaining.length, 1, 'foreign diagnostic should survive set+clear');
      assert.strictEqual(remaining[0].code, 'duplicate-step-definition');
    });
  });

  suite('setMissingModuleHints', () => {
    const fileUri = vscode.Uri.file('/proj/steps/plotting.py');
    const fileContent = [
      'from behave import then',                                  // line 0
      'import matplotlib',                                        // line 1
      'from matplotlib.pyplot import figure',                     // line 2
      'import os, missing_helper',                                // line 3
      '',
      '@then("I plot")',
      'def step_plot(context):',
      '    figure()',
    ].join('\n');

    let getContentStub: sinon.SinonStub;

    setup(() => {
      getContentStub = sandbox.stub(commonModule, 'getContentFromFilesystem').resolves(fileContent);
    });

    test('annotates import lines of stubbed modules with Information diagnostics', async () => {
      await setMissingModuleHints(['matplotlib', 'matplotlib.pyplot', 'missing_helper'], [fileUri]);

      const diags = diagStore.get(fileUri.toString()) || [];
      const lines = diags.map(d => d.range.start.line).sort((a, b) => a - b);
      assert.deepStrictEqual(lines, [1, 2, 3],
        `should annotate "import matplotlib", "from matplotlib.pyplot import", and "import os, missing_helper" (got lines ${lines})`);

      for (const d of diags) {
        assert.strictEqual(d.severity, vscode.DiagnosticSeverity.Information);
        assert.strictEqual(d.code, 'missing-module-hint');
        assert.ok(d.message.includes('is not installed'), d.message);
      }
    });

    test('does not annotate imports of installed modules', async () => {
      await setMissingModuleHints(['missing_helper'], [fileUri]);

      const diags = diagStore.get(fileUri.toString()) || [];
      assert.strictEqual(diags.length, 1);
      assert.strictEqual(diags[0].range.start.line, 3);
      assert.ok(diags[0].message.includes("'missing_helper'"));
      assert.ok(!diags[0].message.includes('behave'), 'behave import must not be flagged');
    });

    test('empty mocked list is a no-op (no file reads)', async () => {
      await setMissingModuleHints([], [fileUri]);
      assert.ok(getContentStub.notCalled, 'should not read files when nothing was mocked');
      assert.strictEqual((diagStore.get(fileUri.toString()) || []).length, 0);
    });

    test('clearMissingModuleHints removes only hint diagnostics', async () => {
      const foreign = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), 'load failure', vscode.DiagnosticSeverity.Warning);
      foreign.code = 'step-load-failure';
      diagStore.set(fileUri.toString(), [foreign]);

      await setMissingModuleHints(['matplotlib'], [fileUri]);
      clearMissingModuleHints();

      const remaining = diagStore.get(fileUri.toString()) || [];
      assert.strictEqual(remaining.length, 1);
      assert.strictEqual(remaining[0].code, 'step-load-failure');
    });
  });
});
