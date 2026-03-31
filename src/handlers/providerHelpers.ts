import * as vscode from "vscode";
import { config } from "../configuration";
import { getWorkspaceUriForFile, isFeatureFile } from "../common";
import { getStepFileStepForFeatureFileStep, waitOnReadyForStepsNavigation } from "../parsers/stepMappings";
import { featureFileStepRe } from "../parsers/gherkinPatterns";
import { StepFileStep } from "../parsers/stepsParser";


export interface StepValidationResult {
  stepFileStep: StepFileStep;
  stepRange: vscode.Range;
  lineNo: number;
}


/**
 * Common validation logic for step-related providers (hover, definition, etc.)
 * Validates that the document is a feature file, the position is on a valid step,
 * and returns the corresponding step file information and range.
 */
export async function validateAndGetStepInfo(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<StepValidationResult | undefined> {
  const docUri = document.uri;

  if (!docUri || !isFeatureFile(docUri)) {
    return undefined;
  }

  const lineNo = position.line;
  const line = document.lineAt(lineNo);
  const lineText = line.text.trim();
  const stExec = featureFileStepRe.exec(lineText);
  if (!stExec) {
    return undefined;
  }

  if (!await waitOnReadyForStepsNavigation(500, docUri)) {
    return undefined;
  }

  const stepFileStep = getStepFileStepForFeatureFileStep(docUri, lineNo);
  if (!stepFileStep) {
    return undefined;
  }

  // Calculate the step range (the step text after the Given/When/Then/And/But keyword)
  const trimmedStart = line.text.indexOf(lineText);
  if (trimmedStart < 0) {
    return undefined;
  }
  const stepRange = new vscode.Range(
    new vscode.Position(lineNo, trimmedStart),
    new vscode.Position(lineNo, line.text.length)
  );

  return { stepFileStep, stepRange, lineNo };
}


/**
 * Common error handling for step-related providers
 */
export function handleProviderError(e: unknown, docUri: vscode.Uri): void {
  try {
    const wkspUri = getWorkspaceUriForFile(docUri);
    config.logger.showError(e, wkspUri);
  }
  catch {
    config.logger.showError(e);
  }
}
