import * as vscode from "vscode";
import { getLines } from "../common";
import { getFeatureFileSteps } from "../parsers/featureParser";
import { getOutlineExampleRows } from "../parsers/outlineExamples";
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
