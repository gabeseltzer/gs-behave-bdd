import * as vscode from 'vscode';
import * as fs from 'fs';
import { DEFAULT_EXCLUDE_DIRS, uriId } from '../common';
import { findBehaveConfig } from '../parsers/configParser';
import { diagLog } from '../logger';


export interface ScanResultEntry {
  configFileUri: vscode.Uri;
  dirUri: vscode.Uri;
  depth: number;
  configPriority: number;   // 0=behave.ini, 1=.behaverc, 2=setup.cfg, 3=tox.ini, 4=pyproject.toml
}

export interface ScanResult {
  primary: ScanResultEntry | undefined;
  alsoFound: ScanResultEntry[];
  scannedDirs: number;
  circuitBreakerFired: boolean;
  maxDepthReached: number;
}


const CONFIG_PRIORITY: Record<string, number> = {
  'behave.ini': 0,
  '.behaverc': 1,
  'setup.cfg': 2,
  'tox.ini': 3,
  'pyproject.toml': 4,
};


// --- Scan result cache ---

const scanResultCache = new Map<string, ScanResult>();

export function getCachedScanResult(wkspUri: vscode.Uri): ScanResult | undefined {
  return scanResultCache.get(uriId(wkspUri));
}

export function setCachedScanResult(wkspUri: vscode.Uri, result: ScanResult): void {
  scanResultCache.set(uriId(wkspUri), result);
}

export function clearScanResultCache(): void {
  scanResultCache.clear();
}


// --- BFS subdirectory config scanner ---

export async function scanForBehaveConfig(
  wkspUri: vscode.Uri,
  maxDepth: number,
  stopOnFirstHit = false,
  maxEntriesScanned = 5000
): Promise<ScanResult> {

  const result: ScanResult = {
    primary: undefined,
    alsoFound: [],
    scannedDirs: 0,
    circuitBreakerFired: false,
    maxDepthReached: 0,
  };

  if (maxDepth === 0) {
    diagLog(`scanForBehaveConfig: maxDepth=0, skipping scan`, wkspUri);
    return result;
  }

  diagLog(`scanForBehaveConfig: starting BFS scan (maxDepth=${maxDepth}, stopOnFirstHit=${stopOnFirstHit})`, wkspUri);

  const visitedRealPaths = new Set<string>();
  const allFound: ScanResultEntry[] = [];
  let entriesScanned = 0;
  let foundAtDepth: number | undefined;

  // BFS queue: start with workspace root's immediate children at depth 1
  const queue: Array<{ uri: vscode.Uri; depth: number }> = [];

  // Seed the queue with depth-1 children
  let rootEntries: [string, vscode.FileType][];
  try {
    rootEntries = await vscode.workspace.fs.readDirectory(wkspUri);
  } catch {
    diagLog(`scanForBehaveConfig: cannot read workspace root, aborting`, wkspUri);
    return result;
  }

  for (const [name, fileType] of rootEntries) {
    entriesScanned++;
    if (entriesScanned >= maxEntriesScanned) {
      result.circuitBreakerFired = true;
      diagLog(`scanForBehaveConfig: circuit breaker fired at ${entriesScanned} entries`, wkspUri);
      break;
    }
    if ((fileType & vscode.FileType.Directory) === 0) continue;
    if (isDirExcludedForScan(name)) continue;
    queue.push({ uri: vscode.Uri.joinPath(wkspUri, name), depth: 1 });
  }

  // BFS loop
  while (queue.length > 0 && !result.circuitBreakerFired) {
    const item = queue.shift();
    if (!item) break;
    const { uri: dirUri, depth } = item;

    // Stop-on-first-hit: if we found configs at an earlier depth and now we're deeper, stop
    if (stopOnFirstHit && foundAtDepth !== undefined && depth > foundAtDepth) {
      continue;
    }

    // Symlink cycle protection
    let realPath: string;
    try {
      realPath = fs.realpathSync.native(dirUri.fsPath);
    } catch {
      continue; // cannot resolve — skip
    }
    if (visitedRealPaths.has(realPath)) continue;
    visitedRealPaths.add(realPath);

    result.scannedDirs++;
    if (depth > result.maxDepthReached) result.maxDepthReached = depth;

    // Check for config in this directory
    const configResult = findBehaveConfig(dirUri);
    if (configResult && configResult.ok) {
      const configFileName = configResult.configFileUri.path.split('/').pop() ?? '';
      const priority = CONFIG_PRIORITY[configFileName] ?? 99;
      const entry: ScanResultEntry = {
        configFileUri: configResult.configFileUri,
        dirUri,
        depth,
        configPriority: priority,
      };
      allFound.push(entry);
      if (foundAtDepth === undefined) foundAtDepth = depth;
      diagLog(`scanForBehaveConfig: found config at depth ${depth}: ${configFileName} in ${dirUri.fsPath}`, wkspUri);
    }

    // Enqueue children if we haven't reached maxDepth
    if (depth < maxDepth) {
      // stopOnFirstHit: don't enqueue deeper if we already found something
      if (stopOnFirstHit && foundAtDepth !== undefined) {
        // Still process remaining same-depth items in queue, but don't go deeper
        continue;
      }

      let childEntries: [string, vscode.FileType][];
      try {
        childEntries = await vscode.workspace.fs.readDirectory(dirUri);
      } catch {
        continue;
      }

      for (const [name, fileType] of childEntries) {
        entriesScanned++;
        if (entriesScanned >= maxEntriesScanned) {
          result.circuitBreakerFired = true;
          diagLog(`scanForBehaveConfig: circuit breaker fired at ${entriesScanned} entries`, wkspUri);
          break;
        }
        if ((fileType & vscode.FileType.Directory) === 0) continue;
        if (isDirExcludedForScan(name)) continue;
        queue.push({ uri: vscode.Uri.joinPath(dirUri, name), depth: depth + 1 });
      }
    }
  }

  // Sort by (depth ASC, configPriority ASC) and split into primary + alsoFound
  allFound.sort((a, b) => a.depth - b.depth || a.configPriority - b.configPriority);
  if (allFound.length > 0) {
    result.primary = allFound[0];
    result.alsoFound = allFound.slice(1);
  }

  diagLog(
    `scanForBehaveConfig: complete — ${allFound.length} config(s) found, ` +
    `${result.scannedDirs} dirs scanned, maxDepth reached=${result.maxDepthReached}`,
    wkspUri
  );

  return result;
}


function isDirExcludedForScan(dirName: string): boolean {
  if (dirName.startsWith('.')) return true;
  if (DEFAULT_EXCLUDE_DIRS.has(dirName)) return true;
  // Handle wildcard patterns like *.egg-info
  for (const pattern of DEFAULT_EXCLUDE_DIRS) {
    if (pattern.startsWith('*') && dirName.endsWith(pattern.substring(1)))
      return true;
  }
  return false;
}
