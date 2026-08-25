import * as vscode from 'vscode';
import { config } from "../configuration";
import { diagLog } from '../logger';
import { getBundledBehavePath } from '../bundledBehave';
import { getBehaveEnv } from './behaveEnv';
import { LineTail } from './lineTail';
import { RunOutputPipeline } from './outputPipeline';
import { WkspRun } from './testRunHandler';


/**
 * Where behave's human-readable output is written on the debug path.
 *
 * A debug run's stdout IS the debug console, which belongs to the user's own
 * print() output, so behave's pretty formatter is pointed at a file instead. That
 * redirect is not new - what is new is that the file is now tailed and fed to the
 * TestRun rather than written and discarded (formatter/pretty.py flushes after
 * every write, so it can be read as it is produced).
 *
 * Derived rather than passed around: runOrDebug builds the "-o" arg and this
 * module opens the tail, and they must agree on the path. Parallel debug is
 * rejected up front, so one file per workspace run is enough.
 */
export function getDebugOutputFileUri(wr: WkspRun): vscode.Uri {
  return vscode.Uri.joinPath(config.extensionTempFilesUri,
    `${(wr.run.name ?? "")}-${wr.wkspSettings.name}-debug.log`);
}


export async function debugBehaveInstance(wr: WkspRun, args: string[], friendlyCmd: string): Promise<void> {

  diagLog(friendlyCmd, wr.wkspSettings.uri); // log debug friendlyCmd in diagnostics log only

  // --color=on is KEPT, unlike before. It used to be stripped because the debug
  // console is not filtered and behave's two-pass step drawing would have left
  // cursor-up sequences visible there - but behave's output no longer goes to the
  // console, it goes to a file that BehaveOutputFilter reads. Colour is not merely
  // cosmetic here either: without it behave sees no tty, runs monochrome, and its
  // pretty formatter reports no step status at all (formatter/pretty.py:157-175).
  //
  // --no-summary STAYS. The summary is written by the summary reporter, which
  // targets sys.stdout directly (reporter/summary.py:217,222) rather than the
  // formatter's stream - so unlike everything else, it cannot be captured into the
  // file without also landing on the debug console. This is the one output
  // difference from a normal run that does not have a fix at this layer.
  args.push("--no-summary");

  const env = getBehaveEnv(wr.wkspSettings);
  const bundledPath = getBundledBehavePath();

  const debugLaunchConfig = {
    name: `gs-behave-bdd-debug`,
    console: "internalConsole",
    type: "python",
    cwd: wr.wkspSettings.projectUri.fsPath,
    request: 'launch',
    module: "behave",
    args: args,
    env: env,
    justMyCode: wr.wkspSettings.justMyCode,
    rules: [
      { path: bundledPath, include: false },
      { module: "behave", include: false }
    ]
  };

  const wkspFolder = vscode.workspace.getWorkspaceFolder(wr.wkspSettings.uri);
  if (!wkspFolder) {
    diagLog("cannot start debug session: workspace folder not found for URI", wr.wkspSettings.uri);
    return;
  }

  // Capture our debug session when it starts so we can filter terminate events by session id
  let debugSession: vscode.DebugSession | undefined;
  const startDisposable = vscode.debug.onDidStartDebugSession(session => {
    if (session.name === debugLaunchConfig.name) {
      debugSession = session;
    }
  });

  // Register terminate listener BEFORE startDebugging to avoid race condition
  // where behave exits instantly and the terminate event fires before the listener exists.
  // Filter by session id so other debug sessions terminating won't affect us.
  let terminateDisposable: vscode.Disposable | undefined;
  const terminatePromise = new Promise<"terminated">(resolve => {
    terminateDisposable = vscode.debug.onDidTerminateDebugSession(session => {
      if (debugSession && session.id === debugSession.id) {
        resolve("terminated");
      }
    });
  });

  let cancelDisposable: vscode.Disposable | undefined;
  const cancelPromise = new Promise<"cancelled">(resolve => {
    cancelDisposable = wr.run.token.onCancellationRequested(() => {
      resolve("cancelled");
    });
  });

  // Timeout only for extension integration tests to prevent hangs;
  // real users can debug as long as they need (breakpoints, stepping, etc.)
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const promises: Promise<"terminated" | "cancelled" | "timeout">[] = [terminatePromise, cancelPromise];
  if (config.integrationTestRun) {
    const timeoutPromise = new Promise<"timeout">(resolve => {
      timeoutHandle = setTimeout(() => resolve("timeout"), 20000);
    });
    promises.push(timeoutPromise);
  }

  // Feed behave's output to the TestRun through the SAME pipeline a normal run
  // uses, so a debug run's output is filtered, attributed and coloured identically.
  const pipeline = new RunOutputPipeline(wr.run, wr.outputIndex, wr.wkspSettings.projectUri);
  const outputUri = getDebugOutputFileUri(wr);
  // behave truncates this on open, but the tail reads from offset 0 - so a leftover
  // file from an earlier run with the same name would be read as this run's output.
  try {
    await vscode.workspace.fs.delete(outputUri);
  }
  catch {
    // not there, which is the normal case
  }
  const outputTail = new LineTail(outputUri.fsPath,
    lines => pipeline.write("debug", lines.join("\n") + "\n"));
  outputTail.start();

  pipeline.writeDirect(`\n${friendlyCmd}\n`);

  try {
    if (!await vscode.debug.startDebugging(wkspFolder, debugLaunchConfig)) {
      diagLog("unable to start debug session, was debug stop button clicked?", wr.wkspSettings.uri);
      return;
    }

    const result = await Promise.race(promises);

    if (result === "timeout") {
      diagLog("debug session timed out after 20s, stopping debugger", wr.wkspSettings.uri);
      await vscode.debug.stopDebugging();
    }
    else if (result === "cancelled") {
      await vscode.debug.stopDebugging();
    }
  }
  finally {
    // A debug run ends on a terminate event, not a process close, so the drain
    // belongs here: stop() does a final read before releasing the fd, and flushAll
    // releases whatever the filter is still holding.
    outputTail.stop();
    pipeline.flushAll();
    startDisposable.dispose();
    terminateDisposable?.dispose();
    cancelDisposable?.dispose();
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}
