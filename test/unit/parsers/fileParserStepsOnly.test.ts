// Changing the env var preset (or the env vars themselves) re-runs step discovery, because the step
// modules are imported in that environment, but must not rebuild the test tree: the feature files
// haven't changed, and clearing the tree makes the Test Explorer visibly repopulate.

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { FileParser } from '../../../src/parsers/fileParser';
import { WorkspaceSettings } from '../../../src/settings';
import * as commonModule from '../../../src/common';
import * as configModule from '../../../src/configuration';
import * as stepMappingsModule from '../../../src/parsers/stepMappings';

suite('fileParser - steps-only parseFilesForWorkspace', () => {
  let fileParser: FileParser;
  let parseFeatureFilesStub: sinon.SinonStub;
  let parseStepsFilesStub: sinon.SinonStub;
  let onStepMappingsRebuilt: sinon.SinonStub;

  const wkspUri = vscode.Uri.file('c:/test-workspace-steps-only');
  const wkspPath = wkspUri.path;
  const featuresUri = vscode.Uri.joinPath(wkspUri, 'features');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokenSources = () => (fileParser as any)._cancelTokenSources as Record<string, vscode.CancellationTokenSource>;
  const parse = (stepsOnly?: boolean) => fileParser.parseFilesForWorkspace(wkspUri, {} as never, {} as vscode.TestController,
    'unit-test', false, undefined, stepsOnly);

  setup(() => {
    fileParser = new FileParser();

    const wkspSettings = { featuresUri, featuresUris: [featuresUri] } as unknown as WorkspaceSettings;
    sinon.stub(configModule.config, 'workspaceSettings').get(() => ({ [wkspPath]: wkspSettings }));
    sinon.stub(commonModule, 'getWorkspaceFolder').returns({
      uri: wkspUri, name: 'test-workspace-steps-only', index: 0,
    } as vscode.WorkspaceFolder);
    sinon.stub(commonModule, 'getUrisOfWkspFoldersWithFeatures').returns([wkspUri]);
    sinon.stub(commonModule, 'countTestItemsInCollection').returns({ nodeCount: 0, testCount: 0 });
    sinon.stub(stepMappingsModule, 'rebuildStepMappings').returns(0);
    sinon.stub(stepMappingsModule, 'rebuildExecuteStepsMappings').returns(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parseFeatureFilesStub = sinon.stub(fileParser as any, '_parseFeatureFiles').resolves(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parseStepsFilesStub = sinon.stub(fileParser as any, '_parseStepsFiles').resolves(0);
    onStepMappingsRebuilt = sinon.stub();
    fileParser.onStepMappingsRebuilt = onStepMappingsRebuilt;
  });

  teardown(() => {
    fileParser.dispose();
    sinon.restore();
  });

  test('re-discovers steps without touching the test tree, then re-validates open documents', async () => {
    await parse(true);

    assert.strictEqual(parseFeatureFilesStub.callCount, 0, 'the feature files (and so the test tree) must be left alone');
    assert.strictEqual(parseStepsFilesStub.callCount, 1, 'step definitions must be re-discovered');
    assert.ok(onStepMappingsRebuilt.calledOnceWith(featuresUri), 'open documents must be re-validated against the new step mappings');
  });

  test('a full parse still parses the feature files', async () => {
    await parse();

    assert.strictEqual(parseFeatureFilesStub.callCount, 1);
    assert.strictEqual(parseStepsFilesStub.callCount, 1);
  });

  test('does a full parse instead if a parse is already in flight, rather than cancelling it part-way through the tree', async () => {
    const inFlight = new vscode.CancellationTokenSource();
    tokenSources()[wkspPath] = inFlight;
    const cancelSpy = sinon.spy(inFlight, 'cancel');

    const stepsOnly = parse(true);
    await new Promise(t => setTimeout(t, 30));
    assert.ok(cancelSpy.calledOnce, 'precondition: the in-flight parse is superseded');
    delete tokenSources()[wkspPath];
    inFlight.dispose();
    await stepsOnly;

    assert.strictEqual(parseFeatureFilesStub.callCount, 1, 'the superseded parse may not have finished the tree, so rebuild it');
  });
});
