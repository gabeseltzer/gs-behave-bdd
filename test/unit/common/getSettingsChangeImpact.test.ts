// configurationChangedHandler uses getSettingsChangeImpact to do only what a settings change needs.
// In particular, a change that can't affect which tests exist (e.g. selecting a different env var preset)
// must not rebuild the test tree, which makes the Test Explorer visibly repopulate.

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getSettingsChangeImpact, SettingsChangeImpact, SETTING_CHANGE_IMPACTS } from '../../../src/common';

suite('getSettingsChangeImpact', () => {
  const allKeys = ['activeEnvVarPreset', 'checkStepArgumentsWithPython', 'runParallel', 'formatBlankLines', 'featuresPaths'];
  const wkspA = vscode.Uri.file('c:/wksp-a');
  const wkspB = vscode.Uri.file('c:/wksp-b');

  // keys changed for every scope, plus keys changed only for wkspA
  const changed = (keys: string[], keysForWkspAOnly: string[] = []) => ({
    affectsConfiguration: (section: string, scope?: vscode.Uri) =>
      keys.some(key => section === `gs-behave-bdd.${key}`) ||
      ((!scope || scope === wkspA) && keysForWkspAOnly.some(key => section === `gs-behave-bdd.${key}`)),
  }) as vscode.ConfigurationChangeEvent;

  test('selecting a different env var preset re-discovers steps but does not rebuild the test tree', () => {
    assert.strictEqual(getSettingsChangeImpact(changed(['activeEnvVarPreset']), allKeys), SettingsChangeImpact.rediscoverSteps);
  });

  test('each level is the impact of its setting', () => {
    assert.strictEqual(getSettingsChangeImpact(changed(['formatBlankLines']), allKeys), SettingsChangeImpact.none);
    assert.strictEqual(getSettingsChangeImpact(changed(['runParallel']), allKeys), SettingsChangeImpact.reloadSettings);
    assert.strictEqual(getSettingsChangeImpact(changed(['checkStepArgumentsWithPython']), allKeys), SettingsChangeImpact.revalidate);
    assert.strictEqual(getSettingsChangeImpact(changed(['featuresPaths']), allKeys), SettingsChangeImpact.fullRefresh);
  });

  test('several settings changed at once take the most work any of them needs', () => {
    assert.strictEqual(getSettingsChangeImpact(changed(['runParallel', 'activeEnvVarPreset']), allKeys),
      SettingsChangeImpact.rediscoverSteps);
    assert.strictEqual(getSettingsChangeImpact(changed(['activeEnvVarPreset', 'featuresPaths']), allKeys),
      SettingsChangeImpact.fullRefresh);
  });

  test('a setting with no listed impact needs a full refresh, so a new setting cannot slip through', () => {
    assert.strictEqual(getSettingsChangeImpact(changed(['someNewSetting']), [...allKeys, 'someNewSetting']),
      SettingsChangeImpact.fullRefresh);
  });

  test('nothing to do when no setting changed', () => {
    assert.strictEqual(getSettingsChangeImpact(changed([]), allKeys), SettingsChangeImpact.none);
  });

  test('with a scope, only the settings changed for that workspace count', () => {
    const event = changed(['runParallel'], ['activeEnvVarPreset']);
    assert.strictEqual(getSettingsChangeImpact(event, allKeys, wkspA), SettingsChangeImpact.rediscoverSteps);
    assert.strictEqual(getSettingsChangeImpact(event, allKeys, wkspB), SettingsChangeImpact.reloadSettings);
  });

  test('every setting with a listed impact is a contributed setting', () => {
    // out/test/test/unit/common when compiled
    let pkgPath = path.resolve(__dirname, '../../../../../package.json');
    if (!fs.existsSync(pkgPath))
      pkgPath = path.resolve(__dirname, '../../../package.json');
    const contributed = Object.keys(JSON.parse(fs.readFileSync(pkgPath, 'utf8')).contributes.configuration.properties);
    for (const key of Object.keys(SETTING_CHANGE_IMPACTS))
      assert.ok(contributed.includes(`gs-behave-bdd.${key}`), `${key} is not a gs-behave-bdd setting`);
  });
});
