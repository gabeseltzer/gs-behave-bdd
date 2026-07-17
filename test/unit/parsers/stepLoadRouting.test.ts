// Unit tests for quiet-by-design step load error routing (popup only for
// environmental failures) and the per-file cache merge (a failed file keeps
// its previously cached step definitions while other files load fresh).
import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { FileParser } from '../../../src/parsers/fileParser';
import { WorkspaceSettings } from '../../../src/settings';
import * as commonModule from '../../../src/common';
import * as stepsMapModule from '../../../src/parsers/stepMappings';
import * as configModule from '../../../src/configuration';
import * as behaveLoaderModule from '../../../src/parsers/behaveLoader';
import * as adapterModule from '../../../src/parsers/stepsParserBehaveAdapter';
import * as stepsParserModule from '../../../src/parsers/stepsParser';
import * as fixtureParserModule from '../../../src/parsers/fixtureParser';
import { uriId, sepr } from '../../../src/common';
import type { FailedFileInfo } from '../../../src/parsers/behaveLoader';

const wkspUri = vscode.Uri.file('c:/test-workspace');
const featuresUri = vscode.Uri.joinPath(wkspUri, 'features');
const stepsUri = vscode.Uri.joinPath(wkspUri, 'steps');
const stepsFileUri = vscode.Uri.joinPath(stepsUri, 'steps.py');

const wkspSettings = {
  uri: wkspUri,
  name: 'test',
  featuresUri: featuresUri,
  featuresUris: [featuresUri],
  stepsSearchUri: stepsUri,
  stepsSearchUris: [stepsUri],
  projectUri: wkspUri,
  getEffectiveEnvVars: () => ({}),
} as WorkspaceSettings;

function stubDiagnostics(sandbox: sinon.SinonSandbox): Map<string, vscode.Diagnostic[]> {
  const diagStore = new Map<string, vscode.Diagnostic[]>();
  sandbox.stub(configModule.config.diagnostics, 'get').callsFake(
    (uri: vscode.Uri) => diagStore.get(uri.toString()) || []);
  sandbox.stub(configModule.config.diagnostics, 'set').callsFake(
    (uriOrEntries: unknown, diags?: unknown) => {
      if (uriOrEntries instanceof vscode.Uri)
        diagStore.set(uriOrEntries.toString(), (diags as vscode.Diagnostic[]) || []);
    });
  return diagStore;
}

suite('step load error routing (popup policy)', () => {
  let fileParser: FileParser;
  let clock: sinon.SinonFakeTimers;
  let sandbox: sinon.SinonSandbox;
  let loadFromBehaveStub: sinon.SinonStub;
  let showWarningMessageStub: sinon.SinonStub;
  let deleteStepFileStepsStub: sinon.SinonStub;

  setup(() => {
    sandbox = sinon.createSandbox();
    clock = sandbox.useFakeTimers();
    fileParser = new FileParser();

    sandbox.stub(commonModule, 'isStepsFile').returns(true);
    sandbox.stub(commonModule, 'isFeatureFile').returns(false);
    sandbox.stub(commonModule, 'couldBePythonStepsFile').returns(true);
    sandbox.stub(commonModule, 'getContentFromFilesystem').resolves('');
    sandbox.stub(commonModule, 'findFiles').resolves([stepsFileUri]);

    sandbox.stub(stepsMapModule, 'rebuildStepMappings');
    loadFromBehaveStub = sandbox.stub(behaveLoaderModule, 'loadFromBehave').resolves({ steps: [], fixtures: [] });
    sandbox.stub(adapterModule, 'storeBehaveStepDefinitions').resolves(0);
    deleteStepFileStepsStub = sandbox.stub(stepsParserModule, 'deleteStepFileSteps');
    sandbox.stub(fixtureParserModule, 'deleteFixtures');
    stubDiagnostics(sandbox);

    sandbox.stub(configModule.config, 'getPythonExecutable').resolves('python3');
    sandbox.stub(configModule.config.logger, 'showError');
    sandbox.stub(configModule.config.logger, 'showWarn');
    sandbox.stub(configModule.config.logger, 'logInfo');
    sandbox.stub(configModule.config.logger, 'show');
    showWarningMessageStub = sandbox.stub(vscode.window, 'showWarningMessage').resolves(undefined);
  });

  teardown(() => {
    fileParser.dispose();
    sandbox.restore();
  });

  async function reparseAndTick() {
    const testData = new WeakMap();
    const ctrlStub = {} as vscode.TestController;
    await fileParser.reparseFile(stepsFileUri, 'content', wkspSettings, testData, ctrlStub);
    await clock.tickAsync(500);
  }

  test('code-shaped wholesale error: NO popup, old definitions kept, status notified', async () => {
    const errors: (string | undefined)[] = [];
    fileParser.onStepLoadError((err) => errors.push(err));
    loadFromBehaveStub.resolves({
      steps: [], fixtures: [],
      error: 'SyntaxError: invalid syntax (steps.py, line 4)', errorKind: 'code'
    });

    await reparseAndTick();

    assert.ok(showWarningMessageStub.notCalled,
      'a mid-edit syntax error must NOT popup - the status item and Problems pane carry it');
    assert.ok(deleteStepFileStepsStub.notCalled, 'old definitions must be kept');
    assert.strictEqual(errors.length, 1);
    assert.ok(errors[0]?.includes('SyntaxError'), 'status item still gets the error');
  });

  test('environmental wholesale error: popup shown', async () => {
    loadFromBehaveStub.resolves({
      steps: [], fixtures: [],
      error: 'behave is broken in this interpreter', errorKind: 'environmental'
    });

    await reparseAndTick();

    assert.ok(showWarningMessageStub.calledOnce, 'environmental errors keep the popup');
  });

  test('thrown (spawn/timeout) error: popup shown', async () => {
    loadFromBehaveStub.rejects(new Error('Python process timeout after 10 seconds'));

    await reparseAndTick();

    assert.ok(showWarningMessageStub.calledOnce, 'unrecoverable spawn errors keep the popup');
  });

  test('per-file failures: NO popup, onStepLoadError receives the failed files', async () => {
    const notifications: { err: string | undefined, failed: FailedFileInfo[] | undefined }[] = [];
    fileParser.onStepLoadError((err, failed) => notifications.push({ err, failed }));

    const failedFile: FailedFileInfo = {
      filePath: stepsFileUri.fsPath, lineNumber: 3, column: 0,
      errorMessage: "'(' was never closed", kind: 'syntax'
    };
    loadFromBehaveStub.resolves({ steps: [], fixtures: [], failedFiles: [failedFile] });

    await reparseAndTick();

    assert.ok(showWarningMessageStub.notCalled, 'per-file failures must not popup');
    assert.strictEqual(notifications.length, 1);
    assert.strictEqual(notifications[0].err, undefined, 'not a wholesale error');
    assert.strictEqual(notifications[0].failed?.length, 1);
    assert.strictEqual(notifications[0].failed?.[0].kind, 'syntax');
  });

  test('clean load after failures: onStepLoadError clears (undefined, undefined)', async () => {
    const notifications: { err: string | undefined, failed: FailedFileInfo[] | undefined }[] = [];
    fileParser.onStepLoadError((err, failed) => notifications.push({ err, failed }));

    loadFromBehaveStub.resolves({ steps: [], fixtures: [] });

    await reparseAndTick();

    assert.strictEqual(notifications.length, 1);
    assert.strictEqual(notifications[0].err, undefined);
    assert.strictEqual(notifications[0].failed, undefined);
  });
});


suite('per-file cache merge (failed files keep cached definitions)', () => {
  // Real timers + real stepsParser/fixtureParser/adapter stores: the merge
  // behavior under test is the interaction between them.
  let fileParser: FileParser;
  let sandbox: sinon.SinonSandbox;
  let loadFromBehaveStub: sinon.SinonStub;

  const goodFileUri = vscode.Uri.joinPath(stepsUri, 'good.py');
  const brokenFileUri = vscode.Uri.joinPath(stepsUri, 'broken.py');
  const envFileUri = vscode.Uri.joinPath(wkspUri, 'environment.py');

  function makeCachedStep(fileUri: vscode.Uri, pattern: string): stepsParserModule.StepFileStep {
    const reKey = `${uriId(featuresUri)}${sepr}^given${sepr}${pattern}$`;
    return new stepsParserModule.StepFileStep(reKey, fileUri, 'x.py', 'given', pattern);
  }

  function makeCachedFixture(fileUri: vscode.Uri, name: string): fixtureParserModule.Fixture {
    const key = `${uriId(featuresUri)}${sepr}fixture.${name}`;
    return new fixtureParserModule.Fixture(key, fileUri, 'environment.py', name, new vscode.Range(0, 0, 0, 0));
  }

  function failedFileFor(fileUri: vscode.Uri, kind: 'syntax' | 'import' | 'error' = 'syntax'): FailedFileInfo {
    return { filePath: fileUri.fsPath, lineNumber: 1, column: 0, errorMessage: 'x', kind };
  }

  setup(() => {
    sandbox = sinon.createSandbox();
    fileParser = new FileParser();

    sandbox.stub(commonModule, 'isStepsFile').returns(true);
    sandbox.stub(commonModule, 'isFeatureFile').returns(false);
    sandbox.stub(commonModule, 'couldBePythonStepsFile').returns(true);
    sandbox.stub(commonModule, 'getContentFromFilesystem').resolves('');
    sandbox.stub(commonModule, 'findFiles').resolves([goodFileUri, brokenFileUri]);

    sandbox.stub(stepsMapModule, 'rebuildStepMappings');
    loadFromBehaveStub = sandbox.stub(behaveLoaderModule, 'loadFromBehave');
    stubDiagnostics(sandbox);

    sandbox.stub(configModule.config, 'getPythonExecutable').resolves('python3');
    sandbox.stub(configModule.config.logger, 'showError');
    sandbox.stub(configModule.config.logger, 'showWarn');
    sandbox.stub(configModule.config.logger, 'logInfo');
    sandbox.stub(configModule.config.logger, 'show');
    sandbox.stub(vscode.window, 'showWarningMessage').resolves(undefined);
  });

  teardown(() => {
    stepsParserModule.deleteStepFileSteps(featuresUri);
    fixtureParserModule.deleteFixtures(featuresUri);
    fileParser.dispose();
    sandbox.restore();
  });

  async function reparseAndWait() {
    const testData = new WeakMap();
    const ctrlStub = {} as vscode.TestController;
    await fileParser.reparseFile(stepsFileUri, 'content', wkspSettings, testData, ctrlStub);
    // real debounce timer (500ms) + async store work
    await new Promise(r => setTimeout(r, 800));
  }

  test('cached steps of a failed file survive; other files get fresh definitions', async function () {
    this.timeout(5000);

    // Seed the cache as if a previous clean load had stored both files' steps
    stepsParserModule.storeStepFileStep(featuresUri, makeCachedStep(brokenFileUri, 'a cached broken-file step'));
    stepsParserModule.storeStepFileStep(featuresUri, makeCachedStep(goodFileUri, 'an old good-file step'));

    // New load: good.py has NEW steps, broken.py failed
    loadFromBehaveStub.resolves({
      steps: [{ stepType: 'given', pattern: 'a fresh good-file step', filePath: goodFileUri.fsPath, lineNumber: 1, regex: 'a fresh good-file step' }],
      fixtures: [],
      failedFiles: [failedFileFor(brokenFileUri)],
    });

    await reparseAndWait();

    const stored = stepsParserModule.getStepFileSteps(featuresUri).map(([, s]) => s);
    const patterns = stored.map(s => s.textAsRe).sort();

    assert.ok(patterns.includes('a cached broken-file step'),
      `broken.py's cached step must survive the reload (got: ${patterns})`);
    assert.ok(patterns.includes('a fresh good-file step'),
      `good.py's fresh step must be stored (got: ${patterns})`);
    assert.ok(!patterns.includes('an old good-file step'),
      `good.py's stale step must be replaced, not merged (got: ${patterns})`);
  });

  test('on a pattern-key collision, the fresh definition wins over the cached one', async function () {
    this.timeout(5000);

    // Cached: broken.py defined "a contested step" in the previous load
    stepsParserModule.storeStepFileStep(featuresUri, makeCachedStep(brokenFileUri, 'a contested step'));

    // Fresh: good.py now defines the same pattern; broken.py failed
    loadFromBehaveStub.resolves({
      steps: [{ stepType: 'given', pattern: 'a contested step', filePath: goodFileUri.fsPath, lineNumber: 1, regex: 'a contested step' }],
      fixtures: [],
      failedFiles: [failedFileFor(brokenFileUri)],
    });

    await reparseAndWait();

    const stored = stepsParserModule.getStepFileSteps(featuresUri).map(([, s]) => s);
    const contested = stored.filter(s => s.textAsRe === 'a contested step');
    assert.strictEqual(contested.length, 1, 'the colliding key must resolve to a single definition');
    assert.strictEqual(contested[0].uri.fsPath, goodFileUri.fsPath,
      'the definition from the file that currently loads must win');
  });

  test('cached fixtures of a failed environment.py survive', async function () {
    this.timeout(5000);

    fixtureParserModule.restoreFixtures([makeCachedFixture(envFileUri, 'browser_setup')]);

    loadFromBehaveStub.resolves({
      steps: [],
      fixtures: [],
      failedFiles: [failedFileFor(envFileUri, 'error')],
    });

    await reparseAndWait();

    const fixtures = fixtureParserModule.getFixtures(featuresUri);
    assert.strictEqual(fixtures.length, 1, 'the failed environment.py must keep its cached fixture');
    assert.strictEqual(fixtures[0].name, 'browser_setup');
  });

  test('a file absent from failedFiles loses its cached steps when it no longer defines them', async function () {
    this.timeout(5000);

    stepsParserModule.storeStepFileStep(featuresUri, makeCachedStep(goodFileUri, 'a deleted step'));

    // Clean load: good.py loads fine but no longer defines the step
    loadFromBehaveStub.resolves({ steps: [], fixtures: [] });

    await reparseAndWait();

    const stored = stepsParserModule.getStepFileSteps(featuresUri);
    assert.strictEqual(stored.length, 0, 'steps removed from a healthy file must not linger via the cache');
  });

  test('cached LIBRARY steps survive when their importing step file fails', async function () {
    this.timeout(5000);

    // The step-library shape: steps live in lib/library_steps.py, pulled in by
    // broken.py via "from lib.library_steps import *". behave attributes them
    // to the lib file, so when broken.py fails, the lib steps vanish from fresh
    // results even though the lib file is in neither failed nor loaded lists.
    const libFileUri = vscode.Uri.joinPath(wkspUri, 'lib', 'library_steps.py');
    stepsParserModule.storeStepFileStep(featuresUri, makeCachedStep(libFileUri, 'a library step'));

    loadFromBehaveStub.resolves({
      steps: [{ stepType: 'given', pattern: 'a fresh step', filePath: goodFileUri.fsPath, lineNumber: 1, regex: 'a fresh step' }],
      fixtures: [],
      failedFiles: [failedFileFor(brokenFileUri)],
      loadedFiles: [goodFileUri.fsPath],  // lib file is NOT here - never executed directly
    });

    await reparseAndWait();

    const stored = stepsParserModule.getStepFileSteps(featuresUri).map(([, s]) => s);
    const patterns = stored.map(s => s.textAsRe).sort();
    assert.ok(patterns.includes('a library step'),
      `library-attributed steps must survive their importer's failure (got: ${patterns})`);
    assert.ok(patterns.includes('a fresh step'), `fresh steps stored too (got: ${patterns})`);
  });

  test('a LOADED file that dropped its steps is replaced even while another file fails', async function () {
    this.timeout(5000);

    stepsParserModule.storeStepFileStep(featuresUri, makeCachedStep(goodFileUri, 'a genuinely deleted step'));

    // good.py loaded successfully but no longer defines any steps; broken.py failed
    loadFromBehaveStub.resolves({
      steps: [],
      fixtures: [],
      failedFiles: [failedFileFor(brokenFileUri)],
      loadedFiles: [goodFileUri.fsPath],
    });

    await reparseAndWait();

    const stored = stepsParserModule.getStepFileSteps(featuresUri).map(([, s]) => s);
    assert.ok(!stored.some(s => s.textAsRe === 'a genuinely deleted step'),
      'a successfully loaded file with no steps must not resurrect cached ones');
  });
});
