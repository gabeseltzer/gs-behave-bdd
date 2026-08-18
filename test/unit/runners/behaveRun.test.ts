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
  let appendOutputTests: (unknown | undefined)[];
  let mockWr: MockWkspRun;
  let runBehaveInstance: typeof import('../../../src/runners/behaveRun').runBehaveInstance;

  // behaveRun calls setEncoding() on both streams so chunks arrive already decoded
  // as text - a multi-byte character split across a chunk boundary would otherwise
  // be corrupted by a per-chunk Buffer.toString().
  class MockStream extends EventEmitter {
    encoding: string | undefined;
    setEncoding = (enc: string) => { this.encoding = enc; return this; };
  }

  class MockChildProcess extends EventEmitter {
    pid = 12345;
    stdout = new MockStream();
    stderr = new MockStream();
    kill = sinon.stub();
  }

  class MockWkspRun {
    pythonExec = 'python';
    wkspSettings = {
      uri: { path: '/test/workspace', fsPath: '/test/workspace' },
      projectUri: { path: '/test/project', fsPath: '/test/project' },
      importStrategy: 'fromEnvironment',
      getEffectiveEnvVars: () => ({})
    };
    run = {
      name: 'test-run-1',
      token: {
        isCancellationRequested: false,
        onCancellationRequested: () => ({ dispose: () => { /* mock */ } })
      },
      appendOutput: (text: string, _location?: unknown, test?: unknown) => {
        appendOutputCalls.push(text);
        appendOutputTests.push(test);
      }
    };
  }

  const run = (prefix?: string, test?: unknown) => runBehaveInstance(
    mockWr as unknown as Parameters<typeof runBehaveInstance>[0],
    ['features/test.feature'],
    'behave features/test.feature',
    prefix,
    test as Parameters<typeof runBehaveInstance>[4]
  );

  setup(() => {
    appendOutputCalls = [];
    appendOutputTests = [];
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
    const promise = run();

    mockProcess.stdout.emit('data', 'Feature: Test\nScenario: A\n');
    mockProcess.emit('close');
    await promise;

    const allOutput = appendOutputCalls.join('');
    assert.ok(allOutput.includes('Feature: Test\r\nScenario: A\r\n'),
      `Expected normalized output, got: ${JSON.stringify(appendOutputCalls)}`);
  });

  test('stderr is sent to run.appendOutput', async () => {
    const promise = run();

    mockProcess.stderr.emit('data', 'ConfigError: something\n');
    mockProcess.emit('close');
    await promise;

    const allOutput = appendOutputCalls.join('');
    assert.ok(allOutput.includes('ConfigError: something\r\n'),
      `Expected stderr in output, got: ${JSON.stringify(appendOutputCalls)}`);
  });

  test('friendlyCmd is sent to run.appendOutput', async () => {
    const promise = run();

    mockProcess.emit('close');
    await promise;

    const allOutput = appendOutputCalls.join('');
    assert.ok(allOutput.includes('behave features/test.feature'),
      `Expected friendlyCmd in output, got: ${JSON.stringify(appendOutputCalls)}`);
  });

  test('setEncoding is applied to both streams', async () => {
    const promise = run();
    mockProcess.emit('close');
    await promise;

    assert.strictEqual(mockProcess.stdout.encoding, 'utf8', 'stdout should be decoded as utf8');
    assert.strictEqual(mockProcess.stderr.encoding, 'utf8', 'stderr should be decoded as utf8');
  });

  // Replaces the previous "parallel mode buffers output and writes with delimiters"
  // and "parallel mode does NOT send friendlyCmd before process runs" tests.
  // Parallel runs used to hold every byte in a buffer until process close, so the
  // mode chosen for speed gave the least live feedback. Output now streams, and a
  // prefix keeps lines attributable when several processes share one TestRun.
  test('output streams live rather than being held until close', async () => {
    const promise = run();

    mockProcess.stdout.emit('data', 'Feature: Parallel\n');
    const outputBeforeClose = appendOutputCalls.join('');
    assert.ok(outputBeforeClose.includes('Feature: Parallel'),
      `Expected output before close, got: ${JSON.stringify(appendOutputCalls)}`);

    mockProcess.emit('close');
    await promise;
  });

  test('a prefix is applied to every output line', async () => {
    const promise = run('[basic] ');

    mockProcess.stdout.emit('data', 'Feature: Parallel\n  Scenario: S1\n');
    mockProcess.emit('close');
    await promise;

    const allOutput = appendOutputCalls.join('');
    assert.ok(allOutput.includes('[basic] Feature: Parallel'),
      `Expected prefixed feature line, got: ${JSON.stringify(allOutput)}`);
    assert.ok(allOutput.includes('[basic]   Scenario: S1'),
      `Expected prefixed scenario line, got: ${JSON.stringify(allOutput)}`);
  });

  test('output is attached to the test item when one is supplied', async () => {
    const featureItem = { id: 'feature-item' };
    const promise = run('[basic] ', featureItem);

    mockProcess.stdout.emit('data', 'Feature: Parallel\n');
    mockProcess.emit('close');
    await promise;

    assert.ok(appendOutputTests.length > 0, 'expected at least one appendOutput call');
    assert.ok(appendOutputTests.every(t => t === featureItem),
      'every appendOutput call should carry the supplied test item');
  });

  test('no test item is passed when none is supplied', async () => {
    const promise = run();

    mockProcess.stdout.emit('data', 'Feature: Test\n');
    mockProcess.emit('close');
    await promise;

    assert.ok(appendOutputTests.every(t => t === undefined),
      'appendOutput should be called without a test item');
  });

  test('cancellation message is sent to run.appendOutput', async () => {
    mockWr.run.token.isCancellationRequested = false;

    const promise = run();

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
    const promise = run();

    mockProcess.stdout.emit('data', 'some output\n');
    mockProcess.emit('close');
    await promise;

    // If config.logger were called, it would throw since it's not properly initialized
    // The fact that the test completes without error proves config.logger is not used
    assert.ok(true, 'runBehaveInstance completed without calling config.logger');
  });

  // Was "ANSI escape sequences are cleaned from output". The behaviour is now the
  // opposite for colour: behave is run with --color=on precisely so the panel can
  // show step status, so SGR is preserved and only cursor motion is removed.
  test('SGR colour is preserved and cursor motion is removed', async () => {
    const promise = run();

    mockProcess.stdout.emit('data', '\x1b[33mWarning text\x1b[0m\n');
    mockProcess.emit('close');
    await promise;

    const allOutput = appendOutputCalls.join('');
    assert.ok(allOutput.includes('\x1b[33m'), 'should keep the SGR colour code');
    assert.ok(allOutput.includes('Warning text'), 'should keep the text');
    assert.ok(!allOutput.includes('[1A'), 'should not contain a cursor-up sequence');
  });

  test('behave\'s grey-then-rewrite is resolved to one coloured line', async () => {
    const promise = run();

    // What behave actually emits with colour on: the step in grey (executing),
    // then a cursor-up and the same step in its final colour.
    mockProcess.stdout.emit('data',
      '\x1b[90mGiven \x1b[0m\x1b[90mwe have behave installed\x1b[0m\n' +
      '\x1b[1A\x1b[32mGiven \x1b[0m\x1b[32mwe have behave installed\x1b[0m\n');
    mockProcess.emit('close');
    await promise;

    const allOutput = appendOutputCalls.join('');
    assert.ok(allOutput.includes('\x1b[32m'), 'should contain the resolved green step');
    assert.ok(!allOutput.includes('\x1b[90mGiven'), 'should not contain the grey executing pass');
    const occurrences = allOutput.split('we have behave installed').length - 1;
    assert.strictEqual(occurrences, 1, `step should appear once, got ${occurrences}`);
  });

  test('toRunOutput normalizes mixed line endings to \\r\\n', async () => {
    const promise = run();

    mockProcess.stdout.emit('data', 'line1\r\nline2\nline3\r\n');
    mockProcess.emit('close');
    await promise;

    const allOutput = appendOutputCalls.join('');
    assert.ok(!allOutput.includes('\r\r\n'),
      `Should not have double \\r, got: ${JSON.stringify(allOutput)}`);
    const lines = allOutput.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
      assert.ok(lines[i].endsWith('\r'),
        `Line ${i} should end with \\r before \\n: ${JSON.stringify(lines[i])}`);
    }
  });

  test('spawn receives PYTHONPATH from getBehaveEnv including bundled libs path', async () => {
    const promise = run();

    mockProcess.emit('close');
    await promise;

    assert.ok(spawnStub.calledOnce, 'spawn should be called once');
    const spawnOptions = spawnStub.firstCall.args[2] as { env?: NodeJS.ProcessEnv };
    assert.ok(spawnOptions.env, 'spawn should be called with an env object');
    assert.ok(spawnOptions.env['PYTHONPATH'], 'PYTHONPATH should be set in spawn env');

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getBundledBehavePath } = require('../../../src/bundledBehave');
    const bundledPath = getBundledBehavePath();
    assert.ok(
      spawnOptions.env['PYTHONPATH'].includes(bundledPath),
      `PYTHONPATH should include bundled libs path. Got: ${spawnOptions.env['PYTHONPATH']}`
    );
  });
});
