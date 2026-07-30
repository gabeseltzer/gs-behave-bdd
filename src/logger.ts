import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { config } from './configuration';
import { getUrisOfWkspFoldersWithFeatures, WkspError, WkspErrorAction } from './common';


export class Logger {

  private channels: { [wkspUri: string]: vscode.OutputChannel } = {};
  public visible = false;

  // vscode gives no way to read an OutputChannel's contents back, so we keep our own copy of
  // everything we write, which "Behave BDD: Save Diagnostic Report" appends to the report file.
  //
  // The session log is UNBOUNDED, so it is streamed to disk rather than held in memory: a long
  // session (many reparses, or verbose logging left on) can run to megabytes, and an in-memory
  // array would cost that several times over once joined and embedded in the report string.
  // A WriteStream keeps memory flat (it buffers only what the disk hasn't taken yet) and the
  // report is assembled by copying file-to-file, so peak memory does not scale with log size.
  //
  // Note behave's own test output does NOT come through here - it goes straight to the TestRun
  // via run.appendOutput (see behaveRun.ts), so a test run does not inflate this log.
  private logStream: fs.WriteStream | undefined;
  private sessionLogPath: string | undefined;
  // set if opening/writing the log ever fails (read-only or full temp dir). Latched so a broken
  // disk produces one diagnostic instead of an error per logged line.
  private logStreamBroken = false;
  private static _nextLogFileSeq = 0;

  private capture(text: string, wkspUri?: vscode.Uri) {
    const stream = this.ensureLogStream();
    if (!stream)
      return;
    // inlined rather than using common.basename(), which throws on an empty path - a logging
    // call must never be the thing that raises
    const prefix = wkspUri ? `[${wkspUri.path.split("/").pop() || wkspUri.path}] ` : "";
    try {
      // write() returns false when the internal buffer is over the high-water mark, but we
      // deliberately keep writing: dropping diagnostics to save memory would defeat the point,
      // and node keeps queueing regardless. Nothing here awaits the drain, so logging stays
      // synchronous from the caller's perspective.
      stream.write(prefix + text + "\n");
    }
    catch {
      this.logStreamBroken = true;
    }
  }

  private ensureLogStream(): fs.WriteStream | undefined {
    if (this.logStream || this.logStreamBroken)
      return this.logStream;

    try {
      // deliberately NOT config.extensionTempFilesUri: cleanExtensionTempDirectory() wipes that
      // folder's contents on activation without awaiting, which could delete a log we are writing
      const dir = path.join(os.tmpdir(), "gs-behave-bdd-logs");
      fs.mkdirSync(dir, { recursive: true });
      // Housekeeping is deferred off the activation path: the first capture() happens while
      // activate() is running, and pruning does a readdir plus a stat per file. Nothing depends
      // on it having finished, so it must not sit in front of the extension starting up.
      setTimeout(() => pruneOldSessionLogs(dir, Date.now(), this.sessionLogPath), 0);

      // pid alone isn't enough to make this unique: the name is second-resolution, so two Logger
      // instances constructed in the same second would open the same file in append mode. There
      // is only one Logger in production, but tests construct several.
      const seq = Logger._nextLogFileSeq++;
      const stamp = new Date().toISOString().replace(/\.\d+Z$/, "").replace(/:/g, "-");
      const suffix = seq === 0 ? "" : `-${seq}`;
      this.sessionLogPath = path.join(dir, `session-${stamp}-${process.pid}${suffix}.log`);
      const stream = fs.createWriteStream(this.sessionLogPath, { flags: "a" });
      // an async write failure surfaces here rather than at the write() call
      stream.on("error", () => { this.logStreamBroken = true; });
      this.logStream = stream;
      return stream;
    }
    catch {
      this.logStreamBroken = true;
      this.sessionLogPath = undefined;
      return undefined;
    }
  }

  // Path of this session's log, or undefined if nothing has been logged yet or the log
  // could not be opened.
  public getSessionLogPath(): string | undefined {
    return this.logStreamBroken ? undefined : this.sessionLogPath;
  }

  // Waits for queued writes to reach disk. Callers that are about to READ the session log
  // (i.e. the diagnostic report) must await this first, or they can miss the tail.
  public flushSessionLog(): Promise<void> {
    const stream = this.logStream;
    if (!stream)
      return Promise.resolve();
    return new Promise<void>(resolve => {
      // writing an empty chunk resolves once everything already queued has been flushed
      try {
        stream.write("", () => resolve());
      }
      catch {
        resolve();
      }
    });
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
    // end() (not destroy()) so anything still queued is written before the handle closes
    try {
      this.logStream?.end();
    }
    catch {
      // nothing useful to do while tearing down
    }
    this.logStream = undefined;
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
      if (error.stack && consoleDiagnosticsEnabled())
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


// Session logs are unbounded and one is created per window, so without a sweep they would
// accumulate in the temp folder indefinitely. This prunes PREVIOUS sessions only - it never
// touches or truncates the log of the running session (that is the point of unbounded).
//
// Two limits, because age alone doesn't bound disk: someone running large suites in several
// windows can produce a lot of bytes well inside the retention window.
export const SESSION_LOG_RETENTION_DAYS = 7;
export const SESSION_LOG_TOTAL_BYTES_LIMIT = 512 * 1024 * 1024; // 512MB across OLD logs

export function pruneOldSessionLogs(dir: string, now = Date.now(), keepPath?: string) {
  const cutoff = now - SESSION_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const remove = (full: string) => {
    try {
      fs.unlinkSync(full);
      return true;
    }
    catch {
      // in use by another vscode window, or already gone - skip it
      return false;
    }
  };

  try {
    const survivors: { full: string; mtimeMs: number; size: number }[] = [];

    for (const name of fs.readdirSync(dir)) {
      if (!name.startsWith("session-") || !name.endsWith(".log"))
        continue;
      const full = path.join(dir, name);
      if (keepPath && full === keepPath)
        continue;
      try {
        const stat = fs.statSync(full);
        if (stat.mtimeMs < cutoff)
          remove(full);
        else
          survivors.push({ full, mtimeMs: stat.mtimeMs, size: stat.size });
      }
      catch {
        // vanished between readdir and stat - nothing to do
      }
    }

    // still over the size budget: drop oldest-first until under it
    let total = survivors.reduce((sum, f) => sum + f.size, 0);
    if (total <= SESSION_LOG_TOTAL_BYTES_LIMIT)
      return;
    survivors.sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const file of survivors) {
      if (total <= SESSION_LOG_TOTAL_BYTES_LIMIT)
        break;
      if (remove(file.full))
        total -= file.size;
    }
  }
  catch {
    // unreadable temp dir - housekeeping is best-effort and must never block logging
  }
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


// console diagnostics are enabled by verboseLogging; xRay is the deprecated alias, honoured
// until the user takes the xRay-to-verboselogging migration (see migrations/logging.ts)
export const consoleDiagnosticsEnabled = (): boolean => {
  try {
    return !!(config && config.globalSettings &&
      (config.globalSettings.verboseLogging || config.globalSettings.xRay));
  }
  catch {
    return false;
  }
}


export const diagLog = (message: string, wkspUri?: vscode.Uri, logType?: DiagLogType) => {
  if (config && !consoleDiagnosticsEnabled() && !config.integrationTestRun && !config.exampleProject)
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