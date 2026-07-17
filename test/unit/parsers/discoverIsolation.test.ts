// End-to-end tests for discover.py's quiet-degradation behavior:
// - per-file load isolation (one broken file doesn't block the others)
// - ast.parse syntax pre-flight (precise line/col, kind "syntax")
// - missing-import stubbing (uninstalled libraries don't block parsing at all)
// These spawn a real Python process with the bundled behave.
import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execFileSync } from 'child_process';

interface RawFailedFile { file: string; line: number; col: number; error: string; kind: string; traceback?: string }
interface RawStep { step_type: string; pattern: string; file: string; line: number; regex_pattern: string }
interface RawFixture { function_name: string; file: string; decorator_line: number; def_line: number }
interface DiscoverOutput {
  steps: RawStep[];
  fixtures: RawFixture[];
  error?: string;
  error_kind?: string;
  failed_files?: RawFailedFile[];
  loaded_files?: string[];
  mocked_modules?: string[];
  duplicates?: { step_type: string; pattern: string; file: string; line: number }[];
  diagnostics?: { python_executable: string; sys_path: string[] };
}

function findProjectRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'src', 'python', 'discover.py')))
      return dir;
    dir = path.dirname(dir);
  }
  throw new Error('Could not find project root containing src/python/discover.py');
}

function runDiscover(projectPath: string, stepsDirs: string[], extraPythonPath?: string): DiscoverOutput {
  const root = findProjectRoot();
  const discoverPath = path.join(root, 'src', 'python', 'discover.py');
  const bundledLibs = path.join(root, 'bundled', 'libs');

  const env = extraPythonPath
    ? { ...process.env, PYTHONPATH: extraPythonPath }
    : process.env;
  const output = execFileSync('python',
    [discoverPath, projectPath, JSON.stringify(stepsDirs), '--bundled-libs', bundledLibs],
    { encoding: 'utf-8', timeout: 20000, env });

  return JSON.parse(output.trim());
}

suite('discover.py - per-file isolation and import stubbing', function () {
  // Each test spawns a Python interpreter; allow headroom over the mocha default
  this.timeout(30000);

  let tmpDir: string;
  let stepsDir: string;

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behave-vsc-iso-test-'));
    stepsDir = path.join(tmpDir, 'features', 'steps');
    fs.mkdirSync(stepsDir, { recursive: true });
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('a syntax-broken file only loses its own steps (kind "syntax", precise line)', () => {
    fs.writeFileSync(path.join(stepsDir, 'good.py'), [
      'from behave import given',
      '',
      '@given("a working step")',
      'def step_good(context):',
      '    pass',
    ].join('\n'));

    fs.writeFileSync(path.join(stepsDir, 'broken.py'), [
      'from behave import given',
      '',
      '@given("a broken step"',   // <-- unclosed paren, line 3
      'def step_broken(context):',
      '    pass',
    ].join('\n'));

    const result = runDiscover(tmpDir, [stepsDir]);

    assert.strictEqual(result.error, undefined, 'no wholesale error');
    assert.ok(result.steps.some(s => s.pattern === 'a working step'),
      'steps from the healthy file should still load');
    assert.ok(!result.steps.some(s => path.basename(s.file) === 'broken.py'),
      'no steps should be reported from the broken file');

    assert.strictEqual(result.failed_files?.length, 1);
    const failure = result.failed_files![0];
    assert.strictEqual(path.basename(failure.file), 'broken.py');
    assert.strictEqual(failure.kind, 'syntax');
    assert.strictEqual(failure.line, 3, 'syntax pre-flight reports the precise line');

    // loaded_files accompanies failures so the extension can tell real deletions
    // from collateral damage of a failed importer
    const loadedNames = (result.loaded_files ?? []).map(f => path.basename(f));
    assert.ok(loadedNames.includes('good.py'), `loaded_files should list good.py (got: ${loadedNames})`);
    assert.ok(!loadedNames.includes('broken.py'), 'a failed file must not appear in loaded_files');
  });

  test('an uninstalled import used inside step bodies does not block parsing (mocked_modules)', () => {
    fs.writeFileSync(path.join(stepsDir, 'plotting.py'), [
      'from behave import then',
      'import matplotlib_definitely_not_installed',
      'from matplotlib_definitely_not_installed import pyplot as plt',
      '',
      '@then("I plot the result")',
      'def step_plot(context):',
      '    plt.figure()',
    ].join('\n'));

    const result = runDiscover(tmpDir, [stepsDir]);

    assert.strictEqual(result.error, undefined);
    assert.strictEqual(result.failed_files, undefined, 'the file should load fully via stubs');
    assert.ok(result.steps.some(s => s.pattern === 'I plot the result'),
      'the step should register even though its import is not installed');
    assert.ok(result.mocked_modules?.includes('matplotlib_definitely_not_installed'),
      `mocked_modules should name the stubbed import (got: ${JSON.stringify(result.mocked_modules)})`);
  });

  test('a stubbed third-party decorator passes the real function through (correct location)', () => {
    fs.writeFileSync(path.join(stepsDir, 'decorated.py'), [
      'from behave import when',
      'import fake_retry_lib',
      '',
      '@when("I retry the operation")',      // line 4
      '@fake_retry_lib.retry(times=3)',
      'def step_retry(context):',
      '    pass',
    ].join('\n'));

    const result = runDiscover(tmpDir, [stepsDir]);

    const step = result.steps.find(s => s.pattern === 'I retry the operation');
    assert.ok(step, 'the decorated step should register');
    assert.strictEqual(path.basename(step!.file), 'decorated.py');
    assert.strictEqual(step!.line, 4, 'location should come from the real function, not a stub');
  });

  test('top-level computation against a stubbed module still loads (attribute-chain stubs)', () => {
    fs.writeFileSync(path.join(stepsDir, 'version_check.py'), [
      'from behave import then',
      'import some_missing_lib',
      '',
      'VERSION = tuple(int(x) for x in some_missing_lib.__version__.split("."))',
      '',
      '@then("a version-guarded step")',
      'def step_versioned(context):',
      '    pass',
    ].join('\n'));

    const result = runDiscover(tmpDir, [stepsDir]);

    assert.strictEqual(result.failed_files, undefined,
      `file should load via stubs (failed: ${JSON.stringify(result.failed_files)})`);
    assert.ok(result.steps.some(s => s.pattern === 'a version-guarded step'));
  });

  test('a file that raises at import still yields its literal steps (recovered from source)', () => {
    // The whole point of degraded discovery: a broken import (or any module-level
    // failure) must not cost a file its steps. behave cannot execute this file, but
    // its step patterns are plain string literals, so they are recovered via AST.
    fs.writeFileSync(path.join(stepsDir, 'partial.py'), [
      'from behave import given',
      '',
      '@given("first knowable step")',
      'def step_before(context):',
      '    pass',
      '',
      'raise RuntimeError("boom at import time")',    // line 7 - aborts exec
      '',
      '@given("second knowable step")',               // registered by behave? no - never reached
      'def step_after(context):',
      '    pass',
    ].join('\n'));

    fs.writeFileSync(path.join(stepsDir, 'healthy.py'), [
      'from behave import given',
      '',
      '@given("a healthy step")',
      'def step_healthy(context):',
      '    pass',
    ].join('\n'));

    const result = runDiscover(tmpDir, [stepsDir]);

    assert.ok(result.steps.some(s => s.pattern === 'a healthy step'), 'the healthy file loads normally');
    // Both steps recovered from source, INCLUDING the one after the raising line
    // that behave never reached - AST recovery does not depend on execution order.
    assert.ok(result.steps.some(s => s.pattern === 'first knowable step'),
      'a literal step before the failure is recovered');
    assert.ok(result.steps.some(s => s.pattern === 'second knowable step'),
      'a literal step after the failure is recovered too (AST, not execution)');
    const recovered = result.steps.find(s => s.pattern === 'first knowable step');
    assert.strictEqual(path.basename(recovered!.file), 'partial.py');
    assert.strictEqual(recovered!.line, 3, 'recovered step reports its real decorator line');

    // The file is still reported as failed so the user gets a diagnostic
    assert.strictEqual(result.failed_files?.length, 1);
    const failure = result.failed_files![0];
    assert.strictEqual(path.basename(failure.file), 'partial.py');
    assert.strictEqual(failure.kind, 'error');
    assert.ok(failure.error.includes('boom at import time'));
    // ...and the file appears in loaded_files so the extension uses the recovered
    // fresh steps rather than stale cache.
    assert.ok((result.loaded_files ?? []).some(f => path.basename(f) === 'partial.py') ||
      result.steps.some(s => path.basename(s.file) === 'partial.py'),
      'recovered steps are present as fresh results');
  });

  test('a stubbed pattern step is skipped but its file keeps every valid step', () => {
    // Regression for the reported bug: one step whose name comes from a missing
    // import must not cost the file its other, perfectly valid steps.
    fs.writeFileSync(path.join(stepsDir, 'mixed.py'), [
      'from behave import given, when',
      'import missing_sensor_lib',
      '',
      '@given("valid step one")',
      'def s1(context):',
      '    pass',
      '@given("valid step two")',
      'def s2(context):',
      '    pass',
      '@when(missing_sensor_lib.SENSOR_STEP)',   // garbage pattern from a stub
      'def s3(context):',
      '    pass',
    ].join('\n'));

    const result = runDiscover(tmpDir, [stepsDir]);

    assert.ok(result.steps.some(s => s.pattern === 'valid step one'), 'valid step one kept');
    assert.ok(result.steps.some(s => s.pattern === 'valid step two'), 'valid step two kept');
    assert.ok(!result.steps.some(s => typeof s.pattern !== 'string' || s.pattern.includes('stub')),
      'the garbage stub-pattern step is not surfaced');
    const failure = result.failed_files?.find(f => path.basename(f.file) === 'mixed.py');
    assert.ok(failure, 'the file is flagged so the user learns about the missing import');
    assert.ok(/missing_sensor_lib/.test(failure!.error), `names the missing module (got: ${failure!.error})`);
  });

  test('duplicate step definitions: first file loads, second fails with duplicates reported', () => {
    fs.writeFileSync(path.join(stepsDir, 'a_first.py'), [
      'from behave import given',
      '',
      '@given("a duplicated step")',
      'def step_first(context):',
      '    pass',
    ].join('\n'));

    fs.writeFileSync(path.join(stepsDir, 'b_second.py'), [
      'from behave import given',
      '',
      '@given("a duplicated step")',
      'def step_second(context):',
      '    pass',
    ].join('\n'));

    const result = runDiscover(tmpDir, [stepsDir]);

    assert.ok(result.steps.some(s => s.pattern === 'a duplicated step' && path.basename(s.file) === 'a_first.py'),
      'the first definition should load');
    assert.strictEqual(result.failed_files?.length, 1);
    assert.strictEqual(path.basename(result.failed_files![0].file), 'b_second.py');
    assert.ok(result.duplicates && result.duplicates.length >= 2,
      'duplicates should be reported so the duplicate-step diagnostics still work');
  });

  test('a syntax-broken environment.py is a per-file failure, steps still load', () => {
    fs.writeFileSync(path.join(tmpDir, 'features', 'environment.py'), [
      'def before_all(context',    // <-- unclosed paren
      '    pass',
    ].join('\n'));

    fs.writeFileSync(path.join(stepsDir, 'good.py'), [
      'from behave import given',
      '',
      '@given("a step beside a broken environment")',
      'def step_good(context):',
      '    pass',
    ].join('\n'));

    const result = runDiscover(tmpDir, [stepsDir]);

    assert.strictEqual(result.error, undefined, 'a broken environment.py must not be fatal');
    assert.ok(result.steps.some(s => s.pattern === 'a step beside a broken environment'));
    assert.strictEqual(result.failed_files?.length, 1);
    assert.strictEqual(path.basename(result.failed_files![0].file), 'environment.py');
    assert.strictEqual(result.failed_files![0].kind, 'syntax');
  });

  test('a stubbed import used as a step PATTERN is reported as a failed import, not a garbage step', () => {
    // Regression: `from lib.camera_helpers import PATH` where lib is not importable,
    // then `@when(PATH)`. The stub must NOT register a "<stub>" step or blow up with a
    // cryptic "TypeError: expected string or bytes-like object" - it must be a clear,
    // named import failure, and other files must still load.
    fs.writeFileSync(path.join(stepsDir, 'camera_steps.py'), [
      'from lib.camera_helpers import SNAPSHOT_PATH, take_photo',
      '',
      '@when(SNAPSHOT_PATH)',
      'def step_take_photo(context):',
      '    take_photo(context)',
    ].join('\n'));
    fs.writeFileSync(path.join(stepsDir, 'good.py'), [
      'from behave import given',
      '',
      '@given("a healthy step")',
      'def step_good(context):',
      '    pass',
    ].join('\n'));

    const result = runDiscover(tmpDir, [stepsDir]);

    assert.strictEqual(result.error, undefined, 'must not be a wholesale error');
    assert.ok(result.steps.some(s => s.pattern === 'a healthy step'),
      'the healthy file must still load');
    assert.ok(!result.steps.some(s => typeof s.pattern !== 'string' || s.pattern.includes('stub')),
      `no garbage stub step may be reported (got: ${JSON.stringify(result.steps.map(s => s.pattern))})`);

    const failure = result.failed_files?.find(f => path.basename(f.file) === 'camera_steps.py');
    assert.ok(failure, 'camera_steps.py must be reported as failed');
    assert.strictEqual(failure!.kind, 'import');
    assert.ok(/lib\.camera_helpers|'lib'/.test(failure!.error),
      `failure should name the missing module (got: ${failure!.error})`);
  });

  test('a TRANSITIVE missing import (via a real local helper) is named in the failure', () => {
    // lib.camera_helpers IS importable, but it imports a missing 3rd-party module
    // and derives the step-pattern constant from it. The failure must name the
    // transitive module (cv2), which a scan of the step file's own imports can't see.
    fs.mkdirSync(path.join(tmpDir, 'lib'));
    fs.writeFileSync(path.join(tmpDir, 'lib', '__init__.py'), '');
    fs.writeFileSync(path.join(tmpDir, 'lib', 'camera_helpers.py'), [
      'import cv2_not_installed_xyz',
      'SNAPSHOT_PATH = cv2_not_installed_xyz.DEFAULT_PATH',
      'def take_photo(context):',
      '    pass',
    ].join('\n'));
    fs.writeFileSync(path.join(stepsDir, 'camera_steps.py'), [
      'from lib.camera_helpers import SNAPSHOT_PATH, take_photo',
      '',
      '@when(SNAPSHOT_PATH)',
      'def step_take_photo(context):',
      '    take_photo(context)',
    ].join('\n'));

    const result = runDiscover(tmpDir, [stepsDir]);

    const failure = result.failed_files?.find(f => path.basename(f.file) === 'camera_steps.py');
    assert.ok(failure, 'camera_steps.py must be reported as failed');
    assert.ok(failure!.error.includes('cv2_not_installed_xyz'),
      `failure should name the TRANSITIVE missing module (got: ${failure!.error})`);
    // the transitive-only missing module must not linger as a "stubbed OK" hint
    assert.ok(!(result.mocked_modules ?? []).includes('cv2_not_installed_xyz'),
      'a module that only broke a failed file should be pruned from mocked_modules');
  });

  test('on failure, emits diagnostics (interpreter + sys.path) and a full traceback', () => {
    fs.writeFileSync(path.join(stepsDir, 'broken_import.py'), [
      'from behave import given',
      'import totally_absent_pkg_xyz',
      'BAD = int(totally_absent_pkg_xyz.VERSION)',   // raises at import
      '@given("a recoverable step")',
      'def s(context):',
      '    pass',
    ].join('\n'));

    const result = runDiscover(tmpDir, [stepsDir]);

    assert.ok(result.diagnostics, 'diagnostics should be present when something fails');
    assert.ok(result.diagnostics!.python_executable.length > 0, 'names the interpreter used');
    assert.ok(Array.isArray(result.diagnostics!.sys_path) && result.diagnostics!.sys_path.length > 0,
      'includes the effective sys.path so the user can compare to a working behave run');

    const failure = result.failed_files?.find(f => path.basename(f.file) === 'broken_import.py');
    assert.ok(failure, 'the broken file is reported');
    assert.ok(failure!.traceback && failure!.traceback.includes('totally_absent_pkg_xyz'),
      'the full traceback names the real culprit module');
    // and its step is still recovered
    assert.ok(result.steps.some(s => s.pattern === 'a recoverable step'));
  });

  test('fixtures are recovered from an environment.py that fails to load', () => {
    // Parallel to step recovery: a missing import that raises at module load in
    // environment.py must not hide its @fixture functions.
    const featuresDir = path.join(tmpDir, 'features');
    fs.mkdirSync(featuresDir, { recursive: true });
    fs.writeFileSync(path.join(featuresDir, 'environment.py'), [
      'from behave import fixture',
      'import missing_env_lib',
      'CFG = int(missing_env_lib.VERSION)',   // raises at import
      '',
      '@fixture',                             // line 5
      'def browser(context):',               // line 6
      '    yield "b"',
      '',
      '@fixture(name="db")',                 // line 9
      'def database(context):',              // line 10
      '    yield "d"',
    ].join('\n'));
    // environment.py lives beside features/, and steps under features/steps
    const nestedSteps = path.join(featuresDir, 'steps');
    fs.mkdirSync(nestedSteps, { recursive: true });
    fs.writeFileSync(path.join(nestedSteps, 's.py'), [
      'from behave import given',
      '@given("a step")',
      'def s(context):',
      '    pass',
    ].join('\n'));

    const result = runDiscover(tmpDir, [nestedSteps]);

    const names = result.fixtures.map(f => f.function_name).sort();
    assert.deepStrictEqual(names, ['browser', 'database'],
      `both fixtures should be recovered (got: ${JSON.stringify(names)})`);
    const browser = result.fixtures.find(f => f.function_name === 'browser');
    assert.strictEqual(browser!.decorator_line, 5, 'decorator line recovered');
    assert.strictEqual(browser!.def_line, 6, 'def line recovered');

    assert.ok(result.failed_files?.some(f => path.basename(f.file) === 'environment.py'),
      'environment.py is still reported as failed');
    assert.ok(result.steps.some(s => s.pattern === 'a step'), 'steps still load');
  });

  test('healthy project omits diagnostics (only attached on failure)', () => {
    fs.writeFileSync(path.join(stepsDir, 'clean.py'), [
      'from behave import given',
      '@given("a clean step")',
      'def s(context):',
      '    pass',
    ].join('\n'));

    const result = runDiscover(tmpDir, [stepsDir]);
    assert.strictEqual(result.diagnostics, undefined, 'no diagnostics noise on the happy path');
  });

  test('a third-party library\'s missing OPTIONAL dependency is NOT stubbed (installed packages keep working)', () => {
    // Regression for the reported bug: an installed package (like requests) broke
    // because a dependency (urllib3) does `try: import zstandard / except
    // ImportError` and then uses it - stubbing zstandard defeated that graceful
    // fallback. Stubs must never be handed to imports from third-party code.
    const sitePkgs = path.join(tmpDir, '.venv', 'lib', 'python3.10', 'site-packages');
    fs.mkdirSync(path.join(sitePkgs, 'faketransport'), { recursive: true });
    fs.writeFileSync(path.join(sitePkgs, 'faketransport', '__init__.py'), [
      'import re',
      'try:',
      '    import optional_zstd_dep as _z',   // NOT installed
      '    HAS = True',
      'except ImportError:',
      '    _z = None',
      '    HAS = False',
      'if HAS:',
      '    VER = re.search(r"(\\d+)", _z.__version__)',   // would blow up on a stub
      'def get():',
      '    return "ok"',
    ].join('\n'));

    fs.writeFileSync(path.join(stepsDir, 'net_steps.py'), [
      'from behave import given',
      'import faketransport',
      '@given("a network step")',
      'def s(context):',
      '    faketransport.get()',
    ].join('\n'));
    // a genuinely-missing module in USER code must still be stubbed
    fs.writeFileSync(path.join(stepsDir, 'hw_steps.py'), [
      'from behave import given',
      'import my_missing_hardware_lib',
      '@given("a hardware step")',
      'def s(context):',
      '    my_missing_hardware_lib.go()',
    ].join('\n'));

    const result = runDiscover(tmpDir, [stepsDir], sitePkgs);

    assert.ok(result.steps.some(s => s.pattern === 'a network step'),
      'a step whose import chain optionally imports a missing dep must load');
    assert.ok((result.failed_files ?? []).length === 0,
      `nothing should fail (got: ${JSON.stringify(result.failed_files)})`);
    // the third-party optional dep must NOT appear as mocked...
    assert.ok(!(result.mocked_modules ?? []).includes('optional_zstd_dep'),
      'a third-party optional dependency must never be stubbed');
    // ...but the user's own genuinely-missing module still is
    assert.ok((result.mocked_modules ?? []).includes('my_missing_hardware_lib'),
      'a module missing from USER code is still stubbed');
    assert.ok(result.steps.some(s => s.pattern === 'a hardware step'));
  });

  test('fully healthy project: no failed_files, no mocked_modules keys', () => {
    fs.writeFileSync(path.join(stepsDir, 'clean.py'), [
      'from behave import given, when, then',
      '',
      '@given("a clean step")',
      'def step_clean(context):',
      '    pass',
    ].join('\n'));

    const result = runDiscover(tmpDir, [stepsDir]);

    assert.strictEqual(result.error, undefined);
    assert.strictEqual(result.failed_files, undefined);
    assert.strictEqual(result.loaded_files, undefined, 'loaded_files only accompanies failures');
    assert.strictEqual(result.mocked_modules, undefined);
    assert.strictEqual(result.steps.length, 1);
  });
});
