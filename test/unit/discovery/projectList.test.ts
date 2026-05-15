// Unit tests for projectList — Phase 12: project list discovery & persistence

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as loggerModule from '../../../src/logger';
import {
  initProjectListPersistence,
  rebuildProjectList,
  getProjectList,
  getActiveProject,
  setActiveProject,
  removeProjectByConfigUri,
  addProjectFromScanEntry,
  clearProjectList,
  clearActiveProjectCache,
  isManualProjectPathMode,
  ProjectEntry,
} from '../../../src/discovery/projectList';
import { ScanResult, ScanResultEntry } from '../../../src/discovery/configScanner';


// --- Mock Memento ---

class MockMemento implements vscode.Memento {
  private store = new Map<string, unknown>();
  keys(): readonly string[] { return [...this.store.keys()]; }
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    return this.store.has(key) ? this.store.get(key) as T : defaultValue;
  }
  update(key: string, value: unknown): Thenable<void> {
    if (value === undefined) this.store.delete(key);
    else this.store.set(key, value);
    return Promise.resolve();
  }
}


// --- Helpers ---

const wkspUri = vscode.Uri.file('/workspace');

function makeScanEntry(dir: string, configFile: string, depth: number, priority: number): ScanResultEntry {
  return {
    configFileUri: vscode.Uri.file(`/workspace/${dir}/${configFile}`),
    dirUri: vscode.Uri.file(`/workspace/${dir}`),
    depth,
    configPriority: priority,
  };
}

function makeScanResult(entries: ScanResultEntry[]): ScanResult {
  return {
    primary: entries[0],
    alsoFound: entries.slice(1),
    scannedDirs: 10,
    circuitBreakerFired: false,
    maxDepthReached: 3,
  };
}


suite('ProjectList', () => {

  let sandbox: sinon.SinonSandbox;
  let memento: MockMemento;

  setup(() => {
    sandbox = sinon.createSandbox();
    memento = new MockMemento();
    initProjectListPersistence(memento);

    // Stub diagLog to suppress output during tests
    sandbox.stub(loggerModule, 'diagLog');

    // Stub asRelativePath to return the last segment of the path
    sandbox.stub(vscode.workspace, 'asRelativePath').callsFake((pathOrUri: string | vscode.Uri): string => {
      const p = typeof pathOrUri === 'string' ? pathOrUri : (pathOrUri.fsPath || pathOrUri.path);
      const segments = p.replace(/\\/g, '/').split('/').filter(Boolean);
      return segments[segments.length - 1] || '.';
    });
  });

  teardown(() => {
    clearProjectList(wkspUri);
    sandbox.restore();
  });


  // --- rebuildProjectList ---

  test('rebuildProjectList with 3 scan entries returns all 3 in scanner order', () => {
    const e1 = makeScanEntry('sub-a', 'behave.ini', 1, 0);
    const e2 = makeScanEntry('sub-b', 'setup.cfg', 1, 2);
    const e3 = makeScanEntry('deep/sub-c', 'behave.ini', 2, 0);
    const result = makeScanResult([e1, e2, e3]);

    const projects = rebuildProjectList(wkspUri, result);

    assert.strictEqual(projects.length, 3);
    assert.strictEqual(projects[0].depth, 1);
    assert.strictEqual(projects[0].configPriority, 0);
    assert.strictEqual(projects[1].depth, 1);
    assert.strictEqual(projects[1].configPriority, 2);
    assert.strictEqual(projects[2].depth, 2);
  });

  test('rebuildProjectList with rootConfigEntry inserts root entry first', () => {
    const rootEntry: ScanResultEntry = {
      configFileUri: vscode.Uri.file('/workspace/behave.ini'),
      dirUri: vscode.Uri.file('/workspace'),
      depth: 0,
      configPriority: 0,
    };

    const subEntry = makeScanEntry('sub-a', 'setup.cfg', 1, 2);
    const result = makeScanResult([subEntry]);

    const projects = rebuildProjectList(wkspUri, result, rootEntry);

    assert.strictEqual(projects.length, 2);
    assert.strictEqual(projects[0].depth, 0); // root first
    assert.strictEqual(projects[1].depth, 1);
  });


  // --- Auto-selection (restoreOrAutoSelectActive) ---

  test('auto-selects first entry when no persisted choice', () => {
    const e1 = makeScanEntry('sub-a', 'behave.ini', 1, 0);
    const e2 = makeScanEntry('sub-b', 'setup.cfg', 1, 2);
    const result = makeScanResult([e1, e2]);

    rebuildProjectList(wkspUri, result);
    const active = getActiveProject(wkspUri);

    assert.ok(active);
    assert.strictEqual(active.configFileUri.toString(), e1.configFileUri.toString());
  });

  test('restores persisted choice when it exists in list', () => {
    const e1 = makeScanEntry('sub-a', 'behave.ini', 1, 0);
    const e2 = makeScanEntry('sub-b', 'setup.cfg', 1, 2);
    const result = makeScanResult([e1, e2]);

    // Pre-persist e2 as active
    const key = 'gs-behave-bdd.activeProject.' + wkspUri.toString();
    memento.update(key, { configFilePath: e2.configFileUri.toString() });

    rebuildProjectList(wkspUri, result);
    const active = getActiveProject(wkspUri);

    assert.ok(active);
    assert.strictEqual(active.configFileUri.toString(), e2.configFileUri.toString());
  });

  test('falls back to first entry when persisted choice not in list', () => {
    const e1 = makeScanEntry('sub-a', 'behave.ini', 1, 0);
    const result = makeScanResult([e1]);

    // Pre-persist a nonexistent config
    const key = 'gs-behave-bdd.activeProject.' + wkspUri.toString();
    memento.update(key, { configFilePath: 'file:///workspace/gone/behave.ini' });

    rebuildProjectList(wkspUri, result);
    const active = getActiveProject(wkspUri);

    assert.ok(active);
    assert.strictEqual(active.configFileUri.toString(), e1.configFileUri.toString());
  });


  // --- setActiveProject ---

  test('setActiveProject persists to workspaceState', () => {
    const e1 = makeScanEntry('sub-a', 'behave.ini', 1, 0);
    const e2 = makeScanEntry('sub-b', 'setup.cfg', 1, 2);
    rebuildProjectList(wkspUri, makeScanResult([e1, e2]));

    const list = getProjectList(wkspUri);
    setActiveProject(wkspUri, list[1]); // switch to e2

    const active = getActiveProject(wkspUri);
    assert.ok(active);
    assert.strictEqual(active.configFileUri.toString(), e2.configFileUri.toString());

    // Verify persisted
    const key = 'gs-behave-bdd.activeProject.' + wkspUri.toString();
    const persisted = memento.get<{ configFilePath: string }>(key);
    assert.ok(persisted);
    assert.strictEqual(persisted.configFilePath, e2.configFileUri.toString());
  });

  test('setActiveProject throws when entry not in list', () => {
    const e1 = makeScanEntry('sub-a', 'behave.ini', 1, 0);
    rebuildProjectList(wkspUri, makeScanResult([e1]));

    const fakeEntry: ProjectEntry = {
      configFileUri: vscode.Uri.file('/workspace/nonexistent/behave.ini'),
      dirUri: vscode.Uri.file('/workspace/nonexistent'),
      depth: 1,
      configPriority: 0,
      label: 'nonexistent',
    };

    assert.throws(() => setActiveProject(wkspUri, fakeEntry), /not in project list/);
  });


  // --- removeProjectByConfigUri ---

  test('removes active project and auto-selects next (D-01)', () => {
    const e1 = makeScanEntry('sub-a', 'behave.ini', 1, 0);
    const e2 = makeScanEntry('sub-b', 'setup.cfg', 1, 2);
    rebuildProjectList(wkspUri, makeScanResult([e1, e2]));

    // Active is e1 (auto-selected)
    const { removed, newActive } = removeProjectByConfigUri(wkspUri, e1.configFileUri);

    assert.strictEqual(removed, true);
    assert.ok(newActive);
    assert.strictEqual(newActive.configFileUri.toString(), e2.configFileUri.toString());
    assert.strictEqual(getActiveProject(wkspUri)?.configFileUri.toString(), e2.configFileUri.toString());
    assert.strictEqual(getProjectList(wkspUri).length, 1);
  });

  test('removes last project and active is undefined (D-02)', () => {
    const e1 = makeScanEntry('sub-a', 'behave.ini', 1, 0);
    rebuildProjectList(wkspUri, makeScanResult([e1]));

    const { removed, newActive } = removeProjectByConfigUri(wkspUri, e1.configFileUri);

    assert.strictEqual(removed, true);
    assert.strictEqual(newActive, undefined);
    assert.strictEqual(getActiveProject(wkspUri), undefined);
    assert.strictEqual(getProjectList(wkspUri).length, 0);
  });

  test('removes non-active project, active unchanged', () => {
    const e1 = makeScanEntry('sub-a', 'behave.ini', 1, 0);
    const e2 = makeScanEntry('sub-b', 'setup.cfg', 1, 2);
    rebuildProjectList(wkspUri, makeScanResult([e1, e2]));

    const { removed, newActive } = removeProjectByConfigUri(wkspUri, e2.configFileUri);

    assert.strictEqual(removed, true);
    assert.strictEqual(newActive, undefined); // no newActive because active didn't change
    assert.strictEqual(getActiveProject(wkspUri)?.configFileUri.toString(), e1.configFileUri.toString());
    assert.strictEqual(getProjectList(wkspUri).length, 1);
  });


  // --- addProjectFromScanEntry ---

  test('inserts in correct scanner order, active unchanged (D-07)', () => {
    const e1 = makeScanEntry('sub-a', 'behave.ini', 1, 0);
    const e2 = makeScanEntry('deep/sub-c', 'behave.ini', 2, 0);
    rebuildProjectList(wkspUri, makeScanResult([e1, e2]));

    // Active is e1
    const activeBeforeAdd = getActiveProject(wkspUri);
    assert.ok(activeBeforeAdd);

    // Add entry at depth 1 priority 2 — should insert between e1 and e2
    const newEntry = makeScanEntry('sub-b', 'setup.cfg', 1, 2);
    addProjectFromScanEntry(wkspUri, newEntry);

    const list = getProjectList(wkspUri);
    assert.strictEqual(list.length, 3);
    assert.strictEqual(list[0].depth, 1); // e1
    assert.strictEqual(list[0].configPriority, 0);
    assert.strictEqual(list[1].depth, 1); // new entry
    assert.strictEqual(list[1].configPriority, 2);
    assert.strictEqual(list[2].depth, 2); // e2

    // D-07: active unchanged
    assert.strictEqual(getActiveProject(wkspUri)?.configFileUri.toString(), activeBeforeAdd.configFileUri.toString());
  });


  // --- isManualProjectPathMode ---

  test('returns true when projectPath is explicitly set', () => {
    sandbox.restore(); // Restore to re-stub getConfiguration
    sandbox.stub(loggerModule, 'diagLog');
    sandbox.stub(vscode.workspace, 'asRelativePath').returns('.');

    sandbox.stub(vscode.workspace, 'getConfiguration').callsFake((section?: string) => {
      if (section === 'gs-behave-bdd') {
        return {
          get: () => undefined,
          has: () => false,
          inspect: (key: string) => {
            if (key === 'projectPath') {
              return { workspaceFolderValue: 'some/path', key: 'gs-behave-bdd.projectPath' };
            }
            return undefined;
          },
          update: () => Promise.resolve(),
        } as unknown as vscode.WorkspaceConfiguration;
      }
      return {
        get: () => undefined, has: () => false,
        inspect: () => undefined, update: () => Promise.resolve(),
      } as unknown as vscode.WorkspaceConfiguration;
    });

    assert.strictEqual(isManualProjectPathMode(wkspUri), true);
  });

  test('returns false when no explicit projectPath', () => {
    sandbox.restore();
    sandbox.stub(loggerModule, 'diagLog');
    sandbox.stub(vscode.workspace, 'asRelativePath').returns('.');

    sandbox.stub(vscode.workspace, 'getConfiguration').callsFake(() => {
      return {
        get: () => undefined, has: () => false,
        inspect: () => undefined, update: () => Promise.resolve(),
      } as unknown as vscode.WorkspaceConfiguration;
    });

    assert.strictEqual(isManualProjectPathMode(wkspUri), false);
  });


  // --- clearProjectList ---

  test('clears both list and active', () => {
    const e1 = makeScanEntry('sub-a', 'behave.ini', 1, 0);
    rebuildProjectList(wkspUri, makeScanResult([e1]));

    assert.strictEqual(getProjectList(wkspUri).length, 1);
    assert.ok(getActiveProject(wkspUri));

    clearProjectList(wkspUri);

    assert.strictEqual(getProjectList(wkspUri).length, 0);
    assert.strictEqual(getActiveProject(wkspUri), undefined);
  });

});

// ─── Phase 19 / CLEANUP-02 / TEST-06 ─────────────────────────────────────────
// Pins the post-D-11 behavior: activeProjectCache is invalidated proactively by
// configurationChangedHandler, replacing the v1.4.0 read-time discoveryDepth
// re-read in src/common.ts. Tests both the helper itself and the structural
// shape of src/common.ts to lock in that the read-time gate is gone.

import * as fs from 'fs';
import * as path from 'path';

suite('Phase 19 / CLEANUP-02 — clearActiveProjectCache', () => {
  const wkspUri2 = vscode.Uri.file('/cleanup-02-workspace');
  let memento: MockMemento;

  setup(() => {
    memento = new MockMemento();
    initProjectListPersistence(memento);
  });
  teardown(() => sinon.restore());

  test('TEST-06 7.1(b): after clearActiveProjectCache(), getActiveProject returns undefined', () => {
    const e1 = makeScanEntry('sub-a', 'behave.ini', 1, 0);
    rebuildProjectList(wkspUri2, makeScanResult([e1]));
    assert.ok(getActiveProject(wkspUri2), 'sanity: cache populated by rebuildProjectList');

    clearActiveProjectCache();

    assert.strictEqual(
      getActiveProject(wkspUri2),
      undefined,
      'cleared cache returns undefined — next discovery cycle recomputes',
    );
  });

  test('TEST-06 7.2: clearActiveProjectCache is a safe no-op when cache is already empty', () => {
    // Fresh module state for this assertion: clear once to drain anything from
    // the previous test, then clear again — must not throw.
    clearActiveProjectCache();
    assert.doesNotThrow(() => clearActiveProjectCache());
  });

  test('TEST-06 7.1(a): src/common.ts no longer reads discoveryDepth in active-project block (D-11)', () => {
    // Structural source-text assertion (rationale: end-to-end simulation of
    // the configuration-change event flow is brittle in a unit test and
    // already covered by Phase 22 TEST-07 integration coverage).
    // Try both depths — compiled output sits at out/test/test/unit/discovery/
    // (5 ups to project root) but a future test runner config could shift this.
    const candidates = [
      path.resolve(__dirname, '../../../../../src/common.ts'),
      path.resolve(__dirname, '../../../../src/common.ts'),
      path.resolve(__dirname, '../../../src/common.ts'),
    ];
    const commonPath = candidates.find(p => fs.existsSync(p));
    assert.ok(commonPath, `could not locate src/common.ts from ${__dirname}`);
    const src = fs.readFileSync(commonPath, 'utf8');
    assert.ok(
      !src.includes('currentDiscoveryDepth'),
      'currentDiscoveryDepth must be removed from src/common.ts (D-11)',
    );
    assert.ok(
      !/get<number>\("discoveryDepth"\)/.test(src),
      'src/common.ts must not re-read discoveryDepth at lookup time (D-11)',
    );
    assert.ok(
      src.includes('Phase 19 / CLEANUP-02'),
      'src/common.ts must carry the CLEANUP-02 closure marker comment',
    );
  });
});
