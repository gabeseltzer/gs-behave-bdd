// Unit tests for fileParser module - reparseFile with behave loader

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

suite('fileParser - initialStepsParseComplete', () => {
  test('should return false initially', () => {
    const parser = new FileParser();
    assert.strictEqual(parser.initialStepsParseComplete, false);
    parser.dispose();
  });
});

suite('fileParser - reparseFile', () => {
  let fileParser: FileParser;
  let clock: sinon.SinonFakeTimers;
  let isStepsFileStub: sinon.SinonStub;
  let _isFeatureFileStub: sinon.SinonStub;
  let _couldBePythonStepsFileStub: sinon.SinonStub;
  let _getContentFromFilesystemStub: sinon.SinonStub;
  let _rebuildStepMappingsStub: sinon.SinonStub;
  let _loadFromBehaveStub: sinon.SinonStub;
  let _storeBehaveStepDefinitionsStub: sinon.SinonStub;
  let _getPythonExecutableStub: sinon.SinonStub;

  const wkspUri = vscode.Uri.file('c:/test-workspace');
  const featuresUri = vscode.Uri.joinPath(wkspUri, 'features');
  const stepsUri = vscode.Uri.joinPath(wkspUri, 'steps');
  const stepsFileUri = vscode.Uri.joinPath(stepsUri, 'steps.py');
  const libraryFileUri = vscode.Uri.joinPath(wkspUri, 'lib', 'helper.py');

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

    // Stub common functions
    isStepsFileStub = sinon.stub(commonModule, 'isStepsFile').returns(false);
    _isFeatureFileStub = sinon.stub(commonModule, 'isFeatureFile').returns(false);
    _couldBePythonStepsFileStub = sinon.stub(commonModule, 'couldBePythonStepsFile').returns(true);
    _getContentFromFilesystemStub = sinon.stub(commonModule, 'getContentFromFilesystem').resolves('');

    // Stub rebuildStepMappings
    _rebuildStepMappingsStub = sinon.stub(stepsMapModule, 'rebuildStepMappings');

    // Stub behave loader functions
    _loadFromBehaveStub = sinon.stub(behaveLoaderModule, 'loadFromBehave').resolves({ steps: [], fixtures: [] });
    _storeBehaveStepDefinitionsStub = sinon.stub(adapterModule, 'storeBehaveStepDefinitions').resolves(0);

    // Stub getPythonExecutable
    _getPythonExecutableStub = sinon.stub(configModule.config, 'getPythonExecutable').resolves('python3');

    // Stub logger methods to prevent channel access errors
    sinon.stub(configModule.config.logger, 'showError');
    sinon.stub(configModule.config.logger, 'showWarn');
  });

  teardown(() => {
    fileParser.dispose();
    clock.restore();
    sinon.restore();
  });

  suite('reparseFile - behave-based step loading', () => {
    test('should reload all steps from behave when a step file changes', async () => {
      // Configure stubs for step file
      isStepsFileStub.withArgs(stepsFileUri).returns(true);

      const testData = new WeakMap();
      const ctrlStub = {} as vscode.TestController;

      // Call reparseFile for a step file (now debounced)
      await fileParser.reparseFile(stepsFileUri, '', wkspSettings, testData, ctrlStub);

      // Advance past debounce interval
      await clock.tickAsync(500);

      // Verify behave loader was called
      assert.ok(_loadFromBehaveStub.called, 'loadFromBehave should be called');

      // Verify that behave definitions were stored
      assert.ok(_storeBehaveStepDefinitionsStub.called, 'storeBehaveStepDefinitions should be called');

      // Verify that step mappings were rebuilt
      assert.ok(_rebuildStepMappingsStub.called, 'rebuildStepMappings should be called');
    });

    test('should reload all steps from behave when a library file changes', async () => {
      // Configure stubs for library file (returns false for isStepsFile)
      isStepsFileStub.returns(false);

      const testData = new WeakMap();
      const ctrlStub = {} as vscode.TestController;

      // Call reparseFile for a library file (now debounced)
      await fileParser.reparseFile(libraryFileUri, '', wkspSettings, testData, ctrlStub);

      // Advance past debounce interval
      await clock.tickAsync(500);

      // Verify behave loader was called (even for library files)
      assert.ok(_loadFromBehaveStub.called, 'loadFromBehave should be called for library files');

      // Verify that step mappings were rebuilt
      assert.ok(_rebuildStepMappingsStub.called, 'rebuildStepMappings should be called');
    });

    test('should handle behave loading errors gracefully', async () => {
      // Configure stubs for step file
      isStepsFileStub.withArgs(stepsFileUri).returns(true);

      // Make behave loader throw an error
      _loadFromBehaveStub.rejects(new Error('behave is not installed'));

      const testData = new WeakMap();
      const ctrlStub = {} as vscode.TestController;

      // Call reparseFile - should not throw (now debounced)
      await fileParser.reparseFile(stepsFileUri, '', wkspSettings, testData, ctrlStub);

      // Advance past debounce interval
      await clock.tickAsync(500);

      // Verify rebuildStepMappings was still called (resilience)
      assert.ok(_rebuildStepMappingsStub.called, 'rebuildStepMappings should still be called on error');
    });
  });
});
