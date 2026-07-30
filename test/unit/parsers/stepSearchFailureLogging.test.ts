// Tests for the "step definition search failed" diagnostics. These paths were previously
// either silent or logged without enough context to act on, which is what makes a broken
// setup look like a broken extension.

import * as assert from 'assert';
import { EventEmitter } from 'events';
import * as childProcess from 'child_process';
import * as sinon from 'sinon';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const loggerModule = require('../../../src/logger');


suite('step definition search failure diagnostics', () => {

  let spawnStub: sinon.SinonStub;
  let mockProcess: MockChildProcess;
  let loadFromBehave: typeof import('../../../src/parsers/behaveLoader').loadFromBehave;

  class MockChildProcess extends EventEmitter {
    pid = 12345;
    stdout = new EventEmitter();
    stderr = new EventEmitter();
    kill = sinon.stub();
  }

  setup(() => {
    sinon.stub(loggerModule, 'diagLog');
    mockProcess = new MockChildProcess();
    spawnStub = sinon.stub(childProcess, 'spawn').returns(mockProcess as never);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    loadFromBehave = require('../../../src/parsers/behaveLoader').loadFromBehave;
  });

  teardown(() => {
    sinon.restore();
  });


  test('a non-zero exit reports the exact command so the user can reproduce it by hand', async () => {
    setImmediate(() => {
      mockProcess.stderr.emit('data', 'boom');
      mockProcess.emit('close', 3);
    });

    await assert.rejects(
      () => loadFromBehave('python', '/proj', ['/proj/features/steps']),
      (e: Error) => {
        assert.ok(e.message.includes('command: '), e.message);
        assert.ok(e.message.includes('discover.py'), e.message);
        assert.ok(e.message.includes('stderr:'), e.message);
        return true;
      });
  });

  test('stdout is reported too - discover.py can fail after writing partial JSON', async () => {
    setImmediate(() => {
      mockProcess.stdout.emit('data', '{"steps": [');
      mockProcess.stderr.emit('data', 'killed');
      mockProcess.emit('close', 1);
    });

    await assert.rejects(
      () => loadFromBehave('python', '/proj', ['/proj/features/steps']),
      (e: Error) => {
        assert.ok(e.message.includes('stdout:'), e.message);
        assert.ok(e.message.includes('{"steps": ['), e.message);
        return true;
      });
  });

  test('a missing interpreter says so rather than just reporting the errno', async () => {
    setImmediate(() => {
      const err: NodeJS.ErrnoException = new Error('spawn nonexistent-python ENOENT');
      err.code = 'ENOENT';
      mockProcess.emit('error', err);
    });

    await assert.rejects(
      () => loadFromBehave('nonexistent-python', '/proj', ['/proj/features/steps']),
      (e: Error) => {
        assert.ok(e.message.includes('nonexistent-python'), e.message);
        assert.ok(e.message.includes('Python: Select Interpreter'), e.message);
        return true;
      });
  });

  test('an import error does NOT trigger the bundled-behave fallback', async () => {
    // regression: the error message embeds the command line, whose discover.py path contains
    // the substring "behave". Classifying the failure from that message made every ImportError
    // look like "behave is not installed", re-spawning the bundled fallback and hanging.
    setImmediate(() => {
      mockProcess.stderr.emit('data', "ImportError: cannot import name 'x' from 'lib.helpers'");
      mockProcess.emit('close', 1);
    });

    await assert.rejects(
      () => loadFromBehave('python', '/proj', ['/proj/features/steps']),
      /import error in step files/i);

    assert.strictEqual(spawnStub.callCount, 1, 'must not re-spawn for the bundled fallback');
  });

  test('a genuinely missing behave still triggers the bundled fallback', async () => {
    const second = new MockChildProcess();
    spawnStub.onSecondCall().returns(second as never);

    setImmediate(() => {
      mockProcess.stderr.emit('data', "ModuleNotFoundError: No module named 'behave'");
      mockProcess.emit('close', 1);
      setImmediate(() => {
        second.stdout.emit('data', JSON.stringify({ steps: [], fixtures: [] }));
        second.emit('close', 0);
      });
    });

    const result = await loadFromBehave('python', '/proj', ['/proj/features/steps']);

    assert.deepStrictEqual(result.steps, []);
    assert.strictEqual(spawnStub.callCount, 2, 'should retry once with bundled behave');
  });

});
