// Tails an append-only file, delivering complete lines as they are written.
//
// Why polling one open fd rather than a FileSystemWatcher: results used to come
// from behave's junit XML via one, and that is the direct cause of two defects -
// watcher wake-up latency, plus duplicate onDidChange events per write (so the
// whole file got re-read and re-parsed more than once). A single file descriptor
// read from a running offset has neither.
//
// Two callers share this deliberately. The NDJSON event stream parses these lines
// as JSON (streamEvents.ts). The debug path takes them as text: behave's pretty
// output is redirected to a file there so it stays off the debug console, and its
// formatter flushes after every write (formatter/pretty.py:129,161,186,196,234,
// 280,292), so the file is readable as it is produced rather than at the end.

import * as fs from 'fs';
import { diagLog, DiagLogType } from '../logger';
import { StringDecoder } from 'string_decoder';


export class LineTail {

  private offset = 0;
  private partial = "";
  // A read can land mid-character, so bytes cannot be decoded per read: StringDecoder
  // holds an incomplete multi-byte sequence back until the rest of it arrives.
  private readonly decoder = new StringDecoder("utf8");
  private fd: number | undefined;
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;

  /**
   * @param onLines complete lines in order, INCLUDING empty ones. behave separates
   * scenarios with blank lines, so dropping them is the caller's decision, not this
   * layer's.
   */
  constructor(
    private readonly fsPath: string,
    private readonly onLines: (lines: string[]) => void,
    private readonly pollMs = 50,
  ) { }


  public start(): void {
    if (this.timer || this.stopped)
      return;
    this.timer = setInterval(() => this.read(), this.pollMs);
  }


  /**
   * Stop polling, but read whatever is left first - the writer may have written
   * its final lines between the last tick and exiting.
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
    // A file that does not end in a newline leaves a last line held as partial.
    // behave's own output always ends with one, but a crashed process's need not.
    if (this.partial !== "") {
      const last = this.partial;
      this.partial = "";
      this.onLines([last]);
    }
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
          return; // the writer has not opened the file yet
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
      // The last segment has no newline yet, so it stays partial.
      this.partial = lines.pop() ?? "";

      if (lines.length > 0)
        this.onLines(lines);
    }
    catch (e: unknown) {
      // Helper - must not throw. Losing the tail degrades the run (junit results,
      // or missing output) rather than failing it.
      diagLog(`lineTail: read failed for ${this.fsPath}: ${e as string}`,
        undefined, DiagLogType.warn);
    }
  }

}
