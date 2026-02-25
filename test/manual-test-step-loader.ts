/**
 * Manual test for behaveStepLoader to debug why it returns 0 steps
 */

import { loadStepsFromBehave } from '../src/parsers/behaveStepLoader';
import * as path from 'path';

async function main() {
  // Use simple example project
  const projectPath = path.join(__dirname, '..', 'example-projects', 'simple');
  const stepsPath = path.join(projectPath, 'features', 'steps');
  const pythonExec = 'python'; // or 'python3' depending on OS

  console.log('Testing behave step loader...');
  console.log('Project path:', projectPath);
  console.log('Steps path:', stepsPath);
  console.log('Python exec:', pythonExec);
  console.log('');

  try {
    const steps = await loadStepsFromBehave(pythonExec, projectPath, [stepsPath]);
    console.log(`\nLoaded ${steps.length} steps:`);
    steps.forEach((step, idx) => {
      console.log(`${idx + 1}. ${step.stepType} "${step.pattern}" (${step.filePath}:${step.lineNumber})`);
      console.log(`   Regex: ${step.regex}`);
    });
  } catch (error) {
    console.error('ERROR:', error instanceof Error ? error.message : String(error));
    console.error('Stack:', error instanceof Error ? error.stack : '');
  }
}

main();
