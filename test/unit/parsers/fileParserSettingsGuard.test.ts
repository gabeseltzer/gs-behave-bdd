// Regression: parseFilesForWorkspace must silently no-op when config.workspaceSettings[uri.path]
// is undefined (FATAL WorkspaceSettings construction error). It must NOT cascade a second user-facing
// error notification, must NOT call _parseFeatureFiles, and must leave parse state in a clean post-completion
// shape so a later successful call (after the user fixes config) is not poisoned.

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { FileParser } from '../../../src/parsers/fileParser';
import { WorkspaceSettings } from '../../../src/settings';
import * as commonModule from '../../../src/common';
import * as configModule from '../../../src/configuration';

suite('fileParser - settings guard', () => {
  let fileParser: FileParser;
  let parseFeatureFilesStub: sinon.SinonStub;
  let _parseStepsFilesStub: sinon.SinonStub;
  let showErrorStub: sinon.SinonStub;
  let workspaceSettingsValue: Record<string, WorkspaceSettings>;

  const wkspUri = vscode.Uri.file('c:/test-workspace-fatal');

  setup(() => {
    fileParser = new FileParser();

    // Default: empty -> guard should fire on first call.
    workspaceSettingsValue = {};
    sinon.stub(configModule.config, 'workspaceSettings').get(() => workspaceSettingsValue);

    // getWorkspaceFolder is called BEFORE the guard (for the callName log line); stub it defensively.
    sinon.stub(commonModule, 'getWorkspaceFolder').returns({
      uri: wkspUri,
      name: 'test-workspace-fatal',
      index: 0,
    } as vscode.WorkspaceFolder);

    // Stub the private parse methods on the instance so we can assert they are not invoked by the guard,
    // and resolve cleanly when the second test exercises the happy path.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parseFeatureFilesStub = sinon.stub(fileParser as any, '_parseFeatureFiles').resolves(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _parseStepsFilesStub = sinon.stub(fileParser as any, '_parseStepsFiles').resolves(0);

    showErrorStub = sinon.stub(configModule.config.logger, 'showError');
    sinon.stub(configModule.config.logger, 'showWarn');
    sinon.stub(configModule.config.logger, 'logInfo');
    sinon.stub(configModule.config.logger, 'show');
  });

  teardown(() => {
    fileParser.dispose();
    sinon.restore();
  });

  test('returns undefined and does not throw when wkspSettings is undefined', async () => {
    const result = await fileParser.parseFilesForWorkspace(
      wkspUri,
      {} as never,
      {} as vscode.TestController,
      'unit-test',
      false,
    );

    assert.strictEqual(result, undefined, 'expected undefined return from guard');
  });

  test('does NOT call _parseFeatureFiles when wkspSettings is undefined', async () => {
    await fileParser.parseFilesForWorkspace(
      wkspUri,
      {} as never,
      {} as vscode.TestController,
      'unit-test',
      false,
    );

    assert.strictEqual(parseFeatureFilesStub.callCount, 0,
      'guard must short-circuit before _parseFeatureFiles');
  });

  test('does NOT call logger.showError (configuration getter owns that)', async () => {
    await fileParser.parseFilesForWorkspace(
      wkspUri,
      {} as never,
      {} as vscode.TestController,
      'unit-test',
      false,
    );

    assert.strictEqual(showErrorStub.callCount, 0,
      'guard must remain silent — configuration.ts already surfaced the FATAL error');
  });

  test('state is not permanently poisoned: a second call with valid settings proceeds', async () => {
    // First call hits the guard.
    const firstResult = await fileParser.parseFilesForWorkspace(
      wkspUri,
      {} as never,
      {} as vscode.TestController,
      'unit-test-first',
      false,
    );
    assert.strictEqual(firstResult, undefined);
    assert.strictEqual(parseFeatureFilesStub.callCount, 0);

    // Now provide a minimally-shaped WorkspaceSettings for the same uri and call again.
    // The parser should proceed past the guard and invoke _parseFeatureFiles.
    workspaceSettingsValue = {
      [wkspUri.path]: {
        uri: wkspUri,
        name: 'test-workspace-fatal',
        featuresUri: vscode.Uri.joinPath(wkspUri, 'features'),
        featuresUris: [vscode.Uri.joinPath(wkspUri, 'features')],
        stepsSearchUri: vscode.Uri.joinPath(wkspUri, 'steps'),
        stepsSearchUris: [vscode.Uri.joinPath(wkspUri, 'steps')],
        projectUri: wkspUri,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any as WorkspaceSettings,
    };

    await fileParser.parseFilesForWorkspace(
      wkspUri,
      {} as never,
      {
        // _parseFeatureFiles is stubbed; the surrounding code after it touches ctrl/testData only inside
        // _parseFeatureFiles / _parseStepsFiles. After those return, rebuildStepMappings runs over the
        // (empty) featuresUris ... actually featuresUris has one entry. We need to dodge that path.
        // The simplest way: assert that _parseFeatureFiles was called at least once and ignore any
        // subsequent failure inside the parser by catching it here — we only care about the guard.
      } as vscode.TestController,
      'unit-test-second',
      false,
    ).catch(() => { /* downstream rebuildStepMappings/etc may throw on fake ctrl — irrelevant to guard */ });

    assert.ok(parseFeatureFilesStub.callCount >= 1,
      'second call with valid settings must reach _parseFeatureFiles (state not poisoned)');
  });
});
