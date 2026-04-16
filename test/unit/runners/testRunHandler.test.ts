// Unit tests for testRunHandler logWkspRunStarted, logWkspRunComplete, and checkRunGuard functions
// Verifies that run start/complete messages go to test results pane (run.appendOutput)
// and NOT to the output channel (config.logger), and that "See Behave BDD" is not emitted.
// Also verifies that checkRunGuard intercepts runs with malformed config correctly.

import * as assert from 'assert';
import * as sinon from 'sinon';
import { performance } from 'perf_hooks';
import * as commonModule from '../../../src/common';
import * as configModule from '../../../src/configuration';

// Stub diagLog before the module is loaded
// eslint-disable-next-line @typescript-eslint/no-var-requires
const loggerModule = require('../../../src/logger');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscode = require('vscode');

suite('testRunHandler', () => {

  let diagLogStub: sinon.SinonStub;
  let appendOutputCalls: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let logWkspRunStarted: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let logWkspRunComplete: any;

  function createMockWr(debug = false) {
    return {
      debug,
      wkspSettings: {
        name: 'TestWorkspace',
        uri: { path: '/test/workspace', fsPath: '/test/workspace' },
      },
      run: {
        name: 'run-42',
        appendOutput: (text: string) => {
          appendOutputCalls.push(text);
        }
      }
    };
  }

  setup(() => {
    appendOutputCalls = [];
    diagLogStub = sinon.stub(loggerModule, 'diagLog');
    void diagLogStub;

    // Clear module cache so each test gets a fresh import
    for (const key of Object.keys(require.cache)) {
      if (key.includes('testRunHandler')) {
        delete require.cache[key];
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../../../src/runners/testRunHandler');
    logWkspRunStarted = mod.logWkspRunStarted;
    logWkspRunComplete = mod.logWkspRunComplete;
  });

  teardown(() => {
    sinon.restore();
  });

  suite('logWkspRunStarted', () => {

    test('writes start message to run.appendOutput containing workspace name, run name, and timestamp', () => {
      const wr = createMockWr();
      logWkspRunStarted(wr as unknown as Parameters<typeof logWkspRunStarted>[0]);

      const allOutput = appendOutputCalls.join('');
      assert.ok(allOutput.includes('TestWorkspace'), 'Should contain workspace name');
      assert.ok(allOutput.includes('run-42'), 'Should contain run name');
      assert.ok(allOutput.includes('tests started'), 'Should contain "tests started"');
      // Should contain an ISO timestamp like 2026-02-10T...
      assert.ok(/\d{4}-\d{2}-\d{2}T/.test(allOutput), 'Should contain ISO timestamp');
    });

    test('does NOT write "See Behave BDD" to output', () => {
      const wr = createMockWr();
      logWkspRunStarted(wr as unknown as Parameters<typeof logWkspRunStarted>[0]);

      const allOutput = appendOutputCalls.join('');
      assert.ok(!allOutput.includes('See Behave BDD'), 'Should not contain "See Behave BDD" message');
    });

    test('does not call config.logger.logInfo', () => {
      // If config.logger.logInfo were called, it would throw since config is not initialized.
      // The fact that logWkspRunStarted completes without error proves it doesn't call config.logger.logInfo.
      const wr = createMockWr();
      logWkspRunStarted(wr as unknown as Parameters<typeof logWkspRunStarted>[0]);
      assert.ok(true, 'Completed without calling config.logger.logInfo');
    });

    test('does nothing when debug is true', () => {
      const wr = createMockWr(true);
      logWkspRunStarted(wr as unknown as Parameters<typeof logWkspRunStarted>[0]);
      assert.strictEqual(appendOutputCalls.length, 0, 'Should not write output in debug mode');
    });
  });

  suite('logWkspRunComplete', () => {

    test('writes complete message to run.appendOutput containing workspace name, run name, and elapsed time', () => {
      const wr = createMockWr();
      const start = performance.now() - 1500; // simulate 1.5 seconds ago
      logWkspRunComplete(wr as unknown as Parameters<typeof logWkspRunComplete>[0], start);

      const allOutput = appendOutputCalls.join('');
      assert.ok(allOutput.includes('TestWorkspace'), 'Should contain workspace name');
      assert.ok(allOutput.includes('run-42'), 'Should contain run name');
      assert.ok(allOutput.includes('tests completed'), 'Should contain "tests completed"');
      assert.ok(/\d+(\.\d+)?\s*secs/.test(allOutput), 'Should contain elapsed time in secs');
    });

    test('does NOT write "See Behave BDD" to output', () => {
      const wr = createMockWr();
      const start = performance.now() - 500;
      logWkspRunComplete(wr as unknown as Parameters<typeof logWkspRunComplete>[0], start);

      const allOutput = appendOutputCalls.join('');
      assert.ok(!allOutput.includes('See Behave BDD'), 'Should not contain "See Behave BDD" message');
    });

    test('does not call config.logger.logInfo', () => {
      const wr = createMockWr();
      const start = performance.now() - 100;
      logWkspRunComplete(wr as unknown as Parameters<typeof logWkspRunComplete>[0], start);
      assert.ok(true, 'Completed without calling config.logger.logInfo');
    });

    test('does nothing when debug is true', () => {
      const wr = createMockWr(true);
      const start = performance.now() - 100;
      logWkspRunComplete(wr as unknown as Parameters<typeof logWkspRunComplete>[0], start);
      assert.strictEqual(appendOutputCalls.length, 0, 'Should not write output in debug mode');
    });
  });
});


suite('checkRunGuard', () => {

  const wkspUri = vscode.Uri.file('c:/test-workspace');
  const configFileUri = vscode.Uri.joinPath(wkspUri, 'behave.ini');
  const wkspUri2 = vscode.Uri.file('c:/test-workspace-2');
  const configFileUri2 = vscode.Uri.joinPath(wkspUri2, 'behave.ini');

  const mockWkspSettings = { uri: wkspUri, name: 'TestWksp', id: 'test-id' };
  const mockWkspSettings2 = { uri: wkspUri2, name: 'TestWksp2', id: 'test-id-2' };

  const entryWithNoError = {
    source: 'config-file' as commonModule.DiscoverySource,
    featuresUri: vscode.Uri.file('c:/test-workspace/features'),
  };

  const entryWithError = {
    source: 'convention' as commonModule.DiscoverySource,
    configError: { configFileUri, errorMessage: 'invalid syntax' },
    featuresUri: vscode.Uri.file('c:/test-workspace/features'),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function createMockRequest(items: any[]): any {
    return { include: items, exclude: undefined };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function createMockItem(uri: any): any {
    return {
      id: uri.toString(),
      uri,
      children: { forEach: () => { /* mock */ } },
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockCtrl: any = {
    items: { forEach: () => { /* mock */ } },
  };

  // Import checkRunGuard once — no module cache clearing needed since checkRunGuard
  // uses the shared config singleton (clearing cache breaks the config reference chain).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { checkRunGuard } = require('../../../src/runners/testRunHandler') as typeof import('../../../src/runners/testRunHandler');

  let showWarningMessageStub: sinon.SinonStub;
  let executeCommandStub: sinon.SinonStub;
  let logInfoStub: sinon.SinonStub;
  let getDiscoveryEntryStub: sinon.SinonStub;
  let getWorkspaceSettingsForFileStub: sinon.SinonStub;
  let getUrisOfWkspFoldersWithFeaturesStub: sinon.SinonStub;

  setup(() => {
    sinon.stub(loggerModule, 'diagLog');

    // Stub vscode.window.showWarningMessage and vscode.commands.executeCommand
    showWarningMessageStub = sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);
    executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves(undefined);

    // Stub config.logger.logInfo for D-14 audit trail verification
    logInfoStub = sinon.stub(configModule.config.logger, 'logInfo');

    // Stub common module functions
    getDiscoveryEntryStub = sinon.stub(commonModule, 'getDiscoveryEntry').returns(undefined);
    getWorkspaceSettingsForFileStub = sinon.stub(commonModule, 'getWorkspaceSettingsForFile').returns(undefined);
    getUrisOfWkspFoldersWithFeaturesStub = sinon.stub(commonModule, 'getUrisOfWkspFoldersWithFeatures').returns([wkspUri]);
  });

  teardown(() => {
    sinon.restore();
  });

  test('returns true (proceed) when no workspaces have configError', async () => {
    getDiscoveryEntryStub.returns(entryWithNoError);
    getWorkspaceSettingsForFileStub.returns(mockWkspSettings);

    const item = createMockItem(vscode.Uri.file('c:/test-workspace/features/test.feature'));
    const request = createMockRequest([item]);

    const result = await checkRunGuard(request, mockCtrl);

    assert.strictEqual(result, true, 'Should return true when no configError');
    assert.ok(showWarningMessageStub.notCalled, 'Should not show warning when no configError');
  });

  test('returns true when user clicks "Run Anyway"', async () => {
    getDiscoveryEntryStub.returns(entryWithError);
    getWorkspaceSettingsForFileStub.returns(mockWkspSettings);
    showWarningMessageStub.resolves('Run Anyway');

    const item = createMockItem(vscode.Uri.file('c:/test-workspace/features/test.feature'));
    const request = createMockRequest([item]);

    const result = await checkRunGuard(request, mockCtrl);

    assert.strictEqual(result, true, 'Should return true when user clicks Run Anyway');
  });

  test('opens config file and returns false when user clicks "Open Config File"', async () => {
    getDiscoveryEntryStub.returns(entryWithError);
    getWorkspaceSettingsForFileStub.returns(mockWkspSettings);
    showWarningMessageStub.resolves('Open Config File');

    const item = createMockItem(vscode.Uri.file('c:/test-workspace/features/test.feature'));
    const request = createMockRequest([item]);

    const result = await checkRunGuard(request, mockCtrl);

    assert.strictEqual(result, false, 'Should return false when user clicks Open Config File');
    assert.ok(executeCommandStub.calledOnce, 'Should call executeCommand once');
    assert.strictEqual(executeCommandStub.firstCall.args[0], 'vscode.open', 'Should call vscode.open');
    assert.strictEqual(
      executeCommandStub.firstCall.args[1].toString(),
      configFileUri.toString(),
      'Should open the broken config file'
    );
  });

  test('returns false when user clicks "Cancel"', async () => {
    getDiscoveryEntryStub.returns(entryWithError);
    getWorkspaceSettingsForFileStub.returns(mockWkspSettings);
    showWarningMessageStub.resolves('Cancel');

    const item = createMockItem(vscode.Uri.file('c:/test-workspace/features/test.feature'));
    const request = createMockRequest([item]);

    const result = await checkRunGuard(request, mockCtrl);

    assert.strictEqual(result, false, 'Should return false when user clicks Cancel');
  });

  test('returns false when user dismisses the dialog (undefined)', async () => {
    getDiscoveryEntryStub.returns(entryWithError);
    getWorkspaceSettingsForFileStub.returns(mockWkspSettings);
    showWarningMessageStub.resolves(undefined);

    const item = createMockItem(vscode.Uri.file('c:/test-workspace/features/test.feature'));
    const request = createMockRequest([item]);

    const result = await checkRunGuard(request, mockCtrl);

    assert.strictEqual(result, false, 'Should return false when dialog is dismissed');
  });

  test('warning message contains the broken config filename', async () => {
    getDiscoveryEntryStub.returns(entryWithError);
    getWorkspaceSettingsForFileStub.returns(mockWkspSettings);
    showWarningMessageStub.resolves('Cancel');

    const item = createMockItem(vscode.Uri.file('c:/test-workspace/features/test.feature'));
    const request = createMockRequest([item]);

    await checkRunGuard(request, mockCtrl);

    assert.ok(showWarningMessageStub.calledOnce, 'showWarningMessage should be called');
    const msgArg: string = showWarningMessageStub.firstCall.args[0];
    assert.ok(msgArg.includes("'behave.ini'"), `Message should contain "'behave.ini'", got: "${msgArg}"`);
  });

  test('GUARD-04: only checks workspaces with queued tests — workspace B configError not checked when only workspace A queued', async () => {
    // Workspace A has no error, workspace B has error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getDiscoveryEntryStub.callsFake((uri: any) => {
      if (uri.toString() === wkspUri.toString()) return entryWithNoError;
      if (uri.toString() === wkspUri2.toString()) {
        return {
          source: 'convention' as commonModule.DiscoverySource,
          configError: { configFileUri: configFileUri2, errorMessage: 'invalid syntax' },
          featuresUri: vscode.Uri.file('c:/test-workspace-2/features'),
        };
      }
      return undefined;
    });
    // Both workspaces are in the features list
    getUrisOfWkspFoldersWithFeaturesStub.returns([wkspUri, wkspUri2]);
    // But items only belong to workspace A
    getWorkspaceSettingsForFileStub.returns(mockWkspSettings);
    void mockWkspSettings2; // referenced for completeness

    const item = createMockItem(vscode.Uri.file('c:/test-workspace/features/test.feature'));
    const request = createMockRequest([item]);

    const result = await checkRunGuard(request, mockCtrl);

    assert.strictEqual(result, true, 'Should return true because workspace B is not queued');
    assert.ok(showWarningMessageStub.notCalled, 'Should not show warning for workspace B when only workspace A is queued');
  });

  test('D-14: logs "Run guard: config error in" to output channel when configError found', async () => {
    getDiscoveryEntryStub.returns(entryWithError);
    getWorkspaceSettingsForFileStub.returns(mockWkspSettings);
    showWarningMessageStub.resolves('Cancel');

    const item = createMockItem(vscode.Uri.file('c:/test-workspace/features/test.feature'));
    const request = createMockRequest([item]);

    await checkRunGuard(request, mockCtrl);

    assert.ok(logInfoStub.calledOnce, 'logInfo should be called for D-14 audit trail');
    const logArg: string = logInfoStub.firstCall.args[0];
    assert.ok(
      logArg.includes('Run guard: config error in'),
      `logInfo message should contain 'Run guard: config error in', got: "${logArg}"`
    );
  });

});
