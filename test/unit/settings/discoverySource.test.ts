// Unit tests for hasExplicitSetting() — verifies INTG-02: explicit settings detected
// at globalValue, workspaceValue, and workspaceFolderValue scopes via inspect().

import * as assert from 'assert';
import { hasExplicitSetting } from '../../../src/common';

// --- Helpers: mock vscode.WorkspaceConfiguration with specific scope values ---
// Copied from legacyFallback.test.ts makeConfig pattern.

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


suite('hasExplicitSetting (INTG-02)', () => {

  suite('returns false when no scope has a value', () => {
    test('empty config -- returns false', () => {
      const cfg = makeConfig({});
      assert.strictEqual(hasExplicitSetting(cfg, 'projectPath'), false);
    });

    test('only defaultValue set -- returns false', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cfg: any = {
        get: () => '',
        has: () => false,
        inspect: () => ({
          key: 'projectPath',
          defaultValue: '',
          globalValue: undefined,
          workspaceValue: undefined,
          workspaceFolderValue: undefined,
        }),
        update: () => Promise.resolve(),
      };
      assert.strictEqual(hasExplicitSetting(cfg, 'projectPath'), false);
    });
  });

  suite('returns true when globalValue is set', () => {
    test('globalValue present -- returns true', () => {
      const cfg = makeGlobalConfig({ projectPath: 'global_proj' });
      assert.strictEqual(hasExplicitSetting(cfg, 'projectPath'), true);
    });
  });

  suite('returns true when workspaceValue is set', () => {
    test('workspaceValue present -- returns true', () => {
      const cfg = makeConfig({ projectPath: 'my_proj' }, ['projectPath']);
      assert.strictEqual(hasExplicitSetting(cfg, 'projectPath'), true);
    });
  });

  suite('returns true when workspaceFolderValue is set', () => {
    test('workspaceFolderValue present -- returns true', () => {
      const cfg = makeWkspFolderConfig({ projectPath: 'folder_proj' });
      assert.strictEqual(hasExplicitSetting(cfg, 'projectPath'), true);
    });
  });

  suite('works for projectPath key', () => {
    test('projectPath at workspaceValue -- returns true', () => {
      const cfg = makeConfig({ projectPath: 'backend' }, ['projectPath']);
      assert.strictEqual(hasExplicitSetting(cfg, 'projectPath'), true);
    });

    test('projectPath not set -- returns false', () => {
      const cfg = makeConfig({});
      assert.strictEqual(hasExplicitSetting(cfg, 'projectPath'), false);
    });
  });

  suite('legacyConfig fallback', () => {
    test('no new config explicit + legacy workspaceFolderValue -- returns true', () => {
      const newCfg = makeConfig({});
      const legacyCfg = makeWkspFolderConfig({ projectPath: 'backend' });
      assert.strictEqual(hasExplicitSetting(newCfg, 'projectPath', legacyCfg), true);
    });

    test('no new config + no legacy value -- returns false', () => {
      const newCfg = makeConfig({});
      const legacyCfg = makeConfig({});
      assert.strictEqual(hasExplicitSetting(newCfg, 'projectPath', legacyCfg), false);
    });
  });

  suite('edge cases', () => {
    test('inspect returns undefined (unregistered key) -- returns false, not throw', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cfg: any = {
        get: () => undefined,
        has: () => false,
        inspect: () => undefined,
        update: () => Promise.resolve(),
      };
      assert.strictEqual(hasExplicitSetting(cfg, 'projectPath'), false);
    });

    test('empty string value at workspaceValue -- still returns true (value is set)', () => {
      const cfg = makeConfig({ projectPath: '' }, ['projectPath']);
      // Empty string is still an explicit value -- the user intentionally set it
      assert.strictEqual(hasExplicitSetting(cfg, 'projectPath'), true);
    });
  });

});
