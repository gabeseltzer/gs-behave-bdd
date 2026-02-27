import * as vscode from 'vscode';
import { config } from "../configuration";
import { diagLog } from '../logger';
import { getBehaveEnv } from './behaveEnv';
import { WkspRun } from './testRunHandler';



export async function debugBehaveInstance(wr: WkspRun, args: string[], friendlyCmd: string): Promise<void> {

  diagLog(friendlyCmd, wr.wkspSettings.uri); // log debug friendlyCmd in diagnostics log only

  // --outfile = remove stdout noise from debug console
  args.push("--no-summary", "--outfile",
    vscode.Uri.joinPath(config.extensionTempFilesUri, `${(wr.run.name ?? "")}-${wr.wkspSettings.name}-debug.log`).fsPath);

  const env = getBehaveEnv(wr.wkspSettings);

  const debugLaunchConfig = {
    name: `behave-vsc-debug`,
    console: "internalConsole",
    type: "python",
    cwd: wr.wkspSettings.projectUri.fsPath,
    request: 'launch',
    module: "behave",
    args: args,
    env: env,
    justMyCode: wr.wkspSettings.justMyCode
  };

  const wkspFolder = vscode.workspace.getWorkspaceFolder(wr.wkspSettings.uri);

  // Register all listeners BEFORE startDebugging to avoid race condition
  // where behave exits instantly and the terminate event fires before the listener exists
  let terminateDisposable: vscode.Disposable | undefined;
  const terminatePromise = new Promise<"terminated">(resolve => {
    terminateDisposable = vscode.debug.onDidTerminateDebugSession(() => {
      resolve("terminated");
    });
  });

  let cancelDisposable: vscode.Disposable | undefined;
  const cancelPromise = new Promise<"cancelled">(resolve => {
    cancelDisposable = wr.run.token.onCancellationRequested(() => {
      resolve("cancelled");
    });
  });

  const timeoutMs = config.integrationTestRun ? 20000 : 120000;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<"timeout">(resolve => {
    timeoutHandle = setTimeout(() => resolve("timeout"), timeoutMs);
  });

  try {
    if (!await vscode.debug.startDebugging(wkspFolder, debugLaunchConfig)) {
      diagLog("unable to start debug session, was debug stop button clicked?", wr.wkspSettings.uri);
      return;
    }

    const result = await Promise.race([terminatePromise, cancelPromise, timeoutPromise]);

    if (result === "timeout") {
      diagLog(`debug session timed out after ${timeoutMs / 1000}s, stopping debugger`, wr.wkspSettings.uri);
      await vscode.debug.stopDebugging();
    }
    else if (result === "cancelled") {
      await vscode.debug.stopDebugging();
    }
  }
  finally {
    terminateDisposable?.dispose();
    cancelDisposable?.dispose();
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}
