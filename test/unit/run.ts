// Unit test runner for Mocha

import * as path from 'path';
import * as Mocha from 'mocha';
import * as glob from 'glob';

// Load setup FIRST before any tests are loaded
// This ensures the vscode mock is in place before test files try to import it
require('./setup');

export async function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 5000
  });

  const testsRoot = path.resolve(__dirname, '..');

  // Find all test files
  const files = glob.sync('**/unit/**/*.test.js', { cwd: testsRoot });

  // Add files to the test suite
  files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

  return new Promise<void>((resolve, reject) => {
    try {
      // Run the mocha test
      mocha.run(failures => {
        if (failures > 0) {
          reject(new Error(`${failures} tests failed.`));
        } else {
          resolve();
        }
      });
    } catch (err) {
      console.error(err);
      reject(err);
    }
  });
}

// Run tests if this module is executed directly
if (require.main === module) {
  run().catch(err => {
    console.error('Error running tests:', err);
    process.exit(1);
  });
}
