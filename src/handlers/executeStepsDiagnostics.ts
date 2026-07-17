import * as vscode from "vscode";
import { getWorkspaceSettingsForFile, couldBePythonStepsFile } from "../common";
import { matchExecuteStepsContent } from "../parsers/stepMappings";
import { getStepFileSteps } from "../parsers/stepsParser";
import { config } from "../configuration";
import { parser } from "../extension";

export const EXECUTE_STEPS_STEP_NOT_FOUND = 'execute-steps-step-not-found';
export const EXECUTE_STEPS_INVALID_CONTENT = 'execute-steps-invalid-content';

// Matches format placeholders in a step line of a .format()/%-formatted literal:
// {name}/{} style fields and %s/%d style conversions. Lines carrying one of these are
// dynamic at runtime, so both diagnostics are suppressed for them (a "not found" or
// "invalid" verdict against the unformatted text would be a false positive).
const formatPlaceholderRe = /\{[^{}]*\}|%[sdifr%]/;

// Validates context.execute_steps("...") string content in a python document:
// - Warning (EXECUTE_STEPS_STEP_NOT_FOUND) for a well-formed embedded step with no matching
//   step definition (Warning not Error because re/cfparse-matcher step defs are not modeled).
// - Error (EXECUTE_STEPS_INVALID_CONTENT) for lines behave's parser would reject at runtime
//   with a ParserError (junk lines, @tags, Scenario:, leading And/But).
// Scans the LIVE document text (not the 500ms-debounced cache) so squiggles track typing.
export function validateExecuteSteps(document: vscode.TextDocument): void {
  try {
    if (!couldBePythonStepsFile(document.uri)) {
      return;
    }

    const wkspSettings = getWorkspaceSettingsForFile(document.uri);
    if (!wkspSettings) {
      return;
    }

    if (!parser.initialStepsParseComplete) {
      return;
    }

    const execDiagnostics: vscode.Diagnostic[] = [];
    const { matches, invalidLines } = matchExecuteStepsContent(wkspSettings.featuresUri, document.uri, document.getText());

    const allStepDefs = getStepFileSteps(wkspSettings.featuresUri);
    const stepDefCount = allStepDefs.length;
    const uniqueFiles = new Set<string>();
    for (const [, stepDef] of allStepDefs) {
      uniqueFiles.add(stepDef.uri.toString());
    }
    const fileCount = uniqueFiles.size;

    for (const { callStep, stepFileStep } of matches) {
      if (stepFileStep)
        continue;
      // suppress on dynamic lines of .format()/%-formatted literals - the runtime text differs
      if (callStep.hasFormatPlaceholders && formatPlaceholderRe.test(callStep.text))
        continue;

      const searchPath = vscode.workspace.asRelativePath(wkspSettings.stepsSearchUri);
      const message = `No step definition found. Searched ${stepDefCount} step definitions in ${fileCount} files under ${searchPath}`;
      const diagnostic = new vscode.Diagnostic(callStep.range, message, vscode.DiagnosticSeverity.Warning);
      diagnostic.code = EXECUTE_STEPS_STEP_NOT_FOUND;
      diagnostic.source = 'gs-behave-bdd';
      execDiagnostics.push(diagnostic);
    }

    for (const invalidLine of invalidLines) {
      if (formatPlaceholderRe.test(invalidLine.text))
        continue;

      const message = `Invalid execute_steps content: behave will raise a ParserError at runtime for this line`;
      const diagnostic = new vscode.Diagnostic(invalidLine.range, message, vscode.DiagnosticSeverity.Error);
      diagnostic.code = EXECUTE_STEPS_INVALID_CONTENT;
      diagnostic.source = 'gs-behave-bdd';
      execDiagnostics.push(diagnostic);
    }

    // Preserve existing diagnostics owned by other validators (step-not-found, fixtures, etc.)
    const existingDiagnostics = config.diagnostics.get(document.uri) || [];
    const otherDiagnostics = [...existingDiagnostics].filter(d =>
      d.code !== EXECUTE_STEPS_STEP_NOT_FOUND && d.code !== EXECUTE_STEPS_INVALID_CONTENT);
    config.diagnostics.set(document.uri, [...otherDiagnostics, ...execDiagnostics]);
  }
  catch (e: unknown) {
    try {
      const wkspSettings = getWorkspaceSettingsForFile(document.uri);
      config.logger.showError(e, wkspSettings?.uri);
    }
    catch {
      config.logger.showError(e);
    }
  }
}

export function clearExecuteStepsDiagnostics(uri: vscode.Uri): void {
  const existingDiagnostics = config.diagnostics.get(uri) || [];
  const otherDiagnostics = [...existingDiagnostics].filter(d =>
    d.code !== EXECUTE_STEPS_STEP_NOT_FOUND && d.code !== EXECUTE_STEPS_INVALID_CONTENT);
  config.diagnostics.set(uri, otherDiagnostics);
}
