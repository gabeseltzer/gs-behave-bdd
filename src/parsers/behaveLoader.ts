/**
 * Loads step definitions and fixture definitions using behave's registry
 * This module spawns Python to use behave's internal APIs
 * to discover all step definitions and @fixture functions
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { getBundledBehavePath } from '../bundledBehave';
import { diagLog } from '../logger';

/**
 * Step definition returned from behave's step registry
 */
export interface BehaveStepDefinition {
  stepType: string;        // 'given', 'when', 'then', 'step'
  pattern: string;         // Original pattern like "I add {a:d} and {b:d}"
  filePath: string;        // Absolute path to the step definition file
  lineNumber: number;      // Line number where step is defined
  regex: string;           // Actual regex pattern used by behave
}

/**
 * Fixture definition returned from Python's inspect of @fixture-decorated functions
 */
export interface BehaveFixtureDefinition {
  functionName: string;    // Python function name (e.g., "browser_setup")
  filePath: string;        // Absolute path to the source file
  decoratorLine: number;   // 1-indexed line of @fixture decorator
  defLine: number;         // 1-indexed line of def function_name(
}

/**
 * A step definition that appears more than once across step files
 */
export interface DuplicateStepInfo {
  stepType: string;
  pattern: string;
  filePath: string;
  lineNumber: number;
}

/**
 * Combined result from the Python discovery subprocess
 */
export interface BehaveDiscoveryResult {
  steps: BehaveStepDefinition[];
  fixtures: BehaveFixtureDefinition[];
  error?: string;
  duplicates?: DuplicateStepInfo[];
  /** Raw stderr from the Python process (warnings, tracebacks, etc.) */
  stderr?: string;
}

/**
 * Loads all step definitions and fixtures from behave
 *
 * @param pythonExec Path to the Python executable
 * @param projectPath Project root directory (used as cwd for subprocess)
 * @param stepsPaths Array of directories containing step files
 * @param bundledLibsPath Optional path to bundled behave libs directory
 * @returns Combined steps and fixtures discovered by behave
 * @throws Error if behave is not installed or if import errors occur
 */
export async function loadFromBehave(
  pythonExec: string,
  projectPath: string,
  stepsPaths: string[],
  bundledLibsPath?: string
): Promise<BehaveDiscoveryResult> {
  const startTime = performance.now();

  try {
    const scriptPath = getDiscoveryScriptPath();
    const args = [projectPath, JSON.stringify(stepsPaths)];
    if (bundledLibsPath)
      args.push('--bundled-libs', bundledLibsPath);
    const { stdout: output, stderr: processStderr } = await spawnPython(pythonExec, scriptPath, args, projectPath);

    // Parse JSON output
    interface RawStepInfo {
      step_type: string;
      pattern: string;
      file: string;
      line: number;
      regex_pattern: string;
    }

    interface RawFixtureInfo {
      function_name: string;
      file: string;
      decorator_line: number;
      def_line: number;
    }

    interface RawDuplicateInfo {
      step_type: string;
      pattern: string;
      file: string;
      line: number;
    }

    interface RawOutput {
      steps: RawStepInfo[];
      fixtures: RawFixtureInfo[];
      error?: string;
      duplicates?: RawDuplicateInfo[];
    }

    let parsed: RawOutput;
    try {
      parsed = JSON.parse(output);
    } catch (err) {
      throw new Error(`Failed to parse JSON from Python script: ${output.substring(0, 200)}`);
    }

    // Convert to our format
    const steps: BehaveStepDefinition[] = parsed.steps.map(step => ({
      stepType: step.step_type,
      pattern: step.pattern,
      filePath: step.file,
      lineNumber: step.line,
      regex: step.regex_pattern
    }));

    const fixtures: BehaveFixtureDefinition[] = parsed.fixtures.map(f => ({
      functionName: f.function_name,
      filePath: f.file,
      decoratorLine: f.decorator_line,
      defLine: f.def_line
    }));

    const duplicates: DuplicateStepInfo[] | undefined = parsed.duplicates?.map(d => ({
      stepType: d.step_type,
      pattern: d.pattern,
      filePath: d.file,
      lineNumber: d.line
    }));

    const elapsed = Math.round(performance.now() - startTime);
    diagLog(`loadFromBehave: loaded ${steps.length} steps and ${fixtures.length} fixtures in ${elapsed}ms`);
    if (parsed.error)
      diagLog(`loadFromBehave: error from Python: ${parsed.error}`);
    if (duplicates?.length)
      diagLog(`loadFromBehave: ${duplicates.length} duplicate step definitions detected`);

    return { steps, fixtures, error: parsed.error, duplicates, stderr: processStderr || undefined };

  } catch (e) {
    const elapsed = Math.round(performance.now() - startTime);
    const errMsg = e instanceof Error ? e.message : String(e);
    diagLog(`loadFromBehave error (${elapsed}ms): ${errMsg}`);

    // If behave is not installed and we weren't already using bundled, fall back to bundled
    if (!bundledLibsPath && isBehaveNotInstalledError(errMsg)) {
      diagLog(`loadFromBehave: behave not found in environment, falling back to bundled behave`);
      return loadFromBehave(pythonExec, projectPath, stepsPaths, getBundledBehavePath());
    }

    // If bundled was already tried and still failed, give a clearer message than "pip install behave"
    if (bundledLibsPath && isBehaveNotInstalledError(errMsg)) {
      throw new Error(`Bundled behave at "${bundledLibsPath}" failed to import. This may indicate an extension installation issue.\n${errMsg}`);
    }

    throw e;
  }
}

/**
 * Returns the path to the discover.py helper script.
 * In production (webpack bundle), __dirname points to dist/.
 * In tests (tsc output), __dirname points to out/test/src/parsers/.
 */
export function getDiscoveryScriptPath(): string {
  // When running from webpack bundle, python/ is a sibling of the bundle in dist/
  const webpackPath = path.join(__dirname, 'python', 'discover.py');
  if (fs.existsSync(webpackPath))
    return webpackPath;

  // When running from tsc output (tests), walk up to find project root (contains package.json)
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, 'src', 'python', 'discover.py');
    if (fs.existsSync(candidate))
      return candidate;
    const parent = path.dirname(dir);
    if (parent === dir)
      break;
    dir = parent;
  }

  throw new Error(`Could not find discover.py (searched from ${__dirname})`);
}

interface SpawnResult {
  stdout: string;
  stderr: string;
}

/**
 * Spawns Python process with a script file
 */
function spawnPython(
  pythonExec: string,
  scriptPath: string,
  args: string[],
  cwd: string
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const settle = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (err) reject(err);
      else resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    };

    const allArgs = [scriptPath, ...args];
    const cp = spawn(pythonExec, allArgs, { cwd });

    const timeoutId = setTimeout(() => {
      cp.kill();
      const cmd = `cd ${shellQuote(cwd)} && ${shellQuote(pythonExec)} ${allArgs.map(shellQuote).join(' ')}`;
      const debugInfo = [
        `command: ${cmd}`,
        stdout.trim() && `stdout:\n${stdout.trim()}`,
        stderr.trim() && `stderr:\n${stderr.trim()}`,
      ].filter(Boolean).join('\n');
      settle(new Error(`Python process timeout after 10 seconds\n${debugInfo}`));
    }, 10000);

    cp.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    cp.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    cp.on('error', (err) => {
      settle(new Error(`Failed to spawn Python process: ${pythonExec} (${err.message})`));
    });

    cp.on('close', (code) => {
      if (code !== 0) {
        // Parse error messages for better user feedback
        const stderrLower = stderr.toLowerCase();

        // Check if behave module itself is missing
        if ((stderrLower.includes('modulenotfounderror') || stderrLower.includes('importerror'))
          && stderrLower.includes('behave')) {
          settle(new Error(`behave is not installed in the Python environment. Please install it: pip install behave\n[Details: ${stderr}]`));
        } else if (stderrLower.includes('behave') && stderrLower.includes('not installed')) {
          settle(new Error(`behave is not installed in the Python environment. Please install it: pip install behave\n[Details: ${stderr}]`));
        } else if (stderrLower.includes('importerror') || stderrLower.includes('modulenotfounderror')) {
          settle(new Error(`Import error in step files: ${stderr}`));
        } else {
          settle(new Error(`Python process exited with code ${code}: ${stderr}`));
        }
      } else {
        settle();
      }
    });
  });
}

/**
 * Wraps a string in POSIX single quotes, escaping any single quotes within.
 * Exported for testing.
 */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * Checks if an error message indicates behave is not installed (as opposed to other import errors)
 */
function isBehaveNotInstalledError(errMsg: string): boolean {
  const lower = errMsg.toLowerCase();
  return lower.includes('behave') && (lower.includes('not installed') || lower.includes('modulenotfounderror') || lower.includes('importerror'));
}

/**
 * Checks if the Python helper script exists
 */
export function checkPythonHelperExists(): boolean {
  try {
    return fs.existsSync(getDiscoveryScriptPath());
  } catch {
    return false;
  }
}
