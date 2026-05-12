import * as vscode from 'vscode';
import { uriId, urisMatch, hasExplicitSetting } from '../common';
import { ScanResultEntry, ScanResult } from './configScanner';
import { diagLog } from '../logger';


export interface ProjectEntry {
  configFileUri: vscode.Uri;
  dirUri: vscode.Uri;
  depth: number;
  configPriority: number;
  label: string;  // workspace-relative dir path, e.g. "backend" or "apps/api"
}


// --- Module state ---

const projectListCache = new Map<string, ProjectEntry[]>();
const activeProjectCache = new Map<string, ProjectEntry | undefined>();
let workspaceStateRef: vscode.Memento | undefined;

const PERSISTENCE_KEY_PREFIX = "gs-behave-bdd.activeProject.";


// --- Initialization ---

export function initProjectListPersistence(workspaceState: vscode.Memento): void {
  workspaceStateRef = workspaceState;
}


// --- Project list CRUD ---

export function rebuildProjectList(
  wkspUri: vscode.Uri,
  scanResult: ScanResult,
  rootConfigEntry?: ScanResultEntry
): ProjectEntry[] {

  const entries: ScanResultEntry[] = [];

  // Insert root-level config at position 0 if provided
  if (rootConfigEntry) {
    entries.push(rootConfigEntry);
  }

  // Add primary and alsoFound from scan result (scanner order: depth ASC, configPriority ASC)
  if (scanResult.primary) {
    // Avoid duplicate if root entry matches primary
    if (!rootConfigEntry || !urisMatch(rootConfigEntry.configFileUri, scanResult.primary.configFileUri)) {
      entries.push(scanResult.primary);
    }
  }
  for (const entry of scanResult.alsoFound) {
    if (!rootConfigEntry || !urisMatch(rootConfigEntry.configFileUri, entry.configFileUri)) {
      entries.push(entry);
    }
  }

  const projects = entries.map(toProjectEntry);
  projectListCache.set(uriId(wkspUri), projects);

  diagLog(`rebuildProjectList: ${projects.length} project(s) for workspace`, wkspUri);

  // Restore persisted selection or auto-select
  restoreOrAutoSelectActive(wkspUri);

  return projects;
}


export function getProjectList(wkspUri: vscode.Uri): ProjectEntry[] {
  return projectListCache.get(uriId(wkspUri)) ?? [];
}


export function getActiveProject(wkspUri: vscode.Uri): ProjectEntry | undefined {
  return activeProjectCache.get(uriId(wkspUri));
}


export function setActiveProject(wkspUri: vscode.Uri, entry: ProjectEntry): void {
  const list = getProjectList(wkspUri);
  const found = list.find(p => urisMatch(p.configFileUri, entry.configFileUri));
  if (!found) {
    throw new Error(`setActiveProject: entry not in project list: ${entry.configFileUri.toString()}`);
  }

  activeProjectCache.set(uriId(wkspUri), found);
  persistActive(wkspUri, found);
  diagLog(`setActiveProject: active → ${found.label}`, wkspUri);
}


/**
 * Phase 19 / CLEANUP-02: drop all cached active-project entries so the next
 * discovery cycle recomputes them fresh. Called from configurationChangedHandler
 * when a scan-shaping setting changes (D-09, D-10).
 *
 * Replaces the v1.4.0 read-time discoveryDepth re-read in src/common.ts.
 */
export function clearActiveProjectCache(): void {
  activeProjectCache.clear();
}


/**
 * Phase 22 / 022-02 UAT regression fix: re-populate the in-memory
 * activeProjectCache for `wkspUri` from the persisted Memento. Used after
 * `clearActiveProjectCache()` in `configurationChangedHandler` so a user's
 * `setActiveProject` choice survives a `forceFullRefresh`. Requires a
 * pre-existing projectListCache entry (i.e. discovery must already have
 * run once for this workspace).
 *
 * Returns the recovered ProjectEntry, or undefined if no list is cached
 * or the persisted selection no longer matches a known project.
 */
export function recoverActiveProjectFromPersistence(wkspUri: vscode.Uri): ProjectEntry | undefined {
  return restoreOrAutoSelectActive(wkspUri);
}


export function removeProjectByConfigUri(
  wkspUri: vscode.Uri,
  configUri: vscode.Uri
): { removed: boolean; newActive?: ProjectEntry } {

  const key = uriId(wkspUri);
  const list = projectListCache.get(key);
  if (!list) return { removed: false };

  const idx = list.findIndex(p => urisMatch(p.configFileUri, configUri));
  if (idx === -1) return { removed: false };

  const wasActive = activeProjectCache.get(key);
  const removedWasActive = wasActive && urisMatch(wasActive.configFileUri, configUri);

  list.splice(idx, 1);
  projectListCache.set(key, list);

  if (removedWasActive) {
    if (list.length > 0) {
      // D-01: auto-select next in scanner order
      const newActive = list[0];
      activeProjectCache.set(key, newActive);
      persistActive(wkspUri, newActive);
      diagLog(`removeProjectByConfigUri: active project deleted, switched to ${newActive.label}`, wkspUri);
      return { removed: true, newActive };
    } else {
      // D-02: last project deleted
      activeProjectCache.set(key, undefined);
      persistActive(wkspUri, undefined);
      diagLog(`removeProjectByConfigUri: last project deleted, active cleared`, wkspUri);
      return { removed: true };
    }
  }

  return { removed: true };
}


export function addProjectFromScanEntry(wkspUri: vscode.Uri, entry: ScanResultEntry): ProjectEntry {
  const key = uriId(wkspUri);
  const list = projectListCache.get(key) ?? [];

  const project = toProjectEntry(entry);

  // Insert in scanner order: depth ASC, then configPriority ASC
  let insertIdx = list.length;
  for (let i = 0; i < list.length; i++) {
    if (entry.depth < list[i].depth ||
      (entry.depth === list[i].depth && entry.configPriority < list[i].configPriority)) {
      insertIdx = i;
      break;
    }
  }
  list.splice(insertIdx, 0, project);
  projectListCache.set(key, list);

  // D-07: Active project does NOT change when a new config is created
  diagLog(`addProjectFromScanEntry: added ${project.label} at position ${insertIdx}`, wkspUri);
  return project;
}


export function clearProjectList(wkspUri: vscode.Uri): void {
  const key = uriId(wkspUri);
  projectListCache.delete(key);
  activeProjectCache.delete(key);
}


export function isManualProjectPathMode(wkspUri: vscode.Uri): boolean {
  const wkspConfig = vscode.workspace.getConfiguration("gs-behave-bdd", wkspUri);
  return hasExplicitSetting(wkspConfig, "projectPath");
}


// --- Internal helpers ---

function toProjectEntry(entry: ScanResultEntry): ProjectEntry {
  return {
    configFileUri: entry.configFileUri,
    dirUri: entry.dirUri,
    depth: entry.depth,
    configPriority: entry.configPriority,
    label: vscode.workspace.asRelativePath(entry.dirUri, false),
  };
}


function restoreOrAutoSelectActive(wkspUri: vscode.Uri): ProjectEntry | undefined {
  const key = uriId(wkspUri);
  const list = projectListCache.get(key);
  if (!list || list.length === 0) {
    activeProjectCache.set(key, undefined);
    return undefined;
  }

  // Try to restore persisted selection
  if (workspaceStateRef) {
    const persistenceKey = PERSISTENCE_KEY_PREFIX + key;
    const persisted = workspaceStateRef.get<{ configFilePath: string }>(persistenceKey);
    if (persisted?.configFilePath) {
      const match = list.find(p => p.configFileUri.toString() === persisted.configFilePath);
      if (match) {
        activeProjectCache.set(key, match);
        diagLog(`restoreOrAutoSelectActive: restored persisted selection → ${match.label}`, wkspUri);
        return match;
      }
    }
  }

  // D-06: Auto-select first entry (shallowest depth, highest config priority)
  const autoSelected = list[0];
  activeProjectCache.set(key, autoSelected);
  persistActive(wkspUri, autoSelected);
  diagLog(`restoreOrAutoSelectActive: auto-selected → ${autoSelected.label}`, wkspUri);
  return autoSelected;
}


function persistActive(wkspUri: vscode.Uri, entry: ProjectEntry | undefined): void {
  if (!workspaceStateRef) return;
  const persistenceKey = PERSISTENCE_KEY_PREFIX + uriId(wkspUri);
  const value = entry ? { configFilePath: entry.configFileUri.toString() } : undefined;
  workspaceStateRef.update(persistenceKey, value);
}
