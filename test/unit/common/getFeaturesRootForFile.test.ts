import * as assert from 'assert';
import * as vscode from 'vscode';
import { getFeaturesRootForFile } from '../../../src/common';
import type { WorkspaceSettings } from '../../../src/settings';

// Partial-mock helper — getFeaturesRootForFile reads wkspSettings.featuresUris,
// so an object with just that field is sufficient (duck-typed fake, cast via unknown).
function fakeWkspSettings(featuresUris: vscode.Uri[]): WorkspaceSettings {
  return { featuresUris } as unknown as WorkspaceSettings;
}

suite('getFeaturesRootForFile (D-09)', () => {

  test('multi-path: returns matching root for a file under second root', () => {
    const wkspRoot = vscode.Uri.file('/fake/wksp');
    const rootA = vscode.Uri.joinPath(wkspRoot, 'features-a');
    const rootB = vscode.Uri.joinPath(wkspRoot, 'features-b');
    const settings = fakeWkspSettings([rootA, rootB]);
    const fileUri = vscode.Uri.joinPath(rootB, 'foo.feature');

    const result = getFeaturesRootForFile(settings, fileUri);

    assert.ok(result !== undefined, 'should return a matching root');
    assert.strictEqual(result?.toString(), rootB.toString(),
      'should return rootB (the root containing the file)');
  });

  test('single-path: returns the sole root for a descendant file', () => {
    const wkspRoot = vscode.Uri.file('/fake/wksp');
    const root = vscode.Uri.joinPath(wkspRoot, 'features');
    const settings = fakeWkspSettings([root]);
    const fileUri = vscode.Uri.joinPath(root, 'sub', 'nested.feature');

    const result = getFeaturesRootForFile(settings, fileUri);

    assert.ok(result !== undefined);
    assert.strictEqual(result?.toString(), root.toString());
  });

  test('no-match: returns undefined for file outside every root', () => {
    const wkspRoot = vscode.Uri.file('/fake/wksp');
    const rootA = vscode.Uri.joinPath(wkspRoot, 'features-a');
    const settings = fakeWkspSettings([rootA]);
    const fileUri = vscode.Uri.joinPath(wkspRoot, 'other', 'foo.feature');

    const result = getFeaturesRootForFile(settings, fileUri);

    assert.strictEqual(result, undefined,
      'should return undefined when file is not inside any configured root');
  });

  test('exact-root URI: returns the root (via urisMatch)', () => {
    const wkspRoot = vscode.Uri.file('/fake/wksp');
    const rootA = vscode.Uri.joinPath(wkspRoot, 'features');
    const settings = fakeWkspSettings([rootA]);

    const result = getFeaturesRootForFile(settings, rootA);

    assert.ok(result !== undefined,
      'should match exact-root URI (not only strict descendants)');
    assert.strictEqual(result?.toString(), rootA.toString());
  });

  test('sibling-prefix guard: /features does NOT match /featuresX (Pitfall 3)', () => {
    const wkspRoot = vscode.Uri.file('/fake/wksp');
    const root = vscode.Uri.joinPath(wkspRoot, 'features');
    const settings = fakeWkspSettings([root]);
    // featuresX is a sibling directory whose path starts with "features"
    const fileUri = vscode.Uri.joinPath(wkspRoot, 'featuresX', 'foo.feature');

    const result = getFeaturesRootForFile(settings, fileUri);

    assert.strictEqual(result, undefined,
      'sibling-prefix directory must NOT match — Pitfall 3 guard prevents featuresX matching features');
  });
});
