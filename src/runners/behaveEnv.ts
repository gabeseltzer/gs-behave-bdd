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

  const bundledPath = getBundledBehavePath();
  const existingPythonPath = env['PYTHONPATH'] || '';

  if (wkspSettings.importStrategy === 'useBundled') {
    // Bundled takes priority - prepend
    env['PYTHONPATH'] = existingPythonPath
      ? `${bundledPath}${path.delimiter}${existingPythonPath}`
      : bundledPath;
  } else {
    // fromEnvironment - append bundled as fallback
    env['PYTHONPATH'] = existingPythonPath
      ? `${existingPythonPath}${path.delimiter}${bundledPath}`
      : bundledPath;
  }

  return env;
}
