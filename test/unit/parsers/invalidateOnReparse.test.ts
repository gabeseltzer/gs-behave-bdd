// Tests that editing a feature file marks its previous results outdated.
//
// Without this, the last run's ticks and crosses stay on scenarios whose text has
// changed - or which no longer exist - so the tree asserts something it no longer
// knows. invalidateTestResults() greys them out instead.
//
// The distinction that matters is WHERE it is called: on reparse (the file's text
// changed) and not on the run-time resolve path, which would wipe results for
// scenarios the user did not re-run.

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { FileParser } from '../../../src/parsers/fileParser';
import { WorkspaceSettings } from '../../../src/settings';
import * as commonModule from '../../../src/common';
import * as stepsMapModule from '../../../src/parsers/stepMappings';
import * as configModule from '../../../src/configuration';

suite('fileParser - invalidate results on feature reparse', () => {

  let fileParser: FileParser;

  const wkspUri = vscode.Uri.file('c:/test-workspace');
  const featuresUri = vscode.Uri.joinPath(wkspUri, 'features');
  const featureFileUri = vscode.Uri.joinPath(featuresUri, 'test.feature');

  const wkspSettings = {
    uri: wkspUri,
    name: 'test',
    featuresUri: featuresUri,
    featuresUris: [featuresUri],
    projectUri: wkspUri,
    getEffectiveEnvVars: () => ({}),
  } as WorkspaceSettings;

  const featureItem = { id: 'test.feature', label: 'test.feature' } as unknown as vscode.TestItem;

  let invalidated: (vscode.TestItem | readonly vscode.TestItem[] | undefined)[];

  const makeCtrl = () => ({
    invalidateTestResults: (items?: vscode.TestItem | readonly vscode.TestItem[]) => invalidated.push(items),
  }) as unknown as vscode.TestController;

  /**
   * Stub the rebuild itself. What is under test is the wiring in reparseFile, not the
   * parsing - and going through the real one would need a controller, a document and a
   * populated item tree to say nothing extra about invalidation.
   */
  const stubRebuild = (returns: vscode.TestItem | undefined) =>
    sinon.stub(fileParser as unknown as Record<string, unknown>,
      '_updateTestItemFromFeatureFileContent' as never).resolves(returns as never);

  setup(() => {
    invalidated = [];
    fileParser = new FileParser();

    sinon.stub(commonModule, 'isFeatureFile').returns(true);
    sinon.stub(commonModule, 'couldBePythonStepsFile').returns(false);
    sinon.stub(commonModule, 'getContentFromFilesystem').resolves('Feature: x');
    sinon.stub(commonModule, 'getFeaturesRootForFile').returns(featuresUri);
    sinon.stub(stepsMapModule, 'rebuildStepMappings');

    sinon.stub(configModule.config.logger, 'showError');
    sinon.stub(configModule.config.logger, 'showWarn');
    sinon.stub(configModule.config.logger, 'logInfo');
    sinon.stub(configModule.config.logger, 'show');
  });

  teardown(() => {
    fileParser.dispose();
    sinon.restore();
  });


  // Passing the FEATURE item is enough for its scenarios: the API contract is "test
  // results for the item and all of its children will be marked as outdated", so the
  // scenarios below it do not need enumerating here.
  test('editing a feature file marks its results outdated', async () => {
    stubRebuild(featureItem);

    await fileParser.reparseFile(featureFileUri, 'Feature: x', wkspSettings, new WeakMap(), makeCtrl());

    assert.deepStrictEqual(invalidated, [featureItem],
      'the edited feature item should be invalidated exactly once');
  });


  test('a file that produced no item invalidates nothing', async () => {
    // An empty or nameless feature yields no test item; there is nothing to mark.
    stubRebuild(undefined);

    await fileParser.reparseFile(featureFileUri, '', wkspSettings, new WeakMap(), makeCtrl());

    assert.deepStrictEqual(invalidated, []);
  });


  test('a python file reparse does not invalidate feature results', async () => {
    // Editing a steps .py file does not change what any scenario says, and its reparse
    // is debounced down a different path entirely.
    (commonModule.isFeatureFile as sinon.SinonStub).returns(false);
    (commonModule.couldBePythonStepsFile as sinon.SinonStub).returns(true);

    await fileParser.reparseFile(vscode.Uri.joinPath(wkspUri, 'steps', 's.py'), 'x',
      wkspSettings, new WeakMap(), makeCtrl());

    assert.deepStrictEqual(invalidated, []);
  });

});
