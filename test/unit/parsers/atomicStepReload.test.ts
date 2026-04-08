// Unit tests for atomic step reload behavior:
// When behave fails (e.g. duplicate step definitions), old step definitions should be preserved
// rather than being wiped and leaving all feature file steps unmatched.

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
import * as dupDiagModule from '../../../src/handlers/duplicateStepDiagnostics';


suite('atomic step reload - reparseFile (debounced Python path)', () => {
  let fileParser: FileParser;
  let clock: sinon.SinonFakeTimers;
  let loadFromBehaveStub: sinon.SinonStub;
  let storeBehaveStepDefinitionsStub: sinon.SinonStub;
  let deleteStepFileStepsStub: sinon.SinonStub;
  let deleteFixturesStub: sinon.SinonStub;
  let rebuildStepMappingsStub: sinon.SinonStub;

  const wkspUri = vscode.Uri.file('c:/test-workspace');
  const featuresUri = vscode.Uri.joinPath(wkspUri, 'features');
  const stepsUri = vscode.Uri.joinPath(wkspUri, 'steps');
  const stepsFileUri = vscode.Uri.joinPath(stepsUri, 'steps.py');

  const wkspSettings = {
    uri: wkspUri,
    name: 'test',
    featuresUri: featuresUri,
    stepsSearchUri: stepsUri,
    projectUri: wkspUri,
  } as WorkspaceSettings;

  setup(() => {
    clock = sinon.useFakeTimers();
    fileParser = new FileParser();

    sinon.stub(commonModule, 'isStepsFile').returns(true);
    sinon.stub(commonModule, 'isFeatureFile').returns(false);
    sinon.stub(commonModule, 'couldBePythonStepsFile').returns(true);
    sinon.stub(commonModule, 'getContentFromFilesystem').resolves('');
    sinon.stub(commonModule, 'findFiles').resolves([stepsFileUri]);

    rebuildStepMappingsStub = sinon.stub(stepsMapModule, 'rebuildStepMappings');
    loadFromBehaveStub = sinon.stub(behaveLoaderModule, 'loadFromBehave').resolves({ steps: [], fixtures: [] });
    storeBehaveStepDefinitionsStub = sinon.stub(adapterModule, 'storeBehaveStepDefinitions').resolves(0);
    deleteStepFileStepsStub = sinon.stub(stepsParserModule, 'deleteStepFileSteps');
    deleteFixturesStub = sinon.stub(fixtureParserModule, 'deleteFixtures');

    sinon.stub(configModule.config, 'getPythonExecutable').resolves('python3');
    sinon.stub(configModule.config.logger, 'showError');
    sinon.stub(configModule.config.logger, 'showWarn');
    sinon.stub(configModule.config.logger, 'logInfo');
    sinon.stub(configModule.config.logger, 'show');
  });

  teardown(() => {
    fileParser.dispose();
    clock.restore();
    sinon.restore();
  });

  test('on success, old steps are deleted before new ones are stored', async () => {
    loadFromBehaveStub.resolves({
      steps: [{ stepType: 'given', pattern: 'a step', filePath: 'steps.py', lineNumber: 1, regex: 'a step' }],
      fixtures: [],
    });

    const testData = new WeakMap();
    const ctrlStub = {} as vscode.TestController;

    await fileParser.reparseFile(stepsFileUri, '', wkspSettings, testData, ctrlStub);
    await clock.tickAsync(500);

    assert.ok(deleteStepFileStepsStub.calledOnce, 'deleteStepFileSteps should be called on success');
    assert.ok(deleteFixturesStub.calledOnce, 'deleteFixtures should be called on success');
    assert.ok(storeBehaveStepDefinitionsStub.calledOnce, 'storeBehaveStepDefinitions should be called');

    // Verify order: delete happens before store
    assert.ok(deleteStepFileStepsStub.calledBefore(storeBehaveStepDefinitionsStub),
      'deleteStepFileSteps should be called before storeBehaveStepDefinitions');
  });

  test('on behave failure, old steps are NOT deleted', async () => {
    loadFromBehaveStub.rejects(new Error('AmbiguousStep: @given("a step") has already been defined'));

    const testData = new WeakMap();
    const ctrlStub = {} as vscode.TestController;

    await fileParser.reparseFile(stepsFileUri, '', wkspSettings, testData, ctrlStub);
    await clock.tickAsync(500);

    assert.strictEqual(deleteStepFileStepsStub.callCount, 0,
      'deleteStepFileSteps should NOT be called when behave fails');
    assert.strictEqual(deleteFixturesStub.callCount, 0,
      'deleteFixtures should NOT be called when behave fails');
    assert.strictEqual(storeBehaveStepDefinitionsStub.callCount, 0,
      'storeBehaveStepDefinitions should NOT be called when behave fails');
  });

  test('on behave failure, step mappings are still rebuilt (using preserved old steps)', async () => {
    loadFromBehaveStub.rejects(new Error('Import error in step files'));

    const testData = new WeakMap();
    const ctrlStub = {} as vscode.TestController;

    await fileParser.reparseFile(stepsFileUri, '', wkspSettings, testData, ctrlStub);
    await clock.tickAsync(500);

    assert.ok(rebuildStepMappingsStub.calledOnce,
      'rebuildStepMappings should still be called so preserved steps remain matched');
  });

  test('on behave failure, onStepMappingsRebuilt callback still fires', async () => {
    loadFromBehaveStub.rejects(new Error('duplicate step'));

    const testData = new WeakMap();
    const ctrlStub = {} as vscode.TestController;
    let callbackFired = false;
    fileParser.onStepMappingsRebuilt = () => { callbackFired = true; };

    await fileParser.reparseFile(stepsFileUri, '', wkspSettings, testData, ctrlStub);
    await clock.tickAsync(500);

    assert.ok(callbackFired, 'onStepMappingsRebuilt should fire even on failure');
  });

  test('after a failure, a subsequent success replaces the old steps', async () => {
    const testData = new WeakMap();
    const ctrlStub = {} as vscode.TestController;

    // First call: behave fails
    loadFromBehaveStub.rejects(new Error('duplicate step definition'));
    await fileParser.reparseFile(stepsFileUri, '', wkspSettings, testData, ctrlStub);
    await clock.tickAsync(500);

    assert.strictEqual(deleteStepFileStepsStub.callCount, 0, 'no delete on failure');

    // Second call: behave succeeds
    loadFromBehaveStub.resolves({ steps: [], fixtures: [] });
    await fileParser.reparseFile(stepsFileUri, '', wkspSettings, testData, ctrlStub);
    await clock.tickAsync(500);

    assert.strictEqual(deleteStepFileStepsStub.callCount, 1,
      'delete should be called on subsequent success');
    assert.strictEqual(storeBehaveStepDefinitionsStub.callCount, 1,
      'store should be called on subsequent success');
  });
});


suite('step load error notification', () => {
  let fileParser: FileParser;
  let clock: sinon.SinonFakeTimers;
  let loadFromBehaveStub: sinon.SinonStub;

  const wkspUri = vscode.Uri.file('c:/test-workspace');
  const featuresUri = vscode.Uri.joinPath(wkspUri, 'features');
  const stepsUri = vscode.Uri.joinPath(wkspUri, 'steps');
  const stepsFileUri = vscode.Uri.joinPath(stepsUri, 'steps.py');

  const wkspSettings = {
    uri: wkspUri,
    name: 'test',
    featuresUri: featuresUri,
    stepsSearchUri: stepsUri,
    projectUri: wkspUri,
  } as WorkspaceSettings;

  setup(() => {
    clock = sinon.useFakeTimers();
    fileParser = new FileParser();

    sinon.stub(commonModule, 'isStepsFile').returns(true);
    sinon.stub(commonModule, 'isFeatureFile').returns(false);
    sinon.stub(commonModule, 'couldBePythonStepsFile').returns(true);
    sinon.stub(commonModule, 'getContentFromFilesystem').resolves('');
    sinon.stub(commonModule, 'findFiles').resolves([stepsFileUri]);

    sinon.stub(stepsMapModule, 'rebuildStepMappings');
    loadFromBehaveStub = sinon.stub(behaveLoaderModule, 'loadFromBehave').resolves({ steps: [], fixtures: [] });
    sinon.stub(adapterModule, 'storeBehaveStepDefinitions').resolves(0);
    sinon.stub(stepsParserModule, 'deleteStepFileSteps');
    sinon.stub(fixtureParserModule, 'deleteFixtures');

    sinon.stub(configModule.config, 'getPythonExecutable').resolves('python3');
    sinon.stub(configModule.config.logger, 'showError');
    sinon.stub(configModule.config.logger, 'showWarn');
    sinon.stub(configModule.config.logger, 'logInfo');
    sinon.stub(configModule.config.logger, 'show');
  });

  teardown(() => {
    fileParser.dispose();
    clock.restore();
    sinon.restore();
  });

  test('on behave failure, onStepLoadError fires with error message', async () => {
    const errorMsg = 'AmbiguousStep: @given("a step") has already been defined';
    loadFromBehaveStub.rejects(new Error(errorMsg));

    const errors: (string | undefined)[] = [];
    fileParser.onStepLoadError((err) => errors.push(err));

    const testData = new WeakMap();
    const ctrlStub = {} as vscode.TestController;

    await fileParser.reparseFile(stepsFileUri, '', wkspSettings, testData, ctrlStub);
    await clock.tickAsync(500);

    assert.strictEqual(errors.length, 1, 'onStepLoadError should fire once');
    assert.ok(errors[0]?.includes('AmbiguousStep'), 'error message should contain the behave error');
  });

  test('on behave success, onStepLoadError fires with undefined to clear error', async () => {
    loadFromBehaveStub.resolves({ steps: [], fixtures: [] });

    const errors: (string | undefined)[] = [];
    fileParser.onStepLoadError((err) => errors.push(err));

    const testData = new WeakMap();
    const ctrlStub = {} as vscode.TestController;

    await fileParser.reparseFile(stepsFileUri, '', wkspSettings, testData, ctrlStub);
    await clock.tickAsync(500);

    assert.strictEqual(errors.length, 1, 'onStepLoadError should fire once');
    assert.strictEqual(errors[0], undefined, 'should clear error on success');
  });

  test('on failure then success, error is set then cleared', async () => {
    const errors: (string | undefined)[] = [];
    fileParser.onStepLoadError((err) => errors.push(err));

    const testData = new WeakMap();
    const ctrlStub = {} as vscode.TestController;

    // First: failure
    loadFromBehaveStub.rejects(new Error('duplicate step'));
    await fileParser.reparseFile(stepsFileUri, '', wkspSettings, testData, ctrlStub);
    await clock.tickAsync(500);

    // Second: success
    loadFromBehaveStub.resolves({ steps: [], fixtures: [] });
    await fileParser.reparseFile(stepsFileUri, '', wkspSettings, testData, ctrlStub);
    await clock.tickAsync(500);

    assert.strictEqual(errors.length, 2, 'onStepLoadError should fire twice');
    assert.ok(typeof errors[0] === 'string', 'first call should have error message');
    assert.strictEqual(errors[1], undefined, 'second call should clear error');
  });

  test('on behave failure, warning message is shown with "Show Output" action', async () => {
    const showWarnStub = sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);
    loadFromBehaveStub.rejects(new Error('Import error in step files'));

    const testData = new WeakMap();
    const ctrlStub = {} as vscode.TestController;

    await fileParser.reparseFile(stepsFileUri, '', wkspSettings, testData, ctrlStub);
    await clock.tickAsync(500);

    assert.ok(showWarnStub.called, 'showWarningMessage should be called');
    const args = showWarnStub.firstCall.args;
    assert.ok(args[0].includes('Failed to load step definitions'),
      'warning should describe the failure');
    assert.strictEqual(args[1], 'Show Output',
      'warning should offer "Show Output" action');
  });

  test('on behave failure, error details are logged to output channel', async () => {
    const logInfoStub = configModule.config.logger.logInfo as sinon.SinonStub;
    loadFromBehaveStub.rejects(new Error('Python process exited with code 1: duplicate step'));

    const testData = new WeakMap();
    const ctrlStub = {} as vscode.TestController;

    await fileParser.reparseFile(stepsFileUri, '', wkspSettings, testData, ctrlStub);
    await clock.tickAsync(500);

    assert.ok(logInfoStub.called, 'logInfo should be called to log to output channel');
    const loggedText = logInfoStub.getCalls().map((c: sinon.SinonSpyCall) => c.args[0] as string).join('\n');
    assert.ok(loggedText.includes('duplicate step'),
      'output channel should contain the error details');
  });

  test('clicking "Show Output" opens the output channel', async () => {
    // Simulate user clicking "Show Output"
    const showWarnStub = sinon.stub(vscode.window, 'showWarningMessage').resolves('Show Output' as unknown as vscode.MessageItem);
    const showStub = configModule.config.logger.show as sinon.SinonStub;
    loadFromBehaveStub.rejects(new Error('some error'));

    const testData = new WeakMap();
    const ctrlStub = {} as vscode.TestController;

    await fileParser.reparseFile(stepsFileUri, '', wkspSettings, testData, ctrlStub);
    await clock.tickAsync(500);

    // Allow the .then() callback on showWarningMessage to execute
    await clock.tickAsync(0);

    assert.ok(showWarnStub.called, 'showWarningMessage should be called');
    assert.ok(showStub.called, 'logger.show should be called when user clicks "Show Output"');
    assert.strictEqual(showStub.firstCall.args[0].path, wkspUri.path,
      'logger.show should receive the workspace URI');
  });

  test('dismissing the warning does NOT open the output channel', async () => {
    // Simulate user dismissing the warning (undefined = dismissed)
    sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);
    const showStub = configModule.config.logger.show as sinon.SinonStub;
    loadFromBehaveStub.rejects(new Error('some error'));

    const testData = new WeakMap();
    const ctrlStub = {} as vscode.TestController;

    await fileParser.reparseFile(stepsFileUri, '', wkspSettings, testData, ctrlStub);
    await clock.tickAsync(500);
    await clock.tickAsync(0);

    assert.ok(!showStub.called, 'logger.show should NOT be called when warning is dismissed');
  });

  test('multiple onStepLoadError handlers all receive notifications', async () => {
    loadFromBehaveStub.rejects(new Error('test error'));

    const handler1Calls: (string | undefined)[] = [];
    const handler2Calls: (string | undefined)[] = [];
    fileParser.onStepLoadError((err) => handler1Calls.push(err));
    fileParser.onStepLoadError((err) => handler2Calls.push(err));

    const testData = new WeakMap();
    const ctrlStub = {} as vscode.TestController;

    await fileParser.reparseFile(stepsFileUri, '', wkspSettings, testData, ctrlStub);
    await clock.tickAsync(500);

    assert.strictEqual(handler1Calls.length, 1, 'handler 1 should receive notification');
    assert.strictEqual(handler2Calls.length, 1, 'handler 2 should receive notification');
    assert.ok(handler1Calls[0]?.includes('test error'));
    assert.ok(handler2Calls[0]?.includes('test error'));
  });

  test('long error messages are truncated in warning but full in output channel', async () => {
    const longError = 'X'.repeat(600);
    const showWarnStub = sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);
    const logInfoStub = configModule.config.logger.logInfo as sinon.SinonStub;
    loadFromBehaveStub.rejects(new Error(longError));

    const testData = new WeakMap();
    const ctrlStub = {} as vscode.TestController;

    await fileParser.reparseFile(stepsFileUri, '', wkspSettings, testData, ctrlStub);
    await clock.tickAsync(500);

    // Warning message should be truncated
    const warnText = showWarnStub.firstCall.args[0] as string;
    assert.ok(warnText.length <= 516, `warning text should be truncated (got ${warnText.length})`);  // 512 + "..."
    assert.ok(warnText.endsWith('...'), 'truncated warning should end with "..."');

    // Output channel should have the full error
    const logText = logInfoStub.getCalls().map((c: sinon.SinonSpyCall) => c.args[0] as string).join('\n');
    assert.ok(logText.includes(longError), 'output channel should contain the full error');
  });

  test('on behave success after error, no warning is shown', async () => {
    const showWarnStub = sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);
    loadFromBehaveStub.resolves({ steps: [], fixtures: [] });

    const testData = new WeakMap();
    const ctrlStub = {} as vscode.TestController;

    await fileParser.reparseFile(stepsFileUri, '', wkspSettings, testData, ctrlStub);
    await clock.tickAsync(500);

    assert.ok(!showWarnStub.called, 'showWarningMessage should NOT be called on success');
  });
});


suite('duplicate step diagnostics integration (via reparseFile)', () => {
  let fileParser: FileParser;
  let clock: sinon.SinonFakeTimers;
  let loadFromBehaveStub: sinon.SinonStub;
  let setDupDiagStub: sinon.SinonStub;
  let clearDupDiagStub: sinon.SinonStub;
  let deleteStepFileStepsStub: sinon.SinonStub;

  const wkspUri = vscode.Uri.file('c:/test-workspace');
  const featuresUri = vscode.Uri.joinPath(wkspUri, 'features');
  const stepsUri = vscode.Uri.joinPath(wkspUri, 'steps');
  const stepsFileUri = vscode.Uri.joinPath(stepsUri, 'steps.py');

  const wkspSettings = {
    uri: wkspUri,
    name: 'test',
    featuresUri: featuresUri,
    stepsSearchUri: stepsUri,
    projectUri: wkspUri,
  } as WorkspaceSettings;

  setup(() => {
    clock = sinon.useFakeTimers();
    fileParser = new FileParser();

    sinon.stub(commonModule, 'isStepsFile').returns(true);
    sinon.stub(commonModule, 'isFeatureFile').returns(false);
    sinon.stub(commonModule, 'couldBePythonStepsFile').returns(true);
    sinon.stub(commonModule, 'getContentFromFilesystem').resolves('');
    sinon.stub(commonModule, 'findFiles').resolves([stepsFileUri]);

    sinon.stub(stepsMapModule, 'rebuildStepMappings');
    loadFromBehaveStub = sinon.stub(behaveLoaderModule, 'loadFromBehave').resolves({ steps: [], fixtures: [] });
    sinon.stub(adapterModule, 'storeBehaveStepDefinitions').resolves(0);
    deleteStepFileStepsStub = sinon.stub(stepsParserModule, 'deleteStepFileSteps');
    sinon.stub(fixtureParserModule, 'deleteFixtures');

    setDupDiagStub = sinon.stub(dupDiagModule, 'setDuplicateStepDiagnostics');
    clearDupDiagStub = sinon.stub(dupDiagModule, 'clearDuplicateStepDiagnostics');

    sinon.stub(configModule.config, 'getPythonExecutable').resolves('python3');
    sinon.stub(configModule.config.logger, 'showError');
    sinon.stub(configModule.config.logger, 'showWarn');
    sinon.stub(configModule.config.logger, 'logInfo');
    sinon.stub(configModule.config.logger, 'show');
  });

  teardown(() => {
    fileParser.dispose();
    clock.restore();
    sinon.restore();
  });

  test('when loadFromBehave returns error with duplicates, setDuplicateStepDiagnostics is called', async () => {
    const duplicates = [
      { stepType: 'given', pattern: 'a step', filePath: '/proj/steps/a.py', lineNumber: 5 },
      { stepType: 'given', pattern: 'a step', filePath: '/proj/steps/b.py', lineNumber: 10 },
    ];
    loadFromBehaveStub.resolves({
      steps: [], fixtures: [],
      error: 'AmbiguousStep: duplicate step',
      duplicates,
    });

    const testData = new WeakMap();
    const ctrlStub = {} as vscode.TestController;

    await fileParser.reparseFile(stepsFileUri, '', wkspSettings, testData, ctrlStub);
    await clock.tickAsync(500);

    assert.ok(setDupDiagStub.calledOnce, 'setDuplicateStepDiagnostics should be called');
    assert.deepStrictEqual(setDupDiagStub.firstCall.args[0], duplicates,
      'should pass the duplicate info from the result');
  });

  test('when loadFromBehave returns error with duplicates, old steps are NOT deleted', async () => {
    loadFromBehaveStub.resolves({
      steps: [], fixtures: [],
      error: 'AmbiguousStep: duplicate step',
      duplicates: [
        { stepType: 'given', pattern: 'a step', filePath: '/proj/steps/a.py', lineNumber: 5 },
        { stepType: 'given', pattern: 'a step', filePath: '/proj/steps/b.py', lineNumber: 10 },
      ],
    });

    const testData = new WeakMap();
    const ctrlStub = {} as vscode.TestController;

    await fileParser.reparseFile(stepsFileUri, '', wkspSettings, testData, ctrlStub);
    await clock.tickAsync(500);

    assert.strictEqual(deleteStepFileStepsStub.callCount, 0,
      'old steps should be preserved when error+duplicates are returned');
  });

  test('when loadFromBehave returns error WITHOUT duplicates, setDuplicateStepDiagnostics is NOT called', async () => {
    loadFromBehaveStub.resolves({
      steps: [], fixtures: [],
      error: 'ImportError: some module not found',
    });

    const testData = new WeakMap();
    const ctrlStub = {} as vscode.TestController;

    await fileParser.reparseFile(stepsFileUri, '', wkspSettings, testData, ctrlStub);
    await clock.tickAsync(500);

    assert.strictEqual(setDupDiagStub.callCount, 0,
      'should not set duplicate diagnostics for non-duplicate errors');
  });

  test('when loadFromBehave succeeds, duplicate diagnostics are cleared', async () => {
    loadFromBehaveStub.resolves({ steps: [], fixtures: [] });

    const testData = new WeakMap();
    const ctrlStub = {} as vscode.TestController;

    await fileParser.reparseFile(stepsFileUri, '', wkspSettings, testData, ctrlStub);
    await clock.tickAsync(500);

    assert.ok(clearDupDiagStub.called, 'clearDuplicateStepDiagnostics should be called on success');
  });

  test('error then success: duplicates set then cleared', async () => {
    const testData = new WeakMap();
    const ctrlStub = {} as vscode.TestController;

    // First: error with duplicates
    loadFromBehaveStub.resolves({
      steps: [], fixtures: [],
      error: 'AmbiguousStep',
      duplicates: [
        { stepType: 'given', pattern: 'x', filePath: '/a.py', lineNumber: 1 },
        { stepType: 'given', pattern: 'x', filePath: '/b.py', lineNumber: 1 },
      ],
    });
    await fileParser.reparseFile(stepsFileUri, '', wkspSettings, testData, ctrlStub);
    await clock.tickAsync(500);

    assert.ok(setDupDiagStub.calledOnce, 'duplicates should be set');

    // Second: success
    loadFromBehaveStub.resolves({ steps: [], fixtures: [] });
    await fileParser.reparseFile(stepsFileUri, '', wkspSettings, testData, ctrlStub);
    await clock.tickAsync(500);

    assert.ok(clearDupDiagStub.called, 'duplicates should be cleared on success');
  });

  test('onStepLoadError fires when loadFromBehave returns error in result', async () => {
    const errors: (string | undefined)[] = [];
    fileParser.onStepLoadError((err) => errors.push(err));

    loadFromBehaveStub.resolves({
      steps: [], fixtures: [],
      error: 'AmbiguousStep: @given("a step") has already been defined',
    });

    const testData = new WeakMap();
    const ctrlStub = {} as vscode.TestController;

    await fileParser.reparseFile(stepsFileUri, '', wkspSettings, testData, ctrlStub);
    await clock.tickAsync(500);

    assert.strictEqual(errors.length, 1);
    assert.ok(errors[0]?.includes('AmbiguousStep'));
  });
});


suite('stderr logging to output channel (via reparseFile)', () => {
  let fileParser: FileParser;
  let clock: sinon.SinonFakeTimers;
  let loadFromBehaveStub: sinon.SinonStub;
  let logInfoStub: sinon.SinonStub;

  const wkspUri = vscode.Uri.file('c:/test-workspace');
  const featuresUri = vscode.Uri.joinPath(wkspUri, 'features');
  const stepsUri = vscode.Uri.joinPath(wkspUri, 'steps');
  const stepsFileUri = vscode.Uri.joinPath(stepsUri, 'steps.py');

  const wkspSettings = {
    uri: wkspUri,
    name: 'test',
    featuresUri: featuresUri,
    stepsSearchUri: stepsUri,
    projectUri: wkspUri,
  } as WorkspaceSettings;

  setup(() => {
    clock = sinon.useFakeTimers();
    fileParser = new FileParser();

    sinon.stub(commonModule, 'isStepsFile').returns(true);
    sinon.stub(commonModule, 'isFeatureFile').returns(false);
    sinon.stub(commonModule, 'couldBePythonStepsFile').returns(true);
    sinon.stub(commonModule, 'getContentFromFilesystem').resolves('');
    sinon.stub(commonModule, 'findFiles').resolves([stepsFileUri]);

    sinon.stub(stepsMapModule, 'rebuildStepMappings');
    loadFromBehaveStub = sinon.stub(behaveLoaderModule, 'loadFromBehave').resolves({ steps: [], fixtures: [] });
    sinon.stub(adapterModule, 'storeBehaveStepDefinitions').resolves(0);
    sinon.stub(stepsParserModule, 'deleteStepFileSteps');
    sinon.stub(fixtureParserModule, 'deleteFixtures');
    sinon.stub(dupDiagModule, 'setDuplicateStepDiagnostics');
    sinon.stub(dupDiagModule, 'clearDuplicateStepDiagnostics');

    sinon.stub(configModule.config, 'getPythonExecutable').resolves('python3');
    sinon.stub(configModule.config.logger, 'showError');
    sinon.stub(configModule.config.logger, 'showWarn');
    logInfoStub = sinon.stub(configModule.config.logger, 'logInfo');
    sinon.stub(configModule.config.logger, 'show');
  });

  teardown(() => {
    fileParser.dispose();
    clock.restore();
    sinon.restore();
  });

  test('stderr from behave is logged to the output channel on success', async () => {
    loadFromBehaveStub.resolves({
      steps: [], fixtures: [],
      stderr: 'UserWarning: some deprecation warning from a step file',
    });

    const testData = new WeakMap();
    const ctrlStub = {} as vscode.TestController;

    await fileParser.reparseFile(stepsFileUri, '', wkspSettings, testData, ctrlStub);
    await clock.tickAsync(500);

    const stderrLogCall = logInfoStub.getCalls().find(
      (c: sinon.SinonSpyCall) => (c.args[0] as string).includes('behave stderr output')
    );
    assert.ok(stderrLogCall, 'logInfo should be called with stderr output');
    assert.ok((stderrLogCall.args[0] as string).includes('UserWarning'),
      'the full stderr content should be in the log');
  });

  test('stderr from behave is logged to the output channel on error', async () => {
    loadFromBehaveStub.resolves({
      steps: [], fixtures: [],
      error: 'Failed to load steps',
      stderr: 'Traceback (most recent call last):\n  File "steps.py", line 5\nAmbiguousStep: duplicate',
    });

    const testData = new WeakMap();
    const ctrlStub = {} as vscode.TestController;

    await fileParser.reparseFile(stepsFileUri, '', wkspSettings, testData, ctrlStub);
    await clock.tickAsync(500);

    const stderrLogCall = logInfoStub.getCalls().find(
      (c: sinon.SinonSpyCall) => (c.args[0] as string).includes('behave stderr output')
    );
    assert.ok(stderrLogCall, 'logInfo should log stderr even when there is an error');
    assert.ok((stderrLogCall.args[0] as string).includes('Traceback'),
      'the full traceback should be in the log');
  });

  test('no stderr logging when stderr is empty', async () => {
    loadFromBehaveStub.resolves({ steps: [], fixtures: [] });

    const testData = new WeakMap();
    const ctrlStub = {} as vscode.TestController;

    await fileParser.reparseFile(stepsFileUri, '', wkspSettings, testData, ctrlStub);
    await clock.tickAsync(500);

    const stderrLogCall = logInfoStub.getCalls().find(
      (c: sinon.SinonSpyCall) => (c.args[0] as string).includes('behave stderr output')
    );
    assert.ok(!stderrLogCall, 'logInfo should NOT log stderr when it is empty/undefined');
  });

  test('no stderr logging when stderr is undefined', async () => {
    loadFromBehaveStub.resolves({ steps: [], fixtures: [], stderr: undefined });

    const testData = new WeakMap();
    const ctrlStub = {} as vscode.TestController;

    await fileParser.reparseFile(stepsFileUri, '', wkspSettings, testData, ctrlStub);
    await clock.tickAsync(500);

    const stderrLogCall = logInfoStub.getCalls().find(
      (c: sinon.SinonSpyCall) => (c.args[0] as string).includes('behave stderr output')
    );
    assert.ok(!stderrLogCall, 'logInfo should NOT log stderr when it is undefined');
  });
});
