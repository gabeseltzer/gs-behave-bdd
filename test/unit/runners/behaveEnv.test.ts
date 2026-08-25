import * as assert from 'assert';
import * as sinon from 'sinon';
import * as path from 'path';

suite('behaveEnv', () => {

  let originalPythonPath: string | undefined;

  // PYTHONPATH now carries a third entry: the directory holding the extension's
  // shipped Python helpers, appended LAST so it can never shadow a module the user's
  // project or environment provides. These tests therefore assert the ORDER of the
  // bundled path relative to the user's own entries, rather than that the string
  // ends with the bundled path.
  const pythonPathEntries = (env: { [k: string]: string | undefined }): string[] =>
    (env['PYTHONPATH'] ?? '').split(path.delimiter);

  const withoutHelpers = (env: { [k: string]: string | undefined }): string[] => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getPythonHelpersPath } = require('../../../src/bundledBehave');
    return pythonPathEntries(env).filter(e => e !== getPythonHelpersPath());
  };


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
    assert.deepStrictEqual(withoutHelpers(env), [bundledPath]);
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
    assert.deepStrictEqual(withoutHelpers(env), [bundledPath, '/existing/path'],
      'bundled must come FIRST for useBundled, so it wins over the environment');
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
    assert.deepStrictEqual(withoutHelpers(env), [bundledPath],
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
    assert.deepStrictEqual(withoutHelpers(env), ['/existing/path', bundledPath],
      'should append bundled path AFTER existing PYTHONPATH for fromEnvironment');
  });

  test('appends the shipped python helpers directory last', () => {
    process.env['PYTHONPATH'] = '/existing/path';

    for (const key of Object.keys(require.cache)) {
      if (key.includes('behaveEnv')) delete require.cache[key];
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getBehaveEnv } = require('../../../src/runners/behaveEnv');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getPythonHelpersPath } = require('../../../src/bundledBehave');

    const env = getBehaveEnv({ importStrategy: 'fromEnvironment', getEffectiveEnvVars: () => ({}) });

    // The NDJSON stream formatter is IMPORTED by behave (unlike discover.py, which is
    // spawned as a script), so its directory has to be importable.
    const entries = pythonPathEntries(env);
    assert.strictEqual(entries[entries.length - 1], getPythonHelpersPath(),
      `helpers dir should be last. Got: ${entries.join(', ')}`);
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
