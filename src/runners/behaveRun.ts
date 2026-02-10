import { ChildProcess, spawn, SpawnOptions } from 'child_process';
import { cleanBehaveText } from '../common';
import { diagLog } from '../logger';
import { WkspRun } from './testRunHandler';

function toRunOutput(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
}



export async function runBehaveInstance(wr: WkspRun, parallelMode: boolean,
  args: string[], friendlyCmd: string): Promise<void> {

  let cp: ChildProcess;
  const cancellationHandler = wr.run.token.onCancellationRequested(() => cp?.kill());
  const wkspUri = wr.wkspSettings.uri;

  try {
    const local_args = [...args];
    local_args.unshift("-m", "behave");
    diagLog(`${wr.pythonExec} ${local_args.join(" ")}`, wkspUri);
    const effectiveEnvVars = wr.wkspSettings.getEffectiveEnvVars();
    const env = { ...process.env, ...effectiveEnvVars };
    // Use projectUri as the working directory (this is where behave.ini etc. should be)
    const projectUri = wr.wkspSettings.projectUri;
    const options: SpawnOptions = { cwd: projectUri.fsPath, env: env };
    cp = spawn(wr.pythonExec, local_args, options);

    if (!cp.pid) {
      throw `unable to launch python or behave, command: ${wr.pythonExec} ${local_args.join(" ")}\n` +
      `working directory:${projectUri.fsPath}\nenv vars: ${JSON.stringify(effectiveEnvVars)}`;
    }

    // if parallel mode, use a buffer so logs gets written out in a human-readable order
    const asyncBuff: string[] = [];
    const log = (str: string) => {
      if (!str)
        return;
      str = cleanBehaveText(str);
      if (parallelMode)
        asyncBuff.push(str);
      else
        wr.run.appendOutput(toRunOutput(str));
    }

    cp.stderr?.on('data', chunk => log(chunk.toString()));
    cp.stdout?.on('data', chunk => log(chunk.toString()));

    if (!parallelMode)
      wr.run.appendOutput(toRunOutput(`\n${friendlyCmd}\n`));

    await new Promise((resolve) => cp.on('close', () => resolve("")));

    if (asyncBuff.length > 0) {
      wr.run.appendOutput(toRunOutput(`\n---\n${friendlyCmd}\n`));
      wr.run.appendOutput(toRunOutput(asyncBuff.join("").trim()) + "\r\n");
      wr.run.appendOutput("---\r\n");
    }

    if (wr.run.token.isCancellationRequested)
      wr.run.appendOutput(toRunOutput(`\n-- TEST RUN ${wr.run.name} CANCELLED --\n`));

  }
  finally {
    cancellationHandler.dispose();
  }

}


