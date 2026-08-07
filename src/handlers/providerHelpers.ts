import * as vscode from "vscode";
import { config } from "../configuration";
import { getWorkspaceSettingsForFile, getWorkspaceUriForFile, isFeatureFile } from "../common";
import { getStepFileStepForFeatureFileStep, getStepMappings, waitOnReadyForStepsNavigation } from "../parsers/stepMappings";
import { featureFileStepRe } from "../parsers/gherkinPatterns";
import { getStepFileSteps, StepFileStep } from "../parsers/stepsParser";
import { verboseLoggingEnabled } from "../logger";
import { diagnoseStepState } from "./stepStateDiagnosis";


// Collapses repeat verbose logs for the same position (see logNav in validateAndGetStepInfo).
// Module-level and deliberately not cleared: it only ever suppresses an identical consecutive
// message, so going stale costs nothing.
let _lastNavLogKey = "";
let _lastNavLogText = "";

// exported for tests - lets a test assert the dedup without depending on call ordering
export function _resetNavLogDedup() {
  _lastNavLogKey = "";
  _lastNavLogText = "";
}


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
  // every `return undefined` below makes ctrl+click / hover silently do nothing, which is
  // indistinguishable to the user from "the extension is broken" - so each one says why
  // when verboseLogging is on (see logVerbose in logger.ts).
  //
  // NOTE this runs on the HOVER path as well as ctrl+click, i.e. on every mouse-rest anywhere
  // in a feature file. Hence logNav(): it builds the message lazily (nothing is constructed
  // when verbose is off) and collapses repeats for the same line, so a hover storm over one
  // step produces one log entry and one disk write instead of dozens.
  const wkspUri = getWorkspaceUriForFile(docUri);
  const logNav = (build: () => string) => {
    if (!verboseLoggingEnabled())
      return;
    const key = `${docUri.toString()}:${position.line}`;
    const text = build();
    if (key === _lastNavLogKey && text === _lastNavLogText)
      return;
    _lastNavLogKey = key;
    _lastNavLogText = text;
    config.logger.logVerbose(text, wkspUri);
  };

  if (!docUri || !isFeatureFile(docUri)) {
    logNav(() => `step navigation: not attempted - "${docUri}" is not a .feature file (scheme "${docUri?.scheme}")`);
    return undefined;
  }

  const lineNo = position.line;
  const line = document.lineAt(lineNo);
  const lineText = line.text.trim();
  const stExec = featureFileStepRe.exec(lineText);
  if (!stExec) {
    logNav(() =>
      `step navigation: line ${lineNo + 1} of ${docUri.fsPath} is not a step line (no Given/When/Then/And/But/* keyword): "${lineText}"`);
    return undefined;
  }

  if (!await waitOnReadyForStepsNavigation(500, docUri)) {
    logNav(() =>
      `step navigation: gave up for "${lineText}" - step files were still being parsed after 500ms. ` +
      `If this persists, step discovery is stuck or failing (search this log for "Failed to load step definitions").`);
    return undefined;
  }

  const stepFileStep = getStepFileStepForFeatureFileStep(docUri, lineNo);
  if (!stepFileStep) {
    logNav(() =>
      `step navigation: no step definition mapped to "${lineText}" (line ${lineNo + 1} of ${docUri.fsPath}).\n` +
      logStepResolutionContext(docUri));
    return undefined;
  }

  // Calculate the step range (the step text after the Given/When/Then/And/But keyword)
  const trimmedStart = line.text.indexOf(lineText);
  if (trimmedStart < 0) {
    logNav(() =>
      `step navigation: could not locate the trimmed step text within line ${lineNo + 1} of ${docUri.fsPath} ` +
      `(this should not happen - please report it)`);
    return undefined;
  }

  logNav(() =>
    `step navigation: "${lineText}" -> ${stepFileStep.uri.fsPath}:${stepFileStep.functionDefinitionRange.start.line + 1}`);
  const stepRange = new vscode.Range(
    new vscode.Position(lineNo, trimmedStart),
    new vscode.Position(lineNo, line.text.length)
  );

  return { stepFileStep, stepRange, lineNo };
}


/**
 * Explains a failed step lookup: whether the feature file is even inside a configured
 * features folder, and whether ANY step definitions were loaded for that workspace.
 * These are the two causes that account for almost every "ctrl+click does nothing" report -
 * a misconfigured features path, or step discovery having failed/found nothing.
 *
 * Returns "" when verbose logging is off so callers pay nothing for building the message.
 */
export function logStepResolutionContext(docUri: vscode.Uri): string {
  if (!verboseLoggingEnabled())
    return "";

  const lines: string[] = [];

  const wkspSettings = getWorkspaceSettingsForFile(docUri);
  if (!wkspSettings) {
    lines.push(`  no workspace settings for this file - it is outside every open workspace folder, ` +
      `or that folder's gs-behave-bdd settings failed to load (search this log for "FATAL").`);
    return lines.join("\n");
  }

  lines.push(`  project path: ${wkspSettings.projectUri.fsPath}`);
  lines.push(`  configured features paths: ${wkspSettings.featuresUris.map(u => u.fsPath).join(", ") || "(none)"}`);
  lines.push(`  discovery source: ${wkspSettings.discoverySource}` +
    (wkspSettings.configFileUri ? ` (from ${wkspSettings.configFileUri.fsPath})` : ""));

  if (!wkspSettings.isFileInFeatures(docUri)) {
    lines.push(`  >>> this .feature file is NOT inside any configured features path, so the extension never ` +
      `parsed its steps. Fix gs-behave-bdd.featuresPaths (or your behave config "paths" key) to include it.`);
    return lines.join("\n");
  }

  const stepDefCount = getStepFileSteps(wkspSettings.featuresUri).length;
  const mappingCount = getStepMappings(wkspSettings.featuresUri).length;
  lines.push(`  step definitions loaded: ${stepDefCount}; feature steps currently mapped: ${mappingCount}`);

  // shared with the language-status item and the diagnostic report so all three agree.
  // featureStepCount is passed as 1: reaching here means we resolved a step line in a parsed
  // feature file, so the "no feature steps at all" case cannot apply.
  const diagnosis = diagnoseStepState(1, stepDefCount, mappingCount);
  lines.push(diagnosis
    ? `  >>> ${diagnosis.title}: ${diagnosis.detail}`
    : `  >>> step definitions ARE loaded and other steps matched, but this one did not. Check for a typo, ` +
      `a parameter type mismatch, or a step file that failed to load (search this log for "failed to load").`);

  return lines.join("\n");
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
