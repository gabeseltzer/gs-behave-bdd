import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { getBundledBehavePath, BUNDLED_BEHAVE_VERSION } from '../../src/bundledBehave';

suite('bundledBehave', () => {

  test('getBundledBehavePath returns a path containing bundled/libs', () => {
    const behavePath = getBundledBehavePath();
    assert.ok(behavePath.includes(path.join('bundled', 'libs')),
      `Expected path to contain 'bundled/libs' but got: ${behavePath}`);
  });

  test('getBundledBehavePath returns an existing directory', () => {
    const behavePath = getBundledBehavePath();
    assert.ok(fs.existsSync(behavePath),
      `Expected bundled libs directory to exist at: ${behavePath}`);
  });

  test('bundled libs contains behave package', () => {
    const behavePath = getBundledBehavePath();
    const behavePackage = path.join(behavePath, 'behave');
    assert.ok(fs.existsSync(behavePackage),
      `Expected behave package at: ${behavePackage}`);
  });

  test('BUNDLED_BEHAVE_VERSION is 1.3.3', () => {
    assert.strictEqual(BUNDLED_BEHAVE_VERSION, '1.3.3');
  });
});
