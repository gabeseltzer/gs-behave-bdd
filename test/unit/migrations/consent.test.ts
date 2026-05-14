/**
 * consent.ts orchestrator unit tests.
 *
 * Phase 23 (Migrations Panel Webview) replaced the diagnostics + Code Action
 * surface with a single 'Open Migrations Panel' toast button that opens a
 * Webview panel. This file pins the resulting contract:
 *
 *   - case-2 silent migrationMode paths (migrate-and-delete / migrate-and-keep
 *     / skip) still dispatch handlers directly without UI surface.
 *   - case-2 with mode === 'prompt' OR any case-3 fires a SINGLE summary toast
 *     whose ONLY action button is 'Open Migrations Panel'; clicking it
 *     dispatches the `gs-behave-bdd.openMigrationsPanel` command.
 *   - reloadSettings runs exactly when there was at least one consent hit
 *     (silent or prompt-bound). Preserves the D-18 cache-coherence contract.
 *
 * Handler-level action tests (Migrate & delete writes dest, etc.) live in the
 * registry / migrations.test.ts suites; this file only covers the orchestrator
 * + the toast surface.
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as configModule from '../../../src/configuration';
import {
  runConsentFlow,
  type MigrationEntry,
} from '../../../src/migrations';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscode = require('vscode');

const MOCK_URI = vscode.Uri.file('/fake/workspace');

// ─── Helpers ───────────────────────────────────────────────────────────────

type ScopeValues = {
  globalValue?: unknown;
  workspaceValue?: unknown;
  workspaceFolderValue?: unknown;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makePerKeyScopedConfig(
  byKey: Record<string, ScopeValues>,
  updateSpy?: sinon.SinonSpy,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  return {
    get: (key: string) => {
      const s = byKey[key];
      if (!s) return undefined;
      return s.workspaceFolderValue ?? s.workspaceValue ?? s.globalValue;
    },
    has: () => false,
    inspect: (key: string) => {
      const s = byKey[key] ?? {};
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

function stubLogger(): { logInfo: sinon.SinonSpy } {
  const logInfo = sinon.spy();
  sinon.stub(configModule.config, 'logger').value({ logInfo, logInfoAllWksps: logInfo });
  sinon.stub(configModule.config, 'reloadSettings').callsFake(() => undefined);
  return { logInfo };
}

function makeEntry(id: string): MigrationEntry {
  return {
    id,
    sourceNamespace: 'behave-vsc',
    sourceKey: `${id}__src`,
    destNamespace: 'gs-behave-bdd',
    destKey: `${id}__dest`,
    transform: (src, _dest) => ({ kind: 'write', value: src }),
  };
}

function callsFor(
  spy: sinon.SinonSpy,
  key: string,
  scope?: number,
): sinon.SinonSpyCall[] {
  return spy.getCalls().filter(c => {
    if (c.args[0] !== key) return false;
    if (scope !== undefined && c.args[2] !== scope) return false;
    return true;
  });
}

function countLogInfoMatching(logInfo: sinon.SinonSpy, pattern: RegExp): number {
  return logInfo.getCalls().filter(c => pattern.test(String(c.args[0]))).length;
}

// ─── Suite ─────────────────────────────────────────────────────────────────

suite('consent.ts — runConsentFlow (023-04 panel-toast contract)', () => {

  let updateSpy: sinon.SinonSpy;
  let showStub: sinon.SinonStub;
  let logInfo: sinon.SinonSpy;

  setup(() => {
    updateSpy = sinon.spy(() => Promise.resolve());
    ({ logInfo } = stubLogger());
    showStub = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    // Treat the suite as a multi-root workspace by default so per-scope hits
    // (Workspace, WorkspaceFolder) survive the single-folder dedupe added in
    // runConsentFlow. Individual tests can re-stub to single-folder to assert
    // the dedupe directly.
    sinon.stub(vscode.workspace, 'workspaceFile').value(vscode.Uri.file('/fake.code-workspace'));
  });

  teardown(() => {
    sinon.restore();
  });

  // ─── No-hit short-circuit ────────────────────────────────────────────────

  test('empty hits → no toast, no reloadSettings call', async () => {
    await runConsentFlow(MOCK_URI, [], 'prompt');
    assert.strictEqual(showStub.callCount, 0);
    const reload = configModule.config.reloadSettings as unknown as sinon.SinonStub;
    assert.strictEqual(reload.callCount, 0, 'reloadSettings should not fire when there are no hits');
  });

  // ─── Summary toast surface (single Open Migrations Panel button) ─────────

  test('single case-2 hit (mode=prompt) → 1 summary toast offering Open Migrations Panel', async () => {
    const entry = makeEntry('case2single');
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makePerKeyScopedConfig({}, updateSpy),
    );
    await runConsentFlow(
      MOCK_URI,
      [{ case: 2, entry, scope: vscode.ConfigurationTarget.WorkspaceFolder }],
      'prompt',
    );

    assert.strictEqual(showStub.callCount, 1, 'exactly one summary toast');
    const msg = String(showStub.firstCall.args[0]);
    assert.ok(
      /can be migrated for Behave BDD/.test(msg),
      `summary message should mention "can be migrated for Behave BDD"; got: ${msg}`,
    );
    const buttons = showStub.firstCall.args.slice(1);
    assert.deepStrictEqual(
      buttons,
      ['Open Migrations Panel'],
      'summary toast must offer a single Open Migrations Panel button',
    );
  });

  test('single case-3 hit (any mode) → 1 summary toast (D-A4.3)', async () => {
    const entry = makeEntry('case3single');
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makePerKeyScopedConfig({}, updateSpy),
    );
    // mode = 'skip' would silence case-2 — but case-3 always prompts.
    await runConsentFlow(
      MOCK_URI,
      [{ case: 3, entry, scope: vscode.ConfigurationTarget.WorkspaceFolder }],
      'skip',
    );
    assert.strictEqual(showStub.callCount, 1);
    const buttons = showStub.firstCall.args.slice(1);
    assert.deepStrictEqual(buttons, ['Open Migrations Panel']);
  });

  test('one entry hitting 2 scopes (same case) → still 1 summary toast', async () => {
    const entry = makeEntry('case2multiscope');
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makePerKeyScopedConfig({}, updateSpy),
    );
    await runConsentFlow(
      MOCK_URI,
      [
        { case: 2, entry, scope: vscode.ConfigurationTarget.Global },
        { case: 2, entry, scope: vscode.ConfigurationTarget.WorkspaceFolder },
      ],
      'prompt',
    );
    assert.strictEqual(showStub.callCount, 1);
  });

  test('mixed case-2 + case-3 for one entry → still 1 summary toast', async () => {
    const entry = makeEntry('mixed');
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makePerKeyScopedConfig({}, updateSpy),
    );
    await runConsentFlow(
      MOCK_URI,
      [
        { case: 2, entry, scope: vscode.ConfigurationTarget.Global },
        { case: 3, entry, scope: vscode.ConfigurationTarget.WorkspaceFolder },
      ],
      'prompt',
    );
    assert.strictEqual(showStub.callCount, 1);
  });

  test('summary toast count is pluralized correctly (1 vs N)', async () => {
    const entry = makeEntry('plural');
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makePerKeyScopedConfig({}, updateSpy),
    );
    await runConsentFlow(
      MOCK_URI,
      [
        { case: 2, entry, scope: vscode.ConfigurationTarget.Global },
        { case: 2, entry, scope: vscode.ConfigurationTarget.WorkspaceFolder },
      ],
      'prompt',
    );
    const msg = String(showStub.firstCall.args[0]);
    assert.ok(
      /^\d+ settings? can be migrated for Behave BDD/.test(msg),
      `summary should match new copy; got: ${msg}`,
    );
    assert.ok(msg.startsWith('2 settings'), `expected plural form starting with "2 settings"; got: ${msg}`);
  });

  // ─── Case 2 silent migrationMode paths (no toast) ────────────────────────

  test('mode=migrate-and-delete: case-2 dispatches silently, no toast', async () => {
    const entry = makeEntry('silentMD');
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makePerKeyScopedConfig(
        {
          [entry.sourceKey]: { workspaceValue: 'silent-val' },
          [entry.destKey]: {},
          completedMigrations: {},
        },
        updateSpy,
      ),
    );
    await runConsentFlow(
      MOCK_URI,
      [{ case: 2, entry, scope: vscode.ConfigurationTarget.Workspace }],
      'migrate-and-delete',
    );

    // dest written, source cleared, marker stamped.
    assert.strictEqual(callsFor(updateSpy, entry.destKey, vscode.ConfigurationTarget.Workspace).length, 1);
    assert.strictEqual(callsFor(updateSpy, entry.sourceKey, vscode.ConfigurationTarget.Workspace).length, 1);
    assert.strictEqual(callsFor(updateSpy, 'completedMigrations', vscode.ConfigurationTarget.Workspace).length, 1);

    // No UI surface.
    assert.strictEqual(showStub.callCount, 0);

    // Audit log line still fires.
    assert.strictEqual(countLogInfoMatching(logInfo, /migrate-and-delete at Workspace.*done\./), 1);
  });

  test('mode=migrate-and-keep: dest written, source kept, marker stamped, no UI', async () => {
    const entry = makeEntry('silentMK');
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makePerKeyScopedConfig(
        {
          [entry.sourceKey]: { globalValue: 'keep-val' },
          [entry.destKey]: {},
          completedMigrations: {},
        },
        updateSpy,
      ),
    );
    await runConsentFlow(
      MOCK_URI,
      [{ case: 2, entry, scope: vscode.ConfigurationTarget.Global }],
      'migrate-and-keep',
    );
    assert.strictEqual(callsFor(updateSpy, entry.destKey, vscode.ConfigurationTarget.Global).length, 1);
    assert.strictEqual(callsFor(updateSpy, entry.sourceKey, vscode.ConfigurationTarget.Global).length, 0, 'source must NOT be cleared');
    assert.strictEqual(showStub.callCount, 0);
    assert.strictEqual(countLogInfoMatching(logInfo, /migrate-and-keep at Global.*done\./), 1);
  });

  test('mode=skip (case 2): marks Finished without action, no UI', async () => {
    const entry = makeEntry('silentSkip');
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makePerKeyScopedConfig({ completedMigrations: {} }, updateSpy),
    );
    await runConsentFlow(
      MOCK_URI,
      [{ case: 2, entry, scope: vscode.ConfigurationTarget.Workspace }],
      'skip',
    );
    assert.strictEqual(callsFor(updateSpy, 'completedMigrations', vscode.ConfigurationTarget.Workspace).length, 1);
    assert.strictEqual(showStub.callCount, 0);
    assert.strictEqual(countLogInfoMatching(logInfo, /skip at Workspace.*done\./), 1);
  });

  // ─── reloadSettings is gated on at-least-one-hit ─────────────────────────

  test('reloadSettings fires exactly when there was ≥1 hit (any type)', async () => {
    const entry = makeEntry('reload');
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makePerKeyScopedConfig({}, updateSpy),
    );
    await runConsentFlow(
      MOCK_URI,
      [{ case: 2, entry, scope: vscode.ConfigurationTarget.WorkspaceFolder }],
      'prompt',
    );
    const reload = configModule.config.reloadSettings as unknown as sinon.SinonStub;
    assert.strictEqual(reload.callCount, 1, 'reloadSettings must fire once when there was a hit');
  });

  // ─── 023-04: summary-toast button dispatch (single Open Migrations Panel) ─

  test("'Open Migrations Panel' button executes gs-behave-bdd.openMigrationsPanel", async () => {
    const entry = makeEntry('toastOpenPanel');
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makePerKeyScopedConfig({}, updateSpy),
    );
    const execStub = sinon.stub(vscode.commands, 'executeCommand').resolves(undefined);
    showStub.resolves('Open Migrations Panel');

    await runConsentFlow(
      MOCK_URI,
      [{ case: 2, entry, scope: vscode.ConfigurationTarget.WorkspaceFolder }],
      'prompt',
    );
    // Toast .then() chain is fire-and-forget — yield to the microtask queue.
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));

    const matchingCall = execStub.getCalls().find(c => c.args[0] === 'gs-behave-bdd.openMigrationsPanel');
    assert.ok(
      matchingCall,
      `expected gs-behave-bdd.openMigrationsPanel; got ${JSON.stringify(execStub.getCalls().map(c => c.args[0]))}`,
    );
  });

  test('dismissed summary toast (choice=undefined) is a no-op (no commands fired)', async () => {
    const entry = makeEntry('toastDismissed');
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makePerKeyScopedConfig({}, updateSpy),
    );
    const execStub = sinon.stub(vscode.commands, 'executeCommand').resolves(undefined);
    showStub.resolves(undefined);

    await runConsentFlow(
      MOCK_URI,
      [{ case: 2, entry, scope: vscode.ConfigurationTarget.WorkspaceFolder }],
      'prompt',
    );
    await new Promise(resolve => setImmediate(resolve));

    const panelOpenCalls = execStub.getCalls().filter(c => c.args[0] === 'gs-behave-bdd.openMigrationsPanel');
    assert.strictEqual(panelOpenCalls.length, 0, 'dismissed toast must not open the panel');
  });
});
