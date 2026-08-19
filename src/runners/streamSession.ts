// Owns the live event streams for one workspace's part of one test run.
//
// One stream FILE per behave process, not one per workspace. behave's StreamOpener
// opens a formatter outfile with codecs.open(name, "w"), so N parallel instances
// pointed at a single path would each truncate it on open and then interleave their
// writes into it, while NdjsonTail read that path through one fd at a monotonically
// increasing offset - losing results and, after a truncation, reading past EOF.
//
// Every spawn therefore gets its own file and its own tail. They all feed the one
// StreamResultReporter, which keys events on feature file + line and so does not
// care which process an event arrived from.

import * as vscode from 'vscode';
import { diagLog, DiagLogType } from '../logger';
import { getStreamFileUri, isSupportedProtocol, NdjsonTail } from './streamEvents';
import { StreamResultReporter } from './streamResults';


/** Keep spawn ids filesystem-safe and short, whatever the feature file is called. */
function sanitiseSpawnId(label: string): string {
  const safe = label.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return (safe || "behave").slice(0, 50);
}


export class StreamSession {

  private readonly tails: NdjsonTail[] = [];
  private seq = 0;

  constructor(
    private readonly runName: string,
    private readonly wkspName: string,
    private readonly reporter: StreamResultReporter,
  ) { }


  /**
   * Allocate one behave process its own stream file and start tailing it.
   *
   * The sequence prefix is what guarantees uniqueness: the label is only there to
   * make the file identifiable while debugging, and two features in different
   * folders can share a basename.
   */
  public open(label: string): vscode.Uri {

    const spawnId = `${this.seq++}-${sanitiseSpawnId(label)}`;
    const uri = getStreamFileUri(this.runName, this.wkspName, spawnId);

    // Protocol is checked per stream rather than per session: one instance speaking
    // a future protocol must defer to junit on its own, not silence the others.
    let unsupported = false;

    const tail = new NdjsonTail(uri.fsPath, events => {
      if (unsupported)
        return;
      if (!events.every(isSupportedProtocol)) {
        unsupported = true;
        diagLog(`streamSession: ${spawnId} speaks an unsupported protocol, deferring to junit for it`,
          undefined, DiagLogType.warn);
        return;
      }
      this.reporter.handle(events);
    });

    tail.start();
    this.tails.push(tail);
    diagLog(`streamSession: tailing ${uri.fsPath}`);

    return uri;
  }


  /**
   * Drain and close every stream. Each tail reads whatever is left before closing,
   * so events written between a behave process's last poll and its exit are kept.
   */
  public stopAll(): void {
    for (const tail of this.tails)
      tail.stop();
  }


  /** Exposed for tests: how many behave processes this session has streams for. */
  public get streamCount(): number {
    return this.tails.length;
  }

}
