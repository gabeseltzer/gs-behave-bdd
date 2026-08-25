// A lookup from "feature file + 1-based line" to the test item at that line.
//
// This is the key that replaced junit name matching in Pass 2, and it is shared
// because two independent consumers need exactly the same mapping:
//
//  - StreamResultReporter, resolving NDJSON scenario events to items.
//  - OutputAttributor, resolving the "# <file>:<line>" comment that behave's own
//    pretty formatter prints after each scenario header.
//
// Both see the SAME project-relative path and the SAME 1-based line for a given
// scenario (verified against a real run: an outline example row reports its own
// data-row line in both the event stream and the pretty output), so a divergence
// between two copies of this logic would be a silent mis-attribution bug.

import * as vscode from 'vscode';
import { QueueItem } from '../extension';
import { Scenario, TestData } from '../parsers/testFile';


/**
 * Key for one scenario position.
 *
 * Deliberately not uriId(): the line has to be part of the key because two
 * different feature files can hold a scenario at the same line, and the path is
 * lowercased for the same reason urisMatch() exists (Windows drive-letter and
 * path casing).
 */
export function lineKey(uri: vscode.Uri, line: number): string {
  return `${uri.path.toLowerCase()}:${line}`;
}


export class FeatureLineIndex {

  private readonly byLine = new Map<string, QueueItem>();
  /** Lowercased paths of every feature file in the queue, for cheap file-level tests. */
  private readonly featurePaths = new Set<string>();

  /**
   * @param testData needed to reach Scenario Outline example rows, which behave
   * reports but the queue does not contain. Omitting it indexes exactly the queue,
   * which is what the junit path wants.
   */
  constructor(queue: QueueItem[], testData?: TestData) {
    for (const item of queue) {
      this.add(item);
      if (testData)
        this.addExampleRows(item.test, testData);
    }
  }


  private add(item: QueueItem): void {
    if (!item.test.uri || !item.test.range)
      return;
    this.featurePaths.add(item.test.uri.path.toLowerCase());
    // vscode ranges are 0-based; behave lines are 1-based.
    this.byLine.set(lineKey(item.test.uri, item.test.range.start.line + 1), item);
  }


  /**
   * Index the example rows underneath a queued Scenario Outline.
   *
   * An outline reaches the queue as ONE item - its parent - because
   * queueSelectedTestItems stops recursing at the first Scenario it meets and the
   * outline parent is one (testFile.ts:111). Its rows are Scenarios too
   * (testFile.ts:151) but sit below a ScenarioExamplesGroup, so they are never
   * reached and never queued.
   *
   * behave, though, reports each example row at its OWN data-row line - in the event
   * stream and in the "# file:line" comment on each header alike. Without the rows
   * here, every one of those lines misses the index: output falls back to the
   * feature (so a row has no output of its own to show) and scenario events resolve
   * to nothing (so a row gets no live result and waits for junit).
   *
   * Rows are synthesised as QueueItems rather than being put in the queue proper:
   * the queue decides what behave is ASKED to run, and an outline is asked for as a
   * whole. This only decides what its answers can be attributed to.
   */
  private addExampleRows(parent: vscode.TestItem, testData: TestData): void {
    parent.children.forEach(child => {
      const data = testData.get(child);
      // A row is a Scenario carrying an exampleRow; the group between them is a
      // ScenarioExamplesGroup, which behave never reports a line for.
      if (data instanceof Scenario && data.exampleRow)
        this.add({ test: child, scenario: data });
      this.addExampleRows(child, testData);
    });
  }


  public find(uri: vscode.Uri, line: number): QueueItem | undefined {
    return this.byLine.get(lineKey(uri, line));
  }


  /**
   * True if this file holds any queued scenario. Used to tell a feature-file
   * location comment from a step-definition one (which names a .py file) without
   * depending on file extensions or on Gherkin keyword spelling.
   */
  public hasFile(uri: vscode.Uri): boolean {
    return this.featurePaths.has(uri.path.toLowerCase());
  }

}
