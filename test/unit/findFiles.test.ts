// Unit tests for findFiles directory exclusion and regex pre-compilation

import * as assert from 'assert';
import * as sinon from 'sinon';
import { DEFAULT_EXCLUDE_DIRS, findFiles } from '../../src/common';
import * as vscode from 'vscode';

suite('findFiles', () => {

  suite('DEFAULT_EXCLUDE_DIRS', () => {
    test('should be a Set', () => {
      assert.ok(DEFAULT_EXCLUDE_DIRS instanceof Set);
    });

    test('should contain __pycache__', () => {
      assert.ok(DEFAULT_EXCLUDE_DIRS.has('__pycache__'));
    });

    test('should contain .git', () => {
      assert.ok(DEFAULT_EXCLUDE_DIRS.has('.git'));
    });

    test('should contain node_modules', () => {
      assert.ok(DEFAULT_EXCLUDE_DIRS.has('node_modules'));
    });

    test('should contain .venv', () => {
      assert.ok(DEFAULT_EXCLUDE_DIRS.has('.venv'));
    });

    test('should contain .tox', () => {
      assert.ok(DEFAULT_EXCLUDE_DIRS.has('.tox'));
    });

    test('should contain .mypy_cache', () => {
      assert.ok(DEFAULT_EXCLUDE_DIRS.has('.mypy_cache'));
    });

    test('should contain .pytest_cache', () => {
      assert.ok(DEFAULT_EXCLUDE_DIRS.has('.pytest_cache'));
    });

    test('should contain .eggs', () => {
      assert.ok(DEFAULT_EXCLUDE_DIRS.has('.eggs'));
    });

    test('should contain *.egg-info', () => {
      assert.ok(DEFAULT_EXCLUDE_DIRS.has('*.egg-info'));
    });

    test('should have exactly 9 entries', () => {
      assert.strictEqual(DEFAULT_EXCLUDE_DIRS.size, 9);
    });
  });

  suite('directory exclusion behavior', () => {
    let readDirectoryStub: sinon.SinonStub;

    setup(() => {
      readDirectoryStub = sinon.stub(vscode.workspace.fs, 'readDirectory');
    });

    teardown(() => {
      sinon.restore();
    });

    test('should skip __pycache__ directories', async () => {
      const rootUri = vscode.Uri.file('/project/features');
      const cancelToken = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => { /* */ } }) };

      // Root has a __pycache__ dir and a .py file
      readDirectoryStub.withArgs(rootUri).resolves([
        ['__pycache__', vscode.FileType.Directory],
        ['steps.py', vscode.FileType.File],
      ] as [string, vscode.FileType][]);

      const results = await findFiles(rootUri, undefined, '.py', cancelToken as vscode.CancellationToken);

      assert.strictEqual(results.length, 1);
      assert.ok(results[0].path.endsWith('steps.py'));
    });

    test('should skip .git directories', async () => {
      const rootUri = vscode.Uri.file('/project/features');
      const cancelToken = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => { /* */ } }) };

      readDirectoryStub.withArgs(rootUri).resolves([
        ['.git', vscode.FileType.Directory],
        ['steps.py', vscode.FileType.File],
      ] as [string, vscode.FileType][]);

      const results = await findFiles(rootUri, undefined, '.py', cancelToken as vscode.CancellationToken);

      assert.strictEqual(results.length, 1);
      assert.ok(results[0].path.endsWith('steps.py'));
    });

    test('should skip node_modules directories', async () => {
      const rootUri = vscode.Uri.file('/project/features');
      const cancelToken = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => { /* */ } }) };

      readDirectoryStub.withArgs(rootUri).resolves([
        ['node_modules', vscode.FileType.Directory],
        ['env.py', vscode.FileType.File],
      ] as [string, vscode.FileType][]);

      const results = await findFiles(rootUri, undefined, '.py', cancelToken as vscode.CancellationToken);

      assert.strictEqual(results.length, 1);
    });

    test('should recurse into non-excluded directories', async () => {
      const rootUri = vscode.Uri.file('/project/features');
      const stepsUri = vscode.Uri.joinPath(rootUri, 'steps');
      const cancelToken = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => { /* */ } }) };

      readDirectoryStub.withArgs(rootUri).resolves([
        ['steps', vscode.FileType.Directory],
        ['top.py', vscode.FileType.File],
      ] as [string, vscode.FileType][]);

      readDirectoryStub.withArgs(stepsUri).resolves([
        ['inner.py', vscode.FileType.File],
      ] as [string, vscode.FileType][]);

      const results = await findFiles(rootUri, undefined, '.py', cancelToken as vscode.CancellationToken);

      assert.strictEqual(results.length, 2);
    });

    test('should skip egg-info directories matching *.egg-info pattern', async () => {
      const rootUri = vscode.Uri.file('/project/features');
      const cancelToken = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => { /* */ } }) };

      readDirectoryStub.withArgs(rootUri).resolves([
        ['mypackage.egg-info', vscode.FileType.Directory],
        ['steps.py', vscode.FileType.File],
      ] as [string, vscode.FileType][]);

      const results = await findFiles(rootUri, undefined, '.py', cancelToken as vscode.CancellationToken);

      assert.strictEqual(results.length, 1);
      assert.ok(results[0].path.endsWith('steps.py'));
    });

    test('should allow custom excludeDirs', async () => {
      const rootUri = vscode.Uri.file('/project/features');
      const cancelToken = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => { /* */ } }) };
      const customDir = vscode.Uri.joinPath(rootUri, 'custom_exclude');

      readDirectoryStub.withArgs(rootUri).resolves([
        ['custom_exclude', vscode.FileType.Directory],
        ['steps', vscode.FileType.Directory],
        ['top.py', vscode.FileType.File],
      ] as [string, vscode.FileType][]);

      readDirectoryStub.withArgs(customDir).resolves([
        ['hidden.py', vscode.FileType.File],
      ] as [string, vscode.FileType][]);

      const stepsUri = vscode.Uri.joinPath(rootUri, 'steps');
      readDirectoryStub.withArgs(stepsUri).resolves([
        ['step.py', vscode.FileType.File],
      ] as [string, vscode.FileType][]);

      const results = await findFiles(rootUri, undefined, '.py', cancelToken as vscode.CancellationToken,
        new Set(['custom_exclude']));

      assert.strictEqual(results.length, 2);
      // The hidden.py in custom_exclude should be excluded
      const paths = results.map(u => u.path);
      assert.ok(paths.every(p => !p.includes('custom_exclude')));
    });
  });

  suite('matchSubDirectory regex pre-compilation', () => {
    let readDirectoryStub: sinon.SinonStub;

    setup(() => {
      readDirectoryStub = sinon.stub(vscode.workspace.fs, 'readDirectory');
    });

    teardown(() => {
      sinon.restore();
    });

    test('should still filter by matchSubDirectory', async () => {
      const rootUri = vscode.Uri.file('/project');
      const stepsUri = vscode.Uri.joinPath(rootUri, 'steps');
      const otherUri = vscode.Uri.joinPath(rootUri, 'other');
      const cancelToken = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => { /* */ } }) };

      readDirectoryStub.withArgs(rootUri).resolves([
        ['steps', vscode.FileType.Directory],
        ['other', vscode.FileType.Directory],
      ] as [string, vscode.FileType][]);

      readDirectoryStub.withArgs(stepsUri).resolves([
        ['step_impl.py', vscode.FileType.File],
      ] as [string, vscode.FileType][]);

      readDirectoryStub.withArgs(otherUri).resolves([
        ['utils.py', vscode.FileType.File],
      ] as [string, vscode.FileType][]);

      const results = await findFiles(rootUri, 'steps', '.py', cancelToken as vscode.CancellationToken);

      assert.strictEqual(results.length, 1);
      assert.ok(results[0].path.includes('/steps/'));
    });

    test('should be case-insensitive for matchSubDirectory', async () => {
      const rootUri = vscode.Uri.file('/project');
      const stepsUri = vscode.Uri.joinPath(rootUri, 'Steps');
      const cancelToken = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => { /* */ } }) };

      readDirectoryStub.withArgs(rootUri).resolves([
        ['Steps', vscode.FileType.Directory],
      ] as [string, vscode.FileType][]);

      readDirectoryStub.withArgs(stepsUri).resolves([
        ['my_steps.py', vscode.FileType.File],
      ] as [string, vscode.FileType][]);

      const results = await findFiles(rootUri, 'steps', '.py', cancelToken as vscode.CancellationToken);

      assert.strictEqual(results.length, 1);
    });
  });
});
