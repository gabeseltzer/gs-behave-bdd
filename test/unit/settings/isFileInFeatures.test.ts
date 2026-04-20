// Unit tests for WorkspaceSettings.isFileInFeatures (D-08):
// Returns true if a URI is under any featuresUri root, false otherwise.
// Uses the sibling-prefix guard (root.path + '/') and urisMatch for exact-root case.

import * as assert from 'assert';
import { WorkspaceSettings } from '../../../src/settings';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscode = require('vscode');

// Duck-typed fake — isFileInFeatures reads only this.featuresUris
function fakeSettings(featuresUris: typeof vscode.Uri[]): WorkspaceSettings {
  return { featuresUris } as unknown as WorkspaceSettings;
}


suite('isFileInFeatures (D-08)', () => {

  const WKSP = vscode.Uri.file('/fake/wksp');

  test('single root: file inside returns true', () => {
    const root = vscode.Uri.joinPath(WKSP, 'features');
    const settings = fakeSettings([root]);
    const fileUri = vscode.Uri.joinPath(root, 'sub', 'test.feature');

    const result = WorkspaceSettings.prototype.isFileInFeatures.call(settings, fileUri);

    assert.strictEqual(result, true);
  });

  test('single root: file outside returns false', () => {
    const root = vscode.Uri.joinPath(WKSP, 'features');
    const settings = fakeSettings([root]);
    const fileUri = vscode.Uri.joinPath(WKSP, 'other', 'test.feature');

    const result = WorkspaceSettings.prototype.isFileInFeatures.call(settings, fileUri);

    assert.strictEqual(result, false);
  });

  test('multi-path: file under second root returns true', () => {
    const rootA = vscode.Uri.joinPath(WKSP, 'features-a');
    const rootB = vscode.Uri.joinPath(WKSP, 'features-b');
    const settings = fakeSettings([rootA, rootB]);
    const fileUri = vscode.Uri.joinPath(rootB, 'deep', 'test.feature');

    const result = WorkspaceSettings.prototype.isFileInFeatures.call(settings, fileUri);

    assert.strictEqual(result, true);
  });

  test('exact-root URI returns true (via urisMatch)', () => {
    const root = vscode.Uri.joinPath(WKSP, 'features');
    const settings = fakeSettings([root]);

    const result = WorkspaceSettings.prototype.isFileInFeatures.call(settings, root);

    assert.strictEqual(result, true);
  });

  test('sibling-prefix guard: /features does NOT match /featuresX (Pitfall 3)', () => {
    const root = vscode.Uri.joinPath(WKSP, 'features');
    const settings = fakeSettings([root]);
    const fileUri = vscode.Uri.joinPath(WKSP, 'featuresX', 'test.feature');

    const result = WorkspaceSettings.prototype.isFileInFeatures.call(settings, fileUri);

    assert.strictEqual(result, false);
  });

  test('multi-path: file outside all roots returns false', () => {
    const rootA = vscode.Uri.joinPath(WKSP, 'features-a');
    const rootB = vscode.Uri.joinPath(WKSP, 'features-b');
    const settings = fakeSettings([rootA, rootB]);
    const fileUri = vscode.Uri.joinPath(WKSP, 'totally-different', 'test.feature');

    const result = WorkspaceSettings.prototype.isFileInFeatures.call(settings, fileUri);

    assert.strictEqual(result, false);
  });

});
