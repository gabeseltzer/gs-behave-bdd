// configurationChangedHandler uses affectsOnlySettings to tell an env-var-only change (e.g. selecting a
// different preset), which must not rebuild the test tree, from any other settings change, which must.

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { affectsOnlySettings, ENV_VAR_SETTINGS } from '../../../src/common';

suite('affectsOnlySettings', () => {
  const allKeys = [...ENV_VAR_SETTINGS, 'featuresPaths', 'runParallel'];
  const changed = (...keys: string[]) => ({
    affectsConfiguration: (section: string) =>
      section === 'gs-behave-bdd' || keys.some(key => section === `gs-behave-bdd.${key}`),
  }) as vscode.ConfigurationChangeEvent;

  test('true when only env var settings changed', () => {
    assert.strictEqual(affectsOnlySettings(changed('activeEnvVarPreset'), ENV_VAR_SETTINGS, allKeys), true);
    assert.strictEqual(affectsOnlySettings(changed('envVarPresets', 'envVarOverrides'), ENV_VAR_SETTINGS, allKeys), true);
  });

  test('false when another setting changed as well', () => {
    assert.strictEqual(affectsOnlySettings(changed('activeEnvVarPreset', 'featuresPaths'), ENV_VAR_SETTINGS, allKeys), false);
  });

  test('false when no env var setting changed', () => {
    assert.strictEqual(affectsOnlySettings(changed('runParallel'), ENV_VAR_SETTINGS, allKeys), false);
    assert.strictEqual(affectsOnlySettings(changed(), ENV_VAR_SETTINGS, allKeys), false);
  });

  test('every env var setting is a contributed setting', () => {
    // out/test/test/unit/common when compiled
    let pkgPath = path.resolve(__dirname, '../../../../../package.json');
    if (!fs.existsSync(pkgPath))
      pkgPath = path.resolve(__dirname, '../../../package.json');
    const contributed = Object.keys(JSON.parse(fs.readFileSync(pkgPath, 'utf8')).contributes.configuration.properties);
    for (const key of ENV_VAR_SETTINGS)
      assert.ok(contributed.includes(`gs-behave-bdd.${key}`), `${key} is not a gs-behave-bdd setting`);
  });
});
