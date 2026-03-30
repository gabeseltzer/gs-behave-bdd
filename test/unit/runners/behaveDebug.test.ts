// Unit tests for behaveDebug module
// Tests that debugBehaveInstance passes correct launch config to vscode.debug.startDebugging

import * as assert from 'assert';
import * as path from 'path';
import * as sinon from 'sinon';

// Stub diagLog before module loading so it doesn't trigger config.globalSettings access
// eslint-disable-next-line @typescript-eslint/no-var-requires
const loggerModule = require('../../../src/logger');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscode = require('vscode');

suite('behaveDebug', () => {

  let diagLogStub: sinon.SinonStub;
  let startDebuggingStub: sinon.SinonStub;
  let debugBehaveInstance: typeof import('../../../src/runners/behaveDebug').debugBehaveInstance;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let capturedConfig: any;

  function createMockWr(overrides?: {
    importStrategy?: string;
    justMyCode?: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onCancellationRequested?: (cb: () => void) => any;
  }) {
    return {
      pythonExec: 'python',
      wkspSettings: {
        uri: { path: '/test/workspace', fsPath: '/test/workspace' },
        projectUri: { path: '/test/project', fsPath: '/test/project' },
        name: 'test-wksp',
        importStrategy: overrides?.importStrategy ?? 'useBundled',
        justMyCode: overrides?.justMyCode ?? true,
        getEffectiveEnvVars: () => ({})
      },
      run: {
        name: 'test-run-1',
        token: {
          isCancellationRequested: false,
          onCancellationRequested: overrides?.onCancellationRequested ?? (() => ({ dispose: () => { /* mock */ } }))
        },
        appendOutput: () => { /* mock */ }
      }
    };
  }

  setup(() => {
    capturedConfig = undefined;
    diagLogStub = sinon.stub(loggerModule, 'diagLog');
    void diagLogStub;

    // Mock config.extensionTempFilesUri via global
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).config = {
      extensionTempFilesUri: vscode.Uri.file(path.join('/tmp', 'behave-vsc-gs')),
      integrationTestRun: false
    };

    // Stub vscode.debug.startDebugging to capture the launch config
    startDebuggingStub = sinon.stub(vscode.debug, 'startDebugging').callsFake(
      async (_folder: unknown, config: unknown) => {
        capturedConfig = config;
        return true;
      }
    );

    // Clear module cache so each test gets fresh imports with stubs active
    for (const key of Object.keys(require.cache)) {
      if (key.includes('behaveDebug') || key.includes('configuration')) {
        delete require.cache[key];
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    debugBehaveInstance = require('../../../src/runners/behaveDebug').debugBehaveInstance;
  });

  teardown(() => {
    sinon.restore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (global as any).config;
  });

  test('should pass module "behave" in debug launch config', async () => {
    const mockWr = createMockWr();
    await debugBehaveInstance(
      mockWr as unknown as Parameters<typeof debugBehaveInstance>[0],
      ['features/test.feature'],
      'behave features/test.feature'
    );

    assert.ok(capturedConfig, 'startDebugging should have been called');
    assert.strictEqual(capturedConfig.module, 'behave');
    assert.strictEqual(capturedConfig.type, 'python');
    assert.strictEqual(capturedConfig.request, 'launch');
  });

  test('should include bundled PYTHONPATH in env when importStrategy is useBundled', async () => {
    const mockWr = createMockWr({ importStrategy: 'useBundled' });
    await debugBehaveInstance(
      mockWr as unknown as Parameters<typeof debugBehaveInstance>[0],
      ['features/test.feature'],
      'behave features/test.feature'
    );

    assert.ok(capturedConfig, 'startDebugging should have been called');
    assert.ok(capturedConfig.env, 'env should be set');
    assert.ok(capturedConfig.env['PYTHONPATH'], 'PYTHONPATH should be set');

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getBundledBehavePath } = require('../../../src/bundledBehave');
    const bundledPath = getBundledBehavePath();

    // When useBundled, bundled path should be at the start of PYTHONPATH
    assert.ok(
      capturedConfig.env['PYTHONPATH'].startsWith(bundledPath),
      `PYTHONPATH should start with bundled path. Got: ${capturedConfig.env['PYTHONPATH']}`
    );
  });

  test('should include bundled PYTHONPATH as fallback in env when importStrategy is fromEnvironment', async () => {
    const mockWr = createMockWr({ importStrategy: 'fromEnvironment' });
    await debugBehaveInstance(
      mockWr as unknown as Parameters<typeof debugBehaveInstance>[0],
      ['features/test.feature'],
      'behave features/test.feature'
    );

    assert.ok(capturedConfig, 'startDebugging should have been called');
    assert.ok(capturedConfig.env, 'env should be set');
    assert.ok(capturedConfig.env['PYTHONPATH'], 'PYTHONPATH should be set');

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getBundledBehavePath } = require('../../../src/bundledBehave');
    const bundledPath = getBundledBehavePath();

    // When fromEnvironment, bundled path should be at the end (fallback)
    assert.ok(
      capturedConfig.env['PYTHONPATH'].endsWith(bundledPath),
      `PYTHONPATH should end with bundled path. Got: ${capturedConfig.env['PYTHONPATH']}`
    );
  });

  test('should include rules to exclude bundled behave from debugging', async () => {
    const mockWr = createMockWr();
    await debugBehaveInstance(
      mockWr as unknown as Parameters<typeof debugBehaveInstance>[0],
      ['features/test.feature'],
      'behave features/test.feature'
    );

    assert.ok(capturedConfig.rules, 'rules should be set in debug config');
    assert.ok(Array.isArray(capturedConfig.rules), 'rules should be an array');

    // Should have a path rule for bundled libs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pathRule = capturedConfig.rules.find((r: any) => r.path);
    assert.ok(pathRule, 'should have a path-based rule');
    assert.strictEqual(pathRule.include, false);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getBundledBehavePath } = require('../../../src/bundledBehave');
    assert.strictEqual(pathRule.path, getBundledBehavePath());

    // Should have a module rule for behave
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const moduleRule = capturedConfig.rules.find((r: any) => r.module === 'behave');
    assert.ok(moduleRule, 'should have a module-based rule for behave');
    assert.strictEqual(moduleRule.include, false);
  });

  test('should pass justMyCode setting to debug config', async () => {
    // Test with justMyCode = true
    const mockWrTrue = createMockWr({ justMyCode: true });
    await debugBehaveInstance(
      mockWrTrue as unknown as Parameters<typeof debugBehaveInstance>[0],
      ['features/test.feature'],
      'behave features/test.feature'
    );
    assert.strictEqual(capturedConfig.justMyCode, true);

    // Test with justMyCode = false
    capturedConfig = undefined;
    const mockWrFalse = createMockWr({ justMyCode: false });
    await debugBehaveInstance(
      mockWrFalse as unknown as Parameters<typeof debugBehaveInstance>[0],
      ['features/test.feature'],
      'behave features/test.feature'
    );
    assert.strictEqual(capturedConfig.justMyCode, false);
  });


  suite('debug session lifecycle', () => {

    test('should register terminate listener before calling startDebugging', async () => {
      const callOrder: string[] = [];

      // Stub onDidTerminateDebugSession to track call order and fire immediately
      const onDidTerminateStub = sinon.stub(vscode.debug, 'onDidTerminateDebugSession').callsFake(
        (listener: () => void) => {
          callOrder.push('onDidTerminateDebugSession');
          setTimeout(listener, 0);
          return { dispose: () => { /* mock */ } };
        }
      );
      void onDidTerminateStub;

      // Override startDebugging to track call order
      startDebuggingStub.restore();
      sinon.stub(vscode.debug, 'startDebugging').callsFake(
        async (_folder: unknown, config: unknown) => {
          callOrder.push('startDebugging');
          capturedConfig = config;
          return true;
        }
      );

      const mockWr = createMockWr();
      await debugBehaveInstance(
        mockWr as unknown as Parameters<typeof debugBehaveInstance>[0],
        ['features/test.feature'],
        'behave features/test.feature'
      );

      assert.strictEqual(callOrder[0], 'onDidTerminateDebugSession',
        'terminate listener should be registered before startDebugging');
      assert.strictEqual(callOrder[1], 'startDebugging',
        'startDebugging should be called after listener registration');
    });


    test('should resolve and call stopDebugging on timeout when session does not terminate', async () => {
      const clock = sinon.useFakeTimers();

      try {
        // Stub onDidTerminateDebugSession to NOT fire
        sinon.stub(vscode.debug, 'onDidTerminateDebugSession').callsFake(
          () => ({ dispose: () => { /* mock */ } })
        );

        const stopStub = sinon.stub(vscode.debug, 'stopDebugging').resolves();

        startDebuggingStub.restore();
        sinon.stub(vscode.debug, 'startDebugging').callsFake(
          async () => true
        );

        const mockWr = createMockWr();
        const promise = debugBehaveInstance(
          mockWr as unknown as Parameters<typeof debugBehaveInstance>[0],
          ['features/test.feature'],
          'behave features/test.feature'
        );

        // Advance past the 120s timeout (non-integration test)
        await clock.tickAsync(120001);

        await promise;

        assert.ok(stopStub.called, 'stopDebugging should be called on timeout');
      }
      finally {
        clock.restore();
      }
    });


    test('should resolve and call stopDebugging when cancellation token fires', async () => {
      const clock = sinon.useFakeTimers();

      try {
        // Stub onDidTerminateDebugSession to NOT fire
        sinon.stub(vscode.debug, 'onDidTerminateDebugSession').callsFake(
          () => ({ dispose: () => { /* mock */ } })
        );

        const stopStub = sinon.stub(vscode.debug, 'stopDebugging').resolves();

        startDebuggingStub.restore();
        sinon.stub(vscode.debug, 'startDebugging').callsFake(
          async () => true
        );

        // Capture the cancellation callback so we can fire it
        let cancelCallback: (() => void) | undefined;
        const mockWr = createMockWr({
          onCancellationRequested: (cb: () => void) => {
            cancelCallback = cb;
            return { dispose: () => { /* mock */ } };
          }
        });

        const promise = debugBehaveInstance(
          mockWr as unknown as Parameters<typeof debugBehaveInstance>[0],
          ['features/test.feature'],
          'behave features/test.feature'
        );

        // Let startDebugging resolve
        await clock.tickAsync(0);

        // Fire cancellation
        assert.ok(cancelCallback, 'cancellation callback should have been registered');
        cancelCallback!();

        // Let microtasks process
        await clock.tickAsync(0);

        await promise;

        assert.ok(stopStub.called, 'stopDebugging should be called on cancellation');
      }
      finally {
        clock.restore();
      }
    });


    test('should dispose terminate listener when startDebugging returns false', async () => {
      let terminateDisposed = false;

      sinon.stub(vscode.debug, 'onDidTerminateDebugSession').callsFake(
        () => ({ dispose: () => { terminateDisposed = true; } })
      );

      startDebuggingStub.restore();
      sinon.stub(vscode.debug, 'startDebugging').callsFake(
        async () => false
      );

      const mockWr = createMockWr();
      await debugBehaveInstance(
        mockWr as unknown as Parameters<typeof debugBehaveInstance>[0],
        ['features/test.feature'],
        'behave features/test.feature'
      );

      assert.ok(terminateDisposed, 'terminate listener should be disposed when startDebugging returns false');
    });


    test('should not call stopDebugging on normal session termination', async () => {
      // Stub onDidTerminateDebugSession to fire immediately
      sinon.stub(vscode.debug, 'onDidTerminateDebugSession').callsFake(
        (listener: () => void) => {
          setTimeout(listener, 0);
          return { dispose: () => { /* mock */ } };
        }
      );

      const stopStub = sinon.stub(vscode.debug, 'stopDebugging').resolves();

      const mockWr = createMockWr();
      await debugBehaveInstance(
        mockWr as unknown as Parameters<typeof debugBehaveInstance>[0],
        ['features/test.feature'],
        'behave features/test.feature'
      );

      assert.ok(!stopStub.called, 'stopDebugging should NOT be called on normal termination');
    });
  });
});
