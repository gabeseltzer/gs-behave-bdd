import * as path from 'path';
import { getBundledBehavePath, getPythonHelpersPath } from '../bundledBehave';
import { WorkspaceSettings } from '../settings';

/**
 * Builds the environment variables for a behave process.
 * The bundled libs path is always included in PYTHONPATH in both strategies:
 *   - 'useBundled': bundled path is prepended (takes priority over environment behave)
 *   - 'fromEnvironment': bundled path is appended (environment behave takes priority, bundled acts as fallback)
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

  // The NDJSON stream formatter is imported by behave (unlike discover.py, which
  // is spawned as a script), so its directory must be importable. Appended last so
  // it can never shadow a module the user's own project or environment provides.
  try {
    env['PYTHONPATH'] = `${env['PYTHONPATH']}${path.delimiter}${getPythonHelpersPath()}`;
  }
  catch {
    // Helpers missing (e.g. an incomplete build). Behave still runs; the extension
    // falls back to junit results because the formatter will fail to import.
  }

  return env;
}
