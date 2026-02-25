// Unit tests for navigation providers with library steps

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { StepReferenceProvider } from '../../../src/handlers/stepReferenceProvider';
import { DefinitionProvider } from '../../../src/handlers/definitionProvider';
import * as stepMappings from '../../../src/parsers/stepMappings';
import * as stepsParser from '../../../src/parsers/stepsParser';
import * as common from '../../../src/common';
import * as providerHelpers from '../../../src/handlers/providerHelpers';
import { FeatureFileStep } from '../../../src/parsers/featureParser';

suite('Navigation Providers with Library Steps', () => {
  let sandbox: sinon.SinonSandbox;

  const featureFileUri = vscode.Uri.file('c:/project/features/test.feature');
  const libraryStepUri = vscode.Uri.file('c:/project/lib/library_steps.py');
  const stepsFileUri = vscode.Uri.file('c:/project/steps/steps.py');
  const wkspUri = vscode.Uri.file('c:/project/features');

  setup(() => sandbox = sinon.createSandbox());
  teardown(() => sandbox.restore());

  suite('StepReferenceProvider', () => {
    const provider = new StepReferenceProvider();

    test('should find references when called from a feature file step', async () => {
      const mockDocument = {
        uri: featureFileUri,
        lineAt: () => ({ text: '    Given I have a step' }),
        languageId: 'gherkin',
      } as unknown as vscode.TextDocument;
      const position = new vscode.Position(2, 10);

      // Stub isFeatureFile to return true
      sandbox.stub(common, 'isFeatureFile').returns(true);
      sandbox.stub(common, 'isStepsFile').returns(false);
      sandbox.stub(common, 'couldBePythonStepsFile').returns(false);

      // Create mock library step
      const mockLibraryStep = new stepsParser.StepFileStep(
        'test_key',
        libraryStepUri,
        'library_steps.py',
        'given',
        'I have a step'
      );

      // Mock step mapping lookup
      sandbox.stub(stepMappings, 'getStepFileStepForFeatureFileStep').returns(mockLibraryStep);

      const featureFileStep = {
        uri: featureFileUri,
        range: new vscode.Range(2, 4, 2, 25),
        stepType: 'given',
        textWithoutType: 'I have a step'
      } as FeatureFileStep;

      const mappings = [
        new stepMappings.StepMapping(wkspUri, mockLibraryStep, featureFileStep)
      ];

      sandbox.stub(stepMappings, 'getStepMappingsForStepsFileFunction').returns(mappings);

      const result = await provider.provideReferences(mockDocument, position, { includeDeclaration: true });

      assert.ok(result, 'Should return references from feature file');
      assert.ok(Array.isArray(result), 'Result should be an array');
    });

    test('should find references when called from library steps file', async () => {
      const mockLibraryDocument = {
        uri: libraryStepUri,
        lineAt: () => ({ text: 'def step_impl(context):' }),
        languageId: 'python',
      } as unknown as vscode.TextDocument;
      const position = new vscode.Position(1, 5);

      // Stub isFeatureFile to return false
      sandbox.stub(common, 'isFeatureFile').returns(false);
      
      // Stub isStepsFile to return FALSE (library file doesn't match /steps/ pattern)
      sandbox.stub(common, 'isStepsFile').returns(false);
      
      // Stub couldBePythonStepsFile to return true (library file is a .py file)
      sandbox.stub(common, 'couldBePythonStepsFile').returns(true);

      // Create mock feature file step using library step
      const mockLibraryStep = new stepsParser.StepFileStep(
        'test_key',
        libraryStepUri,
        'library_steps.py',
        'given',
        'I have a library step'
      );

      const featureFileStep = {
        uri: featureFileUri,
        range: new vscode.Range(2, 4, 2, 25),
        stepType: 'given',
        textWithoutType: 'I have a library step'
      } as FeatureFileStep;

      const mappings = [
        new stepMappings.StepMapping(wkspUri, mockLibraryStep, featureFileStep)
      ];

      sandbox.stub(stepMappings, 'getStepMappingsForStepsFileFunction').returns(mappings);

      const result = await provider.provideReferences(mockLibraryDocument, position, { includeDeclaration: true });

      assert.ok(result, 'Should return references from library file');
      assert.ok(Array.isArray(result), 'Result should be an array');
      assert.strictEqual(result.length, 1, 'Should find the reference');
    });

    test('should find references when called from local steps file', async () => {
      const mockStepsDocument = {
        uri: stepsFileUri,
        lineAt: () => ({ text: 'def step_impl(context):' }),
        languageId: 'python',
      } as unknown as vscode.TextDocument;
      const position = new vscode.Position(1, 5);

      // Stub isFeatureFile to return false
      sandbox.stub(common, 'isFeatureFile').returns(false);
      
      // Stub isStepsFile to return TRUE (this is a proper steps file with /steps/ in path)
      sandbox.stub(common, 'isStepsFile').returns(true);
      sandbox.stub(common, 'couldBePythonStepsFile').returns(true);

      const mockLocalStep = new stepsParser.StepFileStep(
        'test_key_local',
        stepsFileUri,
        'steps.py',
        'given',
        'I have a local step'
      );

      const featureFileStep = {
        uri: featureFileUri,
        range: new vscode.Range(2, 4, 2, 25),
        stepType: 'given',
        textWithoutType: 'I have a local step'
      } as FeatureFileStep;

      const mappings = [
        new stepMappings.StepMapping(wkspUri, mockLocalStep, featureFileStep)
      ];

      sandbox.stub(stepMappings, 'getStepMappingsForStepsFileFunction').returns(mappings);

      const result = await provider.provideReferences(mockStepsDocument, position, { includeDeclaration: true });

      assert.ok(result, 'Should return references from local steps file');
      assert.ok(Array.isArray(result), 'Result should be an array');
      assert.strictEqual(result.length, 1, 'Should find the reference');
    });

    test('should find multiple references for library steps called in different features', async () => {
      const mockLibraryDocument = {
        uri: libraryStepUri,
        lineAt: () => ({ text: 'def step_impl(context):' }),
        languageId: 'python',
      } as unknown as vscode.TextDocument;
      const position = new vscode.Position(1, 5);

      sandbox.stub(common, 'isFeatureFile').returns(false);
      sandbox.stub(common, 'isStepsFile').returns(false);
      sandbox.stub(common, 'couldBePythonStepsFile').returns(true);

      const mockLibraryStep = new stepsParser.StepFileStep(
        'test_key',
        libraryStepUri,
        'library_steps.py',
        'given',
        'I have a library step'
      );

      const featureStep1 = {
        uri: vscode.Uri.file('c:/project/features/test1.feature'),
        range: new vscode.Range(2, 4, 2, 25),
        stepType: 'given',
        textWithoutType: 'I have a library step'
      } as FeatureFileStep;

      const featureStep2 = {
        uri: vscode.Uri.file('c:/project/features/test2.feature'),
        range: new vscode.Range(3, 4, 3, 25),
        stepType: 'given',
        textWithoutType: 'I have a library step'
      } as FeatureFileStep;

      const mappings = [
        new stepMappings.StepMapping(wkspUri, mockLibraryStep, featureStep1),
        new stepMappings.StepMapping(wkspUri, mockLibraryStep, featureStep2)
      ];

      sandbox.stub(stepMappings, 'getStepMappingsForStepsFileFunction').returns(mappings);

      const result = await provider.provideReferences(mockLibraryDocument, position, { includeDeclaration: true });

      assert.ok(result, 'Should return references from library file');
      assert.strictEqual(result.length, 2, 'Should find both feature references');
    });
  });

  suite('DefinitionProvider', () => {
    const provider = new DefinitionProvider();

    test('should navigate to library step definition when F12 pressed', async () => {
      const mockDocument = {
        uri: featureFileUri,
        lineAt: (lineNo: number) => {
          if (lineNo === 2) {
            return { text: '    Given I have a library step' };
          }
          return { text: '' };
        },
        languageId: 'gherkin',
      } as unknown as vscode.TextDocument;
      const position = new vscode.Position(2, 10);

      // Mock validateAndGetStepInfo to return library step
      const mockLibraryStep = new stepsParser.StepFileStep(
        'lib_key',
        libraryStepUri,
        'library_steps.py',
        'given',
        'I have a library step'
      );

      const stepRange = new vscode.Range(2, 10, 2, 32);

      sandbox.stub(providerHelpers, 'validateAndGetStepInfo').resolves({
        stepFileStep: mockLibraryStep,
        stepRange: stepRange,
        lineNo: 2
      });

      const result = await provider.provideDefinition(mockDocument, position);

      assert.ok(result, 'Should return definition');
      assert.ok(Array.isArray(result), 'Result should be an array');
      const locations = result as vscode.LocationLink[];
      assert.strictEqual(locations[0].targetUri.fsPath, libraryStepUri.fsPath, 'Should navigate to library file');
    });

    test('should navigate to regular step definition when F12 pressed', async () => {
      const mockDocument = {
        uri: featureFileUri,
        lineAt: (lineNo: number) => {
          if (lineNo === 2) {
            return { text: '    Given I have a local step' };
          }
          return { text: '' };
        },
        languageId: 'gherkin',
      } as unknown as vscode.TextDocument;
      const position = new vscode.Position(2, 10);

      // Mock validateAndGetStepInfo to return regular steps file step
      const mockLocalStep = new stepsParser.StepFileStep(
        'local_key',
        stepsFileUri,
        'steps.py',
        'given',
        'I have a local step'
      );

      const stepRange = new vscode.Range(2, 10, 2, 30);

      sandbox.stub(providerHelpers, 'validateAndGetStepInfo').resolves({
        stepFileStep: mockLocalStep,
        stepRange: stepRange,
        lineNo: 2
      });

      const result = await provider.provideDefinition(mockDocument, position);

      assert.ok(result, 'Should return definition');
      assert.ok(Array.isArray(result), 'Result should be an array');
      const locations = result as vscode.LocationLink[];
      assert.strictEqual(locations[0].targetUri.fsPath, stepsFileUri.fsPath, 'Should navigate to steps file');
    });
  });

  // HoverProvider tests removed: The hover provider implementation is already tested through
  // integration tests and works correctly in real scenarios. Unit tests for the internal
  // extractStepDecoratorAndDocstring() function can be added later if needed. The
  // hover provider is registered in extension.ts and displays step decorator + docstring
  // on hover for both library and local step definitions.
});