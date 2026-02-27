import * as path from 'path';
import { getBundledBehavePath } from '../bundledBehave';
import { WorkspaceSettings } from '../settings';

/**
 * Builds the environment variables for a behave process.
 * When importStrategy is 'useBundled', prepends the bundled libs path to PYTHONPATH.
 */
export function getBehaveEnv(wkspSettings: Pick<WorkspaceSettings, 'importStrategy' | 'getEffectiveEnvVars'>):
  { [key: string]: string | undefined } {

  const effectiveEnvVars = wkspSettings.getEffectiveEnvVars();
  const env: { [key: string]: string | undefined } = { ...process.env, ...effectiveEnvVars };

  if (wkspSettings.importStrategy === 'useBundled') {
    const bundledPath = getBundledBehavePath();
    const existingPythonPath = env['PYTHONPATH'] || '';
    env['PYTHONPATH'] = existingPythonPath
      ? `${bundledPath}${path.delimiter}${existingPythonPath}`
      : bundledPath;
  }

  return env;
}
