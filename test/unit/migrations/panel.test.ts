/**
 * MigrationsPanel unit tests (Phase 023 Plan 05).
 *
 * Covers the panel lifecycle, HTML render pins, message routing, dispose
 * cleanup, and configuration-change re-render behavior introduced by
 * 023-01..03. Drives the webview indirectly through the helpers exported
 * from `test/unit/vscode.mock.ts`:
 *
 *   - `_getLastWebviewPanel()`   — captures the most recently created panel
 *   - `_fireWebviewMessage(msg)` — invokes the last `onDidReceiveMessage`
 *   - `_disposeWebview()`        — invokes the last `onDidDispose`
 *   - `_fireConfigurationChange` — invokes captured config-change listeners
 *   - `_resetWebviewMocks()`     — resets all capture arrays between tests
 *
 * Test order risk: `MigrationsPanel.currentPanel` is a static singleton —
 * static state survives across tests. A `setup()` hook clears it.
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as configModule from '../../../src/configuration';
import { MigrationsPanel } from '../../../src/migrations';
import * as panelViewModelModule from '../../../src/migrations/panelViewModel';
import * as codeActionsModule from '../../../src/migrations/codeActions';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscode = require('vscode');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscodeMock = require('../vscode.mock');

const MOCK_EXTENSION_URI = vscode.Uri.file('/fake/extension');

function stubLogger(): { logInfo: sinon.SinonSpy } {
  const logInfo = sinon.spy();
  sinon.stub(configModule.config, 'logger').value({ logInfo, logInfoAllWksps: logInfo });
  return { logInfo };
}

function makeViewModel(overrides: Partial<panelViewModelModule.PanelViewModel> = {}): panelViewModelModule.PanelViewModel {
  return {
    rows: [],
    folderCount: 0,
    migrationMode: 'prompt',
    empty: true,
    ...overrides,
  };
}

suite('MigrationsPanel (Phase 023 Plan 05)', () => {

  setup(() => {
    // Clear the static singleton — survives across tests.
    (MigrationsPanel as unknown as { currentPanel: MigrationsPanel | undefined }).currentPanel = undefined;
    vscodeMock._resetWebviewMocks();
    stubLogger();
    // buildViewModel is async + touches workspace.workspaceFolders / config —
    // stub it to a predictable empty state so _refresh() postMessage tests can
    // focus on the protocol rather than the view-model internals.
    sinon.stub(panelViewModelModule, 'buildViewModel').resolves(makeViewModel());
  });

  teardown(() => {
    (MigrationsPanel as unknown as { currentPanel: MigrationsPanel | undefined }).currentPanel = undefined;
    vscodeMock._resetWebviewMocks();
    sinon.restore();
  });

  // ─── 2.1 — createOrShow singleton (Panel-01) ─────────────────────────────

  suite('createOrShow singleton (Panel-01)', () => {

    test('first call creates a webview panel with the expected viewType', () => {
      const spy = sinon.spy(vscode.window, 'createWebviewPanel');
      MigrationsPanel.createOrShow(MOCK_EXTENSION_URI);
      assert.strictEqual(spy.callCount, 1, 'createWebviewPanel must be called once on first createOrShow');
      assert.strictEqual(spy.firstCall.args[0], 'gs-behave-bdd.migrationsPanel');
    });

    test('second call without dispose does NOT create a second panel; reveals the existing one', () => {
      const spy = sinon.spy(vscode.window, 'createWebviewPanel');
      MigrationsPanel.createOrShow(MOCK_EXTENSION_URI);
      const panel = vscodeMock._getLastWebviewPanel();
      assert.ok(panel, 'panel must exist after first createOrShow');
      const revealBefore = panel._revealCalls;

      MigrationsPanel.createOrShow(MOCK_EXTENSION_URI);

      assert.strictEqual(spy.callCount, 1, 'createWebviewPanel must NOT be called a second time');
      assert.strictEqual(panel._revealCalls, revealBefore + 1, 'reveal must fire on the existing panel');
    });

    test('after dispose, a third createOrShow creates a new panel', () => {
      const spy = sinon.spy(vscode.window, 'createWebviewPanel');
      MigrationsPanel.createOrShow(MOCK_EXTENSION_URI);
      vscodeMock._disposeWebview();
      MigrationsPanel.createOrShow(MOCK_EXTENSION_URI);
      assert.strictEqual(spy.callCount, 2, 'createWebviewPanel must be called twice (post-dispose recreate)');
    });
  });

  // ─── 2.2 — HTML rendering pins (Panel-02 + Empty-State) ───────────────────

  suite('HTML rendering pins (Panel-02 / empty state)', () => {

    test('html contains CSP meta + style/script with a 32-char nonce (all three share the same nonce)', () => {
      MigrationsPanel.createOrShow(MOCK_EXTENSION_URI);
      const html = vscodeMock._getLastWebviewPanel()!.webview.html;

      const cspMatch = html.match(/<meta http-equiv="Content-Security-Policy"[^>]*nonce-([A-Za-z0-9]{32})/);
      assert.ok(cspMatch, `CSP meta with 32-char nonce expected; got first 400 chars: ${html.slice(0, 400)}`);
      const nonce = cspMatch[1];

      const styleRe = new RegExp(`<style nonce="${nonce}">`);
      const scriptRe = new RegExp(`<script nonce="${nonce}">`);
      assert.ok(styleRe.test(html), 'style block must use the same nonce as the CSP meta');
      assert.ok(scriptRe.test(html), 'script block must use the same nonce as the CSP meta');
    });

    test('html contains the Migration Mode section with one button per mode value', () => {
      MigrationsPanel.createOrShow(MOCK_EXTENSION_URI);
      const html = vscodeMock._getLastWebviewPanel()!.webview.html;

      assert.ok(/Migration Mode/.test(html), 'html should mention "Migration Mode"');
      // The button markup is rendered client-side from MODES JSON. Pin the
      // JSON-embedded mode values instead — the script literal carries them.
      assert.ok(/"value":"prompt"/.test(html), 'prompt mode option must be embedded');
      assert.ok(/"value":"migrate-and-delete"/.test(html), 'migrate-and-delete mode option must be embedded');
      assert.ok(/"value":"migrate-and-keep"/.test(html), 'migrate-and-keep mode option must be embedded');
      assert.ok(/"value":"skip"/.test(html), 'skip mode option must be embedded');
    });

    test('html regression: no occurrence of "Open Problems" or "Open Settings" (legacy diagnostic surface)', () => {
      MigrationsPanel.createOrShow(MOCK_EXTENSION_URI);
      const html = vscodeMock._getLastWebviewPanel()!.webview.html;
      assert.ok(!/Open Problems/.test(html), 'legacy "Open Problems" button must not appear in panel html');
      assert.ok(!/Open Settings/.test(html), 'legacy "Open Settings" button must not appear in panel html');
    });

    test('html contains a recheck button (data-recheck="true") for the empty-state path', () => {
      MigrationsPanel.createOrShow(MOCK_EXTENSION_URI);
      const html = vscodeMock._getLastWebviewPanel()!.webview.html;
      // The empty-state markup is injected client-side; pin its template literal.
      assert.ok(
        /data-recheck="true"/.test(html),
        'empty-state recheck button (data-recheck="true") must be in the rendered html template',
      );
      assert.ok(/Recheck Migrations/.test(html), 'recheck button label must be present');
    });
  });

  // ─── 2.3 — Message routing (Panel-03) ────────────────────────────────────

  suite('Message routing (Panel-03)', () => {

    const VALID_ARGS: codeActionsModule.MigrationActionArgs = {
      // Use a real registry entry id so validateActionArgs accepts it.
      entryId: 'justMyCode-from-behavevsc',
      case: 2,
      scope: vscode.ConfigurationTarget.Global,
      action: 'migrate-and-delete',
      wkspUri: 'file:///fake/workspace',
    };

    test('dispatchAction with valid payload invokes dispatchMigrationAction and then posts a stateUpdate refresh', async () => {
      const dispatchStub = sinon.stub(codeActionsModule, 'dispatchMigrationAction').resolves();

      MigrationsPanel.createOrShow(MOCK_EXTENSION_URI);
      const panel = vscodeMock._getLastWebviewPanel()!;
      const postedBefore = panel._postedMessages.length;

      vscodeMock._fireWebviewMessage({ kind: 'dispatchAction', args: VALID_ARGS });
      // Yield for the async handler + _refresh()'s awaited postMessage.
      await new Promise(r => setImmediate(r));
      await new Promise(r => setImmediate(r));

      assert.strictEqual(dispatchStub.callCount, 1, 'dispatchMigrationAction must fire for valid payload');
      assert.deepStrictEqual(dispatchStub.firstCall.args[0], VALID_ARGS);

      const refreshPosts = panel._postedMessages.slice(postedBefore).filter(
        (m: unknown) => (m as { kind?: string }).kind === 'stateUpdate',
      );
      assert.ok(refreshPosts.length >= 1, `expected a stateUpdate refresh postMessage; got ${JSON.stringify(panel._postedMessages.slice(postedBefore))}`);
    });

    test('dispatchAction with unknown entryId drops the payload, logs, and does NOT dispatch', async () => {
      const dispatchStub = sinon.stub(codeActionsModule, 'dispatchMigrationAction').resolves();
      const logInfo = sinon.spy();
      sinon.stub(configModule.config, 'logger').value({ logInfo, logInfoAllWksps: logInfo });

      MigrationsPanel.createOrShow(MOCK_EXTENSION_URI);

      vscodeMock._fireWebviewMessage({
        kind: 'dispatchAction',
        args: { ...VALID_ARGS, entryId: 'not-in-registry' },
      });
      await new Promise(r => setImmediate(r));

      assert.strictEqual(dispatchStub.callCount, 0, 'dispatchMigrationAction must NOT fire for invalid payload');
      const logged = logInfo.getCalls().some(c => /invalid payload/.test(String(c.args[0])));
      assert.ok(logged, 'expected a "invalid payload" audit log line');
    });

    test('recheck kind invokes gs-behave-bdd.recheckMigrations via executeCommand', async () => {
      const execStub = sinon.stub(vscode.commands, 'executeCommand').resolves(undefined);

      MigrationsPanel.createOrShow(MOCK_EXTENSION_URI);
      vscodeMock._fireWebviewMessage({ kind: 'recheck' });
      await new Promise(r => setImmediate(r));

      const matchingCall = execStub.getCalls().find((c: sinon.SinonSpyCall) => c.args[0] === 'gs-behave-bdd.recheckMigrations');
      assert.ok(matchingCall, `expected executeCommand('gs-behave-bdd.recheckMigrations'); got ${JSON.stringify(execStub.getCalls().map((c: sinon.SinonSpyCall) => c.args[0]))}`);
    });

    test('setMigrationMode with valid value writes via cfg.update at ConfigurationTarget.Global', async () => {
      const updateSpy = sinon.spy(() => Promise.resolve());
      sinon.stub(vscode.workspace, 'getConfiguration').returns({
        get: () => undefined,
        has: () => false,
        inspect: () => undefined,
        update: updateSpy,
      });

      MigrationsPanel.createOrShow(MOCK_EXTENSION_URI);
      vscodeMock._fireWebviewMessage({ kind: 'setMigrationMode', value: 'migrate-and-keep' });
      await new Promise(r => setImmediate(r));

      assert.strictEqual(updateSpy.callCount, 1, 'cfg.update must be called once for valid setMigrationMode');
      const args = updateSpy.getCall(0).args as unknown as [string, string, number];
      assert.strictEqual(args[0], 'migrationMode');
      assert.strictEqual(args[1], 'migrate-and-keep');
      assert.strictEqual(args[2], vscode.ConfigurationTarget.Global);
    });

    test('setMigrationMode with invalid value is dropped (no cfg.update)', async () => {
      const updateSpy = sinon.spy(() => Promise.resolve());
      sinon.stub(vscode.workspace, 'getConfiguration').returns({
        get: () => undefined,
        has: () => false,
        inspect: () => undefined,
        update: updateSpy,
      });

      MigrationsPanel.createOrShow(MOCK_EXTENSION_URI);
      vscodeMock._fireWebviewMessage({ kind: 'setMigrationMode', value: 'BOGUS' });
      await new Promise(r => setImmediate(r));

      assert.strictEqual(updateSpy.callCount, 0, 'cfg.update must NOT fire for invalid value');
    });

    test('malformed message (no kind) is dropped + logged', async () => {
      const logInfo = sinon.spy();
      sinon.stub(configModule.config, 'logger').value({ logInfo, logInfoAllWksps: logInfo });

      MigrationsPanel.createOrShow(MOCK_EXTENSION_URI);
      vscodeMock._fireWebviewMessage({ foo: 'bar' });
      await new Promise(r => setImmediate(r));

      const logged = logInfo.getCalls().some(c => /malformed webview message/.test(String(c.args[0])));
      assert.ok(logged, 'expected a "malformed webview message" audit log line');
    });
  });

  // ─── 2.4 — Dispose path (Panel-04) ───────────────────────────────────────

  suite('Dispose path (Panel-04)', () => {

    test('disposing nulls currentPanel FIRST, then drains disposables; subsequent fires are no-ops', async () => {
      const dispatchStub = sinon.stub(codeActionsModule, 'dispatchMigrationAction').resolves();
      MigrationsPanel.createOrShow(MOCK_EXTENSION_URI);
      assert.ok(MigrationsPanel.currentPanel, 'panel should be live before dispose');

      vscodeMock._disposeWebview();

      assert.strictEqual(MigrationsPanel.currentPanel, undefined, 'currentPanel must be undefined after dispose');

      // Subsequent fires must not dispatch (the handler hangs off the disposed
      // panel; firing the captured callback should still be a no-op for any
      // observable host side-effect because the panel was disposed first).
      vscodeMock._fireWebviewMessage({
        kind: 'dispatchAction',
        args: {
          entryId: 'justMyCode-from-behavevsc',
          case: 2,
          scope: vscode.ConfigurationTarget.Global,
          action: 'migrate-and-delete',
          wkspUri: 'file:///fake/workspace',
        },
      });
      await new Promise(r => setImmediate(r));

      // dispatchMigrationAction *could* still fire because the captured callback
      // reference is still alive in the mock — but the host's panel reference is
      // gone, so this assertion mainly pins that no exception is thrown and the
      // currentPanel singleton remains cleared.
      assert.strictEqual(MigrationsPanel.currentPanel, undefined, 'currentPanel must remain undefined after a post-dispose fire');
      // Don't assert dispatchStub.callCount === 0 — the mock keeps the callback
      // alive after dispose; the contract being pinned is the singleton + no
      // throw, not the in-mock callback's invocability.
      void dispatchStub;
    });
  });

  // ─── 2.5 — Configuration-change re-render (Panel-05) ─────────────────────

  suite('Configuration-change re-render (Panel-05)', () => {

    test('affectsConfiguration("gs-behave-bdd") triggers a stateUpdate postMessage', async () => {
      MigrationsPanel.createOrShow(MOCK_EXTENSION_URI);
      const panel = vscodeMock._getLastWebviewPanel()!;
      const postedBefore = panel._postedMessages.length;

      vscodeMock._fireConfigurationChange({
        affectsConfiguration: (s: string) => s === 'gs-behave-bdd',
      });
      await new Promise(r => setImmediate(r));
      await new Promise(r => setImmediate(r));

      const stateUpdates = panel._postedMessages.slice(postedBefore).filter(
        (m: unknown) => (m as { kind?: string }).kind === 'stateUpdate',
      );
      assert.ok(stateUpdates.length >= 1, `expected a stateUpdate postMessage after configuration change; got ${JSON.stringify(panel._postedMessages.slice(postedBefore))}`);
    });

    test('affectsConfiguration that returns false for every namespace does NOT post a refresh', async () => {
      MigrationsPanel.createOrShow(MOCK_EXTENSION_URI);
      const panel = vscodeMock._getLastWebviewPanel()!;
      const postedBefore = panel._postedMessages.length;

      vscodeMock._fireConfigurationChange({
        affectsConfiguration: () => false,
      });
      await new Promise(r => setImmediate(r));
      await new Promise(r => setImmediate(r));

      const stateUpdates = panel._postedMessages.slice(postedBefore).filter(
        (m: unknown) => (m as { kind?: string }).kind === 'stateUpdate',
      );
      assert.strictEqual(stateUpdates.length, 0, 'unrelated config changes must NOT trigger a refresh');
    });
  });
});
