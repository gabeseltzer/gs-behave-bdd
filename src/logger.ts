import * as vscode from 'vscode';
import { config } from './configuration';
import { getUrisOfWkspFoldersWithFeatures, WkspError, WkspErrorAction } from './common';


export class Logger {

  private channels: { [wkspUri: string]: vscode.OutputChannel } = {};
  public visible = false;

  syncChannelsToWorkspaceFolders() {

    const wkspUris = getUrisOfWkspFoldersWithFeatures(true);

    for (const wkspPath in this.channels) {
      this.channels[wkspPath].dispose();
      delete this.channels[wkspPath];
    }

    const wkspPaths = wkspUris.map(u => u.path);
    if (wkspPaths.length === 0) {
      // Phase 9: No folders discovered yet (BFS scan may add them later)
      return;
    }
    if (wkspPaths.length === 1) {
      this.channels[wkspUris[0].path] = vscode.window.createOutputChannel("Behave BDD");
      return;
    }

    wkspPaths.forEach(wkspPath => {
      const name = wkspPath.split("/").pop();
      if (!name)
        throw new Error("can't get workspace name from uri path");
      this.channels[wkspPath] = vscode.window.createOutputChannel(`Behave BDD: ${name}`);
    });
  }

  dispose() {
    for (const wkspPath in this.channels) {
      this.channels[wkspPath].dispose();
    }
  }

  show = (wkspUri: vscode.Uri) => {
    this.ensureChannel(wkspUri).show();
  };

  clear = (wkspUri: vscode.Uri) => {
    this.ensureChannel(wkspUri).clear();
  };

  clearAllWksps = () => {
    for (const wkspPath in this.channels) {
      this.channels[wkspPath].clear();
    }
  };


  // Phase 9: Lazily create a channel for a workspace that was discovered after
  // syncChannelsToWorkspaceFolders (e.g., by the BFS subdirectory scanner).
  private ensureChannel(wkspUri: vscode.Uri): vscode.OutputChannel {
    if (!this.channels[wkspUri.path]) {
      this.channels[wkspUri.path] = vscode.window.createOutputChannel("Behave BDD");
    }
    return this.channels[wkspUri.path];
  }

  logInfoAllWksps = (text: string, run?: vscode.TestRun) => {
    diagLog(text);

    for (const wkspPath in this.channels) {
      this.channels[wkspPath].appendLine(text);
    }

    if (run)
      run.appendOutput(text + "\r\n");
  };


  logInfo = (text: string, wkspUri: vscode.Uri, run?: vscode.TestRun) => {
    diagLog(text);

    this.ensureChannel(wkspUri).appendLine(text);
    if (run)
      run.appendOutput(text + "\r\n");
  };

  // log info without a line feed (used for logging behave output)
  logInfoNoLF = (text: string, wkspUri: vscode.Uri, run?: vscode.TestRun) => {
    diagLog(text);

    this.ensureChannel(wkspUri).append(text);
    if (run)
      run.appendOutput(text);
  };

  // Verbose diagnostic logging, gated on the `verboseLogging` setting.
  //
  // Unlike diagLog()/xRay (which only reaches the DevTools console), this writes to the
  // "Behave BDD" OUTPUT CHANNEL, so a user can select-all + copy the text straight out of
  // the output pane and send it to a maintainer. That is the whole point of this method:
  // use it at every point where the extension gives up silently, so the log explains WHY
  // a feature (e.g. ctrl+click go-to-definition) did nothing.
  logVerbose = (text: string, wkspUri?: vscode.Uri) => {
    if (!verboseLoggingEnabled())
      return;

    const msg = `[verbose] ${text}`;
    diagLog(msg);

    if (wkspUri) {
      this.ensureChannel(wkspUri).appendLine(msg);
      return;
    }
    for (const wkspPath in this.channels) {
      this.channels[wkspPath].appendLine(msg);
    }
  };

  // used by settings.ts
  logSettingsWarning = (text: string, wkspUri: vscode.Uri, run?: vscode.TestRun) => {
    diagLog(text, wkspUri, DiagLogType.warn);

    this.ensureChannel(wkspUri).appendLine(text);
    this.ensureChannel(wkspUri).show(true);

    if (run)
      run.appendOutput(text + "\r\n");
  };


  showWarn = (text: string, wkspUri: vscode.Uri, run?: vscode.TestRun) => {
    this._show(text, wkspUri, run, DiagLogType.warn);
  }


  showError = (error: unknown, wkspUri?: vscode.Uri | undefined, run?: vscode.TestRun) => {

    let text: string;

    if (error instanceof Error) {
      text = error.message;
      if (error.stack && config && config.globalSettings && config.globalSettings.xRay)
        text += `\n${error.stack.split("\n").slice(1).join("\n")}`;
    }
    else {
      text = `${error}`;
    }

    // If the source error is a WkspError carrying actions, render them as toast buttons
    // instead of the default "OK". Sentinel command "__showOutput" routes to logger.show().
    const actions = error instanceof WkspError ? error.actions : undefined;
    this._show(text, wkspUri, run, DiagLogType.error, actions);
  }


  private _show = (text: string, wkspUri: vscode.Uri | undefined, run: vscode.TestRun | undefined, logType: DiagLogType,
                   actions?: WkspErrorAction[]) => {

    diagLog(text, wkspUri, logType);

    if (wkspUri) {
      this.ensureChannel(wkspUri).appendLine(text);
    }
    else {
      for (const wkspPath in this.channels) {
        this.channels[wkspPath].appendLine(text);
      }
    }

    if (config.exampleProject && !text.includes("Canceled") && !text.includes("Cancelled")) {
      debugger; // eslint-disable-line no-debugger
    }


    let winText = text;
    if (wkspUri) {
      // note - don't use config.workspaceSettings here (possible inifinite loop)
      const wskpFolder = vscode.workspace.getWorkspaceFolder(wkspUri);
      if (wskpFolder) {
        const wkspName = wskpFolder?.name;
        winText = `${wkspName} workspace: ${text}`;
      }
    }

    if (winText.length > 512)
      winText = text.substring(0, 512) + "...";

    switch (logType) {
      case DiagLogType.info:
        vscode.window.showInformationMessage(winText);
        break;
      case DiagLogType.warn:
        vscode.window.showWarningMessage(winText, "OK");
        break;
      case DiagLogType.error:
        if (actions && actions.length > 0) {
          const labels = actions.map(a => a.label);
          // capture wkspUri locally so the .then() closure routes [Show Details] correctly
          const targetUri = wkspUri;
          void Promise.resolve(vscode.window.showErrorMessage(winText, ...labels)).then(picked => {
            if (!picked) return;
            const action = actions.find(a => a.label === picked);
            if (!action) return;
            if (action.command === "__showOutput") {
              if (targetUri) this.show(targetUri);
              return;
            }
            void vscode.commands.executeCommand(action.command, ...(action.args ?? []));
          });
        } else {
          vscode.window.showErrorMessage(winText, "OK");
        }
        break;
    }

    //vscode.debug.activeDebugConsole.appendLine(text);
    if (run)
      run.appendOutput(text.replace("\n", "\r\n") + "\r\n");
  }
}

export enum DiagLogType {
  "info", "warn", "error"
}

// Reading config.globalSettings constructs WindowSettings on first access, which throws if
// the user's settings are broken - so never let a logging call be the thing that surfaces
// that. Absent/unreadable settings simply mean "verbose off".
export const verboseLoggingEnabled = (): boolean => {
  try {
    return !!(config && config.globalSettings && config.globalSettings.verboseLogging);
  }
  catch {
    return false;
  }
}


export const diagLog = (message: string, wkspUri?: vscode.Uri, logType?: DiagLogType) => {
  if (config && !config.globalSettings.xRay && !config.integrationTestRun && !config.exampleProject)
    return;

  if (wkspUri)
    message = `${wkspUri}: ${message}`;

  message = `[Behave BDD] ${message}`;

  switch (logType) {
    case DiagLogType.error:
      console.error(message);
      break;
    case DiagLogType.warn:
      console.warn(message);
      break;
    default:
      console.log(message);
      break;
  }
}