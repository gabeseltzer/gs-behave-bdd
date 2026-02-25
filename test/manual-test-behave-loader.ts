/**
 * Manual test script to verify behave step loader Python script works
 * Run with: node test/manual-test-behave-loader.js
 */

import { execFile } from 'child_process';
import * as path from 'path';
import * as util from 'util';

const execFilePromise = util.promisify(execFile);

// Inline Python script from behaveStepLoader.ts
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

interface StepInfo {
    step_type: string;
    pattern: string;
    file: string;
    line: number;
    regex_pattern: string;
}

/**
 * Find Python executable - tries common locations and resolves py launcher to actual python.exe
 */
async function findPythonExecutable(): Promise<string> {
    const { execFile } = await import('child_process');
    const util = await import('util');
    const execFilePromise = util.promisify(execFile);

    // Try different python commands in order of preference
    const candidates = process.platform === 'win32' 
        ? ['py', 'python', 'python3']
        : ['python3', 'python'];

    for (const candidate of candidates)  {
        try {
            // On Windows, resolve 'py' launcher to actual python.exe path
            if (candidate === 'py' && process.platform === 'win32') {
                const { stdout } = await execFilePromise(candidate, 
                    ['-c', 'import sys; print(sys.executable)'],
                    { shell: true });
                const pythonPath = stdout.trim();
                if (pythonPath) {
                    console.log(`Found Python: ${candidate} -> ${pythonPath}`);
                    return pythonPath;
                }
            } else {
                await execFilePromise(candidate, ['--version']);
                // If we got here without throwing, Python is available
                console.log(`Found Python: ${candidate}`);
                return candidate;
            }
        } catch (e) {
            // Try next candidate
            continue;
        }
    }

    throw new Error('Could not find Python executable. Tried: ' + candidates.join(', '));
}

async function testBehaveLoader(): Promise<void> {
    console.log('=== Manual Test: Behave Step Loader ===\n');

    const pythonExec = await findPythonExecutable();
    // Go up from out/test/test/ to reach workspace root, then to example-projects
    const projectPath = path.resolve(__dirname, '../../../example-projects/step library');
    const stepsPath = path.join(projectPath, 'steps');

    console.log(`Project: ${projectPath}`);
    console.log(`Steps: ${stepsPath}`);
    console.log('');

    try {
        // Use execFile without shell for multi-line Python scripts
        const { stdout, stderr } = await execFilePromise(
            pythonExec,
            ['-c', pythonScript, projectPath, stepsPath],
            {
                cwd: projectPath,
                maxBuffer: 10 * 1024 * 1024  // 10MB buffer for large output
            }
        );

        if (stderr && stderr.trim()) {
            console.error('Python stderr output:', stderr);
        }

        const steps: StepInfo[] = JSON.parse(stdout.trim());

        console.log(`✓ Loaded ${steps.length} steps\n`);

        // Group by step type
        const byType: Record<string, StepInfo[]> = {};
        for (const step of steps) {
            if (!byType[step.step_type]) {
                byType[step.step_type] = [];
            }
            byType[step.step_type].push(step);
        }

        // Display results
        for (const [stepType, typeSteps] of Object.entries(byType)) {
            console.log(`${stepType.toUpperCase()} steps (${typeSteps.length}):`);
            for (const step of typeSteps) {
                console.log(`  "${step.pattern}"`);
                console.log(`    File: ${path.basename(step.file)}:${step.line}`);
                console.log(`    Regex: ${step.regex_pattern}`);
                console.log('');
            }
        }

        // Verify typed parameters are properly converted
        console.log('=== Verification ===\n');

        const addStep = steps.find(s => s.pattern.includes('add') && s.pattern.includes('{a:d}'));
        if (addStep) {
            console.log('✓ Found step with typed parameter: ' + addStep.pattern);

            if (addStep.regex_pattern.includes('(?P<a>')) {
                console.log('✓ Regex includes proper named group: (?P<a>...');
            } else {
                console.log('✗ ERROR: Regex does not include named group');
                process.exit(1);
            }

            if (!addStep.regex_pattern.includes('.*')) {
                console.log('✓ Regex does not use simple .* wildcard');
            } else {
                console.log('✗ WARNING: Regex uses .* wildcard (should be more specific)');
            }
        } else {
            console.log('✗ ERROR: Could not find step with typed parameter');
            process.exit(1);
        }

        // Verify library steps are discovered
        const libSteps = steps.filter(s => s.file.includes('lib'));
        if (libSteps.length > 0) {
            console.log(`✓ Found ${libSteps.length} steps from library (lib/ directory)`);
        } else {
            console.log('✗ ERROR: No library steps found');
            process.exit(1);
        }

        console.log('\n=== All checks passed! ===');

    } catch (error) {
        console.error('Test failed:', error);
        process.exit(1);
    }
}

testBehaveLoader()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Test failed:', err);
        process.exit(1);
    });
