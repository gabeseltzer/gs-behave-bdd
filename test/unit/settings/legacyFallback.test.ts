// Tests for the legacy settings fallback (behave-vsc → behave-vsc-gs migration).
// WindowSettings is used as the test surface since it has no filesystem dependencies.

import * as assert from 'assert';
import type * as vscode from 'vscode';
import { WindowSettings } from '../../../src/settings';
import { getActualWorkspaceSetting } from '../../../src/common';

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

const NEW_DEFAULTS = { multiRootRunWorkspacesInParallel: true, xRay: false };

suite('legacy settings fallback (getWithLegacyFallback)', () => {

  suite('no legacyConfig provided', () => {
    test('reads directly from new config', () => {
      const newConfig = makeConfig({ ...NEW_DEFAULTS, xRay: true });
      const settings = new WindowSettings(newConfig);
      assert.strictEqual(settings.xRay, true);
      assert.strictEqual(settings.multiRootRunWorkspacesInParallel, true);
    });
  });

  suite('legacyConfig provided, new key NOT explicitly set', () => {
    test('uses legacy value when new config is at default', () => {
      // Simulate: user had "behave-vsc.xRay": true, hasn't set "behave-vsc-gs.xRay"
      const newConfig = makeConfig(NEW_DEFAULTS); // not in explicitKeys → inspect shows no explicit value
      const legacyConfig = makeConfig({ xRay: true, multiRootRunWorkspacesInParallel: false });

      const settings = new WindowSettings(newConfig, legacyConfig);

      assert.strictEqual(settings.xRay, true, 'should use legacy xRay value');
      assert.strictEqual(settings.multiRootRunWorkspacesInParallel, false, 'should use legacy multiRootRunWorkspacesInParallel value');
    });

    test('falls back to new default when legacy also has no value', () => {
      const newConfig = makeConfig(NEW_DEFAULTS);
      const legacyConfig = makeConfig({}); // no values at all

      const settings = new WindowSettings(newConfig, legacyConfig);

      assert.strictEqual(settings.xRay, false, 'should use new default');
      assert.strictEqual(settings.multiRootRunWorkspacesInParallel, true, 'should use new default');
    });
  });

  suite('legacyConfig provided, new key IS explicitly set', () => {
    test('new value wins over legacy', () => {
      // Simulate: user already set "behave-vsc-gs.xRay": false explicitly, legacy has true
      const newConfig = makeConfig({ ...NEW_DEFAULTS, xRay: false }, ['xRay']);
      const legacyConfig = makeConfig({ xRay: true, multiRootRunWorkspacesInParallel: false });

      const settings = new WindowSettings(newConfig, legacyConfig);

      assert.strictEqual(settings.xRay, false, 'new explicit value should win over legacy');
      assert.strictEqual(settings.multiRootRunWorkspacesInParallel, false, 'non-explicit key still uses legacy');
    });

    test('new false value wins over legacy true (falsy explicit values are not skipped)', () => {
      // Edge case: explicitly-set false should NOT be confused with "undefined / not set"
      const newConfig = makeConfig({ ...NEW_DEFAULTS, xRay: false }, ['xRay']);
      const legacyConfig = makeConfig({ xRay: true });

      const settings = new WindowSettings(newConfig, legacyConfig);

      assert.strictEqual(settings.xRay, false, 'explicitly-set false should win over legacy true');
    });
  });

  suite('inspect() returns undefined (unregistered key edge case)', () => {
    test('falls back to legacy value when inspect returns undefined', () => {
      // Some VS Code versions return undefined from inspect for unregistered keys.
      // Our helper should treat this the same as "not explicitly set".
      const newConfig: vscode.WorkspaceConfiguration = {
        get: (key: string) => NEW_DEFAULTS[key as keyof typeof NEW_DEFAULTS],
        has: () => false,
        inspect: (_key: string) => undefined, // simulates unregistered key
        update: () => Promise.resolve(),
      };
      const legacyConfig = makeConfig({ xRay: true, multiRootRunWorkspacesInParallel: false });

      const settings = new WindowSettings(newConfig, legacyConfig);

      assert.strictEqual(settings.xRay, true, 'should fall back to legacy when inspect returns undefined');
    });
  });

});

// makeWkspConfig sets workspaceFolderValue (resource-scope settings like featuresPath live here).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeWkspConfig(folderValues: Record<string, unknown>): any {
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

suite('getActualWorkspaceSetting legacy fallback (hasFeaturesFolder scenario)', () => {

  test('returns new config value when explicitly set', () => {
    const newConfig = makeWkspConfig({ featuresPath: 'my_tests' });
    const legacyConfig = makeWkspConfig({ featuresPath: 'old_tests' });
    assert.strictEqual(getActualWorkspaceSetting(newConfig, 'featuresPath', legacyConfig), 'my_tests');
  });

  test('falls back to legacy workspaceFolderValue when new key not explicitly set', () => {
    // This is the real-world bug: user has "behave-vsc.featuresPath" but not "behave-vsc-gs.featuresPath"
    const newConfig = makeWkspConfig({}); // no workspaceFolderValue set
    const legacyConfig = makeWkspConfig({ featuresPath: 'my_tests' });
    assert.strictEqual(getActualWorkspaceSetting(newConfig, 'featuresPath', legacyConfig), 'my_tests');
  });

  test('returns undefined when neither config has explicit value', () => {
    const newConfig = makeWkspConfig({});
    const legacyConfig = makeWkspConfig({});
    assert.strictEqual(getActualWorkspaceSetting(newConfig, 'featuresPath', legacyConfig), undefined);
  });

  test('returns undefined when no legacyConfig provided and new key not set', () => {
    const newConfig = makeWkspConfig({});
    assert.strictEqual(getActualWorkspaceSetting(newConfig, 'featuresPath'), undefined);
  });

  test('also handles projectPath legacy fallback', () => {
    const newConfig = makeWkspConfig({});
    const legacyConfig = makeWkspConfig({ projectPath: 'backend' });
    assert.strictEqual(getActualWorkspaceSetting(newConfig, 'projectPath', legacyConfig), 'backend');
  });

});
