// Unit tests for configWatcher - debounce logic and lifecycle management (TEST-07)

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as configModule from '../../../src/configuration';
import * as commonModule from '../../../src/common';
import * as loggerModule from '../../../src/logger';
import {
  startWatchingConfigFiles,
  clearConfigDebounceTimers,
} from '../../../src/watchers/configWatcher';

suite('configWatcher', () => {
  let clock: sinon.SinonFakeTimers;
  let createFileSystemWatcherStub: sinon.SinonStub;
  let getUrisOfWkspFoldersWithFeaturesStub: sinon.SinonStub;
  let parseFilesForWorkspaceStub: sinon.SinonStub;
  let onConfigChangedSpy: sinon.SinonSpy;
  let mockWatcher: {
    onDidCreate: sinon.SinonStub;
    onDidChange: sinon.SinonStub;
    onDidDelete: sinon.SinonStub;
    dispose: sinon.SinonStub;
  };

  const wkspUri = vscode.Uri.file('c:/test-workspace');
  const wkspUri2 = vscode.Uri.file('c:/test-workspace-2');
  const configFileUri = vscode.Uri.joinPath(wkspUri, 'behave.ini');
  const configFileUri2 = vscode.Uri.joinPath(wkspUri2, 'behave.ini');

  function makeMockWatcher() {
    return {
      onDidCreate: sinon.stub(),
      onDidChange: sinon.stub(),
      onDidDelete: sinon.stub(),
      dispose: sinon.stub(),
    };
  }

  setup(() => {
    clock = sinon.useFakeTimers();

    // Mock watcher that captures event handler registrations
    mockWatcher = makeMockWatcher();
    createFileSystemWatcherStub = sinon.stub(vscode.workspace, 'createFileSystemWatcher')
      .returns(mockWatcher as unknown as vscode.FileSystemWatcher);

    // Stub common module
    getUrisOfWkspFoldersWithFeaturesStub = sinon.stub(commonModule, 'getUrisOfWkspFoldersWithFeatures')
      .returns([wkspUri]);

    // Stub parser
    parseFilesForWorkspaceStub = sinon.stub().resolves(undefined);

    // Stub logger methods to prevent channel access errors
    sinon.stub(configModule.config.logger, 'showError');
    sinon.stub(configModule.config.logger, 'logInfo');
    sinon.stub(loggerModule, 'diagLog');

    onConfigChangedSpy = sinon.spy();
  });

  teardown(() => {
    // Clear any pending debounce timers before restoring clock
    clearConfigDebounceTimers();
    clock.restore();
    sinon.restore();
  });

  suite('debounce timing', () => {

    test('config file change does NOT trigger re-discovery before 500ms', async () => {
      const ctrlStub = {} as vscode.TestController;
      const testData = new WeakMap();
      const parserStub = { parseFilesForWorkspace: parseFilesForWorkspaceStub };

      startWatchingConfigFiles(wkspUri, ctrlStub, testData, parserStub as never, onConfigChangedSpy);

      // Invoke the onDidChange handler
      const changeHandler = mockWatcher.onDidChange.firstCall.args[0];
      changeHandler(configFileUri);

      // Advance only 499ms — should NOT fire
      await clock.tickAsync(499);

      assert.strictEqual(getUrisOfWkspFoldersWithFeaturesStub.callCount, 0,
        'getUrisOfWkspFoldersWithFeatures should NOT be called before 500ms');
      assert.strictEqual(onConfigChangedSpy.callCount, 0,
        'onConfigChanged should NOT be called before 500ms');
    });

    test('config file change triggers re-discovery after 500ms debounce', async () => {
      const ctrlStub = {} as vscode.TestController;
      const testData = new WeakMap();
      const parserStub = { parseFilesForWorkspace: parseFilesForWorkspaceStub };

      startWatchingConfigFiles(wkspUri, ctrlStub, testData, parserStub as never, onConfigChangedSpy);

      const changeHandler = mockWatcher.onDidChange.firstCall.args[0];
      changeHandler(configFileUri);

      // Advance past debounce interval
      await clock.tickAsync(500);

      assert.strictEqual(getUrisOfWkspFoldersWithFeaturesStub.callCount, 1,
        'getUrisOfWkspFoldersWithFeatures should be called once after 500ms');
      assert.strictEqual(onConfigChangedSpy.callCount, 1,
        'onConfigChanged should be called once after 500ms');
      assert.ok(onConfigChangedSpy.calledWith([wkspUri], true),
        'onConfigChanged should be called with [wkspUri] and clearNotifiedErrors=true');
    });

    test('rapid saves (5 events within 500ms) result in single re-discovery', async () => {
      const ctrlStub = {} as vscode.TestController;
      const testData = new WeakMap();
      const parserStub = { parseFilesForWorkspace: parseFilesForWorkspaceStub };

      startWatchingConfigFiles(wkspUri, ctrlStub, testData, parserStub as never, onConfigChangedSpy);

      const changeHandler = mockWatcher.onDidChange.firstCall.args[0];

      // Simulate 5 rapid saves
      changeHandler(configFileUri);
      changeHandler(configFileUri);
      changeHandler(configFileUri);
      changeHandler(configFileUri);
      changeHandler(configFileUri);

      await clock.tickAsync(500);

      assert.strictEqual(getUrisOfWkspFoldersWithFeaturesStub.callCount, 1,
        'getUrisOfWkspFoldersWithFeatures should only be called once despite 5 rapid events');
      assert.strictEqual(onConfigChangedSpy.callCount, 1,
        'onConfigChanged should only be called once despite 5 rapid events');
    });

    test('debounce timer resets on each event (400ms + event + 400ms = no fire, then 100ms more = fire)', async () => {
      const ctrlStub = {} as vscode.TestController;
      const testData = new WeakMap();
      const parserStub = { parseFilesForWorkspace: parseFilesForWorkspaceStub };

      startWatchingConfigFiles(wkspUri, ctrlStub, testData, parserStub as never, onConfigChangedSpy);

      const changeHandler = mockWatcher.onDidChange.firstCall.args[0];

      // First event at t=0
      changeHandler(configFileUri);

      // Advance 400ms — should not fire yet
      await clock.tickAsync(400);
      assert.strictEqual(onConfigChangedSpy.callCount, 0, 'should not fire at 400ms');

      // Second event at t=400 — resets timer
      changeHandler(configFileUri);

      // Advance 400ms more (800ms total, but only 400ms since last event) — should not fire
      await clock.tickAsync(400);
      assert.strictEqual(onConfigChangedSpy.callCount, 0, 'should not fire — timer was reset');

      // Advance 100ms more (500ms since last event) — should fire
      await clock.tickAsync(100);
      assert.strictEqual(onConfigChangedSpy.callCount, 1, 'should fire now — 500ms since last event');
    });

  });

  suite('independent workspace timers', () => {

    test('workspace A debounce timer is independent from workspace B', async () => {
      const ctrlStub = {} as vscode.TestController;
      const testData = new WeakMap();
      const parserStub = { parseFilesForWorkspace: parseFilesForWorkspaceStub };

      // Create two separate mock watchers for two workspaces
      const mockWatcher2 = makeMockWatcher();

      // First call returns mockWatcher (for wkspUri), second returns mockWatcher2 (for wkspUri2)
      createFileSystemWatcherStub.onFirstCall().returns(mockWatcher as unknown as vscode.FileSystemWatcher);
      createFileSystemWatcherStub.onSecondCall().returns(mockWatcher2 as unknown as vscode.FileSystemWatcher);

      const onConfigChangedSpyA = sinon.spy();
      const onConfigChangedSpyB = sinon.spy();

      startWatchingConfigFiles(wkspUri, ctrlStub, testData, parserStub as never, onConfigChangedSpyA);
      startWatchingConfigFiles(wkspUri2, ctrlStub, testData, parserStub as never, onConfigChangedSpyB);

      const changeHandlerA = mockWatcher.onDidChange.firstCall.args[0];
      const changeHandlerB = mockWatcher2.onDidChange.firstCall.args[0];

      // Trigger workspace A at t=0
      changeHandlerA(configFileUri);

      // Advance 300ms
      await clock.tickAsync(300);

      // Trigger workspace B at t=300
      changeHandlerB(configFileUri2);

      // Advance 200ms (t=500) — workspace A fires (500ms since its event), B does not (200ms)
      await clock.tickAsync(200);
      assert.strictEqual(onConfigChangedSpyA.callCount, 1, 'workspace A should fire at t=500');
      assert.strictEqual(onConfigChangedSpyB.callCount, 0, 'workspace B should NOT fire yet at t=500');

      // Advance 300ms (t=800) — workspace B fires (500ms since its event at t=300)
      await clock.tickAsync(300);
      assert.strictEqual(onConfigChangedSpyA.callCount, 1, 'workspace A should still have fired only once');
      assert.strictEqual(onConfigChangedSpyB.callCount, 1, 'workspace B should fire at t=800');
    });

  });

  suite('all three event types', () => {

    test('onDidCreate event triggers debounced re-discovery', async () => {
      const ctrlStub = {} as vscode.TestController;
      const testData = new WeakMap();
      const parserStub = { parseFilesForWorkspace: parseFilesForWorkspaceStub };

      startWatchingConfigFiles(wkspUri, ctrlStub, testData, parserStub as never, onConfigChangedSpy);

      const createHandler = mockWatcher.onDidCreate.firstCall.args[0];
      createHandler(configFileUri);
      await clock.tickAsync(500);

      assert.strictEqual(onConfigChangedSpy.callCount, 1,
        'onConfigChanged should be called after onDidCreate event fires and debounce elapses');
    });

    test('onDidChange event triggers debounced re-discovery', async () => {
      const ctrlStub = {} as vscode.TestController;
      const testData = new WeakMap();
      const parserStub = { parseFilesForWorkspace: parseFilesForWorkspaceStub };

      startWatchingConfigFiles(wkspUri, ctrlStub, testData, parserStub as never, onConfigChangedSpy);

      const changeHandler = mockWatcher.onDidChange.firstCall.args[0];
      changeHandler(configFileUri);
      await clock.tickAsync(500);

      assert.strictEqual(onConfigChangedSpy.callCount, 1,
        'onConfigChanged should be called after onDidChange event fires and debounce elapses');
    });

    test('onDidDelete event triggers debounced re-discovery', async () => {
      const ctrlStub = {} as vscode.TestController;
      const testData = new WeakMap();
      const parserStub = { parseFilesForWorkspace: parseFilesForWorkspaceStub };

      startWatchingConfigFiles(wkspUri, ctrlStub, testData, parserStub as never, onConfigChangedSpy);

      const deleteHandler = mockWatcher.onDidDelete.firstCall.args[0];
      deleteHandler(configFileUri);
      await clock.tickAsync(500);

      assert.strictEqual(onConfigChangedSpy.callCount, 1,
        'onConfigChanged should be called after onDidDelete event fires and debounce elapses');
    });

  });

  suite('clearConfigDebounceTimers', () => {

    test('clearConfigDebounceTimers() cancels pending timers (they do not fire after clear)', async () => {
      const ctrlStub = {} as vscode.TestController;
      const testData = new WeakMap();
      const parserStub = { parseFilesForWorkspace: parseFilesForWorkspaceStub };

      startWatchingConfigFiles(wkspUri, ctrlStub, testData, parserStub as never, onConfigChangedSpy);

      const changeHandler = mockWatcher.onDidChange.firstCall.args[0];
      changeHandler(configFileUri);

      // Clear timers before they fire
      clearConfigDebounceTimers();

      // Advance past debounce — timers should NOT fire
      await clock.tickAsync(500);

      assert.strictEqual(onConfigChangedSpy.callCount, 0,
        'onConfigChanged should NOT be called after clearConfigDebounceTimers()');
      assert.strictEqual(getUrisOfWkspFoldersWithFeaturesStub.callCount, 0,
        'getUrisOfWkspFoldersWithFeatures should NOT be called after clearConfigDebounceTimers()');
    });

  });

  suite('non-file URI filtering', () => {

    test('non-file scheme URIs are ignored (no re-discovery triggered)', async () => {
      const ctrlStub = {} as vscode.TestController;
      const testData = new WeakMap();
      const parserStub = { parseFilesForWorkspace: parseFilesForWorkspaceStub };

      startWatchingConfigFiles(wkspUri, ctrlStub, testData, parserStub as never, onConfigChangedSpy);

      const changeHandler = mockWatcher.onDidChange.firstCall.args[0];

      // Invoke with a non-file URI (e.g. git scheme) — use git:// with double-slash
      const gitUri = vscode.Uri.parse('git:///c:/test-workspace/behave.ini');
      changeHandler(gitUri);

      await clock.tickAsync(500);

      assert.strictEqual(onConfigChangedSpy.callCount, 0,
        'onConfigChanged should NOT be called for non-file scheme URIs');
      assert.strictEqual(getUrisOfWkspFoldersWithFeaturesStub.callCount, 0,
        'getUrisOfWkspFoldersWithFeatures should NOT be called for non-file scheme URIs');
    });

  });

});
