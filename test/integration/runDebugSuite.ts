import * as path from 'path';
import {
  downloadAndUnzipVSCode,
  runTests
} from '@vscode/test-electron';
import { getShortPathOnWindows, installMsPythonExtension } from './testRunUtils';


// Run the debug integration suite in a clean, standalone VSCode process.
// This MUST be run from the command line (npm run test:debug-suite), never from
// a VSCode extensionHost launch config. Launching vscode.debug.startDebugging()
// inside an Extension Development Host that is itself being debugged by the outer
// VSCode creates nested DAP sessions and can crash the outer window.

async function runDebugSuite() {
  try {
    if (!process.argv[2] || !process.argv[2].startsWith('--')) {
      throw new Error(`Expected version arg like --insiders or --stable, got: ${process.argv[2]}`);
    }
    const version = process.argv[2].slice(2);
    const extensionDevelopmentPath = path.resolve(__dirname, '../../../..');

    console.log(`checking for latest ${version} vscode...`);
    const vscodeExecutablePath = await downloadAndUnzipVSCode(version);

    await installMsPythonExtension(vscodeExecutablePath);

    console.log("starting debug suite...");

    const launchArgs = ["example-projects/simple"];
    const extensionTestsPath = getShortPathOnWindows(path.resolve(__dirname, './debug suite'));
    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs
    });

    console.log("debug suite complete");

  } catch (err) {
    console.error('Failed to run debug suite, ', err);
    process.exit(1);
  }
}


runDebugSuite();
