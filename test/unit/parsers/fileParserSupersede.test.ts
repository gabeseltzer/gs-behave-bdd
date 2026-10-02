// Regression: parseFilesForWorkspace is re-entrant and not generally awaited, so each call is
// meant to supersede the one before it. But only the call HOLDING the workspace's cancel token
// was cancelled. A call still WAITING for the slot was not, so with three overlapping calls -
// #1 running, #2 and #3 both waiting on it - #3 could claim the slot first and finish, and then
// #2, the older one, would run anyway and clear the test items out from under whatever #3's
// caller did next. (Seen in the debug integration suite: the run started with an empty queue.)

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { FileParser } from '../../../src/parsers/fileParser';
import { WorkspaceSettings } from '../../../src/settings';
import * as commonModule from '../../../src/common';
import * as configModule from '../../../src/configuration';

suite('fileParser - a newer parseFilesForWorkspace call supersedes a waiting one', () => {
  let fileParser: FileParser;
  let logInfoStub: sinon.SinonStub;
  let workspaceSettingsValue: Record<string, WorkspaceSettings>;

  const wkspUri = vscode.Uri.file('c:/test-workspace-supersede');
  const wkspPath = wkspUri.path;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokenSources = () => (fileParser as any)._cancelTokenSources as Record<string, vscode.CancellationTokenSource>;
  const parse = () => fileParser.parseFilesForWorkspace(wkspUri, {} as never, {} as vscode.TestController, 'unit-test', false);
  const tick = (ms: number) => new Promise(t => setTimeout(t, ms));

  setup(() => {
    fileParser = new FileParser();

    // Empty settings take the guard path, which logs once per call that gets past the wait -
    // so the logInfo call count is the number of calls that actually ran.
    workspaceSettingsValue = {};
    sinon.stub(configModule.config, 'workspaceSettings').get(() => workspaceSettingsValue);
    sinon.stub(commonModule, 'getWorkspaceFolder').returns({
      uri: wkspUri, name: 'test-workspace-supersede', index: 0,
    } as vscode.WorkspaceFolder);
    sinon.stub(commonModule, 'getUrisOfWkspFoldersWithFeatures').returns([]);
    logInfoStub = sinon.stub(configModule.config.logger, 'logInfo');
  });

  teardown(() => {
    fileParser.dispose();
    sinon.restore();
  });

  test('of two calls waiting on an in-flight one, only the newer runs', async () => {
    // an in-flight call #1 holds the slot
    const inFlight = new vscode.CancellationTokenSource();
    tokenSources()[wkspPath] = inFlight;

    const older = parse();
    const newer = parse();
    await tick(60);

    // #1 finishes and releases the slot; both waiters wake
    delete tokenSources()[wkspPath];
    inFlight.dispose();
    await Promise.all([older, newer]);

    assert.strictEqual(logInfoStub.callCount, 1,
      'the older waiter must step aside once a newer call has been made, not run after it');
    assert.strictEqual(tokenSources()[wkspPath], undefined, 'no token left behind');
  });

  test('a superseded call does not release the newer call\'s token', async () => {
    const inFlight = new vscode.CancellationTokenSource();
    tokenSources()[wkspPath] = inFlight;
    const older = parse();
    await tick(30);

    // the slot frees and a newer call claims it straight away, while the older one is still asleep
    workspaceSettingsValue = { [wkspPath]: {} as WorkspaceSettings };
    let releaseNewer: () => void = () => undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sinon.stub(fileParser as any, '_parseFeatureFiles').returns(new Promise<number>(r => { releaseNewer = () => r(0); }));
    delete tokenSources()[wkspPath];
    inFlight.dispose();
    const newer = parse();
    const newersToken = tokenSources()[wkspPath];
    assert.ok(newersToken, 'precondition: the newer call holds the slot');

    await older;
    assert.strictEqual(tokenSources()[wkspPath], newersToken,
      'the superseded call must not dispose or delete a token it never owned');

    // let the newer call bail out at its first cancellation check
    newersToken.cancel();
    releaseNewer();
    await newer;
  });
});
