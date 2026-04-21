import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { customAlphabet } from 'nanoid';
import { config } from "./configuration";
import { Scenario, TestData } from './parsers/testFile';
import { WorkspaceSettings } from './settings';
import { diagLog } from './logger';
import { getJunitDirUri } from './watchers/junitWatcher';
import { findBehaveConfig } from './parsers/configParser';
import { getCachedScanResult } from './discovery/configScanner';
import { clearPathDiagnostics, setPathResolutionDiagnostics, setSubsumptionDiagnostics } from './handlers/configDiagnostics';



const vwfs = vscode.workspace.fs;
export type TestCounts = { nodeCount: number, testCount: number };

export const WIN_MAX_PATH = 259; // 256 + 3 for "C:\", see https://superuser.com/a/1620952
export const WIN_MAX_CMD = 8191; // 8192 - 1, see https://docs.microsoft.com/en-us/windows/win32/procthread/command-line-limitation
export const FOLDERNAME_CHARS_VALID_ON_ALLPLATFORMS = /[^ a-zA-Z0-9_.-]/g;
export const BEHAVE_EXECUTION_ERROR_MESSAGE = "--- BEHAVE EXECUTION ERROR DETECTED ---"

/** Escape regex special characters in a string so it can be used as a literal in a RegExp. */
export const escapeRegex = (str: string) => str.replace(/[".*+?^${}()|[\]\\]/g, '\\$&');

export const sepr = ":////:"; // separator that cannot exist in file paths, i.e. safe for splitting in a path context
export const beforeFirstSepr = (str: string) => str.substring(0, str.indexOf(sepr));
export const afterFirstSepr = (str: string) => str.substring(str.indexOf(sepr) + sepr.length, str.length);

export type DiscoverySource = "settings" | "config-file" | "convention";

export interface DiscoveryEntry {
  source: DiscoverySource;
  configFileUri?: vscode.Uri;       // set when source = "config-file"
  configError?: {                   // set when malformed config found (D-05)
    configFileUri: vscode.Uri;
    errorMessage: string;
  };
  featuresUris: vscode.Uri[];       // non-empty per D-05; length-1 in every Phase 7 branch
  alsoFoundConfigs?: vscode.Uri[];  // Phase 9: other configs found during subdir scan
}


// the main purpose of WkspError is that it enables us to have an error containing a workspace uri that 
// can (where required) be thrown back up to the top level of the stack. this means that:
// - the logger can log to the specific workspace output window
// - the logger can use the workspace name in the notification window
// - the error is only logged/displayed once 
// - the top-level catch can simply call config.logger.showError(e) and Logger will handle the rest
// for more info on error handling, see contributing.md
export class WkspError extends Error {
  constructor(errorOrMsg: unknown, public wkspUri: vscode.Uri, public run?: vscode.TestRun) {
    const msg = errorOrMsg instanceof Error ? errorOrMsg.message : errorOrMsg as string;
    super(msg);
    this.stack = errorOrMsg instanceof Error ? errorOrMsg.stack : undefined;
    Object.setPrototypeOf(this, WkspError.prototype);
  }
}


export const openDocumentRange = async (uri: vscode.Uri, range: vscode.Range, preserveFocus = true, preview = false) => {

  // fix for: "git reverted file no longer opens in read-only mode when go to step definition is clicked":
  // uri does not behave the same as vscode.Uri.file(uri.path)
  // e.g. in the first case, if the user discards (reverts) a git file change the file would open as readonly
  const openUri = vscode.Uri.file(uri.path);

  await vscode.commands.executeCommand('vscode.open', openUri, {
    selection: new vscode.Selection(range.start, range.end), preserveFocus: preserveFocus, preview: preview
  });
}


export const logExtensionVersion = (context: vscode.ExtensionContext): void => {
  const extensionVersion = context.extension.packageJSON.version;
  const releaseNotesUrl = `${context.extension.packageJSON.repository.url.replace(".git", "")}/releases/tag/v${extensionVersion}`;
  const outputVersion = extensionVersion.startsWith("0") ? extensionVersion + " pre-release" : extensionVersion;
  config.logger.logInfoAllWksps(`Behave BDD v${outputVersion}`);
  config.logger.logInfoAllWksps(`Release notes: ${releaseNotesUrl}`);
}


// these two uri functions are here to highlight why uri.toString() is needed:
// 1. uri.path and uri.fsPath BOTH give inconsistent casing of the drive letter on windows ("C:" vs "c:") 
// whether uri1.path === uri2.path or uri1.fsPath === uri2.fsPath depends on whether both uris are being set/read on
// a similar code stack (i.e. whether both used "C" or "c" when the value was set).
// at any rate, we can use toString() to provide consistent casing for matching one uri path or fsPath to another.
// 2. separately, two uris that point to the same path (regardless of casing) may not be the same object, so uri1 === uri2 would fail
// so whenever we plan to use a uri in an equals comparison we should use one of these functions
export function uriId(uri: vscode.Uri) {
  return uri.toString();
}
export function urisMatch(uri1: vscode.Uri, uri2: vscode.Uri) {
  return uri1.toString() === uri2.toString();
}


export async function cleanExtensionTempDirectory(cancelToken: vscode.CancellationToken) {

  const dirUri = config.extensionTempFilesUri;
  const junitDirUri = getJunitDirUri();

  // note - this function runs asynchronously, and we do not wait for it to complete before we start 
  // the junitWatcher, this is why we don't want to delete the (watched) junit directory itself (only its contents)

  try {
    const children = await vwfs.readDirectory(dirUri);

    for (const [name,] of children) {
      if (!cancelToken.isCancellationRequested) {
        const curUri = vscode.Uri.joinPath(dirUri, name);
        if (urisMatch(curUri, junitDirUri)) {
          const jChildren = await vwfs.readDirectory(curUri);
          for (const [jName,] of jChildren) {
            await vwfs.delete(vscode.Uri.joinPath(curUri, jName), { recursive: true, useTrash: true });
          }
          continue;
        }
        await vwfs.delete(curUri, { recursive: true, useTrash: true });
      }
    }
  }
  catch (e: unknown) {
    // we will get here if (a) the folder doesn't exist, or (b) the user has the folder open
  }
}



// get the actual value in the file or return undefined, this is
// for cases where we need to distinguish between an unset value and the default value
export const getActualWorkspaceSetting = <T>(wkspConfig: vscode.WorkspaceConfiguration, name: string, legacyConfig?: vscode.WorkspaceConfiguration): T => {
  const value = wkspConfig.inspect(name)?.workspaceFolderValue;
  if (value !== undefined) return value as T;
  if (legacyConfig) return legacyConfig.inspect(name)?.workspaceFolderValue as T;
  return undefined as unknown as T;
}


// Returns true if the named setting has been explicitly set at ANY VS Code scope
// (global, workspace, or workspace folder). Per D-01: implements INTG-02.
// Does NOT modify getActualWorkspaceSetting (different callers, different return types).
export function hasExplicitSetting(
  wkspConfig: vscode.WorkspaceConfiguration,
  name: string,
  legacyConfig?: vscode.WorkspaceConfiguration
): boolean {
  const insp = wkspConfig.inspect(name);
  if (insp && (insp.globalValue !== undefined || insp.workspaceValue !== undefined || insp.workspaceFolderValue !== undefined))
    return true;
  if (legacyConfig) {
    const legacyInsp = legacyConfig.inspect(name);
    if (legacyInsp?.workspaceFolderValue !== undefined) return true;
  }
  return false;
}


// Returns true if the named array setting has been explicitly set to a NON-EMPTY array
// at any VS Code scope. An empty array [] does NOT count as "explicitly set" (D-14).
export function hasExplicitNonEmptyArraySetting(
  wkspConfig: vscode.WorkspaceConfiguration,
  name: string
): boolean {
  const insp = wkspConfig.inspect<string[]>(name);
  if (!insp) return false;
  return (Array.isArray(insp.globalValue) && insp.globalValue.length > 0) ||
    (Array.isArray(insp.workspaceValue) && insp.workspaceValue.length > 0) ||
    (Array.isArray(insp.workspaceFolderValue) && insp.workspaceFolderValue.length > 0);
}

// THIS FUNCTION MUST BE FAST (ideally < 1ms)
// (check performance if you change it)
let workspaceFoldersWithFeatures: vscode.Uri[];
const discoveryCache = new Map<string, DiscoveryEntry>();

// Export getter so WorkspaceSettings can read discovery results without coupling to the Map
export function getDiscoveryEntry(wkspUri: vscode.Uri): DiscoveryEntry | undefined {
  return discoveryCache.get(uriId(wkspUri));
}

export const getUrisOfWkspFoldersWithFeatures = (forceRefresh = false): vscode.Uri[] => {

  if (!forceRefresh && workspaceFoldersWithFeatures)
    return workspaceFoldersWithFeatures;

  const start = performance.now();
  workspaceFoldersWithFeatures = [];
  discoveryCache.clear();

  function hasFeaturesFolder(folder: vscode.WorkspaceFolder): boolean {

    const wkspConfig = vscode.workspace.getConfiguration("gs-behave-bdd", folder.uri);
    const legacyWkspConfig = vscode.workspace.getConfiguration("behave-vsc", folder.uri);

    // === BRANCH A: Explicit settings detected (D-02, INTG-07) ===
    // When explicit settings exist at any scope, skip config-file discovery entirely.
    // Run existing settings-based logic unchanged for backward compatibility.
    if (hasExplicitSetting(wkspConfig, "projectPath", legacyWkspConfig) ||
        hasExplicitSetting(wkspConfig, "featuresPath", legacyWkspConfig) ||
        hasExplicitNonEmptyArraySetting(wkspConfig, "featuresPaths")) {

      const projectPath = getActualWorkspaceSetting<string>(wkspConfig, "projectPath", legacyWkspConfig);
      const featuresPath = getActualWorkspaceSetting<string>(wkspConfig, "featuresPath", legacyWkspConfig);

      // Determine the project root (either custom projectPath or workspace root)
      let projectUri = folder.uri;
      if (projectPath) {
        projectUri = vscode.Uri.joinPath(folder.uri, projectPath);
        if (!fs.existsSync(projectUri.fsPath)) {
          const fullPath = projectUri.fsPath;
          // Check if the path looks like it was doubled (common mistake)
          const hint = fullPath.includes(projectPath + path.sep + projectPath)
            ? ` Note: The path appears to be duplicated - "projectPath" should be relative to the workspace root, not an absolute path.`
            : "";
          vscode.window.showWarningMessage(
            `Behave BDD: Project path not found.\n\n` +
            `Workspace: "${folder.name}"\n` +
            `Configured projectPath: "${projectPath}"\n` +
            `Full path checked: "${fullPath}"${hint}\n\n` +
            `Behave BDD will ignore this workspace until the path is corrected.`,
            "OK"
          );
          return false;
        }
      }

      // default features path, no settings.json required
      let featuresUri = vscode.Uri.joinPath(projectUri, "features");

      // try/catch with await vwfs.stat(uri) is much too slow atm
      const hasDefaultFeaturesFolder = fs.existsSync(featuresUri.fsPath);

      if (!featuresPath && !hasDefaultFeaturesFolder) {
        return false; // probably a workspace with no behave requirements
      }

      // default features folder and nothing specified in settings.json (or default specified)
      if (hasDefaultFeaturesFolder && !featuresPath) {
        discoveryCache.set(uriId(folder.uri), { source: "settings", featuresUris: [featuresUri] });
        return true;
      }

      featuresUri = vscode.Uri.joinPath(projectUri, featuresPath as string);
      if (fs.existsSync(featuresUri.fsPath) && vscode.workspace.getWorkspaceFolder(featuresUri) === folder) {
        discoveryCache.set(uriId(folder.uri), { source: "settings", featuresUris: [featuresUri] });
        return true;
      }

      // we don't use config.logger.showWarn here, because we may not have a logger yet
      const projectPathInfo = projectPath ? ` (relative to projectPath "${projectPath}")` : "";
      vscode.window.showWarningMessage(
        `Behave BDD: Features path not found.\n\n` +
        `Workspace: "${folder.name}"\n` +
        `Configured featuresPath: "${featuresPath}"${projectPathInfo}\n` +
        `Full path checked: "${featuresUri.fsPath}"\n\n` +
        `Behave BDD will ignore this workspace until the path is corrected.`,
        "OK"
      );

      return false;
    }

    // === BRANCH B: No explicit settings -- config-file discovery (INTG-01) ===
    const configResult = findBehaveConfig(folder.uri);

    if (configResult) {
      if (configResult.ok) {
        // Clear stale path diagnostics before emitting new ones
        clearPathDiagnostics(configResult.configFileUri);

        // Dedup overlapping/duplicate paths (D-09, D-11)
        const dedupResult = dedupResolvedPaths(
          configResult.resolvedPaths, configResult.rawPaths, configResult.pathLineNumbers
        );

        // Emit subsumption warnings (D-10)
        if (dedupResult.subsumedPaths.length > 0) {
          setSubsumptionDiagnostics(configResult.configFileUri, dedupResult.subsumedPaths);
        }

        // Partition deduped paths into valid (exist on disk) and invalid
        const validPaths: vscode.Uri[] = [];
        const invalidPaths: { rawPath: string; lineNumber: number }[] = [];
        for (let i = 0; i < dedupResult.resolvedPaths.length; i++) {
          if (fs.existsSync(dedupResult.resolvedPaths[i].fsPath)) {
            validPaths.push(dedupResult.resolvedPaths[i]);
          } else {
            invalidPaths.push({
              rawPath: dedupResult.rawPaths[i],
              lineNumber: dedupResult.pathLineNumbers[i],
            });
          }
        }

        // Emit per-path Error diagnostics for invalid paths (D-04)
        if (invalidPaths.length > 0) {
          setPathResolutionDiagnostics(configResult.configFileUri, invalidPaths);
        }

        // Partial success: use valid paths (D-04)
        if (validPaths.length > 0) {
          discoveryCache.set(uriId(folder.uri), {
            source: "config-file",
            configFileUri: configResult.configFileUri,
            featuresUris: validPaths,
          });
          return true;
        }

        // ALL paths failed — do NOT fall through to convention (D-06)
        return false;
      } else {
        // ok:false -- malformed config file; capture error, fall through to convention (D-06)
        // Store a partial entry so Phase 3 can read the configError
        discoveryCache.set(uriId(folder.uri), {
          source: "convention",
          configError: {
            configFileUri: configResult.configFileUri,
            errorMessage: configResult.errorMessage,
          },
          featuresUris: [vscode.Uri.joinPath(folder.uri, "features")], // placeholder (length-1 per D-05)
        });
      }
    }

    // === BRANCH B fallthrough: features/ convention (INTG-01 last resort) ===
    const conventionFeaturesUri = vscode.Uri.joinPath(folder.uri, "features");
    if (fs.existsSync(conventionFeaturesUri.fsPath)) {
      const existing = discoveryCache.get(uriId(folder.uri));
      discoveryCache.set(uriId(folder.uri), {
        ...existing,                  // preserves configError if set from malformed config above
        source: "convention",
        featuresUris: [conventionFeaturesUri],
      });
      return true;
    }

    // === Phase 9: Check cached subdirectory scan result ===
    const scanResult = getCachedScanResult(folder.uri);
    if (scanResult?.primary) {
      const subdirConfigResult = findBehaveConfig(scanResult.primary.dirUri);
      if (subdirConfigResult && subdirConfigResult.ok) {
        clearPathDiagnostics(subdirConfigResult.configFileUri);

        const dedupResult = dedupResolvedPaths(
          subdirConfigResult.resolvedPaths, subdirConfigResult.rawPaths, subdirConfigResult.pathLineNumbers
        );

        if (dedupResult.subsumedPaths.length > 0) {
          setSubsumptionDiagnostics(subdirConfigResult.configFileUri, dedupResult.subsumedPaths);
        }

        const validPaths: vscode.Uri[] = [];
        const invalidPaths: { rawPath: string; lineNumber: number }[] = [];
        for (let i = 0; i < dedupResult.resolvedPaths.length; i++) {
          if (fs.existsSync(dedupResult.resolvedPaths[i].fsPath)) {
            validPaths.push(dedupResult.resolvedPaths[i]);
          } else {
            invalidPaths.push({
              rawPath: dedupResult.rawPaths[i],
              lineNumber: dedupResult.pathLineNumbers[i],
            });
          }
        }

        if (invalidPaths.length > 0) {
          setPathResolutionDiagnostics(subdirConfigResult.configFileUri, invalidPaths);
        }

        if (validPaths.length > 0) {
          discoveryCache.set(uriId(folder.uri), {
            source: "config-file",
            configFileUri: subdirConfigResult.configFileUri,
            featuresUris: validPaths,
            alsoFoundConfigs: scanResult.alsoFound.map(e => e.configFileUri),
          });
          return true;
        }
      }
    }

    return false;
  }


  const folders = vscode.workspace.workspaceFolders;
  if (!folders) {
    throw "No workspace folders found";
  }

  for (const folder of folders) {
    if (hasFeaturesFolder(folder)) {
      workspaceFoldersWithFeatures.push(folder.uri);
    }
  }

  diagLog(`perf info: getUrisOfWkspFoldersWithFeatures took ${performance.now() - start} ms, ` +
    `workspaceFoldersWithFeatures: ${workspaceFoldersWithFeatures.length}`);

  if (workspaceFoldersWithFeatures.length === 0) {
    if (folders.length === 1 && folders[0].name === "gs-behave-bdd")
      throw `Please disable the marketplace Behave BDD extension before beginning development!`;
    else
      throw `Extension was activated but none of the workspace folders contain a root 'features' folder, ` +
      `a behave config file (behave.ini, .behaverc, setup.cfg, tox.ini, pyproject.toml) with a [behave] paths setting, ` +
      `or a settings.json that specifies a valid 'gs-behave-bdd.featuresPath'.\n` +
      `Please add a valid 'gs-behave-bdd.featuresPath' property to your workspace settings.json file and then restart vscode.`;
  }

  return workspaceFoldersWithFeatures;
}


export const getWorkspaceUriForFile = (fileorFolderUri: vscode.Uri | undefined): vscode.Uri | undefined => {
  // Return undefined for non-file URIs (e.g., git: scheme from diff views)
  if (fileorFolderUri?.scheme !== "file")
    return undefined;
  if (!fileorFolderUri) // handling this here for caller convenience
    return undefined;
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileorFolderUri);
  if (!workspaceFolder) {
    // Return undefined instead of throwing for files outside workspace (e.g. git worktree paths).
    // Callers already handle undefined return gracefully.
    console.warn(`[gs-behave-bdd] No workspace folder found for file ${fileorFolderUri.fsPath}, skipping workspace-specific features`);
    return undefined;
  }
  return workspaceFolder.uri;
}


export const getWorkspaceSettingsForFile = (fileorFolderUri: vscode.Uri | undefined): WorkspaceSettings | undefined => {
  const wkspUri = getWorkspaceUriForFile(fileorFolderUri);
  if (!wkspUri)
    return undefined;
  return config.workspaceSettings[wkspUri.path];
}


// D-09 — Returns the first featuresUri that contains fileUri,
// or undefined if fileUri is outside every root. The `+ '/'` guard prevents sibling-prefix
// false positives (e.g. /features matching /featuresA — see Pitfall 3); urisMatch handles
// the exact-root case where fileUri === root.
// Phase 8 per-document-root scoping handlers call it.
export function getFeaturesRootForFile(
  wkspSettings: WorkspaceSettings,
  fileUri: vscode.Uri
): vscode.Uri | undefined {
  return wkspSettings.featuresUris.find(
    root => fileUri.path.startsWith(root.path + '/') || urisMatch(root, fileUri)
  );
}


export interface SubsumedPath {
  rawPath: string;
  lineNumber: number;
  subsumedBy: string;
}

export interface DedupResult {
  resolvedPaths: vscode.Uri[];
  rawPaths: string[];
  pathLineNumbers: number[];
  subsumedPaths: SubsumedPath[];
}

// Deduplicates resolved paths by removing exact duplicates (case-insensitive via uriId)
// and paths subsumed by a broader parent (D-09). Sorted by path length ascending so parent
// paths always win over children regardless of input order.
export function dedupResolvedPaths(
  resolvedPaths: vscode.Uri[],
  rawPaths: string[],
  pathLineNumbers: number[]
): DedupResult {
  const entries = resolvedPaths.map((uri, i) => ({
    uri,
    rawPath: rawPaths[i],
    lineNumber: pathLineNumbers[i],
    id: uriId(uri),
  }));

  // Sort by URI path length ascending — broader (shorter) paths first so parent wins (D-09)
  entries.sort((a, b) => a.uri.path.length - b.uri.path.length);

  const accepted: typeof entries = [];
  const seenIds = new Set<string>();
  const subsumedPaths: SubsumedPath[] = [];

  for (const entry of entries) {
    // Exact duplicate check (case-insensitive via uriId, D-11)
    if (seenIds.has(entry.id)) {
      const winner = accepted.find(a => a.id === entry.id);
      subsumedPaths.push({
        rawPath: entry.rawPath,
        lineNumber: entry.lineNumber,
        subsumedBy: winner?.rawPath ?? entry.rawPath,
      });
      continue;
    }

    // Subsumption check: is this path contained within an already-accepted broader path?
    const parent = accepted.find(a => entry.uri.path.startsWith(a.uri.path + '/'));
    if (parent) {
      subsumedPaths.push({
        rawPath: entry.rawPath,
        lineNumber: entry.lineNumber,
        subsumedBy: parent.rawPath,
      });
      continue;
    }

    accepted.push(entry);
    seenIds.add(entry.id);
  }

  return {
    resolvedPaths: accepted.map(e => e.uri),
    rawPaths: accepted.map(e => e.rawPath),
    pathLineNumbers: accepted.map(e => e.lineNumber),
    subsumedPaths,
  };
}


export const getWorkspaceFolder = (wskpUri: vscode.Uri): vscode.WorkspaceFolder => {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(wskpUri);
  if (!workspaceFolder)
    throw new Error("No workspace folder found for uri " + wskpUri.path);
  return workspaceFolder;
}


export const getContentFromFilesystem = async (uri: vscode.Uri | undefined): Promise<string> => {
  if (!uri) // handling this here for caller convenience
    throw new Error("uri is undefined");
  const data = await vwfs.readFile(uri);
  return Buffer.from(data).toString('utf8');
};


export const isStepsFile = (uri: vscode.Uri): boolean => {
  const path = uri.path.toLowerCase();

  if (!path.includes("/steps/"))
    return false;

  return path.endsWith(".py");
}


export const isFeatureFile = (uri: vscode.Uri): boolean => {
  const path = uri.path.toLowerCase();
  return path.endsWith(".feature");
}

export const couldBePythonStepsFile = (uri: vscode.Uri): boolean => {
  const path = uri.path.toLowerCase();
  return path.endsWith('.py') && !isFeatureFile(uri);
}

export const getAllTestItems = (wkspId: string | null, collection: vscode.TestItemCollection): vscode.TestItem[] => {
  const items: vscode.TestItem[] = [];

  // get all test items if wkspUri is null, or
  // just the ones in the current workspace if wkspUri is supplied 
  collection.forEach((item: vscode.TestItem) => {
    if (wkspId === null || item.id.includes(wkspId)) {
      items.push(item);
      if (item.children)
        items.push(...getAllTestItems(wkspId, item.children));
    }
  });

  return items;
}


export const countTestItemsInCollection = (wkspId: string | null, testData: TestData, items: vscode.TestItemCollection): TestCounts => {
  const arr = getAllTestItems(wkspId, items);
  return countTestItems(testData, arr);
}


export const getScenarioTests = (testData: TestData, items: vscode.TestItem[]): vscode.TestItem[] => {
  return items.filter(item => {
    const data = testData.get(item);
    // Scenario has isOutline (boolean); ScenarioExamplesGroup and TestFile do not.
    // We use duck-typing rather than instanceof because the bundled extension
    // and integration test code may have separate class identities.
    return data !== undefined && typeof (data as Scenario).isOutline === 'boolean';
  });
}


export const countTestItems = (testData: TestData, items: vscode.TestItem[]): TestCounts => {
  const testCount = getScenarioTests(testData, items).length;
  const nodeCount = items.length;
  return { nodeCount, testCount };
}


export function cleanBehaveText(text: string) {
  return text.replaceAll("\x1b", "").replaceAll("[33m", "").replaceAll("[0m", "");
}


// Directories that never contain useful Python/feature files — skipped by findFiles
export const DEFAULT_EXCLUDE_DIRS = new Set([
  '__pycache__', '.git', 'node_modules', '.venv', '.tox',
  '.mypy_cache', '.pytest_cache', '.eggs', '*.egg-info',
  'dist', 'out', 'build', 'coverage'
]);

function isDirExcluded(dirName: string, excludeDirs: Set<string>): boolean {
  if (excludeDirs.has(dirName))
    return true;
  // Handle wildcard patterns like *.egg-info
  for (const pattern of excludeDirs) {
    if (pattern.startsWith('*') && dirName.endsWith(pattern.substring(1)))
      return true;
  }
  return false;
}

// custom function to replace vscode.workspace.findFiles() functionality when required
// due to the glob INTERMITTENTLY not returning results on vscode startup in Windows OS for multiroot workspaces
export async function findFiles(directory: vscode.Uri, matchSubDirectory: string | undefined,
  extension: string, cancelToken: vscode.CancellationToken,
  excludeDirs?: Set<string>): Promise<vscode.Uri[]> {

  const compiledRegex = matchSubDirectory ? new RegExp(`/${matchSubDirectory}/`, "i") : undefined;
  const dirs = excludeDirs ?? DEFAULT_EXCLUDE_DIRS;
  return _findFilesRecursive(directory, compiledRegex, extension, cancelToken, dirs);
}

async function _findFilesRecursive(directory: vscode.Uri, compiledRegex: RegExp | undefined,
  extension: string, cancelToken: vscode.CancellationToken,
  excludeDirs: Set<string>): Promise<vscode.Uri[]> {

  const entries = await vwfs.readDirectory(directory);
  const results: vscode.Uri[] = [];

  for (const entry of entries) {
    if (cancelToken.isCancellationRequested)
      return results;
    const fileName = entry[0];
    const fileType = entry[1];
    const entryUri = vscode.Uri.joinPath(directory, fileName);
    if (fileType === vscode.FileType.Directory) {
      if (isDirExcluded(fileName, excludeDirs))
        continue;
      results.push(...await _findFilesRecursive(entryUri, compiledRegex, extension, cancelToken, excludeDirs));
    }
    else {
      if (fileName.endsWith(extension) && (!compiledRegex || compiledRegex.test(entryUri.path))) {
        results.push(entryUri);
      }
    }
  }

  return results;
}

export function findSubdirectorySync(searchPath: string, targetDirName: string): string | null {
  if (!fs.existsSync(searchPath)) {
    return null;
  }
  const files = fs.readdirSync(searchPath);
  for (const file of files) {
    const filePath = path.join(searchPath, file);
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      if (file === targetDirName) {
        return filePath;
      } else {
        const result = findSubdirectorySync(filePath, targetDirName);
        if (result !== null) {
          return result;
        }
      }
    }
  }
  return null;
}


export function findHighestTargetParentDirectorySync(startPath: string, stopPath: string, targetDirName: string): string | null {
  let currentPath = startPath;
  let highestMatch = null;
  while (currentPath.startsWith(stopPath)) {
    if (!fs.existsSync(currentPath)) {
      currentPath = path.dirname(currentPath);
      continue;
    }
    const files = fs.readdirSync(currentPath);
    if (files.includes(targetDirName))
      highestMatch = path.join(currentPath, targetDirName);
    currentPath = path.dirname(currentPath);
  }
  return highestMatch;
}


export function showDebugWindow() {
  vscode.commands.executeCommand("workbench.debug.action.toggleRepl");
}


export function rndAlphaNumeric(size = 5) {
  return customAlphabet("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ")(size);
}


export function rndNumeric(size = 6) {
  return customAlphabet("0123456789")(size);
}


export function basename(uri: vscode.Uri) {
  const basename = uri.path.split("/").pop();
  if (!basename)
    throw "could not determine file name from uri";
  return basename;
}


export function getLines(text: string) {
  return text.split(/\r\n|\r|\n/);
}
