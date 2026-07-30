import * as vscode from 'vscode';
import { config } from './configuration';
import { getUrisOfWkspFoldersWithFeatures, WkspError, WkspErrorAction } from './common';


export class Logger {

  private channels: { [wkspUri: string]: vscode.OutputChannel } = {};
  public visible = false;

  // vscode gives no way to read an OutputChannel's contents back, so keep our own copy of
  // everything we write. The diagnostic report file embeds this, making that one file
  // sufficient for a bug report - the user never has to select-all the output pane.
  // Bounded so a long behave run (or a noisy verbose session) can't grow without limit.
  public static readonly MAX_TRANSCRIPT_LINES = 5000;
  private transcript: string[] = [];

  private capture(text: string, wkspUri?: vscode.Uri) {
    // inlined rather than using common.basename(), which throws on an empty path - a logging
    // call must never be the thing that raises
    const prefix = wkspUri ? `[${wkspUri.path.split("/").pop() || wkspUri.path}] ` : "";
    this.transcript.push(prefix + text);
    if (this.transcript.length > Logger.MAX_TRANSCRIPT_LINES)
      this.transcript.splice(0, this.transcript.length - Logger.MAX_TRANSCRIPT_LINES);
  }

  // Returns the captured log, plus a note if the head was dropped so a reader of the
  // diagnostic report is never misled into thinking they have the whole session.
  public getTranscript(): { text: string; truncated: boolean } {
    return {
      text: this.transcript.join("\n"),
      truncated: this.transcript.length >= Logger.MAX_TRANSCRIPT_LINES,
    };
  }

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
    this.capture(text);

    for (const wkspPath in this.channels) {
      this.channels[wkspPath].appendLine(text);
    }

    if (run)
      run.appendOutput(text + "\r\n");
  };


  logInfo = (text: string, wkspUri: vscode.Uri, run?: vscode.TestRun) => {
    diagLog(text);
    this.capture(text, wkspUri);

    this.ensureChannel(wkspUri).appendLine(text);
    if (run)
      run.appendOutput(text + "\r\n");
  };

  // log info without a line feed (used for logging behave output)
  logInfoNoLF = (text: string, wkspUri: vscode.Uri, run?: vscode.TestRun) => {
    diagLog(text);
    this.capture(text, wkspUri);

    this.ensureChannel(wkspUri).append(text);
    if (run)
      run.appendOutput(text);
  };

  // Verbose diagnostic logging, gated on the `verboseLogging` setting.
  //
  // Unlike diagLog()/xRay (which only reaches the DevTools console), this writes to the
  // "Behave BDD" OUTPUT CHANNEL and the captured transcript, so it lands in the file written
  // by "Behave BDD: Save Diagnostic Report". That is the whole point of this method: use it at
  // every point where the extension gives up silently, so the log explains WHY a feature
  // (e.g. ctrl+click go-to-definition) did nothing.
  logVerbose = (text: string, wkspUri?: vscode.Uri) => {
    if (!verboseLoggingEnabled())
      return;

    const msg = `[verbose] ${text}`;
    diagLog(msg);
    this.capture(msg, wkspUri);

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
    this.capture(`WARNING: ${text}`, wkspUri);

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
    this.capture(`${DiagLogType[logType].toUpperCase()}: ${text}`, wkspUri);

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