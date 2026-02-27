/**
 * Loads step definitions using behave's step registry
 * This module spawns Python to use behave's internal step registry API
 * to discover all step definitions including those from imported libraries
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { performance } from 'perf_hooks';
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
 * Loads all step definitions from behave's step registry
 * 
 * @param pythonExec Path to the Python executable
 * @param projectPath Project root directory (used as cwd for subprocess)
 * @param stepsPaths Array of directories containing step files (e.g., ["features/steps", "features/grouped/steps"])
 * @returns Array of step definitions discovered by behave
 * @throws Error if behave is not installed or if import errors occur
 */
export async function loadStepsFromBehave(
  pythonExec: string,
  projectPath: string,
  stepsPaths: string[],
  bundledLibsPath?: string
): Promise<BehaveStepDefinition[]> {
  const startTime = performance.now();

  try {
    const scriptPath = getStepsScriptPath();
    const args = [projectPath, JSON.stringify(stepsPaths)];
    if (bundledLibsPath)
      args.push('--bundled-libs', bundledLibsPath);
    const output = await spawnPython(pythonExec, scriptPath, args, projectPath);

    // Parse JSON output
    interface RawStepInfo {
      step_type: string;
      pattern: string;
      file: string;
      line: number;
      regex_pattern: string;
    }

    let parsed: RawStepInfo[];
    try {
      parsed = JSON.parse(output);
    } catch (err) {
      throw new Error(`Failed to parse JSON from Python script: ${output.substring(0, 200)}`);
    }

    // Convert to our format
    const steps: BehaveStepDefinition[] = parsed.map(step => ({
      stepType: step.step_type,
      pattern: step.pattern,
      filePath: step.file,
      lineNumber: step.line,
      regex: step.regex_pattern
    }));

    const elapsed = Math.round(performance.now() - startTime);
    diagLog(`loadStepsFromBehave: loaded ${steps.length} steps in ${elapsed}ms`);

    return steps;

  } catch (e) {
    const elapsed = Math.round(performance.now() - startTime);
    diagLog(`loadStepsFromBehave error (${elapsed}ms): ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}

/**
 * Returns the path to the get_steps.py helper script.
 * In production (webpack bundle), __dirname points to dist/.
 * In tests (tsc output), __dirname points to out/test/src/parsers/.
 */
export function getStepsScriptPath(): string {
  // When running from webpack bundle, python/ is a sibling of the bundle in dist/
  const webpackPath = path.join(__dirname, 'python', 'get_steps.py');
  if (fs.existsSync(webpackPath))
    return webpackPath;

  // When running from tsc output (tests), walk up to find project root (contains package.json)
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, 'src', 'python', 'get_steps.py');
    if (fs.existsSync(candidate))
      return candidate;
    const parent = path.dirname(dir);
    if (parent === dir)
      break;
    dir = parent;
  }

  throw new Error(`Could not find get_steps.py (searched from ${__dirname})`);
}

/**
 * Spawns Python process with a script file
 */
function spawnPython(
  pythonExec: string,
  scriptPath: string,
  args: string[],
  cwd: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const settle = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (err) reject(err);
      else resolve(stdout.trim());
    };

    const cp = spawn(pythonExec, [scriptPath, ...args], {
      cwd
    });

    const timeoutId = setTimeout(() => {
      cp.kill();
      settle(new Error('Python process timeout after 10 seconds'));
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
          settle(new Error(`behave is not installed in the Python environment. Please install it: pip install behave`));
        } else if (stderrLower.includes('behave') && stderrLower.includes('not installed')) {
          settle(new Error(`behave is not installed in the Python environment. Please install it: pip install behave`));
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
 * Checks if the Python helper script exists
 */
export function checkPythonHelperExists(): boolean {
  try {
    return fs.existsSync(getStepsScriptPath());
  } catch {
    return false;
  }
}
