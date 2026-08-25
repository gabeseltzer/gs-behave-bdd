// Decides which test item each line of behave's output belongs to.
//
// The signal is behave's OWN source comment. Its pretty formatter appends
// " # <file>:<line>" to every feature and scenario header when show_source is on
// (formatter/pretty.py:123-126, 349-351), and for a Scenario Outline example row
// that location is the data row's own line - the same key the event stream uses.
// Verified against a real run of project A's outline_mixed.feature: the header
// comments carry lines 10, 14, 15, 25, 29, matching the NDJSON scenario events.
//
// Why not the event stream, which already knows what is running: the NDJSON file
// is polled every 50ms while stdout arrives on a pipe, so the two are not ordered
// relative to each other. Attributing stdout to "the last scenario the stream
// mentioned" would put the first lines of a fast scenario under its predecessor.
// The comment travels IN the output being attributed, so it cannot race it.
//
// Step lines also carry a comment, but it names the step DEFINITION (a .py file),
// which is never a feature file in the index - so those are ignored automatically,
// with no dependence on Gherkin keyword spelling, which is localisable.

import * as vscode from 'vscode';
import { FeatureLineIndex } from './itemIndex';

// SGR is preserved by BehaveOutputFilter (it is the colour we want to keep), so it
// has to come off before matching. Only SGR needs removing - every other escape
// has already been stripped by the time a line gets here.
// eslint-disable-next-line no-control-regex
const SGR = /\x1b\[[0-9;]*m/g;

// A trailing source comment. The path may contain spaces ("behave tests/some
// tests/..." in project A), so the path group is greedy up to the final ":<line>".
const SOURCE_COMMENT = /#\s*(\S.*?):(\d+)\s*$/;


/** One output line and what it belongs to. */
export interface AttributedLine {
  text: string;
  test?: vscode.TestItem;
  location?: vscode.Location;
}


export class OutputAttributor {

  private current: vscode.TestItem | undefined;

  /**
   * @param fallbackTest attributed to any line before the first scenario header,
   * and to lines whose scenario is not in this run's queue. In parallel mode this
   * is the feature item, which is as precise as Pass 1 could get.
   * @param linePrefix the prefix BehaveOutputFilter has already prepended in
   * parallel mode. Needed because indentation is what marks the end of a
   * scenario's block, and the prefix would otherwise hide it.
   */
  constructor(
    private readonly index: FeatureLineIndex,
    private readonly projectUri: vscode.Uri,
    private readonly fallbackTest?: vscode.TestItem,
    private readonly linePrefix = "",
  ) {
    this.current = fallbackTest;
  }


  public attribute(text: string): AttributedLine {

    const bare = this.strip(text);
    const match = SOURCE_COMMENT.exec(bare);

    if (!match) {
      // Everything behave prints INSIDE a feature is indented; the run summary
      // ("Failing scenarios:", "2 features passed, ...") and the runner banner are
      // not. So an unindented line ends the current scenario's block - without it
      // the whole summary was attributed to whichever scenario happened to run last.
      //
      // Worst case if a step's own output is unindented: the rest of that scenario
      // falls back to feature level. That degrades, rather than attributing lines
      // to the wrong scenario.
      if (bare !== "" && !/^\s/.test(bare))
        this.current = this.fallbackTest;
      return { text, test: this.current };
    }

    const uri = this.resolve(match[1]);
    if (!this.index.hasFile(uri))
      return { text, test: this.current }; // a step definition, or not ours


    const line = parseInt(match[2], 10);
    const item = this.index.find(uri, line);

    if (!item) {
      // A header in a feature file we know, at a line that is not a queued
      // scenario - i.e. the Feature: line itself, or a scenario this run did not
      // select. Either way the previous scenario has ended, so stop attributing
      // to it rather than absorbing the following lines into it.
      this.current = this.fallbackTest;
      return { text, test: this.current };
    }

    this.current = item.test;

    // The header line gets a location so it is clickable; the scenario's body
    // lines deliberately do not. Repeating one location down every line of a
    // scenario turns the whole block into links to the same place and decorates
    // the editor line once per line of output.
    const location = item.test.range
      ? new vscode.Location(uri, item.test.range)
      : undefined;

    return { text, test: this.current, location };
  }


  /** behave prints paths relative to its working directory (the project). */
  private resolve(behaveFile: string): vscode.Uri {
    return vscode.Uri.joinPath(this.projectUri, behaveFile.replace(/\\/g, "/"));
  }


  /** Reduce a line to what behave actually wrote: no colour, no parallel prefix. */
  private strip(text: string): string {
    const withoutSgr = text.replace(SGR, "");
    return this.linePrefix && withoutSgr.startsWith(this.linePrefix)
      ? withoutSgr.slice(this.linePrefix.length)
      : withoutSgr;
  }

}
