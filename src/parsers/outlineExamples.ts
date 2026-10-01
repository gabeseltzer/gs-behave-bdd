/**
 * Scenario Outline expansion for checks that need the concrete step text behave will match.
 *
 * behave builds each example's steps by plain text replacement of every `<placeholder>` with
 * the row's cell for that column (behave/model.py ScenarioOutlineBuilder), before matching.
 * To check those texts - and point a diagnostic at the Examples cell responsible - this maps
 * each outline step line to its Examples rows, with every cell's position.
 */

import {
  backgroundRe, examplesRe, featureFileStepRe, featureRe, ruleRe, scenarioOutlineRe, scenarioRe,
  tableRowRe, textBlockDelimiterRe
} from './gherkinPatterns';


export interface ExampleCell {
  value: string;
  line: number;
  /** column of the trimmed cell text within its line */
  start: number;
  end: number;
}

export interface ExampleRow {
  line: number;
  /** by column heading */
  cells: Map<string, ExampleCell>;
}

/** Outline step line -> the Examples rows its placeholders are filled from. */
export function getOutlineExampleRows(lines: string[]): Map<number, ExampleRow[]> {
  const result = new Map<number, ExampleRow[]>();

  let outlineSteps: number[] | undefined;
  let outlineRows: ExampleRow[] = [];
  let inExamples = false;
  let headings: ExampleCell[] | undefined;
  let textBlockDelimiter: string | undefined;

  const finishOutline = () => {
    if (outlineSteps && outlineRows.length > 0) {
      for (const stepLine of outlineSteps)
        result.set(stepLine, outlineRows);
    }
    outlineSteps = undefined;
    outlineRows = [];
    inExamples = false;
    headings = undefined;
  };

  for (let lineNo = 0; lineNo < lines.length; lineNo++) {
    const line = lines[lineNo];
    const trimmed = line.trim();

    if (textBlockDelimiter !== undefined) {
      if (trimmed === textBlockDelimiter)
        textBlockDelimiter = undefined;
      continue;
    }
    const delimiter = textBlockDelimiterRe.exec(line);
    if (delimiter) {
      textBlockDelimiter = delimiter[1];
      continue;
    }

    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("@"))
      continue;

    if (scenarioOutlineRe.test(line)) {
      finishOutline();
      outlineSteps = [];
      continue;
    }
    if (scenarioRe.test(line) || backgroundRe.test(line) || ruleRe.test(line) || featureRe.test(line)) {
      finishOutline();
      continue;
    }
    if (!outlineSteps)
      continue;

    if (examplesRe.test(line)) {
      inExamples = true;
      headings = undefined;
      continue;
    }

    if (tableRowRe.test(line)) {
      if (!inExamples)
        continue; // a step's data table
      const cells = splitTableRow(line, lineNo);
      if (!headings) {
        headings = cells;
        continue;
      }
      const row: ExampleRow = { line: lineNo, cells: new Map() };
      headings.forEach((heading, i) => {
        if (cells[i])
          row.cells.set(heading.value, cells[i]);
      });
      outlineRows.push(row);
      continue;
    }

    if (!inExamples && featureFileStepRe.test(line))
      outlineSteps.push(lineNo);
  }

  finishOutline();
  return result;
}


/** Splits a `| a | b |` row on unescaped pipes, unescaping `\|`, `\\` and `\n` like gherkin. */
export function splitTableRow(line: string, lineNo: number): ExampleCell[] {
  const cells: ExampleCell[] = [];
  const first = line.indexOf("|");
  if (first === -1)
    return cells;

  let raw = "";
  let rawStart = first + 1;
  for (let i = first + 1; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\" && i + 1 < line.length) {
      raw += ch + line[i + 1];
      i++;
      continue;
    }
    if (ch === "|") {
      cells.push(makeCell(raw, rawStart, lineNo));
      raw = "";
      rawStart = i + 1;
      continue;
    }
    raw += ch;
  }
  // text after the last pipe isn't a cell
  return cells;
}

function makeCell(raw: string, rawStart: number, lineNo: number): ExampleCell {
  const leading = raw.length - raw.trimStart().length;
  const trimmed = raw.trim();
  const value = trimmed.replace(/\\(.)/g, (_, ch: string) => ch === "n" ? "\n" : ch);
  return { value, line: lineNo, start: rawStart + leading, end: rawStart + leading + trimmed.length };
}


/** A stretch of a substituted step text, and where it came from. */
export interface SubstitutionPiece {
  /** offsets in the substituted text */
  start: number;
  end: number;
  /** offset of this piece in the original step text */
  originalStart: number;
  /** set when the piece is a placeholder's value */
  cell?: ExampleCell;
  placeholder?: string;
}

export interface SubstitutedStep {
  text: string;
  pieces: SubstitutionPiece[];
  /** a `<name>` the row has no column for was left in the text */
  unresolved: boolean;
}

/** Fills a step's placeholders from one Examples row, the way behave does. */
export function substitutePlaceholders(stepText: string, row: ExampleRow): SubstitutedStep {
  const pieces: SubstitutionPiece[] = [];
  let text = "";
  let unresolved = false;
  let last = 0;
  const re = /<([^<>]+)>/g;
  let match: RegExpExecArray | null;

  const addLiteral = (from: number, to: number) => {
    if (to <= from)
      return;
    pieces.push({ start: text.length, end: text.length + (to - from), originalStart: from });
    text += stepText.slice(from, to);
  };

  while ((match = re.exec(stepText)) !== null) {
    const cell = row.cells.get(match[1]);
    if (!cell) {
      unresolved = true;
      continue;
    }
    addLiteral(last, match.index);
    pieces.push({ start: text.length, end: text.length + cell.value.length, originalStart: match.index, cell, placeholder: match[1] });
    text += cell.value;
    last = match.index + match[0].length;
  }
  addLiteral(last, stepText.length);
  return { text, pieces, unresolved };
}
