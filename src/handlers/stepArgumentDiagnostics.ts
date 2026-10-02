import * as vscode from "vscode";
import { config } from "../configuration";
import { getFeatureFileSteps, FeatureFileStep } from "../parsers/featureParser";
import { getLines } from "../common";
import { featureFileStepRe, getStepTextColumn } from "../parsers/gherkinPatterns";
import { getOutlineExampleRows, substitutePlaceholders, SubstitutedStep } from "../parsers/outlineExamples";
import type { StepCheckRequest, StepCheckResult } from "../parsers/behaveLoader";
import { checkStepArguments, hasArgumentCheckDefinitions } from "../parsers/stepArgumentStore";
import { getPythonStepCheck, requestPythonStepChecks } from "../parsers/stepArgumentPythonCheck";
import {
  CompiledDefinition, describeParameterType, LocatedArgument, parameterLabel, StepArgumentCheck
} from "../parsers/stepArguments";
import { WorkspaceSettings } from "../settings";


// behave reports the step undefined: its text loosely fits a definition, but an argument
// doesn't satisfy the parameter's type
export const STEP_ARGUMENT_MISMATCH = "step-argument-mismatch";
// behave matches the step, but the parameter's type converter raises: the step errors
export const STEP_ARGUMENT_CONVERSION_ERROR = "step-argument-conversion-error";

const STEP_ARGUMENT_CODES = new Set<unknown>([STEP_ARGUMENT_MISMATCH, STEP_ARGUMENT_CONVERSION_ERROR]);


/** A step as written in a document: a feature file step, or a step in an execute_steps() call. */
export interface ArgumentStep {
  range: vscode.Range;
  textWithoutType: string;
  stepType: string;
}

/** A concrete step text behave will match, and how to map offsets in it back to the document. */
export interface StepInstance {
  step: ArgumentStep;
  text: string;
  /** document column where the step's text (after the keyword) starts */
  textColumn: number;
  /** set when the text came from a Scenario Outline row */
  substituted?: SubstitutedStep;
}


/**
 * Flags arguments in a feature file that behave won't accept for their step definition's
 * parameter types - including custom types registered with register_type. Called alongside
 * validateStepDefinitions, so it runs on the same triggers.
 */
export function validateStepArguments(document: vscode.TextDocument, wkspSettings: WorkspaceSettings): void {
  const existing = config.diagnostics.get(document.uri) || [];
  const others = [...existing].filter(d => !isStepArgumentDiagnostic(d));

  // nothing to check against until behave has described the workspace's step definitions
  if (!hasArgumentCheckDefinitions(wkspSettings.featuresUri)) {
    if (others.length !== existing.length)
      config.diagnostics.set(document.uri, others);
    return;
  }

  const lines = getLines(document.getText());
  const outlineRows = getOutlineExampleRows(lines);
  const instances = wkspSettings.featuresUris.flatMap(u => getFeatureFileSteps(u))
    .filter(([, s]) => s.uri.toString() === document.uri.toString())
    .flatMap(([, step]) => getStepInstances(step, lines, outlineRows));

  config.diagnostics.set(document.uri, [...others, ...diagnoseStepArguments(document, wkspSettings, instances)]);
}

/**
 * Argument diagnostics for concrete step instances in one document - shared by feature files
 * and execute_steps() call sites. Queues the steps only behave can decide for its Python check
 * (released once the document is saved).
 */
export function diagnoseStepArguments(document: vscode.TextDocument, wkspSettings: WorkspaceSettings,
  instances: StepInstance[]): vscode.Diagnostic[] {

  const diagnostics: vscode.Diagnostic[] = [];
  const pythonRequests: StepCheckRequest[] = [];
  const seen = new Set<string>();

  for (const instance of instances) {
    const check = checkStepArguments(wkspSettings.featuresUri, instance.step.stepType, instance.text);
    if (!check)
      continue;
    for (const diagnostic of diagnoseInstance(wkspSettings, instance, check, pythonRequests)) {
      // an outline cell feeding several rows/steps would otherwise repeat the same diagnostic
      const key = `${diagnostic.range.start.line}:${diagnostic.range.start.character}:${diagnostic.message}`;
      if (seen.has(key))
        continue;
      seen.add(key);
      diagnostics.push(diagnostic);
    }
  }

  if (wkspSettings.checkStepArgumentsWithPython && pythonRequests.length > 0)
    requestPythonStepChecks(wkspSettings, pythonRequests, !document.isDirty);
  return diagnostics;
}

export function isStepArgumentDiagnostic(diagnostic: vscode.Diagnostic) {
  return STEP_ARGUMENT_CODES.has(diagnostic.code);
}


export function getStepInstances(step: FeatureFileStep, lines: string[],
  outlineRows: ReturnType<typeof getOutlineExampleRows>): StepInstance[] {

  const lineNo = step.range.start.line;
  const textColumn = getStepTextColumn(lines[lineNo] ?? "", step.textWithoutType, featureFileStepRe);
  if (textColumn === undefined)
    return [];

  const rows = outlineRows.get(lineNo);
  if (!rows)
    return [{ step, text: step.textWithoutType, textColumn }];

  // an outline step is matched once per example, with its placeholders filled in
  const instances: StepInstance[] = [];
  for (const row of rows) {
    const substituted = substitutePlaceholders(step.textWithoutType, row);
    if (!substituted.unresolved)
      instances.push({ step, text: substituted.text, textColumn, substituted });
  }
  return instances;
}

function diagnoseInstance(wkspSettings: WorkspaceSettings, instance: StepInstance, check: StepArgumentCheck,
  pythonRequests: StepCheckRequest[]): vscode.Diagnostic[] {

  const { step, text } = instance;

  if (check.status === "mismatch")
    return mismatchDiagnostics(instance, check.definition, check.badArguments, check.arguments);

  const needsPython = check.status === "undetermined"
    || (check.status === "matched" && check.definition.needsPython);
  if (!needsPython || !wkspSettings.checkStepArgumentsWithPython)
    return [];

  const python = getPythonStepCheck(wkspSettings.featuresUri, step.stepType, text);
  if (!python) {
    pythonRequests.push({ stepType: step.stepType, text });
    return [];
  }

  const { result, incomplete } = python;
  if (result.status === "error")
    return conversionErrorDiagnostics(instance, result, check.status === "matched" ? check.definition : undefined);
  // only trust behave's "undefined" when every step file loaded - otherwise the definition
  // may just live in a file that failed
  if (result.status === "undefined" && check.status === "undetermined" && !incomplete) {
    return [makeDiagnostic(instance, 0, text.length,
      `No step definition matches this step's arguments (checked with behave). behave will report this step as undefined.`,
      STEP_ARGUMENT_MISMATCH)];
  }
  return [];
}


function mismatchDiagnostics(instance: StepInstance, definition: CompiledDefinition, badArguments: LocatedArgument[],
  allArguments: LocatedArgument[]): vscode.Diagnostic[] {

  const related = definitionLocation(definition);
  const consequence = "behave will report this step as undefined.";

  const located = badArguments.filter(a => a.end > a.start);
  if (located.length === 0) {
    return [withRelated(makeDiagnostic(instance, 0, instance.text.length,
      `No step definition matches this step's arguments - the closest is "${definition.definition.pattern}". ${consequence}`,
      STEP_ARGUMENT_MISMATCH), related)];
  }

  return located.map(arg => {
    const label = parameterLabel(arg.segment, definition);
    let message: string;
    if (arg.segment.repeatOf !== undefined) {
      const first = allArguments.find(a => a.segmentIndex === arg.segment.repeatOf);
      message = `"${arg.text}" must be the same as the earlier ${label} argument ("${first?.text ?? ""}"). ${consequence}`;
    }
    else {
      message = `"${arg.text}" doesn't match ${label}, which expects ${describeParameterType(arg.segment)}. ${consequence}`;
    }
    return withRelated(makeDiagnostic(instance, arg.start, arg.end, message, STEP_ARGUMENT_MISMATCH), related);
  });
}


function conversionErrorDiagnostics(instance: StepInstance, result: StepCheckResult,
  definition: CompiledDefinition | undefined): vscode.Diagnostic[] {

  const consequence = "behave will fail this step with an error.";
  const related = result.filePath && result.lineNumber
    ? new vscode.Location(vscode.Uri.file(result.filePath), new vscode.Position(Math.max(0, result.lineNumber - 1), 0))
    : undefined;

  const failed = (result.arguments ?? []).filter(a => a.error && a.end > a.start);
  if (failed.length === 0) {
    return [withRelated(makeDiagnostic(instance, 0, instance.text.length,
      `A step argument can't be converted: ${result.error ?? "unknown error"}. ${consequence}`,
      STEP_ARGUMENT_CONVERSION_ERROR), related)];
  }

  return failed.map(arg => {
    const segment = definition?.definition.paramCheck?.segments?.[arg.segment];
    const label = segment ? ` by ${parameterLabel(segment, definition)}` : "";
    return withRelated(makeDiagnostic(instance, arg.start, arg.end,
      `"${arg.original}" can't be converted${label}: ${arg.error}. ${consequence}`,
      STEP_ARGUMENT_CONVERSION_ERROR), related);
  });
}


/**
 * A diagnostic for [start, end) of the instance's text. For an outline example, a span that
 * came from a placeholder is reported on the Examples cell that supplied it.
 */
function makeDiagnostic(instance: StepInstance, start: number, end: number, message: string, code: string) {
  const range = mapSpan(instance, start, end);
  const diagnostic = new vscode.Diagnostic(range.range, message + range.suffix, vscode.DiagnosticSeverity.Error);
  diagnostic.code = code;
  diagnostic.source = "gs-behave-bdd";
  return diagnostic;
}

function mapSpan(instance: StepInstance, start: number, end: number): { range: vscode.Range; suffix: string } {
  const line = instance.step.range.start.line;
  const wholeStep = new vscode.Range(line, instance.textColumn, line, instance.textColumn + instance.step.textWithoutType.length);
  const substituted = instance.substituted;
  if (!substituted)
    return { range: new vscode.Range(line, instance.textColumn + start, line, instance.textColumn + end), suffix: "" };

  const overlapping = substituted.pieces.filter(p => p.start < Math.max(end, start + 1) && p.end > start);
  const fromCell = overlapping.find(p => p.cell);
  if (fromCell?.cell) {
    const cell = fromCell.cell;
    return {
      range: new vscode.Range(cell.line, cell.start, cell.line, Math.max(cell.end, cell.start + 1)),
      suffix: ` (Examples column <${fromCell.placeholder}>, used by "${instance.step.textWithoutType}")`,
    };
  }
  if (overlapping.length === 1 && start === 0 && end === substituted.text.length)
    return { range: wholeStep, suffix: "" };
  // entirely within the outline step's literal text: same offsets as in the document
  const piece = overlapping[0];
  if (piece && end <= piece.end) {
    const docStart = instance.textColumn + piece.originalStart + (start - piece.start);
    return { range: new vscode.Range(line, docStart, line, docStart + (end - start)), suffix: "" };
  }
  return { range: wholeStep, suffix: "" };
}

function definitionLocation(definition: CompiledDefinition) {
  const { filePath, lineNumber } = definition.definition;
  return new vscode.Location(vscode.Uri.file(filePath), new vscode.Position(Math.max(0, lineNumber - 1), 0));
}

function withRelated(diagnostic: vscode.Diagnostic, location: vscode.Location | undefined) {
  if (location)
    diagnostic.relatedInformation = [new vscode.DiagnosticRelatedInformation(location, "step definition")];
  return diagnostic;
}
