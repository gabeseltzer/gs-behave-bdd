// configParser.ts
// Reads behave's native config files and returns a structured BehaveConfigResult.
// Supports: behave.ini, .behaverc, setup.cfg, tox.ini, pyproject.toml
// Priority order matches behave's own config_filenames() function.
// Phase 1: stateless, no caching, no VS Code workspace API beyond URI construction.
import * as vscode from 'vscode';
import * as fs from 'fs';
import { parse as parseToml } from 'smol-toml';

// Discriminated union: ok:true = success, ok:false = config file found but malformed (D-05)
// undefined return from findBehaveConfig = no config file found at all (not an error)
export type BehaveConfigResult =
  | { ok: true; configFileUri: vscode.Uri; format: 'ini' | 'toml'; rawPaths: string[]; resolvedPaths: vscode.Uri[]; pathLineNumbers: number[] }
  | { ok: false; configFileUri: vscode.Uri; errorMessage: string };

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
// If a malformed config is found, captures it as firstError and keeps searching for a valid one.
// Returns firstError only if no successful config is found (D-06: malformed falls through to convention).
function searchConfigFiles(wkspUri: vscode.Uri): BehaveConfigResult | undefined {
  let firstError: BehaveConfigResult | undefined;
  for (const { filename, format } of CONFIG_FILES) {
    const fileUri = vscode.Uri.joinPath(wkspUri, filename);
    if (!fs.existsSync(fileUri.fsPath)) continue;
    const result = format === 'ini'
      ? parseIniConfig(fileUri)
      : parseTomlConfig(fileUri);
    if (result === undefined) continue;       // no [behave] section -- skip this file
    if (result.ok) return result;             // success -- return immediately
    if (!firstError) firstError = result;     // malformed -- capture first error, keep searching
  }
  return firstError;  // return first error if no successful config found, or undefined
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
  let behaveHeaderLine = 0;
  let pathsLines: string[] = [];
  let pathLineNumbers: number[] = [];
  let collectingPaths = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const trimmed = line.trim();

    if (trimmed.startsWith('[')) {
      // Section header — determine which section we are entering
      if (trimmed === '[behave]') {
        inBehaveSection = true;
        behaveHeaderLine = lineIndex;
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
      pathLineNumbers = value ? [lineIndex] : [];
      collectingPaths = true;
      continue;
    }

    // Continuation line: raw line (not trimmed) starts with whitespace
    if (collectingPaths && /^\s/.test(line)) {
      if (trimmed) {
        pathsLines.push(trimmed);
        pathLineNumbers.push(lineIndex);
      }
      continue;
    }

    // Different key encountered — stop collecting paths
    collectingPaths = false;
  }

  if (!inBehaveSection) return undefined; // DISC-06: no [behave] section found
  if (pathsLines.length === 0) {
    // [behave] section found but no paths key — behave defaults to 'features/' relative to config dir
    return buildResult(fileUri, 'ini', ['features'], [behaveHeaderLine]);
  }

  // Filter in lockstep: rawPaths and pathLineNumbers keep only non-empty entries
  const rawPaths: string[] = [];
  const filteredLineNumbers: number[] = [];
  for (let i = 0; i < pathsLines.length; i++) {
    const trimmed = pathsLines[i].trim();
    if (trimmed.length > 0) {
      rawPaths.push(trimmed);
      filteredLineNumbers.push(pathLineNumbers[i]);
    }
  }
  if (rawPaths.length === 0) return undefined;

  return buildResult(fileUri, 'ini', rawPaths, filteredLineNumbers);
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
  } catch (e: unknown) {
    // Malformed TOML: config file exists but is invalid -- return error variant (D-05)
    // Note: "no [tool.behave] section" still returns undefined (not an error -- Pitfall 3)
    return { ok: false, configFileUri: fileUri, errorMessage: e instanceof Error ? e.message : String(e) };
  }

  // Navigate to [tool.behave]; silently skip if absent (DISC-06)
  const tool = parsed?.tool as Record<string, unknown> | undefined;
  const behave = tool?.behave as Record<string, unknown> | undefined;
  if (!behave) return undefined;

  // Derive line numbers from the raw text for diagnostic attachment (D-05)
  const contentLines = content.split(/\r?\n/);

  // paths must be a TOML array — scalar string is a user error (see Pitfall 2 in RESEARCH.md)
  const paths = behave.paths;
  if (paths === undefined) {
    // [tool.behave] section found but no paths key — behave defaults to 'features/' relative to config dir
    let sectionLine = 0;
    for (let i = 0; i < contentLines.length; i++) {
      if (/^\[tool\.behave\]/.test(contentLines[i].trim())) {
        sectionLine = i;
        break;
      }
    }
    return buildResult(fileUri, 'toml', ['features'], [sectionLine]);
  }
  if (!Array.isArray(paths) || paths.length === 0) return undefined;

  const rawPaths = paths.map(String).filter(p => p.length > 0);
  if (rawPaths.length === 0) return undefined;
  let sectionStart = 0;
  for (let i = 0; i < contentLines.length; i++) {
    if (/^\[tool\.behave\]/.test(contentLines[i].trim())) {
      sectionStart = i;
      break;
    }
  }
  const pathLineNumbers: number[] = [];
  for (const rp of rawPaths) {
    let found = false;
    for (let i = sectionStart; i < contentLines.length; i++) {
      if (contentLines[i].includes(rp)) {
        pathLineNumbers.push(i);
        found = true;
        break;
      }
    }
    if (!found) pathLineNumbers.push(sectionStart);
  }

  return buildResult(fileUri, 'toml', rawPaths, pathLineNumbers);
}

// Private helper (D-10 — colocated in configParser per CONTEXT.md Claude's Discretion).
// Converts Windows-style backslashes to forward slashes before URI construction.
// Not exported — only caller is resolvePaths below.
function normalizeSeparators(rawPath: string): string {
  return rawPath.replaceAll('\\', '/');
}

// Resolves every entry of rawPaths against the config file's directory.
// Applies Windows backslash -> forward slash normalization per entry (D-10).
// Returns a non-empty Uri[] (D-05 — rawPaths is guaranteed non-empty by callers).
// Source: bundled/libs/behave/configuration.py path resolution ~lines 547-555
function resolvePaths(rawPaths: string[], configFileUri: vscode.Uri): vscode.Uri[] {
  const configDirUri = vscode.Uri.joinPath(configFileUri, '..');
  return rawPaths.map(rawPath => {
    const normalized = normalizeSeparators(rawPath);
    // Absolute path detection: Unix (/...) or Windows (C:\... or C:/... — post-normalize both become C:/...)
    if (normalized.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(normalized)) {
      return vscode.Uri.file(normalized);
    }
    // Relative path: resolve against config file's directory
    return vscode.Uri.joinPath(configDirUri, normalized);
  });
}

function buildResult(
  configFileUri: vscode.Uri,
  format: 'ini' | 'toml',
  rawPaths: string[],
  pathLineNumbers: number[]
): BehaveConfigResult {
  return {
    ok: true,
    configFileUri,
    format,
    rawPaths,
    resolvedPaths: resolvePaths(rawPaths, configFileUri),
    pathLineNumbers,
  };
}