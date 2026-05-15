import * as assert from 'assert';
import * as sinon from 'sinon';
import * as configModule from '../../../src/configuration';
import { evaluateMigration } from '../../../src/migrations';
import { featuresPathMergeWithDedup, featuresPathEntries } from '../../../src/migrations/featuresPath';

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

// ─── Transform unit tests ──────────────────────────────────────────────────────

suite('Phase 20 — featuresPathMergeWithDedup transform', () => {

  // Test 1: undefined input
  test('undefined legacyValue returns skipDest + removeSource', () => {
    const result = featuresPathMergeWithDedup(undefined, []);
    assert.deepStrictEqual(result, { kind: 'skipDest', removeSource: true });
  });

  // Test 2: empty and whitespace-only string
  test('empty string returns skipDest + removeSource', () => {
    const result = featuresPathMergeWithDedup('', []);
    assert.deepStrictEqual(result, { kind: 'skipDest', removeSource: true });
  });

  test('whitespace-only string returns skipDest + removeSource', () => {
    const result = featuresPathMergeWithDedup('   ', []);
    assert.deepStrictEqual(result, { kind: 'skipDest', removeSource: true });
  });

  // Test 3: value with undefined existingArr
  test('valid value with undefined existingArr returns write with single-element array', () => {
    const result = featuresPathMergeWithDedup('features', undefined);
    assert.deepStrictEqual(result, { kind: 'write', value: ['features'] });
  });

  // Test 4: dedup hit — already present
  test('value already in existingArr returns write with unchanged array (dedup)', () => {
    const result = featuresPathMergeWithDedup('features', ['features']);
    assert.deepStrictEqual(result, { kind: 'write', value: ['features'] });
  });

  // Test 5: append — not already present
  test('value not in existingArr returns write with appended array', () => {
    const result = featuresPathMergeWithDedup('features', ['tests']);
    assert.deepStrictEqual(result, { kind: 'write', value: ['tests', 'features'] });
  });

  // Test 6: post-normalization-empty (e.g. '/')
  test('slash-only value normalizes to empty — skipDest + removeSource', () => {
    const result = featuresPathMergeWithDedup('/', []);
    assert.deepStrictEqual(result, { kind: 'skipDest', removeSource: true });
  });

});

// ─── Entry structure tests ─────────────────────────────────────────────────────

suite('Phase 20 — featuresPath entries: structure', () => {

  // Test 7: length
  test('featuresPathEntries.length === 2', () => {
    assert.strictEqual(featuresPathEntries.length, 2);
  });

  // Test 7 continued: ids
  test('entry ids are featuresPath-self and featuresPath-from-behavevsc', () => {
    const ids = featuresPathEntries.map(e => e.id);
    assert.deepStrictEqual(ids, ['featuresPath-self', 'featuresPath-from-behavevsc']);
  });

  // Test 8: shared transform reference (D-A4.1)
  test('both entries share the same transform function reference (D-A4.1)', () => {
    assert.strictEqual(
      featuresPathEntries[0].transform,
      featuresPathEntries[1].transform,
      'D-A4.1: both entries must reference the same transform function',
    );
  });

  test('featuresPath-self has correct namespace/key mapping', () => {
    const e = featuresPathEntries[0];
    assert.strictEqual(e.sourceNamespace, 'gs-behave-bdd');
    assert.strictEqual(e.sourceKey, 'featuresPath');
    assert.strictEqual(e.destNamespace, 'gs-behave-bdd');
    assert.strictEqual(e.destKey, 'featuresPaths');
  });

  test('featuresPath-from-behavevsc has correct namespace/key mapping', () => {
    const e = featuresPathEntries[1];
    assert.strictEqual(e.sourceNamespace, 'behave-vsc');
    assert.strictEqual(e.sourceKey, 'featuresPath');
    assert.strictEqual(e.destNamespace, 'gs-behave-bdd');
    assert.strictEqual(e.destKey, 'featuresPaths');
  });

});

// ─── TEST-04 dimension (a): completedMigrations-based skip ────────────────────

suite('Phase 20 — featuresPath entries: TEST-04 idempotency (D-A5.2 dimension a)', () => {
  let updateSpy: sinon.SinonSpy;

  setup(() => {
    updateSpy = sinon.spy(() => Promise.resolve());
    stubLogger();
  });
  teardown(() => sinon.restore());

  for (const entry of featuresPathEntries) {
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

suite('Phase 20 — featuresPath entries: TEST-04 case-1 silent finish (D-A5.2 dimension b)', () => {
  let updateSpy: sinon.SinonSpy;

  setup(() => {
    updateSpy = sinon.spy(() => Promise.resolve());
    stubLogger();
  });
  teardown(() => sinon.restore());

  for (const entry of featuresPathEntries) {
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
