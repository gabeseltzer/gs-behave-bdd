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
          onCancellationRequested: () => ({ dispose: () => { /* mock */ } })
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
      extensionTempFilesUri: vscode.Uri.file(path.join('/tmp', 'behave-vsc'))
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
});
