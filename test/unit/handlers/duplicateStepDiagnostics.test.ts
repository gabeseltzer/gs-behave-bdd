// Unit tests for duplicate step definition diagnostics
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { config } from '../../../src/configuration';
import { setDuplicateStepDiagnostics, clearDuplicateStepDiagnostics } from '../../../src/handlers/duplicateStepDiagnostics';
import type { DuplicateStepInfo } from '../../../src/parsers/behaveLoader';

suite('duplicateStepDiagnostics', () => {
  let sandbox: sinon.SinonSandbox;
  // Track all diagnostics set by the handler, keyed by URI string
  let diagStore: Map<string, vscode.Diagnostic[]>;
  let setStub: sinon.SinonStub;

  setup(() => {
    sandbox = sinon.createSandbox();
    diagStore = new Map();

    sandbox.stub(config.diagnostics, 'get').callsFake((uri: vscode.Uri) => {
      return diagStore.get(uri.toString()) || [];
    });
    setStub = sandbox.stub(config.diagnostics, 'set').callsFake(
      (uriOrEntries: unknown, diags?: unknown) => {
        if (uriOrEntries instanceof vscode.Uri) {
          diagStore.set(uriOrEntries.toString(), (diags as vscode.Diagnostic[]) || []);
        }
      }
    );
  });

  teardown(() => {
    // Clear internal tracking state between tests
    clearDuplicateStepDiagnostics();
    sandbox.restore();
  });

  suite('setDuplicateStepDiagnostics', () => {
    test('creates error diagnostics for duplicate step definitions', () => {
      const duplicates: DuplicateStepInfo[] = [
        { stepType: 'given', pattern: 'a calculator', filePath: '/proj/steps/calc.py', lineNumber: 5 },
        { stepType: 'given', pattern: 'a calculator', filePath: '/proj/steps/calc_copy.py', lineNumber: 12 },
      ];

      setDuplicateStepDiagnostics(duplicates);

      // Should set diagnostics on both files
      const calcUri = vscode.Uri.file('/proj/steps/calc.py');
      const calcCopyUri = vscode.Uri.file('/proj/steps/calc_copy.py');
      const calcDiags = diagStore.get(calcUri.toString()) || [];
      const calcCopyDiags = diagStore.get(calcCopyUri.toString()) || [];

      assert.strictEqual(calcDiags.length, 1, 'calc.py should have 1 diagnostic');
      assert.strictEqual(calcCopyDiags.length, 1, 'calc_copy.py should have 1 diagnostic');
    });

    test('diagnostic has correct severity, code, and source', () => {
      const duplicates: DuplicateStepInfo[] = [
        { stepType: 'given', pattern: 'a step', filePath: '/proj/steps/a.py', lineNumber: 3 },
        { stepType: 'given', pattern: 'a step', filePath: '/proj/steps/b.py', lineNumber: 7 },
      ];

      setDuplicateStepDiagnostics(duplicates);

      const uri = vscode.Uri.file('/proj/steps/a.py');
      const diags = diagStore.get(uri.toString()) || [];
      assert.strictEqual(diags[0].severity, vscode.DiagnosticSeverity.Error);
      assert.strictEqual(diags[0].code, 'duplicate-step-definition');
      assert.strictEqual(diags[0].source, 'behave-vsc-gs');
    });

    test('diagnostic message includes step type and pattern', () => {
      const duplicates: DuplicateStepInfo[] = [
        { stepType: 'when', pattern: 'I press add', filePath: '/proj/steps/a.py', lineNumber: 3 },
        { stepType: 'when', pattern: 'I press add', filePath: '/proj/steps/b.py', lineNumber: 7 },
      ];

      setDuplicateStepDiagnostics(duplicates);

      const uri = vscode.Uri.file('/proj/steps/a.py');
      const diags = diagStore.get(uri.toString()) || [];
      assert.ok(diags[0].message.includes('@when'), 'message should include step type');
      assert.ok(diags[0].message.includes('I press add'), 'message should include pattern');
    });

    test('diagnostic line number is converted from 1-indexed to 0-indexed', () => {
      const duplicates: DuplicateStepInfo[] = [
        { stepType: 'given', pattern: 'a step', filePath: '/proj/steps/a.py', lineNumber: 5 },
        { stepType: 'given', pattern: 'a step', filePath: '/proj/steps/b.py', lineNumber: 10 },
      ];

      setDuplicateStepDiagnostics(duplicates);

      const uri = vscode.Uri.file('/proj/steps/a.py');
      const diags = diagStore.get(uri.toString()) || [];
      assert.strictEqual(diags[0].range.start.line, 4, 'line 5 should become 0-indexed line 4');
    });

    test('relatedInformation points to the other duplicate location(s)', () => {
      const duplicates: DuplicateStepInfo[] = [
        { stepType: 'given', pattern: 'a step', filePath: '/proj/steps/a.py', lineNumber: 5 },
        { stepType: 'given', pattern: 'a step', filePath: '/proj/steps/b.py', lineNumber: 10 },
      ];

      setDuplicateStepDiagnostics(duplicates);

      const uriA = vscode.Uri.file('/proj/steps/a.py');
      const diagsA = diagStore.get(uriA.toString()) || [];
      assert.strictEqual(diagsA[0].relatedInformation?.length, 1, 'should have 1 related info');
      assert.ok(diagsA[0].relatedInformation?.[0].message.includes('Also defined here'));
      // The related info for a.py's diagnostic should point to b.py
      assert.strictEqual(
        diagsA[0].relatedInformation?.[0].location.uri.fsPath,
        vscode.Uri.file('/proj/steps/b.py').fsPath
      );
    });

    test('handles multiple duplicate groups', () => {
      const duplicates: DuplicateStepInfo[] = [
        { stepType: 'given', pattern: 'pattern A', filePath: '/proj/steps/a.py', lineNumber: 1 },
        { stepType: 'given', pattern: 'pattern A', filePath: '/proj/steps/b.py', lineNumber: 2 },
        { stepType: 'when', pattern: 'pattern B', filePath: '/proj/steps/a.py', lineNumber: 10 },
        { stepType: 'when', pattern: 'pattern B', filePath: '/proj/steps/c.py', lineNumber: 5 },
      ];

      setDuplicateStepDiagnostics(duplicates);

      const uriA = vscode.Uri.file('/proj/steps/a.py');
      const diagsA = diagStore.get(uriA.toString()) || [];
      assert.strictEqual(diagsA.length, 2, 'a.py should have 2 diagnostics (one per duplicate group)');
    });

    test('handles three-way duplicates (same pattern in 3 files)', () => {
      const duplicates: DuplicateStepInfo[] = [
        { stepType: 'given', pattern: 'a step', filePath: '/proj/steps/a.py', lineNumber: 1 },
        { stepType: 'given', pattern: 'a step', filePath: '/proj/steps/b.py', lineNumber: 2 },
        { stepType: 'given', pattern: 'a step', filePath: '/proj/steps/c.py', lineNumber: 3 },
      ];

      setDuplicateStepDiagnostics(duplicates);

      const uriA = vscode.Uri.file('/proj/steps/a.py');
      const diagsA = diagStore.get(uriA.toString()) || [];
      assert.strictEqual(diagsA[0].relatedInformation?.length, 2,
        'a.py diagnostic should point to both b.py and c.py');
    });

    test('preserves existing non-duplicate diagnostics on the same file', () => {
      const existingDiag = new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 10),
        'some other warning',
        vscode.DiagnosticSeverity.Warning
      );
      existingDiag.code = 'other-code';

      const uri = vscode.Uri.file('/proj/steps/a.py');
      diagStore.set(uri.toString(), [existingDiag]);

      const duplicates: DuplicateStepInfo[] = [
        { stepType: 'given', pattern: 'a step', filePath: '/proj/steps/a.py', lineNumber: 5 },
        { stepType: 'given', pattern: 'a step', filePath: '/proj/steps/b.py', lineNumber: 10 },
      ];

      setDuplicateStepDiagnostics(duplicates);

      const diags = diagStore.get(uri.toString()) || [];
      assert.strictEqual(diags.length, 2, 'should have both existing + duplicate diagnostic');
      assert.ok(diags.some(d => d.code === 'other-code'), 'existing diagnostic should be preserved');
      assert.ok(diags.some(d => d.code === 'duplicate-step-definition'), 'duplicate diagnostic should be added');
    });

    test('single entry (no actual duplicate) produces no diagnostics', () => {
      const duplicates: DuplicateStepInfo[] = [
        { stepType: 'given', pattern: 'a unique step', filePath: '/proj/steps/a.py', lineNumber: 5 },
      ];

      setDuplicateStepDiagnostics(duplicates);

      assert.strictEqual(setStub.callCount, 0,
        'should not set diagnostics when there are no actual duplicates');
    });
  });

  suite('clearDuplicateStepDiagnostics', () => {
    test('removes duplicate diagnostics from previously affected files', () => {
      const duplicates: DuplicateStepInfo[] = [
        { stepType: 'given', pattern: 'a step', filePath: '/proj/steps/a.py', lineNumber: 5 },
        { stepType: 'given', pattern: 'a step', filePath: '/proj/steps/b.py', lineNumber: 10 },
      ];

      setDuplicateStepDiagnostics(duplicates);

      const uriA = vscode.Uri.file('/proj/steps/a.py');
      assert.strictEqual((diagStore.get(uriA.toString()) || []).length, 1, 'should have diagnostic before clear');

      clearDuplicateStepDiagnostics();

      assert.strictEqual((diagStore.get(uriA.toString()) || []).length, 0, 'should have no diagnostics after clear');
    });

    test('preserves non-duplicate diagnostics when clearing', () => {
      const existingDiag = new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 10),
        'some other warning',
        vscode.DiagnosticSeverity.Warning
      );
      existingDiag.code = 'other-code';

      const uri = vscode.Uri.file('/proj/steps/a.py');
      diagStore.set(uri.toString(), [existingDiag]);

      // Set then clear duplicates
      const duplicates: DuplicateStepInfo[] = [
        { stepType: 'given', pattern: 'a step', filePath: '/proj/steps/a.py', lineNumber: 5 },
        { stepType: 'given', pattern: 'a step', filePath: '/proj/steps/b.py', lineNumber: 10 },
      ];
      setDuplicateStepDiagnostics(duplicates);
      clearDuplicateStepDiagnostics();

      const diags = diagStore.get(uri.toString()) || [];
      assert.strictEqual(diags.length, 1, 'should only have the non-duplicate diagnostic');
      assert.strictEqual(diags[0].code, 'other-code');
    });

    test('calling clear when no duplicates were ever set is a no-op', () => {
      setStub.resetHistory();
      clearDuplicateStepDiagnostics();
      // No files were affected, so set should not be called
      assert.strictEqual(setStub.callCount, 0, 'should not call diagnostics.set');
    });
  });
});
