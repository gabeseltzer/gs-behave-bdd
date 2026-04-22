// Unit tests for configParser module
// Covers all 5 behave config formats, path resolution, priority order, and edge cases.
// Requirements: TEST-01, TEST-03, TEST-04

import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { findBehaveConfig } from '../../../src/parsers/configParser';
import { dedupResolvedPaths } from '../../../src/common';

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


  suite('pathLineNumbers - INI (Phase 8, D-05)', () => {

    test('single-line paths= returns correct line number', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'behave-ini'));
      const result = findBehaveConfig(wkspUri);
      assert.ok(result, 'should return a result');
      assert.strictEqual(result.ok, true);
      if (!result.ok) return;
      assert.ok(Array.isArray(result.pathLineNumbers), 'pathLineNumbers should be an array');
      assert.strictEqual(result.pathLineNumbers.length, 1, 'should have 1 line number');
      // behave-ini/behave.ini: line 0 = [behave], line 1 = paths = features
      assert.strictEqual(result.pathLineNumbers[0], 1, 'paths= value on line 1 (0-indexed)');
    });

    test('continuation-line paths return per-line numbers', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'multi-path-lines'));
      const result = findBehaveConfig(wkspUri);
      assert.ok(result, 'should return a result');
      assert.strictEqual(result.ok, true);
      if (!result.ok) return;
      assert.deepStrictEqual(result.rawPaths, ['features', 'features-alt', 'features-api']);
      assert.strictEqual(result.pathLineNumbers.length, 3, 'should have 3 line numbers');
      // multi-path-lines/behave.ini:
      //   0: # comment line
      //   1: # another comment
      //   2: (blank)
      //   3: [behave]
      //   4: paths = features
      //   5:     features-alt
      //   6:     features-api
      assert.strictEqual(result.pathLineNumbers[0], 4, 'paths= key line');
      assert.strictEqual(result.pathLineNumbers[1], 5, 'first continuation line');
      assert.strictEqual(result.pathLineNumbers[2], 6, 'second continuation line');
    });

    test('multi-path INI returns correct line numbers for original multi-path fixture', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'multi-path'));
      const result = findBehaveConfig(wkspUri);
      assert.ok(result, 'should return a result');
      assert.strictEqual(result.ok, true);
      if (!result.ok) return;
      assert.strictEqual(result.pathLineNumbers.length, 3, 'should have 3 line numbers');
      // multi-path/behave.ini:
      //   0: [behave]
      //   1: paths = features/auth
      //   2:     features/checkout
      //   3:     features/admin
      assert.strictEqual(result.pathLineNumbers[0], 1, 'paths= key line');
      assert.strictEqual(result.pathLineNumbers[1], 2, 'first continuation');
      assert.strictEqual(result.pathLineNumbers[2], 3, 'second continuation');
    });

  });


  suite('pathLineNumbers - TOML (Phase 8, D-05)', () => {

    test('TOML paths array returns line numbers for each entry', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'multi-path-toml'));
      const result = findBehaveConfig(wkspUri);
      assert.ok(result, 'should return a result');
      assert.strictEqual(result.ok, true);
      if (!result.ok) return;
      assert.deepStrictEqual(result.rawPaths, ['features', 'features-alt']);
      assert.strictEqual(result.pathLineNumbers.length, 2, 'should have 2 line numbers');
      // multi-path-toml/pyproject.toml:
      //   0: [tool.behave]
      //   1: paths = ["features", "features-alt"]
      // Both values are on line 1
      assert.strictEqual(result.pathLineNumbers[0], 1, 'features on line 1');
      assert.strictEqual(result.pathLineNumbers[1], 1, 'features-alt also on line 1');
    });

    test('standard TOML fixture has pathLineNumbers', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'pyproject-toml'));
      const result = findBehaveConfig(wkspUri);
      assert.ok(result, 'should return a result');
      assert.strictEqual(result.ok, true);
      if (!result.ok) return;
      assert.ok(Array.isArray(result.pathLineNumbers), 'pathLineNumbers should be an array');
      assert.strictEqual(result.pathLineNumbers.length, result.rawPaths.length,
        'pathLineNumbers length should match rawPaths length');
    });

  });


  suite('dedupResolvedPaths (Phase 8, D-09, D-11)', () => {

    function makeUri(p: string) {
      return vscode.Uri.file(path.join(fixtureRoot, p));
    }

    test('exact duplicate: two identical paths deduplicated to one', () => {
      const uri = makeUri('behave-ini/features');
      const result = dedupResolvedPaths([uri, uri], ['features', 'features'], [1, 2]);
      assert.strictEqual(result.resolvedPaths.length, 1, 'should have 1 path');
      assert.strictEqual(result.subsumedPaths.length, 1, 'should have 1 subsumed');
      assert.strictEqual(result.subsumedPaths[0].rawPath, 'features');
      assert.strictEqual(result.subsumedPaths[0].lineNumber, 2);
    });

    test('subsumption: parent contains child', () => {
      const parentUri = makeUri('multi-path');
      const childUri = vscode.Uri.joinPath(parentUri, 'features/auth');
      const result = dedupResolvedPaths(
        [parentUri, childUri],
        ['multi-path', 'multi-path/features/auth'],
        [0, 1]
      );
      assert.strictEqual(result.resolvedPaths.length, 1, 'parent should win');
      assert.strictEqual(result.subsumedPaths.length, 1);
      assert.strictEqual(result.subsumedPaths[0].subsumedBy, 'multi-path');
    });

    test('reverse order subsumption: child listed first, parent still wins', () => {
      const parentUri = makeUri('multi-path');
      const childUri = vscode.Uri.joinPath(parentUri, 'features/auth');
      const result = dedupResolvedPaths(
        [childUri, parentUri],
        ['multi-path/features/auth', 'multi-path'],
        [1, 0]
      );
      assert.strictEqual(result.resolvedPaths.length, 1, 'parent should win regardless of order');
      assert.ok(
        result.resolvedPaths[0].path.endsWith('multi-path'),
        'surviving path should be the parent'
      );
      assert.strictEqual(result.subsumedPaths[0].rawPath, 'multi-path/features/auth');
    });

    test('no overlap: both paths survive', () => {
      const uri1 = makeUri('behave-ini/features');
      const uri2 = makeUri('behaverc');
      const result = dedupResolvedPaths([uri1, uri2], ['features', 'behaverc'], [0, 1]);
      assert.strictEqual(result.resolvedPaths.length, 2, 'both should survive');
      assert.strictEqual(result.subsumedPaths.length, 0, 'no subsumed paths');
    });

    test('three paths with mixed overlap', () => {
      const features = makeUri('multi-path');
      const featuresAuth = vscode.Uri.joinPath(features, 'features/auth');
      const featuresAlt = makeUri('behave-ini');
      const result = dedupResolvedPaths(
        [features, featuresAuth, featuresAlt],
        ['multi-path', 'multi-path/features/auth', 'behave-ini'],
        [0, 1, 2]
      );
      assert.strictEqual(result.resolvedPaths.length, 2, 'multi-path + behave-ini survive');
      assert.strictEqual(result.subsumedPaths.length, 1, 'features/auth subsumed');
      assert.strictEqual(result.subsumedPaths[0].rawPath, 'multi-path/features/auth');
    });

    test('empty input returns empty output', () => {
      const result = dedupResolvedPaths([], [], []);
      assert.strictEqual(result.resolvedPaths.length, 0);
      assert.strictEqual(result.subsumedPaths.length, 0);
    });

  });


  suite('dedupResolvedPaths (Phase 8, D-09, D-11)', () => {

    function makeUri(p: string) {
      return vscode.Uri.file(path.join(fixtureRoot, p));
    }

    test('exact duplicate: two identical paths deduplicated to one', () => {
      const uri = makeUri('behave-ini/features');
      const result = dedupResolvedPaths([uri, uri], ['features', 'features'], [1, 2]);
      assert.strictEqual(result.resolvedPaths.length, 1, 'should have 1 path');
      assert.strictEqual(result.subsumedPaths.length, 1, 'should have 1 subsumed');
      assert.strictEqual(result.subsumedPaths[0].rawPath, 'features');
      assert.strictEqual(result.subsumedPaths[0].lineNumber, 2);
    });

    test('subsumption: parent contains child', () => {
      const parentUri = makeUri('multi-path');
      const childUri = vscode.Uri.joinPath(parentUri, 'features/auth');
      const result = dedupResolvedPaths(
        [parentUri, childUri],
        ['multi-path', 'multi-path/features/auth'],
        [0, 1]
      );
      assert.strictEqual(result.resolvedPaths.length, 1, 'parent should win');
      assert.strictEqual(result.subsumedPaths.length, 1);
      assert.strictEqual(result.subsumedPaths[0].subsumedBy, 'multi-path');
    });

    test('reverse order subsumption: child listed first, parent still wins', () => {
      const parentUri = makeUri('multi-path');
      const childUri = vscode.Uri.joinPath(parentUri, 'features/auth');
      const result = dedupResolvedPaths(
        [childUri, parentUri],
        ['multi-path/features/auth', 'multi-path'],
        [1, 0]
      );
      assert.strictEqual(result.resolvedPaths.length, 1, 'parent should win regardless of order');
      assert.ok(
        result.resolvedPaths[0].path.endsWith('multi-path'),
        'surviving path should be the parent'
      );
      assert.strictEqual(result.subsumedPaths[0].rawPath, 'multi-path/features/auth');
    });

    test('no overlap: both paths survive', () => {
      const uri1 = makeUri('behave-ini/features');
      const uri2 = makeUri('behaverc');
      const result = dedupResolvedPaths([uri1, uri2], ['features', 'behaverc'], [0, 1]);
      assert.strictEqual(result.resolvedPaths.length, 2, 'both should survive');
      assert.strictEqual(result.subsumedPaths.length, 0, 'no subsumed paths');
    });

    test('three paths with mixed overlap', () => {
      const features = makeUri('multi-path');
      const featuresAuth = vscode.Uri.joinPath(features, 'features/auth');
      const featuresAlt = makeUri('behave-ini');
      const result = dedupResolvedPaths(
        [features, featuresAuth, featuresAlt],
        ['multi-path', 'multi-path/features/auth', 'behave-ini'],
        [0, 1, 2]
      );
      assert.strictEqual(result.resolvedPaths.length, 2, 'multi-path + behave-ini survive');
      assert.strictEqual(result.subsumedPaths.length, 1, 'features/auth subsumed');
      assert.strictEqual(result.subsumedPaths[0].rawPath, 'multi-path/features/auth');
    });

    test('empty input returns empty output', () => {
      const result = dedupResolvedPaths([], [], []);
      assert.strictEqual(result.resolvedPaths.length, 0);
      assert.strictEqual(result.subsumedPaths.length, 0);
    });

  });


  suite('findBehaveConfig - no paths key defaults to features (behave default)', () => {

    test('INI with [behave] section but no paths key defaults to features/', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'no-paths-ini'));
      const result = findBehaveConfig(wkspUri);
      assert.ok(result, 'should return a result (not undefined)');
      assert.strictEqual(result.ok, true, 'should be ok:true');
      if (!result.ok) return;
      assert.deepStrictEqual(result.rawPaths, ['features'], 'rawPaths should default to features');
      assert.ok(
        result.resolvedPaths[0].fsPath.replace(/\\/g, '/').endsWith('no-paths-ini/features'),
        `resolvedPaths[0] ${result.resolvedPaths[0].fsPath} should end with no-paths-ini/features`
      );
      assert.ok(
        result.configFileUri.fsPath.replace(/\\/g, '/').endsWith('no-paths-ini/behave.ini'),
        `configFileUri ${result.configFileUri.fsPath} should end with behave.ini`
      );
      assert.strictEqual(result.pathLineNumbers.length, 1, 'should have 1 line number');
      // Line 0 is [behave] header
      assert.strictEqual(result.pathLineNumbers[0], 0, 'line number should point to [behave] header');
    });

    test('TOML with [tool.behave] section but no paths key defaults to features/', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'no-paths-toml'));
      const result = findBehaveConfig(wkspUri);
      assert.ok(result, 'should return a result (not undefined)');
      assert.strictEqual(result.ok, true, 'should be ok:true');
      if (!result.ok) return;
      assert.deepStrictEqual(result.rawPaths, ['features'], 'rawPaths should default to features');
      assert.ok(
        result.resolvedPaths[0].fsPath.replace(/\\/g, '/').endsWith('no-paths-toml/features'),
        `resolvedPaths[0] ${result.resolvedPaths[0].fsPath} should end with no-paths-toml/features`
      );
      assert.ok(
        result.configFileUri.fsPath.replace(/\\/g, '/').endsWith('no-paths-toml/pyproject.toml'),
        `configFileUri ${result.configFileUri.fsPath} should end with pyproject.toml`
      );
      assert.strictEqual(result.pathLineNumbers.length, 1, 'should have 1 line number');
      assert.strictEqual(result.pathLineNumbers[0], 0, 'line number should point to [tool.behave] header');
    });

  });

});