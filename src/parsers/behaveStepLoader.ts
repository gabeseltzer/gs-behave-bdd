/**
 * Loads step definitions using behave's step registry
 * This module spawns Python to use behave's internal step registry API
 * to discover all step definitions including those from imported libraries
 */

import { spawn } from 'child_process';
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
 * @param stepsPath Directory containing step files (e.g., features/steps)
 * @returns Array of step definitions discovered by behave
 * @throws Error if behave is not installed or if import errors occur
 */
export async function loadStepsFromBehave(
  pythonExec: string,
  projectPath: string,
  stepsPath: string
): Promise<BehaveStepDefinition[]> {
  const startTime = performance.now();

  try {
    // Python script that uses behave's step registry to discover steps
    const pythonScript = `
import sys
import json
import os

def main():
    try:
        # Import behave modules
        from behave import step_registry
        from behave import runner_util
        
        project_path = sys.argv[1] if len(sys.argv) > 1 else '.'
        steps_path = sys.argv[2] if len(sys.argv) > 2 else './steps'
        
        # Add project to sys.path so imports work
        if project_path not in sys.path:
            sys.path.insert(0, project_path)
        
        # Load step modules from the steps directory
        # This triggers decorator execution and registers steps
        step_dir = os.path.abspath(steps_path)
        if os.path.exists(step_dir):
            try:
                runner_util.load_step_modules([step_dir])
            except Exception as load_err:
                print(json.dumps({"error": f"Failed to load steps: {str(load_err)}"}), file=sys.stderr)
                sys.exit(1)
        
        # Get all registered steps from the global registry
        steps = []
        registry = step_registry.registry
        
        # Registry contains step matchers organized by step type
        for step_type in ['given', 'when', 'then', 'step']:
            if step_type in registry.steps:
                for matcher in registry.steps[step_type]:
                    # Extract step information
                    # Use regex_pattern if available, otherwise fall back to pattern
                    regex_pat = getattr(matcher, 'regex_pattern', None)
                    if regex_pat is None and hasattr(matcher, 'regex'):
                        regex_pat = matcher.regex.pattern
                    if regex_pat is None:
                        regex_pat = matcher.pattern
                    
                    step_info = {
                        'step_type': step_type,
                        'pattern': matcher.pattern,  # Original pattern text
                        'file': matcher.location.filename if hasattr(matcher, 'location') and matcher.location else 'unknown',
                        'line': matcher.location.line if hasattr(matcher, 'location') and matcher.location else 0,
                        'regex_pattern': regex_pat
                    }
                    steps.append(step_info)
        
        # Output JSON to stdout
        print(json.dumps(steps))
        sys.exit(0)
        
    except ImportError as e:
        print(json.dumps({"error": f"behave is not installed: {str(e)}"}), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": f"Unexpected error: {str(e)}"}), file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
`;

    const output = await spawnPython(pythonExec, pythonScript, [projectPath, stepsPath], projectPath);

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
 * Spawns Python process with inline script
 * Similar to importResolver's spawnPython but with better error messages for behave errors
 */
function spawnPython(
  pythonExec: string,
  script: string,
  args: string[],
  cwd: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const cp = spawn(pythonExec, ['-c', script, ...args], {
      cwd
    });

    if (!cp.pid) {
      reject(new Error(`Failed to spawn Python process: ${pythonExec}`));
      return;
    }

    const timeoutId = setTimeout(() => {
      cp.kill();
      reject(new Error('Python process timeout after 10 seconds'));
    }, 10000);

    cp.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    cp.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    cp.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });

    cp.on('close', (code) => {
      clearTimeout(timeoutId);
      if (code !== 0) {
        // Parse error messages for better user feedback
        const stderrLower = stderr.toLowerCase();

        // Check if behave module itself is missing
        if ((stderrLower.includes('modulenotfounderror') || stderrLower.includes('importerror'))
          && stderrLower.includes('behave')) {
          reject(new Error(`behave is not installed in the Python environment. Please install it: pip install behave`));
        } else if (stderrLower.includes('behave') && stderrLower.includes('not installed')) {
          reject(new Error(`behave is not installed in the Python environment. Please install it: pip install behave`));
        } else if (stderrLower.includes('importerror') || stderrLower.includes('modulenotfounderror')) {
          reject(new Error(`Import error in step files: ${stderr}`));
        } else {
          reject(new Error(`Python process exited with code ${code}: ${stderr}`));
        }
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

/**
 * Checks if the Python helper script exists
 * For development, we use inline Python script in spawnPython
 * For production, we could bundle a separate .py file
 */
export function checkPythonHelperExists(): boolean {
  // Currently using inline script, so always returns true
  // Future: check if bundled get_steps.py exists
  return true;
}
