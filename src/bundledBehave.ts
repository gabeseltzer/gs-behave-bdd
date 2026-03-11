import * as fs from 'fs';
import * as path from 'path';

export const BUNDLED_BEHAVE_VERSION = '1.3.3';

/**
 * Returns the absolute path to the bundled behave libs directory.
 * In production (webpack bundle), __dirname points to dist/.
 * In tests (tsc output), __dirname points to out/test/src/ or similar.
 */
export function getBundledBehavePath(): string {
  // When running from webpack bundle, bundled/ is a sibling of the bundle in dist/
  const webpackPath = path.join(__dirname, 'bundled', 'libs');
  if (fs.existsSync(webpackPath))
    return webpackPath;

  // When running from tsc output (tests), walk up to find project root (contains package.json)
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, 'bundled', 'libs');
    if (fs.existsSync(candidate))
      return candidate;
    const parent = path.dirname(dir);
    if (parent === dir)
      break;
    dir = parent;
  }

  throw new Error(`Could not find bundled behave libs (searched from ${__dirname})`);
}
