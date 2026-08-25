import * as vscode from 'vscode';
import { ChildProcess, spawn, SpawnOptions } from 'child_process';
import { diagLog } from '../logger';
import { getBehaveEnv } from './behaveEnv';
import { BehaveOutputFilter } from './behaveOutput';
import { AttributedLine, OutputAttributor } from './outputAttribution';
import { WkspRun } from './testRunHandler';

// TestRun output is rendered by a terminal, which needs CRLF.
function toRunOutput(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
}


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
    const write = (text: string) => {
      if (outputTest)
        wr.run.appendOutput(text, undefined, outputTest);
      else
        wr.run.appendOutput(text);
    };

    // Attributes each line to the scenario it belongs to, so the Test Explorer can
    // show one scenario's output on its own. Independent of result streaming: this
    // reads behave's own source comments, so it works on the junit-only path too.
    const attributor = new OutputAttributor(wr.outputIndex, wr.wkspSettings.projectUri,
      outputTest, outputPrefix);

    // Consecutive lines sharing an attribution are appended as one block. Only a
    // scenario header carries a location, so in practice this is about two calls
    // per scenario rather than one per line.
    const flushBlock = (block: AttributedLine[]) => {
      if (block.length === 0)
        return;
      const text = block.map(l => l.text).join("\r\n") + "\r\n";
      wr.run.appendOutput(text, block[0].location, block[0].test);
    };

    const writeLines = (lines: string[]) => {
      let block: AttributedLine[] = [];
      for (const line of lines) {
        const attributed = attributor.attribute(line);
        // A located line starts its own block, so its location is not carried onto
        // the lines that follow it.
        const sameBlock = block.length > 0
          && block[0].test === attributed.test
          && !attributed.location
          && !block[0].location;
        if (!sameBlock) {
          flushBlock(block);
          block = [];
        }
        block.push(attributed);
      }
      flushBlock(block);
    };


    // stdout and stderr are filtered separately: each is its own byte stream, so
    // a sequence split across chunks must be reassembled per stream.
    const stdoutFilter = new BehaveOutputFilter(outputPrefix);
    const stderrFilter = new BehaveOutputFilter(outputPrefix);

    // Decode as text on the stream rather than per chunk, so a multi-byte
    // character straddling a chunk boundary is not corrupted.
    cp.stdout?.setEncoding("utf8");
    cp.stderr?.setEncoding("utf8");
    cp.stdout?.on('data', (chunk: string) => writeLines(stdoutFilter.write(chunk)));
    cp.stderr?.on('data', (chunk: string) => writeLines(stderrFilter.write(chunk)));

    write(toRunOutput(`\n${outputPrefix}${friendlyCmd}\n`));

    await new Promise((resolve) => cp.on('close', () => resolve("")));

    // Release any held or partial output now the process has gone.
    writeLines(stdoutFilter.flush());
    writeLines(stderrFilter.flush());

    if (wr.run.token.isCancellationRequested)
      write(toRunOutput(`\n${outputPrefix}-- TEST RUN ${wr.run.name} CANCELLED --\n`));

  }
  finally {
    cancellationHandler.dispose();
  }

}
