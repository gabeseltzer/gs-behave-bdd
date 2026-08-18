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


/** The module name behave imports for the NDJSON event formatter. */
export const STREAM_FORMATTER_MODULE = 'gs_behave_bdd_stream';
/** The scoped name passed to behave's --format. */
export const STREAM_FORMATTER_NAME = `${STREAM_FORMATTER_MODULE}:StreamFormatter`;


/**
 * Returns the directory holding the extension's shipped Python modules, for
 * PYTHONPATH. Unlike discover.py - which is spawned as a script - the stream
 * formatter is IMPORTED by behave, so its directory has to be importable.
 *
 * Same dual-location logic as getBundledBehavePath(): in production __dirname is
 * dist/, and under tsc output (tests) we walk up to the project root.
 */
export function getPythonHelpersPath(): string {
  const marker = `${STREAM_FORMATTER_MODULE}.py`;

  const webpackPath = path.join(__dirname, 'python');
  if (fs.existsSync(path.join(webpackPath, marker)))
    return webpackPath;

  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, 'src', 'python');
    if (fs.existsSync(path.join(candidate, marker)))
      return candidate;
    const parent = path.dirname(dir);
    if (parent === dir)
      break;
    dir = parent;
  }

  throw new Error(`Could not find ${marker} (searched from ${__dirname})`);
}
