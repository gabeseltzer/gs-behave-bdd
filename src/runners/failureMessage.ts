// Builds the TestMessage shown against a failed or errored scenario.
//
// Shared by both result paths on purpose. behave's junit reporter writes a
// "Failing step: <step> ... <status>" line followed by the exception text
// (reporter/junit.py:506-527), and the event stream carries the same facts as
// separate fields - so wording them in one place is what keeps a failure looking
// the same whether it was resolved live or reconciled from junit afterwards.

import * as vscode from 'vscode';


/** A comparison worth rendering as a diff, when the failure text states one. */
interface Comparison {
  expected: string;
  actual: string;
}


// Only SELF-LABELLING comparisons are recognised. A bare Python assert carries no
// comparison at all - `assert x == "y"` reaches us as type="AssertionError" with an
// empty message - and unittest's "a != b" does not say which side is expected, so
// guessing would show a confidently reversed diff. No diff is better than a wrong one.
const EXPECTED_BUT_GOT = /expected[:\s]+(.+?)[,;]?\s+(?:but\s+)?(?:got|was|received|actual)[:\s]+(.+?)\s*$/is;
const EXPECTED_LINE = /^[ \t]*expected[ \t]*:[ \t]*(.*)$/im;
const ACTUAL_LINE = /^[ \t]*actual[ \t]*:[ \t]*(.*)$/im;


/** Pull out an expected/actual pair when the text names both sides explicitly. */
export function findComparison(text: string): Comparison | undefined {
  const expectedLine = EXPECTED_LINE.exec(text);
  const actualLine = ACTUAL_LINE.exec(text);
  if (expectedLine && actualLine)
    return { expected: expectedLine[1].trim(), actual: actualLine[1].trim() };

  const inline = EXPECTED_BUT_GOT.exec(text);
  if (inline)
    return { expected: inline[1].trim(), actual: inline[2].trim() };

  return undefined;
}


/**
 * Word a failure the way behave's junit reporter does, so the two result paths
 * agree: a summary line naming the step that failed, then the exception text.
 */
export function failureText(step: { keyword?: string | null, name?: string | null, status?: string | null } | undefined,
  error: string | undefined, fallbackStatus: string): string {

  const parts: string[] = [];

  if (step?.name) {
    const keyword = step.keyword ? `${step.keyword.trim()} ` : "";
    const status = step.status?.trim() || fallbackStatus;
    parts.push(`Failing step: ${keyword}${step.name.trim()} ... ${status}`);
  }

  const trimmedError = error?.trim();
  if (trimmedError)
    parts.push(trimmedError);

  // Something must be shown, or the peek view is blank. behave's own wording for
  // a step with no exception text is just the status.
  return parts.length > 0 ? parts.join("\n") : fallbackStatus;
}


/**
 * A TestMessage carrying failure text, a location, and a diff where one is stated.
 *
 * The body is fenced rather than passed as a plain string: TestMessage renders a
 * MarkdownString as markdown, which would reflow a traceback's indentation and
 * eat any `*` or `_` in an assertion value. Fencing keeps it monospaced and
 * literal while still allowing the summary line to be emphasised.
 */
export function buildFailureMessage(text: string, location?: vscode.Location): vscode.TestMessage {

  const lines = text.split("\n");
  const summary = lines[0];
  const body = lines.slice(1).join("\n").trim();

  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${escapeMarkdown(summary)}**`);
  if (body)
    md.appendMarkdown(`\n\n${fence(body)}`);

  const message = new vscode.TestMessage(md);
  if (location)
    message.location = location;

  const comparison = findComparison(text);
  if (comparison) {
    message.expectedOutput = comparison.expected;
    message.actualOutput = comparison.actual;
  }

  return message;
}


function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}[\]()#+\-.!|>~])/g, "\\$1");
}


/**
 * Fence a block, widening the fence past any backtick run inside it so an error
 * message that itself contains ``` cannot close the block early.
 */
function fence(body: string): string {
  let longest = 0;
  for (const run of body.match(/`+/g) ?? [])
    longest = Math.max(longest, run.length);
  const ticks = "`".repeat(Math.max(3, longest + 1));
  return `${ticks}\n${body}\n${ticks}`;
}
