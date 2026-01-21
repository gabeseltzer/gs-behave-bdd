// Shared Gherkin regex patterns and parsing utilities

export const featureRe = /^\s*Feature:(.*)$/i;
export const featureMultiLineRe = /^\s*Feature:(.*)$/im;
export const backgroundRe = /^\s*Background:(.*)$/i;
export const scenarioRe = /^\s*(Scenario|Scenario Outline|Scenario Template):(.*)$/i;
export const scenarioOutlineRe = /^\s*(Scenario Outline|Scenario Template):(.*)$/i;
export const examplesRe = /^\s*Examples:(.*)$/i;
export const ruleRe = /^\s*Rule:(.*)$/i;
export const stepRe = /^\s*(Given|When|Then|And|But|\*)(.*)$/i;
export const featureFileStepRe = /^\s*(Given |When |Then |And |But )(.*)/i;
export const tagRe = /^\s*@(\S+)/;

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
