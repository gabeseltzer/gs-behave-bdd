// Scanner for behave's `context.execute_steps("...")` embedded call sites inside .py files.
//
// Design constraint (the "zero-false-positive" guarantee): scanExecuteSteps() never throws and
// never guesses. Anything that isn't a recognisable literal form is skipped SILENTLY (emits no
// ExecuteStepsCallStep). This mirrors the sibling parsers (stepsParser.ts / featureParser.ts)
// but the skip-on-uncertainty policy is what makes this scanner safe to run over every .py file.

import * as vscode from 'vscode';
import { uriId, sepr, basename, getLines } from '../common';
import { diagLog } from '../logger';
import { executeStepsKeywordRe, textBlockDelimiterRe, tableRowRe } from './gherkinPatterns';

const executeStepsCallSteps = new Map<string, ExecuteStepsCallStep>();

export class ExecuteStepsCallStep {
  constructor(
    public readonly key: string,
    public readonly uri: vscode.Uri,
    public readonly fileName: string,
    public readonly range: vscode.Range,
    public readonly text: string,
    public readonly textWithoutType: string,
    public readonly stepType: string,
    public readonly isAmbiguousType: boolean,
    public readonly hasFormatPlaceholders: boolean,
  ) { }
}

// Non-blank/non-comment/non-table/non-docstring line inside an execute_steps() literal that
// matches no keyword. Carried alongside call steps for Phase 25's Error diagnostics.
export class ExecuteStepsInvalidLine {
  constructor(
    public readonly uri: vscode.Uri,
    public readonly range: vscode.Range,
    public readonly text: string,
  ) { }
}

// Call-site regex: `execute_steps(` optionally wrapped in `textwrap.dedent(`, optional string
// prefix (u/U/r/R/f/F/b/B, up to 2 chars), then the opening quote delimiter (triple or single).
// Bounded/linear - no nested quantifiers, so this is not vulnerable to ReDoS (T-24-01).
const callSiteRe = /\bexecute_steps\s*\(\s*(?:textwrap\s*\.\s*dedent\s*\(\s*)?([fFuUrRbB]{0,2})("""|'''|"|')/g;

function computeLineStarts(content: string): number[] {
  const starts = [0];
  const re = /\r\n|\r|\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    starts.push(m.index + m[0].length);
  }
  return starts;
}

function lineIndexFromOffset(lineStarts: number[], offset: number): number {
  let lo = 0, hi = lineStarts.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lineStarts[mid] <= offset) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

// Finds the first unescaped occurrence of quoteChar in line, starting at fromCol.
function findUnescapedQuote(line: string, fromCol: number, quoteChar: string): number {
  for (let i = fromCol; i < line.length; i++) {
    if (line[i] === '\\') {
      i++; // skip escaped char
      continue;
    }
    if (line[i] === quoteChar)
      return i;
  }
  return -1;
}

// Scans forward from fromIndex until it hits the first unbalanced ")" (the closing paren of
// the execute_steps(...) call, or of a textwrap.dedent(...) wrapper). Returns the text in
// between so callers can detect string concatenation (+) or .format(...)/% suffixes, plus the
// index of the unbalanced ")" itself so callers can continue scanning past a wrapper's close.
function findCallTail(content: string, fromIndex: number): { text: string; endIndex: number } {
  let depth = 0;
  let i = fromIndex;
  for (; i < content.length; i++) {
    const c = content[i];
    if (c === '(') {
      depth++;
    } else if (c === ')') {
      if (depth === 0)
        break;
      depth--;
    }
  }
  return { text: content.slice(fromIndex, i), endIndex: i };
}

// Scans the physical lines making up one execute_steps() literal body (from bodyStartLine/
// colOpenEnd to bodyEndLine/colCloseStart) for embedded Given/When/Then/And/But/* steps.
// Replicates featureParser.ts's line-scan / And-But type-inheritance logic (not imported -
// the source shape differs: this operates on a bounded literal body, not a whole file).
function scanBody(
  lines: string[],
  bodyStartLine: number, colOpenEnd: number,
  bodyEndLine: number, colCloseStart: number,
  fileUri: vscode.Uri, fileName: string,
  hasFormatPlaceholders: boolean,
  callSteps: ExecuteStepsCallStep[],
  invalidLines: ExecuteStepsInvalidLine[],
): void {
  let lastStepType: string | undefined;
  let insideStepTextBlock = false;

  for (let lineIdx = bodyStartLine; lineIdx <= bodyEndLine; lineIdx++) {
    const lineFull = lines[lineIdx];
    const segStart = lineIdx === bodyStartLine ? colOpenEnd : 0;
    const segEnd = lineIdx === bodyEndLine ? colCloseStart : lineFull.length;
    if (segStart >= segEnd)
      continue;

    const segment = lineFull.substring(segStart, segEnd);
    const indentMatch = segment.match(/^\s*/);
    const indentSize = segStart + (indentMatch ? indentMatch[0].length : 0);
    const trimmed = segment.trim();

    if (trimmed === '' || trimmed.startsWith('#'))
      continue;

    const textBlockMatch = textBlockDelimiterRe.exec(trimmed);
    if (textBlockMatch) {
      insideStepTextBlock = !insideStepTextBlock;
      continue;
    }
    if (insideStepTextBlock)
      continue;

    const tableRowMatch = tableRowRe.exec(trimmed);
    if (tableRowMatch)
      continue;

    const step = executeStepsKeywordRe.exec(trimmed);
    if (step) {
      const text = step[0].trim();
      const textWithoutType = step[2].trim();
      let stepType = step[1].trim().toLowerCase();
      let isAmbiguousType = false;

      if (stepType === "and" || stepType === "but" || stepType === "*") {
        if (lastStepType === undefined) {
          // leading And/But/* with no prior step in this call - never an error, but the exact
          // bucket (given/when/then) can't be resolved here; leave stepType as the raw keyword
          // for the mapping funnel (Plan 02) to try given/when/then buckets in order.
          isAmbiguousType = true;
        } else {
          stepType = lastStepType;
        }
      } else {
        lastStepType = stepType;
      }

      const range = new vscode.Range(
        new vscode.Position(lineIdx, indentSize),
        new vscode.Position(lineIdx, indentSize + step[0].length),
      );
      const key = `${uriId(fileUri)}${sepr}${lineIdx}`;
      callSteps.push(new ExecuteStepsCallStep(key, fileUri, fileName, range, text, textWithoutType, stepType, isAmbiguousType, hasFormatPlaceholders));
      continue;
    }

    // Non-blank/non-comment/non-table/non-docstring line matching no keyword: invalid content
    // (would ParserError at runtime) - emit a record, never silently drop it, never treat as a
    // call step.
    const invalidRange = new vscode.Range(
      new vscode.Position(lineIdx, indentSize),
      new vscode.Position(lineIdx, indentSize + trimmed.length),
    );
    invalidLines.push(new ExecuteStepsInvalidLine(fileUri, invalidRange, trimmed));
  }
}

/**
 * Pure scanner: finds every `context.execute_steps("...")` call site in `content` and returns
 * the embedded Given/When/Then/And/But/* steps as ExecuteStepsCallStep records, plus any
 * non-recognisable content lines as ExecuteStepsInvalidLine records.
 *
 * Anything dynamic or unparseable (f-strings, b-prefix, non-literal args, `+` concatenation,
 * unterminated strings, `\n`-escaped single-line literals) is skipped SILENTLY - this is the
 * zero-false-positive guarantee the whole feature depends on. Never throws.
 */
export function scanExecuteSteps(content: string, fileUri: vscode.Uri): { callSteps: ExecuteStepsCallStep[]; invalidLines: ExecuteStepsInvalidLine[] } {
  const callSteps: ExecuteStepsCallStep[] = [];
  const invalidLines: ExecuteStepsInvalidLine[] = [];

  if (!content)
    return { callSteps, invalidLines };

  const fileName = basename(fileUri);
  const lines = getLines(content);
  const lineStarts = computeLineStarts(content);

  callSiteRe.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = callSiteRe.exec(content)) !== null) {
    // Skip likely commented-out call sites: a "#" anywhere between the start of the match's
    // physical line and the match itself. This heuristic can rarely false-SKIP (a "#" inside an
    // enclosing string on the same line), which is always safe under the skip-on-uncertainty
    // policy - whereas emitting a call step for commented-out code is a guaranteed false positive.
    const matchLineIdx = lineIndexFromOffset(lineStarts, match.index);
    const beforeMatch = content.slice(lineStarts[matchLineIdx], match.index);
    if (beforeMatch.includes('#'))
      continue; // likely commented-out call site: skip silently

    const prefix = match[1] ?? '';
    const delim = match[2];

    if (/[fb]/i.test(prefix))
      continue; // f-string / bytes literal: not a parseable static string, skip silently

    const isTriple = delim.length === 3;
    const openEndIndex = match.index + match[0].length;
    const openLineIdx = lineIndexFromOffset(lineStarts, openEndIndex);
    const colOpenEnd = openEndIndex - lineStarts[openLineIdx];

    let closeIndex: number;
    let bodyEndLine: number;
    let colCloseStart: number;

    if (isTriple) {
      closeIndex = content.indexOf(delim, openEndIndex);
      if (closeIndex === -1)
        continue; // unterminated triple-quoted literal: skip silently
      bodyEndLine = lineIndexFromOffset(lineStarts, closeIndex);
      colCloseStart = closeIndex - lineStarts[bodyEndLine];
    } else {
      // Single-line literal: must close on the SAME physical line (python single-quoted
      // strings can't span lines without a line-continuation backslash, which we don't support).
      const lineText = lines[openLineIdx];
      const closeCol = findUnescapedQuote(lineText, colOpenEnd, delim);
      if (closeCol === -1)
        continue; // unterminated single-line literal: skip silently

      bodyEndLine = openLineIdx;
      colCloseStart = closeCol;
      closeIndex = lineStarts[openLineIdx] + closeCol;
    }

    const afterDelimIndex = closeIndex + delim.length;
    // Advance the scan position past the consumed literal so the next iteration never re-matches
    // an "execute_steps(" occurrence INSIDE a literal body we already processed (CR-01).
    callSiteRe.lastIndex = afterDelimIndex;

    if (!isTriple) {
      const body = lines[openLineIdx].substring(colOpenEnd, colCloseStart);
      if (/\\n/.test(body))
        continue; // backslash-n escape inside a single-line literal: skip silently (ambiguous multi-step content)
    }

    const tailScan = findCallTail(content, afterDelimIndex);
    let tail = tailScan.text.trim();

    // When the literal is wrapped in textwrap.dedent(...), an empty tail only means we stopped
    // at dedent's own closing paren - the call's REAL tail (e.g. ".format(x)" or "+ x") sits
    // after that paren, so re-collect from one char past it (WR-01). A non-empty inner tail
    // (e.g. dedent('''...'''.format(x))) is already the correct tail and is used as-is.
    if (tail === '' && match[0].includes('dedent'))
      tail = findCallTail(content, tailScan.endIndex + 1).text.trim();

    // Whitelist of known-static tails: empty (plain literal), ".format(...)" or "% ..."
    // (formatting placeholders, surfaced downstream via hasFormatPlaceholders). ANY other
    // suffix - "+" concatenation, implicit adjacent-string concatenation, text-mutating
    // method calls (.replace/.join/.strip), stray extra arguments - means the runtime text
    // diverges from the literal we scanned, so skip silently (CR-02).
    const hasFormatPlaceholders = /^\.format\s*\(/.test(tail) || tail.startsWith('%');
    if (tail !== '' && !hasFormatPlaceholders)
      continue; // unrecognised suffix after the literal: dynamic content, skip silently

    scanBody(lines, openLineIdx, colOpenEnd, bodyEndLine, colCloseStart, fileUri, fileName, hasFormatPlaceholders, callSteps, invalidLines);
  }

  return { callSteps, invalidLines };
}

/**
 * Cached wrapper around scanExecuteSteps(): clears any existing call-step records for fileUri,
 * rescans content, and stores the results keyed by featuresUri + fileUri + line number so
 * multiple .py files can coexist under one featuresUri.
 */
export function parseExecuteStepsFileContent(featuresUri: vscode.Uri, content: string, fileUri: vscode.Uri, caller: string): number {
  const fileUriMatchString = uriId(fileUri);

  // clear all existing execute_steps call steps for this file uri
  for (const [key, callStep] of executeStepsCallSteps) {
    if (uriId(callStep.uri) === fileUriMatchString)
      executeStepsCallSteps.delete(key);
  }

  const { callSteps } = scanExecuteSteps(content, fileUri);
  for (const callStep of callSteps) {
    const key = `${uriId(featuresUri)}${sepr}${uriId(fileUri)}${sepr}${callStep.range.start.line}`;
    executeStepsCallSteps.set(key, callStep);
  }

  diagLog(`${caller}: parsed ${callSteps.length} execute_steps call sites from ${fileUri.path}`);
  return callSteps.length;
}

export function getExecuteStepsCallSteps(featuresUri: vscode.Uri): ExecuteStepsCallStep[] {
  const featuresUriMatchString = uriId(featuresUri);
  return [...executeStepsCallSteps]
    .filter(([k,]) => k.startsWith(featuresUriMatchString))
    .map(([, v]) => v);
}

export function deleteExecuteStepsCallSteps(featuresUri: vscode.Uri): void {
  const featuresUriMatchString = uriId(featuresUri);
  for (const [key,] of executeStepsCallSteps) {
    if (key.startsWith(featuresUriMatchString))
      executeStepsCallSteps.delete(key);
  }
}

export function getExecuteStepsCallStepAtLine(fileUri: vscode.Uri, lineNo: number): ExecuteStepsCallStep | undefined {
  const fileUriMatchString = uriId(fileUri);
  for (const callStep of executeStepsCallSteps.values()) {
    if (uriId(callStep.uri) === fileUriMatchString && callStep.range.start.line === lineNo)
      return callStep;
  }
  return undefined;
}
