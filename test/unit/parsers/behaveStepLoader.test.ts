// Unit tests for behaveStepLoader - Python step registry loader

import * as assert from 'assert';
import * as childProcess from 'child_process';
import { EventEmitter } from 'events';
import * as sinon from 'sinon';
import type { BehaveStepDefinition } from '../../../src/parsers/behaveStepLoader';

// Stub diagLog before module loading
// eslint-disable-next-line @typescript-eslint/no-var-requires
const loggerModule = require('../../../src/logger');

suite('behaveStepLoader', () => {

  let spawnStub: sinon.SinonStub;
  let diagLogStub: sinon.SinonStub;
  let mockProcess: MockChildProcess;
  let loadStepsFromBehave: (pythonExec: string, projectPath: string, stepsPath: string) => Promise<BehaveStepDefinition[]>;

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

  test('should call Python with correct arguments', async () => {
    const pythonExec = 'python';
    const projectPath = '/path/to/project';
    const stepsPath = '/path/to/project/steps';

    // Mock Python process response
    setImmediate(() => {
      mockProcess.stdout.emit('data', '[]');
      mockProcess.emit('close', 0);
    });

    await loadStepsFromBehave(pythonExec, projectPath, stepsPath);

    assert.ok(spawnStub.calledOnce, 'spawn should be called once');
    const spawnArgs = spawnStub.firstCall.args;

    // Verify Python executable
    assert.strictEqual(spawnArgs[0], pythonExec);

    // Verify script is passed via -c flag
    assert.ok(Array.isArray(spawnArgs[1]), 'spawn args should be an array');
    assert.strictEqual(spawnArgs[1][0], '-c', 'should use -c flag for inline script');
    assert.ok(typeof spawnArgs[1][1] === 'string', 'script should be a string');

    // Verify project and steps paths are passed as arguments
    assert.ok(spawnArgs[1].includes(projectPath), 'project path should be in arguments');
    assert.ok(spawnArgs[1].includes(stepsPath), 'steps path should be in arguments');

    // Verify cwd is set to project path
    assert.ok(spawnArgs[2], 'spawn options should exist');
    assert.strictEqual(spawnArgs[2].cwd, projectPath, 'cwd should be project path');
  });

  test('should parse JSON output from Python script', async () => {
    const pythonExec = 'python';
    const projectPath = '/path/to/project';
    const stepsPath = '/path/to/project/steps';

    const mockSteps = [
      {
        step_type: 'given',
        pattern: 'there is a calculator',
        file: '/path/to/project/steps/example_steps.py',
        line: 5,
        regex_pattern: '^there is a calculator$'
      },
      {
        step_type: 'when',
        pattern: 'I add {a:d} and {b:d}',
        file: '/path/to/project/steps/example_steps.py',
        line: 10,
        regex_pattern: '^I add (?P<a>\\d+) and (?P<b>\\d+)$'
      }
    ];

    setImmediate(() => {
      mockProcess.stdout.emit('data', JSON.stringify(mockSteps));
      mockProcess.emit('close', 0);
    });

    const result = await loadStepsFromBehave(pythonExec, projectPath, stepsPath);

    assert.strictEqual(result.length, 2, 'should return 2 steps');

    // Verify first step
    assert.strictEqual(result[0].stepType, 'given');
    assert.strictEqual(result[0].pattern, 'there is a calculator');
    assert.strictEqual(result[0].filePath, '/path/to/project/steps/example_steps.py');
    assert.strictEqual(result[0].lineNumber, 5);
    assert.strictEqual(result[0].regex, '^there is a calculator$');

    // Verify second step with typed parameters
    assert.strictEqual(result[1].stepType, 'when');
    assert.strictEqual(result[1].pattern, 'I add {a:d} and {b:d}');
    assert.strictEqual(result[1].regex, '^I add (?P<a>\\d+) and (?P<b>\\d+)$');
  });

  test('should handle Python script errors', async () => {
    const pythonExec = 'python';
    const projectPath = '/path/to/project';
    const stepsPath = '/path/to/project/steps';

    setImmediate(() => {
      mockProcess.stderr.emit('data', 'ModuleNotFoundError: No module named \'behave\'');
      mockProcess.emit('close', 1);
    });

    await assert.rejects(
      async () => await loadStepsFromBehave(pythonExec, projectPath, stepsPath),
      /behave.*not.*installed/i,
      'should throw error indicating behave is not installed'
    );
  });

  test('should handle JSON parse errors', async () => {
    const pythonExec = 'python';
    const projectPath = '/path/to/project';
    const stepsPath = '/path/to/project/steps';

    setImmediate(() => {
      mockProcess.stdout.emit('data', 'Invalid JSON output');
      mockProcess.emit('close', 0);
    });

    await assert.rejects(
      async () => await loadStepsFromBehave(pythonExec, projectPath, stepsPath),
      /JSON/i,
      'should throw error for invalid JSON'
    );
  });

  test('should handle process spawn failure', async () => {
    const pythonExec = 'python';
    const projectPath = '/path/to/project';
    const stepsPath = '/path/to/project/steps';

    // Mock process with no PID (spawn failure)
    mockProcess.pid = undefined as unknown as number;

    await assert.rejects(
      async () => await loadStepsFromBehave(pythonExec, projectPath, stepsPath),
      /Failed to spawn/i,
      'should throw error for spawn failure'
    );
  });

  test('should handle process timeout', async () => {
    const pythonExec = 'python';
    const projectPath = '/path/to/project';
    const stepsPath = '/path/to/project/steps';

    // Don't emit any events - let it timeout
    // Note: We use a short timeout in the actual implementation

    await assert.rejects(
      async () => await loadStepsFromBehave(pythonExec, projectPath, stepsPath),
      /timeout/i,
      'should throw error on timeout'
    );
  }).timeout(15000); // Give test time to timeout

  test('should handle import errors in step files', async () => {
    const pythonExec = 'python';
    const projectPath = '/path/to/project';
    const stepsPath = '/path/to/project/steps';

    setImmediate(() => {
      mockProcess.stderr.emit('data', 'ImportError: cannot import name \'something\' from \'lib.library_steps\'');
      mockProcess.emit('close', 1);
    });

    await assert.rejects(
      async () => await loadStepsFromBehave(pythonExec, projectPath, stepsPath),
      /import.*error/i,
      'should throw error for import errors'
    );
  });

  test('should construct correct Python script path', async () => {
    const pythonExec = 'python';
    const projectPath = '/path/to/project';
    const stepsPath = '/path/to/project/steps';

    setImmediate(() => {
      mockProcess.stdout.emit('data', '[]');
      mockProcess.emit('close', 0);
    });

    await loadStepsFromBehave(pythonExec, projectPath, stepsPath);

    const spawnArgs = spawnStub.firstCall.args;
    const script = spawnArgs[1][1] as string;

    // Verify script imports behave
    assert.ok(script.includes('import behave') || script.includes('from behave'),
      'script should import behave');

    // Verify script uses step registry
    assert.ok(script.includes('registry') || script.includes('step_registry'),
      'script should reference step registry');

    // Verify script outputs JSON
    assert.ok(script.includes('json'), 'script should use json module');
  });
});
