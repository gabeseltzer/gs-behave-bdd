// Unit tests for importResolver module - Python import resolution via importlib

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as childProcess from 'child_process';
import { EventEmitter } from 'events';
import * as sinon from 'sinon';
import { PythonImport } from '../../../src/parsers/importParser';

// Stub diagLog before importResolver is loaded
// eslint-disable-next-line @typescript-eslint/no-var-requires
const loggerModule = require('../../../src/logger');

suite('importResolver', () => {

  let spawnStub: sinon.SinonStub;
  let diagLogStub: sinon.SinonStub;
  let mockProcess: MockChildProcess;
  let resolveImports: typeof import('../../../src/parsers/importResolver').resolveImports;
  let resolveRelativeImport: typeof import('../../../src/parsers/importResolver').resolveRelativeImport;

  class MockChildProcess extends EventEmitter {
    pid = 12345;
    stdout = new EventEmitter();
    stderr = new EventEmitter();
    kill = sinon.stub();
  }

  setup(() => {
    mockProcess = new MockChildProcess();
    spawnStub = sinon.stub(childProcess, 'spawn').returns(mockProcess as unknown as childProcess.ChildProcess);
    diagLogStub = sinon.stub(loggerModule, 'diagLog');
    void spawnStub;
    void diagLogStub;

    // Clear module cache so each test gets a fresh import with the spawn stub active
    for (const key of Object.keys(require.cache)) {
      if (key.includes('importResolver')) {
        delete require.cache[key];
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    resolveImports = require('../../../src/parsers/importResolver').resolveImports;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    resolveRelativeImport = require('../../../src/parsers/importResolver').resolveRelativeImport;
  });

  teardown(() => {
    sinon.restore();
  });

  suite('resolveRelativeImport', () => {

    test('resolves .module relative import to file path', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
      try {
        // Create a module.py file in tmpDir
        const modulePath = path.join(tmpDir, 'module.py');
        fs.writeFileSync(modulePath, 'pass');

        const imp: PythonImport = {
          modulePath: 'module',
          importedNames: ['something'],
          isRelative: true,
          relativeDots: 1,
          lineNo: 0
        };

        const result = resolveRelativeImport(imp, tmpDir);
        assert.strictEqual(result, modulePath);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    test('resolves ..module relative import to parent directory', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
      try {
        const subDir = path.join(tmpDir, 'subdir');
        fs.mkdirSync(subDir);

        // Create module.py in parent (tmpDir)
        const modulePath = path.join(tmpDir, 'module.py');
        fs.writeFileSync(modulePath, 'pass');

        const imp: PythonImport = {
          modulePath: 'module',
          importedNames: ['something'],
          isRelative: true,
          relativeDots: 2,
          lineNo: 0
        };

        const result = resolveRelativeImport(imp, subDir);
        assert.strictEqual(result, modulePath);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    test('resolves package __init__.py for relative imports', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
      try {
        // Create a package (directory with __init__.py)
        const pkgDir = path.join(tmpDir, 'mypackage');
        fs.mkdirSync(pkgDir);
        const initPath = path.join(pkgDir, '__init__.py');
        fs.writeFileSync(initPath, 'pass');

        const imp: PythonImport = {
          modulePath: 'mypackage',
          importedNames: ['something'],
          isRelative: true,
          relativeDots: 1,
          lineNo: 0
        };

        const result = resolveRelativeImport(imp, tmpDir);
        assert.strictEqual(result, initPath);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    test('returns null for non-existent relative imports', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
      try {
        const imp: PythonImport = {
          modulePath: 'nonexistent',
          importedNames: ['something'],
          isRelative: true,
          relativeDots: 1,
          lineNo: 0
        };

        const result = resolveRelativeImport(imp, tmpDir);
        assert.strictEqual(result, null);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    test('returns null for pure relative imports without module name', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
      try {
        const imp: PythonImport = {
          modulePath: '',
          importedNames: ['something'],
          isRelative: true,
          relativeDots: 1,
          lineNo: 0
        };

        const result = resolveRelativeImport(imp, tmpDir);
        assert.strictEqual(result, null);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    test('resolves nested module paths with dots', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
      try {
        // Create nested package structure
        const pkg = path.join(tmpDir, 'pkg');
        const subpkg = path.join(pkg, 'sub');
        fs.mkdirSync(pkg);
        fs.mkdirSync(subpkg);
        fs.writeFileSync(path.join(pkg, '__init__.py'), 'pass');
        fs.writeFileSync(path.join(subpkg, '__init__.py'), 'pass');
        const modulePath = path.join(subpkg, 'mod.py');
        fs.writeFileSync(modulePath, 'pass');

        const imp: PythonImport = {
          modulePath: 'sub.mod',
          importedNames: ['something'],
          isRelative: true,
          relativeDots: 1,
          lineNo: 0
        };

        const result = resolveRelativeImport(imp, pkg);
        assert.strictEqual(result, modulePath);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

  });

  suite('resolveImports', () => {

    test('returns empty map for empty imports array', async () => {
      const result = await resolveImports('python', [], '/tmp');
      assert.deepStrictEqual(result, new Map());
    });

    test('processes absolute imports via Python subprocess', async () => {
      const imports: PythonImport[] = [
        { modulePath: 'os', importedNames: ['path'], isRelative: false, relativeDots: 0, lineNo: 0 },
        { modulePath: 'sys', importedNames: ['argv'], isRelative: false, relativeDots: 0, lineNo: 1 }
      ];

      const promise = resolveImports('python', imports, '/tmp');

      // Simulate Python output
      const output = JSON.stringify({
        os: '/usr/lib/python3.9/os.py',
        sys: '/usr/lib/python3.9/sys.py'
      });
      mockProcess.stdout.emit('data', Buffer.from(output));
      mockProcess.emit('close', 0);

      const result = await promise;
      assert.strictEqual(result.size, 2);
      assert.strictEqual(result.get('os'), '/usr/lib/python3.9/os.py');
      assert.strictEqual(result.get('sys'), '/usr/lib/python3.9/sys.py');
    });

    test('handles Python modules not found', async () => {
      const imports: PythonImport[] = [
        { modulePath: 'nonexistent_module', importedNames: ['x'], isRelative: false, relativeDots: 0, lineNo: 0 }
      ];

      const promise = resolveImports('python', imports, '/tmp');

      // Simulate Python returning null for not found
      const output = JSON.stringify({
        nonexistent_module: null
      });
      mockProcess.stdout.emit('data', Buffer.from(output));
      mockProcess.emit('close', 0);

      const result = await promise;
      assert.strictEqual(result.size, 1);
      assert.strictEqual(result.get('nonexistent_module'), null);
    });

    test('batches unique module paths', async () => {
      const imports: PythonImport[] = [
        { modulePath: 'os', importedNames: ['path'], isRelative: false, relativeDots: 0, lineNo: 0 },
        { modulePath: 'os', importedNames: ['path'], isRelative: false, relativeDots: 0, lineNo: 1 }, // duplicate
        { modulePath: 'sys', importedNames: ['argv'], isRelative: false, relativeDots: 0, lineNo: 2 }
      ];

      const promise = resolveImports('python', imports, '/tmp');

      // Should only request 2 unique modules
      mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({
        os: '/usr/lib/python3.9/os.py',
        sys: '/usr/lib/python3.9/sys.py'
      })));
      mockProcess.emit('close', 0);

      const result = await promise;
      assert.strictEqual(result.size, 2);
    });

    test('handles Python process error silently', async () => {
      const imports: PythonImport[] = [
        { modulePath: 'os', importedNames: ['path'], isRelative: false, relativeDots: 0, lineNo: 0 }
      ];

      const promise = resolveImports('python', imports, '/tmp');

      // Simulate process error
      mockProcess.emit('error', new Error('spawn failed'));

      const result = await promise;
      // Should return null for the module on error
      assert.strictEqual(result.size, 1);
      assert.strictEqual(result.get('os'), null);
    });

    test('handles non-zero exit code silently', async () => {
      const imports: PythonImport[] = [
        { modulePath: 'os', importedNames: ['path'], isRelative: false, relativeDots: 0, lineNo: 0 }
      ];

      const promise = resolveImports('python', imports, '/tmp');

      mockProcess.emit('close', 1);

      const result = await promise;
      assert.strictEqual(result.size, 1);
      assert.strictEqual(result.get('os'), null);
    });

    test('separates relative and absolute imports', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
      try {
        // Create a relative module file
        const relModulePath = path.join(tmpDir, 'relmodule.py');
        fs.writeFileSync(relModulePath, 'pass');

        const imports: PythonImport[] = [
          // Relative import
          { modulePath: 'relmodule', importedNames: ['x'], isRelative: true, relativeDots: 1, lineNo: 0 },
          // Absolute imports
          { modulePath: 'os', importedNames: ['path'], isRelative: false, relativeDots: 0, lineNo: 1 },
          { modulePath: 'sys', importedNames: ['argv'], isRelative: false, relativeDots: 0, lineNo: 2 }
        ];

        const promise = resolveImports('python', imports, '/tmp', tmpDir);

        // Simulate Python output for absolute imports
        mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({
          os: '/usr/lib/python3.9/os.py',
          sys: '/usr/lib/python3.9/sys.py'
        })));
        mockProcess.emit('close', 0);

        const result = await promise;
        assert.strictEqual(result.size, 3);
        // Relative import should be resolved
        assert.strictEqual(result.get('relmodule'), relModulePath);
        // Absolute imports should be resolved
        assert.strictEqual(result.get('os'), '/usr/lib/python3.9/os.py');
        assert.strictEqual(result.get('sys'), '/usr/lib/python3.9/sys.py');
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    test('spawns Python with correct arguments', async () => {
      const imports: PythonImport[] = [
        { modulePath: 'os', importedNames: ['path'], isRelative: false, relativeDots: 0, lineNo: 0 },
        { modulePath: 'sys', importedNames: ['argv'], isRelative: false, relativeDots: 0, lineNo: 1 }
      ];

      const promise = resolveImports('python', imports, '/project');

      mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({
        os: '/usr/lib/python3.9/os.py',
        sys: '/usr/lib/python3.9/sys.py'
      })));
      mockProcess.emit('close', 0);

      await promise;

      // Verify spawn was called with correct arguments
      assert.ok(spawnStub.called);
      const call = spawnStub.getCall(0);
      assert.strictEqual(call.args[0], 'python');
      assert.ok(Array.isArray(call.args[1]));
      const args = call.args[1] as string[];
      assert.strictEqual(args[0], '-c'); // Python inline script flag
      assert.ok(args.includes('os')); // Module name should be in args
      assert.ok(args.includes('sys')); // Module name should be in args
      // Check spawn options
      assert.deepStrictEqual(call.args[2], { cwd: '/project' });
    });

    test('handles invalid JSON from Python', async () => {
      const imports: PythonImport[] = [
        { modulePath: 'os', importedNames: ['path'], isRelative: false, relativeDots: 0, lineNo: 0 }
      ];

      const promise = resolveImports('python', imports, '/tmp');

      // Simulate invalid JSON output
      mockProcess.stdout.emit('data', Buffer.from('not valid json'));
      mockProcess.emit('close', 0);

      const result = await promise;
      // Should handle gracefully and return null for all modules
      assert.strictEqual(result.size, 1);
      assert.strictEqual(result.get('os'), null);
    });

    test('uses diagLog for timing information', async () => {
      const imports: PythonImport[] = [
        { modulePath: 'os', importedNames: ['path'], isRelative: false, relativeDots: 0, lineNo: 0 }
      ];

      const promise = resolveImports('python', imports, '/tmp');

      mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({
        os: '/usr/lib/python3.9/os.py'
      })));
      mockProcess.emit('close', 0);

      await promise;

      // diagLog should have been called with timing info
      assert.ok(diagLogStub.called);
      const call = diagLogStub.getCall(0);
      assert.ok(call.args[0].includes('resolveAbsoluteImports'));
      assert.ok(call.args[0].includes('1 modules'));
    });

  });

});
