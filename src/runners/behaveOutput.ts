// Translates raw behave stdout/stderr into lines that are safe to append to a
// vscode TestRun.
//
// Two problems make this more than a string replace:
//
// 1. behave's pretty formatter draws each step TWICE when colour is on. match()
//    prints the step in grey (Status.executing), then result() writes a
//    cursor-up sequence and reprints the same block in its final colour
//    (bundled/libs/behave/formatter/pretty.py:157-175). A TestRun output channel
//    is append-only from our side, and other behave processes may be writing to
//    the same run, so we resolve the rewrite here and emit each step once, in
//    its final colour. That keeps the emitted stream append-only and immune to
//    interleaving.
//
// 2. Chunks arrive on arbitrary boundaries, so an escape sequence or a multi-byte
//    character can straddle two of them. Everything below works on complete
//    lines, and the caller sets an encoding on the stream so chunks are already
//    decoded text rather than per-chunk Buffer.toString() output.
//
// In monochrome mode behave emits no SGR at all, so nothing here matches and the
// filter is a pass-through.

// The grey that behave uses for Status.executing (ansi_escapes.py: executing ->
// grey -> \x1b[90m). "comments" is the same grey, but a comment only ever
// appears AFTER the step text on a line, so testing the first SGR of a line
// distinguishes the two reliably - and does so without depending on Gherkin
// keyword spelling, which is localisable.
const EXECUTING_SGR = "\x1b[90m";

// Safety valve. A held block is released unresolved rather than growing without
// bound, in case a future behave stops emitting the cursor-up it promised. The
// worst case is a step shown twice - the behaviour we have today - rather than
// output going missing.
const MAX_HELD_LINES = 200;

// eslint-disable-next-line no-control-regex
const LEADING_CURSOR_UP = /^(?:\x1b\[(\d*)A)+/;
// Any CSI sequence that is not SGR ("m"), plus OSC strings, plus single-character
// escapes. SGR is deliberately preserved - it is the colour we want to keep.
// eslint-disable-next-line no-control-regex
const NON_SGR_CSI = /\x1b\[[0-9;?]*[A-Za-ln-z]/g;
// eslint-disable-next-line no-control-regex
const OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
// eslint-disable-next-line no-control-regex
const OTHER_ESCAPE = /\x1b[()#][0-9A-Za-z]|\x1b[=>ADEHMZ78]/g;


/** Count the lines a leading run of cursor-up sequences moves back over. */
function leadingCursorUpCount(line: string): { count: number; rest: string } {
  const match = LEADING_CURSOR_UP.exec(line);
  if (!match)
    return { count: 0, rest: line };

  // The regex collapses a repeated group, so re-scan to total every sequence.
  let count = 0;
  const consumed = match[0];
  // eslint-disable-next-line no-control-regex
  const each = /\x1b\[(\d*)A/g;
  let m: RegExpExecArray | null;
  while ((m = each.exec(consumed)) !== null)
    count += m[1] === "" ? 1 : parseInt(m[1], 10);

  return { count, rest: line.slice(consumed.length) };
}


/** Drop cursor motion and other non-colour escapes; keep SGR. */
function stripNonColourEscapes(text: string): string {
  return text.replace(OSC, "").replace(NON_SGR_CSI, "").replace(OTHER_ESCAPE, "");
}


/**
 * Apply terminal carriage-return semantics within a single line: a bare \r means
 * "go back to column 0", so only what follows the last one is visible. A single
 * trailing \r is just the CR of a CRLF line ending and carries no meaning.
 */
function applyCarriageReturns(line: string): string {
  const withoutLineEnding = line.endsWith("\r") ? line.slice(0, -1) : line;
  const lastCr = withoutLineEnding.lastIndexOf("\r");
  return lastCr === -1 ? withoutLineEnding : withoutLineEnding.slice(lastCr + 1);
}


/** True if this line is a step drawn in the "executing" pass, i.e. about to be redrawn. */
function isExecutingPassLine(line: string): boolean {
  return line.trimStart().startsWith(EXECUTING_SGR);
}


export class BehaveOutputFilter {

  // Text after the last newline: an incomplete line, held until the rest arrives.
  private partial = "";
  // An executing-pass block, held back so the resolved version can replace it.
  private held: string[] = [];

  /**
   * @param linePrefix prepended to every emitted line. Used in parallel mode,
   * where several behave processes write to one TestRun and a line is otherwise
   * unattributable.
   */
  constructor(private readonly linePrefix = "") { }


  /** Feed a decoded chunk; returns the lines that are now final. */
  public write(chunk: string): string[] {
    if (!chunk)
      return [];

    this.partial += chunk;

    const segments = this.partial.split("\n");
    // The last segment has no newline yet, so it stays partial.
    this.partial = segments.pop() ?? "";

    const out: string[] = [];
    for (const segment of segments)
      this.consumeLine(applyCarriageReturns(segment), out);

    return out;
  }


  /**
   * Release everything still buffered. Call once the process has closed, so a
   * final line without a newline - or an unresolved held block - is not lost.
   */
  public flush(): string[] {
    const out: string[] = [];

    if (this.held.length > 0) {
      this.emit(this.held, out);
      this.held = [];
    }

    if (this.partial !== "") {
      const line = stripNonColourEscapes(applyCarriageReturns(this.partial));
      this.partial = "";
      this.emit([line], out);
    }

    return out;
  }


  private consumeLine(rawLine: string, out: string[]): void {
    const { count, rest } = leadingCursorUpCount(rawLine);
    const line = stripNonColourEscapes(rest);

    if (count > 0) {
      // behave is redrawing the block it just wrote. Discard what it is
      // replacing; `line` is the first line of the replacement and is final.
      this.held.splice(Math.max(0, this.held.length - count), count);
      if (this.held.length > 0) {
        // More was held than the rewrite covered - emit the remainder rather
        // than silently dropping it.
        this.emit(this.held, out);
        this.held = [];
      }
      this.emit([line], out);
      return;
    }

    if (this.held.length > 0) {
      // Mid-block: these are the executing pass's own continuation lines
      // (a docstring or table under the step), which the rewrite also covers.
      this.held.push(line);
      if (this.held.length > MAX_HELD_LINES) {
        this.emit(this.held, out);
        this.held = [];
      }
      return;
    }

    if (isExecutingPassLine(line)) {
      this.held.push(line);
      return;
    }

    this.emit([line], out);
  }


  private emit(lines: string[], out: string[]): void {
    for (const line of lines)
      out.push(this.linePrefix + line);
  }

}
