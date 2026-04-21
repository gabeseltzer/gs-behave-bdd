// Unit tests for discovery priority logic (TEST-02):
// Settings > Config File > Convention
//
// Tests hasExplicitSetting as the decision boundary for the priority chain.
// When explicit settings exist, config-file discovery is bypassed (Branch A).
// When no explicit settings exist, config-file discovery runs (Branch B).

import * as assert from 'assert';
import { hasExplicitSetting, hasExplicitNonEmptyArraySetting } from '../../../src/common';

// --- Helpers: mock vscode.WorkspaceConfiguration with specific scope values ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeConfig(values: Record<string, unknown>, explicitKeys: string[] = []): any {
  return {
    get: (key: string) => values[key],
    has: () => false,
    inspect: (key: string) => ({
      key,
      defaultValue: undefined,
      globalValue: undefined,
      workspaceValue: explicitKeys.includes(key) ? values[key] : undefined,
      workspaceFolderValue: undefined,
    }),
    update: () => Promise.resolve(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeGlobalConfig(globalValues: Record<string, unknown>): any {
  return {
    get: (key: string) => globalValues[key],
    has: () => false,
    inspect: (key: string) => ({
      key,
      defaultValue: undefined,
      globalValue: globalValues[key],
      workspaceValue: undefined,
      workspaceFolderValue: undefined,
    }),
    update: () => Promise.resolve(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeWkspFolderConfig(folderValues: Record<string, unknown>): any {
  return {
    get: (key: string) => folderValues[key],
    has: () => false,
    inspect: (key: string) => ({
      key,
      defaultValue: undefined,
      globalValue: undefined,
      workspaceValue: undefined,
      workspaceFolderValue: folderValues[key],
    }),
    update: () => Promise.resolve(),
  };
}


suite('discovery priority (TEST-02)', () => {

  suite('Branch A: explicit settings win over config-file', () => {
    test('projectPath set at workspaceValue -- returns true (settings branch)', () => {
      const cfg = makeConfig({ projectPath: 'myproject' }, ['projectPath']);
      assert.strictEqual(hasExplicitSetting(cfg, 'projectPath'), true);
    });

    test('featuresPath set at workspaceValue -- returns true (settings branch)', () => {
      const cfg = makeConfig({ featuresPath: 'my_tests' }, ['featuresPath']);
      assert.strictEqual(hasExplicitSetting(cfg, 'featuresPath'), true);
    });

    test('projectPath set at globalValue -- returns true (settings branch)', () => {
      const cfg = makeGlobalConfig({ projectPath: 'global/path' });
      assert.strictEqual(hasExplicitSetting(cfg, 'projectPath'), true);
    });

    test('featuresPath set at workspaceFolderValue -- returns true (settings branch)', () => {
      const cfg = makeWkspFolderConfig({ featuresPath: 'folder_tests' });
      assert.strictEqual(hasExplicitSetting(cfg, 'featuresPath'), true);
    });
  });

  suite('Branch B: no explicit settings -- config-file or convention path', () => {
    test('no settings at any scope -- returns false (falls to config/convention)', () => {
      const cfg = makeConfig({});
      assert.strictEqual(hasExplicitSetting(cfg, 'projectPath'), false);
      assert.strictEqual(hasExplicitSetting(cfg, 'featuresPath'), false);
    });

    test('empty string at workspaceValue -- returns true (empty string is an explicit value)', () => {
      // Implementation treats empty string as an explicit setting ('' !== undefined).
      // The user intentionally set it, so config-file discovery is bypassed.
      const cfg = makeConfig({ featuresPath: '' }, ['featuresPath']);
      assert.strictEqual(hasExplicitSetting(cfg, 'featuresPath'), true);
    });
  });

  suite('priority order verification', () => {
    test('both projectPath and featuresPath unset -- both return false', () => {
      const cfg = makeConfig({});
      assert.strictEqual(hasExplicitSetting(cfg, 'projectPath'), false);
      assert.strictEqual(hasExplicitSetting(cfg, 'featuresPath'), false);
    });

    test('projectPath set but featuresPath unset -- projectPath returns true', () => {
      const cfg = makeConfig({ projectPath: 'proj' }, ['projectPath']);
      assert.strictEqual(hasExplicitSetting(cfg, 'projectPath'), true);
      assert.strictEqual(hasExplicitSetting(cfg, 'featuresPath'), false);
    });
  });

  suite('legacy config fallback', () => {
    test('legacy config has workspaceFolderValue -- returns true', () => {
      const cfg = makeConfig({});
      const legacyCfg = makeWkspFolderConfig({ projectPath: 'legacy/path' });
      assert.strictEqual(hasExplicitSetting(cfg, 'projectPath', legacyCfg), true);
    });

    test('legacy config empty -- returns false', () => {
      const cfg = makeConfig({});
      const legacyCfg = makeConfig({});
      assert.strictEqual(hasExplicitSetting(cfg, 'projectPath', legacyCfg), false);
    });
  });



  suite('hasExplicitNonEmptyArraySetting - featuresPaths (D-13, D-14)', () => {

    test('returns true for non-empty array at workspaceFolderValue', () => {
      const cfg = {
        inspect: () => ({
          key: 'featuresPaths',
          globalValue: undefined,
          workspaceValue: undefined,
          workspaceFolderValue: ['a', 'b'],
        }),
      } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      assert.strictEqual(hasExplicitNonEmptyArraySetting(cfg, 'featuresPaths'), true);
    });

    test('returns true for non-empty array at globalValue', () => {
      const cfg = {
        inspect: () => ({
          key: 'featuresPaths',
          globalValue: ['x'],
          workspaceValue: undefined,
          workspaceFolderValue: undefined,
        }),
      } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      assert.strictEqual(hasExplicitNonEmptyArraySetting(cfg, 'featuresPaths'), true);
    });

    test('returns false for empty array at all scopes (Pitfall 1)', () => {
      const cfg = {
        inspect: () => ({
          key: 'featuresPaths',
          globalValue: [],
          workspaceValue: [],
          workspaceFolderValue: [],
        }),
      } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      assert.strictEqual(hasExplicitNonEmptyArraySetting(cfg, 'featuresPaths'), false);
    });

    test('returns false when all scopes are undefined', () => {
      const cfg = {
        inspect: () => ({
          key: 'featuresPaths',
          globalValue: undefined,
          workspaceValue: undefined,
          workspaceFolderValue: undefined,
        }),
      } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      assert.strictEqual(hasExplicitNonEmptyArraySetting(cfg, 'featuresPaths'), false);
    });

    test('returns false when inspect returns undefined', () => {
      const cfg = {
        inspect: () => undefined,
      } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      assert.strictEqual(hasExplicitNonEmptyArraySetting(cfg, 'featuresPaths'), false);
    });
  });

});
