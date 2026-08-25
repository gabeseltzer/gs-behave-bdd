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
import { diagLog } from '../logger';
import { buildFailureMessage, failureText } from './failureMessage';
import { FeatureLineIndex } from './itemIndex';
import { BehaveEvent } from './streamEvents';

/** Resolved scenario statuses, as behave's Status enum names them. */
const TERMINAL_STATUSES = new Set([
  "passed", "failed", "error", "hook_error", "cleanup_error", "skipped", "untested",
]);

/** Step statuses that are not a problem, so cannot be the cause of a failure. */
const BENIGN_STEP_STATUSES = new Set(["passed", "skipped", "untested"]);


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
  private readonly index: FeatureLineIndex;

  // Every step the scenario currently running on each stream has finished, in
  // order - not just the one that broke it. The failing step is derived from this
  // (the first non-benign entry), and the whole trail is shown with the failure,
  // because "what ran before it" is the context a bare failing-step line lacks.
  //
  // Per stream, not one field: in parallel mode every behave process feeds this
  // one reporter, so a single "current" trail would be interleaved by whichever
  // process happened to emit next and steps would land on the wrong scenario.
  // Within ONE stream the events are strictly ordered and only one scenario runs
  // at a time, so the association is exact.
  //
  // It has to come from ordering at all because a step event carries the STEP's
  // line (e.g. 20), not its scenario's (18) - there is no parent key on the event
  // to join on, and a scenario item's range covers only its header line, so the
  // step's line is not inside it either.
  private readonly stepTrail = new Map<string, BehaveEvent[]>();

  /**
   * @param index built ONCE by the caller and shared with OutputAttributor. Building
   * a second one here is what let results and output disagree about which lines
   * exist: this reporter's copy was built from the queue alone, which omits Scenario
   * Outline example rows.
   */
  constructor(
    private readonly run: vscode.TestRun,
    private readonly projectUri: vscode.Uri,
    index: FeatureLineIndex,
  ) {
    this.index = index;
  }


  /** Ids this reporter has already settled - junit should not overwrite them. */
  public get reportedIds(): ReadonlySet<string> {
    return this.reported;
  }


  /**
   * @param streamId identifies the behave process these events came from. Several
   * streams feed one reporter in parallel mode, and the failing-step association
   * relies on per-stream ordering, so events from different processes must not
   * share state.
   */
  public handle(events: BehaveEvent[], streamId = ""): void {
    for (const event of events) {
      if (event.event === "step") {
        this.onStepEnd(event, streamId);
        continue;
      }
      if (event.event !== "scenario")
        continue; // features carry no item state
      if (event.phase === "start")
        this.onScenarioStart(event, streamId);
      else if (event.phase === "end")
        this.onScenarioEnd(event, streamId);
    }
  }


  private onScenarioStart(event: BehaveEvent, streamId: string): void {
    // A new scenario cannot inherit the previous one's steps. Cleared before the
    // find() below, so an unmatched scenario still resets the trail rather than
    // letting its steps accumulate into the next one.
    this.stepTrail.delete(streamId);
    const item = this.find(event);
    if (!item)
      return;
    // Only the scenario actually executing is marked running. Previously every
    // queued item was started up front, so the whole tree spun at once and the
    // animation carried no information.
    this.run.started(item.test);
  }


  private onStepEnd(event: BehaveEvent, streamId: string): void {
    if (event.phase !== "end")
      return;
    // Every step is kept, benign ones included - they are the trail. Which one
    // FAILED is derived at scenario end rather than latched here, so there is one
    // definition of "the failing step" instead of two that can disagree.
    const trail = this.stepTrail.get(streamId);
    if (trail)
      trail.push(event);
    else
      this.stepTrail.set(streamId, [event]);
  }


  /**
   * The step that broke the scenario: the FIRST non-benign one.
   *
   * behave stops executing at that step, so it is the cause; the steps after it
   * are reported skipped or undefined and taking a later one would bury it.
   */
  private failingStepIn(trail: readonly BehaveEvent[]): BehaveEvent | undefined {
    return trail.find(step => !BENIGN_STEP_STATUSES.has(step.status ?? ""));
  }


  private onScenarioEnd(event: BehaveEvent, streamId: string): void {
    const trail = this.stepTrail.get(streamId) ?? [];
    const step = this.failingStepIn(trail);
    this.stepTrail.delete(streamId);

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
        this.run.failed(item.test, this.message(item, event, step, trail), duration);
        break;
      default: // error, hook_error, cleanup_error
        this.run.errored(item.test, this.message(item, event, step, trail), duration);
        break;
    }

    item.scenario.result = status;
    this.reported.add(item.test.id);
    markSettled(this.run.name, item.test.id);

    // Positive evidence that the STREAM set this result, not the junit verifier.
    // Without it the two paths are indistinguishable from the outside: the junit
    // watcher logs "updated the result" unconditionally, whether or not updateTest
    // then early-returned on isSettledByStream - so a streaming test that silently
    // fell back to junit would look exactly like one that worked.
    diagLog(`streamResults: stream settled ${item.test.id} as ${status}`);
  }


  /**
   * Failure text and location for a scenario.
   *
   * The scenario event itself carries no error - only the step events do - so
   * without the failing step held above, every streamed failure showed the bare
   * word "failed", which is strictly less than the junit path already reported.
   */
  private message(item: QueueItem, event: BehaveEvent, step: BehaveEvent | undefined,
    trail: readonly BehaveEvent[]): vscode.TestMessage {

    const fallback = event.status?.trim() || "failed";
    const text = failureText(
      step ? { keyword: step.keyword, name: step.name, status: step.status } : undefined,
      step?.error ?? event.error ?? undefined,
      fallback);

    // A hook error can settle a scenario with no step events at all, in which case
    // the trail renders to nothing and the message is what it was before.
    return buildFailureMessage(text, this.failureLocation(item, step), trail);
  }


  /**
   * Point at the failing STEP where the stream identified one, since that is the
   * line the user needs, and fall back to the scenario header otherwise.
   */
  private failureLocation(item: QueueItem, step: BehaveEvent | undefined): vscode.Location | undefined {

    if (step?.file && step.line != null) {
      const uri = this.resolve(step.file);
      // Only trust a step location that is in a feature file we know about; a
      // malformed path must not produce a link into nowhere.
      if (this.index.hasFile(uri)) {
        // A Range, not a bare Position: Location accepts either, but every other
        // location here is a Range and consumers read .range.start.
        const at = new vscode.Position(Math.max(0, step.line - 1), 0);
        return new vscode.Location(uri, new vscode.Range(at, at));
      }
    }

    if (item.test.uri && item.test.range)
      return new vscode.Location(item.test.uri, item.test.range);

    return undefined;
  }


  private find(event: BehaveEvent): QueueItem | undefined {
    if (!event.file || event.line == null)
      return undefined;
    return this.index.find(this.resolve(event.file), event.line);
  }


  /** behave reports feature paths relative to its working directory (the project). */
  private resolve(behaveFile: string): vscode.Uri {
    const relative = behaveFile.replace(/\\/g, "/");
    return vscode.Uri.joinPath(this.projectUri, relative);
  }

}
