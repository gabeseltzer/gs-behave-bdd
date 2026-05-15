import * as assert from 'assert';
import * as sinon from 'sinon';
import * as configModule from '../../../src/configuration';
import {
  mergeRecord,
  envVarPresetsTransform,
  envVarOverridesTransform,
  envPresetEntries,
} from '../../../src/migrations/envPresets';
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

// ─── mergeRecord unit tests ────────────────────────────────────────────────────

suite('Phase 20 — mergeRecord utility', () => {

  // Test 1: D-A2.2 degenerate case — canonical undefined
  test('mergeRecord({a:1}, undefined, identity) degenerates to legacy', () => {
    const result = mergeRecord({ a: 1 }, undefined, (l) => l);
    assert.deepStrictEqual(result, { a: 1 });
  });

  // Test 2: legacy undefined
  test('mergeRecord(undefined, {a:1}, identity) returns canonical unchanged', () => {
    const result = mergeRecord(undefined, { a: 1 }, (l) => l);
    assert.deepStrictEqual(result, { a: 1 });
  });

  // Test 3: both undefined
  test('mergeRecord(undefined, undefined, identity) returns empty object', () => {
    const result = mergeRecord(undefined, undefined, (l) => l);
    assert.deepStrictEqual(result, {});
  });

  // Test 4: collision — legacy-wins mergeValue
  test('mergeRecord({a:1, b:2}, {b:99, c:3}, legacy-wins) — legacy wins on b, c kept from canonical', () => {
    const result = mergeRecord({ a: 1, b: 2 }, { b: 99, c: 3 }, (lv) => lv);
    // canonical first (b:99, c:3), then legacy-only keys (a:1), and collision b gets legacy value (2)
    assert.strictEqual(result.a, 1);
    assert.strictEqual(result.b, 2);  // legacy wins
    assert.strictEqual(result.c, 3);  // canonical-only key preserved
    assert.strictEqual(Object.keys(result).length, 3);
  });

  // Test 5: collision — canonical-wins mergeValue
  test('mergeRecord({a:1, b:2}, {b:99, c:3}, canonical-wins) — canonical wins on b', () => {
    const result = mergeRecord({ a: 1, b: 2 }, { b: 99, c: 3 }, (_lv, cv) => cv);
    assert.strictEqual(result.b, 99);  // canonical wins
    assert.strictEqual(result.a, 1);
    assert.strictEqual(result.c, 3);
  });

  // Test 6: empty legacy — returns canonical
  test('mergeRecord({}, {a:1}, identity) returns canonical unchanged', () => {
    const result = mergeRecord({}, { a: 1 }, (l) => l);
    assert.deepStrictEqual(result, { a: 1 });
  });

});

// ─── envVarPresetsTransform tests ─────────────────────────────────────────────

suite('Phase 20 — envVarPresetsTransform', () => {

  // Pitfall 4: explicit assertion — canonical=undefined must return write, NOT skipDest
  test('Pitfall 4: (legacy={a:{X:1}}, canonical=undefined) returns write {a:{X:1}}', () => {
    const result = envVarPresetsTransform({ a: { X: '1' } }, undefined);
    assert.strictEqual(result.kind, 'write', 'must return write even when canonical is undefined (Pitfall 4)');
    assert.deepStrictEqual(result, { kind: 'write', value: { a: { X: '1' } } });
  });

  // Pitfall 4: undefined legacy -> skipDest
  test('undefined legacy returns skipDest + removeSource:true', () => {
    const result = envVarPresetsTransform(undefined, { a: { X: '1' } });
    assert.deepStrictEqual(result, { kind: 'skipDest', removeSource: true });
  });

  // Deep merge collision case from behavior spec
  test('(legacy={p:{X:1}}, canonical={p:{X:99,Y:2}}) — legacy X wins, canonical Y kept', () => {
    const result = envVarPresetsTransform(
      { p: { X: '1' } },
      { p: { X: '99', Y: '2' } },
    );
    assert.strictEqual(result.kind, 'write');
    if (result.kind === 'write') {
      assert.strictEqual(result.value.p.X, '1');   // legacy wins
      assert.strictEqual(result.value.p.Y, '2');   // canonical kept
    }
  });

  // Preset-level union: legacy has different preset name than canonical
  test('different preset names produce union of presets', () => {
    const result = envVarPresetsTransform(
      { dev: { API: 'http://dev' } },
      { prod: { API: 'http://prod' } },
    );
    assert.strictEqual(result.kind, 'write');
    if (result.kind === 'write') {
      assert.ok('dev' in result.value, 'should contain dev preset from legacy');
      assert.ok('prod' in result.value, 'should contain prod preset from canonical');
    }
  });

});

// ─── envVarOverridesTransform tests ───────────────────────────────────────────

suite('Phase 20 — envVarOverridesTransform', () => {

  // Single-level merge — legacy wins
  test('(legacy={X:1}, canonical={X:99,Y:2}) — legacy X wins, canonical Y kept', () => {
    const result = envVarOverridesTransform({ X: '1' }, { X: '99', Y: '2' });
    assert.strictEqual(result.kind, 'write');
    if (result.kind === 'write') {
      assert.strictEqual(result.value.X, '1');   // legacy wins
      assert.strictEqual(result.value.Y, '2');   // canonical kept
    }
  });

  // Pitfall 4: canonical undefined -> write not skipDest
  test('Pitfall 4: (legacy={X:1}, canonical=undefined) returns write {X:1}', () => {
    const result = envVarOverridesTransform({ X: '1' }, undefined);
    assert.strictEqual(result.kind, 'write', 'must return write even when canonical is undefined (Pitfall 4)');
    assert.deepStrictEqual(result, { kind: 'write', value: { X: '1' } });
  });

  // Undefined legacy -> skipDest
  test('undefined legacy returns skipDest + removeSource:true', () => {
    const result = envVarOverridesTransform(undefined, { X: '1' });
    assert.deepStrictEqual(result, { kind: 'skipDest', removeSource: true });
  });

});

// ─── Entry structure tests ─────────────────────────────────────────────────────

suite('Phase 20 — envPresets entries: structure', () => {

  test('envPresetEntries.length === 2', () => {
    assert.strictEqual(envPresetEntries.length, 2);
  });

  test('entry ids are envVarPresets-from-behavevsc and envVarOverrides-from-behavevsc', () => {
    const ids = envPresetEntries.map(e => e.id);
    assert.deepStrictEqual(ids, ['envVarPresets-from-behavevsc', 'envVarOverrides-from-behavevsc']);
  });

  test('envVarPresets-from-behavevsc has correct namespace/key mapping', () => {
    const e = envPresetEntries[0];
    assert.strictEqual(e.sourceNamespace, 'behave-vsc');
    assert.strictEqual(e.sourceKey, 'envVarPresets');
    assert.strictEqual(e.destNamespace, 'gs-behave-bdd');
    assert.strictEqual(e.destKey, 'envVarPresets');
  });

  test('envVarOverrides-from-behavevsc has correct namespace/key mapping', () => {
    const e = envPresetEntries[1];
    assert.strictEqual(e.sourceNamespace, 'behave-vsc');
    assert.strictEqual(e.sourceKey, 'envVarOverrides');
    assert.strictEqual(e.destNamespace, 'gs-behave-bdd');
    assert.strictEqual(e.destKey, 'envVarOverrides');
  });

});

// ─── TEST-04 dimension (a): completedMigrations-based skip ────────────────────

suite('Phase 20 — envPresets entries: TEST-04 idempotency (D-A5.2 dimension a)', () => {
  let updateSpy: sinon.SinonSpy;

  setup(() => {
    updateSpy = sinon.spy(() => Promise.resolve());
    stubLogger();
  });
  teardown(() => sinon.restore());

  for (const entry of envPresetEntries) {
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

suite('Phase 20 — envPresets entries: TEST-04 case-1 silent finish (D-A5.2 dimension b)', () => {
  let updateSpy: sinon.SinonSpy;

  setup(() => {
    updateSpy = sinon.spy(() => Promise.resolve());
    stubLogger();
  });
  teardown(() => sinon.restore());

  for (const entry of envPresetEntries) {
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
