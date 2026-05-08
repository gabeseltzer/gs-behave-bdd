import * as assert from 'assert';
import * as sinon from 'sinon';
import * as configModule from '../../../src/configuration';
import { evaluateMigration } from '../../../src/migrations';
import { makePlainEntry, plainEntries } from '../../../src/migrations/plain';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscode = require('vscode');

const MOCK_URI = vscode.Uri.file('/fake/workspace');

type ScopeValues = {
  globalValue?: unknown;
  workspaceValue?: unknown;
  workspaceFolderValue?: unknown;
};

/**
 * Per-key scoped-config stub: copied from test/unit/migrations.test.ts to avoid
 * a shared-file refactor (DRY violation accepted; Plan 05 may consolidate).
 *
 * Returns scope-specific inspect() values keyed by (namespace × key).
 * The evaluator inspects two keys per scope: sourceKey + completedMigrations.
 * They must NOT share scope values, which is why a per-key map is required.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makePerKeyScopedConfig(
  byKey: Record<string, ScopeValues>,
  updateSpy?: sinon.SinonSpy,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  return {
    // get() intentionally returns merged values to verify Pitfall 2: code under
    // test must NOT call get() — it must call inspect() and pick per-scope.
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

// ─── Factory shape tests ───────────────────────────────────────────────────────

suite('Phase 20 — plain.ts factory', () => {

  test('makePlainEntry produces the documented shape', () => {
    const entry = makePlainEntry('xRay');
    assert.strictEqual(entry.id, 'xRay-from-behavevsc');
    assert.strictEqual(entry.sourceNamespace, 'behave-vsc');
    assert.strictEqual(entry.sourceKey, 'xRay');
    assert.strictEqual(entry.destNamespace, 'gs-behave-bdd');
    assert.strictEqual(entry.destKey, 'xRay');
  });

  test('explicit destKey equals default destKey', () => {
    const defaultDest = makePlainEntry('runParallel');
    const explicitDest = makePlainEntry('runParallel', 'runParallel');
    assert.strictEqual(defaultDest.id, explicitDest.id);
    assert.strictEqual(defaultDest.sourceNamespace, explicitDest.sourceNamespace);
    assert.strictEqual(defaultDest.sourceKey, explicitDest.sourceKey);
    assert.strictEqual(defaultDest.destNamespace, explicitDest.destNamespace);
    assert.strictEqual(defaultDest.destKey, explicitDest.destKey);
  });

  test('transform returns { kind: write, value: src } unconditionally', () => {
    const entry = makePlainEntry('importStrategy');
    // With an existing dest value present — transform ignores it (last-write-wins copy).
    const result1 = entry.transform('relative', 'old-value');
    assert.deepStrictEqual(result1, { kind: 'write', value: 'relative' });
    // With dest absent.
    const result2 = entry.transform('absolute', undefined);
    assert.deepStrictEqual(result2, { kind: 'write', value: 'absolute' });
    // With a boolean value.
    const boolEntry = makePlainEntry('runParallel');
    const result3 = boolEntry.transform(true, undefined);
    assert.deepStrictEqual(result3, { kind: 'write', value: true });
  });

  test('plainEntries.length === 11', () => {
    assert.strictEqual(plainEntries.length, 11);
  });

  test('every plainEntries id ends with -from-behavevsc', () => {
    for (const entry of plainEntries) {
      assert.ok(
        entry.id.endsWith('-from-behavevsc'),
        `Entry id "${entry.id}" does not end with -from-behavevsc`,
      );
    }
  });

});

// ─── TEST-04 dimension (a): completedMigrations-based skip ────────────────────

suite('Phase 20 — plain entries: TEST-04 idempotency (D-A5.2 dimension a)', () => {
  let updateSpy: sinon.SinonSpy;

  setup(() => {
    updateSpy = sinon.spy(() => Promise.resolve());
    stubLogger();
  });
  teardown(() => sinon.restore());

  for (const entry of plainEntries) {
    test(`${entry.id} skipped when already in completedMigrations at WorkspaceFolder`, async () => {
      // completedMigrations at WorkspaceFolder already contains the entry id.
      // evaluateMigration must return 'already-finished' for that scope and
      // must NOT call update() at WorkspaceFolder.
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
      // No update() call at WorkspaceFolder for completedMigrations (already present).
      const wfUpdate = updateSpy.getCalls().find(
        c => c.args[2] === vscode.ConfigurationTarget.WorkspaceFolder,
      );
      assert.strictEqual(wfUpdate, undefined, 'no update() at WorkspaceFolder for already-finished scope');
    });
  }

});

// ─── TEST-04 dimension (b): case-1 silent finish ───────────────────────────────

suite('Phase 20 — plain entries: TEST-04 case-1 silent finish (D-A5.2 dimension b)', () => {
  let updateSpy: sinon.SinonSpy;

  setup(() => {
    updateSpy = sinon.spy(() => Promise.resolve());
    stubLogger();
  });
  teardown(() => sinon.restore());

  for (const entry of plainEntries) {
    test(`${entry.id} marks Finished at all scopes when nothing is set`, async () => {
      // All scope values undefined — case 1 (neither set) at every scope.
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
      // All 3 scopes must be case 1 with action 'finished'.
      assert.strictEqual(results.length, 3);
      for (const r of results) {
        assert.strictEqual(r.case, 1, `expected case 1 at scope ${r.scope}`);
        assert.strictEqual(r.action, 'finished', `expected finished at scope ${r.scope}`);
      }
      // update() must be called exactly 3 times — once per scope for completedMigrations.
      const completedUpdates = updateSpy.getCalls().filter(
        c => c.args[0] === 'completedMigrations',
      );
      assert.strictEqual(
        completedUpdates.length,
        3,
        `expected 3 completedMigrations writes, got ${completedUpdates.length}`,
      );
      // Each update must include the entry id.
      for (const call of completedUpdates) {
        assert.ok(
          Array.isArray(call.args[1]) && call.args[1].includes(entry.id),
          `completedMigrations write at scope ${call.args[2]} must include "${entry.id}"`,
        );
      }
    });
  }

});
