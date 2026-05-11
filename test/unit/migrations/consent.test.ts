/**
 * Phase 21 — consent.ts orchestrator unit tests.
 *
 * Covers D-A9.3 of .planning/phases/021-consent-ux-case-2-case-3-prompts/021-CONTEXT.md:
 *   - TEST-01: case 2 prompt path (3 actions + dismissal) and 3 silent
 *     migrationMode paths (migrate-and-delete / migrate-and-keep / skip).
 *   - TEST-02: case 3 prompt path (4 actions + dismissal) plus the invariant
 *     that case 3 ALWAYS prompts even when migrationMode === 'skip' (D-A4.3).
 *   - Grouping (D-A1): per (entry.id, case), one notification covers all
 *     scopes; mixed-case for one entry yields 2 notifications; sequential
 *     await ordering; deterministic group sort order.
 *   - Audit logging (D-A6.1): exactly one logInfo line per dispatched action
 *     (success path), one per dismissal, one per silent skip-scope.
 *
 * Mocking strategy mirrors test/unit/migrations/plain.test.ts (D-A9.2) — pure
 * Sinon stubs on vscode.window.showInformationMessage,
 * vscode.workspace.getConfiguration, and config.logger. No real VS Code APIs.
 *
 * We never import migrateScopedSetting / markMigrationFinishedAtScope directly;
 * we assert on the visible side effects (cfg.update calls + logger.logInfo + showInformationMessage).
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as configModule from '../../../src/configuration';
import { runConsentFlow, type ConsentHit } from '../../../src/migrations';
import type { MigrationEntry } from '../../../src/migrations';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscode = require('vscode');

const MOCK_URI = vscode.Uri.file('/fake/workspace');

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

type ScopeValues = {
  globalValue?: unknown;
  workspaceValue?: unknown;
  workspaceFolderValue?: unknown;
};

/**
 * Per-(namespace × key) inspect/update stub. The orchestrator chain ultimately
 * touches three namespaces:
 *   - source legacy ('behave-vsc' for our test entries),
 *   - dest canonical ('gs-behave-bdd'),
 *   - completedMigrations registry ('gs-behave-bdd' again).
 *
 * For simplicity we accept a flat `byKey` map and apply it regardless of which
 * namespace getConfiguration is called with: each (key) lookup returns the same
 * scope-tuple. That is sufficient because our test entries use distinct
 * sourceKey vs destKey names so namespace collisions cannot occur.
 */
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
  sinon.stub(configModule.config, 'logger').value({ logInfo });
  return { logInfo };
}

/**
 * Build a `MigrationEntry` whose transform is the identity (`{ kind: 'write',
 * value: src }`). Sufficient for every case-2 / case-3 test below — we assert
 * on the cfg.update arguments the primitive emits, not on transform internals.
 *
 * Each entry uses distinct sourceKey / destKey so the per-key inspect stub
 * cannot conflate them.
 */
function makeEntry(id: string): MigrationEntry {
  return {
    id,
    sourceNamespace: 'behave-vsc',
    sourceKey: `${id}__src`,
    destNamespace: 'gs-behave-bdd',
    destKey: `${id}__dest`,
    // identity transform — src flows straight through to the canonical key.
    transform: (src, _dest) => ({ kind: 'write', value: src }),
  };
}

/**
 * Helper to filter `updateSpy` calls down to a specific (key, scope) pair.
 */
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

// Verbatim button-label arrays (PINNED — D-A2.2, D-A2.3).
const CASE_2_BUTTONS = ['Migrate & delete', 'Migrate & keep', "Don't migrate"];
const CASE_3_BUTTONS = ['Overwrite & delete', 'Overwrite & keep', 'Keep canonical', 'Keep both'];

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

suite('Phase 21 — consent.ts', () => {

  let updateSpy: sinon.SinonSpy;
  let showStub: sinon.SinonStub;
  let logInfo: sinon.SinonSpy;

  setup(() => {
    updateSpy = sinon.spy(() => Promise.resolve());
    ({ logInfo } = stubLogger());
    showStub = sinon.stub(vscode.window, 'showInformationMessage');
  });

  teardown(() => sinon.restore());

  // ───────────────────────────────────────────────────────────────────────────
  // Case 2 prompt path (migrationMode === 'prompt')
  // ───────────────────────────────────────────────────────────────────────────

  suite('case 2 prompt (migrationMode = prompt)', () => {

    test('action: Migrate & delete writes dest, clears source, marks Finished', async () => {
      const entry = makeEntry('case2a');
      // Legacy set at Workspace, canonical absent → primitive writes at Workspace.
      sinon.stub(vscode.workspace, 'getConfiguration').returns(
        makePerKeyScopedConfig(
          {
            [entry.sourceKey]: { workspaceValue: 'legacy-value' },
            [entry.destKey]: {},
            completedMigrations: {},
          },
          updateSpy,
        ),
      );
      showStub.resolves('Migrate & delete');

      const hits: ConsentHit[] = [
        { case: 2, entry, scope: vscode.ConfigurationTarget.Workspace },
      ];
      await runConsentFlow(MOCK_URI, hits, 'prompt');

      // Exactly one prompt with the case-2 button set.
      assert.strictEqual(showStub.callCount, 1, 'showInformationMessage called once');
      assert.deepStrictEqual(showStub.firstCall.args.slice(2), CASE_2_BUTTONS);

      // dest written + source cleared at Workspace.
      const destWrites = callsFor(updateSpy, entry.destKey, vscode.ConfigurationTarget.Workspace);
      assert.strictEqual(destWrites.length, 1, 'one dest write at Workspace');
      assert.strictEqual(destWrites[0].args[1], 'legacy-value');
      const srcClears = callsFor(updateSpy, entry.sourceKey, vscode.ConfigurationTarget.Workspace);
      assert.strictEqual(srcClears.length, 1, 'one source clear at Workspace');
      assert.strictEqual(srcClears[0].args[1], undefined);

      // markMigrationFinishedAtScope wrote completedMigrations at Workspace including the entry id.
      const finishedWrites = callsFor(updateSpy, 'completedMigrations', vscode.ConfigurationTarget.Workspace);
      assert.strictEqual(finishedWrites.length, 1);
      assert.ok(Array.isArray(finishedWrites[0].args[1]) && finishedWrites[0].args[1].includes(entry.id));

      // Exactly one audit-log line for the dispatched action.
      assert.strictEqual(countLogInfoMatching(logInfo, /migrate-and-delete at Workspace.*done\./), 1);
    });

    test('action: Migrate & keep writes dest, does NOT clear source, marks Finished', async () => {
      const entry = makeEntry('case2b');
      sinon.stub(vscode.workspace, 'getConfiguration').returns(
        makePerKeyScopedConfig(
          {
            [entry.sourceKey]: { workspaceValue: 'keep-me' },
            [entry.destKey]: {},
            completedMigrations: {},
          },
          updateSpy,
        ),
      );
      showStub.resolves('Migrate & keep');

      await runConsentFlow(
        MOCK_URI,
        [{ case: 2, entry, scope: vscode.ConfigurationTarget.Workspace }],
        'prompt',
      );

      // dest written at Workspace.
      const destWrites = callsFor(updateSpy, entry.destKey, vscode.ConfigurationTarget.Workspace);
      assert.strictEqual(destWrites.length, 1);
      assert.strictEqual(destWrites[0].args[1], 'keep-me');

      // source NOT cleared (removeSource=false).
      const srcClears = callsFor(updateSpy, entry.sourceKey, vscode.ConfigurationTarget.Workspace);
      assert.strictEqual(srcClears.length, 0, 'source key must NOT be cleared for migrate-and-keep');

      // Finished marker written.
      assert.strictEqual(
        callsFor(updateSpy, 'completedMigrations', vscode.ConfigurationTarget.Workspace).length,
        1,
      );

      // Exactly one audit line.
      assert.strictEqual(countLogInfoMatching(logInfo, /migrate-and-keep at Workspace.*done\./), 1);
    });

    test("action: Don't migrate is a pure no-op write but marks Finished", async () => {
      const entry = makeEntry('case2c');
      sinon.stub(vscode.workspace, 'getConfiguration').returns(
        makePerKeyScopedConfig(
          {
            [entry.sourceKey]: { globalValue: 'still-there' },
            [entry.destKey]: {},
            completedMigrations: {},
          },
          updateSpy,
        ),
      );
      showStub.resolves("Don't migrate");

      await runConsentFlow(
        MOCK_URI,
        [{ case: 2, entry, scope: vscode.ConfigurationTarget.Global }],
        'prompt',
      );

      // No dest write, no source clear.
      assert.strictEqual(callsFor(updateSpy, entry.destKey).length, 0);
      assert.strictEqual(callsFor(updateSpy, entry.sourceKey).length, 0);

      // Finished at Global.
      const finished = callsFor(updateSpy, 'completedMigrations', vscode.ConfigurationTarget.Global);
      assert.strictEqual(finished.length, 1);
      assert.ok(Array.isArray(finished[0].args[1]) && finished[0].args[1].includes(entry.id));

      // Exactly one audit line.
      assert.strictEqual(countLogInfoMatching(logInfo, /dont-migrate at Global.*done\./), 1);
    });

    test('dismissal (undefined) does NOT mark Finished and emits one "dismissed" log line', async () => {
      const entry = makeEntry('case2d');
      sinon.stub(vscode.workspace, 'getConfiguration').returns(
        makePerKeyScopedConfig(
          {
            [entry.sourceKey]: { workspaceValue: 'x' },
            [entry.destKey]: {},
            completedMigrations: {},
          },
          updateSpy,
        ),
      );
      showStub.resolves(undefined);

      await runConsentFlow(
        MOCK_URI,
        [{ case: 2, entry, scope: vscode.ConfigurationTarget.Workspace }],
        'prompt',
      );

      assert.strictEqual(showStub.callCount, 1);
      // No writes at all.
      assert.strictEqual(callsFor(updateSpy, entry.destKey).length, 0);
      assert.strictEqual(callsFor(updateSpy, entry.sourceKey).length, 0);
      assert.strictEqual(callsFor(updateSpy, 'completedMigrations').length, 0);
      // Exactly one dismissal audit line.
      assert.strictEqual(countLogInfoMatching(logInfo, /dismissed at Workspace.*re-surface/), 1);
    });

    test('exactly one logInfo line per dispatched action (success path)', async () => {
      const entry = makeEntry('case2e');
      sinon.stub(vscode.workspace, 'getConfiguration').returns(
        makePerKeyScopedConfig(
          {
            [entry.sourceKey]: { workspaceValue: 'v' },
            [entry.destKey]: {},
            completedMigrations: {},
          },
          updateSpy,
        ),
      );
      showStub.resolves('Migrate & delete');

      await runConsentFlow(
        MOCK_URI,
        [{ case: 2, entry, scope: vscode.ConfigurationTarget.Workspace }],
        'prompt',
      );

      // Filter to action-success lines for this entry.id only — there may be
      // unrelated logger.logInfo invocations from helpers; the contract is
      // "exactly one for the dispatched action".
      const matches = logInfo.getCalls().filter(c =>
        /case2e:.*done\./.test(String(c.args[0])),
      );
      assert.strictEqual(matches.length, 1, 'exactly one success audit line per action');
    });

    test('button labels are exactly ["Migrate & delete", "Migrate & keep", "Don\'t migrate"]', async () => {
      const entry = makeEntry('case2f');
      sinon.stub(vscode.workspace, 'getConfiguration').returns(
        makePerKeyScopedConfig(
          {
            [entry.sourceKey]: { workspaceValue: 'v' },
            [entry.destKey]: {},
            completedMigrations: {},
          },
          updateSpy,
        ),
      );
      showStub.resolves(undefined);

      await runConsentFlow(
        MOCK_URI,
        [{ case: 2, entry, scope: vscode.ConfigurationTarget.Workspace }],
        'prompt',
      );

      assert.strictEqual(showStub.callCount, 1);
      // 2nd arg is { modal: false }; rest are the button labels.
      assert.deepStrictEqual(showStub.firstCall.args[1], { modal: false });
      assert.deepStrictEqual(showStub.firstCall.args.slice(2), CASE_2_BUTTONS);
    });

  });

  // ───────────────────────────────────────────────────────────────────────────
  // Case 2 silent paths (migrationMode !== 'prompt')
  // ───────────────────────────────────────────────────────────────────────────

  suite('case 2 silent (migrationMode != prompt)', () => {

    test('migrationMode=migrate-and-delete runs silently, no showInformationMessage call', async () => {
      const entry = makeEntry('case2silentA');
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

      assert.strictEqual(showStub.callCount, 0, 'no prompt for silent migrationMode');
      // dest written, source cleared, finished written.
      assert.strictEqual(callsFor(updateSpy, entry.destKey, vscode.ConfigurationTarget.Workspace).length, 1);
      assert.strictEqual(callsFor(updateSpy, entry.sourceKey, vscode.ConfigurationTarget.Workspace).length, 1);
      assert.strictEqual(
        callsFor(updateSpy, 'completedMigrations', vscode.ConfigurationTarget.Workspace).length,
        1,
      );
      assert.strictEqual(countLogInfoMatching(logInfo, /migrate-and-delete at Workspace.*done\./), 1);
    });

    test('migrationMode=migrate-and-keep runs silently, no showInformationMessage call', async () => {
      const entry = makeEntry('case2silentB');
      sinon.stub(vscode.workspace, 'getConfiguration').returns(
        makePerKeyScopedConfig(
          {
            [entry.sourceKey]: { globalValue: 'keep-it' },
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

      assert.strictEqual(showStub.callCount, 0);
      // dest written at Global, source NOT cleared.
      assert.strictEqual(callsFor(updateSpy, entry.destKey, vscode.ConfigurationTarget.Global).length, 1);
      assert.strictEqual(callsFor(updateSpy, entry.sourceKey).length, 0);
      assert.strictEqual(
        callsFor(updateSpy, 'completedMigrations', vscode.ConfigurationTarget.Global).length,
        1,
      );
      assert.strictEqual(countLogInfoMatching(logInfo, /migrate-and-keep at Global.*done\./), 1);
    });

    test('migrationMode=skip marks Finished without writing, logs "skip at <Scope>"', async () => {
      const entry = makeEntry('case2silentC');
      sinon.stub(vscode.workspace, 'getConfiguration').returns(
        makePerKeyScopedConfig(
          {
            [entry.sourceKey]: { workspaceFolderValue: 'ignore-me' },
            [entry.destKey]: {},
            completedMigrations: {},
          },
          updateSpy,
        ),
      );

      await runConsentFlow(
        MOCK_URI,
        [{ case: 2, entry, scope: vscode.ConfigurationTarget.WorkspaceFolder }],
        'skip',
      );

      assert.strictEqual(showStub.callCount, 0);
      // No dest write, no source clear.
      assert.strictEqual(callsFor(updateSpy, entry.destKey).length, 0);
      assert.strictEqual(callsFor(updateSpy, entry.sourceKey).length, 0);
      // Finished at WorkspaceFolder.
      assert.strictEqual(
        callsFor(updateSpy, 'completedMigrations', vscode.ConfigurationTarget.WorkspaceFolder).length,
        1,
      );
      assert.strictEqual(countLogInfoMatching(logInfo, /skip at WorkspaceFolder.*done\./), 1);
    });

  });

  // ───────────────────────────────────────────────────────────────────────────
  // Case 3 prompt path (always prompts, including when mode = skip)
  // ───────────────────────────────────────────────────────────────────────────

  suite('case 3 prompt (always)', () => {

    test('action: Overwrite & delete overwrites canonical and removes source', async () => {
      const entry = makeEntry('case3a');
      // Both source and canonical set at Workspace (case 3).
      sinon.stub(vscode.workspace, 'getConfiguration').returns(
        makePerKeyScopedConfig(
          {
            [entry.sourceKey]: { workspaceValue: 'legacy-wins' },
            [entry.destKey]: { workspaceValue: 'old-canonical' },
            completedMigrations: {},
          },
          updateSpy,
        ),
      );
      showStub.resolves('Overwrite & delete');

      await runConsentFlow(
        MOCK_URI,
        [{ case: 3, entry, scope: vscode.ConfigurationTarget.Workspace }],
        'prompt',
      );

      assert.strictEqual(showStub.callCount, 1);
      assert.deepStrictEqual(showStub.firstCall.args.slice(2), CASE_3_BUTTONS);

      const destWrites = callsFor(updateSpy, entry.destKey, vscode.ConfigurationTarget.Workspace);
      assert.strictEqual(destWrites.length, 1, 'canonical overwritten exactly once');
      assert.strictEqual(destWrites[0].args[1], 'legacy-wins');
      const srcClears = callsFor(updateSpy, entry.sourceKey, vscode.ConfigurationTarget.Workspace);
      assert.strictEqual(srcClears.length, 1);
      assert.strictEqual(srcClears[0].args[1], undefined);

      assert.strictEqual(
        callsFor(updateSpy, 'completedMigrations', vscode.ConfigurationTarget.Workspace).length,
        1,
      );
      assert.strictEqual(countLogInfoMatching(logInfo, /overwrite-and-delete at Workspace.*done\./), 1);
    });

    test('action: Overwrite & keep overwrites canonical and keeps source', async () => {
      const entry = makeEntry('case3b');
      sinon.stub(vscode.workspace, 'getConfiguration').returns(
        makePerKeyScopedConfig(
          {
            [entry.sourceKey]: { globalValue: 'legacy-wins-too' },
            [entry.destKey]: { globalValue: 'old' },
            completedMigrations: {},
          },
          updateSpy,
        ),
      );
      showStub.resolves('Overwrite & keep');

      await runConsentFlow(
        MOCK_URI,
        [{ case: 3, entry, scope: vscode.ConfigurationTarget.Global }],
        'prompt',
      );

      const destWrites = callsFor(updateSpy, entry.destKey, vscode.ConfigurationTarget.Global);
      assert.strictEqual(destWrites.length, 1);
      assert.strictEqual(destWrites[0].args[1], 'legacy-wins-too');
      // Source NOT cleared.
      assert.strictEqual(callsFor(updateSpy, entry.sourceKey).length, 0);

      assert.strictEqual(
        callsFor(updateSpy, 'completedMigrations', vscode.ConfigurationTarget.Global).length,
        1,
      );
      assert.strictEqual(countLogInfoMatching(logInfo, /overwrite-and-keep at Global.*done\./), 1);
    });

    test('action: Keep canonical clears legacy without writing canonical', async () => {
      const entry = makeEntry('case3c');
      sinon.stub(vscode.workspace, 'getConfiguration').returns(
        makePerKeyScopedConfig(
          {
            [entry.sourceKey]: { workspaceValue: 'legacy-going-away' },
            [entry.destKey]: { workspaceValue: 'canonical-stays' },
            completedMigrations: {},
          },
          updateSpy,
        ),
      );
      showStub.resolves('Keep canonical');

      await runConsentFlow(
        MOCK_URI,
        [{ case: 3, entry, scope: vscode.ConfigurationTarget.Workspace }],
        'prompt',
      );

      // Canonical key NOT written.
      assert.strictEqual(
        callsFor(updateSpy, entry.destKey).length,
        0,
        'canonical (destKey) must NOT be written for keep-canonical-and-delete-legacy',
      );
      // Source cleared.
      const srcClears = callsFor(updateSpy, entry.sourceKey, vscode.ConfigurationTarget.Workspace);
      assert.strictEqual(srcClears.length, 1);
      assert.strictEqual(srcClears[0].args[1], undefined);

      assert.strictEqual(
        callsFor(updateSpy, 'completedMigrations', vscode.ConfigurationTarget.Workspace).length,
        1,
      );
      assert.strictEqual(countLogInfoMatching(logInfo, /keep-canonical-and-delete-legacy at Workspace.*done\./), 1);
    });

    test('action: Keep both is a pure no-op write but marks Finished', async () => {
      const entry = makeEntry('case3d');
      sinon.stub(vscode.workspace, 'getConfiguration').returns(
        makePerKeyScopedConfig(
          {
            [entry.sourceKey]: { workspaceValue: 'a' },
            [entry.destKey]: { workspaceValue: 'b' },
            completedMigrations: {},
          },
          updateSpy,
        ),
      );
      showStub.resolves('Keep both');

      await runConsentFlow(
        MOCK_URI,
        [{ case: 3, entry, scope: vscode.ConfigurationTarget.Workspace }],
        'prompt',
      );

      // Neither key touched.
      assert.strictEqual(callsFor(updateSpy, entry.destKey).length, 0);
      assert.strictEqual(callsFor(updateSpy, entry.sourceKey).length, 0);
      // Finished still marked.
      assert.strictEqual(
        callsFor(updateSpy, 'completedMigrations', vscode.ConfigurationTarget.Workspace).length,
        1,
      );
      assert.strictEqual(countLogInfoMatching(logInfo, /keep-both at Workspace.*done\./), 1);
    });

    test('dismissal (undefined) does NOT mark Finished and emits one "dismissed" log line', async () => {
      const entry = makeEntry('case3e');
      sinon.stub(vscode.workspace, 'getConfiguration').returns(
        makePerKeyScopedConfig(
          {
            [entry.sourceKey]: { workspaceValue: 'a' },
            [entry.destKey]: { workspaceValue: 'b' },
            completedMigrations: {},
          },
          updateSpy,
        ),
      );
      showStub.resolves(undefined);

      await runConsentFlow(
        MOCK_URI,
        [{ case: 3, entry, scope: vscode.ConfigurationTarget.Workspace }],
        'prompt',
      );

      assert.strictEqual(showStub.callCount, 1);
      assert.strictEqual(callsFor(updateSpy, entry.destKey).length, 0);
      assert.strictEqual(callsFor(updateSpy, entry.sourceKey).length, 0);
      assert.strictEqual(callsFor(updateSpy, 'completedMigrations').length, 0);
      assert.strictEqual(countLogInfoMatching(logInfo, /dismissed at Workspace.*re-surface/), 1);
    });

    test('case 3 still prompts when migrationMode = skip (D-A4.3)', async () => {
      const entry = makeEntry('case3f');
      sinon.stub(vscode.workspace, 'getConfiguration').returns(
        makePerKeyScopedConfig(
          {
            [entry.sourceKey]: { workspaceValue: 'a' },
            [entry.destKey]: { workspaceValue: 'b' },
            completedMigrations: {},
          },
          updateSpy,
        ),
      );
      showStub.resolves('Keep both');

      await runConsentFlow(
        MOCK_URI,
        [{ case: 3, entry, scope: vscode.ConfigurationTarget.Workspace }],
        'skip',
      );

      // Despite mode === 'skip', the case-3 prompt must still appear with all 4 buttons.
      assert.strictEqual(showStub.callCount, 1, 'case 3 must prompt even when migrationMode = skip');
      assert.deepStrictEqual(showStub.firstCall.args.slice(2), CASE_3_BUTTONS);
    });

    test('button labels are exactly ["Overwrite & delete", "Overwrite & keep", "Keep canonical", "Keep both"]', async () => {
      const entry = makeEntry('case3g');
      sinon.stub(vscode.workspace, 'getConfiguration').returns(
        makePerKeyScopedConfig(
          {
            [entry.sourceKey]: { workspaceValue: 'a' },
            [entry.destKey]: { workspaceValue: 'b' },
            completedMigrations: {},
          },
          updateSpy,
        ),
      );
      showStub.resolves(undefined);

      await runConsentFlow(
        MOCK_URI,
        [{ case: 3, entry, scope: vscode.ConfigurationTarget.Workspace }],
        'prompt',
      );

      assert.strictEqual(showStub.callCount, 1);
      assert.deepStrictEqual(showStub.firstCall.args[1], { modal: false });
      assert.deepStrictEqual(showStub.firstCall.args.slice(2), CASE_3_BUTTONS);
    });

  });

  // ───────────────────────────────────────────────────────────────────────────
  // Grouping (D-A1)
  // ───────────────────────────────────────────────────────────────────────────

  suite('grouping (D-A1)', () => {

    test('one entry hitting the same case at 2 scopes -> 1 notification, action runs at both scopes', async () => {
      const entry = makeEntry('groupA');
      // Source set at BOTH Global and Workspace so the primitive can pick the
      // matching scope on each pass. (migrateScopedSetting picks most-specific
      // available; with values at both Global and Workspace it would write at
      // Workspace twice. Use distinct keys per scope by clearing on second pass
      // is messy — easier: use only one scope present at a time. But the test
      // requires both Workspace and Global. We'll rely on the orchestrator
      // calling the handler once per scope; the handler uses migrateScopedSetting
      // which inspects fresh each call. The inspect stub returns the same map
      // each call, so the primitive will pick the SAME scope each time.)
      //
      // To make this test robust regardless of which scope the primitive picks
      // internally, we assert on what the orchestrator controls: the prompt
      // count, and the completedMigrations writes at the two requested scopes.
      sinon.stub(vscode.workspace, 'getConfiguration').returns(
        makePerKeyScopedConfig(
          {
            [entry.sourceKey]: { workspaceValue: 'wv', globalValue: 'gv' },
            [entry.destKey]: {},
            completedMigrations: {},
          },
          updateSpy,
        ),
      );
      showStub.resolves("Don't migrate"); // pure marker-write — avoids primitive scope picking ambiguity

      const hits: ConsentHit[] = [
        { case: 2, entry, scope: vscode.ConfigurationTarget.Workspace },
        { case: 2, entry, scope: vscode.ConfigurationTarget.Global },
      ];
      await runConsentFlow(MOCK_URI, hits, 'prompt');

      // Exactly one prompt.
      assert.strictEqual(showStub.callCount, 1, 'one notification covers both scopes');

      // markFinished writes at BOTH Workspace and Global.
      const wsFinished = callsFor(updateSpy, 'completedMigrations', vscode.ConfigurationTarget.Workspace);
      const gFinished = callsFor(updateSpy, 'completedMigrations', vscode.ConfigurationTarget.Global);
      assert.strictEqual(wsFinished.length, 1, 'Workspace finished marker written');
      assert.strictEqual(gFinished.length, 1, 'Global finished marker written');
      assert.ok(Array.isArray(wsFinished[0].args[1]) && wsFinished[0].args[1].includes(entry.id));
      assert.ok(Array.isArray(gFinished[0].args[1]) && gFinished[0].args[1].includes(entry.id));

      // Two audit lines (one per scope) for the dispatched action.
      assert.strictEqual(countLogInfoMatching(logInfo, /groupA: dont-migrate at .*done\./), 2);
    });

    test('one entry hitting case 2 at one scope and case 3 at another -> 2 notifications (D-A1.2)', async () => {
      const entry = makeEntry('groupB');
      sinon.stub(vscode.workspace, 'getConfiguration').returns(
        makePerKeyScopedConfig(
          {
            [entry.sourceKey]: { workspaceValue: 'a', workspaceFolderValue: 'b' },
            [entry.destKey]: { workspaceFolderValue: 'c' },
            completedMigrations: {},
          },
          updateSpy,
        ),
      );
      // First call (case 2 -> 3 buttons) returns Don't migrate; second call
      // (case 3 -> 4 buttons) returns Keep both. Both are pure marker writes.
      showStub.onFirstCall().resolves("Don't migrate");
      showStub.onSecondCall().resolves('Keep both');

      const hits: ConsentHit[] = [
        { case: 2, entry, scope: vscode.ConfigurationTarget.Workspace },
        { case: 3, entry, scope: vscode.ConfigurationTarget.WorkspaceFolder },
      ];
      await runConsentFlow(MOCK_URI, hits, 'prompt');

      assert.strictEqual(showStub.callCount, 2, 'mixed-case for same entry -> 2 prompts');
      // Deterministic sort order: same entry.id, case 2 before case 3.
      assert.deepStrictEqual(showStub.firstCall.args.slice(2), CASE_2_BUTTONS);
      assert.deepStrictEqual(showStub.secondCall.args.slice(2), CASE_3_BUTTONS);
    });

    test('groups are processed sequentially (call N+1 only fires after call N resolves)', async () => {
      const entryA = makeEntry('seqA');
      const entryB = makeEntry('seqB');
      sinon.stub(vscode.workspace, 'getConfiguration').returns(
        makePerKeyScopedConfig(
          {
            [entryA.sourceKey]: { workspaceValue: 'a' },
            [entryA.destKey]: {},
            [entryB.sourceKey]: { workspaceValue: 'b' },
            [entryB.destKey]: {},
            completedMigrations: {},
          },
          updateSpy,
        ),
      );

      // Track ordering: when call #2 starts, call #1 MUST have already resolved.
      let firstCallResolved = false;
      let firstHadResolvedAtStartOfSecond = false;
      let callIdx = 0;
      showStub.callsFake(() => {
        const isFirst = callIdx === 0;
        callIdx += 1;
        if (isFirst) {
          // Delay resolution so a parallel implementation would race.
          return new Promise(resolve => setTimeout(() => {
            firstCallResolved = true;
            resolve("Don't migrate");
          }, 25));
        }
        firstHadResolvedAtStartOfSecond = firstCallResolved;
        return Promise.resolve('Keep both');
      });

      // Two distinct entries → two groups → sorted by entry.id (seqA < seqB).
      const hits: ConsentHit[] = [
        { case: 2, entry: entryA, scope: vscode.ConfigurationTarget.Workspace },
        { case: 3, entry: entryB, scope: vscode.ConfigurationTarget.Workspace },
      ];
      await runConsentFlow(MOCK_URI, hits, 'prompt');

      assert.strictEqual(showStub.callCount, 2);
      assert.strictEqual(firstHadResolvedAtStartOfSecond, true,
        'second prompt must only fire AFTER first resolves');
    });

    test('groups are sorted deterministically: by entry.id asc, then case asc', async () => {
      // Use distinct entry ids picked so alphabetical order is unambiguous.
      const entryEarly = makeEntry('aaa-early');
      const entryLate = makeEntry('zzz-late');
      sinon.stub(vscode.workspace, 'getConfiguration').returns(
        makePerKeyScopedConfig(
          {
            [entryEarly.sourceKey]: { workspaceValue: 'e' },
            [entryEarly.destKey]: { workspaceValue: 'eD' }, // case 3 at Workspace
            [entryLate.sourceKey]: { workspaceValue: 'l' },
            [entryLate.destKey]: {},                         // case 2 at Workspace
            completedMigrations: {},
          },
          updateSpy,
        ),
      );
      // Resolve every prompt with Keep both / Don't migrate (pure marker writes).
      showStub.callsFake((_msg: string, _opts: unknown, ...buttons: string[]) => {
        // 4 buttons → case 3, return Keep both; 3 buttons → case 2, return Don't migrate.
        return Promise.resolve(buttons.length === 4 ? 'Keep both' : "Don't migrate");
      });

      // Insert hits in REVERSE of expected sort order to confirm the orchestrator sorts them.
      const hits: ConsentHit[] = [
        { case: 3, entry: entryLate, scope: vscode.ConfigurationTarget.Workspace }, // would be last
        // (but entryLate is case 2 below; case 3 at Workspace would require destKey set — keep one hit per pair)
        { case: 2, entry: entryLate, scope: vscode.ConfigurationTarget.Workspace },
        { case: 3, entry: entryEarly, scope: vscode.ConfigurationTarget.Workspace },
        { case: 2, entry: entryEarly, scope: vscode.ConfigurationTarget.Workspace },
      ];
      // Note: 4 hits, 4 distinct (entry, case) groups → 4 prompts in this order:
      //   aaa-early/case2, aaa-early/case3, zzz-late/case2, zzz-late/case3
      await runConsentFlow(MOCK_URI, hits, 'prompt');

      assert.strictEqual(showStub.callCount, 4);

      // Inspect the message strings to verify ordering. formatCase2Message
      // includes the sourceKey; formatCase3Message starts with "Both `…`".
      const c0 = String(showStub.getCall(0).args[0]);
      const c1 = String(showStub.getCall(1).args[0]);
      const c2 = String(showStub.getCall(2).args[0]);
      const c3 = String(showStub.getCall(3).args[0]);

      assert.ok(c0.includes(entryEarly.sourceKey) && !c0.startsWith('Both'),
        'call 0: aaa-early case 2');
      assert.ok(c1.includes(entryEarly.sourceKey) && c1.startsWith('Both'),
        'call 1: aaa-early case 3');
      assert.ok(c2.includes(entryLate.sourceKey) && !c2.startsWith('Both'),
        'call 2: zzz-late case 2');
      assert.ok(c3.includes(entryLate.sourceKey) && c3.startsWith('Both'),
        'call 3: zzz-late case 3');
    });

  });

  // ───────────────────────────────────────────────────────────────────────────
  // Audit logging (D-A6)
  // ───────────────────────────────────────────────────────────────────────────

  suite('audit logging (D-A6)', () => {

    test('each of the 7 explicit actions emits exactly one logInfo line on success', async () => {
      // Drive every action through the orchestrator and confirm exactly one
      // "<action> at <Scope> — done." line per dispatch.
      const cases: Array<{
        action: string;
        button: string;
        kase: 2 | 3;
        // dest must be set for case 3 only.
        destValue: string | undefined;
      }> = [
        { action: 'migrate-and-delete',                   button: 'Migrate & delete',   kase: 2, destValue: undefined },
        { action: 'migrate-and-keep',                     button: 'Migrate & keep',     kase: 2, destValue: undefined },
        { action: 'dont-migrate',                         button: "Don't migrate",      kase: 2, destValue: undefined },
        { action: 'overwrite-and-delete',                 button: 'Overwrite & delete', kase: 3, destValue: 'd' },
        { action: 'overwrite-and-keep',                   button: 'Overwrite & keep',   kase: 3, destValue: 'd' },
        { action: 'keep-canonical-and-delete-legacy',    button: 'Keep canonical',     kase: 3, destValue: 'd' },
        { action: 'keep-both',                            button: 'Keep both',          kase: 3, destValue: 'd' },
      ];

      for (const c of cases) {
        // Restore prior stubs to avoid duplicate getConfiguration stubs.
        sinon.restore();
        updateSpy = sinon.spy(() => Promise.resolve());
        ({ logInfo } = stubLogger());
        showStub = sinon.stub(vscode.window, 'showInformationMessage');

        const entry = makeEntry(`audit-${c.action}`);
        sinon.stub(vscode.workspace, 'getConfiguration').returns(
          makePerKeyScopedConfig(
            {
              [entry.sourceKey]: { workspaceValue: 'src' },
              [entry.destKey]: c.destValue !== undefined ? { workspaceValue: c.destValue } : {},
              completedMigrations: {},
            },
            updateSpy,
          ),
        );
        showStub.resolves(c.button);

        await runConsentFlow(
          MOCK_URI,
          [{ case: c.kase, entry, scope: vscode.ConfigurationTarget.Workspace }],
          'prompt',
        );

        const pattern = new RegExp(`audit-${c.action}:.*${c.action} at Workspace.*done\\.`);
        const matches = logInfo.getCalls().filter(call => pattern.test(String(call.args[0])));
        assert.strictEqual(
          matches.length, 1,
          `action ${c.action} must emit exactly one success audit line; got ${matches.length}`,
        );
      }
    });

    test('dismissal emits exactly one "dismissed" logInfo line with the raw scope name', async () => {
      const entry = makeEntry('audit-dismiss');
      sinon.stub(vscode.workspace, 'getConfiguration').returns(
        makePerKeyScopedConfig(
          {
            [entry.sourceKey]: { workspaceFolderValue: 'x' },
            [entry.destKey]: {},
            completedMigrations: {},
          },
          updateSpy,
        ),
      );
      showStub.resolves(undefined);

      await runConsentFlow(
        MOCK_URI,
        [{ case: 2, entry, scope: vscode.ConfigurationTarget.WorkspaceFolder }],
        'prompt',
      );

      // Exactly one dismissal line using the raw VS Code scope name (D-A6.3).
      const matches = logInfo.getCalls().filter(c =>
        /audit-dismiss: dismissed at WorkspaceFolder/.test(String(c.args[0])),
      );
      assert.strictEqual(matches.length, 1);
    });

    test('migrationMode=skip silent path emits one "skip at <Scope>" logInfo line per scope', async () => {
      const entry = makeEntry('audit-skip');
      sinon.stub(vscode.workspace, 'getConfiguration').returns(
        makePerKeyScopedConfig(
          {
            [entry.sourceKey]: { globalValue: 'g', workspaceValue: 'w' },
            [entry.destKey]: {},
            completedMigrations: {},
          },
          updateSpy,
        ),
      );

      const hits: ConsentHit[] = [
        { case: 2, entry, scope: vscode.ConfigurationTarget.Global },
        { case: 2, entry, scope: vscode.ConfigurationTarget.Workspace },
      ];
      await runConsentFlow(MOCK_URI, hits, 'skip');

      // One skip line per scope.
      assert.strictEqual(countLogInfoMatching(logInfo, /audit-skip: skip at Global.*done\./), 1);
      assert.strictEqual(countLogInfoMatching(logInfo, /audit-skip: skip at Workspace.*done\./), 1);
    });

  });

});
