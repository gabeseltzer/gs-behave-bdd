// Unit tests for the two ways the junit watcher stands down when the live event
// stream has already settled a result (plan items L-4 and L-5).
//
// Both exist because streaming demotes junit from the result SOURCE to a verifier.
// Before these, a streamed run still paid the full junit cost at the end: it waited a
// grace period for junit files it no longer needed, and re-read and re-parsed each
// feature's xml (twice, since the watcher raises onDidCreate AND onDidChange) only for
// updateTest() to early-return on every scenario in it.

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { JunitWatcher } from '../../../src/watchers/junitWatcher';
import { QueueItemMapEntry } from '../../../src/parsers/junitParser';
import { markSettled, clearSettled } from '../../../src/runners/streamResults';
import { QueueItem } from '../../../src/extension';
import { config } from '../../../src/configuration';

suite('junitWatcher - standing down for the event stream', () => {

  const RUN_NAME = 'run-42';

  let dir: string;
  let shownErrors: unknown[];
  let originalShowError: unknown;

  const makeRun = (cancelled = false) => ({
    name: RUN_NAME,
    token: { isCancellationRequested: cancelled },
  }) as unknown as vscode.TestRun;

  const makeEntry = (id: string, junitFileUri: vscode.Uri): QueueItemMapEntry =>
    new QueueItemMapEntry(
      { test: { id } } as unknown as QueueItem,
      junitFileUri,
      { uri: vscode.Uri.file('/wksp'), name: 'wksp' } as never,
    );

  /** Puts a run into the watcher's private list, as startWatchingRun would. */
  const primeWatcher = (watcher: JunitWatcher, run: vscode.TestRun, queue: QueueItemMapEntry[], debug = false) => {
    (watcher as unknown as { _currentRuns: unknown[] })._currentRuns =
      [{ run, debug, queue }];
  };

  const currentRuns = (watcher: JunitWatcher) =>
    (watcher as unknown as { _currentRuns: unknown[] })._currentRuns;

  setup(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-bdd-junitw-'));
    shownErrors = [];
    originalShowError = config.logger.showError;
    config.logger.showError = (e: unknown) => { shownErrors.push(e); };
  });

  teardown(() => {
    clearSettled(RUN_NAME);
    config.logger.showError = originalShowError as typeof config.logger.showError;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    catch {
      // best effort
    }
  });


  suite('L-4: the run-end grace period', () => {

    test('is not paid at all when the stream settled every scenario', async () => {
      const watcher = new JunitWatcher();
      const run = makeRun();
      // A junit path that does not exist: if the grace period were waited out, the
      // code past it would go looking for these files.
      const queue = [
        makeEntry('scenario-1', vscode.Uri.file(path.join(dir, 'never-written-1.xml'))),
        makeEntry('scenario-2', vscode.Uri.file(path.join(dir, 'never-written-2.xml'))),
      ];
      primeWatcher(watcher, run, queue);
      queue.forEach(q => markSettled(RUN_NAME, q.queueItem.test.id));

      const start = Date.now();
      await watcher.stopWatchingRun(run);
      const elapsed = Date.now() - start;

      assert.ok(elapsed < 200,
        `expected the run end to be immediate for a fully streamed run, took ${elapsed}ms`);
      assert.strictEqual(currentRuns(watcher).length, 0, 'the run should still be cleaned up');
    });


    test('is still paid for a scenario the stream did not settle', async () => {
      const watcher = new JunitWatcher();
      // Cancelled, so the post-grace path does not try to report a missing junit file
      // as an error - this test is only about the wait itself.
      const run = makeRun(true);
      const queue = [
        makeEntry('settled', vscode.Uri.file(path.join(dir, 'a.xml'))),
        makeEntry('not-settled', vscode.Uri.file(path.join(dir, 'b.xml'))),
      ];
      primeWatcher(watcher, run, queue);
      markSettled(RUN_NAME, 'settled');

      const start = Date.now();
      await watcher.stopWatchingRun(run);
      const elapsed = Date.now() - start;

      assert.ok(elapsed >= 300,
        `expected to wait for the unsettled scenario's junit file, took only ${elapsed}ms`);
    });


    test('an item already updated by junit also does not hold the run open', async () => {
      const watcher = new JunitWatcher();
      const run = makeRun();
      const queue = [makeEntry('done', vscode.Uri.file(path.join(dir, 'c.xml')))];
      queue[0].updated = true;
      primeWatcher(watcher, run, queue);

      const start = Date.now();
      await watcher.stopWatchingRun(run);

      assert.ok(Date.now() - start < 200, 'a fully updated run should not wait either');
    });

  });


  suite('L-5: re-reading and re-parsing the feature xml', () => {

    /** _updateResult is the watcher's onDidCreate/onDidChange handler. */
    const updateResult = (watcher: JunitWatcher, uri: vscode.Uri, caller = 'onDidCreate') =>
      (watcher as unknown as {
        _updateResult: (u: vscode.Uri, c: string) => Promise<void>
      })._updateResult(uri, caller);


    test('is skipped entirely when every scenario in the file is already settled', async () => {
      const watcher = new JunitWatcher();
      const run = makeRun();
      // Deliberately unparseable. If the file were read and parsed, xml2js would fail
      // (after retrying), and _updateResult would surface an error.
      const junitFile = path.join(dir, 'garbage.xml');
      fs.writeFileSync(junitFile, '<<< this is not xml at all', 'utf8');
      const uri = vscode.Uri.file(junitFile);

      const queue = [makeEntry('scenario-1', uri), makeEntry('scenario-2', uri)];
      primeWatcher(watcher, run, queue);
      queue.forEach(q => markSettled(RUN_NAME, q.queueItem.test.id));

      const start = Date.now();
      await updateResult(watcher, uri);
      const elapsed = Date.now() - start;

      assert.deepStrictEqual(shownErrors, [],
        'the xml must not have been parsed, so nothing should have failed');
      assert.ok(elapsed < 200,
        `expected no read or parse, but it took ${elapsed}ms (parse retries take ~400ms)`);
      assert.ok(queue.every(q => q.updated),
        'the entries must still be marked updated, or the run end would wait for them');
    });


    test('still parses when even one scenario in the file is unsettled', async () => {
      const watcher = new JunitWatcher();
      const run = makeRun();
      const junitFile = path.join(dir, 'garbage2.xml');
      fs.writeFileSync(junitFile, '<<< this is not xml at all', 'utf8');
      const uri = vscode.Uri.file(junitFile);

      const queue = [makeEntry('settled', uri), makeEntry('unsettled', uri)];
      primeWatcher(watcher, run, queue);
      markSettled(RUN_NAME, 'settled');

      await updateResult(watcher, uri);

      // The parse was attempted and failed on the garbage, which is the proof that
      // junit is still consulted whenever the stream left anything unresolved.
      assert.strictEqual(shownErrors.length, 1,
        'expected the unparseable junit file to be reported');
    });

  });

});
