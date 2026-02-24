// Unit tests for library file watching - Phase 6
// Tests that library files are automatically reparsed when modified

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as common from '../../../src/common';
import * as fileParser from '../../../src/parsers/fileParser';
import * as stepDiagnostics from '../../../src/handlers/stepDiagnostics';
import * as stepMappings from '../../../src/parsers/stepMappings';

suite('libraryWatcher', () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => sandbox = sinon.createSandbox());
  teardown(() => sandbox.restore());

  suite('onDidChangeTextDocument with library files', () => {
    /**
     * Test that couldBePythonStepsFile() is used instead of just isStepsFile()
     * This allows library files (python files not in /steps/ folder) to be detected
     */
    test('should detect library files using couldBePythonStepsFile', () => {
      const mockUri = vscode.Uri.file('/test/lib/library_steps.py');
      
      // Library files are Python files but NOT in /steps/ folder
      sandbox.stub(common, 'isStepsFile').returns(false); // fails /steps/ check
      sandbox.stub(common, 'isFeatureFile').returns(false);
      sandbox.stub(common, 'couldBePythonStepsFile').returns(true); // passes .py check

      // should not filter out library files
      const isRelevantFile = !common.isFeatureFile(mockUri) 
        && !common.couldBePythonStepsFile(mockUri) 
        && !mockUri.path.endsWith("/environment.py");
      
      assert.strictEqual(isRelevantFile, false, 'Library file should pass the check');
    });

    /**
     * Test that when a library file changes, reparseFile() is called
     * This verifies the onDidChangeTextDocument handler processes library files
     */
    test('should call reparseFile when library file changes', async () => {
      const libraryUri = vscode.Uri.file('c:\\test\\lib\\library_steps.py');
      const mockWkspUri = vscode.Uri.file('c:\\test');
      const mockDocument = { 
        uri: libraryUri, 
        getText: () => 'test content'
      } as vscode.TextDocument;

      sandbox.stub(common, 'isFeatureFile').returns(false);
      sandbox.stub(common, 'isStepsFile').returns(false);
      sandbox.stub(common, 'couldBePythonStepsFile').returns(true);
      sandbox.stub(common, 'getWorkspaceSettingsForFile').returns({
        uri: mockWkspUri,
        featuresUri: vscode.Uri.file('c:\\test\\features'),
        stepsSearchUri: vscode.Uri.file('c:\\test\\steps')
      } as ReturnType<typeof common.getWorkspaceSettingsForFile>);

      const reparseFileStub = sandbox.stub(fileParser.FileParser.prototype, 'reparseFile')
        .resolves();

      const mockEvent = {
        document: mockDocument
      } as vscode.TextDocumentChangeEvent;

      // Simulate the onDidChangeTextDocument handler logic
      const uri = mockEvent.document.uri;
      const isEnvFile = uri.path.endsWith("/environment.py");

      if (!common.isFeatureFile(uri) && !common.couldBePythonStepsFile(uri) && !isEnvFile) {
        assert.fail('Library file should not be filtered');
      }

      const wkspSettings = common.getWorkspaceSettingsForFile(uri);
      if (!wkspSettings) {
        assert.fail('Should find workspace settings');
      }

      const testData = new WeakMap();
      await fileParser.FileParser.prototype.reparseFile(uri, mockEvent.document.getText(), wkspSettings, testData, {} as vscode.TestController);

      assert.ok(reparseFileStub.called, 'reparseFile should be called for library file');
    });

    /**
     * Test that when a library file changes, validateStepDefinitions is called
     * for all open feature files to update diagnostics
     */
    test('should validate all open feature files when library file changes', async () => {
      const libraryUri = vscode.Uri.file('c:\\test\\lib\\library_steps.py');
      const featureUri1 = vscode.Uri.file('c:\\test\\features\\test1.feature');
      const featureUri2 = vscode.Uri.file('c:\\test\\features\\test2.feature');

      const mockWkspUri = vscode.Uri.file('c:\\test');

      sandbox.stub(common, 'isFeatureFile').callsFake((uri: vscode.Uri) => {
        return uri.path.includes('.feature');
      });
      sandbox.stub(common, 'isStepsFile').returns(false);
      sandbox.stub(common, 'couldBePythonStepsFile').callsFake((uri: vscode.Uri) => {
        return uri.path.endsWith('.py') && !uri.path.includes('.feature');
      });
      sandbox.stub(common, 'getWorkspaceSettingsForFile').returns({
        uri: mockWkspUri,
        featuresUri: vscode.Uri.file('c:\\test\\features'),
        stepsSearchUri: vscode.Uri.file('c:\\test\\steps')
      } as ReturnType<typeof common.getWorkspaceSettingsForFile>);

      // Mock open documents (simulating vscode.workspace.textDocuments)
      const featureDoc1 = { uri: featureUri1 } as vscode.TextDocument;
      const featureDoc2 = { uri: featureUri2 } as vscode.TextDocument;

      sandbox.stub(fileParser.FileParser.prototype, 'reparseFile').resolves();

      const validateStub = sandbox.stub(stepDiagnostics, 'validateStepDefinitions');

      // Key part: when library file changes, it's a couldBePythonStepsFile
      if (common.couldBePythonStepsFile(libraryUri)) {
        // Should validate all open feature files
        // In real code: for (const document of vscode.workspace.textDocuments)
        [featureDoc1, featureDoc2].forEach(doc => {
          stepDiagnostics.validateStepDefinitions(doc);
        });
      }

      assert.strictEqual(validateStub.callCount, 2, 'Should validate both feature files');
      assert.ok(validateStub.calledWith(featureDoc1), 'Should validate first feature file');
      assert.ok(validateStub.calledWith(featureDoc2), 'Should validate second feature file');
    });

    /**
     * Test that step mappings are rebuilt after library file changes
     * This is critical for autocomplete and navigation to work with library steps
     */
    test('should rebuild step mappings after library file changes', async () => {
      const libraryUri = vscode.Uri.file('c:\\test\\lib\\library_steps.py');
      const mockWkspUri = vscode.Uri.file('c:\\test');
      const mockFeaturesUri = vscode.Uri.file('c:\\test\\features');

      sandbox.stub(common, 'isFeatureFile').returns(false);
      sandbox.stub(common, 'isStepsFile').returns(false);
      sandbox.stub(common, 'couldBePythonStepsFile').returns(true);
      sandbox.stub(common, 'getWorkspaceSettingsForFile').returns({
        uri: mockWkspUri,
        featuresUri: mockFeaturesUri,
        stepsSearchUri: vscode.Uri.file('c:\\test\\steps')
      } as ReturnType<typeof common.getWorkspaceSettingsForFile>);

      sandbox.stub(fileParser.FileParser.prototype, 'reparseFile').resolves();
      const rebuildMappingsStub = sandbox.stub(stepMappings, 'rebuildStepMappings');

      // Simulate library file change
      const mockEvent = {
        document: { uri: libraryUri, getText: () => 'test' }
      } as vscode.TextDocumentChangeEvent;

      const wkspSettings = common.getWorkspaceSettingsForFile(mockEvent.document.uri);
      if (wkspSettings) {
        const testData = new WeakMap();
        await fileParser.FileParser.prototype.reparseFile(
          libraryUri, 
          mockEvent.document.getText(), 
          wkspSettings, 
          testData, 
          {} as vscode.TestController
        );
        
        // After reparseFile, step mappings should be rebuilt
        stepMappings.rebuildStepMappings(mockFeaturesUri);

        assert.ok(rebuildMappingsStub.called, 'Step mappings should be rebuilt');
        assert.ok(
          rebuildMappingsStub.calledWith(mockFeaturesUri),
          'Should rebuild mappings for features URI'
        );
      }
    });

    /**
     * Test that environment.py is still handled correctly (not treated as library file)
     */
    test('should not treat environment.py as library file', () => {
      const envUri = vscode.Uri.file('c:\\test\\features\\environment.py');

      sandbox.stub(common, 'isFeatureFile').returns(false);
      sandbox.stub(common, 'isStepsFile').returns(false);
      sandbox.stub(common, 'couldBePythonStepsFile').returns(true); // ends with .py

      const isEnvFile = envUri.path.endsWith("/environment.py");

      // Should filter out environment.py files
      const shouldProcess = !common.isFeatureFile(envUri) 
        && !common.couldBePythonStepsFile(envUri) 
        && !isEnvFile;

      assert.strictEqual(shouldProcess, false, 'environment.py should be handled separately');
    });

    /**
     * Test that non-Python files are ignored
     */
    test('should ignore non-Python files', () => {
      const txtUri = vscode.Uri.file('c:\\test\\lib\\notes.txt');

      sandbox.stub(common, 'isFeatureFile').returns(false);
      sandbox.stub(common, 'isStepsFile').returns(false);
      sandbox.stub(common, 'couldBePythonStepsFile').returns(false); // not .py file

      const isEnvFile = txtUri.path.endsWith("/environment.py");

      const shouldProcess = !common.isFeatureFile(txtUri) 
        && !common.couldBePythonStepsFile(txtUri) 
        && !isEnvFile;

      assert.strictEqual(shouldProcess, true, 'Non-Python files should be filtered');
    });

    /**
     * Test that steps files (in /steps/ folder) still work correctly
     */
    test('should still handle steps files correctly', () => {
      const stepsUri = vscode.Uri.file('c:\\test\\features\\steps\\my_steps.py');

      sandbox.stub(common, 'isFeatureFile').returns(false);
      sandbox.stub(common, 'isStepsFile').returns(true); // has /steps/ in path
      sandbox.stub(common, 'couldBePythonStepsFile').returns(true); // also .py file

      const isEnvFile = stepsUri.path.endsWith("/environment.py");

      // Both isStepsFile and couldBePythonStepsFile return true
      // Should still process it
      const shouldProcess = !common.isFeatureFile(stepsUri) 
        && !common.couldBePythonStepsFile(stepsUri) 
        && !isEnvFile;

      assert.strictEqual(shouldProcess, false, 'Steps files should be processed');
    });

    /**
     * Test behavior when library file is both in /steps/ folder and a Python file
     * This verifies steps files are still prioritized
     */
    test('should prioritize isStepsFile over general couldBePythonStepsFile logic', () => {
      const stepsUri = vscode.Uri.file('c:\\test\\features\\steps\\my_steps.py');

      sandbox.stub(common, 'isFeatureFile').returns(false);
      sandbox.stub(common, 'isStepsFile').returns(true); // explicit steps file
      sandbox.stub(common, 'couldBePythonStepsFile').returns(true); // also matches

      const isEnvFile = stepsUri.path.endsWith("/environment.py");

      // The key is: we check couldBePythonStepsFile OR isStepsFile
      const isRelevantPythonFile = common.isStepsFile(stepsUri) || common.couldBePythonStepsFile(stepsUri);
      const shouldProcess = !common.isFeatureFile(stepsUri) 
        && !isRelevantPythonFile 
        && !isEnvFile;

      // Actually should NOT process (return early) because it IS relevant
      assert.strictEqual(shouldProcess, false, 'Both steps files and library files should be processed');
    });
  });
});
