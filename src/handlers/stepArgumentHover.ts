import * as vscode from "vscode";
import { getLines } from "../common";
import { getFeatureFileSteps } from "../parsers/featureParser";
import { getOutlineExampleRows, substitutePlaceholders } from "../parsers/outlineExamples";
import { getPythonStepCheck } from "../parsers/stepArgumentPythonCheck";
import { checkStepArguments } from "../parsers/stepArgumentStore";
import { describeParameterType, parameterLabel } from "../parsers/stepArguments";
import { WorkspaceSettings } from "../settings";
import { getStepInstances } from "./stepArgumentDiagnostics";


/**
 * Hover for an argument in a feature file step: the parameter it fills, what that parameter's
 * type accepts, and - when behave has checked the step - the value behave converts it to.
 */
export function getStepArgumentHover(document: vscode.TextDocument, position: vscode.Position,
  wkspSettings: WorkspaceSettings): { content: vscode.MarkdownString; range: vscode.Range } | undefined {

  const step = wkspSettings.featuresUris.flatMap(u => getFeatureFileSteps(u))
    .map(([, s]) => s)
    .find(s => s.uri.toString() === document.uri.toString() && s.range.start.line === position.line);
  if (!step)
    return undefined;

  const lines = getLines(document.getText());
  const [instance] = getStepInstances(step, lines, new Map());
  if (!instance)
    return undefined;

  const check = checkStepArguments(wkspSettings.featuresUri, step.stepType, instance.text);
  if (check?.status !== "matched" && check?.status !== "mismatch")
    return undefined;

  const offset = position.character - instance.textColumn;
  const arg = check.arguments.find(a => a.start <= offset && offset <= a.end && a.end > a.start);
  if (!arg)
    return undefined;

  const definition = check.definition;
  const segment = arg.segment.repeatOf !== undefined
    ? definition.segments[arg.segment.repeatOf]?.segment ?? arg.segment
    : arg.segment;

  const content = new vscode.MarkdownString();
  content.appendMarkdown(`**Argument** for parameter \`${parameterLabel(arg.segment, definition)}\` — ${describeParameterType(segment)}`);

  const placeholder = /^<([^<>]+)>$/.exec(arg.text);
  const isOutlineStep = getOutlineExampleRows(lines).has(step.range.start.line);
  if (placeholder && isOutlineStep) {
    content.appendMarkdown(`\n\nFilled from the Examples column \`<${placeholder[1]}>\``);
  }
  else if (check.status === "matched") {
    const python = getPythonStepCheck(wkspSettings.featuresUri, step.stepType, instance.text);
    const checked = python?.result.arguments?.find(a => a.segment === arg.segmentIndex);
    if (checked?.value !== undefined)
      content.appendMarkdown(`\n\nbehave converts \`${arg.text}\` to \`${checked.value}\` (\`${checked.valueType ?? "?"}\`)`);
  }

  const line = step.range.start.line;
  const range = new vscode.Range(line, instance.textColumn + arg.start, line, instance.textColumn + arg.end);
  return { content, range };
}


/**
 * Hover for a cell in a Scenario Outline's Examples table: for each step its column fills, the
 * parameter the value lands in, what that parameter accepts, and - when behave has checked the
 * example - the value behave converts it to.
 */
export function getExamplesCellHover(document: vscode.TextDocument, position: vscode.Position,
  wkspSettings: WorkspaceSettings): { content: vscode.MarkdownString; range: vscode.Range } | undefined {

  const lines = getLines(document.getText());
  const outlineRows = getOutlineExampleRows(lines);

  let heading: string | undefined;
  let cellRange: vscode.Range | undefined;
  const stepLines: number[] = [];
  for (const [stepLine, rows] of outlineRows) {
    for (const row of rows) {
      if (row.line !== position.line)
        continue;
      for (const [name, cell] of row.cells) {
        if (cell.start <= position.character && position.character <= cell.end) {
          heading = name;
          cellRange = new vscode.Range(cell.line, cell.start, cell.line, cell.end);
        }
      }
      stepLines.push(stepLine);
    }
  }
  if (heading === undefined || !cellRange)
    return undefined;

  const steps = wkspSettings.featuresUris.flatMap(u => getFeatureFileSteps(u))
    .map(([, s]) => s)
    .filter(s => s.uri.toString() === document.uri.toString() && stepLines.includes(s.range.start.line));

  const notes: string[] = [];
  for (const step of steps) {
    const row = outlineRows.get(step.range.start.line)?.find(r => r.line === position.line);
    if (!row)
      continue;
    const substituted = substitutePlaceholders(step.textWithoutType, row);
    if (substituted.unresolved)
      continue;
    const check = checkStepArguments(wkspSettings.featuresUri, step.stepType, substituted.text);
    if (check?.status !== "matched" && check?.status !== "mismatch")
      continue;

    for (const piece of substituted.pieces.filter(p => p.placeholder === heading)) {
      const arg = check.arguments.find(a => piece.start === piece.end
        ? a.start <= piece.start && piece.start <= a.end
        : a.start < piece.end && piece.start < a.end);
      if (!arg)
        continue;
      const segment = arg.segment.repeatOf !== undefined
        ? check.definition.segments[arg.segment.repeatOf]?.segment ?? arg.segment
        : arg.segment;
      let note = `Fills \`${parameterLabel(arg.segment, check.definition)}\` in *${escapeMarkdown(step.textWithoutType)}* — ${describeParameterType(segment)}`;
      if (check.status === "matched") {
        const python = getPythonStepCheck(wkspSettings.featuresUri, step.stepType, substituted.text);
        const checked = python?.result.arguments?.find(a => a.segment === arg.segmentIndex);
        if (checked?.value !== undefined)
          note += `. behave converts \`${arg.text}\` to \`${checked.value}\` (\`${checked.valueType ?? "?"}\`)`;
      }
      notes.push(note);
    }
  }
  if (notes.length === 0)
    return undefined;

  const content = new vscode.MarkdownString();
  content.appendMarkdown(`**Examples column** \`<${heading}>\`\n\n`);
  content.appendMarkdown(notes.map(n => `- ${n}`).join("\n"));
  return { content, range: cellRange };
}

function escapeMarkdown(text: string) {
  return text.replace(/[\\`*_{}[\]()#+\-.!<>|]/g, "\\$&");
}
