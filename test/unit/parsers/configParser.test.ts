// Unit tests for configParser module
// Covers all 5 behave config formats, path resolution, priority order, and edge cases.
// Requirements: TEST-01, TEST-03, TEST-04

import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { findBehaveConfig } from '../../../src/parsers/configParser';

// __dirname at runtime is out/test/unit/parsers/ — go up 5 levels to repo root
const fixtureRoot = path.resolve(__dirname, '..', '..', '..', '..', '..', 'test', 'unit',
  'parsers', 'fixtures', 'config');

suite('configParser', () => {

  suite('findBehaveConfig - behave.ini (TEST-01)', () => {

    test('returns BehaveConfigResult for standard behave.ini', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'behave-ini'));
      const result = findBehaveConfig(wkspUri);
      assert.ok(result, 'should return a result');
      assert.strictEqual(result.format, 'ini', 'format should be ini');
      assert.deepStrictEqual(result.rawPaths, ['features'], 'rawPaths should contain features');
      assert.ok(
        result.resolvedPath.fsPath.replace(/\\/g, '/').endsWith('behave-ini/features'),
        `resolvedPath ${result.resolvedPath.fsPath} should end with behave-ini/features`
      );
      assert.ok(
        result.configFileUri.fsPath.replace(/\\/g, '/').endsWith('behave-ini/behave.ini'),
        `configFileUri ${result.configFileUri.fsPath} should end with behave-ini/behave.ini`
      );
    });

  });

  suite('findBehaveConfig - .behaverc (TEST-01)', () => {

    test('returns BehaveConfigResult for .behaverc', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'behaverc'));
      const result = findBehaveConfig(wkspUri);
      assert.ok(result, 'should return a result');
      assert.strictEqual(result.format, 'ini', 'format should be ini');
      assert.deepStrictEqual(result.rawPaths, ['features'], 'rawPaths should contain features');
      assert.ok(
        result.resolvedPath.fsPath.replace(/\\/g, '/').endsWith('behaverc/features'),
        `resolvedPath ${result.resolvedPath.fsPath} should end with behaverc/features`
      );
    });

  });

  suite('findBehaveConfig - setup.cfg (TEST-01)', () => {

    test('returns BehaveConfigResult for setup.cfg with [behave] section', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'setup-cfg'));
      const result = findBehaveConfig(wkspUri);
      assert.ok(result, 'should return a result');
      assert.strictEqual(result.format, 'ini', 'format should be ini');
      assert.deepStrictEqual(result.rawPaths, ['features'], 'rawPaths should contain features');
    });

  });

  suite('findBehaveConfig - tox.ini (TEST-01)', () => {

    test('returns BehaveConfigResult for tox.ini with [behave] section', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'tox-ini'));
      const result = findBehaveConfig(wkspUri);
      assert.ok(result, 'should return a result');
      assert.strictEqual(result.format, 'ini', 'format should be ini');
      assert.deepStrictEqual(result.rawPaths, ['features'], 'rawPaths should contain features');
    });

  });

  suite('findBehaveConfig - pyproject.toml (TEST-01)', () => {

    test('returns BehaveConfigResult for pyproject.toml with [tool.behave]', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'pyproject-toml'));
      const result = findBehaveConfig(wkspUri);
      assert.ok(result, 'should return a result');
      assert.strictEqual(result.format, 'toml', 'format should be toml');
      assert.deepStrictEqual(result.rawPaths, ['features'], 'rawPaths should contain features');
      assert.ok(
        result.resolvedPath.fsPath.replace(/\\/g, '/').endsWith('pyproject-toml/features'),
        `resolvedPath ${result.resolvedPath.fsPath} should end with pyproject-toml/features`
      );
    });

  });

  suite('findBehaveConfig - path resolution (TEST-03)', () => {

    test('resolvedPath is absolute URI relative to config file directory', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'behave-ini'));
      const result = findBehaveConfig(wkspUri);
      assert.ok(result, 'should return a result');
      const expectedSuffix = path.join('behave-ini', 'features').replace(/\\/g, '/');
      assert.ok(
        result.resolvedPath.fsPath.replace(/\\/g, '/').endsWith(expectedSuffix),
        `resolvedPath ${result.resolvedPath.fsPath} should end with ${expectedSuffix}`
      );
    });

  });

  suite('findBehaveConfig - edge cases (TEST-04)', () => {

    test('returns undefined for INI without [behave] section', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'no-behave-section'));
      const result = findBehaveConfig(wkspUri);
      assert.strictEqual(result, undefined, 'should return undefined for missing [behave] section');
    });

    test('returns undefined for malformed INI', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'malformed-ini'));
      const result = findBehaveConfig(wkspUri);
      assert.strictEqual(result, undefined, 'should return undefined for malformed INI');
    });

    test('returns undefined for TOML without [tool.behave] table', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'no-tool-behave'));
      const result = findBehaveConfig(wkspUri);
      assert.strictEqual(result, undefined, 'should return undefined for missing [tool.behave]');
    });

    test('returns undefined when no config files exist', () => {
      // fixtureRoot itself has no config file at its top level
      const wkspUri = vscode.Uri.file(fixtureRoot);
      const result = findBehaveConfig(wkspUri);
      assert.strictEqual(result, undefined, 'should return undefined when no config files found');
    });

  });

  suite('findBehaveConfig - multi-path (TEST-04, D-03)', () => {

    test('parses all continuation-line paths into rawPaths but resolves only the first', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'multi-path'));
      const result = findBehaveConfig(wkspUri);
      assert.ok(result, 'should return a result');
      assert.deepStrictEqual(
        result.rawPaths,
        ['features/auth', 'features/checkout', 'features/admin'],
        'rawPaths should contain all 3 paths from continuation lines'
      );
      assert.ok(
        result.resolvedPath.fsPath.replace(/\\/g, '/').endsWith('multi-path/features/auth'),
        `resolvedPath ${result.resolvedPath.fsPath} should resolve only the first path (features/auth)`
      );
    });

  });

  suite('findBehaveConfig - priority order (DISC-05)', () => {

    test('behave.ini takes priority — configFileUri ends with behave.ini', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'behave-ini'));
      const result = findBehaveConfig(wkspUri);
      assert.ok(result, 'should return a result');
      assert.ok(
        result.configFileUri.fsPath.replace(/\\/g, '/').endsWith('behave.ini'),
        `configFileUri ${result.configFileUri.fsPath} should point to behave.ini`
      );
    });

  });

});
