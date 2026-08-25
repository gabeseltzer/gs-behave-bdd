// Turns raw behave output into attributed text on a TestRun.
//
// One implementation, two callers. A normal run feeds it the spawned process's
// stdout and stderr pipes (behaveRun.ts); a debug run feeds it the lines tailed
// from the file behave's pretty formatter writes (behaveDebug.ts). Keeping this
// in one place is the point: the two paths previously diverged silently, and a
// second copy of the filter/attribute/coalesce chain would drift from the first
// exactly the way failure wording did before failureMessage.ts existed.

import * as vscode from 'vscode';
import { BehaveOutputFilter } from './behaveOutput';
import { FeatureLineIndex } from './itemIndex';
import { AttributedLine, OutputAttributor } from './outputAttribution';


/** TestRun output is rendered by a terminal, which needs CRLF. */
export function toRunOutput(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
}


export class RunOutputPipeline {

  private readonly attributor: OutputAttributor;
  // One filter per byte stream: each is its own stream of bytes, so a sequence
  // split across chunks must be reassembled per stream, not globally.
  private readonly filters = new Map<string, BehaveOutputFilter>();

  /**
   * @param outputPrefix prepended to every emitted line. Set when more than one
   * behave process writes to the same TestRun, so lines stay attributable.
   * @param outputTest the item to attribute any line the attributor cannot place
   * to. In parallel mode this is the feature item.
   */
  constructor(
    private readonly run: vscode.TestRun,
    index: FeatureLineIndex,
    projectUri: vscode.Uri,
    private readonly outputPrefix = "",
    private readonly outputTest?: vscode.TestItem,
  ) {
    this.attributor = new OutputAttributor(index, projectUri, outputTest, outputPrefix);
  }


  /** Feed a decoded chunk from one named byte stream. */
  public write(streamName: string, chunk: string): void {
    this.writeLines(this.filterFor(streamName).write(chunk));
  }


  /** Release whatever one stream is holding: a partial line, or an unresolved block. */
  public flush(streamName: string): void {
    this.writeLines(this.filterFor(streamName).flush());
  }


  /** Release every stream. Call once the producer has finished. */
  public flushAll(): void {
    for (const streamName of [...this.filters.keys()])
      this.flush(streamName);
  }


  /**
   * Write text we generated ourselves - the command banner, the cancellation
   * notice - rather than text behave produced. Not filtered and not attributed,
   * because it belongs to the run rather than to any one scenario.
   */
  public writeDirect(text: string): void {
    if (this.outputTest)
      this.run.appendOutput(toRunOutput(text), undefined, this.outputTest);
    else
      this.run.appendOutput(toRunOutput(text));
  }


  private filterFor(streamName: string): BehaveOutputFilter {
    let filter = this.filters.get(streamName);
    if (!filter) {
      filter = new BehaveOutputFilter(this.outputPrefix);
      this.filters.set(streamName, filter);
    }
    return filter;
  }


  private writeLines(lines: string[]): void {
    // Consecutive lines sharing an attribution are appended as one block. Only a
    // scenario header carries a location, so in practice this is about two calls
    // per scenario rather than one per line.
    let block: AttributedLine[] = [];
    for (const line of lines) {
      const attributed = this.attributor.attribute(line);
      // A located line starts its own block, so its location is not carried onto
      // the lines that follow it.
      const sameBlock = block.length > 0
        && block[0].test === attributed.test
        && !attributed.location
        && !block[0].location;
      if (!sameBlock) {
        this.flushBlock(block);
        block = [];
      }
      block.push(attributed);
    }
    this.flushBlock(block);
  }


  private flushBlock(block: AttributedLine[]): void {
    if (block.length === 0)
      return;
    const text = block.map(l => l.text).join("\r\n") + "\r\n";
    this.run.appendOutput(text, block[0].location, block[0].test);
  }

}
