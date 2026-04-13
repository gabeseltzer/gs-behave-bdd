import * as vscode from 'vscode';
import { config } from "../configuration";
import { diagLog } from '../logger';
import { getBundledBehavePath } from '../bundledBehave';
import { getBehaveEnv } from './behaveEnv';
import { WkspRun } from './testRunHandler';



export async function debugBehaveInstance(wr: WkspRun, args: string[], friendlyCmd: string): Promise<void> {

  diagLog(friendlyCmd, wr.wkspSettings.uri); // log debug friendlyCmd in diagnostics log only

  // --outfile = remove stdout noise from debug console
  args.push("--no-summary", "--outfile",
    vscode.Uri.joinPath(config.extensionTempFilesUri, `${(wr.run.name ?? "")}-${wr.wkspSettings.name}-debug.log`).fsPath);

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
    startDisposable.dispose();
    terminateDisposable?.dispose();
    cancelDisposable?.dispose();
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}
