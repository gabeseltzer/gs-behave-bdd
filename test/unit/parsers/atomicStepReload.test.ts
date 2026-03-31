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
