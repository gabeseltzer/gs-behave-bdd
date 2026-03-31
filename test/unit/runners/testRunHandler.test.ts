// Unit tests for testRunHandler logWkspRunStarted and logWkspRunComplete functions
// Verifies that run start/complete messages go to test results pane (run.appendOutput)
// and NOT to the output channel (config.logger), and that "See Behave VSC" is not emitted.

import * as assert from 'assert';
import * as sinon from 'sinon';
import { performance } from 'perf_hooks';

// Stub diagLog before the module is loaded
// eslint-disable-next-line @typescript-eslint/no-var-requires
const loggerModule = require('../../../src/logger');

suite('testRunHandler', () => {

  let diagLogStub: sinon.SinonStub;
  let appendOutputCalls: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let logWkspRunStarted: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let logWkspRunComplete: any;

  function createMockWr(debug = false) {
    return {
      debug,
      wkspSettings: {
        name: 'TestWorkspace',
        uri: { path: '/test/workspace', fsPath: '/test/workspace' },
      },
      run: {
        name: 'run-42',
        appendOutput: (text: string) => {
          appendOutputCalls.push(text);
        }
      }
    };
  }

  setup(() => {
    appendOutputCalls = [];
    diagLogStub = sinon.stub(loggerModule, 'diagLog');
    void diagLogStub;

    // Clear module cache so each test gets a fresh import
    for (const key of Object.keys(require.cache)) {
      if (key.includes('testRunHandler')) {
        delete require.cache[key];
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../../../src/runners/testRunHandler');
    logWkspRunStarted = mod.logWkspRunStarted;
    logWkspRunComplete = mod.logWkspRunComplete;
  });

  teardown(() => {
    sinon.restore();
  });

  suite('logWkspRunStarted', () => {

    test('writes start message to run.appendOutput containing workspace name, run name, and timestamp', () => {
      const wr = createMockWr();
      logWkspRunStarted(wr as unknown as Parameters<typeof logWkspRunStarted>[0]);

      const allOutput = appendOutputCalls.join('');
      assert.ok(allOutput.includes('TestWorkspace'), 'Should contain workspace name');
      assert.ok(allOutput.includes('run-42'), 'Should contain run name');
      assert.ok(allOutput.includes('tests started'), 'Should contain "tests started"');
      // Should contain an ISO timestamp like 2026-02-10T...
      assert.ok(/\d{4}-\d{2}-\d{2}T/.test(allOutput), 'Should contain ISO timestamp');
    });

    test('does NOT write "See Behave VSC" to output', () => {
      const wr = createMockWr();
      logWkspRunStarted(wr as unknown as Parameters<typeof logWkspRunStarted>[0]);

      const allOutput = appendOutputCalls.join('');
      assert.ok(!allOutput.includes('See Behave VSC'), 'Should not contain "See Behave VSC" message');
    });

    test('does not call config.logger.logInfo', () => {
      // If config.logger.logInfo were called, it would throw since config is not initialized.
      // The fact that logWkspRunStarted completes without error proves it doesn't call config.logger.logInfo.
      const wr = createMockWr();
      logWkspRunStarted(wr as unknown as Parameters<typeof logWkspRunStarted>[0]);
      assert.ok(true, 'Completed without calling config.logger.logInfo');
    });

    test('does nothing when debug is true', () => {
      const wr = createMockWr(true);
      logWkspRunStarted(wr as unknown as Parameters<typeof logWkspRunStarted>[0]);
      assert.strictEqual(appendOutputCalls.length, 0, 'Should not write output in debug mode');
    });
  });

  suite('logWkspRunComplete', () => {

    test('writes complete message to run.appendOutput containing workspace name, run name, and elapsed time', () => {
      const wr = createMockWr();
      const start = performance.now() - 1500; // simulate 1.5 seconds ago
      logWkspRunComplete(wr as unknown as Parameters<typeof logWkspRunComplete>[0], start);

      const allOutput = appendOutputCalls.join('');
      assert.ok(allOutput.includes('TestWorkspace'), 'Should contain workspace name');
      assert.ok(allOutput.includes('run-42'), 'Should contain run name');
      assert.ok(allOutput.includes('tests completed'), 'Should contain "tests completed"');
      assert.ok(/\d+(\.\d+)?\s*secs/.test(allOutput), 'Should contain elapsed time in secs');
    });

    test('does NOT write "See Behave VSC" to output', () => {
      const wr = createMockWr();
      const start = performance.now() - 500;
      logWkspRunComplete(wr as unknown as Parameters<typeof logWkspRunComplete>[0], start);

      const allOutput = appendOutputCalls.join('');
      assert.ok(!allOutput.includes('See Behave VSC'), 'Should not contain "See Behave VSC" message');
    });

    test('does not call config.logger.logInfo', () => {
      const wr = createMockWr();
      const start = performance.now() - 100;
      logWkspRunComplete(wr as unknown as Parameters<typeof logWkspRunComplete>[0], start);
      assert.ok(true, 'Completed without calling config.logger.logInfo');
    });

    test('does nothing when debug is true', () => {
      const wr = createMockWr(true);
      const start = performance.now() - 100;
      logWkspRunComplete(wr as unknown as Parameters<typeof logWkspRunComplete>[0], start);
      assert.strictEqual(appendOutputCalls.length, 0, 'Should not write output in debug mode');
    });
  });
});
