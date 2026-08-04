// Shared Gherkin regex patterns and parsing utilities

export const featureRe = /^\s*Feature:(.*)$/i;
export const featureMultiLineRe = /^\s*Feature:(.*)$/im;
export const backgroundRe = /^\s*Background:(.*)$/i;
export const scenarioRe = /^\s*(Scenario|Scenario Outline|Scenario Template):(.*)$/i;
export const scenarioOutlineRe = /^\s*(Scenario Outline|Scenario Template):(.*)$/i;
export const examplesRe = /^\s*(Examples|Scenarios):(.*)$/i;
export const ruleRe = /^\s*Rule:(.*)$/i;
export const stepRe = /^\s*(Given|When|Then|And|But|\*)(.*)$/i;
// Leading step keywords. `* ` is behave's generic bullet keyword (valid for any step
// type — it inherits the previous step's type, defaulting to "given" as the first step).
export const featureFileStepRe = /^\s*(Given |When |Then |And |But |\* )(.*)/i;
export const tagRe = /^\s*@(\S+)/;

// Keyword pattern for embedded execute_steps() call-site scanning.
// Unlike featureFileStepRe, this also recognises a leading "*" (behave's
// generic step keyword), which can appear inside an execute_steps() literal.
export const executeStepsKeywordRe = /^(Given|When|Then|And|But|\*)\s+(.*)/i;

// Patterns for text block and table detection
export const textBlockDelimiterRe = /^\s*("""|''')\s*$/;
export const tableRowRe = /^\s*\|/;

export interface ParamSpan {
    start: number;
    length: number;
}

// RegExpExecArray.indices needs lib ES2022; we target ES2021, so describe just the part
// we use rather than widening the lib for the whole project.
type ExecArrayWithIndices = RegExpExecArray & {
    indices?: (readonly [number, number] | undefined)[];
};

/**
 * Locates the parameter spans that a step definition's wildcards matched within `text`.
 *
 * `groupedRe` is the step's regex source with each wildcard wrapped in a capture group,
 * and `keywordRe` is the leading-keyword pattern for the flavour of text being scanned
 * (`featureFileStepRe` for feature file lines, `executeStepsKeywordRe` for execute_steps
 * call sites) — both expose the text following the keyword as group 2.
 *
 * Note: this deliberately uses the match's own capture group offsets (via the `d` flag)
 * rather than searching the line for the captured text. A parameter value frequently
 * occurs elsewhere on the line — `'en'` occurs inside the keyword `Then`, so an
 * indexOf() would report a position inside the keyword and paint the wrong characters.
 */
export function getStepParamSpans(text: string, groupedRe: string, keywordRe: RegExp): ParamSpan[] {

    const match = new RegExp(groupedRe, "d").exec(text) as ExecArrayWithIndices | null;
    if (!match || !match.indices || match.length < 2)
        return [];

    // an unanchored leading wildcard swallows the step keyword, which is not a parameter
    const keywordMatch = keywordRe.exec(text);
    const keywordEnd = keywordMatch ? keywordMatch[0].length - keywordMatch[2].length : 0;

    const spans: ParamSpan[] = [];

    for (let group = 1; group < match.indices.length; group++) {
        const indices = match.indices[group];
        if (!indices)
            continue;

        let [start, end] = indices;
        if (start < keywordEnd)
            start = keywordEnd;

        // a greedy wildcard can pick up the whitespace either side of the value
        while (start < end && /\s/.test(text[start]))
            start++;
        while (end > start && /\s/.test(text[end - 1]))
            end--;

        if (end > start)
            spans.push({ start, length: end - start });
    }

    return spans;
}

/**
 * Scans backwards from a line to find where a symbol's range should start,
 * including any preceding tags (@) or comments (#) that belong to it.
 * Stops at empty lines or other content.
 */
export function getSymbolStartLine(lines: string[], lineNo: number): number {
    let startLine = lineNo;
    for (let i = lineNo - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith("@")) {
            // Tags belong to this symbol
            startLine = i;
        } else if (line.startsWith("#")) {
            // Comments directly above tags or keywords usually belong to them
            startLine = i;
        } else if (line === "") {
            // Empty line breaks the attachment
            break;
        } else {
            // Something else (e.g. previous step)
            break;
        }
    }
    return startLine;
}
