// Tests for behaveStepLoader with nested featuresPath (e.g. subproject/features)
// Verifies that get_steps.py adds the behave project directory to sys.path
// so that modules living alongside the features directory can be imported.

import * as assert from 'assert';
import { execFile } from 'child_process';
import * as path from 'path';
import { getStepsScriptPath } from '../../../src/parsers/behaveStepLoader';
import { getBundledBehavePath } from '../../../src/bundledBehave';

interface GetStepsResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  steps: { step_type: string; pattern: string }[];
}

// __dirname at runtime is out/test/test/unit/parsers/ — go up 5 levels to repo root
const fixtureRoot = path.resolve(__dirname, '..', '..', '..', '..', '..', 'test', 'unit',
  'parsers', 'fixtures', 'nested-behave-project');

function runGetSteps(
  projectPath: string,
  stepsPaths: string[],
  callback: (result: GetStepsResult) => void
): void {
  const scriptPath = path.resolve(getStepsScriptPath());
  const stepsPathsJson = JSON.stringify(stepsPaths);
  const bundledLibsPath = getBundledBehavePath();

  execFile('python', [scriptPath, projectPath, stepsPathsJson, '--bundled-libs', bundledLibsPath],
    (error, stdout, stderr) => {
      const exitCode = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
      let steps: { step_type: string; pattern: string }[] = [];
      if (!error && stdout.trim()) {
        try {
          steps = JSON.parse(stdout.trim());
        } catch { /* leave empty */ }
      }
      callback({ exitCode, stdout, stderr, steps });
    });
}

suite('behaveStepLoader nested project', () => {

  // When featuresPath puts features in a subdirectory, the Python script must
  // add the parent of features/ to sys.path so sibling modules are importable.
  test('should load steps when features are in a subdirectory with importable sibling modules', function (done) {
    this.timeout(15000);

    // projectPath = workspace root (not the behave project dir)
    const projectPath = fixtureRoot;
    const stepsPath = path.join(fixtureRoot, 'subproject', 'features', 'steps');

    runGetSteps(projectPath, [stepsPath], (result) => {
      assert.strictEqual(result.exitCode, 0,
        `Python script failed.\nstderr: ${result.stderr}`);

      assert.ok(Array.isArray(result.steps), 'output should be a JSON array');
      assert.ok(result.steps.length > 0, 'should discover at least one step definition');

      const nestedStep = result.steps.find(s => s.pattern.includes('nested library is loaded'));
      assert.ok(nestedStep, 'should find "the nested library is loaded" step');
      assert.strictEqual(nestedStep.step_type, 'given');
      done();
    });
  });

  // Normal case: projectPath points directly to the behave project dir
  test('should still work when projectPath is the behave project directory', function (done) {
    this.timeout(15000);

    const projectPath = path.join(fixtureRoot, 'subproject');
    const stepsPath = path.join(fixtureRoot, 'subproject', 'features', 'steps');

    runGetSteps(projectPath, [stepsPath], (result) => {
      assert.strictEqual(result.exitCode, 0,
        `Python script failed.\nstderr: ${result.stderr}`);
      assert.ok(result.steps.length > 0, 'should discover at least one step definition');
      done();
    });
  });

  // environment.py loading should not produce warnings about failed imports
  test('should load environment.py without errors when features are in a subdirectory', function (done) {
    this.timeout(15000);

    const projectPath = fixtureRoot;
    const stepsPath = path.join(fixtureRoot, 'subproject', 'features', 'steps');

    runGetSteps(projectPath, [stepsPath], (result) => {
      assert.ok(!result.stderr.includes('Failed to load environment.py'),
        `environment.py failed to load (sibling module not found in nested layout).\nstderr: ${result.stderr}`);
      assert.strictEqual(result.exitCode, 0,
        `Python script failed.\nstderr: ${result.stderr}`);
      done();
    });
  });

  // No stderr warnings at all from the nested layout
  test('should produce no stderr warnings when loading steps from a nested subdirectory', function (done) {
    this.timeout(15000);

    const projectPath = fixtureRoot;
    const stepsPath = path.join(fixtureRoot, 'subproject', 'features', 'steps');

    runGetSteps(projectPath, [stepsPath], (result) => {
      assert.strictEqual(result.exitCode, 0,
        `Python script failed.\nstderr: ${result.stderr}`);
      assert.strictEqual(result.stderr, '',
        `Unexpected warnings on stderr when loading from nested directory.\nstderr: ${result.stderr}`);
      done();
    });
  });

});
