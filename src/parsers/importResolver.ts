import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { performance } from 'perf_hooks';
import { PythonImport } from './importParser';
import { diagLog } from '../logger';

/**
 * Resolves Python imports to their file paths using importlib
 * @param pythonExec Path to the Python executable
 * @param imports Array of parsed Python imports
 * @param projectDir Project root directory (used as cwd for subprocess)
 * @param sourceFileDir Directory of the source file being parsed (for relative imports)
 * @returns Map of module paths to resolved file paths (null if unresolvable)
 */
export async function resolveImports(
  pythonExec: string,
  imports: PythonImport[],
  projectDir: string,
  sourceFileDir?: string
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();

  if (!imports || imports.length === 0) {
    return results;
  }

  // Separate relative and absolute imports
  const relativeImports = imports.filter(imp => imp.isRelative);
  const absoluteImports = imports.filter(imp => !imp.isRelative);

  // Process relative imports using file path logic
  if (relativeImports.length > 0 && sourceFileDir) {
    for (const imp of relativeImports) {
      const resolved = resolveRelativeImport(imp, sourceFileDir);
      diagLog(`[resolveImports] relative import: ${imp.modulePath} -> ${resolved}`);
      results.set(imp.modulePath, resolved);
    }
  }

  // Process absolute imports using importlib
  if (absoluteImports.length > 0) {
    const absoluteResults = await resolveAbsoluteImports(
      pythonExec,
      absoluteImports,
      projectDir
    );
    for (const [modulePath, filePath] of absoluteResults) {
      diagLog(`[resolveImports] absolute import: ${modulePath} -> ${filePath}`);
      results.set(modulePath, filePath);
    }
  }

  return results;
}

/**
 * Resolves absolute imports by spawning Python with importlib
 */
async function resolveAbsoluteImports(
  pythonExec: string,
  imports: PythonImport[],
  projectDir: string
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();

  // Extract unique module paths
  const uniqueModules = new Set(imports.map(imp => imp.modulePath));
  const modules = Array.from(uniqueModules);

  if (modules.length === 0) {
    return results;
  }

  try {
    const startTime = performance.now();

    // Python script to resolve imports using importlib
    const pythonScript = `
import importlib.util, json, sys
results = {}
for mod in sys.argv[1:]:
    try:
        spec = importlib.util.find_spec(mod)
        results[mod] = spec.origin if spec and spec.origin else None
    except (ModuleNotFoundError, ValueError):
        results[mod] = None
print(json.dumps(results))
`;

    const output = await spawnPython(pythonExec, pythonScript, modules, projectDir);
    const parsed = JSON.parse(output);

    for (const mod of modules) {
      results.set(mod, parsed[mod] ?? null);
    }

    const elapsed = Math.round(performance.now() - startTime);
    diagLog(`resolveAbsoluteImports: resolved ${modules.length} modules in ${elapsed}ms`);
  } catch (e) {
    // Silently handle errors - return null for all imports
    diagLog(`resolveAbsoluteImports error: ${e instanceof Error ? e.message : String(e)}`);
    for (const mod of modules) {
      results.set(mod, null);
    }
  }

  return results;
}

/**
 * Spawns Python process with inline script
 */
function spawnPython(
  pythonExec: string,
  script: string,
  args: string[],
  cwd: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const cp = spawn(pythonExec, ['-c', script, ...args], {
      cwd
    });

    if (!cp.pid) {
      reject(new Error(`Failed to spawn Python process: ${pythonExec}`));
      return;
    }

    const timeoutId = setTimeout(() => {
      cp.kill();
      reject(new Error('Python process timeout'));
    }, 10000);

    cp.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    cp.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    cp.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });

    cp.on('close', (code) => {
      clearTimeout(timeoutId);
      if (code !== 0) {
        reject(new Error(`Python process exited with code ${code}: ${stderr}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

/**
 * Resolves relative imports using file path logic
 * @param imp The relative import
 * @param sourceFileDir Directory containing the source file with the import
 * @returns Path to the resolved module file, or null if not found
 */
export function resolveRelativeImport(
  imp: PythonImport,
  sourceFileDir: string
): string | null {
  if (!imp.isRelative) {
    return null;
  }

  // Navigate up directories based on relative dots
  let currentDir = sourceFileDir;
  for (let i = 0; i < imp.relativeDots - 1; i++) {
    currentDir = path.dirname(currentDir);
  }

  // Convert module path to file path
  const moduleName = imp.modulePath;
  if (!moduleName || moduleName.length === 0) {
    // Pure relative import like "from . import something"
    return null;
  }

  // Check for both .py file and __init__.py in package
  const pyFile = path.join(currentDir, moduleName.replace(/\./g, path.sep) + '.py');
  if (fs.existsSync(pyFile)) {
    return pyFile;
  }

  const pkgInitFile = path.join(
    currentDir,
    moduleName.replace(/\./g, path.sep),
    '__init__.py'
  );
  if (fs.existsSync(pkgInitFile)) {
    return pkgInitFile;
  }

  return null;
}
