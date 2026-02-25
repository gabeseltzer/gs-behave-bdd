import * as vscode from 'vscode';
import { uriId, isStepsFile, sepr, basename, afterFirstSepr, getLines } from '../common';
import { diagLog } from '../logger';

export const parseRepWildcard = ".*";
export const funcRe = /^(async )?def/;
export const stepFileDecoratorPattern = "^\\s*@(behave\\.)?(step|given|when|then)\\(";
const stepFileStepStartStr = stepFileDecoratorPattern;
const stepFileStepStartRe = new RegExp(`${stepFileStepStartStr}.*`, "i");
const stepFileStepRe = new RegExp(`${stepFileStepStartStr}u?(?:"|')(.+)(?:"|').*\\).*$`, "i");
const stepFileSteps = new Map<string, StepFileStep>();

// Track which library files are imported by each step file
// Key: step file URI id, Value: set of library file URI ids
const importedLibrariesByStepFile = new Map<string, Set<string>>();

export class StepFileStep {
  public functionDefinitionRange: vscode.Range = new vscode.Range(0, 0, 0, 0);
  constructor(
    public readonly key: string,
    public readonly uri: vscode.Uri,
    public readonly fileName: string,
    public readonly stepType: string,
    public readonly stepTextRange: vscode.Range,
    public readonly textAsRe: string
  ) { }
}


export function getStepFileSteps(featuresUri: vscode.Uri, removeFileUriPrefix = true): [string, StepFileStep][] {
  const featuresUriMatchString = uriId(featuresUri);
  let steps = [...stepFileSteps].filter(([k,]) => k.startsWith(featuresUriMatchString));
  if (!removeFileUriPrefix)
    return steps;
  steps = [...new Map([...steps].map(([k, v]) => [afterFirstSepr(k), v]))];
  return steps;
}

// For testing: get the import tracking map state
export function getImportedLibrariesByStepFile(): ReadonlyMap<string, ReadonlySet<string>> {
  return new Map(importedLibrariesByStepFile);
}


export function deleteStepFileSteps(featuresUri: vscode.Uri) {
  const wkspStepFileSteps = getStepFileSteps(featuresUri);
  for (const [key,] of wkspStepFileSteps) {
    stepFileSteps.delete(key);
  }

  // Clean up import tracking for this workspace
  const featuresUriId = uriId(featuresUri);
  for (const [stepFileId] of importedLibrariesByStepFile) {
    if (stepFileId.startsWith(featuresUriId)) {
      importedLibrariesByStepFile.delete(stepFileId);
    }
  }
}

export function deleteLibrarySteps(libraryFileUri: vscode.Uri) {
  const libraryUriId = uriId(libraryFileUri);
  const keysToDelete: string[] = [];

  for (const [key, stepFileStep] of stepFileSteps) {
    if (uriId(stepFileStep.uri) === libraryUriId) {
      keysToDelete.push(key);
    }
  }

  for (const key of keysToDelete) {
    stepFileSteps.delete(key);
  }
}

export function recordImportedLibraries(stepFileUri: vscode.Uri, libraryUris: vscode.Uri[]) {
  const stepFileUriId = uriId(stepFileUri);
  const libraryUriIds = new Set(libraryUris.map(uri => uriId(uri)));
  importedLibrariesByStepFile.set(stepFileUriId, libraryUriIds);
}

export function cleanupOldImportedLibraries(stepFileUri: vscode.Uri, newLibraryUris: vscode.Uri[]) {
  const stepFileUriId = uriId(stepFileUri);
  const oldLibraries = importedLibrariesByStepFile.get(stepFileUriId) || new Set();
  const newLibraryUriIds = new Set(newLibraryUris.map(uri => uriId(uri)));

  // Find libraries that are no longer imported
  for (const oldLibraryId of oldLibraries) {
    if (!newLibraryUriIds.has(oldLibraryId)) {
      // This library is no longer imported
      // Check if any OTHER step file still imports it
      let otherStepFileImportsIt = false;
      for (const [otherStepFileId, otherLibraries] of importedLibrariesByStepFile) {
        if (otherStepFileId !== stepFileUriId && otherLibraries.has(oldLibraryId)) {
          otherStepFileImportsIt = true;
          break;
        }
      }

      // Only delete if no other step file imports this library
      if (!otherStepFileImportsIt) {
        diagLog(`cleanupOldImportedLibraries: deleting steps from library ${oldLibraryId}`);
        deleteLibrarySteps(vscode.Uri.parse(oldLibraryId));
      } else {
        diagLog(`cleanupOldImportedLibraries: keeping library ${oldLibraryId} (used by other step file)`);
      }
    }
  }
}


export async function parseStepsFileContent(featuresUri: vscode.Uri, content: string, stepFileUri: vscode.Uri, caller: string, isLibraryFile = false) {

  if (!isLibraryFile && !isStepsFile(stepFileUri))
    throw new Error(`${stepFileUri.path} is not a steps file`);

  if (!content)
    return;

  const fileUriMatchString = uriId(stepFileUri);

  // clear all existing stepFileSteps for this step file uri
  for (const [key, stepFileStep] of stepFileSteps) {
    if (uriId(stepFileStep.uri) === fileUriMatchString)
      stepFileSteps.delete(key);
  }

  let fileSteps = 0;
  let setFuncLineKeys: string[] = [];
  let multiLineBuilding = false;
  let multiLine = "";
  let startLineNo = 0;
  let multiLineStepType = "";
  const lines = getLines(content);

  for (let lineNo = 0; lineNo < lines.length; lineNo++) {

    let line = lines[lineNo].trim();

    if (line === '' || line.startsWith("#"))
      continue;

    if (line.endsWith("\\"))
      line = line.slice(0, -1).trim();

    if (setFuncLineKeys.length > 0 && funcRe.test(line)) {
      setFuncLineKeys.forEach(key => {
        const step = stepFileSteps.get(key);
        if (!step)
          throw `could not find step for key ${key}`;

        let definitionLine = lines[lineNo];
        // Remove comments
        const commentIndex = definitionLine.indexOf('#');
        if (commentIndex !== -1) {
          definitionLine = definitionLine.substring(0, commentIndex);
        }

        definitionLine = definitionLine.trimEnd();
        if (definitionLine.endsWith(':')) {
          definitionLine = definitionLine.substring(0, definitionLine.length - 1);
        }
        step.functionDefinitionRange = new vscode.Range(lineNo, 0, lineNo, definitionLine.length);
      });
      setFuncLineKeys = [];
    }

    const foundStep = stepFileStepStartRe.exec(line);
    if (foundStep) {
      if (foundStep && line.endsWith("(")) {
        startLineNo = lineNo;
        multiLineStepType = foundStep[2];
        multiLineBuilding = true;
        continue;
      }
    }

    if (multiLineBuilding) {
      if (line.startsWith(")")) {
        multiLine = multiLine.replaceAll("''", "");
        multiLine = multiLine.replaceAll('""', "");
        multiLineBuilding = false;
      }
      else {
        multiLine += line;
        continue;
      }
    }


    if (multiLine) {
      line = `@${multiLineStepType}(${multiLine})`;
      multiLine = "";
    }
    else {
      startLineNo = lineNo;
    }


    const step = stepFileStepRe.exec(line);
    if (step) {
      const range = new vscode.Range(new vscode.Position(startLineNo, 0), new vscode.Position(lineNo, step[0].length));
      const stepFsRk = createStepFileStepAndReKey(featuresUri, stepFileUri, range, step);
      if (stepFileSteps.get(stepFsRk.reKey))
        diagLog("replacing duplicate step file step reKey: " + stepFsRk.reKey);
      stepFileSteps.set(stepFsRk.reKey, stepFsRk.stepFileStep); // map.set() = no duplicate keys allowed (per workspace)
      fileSteps++;
      setFuncLineKeys.push(stepFsRk.reKey);
    }

  }

  diagLog(`${caller}: parsed ${fileSteps} steps from ${stepFileUri.path}`);
}


// Store a pre-constructed StepFileStep (used when loading from behave registry)
export function storeStepFileStep(featuresUri: vscode.Uri, stepFileStep: StepFileStep) {
  if (stepFileSteps.get(stepFileStep.key))
    diagLog("replacing duplicate step file step reKey: " + stepFileStep.key);
  stepFileSteps.set(stepFileStep.key, stepFileStep);
}

function createStepFileStepAndReKey(featuresUri: vscode.Uri, fileUri: vscode.Uri, range: vscode.Range, step: RegExpExecArray) {
  const stepType = step[2];
  let textAsRe = step[3].trim();
  textAsRe = textAsRe.replace(/[.*+?^$()|[\]]/g, '\\$&'); // escape any regex chars except for \ { }
  textAsRe = textAsRe.replace(/{.*?}/g, parseRepWildcard);
  const fileName = basename(fileUri);
  // NOTE: it's important the key contains the featuresUri, NOT the fileUri, because we 
  // don't want to allow duplicate text matches in the workspace
  const reKey = `${uriId(featuresUri)}${sepr}^${stepType}${sepr}${textAsRe}$`;
  const stepFileStep = new StepFileStep(reKey, fileUri, fileName, stepType, range, textAsRe);
  return { reKey, stepFileStep };
}
