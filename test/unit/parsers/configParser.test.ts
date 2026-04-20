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
      assert.strictEqual(result.ok, true, 'should be ok:true');
      if (!result.ok) return;  // TypeScript narrowing -- unreachable after assert but satisfies compiler
      assert.strictEqual(result.format, 'ini', 'format should be ini');
      assert.deepStrictEqual(result.rawPaths, ['features'], 'rawPaths should contain features');
      assert.ok(
        result.resolvedPaths[0].fsPath.replace(/\\/g, '/').endsWith('behave-ini/features'),
        `resolvedPaths[0] ${result.resolvedPaths[0].fsPath} should end with behave-ini/features`
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
      assert.strictEqual(result.ok, true, 'should be ok:true');
      if (!result.ok) return;  // TypeScript narrowing
      assert.strictEqual(result.format, 'ini', 'format should be ini');
      assert.deepStrictEqual(result.rawPaths, ['features'], 'rawPaths should contain features');
      assert.ok(
        result.resolvedPaths[0].fsPath.replace(/\\/g, '/').endsWith('behaverc/features'),
        `resolvedPaths[0] ${result.resolvedPaths[0].fsPath} should end with behaverc/features`
      );
    });

  });

  suite('findBehaveConfig - setup.cfg (TEST-01)', () => {

    test('returns BehaveConfigResult for setup.cfg with [behave] section', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'setup-cfg'));
      const result = findBehaveConfig(wkspUri);
      assert.ok(result, 'should return a result');
      assert.strictEqual(result.ok, true, 'should be ok:true');
      if (!result.ok) return;  // TypeScript narrowing
      assert.strictEqual(result.format, 'ini', 'format should be ini');
      assert.deepStrictEqual(result.rawPaths, ['features'], 'rawPaths should contain features');
    });

  });

  suite('findBehaveConfig - tox.ini (TEST-01)', () => {

    test('returns BehaveConfigResult for tox.ini with [behave] section', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'tox-ini'));
      const result = findBehaveConfig(wkspUri);
      assert.ok(result, 'should return a result');
      assert.strictEqual(result.ok, true, 'should be ok:true');
      if (!result.ok) return;  // TypeScript narrowing
      assert.strictEqual(result.format, 'ini', 'format should be ini');
      assert.deepStrictEqual(result.rawPaths, ['features'], 'rawPaths should contain features');
    });

  });

  suite('findBehaveConfig - pyproject.toml (TEST-01)', () => {

    test('returns BehaveConfigResult for pyproject.toml with [tool.behave]', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'pyproject-toml'));
      const result = findBehaveConfig(wkspUri);
      assert.ok(result, 'should return a result');
      assert.strictEqual(result.ok, true, 'should be ok:true');
      if (!result.ok) return;  // TypeScript narrowing
      assert.strictEqual(result.format, 'toml', 'format should be toml');
      assert.deepStrictEqual(result.rawPaths, ['features'], 'rawPaths should contain features');
      assert.ok(
        result.resolvedPaths[0].fsPath.replace(/\\/g, '/').endsWith('pyproject-toml/features'),
        `resolvedPaths[0] ${result.resolvedPaths[0].fsPath} should end with pyproject-toml/features`
      );
    });

  });

  suite('findBehaveConfig - path resolution (TEST-03)', () => {

    test('resolvedPath is absolute URI relative to config file directory', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'behave-ini'));
      const result = findBehaveConfig(wkspUri);
      assert.ok(result, 'should return a result');
      assert.strictEqual(result.ok, true, 'should be ok:true');
      if (!result.ok) return;  // TypeScript narrowing
      const expectedSuffix = path.join('behave-ini', 'features').replace(/\\/g, '/');
      assert.ok(
        result.resolvedPaths[0].fsPath.replace(/\\/g, '/').endsWith(expectedSuffix),
        `resolvedPaths[0] ${result.resolvedPaths[0].fsPath} should end with ${expectedSuffix}`
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

  suite('findBehaveConfig - multi-path (TEST-04, MP-02)', () => {

    test('parses all continuation-line paths into rawPaths AND resolves all three', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'multi-path'));
      const result = findBehaveConfig(wkspUri);
      assert.ok(result, 'should return a result');
      assert.strictEqual(result.ok, true, 'should be ok:true');
      if (!result.ok) return;  // TypeScript narrowing
      assert.deepStrictEqual(
        result.rawPaths,
        ['features/auth', 'features/checkout', 'features/admin'],
        'rawPaths should contain all 3 paths from continuation lines'
      );
      assert.strictEqual(result.resolvedPaths.length, 3, 'resolvedPaths should contain all 3 resolved URIs');
      assert.ok(
        result.resolvedPaths[0].fsPath.replace(/\\/g, '/').endsWith('multi-path/features/auth'),
        `resolvedPaths[0] ${result.resolvedPaths[0].fsPath} should end with multi-path/features/auth`
      );
      assert.ok(
        result.resolvedPaths[1].fsPath.replace(/\\/g, '/').endsWith('multi-path/features/checkout'),
        `resolvedPaths[1] ${result.resolvedPaths[1].fsPath} should end with multi-path/features/checkout`
      );
      assert.ok(
        result.resolvedPaths[2].fsPath.replace(/\\/g, '/').endsWith('multi-path/features/admin'),
        `resolvedPaths[2] ${result.resolvedPaths[2].fsPath} should end with multi-path/features/admin`
      );
    });

  });

  suite('findBehaveConfig - Windows backslash normalization (TEST-12, D-10)', () => {

    test('Windows backslash paths normalized to forward slashes', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'windows-backslash'));
      const result = findBehaveConfig(wkspUri);
      assert.ok(result, 'should return a result');
      assert.strictEqual(result.ok, true, 'should be ok:true');
      if (!result.ok) return;  // TypeScript narrowing
      // rawPaths should preserve original backslashes from INI file
      assert.deepStrictEqual(
        result.rawPaths,
        ['features\\alt', 'features\\sub\\deep', 'C:\\Windows\\abs'],
        'rawPaths should preserve original backslashes'
      );
      // resolvedPaths should have forward slashes in URI .path
      assert.strictEqual(result.resolvedPaths.length, 3, 'resolvedPaths should have 3 entries');
      assert.ok(
        result.resolvedPaths[0].path.endsWith('/features/alt'),
        `resolvedPaths[0].path ${result.resolvedPaths[0].path} should end with /features/alt`
      );
      assert.ok(
        result.resolvedPaths[1].path.endsWith('/features/sub/deep'),
        `resolvedPaths[1].path ${result.resolvedPaths[1].path} should end with /features/sub/deep`
      );
    });

    test('Windows absolute path with drive letter preserves drive and normalizes slashes', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'windows-backslash'));
      const result = findBehaveConfig(wkspUri);
      assert.ok(result, 'should return a result');
      assert.strictEqual(result.ok, true, 'should be ok:true');
      if (!result.ok) return;  // TypeScript narrowing
      // Third entry is absolute Windows path C:\Windows\abs
      assert.ok(
        result.resolvedPaths[2].path.includes('/Windows/abs'),
        `resolvedPaths[2].path ${result.resolvedPaths[2].path} should contain /Windows/abs (forward slashes)`
      );
    });

  });

  suite('findBehaveConfig - priority order (DISC-05)', () => {

    test('behave.ini takes priority — configFileUri ends with behave.ini', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'behave-ini'));
      const result = findBehaveConfig(wkspUri);
      assert.ok(result, 'should return a result');
      assert.strictEqual(result.ok, true, 'should be ok:true');
      if (!result.ok) return;  // TypeScript narrowing
      assert.ok(
        result.configFileUri.fsPath.replace(/\\/g, '/').endsWith('behave.ini'),
        `configFileUri ${result.configFileUri.fsPath} should point to behave.ini`
      );
    });

  });

  suite('findBehaveConfig - error variant (D-05)', () => {

    test('malformed TOML returns ok:false with errorMessage', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'malformed-toml'));
      const result = findBehaveConfig(wkspUri);
      assert.ok(result, 'should return a result (not undefined)');
      assert.strictEqual(result.ok, false, 'should be ok:false');
      if (result.ok) return;  // TypeScript narrowing
      assert.ok(result.errorMessage.length > 0, 'errorMessage should be non-empty');
      assert.ok(
        result.configFileUri.fsPath.replace(/\\/g, '/').endsWith('malformed-toml/pyproject.toml'),
        `configFileUri ${result.configFileUri.fsPath} should point to the malformed file`
      );
    });

    test('INI without [behave] section still returns undefined (not ok:false)', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'no-behave-section'));
      const result = findBehaveConfig(wkspUri);
      assert.strictEqual(result, undefined, 'no [behave] section is not an error -- must be undefined');
    });

    test('TOML without [tool.behave] returns undefined (not ok:false)', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'no-tool-behave'));
      const result = findBehaveConfig(wkspUri);
      assert.strictEqual(result, undefined, 'no [tool.behave] section is not an error -- must be undefined');
    });

  });

});
