import * as vscode from 'vscode';
import { basename, isFeatureFile, isStepsFile } from '../common';
import { config } from "../configuration";
import { diagLog, DiagLogType } from '../logger';
import { FileParser } from '../parsers/fileParser';
import { TestData } from '../parsers/testFile';


export function startWatchingWorkspace(wkspUri: vscode.Uri, ctrl: vscode.TestController, testData: TestData,
  parser: FileParser): vscode.FileSystemWatcher[] {

  // NOTE - not just .feature and .py files, but also watch FOLDER changes inside the features folder
  const wkspSettings = config.workspaceSettings[wkspUri.path];
  const watchers: vscode.FileSystemWatcher[] = [];

  // Guard: if WorkspaceSettings construction threw a FATAL error, the configuration getter has already
  // surfaced exactly one user-facing notification and left _resourceSettings[wkspUri.path] unpopulated.
  // Silently skip here — calling showError would produce a duplicate cascading notification.
  if (!wkspSettings) {
    diagLog(`startWatchingWorkspace: skipping ${wkspUri.path} — workspace settings unavailable (fatal config error already reported)`,
      wkspUri, DiagLogType.warn);
    return watchers;
  }

  // One watcher per features root (INT-02)
  for (let i = 0; i < wkspSettings.featuresUris.length; i++) {
    const relPath = wkspSettings.workspaceRelativeFeaturesPaths[i];
    const pattern = new vscode.RelativePattern(wkspSettings.uri, `${relPath}/**`);
    watchers.push(vscode.workspace.createFileSystemWatcher(pattern));

    // If steps are outside this features root, add a sibling-steps watcher
    const stepsUri = wkspSettings.stepsSearchUris[i];
    const featUri = wkspSettings.featuresUris[i];
    if (!stepsUri.path.startsWith(featUri.path)) {
      const stepsPattern = new vscode.RelativePattern(wkspSettings.uri, `steps/**`);
      watchers.push(vscode.workspace.createFileSystemWatcher(stepsPattern));
    }
  }


  const updater = async (uri: vscode.Uri) => {
    if (uri.scheme !== "file")
      return;

    try {
      console.log(`updater: ${uri.fsPath}`);
      parser.reparseFile(uri, undefined, wkspSettings, testData, ctrl);
    }
    catch (e: unknown) {
      // entry point function (handler) - show error
      config.logger.showError(e, wkspUri);
    }
  }

  const setEventHandlers = (watcher: vscode.FileSystemWatcher) => {

    // fires on either new file/folder creation OR rename (inc. git actions)
    watcher.onDidCreate(uri => updater(uri));

    // fires on file save (inc. git actions)
    watcher.onDidChange(uri => updater(uri));

    // fires on either file/folder delete OR rename (inc. git actions)
    watcher.onDidDelete(uri => {
      if (uri.scheme !== "file")
        return;

      try {
        const path = uri.path.toLowerCase();

        // we want folders in our pattern to be watched as e.g. renaming a folder does not raise events for child 
        // files, but we cannot determine if this is a file or folder deletion as:
        //   (a) it has been deleted so we can't stat it, and 
        //   (b) "." is valid in folder names so we can't determine by looking at the path
        // but we can ignore specific file extensions or paths we know we don't care about
        if (path.endsWith(".tmp")) // .tmp = vscode file history file
          return;

        // log for extension developers in case we need to add another file type above
        if (basename(uri).includes(".") && !isFeatureFile(uri) && !isStepsFile(uri)) {
          diagLog(`detected deletion of unanticipated file type, uri: ${uri}`, wkspUri, DiagLogType.warn);
        }

        parser.parseFilesForWorkspace(wkspUri, testData, ctrl, "OnDidDelete", false);
      }
      catch (e: unknown) {
        // entry point function (handler) - show error
        config.logger.showError(e, wkspUri);
      }
    });

  }


  for (const w of watchers) {
    setEventHandlers(w);
  }


  return watchers;
}
