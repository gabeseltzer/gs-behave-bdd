import * as cp from 'child_process';
import * as path from 'path';
import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
  runTests
} from '@vscode/test-electron';


// Run the debug integration suite in a clean, standalone VSCode process.
// This MUST be run from the command line (npm run test:debug-suite), never from
// a VSCode extensionHost launch config. Launching vscode.debug.startDebugging()
// inside an Extension Development Host that is itself being debugged by the outer
// VSCode creates nested DAP sessions and can crash the outer window.

function getShortPathOnWindows(longPath: string): string {
  if (process.platform === 'win32' && longPath.includes(' ')) {
    const result = cp.execSync(`for %I in ("${longPath}") do @echo %~sI`, {
      encoding: 'utf-8',
      shell: 'cmd.exe'
    });
    return result.trim();
  }
  return longPath;
}

async function runDebugSuite() {
  try {
    const version = process.argv[2].slice(2);
    const extensionDevelopmentPath = path.resolve(__dirname, '../../../..');

    console.log(`checking for latest ${version} vscode...`);
    const vscodeExecutablePath = await downloadAndUnzipVSCode(version);

    console.log(`installing ms-python.python extension into ${version} version...`);
    const [cliPath, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
    const isWindows = process.platform === 'win32';
    const isCmdFile = cliPath.endsWith('.cmd');
    const result = isWindows && isCmdFile
      ? cp.spawnSync('cmd.exe', ['/c', cliPath, ...args, "--install-extension", "ms-python.python"], {
        encoding: 'utf-8',
        stdio: 'inherit',
      })
      : cp.spawnSync(cliPath, [...args, "--install-extension", "ms-python.python"], {
        encoding: 'utf-8',
        stdio: 'inherit',
      });
    if (result.error)
      throw result.error;

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
