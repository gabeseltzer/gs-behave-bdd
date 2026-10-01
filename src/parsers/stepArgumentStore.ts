/**
 * Per-workspace step definitions for the step argument check (see stepArguments.ts), compiled
 * once per step discovery, plus a memo of check results so re-validating a feature file on
 * every keystroke only pays for step texts it hasn't seen.
 */

import * as vscode from 'vscode';
import { uriId, sepr } from '../common';
import type { BehaveStepDefinition } from './behaveLoader';
import { checkStepText, CompiledDefinition, StepArgumentCheck } from './stepArguments';
import { getStepFileSteps } from './stepsParser';
import { convertPatternToTextAsRe } from './stepsParserBehaveAdapter';


interface WorkspaceDefinitions {
  definitions: CompiledDefinition[];
  /** wildcard regexes of known step definitions discover.py didn't describe - computed lazily */
  otherLoose?: RegExp[];
  memo: Map<string, StepArgumentCheck>;
}

const store = new Map<string, WorkspaceDefinitions>();
const stepsPathsByWksp = new Map<string, string[]>();
const changeListeners: ((featuresUri: vscode.Uri) => void)[] = [];


/** Replaces a workspace's definitions with a fresh discovery result (in behave's registry order). */
export function setArgumentCheckDefinitions(featuresUri: vscode.Uri, definitions: BehaveStepDefinition[]) {
  store.set(uriId(featuresUri), {
    definitions: definitions.map(d => new CompiledDefinition(d)),
    memo: new Map(),
  });
  for (const listener of changeListeners)
    listener(featuresUri);
}

export function clearArgumentCheckDefinitions(featuresUri: vscode.Uri) {
  store.delete(uriId(featuresUri));
  for (const listener of changeListeners)
    listener(featuresUri);
}

/** Called whenever a workspace's definitions are replaced - cached verdicts are stale then. */
export function onArgumentCheckDefinitionsChanged(listener: (featuresUri: vscode.Uri) => void) {
  changeListeners.push(listener);
}

export function hasArgumentCheckDefinitions(featuresUri: vscode.Uri) {
  return store.has(uriId(featuresUri));
}

/** The step dirs discovery passed to behave - the argument check must load exactly the same. */
export function rememberStepsPaths(featuresUri: vscode.Uri, stepsPaths: string[]) {
  stepsPathsByWksp.set(uriId(featuresUri), stepsPaths);
}

export function getRememberedStepsPaths(featuresUri: vscode.Uri) {
  return stepsPathsByWksp.get(uriId(featuresUri));
}


/** Checks a step's text (after the keyword) against the workspace's definitions. */
export function checkStepArguments(featuresUri: vscode.Uri, stepType: string, text: string): StepArgumentCheck | undefined {
  const wksp = store.get(uriId(featuresUri));
  if (!wksp)
    return undefined;

  const memoKey = `${stepType}\n${text}`;
  const memoized = wksp.memo.get(memoKey);
  if (memoized)
    return memoized;

  if (!wksp.otherLoose)
    wksp.otherLoose = getUndescribedLooseRegexes(featuresUri, wksp.definitions);
  const result = checkStepText(wksp.definitions, stepType, text, wksp.otherLoose);
  wksp.memo.set(memoKey, result);
  return result;
}


// Step definitions the step mapping knows about but discover.py didn't describe this time,
// e.g. kept from cache because their file failed to load. Matched by mapping key, which is
// how the step mapping itself identifies a definition.
function getUndescribedLooseRegexes(featuresUri: vscode.Uri, definitions: CompiledDefinition[]) {
  const described = new Set(definitions.map(d =>
    `^${d.definition.stepType.toLowerCase()}${sepr}${convertPatternToTextAsRe(d.definition.pattern)}$`));
  const other: RegExp[] = [];
  for (const [key, stepFileStep] of getStepFileSteps(featuresUri)) {
    if (!described.has(key))
      other.push(new RegExp(`^${stepFileStep.textAsRe}$`));
  }
  return other;
}
