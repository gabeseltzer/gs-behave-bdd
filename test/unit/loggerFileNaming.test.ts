// sanitizeForFileName / currentWorkspaceLabel back the session-log file name, which is how a
// folder full of logs from an integration run gets told apart.

import * as assert from 'assert';
import * as sinon from 'sinon';
import { currentWorkspaceLabel, sanitizeForFileName } from '../../src/logger';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscode = require('vscode');


suite('session log file naming', () => {

  teardown(() => {
    sinon.restore();
  });


  suite('sanitizeForFileName', () => {

    test('passes through an already-safe name', () => {
      assert.strictEqual(sanitizeForFileName('my-project_1.2', 40), 'my-project_1.2');
    });

    test('replaces every character illegal on Windows', () => {
      const out = sanitizeForFileName('a<b>c:d"e/f\\g|h?i*j', 40);
      assert.ok(!/[<>:"/\\|?*]/.test(out), out);
    });

    test('collapses runs and trims leading/trailing separators', () => {
      assert.strictEqual(sanitizeForFileName('  my   project  ', 40), 'my-project');
      assert.strictEqual(sanitizeForFileName('...dotted...', 40), 'dotted');
    });

    test('truncates to the limit without leaving a trailing separator', () => {
      const out = sanitizeForFileName('a'.repeat(30) + ' ' + 'b'.repeat(30), 31);
      assert.strictEqual(out.length <= 31, true, out);
      assert.ok(!out.endsWith('-'), out);
    });

    test('a name of only illegal characters degrades to a placeholder', () => {
      assert.strictEqual(sanitizeForFileName('///', 40), 'unnamed');
      assert.strictEqual(sanitizeForFileName('', 40), 'unnamed');
    });

    test('non-ascii names still produce a usable component', () => {
      // e.g. a project named in Japanese - must not produce an empty or illegal name
      const out = sanitizeForFileName('プロジェクト', 40);
      assert.strictEqual(out, 'unnamed');
    });

  });


  suite('currentWorkspaceLabel', () => {

    test('prefers vscode.workspace.name', () => {
      sinon.stub(vscode.workspace, 'name').value('my-multiroot (Workspace)');
      assert.strictEqual(currentWorkspaceLabel(), 'my-multiroot (Workspace)');
    });

    test('falls back to the first workspace folder', () => {
      sinon.stub(vscode.workspace, 'name').value(undefined);
      sinon.stub(vscode.workspace, 'workspaceFolders').value([{ name: 'first-folder' }]);
      assert.strictEqual(currentWorkspaceLabel(), 'first-folder');
    });

    test('reports no-workspace when nothing is open', () => {
      sinon.stub(vscode.workspace, 'name').value(undefined);
      sinon.stub(vscode.workspace, 'workspaceFolders').value([]);
      assert.strictEqual(currentWorkspaceLabel(), 'no-workspace');
    });

  });

});
