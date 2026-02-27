import * as assert from 'assert';
import * as sinon from 'sinon';
import * as path from 'path';

suite('behaveEnv', () => {

  let originalPythonPath: string | undefined;

  setup(() => {
    originalPythonPath = process.env['PYTHONPATH'];
  });

  teardown(() => {
    sinon.restore();
    // Restore PYTHONPATH
    if (originalPythonPath === undefined)
      delete process.env['PYTHONPATH'];
    else
      process.env['PYTHONPATH'] = originalPythonPath;
  });

  test('includes bundled path in PYTHONPATH when importStrategy is useBundled', () => {
    delete process.env['PYTHONPATH'];

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getBehaveEnv } = require('../../../src/runners/behaveEnv');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getBundledBehavePath } = require('../../../src/bundledBehave');

    const mockSettings = {
      importStrategy: 'useBundled',
      getEffectiveEnvVars: () => ({})
    };

    const env = getBehaveEnv(mockSettings);
    const bundledPath = getBundledBehavePath();
    assert.strictEqual(env['PYTHONPATH'], bundledPath);
  });

  test('prepends bundled path to existing PYTHONPATH when importStrategy is useBundled', () => {
    process.env['PYTHONPATH'] = '/existing/path';

    // Clear require cache to pick up new env
    for (const key of Object.keys(require.cache)) {
      if (key.includes('behaveEnv')) delete require.cache[key];
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getBehaveEnv } = require('../../../src/runners/behaveEnv');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getBundledBehavePath } = require('../../../src/bundledBehave');

    const mockSettings = {
      importStrategy: 'useBundled',
      getEffectiveEnvVars: () => ({})
    };

    const env = getBehaveEnv(mockSettings);
    const bundledPath = getBundledBehavePath();
    assert.strictEqual(env['PYTHONPATH'], `${bundledPath}${path.delimiter}/existing/path`);
  });

  test('appends bundled path as fallback when importStrategy is fromEnvironment', () => {
    delete process.env['PYTHONPATH'];

    for (const key of Object.keys(require.cache)) {
      if (key.includes('behaveEnv')) delete require.cache[key];
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getBehaveEnv } = require('../../../src/runners/behaveEnv');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getBundledBehavePath } = require('../../../src/bundledBehave');

    const mockSettings = {
      importStrategy: 'fromEnvironment',
      getEffectiveEnvVars: () => ({})
    };

    const env = getBehaveEnv(mockSettings);
    const bundledPath = getBundledBehavePath();
    assert.strictEqual(env['PYTHONPATH'], bundledPath,
      'should set PYTHONPATH to bundled path (as fallback) even for fromEnvironment');
  });

  test('appends bundled path after existing PYTHONPATH when importStrategy is fromEnvironment', () => {
    process.env['PYTHONPATH'] = '/existing/path';

    for (const key of Object.keys(require.cache)) {
      if (key.includes('behaveEnv')) delete require.cache[key];
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getBehaveEnv } = require('../../../src/runners/behaveEnv');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getBundledBehavePath } = require('../../../src/bundledBehave');

    const mockSettings = {
      importStrategy: 'fromEnvironment',
      getEffectiveEnvVars: () => ({})
    };

    const env = getBehaveEnv(mockSettings);
    const bundledPath = getBundledBehavePath();
    assert.strictEqual(env['PYTHONPATH'], `/existing/path${path.delimiter}${bundledPath}`,
      'should append bundled path AFTER existing PYTHONPATH for fromEnvironment');
  });

  test('merges effective env vars into environment', () => {
    for (const key of Object.keys(require.cache)) {
      if (key.includes('behaveEnv')) delete require.cache[key];
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getBehaveEnv } = require('../../../src/runners/behaveEnv');

    const mockSettings = {
      importStrategy: 'fromEnvironment',
      getEffectiveEnvVars: () => ({ MY_VAR: 'hello' })
    };

    const env = getBehaveEnv(mockSettings);
    assert.strictEqual(env['MY_VAR'], 'hello');
  });
});
