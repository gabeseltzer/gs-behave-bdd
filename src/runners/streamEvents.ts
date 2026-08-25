// Reads the NDJSON event stream written by src/python/gs_behave_bdd_stream.py
// while behave is still running, and maps each event onto a test item.
//
// This is only the parse layer. Getting the lines off a file that is still being
// written is LineTail's job, and it is shared with the debug path's output tail -
// see lineTail.ts for why that is a polled fd rather than a FileSystemWatcher.

import * as vscode from 'vscode';
import { config } from '../configuration';
import { diagLog, DiagLogType } from '../logger';
import { LineTail } from './lineTail';

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
 * Delivers the events written to an NDJSON stream file, as they are written.
 *
 * The file may not exist yet when polling starts - behave creates it when the
 * formatter opens its stream - so a missing file is not an error.
 */
export class NdjsonTail {

  private readonly tail: LineTail;

  constructor(
    fsPath: string,
    private readonly onEvents: (events: BehaveEvent[]) => void,
    pollMs = 50,
  ) {
    this.tail = new LineTail(fsPath, lines => this.parse(lines), pollMs);
  }


  public start(): void {
    this.tail.start();
  }


  /** Stop polling, having read whatever the formatter wrote since the last tick. */
  public stop(): void {
    this.tail.stop();
  }


  public dispose(): void {
    this.tail.dispose();
  }


  private parse(lines: string[]): void {
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
