/**
 * 260513-oh5 — diagnostics + Code Action dispatch unit tests.
 *
 * Covers:
 *   - publishConsentDiagnostics: one Diagnostic per hit, correct severity /
 *     source / code, message names both keys.
 *   - Anchor URI resolution per scope (Global / Workspace / WorkspaceFolder).
 *   - Range parsing: JSONC-aware range when key present; [0,0] fallback when
 *     absent or file unreadable.
 *   - clearDiagnosticsForEntryAtScope: removes only matching (entryId, scope)
 *     entries; leaves siblings intact.
 *   - dispatchMigrationAction: resolves entryId via MIGRATION_REGISTRY,
 *     dispatches to the right handler (verified via cfg.update spy), then
 *     clears the diagnostic.
 *
 * Mocking pattern mirrors test/unit/migrations/consent.test.ts.
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as configModule from '../../../src/configuration';
import {
  MIGRATION_DIAG_SOURCE,
  buildDiagnosticMessage,
  clearDiagnosticsForEntryAtScope,
  computeRange,
  decodeDiagnosticCode,
  disposeDiagnosticCollection,
  encodeDiagnosticCode,
  getDiagnosticCollection,
  publishConsentDiagnostics,
  resolveAnchorUri,
  dispatchMigrationAction,
  type ConsentHit,
  type MigrationActionArgs,
  type MigrationEntry,
} from '../../../src/migrations';
import { MIGRATION_REGISTRY } from '../../../src/migrations/registry';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscode = require('vscode');

const MOCK_WKSP = vscode.Uri.file('/fake/workspace');

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeEntry(id: string): MigrationEntry {
  return {
    id,
    sourceNamespace: 'behave-vsc',
    sourceKey: id,
    destNamespace: 'gs-behave-bdd',
    destKey: id,
    transform: (src) => ({ kind: 'write', value: src }),
  };
}

function stubLogger(): sinon.SinonSpy {
  const logInfo = sinon.spy();
  sinon.stub(configModule.config, 'logger').value({
    logInfo,
    logInfoAllWksps: logInfo,
  });
  // dispatchMigrationAction → runMigrateAndDelete ultimately calls
  // markMigrationFinishedAtScope which uses logger on failure paths; harmless.
  return logInfo;
}

// ─── Suite ──────────────────────────────────────────────────────────────────

suite('260513-oh5 — diagnostics.ts', () => {

  teardown(() => {
    disposeDiagnosticCollection();
    sinon.restore();
  });

  // ── encodeDiagnosticCode / decodeDiagnosticCode round-trip ────────────────

  test('encode/decode is a faithful round-trip for all (case, scope) combinations', () => {
    const cases: (2 | 3)[] = [2, 3];
    const scopes = [
      vscode.ConfigurationTarget.Global,
      vscode.ConfigurationTarget.Workspace,
      vscode.ConfigurationTarget.WorkspaceFolder,
    ];
    for (const c of cases) {
      for (const s of scopes) {
        const code = encodeDiagnosticCode('foo-bar', c, s);
        const decoded = decodeDiagnosticCode(code);
        assert.deepStrictEqual(decoded, { entryId: 'foo-bar', case: c, scope: s });
      }
    }
  });

  test('decode rejects malformed inputs', () => {
    assert.strictEqual(decodeDiagnosticCode(undefined), undefined);
    assert.strictEqual(decodeDiagnosticCode(42), undefined);
    assert.strictEqual(decodeDiagnosticCode('not::valid'), undefined);
    assert.strictEqual(decodeDiagnosticCode('id::99::1'), undefined, 'rejects invalid case');
    assert.strictEqual(decodeDiagnosticCode('id::2::99'), undefined, 'rejects invalid scope');
  });

  // ── resolveAnchorUri ─────────────────────────────────────────────────────

  test('resolveAnchorUri returns a path containing settings.json for Global', () => {
    const uri = resolveAnchorUri(vscode.ConfigurationTarget.Global, MOCK_WKSP);
    assert.ok(uri, 'expected a Uri');
    assert.ok(
      uri.fsPath.endsWith('settings.json'),
      `expected a settings.json path; got ${uri.fsPath}`,
    );
    assert.ok(
      uri.fsPath.includes('Code'),
      `expected a Code/User path; got ${uri.fsPath}`,
    );
  });

  test('resolveAnchorUri returns workspaceFile for Workspace scope', () => {
    const wsFile = vscode.Uri.file('/fake/project.code-workspace');
    sinon.stub(vscode.workspace, 'workspaceFile').value(wsFile);
    const uri = resolveAnchorUri(vscode.ConfigurationTarget.Workspace, MOCK_WKSP);
    assert.strictEqual(uri?.fsPath, wsFile.fsPath);
  });

  test('resolveAnchorUri returns <wksp>/.vscode/settings.json for WorkspaceFolder', () => {
    const uri = resolveAnchorUri(vscode.ConfigurationTarget.WorkspaceFolder, MOCK_WKSP);
    assert.ok(uri);
    assert.ok(uri.fsPath.includes('.vscode'), `expected .vscode in path; got ${uri.fsPath}`);
    assert.ok(uri.fsPath.endsWith('settings.json'));
  });

  // ── computeRange ─────────────────────────────────────────────────────────

  test('computeRange falls back to [0,0] when file is unreadable', async () => {
    sinon.stub(vscode.workspace.fs, 'readFile').rejects(new Error('ENOENT'));
    const entry = makeEntry('justMyCode');
    const range = await computeRange(
      vscode.Uri.file('/missing.json'),
      entry,
      vscode.ConfigurationTarget.Global,
    );
    assert.strictEqual(range.start.line, 0);
    assert.strictEqual(range.start.character, 0);
  });

  test('computeRange points at the flat key when present in settings.json', async () => {
    const content = '{\n  "behave-vsc.justMyCode": false\n}';
    sinon.stub(vscode.workspace.fs, 'readFile').resolves(Buffer.from(content));
    const entry = makeEntry('justMyCode');
    const range = await computeRange(
      vscode.Uri.file('/fake/settings.json'),
      entry,
      vscode.ConfigurationTarget.Global,
    );
    // Line 1 (zero-indexed), starting at column 2 inside the quotes.
    assert.strictEqual(range.start.line, 1);
    assert.ok(range.start.character >= 2, `expected key on line 1 at col >= 2; got ${range.start.character}`);
    // The range covers the quoted key "behave-vsc.justMyCode" — length 24 incl. quotes.
    assert.ok(range.end.character > range.start.character, 'end should be after start');
  });

  test('computeRange handles nested-namespace settings ("behave-vsc": { "justMyCode": ... })', async () => {
    const content = '{\n  "behave-vsc": {\n    "justMyCode": false\n  }\n}';
    sinon.stub(vscode.workspace.fs, 'readFile').resolves(Buffer.from(content));
    const entry = makeEntry('justMyCode');
    const range = await computeRange(
      vscode.Uri.file('/fake/settings.json'),
      entry,
      vscode.ConfigurationTarget.Global,
    );
    assert.strictEqual(range.start.line, 2, `expected nested key on line 2; got ${range.start.line}`);
  });

  test('computeRange falls back to [0,0] when neither flat nor nested key is present', async () => {
    const content = '{\n  "unrelated": 1\n}';
    sinon.stub(vscode.workspace.fs, 'readFile').resolves(Buffer.from(content));
    const entry = makeEntry('justMyCode');
    const range = await computeRange(
      vscode.Uri.file('/fake/settings.json'),
      entry,
      vscode.ConfigurationTarget.Global,
    );
    assert.strictEqual(range.start.line, 0);
    assert.strictEqual(range.start.character, 0);
    assert.strictEqual(range.end.line, 0);
    assert.strictEqual(range.end.character, 0);
  });

  test('computeRange for Workspace scope reads under settings.* path', async () => {
    // .code-workspace nests user settings under "settings".
    const content = '{\n  "folders": [],\n  "settings": {\n    "behave-vsc.justMyCode": true\n  }\n}';
    sinon.stub(vscode.workspace.fs, 'readFile').resolves(Buffer.from(content));
    const entry = makeEntry('justMyCode');
    const range = await computeRange(
      vscode.Uri.file('/fake/project.code-workspace'),
      entry,
      vscode.ConfigurationTarget.Workspace,
    );
    assert.strictEqual(range.start.line, 3, `expected key on line 3; got ${range.start.line}`);
  });

  // ── buildDiagnosticMessage ───────────────────────────────────────────────

  test('case 2 message names both keys and the scope', () => {
    const entry = makeEntry('justMyCode');
    const msg = buildDiagnosticMessage(entry, 2, vscode.ConfigurationTarget.Global);
    assert.ok(msg.includes('behave-vsc.justMyCode'));
    assert.ok(msg.includes('gs-behave-bdd.justMyCode'));
    assert.ok(msg.includes('Global'));
  });

  test('case 3 message starts with "Both" and names both keys', () => {
    const entry = makeEntry('justMyCode');
    const msg = buildDiagnosticMessage(entry, 3, vscode.ConfigurationTarget.Workspace);
    assert.ok(msg.startsWith('Both '));
    assert.ok(msg.includes('behave-vsc.justMyCode'));
    assert.ok(msg.includes('gs-behave-bdd.justMyCode'));
  });

  // ── publishConsentDiagnostics ────────────────────────────────────────────

  test('publishConsentDiagnostics writes one Diagnostic per hit with the right shape', async () => {
    sinon.stub(vscode.workspace.fs, 'readFile').resolves(Buffer.from('{}'));
    const entry = makeEntry('justMyCode');
    const hits: ConsentHit[] = [
      { case: 2, entry, scope: vscode.ConfigurationTarget.Global },
      { case: 2, entry, scope: vscode.ConfigurationTarget.WorkspaceFolder },
    ];
    const n = await publishConsentDiagnostics(MOCK_WKSP, hits);
    assert.strictEqual(n, 2);

    const collection = getDiagnosticCollection();
    let total = 0;
    let foundGlobal = false;
    let foundFolder = false;
    collection.forEach((_uri, diags) => {
      for (const d of diags) {
        total++;
        assert.strictEqual(d.severity, vscode.DiagnosticSeverity.Warning, 'severity must be Warning');
        assert.strictEqual(d.source, MIGRATION_DIAG_SOURCE);
        const decoded = decodeDiagnosticCode(d.code);
        assert.ok(decoded);
        assert.strictEqual(decoded.entryId, 'justMyCode');
        assert.strictEqual(decoded.case, 2);
        if (decoded.scope === vscode.ConfigurationTarget.Global) foundGlobal = true;
        if (decoded.scope === vscode.ConfigurationTarget.WorkspaceFolder) foundFolder = true;
      }
    });
    assert.strictEqual(total, 2);
    assert.ok(foundGlobal, 'expected a Global-scope diagnostic');
    assert.ok(foundFolder, 'expected a WorkspaceFolder-scope diagnostic');
  });

  test('publishConsentDiagnostics groups hits sharing an anchor URI under one collection entry', async () => {
    sinon.stub(vscode.workspace.fs, 'readFile').resolves(Buffer.from('{}'));
    const entry1 = makeEntry('keyA');
    const entry2 = makeEntry('keyB');
    const hits: ConsentHit[] = [
      { case: 2, entry: entry1, scope: vscode.ConfigurationTarget.WorkspaceFolder },
      { case: 3, entry: entry2, scope: vscode.ConfigurationTarget.WorkspaceFolder },
    ];
    await publishConsentDiagnostics(MOCK_WKSP, hits);
    const collection = getDiagnosticCollection();
    let entries = 0;
    let diagsForFolder = 0;
    collection.forEach((_uri, diags) => {
      entries++;
      diagsForFolder += diags.length;
    });
    assert.strictEqual(entries, 1, 'both hits share the WorkspaceFolder anchor → 1 URI');
    assert.strictEqual(diagsForFolder, 2);
  });

  // ── clearDiagnosticsForEntryAtScope ──────────────────────────────────────

  test('clearDiagnosticsForEntryAtScope removes only matching (entry, scope) diagnostics', async () => {
    sinon.stub(vscode.workspace.fs, 'readFile').resolves(Buffer.from('{}'));
    const entry1 = makeEntry('keyA');
    const entry2 = makeEntry('keyB');
    const hits: ConsentHit[] = [
      { case: 2, entry: entry1, scope: vscode.ConfigurationTarget.WorkspaceFolder },
      { case: 2, entry: entry2, scope: vscode.ConfigurationTarget.WorkspaceFolder },
      { case: 2, entry: entry1, scope: vscode.ConfigurationTarget.Global },
    ];
    await publishConsentDiagnostics(MOCK_WKSP, hits);

    clearDiagnosticsForEntryAtScope(entry1, vscode.ConfigurationTarget.WorkspaceFolder);

    const collection = getDiagnosticCollection();
    const remaining: { entryId: string; scope: number }[] = [];
    collection.forEach((_uri, diags) => {
      for (const d of diags) {
        const decoded = decodeDiagnosticCode(d.code);
        if (decoded) remaining.push({ entryId: decoded.entryId, scope: decoded.scope });
      }
    });
    assert.strictEqual(remaining.length, 2, 'should have 2 diagnostics left after clearing 1');
    assert.ok(
      remaining.some(r => r.entryId === 'keyB' && r.scope === vscode.ConfigurationTarget.WorkspaceFolder),
      'keyB at WorkspaceFolder must remain',
    );
    assert.ok(
      remaining.some(r => r.entryId === 'keyA' && r.scope === vscode.ConfigurationTarget.Global),
      'keyA at Global must remain',
    );
  });
});

// ─── dispatchMigrationAction ────────────────────────────────────────────────

suite('260513-oh5 — dispatchMigrationAction', () => {
  let updateSpy: sinon.SinonSpy;

  setup(() => {
    updateSpy = sinon.spy(() => Promise.resolve());
    stubLogger();
    sinon.stub(configModule.config, 'reloadSettings').callsFake(() => undefined);
    sinon.stub(vscode.workspace, 'getConfiguration').returns({
      get: () => undefined,
      has: () => false,
      inspect: () => ({ globalValue: undefined, workspaceValue: undefined, workspaceFolderValue: undefined }),
      update: updateSpy,
    });
  });

  teardown(() => {
    disposeDiagnosticCollection();
    sinon.restore();
  });

  test('resolves entryId via MIGRATION_REGISTRY and runs migrate-and-delete handler', async () => {
    // Use a real registry entry so the lookup succeeds.
    const realEntry = MIGRATION_REGISTRY.find(e => e.id === 'justMyCode-from-behavevsc');
    assert.ok(realEntry, 'expected justMyCode entry in registry');

    const args: MigrationActionArgs = {
      entryId: realEntry.id,
      case: 2,
      scope: vscode.ConfigurationTarget.Global,
      action: 'migrate-and-delete',
      wkspUri: MOCK_WKSP.toString(),
    };
    await dispatchMigrationAction(args);

    // The dispatcher routes to runMigrateAndDelete → migrateScopedSetting +
    // markMigrationFinishedAtScope. inspect() returns undefined in this stub
    // so the primitive's migrate step no-ops (it short-circuits when source
    // is absent), but markFinished always runs. The completedMigrations write
    // is sufficient evidence the handler ran.
    const completed = updateSpy.getCalls().filter(c => c.args[0] === 'completedMigrations');
    assert.strictEqual(completed.length, 1, 'expected exactly one completedMigrations write');
    assert.strictEqual(completed[0].args[2], vscode.ConfigurationTarget.Global, 'write should target the encoded scope');
  });

  test('clears the diagnostic for that (entry, scope) on success', async () => {
    sinon.stub(vscode.workspace.fs, 'readFile').resolves(Buffer.from('{}'));
    const realEntry = MIGRATION_REGISTRY.find(e => e.id === 'justMyCode-from-behavevsc');
    assert.ok(realEntry);

    await publishConsentDiagnostics(MOCK_WKSP, [
      { case: 2, entry: realEntry, scope: vscode.ConfigurationTarget.Global },
    ]);
    let before = 0;
    getDiagnosticCollection().forEach(
      (_uri, diags) => { before += diags.length; },
    );
    assert.strictEqual(before, 1);

    await dispatchMigrationAction({
      entryId: realEntry.id,
      case: 2,
      scope: vscode.ConfigurationTarget.Global,
      action: 'dont-migrate',
      wkspUri: MOCK_WKSP.toString(),
    });

    let after = 0;
    getDiagnosticCollection().forEach(
      (_uri, diags) => { after += diags.length; },
    );
    assert.strictEqual(after, 0, 'diagnostic should be cleared after a successful action');
  });

  test('unknown entryId is logged and ignored (no throw)', async () => {
    const logInfo = (configModule.config.logger as unknown as { logInfo: sinon.SinonSpy }).logInfo
      ?? (configModule.config.logger as unknown as { logInfoAllWksps: sinon.SinonSpy }).logInfoAllWksps;
    await assert.doesNotReject(() => dispatchMigrationAction({
      entryId: 'does-not-exist',
      case: 2,
      scope: vscode.ConfigurationTarget.Global,
      action: 'dont-migrate',
      wkspUri: MOCK_WKSP.toString(),
    }));
    assert.ok(
      (logInfo as sinon.SinonSpy).getCalls().some(c => String(c.args[0]).includes('not in registry')),
      'expected a "not in registry" log line',
    );
  });
});
