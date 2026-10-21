import * as vscode from "vscode";
import { getWorkspaceSettingsForFile, isFeatureFile } from "../common";
import { getFeatureFileSteps } from "../parsers/featureParser";
import { getStepFileStepForFeatureFileStep } from "../parsers/stepMappings";
import { getStepFileSteps } from "../parsers/stepsParser";
import { config } from "../configuration";
import { parser } from "../extension";
import { isStepArgumentDiagnostic, validateStepArguments } from "./stepArgumentDiagnostics";

export const STEP_NOT_FOUND = 'step-not-found';

export function validateStepDefinitions(document: vscode.TextDocument): void {
  try {
    if (!isFeatureFile(document.uri)) {
      return;
    }

    const wkspSettings = getWorkspaceSettingsForFile(document.uri);
    if (!wkspSettings) {
      return;
    }

    if (!parser.initialStepsParseComplete) {
      return;
    }

    const stepDiagnostics: vscode.Diagnostic[] = [];
    const featureSteps = wkspSettings.featuresUris.flatMap(u => getFeatureFileSteps(u))
      .filter(([, s]) => s.uri.toString() === document.uri.toString());

    const allStepDefs = getStepFileSteps(wkspSettings.featuresUri);
    const stepDefCount = allStepDefs.length;

    // Count unique step files
    const uniqueFiles = new Set<string>();
    for (const [, stepDef] of allStepDefs) {
      uniqueFiles.add(stepDef.uri.toString());
    }
    const fileCount = uniqueFiles.size;

    for (const [, step] of featureSteps) {
      const match = getStepFileStepForFeatureFileStep(step.uri, step.range.start.line);
      if (!match) {
        const searchPath = vscode.workspace.asRelativePath(wkspSettings.stepsSearchUri);

        const message = `No step definition found. Searched ${stepDefCount} step definitions in ${fileCount} files under ${searchPath}`;
        const diagnostic = new vscode.Diagnostic(
          step.range,
          message,
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.code = STEP_NOT_FOUND;
        diagnostic.source = 'gs-behave-bdd';

        stepDiagnostics.push(diagnostic);
      }
    }

    // Preserve existing non-step diagnostics (e.g., fixture diagnostics)
    const existingDiagnostics = config.diagnostics.get(document.uri) || [];
    const nonStepDiagnostics = [...existingDiagnostics].filter(d => d.code !== STEP_NOT_FOUND);
    config.diagnostics.set(document.uri, [...nonStepDiagnostics, ...stepDiagnostics]);

    validateStepArguments(document, wkspSettings);
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

export function clearStepDiagnostics(uri: vscode.Uri): void {
  const existingDiagnostics = config.diagnostics.get(uri) || [];
  const nonStepDiagnostics = [...existingDiagnostics].filter(d => d.code !== STEP_NOT_FOUND && !isStepArgumentDiagnostic(d));
  config.diagnostics.set(uri, nonStepDiagnostics);
}
