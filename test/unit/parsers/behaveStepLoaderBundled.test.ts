// Unit tests for behaveStepLoader - bundled libs argument passing

import * as assert from 'assert';
import * as childProcess from 'child_process';
import { EventEmitter } from 'events';
import * as sinon from 'sinon';
import type { BehaveStepDefinition } from '../../../src/parsers/behaveStepLoader';
import { getBundledBehavePath } from '../../../src/bundledBehave';

// Stub diagLog before module loading
// eslint-disable-next-line @typescript-eslint/no-var-requires
const loggerModule = require('../../../src/logger');

suite('behaveStepLoader bundled libs', () => {

  let spawnStub: sinon.SinonStub;
  let diagLogStub: sinon.SinonStub;
  let mockProcess: MockChildProcess;
  let loadStepsFromBehave: (
    pythonExec: string,
    projectPath: string,
    stepsPaths: string[],
    bundledLibsPath?: string
  ) => Promise<BehaveStepDefinition[]>;

  class MockChildProcess extends EventEmitter {
    pid = 12345;
    stdout = new EventEmitter();
    stderr = new EventEmitter();
    kill = sinon.stub();
  }

  setup(() => {
    mockProcess = new MockChildProcess();
    spawnStub = sinon.stub(childProcess, 'spawn').returns(mockProcess as unknown as childProcess.ChildProcess);
    diagLogStub = sinon.stub(loggerModule, 'diagLog');
    void spawnStub;
    void diagLogStub;

    // Clear module cache to get fresh imports with stubs active
    for (const key of Object.keys(require.cache)) {
      if (key.includes('behaveStepLoader')) {
        delete require.cache[key];
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    loadStepsFromBehave = require('../../../src/parsers/behaveStepLoader').loadStepsFromBehave;
  });

  teardown(() => {
    sinon.restore();
  });

  test('passes --bundled-libs argument when bundledLibsPath is provided', async () => {
    setImmediate(() => {
      mockProcess.stdout.emit('data', '[]');
      mockProcess.emit('close', 0);
    });

    const bundledPath = getBundledBehavePath();
    await loadStepsFromBehave('python', '/project', ['/project/steps'], bundledPath);

    assert.ok(spawnStub.calledOnce, 'spawn should be called once');
    const args = spawnStub.firstCall.args[1] as string[];
    assert.ok(args.includes('--bundled-libs'), 'should include --bundled-libs flag');
    assert.ok(args.includes(bundledPath), 'should include the bundled libs path');
  });

  test('does not pass --bundled-libs when bundledLibsPath is undefined', async () => {
    setImmediate(() => {
      mockProcess.stdout.emit('data', '[]');
      mockProcess.emit('close', 0);
    });

    await loadStepsFromBehave('python', '/project', ['/project/steps']);

    assert.ok(spawnStub.calledOnce, 'spawn should be called once');
    const args = spawnStub.firstCall.args[1] as string[];
    assert.ok(!args.includes('--bundled-libs'), 'should NOT include --bundled-libs flag');
  });

  test('--bundled-libs is followed by the correct path value', async () => {
    setImmediate(() => {
      mockProcess.stdout.emit('data', '[]');
      mockProcess.emit('close', 0);
    });

    const bundledPath = getBundledBehavePath();
    await loadStepsFromBehave('python', '/project', ['/project/steps'], bundledPath);

    const args = spawnStub.firstCall.args[1] as string[];
    const flagIdx = args.indexOf('--bundled-libs');
    assert.ok(flagIdx >= 0, '--bundled-libs should be in args');
    assert.strictEqual(args[flagIdx + 1], bundledPath,
      'the value after --bundled-libs should be the bundled path');
  });

  test('does not pass --bundled-libs when bundledLibsPath is empty string', async () => {
    setImmediate(() => {
      mockProcess.stdout.emit('data', '[]');
      mockProcess.emit('close', 0);
    });

    await loadStepsFromBehave('python', '/project', ['/project/steps'], '');

    assert.ok(spawnStub.calledOnce, 'spawn should be called once');
    const args = spawnStub.firstCall.args[1] as string[];
    assert.ok(!args.includes('--bundled-libs'), 'should NOT include --bundled-libs flag for empty string');
  });

  test('falls back to bundled behave when environment behave is not installed', async () => {
    // First call: simulate "behave is not installed" error (no bundledLibsPath)
    // Second call (retry with bundled path): succeed
    let callCount = 0;

    // Replace the spawn stub with one that tracks calls
    spawnStub.restore();
    spawnStub = sinon.stub(childProcess, 'spawn').callsFake(() => {
      callCount++;
      const proc = new MockChildProcess();

      setImmediate(() => {
        if (callCount === 1) {
          // First call fails with "behave not installed"
          proc.stderr.emit('data', "ModuleNotFoundError: No module named 'behave'");
          proc.emit('close', 1);
        } else {
          // Second call (with bundled path) succeeds
          proc.stdout.emit('data', '[]');
          proc.emit('close', 0);
        }
      });

      return proc as unknown as childProcess.ChildProcess;
    });

    const result = await loadStepsFromBehave('python', '/project', ['/project/steps']);

    assert.strictEqual(callCount, 2, 'spawn should be called twice (original + fallback)');
    assert.deepStrictEqual(result, [], 'should return empty array from fallback');

    // Second call should include --bundled-libs
    const secondCallArgs = spawnStub.secondCall.args[1] as string[];
    assert.ok(secondCallArgs.includes('--bundled-libs'), 'fallback call should include --bundled-libs');
  });

  test('does not fall back when bundledLibsPath was already provided', async () => {
    // Simulate failure WITH bundledLibsPath — should NOT retry
    setImmediate(() => {
      mockProcess.stderr.emit('data', "ModuleNotFoundError: No module named 'behave'");
      mockProcess.emit('close', 1);
    });

    await assert.rejects(
      async () => await loadStepsFromBehave('python', '/project', ['/project/steps'], getBundledBehavePath()),
      /behave.*not.*installed/i,
      'should throw without fallback when bundledLibsPath was already set'
    );
    assert.ok(spawnStub.calledOnce, 'spawn should only be called once (no retry)');
  });

  test('does not fall back for non-behave import errors', async () => {
    setImmediate(() => {
      mockProcess.stderr.emit('data', "ImportError: cannot import name 'something' from 'mylib'");
      mockProcess.emit('close', 1);
    });

    await assert.rejects(
      async () => await loadStepsFromBehave('python', '/project', ['/project/steps']),
      /import.*error/i,
      'should throw without fallback for non-behave import errors'
    );
    assert.ok(spawnStub.calledOnce, 'spawn should only be called once (no retry)');
  });
});
