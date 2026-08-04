import * as cp from 'child_process';
import * as path from 'path';
import { resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';

// Helper function to convert Windows long paths with spaces to short (8.3) format
// This works around a bug in @vscode/test-electron v2.5.2 where paths with spaces
// are not properly quoted when passed to VS Code with shell:true on Windows
export function getShortPathOnWindows(longPath: string): string {
  if (process.platform === 'win32' && longPath.includes(' ')) {
    const result = cp.execSync(`for %I in ("${longPath}") do @echo %~sI`, {
      encoding: 'utf-8',
      shell: 'cmd.exe'
    });
    return result.trim();
  }
  return longPath;
}

// The VSCode extension host exports ELECTRON_RUN_AS_NODE=1 plus a set of VSCODE_* vars to every
// process it spawns. If the test runner is launched from such a process (e.g. a terminal or agent
// owned by an extension), those vars leak into the VSCode instance we spawn here, so its Electron
// binary starts as plain node, treats the first launch arg as a script, and dies with
// "Cannot find module .../example-projects/simple" before any test runs.
// child_process drops env keys whose value is undefined, so this unsets them for the child only.
export function getCleanTestEnv(): { [key: string]: string | undefined } {
  const env: { [key: string]: string | undefined } = { ELECTRON_RUN_AS_NODE: undefined };
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('VSCODE_'))
      env[key] = undefined;
  }
  return env;
}

export async function installMsPythonExtension(vscodeExecutablePath: string): Promise<void> {
  console.log('installing ms-python.python extension...');
  const [cliPath, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
  const isWindows = process.platform === 'win32';
  const isCmdFile = cliPath.endsWith('.cmd');
  const result = isWindows && isCmdFile
    ? cp.spawnSync('cmd.exe', ['/c', cliPath, ...args, '--install-extension', 'ms-python.python'], {
      encoding: 'utf-8',
      stdio: 'inherit',
    })
    : cp.spawnSync(cliPath, [...args, '--install-extension', 'ms-python.python'], {
      encoding: 'utf-8',
      stdio: 'inherit',
    });
  if (result.error)
    throw result.error;
  if (result.status !== 0)
    throw new Error(`ms-python.python extension install failed with exit code ${result.status}`);
}
