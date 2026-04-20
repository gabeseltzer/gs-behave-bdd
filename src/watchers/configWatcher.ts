import * as vscode from 'vscode';
import { config } from '../configuration';
import { diagLog } from '../logger';
import { FileParser } from '../parsers/fileParser';
import { TestData } from '../parsers/testFile';
import { getUrisOfWkspFoldersWithFeatures, uriId, getDiscoveryEntry } from '../common';
import { clearScanResultCache } from '../discovery/configScanner';


const CONFIG_GLOB = '{behave.ini,.behaverc,setup.cfg,tox.ini,pyproject.toml}';
const DEBOUNCE_MS = 500;
const configDebounceTimers = new Map<string, NodeJS.Timeout>();


export function clearConfigDebounceTimers(): void {
  for (const timer of configDebounceTimers.values()) {
    clearTimeout(timer);
  }
  configDebounceTimers.clear();
}


export function startWatchingConfigFiles(
  wkspUri: vscode.Uri,
  ctrl: vscode.TestController,
  testData: TestData,
  parser: FileParser,
  onConfigChanged: (wkspUris: vscode.Uri[], clearNotifiedErrors: boolean) => void
): vscode.FileSystemWatcher[] {

  const watchers: vscode.FileSystemWatcher[] = [];

  const handler = (eventUri: vscode.Uri, eventType: string) => {
    if (eventUri.scheme !== 'file') return;
    diagLog(`configWatcher: ${eventType} detected for ${eventUri.fsPath}`);

    const key = uriId(wkspUri);
    const existing = configDebounceTimers.get(key);
    if (existing) {
      clearTimeout(existing);
      diagLog(`configWatcher: debounce timer reset for ${key}`);
    }

    const timer = setTimeout(async () => {
      configDebounceTimers.delete(key);
      try {
        const filename = eventUri.path.split('/').pop() ?? 'config file';
        config.logger.logInfo(
          `Config file changed: ${filename} — re-discovering features...`,
          wkspUri
        );
        // Phase 9: Clear scan cache so force-refresh triggers a full re-evaluation
        clearScanResultCache();
        // Direct cache invalidation — do NOT call configurationChangedHandler (PITFALL-04):
        // configurationChangedHandler has an integrationTestRun early-exit guard that would
        // silently skip re-discovery during integration tests.
        getUrisOfWkspFoldersWithFeatures(true);
        config.reloadSettings(wkspUri);
        onConfigChanged([wkspUri], true);  // clearNotifiedErrors=true per WATCH-06
        parser.parseFilesForWorkspace(wkspUri, testData, ctrl, 'configWatcher', false);
      } catch (e: unknown) {
        config.logger.showError(e, wkspUri);
      }
    }, DEBOUNCE_MS);

    configDebounceTimers.set(key, timer);
  };

  // Tier 1: Narrow watcher at discovered config file's parent directory (fast, specific)
  const entry = getDiscoveryEntry(wkspUri);
  if (entry?.configFileUri) {
    const configDir = vscode.Uri.joinPath(entry.configFileUri, '..');
    const narrowPattern = new vscode.RelativePattern(configDir, CONFIG_GLOB);
    const narrowWatcher = vscode.workspace.createFileSystemWatcher(narrowPattern);
    narrowWatcher.onDidCreate(uri => handler(uri, 'create'));
    narrowWatcher.onDidChange(uri => handler(uri, 'change'));
    narrowWatcher.onDidDelete(uri => handler(uri, 'delete'));
    watchers.push(narrowWatcher);
    diagLog(`configWatcher: Tier 1 narrow watcher at ${configDir.fsPath}`, wkspUri);
  }

  // Tier 2: Recursive watcher for new config appearances anywhere in workspace
  const recursivePattern = new vscode.RelativePattern(wkspUri, `**/${CONFIG_GLOB}`);
  const recursiveWatcher = vscode.workspace.createFileSystemWatcher(recursivePattern);
  recursiveWatcher.onDidCreate(uri => handler(uri, 'create'));
  recursiveWatcher.onDidChange(uri => handler(uri, 'change'));
  recursiveWatcher.onDidDelete(uri => handler(uri, 'delete'));
  watchers.push(recursiveWatcher);
  diagLog(`configWatcher: Tier 2 recursive watcher at ${wkspUri.fsPath}/**/${CONFIG_GLOB}`, wkspUri);

  return watchers;
}
