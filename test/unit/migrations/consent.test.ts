/**
 * consent.ts orchestrator unit tests.
 *
 * Phase 21 originally drove the consent UX through per-(entry,case) toast
 * prompts. 260513-oh5 swapped that for Problems-pane diagnostics + Code
 * Actions; this file now pins the new contract:
 *
 *   - case-2 silent migrationMode paths (migrate-and-delete / migrate-and-keep
 *     / skip) still dispatch handlers directly without UI surface.
 *   - case-2 with mode === 'prompt' OR any case-3 publishes a Diagnostic per
 *     (entry, case, scope) hit and fires a SINGLE summary toast.
 *   - reloadSettings runs exactly when there was at least one consent hit
 *     (silent or prompt-bound). Preserves the D-18 cache-coherence contract.
 *
 * The handler-level action tests (Migrate & delete writes dest, etc.) and the
 * Code Action dispatch tests now live in test/unit/migrations/diagnostics.test.ts
 * since the prompt-button click path is gone.
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as configModule from '../../../src/configuration';
import {
  runConsentFlow,
  type MigrationEntry,
} from '../../../src/migrations';

// 023-04: the diagnostics surface (publishConsentDiagnostics /
// clearDiagnosticsForEntryAtScope / getDiagnosticCollection /
// disposeDiagnosticCollection) was deleted along with the Problems-pane UI.
// These local shims keep this file compiling so the rest of the unit suite
// can run; assertions that depend on diagnostic state are now expected to
// fail until 023-05 reshapes them around the panel signal.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDiagnosticCollection(): { forEach(cb: (uri: any, diags: any[]) => void): void } {
  return { forEach: () => undefined };
}
function disposeDiagnosticCollection(): void { /* no-op shim — 023-05 cleans this up */ }

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

interface DiagSummary {
  total: number;
  byCode: Map<string, number>;
}

function summarizeDiagnostics(): DiagSummary {
  const out: DiagSummary = { total: 0, byCode: new Map() };
  getDiagnosticCollection().forEach((_uri, diags) => {
    for (const d of diags) {
      out.total++;
      const code = String(d.code);
      out.byCode.set(code, (out.byCode.get(code) ?? 0) + 1);
    }
  });
  return out;
}

// ─── Suite ─────────────────────────────────────────────────────────────────

suite('consent.ts — runConsentFlow (260513-oh5 contract)', () => {

  let updateSpy: sinon.SinonSpy;
  let showStub: sinon.SinonStub;
  let logInfo: sinon.SinonSpy;

  setup(() => {
    updateSpy = sinon.spy(() => Promise.resolve());
    ({ logInfo } = stubLogger());
    showStub = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    // diagnostics.ts reads files for JSONC range parsing. We don't care
    // about ranges here; return empty content so it falls back to [0,0].
    sinon.stub(vscode.workspace.fs, 'readFile').resolves(Buffer.from('{}'));
  });

  teardown(() => {
    disposeDiagnosticCollection();
    sinon.restore();
  });

  // ─── No-hit short-circuit ────────────────────────────────────────────────

  test('empty hits → no toast, no diagnostics, no reloadSettings call', async () => {
    await runConsentFlow(MOCK_URI, [], 'prompt');
    assert.strictEqual(showStub.callCount, 0);
    assert.strictEqual(summarizeDiagnostics().total, 0);
    const reload = configModule.config.reloadSettings as unknown as sinon.SinonStub;
    assert.strictEqual(reload.callCount, 0, 'reloadSettings should not fire when there are no hits');
  });

  // ─── Diagnostic + summary toast (the new prompt surface) ─────────────────

  test('single case-2 hit (mode=prompt) → 1 diagnostic, 1 summary toast', async () => {
    const entry = makeEntry('case2single');
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makePerKeyScopedConfig({}, updateSpy),
    );
    await runConsentFlow(
      MOCK_URI,
      [{ case: 2, entry, scope: vscode.ConfigurationTarget.WorkspaceFolder }],
      'prompt',
    );

    const summary = summarizeDiagnostics();
    assert.strictEqual(summary.total, 1);
    assert.ok(
      summary.byCode.has(`${entry.id}::2::${vscode.ConfigurationTarget.WorkspaceFolder}`),
      'expected the diagnostic to be encoded for case 2 at WorkspaceFolder scope',
    );
    assert.strictEqual(showStub.callCount, 1, 'exactly one summary toast');
    const msg = String(showStub.firstCall.args[0]);
    assert.ok(/can be migrated for Behave BDD/.test(msg), `summary message should mention "can be migrated for Behave BDD"; got: ${msg}`);
    // 260514-djs: summary toast now carries two action buttons.
    const buttons = showStub.firstCall.args.slice(1);
    assert.deepStrictEqual(buttons, ['Open Problems', 'Open Settings'], 'summary toast must offer Open Problems + Open Settings buttons');
  });

  test('single case-3 hit (any mode) → 1 diagnostic, 1 summary toast (D-A4.3)', async () => {
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
    const summary = summarizeDiagnostics();
    assert.strictEqual(summary.total, 1);
    assert.strictEqual(showStub.callCount, 1);
  });

  test('one entry hitting 2 scopes (same case) → 2 diagnostics, still 1 summary toast', async () => {
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
    assert.strictEqual(summarizeDiagnostics().total, 2);
    assert.strictEqual(showStub.callCount, 1);
  });

  test('mixed case-2 + case-3 for one entry → 2 diagnostics (different codes), 1 summary toast', async () => {
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
    const summary = summarizeDiagnostics();
    assert.strictEqual(summary.total, 2);
    assert.ok(summary.byCode.has(`${entry.id}::2::${vscode.ConfigurationTarget.Global}`));
    assert.ok(summary.byCode.has(`${entry.id}::3::${vscode.ConfigurationTarget.WorkspaceFolder}`));
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
    assert.ok(/^\d+ settings? can be migrated for Behave BDD/.test(msg), `summary should match new copy; got: ${msg}`);
    assert.ok(msg.startsWith('2 settings'), `expected plural form starting with "2 settings"; got: ${msg}`);
  });

  // ─── Case 2 silent migrationMode paths (no toast, no diagnostic) ─────────

  test('mode=migrate-and-delete: case-2 dispatches silently, no toast, no diagnostic', async () => {
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
    assert.strictEqual(summarizeDiagnostics().total, 0);

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
    assert.strictEqual(summarizeDiagnostics().total, 0);
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
    assert.strictEqual(summarizeDiagnostics().total, 0);
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

  // ─── 260514-djs: summary-toast button dispatch ───────────────────────────

  test("'Open Problems' button executes workbench.actions.view.problems", async () => {
    const entry = makeEntry('toastOpenProblems');
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makePerKeyScopedConfig({}, updateSpy),
    );
    const execStub = sinon.stub(vscode.commands, 'executeCommand').resolves(undefined);
    showStub.resolves('Open Problems');

    await runConsentFlow(
      MOCK_URI,
      [{ case: 2, entry, scope: vscode.ConfigurationTarget.WorkspaceFolder }],
      'prompt',
    );
    // Toast .then() chain is fire-and-forget — yield to the microtask queue.
    await new Promise(resolve => setImmediate(resolve));

    const matchingCall = execStub.getCalls().find(c => c.args[0] === 'workbench.actions.view.problems');
    assert.ok(matchingCall, `expected workbench.actions.view.problems; got ${JSON.stringify(execStub.getCalls().map(c => c.args[0]))}`);
  });

  test("'Open Settings' button opens the first hit's anchor URI at its range", async () => {
    const entry = makeEntry('toastOpenSettings');
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makePerKeyScopedConfig({}, updateSpy),
    );
    const openDocStub = sinon.stub(vscode.workspace, 'openTextDocument').resolves({} as never);
    const showDocStub = sinon.stub(vscode.window, 'showTextDocument').resolves({} as never);
    showStub.resolves('Open Settings');

    await runConsentFlow(
      MOCK_URI,
      [{ case: 2, entry, scope: vscode.ConfigurationTarget.WorkspaceFolder }],
      'prompt',
    );
    await new Promise(resolve => setImmediate(resolve));

    assert.strictEqual(openDocStub.callCount, 1, 'openTextDocument should be called once for the first hit');
    const openedUri = openDocStub.firstCall.args[0] as { fsPath: string };
    assert.ok(
      String(openedUri.fsPath).includes('.vscode'),
      `expected WorkspaceFolder anchor (.vscode/settings.json); got: ${openedUri.fsPath}`,
    );
    assert.strictEqual(showDocStub.callCount, 1, 'showTextDocument should follow openTextDocument');
  });

  test("'Open Settings' falls back to openSettingsJson when the anchor file can't be opened", async () => {
    const entry = makeEntry('toastFallback');
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makePerKeyScopedConfig({}, updateSpy),
    );
    sinon.stub(vscode.workspace, 'openTextDocument').rejects(new Error('ENOENT'));
    const execStub = sinon.stub(vscode.commands, 'executeCommand').resolves(undefined);
    showStub.resolves('Open Settings');

    await runConsentFlow(
      MOCK_URI,
      [{ case: 2, entry, scope: vscode.ConfigurationTarget.WorkspaceFolder }],
      'prompt',
    );
    await new Promise(resolve => setImmediate(resolve));

    const fallback = execStub.getCalls().find(c => c.args[0] === 'workbench.action.openSettingsJson');
    assert.ok(fallback, 'expected fallback to workbench.action.openSettingsJson when the anchor file is unreadable');
  });
});
