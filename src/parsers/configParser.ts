// configParser.ts
// Reads behave's native config files and returns a structured BehaveConfigResult.
// Supports: behave.ini, .behaverc, setup.cfg, tox.ini, pyproject.toml
// Priority order matches behave's own config_filenames() function.
// Phase 1: stateless, no caching, no VS Code workspace API beyond URI construction.
import * as vscode from 'vscode';
import * as fs from 'fs';
import { parse as parseToml } from 'smol-toml';

// Structured result returned by findBehaveConfig().
// All fields are resolved at parse time; consumers need not re-read the config file.
export interface BehaveConfigResult {
  configFileUri: vscode.Uri;
  format: 'ini' | 'toml';
  rawPaths: string[];
  resolvedPath: vscode.Uri;
}

// Priority-ordered list of config filenames behave recognises, mapped to their format.
// Source: bundled/libs/behave/configuration.py config_filenames() ~line 692
const CONFIG_FILES: Array<{ filename: string; format: 'ini' | 'toml' }> = [
  { filename: 'behave.ini', format: 'ini' },
  { filename: '.behaverc', format: 'ini' },
  { filename: 'setup.cfg', format: 'ini' },
  { filename: 'tox.ini', format: 'ini' },
  { filename: 'pyproject.toml', format: 'toml' },
];

// Entry point — called by Phase 2's integration layer.
// Returns the first config file found in priority order that contains a valid [behave] section,
// or undefined if no such file exists.
export function findBehaveConfig(wkspUri: vscode.Uri): BehaveConfigResult | undefined {
  return searchConfigFiles(wkspUri);
}

// Iterates CONFIG_FILES in priority order, returning the first that yields a non-undefined result.
function searchConfigFiles(wkspUri: vscode.Uri): BehaveConfigResult | undefined {
  for (const { filename, format } of CONFIG_FILES) {
    const fileUri = vscode.Uri.joinPath(wkspUri, filename);
    if (!fs.existsSync(fileUri.fsPath)) continue;
    const result = format === 'ini'
      ? parseIniConfig(fileUri)
      : parseTomlConfig(fileUri);
    if (result !== undefined) return result;
  }
  return undefined;
}

// Parses an INI-format config file (behave.ini, .behaverc, setup.cfg, tox.ini).
// Replicates Python's configparser continuation-line semantics:
//   - Lines indented under a key are continuation values (not new keys).
//   - Blank lines and comment lines (#, ;) terminate continuation.
// Source: bundled/libs/behave/configuration.py read_configparser() ~line 558
function parseIniConfig(fileUri: vscode.Uri): BehaveConfigResult | undefined {
  let content: string;
  try {
    content = fs.readFileSync(fileUri.fsPath, 'utf8');
  } catch {
    return undefined; // unreadable file — silently skip
  }

  const lines = content.split(/\r?\n/);
  let inBehaveSection = false;
  let pathsLines: string[] = [];
  let collectingPaths = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('[')) {
      // Section header — determine which section we are entering
      if (trimmed === '[behave]') {
        inBehaveSection = true;
        collectingPaths = false;
        continue;
      } else if (inBehaveSection) {
        // Left the [behave] section — no need to read further
        break;
      }
      continue;
    }

    if (!inBehaveSection) continue;

    // Blank lines and comment lines terminate continuation (Python configparser behaviour)
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith(';')) {
      collectingPaths = false;
      continue;
    }

    // Check for the paths key: /^paths\s*=/
    if (/^paths\s*=/.test(trimmed)) {
      const value = trimmed.replace(/^paths\s*=\s*/, '');
      pathsLines = value ? [value] : [];
      collectingPaths = true;
      continue;
    }

    // Continuation line: raw line (not trimmed) starts with whitespace
    if (collectingPaths && /^\s/.test(line)) {
      if (trimmed) pathsLines.push(trimmed);
      continue;
    }

    // Different key encountered — stop collecting paths
    collectingPaths = false;
  }

  if (!inBehaveSection) return undefined; // DISC-06: no [behave] section found
  if (pathsLines.length === 0) return undefined; // paths key absent or empty

  const rawPaths = pathsLines.map(p => p.trim()).filter(p => p.length > 0);
  if (rawPaths.length === 0) return undefined;

  return buildResult(fileUri, 'ini', rawPaths);
}

// Parses a TOML-format config file (pyproject.toml).
// Accesses [tool.behave] table and reads the paths array.
// Source: bundled/libs/behave/configuration.py read_toml_config() ~line 601
function parseTomlConfig(fileUri: vscode.Uri): BehaveConfigResult | undefined {
  let content: string;
  try {
    content = fs.readFileSync(fileUri.fsPath, 'utf8');
  } catch {
    return undefined; // unreadable file — silently skip
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseToml(content) as Record<string, unknown>;
  } catch {
    return undefined; // malformed TOML — silently skip (Phase 3 adds user-facing warning)
  }

  // Navigate to [tool.behave]; silently skip if absent (DISC-06)
  const tool = parsed?.tool as Record<string, unknown> | undefined;
  const behave = tool?.behave as Record<string, unknown> | undefined;
  if (!behave) return undefined;

  // paths must be a TOML array — scalar string is a user error (see Pitfall 2 in RESEARCH.md)
  const paths = behave.paths;
  if (!Array.isArray(paths) || paths.length === 0) return undefined;

  const rawPaths = paths.map(String).filter(p => p.length > 0);
  if (rawPaths.length === 0) return undefined;

  return buildResult(fileUri, 'toml', rawPaths);
}

// Resolves rawPaths[0] against the config file's directory.
// v1: only the first path is resolved (D-03, D-04); all paths are captured in rawPaths[].
// Source: bundled/libs/behave/configuration.py path resolution ~lines 547-555
function resolvePaths(rawPaths: string[], configFileUri: vscode.Uri): vscode.Uri {
  const configDirUri = vscode.Uri.joinPath(configFileUri, '..');
  const rawPath = rawPaths[0];

  // Absolute path detection: Unix (/...) or Windows (C:\... or C:/...)
  if (rawPath.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(rawPath)) {
    return vscode.Uri.file(rawPath);
  }

  // Relative path: resolve against config file's directory
  return vscode.Uri.joinPath(configDirUri, rawPath);
}

function buildResult(
  configFileUri: vscode.Uri,
  format: 'ini' | 'toml',
  rawPaths: string[]
): BehaveConfigResult {
  return {
    configFileUri,
    format,
    rawPaths,
    resolvedPath: resolvePaths(rawPaths, configFileUri),
  };
}
