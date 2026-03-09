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
