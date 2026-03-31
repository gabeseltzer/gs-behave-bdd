// Unit tests for step definition discovery ordering and consistency.
//
// These tests cover the scenario reported as a bug:
//   1. User has a feature file open
//   2. Switches git branches (or saves a Python file)
//   3. The branch adds BOTH a new feature step AND its step definition in a Python file
//   4. Both files change "simultaneously" (the feature file immediately, the Python file after debounce)
//   5. The feature file should NOT have a persistent "step not found" diagnostic after parsing settles
//
// Root cause tested: previously, _debouncePythonReparse called rebuildStepMappings but never
// triggered validateStepDefinitions for open feature files, leaving stale diagnostics.

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { FileParser } from '../../../src/parsers/fileParser';
import { WorkspaceSettings } from '../../../src/settings';
import * as commonModule from '../../../src/common';
import * as stepsMapModule from '../../../src/parsers/stepMappings';
import * as featureParserModule from '../../../src/parsers/featureParser';
import * as configModule from '../../../src/configuration';
import * as behaveLoaderModule from '../../../src/parsers/behaveLoader';
import * as adapterModule from '../../../src/parsers/stepsParserBehaveAdapter';


suite('stepDefDiscoveryOrdering', () => {
  let fileParser: FileParser;
  let clock: sinon.SinonFakeTimers;
  let couldBePythonStepsFileStub: sinon.SinonStub;
  let isFeatureFileStub: sinon.SinonStub;
  let _isStepsFileStub: sinon.SinonStub;
  let _getContentFromFilesystemStub: sinon.SinonStub;
  let rebuildStepMappingsStub: sinon.SinonStub;
  let loadFromBehaveStub: sinon.SinonStub;

  const wkspUri = vscode.Uri.file('c:/project');
  const featuresUri = vscode.Uri.joinPath(wkspUri, 'features');
  const stepsUri = vscode.Uri.joinPath(wkspUri, 'features/steps');
  const stepsFileUri = vscode.Uri.joinPath(stepsUri, 'steps.py');
  const featureFileUri = vscode.Uri.joinPath(featuresUri, 'new_branch.feature');

  const wkspSettings = {
    uri: wkspUri,
    name: 'project',
    featuresUri,
    stepsSearchUri: stepsUri,
    projectUri: wkspUri,
  } as WorkspaceSettings;

  setup(() => {
    clock = sinon.useFakeTimers();
    fileParser = new FileParser();

    _isStepsFileStub = sinon.stub(commonModule, 'isStepsFile').returns(true);
    isFeatureFileStub = sinon.stub(commonModule, 'isFeatureFile').returns(false);
    couldBePythonStepsFileStub = sinon.stub(commonModule, 'couldBePythonStepsFile').returns(true);
    _getContentFromFilesystemStub = sinon.stub(commonModule, 'getContentFromFilesystem').resolves('');

    rebuildStepMappingsStub = sinon.stub(stepsMapModule, 'rebuildStepMappings');
    loadFromBehaveStub = sinon.stub(behaveLoaderModule, 'loadFromBehave').resolves({ steps: [], fixtures: [] });
    sinon.stub(adapterModule, 'storeBehaveStepDefinitions').resolves(0);
    sinon.stub(configModule.config, 'getPythonExecutable').resolves('python3');
    sinon.stub(configModule.config.logger, 'showError');
    sinon.stub(configModule.config.logger, 'showWarn');
  });

  teardown(() => {
    fileParser.dispose();
    clock.restore();
    sinon.restore();
  });


  suite('git branch switch: simultaneous feature + Python file change', () => {
    // Simulates: user switches to a branch that adds both a new feature step and its definition.
    // The feature file is re-parsed immediately; the Python file is debounced.
    // After the debounce fires, onStepMappingsRebuilt must be called so diagnostics can be refreshed.

    test('onStepMappingsRebuilt callback fires after debounce, allowing stale diagnostics to be cleared', async () => {
      const testData = new WeakMap();
      const ctrlStub = {} as vscode.TestController;

      // Track what the callback is called with
      const rebuiltUris: vscode.Uri[] = [];
      fileParser.onStepMappingsRebuilt = (uri) => rebuiltUris.push(uri);

      // Step 1: Feature file changes immediately (git branch switch)
      // In the real flow, the workspace watcher fires for the feature file first.
      // We don't need to simulate that here — we just care about the Python file side.

      // Step 2: Python step file changes (git branch switch updated steps.py)
      await fileParser.reparseFile(stepsFileUri, 'new step content', wkspSettings, testData, ctrlStub);

      // At this point, the debounce is pending. Diagnostics for the feature file are stale.
      assert.strictEqual(rebuiltUris.length, 0,
        'callback must not fire before debounce — step defs are still loading');
      assert.strictEqual(rebuildStepMappingsStub.callCount, 0,
        'step mappings must not be rebuilt until behave reloads');

      // Step 3: Debounce fires (500ms after last Python file change)
      await clock.tickAsync(500);

      // Step 4: After debounce fires, step mappings ARE rebuilt and callback IS invoked
      assert.ok(rebuildStepMappingsStub.called, 'step mappings must be rebuilt after debounce');
      assert.strictEqual(rebuiltUris.length, 1,
        'onStepMappingsRebuilt must be called exactly once after debounce fires');
      assert.strictEqual(rebuiltUris[0].path, featuresUri.path,
        'callback must pass the workspace featuresUri so the caller knows which files to re-validate');
    });

    test('rebuildStepMappings is called BEFORE onStepMappingsRebuilt callback (correct ordering)', async () => {
      const testData = new WeakMap();
      const ctrlStub = {} as vscode.TestController;
      const callOrder: string[] = [];

      rebuildStepMappingsStub.callsFake(() => callOrder.push('rebuildStepMappings'));
      fileParser.onStepMappingsRebuilt = () => callOrder.push('onStepMappingsRebuilt');

      await fileParser.reparseFile(stepsFileUri, 'content', wkspSettings, testData, ctrlStub);
      await clock.tickAsync(500);

      assert.deepStrictEqual(callOrder, ['rebuildStepMappings', 'onStepMappingsRebuilt'],
        'mappings must be fully rebuilt before the callback fires — callback consumers read fresh mappings');
    });

    test('loadFromBehave is called BEFORE rebuildStepMappings (new defs available during rebuild)', async () => {
      const testData = new WeakMap();
      const ctrlStub = {} as vscode.TestController;
      const callOrder: string[] = [];

      loadFromBehaveStub.callsFake(async () => { callOrder.push('loadFromBehave'); return { steps: [], fixtures: [] }; });
      rebuildStepMappingsStub.callsFake(() => callOrder.push('rebuildStepMappings'));

      await fileParser.reparseFile(stepsFileUri, 'content', wkspSettings, testData, ctrlStub);
      await clock.tickAsync(500);

      assert.deepStrictEqual(callOrder, ['loadFromBehave', 'rebuildStepMappings'],
        'behave must load new step definitions before mappings are rebuilt against them');
    });
  });


  suite('Python step file changed but feature file was already parsed with stale state', () => {
    // This covers the case where the feature file was parsed (immediately) with no step defs loaded yet,
    // producing a "step not found" diagnostic. The Python file then arrives 500ms later.
    // After debounce, the callback should trigger re-validation which clears the stale diagnostic.

    test('callback enables clearing a diagnostic that was created with stale step mappings', async () => {
      const testData = new WeakMap();
      const ctrlStub = {} as vscode.TestController;

      // Simulate: feature file was parsed and step mapping was NOT found (step def not loaded yet).
      // Record diagnostics set during each phase.
      const diagnosticsSetInCallback: string[] = [];

      fileParser.onStepMappingsRebuilt = () => {
        // In the real extension.ts wiring, this calls validateStepDefinitions for open docs.
        // Here we just verify the callback fires at the right time.
        diagnosticsSetInCallback.push('re-validated');
      };

      // Debounce is pending — stale diagnostic would persist here
      await fileParser.reparseFile(stepsFileUri, 'added @given("new step")', wkspSettings, testData, ctrlStub);
      assert.strictEqual(diagnosticsSetInCallback.length, 0,
        'no re-validation yet while behave is loading');

      // After debounce fires, callback fires and re-validation can clear stale diagnostic
      await clock.tickAsync(500);
      assert.strictEqual(diagnosticsSetInCallback.length, 1,
        'callback must fire once after debounce so diagnostic can be re-evaluated with fresh step defs');
    });
  });


  suite('Python step definition removed (reverse case: step removed from .py file)', () => {
    // When a step definition is deleted (or branch removed it), the diagnostic should APPEAR
    // on the feature file step after the Python file is reparsed.

    test('callback fires after step definition is removed, allowing new diagnostic to be created', async () => {
      const testData = new WeakMap();
      const ctrlStub = {} as vscode.TestController;
      let callbackFired = false;

      fileParser.onStepMappingsRebuilt = () => { callbackFired = true; };

      // Python file changed to remove the @given("old step") decorator
      await fileParser.reparseFile(stepsFileUri, 'content without step def', wkspSettings, testData, ctrlStub);
      await clock.tickAsync(500);

      assert.strictEqual(callbackFired, true,
        'callback must fire when step definitions are removed, so "step not found" diagnostics can be added');
    });
  });


  suite('Multiple Python files changed (e.g. steps.py + helpers.py changed on branch switch)', () => {
    // When multiple Python files change simultaneously (e.g. git branch switch touching 2 step files),
    // the debounce coalesces them into a single reparse, and the callback fires exactly once.

    test('callback fires exactly once when multiple Python files change before debounce window', async () => {
      const testData = new WeakMap();
      const ctrlStub = {} as vscode.TestController;
      let callbackCount = 0;

      fileParser.onStepMappingsRebuilt = () => { callbackCount++; };

      const helperFileUri = vscode.Uri.joinPath(stepsUri, 'helpers.py');

      // Both files changed (git branch switch) within the same debounce window
      await fileParser.reparseFile(stepsFileUri, 'steps content', wkspSettings, testData, ctrlStub);
      await clock.tickAsync(100);
      await fileParser.reparseFile(helperFileUri, 'helpers content', wkspSettings, testData, ctrlStub);

      await clock.tickAsync(500);

      assert.strictEqual(callbackCount, 1,
        'callback should fire exactly once per workspace debounce window, even if multiple Python files changed');
      assert.strictEqual(loadFromBehaveStub.callCount, 1,
        'behave should only be invoked once (debounce coalesced multiple changes)');
    });
  });


  suite('Workspace isolation: callback only fires for the affected workspace', () => {
    const wkspUri2 = vscode.Uri.file('c:/project-b');
    const featuresUri2 = vscode.Uri.joinPath(wkspUri2, 'features');
    const stepsUri2 = vscode.Uri.joinPath(wkspUri2, 'features/steps');
    const stepsFileUri2 = vscode.Uri.joinPath(stepsUri2, 'steps.py');

    const wkspSettings2 = {
      uri: wkspUri2,
      name: 'project-b',
      featuresUri: featuresUri2,
      stepsSearchUri: stepsUri2,
      projectUri: wkspUri2,
    } as WorkspaceSettings;

    test('each workspace gets its own callback invocation with the correct featuresUri', async () => {
      const testData = new WeakMap();
      const ctrlStub = {} as vscode.TestController;
      const callbackResults: string[] = [];

      fileParser.onStepMappingsRebuilt = (uri) => callbackResults.push(uri.path);

      await fileParser.reparseFile(stepsFileUri, 'wksp1 steps', wkspSettings, testData, ctrlStub);
      await fileParser.reparseFile(stepsFileUri2, 'wksp2 steps', wkspSettings2, testData, ctrlStub);

      await clock.tickAsync(500);

      assert.strictEqual(callbackResults.length, 2,
        'callback should fire once per workspace');
      assert.ok(callbackResults.includes(featuresUri.path),
        'workspace 1 featuresUri must be reported to callback');
      assert.ok(callbackResults.includes(featuresUri2.path),
        'workspace 2 featuresUri must be reported to callback — workspace B files should not be re-validated for workspace A changes');
    });

    test('a change in workspace A does not trigger re-validation for workspace B feature files', async () => {
      const testData = new WeakMap();
      const ctrlStub = {} as vscode.TestController;
      const callbackUris: string[] = [];

      fileParser.onStepMappingsRebuilt = (uri) => callbackUris.push(uri.path);

      // Only workspace A's Python file changed
      await fileParser.reparseFile(stepsFileUri, 'wksp1 steps', wkspSettings, testData, ctrlStub);
      await clock.tickAsync(500);

      assert.strictEqual(callbackUris.length, 1);
      assert.strictEqual(callbackUris[0], featuresUri.path,
        'only workspace A featuresUri should be passed — extension.ts uses this to filter which feature docs to re-validate');
      assert.ok(!callbackUris.includes(featuresUri2.path),
        'workspace B should NOT be re-validated when workspace A Python files change');
    });
  });


  suite('Feature file changes while Python debounce is pending', () => {
    // Models the exact git branch switch timing:
    //   t=0: feature file changes (immediate reparse, step def not found → diagnostic added)
    //   t=0: Python file changes (debounce scheduled for t=500)
    //   t=500: Python debounce fires → loadFromBehave → rebuildStepMappings → callback
    //          → validateStepDefinitions → diagnostic cleared

    test('after feature file reparse, subsequent Python debounce triggers callback to clear stale diagnostic', async () => {
      const testData = new WeakMap();

      // Configure for feature file first
      isFeatureFileStub.returns(true);
      couldBePythonStepsFileStub.returns(false);

      const getFeatureNameStub = sinon.stub(featureParserModule, 'getFeatureNameFromContent').resolves(null);

      const ctrlStub = {
        items: { get: () => undefined, add: () => undefined, delete: () => undefined },
        createTestItem: (_id: string, label: string) => ({
          id: _id, label, canResolveChildren: false,
          children: { add: () => undefined, get: () => undefined, delete: () => undefined },
          uri: featureFileUri,
        }),
      } as unknown as vscode.TestController;

      // Feature file reparse (immediate) — step def not yet available
      await fileParser.reparseFile(featureFileUri, 'Feature: new\n  Scenario: s\n    Given new step', wkspSettings, testData, ctrlStub);

      // Feature file parse is immediate, step mappings rebuilt immediately (with no/stale step defs)
      assert.ok(rebuildStepMappingsStub.calledOnce, 'step mappings rebuilt immediately for feature file');

      // Now configure for Python file
      isFeatureFileStub.returns(false);
      couldBePythonStepsFileStub.returns(true);

      let callbackFired = false;
      fileParser.onStepMappingsRebuilt = () => { callbackFired = true; };

      // Python file change (debounced) — step def is now available on this branch
      await fileParser.reparseFile(stepsFileUri, '@given("new step")\ndef new_step(): pass', wkspSettings, testData, ctrlStub);

      assert.strictEqual(callbackFired, false, 'callback must not fire while debounce pending');
      assert.strictEqual(rebuildStepMappingsStub.callCount, 1, 'still only called once (from feature file)');

      // Debounce fires
      await clock.tickAsync(500);

      assert.ok(rebuildStepMappingsStub.calledTwice, 'step mappings rebuilt again after Python debounce');
      assert.strictEqual(callbackFired, true,
        'callback must fire after Python debounce so validateStepDefinitions can clear the stale "step not found" diagnostic');

      getFeatureNameStub.restore();
    });
  });
});
