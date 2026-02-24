// Unit tests for fileParser module - reparseFile import resolution

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { FileParser } from '../../../src/parsers/fileParser';
import { WorkspaceSettings } from '../../../src/settings';
import * as commonModule from '../../../src/common';
import * as stepsMapModule from '../../../src/parsers/stepMappings';
import * as configModule from '../../../src/configuration';

suite('fileParser - reparseFile', () => {
  let fileParser: FileParser;
  let parseImportedLibrariesStub: sinon.SinonStub;
  let updateStepsStub: sinon.SinonStub;
  let isStepsFileStub: sinon.SinonStub;
  let isFeatureFileStub: sinon.SinonStub;
  let couldBePythonStepsFileStub: sinon.SinonStub;
  let getContentFromFilesystemStub: sinon.SinonStub;
  let rebuildStepMappingsStub: sinon.SinonStub;
  let findFilesStub: sinon.SinonStub;
  let getPythonExecutableStub: sinon.SinonStub;

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
    fileParser = new FileParser();

    // Stub the private methods
    parseImportedLibrariesStub = sinon.stub(
      fileParser as any,
      '_parseImportedLibraries'
    ).resolves();

    updateStepsStub = sinon.stub(
      fileParser as any,
      '_updateStepsFromStepsFileContent'
    ).resolves();

    // Stub common functions
    isStepsFileStub = sinon.stub(commonModule, 'isStepsFile').returns(false);
    isFeatureFileStub = sinon.stub(commonModule, 'isFeatureFile').returns(false);
    couldBePythonStepsFileStub = sinon.stub(commonModule, 'couldBePythonStepsFile').returns(true);
    getContentFromFilesystemStub = sinon.stub(commonModule, 'getContentFromFilesystem').resolves('from lib import helper\n');
    findFilesStub = sinon.stub(commonModule, 'findFiles').resolves([stepsFileUri]);

    // Stub rebuildStepMappings
    rebuildStepMappingsStub = sinon.stub(stepsMapModule, 'rebuildStepMappings');

    // Stub getPythonExecutable
    getPythonExecutableStub = sinon.stub(configModule.config, 'getPythonExecutable').resolves('python3');
  });

  teardown(() => {
    sinon.restore();
  });

  suite('reparseFile - import resolution', () => {
    test('should re-resolve imports for step files (in /steps/ folder)', async () => {
      // Configure stubs for step file (not library file)
      isStepsFileStub.withArgs(stepsFileUri).returns(true);

      const testData = new WeakMap();
      const ctrlStub = {} as vscode.TestController;

      // Call reparseFile for a step file
      await fileParser.reparseFile(stepsFileUri, 'from lib import helper\n', wkspSettings, testData, ctrlStub);

      // Verify _updateStepsFromStepsFileContent was called with isLibraryFile=false
      assert.ok(updateStepsStub.called, '_updateStepsFromStepsFileContent should be called');
      const updateCall = updateStepsStub.getCall(0);
      assert.strictEqual(updateCall.args[4], false, 'isLibraryFile should be false for step files');

      // Verify _parseImportedLibraries was called for step files
      assert.ok(parseImportedLibrariesStub.called, '_parseImportedLibraries should be called for step files');
    });

    test('should not re-resolve imports for library files (outside /steps/ folder)', async () => {
      // Configure stubs for library file (returns false for isStepsFile)
      isStepsFileStub.returns(false);

      const testData = new WeakMap();
      const ctrlStub = {} as vscode.TestController;

      // Call reparseFile for a library file
      await fileParser.reparseFile(libraryFileUri, 'def helper_function():\n    pass\n', wkspSettings, testData, ctrlStub);

      // Verify _updateStepsFromStepsFileContent was called with isLibraryFile=true
      assert.ok(updateStepsStub.called, '_updateStepsFromStepsFileContent should be called');
      const updateCall = updateStepsStub.getCall(0);
      assert.strictEqual(updateCall.args[4], true, 'isLibraryFile should be true for library files');

      // Verify _parseImportedLibraries was NOT called for library files
      assert.ok(!parseImportedLibrariesStub.called, '_parseImportedLibraries should NOT be called for library files');
    });
  });
});
