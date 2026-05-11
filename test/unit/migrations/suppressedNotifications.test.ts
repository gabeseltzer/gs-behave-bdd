import * as assert from 'assert';
import * as sinon from 'sinon';
import * as configModule from '../../../src/configuration';
import {
  suppressMultiConfigToArray,
  suppressedNotificationsAppendWithDedup,
  suppressedNotificationsEntries,
} from '../../../src/migrations/suppressedNotifications';
import { evaluateMigration } from '../../../src/migrations';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscode = require('vscode');

const MOCK_URI = vscode.Uri.file('/fake/workspace');

type ScopeValues = {
  globalValue?: unknown;
  workspaceValue?: unknown;
  workspaceFolderValue?: unknown;
};

/**
 * Per-key scoped-config stub: copied from plain.test.ts to avoid a shared-file
 * refactor (DRY violation accepted; Plan 05 may consolidate).
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

function stubLogger(): void {
  const logInfo = sinon.spy();
  sinon.stub(configModule.config, 'logger').value({ logInfo });
}

// ─── suppressMultiConfigToArray transform ─────────────────────────────────────

suite('Phase 20 — suppressMultiConfigToArray transform', () => {

  // Test 1: false -> skipDest (callCount === 0 contract)
  test('legacyValue false returns skipDest removeSource:false', () => {
    const result = suppressMultiConfigToArray(false, []);
    assert.deepStrictEqual(result, { kind: 'skipDest', removeSource: false });
  });

  // Test 2: undefined -> skipDest (same contract, !== true branch)
  test('legacyValue undefined returns skipDest removeSource:false', () => {
    const result = suppressMultiConfigToArray(undefined, []);
    assert.deepStrictEqual(result, { kind: 'skipDest', removeSource: false });
  });

  // Test 3: true with undefined existingArr -> write with array containing the id
  test('legacyValue true with undefined existingArr returns write [multiConfigNotification]', () => {
    const result = suppressMultiConfigToArray(true, undefined);
    assert.deepStrictEqual(result, { kind: 'write', value: ['multiConfigNotification'] });
  });

  // Test 4: true with already-present id -> dedup (write with unchanged array)
  test('legacyValue true with multiConfigNotification already present returns write (dedup)', () => {
    const result = suppressMultiConfigToArray(true, ['multiConfigNotification']);
    assert.deepStrictEqual(result, { kind: 'write', value: ['multiConfigNotification'] });
  });

  // Test 5: true with other entry present -> append
  test('legacyValue true with other entry present appends multiConfigNotification', () => {
    const result = suppressMultiConfigToArray(true, ['featuresPathMigration']);
    assert.deepStrictEqual(result, { kind: 'write', value: ['featuresPathMigration', 'multiConfigNotification'] });
  });

});

// ─── suppressedNotificationsAppendWithDedup transform ─────────────────────────

suite('Phase 20 — suppressedNotificationsAppendWithDedup transform', () => {

  // Test 1: undefined legacyArr -> skipDest + removeSource
  test('undefined legacyArr returns skipDest + removeSource:true', () => {
    const result = suppressedNotificationsAppendWithDedup(undefined, []);
    assert.deepStrictEqual(result, { kind: 'skipDest', removeSource: true });
  });

  // Test 2: empty legacyArr -> write with canonical unchanged
  test('empty legacyArr returns write with existing arr unchanged', () => {
    const result = suppressedNotificationsAppendWithDedup([], ['existing']);
    assert.deepStrictEqual(result, { kind: 'write', value: ['existing'] });
  });

  // Test 3: dedup - all items already in canonical
  test('all legacy items already in canonical returns write with canonical unchanged (dedup)', () => {
    const result = suppressedNotificationsAppendWithDedup(['a', 'b'], ['a', 'b', 'c']);
    assert.deepStrictEqual(result, { kind: 'write', value: ['a', 'b', 'c'] });
  });

  // Test 4: append - new items not in canonical
  test('new legacy items appended to canonical', () => {
    const result = suppressedNotificationsAppendWithDedup(['newItem'], ['existingItem']);
    assert.deepStrictEqual(result, { kind: 'write', value: ['existingItem', 'newItem'] });
  });

  // Test 5: mixed - some new, some existing
  test('mixed: existing items deduped, new items appended', () => {
    const result = suppressedNotificationsAppendWithDedup(['a', 'b', 'c'], ['b', 'd']);
    assert.deepStrictEqual(result, { kind: 'write', value: ['b', 'd', 'a', 'c'] });
  });

  // Test 6: undefined canonical -> write with legacy items only
  test('undefined canonical with legacy items returns write with legacy items', () => {
    const result = suppressedNotificationsAppendWithDedup(['item1', 'item2'], undefined);
    assert.deepStrictEqual(result, { kind: 'write', value: ['item1', 'item2'] });
  });

  // Pitfall 4 analog: even when canonical is undefined, returns write not skipDest
  test('Pitfall 4: undefined canonical still returns write not skipDest', () => {
    const result = suppressedNotificationsAppendWithDedup(['someItem'], undefined);
    assert.strictEqual(result.kind, 'write', 'must return write even when canonical is undefined (Pitfall 4)');
  });

});

// ─── Entry structure tests ─────────────────────────────────────────────────────

suite('Phase 20 — suppressedNotifications entries: structure', () => {

  test('suppressedNotificationsEntries.length === 2', () => {
    assert.strictEqual(suppressedNotificationsEntries.length, 2);
  });

  test('entry ids are suppressMultiConfig-self and suppressedNotifications-from-behavevsc', () => {
    const ids = suppressedNotificationsEntries.map(e => e.id);
    assert.deepStrictEqual(ids, ['suppressMultiConfig-self', 'suppressedNotifications-from-behavevsc']);
  });

  test('suppressMultiConfig-self has correct namespace/key mapping', () => {
    const e = suppressedNotificationsEntries[0];
    assert.strictEqual(e.sourceNamespace, 'gs-behave-bdd');
    assert.strictEqual(e.sourceKey, 'suppressMultiConfigNotification');
    assert.strictEqual(e.destNamespace, 'gs-behave-bdd');
    assert.strictEqual(e.destKey, 'suppressedNotifications');
  });

  test('suppressedNotifications-from-behavevsc has correct namespace/key mapping', () => {
    const e = suppressedNotificationsEntries[1];
    assert.strictEqual(e.sourceNamespace, 'behave-vsc');
    assert.strictEqual(e.sourceKey, 'suppressedNotifications');
    assert.strictEqual(e.destNamespace, 'gs-behave-bdd');
    assert.strictEqual(e.destKey, 'suppressedNotifications');
  });

});

// ─── TEST-04 dimension (a): completedMigrations-based skip ────────────────────

suite('Phase 20 — suppressedNotifications entries: TEST-04 idempotency (D-A5.2 dimension a)', () => {
  let updateSpy: sinon.SinonSpy;

  setup(() => {
    updateSpy = sinon.spy(() => Promise.resolve());
    stubLogger();
  });
  teardown(() => sinon.restore());

  for (const entry of suppressedNotificationsEntries) {
    test(`${entry.id} skipped when already in completedMigrations at WorkspaceFolder`, async () => {
      sinon.stub(vscode.workspace, 'getConfiguration').returns(
        makePerKeyScopedConfig(
          {
            [entry.sourceKey]: {},
            [entry.destKey]: {},
            completedMigrations: { workspaceFolderValue: [entry.id] },
          },
          updateSpy,
        ),
      );
      const results = await evaluateMigration(entry, MOCK_URI);
      const wf = results.find(r => r.scope === vscode.ConfigurationTarget.WorkspaceFolder)!;
      assert.strictEqual(wf.action, 'already-finished');
      const wfUpdate = updateSpy.getCalls().find(
        c => c.args[2] === vscode.ConfigurationTarget.WorkspaceFolder,
      );
      assert.strictEqual(wfUpdate, undefined, 'no update() at WorkspaceFolder for already-finished scope');
    });
  }

});

// ─── TEST-04 dimension (b): case-1 silent finish ───────────────────────────────

suite('Phase 20 — suppressedNotifications entries: TEST-04 case-1 silent finish (D-A5.2 dimension b)', () => {
  let updateSpy: sinon.SinonSpy;

  setup(() => {
    updateSpy = sinon.spy(() => Promise.resolve());
    stubLogger();
  });
  teardown(() => sinon.restore());

  for (const entry of suppressedNotificationsEntries) {
    test(`${entry.id} marks Finished at all scopes when nothing is set`, async () => {
      sinon.stub(vscode.workspace, 'getConfiguration').returns(
        makePerKeyScopedConfig(
          {
            [entry.sourceKey]: {},
            [entry.destKey]: {},
            completedMigrations: {},
          },
          updateSpy,
        ),
      );
      const results = await evaluateMigration(entry, MOCK_URI);
      assert.strictEqual(results.length, 3);
      for (const r of results) {
        assert.strictEqual(r.case, 1, `expected case 1 at scope ${r.scope}`);
        assert.strictEqual(r.action, 'finished', `expected finished at scope ${r.scope}`);
      }
      const completedUpdates = updateSpy.getCalls().filter(
        c => c.args[0] === 'completedMigrations',
      );
      assert.strictEqual(
        completedUpdates.length,
        3,
        `expected 3 completedMigrations writes, got ${completedUpdates.length}`,
      );
      for (const call of completedUpdates) {
        assert.ok(
          Array.isArray(call.args[1]) && call.args[1].includes(entry.id),
          `completedMigrations write at scope ${call.args[2]} must include "${entry.id}"`,
        );
      }
    });
  }

});
