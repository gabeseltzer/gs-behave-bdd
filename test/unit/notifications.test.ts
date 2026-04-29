import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import * as configModule from '../../src/configuration';
import {
  isSuppressed,
  suppressNotification,
  showSuppressibleNotification,
  migrateLegacySuppressMultiConfig,
  migrateScopedSetting,
  migrateLegacyFeaturesPath,
} from '../../src/notifications';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscode = require('vscode');

const MOCK_URI = vscode.Uri.file('/fake/workspace');

/**
 * Constructs a fake VSCode WorkspaceConfiguration whose `inspect()` returns
 * caller-controlled per-scope values. Required because TestWorkspaceConfig
 * only populates `workspaceFolderValue` (testWorkspaceConfig.ts L185 — see
 * Pitfall 5 in 15-RESEARCH.md).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeScopedConfig(scopes: {
  globalValue?: unknown;
  workspaceValue?: unknown;
  workspaceFolderValue?: unknown;
}, updateSpy?: sinon.SinonSpy): any {
  return {
    get: (_key: string) => scopes.workspaceFolderValue ?? scopes.workspaceValue ?? scopes.globalValue,
    has: () => false,
    inspect: (key: string) => ({
      key,
      defaultValue: undefined,
      globalValue: scopes.globalValue,
      workspaceValue: scopes.workspaceValue,
      workspaceFolderValue: scopes.workspaceFolderValue,
    }),
    update: updateSpy ?? (() => Promise.resolve()),
  };
}

suite('Phase 15 — notifications module', () => {
  suite('Wave 0: Assumption A1 probe (inspect() of unregistered key)', () => {
    teardown(() => sinon.restore());

    test('A1: inspect() returns workspaceFolderValue for unregistered key with settings.json value', () => {
      const getConfigStub = sinon.stub(vscode.workspace, 'getConfiguration').returns(
        makeScopedConfig({ workspaceFolderValue: true }),
      );

      const cfg = vscode.workspace.getConfiguration('gs-behave-bdd', MOCK_URI);
      const insp = cfg.inspect('suppressMultiConfigNotification');

      assert.ok(insp, 'inspect() must not return undefined for unregistered key with settings.json value');
      assert.strictEqual(insp.workspaceFolderValue, true);
      assert.strictEqual(insp.globalValue, undefined);
      assert.strictEqual(insp.workspaceValue, undefined);

      assert.ok(getConfigStub.called);
    });

    test('A1: inspect() returns globalValue for unregistered key set globally', () => {
      sinon.stub(vscode.workspace, 'getConfiguration').returns(
        makeScopedConfig({ globalValue: true }),
      );
      const cfg = vscode.workspace.getConfiguration('gs-behave-bdd', MOCK_URI);
      const insp = cfg.inspect('suppressMultiConfigNotification');

      assert.ok(insp);
      assert.strictEqual(insp.globalValue, true);
      assert.strictEqual(insp.workspaceFolderValue, undefined);
    });
  });
});

suite('Phase 15 — notifications: isSuppressed (NOTIF-02 check)', () => {
  teardown(() => sinon.restore());

  test('isSuppressed returns true when key in cached array', () => {
    sinon.stub(configModule.config, 'workspaceSettings').get(() => ({
      [MOCK_URI.path]: { suppressedNotifications: ['multiConfigNotification'] },
    }));
    assert.strictEqual(isSuppressed('multiConfigNotification', MOCK_URI), true);
  });

  test('isSuppressed returns false when key absent', () => {
    sinon.stub(configModule.config, 'workspaceSettings').get(() => ({
      [MOCK_URI.path]: { suppressedNotifications: ['someOther'] },
    }));
    assert.strictEqual(isSuppressed('multiConfigNotification', MOCK_URI), false);
  });

  test('isSuppressed returns false when cache entry missing', () => {
    sinon.stub(configModule.config, 'workspaceSettings').get(() => ({}));
    assert.strictEqual(isSuppressed('multiConfigNotification', MOCK_URI), false);
  });

  test('isSuppressed returns false when suppressedNotifications undefined on cache', () => {
    sinon.stub(configModule.config, 'workspaceSettings').get(() => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [MOCK_URI.path]: {} as any,
    }));
    assert.strictEqual(isSuppressed('multiConfigNotification', MOCK_URI), false);
  });
});

suite('Phase 15 — notifications: suppressNotification (NOTIF-02 + NOTIF-03)', () => {
  let updateSpy: sinon.SinonSpy;
  let logInfoSpy: sinon.SinonSpy;

  setup(() => {
    updateSpy = sinon.spy(() => Promise.resolve());
    logInfoSpy = sinon.spy();
    sinon.stub(configModule.config, 'logger').value({ logInfo: logInfoSpy });
  });
  teardown(() => sinon.restore());

  test('suppressNotification appends key and writes to WorkspaceFolder scope', async () => {
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makeScopedConfig({ workspaceFolderValue: [] }, updateSpy),
    );
    await suppressNotification('multiConfigNotification', MOCK_URI);
    assert.strictEqual(updateSpy.callCount, 1);
    const args = updateSpy.firstCall.args;
    assert.strictEqual(args[0], 'suppressedNotifications');
    assert.deepStrictEqual(args[1], ['multiConfigNotification']);
    assert.strictEqual(args[2], vscode.ConfigurationTarget.WorkspaceFolder, 'WorkspaceFolder scope');
  });

  test('suppressNotification preserves existing entries (append)', async () => {
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makeScopedConfig({ workspaceFolderValue: ['someOther'] }, updateSpy),
    );
    await suppressNotification('multiConfigNotification', MOCK_URI);
    assert.deepStrictEqual(updateSpy.firstCall.args[1], ['someOther', 'multiConfigNotification']);
  });

  test('suppressNotification dedup: does NOT call update if key already present', async () => {
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makeScopedConfig({ workspaceFolderValue: ['multiConfigNotification'] }, updateSpy),
    );
    await suppressNotification('multiConfigNotification', MOCK_URI);
    assert.strictEqual(updateSpy.called, false, 'D-11 dedup');
  });

  test('suppressNotification (failure logs): rejection logs warn, does NOT throw', async () => {
    const rejectingUpdate = sinon.spy(() => Promise.reject(new Error('read-only workspace')));
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makeScopedConfig({ workspaceFolderValue: [] }, rejectingUpdate),
    );
    await assert.doesNotReject(() => suppressNotification('multiConfigNotification', MOCK_URI));
    assert.ok(logInfoSpy.called, 'logInfo must be called on update rejection');
    assert.ok(
      logInfoSpy.firstCall.args[0].includes('multiConfigNotification'),
      'log message includes the key',
    );
  });
});

suite('Phase 15 — notifications: showSuppressibleNotification (NOTIF-04 + D-04)', () => {
  let showInfoStub: sinon.SinonStub;
  let updateSpy: sinon.SinonSpy;

  setup(() => {
    updateSpy = sinon.spy(() => Promise.resolve());
    sinon.stub(configModule.config, 'logger').value({ logInfo: sinon.spy() });
  });
  teardown(() => sinon.restore());

  test('multiConfigNotification key: returns the clicked button label', async () => {
    sinon.stub(configModule.config, 'workspaceSettings').get(() => ({}));
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makeScopedConfig({ workspaceFolderValue: [] }, updateSpy),
    );
    showInfoStub = sinon.stub(vscode.window, 'showInformationMessage').resolves('Select Project');
    const result = await showSuppressibleNotification(
      'multiConfigNotification',
      'Some message',
      ['Select Project', 'Show Details'],
      MOCK_URI,
    );
    assert.strictEqual(result, 'Select Project');
    assert.ok(showInfoStub.called);
  });

  test('button passthrough: never returns "Don\'t Show Again"', async () => {
    sinon.stub(configModule.config, 'workspaceSettings').get(() => ({}));
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makeScopedConfig({ workspaceFolderValue: [] }, updateSpy),
    );
    showInfoStub = sinon.stub(vscode.window, 'showInformationMessage').resolves("Don't Show Again");
    const result = await showSuppressibleNotification(
      'multiConfigNotification',
      'm',
      ['Select Project'],
      MOCK_URI,
    );
    assert.strictEqual(result, undefined, 'D-04: DSA must NOT leak to caller');
    // Verify suppressNotification ran internally (update called with the key):
    assert.ok(updateSpy.called, 'DSA branch must call update internally');
  });

  test('appends DSA button to caller buttons', async () => {
    sinon.stub(configModule.config, 'workspaceSettings').get(() => ({}));
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makeScopedConfig({ workspaceFolderValue: [] }, updateSpy),
    );
    showInfoStub = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    await showSuppressibleNotification(
      'multiConfigNotification',
      'm',
      ['A', 'B'],
      MOCK_URI,
    );
    const args = showInfoStub.firstCall.args;
    // Args: [message, ...buttons]
    assert.strictEqual(args[0], 'm');
    assert.deepStrictEqual(args.slice(1), ['A', 'B', "Don't Show Again"]);
  });

  test('dismiss returns undefined and does NOT update settings', async () => {
    sinon.stub(configModule.config, 'workspaceSettings').get(() => ({}));
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makeScopedConfig({ workspaceFolderValue: [] }, updateSpy),
    );
    showInfoStub = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    const result = await showSuppressibleNotification('k', 'm', [], MOCK_URI);
    assert.strictEqual(result, undefined);
    assert.strictEqual(updateSpy.called, false);
  });

  test('suppressed key: skips UI, returns undefined immediately', async () => {
    sinon.stub(configModule.config, 'workspaceSettings').get(() => ({
      [MOCK_URI.path]: { suppressedNotifications: ['multiConfigNotification'] },
    }));
    showInfoStub = sinon.stub(vscode.window, 'showInformationMessage').resolves('Select Project');
    const result = await showSuppressibleNotification(
      'multiConfigNotification',
      'm',
      ['Select Project'],
      MOCK_URI,
    );
    assert.strictEqual(result, undefined);
    assert.strictEqual(showInfoStub.called, false, 'must not display UI when suppressed');
  });
});

export { makeScopedConfig, makePerKeyScopedConfig };

/**
 * Builds a fake WorkspaceConfiguration whose inspect() returns DIFFERENT
 * scope sets for different keys. Required because migration calls inspect()
 * twice (once for the legacy boolean, once for the new array).
 */
function makePerKeyScopedConfig(perKey: {
  [key: string]: { globalValue?: unknown; workspaceValue?: unknown; workspaceFolderValue?: unknown };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}, updateSpy?: sinon.SinonSpy): any {
  return {
    get: (_key: string) => undefined,
    has: () => false,
    inspect: (key: string) => {
      const s = perKey[key] ?? {};
      return {
        key,
        defaultValue: undefined,
        globalValue: s.globalValue,
        workspaceValue: s.workspaceValue,
        workspaceFolderValue: s.workspaceFolderValue,
      };
    },
    update: updateSpy ?? (() => Promise.resolve()),
  };
}

suite('Phase 15 — notifications: migrateLegacySuppressMultiConfig (NOTIF-06)', () => {
  let updateSpy: sinon.SinonSpy;
  let logInfoSpy: sinon.SinonSpy;

  setup(() => {
    updateSpy = sinon.spy(() => Promise.resolve());
    logInfoSpy = sinon.spy();
    sinon.stub(configModule.config, 'logger').value({ logInfo: logInfoSpy });
  });
  teardown(() => sinon.restore());

  test('migrate at WorkspaceFolder scope: writes array + removes legacy key', async () => {
    sinon.stub(vscode.workspace, 'getConfiguration').returns(makePerKeyScopedConfig({
      suppressMultiConfigNotification: { workspaceFolderValue: true },
      suppressedNotifications: {},
    }, updateSpy));
    await migrateLegacySuppressMultiConfig(MOCK_URI);
    assert.strictEqual(updateSpy.callCount, 2, 'one update for new array, one to delete legacy key');
    assert.deepStrictEqual(updateSpy.firstCall.args, [
      'suppressedNotifications',
      ['multiConfigNotification'],
      vscode.ConfigurationTarget.WorkspaceFolder,
    ]);
    assert.deepStrictEqual(updateSpy.secondCall.args, [
      'suppressMultiConfigNotification',
      undefined,
      vscode.ConfigurationTarget.WorkspaceFolder,
    ]);
  });

  test('migrate at Workspace scope: writes both at ConfigurationTarget.Workspace', async () => {
    sinon.stub(vscode.workspace, 'getConfiguration').returns(makePerKeyScopedConfig({
      suppressMultiConfigNotification: { workspaceValue: true },
      suppressedNotifications: {},
    }, updateSpy));
    await migrateLegacySuppressMultiConfig(MOCK_URI);
    assert.strictEqual(updateSpy.callCount, 2);
    assert.strictEqual(updateSpy.firstCall.args[2], vscode.ConfigurationTarget.Workspace);
    assert.strictEqual(updateSpy.secondCall.args[2], vscode.ConfigurationTarget.Workspace);
  });

  test('migrate at Global scope: writes both at ConfigurationTarget.Global', async () => {
    sinon.stub(vscode.workspace, 'getConfiguration').returns(makePerKeyScopedConfig({
      suppressMultiConfigNotification: { globalValue: true },
      suppressedNotifications: {},
    }, updateSpy));
    await migrateLegacySuppressMultiConfig(MOCK_URI);
    assert.strictEqual(updateSpy.callCount, 2);
    assert.strictEqual(updateSpy.firstCall.args[2], vscode.ConfigurationTarget.Global);
  });

  test('migrate no-op when legacy value is false', async () => {
    sinon.stub(vscode.workspace, 'getConfiguration').returns(makePerKeyScopedConfig({
      suppressMultiConfigNotification: { workspaceFolderValue: false },
      suppressedNotifications: {},
    }, updateSpy));
    await migrateLegacySuppressMultiConfig(MOCK_URI);
    assert.strictEqual(updateSpy.callCount, 0);
  });

  test('migrate no-op when legacy value absent at all scopes', async () => {
    sinon.stub(vscode.workspace, 'getConfiguration').returns(makePerKeyScopedConfig({
      suppressMultiConfigNotification: {},
      suppressedNotifications: {},
    }, updateSpy));
    await migrateLegacySuppressMultiConfig(MOCK_URI);
    assert.strictEqual(updateSpy.callCount, 0);
  });

  test('migrate merge: preserves existing suppressedNotifications array entries', async () => {
    sinon.stub(vscode.workspace, 'getConfiguration').returns(makePerKeyScopedConfig({
      suppressMultiConfigNotification: { workspaceFolderValue: true },
      suppressedNotifications: { workspaceFolderValue: ['someOther'] },
    }, updateSpy));
    await migrateLegacySuppressMultiConfig(MOCK_URI);
    assert.deepStrictEqual(
      updateSpy.firstCall.args[1],
      ['someOther', 'multiConfigNotification'],
    );
  });

  test('migrate idempotent: second run is no-op (legacy gone, key already in array)', async () => {
    sinon.stub(vscode.workspace, 'getConfiguration').returns(makePerKeyScopedConfig({
      suppressMultiConfigNotification: {},
      suppressedNotifications: { workspaceFolderValue: ['multiConfigNotification'] },
    }, updateSpy));
    await migrateLegacySuppressMultiConfig(MOCK_URI);
    assert.strictEqual(updateSpy.callCount, 0);
  });

  test('migrate failure: rejection logs warn, does NOT throw', async () => {
    let callCount = 0;
    const rejectingUpdate = sinon.spy(() => {
      callCount += 1;
      if (callCount === 1) return Promise.reject(new Error('read-only workspace'));
      return Promise.resolve();
    });
    sinon.stub(vscode.workspace, 'getConfiguration').returns(makePerKeyScopedConfig({
      suppressMultiConfigNotification: { workspaceFolderValue: true },
      suppressedNotifications: {},
    }, rejectingUpdate));
    await assert.doesNotReject(() => migrateLegacySuppressMultiConfig(MOCK_URI));
    assert.ok(logInfoSpy.called, 'D-07: must log warn on failure');
    const logMsg = logInfoSpy.firstCall.args[0] as string;
    assert.ok(
      logMsg.includes('suppressMultiConfigNotification') ||
        logMsg.includes('suppressedNotifications'),
      'log message must mention the migration keys',
    );
  });
});

suite('Phase 16 — notifications: migrateScopedSetting (D-MOD primitive)', () => {
  let updateSpy: sinon.SinonSpy;
  let logInfoSpy: sinon.SinonSpy;

  setup(() => {
    updateSpy = sinon.spy(() => Promise.resolve());
    logInfoSpy = sinon.spy();
    sinon.stub(configModule.config, 'logger').value({ logInfo: logInfoSpy });
  });
  teardown(() => sinon.restore());

  test("kind:'write' — writes dest then removes source, returns true", async () => {
    sinon.stub(vscode.workspace, 'getConfiguration').returns(makePerKeyScopedConfig({
      legacyKey:    { workspaceFolderValue: 'someValue' },
      newArrayKey:  {},
    }, updateSpy));

    const result = await migrateScopedSetting<string, string[]>({
      namespace: 'gs-behave-bdd',
      sourceKey: 'legacyKey',
      destKey:   'newArrayKey',
      wkspUri: MOCK_URI,
      transform: (src, _existing) => ({ kind: 'write', value: [src] }),
    });

    assert.strictEqual(result, true, 'Promise<boolean> must be true on successful write');
    assert.strictEqual(updateSpy.callCount, 2, 'one dest write + one source removal');
    assert.deepStrictEqual(updateSpy.firstCall.args, [
      'newArrayKey', ['someValue'], vscode.ConfigurationTarget.WorkspaceFolder,
    ]);
    assert.deepStrictEqual(updateSpy.secondCall.args, [
      'legacyKey', undefined, vscode.ConfigurationTarget.WorkspaceFolder,
    ]);
  });

  test("kind:'skipDest' removeSource:true — removes source only, returns true (Phase 16 blank-string)", async () => {
    sinon.stub(vscode.workspace, 'getConfiguration').returns(makePerKeyScopedConfig({
      legacyKey:   { workspaceFolderValue: '' },
      newArrayKey: {},
    }, updateSpy));

    const result = await migrateScopedSetting<string, string[]>({
      namespace: 'gs-behave-bdd',
      sourceKey: 'legacyKey',
      destKey:   'newArrayKey',
      wkspUri: MOCK_URI,
      transform: () => ({ kind: 'skipDest', removeSource: true }),
    });

    assert.strictEqual(result, true);
    assert.strictEqual(updateSpy.callCount, 1, 'only the source removal call');
    assert.deepStrictEqual(updateSpy.firstCall.args, [
      'legacyKey', undefined, vscode.ConfigurationTarget.WorkspaceFolder,
    ]);
  });

  test("kind:'skipDest' removeSource:false — no updates, returns false (Phase 15 legacyValue!==true contract)", async () => {
    sinon.stub(vscode.workspace, 'getConfiguration').returns(makePerKeyScopedConfig({
      legacyKey:   { workspaceFolderValue: false },
      newArrayKey: {},
    }, updateSpy));

    const result = await migrateScopedSetting<boolean, string[]>({
      namespace: 'gs-behave-bdd',
      sourceKey: 'legacyKey',
      destKey:   'newArrayKey',
      wkspUri: MOCK_URI,
      transform: () => ({ kind: 'skipDest', removeSource: false }),
    });

    assert.strictEqual(result, false);
    assert.strictEqual(updateSpy.callCount, 0, 'NEITHER dest write NOR source removal');
  });

  test('cross-namespace write — source from behave-vsc, dest to gs-behave-bdd, both at same scope', async () => {
    const stub = sinon.stub(vscode.workspace, 'getConfiguration');
    stub.withArgs('behave-vsc', sinon.match.any).returns(makePerKeyScopedConfig({
      legacyKey: { workspaceValue: 'forked' },
    }, updateSpy));
    stub.withArgs('gs-behave-bdd', sinon.match.any).returns(makePerKeyScopedConfig({
      newArrayKey: {},
    }, updateSpy));

    const result = await migrateScopedSetting<string, string[]>({
      namespace: 'behave-vsc',
      sourceKey: 'legacyKey',
      destNamespace: 'gs-behave-bdd',
      destKey: 'newArrayKey',
      wkspUri: MOCK_URI,
      transform: (src) => ({ kind: 'write', value: [src] }),
    });

    assert.strictEqual(result, true);
    // Two updates total: dest at gs-behave-bdd + source removal at behave-vsc.
    assert.strictEqual(updateSpy.callCount, 2);
    // Both at the SAME ConfigurationTarget (Workspace).
    assert.strictEqual(updateSpy.firstCall.args[2], vscode.ConfigurationTarget.Workspace);
    assert.strictEqual(updateSpy.secondCall.args[2], vscode.ConfigurationTarget.Workspace);
  });

  test('transform receives same-scope dest value (Pitfall 2 — never merged)', async () => {
    let received: string[] | undefined = ['SHOULD_BE_OVERWRITTEN'];
    sinon.stub(vscode.workspace, 'getConfiguration').returns(makePerKeyScopedConfig({
      legacyKey:   { workspaceFolderValue: 'x' },
      newArrayKey: { globalValue: ['g'], workspaceFolderValue: ['wf'] },
    }, updateSpy));

    await migrateScopedSetting<string, string[]>({
      namespace: 'gs-behave-bdd',
      sourceKey: 'legacyKey',
      destKey:   'newArrayKey',
      wkspUri: MOCK_URI,
      transform: (_src, existing) => {
        received = existing;
        return { kind: 'write', value: existing ?? [] };
      },
    });

    assert.deepStrictEqual(received, ['wf'], 'must read same-scope dest value, NOT global, NOT merged');
  });

  test('no source value at any scope — no-op, returns false, transform never called', async () => {
    const transformSpy = sinon.spy(() => ({ kind: 'write' as const, value: [] as string[] }));
    sinon.stub(vscode.workspace, 'getConfiguration').returns(makePerKeyScopedConfig({
      legacyKey:   {},        // no scope set
      newArrayKey: {},
    }, updateSpy));

    const result = await migrateScopedSetting<string, string[]>({
      namespace: 'gs-behave-bdd',
      sourceKey: 'legacyKey',
      destKey:   'newArrayKey',
      wkspUri: MOCK_URI,
      transform: transformSpy,
    });

    assert.strictEqual(result, false);
    assert.strictEqual(updateSpy.callCount, 0);
    assert.strictEqual(transformSpy.callCount, 0, 'transform must not be invoked when no scope set');
  });

  test('update rejection — logs via logInfo, returns false, does NOT throw (D-05 carryforward)', async () => {
    const rejectingUpdate = sinon.spy(() => Promise.reject(new Error('read-only')));
    sinon.stub(vscode.workspace, 'getConfiguration').returns(makePerKeyScopedConfig({
      legacyKey:   { workspaceFolderValue: 'x' },
      newArrayKey: {},
    }, rejectingUpdate));

    let result = true;   // sentinel; should be overwritten
    await assert.doesNotReject(async () => {
      result = await migrateScopedSetting<string, string[]>({
        namespace: 'gs-behave-bdd',
        sourceKey: 'legacyKey',
        destKey:   'newArrayKey',
        wkspUri: MOCK_URI,
        transform: (src) => ({ kind: 'write', value: [src] }),
      });
    });
    assert.strictEqual(result, false);
    assert.ok(logInfoSpy.called, 'must log via config.logger.logInfo on update rejection');
  });
});

suite('Phase 15 — extension.ts activation ordering (Pitfall 3)', () => {
  // Tests run from out/test/test/unit/, so 4 levels up to project root; fall back to 3 if needed.
  function readExtensionSrc(): string {
    let extPath = path.resolve(__dirname, '../../../../src/extension.ts');
    if (!fs.existsSync(extPath)) {
      extPath = path.resolve(__dirname, '../../../src/extension.ts');
    }
    return fs.readFileSync(extPath, 'utf8');
  }

  test('activate.*migration order: migrateLegacySuppressMultiConfig precedes updateDiscoveryUX', () => {
    const src = readExtensionSrc();
    const migrationIdx = src.indexOf('migrateLegacySuppressMultiConfig(wkspUri)');
    // Match the call site (with paren), not the function declaration.
    const discoveryCallIdx = src.indexOf('updateDiscoveryUX(getUrisOfWkspFoldersWithFeatures()');
    assert.notStrictEqual(migrationIdx, -1, 'migration call must exist in extension.ts');
    assert.notStrictEqual(discoveryCallIdx, -1, 'updateDiscoveryUX call must exist in extension.ts');
    assert.ok(
      migrationIdx < discoveryCallIdx,
      'migration must precede updateDiscoveryUX call (Pitfall 3 / D-05)',
    );
  });

  test('extension.*multiConfigNotification: showSuppressibleNotification call uses correct key + buttons', () => {
    const src = readExtensionSrc();
    assert.match(
      src,
      /showSuppressibleNotification\([\s\S]*?["']multiConfigNotification["'][\s\S]*?["']Select Project["'][\s\S]*?["']Show Details["']/,
      'wrapper call must include key and both buttons',
    );
  });

  test('extension.ts no longer reads legacy suppressMultiConfigNotification from cache', () => {
    const src = readExtensionSrc();
    assert.ok(
      !src.includes('suppressMultiConfigNotification'),
      'extension.ts must not reference the legacy key after Plan 05',
    );
  });
});

suite('Phase 16 — notifications: migrateLegacyFeaturesPath (DEP-02, DEP-03)', () => {
  let updateSpy: sinon.SinonSpy;
  let logInfoSpy: sinon.SinonSpy;

  setup(() => {
    updateSpy = sinon.spy(() => Promise.resolve());
    logInfoSpy = sinon.spy();
    sinon.stub(configModule.config, 'logger').value({ logInfo: logInfoSpy });
  });
  teardown(() => sinon.restore());

  // Helper: stub getConfiguration with separate per-namespace per-key configs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function stubBothNamespaces(gsbb: any, bvsc: any) {
    const stub = sinon.stub(vscode.workspace, 'getConfiguration');
    stub.withArgs('gs-behave-bdd', sinon.match.any).returns(gsbb);
    stub.withArgs('behave-vsc', sinon.match.any).returns(bvsc);
    return stub;
  }

  test('(case a) gs-behave-bdd singular at WorkspaceFolder writes plural + removes legacy (D-01, D-03)', async () => {
    stubBothNamespaces(
      makePerKeyScopedConfig({
        featuresPath:  { workspaceFolderValue: 'my-tests' },
        featuresPaths: {},
      }, updateSpy),
      makePerKeyScopedConfig({ featuresPath: {}, featuresPaths: {} }, updateSpy),
    );

    const result = await migrateLegacyFeaturesPath(MOCK_URI);

    assert.strictEqual(result, true, 'D-01: returns true when at least one scope migrated');
    assert.strictEqual(updateSpy.callCount, 2, 'one dest write + one source removal');
    assert.deepStrictEqual(updateSpy.firstCall.args, [
      'featuresPaths', ['my-tests'], vscode.ConfigurationTarget.WorkspaceFolder,
    ]);
    assert.deepStrictEqual(updateSpy.secondCall.args, [
      'featuresPath', undefined, vscode.ConfigurationTarget.WorkspaceFolder,
    ]);
  });

  test('(case b) gs-behave-bdd singular at Workspace scope (D-01, D-03)', async () => {
    stubBothNamespaces(
      makePerKeyScopedConfig({
        featuresPath:  { workspaceValue: 'ws-tests' },
        featuresPaths: {},
      }, updateSpy),
      makePerKeyScopedConfig({ featuresPath: {}, featuresPaths: {} }, updateSpy),
    );

    const result = await migrateLegacyFeaturesPath(MOCK_URI);

    assert.strictEqual(result, true);
    assert.strictEqual(updateSpy.callCount, 2);
    assert.strictEqual(updateSpy.firstCall.args[2], vscode.ConfigurationTarget.Workspace);
    assert.strictEqual(updateSpy.secondCall.args[2], vscode.ConfigurationTarget.Workspace);
    assert.deepStrictEqual(updateSpy.firstCall.args[1], ['ws-tests']);
  });

  test('(case c) gs-behave-bdd singular at Global scope (D-01, D-03)', async () => {
    stubBothNamespaces(
      makePerKeyScopedConfig({
        featuresPath:  { globalValue: 'global-tests' },
        featuresPaths: {},
      }, updateSpy),
      makePerKeyScopedConfig({ featuresPath: {}, featuresPaths: {} }, updateSpy),
    );

    const result = await migrateLegacyFeaturesPath(MOCK_URI);

    assert.strictEqual(result, true);
    assert.strictEqual(updateSpy.callCount, 2);
    assert.strictEqual(updateSpy.firstCall.args[2], vscode.ConfigurationTarget.Global);
    assert.strictEqual(updateSpy.secondCall.args[2], vscode.ConfigurationTarget.Global);
  });

  test('(case d) behave-vsc singular migrates to gs-behave-bdd.featuresPaths (D-02)', async () => {
    stubBothNamespaces(
      makePerKeyScopedConfig({ featuresPath: {}, featuresPaths: {} }, updateSpy),
      makePerKeyScopedConfig({
        featuresPath:  { globalValue: 'forked' },
        featuresPaths: {},
      }, updateSpy),
    );

    const result = await migrateLegacyFeaturesPath(MOCK_URI);

    assert.strictEqual(result, true);
    assert.strictEqual(updateSpy.callCount, 2);
    // Dest write goes to featuresPaths (NOT featuresPath); source removal removes featuresPath.
    assert.deepStrictEqual(updateSpy.firstCall.args, [
      'featuresPaths', ['forked'], vscode.ConfigurationTarget.Global,
    ]);
    assert.deepStrictEqual(updateSpy.secondCall.args, [
      'featuresPath', undefined, vscode.ConfigurationTarget.Global,
    ]);
    // D-02 invariant: dest write key is 'featuresPaths'; source removal key is 'featuresPath'.
    // Since both namespace stubs share updateSpy, the (key, scope) tuple confirms the dest
    // landed in gs-behave-bdd's config (only that one was passed 'featuresPaths' to write).
    const allKeys = updateSpy.getCalls().map(c => c.args[0]);
    assert.deepStrictEqual(allKeys, ['featuresPaths', 'featuresPath']);
  });

  test('(case e1) singular AND plural at same scope: merge (D-06)', async () => {
    stubBothNamespaces(
      makePerKeyScopedConfig({
        featuresPath:  { workspaceValue: 'alt' },
        featuresPaths: { workspaceValue: ['main'] },
      }, updateSpy),
      makePerKeyScopedConfig({ featuresPath: {}, featuresPaths: {} }, updateSpy),
    );

    const result = await migrateLegacyFeaturesPath(MOCK_URI);

    assert.strictEqual(result, true);
    assert.strictEqual(updateSpy.callCount, 2);
    assert.deepStrictEqual(updateSpy.firstCall.args, [
      'featuresPaths', ['main', 'alt'], vscode.ConfigurationTarget.Workspace,
    ]);
    assert.deepStrictEqual(updateSpy.secondCall.args, [
      'featuresPath', undefined, vscode.ConfigurationTarget.Workspace,
    ]);
  });

  test('(case e2) singular "/main/" dedupes against existing ["main"] post-normalization (D-07)', async () => {
    stubBothNamespaces(
      makePerKeyScopedConfig({
        featuresPath:  { workspaceFolderValue: '/main/' },
        featuresPaths: { workspaceFolderValue: ['main'] },
      }, updateSpy),
      makePerKeyScopedConfig({ featuresPath: {}, featuresPaths: {} }, updateSpy),
    );

    const result = await migrateLegacyFeaturesPath(MOCK_URI);

    assert.strictEqual(result, true);
    assert.strictEqual(updateSpy.callCount, 2, 'still writes (unchanged) + removes legacy');
    // Pitfall 9: byte-identical normalize regex from src/settings.ts:204 must not double-append.
    assert.deepStrictEqual(updateSpy.firstCall.args[1], ['main'], 'dedup: array unchanged');
    assert.deepStrictEqual(updateSpy.secondCall.args, [
      'featuresPath', undefined, vscode.ConfigurationTarget.WorkspaceFolder,
    ]);
  });

  test('(case f) cross-scope independence: gs-behave-bdd at WF + behave-vsc at WS migrate independently (D-04)', async () => {
    stubBothNamespaces(
      makePerKeyScopedConfig({
        featuresPath:  { workspaceFolderValue: 'main-pkg' },
        featuresPaths: {},
      }, updateSpy),
      makePerKeyScopedConfig({
        featuresPath:  { workspaceValue: 'fork-pkg' },
        featuresPaths: {},
      }, updateSpy),
    );

    const result = await migrateLegacyFeaturesPath(MOCK_URI);

    assert.strictEqual(result, true);
    assert.strictEqual(updateSpy.callCount, 4, '2 dest writes + 2 source removals across two scopes');
    // Count target scopes — exactly 2 at WorkspaceFolder, exactly 2 at Workspace.
    const wfCount = updateSpy.getCalls().filter(c =>
      c.args[2] === vscode.ConfigurationTarget.WorkspaceFolder
    ).length;
    const wsCount = updateSpy.getCalls().filter(c =>
      c.args[2] === vscode.ConfigurationTarget.Workspace
    ).length;
    assert.strictEqual(wfCount, 2, 'gs-behave-bdd at WorkspaceFolder: dest + source');
    assert.strictEqual(wsCount, 2, 'behave-vsc at Workspace: dest + source');
  });

  test('(case g1) empty-string singular: skip dest write, remove legacy (D-08)', async () => {
    stubBothNamespaces(
      makePerKeyScopedConfig({
        featuresPath:  { workspaceFolderValue: '' },
        featuresPaths: {},
      }, updateSpy),
      makePerKeyScopedConfig({ featuresPath: {}, featuresPaths: {} }, updateSpy),
    );

    const result = await migrateLegacyFeaturesPath(MOCK_URI);

    assert.strictEqual(result, true);
    assert.strictEqual(updateSpy.callCount, 1, 'ONLY the source removal');
    assert.deepStrictEqual(updateSpy.firstCall.args, [
      'featuresPath', undefined, vscode.ConfigurationTarget.WorkspaceFolder,
    ]);
  });

  test('(case g2) whitespace-only singular: skip dest write, remove legacy (D-08)', async () => {
    stubBothNamespaces(
      makePerKeyScopedConfig({
        featuresPath:  { workspaceFolderValue: '   ' },
        featuresPaths: {},
      }, updateSpy),
      makePerKeyScopedConfig({ featuresPath: {}, featuresPaths: {} }, updateSpy),
    );

    const result = await migrateLegacyFeaturesPath(MOCK_URI);

    assert.strictEqual(result, true);
    assert.strictEqual(updateSpy.callCount, 1);
    assert.deepStrictEqual(updateSpy.firstCall.args, [
      'featuresPath', undefined, vscode.ConfigurationTarget.WorkspaceFolder,
    ]);
  });

  test('(case h) "." migrates literally — downstream guard handles fatal error (D-09)', async () => {
    // D-09: "." migrates literally — src/settings.ts:232-234 handles the fatal error downstream.
    stubBothNamespaces(
      makePerKeyScopedConfig({
        featuresPath:  { workspaceFolderValue: '.' },
        featuresPaths: {},
      }, updateSpy),
      makePerKeyScopedConfig({ featuresPath: {}, featuresPaths: {} }, updateSpy),
    );

    const result = await migrateLegacyFeaturesPath(MOCK_URI);

    assert.strictEqual(result, true);
    assert.strictEqual(updateSpy.callCount, 2);
    assert.deepStrictEqual(updateSpy.firstCall.args, [
      'featuresPaths', ['.'], vscode.ConfigurationTarget.WorkspaceFolder,
    ]);
    assert.deepStrictEqual(updateSpy.secondCall.args, [
      'featuresPath', undefined, vscode.ConfigurationTarget.WorkspaceFolder,
    ]);
  });

  test('(case i) no legacy value at any scope in either namespace — no-op returns false (D-01)', async () => {
    stubBothNamespaces(
      makePerKeyScopedConfig({ featuresPath: {}, featuresPaths: {} }, updateSpy),
      makePerKeyScopedConfig({ featuresPath: {}, featuresPaths: {} }, updateSpy),
    );

    const result = await migrateLegacyFeaturesPath(MOCK_URI);

    assert.strictEqual(result, false, 'D-01: no migration → false');
    assert.strictEqual(updateSpy.callCount, 0, 'no update calls at all');
  });

  test('(case j) update rejection: logs via logInfo, does NOT throw, returns false (D-05)', async () => {
    const rejectingUpdate = sinon.spy(() => Promise.reject(new Error('read-only')));
    stubBothNamespaces(
      makePerKeyScopedConfig({
        featuresPath:  { workspaceFolderValue: 'x' },
        featuresPaths: {},
      }, rejectingUpdate),
      makePerKeyScopedConfig({ featuresPath: {}, featuresPaths: {} }, rejectingUpdate),
    );

    let result = true;   // sentinel
    await assert.doesNotReject(async () => {
      result = await migrateLegacyFeaturesPath(MOCK_URI);
    });
    assert.strictEqual(result, false, 'no scope succeeded → false');
    assert.ok(logInfoSpy.called, 'D-05: must log via config.logger.logInfo on rejection');
  });
});

suite('Phase 16 — activation order and notification structural tests (D-18, D-13, D-12, Pitfall 8)', () => {
  // Mirrors Phase 15 structural-tests pattern at L555-L595 (readExtensionSrc with fallback).
  function readExtensionSrc(): string {
    let extPath = path.resolve(__dirname, '../../../../src/extension.ts');
    if (!fs.existsSync(extPath)) {
      extPath = path.resolve(__dirname, '../../../src/extension.ts');
    }
    return fs.readFileSync(extPath, 'utf8');
  }

  test('(D-18) activate(): migrateLegacyFeaturesPath precedes migrateLegacySuppressMultiConfig', () => {
    const src = readExtensionSrc();
    const featuresPathIdx = src.indexOf('migrateLegacyFeaturesPath(wkspUri)');
    const suppressIdx = src.indexOf('migrateLegacySuppressMultiConfig(wkspUri)');
    assert.notStrictEqual(featuresPathIdx, -1, 'migrateLegacyFeaturesPath call must exist in extension.ts');
    assert.notStrictEqual(suppressIdx, -1, 'migrateLegacySuppressMultiConfig call must exist in extension.ts');
    assert.ok(
      featuresPathIdx < suppressIdx,
      'D-18: featuresPath migration must run BEFORE suppressMultiConfig (data shape before UX cleanup)',
    );
  });

  test('(D-13) post-loop notification uses suppression key "featuresPathMigration"', () => {
    const src = readExtensionSrc();
    const hasKey = src.includes('"featuresPathMigration"') || src.includes("'featuresPathMigration'");
    assert.ok(hasKey, 'D-13: suppression key literal "featuresPathMigration" must appear in extension.ts');
  });

  test('(D-12) Open Settings command uses @ext:gabeseltzer.gs-behave-bdd publisher', () => {
    const src = readExtensionSrc();
    assert.ok(
      src.includes('@ext:gabeseltzer.gs-behave-bdd'),
      'D-12: Open Settings command must scope to @ext:gabeseltzer.gs-behave-bdd (publisher confirmed in 16-01-SUMMARY)',
    );
  });

  test('(Pitfall 8) config.reloadSettings is NOT awaited — sync void', () => {
    const src = readExtensionSrc();
    assert.ok(
      !src.includes('await config.reloadSettings'),
      'Pitfall 8: config.reloadSettings(wkspUri) is sync void; awaiting it changes the contract for 4 other call sites',
    );
    // Affirmatively check the function IS called (not the entire call site removed).
    assert.ok(
      src.includes('config.reloadSettings(wkspUri)'),
      'config.reloadSettings(wkspUri) must still be called in the activation loop (Pitfall 4 — refresh cache after migration)',
    );
  });
});
