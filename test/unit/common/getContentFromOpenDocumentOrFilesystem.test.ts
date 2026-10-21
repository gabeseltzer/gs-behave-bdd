import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { getContentFromOpenDocumentOrFilesystem } from '../../../src/common';

// Re-parses (tree expansion, full refresh) must see unsaved edits in open documents rather
// than reverting the parse to the on-disk text.
suite('getContentFromOpenDocumentOrFilesystem', () => {
  let sandbox: sinon.SinonSandbox;
  const featureUri = vscode.Uri.file('/fake/wksp/features/a.feature');

  setup(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(vscode.workspace.fs, 'readFile').resolves(Buffer.from('on disk'));
  });
  teardown(() => sandbox.restore());

  test('returns the open document\'s (unsaved) text', async () => {
    sandbox.stub(vscode.workspace, 'textDocuments').value([
      { uri: vscode.Uri.file('/fake/wksp/features/other.feature'), getText: () => 'other' },
      { uri: vscode.Uri.file('/fake/wksp/features/a.feature'), getText: () => 'unsaved edit' },
    ]);
    assert.strictEqual(await getContentFromOpenDocumentOrFilesystem(featureUri), 'unsaved edit');
  });

  test('falls back to the file on disk when the document is not open', async () => {
    sandbox.stub(vscode.workspace, 'textDocuments').value([]);
    assert.strictEqual(await getContentFromOpenDocumentOrFilesystem(featureUri), 'on disk');
  });
});
