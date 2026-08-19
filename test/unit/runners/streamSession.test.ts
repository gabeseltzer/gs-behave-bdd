// Unit tests for StreamSession - one NDJSON stream per behave process.
//
// The reason this class exists: behave's StreamOpener opens a formatter outfile with
// codecs.open(name, "w"). When runParallel spawns one behave per feature, every one of
// them pointed at a single shared path would truncate it on open and interleave its
// writes into it. So the property that matters most below is simply that two spawns
// never get the same file - the rest guards the plumbing around that.

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { StreamSession } from '../../../src/runners/streamSession';
import { StreamResultReporter } from '../../../src/runners/streamResults';
import { BehaveEvent } from '../../../src/runners/streamEvents';

suite('streamSession', () => {

  let handled: BehaveEvent[];
  let dirsToRemove: string[];
  let sessions: StreamSession[];

  setup(() => {
    handled = [];
    dirsToRemove = [];
    sessions = [];
  });

  teardown(() => {
    // open() starts a polling timer per stream; an unstopped one keeps the node
    // process (and so mocha) alive forever.
    sessions.forEach(s => s.stopAll());
    for (const dir of dirsToRemove) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      }
      catch {
        // best effort
      }
    }
  });

  /** Records what reached the single per-run reporter, whichever stream it came from. */
  const makeReporter = () => ({
    handle: (events: BehaveEvent[]) => handled.push(...events),
  }) as unknown as StreamResultReporter;

  const makeSession = (runName = 'run1', wkspName = 'wksp') => {
    const session = new StreamSession(runName, wkspName, makeReporter());
    sessions.push(session);
    return session;
  };

  /** StreamSession does not create the directory - testRunHandler does, once per run. */
  const ensureDir = (fsPath: string) => {
    const dir = path.dirname(fsPath);
    fs.mkdirSync(dir, { recursive: true });
    dirsToRemove.push(dir);
    return dir;
  };

  const writeEvents = (fsPath: string, events: unknown[]) =>
    fs.writeFileSync(fsPath, events.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');

  const scenarioEnd = (file: string, line: number, status = 'passed') =>
    ({ event: 'scenario', phase: 'end', file, line, status });


  test('gives every spawn its own file, even for the same label', () => {
    const session = makeSession();

    const first = session.open('basic');
    const second = session.open('basic');

    assert.notStrictEqual(first.fsPath, second.fsPath,
      'two behave processes must never share a stream file');
    assert.ok(first.fsPath.endsWith('.ndjson'));
    assert.ok(second.fsPath.endsWith('.ndjson'));
    assert.strictEqual(path.dirname(first.fsPath), path.dirname(second.fsPath),
      'both belong to the same run + workspace directory');
    assert.strictEqual(session.streamCount, 2);
  });


  test('separates streams by run and by workspace', () => {
    const a = makeSession('run1', 'wkspA').open('f');
    const b = makeSession('run1', 'wkspB').open('f');
    const c = makeSession('run2', 'wkspA').open('f');

    assert.notStrictEqual(path.dirname(a.fsPath), path.dirname(b.fsPath));
    assert.notStrictEqual(path.dirname(a.fsPath), path.dirname(c.fsPath));
  });


  test('sanitises labels into filesystem-safe, bounded names', () => {
    const session = makeSession();

    const spaced = session.open('some feature name');
    const nasty = session.open('a/b\\c:d*e?f');
    const long = session.open('x'.repeat(300));
    const empty = session.open('///');

    for (const uri of [spaced, nasty, long, empty]) {
      const name = path.basename(uri.fsPath);
      assert.ok(/^[0-9]+-[A-Za-z0-9._-]+\.ndjson$/.test(name), `unexpected stream file name: ${name}`);
      assert.ok(name.length < 80, `stream file name not bounded: ${name.length}`);
    }
  });


  test('feeds events from several concurrent streams into the one reporter', () => {
    const session = makeSession();

    const one = session.open('feature-one');
    const two = session.open('feature-two');
    ensureDir(one.fsPath);

    // Both behave processes write at the same time, as they do in parallel mode.
    writeEvents(one.fsPath, [
      { event: 'testrun', phase: 'start', protocol: 1 },
      scenarioEnd('features/one.feature', 3),
    ]);
    writeEvents(two.fsPath, [
      { event: 'testrun', phase: 'start', protocol: 1 },
      scenarioEnd('features/two.feature', 7, 'failed'),
    ]);

    session.stopAll();

    const scenarios = handled.filter(e => e.event === 'scenario');
    assert.strictEqual(scenarios.length, 2, 'both streams should have been drained');
    assert.deepStrictEqual(scenarios.map(e => e.file).sort(),
      ['features/one.feature', 'features/two.feature']);
  });


  test('an unsupported protocol silences only the stream that declared it', () => {
    const session = makeSession();

    const future = session.open('future');
    const current = session.open('current');
    ensureDir(future.fsPath);

    writeEvents(future.fsPath, [
      { event: 'testrun', phase: 'start', protocol: 99 },
      scenarioEnd('features/future.feature', 3),
    ]);
    writeEvents(current.fsPath, [
      { event: 'testrun', phase: 'start', protocol: 1 },
      scenarioEnd('features/current.feature', 5),
    ]);

    session.stopAll();

    const files = handled.filter(e => e.event === 'scenario').map(e => e.file);
    assert.deepStrictEqual(files, ['features/current.feature'],
      'the future-protocol stream should defer to junit without taking the others down');
  });


  test('stopAll drains what was written after the last poll, and is safe to repeat', () => {
    const session = makeSession();
    const uri = session.open('late');
    ensureDir(uri.fsPath);

    // Nothing has been read yet; everything below arrives on the final drain.
    writeEvents(uri.fsPath, [scenarioEnd('features/late.feature', 11)]);

    session.stopAll();
    assert.strictEqual(handled.filter(e => e.event === 'scenario').length, 1);

    session.stopAll();
    assert.strictEqual(handled.filter(e => e.event === 'scenario').length, 1,
      'a second stopAll must not re-deliver events');
  });


  test('a stream whose file never appears is harmless', () => {
    const session = makeSession();
    session.open('never-spawned');

    session.stopAll();

    assert.strictEqual(handled.length, 0);
  });

});
