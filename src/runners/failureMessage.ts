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


/**
 * One step as it ran, for the trail shown with a failure.
 *
 * Deliberately a plain shape rather than the stream's BehaveEvent: this module is
 * shared with the junit path, and importing the event type here would tie the one
 * place that words a failure to the one source that happens to have step events.
 */
export interface TrailStep {
  keyword?: string | null;
  name?: string | null;
  status?: string | null;
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
export function failureText(step: TrailStep | undefined,
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
 * Render the steps a scenario ran, with their statuses aligned.
 *
 * A scenario is a sequence of steps, which is the structure an xUnit assertion
 * does not have - so this is what the message surface can say that the bare
 * "Failing step: ..." line cannot: what ran, what broke, and what never got the
 * chance. Laid out the way behave's own pretty output aligns them.
 *
 * Returns undefined when there is nothing worth drawing, so a caller with no
 * trail (the junit path) renders exactly what it rendered before.
 */
export function formatStepTrail(trail: readonly TrailStep[]): string | undefined {

  const rows = trail
    .map(step => ({
      keyword: (step.keyword ?? "").trim(),
      name: (step.name ?? "").trim(),
      status: (step.status ?? "").trim(),
    }))
    .filter(row => row.keyword !== "" || row.name !== "");

  if (rows.length === 0)
    return undefined;

  const keywordWidth = Math.max(...rows.map(r => r.keyword.length));
  const labels = rows.map(r => (r.keyword === "" ? r.name : `${r.keyword.padEnd(keywordWidth)} ${r.name}`).trimEnd());
  const labelWidth = Math.max(...labels.map(l => l.length));

  return labels
    .map((label, i) => rows[i].status === "" ? label : `${label.padEnd(labelWidth)} ... ${rows[i].status}`)
    .join("\n");
}


/**
 * A TestMessage carrying failure text, a location, and a diff where one is stated.
 *
 * The body is fenced rather than passed as a plain string: TestMessage renders a
 * MarkdownString as markdown, which would reflow a traceback's indentation and
 * eat any `*` or `_` in an assertion value. Fencing keeps it monospaced and
 * literal while still allowing the summary line to be emphasised.
 *
 * @param trail the steps this scenario ran, where the caller has them. Only the
 * event stream does - behave's junit XML has no per-step record (its testcase
 * carries classname/name/status/time and nothing else, reporter/junit.py:440-444)
 * - so this is optional by necessity, and omitting it reproduces the previous
 * message exactly rather than a degraded version of a new one.
 */
export function buildFailureMessage(text: string, location?: vscode.Location,
  trail?: readonly TrailStep[]): vscode.TestMessage {

  const lines = text.split("\n");
  const summary = lines[0];
  const body = lines.slice(1).join("\n").trim();

  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${escapeMarkdown(summary)}**`);

  // Between the summary and the exception: the trail is context for the error,
  // so it reads before it rather than after it.
  const trailText = trail ? formatStepTrail(trail) : undefined;
  if (trailText)
    md.appendMarkdown(`\n\n${fence(trailText)}`);

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


/**
 * Escape markdown punctuation in the summary line.
 *
 * "<" is in the set for Gherkin's sake: outline names carry <param> placeholders,
 * and a raw "<" is the one character here that can start something a renderer treats
 * as markup rather than as text.
 */
function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}[\]()#+\-.!|<>~])/g, "\\$1");
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
