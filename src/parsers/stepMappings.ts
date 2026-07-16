import * as vscode from 'vscode';
import { getWorkspaceUriForFile, sepr, urisMatch } from '../common';
import { parser } from '../extension';
import { diagLog, DiagLogType } from '../logger';
import { getStepFileSteps, parseRepWildcard, StepFileStep } from './stepsParser';
import { FeatureFileStep, getFeatureFileSteps } from './featureParser';
import { ExecuteStepsCallStep, getExecuteStepsCallSteps, scanExecuteSteps } from './executeStepsParser';
import { refreshStepReferencesView } from '../handlers/findStepReferencesHandler';
import { performance } from 'perf_hooks';
import { retriggerSemanticHighlighting } from '../handlers/semHighlightProvider';


let stepMappings: StepMapping[] = [];

// Parallel array for execute_steps call-site mappings - NEVER pushed into `stepMappings`
// (REFS-04 / RESEARCH Pitfall 4: keeping these rows out of the flat table preserves every
// existing WkspParseCounts integration assertion). ExecuteStepsCallStep is structurally
// assignable to StepMapping's featureFileStep param - only .uri/.range/.fileName/.text/
// .textWithoutType/.stepType are read downstream.
let executeStepsMappings: StepMapping[] = [];

export class StepMapping {
  constructor(
    // there is ONE stepFileStep to MANY featureFileSteps
    // but this is a flat table for performance
    public readonly featuresUri: vscode.Uri,
    public readonly stepFileStep: StepFileStep,
    public readonly featureFileStep: FeatureFileStep,
  ) {
  }
}


export function getStepFileStepForFeatureFileStep(featureFileUri: vscode.Uri, lineNo: number): StepFileStep | undefined {
  const stepMappingForFeatureFileStep = stepMappings.find(sm =>
    sm.featureFileStep && urisMatch(sm.featureFileStep.uri, featureFileUri) && sm.featureFileStep.range.start.line === lineNo);
  return stepMappingForFeatureFileStep?.stepFileStep;
}


export function getStepMappingsForStepsFileFunction(stepsFileUri: vscode.Uri, lineNo: number): StepMapping[] {
  const matchesFunction = (sm: StepMapping) =>
    sm.stepFileStep && urisMatch(sm.stepFileStep.uri, stepsFileUri) &&
    sm.stepFileStep.functionDefinitionRange.start.line === lineNo;

  return stepMappings.filter(matchesFunction).concat(executeStepsMappings.filter(matchesFunction));
}


export function getStepMappings(featuresUri: vscode.Uri): StepMapping[] {
  return stepMappings.filter(sm => urisMatch(sm.featuresUri, featuresUri));
}


export function deleteStepMappings(featuresUri: vscode.Uri) {
  stepMappings = stepMappings.filter(sm => !urisMatch(sm.featuresUri, featuresUri));
}


export function deleteExecuteStepsMappings(featuresUri: vscode.Uri) {
  executeStepsMappings = executeStepsMappings.filter(sm => !urisMatch(sm.featuresUri, featuresUri));
}


export async function waitOnReadyForStepsNavigation(waitMs: number, uri: vscode.Uri) {
  const ready = await parser.stepsParseComplete(waitMs, "waitOnReadyForStepsNavigation");
  if (!ready) {
    const msg = "Cannot navigate steps while step files are being parsed, please try again.";
    diagLog(msg, getWorkspaceUriForFile(uri), DiagLogType.warn);
    //config.logger.showWarn(msg, getWorkspaceUriForFile(uri));
  }

  return ready;
}

export function rebuildStepMappings(featuresUri: vscode.Uri, stepDefsUri?: vscode.Uri): number {

  const start = performance.now();
  deleteStepMappings(featuresUri);

  // get filtered objects before we loop
  const { featureFileSteps, exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes } = _getFilteredSteps(featuresUri, stepDefsUri ?? featuresUri);

  let processed = 0;
  let exactMatchCount = 0;
  let paramsMatchCount = 0;
  const matchLoopStart = performance.now();
  for (const [, featureFileStep] of featureFileSteps) {
    const stepFileStep = _getStepFileStepMatch(featureFileStep, exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes);
    if (stepFileStep) {
      stepMappings.push(new StepMapping(featuresUri, stepFileStep, featureFileStep));
      // Check if this was an exact vs params match by checking if the key contains parseRepWildcard
      if (stepFileStep.textAsRe.includes(parseRepWildcard))
        paramsMatchCount++;
      else
        exactMatchCount++;
    }
    processed++;
  }
  const matchLoopTime = Math.round(performance.now() - matchLoopStart);

  retriggerSemanticHighlighting();
  refreshStepReferencesView();

  diagLog(`rebuilding step mappings for ${featuresUri.path} took ${Math.round(performance.now() - start)}ms ` +
    `(matching loop: ${matchLoopTime}ms, ${processed} steps processed, ${exactMatchCount} exact matches, ${paramsMatchCount} params matches)`);

  return processed;
}


function _getCompiledStepDefs(stepDefsUri: vscode.Uri) {
  const wkspStepFileSteps = getStepFileSteps(stepDefsUri);
  const exactSteps = new Map(wkspStepFileSteps.filter(([k,]) => !k.includes(parseRepWildcard)));
  const paramsSteps = new Map(wkspStepFileSteps.filter(([k,]) => k.includes(parseRepWildcard)));

  // Pre-compile regexes once instead of creating new RegExp(key) for every feature step
  const compiledExactRegexes = new Map<string, RegExp>();
  for (const [key] of exactSteps) {
    compiledExactRegexes.set(key, new RegExp(key));
  }
  const compiledParamsRegexes = new Map<string, RegExp>();
  for (const [key] of paramsSteps) {
    compiledParamsRegexes.set(key, new RegExp(key));
  }

  return { exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes };
}


function _getFilteredSteps(featureStepsUri: vscode.Uri, stepDefsUri: vscode.Uri) {
  const featureFileSteps = getFeatureFileSteps(featureStepsUri);
  const { exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes } = _getCompiledStepDefs(stepDefsUri);
  return { featureFileSteps, exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes };
}


// execute_steps call steps with a leading And/But/* and no prior step in the same call are
// isAmbiguousType=true (the scanner can't resolve given/when/then on its own). Try each bucket
// in order - each bucket lookup already falls back to the "step" bucket internally via
// _getStepFileStepMatch - and take the first match; no match across all buckets -> no mapping.
function _matchExecuteStepsCallStep(callStep: ExecuteStepsCallStep,
  exactSteps: Map<string, StepFileStep>, paramsSteps: Map<string, StepFileStep>,
  compiledExactRegexes: Map<string, RegExp>, compiledParamsRegexes: Map<string, RegExp>): StepFileStep | null {

  if (!callStep.isAmbiguousType)
    return _getStepFileStepMatch(callStep, exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes);

  for (const bucket of ["given", "when", "then"]) {
    const candidate = new ExecuteStepsCallStep(
      callStep.key, callStep.uri, callStep.fileName, callStep.range,
      callStep.text, callStep.textWithoutType, bucket, false, callStep.hasFormatPlaceholders);
    const match = _getStepFileStepMatch(candidate, exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes);
    if (match)
      return match;
  }

  return null;
}


// Rebuilds the parallel executeStepsMappings array for a workspace (per-workspace, NOT per-root
// - called once per featuresUri, unlike rebuildStepMappings which loops wkspSettings.featuresUris).
// Calls refreshStepReferencesView() (NOT retriggerSemanticHighlighting - exec call sites live in
// .py files, there is no gherkin semantic highlighting to refresh for them).
export function rebuildExecuteStepsMappings(featuresUri: vscode.Uri): number {

  const start = performance.now();
  deleteExecuteStepsMappings(featuresUri);

  const { exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes } = _getCompiledStepDefs(featuresUri);
  const callSteps = getExecuteStepsCallSteps(featuresUri);

  let processed = 0;
  const matchLoopStart = performance.now();
  for (const callStep of callSteps) {
    const stepFileStep = _matchExecuteStepsCallStep(callStep, exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes);
    if (stepFileStep)
      executeStepsMappings.push(new StepMapping(featuresUri, stepFileStep, callStep));
    processed++;
  }
  const matchLoopTime = Math.round(performance.now() - matchLoopStart);

  refreshStepReferencesView();

  diagLog(`rebuilding execute_steps mappings for ${featuresUri.path} took ${Math.round(performance.now() - start)}ms ` +
    `(matching loop: ${matchLoopTime}ms, ${processed} call steps processed)`);

  return processed;
}


export function getStepFileStepForExecuteStep(fileUri: vscode.Uri, lineNo: number): StepFileStep | undefined {
  const stepMappingForExecuteStep = executeStepsMappings.find(sm =>
    sm.featureFileStep && urisMatch(sm.featureFileStep.uri, fileUri) && sm.featureFileStep.range.start.line === lineNo);
  return stepMappingForExecuteStep?.stepFileStep;
}


// Live-text matching for Phase 25's diagnostics: scans content for execute_steps() call sites
// and matches each against the current step definitions WITHOUT persisting to
// executeStepsMappings and WITHOUT touching any cache - a pure read-only match.
export function matchExecuteStepsContent(featuresUri: vscode.Uri, content: string): { callStep: ExecuteStepsCallStep; stepFileStep: StepFileStep | null }[] {
  const { exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes } = _getCompiledStepDefs(featuresUri);
  const { callSteps } = scanExecuteSteps(content, featuresUri);

  return callSteps.map(callStep => ({
    callStep,
    stepFileStep: _matchExecuteStepsCallStep(callStep, exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes),
  }));
}


// any feature file step MUST map to a single python step function (or none)
// so this function should return the SINGLE best match
export function _getStepFileStepMatch(featureFileStep: FeatureFileStep,
  exactSteps: Map<string, StepFileStep>, paramsSteps: Map<string, StepFileStep>,
  compiledExactRegexes: Map<string, RegExp>, compiledParamsRegexes: Map<string, RegExp>): StepFileStep | null {

  const findExactMatch = (textWithoutType: string, stepType: string) => {
    const matchText = stepType + sepr + textWithoutType;
    for (const [key, value] of exactSteps) {
      const rx = compiledExactRegexes.get(key) ?? (() => { throw new Error(`missing compiled regex for key: ${key}`); })();
      const match = rx.exec(matchText);
      if (match && match.length !== 0) {
        return value;
      }
    }
  }

  const findParamsMatch = (textWithoutType: string, stepType: string) => {
    const matchText = stepType + sepr + textWithoutType;
    const matches = new Map<string, StepFileStep>();
    for (const [key, value] of paramsSteps) {
      const rx = compiledParamsRegexes.get(key) ?? (() => { throw new Error(`missing compiled regex for key: ${key}`); })();
      const match = rx.exec(matchText);
      if (match && match.length !== 0) {
        matches.set(key, value);
      }
    }
    return matches;
  }

  const findLongestParamsMatch = (paramsMatches: Map<string, StepFileStep>): StepFileStep => {
    let longestKey = "";
    let longestKeyLength = 0;
    for (const [key,] of paramsMatches) {
      if (key.length > longestKeyLength) {
        longestKey = key;
        longestKeyLength = key.length;
      }
    }

    // return longest
    const stepMatch = paramsMatches.get(longestKey);
    return stepMatch!; // eslint-disable-line @typescript-eslint/no-non-null-assertion    
  }

  const textWithoutType = featureFileStep.textWithoutType;

  let exactMatch = findExactMatch(textWithoutType, featureFileStep.stepType);
  if (!exactMatch && featureFileStep.stepType !== "step")
    exactMatch = findExactMatch(textWithoutType, "step");

  // got exact match - return it
  if (exactMatch)
    return exactMatch;

  // look for a parameters match, e.g. {something1} {something2}
  let paramsMatches = findParamsMatch(textWithoutType, featureFileStep.stepType);
  if (paramsMatches.size === 0 && featureFileStep.stepType !== "step")
    paramsMatches = findParamsMatch(textWithoutType, "step");

  // got single parameters match - return it
  if (paramsMatches.size === 1) {
    const match = paramsMatches.values().next().value;
    if (match) return match;
  }

  // more than one parameters match - get longest matched key      
  if (paramsMatches.size > 1) {
    return findLongestParamsMatch(paramsMatches);
  }

  // no matching step
  return null;
}
