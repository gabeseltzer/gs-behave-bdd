// Regression: configurationChangedHandler's per-workspace reloadSettings must
// not let a thrown WkspError bubble out of the loop — otherwise the trailing
// parser.clearTestItemsAndParseFilesForAllWorkspaces never runs and the
// language-status item is stuck at "Behave: Ready" while toasts complain
// about invalid settings.

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { reloadSettingsAndSurfaceError, WkspError } from '../../../src/common';

suite('reloadSettingsAndSurfaceError (260518-hyz follow-up)', () => {
  const wkspUri = vscode.Uri.file('c:/fake-wksp');

  teardown(() => sinon.restore());

  test('returns true and does NOT call showError when reload succeeds', () => {
    const reload = sinon.stub();
    const showError = sinon.stub();

    const ok = reloadSettingsAndSurfaceError(reload, showError, wkspUri);

    assert.strictEqual(ok, true, 'success path must return true');
    assert.strictEqual(reload.callCount, 1);
    assert.strictEqual(showError.callCount, 0, 'showError must not fire on the happy path');
  });

  test('returns false and surfaces the error with workspace context when reload throws', () => {
    const err = new WkspError('project path "autotest" not found.', wkspUri);
    const reload = sinon.stub().throws(err);
    const showError = sinon.stub();

    const ok = reloadSettingsAndSurfaceError(reload, showError, wkspUri);

    assert.strictEqual(ok, false, 'failure path must return false');
    assert.strictEqual(showError.callCount, 1, 'showError must be invoked exactly once');
    assert.strictEqual(showError.firstCall.args[0], err,
      'the original error must be forwarded so WkspError.actions are honored');
    assert.strictEqual(showError.firstCall.args[1], wkspUri,
      'wkspUri must be passed so the "<name> workspace:" log prefix renders');
  });

  test('does NOT rethrow — caller loops must continue past a single bad workspace', () => {
    const reload = sinon.stub().throws(new Error('boom'));
    const showError = sinon.stub();

    assert.doesNotThrow(
      () => reloadSettingsAndSurfaceError(reload, showError, wkspUri),
      'helper must swallow the throw so the outer loop iterates over remaining workspaces',
    );
  });

  test('forwards non-WkspError throws to showError too (defensive — unexpected ctor errors must still surface)', () => {
    const err = new TypeError('boom');
    const reload = sinon.stub().throws(err);
    const showError = sinon.stub();

    const ok = reloadSettingsAndSurfaceError(reload, showError, wkspUri);

    assert.strictEqual(ok, false);
    assert.strictEqual(showError.firstCall.args[0], err);
  });
});
