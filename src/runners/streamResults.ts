// Maps NDJSON events from behave onto test items and reports them to the TestRun.
//
// Events are keyed on feature file + 1-based line, which is unique for both plain
// scenarios and Scenario Outline example rows (behave reports a generated example
// scenario at the line of its own data row). That replaces the string matching the
// junit path needs - comparing a reconstructed classname and scenario name, with
// regex fallbacks for outlines and <param> substitution, where a miss throws and
// discards every remaining result in the file.

import * as vscode from 'vscode';
import { QueueItem } from '../extension';
import { urisMatch } from '../common';
import { diagLog } from '../logger';
import { BehaveEvent } from './streamEvents';

/** Resolved scenario statuses, as behave's Status enum names them. */
const TERMINAL_STATUSES = new Set([
  "passed", "failed", "error", "hook_error", "cleanup_error", "skipped", "untested",
]);


// Which test items the live stream has already settled, per run.
//
// JUnit is still written and still parsed at run end, but as a VERIFIER: it should
// fill in anything the stream missed and leave the rest alone. Without this, the
// junit path re-reports every scenario, which re-exposes its name-matching (a miss
// throws and discards the rest of the file) for results already known to be correct.
//
// Module-level and keyed by run name because the junit path is reached from the
// filesystem watcher, which has no reference to the run's reporter.
const settledByRun = new Map<string, Set<string>>();

export function markSettled(runName: string | undefined, testId: string): void {
  if (!runName)
    return;
  let ids = settledByRun.get(runName);
  if (!ids) {
    ids = new Set<string>();
    settledByRun.set(runName, ids);
  }
  ids.add(testId);
}

export function isSettledByStream(runName: string | undefined, testId: string): boolean {
  return !!runName && (settledByRun.get(runName)?.has(testId) ?? false);
}

/** Must be called when a run ends, or the map grows for the life of the session. */
export function clearSettled(runName: string | undefined): void {
  if (runName)
    settledByRun.delete(runName);
}


export class StreamResultReporter {

  /** Test ids already reported, so junit reconciliation can skip them. */
  private readonly reported = new Set<string>();
  /** Feature-file line index, built once per run. */
  private readonly byLine = new Map<string, QueueItem>();

  constructor(
    private readonly run: vscode.TestRun,
    private readonly projectUri: vscode.Uri,
    queue: QueueItem[],
  ) {
    for (const item of queue) {
      const key = this.itemKey(item);
      if (key)
        this.byLine.set(key, item);
    }
  }


  /** Ids this reporter has already settled - junit should not overwrite them. */
  public get reportedIds(): ReadonlySet<string> {
    return this.reported;
  }


  public handle(events: BehaveEvent[]): void {
    for (const event of events) {
      if (event.event !== "scenario")
        continue; // steps are output-only for now; features carry no item state
      if (event.phase === "start")
        this.onScenarioStart(event);
      else if (event.phase === "end")
        this.onScenarioEnd(event);
    }
  }


  private onScenarioStart(event: BehaveEvent): void {
    const item = this.find(event);
    if (!item)
      return;
    // Only the scenario actually executing is marked running. Previously every
    // queued item was started up front, so the whole tree spun at once and the
    // animation carried no information.
    this.run.started(item.test);
  }


  private onScenarioEnd(event: BehaveEvent): void {
    const item = this.find(event);
    if (!item)
      return;

    const status = event.status ?? "";
    if (!TERMINAL_STATUSES.has(status)) {
      diagLog(`streamResults: unrecognised scenario status "${status}" for ${item.test.id}`);
      return;
    }

    const duration = event.duration != null ? event.duration * 1000 : undefined;

    switch (status) {
      case "passed":
        this.run.passed(item.test, duration);
        break;
      case "skipped":
      case "untested":
        this.run.skipped(item.test);
        break;
      case "failed":
        this.run.failed(item.test, this.message(item, event), duration);
        break;
      default: // error, hook_error, cleanup_error
        this.run.errored(item.test, this.message(item, event), duration);
        break;
    }

    item.scenario.result = status;
    this.reported.add(item.test.id);
    markSettled(this.run.name, item.test.id);
  }


  private message(item: QueueItem, event: BehaveEvent): vscode.TestMessage {
    const message = new vscode.TestMessage(event.error?.trim() || event.status || "failed");
    if (item.test.uri && item.test.range)
      message.location = new vscode.Location(item.test.uri, item.test.range);
    return message;
  }


  private find(event: BehaveEvent): QueueItem | undefined {
    if (!event.file || event.line == null)
      return undefined;
    return this.byLine.get(this.key(this.resolve(event.file), event.line));
  }


  /** behave reports feature paths relative to its working directory (the project). */
  private resolve(behaveFile: string): vscode.Uri {
    const relative = behaveFile.replace(/\\/g, "/");
    return vscode.Uri.joinPath(this.projectUri, relative);
  }


  private itemKey(item: QueueItem): string | undefined {
    if (!item.test.uri || !item.test.range)
      return undefined;
    // vscode ranges are 0-based; behave lines are 1-based.
    return this.key(item.test.uri, item.test.range.start.line + 1);
  }


  private key(uri: vscode.Uri, line: number): string {
    // Not uriId(): two different feature files can share a line number, so the
    // path has to be part of the key, and it must be compared case-insensitively
    // for the same reason urisMatch() exists (Windows drive-letter casing).
    return `${uri.path.toLowerCase()}:${line}`;
  }


  /** Exposed for tests: does this queue item correspond to that file and line? */
  public static matches(item: QueueItem, uri: vscode.Uri, line: number): boolean {
    return !!item.test.uri && urisMatch(item.test.uri, uri)
      && !!item.test.range && item.test.range.start.line + 1 === line;
  }

}
