// Unit tests for behaveLoader - Python step and fixture discovery

import * as assert from 'assert';
import * as childProcess from 'child_process';
import { EventEmitter } from 'events';
import * as sinon from 'sinon';
import type { BehaveDiscoveryResult } from '../../../src/parsers/behaveLoader';

// Stub diagLog before module loading
// eslint-disable-next-line @typescript-eslint/no-var-requires
const loggerModule = require('../../../src/logger');

/**
 * Minimal POSIX shell tokenizer that handles single-quoted strings,
 * including the `'\''` escape sequence for a literal single quote.
 */
/**
 * Minimal POSIX shell tokenizer that handles single-quoted strings,
 * including the `'\''` escape sequence for a literal single quote,
 * and backslash escaping outside of quotes.
 */
function shellSplit(cmd: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let i = 0;
  while (i < cmd.length) {
    if (cmd[i] === "'") {
      i++; // skip opening '
      while (i < cmd.length && cmd[i] !== "'") {
        current += cmd[i++];
      }
      i++; // skip closing '
    } else if (cmd[i] === '\\' && i + 1 < cmd.length) {
      current += cmd[i + 1]; // consume escaped char literally
      i += 2;
    } else if (cmd[i] === ' ') {
      if (current !== '') { tokens.push(current); current = ''; }
      i++;
    } else {
      current += cmd[i++];
    }
  }
  if (current !== '') tokens.push(current);
  return tokens;
}

suite('behaveLoader', () => {

  let spawnStub: sinon.SinonStub;
  let diagLogStub: sinon.SinonStub;
  let mockProcess: MockChildProcess;
  let loadFromBehave: (pythonExec: string, projectPath: string, stepsPaths: string[]) => Promise<BehaveDiscoveryResult>;

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
      if (key.includes('behaveLoader')) {
        delete require.cache[key];
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    loadFromBehave = require('../../../src/parsers/behaveLoader').loadFromBehave;
  });

  teardown(() => {
    sinon.restore();
  });

  test('should call Python with correct arguments', async () => {
    const pythonExec = 'python';
    const projectPath = '/path/to/project';
    const stepsPaths = ['/path/to/project/steps'];

    // Mock Python process response
    setImmediate(() => {
      mockProcess.stdout.emit('data', '{"steps":[],"fixtures":[]}');
      mockProcess.emit('close', 0);
    });

    await loadFromBehave(pythonExec, projectPath, stepsPaths);

    assert.ok(spawnStub.calledOnce, 'spawn should be called once');
    const spawnArgs = spawnStub.firstCall.args;

    // Verify Python executable
    assert.strictEqual(spawnArgs[0], pythonExec);

    // Verify args array: [scriptPath, projectPath, stepsPathsJson]
    assert.ok(Array.isArray(spawnArgs[1]), 'spawn args should be an array');
    const scriptPath = spawnArgs[1][0] as string;
    assert.ok(scriptPath.endsWith('discover.py'), 'first arg should be the Python script path');

    // Verify project and steps paths are passed as arguments
    assert.ok(spawnArgs[1].includes(projectPath), 'project path should be in arguments');
    assert.ok(spawnArgs[1].includes(JSON.stringify(stepsPaths)), 'steps paths JSON should be in arguments');

    // Verify cwd is set to project path
    assert.ok(spawnArgs[2], 'spawn options should exist');
    assert.strictEqual(spawnArgs[2].cwd, projectPath, 'cwd should be project path');
  });

  test('should parse JSON output from Python script', async () => {
    const pythonExec = 'python';
    const projectPath = '/path/to/project';
    const stepsPath = ['/path/to/project/steps'];

    const mockOutput = {
      steps: [
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
      ],
      fixtures: []
    };

    setImmediate(() => {
      mockProcess.stdout.emit('data', JSON.stringify(mockOutput));
      mockProcess.emit('close', 0);
    });

    const result = await loadFromBehave(pythonExec, projectPath, stepsPath);

    assert.strictEqual(result.steps.length, 2, 'should return 2 steps');

    // Verify first step
    assert.strictEqual(result.steps[0].stepType, 'given');
    assert.strictEqual(result.steps[0].pattern, 'there is a calculator');
    assert.strictEqual(result.steps[0].filePath, '/path/to/project/steps/example_steps.py');
    assert.strictEqual(result.steps[0].lineNumber, 5);
    assert.strictEqual(result.steps[0].regex, '^there is a calculator$');

    // Verify second step with typed parameters
    assert.strictEqual(result.steps[1].stepType, 'when');
    assert.strictEqual(result.steps[1].pattern, 'I add {a:d} and {b:d}');
    assert.strictEqual(result.steps[1].regex, '^I add (?P<a>\\d+) and (?P<b>\\d+)$');
  });

  test('should handle Python script errors', async () => {
    const pythonExec = 'python';
    const projectPath = '/path/to/project';
    const stepsPath = ['/path/to/project/steps'];

    // The fallback logic will retry with bundled path, so we need both calls to fail
    spawnStub.restore();
    spawnStub = sinon.stub(childProcess, 'spawn').callsFake(() => {
      const proc = new MockChildProcess();
      setImmediate(() => {
        proc.stderr.emit('data', 'ModuleNotFoundError: No module named \'behave\'');
        proc.emit('close', 1);
      });
      return proc as unknown as childProcess.ChildProcess;
    });

    await assert.rejects(
      async () => await loadFromBehave(pythonExec, projectPath, stepsPath),
      /behave.*not.*installed/i,
      'should throw error indicating behave is not installed'
    );
  });

  test('should handle JSON parse errors', async () => {
    const pythonExec = 'python';
    const projectPath = '/path/to/project';
    const stepsPath = ['/path/to/project/steps'];

    setImmediate(() => {
      mockProcess.stdout.emit('data', 'Invalid JSON output');
      mockProcess.emit('close', 0);
    });

    await assert.rejects(
      async () => await loadFromBehave(pythonExec, projectPath, stepsPath),
      /JSON/i,
      'should throw error for invalid JSON'
    );
  });

  test('should handle process spawn failure', async () => {
    const pythonExec = 'python';
    const projectPath = '/path/to/project';
    const stepsPath = ['/path/to/project/steps'];

    // Simulate spawn failure (ENOENT) by emitting error event
    setImmediate(() => {
      const err = new Error('spawn python ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      mockProcess.emit('error', err);
    });

    await assert.rejects(
      async () => await loadFromBehave(pythonExec, projectPath, stepsPath),
      /Failed to spawn/i,
      'should throw error for spawn failure'
    );
  });

  test('should handle process timeout', async () => {
    const pythonExec = 'python';
    const projectPath = '/path/to/project';
    const stepsPath = ['/path/to/project/steps'];

    // Don't emit any events - let it timeout
    // Note: We use a short timeout in the actual implementation

    await assert.rejects(
      async () => await loadFromBehave(pythonExec, projectPath, stepsPath),
      /timeout/i,
      'should throw error on timeout'
    );
  }).timeout(15000); // Give test time to timeout

  test('should handle import errors in step files', async () => {
    const pythonExec = 'python';
    const projectPath = '/path/to/project';
    const stepsPath = ['/path/to/project/steps'];

    setImmediate(() => {
      mockProcess.stderr.emit('data', 'ImportError: cannot import name \'something\' from \'lib.library_steps\'');
      mockProcess.emit('close', 1);
    });

    await assert.rejects(
      async () => await loadFromBehave(pythonExec, projectPath, stepsPath),
      /import.*error/i,
      'should throw error for import errors'
    );
  });

  suite('shellQuote', () => {
    let shellQuote: (s: string) => string;

    setup(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      shellQuote = require('../../../src/parsers/behaveLoader').shellQuote;
    });

    test('wraps plain string in single quotes', () => {
      assert.strictEqual(shellQuote('/usr/bin/python3'), "'/usr/bin/python3'");
    });

    test('preserves spaces inside quotes', () => {
      const result = shellQuote('/path/with spaces/project');
      assert.strictEqual(result, "'/path/with spaces/project'");
      const [token] = shellSplit(result);
      assert.strictEqual(token, '/path/with spaces/project');
    });

    test('escapes single quotes using the POSIX close-escape-reopen pattern', () => {
      const result = shellQuote("it's here");
      assert.strictEqual(result, "'it'\\''s here'");
      const [token] = shellSplit(result);
      assert.strictEqual(token, "it's here");
    });

    test('JSON steps path round-trips through shell tokenizer', () => {
      const stepsPaths = ['/my project/features/steps', '/other project/steps'];
      const json = JSON.stringify(stepsPaths);
      const quoted = shellQuote(json);
      const [token] = shellSplit(quoted);
      assert.deepStrictEqual(JSON.parse(token), stepsPaths);
    });

    test('JSON steps path with double quotes round-trips correctly', () => {
      // Paths containing double quotes would break naive double-quote wrapping
      const stepsPaths = ['/path/to/"tricky"/steps'];
      const json = JSON.stringify(stepsPaths);
      const quoted = shellQuote(json);
      const [token] = shellSplit(quoted);
      assert.deepStrictEqual(JSON.parse(token), stepsPaths);
    });
  });

  test('should use correct Python script file', async () => {
    const pythonExec = 'python';
    const projectPath = '/path/to/project';
    const stepsPaths = ['/path/to/project/steps'];

    setImmediate(() => {
      mockProcess.stdout.emit('data', '{"steps":[],"fixtures":[]}');
      mockProcess.emit('close', 0);
    });

    await loadFromBehave(pythonExec, projectPath, stepsPaths);

    const spawnArgs = spawnStub.firstCall.args;
    const scriptPath = spawnArgs[1][0] as string;

    // Verify script path points to discover.py
    assert.ok(scriptPath.endsWith('discover.py'),
      `script path should end with discover.py, got: ${scriptPath}`);
  });
});
