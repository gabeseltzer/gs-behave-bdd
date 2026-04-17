import * as vscode from 'vscode';
import { config } from '../configuration';
import { diagLog } from '../logger';
import { FileParser } from '../parsers/fileParser';
import { TestData } from '../parsers/testFile';
import { getUrisOfWkspFoldersWithFeatures, uriId } from '../common';


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

  // Use brace-expansion glob — bare filenames silently fail (VS Code bug #164925, PITFALL-02)
  const pattern = new vscode.RelativePattern(wkspUri, CONFIG_GLOB);
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);

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

  // Register all three event types (WATCH-02, PITFALL-10)
  watcher.onDidCreate(uri => handler(uri, 'create'));
  watcher.onDidChange(uri => handler(uri, 'change'));
  watcher.onDidDelete(uri => handler(uri, 'delete'));

  return [watcher];
}
