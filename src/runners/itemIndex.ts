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

  constructor(queue: QueueItem[]) {
    for (const item of queue) {
      if (!item.test.uri || !item.test.range)
        continue;
      this.featurePaths.add(item.test.uri.path.toLowerCase());
      // vscode ranges are 0-based; behave lines are 1-based.
      this.byLine.set(lineKey(item.test.uri, item.test.range.start.line + 1), item);
    }
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
