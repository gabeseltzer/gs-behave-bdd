/**
 * Manual test for behaveLoader to debug discovery issues
 */

import { loadFromBehave } from '../src/parsers/behaveLoader';
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
    const result = await loadFromBehave(pythonExec, projectPath, [stepsPath]);
    console.log(`\nLoaded ${result.steps.length} steps:`);
    result.steps.forEach((step, idx) => {
      console.log(`${idx + 1}. ${step.stepType} "${step.pattern}" (${step.filePath}:${step.lineNumber})`);
      console.log(`   Regex: ${step.regex}`);
    });
    console.log(`\nLoaded ${result.fixtures.length} fixtures:`);
    result.fixtures.forEach((fixture, idx) => {
      console.log(`${idx + 1}. ${fixture.functionName} (${fixture.filePath}:${fixture.defLine})`);
    });
  } catch (error) {
    console.error('ERROR:', error instanceof Error ? error.message : String(error));
    console.error('Stack:', error instanceof Error ? error.stack : '');
  }
}

main();
