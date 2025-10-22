import * as vscode from 'vscode';
import { config } from "../configuration";
import { diagLog } from '../logger';
import { WkspRun } from './testRunHandler';



export async function debugBehaveInstance(wr: WkspRun, args: string[], friendlyCmd: string): Promise<void> {

  const runCancelHandler = wr.run.token.onCancellationRequested(async () => await vscode.debug.stopDebugging());

  try {
    diagLog(friendlyCmd, wr.wkspSettings.uri); // log debug friendlyCmd in diagnostics log only

    const wkspFolder = vscode.workspace.getWorkspaceFolder(wr.wkspSettings.uri);

    // Check if user has specified a launch configuration name
    let debugLaunchConfig;
    if (wr.wkspSettings.debugLaunchConfig) {
      // Use the user-specified launch configuration from launch.json
      debugLaunchConfig = wr.wkspSettings.debugLaunchConfig;
      diagLog(`Using launch configuration: ${debugLaunchConfig}`, wr.wkspSettings.uri);
    } else {
      diagLog("Using default debug configuration", wr.wkspSettings.uri);

      // --outfile = remove stdout noise from debug console
      args.push("--no-summary", "--outfile",
        vscode.Uri.joinPath(config.extensionTempFilesUri, `${(wr.run.name ?? "")}-${wr.wkspSettings.name}-debug.log`).fsPath);

      const env = { ...process.env, ...wr.wkspSettings.envVarOverrides };

      debugLaunchConfig = {
        name: `behave-vsc-debug`,
        console: "internalConsole",
        type: "python",
        cwd: wr.wkspSettings.uri.fsPath,
        request: "launch",
        module: "behave",
        args: args,
        env: env,
        justMyCode: wr.wkspSettings.justMyCode
      };
    }

    if (!await vscode.debug.startDebugging(wkspFolder, debugLaunchConfig)) {
      diagLog("unable to start debug session, was debug stop button clicked?", wr.wkspSettings.uri);
      return;
    }

    await new Promise(r => vscode.debug.onDidTerminateDebugSession(async () => r("")));

  }
  finally {
    runCancelHandler.dispose();
  }
}
