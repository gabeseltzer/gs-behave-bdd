import * as vscode from 'vscode';
import { ChildProcess, spawn, SpawnOptions } from 'child_process';
import { diagLog } from '../logger';
import { getBehaveEnv } from './behaveEnv';
import { RunOutputPipeline } from './outputPipeline';
import { WkspRun } from './testRunHandler';



/**
 * @param outputPrefix prepended to every output line. Set when more than one
 * behave process writes to the same TestRun, so lines stay attributable.
 * @param outputTest associates this process's output with a test item, so the
 * Test Explorer can show output for that item alone.
 */
export async function runBehaveInstance(wr: WkspRun, args: string[], friendlyCmd: string,
  outputPrefix = "", outputTest?: vscode.TestItem): Promise<void> {

  let cp: ChildProcess;
  const cancellationHandler = wr.run.token.onCancellationRequested(() => cp?.kill());
  const wkspUri = wr.wkspSettings.uri;

  try {
    const local_args = [...args];
    local_args.unshift("-m", "behave");
    diagLog(`${wr.pythonExec} ${local_args.join(" ")}`, wkspUri);
    const env = getBehaveEnv(wr.wkspSettings);
    // Use projectUri as the working directory (this is where behave.ini etc. should be)
    const projectUri = wr.wkspSettings.projectUri;
    const options: SpawnOptions = { cwd: projectUri.fsPath, env: env };
    cp = spawn(wr.pythonExec, local_args, options);

    if (!cp.pid) {
      const effectiveEnvVars = wr.wkspSettings.getEffectiveEnvVars();
      throw `unable to launch python or behave, command: ${wr.pythonExec} ${local_args.join(" ")}\n` +
      `working directory:${projectUri.fsPath}\nenv vars: ${JSON.stringify(effectiveEnvVars)}`;
    }

    // Output streams live, including in parallel mode. Several behave processes
    // can be writing to one TestRun there, so each line carries a prefix naming
    // the feature it came from - previously the whole stream was buffered to
    // process close to keep it readable, which meant no live feedback at all in
    // the mode chosen for speed.
    //
    // stdout and stderr are fed separately: each is its own byte stream, so a
    // sequence split across chunks must be reassembled per stream.
    const pipeline = new RunOutputPipeline(wr.run, wr.outputIndex,
      wr.wkspSettings.projectUri, outputPrefix, outputTest);

    // Decode as text on the stream rather than per chunk, so a multi-byte
    // character straddling a chunk boundary is not corrupted.
    cp.stdout?.setEncoding("utf8");
    cp.stderr?.setEncoding("utf8");
    cp.stdout?.on('data', (chunk: string) => pipeline.write("stdout", chunk));
    cp.stderr?.on('data', (chunk: string) => pipeline.write("stderr", chunk));

    pipeline.writeDirect(`\n${outputPrefix}${friendlyCmd}\n`);

    await new Promise((resolve) => cp.on('close', () => resolve("")));

    // Release any held or partial output now the process has gone.
    pipeline.flushAll();

    if (wr.run.token.isCancellationRequested)
      pipeline.writeDirect(`\n${outputPrefix}-- TEST RUN ${wr.run.name} CANCELLED --\n`);

  }
  finally {
    cancellationHandler.dispose();
  }

}
