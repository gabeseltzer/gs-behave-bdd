// clearOutputOnRun is opt-in: by default the output channel keeps earlier runs' output.

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { WindowSettings } from '../../../src/settings';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeConfig(values: Record<string, unknown>): any {
  return { get: (key: string) => values[key] };
}

const WIN_DEFAULTS = { multiRootRunWorkspacesInParallel: true, xRay: false, verboseLogging: false, logEnvVarPresetContents: false };

suite('WindowSettings reads clearOutputOnRun', () => {

  test('defaults to false', () => {
    assert.strictEqual(new WindowSettings(makeConfig({ ...WIN_DEFAULTS, clearOutputOnRun: false })).clearOutputOnRun, false);
  });

  test('is false when the configuration has no value for it', () => {
    assert.strictEqual(new WindowSettings(makeConfig(WIN_DEFAULTS)).clearOutputOnRun, false);
  });

  test('reads true when explicitly set', () => {
    assert.strictEqual(new WindowSettings(makeConfig({ ...WIN_DEFAULTS, clearOutputOnRun: true })).clearOutputOnRun, true);
  });

  test('package.json contributes it as a window setting defaulting to false', () => {
    // out/test/test/unit/settings when compiled
    let pkgPath = path.resolve(__dirname, '../../../../../package.json');
    if (!fs.existsSync(pkgPath))
      pkgPath = path.resolve(__dirname, '../../../package.json');
    const prop = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).contributes.configuration.properties['gs-behave-bdd.clearOutputOnRun'];
    assert.ok(prop, 'gs-behave-bdd.clearOutputOnRun must be contributed');
    assert.strictEqual(prop.type, 'boolean');
    assert.strictEqual(prop.scope, 'window');
    assert.strictEqual(prop.default, false);
  });
});
