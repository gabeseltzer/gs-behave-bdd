// Unit tests for configScanner — TEST-11: BFS subdirectory config scanner

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as configParserModule from '../../../src/parsers/configParser';
import * as commonModule from '../../../src/common';
import * as loggerModule from '../../../src/logger';
import {
  scanForBehaveConfig,
  getCachedScanResult,
  setCachedScanResult,
  clearScanResultCache,
} from '../../../src/discovery/configScanner';


type DirTree = { [name: string]: 'file' | DirTree };

/**
 * Build a mock filesystem tree.
 * Stubs vscode.workspace.fs.readDirectory to return entries based on the tree.
 * Stubs findBehaveConfig to return ok:true for directories that contain a config-named file.
 */
function setupMockFs(
  sandbox: sinon.SinonSandbox,
  rootUri: vscode.Uri,
  tree: DirTree,
  configFindOverrides?: Map<string, configParserModule.BehaveConfigResult | undefined>,
) {
  const CONFIG_NAMES = new Set(['behave.ini', '.behaverc', 'setup.cfg', 'tox.ini', 'pyproject.toml']);

  // Build a flat map of dirPath -> entries
  const dirMap = new Map<string, [string, vscode.FileType][]>();

  function walk(parentPath: string, node: DirTree) {
    const entries: [string, vscode.FileType][] = [];
    for (const [name, value] of Object.entries(node)) {
      if (value === 'file') {
        entries.push([name, vscode.FileType.File]);
      } else {
        entries.push([name, vscode.FileType.Directory]);
        const childPath = parentPath + '/' + name;
        walk(childPath, value);
      }
    }
    dirMap.set(parentPath, entries);
  }

  walk(rootUri.path, tree);

  // Stub readDirectory
  sandbox.stub(vscode.workspace.fs, 'readDirectory').callsFake(async (uri: vscode.Uri) => {
    const entries = dirMap.get(uri.path);
    if (entries) return entries;
    throw new Error(`Directory not found: ${uri.path}`);
  });

  // Stub findBehaveConfig — if directory contains a config-named file, return ok:true
  sandbox.stub(configParserModule, 'findBehaveConfig').callsFake((dirUri: vscode.Uri) => {
    // Check overrides first
    if (configFindOverrides?.has(dirUri.path)) {
      return configFindOverrides.get(dirUri.path);
    }

    const entries = dirMap.get(dirUri.path);
    if (!entries) return undefined;

    for (const [name] of entries) {
      if (CONFIG_NAMES.has(name)) {
        const configUri = vscode.Uri.joinPath(dirUri, name);
        return {
          ok: true as const,
          configFileUri: configUri,
          format: 'ini' as const,
          rawPaths: ['features'],
          resolvedPaths: [vscode.Uri.joinPath(dirUri, 'features')],
          pathLineNumbers: [1],
        };
      }
    }
    return undefined;
  });

  // Stub realpathSync.native — return unique paths by default
  sandbox.stub(fs, 'realpathSync').value(
    Object.assign(
      (_path: string) => _path,
      { native: (_path: string) => _path },
    )
  );
}


suite('configScanner', () => {
  let sandbox: sinon.SinonSandbox;
  const rootUri = vscode.Uri.file('/test-workspace');

  setup(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(loggerModule, 'diagLog');
    clearScanResultCache();
  });

  teardown(() => {
    sandbox.restore();
    clearScanResultCache();
  });


  test('maxDepth=0 returns empty result', async () => {
    // No filesystem stubs needed — should return immediately
    const result = await scanForBehaveConfig(rootUri, 0);
    assert.strictEqual(result.primary, undefined);
    assert.strictEqual(result.alsoFound.length, 0);
    assert.strictEqual(result.scannedDirs, 0);
    assert.strictEqual(result.circuitBreakerFired, false);
    assert.strictEqual(result.maxDepthReached, 0);
  });


  test('finds config at depth 1', async () => {
    setupMockFs(sandbox, rootUri, {
      'app-a': { 'behave.ini': 'file', 'features': {} },
    });

    const result = await scanForBehaveConfig(rootUri, 3);
    assert.ok(result.primary);
    assert.strictEqual(result.primary.depth, 1);
    assert.ok(result.primary.configFileUri.path.endsWith('behave.ini'));
    assert.strictEqual(result.primary.configPriority, 0);
  });


  test('finds config at depth 3', async () => {
    setupMockFs(sandbox, rootUri, {
      'deep': {
        'nested': {
          'dir': { 'behave.ini': 'file' },
        },
      },
    });

    const result = await scanForBehaveConfig(rootUri, 3);
    assert.ok(result.primary);
    assert.strictEqual(result.primary.depth, 3);
    assert.ok(result.primary.configFileUri.path.endsWith('behave.ini'));
  });


  test('skips node_modules', async () => {
    setupMockFs(sandbox, rootUri, {
      'node_modules': { 'some-pkg': { 'behave.ini': 'file' } },
    });

    const result = await scanForBehaveConfig(rootUri, 3);
    assert.strictEqual(result.primary, undefined);
  });


  test('skips .git directory', async () => {
    setupMockFs(sandbox, rootUri, {
      '.git': { 'behave.ini': 'file' },
    });

    const result = await scanForBehaveConfig(rootUri, 3);
    assert.strictEqual(result.primary, undefined);
  });


  test('skips dist, out, build, coverage directories', async () => {
    setupMockFs(sandbox, rootUri, {
      'dist': { 'behave.ini': 'file' },
      'out': { 'behave.ini': 'file' },
      'build': { 'behave.ini': 'file' },
      'coverage': { 'behave.ini': 'file' },
    });

    const result = await scanForBehaveConfig(rootUri, 3);
    assert.strictEqual(result.primary, undefined);
  });


  test('skips hidden directories', async () => {
    setupMockFs(sandbox, rootUri, {
      '.hidden': { 'behave.ini': 'file' },
      '.venv': { 'behave.ini': 'file' },
    });

    const result = await scanForBehaveConfig(rootUri, 3);
    assert.strictEqual(result.primary, undefined);
  });


  test('symlink cycle does not cause infinite loop', async () => {
    setupMockFs(sandbox, rootUri, {
      'dir-a': {
        'dir-b': {},
      },
    });

    // Make dir-b resolve to the same real path as dir-a (cycle)
    const realpathStub = sandbox.stub(fs, 'realpathSync');
    // Restore the one we set in setupMockFs and override
    realpathStub.value(
      Object.assign(
        (_path: string) => _path,
        {
          native: (p: string) => {
            // Simulate: dir-b is a symlink back to dir-a
            if (p.includes('dir-b')) return p.replace('dir-b', 'dir-a').replace(/\/dir-a\/dir-a/, '/dir-a');
            return p;
          }
        },
      )
    );

    const result = await scanForBehaveConfig(rootUri, 5);
    // Should complete without hanging — the cycle is detected
    assert.strictEqual(result.circuitBreakerFired, false);
  });


  test('circuit breaker fires when maxEntriesScanned reached', async () => {
    // Create a tree with more than 5 entries
    setupMockFs(sandbox, rootUri, {
      'a': {},
      'b': {},
      'c': {},
      'd': {},
      'e': {},
      'f': { 'behave.ini': 'file' },
    });

    const result = await scanForBehaveConfig(rootUri, 3, false, 5);
    assert.strictEqual(result.circuitBreakerFired, true);
  });


  test('shallower config wins over deeper one', async () => {
    setupMockFs(sandbox, rootUri, {
      'shallow': { 'behave.ini': 'file' },
      'deep': { 'nested': { 'behave.ini': 'file' } },
    });

    const result = await scanForBehaveConfig(rootUri, 3);
    assert.ok(result.primary);
    assert.strictEqual(result.primary.depth, 1);
    assert.ok(result.primary.dirUri.path.includes('shallow'));
  });


  test('config priority tiebreaker at same depth', async () => {
    setupMockFs(sandbox, rootUri, {
      'app-a': { 'behave.ini': 'file' },
      'app-b': { 'setup.cfg': 'file' },
    });

    const result = await scanForBehaveConfig(rootUri, 3);
    assert.ok(result.primary);
    // behave.ini (priority 0) should win over setup.cfg (priority 2)
    assert.strictEqual(result.primary.configPriority, 0);
    assert.ok(result.primary.configFileUri.path.endsWith('behave.ini'));
    assert.strictEqual(result.alsoFound.length, 1);
  });


  test('stopOnFirstHit=true stops after first-hit depth', async () => {
    setupMockFs(sandbox, rootUri, {
      'shallow': { 'behave.ini': 'file' },
      'deep': { 'nested': { 'behave.ini': 'file' } },
    });

    const result = await scanForBehaveConfig(rootUri, 3, true);
    assert.ok(result.primary);
    assert.strictEqual(result.primary.depth, 1);
    // With stopOnFirstHit, the deeper config should NOT be found
    assert.strictEqual(result.alsoFound.length, 0);
  });


  test('multiple configs at same depth all returned in alsoFound', async () => {
    setupMockFs(sandbox, rootUri, {
      'project-a': { 'behave.ini': 'file' },
      'project-b': { 'behave.ini': 'file' },
      'project-c': { 'setup.cfg': 'file' },
    });

    const result = await scanForBehaveConfig(rootUri, 3);
    assert.ok(result.primary);
    // 1 primary + 2 alsoFound
    assert.strictEqual(result.alsoFound.length, 2);
  });


  test('findBehaveConfig returning ok:false is not treated as found', async () => {
    const overrides = new Map<string, configParserModule.BehaveConfigResult | undefined>();
    const malformedUri = vscode.Uri.joinPath(rootUri, 'bad-project');
    overrides.set(malformedUri.path, {
      ok: false,
      configFileUri: vscode.Uri.joinPath(malformedUri, 'behave.ini'),
      errorMessage: 'malformed config',
    });

    setupMockFs(sandbox, rootUri, {
      'bad-project': { 'behave.ini': 'file' },
    }, overrides);

    const result = await scanForBehaveConfig(rootUri, 3);
    assert.strictEqual(result.primary, undefined);
    assert.strictEqual(result.alsoFound.length, 0);
  });


  suite('cache functions', () => {

    test('set, get, clear round-trip', () => {
      const mockResult = {
        primary: undefined,
        alsoFound: [],
        scannedDirs: 5,
        circuitBreakerFired: false,
        maxDepthReached: 2,
      };

      assert.strictEqual(getCachedScanResult(rootUri), undefined);

      setCachedScanResult(rootUri, mockResult);
      const cached = getCachedScanResult(rootUri);
      assert.ok(cached);
      assert.strictEqual(cached.scannedDirs, 5);

      clearScanResultCache();
      assert.strictEqual(getCachedScanResult(rootUri), undefined);
    });

  });


  test('does not scan deeper than maxDepth', async () => {
    setupMockFs(sandbox, rootUri, {
      'level1': {
        'level2': {
          'level3': { 'behave.ini': 'file' },
        },
      },
    });

    const result = await scanForBehaveConfig(rootUri, 2);
    // Config is at depth 3, but maxDepth is 2 — should not be found
    assert.strictEqual(result.primary, undefined);
    assert.strictEqual(result.maxDepthReached, 2);
  });

});
