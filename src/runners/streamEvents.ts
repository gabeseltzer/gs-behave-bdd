// Reads the NDJSON event stream written by src/python/gs_behave_bdd_stream.py
// while behave is still running, and maps each event onto a test item.
//
// Why not a FileSystemWatcher: results used to come from behave's junit XML via
// one, and that is the direct cause of two defects - watcher wake-up latency plus
// duplicate onDidChange events per write (so the whole feature XML got re-read and
// re-parsed more than once), and a 400ms grace period paid on every run end while
// waiting for events that may never arrive. A single open file descriptor read
// from a running offset has none of that.

import * as fs from 'fs';
import * as vscode from 'vscode';
import { StringDecoder } from 'string_decoder';
import { config } from '../configuration';
import { diagLog, DiagLogType } from '../logger';

/** Must match PROTOCOL_VERSION in src/python/gs_behave_bdd_stream.py. */
export const EXPECTED_PROTOCOL_VERSION = 1;


/** Directory holding every event stream one workspace writes during one run. */
export function getStreamDirUri(runName: string, wkspName: string): vscode.Uri {
  return vscode.Uri.joinPath(config.extensionTempFilesUri, "events", runName, wkspName);
}


/**
 * Where ONE behave process's event stream is written.
 *
 * Per process, not per workspace: behave's StreamOpener opens a formatter outfile
 * with codecs.open(name, "w"), so parallel instances sharing one path would each
 * TRUNCATE it on open and then interleave their writes into it - while the tail
 * reads it through a single fd at a monotonically increasing offset.
 */
export function getStreamFileUri(runName: string, wkspName: string, spawnId: string): vscode.Uri {
  return vscode.Uri.joinPath(getStreamDirUri(runName, wkspName), `${spawnId}.ndjson`);
}

export interface BehaveEvent {
  event: "testrun" | "feature" | "scenario" | "step";
  phase?: "start" | "end";
  protocol?: number;
  /** Feature file path as behave reports it: relative to the project directory. */
  file?: string | null;
  /** 1-based line. For a Scenario Outline example row this is the row's own line. */
  line?: number | null;
  name?: string | null;
  /** Gherkin keyword of a step event ("Given ", "When ", ...). */
  keyword?: string | null;
  status?: string | null;
  duration?: number | null;
  error?: string | null;
  feature_name?: string | null;
}


/**
 * Tails an append-only NDJSON file, delivering complete lines as parsed events.
 *
 * The file may not exist yet when polling starts - behave creates it when the
 * formatter opens its stream - so a missing file is not an error.
 */
export class NdjsonTail {

  private offset = 0;
  private partial = "";
  // A read can land mid-character, so bytes cannot be decoded per read: StringDecoder
  // holds an incomplete multi-byte sequence back until the rest of it arrives.
  private readonly decoder = new StringDecoder("utf8");
  private fd: number | undefined;
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;

  constructor(
    private readonly fsPath: string,
    private readonly onEvents: (events: BehaveEvent[]) => void,
    private readonly pollMs = 50,
  ) { }


  public start(): void {
    if (this.timer || this.stopped)
      return;
    this.timer = setInterval(() => this.read(), this.pollMs);
  }


  /**
   * Stop polling, but read whatever is left first - behave may have written its
   * final events between the last tick and the process exiting.
   */
  public stop(): void {
    if (this.stopped)
      return;
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.read();
    this.closeFd();
  }


  public dispose(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.closeFd();
  }


  private closeFd(): void {
    if (this.fd === undefined)
      return;
    try {
      fs.closeSync(this.fd);
    }
    catch {
      // already gone
    }
    this.fd = undefined;
  }


  private read(): void {
    try {
      if (this.fd === undefined) {
        if (!fs.existsSync(this.fsPath))
          return; // behave has not opened the formatter's stream yet
        this.fd = fs.openSync(this.fsPath, "r");
      }

      const size = fs.fstatSync(this.fd).size;
      if (size <= this.offset)
        return;

      const length = size - this.offset;
      const buffer = Buffer.allocUnsafe(length);
      const read = fs.readSync(this.fd, buffer, 0, length, this.offset);
      this.offset += read;

      this.partial += this.decoder.write(buffer.subarray(0, read));
      const lines = this.partial.split("\n");
      this.partial = lines.pop() ?? "";

      const events: BehaveEvent[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "")
          continue;
        try {
          events.push(JSON.parse(trimmed) as BehaveEvent);
        }
        catch {
          // A torn line should be impossible (the formatter flushes whole lines),
          // but never let one bad line stop the rest of the stream.
          diagLog(`streamEvents: could not parse event line: ${trimmed.slice(0, 200)}`,
            undefined, DiagLogType.warn);
        }
      }

      if (events.length > 0)
        this.onEvents(events);
    }
    catch (e: unknown) {
      // Helper - must not throw. Losing the stream degrades to junit results
      // rather than failing the run.
      diagLog(`streamEvents: read failed for ${this.fsPath}: ${e as string}`,
        undefined, DiagLogType.warn);
    }
  }

}


/**
 * True if this event stream speaks a protocol we understand. A newer formatter
 * than this build should be ignored in favour of junit rather than risk
 * misreporting results.
 */
export function isSupportedProtocol(event: BehaveEvent): boolean {
  if (event.event !== "testrun" || event.phase !== "start")
    return true; // not the handshake event - nothing to check
  return event.protocol === undefined || event.protocol <= EXPECTED_PROTOCOL_VERSION;
}
