import * as assert from 'assert';
import * as sinon from 'sinon';
import * as configModule from '../../src/configuration';
import {
  isMigrationFinishedAtScope,
  markMigrationFinishedAtScope,
  evaluateMigration,
  evaluateAllMigrations,
  recheckMigrationsCommandHandler,
  ALL_MIGRATION_SCOPES,
  type MigrationEntry,
} from '../../src/migrations';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscode = require('vscode');

const MOCK_URI = vscode.Uri.file('/fake/workspace');

type ScopeValues = {
  globalValue?: unknown;
  workspaceValue?: unknown;
  workspaceFolderValue?: unknown;
};

/**
 * Per-key scoped-config stub: returns scope-specific inspect() values keyed by
 * (namespace × key). Phase 15 Plan 03 introduced this pattern (vs. the simpler
 * one-key `makeScopedConfig`) because the migration evaluator inspects two
 * keys per scope (sourceKey + completedMigrations) and they must NOT share
 * scope values.
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

function stubLogger(): { logInfo: sinon.SinonSpy } {
  const logInfo = sinon.spy();
  sinon.stub(configModule.config, 'logger').value({ logInfo });
  return { logInfo };
}

// ─── Task 1: completedMigrations helpers ──────────────────────────────────────

suite('Phase 19 — completedMigrations: markMigrationFinishedAtScope', () => {
  let updateSpy: sinon.SinonSpy;

  setup(() => {
    updateSpy = sinon.spy(() => Promise.resolve());
    stubLogger();
  });
  teardown(() => sinon.restore());

  test('1.1a: writes [id] at Global when previously undefined', async () => {
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makePerKeyScopedConfig({ completedMigrations: {} }, updateSpy),
    );
    await markMigrationFinishedAtScope('m1', vscode.ConfigurationTarget.Global, MOCK_URI);
    assert.strictEqual(updateSpy.callCount, 1);
    assert.strictEqual(updateSpy.firstCall.args[0], 'completedMigrations');
    assert.deepStrictEqual(updateSpy.firstCall.args[1], ['m1']);
    assert.strictEqual(updateSpy.firstCall.args[2], vscode.ConfigurationTarget.Global);
  });

  test('1.1b: writes [id] at Workspace when previously undefined', async () => {
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makePerKeyScopedConfig({ completedMigrations: {} }, updateSpy),
    );
    await markMigrationFinishedAtScope('m1', vscode.ConfigurationTarget.Workspace, MOCK_URI);
    assert.strictEqual(updateSpy.firstCall.args[2], vscode.ConfigurationTarget.Workspace);
  });

  test('1.1c: writes [id] at WorkspaceFolder when previously undefined', async () => {
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makePerKeyScopedConfig({ completedMigrations: {} }, updateSpy),
    );
    await markMigrationFinishedAtScope('m1', vscode.ConfigurationTarget.WorkspaceFolder, MOCK_URI);
    assert.strictEqual(updateSpy.firstCall.args[2], vscode.ConfigurationTarget.WorkspaceFolder);
  });

  test('1.2: appends id to existing same-scope array (preserves prior entries)', async () => {
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makePerKeyScopedConfig(
        { completedMigrations: { workspaceFolderValue: ['other-id'] } },
        updateSpy,
      ),
    );
    await markMigrationFinishedAtScope('m1', vscode.ConfigurationTarget.WorkspaceFolder, MOCK_URI);
    assert.deepStrictEqual(updateSpy.firstCall.args[1], ['other-id', 'm1']);
  });

  test('1.3: idempotent — does NOT call update when id already present at scope', async () => {
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makePerKeyScopedConfig(
        { completedMigrations: { workspaceFolderValue: ['m1'] } },
        updateSpy,
      ),
    );
    await markMigrationFinishedAtScope('m1', vscode.ConfigurationTarget.WorkspaceFolder, MOCK_URI);
    assert.strictEqual(updateSpy.called, false, 'idempotency: no update for already-present id');
  });

  test('1.4: on update() rejection, logs via logInfo and does NOT throw', async () => {
    const rejecting = sinon.spy(() => Promise.reject(new Error('read-only workspace')));
    const { logInfo } = stubLogger();
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makePerKeyScopedConfig({ completedMigrations: {} }, rejecting),
    );
    await assert.doesNotReject(() =>
      markMigrationFinishedAtScope('m1', vscode.ConfigurationTarget.Global, MOCK_URI),
    );
    assert.strictEqual(logInfo.called, true, 'logger.logInfo invoked on failure');
  });

  test('1.5: per-scope independence — Global write does not see WorkspaceFolder value', async () => {
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makePerKeyScopedConfig(
        { completedMigrations: { workspaceFolderValue: ['m1'] } },
        updateSpy,
      ),
    );
    // Mark at Global; existing WorkspaceFolder array must NOT cause a dedup
    // skip — Global's value is undefined, so we must write [m1] at Global.
    await markMigrationFinishedAtScope('m1', vscode.ConfigurationTarget.Global, MOCK_URI);
    assert.strictEqual(updateSpy.callCount, 1);
    assert.strictEqual(updateSpy.firstCall.args[2], vscode.ConfigurationTarget.Global);
    assert.deepStrictEqual(updateSpy.firstCall.args[1], ['m1']);
  });
});

suite('Phase 19 — completedMigrations: isMigrationFinishedAtScope', () => {
  teardown(() => sinon.restore());

  test('2.1: returns true when scope-specific value contains id (uses inspect, not get)', () => {
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makePerKeyScopedConfig({
        completedMigrations: {
          // get() would return ['merged'] (workspaceFolder wins) — but the
          // helper must NOT call get(). It must use inspect() and pick the
          // requested scope.
          workspaceFolderValue: ['merged'],
          globalValue: ['m1'],
        },
      }),
    );
    assert.strictEqual(
      isMigrationFinishedAtScope('m1', vscode.ConfigurationTarget.Global, MOCK_URI),
      true,
    );
  });

  test('2.2a: returns false when scope value is undefined', () => {
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makePerKeyScopedConfig({ completedMigrations: {} }),
    );
    assert.strictEqual(
      isMigrationFinishedAtScope('m1', vscode.ConfigurationTarget.Global, MOCK_URI),
      false,
    );
  });

  test('2.2b: returns false when scope value is empty array', () => {
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makePerKeyScopedConfig({ completedMigrations: { globalValue: [] } }),
    );
    assert.strictEqual(
      isMigrationFinishedAtScope('m1', vscode.ConfigurationTarget.Global, MOCK_URI),
      false,
    );
  });

  test('2.3: per-scope independence — id at Global does not satisfy WorkspaceFolder query', () => {
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makePerKeyScopedConfig({
        completedMigrations: { globalValue: ['m1'] },
      }),
    );
    assert.strictEqual(
      isMigrationFinishedAtScope('m1', vscode.ConfigurationTarget.WorkspaceFolder, MOCK_URI),
      false,
      'MIGRATE-09 — completedMigrations is independent per scope',
    );
  });
});

// ─── Task 2: evaluateMigration ────────────────────────────────────────────────

const TEST_ENTRY: MigrationEntry<unknown, unknown> = {
  id: 'test-entry',
  sourceNamespace: 'gs-behave-bdd',
  sourceKey: 'legacyKey',
  destNamespace: 'gs-behave-bdd',
  destKey: 'canonicalKey',
  transform: () => ({ kind: 'skipDest', removeSource: false }),
};

function setupConfigStub(
  byKey: Record<string, ScopeValues>,
  updateSpy?: sinon.SinonSpy,
): void {
  sinon.stub(vscode.workspace, 'getConfiguration').returns(
    makePerKeyScopedConfig(byKey, updateSpy),
  );
}

suite('Phase 19 — evaluateMigration: case 1 (neither set)', () => {
  let updateSpy: sinon.SinonSpy;

  setup(() => {
    updateSpy = sinon.spy(() => Promise.resolve());
    stubLogger();
  });
  teardown(() => sinon.restore());

  test('3.1: case 1 at Global — marks Finished at Global, no migrateScopedSetting', async () => {
    setupConfigStub({ legacyKey: {}, canonicalKey: {}, completedMigrations: {} }, updateSpy);
    const onCaseHit = sinon.spy();
    const r = await evaluateMigration(TEST_ENTRY, MOCK_URI, { onCaseHit });
    const global = r.find(x => x.scope === vscode.ConfigurationTarget.Global)!;
    assert.strictEqual(global.case, 1);
    assert.strictEqual(global.action, 'finished');
    // updateSpy should be called exactly 3 times — once per scope marking finished.
    assert.strictEqual(updateSpy.callCount, 3);
    // onCaseHit called 3 times with (1, entry, scope).
    assert.strictEqual(onCaseHit.callCount, 3);
    assert.deepStrictEqual(onCaseHit.firstCall.args[0], 1);
  });

  test('3.2: case 1 at Workspace — marks Finished at Workspace target', async () => {
    setupConfigStub({ legacyKey: {}, canonicalKey: {}, completedMigrations: {} }, updateSpy);
    await evaluateMigration(TEST_ENTRY, MOCK_URI);
    const targets = updateSpy.getCalls().map(c => c.args[2]);
    assert.ok(targets.includes(vscode.ConfigurationTarget.Workspace));
  });

  test('3.3: case 1 at WorkspaceFolder — marks Finished at WorkspaceFolder target', async () => {
    setupConfigStub({ legacyKey: {}, canonicalKey: {}, completedMigrations: {} }, updateSpy);
    await evaluateMigration(TEST_ENTRY, MOCK_URI);
    const targets = updateSpy.getCalls().map(c => c.args[2]);
    assert.ok(targets.includes(vscode.ConfigurationTarget.WorkspaceFolder));
  });
});

suite('Phase 19 — evaluateMigration: case 2 (legacy set, canonical absent)', () => {
  let updateSpy: sinon.SinonSpy;

  setup(() => {
    updateSpy = sinon.spy(() => Promise.resolve());
    stubLogger();
  });
  teardown(() => sinon.restore());

  test('3.4: case 2 at Global — onCaseHit(2, ...), NO mark Finished, action pending', async () => {
    setupConfigStub({
      legacyKey: { globalValue: 'legacy-val' },
      canonicalKey: {},
      completedMigrations: {},
    }, updateSpy);
    const onCaseHit = sinon.spy();
    const r = await evaluateMigration(TEST_ENTRY, MOCK_URI, { onCaseHit });
    const global = r.find(x => x.scope === vscode.ConfigurationTarget.Global)!;
    assert.strictEqual(global.case, 2);
    assert.strictEqual(global.action, 'pending-user-choice');
    // case 2 must NOT mark Finished at Global; Workspace + WorkspaceFolder are
    // case 1 and DO mark Finished — so updateSpy should be called exactly twice.
    const globalUpdate = updateSpy.getCalls().find(c => c.args[2] === vscode.ConfigurationTarget.Global);
    assert.strictEqual(globalUpdate, undefined, 'no completedMigrations write at case-2 scope');
    const hits = onCaseHit.getCalls().filter(c => c.args[0] === 2);
    assert.strictEqual(hits.length, 1);
    assert.strictEqual(hits[0].args[2], vscode.ConfigurationTarget.Global);
  });

  test('3.5: case 2 at Workspace', async () => {
    setupConfigStub({
      legacyKey: { workspaceValue: 'legacy-val' },
      canonicalKey: {},
      completedMigrations: {},
    }, updateSpy);
    const onCaseHit = sinon.spy();
    const r = await evaluateMigration(TEST_ENTRY, MOCK_URI, { onCaseHit });
    const ws = r.find(x => x.scope === vscode.ConfigurationTarget.Workspace)!;
    assert.strictEqual(ws.case, 2);
    assert.strictEqual(ws.action, 'pending-user-choice');
    const wsUpdate = updateSpy.getCalls().find(c => c.args[2] === vscode.ConfigurationTarget.Workspace);
    assert.strictEqual(wsUpdate, undefined);
  });

  test('3.6: case 2 at WorkspaceFolder', async () => {
    setupConfigStub({
      legacyKey: { workspaceFolderValue: 'legacy-val' },
      canonicalKey: {},
      completedMigrations: {},
    }, updateSpy);
    const onCaseHit = sinon.spy();
    const r = await evaluateMigration(TEST_ENTRY, MOCK_URI, { onCaseHit });
    const wf = r.find(x => x.scope === vscode.ConfigurationTarget.WorkspaceFolder)!;
    assert.strictEqual(wf.case, 2);
    assert.strictEqual(wf.action, 'pending-user-choice');
  });
});

suite('Phase 19 — evaluateMigration: case 3 (both set)', () => {
  let updateSpy: sinon.SinonSpy;

  setup(() => {
    updateSpy = sinon.spy(() => Promise.resolve());
    stubLogger();
  });
  teardown(() => sinon.restore());

  test('3.7: case 3 at Global', async () => {
    setupConfigStub({
      legacyKey: { globalValue: 'legacy-val' },
      canonicalKey: { globalValue: 'canon-val' },
      completedMigrations: {},
    }, updateSpy);
    const onCaseHit = sinon.spy();
    const r = await evaluateMigration(TEST_ENTRY, MOCK_URI, { onCaseHit });
    const g = r.find(x => x.scope === vscode.ConfigurationTarget.Global)!;
    assert.strictEqual(g.case, 3);
    assert.strictEqual(g.action, 'pending-user-choice');
    const hits = onCaseHit.getCalls().filter(c => c.args[0] === 3);
    assert.strictEqual(hits.length, 1);
  });

  test('3.8: case 3 at Workspace', async () => {
    setupConfigStub({
      legacyKey: { workspaceValue: 'legacy-val' },
      canonicalKey: { workspaceValue: 'canon-val' },
      completedMigrations: {},
    }, updateSpy);
    const r = await evaluateMigration(TEST_ENTRY, MOCK_URI);
    const ws = r.find(x => x.scope === vscode.ConfigurationTarget.Workspace)!;
    assert.strictEqual(ws.case, 3);
  });

  test('3.9: case 3 at WorkspaceFolder', async () => {
    setupConfigStub({
      legacyKey: { workspaceFolderValue: 'legacy-val' },
      canonicalKey: { workspaceFolderValue: 'canon-val' },
      completedMigrations: {},
    }, updateSpy);
    const r = await evaluateMigration(TEST_ENTRY, MOCK_URI);
    const wf = r.find(x => x.scope === vscode.ConfigurationTarget.WorkspaceFolder)!;
    assert.strictEqual(wf.case, 3);
  });
});

suite('Phase 19 — evaluateMigration: MIGRATE-08 empty/whitespace sub-case', () => {
  let updateSpy: sinon.SinonSpy;

  setup(() => {
    updateSpy = sinon.spy(() => Promise.resolve());
    stubLogger();
  });
  teardown(() => sinon.restore());

  test('3.10: empty-string legacy at Workspace — finished + skip-with-removal', async () => {
    // For migrateScopedSetting to clear at Workspace, Workspace must be the
    // most-specific scope (no WorkspaceFolder value present).
    setupConfigStub({
      legacyKey: { workspaceValue: '' },
      canonicalKey: {},
      completedMigrations: {},
    }, updateSpy);
    const r = await evaluateMigration(TEST_ENTRY, MOCK_URI);
    const ws = r.find(x => x.scope === vscode.ConfigurationTarget.Workspace)!;
    assert.strictEqual(ws.case, 1);
    assert.strictEqual(ws.action, 'finished');
    // The legacyKey source removal should have been issued at Workspace target.
    const removed = updateSpy.getCalls().find(c =>
      c.args[0] === 'legacyKey' && c.args[1] === undefined &&
      c.args[2] === vscode.ConfigurationTarget.Workspace,
    );
    assert.ok(removed, 'migrateScopedSetting should clear empty legacyKey at Workspace');
  });

  test('3.11: whitespace-only legacy — same as 3.10', async () => {
    setupConfigStub({
      legacyKey: { workspaceFolderValue: '   ' },
      canonicalKey: {},
      completedMigrations: {},
    }, updateSpy);
    const r = await evaluateMigration(TEST_ENTRY, MOCK_URI);
    const wf = r.find(x => x.scope === vscode.ConfigurationTarget.WorkspaceFolder)!;
    assert.strictEqual(wf.case, 1);
    assert.strictEqual(wf.action, 'finished');
    const removed = updateSpy.getCalls().find(c =>
      c.args[0] === 'legacyKey' && c.args[1] === undefined &&
      c.args[2] === vscode.ConfigurationTarget.WorkspaceFolder,
    );
    assert.ok(removed, 'whitespace legacyKey should be cleared at WorkspaceFolder');
  });
});

suite('Phase 19 — evaluateMigration: idempotency + independence + sweep', () => {
  let updateSpy: sinon.SinonSpy;

  setup(() => {
    updateSpy = sinon.spy(() => Promise.resolve());
    stubLogger();
  });
  teardown(() => sinon.restore());

  test('3.12: already-finished short-circuit — no onCaseHit, action already-finished', async () => {
    setupConfigStub({
      legacyKey: { globalValue: 'legacy-val' },
      canonicalKey: {},
      completedMigrations: { globalValue: [TEST_ENTRY.id] },
    }, updateSpy);
    const onCaseHit = sinon.spy();
    const r = await evaluateMigration(TEST_ENTRY, MOCK_URI, { onCaseHit });
    const g = r.find(x => x.scope === vscode.ConfigurationTarget.Global)!;
    assert.strictEqual(g.action, 'already-finished');
    // onCaseHit must NOT fire at the already-finished scope. The other two
    // scopes (Workspace, WorkspaceFolder) are case 1 (neither set), so they
    // mark Finished but do NOT involve onCaseHit beyond case 1's silent dispatch.
    const globalHits = onCaseHit.getCalls().filter(
      c => c.args[2] === vscode.ConfigurationTarget.Global,
    );
    assert.strictEqual(globalHits.length, 0, 'no hook fire at already-finished scope');
  });

  test('3.13: per-scope independence — case 1 only at Global does not mark Workspace/WorkspaceFolder', async () => {
    // Set legacy at Workspace + WorkspaceFolder so those scopes are case 2;
    // Global has neither, so it is case 1 only at Global.
    setupConfigStub({
      legacyKey: { workspaceValue: 'v', workspaceFolderValue: 'v' },
      canonicalKey: {},
      completedMigrations: {},
    }, updateSpy);
    await evaluateMigration(TEST_ENTRY, MOCK_URI);
    const completedWrites = updateSpy.getCalls().filter(c => c.args[0] === 'completedMigrations');
    assert.strictEqual(completedWrites.length, 1, 'only Global should mark Finished');
    assert.strictEqual(completedWrites[0].args[2], vscode.ConfigurationTarget.Global);
  });

  test('3.14: evaluateAllMigrations with empty registry returns []', async () => {
    setupConfigStub({});
    const r = await evaluateAllMigrations(MOCK_URI);
    assert.deepStrictEqual(r, []);
  });

  test('3.15: evaluateAllMigrations with injected registry runs evaluateMigration per entry', async () => {
    setupConfigStub({ legacyKey: {}, canonicalKey: {}, completedMigrations: {} }, updateSpy);
    const r = await evaluateAllMigrations(MOCK_URI, undefined, [TEST_ENTRY]);
    // 3 scopes × 1 entry = 3 results.
    assert.strictEqual(r.length, ALL_MIGRATION_SCOPES.length);
  });
});

// ─── Plan 03: recheckMigrationsCommandHandler (CONSENT-09 / TEST-05) ─────────

suite('Phase 19 Plan 03 — recheckMigrationsCommandHandler', () => {
  let updateSpy: sinon.SinonSpy;
  let showQuickPickStub: sinon.SinonStub;

  setup(() => {
    updateSpy = sinon.spy(() => Promise.resolve());
    stubLogger();
    // Default: cfg.update succeeds. Tests can override via the spy reference.
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makePerKeyScopedConfig({}, updateSpy),
    );
    showQuickPickStub = sinon.stub(vscode.window, 'showQuickPick');
  });
  teardown(() => sinon.restore());

  function setWorkspace(opts: {
    workspaceFile?: unknown;
    workspaceFolders?: { uri: { path: string } }[];
  }): void {
    sinon.stub(vscode.workspace, 'workspaceFile').value(opts.workspaceFile);
    sinon.stub(vscode.workspace, 'workspaceFolders').value(opts.workspaceFolders);
  }

  test('4.1: no .code-workspace + 1 folder — quick-pick has Global + Workspace Folder only', async () => {
    setWorkspace({ workspaceFile: undefined, workspaceFolders: [{ uri: MOCK_URI }] });
    showQuickPickStub.resolves(undefined); // user dismisses
    await recheckMigrationsCommandHandler();
    assert.strictEqual(showQuickPickStub.callCount, 1);
    const items = showQuickPickStub.firstCall.args[0];
    assert.strictEqual(items.length, 2, 'Workspace scope filtered out per D-07');
    const labels = items.map((i: { label: string }) => i.label);
    assert.ok(labels.includes('Global'));
    assert.ok(labels.includes('Workspace Folder'));
    assert.ok(!labels.includes('Workspace'));
  });

  test('4.2: .code-workspace open + folder — all 3 scopes shown', async () => {
    setWorkspace({
      workspaceFile: vscode.Uri.file('/fake.code-workspace'),
      workspaceFolders: [{ uri: MOCK_URI }],
    });
    showQuickPickStub.resolves(undefined);
    await recheckMigrationsCommandHandler();
    const items = showQuickPickStub.firstCall.args[0];
    assert.strictEqual(items.length, 3);
    const labels = items.map((i: { label: string }) => i.label);
    assert.ok(labels.includes('Global'));
    assert.ok(labels.includes('Workspace'));
    assert.ok(labels.includes('Workspace Folder'));
  });

  test('4.3: no folders — only Global is shown; pick Global short-circuits without evaluator', async () => {
    setWorkspace({ workspaceFile: undefined, workspaceFolders: undefined });
    const items: { label: string; target: unknown }[] = [];
    showQuickPickStub.callsFake((arr: unknown[]) => {
      // capture for assertion
      (arr as { label: string; target: unknown }[]).forEach(i => items.push(i));
      return Promise.resolve(arr[0]);
    });
    await recheckMigrationsCommandHandler();
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].label, 'Global');
    // cfg.update was called for the clear, but evaluateAllMigrations was NOT invoked
    // (no folders to iterate). updateSpy should be exactly 1 call (the clear write).
    assert.strictEqual(updateSpy.callCount, 1);
  });

  test('4.4: user cancels (showQuickPick → undefined) — no update, no evaluator', async () => {
    setWorkspace({ workspaceFile: undefined, workspaceFolders: [{ uri: MOCK_URI }] });
    showQuickPickStub.resolves(undefined);
    await recheckMigrationsCommandHandler();
    assert.strictEqual(updateSpy.called, false, 'no clear write on cancel');
  });

  test('4.5: pick Global — writes [] at Global, then evaluates for each folder', async () => {
    const folder = { uri: MOCK_URI };
    setWorkspace({ workspaceFile: undefined, workspaceFolders: [folder] });
    showQuickPickStub.callsFake((arr: { label: string }[]) =>
      Promise.resolve(arr.find(i => i.label === 'Global')),
    );
    await recheckMigrationsCommandHandler();
    const clearCall = updateSpy.getCalls().find(c => c.args[0] === 'completedMigrations');
    assert.ok(clearCall, 'clear write must occur');
    assert.deepStrictEqual(clearCall!.args[1], []);
    assert.strictEqual(clearCall!.args[2], vscode.ConfigurationTarget.Global);
  });

  test('4.6: pick Workspace Folder — writes [] at WorkspaceFolder for that folder', async () => {
    setWorkspace({ workspaceFile: undefined, workspaceFolders: [{ uri: MOCK_URI }] });
    showQuickPickStub.callsFake((arr: { label: string }[]) =>
      Promise.resolve(arr.find(i => i.label === 'Workspace Folder')),
    );
    await recheckMigrationsCommandHandler();
    const clearCall = updateSpy.getCalls().find(c => c.args[0] === 'completedMigrations');
    assert.ok(clearCall);
    assert.strictEqual(clearCall!.args[2], vscode.ConfigurationTarget.WorkspaceFolder);
  });

  test('4.7: pick Workspace — writes [] at Workspace target', async () => {
    setWorkspace({
      workspaceFile: vscode.Uri.file('/fake.code-workspace'),
      workspaceFolders: [{ uri: MOCK_URI }],
    });
    showQuickPickStub.callsFake((arr: { label: string }[]) =>
      Promise.resolve(arr.find(i => i.label === 'Workspace')),
    );
    await recheckMigrationsCommandHandler();
    const clearCall = updateSpy.getCalls().find(c => c.args[0] === 'completedMigrations');
    assert.ok(clearCall);
    assert.strictEqual(clearCall!.args[2], vscode.ConfigurationTarget.Workspace);
  });

  test('4.8: cfg.update rejection — logs and bails (no evaluator pass)', async () => {
    sinon.restore();
    const rejecting = sinon.spy(() => Promise.reject(new Error('read-only workspace')));
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      makePerKeyScopedConfig({}, rejecting),
    );
    const { logInfo } = stubLogger();
    sinon.stub(vscode.workspace, 'workspaceFile').value(undefined);
    sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: MOCK_URI }]);
    sinon.stub(vscode.window, 'showQuickPick').callsFake((arr: unknown) =>
      Promise.resolve((arr as { label: string }[]).find(i => i.label === 'Global')),
    );
    await assert.doesNotReject(() => recheckMigrationsCommandHandler());
    assert.strictEqual(rejecting.callCount, 1, 'cfg.update was attempted once');
    assert.strictEqual(logInfo.called, true, 'failure logged via logInfo');
  });

  test('4.9: empty registry post-clear — handler completes without firing onCaseHit', async () => {
    setWorkspace({ workspaceFile: undefined, workspaceFolders: [{ uri: MOCK_URI }] });
    showQuickPickStub.callsFake((arr: { label: string }[]) =>
      Promise.resolve(arr.find(i => i.label === 'Global')),
    );
    const onCaseHit = sinon.spy();
    await recheckMigrationsCommandHandler({ onCaseHit });
    // Phase 19 D-05: empty registry — evaluator returns [], no hook fires.
    assert.strictEqual(onCaseHit.called, false);
  });
});
