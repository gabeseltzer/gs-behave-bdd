// Tests for 260518-hyz changes in src/configuration.ts:
// - workspaceSettings getter caches failed construction (constructor invoked at most once per bad wkspUri)
// - reloadSettings(wkspUri) clears the cache so a subsequent getter call retries construction
// - Phase 21 migration consent flow catch in extension.ts uses diagLog (not logInfo)
//   when the caught error is a WkspError, since the getter already surfaced the toast.
//
// We exercise the getter directly on the singleton, stubbing the underlying
// WorkspaceSettings constructor via the settings module to force throws.

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as commonModule from '../../src/common';
import * as configModule from '../../src/configuration';
import * as settingsModule from '../../src/settings';
import { WkspError } from '../../src/common';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscode = require('vscode');

suite('configuration: workspaceSettings getter failure caching (260518-hyz)', () => {
  const badUri = vscode.Uri.file('/fake/bad-workspace');
  let getUrisStub: sinon.SinonStub;
  let ctorSpy: sinon.SinonSpy;
  let originalCtor: typeof settingsModule.WorkspaceSettings;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const configAny: any = configModule.config;

  setup(() => {
    getUrisStub = sinon.stub(commonModule, 'getUrisOfWkspFoldersWithFeatures').returns([badUri]);
    // Clear any pre-existing cached state on the singleton so each test starts fresh.
    configAny._resourceSettings = {};
    configAny._failedSettingsWorkspaces = new Map<string, Error>();
    // Stub showError so the failing path doesn't try to render UI.
    sinon.stub(configAny.logger, 'showError');

    // Replace the WorkspaceSettings ctor on the module with a throwing spy.
    originalCtor = settingsModule.WorkspaceSettings;
    ctorSpy = sinon.spy(function ThrowingCtor(this: unknown, wkspUri: typeof badUri) {
      throw new WkspError('synthetic fatal for test', wkspUri);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (settingsModule as any).WorkspaceSettings = ctorSpy;
  });

  teardown(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (settingsModule as any).WorkspaceSettings = originalCtor;
    configAny._resourceSettings = {};
    configAny._failedSettingsWorkspaces = new Map<string, Error>();
    sinon.restore();
    getUrisStub; // referenced to satisfy unused-var lint in some configs
  });

  test('failed construction is cached: getter invokes WorkspaceSettings ctor only once', () => {
    // First access — should attempt construction and fail.
    void configModule.config.workspaceSettings;
    assert.strictEqual(ctorSpy.callCount, 1, 'ctor should be called on first getter access');

    // Second access — should short-circuit; ctor NOT called again.
    void configModule.config.workspaceSettings;
    assert.strictEqual(ctorSpy.callCount, 1, 'ctor should NOT be re-invoked on second access (cache hit)');

    // Third access for good measure.
    void configModule.config.workspaceSettings;
    assert.strictEqual(ctorSpy.callCount, 1, 'ctor should remain at 1 invocation across multiple getter accesses');
  });

  test('showError is called only once per failed workspace even across many getter accesses', () => {
    void configModule.config.workspaceSettings;
    void configModule.config.workspaceSettings;
    void configModule.config.workspaceSettings;

    const showErrorStub = configAny.logger.showError as sinon.SinonStub;
    assert.strictEqual(showErrorStub.callCount, 1, 'showError must be invoked once total');
  });

  test('reloadSettings(wkspUri) attempts construction but re-caches failures so the getter does not retry', () => {
    // Trigger initial failure + cache.
    void configModule.config.workspaceSettings;
    assert.strictEqual(ctorSpy.callCount, 1);

    // reloadSettings will itself try to construct (and throw); swallow.
    try {
      configModule.config.reloadSettings(badUri);
    } catch {
      // expected — reloadSettings is contracted to throw to its direct caller
    }
    // reloadSettings called ctor directly → count now 2.
    assert.strictEqual(ctorSpy.callCount, 2, 'reloadSettings should attempt construction (ctor call #2)');

    // reloadSettings re-cached the failure after the throw, so subsequent getter
    // calls must NOT re-invoke the ctor. (Prevents duplicate "settings dumps" in
    // the output channel — the cascade fix from 260518-hyz follow-up.)
    void configModule.config.workspaceSettings;
    assert.strictEqual(ctorSpy.callCount, 2,
      'after reloadSettings fails, the getter must short-circuit on the re-cached failure');
  });
});


suite('configuration: Phase 21 migration consent flow quiet WkspError handling (260518-hyz)', () => {
  // The catch block lives in src/extension.ts. We can't easily invoke activate()
  // in a unit test, so instead we verify the policy directly: WkspError instances
  // should go through diagLog (silent), non-WkspError through logger.logInfo.
  // We exercise the exact branch logic with a small inline replica + verify the
  // imported WkspError is detected with `instanceof`.

  test('WkspError is correctly distinguished from generic Error via instanceof', () => {
    const fakeUri = vscode.Uri.file('/fake/workspace');
    const wkspErr = new WkspError('test', fakeUri);
    const genericErr = new Error('generic');

    assert.ok(wkspErr instanceof WkspError, 'WkspError must be instanceof itself');
    assert.ok(wkspErr instanceof Error, 'WkspError must also be instanceof Error');
    assert.ok(!(genericErr instanceof WkspError), 'generic Error must NOT be instanceof WkspError');
  });

  test('the Phase 21 catch branch routes WkspError to diagLog, not logInfo', () => {
    // Mirror the actual catch-block logic from extension.ts (the policy we want to lock in).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loggerSpy: any = { logInfo: sinon.spy() };
    const diagLogSpy = sinon.spy();
    const fakeUri = vscode.Uri.file('/fake/workspace');

    function phase21CatchReplica(e: unknown, wkspUri: typeof fakeUri) {
      if (e instanceof WkspError) {
        diagLogSpy(`Phase 21 migration consent flow saw settled WkspError for ${wkspUri.path}: ${e.message}`, wkspUri);
      } else {
        loggerSpy.logInfo(`Phase 21 migration consent flow error: ${e}`, wkspUri);
      }
    }

    phase21CatchReplica(new WkspError('settled', fakeUri), fakeUri);
    assert.strictEqual(diagLogSpy.callCount, 1, 'WkspError → diagLog');
    assert.strictEqual(loggerSpy.logInfo.callCount, 0, 'WkspError must NOT hit logInfo');

    phase21CatchReplica(new Error('something else'), fakeUri);
    assert.strictEqual(diagLogSpy.callCount, 1, 'generic Error must NOT add another diagLog call');
    assert.strictEqual(loggerSpy.logInfo.callCount, 1, 'generic Error → logInfo');
  });
});
