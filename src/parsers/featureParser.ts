import * as vscode from 'vscode';
import { WorkspaceSettings } from "../settings";
import { uriId, sepr, basename, getLines, getWorkspaceUriForFile } from '../common';
import { diagLog } from '../logger';
import { config } from '../configuration';
import { featureRe, featureMultiLineRe, scenarioRe, scenarioOutlineRe, examplesRe, featureFileStepRe, tagRe, textBlockDelimiterRe, tableRowRe } from './gherkinPatterns';

const commentedFeatureMultilineReStr = /^\s*#.*Feature:(.*)$/im;

const featureFileSteps = new Map<string, FeatureFileStep>();
const featureTags = new Map<string, FeatureTag>();

export class FeatureTag {
  constructor(
    public readonly key: string,
    public readonly uri: vscode.Uri,
    public readonly fileName: string,
    public readonly range: vscode.Range,
    public readonly tag: string,
  ) { }
}

export class FeatureFileStep {
  constructor(
    public readonly key: string,
    public readonly uri: vscode.Uri,
    public readonly fileName: string,
    public readonly range: vscode.Range,
    public readonly text: string,
    public readonly textWithoutType: string,
    public readonly stepType: string,
  ) { }
}

export const getFeatureFileSteps = (featuresUri: vscode.Uri) => {
  const featuresUriMatchString = uriId(featuresUri);
  return [...featureFileSteps].filter(([k,]) => k.startsWith(featuresUriMatchString));
}

export const getFeatureTags = (featuresUri: vscode.Uri) => {
  const featuresUriMatchString = uriId(featuresUri);
  return [...featureTags.values()].filter(t => t.key.startsWith(featuresUriMatchString));
}

export const getFeatureTagByPosition = (uri: vscode.Uri, position: vscode.Position): FeatureTag | undefined => {
  const key = `${uriId(uri)}${sepr}${position.line}`;
  const tag = featureTags.get(key);

  // Check if the position is within the tag's range
  if (tag && tag.range.contains(position)) {
    return tag;
  }

  return undefined;
}

export const deleteFeatureFileSteps = (featuresUri: vscode.Uri) => {
  const wkspFeatureFileSteps = getFeatureFileSteps(featuresUri);
  for (const [key,] of wkspFeatureFileSteps) {
    featureFileSteps.delete(key);
  }

  const featuresUriMatchString = uriId(featuresUri);
  for (const [key,] of featureTags) {
    if (key.startsWith(featuresUriMatchString)) {
      featureTags.delete(key);
    }
  }
}

export const getFeatureNameFromContent = async (content: string, uri: vscode.Uri, firstRun: boolean): Promise<string | null> => {
  const featureText = featureMultiLineRe.exec(content);

  if (featureText === null) {
    if (commentedFeatureMultilineReStr.exec(content) !== null)
      return null; // # Feature: (commented out) - ignore
    return null; // no "Feature:" text exists in file - ignore (user may be typing it out live, or could be an empty file)
  }

  const featureName = featureText[1].trim();
  if (featureName === '') {
    if (firstRun) {
      const wkspUri = getWorkspaceUriForFile(uri);
      if (wkspUri) {
        config.logger.showWarn(`No feature name found in file: ${uri.fsPath}. This feature will be ignored until it has a name.`,
          wkspUri);
      }
    }
    return null;
  }

  return featureName;
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const parseFeatureContent = (wkspSettings: WorkspaceSettings, uri: vscode.Uri, content: string, caller: string,
  onScenarioLine: (range: vscode.Range, scenarioName: string, isOutline: boolean) => void,
  onFeatureLine: (range: vscode.Range) => void,
  onExampleRow?: (range: vscode.Range, outlineName: string, tableIndex: number, rowIndex: number, examplesName: string, values: string[]) => void,
  onExamplesGroup?: (range: vscode.Range, outlineName: string, tableIndex: number, examplesName: string) => void) => {

  const fileName = basename(uri);
  const lines = getLines(content);
  let fileScenarios = 0;
  let fileSteps = 0;
  let lastStepType = "given";
  let insideStepTextBlock = false;

  // Scenario Outline / Examples tracking
  let currentOutlineName: string | undefined;
  let inExamplesSection = false;
  let examplesTableIndex = 0;
  let examplesRowIndex = 0;
  let examplesName = "";
  let examplesIsHeaderRow = false;

  const fileUriMatchString = uriId(uri);

  // clear all existing featureFileSteps for this step file uri
  for (const [key, featureFileStep] of featureFileSteps) {
    if (uriId(featureFileStep.uri) === fileUriMatchString)
      featureFileSteps.delete(key);
  }

  // clear all existing tags for this feature file
  for (const [key, featureTag] of featureTags) {
    if (uriId(featureTag.uri) === fileUriMatchString)
      featureTags.delete(key);
  }


  for (let lineNo = 0; lineNo < lines.length; lineNo++) {

    // get indent before we trim
    const indent = lines[lineNo].match(/^\s*/);
    const indentSize = indent && indent[0] ? indent[0].length : 0;

    const line = lines[lineNo].trim();
    if (line === '' || line.startsWith("#")) {
      continue;
    }

    // Check for text block delimiters (""" or ''')
    const textBlockMatch = textBlockDelimiterRe.exec(line);
    if (textBlockMatch) {
      insideStepTextBlock = !insideStepTextBlock;
      continue;
    }

    // Skip lines inside text blocks
    if (insideStepTextBlock) {
      continue;
    }

    // Handle table rows (lines starting with |)
    const tableRowMatch = tableRowRe.exec(line);
    if (tableRowMatch) {
      if (inExamplesSection && onExampleRow && currentOutlineName !== undefined) {
        if (examplesIsHeaderRow) {
          // This is the header row — skip it but mark that data rows follow
          examplesIsHeaderRow = false;
        } else {
          // Data row — parse cell values and emit
          examplesRowIndex++;
          const values = line.split('|').slice(1, -1).map(v => v.trim());
          const range = new vscode.Range(new vscode.Position(lineNo, indentSize), new vscode.Position(lineNo, indentSize + line.length));
          onExampleRow(range, currentOutlineName, examplesTableIndex, examplesRowIndex, examplesName, values);
        }
      }
      continue;
    }

    // Check for tags (e.g., @fixture.disable_sensors)
    const tagMatch = tagRe.exec(line);
    if (tagMatch) {
      const tag = tagMatch[1];
      const tagStartCol = indentSize + line.indexOf('@');
      const tagEndCol = tagStartCol + 1 + tag.length; // +1 for the @ symbol
      const range = new vscode.Range(
        new vscode.Position(lineNo, tagStartCol),
        new vscode.Position(lineNo, tagEndCol)
      );
      const key = `${uriId(uri)}${sepr}${lineNo}`;
      featureTags.set(key, new FeatureTag(key, uri, fileName, range, tag));
      continue;
    }

    // Check for Examples: (must come before step check to avoid misidentification)
    const examplesMatch = examplesRe.exec(line);
    if (examplesMatch) {
      inExamplesSection = true;
      examplesTableIndex++;
      examplesRowIndex = 0;
      examplesIsHeaderRow = true;
      examplesName = examplesMatch[2].trim();
      if (onExamplesGroup && currentOutlineName !== undefined) {
        const range = new vscode.Range(new vscode.Position(lineNo, indentSize), new vscode.Position(lineNo, indentSize + line.length));
        onExamplesGroup(range, currentOutlineName, examplesTableIndex, examplesName);
      }
      continue;
    }

    const step = featureFileStepRe.exec(line);
    if (step) {
      inExamplesSection = false;
      const text = step[0].trim();
      const matchText = step[2].trim();

      let stepType = step[1].trim().toLowerCase();
      if (stepType === "and" || stepType === "but")
        stepType = lastStepType;
      else
        lastStepType = stepType;

      const range = new vscode.Range(new vscode.Position(lineNo, indentSize), new vscode.Position(lineNo, indentSize + step[0].length));
      const key = `${uriId(uri)}${sepr}${range.start.line}`;
      featureFileSteps.set(key, new FeatureFileStep(key, uri, fileName, range, text, matchText, stepType));
      fileSteps++;
      continue;
    }

    const scenario = scenarioRe.exec(line);
    if (scenario) {
      const scenarioName = scenario[2].trim();
      const isOutline = scenarioOutlineRe.exec(line) !== null;
      const range = new vscode.Range(new vscode.Position(lineNo, indentSize), new vscode.Position(lineNo, indentSize + scenario[0].length));
      onScenarioLine(range, scenarioName, isOutline);
      fileScenarios++;
      // Reset outline tracking
      if (isOutline) {
        currentOutlineName = scenarioName;
        examplesTableIndex = 0;
        inExamplesSection = false;
      } else {
        currentOutlineName = undefined;
        inExamplesSection = false;
      }
      continue;
    }

    const feature = featureRe.exec(line);
    if (feature) {
      const range = new vscode.Range(new vscode.Position(lineNo, 0), new vscode.Position(lineNo, line.length));
      onFeatureLine(range);
      currentOutlineName = undefined;
      inExamplesSection = false;
    }

  }

  diagLog(`${caller}: parsed ${fileScenarios} scenarios and ${fileSteps} steps from ${uri.path}`, wkspSettings.uri);
};



