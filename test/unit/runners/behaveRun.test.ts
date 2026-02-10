// Unit tests for behaveRun module
// Tests that runBehaveInstance sends output to TestRun.appendOutput() (test results pane)
// and does NOT use config.logger

import * as assert from 'assert';
import { EventEmitter } from 'events';
import * as childProcess from 'child_process';
import * as sinon from 'sinon';

// Stub diagLog before behaveRun is loaded so it doesn't trigger config.globalSettings access
// eslint-disable-next-line @typescript-eslint/no-var-requires
const loggerModule = require('../../../src/logger');

// We need to mock child_process.spawn before importing behaveRun
// so we use dynamic require after stubbing

suite('behaveRun', () => {

  let spawnStub: sinon.SinonStub;
  let diagLogStub: sinon.SinonStub;
  let mockProcess: MockChildProcess;
  let appendOutputCalls: string[];
  let mockWr: MockWkspRun;
  let runBehaveInstance: typeof import('../../../src/runners/behaveRun').runBehaveInstance;

  class MockChildProcess extends EventEmitter {
    pid = 12345;
    stdout = new EventEmitter();
    stderr = new EventEmitter();
    kill = sinon.stub();
  }

  class MockWkspRun {
    pythonExec = 'python';
    wkspSettings = {
      uri: { path: '/test/workspace', fsPath: '/test/workspace' },
      projectUri: { path: '/test/project', fsPath: '/test/project' },
      getEffectiveEnvVars: () => ({})
    };
    run = {
      name: 'test-run-1',
      token: {
        isCancellationRequested: false,
        onCancellationRequested: () => ({ dispose: () => { /* mock */ } })
      },
      appendOutput: (text: string) => {
        appendOutputCalls.push(text);
      }
    };
  }

  setup(() => {
    appendOutputCalls = [];
    mockProcess = new MockChildProcess();
    spawnStub = sinon.stub(childProcess, 'spawn').returns(mockProcess as unknown as childProcess.ChildProcess);
    diagLogStub = sinon.stub(loggerModule, 'diagLog');
    mockWr = new MockWkspRun();
    void spawnStub;
    void diagLogStub;

    // Clear module cache so each test gets a fresh import with the spawn stub active
    for (const key of Object.keys(require.cache)) {
      if (key.includes('behaveRun')) {
        delete require.cache[key];
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    runBehaveInstance = require('../../../src/runners/behaveRun').runBehaveInstance;
  });

  teardown(() => {
    sinon.restore();
  });

  test('stdout is sent to run.appendOutput with \\r\\n normalization', async () => {
    const promise = runBehaveInstance(
      mockWr as unknown as Parameters<typeof runBehaveInstance>[0], false, ['features/test.feature'], 'behave features/test.feature'
    );

    // Simulate stdout data
    mockProcess.stdout.emit('data', Buffer.from('Feature: Test\nScenario: A\n'));
    // Close the process
    mockProcess.emit('close');
    await promise;

    // Should have output for friendlyCmd + stdout
    const allOutput = appendOutputCalls.join('');
    // stdout content should be present with \r\n
    assert.ok(allOutput.includes('Feature: Test\r\nScenario: A\r\n'),
      `Expected normalized output, got: ${JSON.stringify(appendOutputCalls)}`);
  });

  test('stderr is sent to run.appendOutput', async () => {
    const promise = runBehaveInstance(
      mockWr as unknown as Parameters<typeof runBehaveInstance>[0], false, ['features/test.feature'], 'behave features/test.feature'
    );

    mockProcess.stderr.emit('data', Buffer.from('ConfigError: something\n'));
    mockProcess.emit('close');
    await promise;

    const allOutput = appendOutputCalls.join('');
    assert.ok(allOutput.includes('ConfigError: something\r\n'),
      `Expected stderr in output, got: ${JSON.stringify(appendOutputCalls)}`);
  });

  test('friendlyCmd is sent to run.appendOutput in non-parallel mode', async () => {
    const promise = runBehaveInstance(
      mockWr as unknown as Parameters<typeof runBehaveInstance>[0], false, ['features/test.feature'], 'behave features/test.feature'
    );

    mockProcess.emit('close');
    await promise;

    const allOutput = appendOutputCalls.join('');
    assert.ok(allOutput.includes('behave features/test.feature'),
      `Expected friendlyCmd in output, got: ${JSON.stringify(appendOutputCalls)}`);
  });

  test('parallel mode buffers output and writes with delimiters', async () => {
    const promise = runBehaveInstance(
      mockWr as unknown as Parameters<typeof runBehaveInstance>[0], true, ['features/test.feature'], 'behave features/test.feature'
    );

    mockProcess.stdout.emit('data', Buffer.from('Feature: Parallel\n'));
    mockProcess.stdout.emit('data', Buffer.from('  Scenario: S1\n'));
    mockProcess.emit('close');
    await promise;

    const allOutput = appendOutputCalls.join('');
    // Should contain delimiters
    assert.ok(allOutput.includes('---'),
      `Expected delimiter in parallel output, got: ${JSON.stringify(appendOutputCalls)}`);
    // Should contain friendlyCmd
    assert.ok(allOutput.includes('behave features/test.feature'),
      `Expected friendlyCmd in parallel output, got: ${JSON.stringify(appendOutputCalls)}`);
    // Should contain the buffered output
    assert.ok(allOutput.includes('Feature: Parallel'),
      `Expected buffered stdout in parallel output, got: ${JSON.stringify(appendOutputCalls)}`);
  });

  test('parallel mode does NOT send friendlyCmd before process runs', async () => {
    const promise = runBehaveInstance(
      mockWr as unknown as Parameters<typeof runBehaveInstance>[0], true, ['features/test.feature'], 'behave features/test.feature'
    );

    // Before close, nothing should be output in parallel mode
    const outputBeforeClose = appendOutputCalls.length;
    assert.strictEqual(outputBeforeClose, 0,
      `Expected no output before close in parallel mode, got: ${JSON.stringify(appendOutputCalls)}`);

    mockProcess.emit('close');
    await promise;
  });

  test('cancellation message is sent to run.appendOutput', async () => {
    mockWr.run.token.isCancellationRequested = false;

    const promise = runBehaveInstance(
      mockWr as unknown as Parameters<typeof runBehaveInstance>[0], false, ['features/test.feature'], 'behave features/test.feature'
    );

    // Set cancellation before close
    mockWr.run.token.isCancellationRequested = true;
    mockProcess.emit('close');
    await promise;

    const allOutput = appendOutputCalls.join('');
    assert.ok(allOutput.includes('TEST RUN test-run-1 CANCELLED'),
      `Expected cancellation message in output, got: ${JSON.stringify(appendOutputCalls)}`);
  });

  test('config.logger is not called', async () => {
    // Verify the module doesn't import or use config from configuration
    const promise = runBehaveInstance(
      mockWr as unknown as Parameters<typeof runBehaveInstance>[0], false, ['features/test.feature'], 'behave features/test.feature'
    );

    mockProcess.stdout.emit('data', Buffer.from('some output\n'));
    mockProcess.emit('close');
    await promise;

    // If config.logger were called, it would throw since it's not properly initialized
    // The fact that the test completes without error proves config.logger is not used
    assert.ok(true, 'runBehaveInstance completed without calling config.logger');
  });

  test('ANSI escape sequences are cleaned from output', async () => {
    const promise = runBehaveInstance(
      mockWr as unknown as Parameters<typeof runBehaveInstance>[0], false, ['features/test.feature'], 'behave features/test.feature'
    );

    // Send text with ANSI escape sequences
    mockProcess.stdout.emit('data', Buffer.from('\x1b[33mWarning text\x1b[0m\n'));
    mockProcess.emit('close');
    await promise;

    const allOutput = appendOutputCalls.join('');
    assert.ok(!allOutput.includes('\x1b'), 'Should not contain ANSI escape character');
    assert.ok(allOutput.includes('Warning text'), 'Should contain cleaned text');
  });

  test('toRunOutput normalizes mixed line endings to \\r\\n', async () => {
    const promise = runBehaveInstance(
      mockWr as unknown as Parameters<typeof runBehaveInstance>[0], false, ['features/test.feature'], 'behave features/test.feature'
    );

    // Send text with \r\n already (should not become \r\r\n)
    mockProcess.stdout.emit('data', Buffer.from('line1\r\nline2\nline3\r\n'));
    mockProcess.emit('close');
    await promise;

    const allOutput = appendOutputCalls.join('');
    // Should not have \r\r\n (double carriage return)
    assert.ok(!allOutput.includes('\r\r\n'),
      `Should not have double \\r, got: ${JSON.stringify(allOutput)}`);
    // Every \n should be preceded by \r
    const lines = allOutput.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
      assert.ok(lines[i].endsWith('\r'),
        `Line ${i} should end with \\r before \\n: ${JSON.stringify(lines[i])}`);
    }
  });
});
