// Regression: when configurationChangedHandler (or activation) calls
// clearTestItemsAndParseFilesForAllWorkspaces after the user breaks projectPath
// in settings.json, getUrisOfWkspFoldersWithFeatures filters that workspace out.
// The for-loop iterates 0 workspaces → no parseFilesForWorkspace runs → no
// _notifyStatusChange(false) fires → the busy spinner from initial activation
// stays stuck. Also covers markWorkspaceFatalSettings as an external seam for
// "configured but excluded" workspaces.

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { FileParser } from '../../../src/parsers/fileParser';
import * as commonModule from '../../../src/common';

suite('fileParser - status notifications when no workspaces discovered', () => {
  let fileParser: FileParser;
  let getUrisStub: sinon.SinonStub;

  setup(() => {
    fileParser = new FileParser();
  });

  teardown(() => {
    fileParser.dispose();
    sinon.restore();
  });

  test('clearTestItemsAndParseFilesForAllWorkspaces fires status-change(false) when 0 workspaces', async () => {
    getUrisStub = sinon.stub(commonModule, 'getUrisOfWkspFoldersWithFeatures').returns([]);

    const handler = sinon.stub();
    fileParser.onStatusChange(handler);

    const ctrl = { items: { forEach: () => undefined, delete: () => undefined } } as unknown as vscode.TestController;
    await fileParser.clearTestItemsAndParseFilesForAllWorkspaces(
      new Map() as never, ctrl, 'unit-test', true,
    );

    const busyFalse = handler.getCalls().find(c => c.args[0] === false);
    assert.ok(busyFalse,
      'when discovery returns 0 workspaces, the clear-and-parse-all entry point must still fire ' +
      'status-change(false) — otherwise the "Behave: Parsing..." spinner from activation never clears');
    assert.ok(getUrisStub.called, 'sanity: stubbed getUrisOfWkspFoldersWithFeatures was consulted');
  });

  test('markWorkspaceFatalSettings sets hasFatalSettings AND fires status-change(false)', () => {
    const handler = sinon.stub();
    fileParser.onStatusChange(handler);

    assert.strictEqual(fileParser.hasFatalSettings(), false, 'precondition: no fatals before mark');

    fileParser.markWorkspaceFatalSettings(vscode.Uri.file('c:/bad-wksp'));

    assert.strictEqual(fileParser.hasFatalSettings(), true,
      'markWorkspaceFatalSettings must flip hasFatalSettings to true');
    assert.ok(handler.calledWith(false),
      'markWorkspaceFatalSettings must fire _notifyStatusChange(false) so the status handler updates immediately');
  });

  test('clearWorkspaceFatalSettings removes the marker (fix-then-reload cycle)', () => {
    const uri = vscode.Uri.file('c:/bad-wksp');
    fileParser.markWorkspaceFatalSettings(uri);
    assert.strictEqual(fileParser.hasFatalSettings(), true, 'precondition: marker is set');

    fileParser.clearWorkspaceFatalSettings(uri);
    assert.strictEqual(fileParser.hasFatalSettings(), false,
      'clearWorkspaceFatalSettings must drop the marker so a subsequent fix re-renders as Ready');
  });
});
