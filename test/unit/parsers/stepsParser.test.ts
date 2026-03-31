// Unit tests for stepsParser module - step decorator pattern validation

import * as assert from 'assert';
import * as vscode from 'vscode';
import { stepFileDecoratorPattern, parseStepsFileContent, getStepFileSteps, deleteStepFileSteps, recordImportedLibraries, getImportedLibrariesByStepFile, storeStepFileStep, StepFileStep } from '../../../src/parsers/stepsParser';
import { uriId, sepr } from '../../../src/common';

suite('stepsParser', () => {

  suite('stepFileDecoratorPattern', () => {
    let pattern: RegExp;

    suiteSetup(() => {
      pattern = new RegExp(`${stepFileDecoratorPattern}.*`, 'i');
    });

    suite('should match valid decorators', () => {
      test('should match @given(', () => {
        const line = '@given("text")';
        assert.ok(pattern.test(line), `Pattern should match: ${line}`);
      });

      test('should match @when(', () => {
        const line = '@when("text")';
        assert.ok(pattern.test(line), `Pattern should match: ${line}`);
      });

      test('should match @then(', () => {
        const line = '@then("text")';
        assert.ok(pattern.test(line), `Pattern should match: ${line}`);
      });

      test('should match @step(', () => {
        const line = '@step("text")';
        assert.ok(pattern.test(line), `Pattern should match: ${line}`);
      });

      test('should match @behave.given(', () => {
        const line = '@behave.given("text")';
        assert.ok(pattern.test(line), `Pattern should match: ${line}`);
      });

      test('should match @behave.when(', () => {
        const line = '@behave.when("text")';
        assert.ok(pattern.test(line), `Pattern should match: ${line}`);
      });

      test('should match @behave.then(', () => {
        const line = '@behave.then("text")';
        assert.ok(pattern.test(line), `Pattern should match: ${line}`);
      });

      test('should match @behave.step(', () => {
        const line = '@behave.step("text")';
        assert.ok(pattern.test(line), `Pattern should match: ${line}`);
      });

      test('should match with leading whitespace', () => {
        const line = '    @given("text")';
        assert.ok(pattern.test(line), `Pattern should match: ${line}`);
      });

      test('should match with tabs', () => {
        const line = '\t\t@when("text")';
        assert.ok(pattern.test(line), `Pattern should match: ${line}`);
      });

      test('should match with single quotes', () => {
        const line = "@step('text')";
        assert.ok(pattern.test(line), `Pattern should match: ${line}`);
      });

      test('should be case insensitive - uppercase decorator', () => {
        const line = '@GIVEN("text")';
        assert.ok(pattern.test(line), `Pattern should match: ${line}`);
      });

      test('should be case insensitive - mixed case', () => {
        const line = '@Given("text")';
        assert.ok(pattern.test(line), `Pattern should match: ${line}`);
      });

      test('should match with raw string prefix (u prefix)', () => {
        const line = '@step(u"text")';
        assert.ok(pattern.test(line), `Pattern should match: ${line}`);
      });
    });

    suite('should NOT match invalid decorators', () => {
      test('should NOT match @and(', () => {
        const line = '@and("text")';
        assert.ok(!pattern.test(line), `Pattern should NOT match: ${line}`);
      });

      test('should NOT match @but(', () => {
        const line = '@but("text")';
        assert.ok(!pattern.test(line), `Pattern should NOT match: ${line}`);
      });

      test('should NOT match @other(', () => {
        const line = '@other("text")';
        assert.ok(!pattern.test(line), `Pattern should NOT match: ${line}`);
      });

      test('should NOT match random decorator', () => {
        const line = '@random("text")';
        assert.ok(!pattern.test(line), `Pattern should NOT match: ${line}`);
      });

      test('should NOT match text without decorator', () => {
        const line = 'def my_function():';
        assert.ok(!pattern.test(line), `Pattern should NOT match: ${line}`);
      });

      test('should NOT match comment', () => {
        const line = '# @given("text")';
        assert.ok(!pattern.test(line), `Pattern should NOT match: ${line}`);
      });
    });

    suite('should extract step decorator group correctly', () => {
      test('should capture @given decorator', () => {
        const line = '@given("my step text")';
        const stepPattern = new RegExp(`${stepFileDecoratorPattern}`, 'i');
        const match = stepPattern.exec(line);
        assert.ok(match, 'Should match @given');
      });

      test('should capture @behave.when decorator', () => {
        const line = '@behave.when("my step text")';
        const stepPattern = new RegExp(`${stepFileDecoratorPattern}`, 'i');
        const match = stepPattern.exec(line);
        assert.ok(match, 'Should match @behave.when');
      });

      test('should handle multi-line context', () => {
        const lines = `@given("I have a precondition")
def step_impl(context):
    pass`;
        const firstLine = lines.split('\n')[0];
        assert.ok(pattern.test(firstLine), 'Should match first line of multi-line context');
      });
    });

  });

  suite('parseStepsFileContent', () => {
    const stepContent = `
@given('I have a precondition')
def step_impl(context):
    pass
`;

    suite('isLibraryFile parameter validation', () => {
      test('should successfully parse step definitions from non-steps-file URI when isLibraryFile=true', async () => {
        // Create a URI that doesn't have /steps/ in its path (library file)
        const libraryUri = vscode.Uri.file('c:/project/lib/helpers.py');
        const featuresUri = vscode.Uri.file('c:/project/features');

        // Clean up any existing steps first
        deleteStepFileSteps(featuresUri);

        // Should not throw when isLibraryFile=true
        await parseStepsFileContent(featuresUri, stepContent, libraryUri, 'test', true);

        // Verify steps were parsed
        const steps = getStepFileSteps(featuresUri);
        assert.ok(steps.length > 0, 'Steps should be parsed from library file');
      });

      test('should throw error for non-steps-file URI when isLibraryFile=false (default)', async () => {
        // Create a URI that doesn't have /steps/ in its path
        const nonStepsUri = vscode.Uri.file('c:/project/lib/helpers.py');
        const featuresUri = vscode.Uri.file('c:/project/features');

        // Should throw when isLibraryFile=false (default)
        try {
          await parseStepsFileContent(featuresUri, stepContent, nonStepsUri, 'test', false);
          assert.fail('Should have thrown an error for non-steps-file URI');
        } catch (e) {
          assert.ok(e instanceof Error, 'Should throw an Error');
          assert.match((e as Error).message, /is not a steps file/, 'Error message should indicate not a steps file');
        }
      });

      test('should successfully parse step definitions from steps-file URI when isLibraryFile=false', async () => {
        // Create a URI that has /steps/ in its path (proper steps file)
        const stepsUri = vscode.Uri.file('c:/project/steps/helpers.py');
        const featuresUri = vscode.Uri.file('c:/project/features');

        // Clean up any existing steps first
        deleteStepFileSteps(featuresUri);

        // Should not throw when URI follows steps file naming convention
        await parseStepsFileContent(featuresUri, stepContent, stepsUri, 'test', false);

        // Verify steps were parsed
        const steps = getStepFileSteps(featuresUri);
        assert.ok(steps.length > 0, 'Steps should be parsed from steps file');
      });
    });

  });

  suite('deleteStepFileSteps cleanup', () => {
    test('should clean up import tracking entries when deleting step file steps', () => {
      const featuresUri = vscode.Uri.file('c:/workspace1/features');
      const stepFileUri = vscode.Uri.file('c:/workspace1/features/steps/steps.py');
      const libraryUri1 = vscode.Uri.file('c:/workspace1/step_library/lib1.py');
      const libraryUri2 = vscode.Uri.file('c:/workspace1/step_library/lib2.py');

      // Record imported libraries for this step file
      recordImportedLibraries(stepFileUri, [libraryUri1, libraryUri2]);

      // Verify import tracking was recorded
      let importTracking = getImportedLibrariesByStepFile();
      let stepFileFound = false;
      for (const [stepFileId] of importTracking) {
        if (stepFileId.includes('features/steps/steps.py')) {
          stepFileFound = true;
          break;
        }
      }
      assert.ok(stepFileFound, 'Import tracking should contain step file entry before deletion');

      // Delete step file steps
      deleteStepFileSteps(featuresUri);

      // Verify import tracking was cleaned up for this workspace
      importTracking = getImportedLibrariesByStepFile();
      stepFileFound = false;
      for (const [stepFileId] of importTracking) {
        if (stepFileId.includes('workspace1')) {
          stepFileFound = true;
          break;
        }
      }
      assert.ok(!stepFileFound, 'Import tracking should not contain workspace1 entries after deletion');
    });

    test('should preserve import tracking entries from other workspaces', () => {
      const workspace1FeaturesUri = vscode.Uri.file('c:/workspace1/features');
      const workspace2FeaturesUri = vscode.Uri.file('c:/workspace2/features');
      const workspace1StepFileUri = vscode.Uri.file('c:/workspace1/features/steps/steps.py');
      const workspace2StepFileUri = vscode.Uri.file('c:/workspace2/features/steps/steps.py');
      const libraryUri = vscode.Uri.file('c:/shared/library.py');

      // Record imported libraries for both workspaces
      recordImportedLibraries(workspace1StepFileUri, [libraryUri]);
      recordImportedLibraries(workspace2StepFileUri, [libraryUri]);

      // Verify both are recorded
      let importTracking = getImportedLibrariesByStepFile();
      const initialSize = importTracking.size;
      assert.ok(initialSize >= 2, 'Should have entries for both workspaces');

      // Delete steps for workspace1 only
      deleteStepFileSteps(workspace1FeaturesUri);

      // Verify workspace2 entries are preserved
      importTracking = getImportedLibrariesByStepFile();
      let workspace2Found = false;
      for (const [stepFileId] of importTracking) {
        if (stepFileId.includes('workspace2')) {
          workspace2Found = true;
          break;
        }
      }
      assert.ok(workspace2Found, 'Workspace2 import tracking should be preserved after workspace1 deletion');
    });

    test('should actually remove step definitions from the step file steps map', () => {
      const featuresUri = vscode.Uri.file('c:/workspace-delete-test/features');
      const stepFileUri = vscode.Uri.file('c:/workspace-delete-test/features/steps/steps.py');

      // Clean up first
      deleteStepFileSteps(featuresUri);

      // Store a step using the same key format the real code uses
      const reKey = `${uriId(featuresUri)}${sepr}^given${sepr}there is a calculator$`;
      const step = new StepFileStep(reKey, stepFileUri, 'steps.py', 'given', 'there is a calculator');
      storeStepFileStep(featuresUri, step);

      // Verify step is stored
      const stepsBeforeDelete = getStepFileSteps(featuresUri);
      assert.strictEqual(stepsBeforeDelete.length, 1, 'Should have 1 step before deletion');

      // Delete and verify it's actually gone
      deleteStepFileSteps(featuresUri);

      const stepsAfterDelete = getStepFileSteps(featuresUri);
      assert.strictEqual(stepsAfterDelete.length, 0, 'Should have 0 steps after deletion');
    });
  });

});
