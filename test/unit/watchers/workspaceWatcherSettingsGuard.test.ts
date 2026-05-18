// Regression: startWatchingWorkspace must silently no-op when config.workspaceSettings[uri.path]
// is undefined (i.e. a FATAL WorkspaceSettings construction error). The configuration getter is the
// single source of the user-facing notification; the watcher must not cascade a second one.

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as configModule from '../../../src/configuration';
import { startWatchingWorkspace } from '../../../src/watchers/workspaceWatcher';

suite('workspaceWatcher - settings guard', () => {
  const wkspUri = vscode.Uri.file('c:/test-workspace-fatal');
  let createWatcherStub: sinon.SinonStub;
  let showErrorStub: sinon.SinonStub;

  setup(() => {
    createWatcherStub = sinon.stub(vscode.workspace, 'createFileSystemWatcher');
    showErrorStub = sinon.stub(configModule.config.logger, 'showError');
    sinon.stub(configModule.config.logger, 'logInfo');
  });

  teardown(() => sinon.restore());

  test('returns empty array and does not throw when wkspSettings is undefined', () => {
    sinon.stub(configModule.config, 'workspaceSettings').get(() => ({}));

    const result = startWatchingWorkspace(
      wkspUri,
      {} as vscode.TestController,
      {} as never,
      {} as never,
    );

    assert.ok(Array.isArray(result), 'expected an array return');
    assert.strictEqual(result.length, 0, 'expected zero watchers');
  });

  test('does NOT call createFileSystemWatcher when wkspSettings is undefined', () => {
    sinon.stub(configModule.config, 'workspaceSettings').get(() => ({}));

    startWatchingWorkspace(wkspUri, {} as vscode.TestController, {} as never, {} as never);

    assert.strictEqual(createWatcherStub.callCount, 0,
      'guard must not create any file system watchers when settings are missing');
  });

  test('does NOT call logger.showError (configuration getter owns that)', () => {
    sinon.stub(configModule.config, 'workspaceSettings').get(() => ({}));

    startWatchingWorkspace(wkspUri, {} as vscode.TestController, {} as never, {} as never);

    assert.strictEqual(showErrorStub.callCount, 0,
      'guard must remain silent — configuration.ts already surfaced the FATAL error');
  });
});
