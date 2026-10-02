import * as vscode from 'vscode';
import { WorkspaceSettings } from "../settings";
import { uriId, sepr, basename, getLines, getWorkspaceUriForFile } from '../common';
import { diagLog } from '../logger';
import { config } from '../configuration';
import { featureRe, featureMultiLineRe, backgroundRe, scenarioRe, scenarioOutlineRe, examplesRe, featureFileStepRe, ruleRe, tagRe, getTagSpans, textBlockDelimiterRe, tableRowRe } from './gherkinPatterns';

const commentedFeatureMultilineReStr = /^\s*#.*Feature:(.*)$/im;

const featureFileSteps = new Map<string, FeatureFileStep>();
// Keyed by "<uriId><sepr><line>", so the value is every tag ON that line: a line can
// carry several ("@smoke @slow") and they cannot share one map slot.
const featureTags = new Map<string, FeatureTag[]>();
const featureParseErrors = new Map<string, FeatureParseError>();

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

// Represents a Gherkin structural problem found while parsing a feature file (e.g. an
// And/But step with no preceding Given/When/Then to inherit a step type from). behave
// itself rejects such files with a ParserError; we record them so a diagnostic can flag
// them to the user instead of silently swallowing the file.
export class FeatureParseError {
  constructor(
    public readonly key: string,
    public readonly uri: vscode.Uri,
    public readonly fileName: string,
    public readonly range: vscode.Range,
    public readonly message: string,
  ) { }
}

export const getFeatureFileSteps = (featuresUri: vscode.Uri) => {
  const featuresUriMatchString = uriId(featuresUri);
  return [...featureFileSteps].filter(([k,]) => k.startsWith(featuresUriMatchString));
}

export const getFeatureTags = (featuresUri: vscode.Uri) => {
  const featuresUriMatchString = uriId(featuresUri);
  // Flattened, so callers still see a flat list of tags regardless of how many share
  // a line.
  return [...featureTags.values()].flat().filter(t => t.key.startsWith(featuresUriMatchString));
}

export const getFeatureParseErrors = (featuresUri: vscode.Uri) => {
  const featuresUriMatchString = uriId(featuresUri);
  return [...featureParseErrors.values()].filter(e => e.key.startsWith(featuresUriMatchString));
}

/**
 * Parse errors for ONE feature file.
 *
 * The separator is part of the prefix deliberately: keys are "<uriId><sepr><line>", so a
 * bare startsWith on the file's uriId would also match a sibling whose name extends it
 * ("test.feature" against "test.feature2"). The folder-level getter above cannot use the
 * same guard - it matches a directory prefix on purpose.
 */
export const getFeatureParseErrorsForFile = (fileUri: vscode.Uri) => {
  const prefix = `${uriId(fileUri)}${sepr}`;
  return [...featureParseErrors.values()].filter(e => e.key.startsWith(prefix));
}

const recordParseError = (uri: vscode.Uri, fileName: string, range: vscode.Range, message: string) => {
  const key = `${uriId(uri)}${sepr}${range.start.line}`;
  featureParseErrors.set(key, new FeatureParseError(key, uri, fileName, range, message));
}

export const getFeatureTagByPosition = (uri: vscode.Uri, position: vscode.Position): FeatureTag | undefined => {
  const key = `${uriId(uri)}${sepr}${position.line}`;
  // The line may hold several tags, so the position is what picks one out. Previously
  // only the first tag on a line was ever recorded, so there was nothing to choose
  // between - and hovering "@slow" in "@smoke @slow" found nothing at all.
  return featureTags.get(key)?.find(t => t.range.contains(position));
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

  for (const [key,] of featureParseErrors) {
    if (key.startsWith(featuresUriMatchString)) {
      featureParseErrors.delete(key);
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
  onScenarioLine: (range: vscode.Range, scenarioName: string, isOutline: boolean, tags: string[]) => void,
  onFeatureLine: (range: vscode.Range, tags: string[]) => void,
  onExampleRow?: (range: vscode.Range, outlineName: string, tableIndex: number, rowIndex: number, examplesName: string,
    values: string[], tags: string[]) => void,
  onExamplesGroup?: (range: vscode.Range, outlineName: string, tableIndex: number, examplesName: string,
    tags: string[]) => void) => {

  const fileName = basename(uri);
  const lines = getLines(content);
  let fileScenarios = 0;
  let fileSteps = 0;
  // Step-type tracking mirrors behave's parser (bundled/libs/behave/parser.py):
  // `last_step_type` is None at the start of every container (Background/Scenario) and is
  // only consulted mid-sequence; an And/But step with no in-container predecessor falls
  // back to the enclosing Background's last step type. We use `undefined` for behave's None
  // so we can detect the invalid "And/But with nothing to inherit from" case (which behave
  // rejects with a ParserError).
  let lastStepType: string | undefined = undefined;
  // Feature-level and Rule-level Backgrounds are tracked separately: a Rule without its own
  // Background inherits the feature Background (behave's background.inherited_steps), NOT a
  // previous Rule's Background. See parser.py _select_last_background_step_type().
  let featureBackgroundLastStepType: string | undefined = undefined;
  let ruleBackgroundLastStepType: string | undefined = undefined;
  let inBackground = false;
  let inRule = false;
  let insideStepTextBlock = false;

  // Tag inheritance. In Gherkin a tag line applies to the NEXT block, and a block's tags
  // are inherited by everything inside it: a Feature's tags belong to every scenario, a
  // Rule's to every scenario in it, and a Scenario Outline's to every example row.
  // pendingTags holds the tags read since the last block consumed them.
  let pendingTags: string[] = [];
  let featureOwnTags: string[] = [];
  let ruleOwnTags: string[] = [];
  let currentOutlineTags: string[] = [];
  let currentExamplesTags: string[] = [];

  /** Take the pending tags, clearing them - they belong to exactly one block. */
  const takePendingTags = () => {
    const taken = pendingTags;
    pendingTags = [];
    return taken;
  };

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

  // clear all existing parse errors for this feature file
  for (const [key, featureParseError] of featureParseErrors) {
    if (uriId(featureParseError.uri) === fileUriMatchString)
      featureParseErrors.delete(key);
  }

  // clear all existing tags for this feature file
  // (every tag on a line comes from the same file, so the first one speaks for them all)
  for (const [key, tagsOnLine] of featureTags) {
    if (tagsOnLine.length > 0 && uriId(tagsOnLine[0].uri) === fileUriMatchString)
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
          onExampleRow(range, currentOutlineName, examplesTableIndex, examplesRowIndex, examplesName, values,
            currentExamplesTags);
        }
      }
      continue;
    }

    // Check for tags (e.g., @fixture.disable_sensors)
    // tagRe identifies the LINE (anchored, so a step mentioning "@bob" is not a tag),
    // and getTagSpans then reads every tag on it. "@smoke @slow" is ordinary Gherkin
    // and only the first used to be recorded.
    const tagMatch = tagRe.exec(line);
    if (tagMatch) {
      const key = `${uriId(uri)}${sepr}${lineNo}`;
      const tagsOnLine = getTagSpans(line).map(span => {
        const startCol = indentSize + span.start;
        const range = new vscode.Range(
          new vscode.Position(lineNo, startCol),
          new vscode.Position(lineNo, startCol + span.length)
        );
        return new FeatureTag(key, uri, fileName, range, span.tag);
      });
      if (tagsOnLine.length > 0) {
        featureTags.set(key, tagsOnLine);
        // Held until the next block claims them. Several tag LINES can stack up before
        // one scenario, so this accumulates rather than replaces.
        pendingTags.push(...tagsOnLine.map(t => t.tag));
      }
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
      // An Examples block can carry its own tags, on top of the outline's. Its rows
      // inherit the result - a row cannot be tagged individually in Gherkin.
      currentExamplesTags = [...currentOutlineTags, ...takePendingTags()];
      if (onExamplesGroup && currentOutlineName !== undefined) {
        const range = new vscode.Range(new vscode.Position(lineNo, indentSize), new vscode.Position(lineNo, indentSize + line.length));
        onExamplesGroup(range, currentOutlineName, examplesTableIndex, examplesName, currentExamplesTags);
      }
      continue;
    }

    const step = featureFileStepRe.exec(line);
    if (step) {
      inExamplesSection = false;
      const text = step[0].trim();
      const matchText = step[2].trim();
      const keyword = step[1].trim();
      const range = new vscode.Range(new vscode.Position(lineNo, indentSize), new vscode.Position(lineNo, indentSize + step[0].length));

      // Resolve the step type, mirroring behave's parse_step().
      //  - And/But inherit the previous step's type. With no in-container predecessor they
      //    fall back to the enclosing Background's last step type; when there is none behave
      //    raises a ParserError — we record a diagnostic and fall back to "given" so
      //    navigation/mappings keep working instead of discarding the file.
      //  - `*` (generic bullet) also inherits the previous step's type, but as the first
      //    step it defaults to "given" and does NOT consult the Background (unlike And/But).
      //  - Given/When/Then set their own type.
      let stepType: string;
      const keywordLower = keyword.toLowerCase();
      // The Background a leading And/But inherits from: the enclosing Rule's own Background
      // if it has one, otherwise the feature Background.
      const inheritedBackgroundStepType = inRule
        ? (ruleBackgroundLastStepType ?? featureBackgroundLastStepType)
        : featureBackgroundLastStepType;
      if (keywordLower === "and" || keywordLower === "but") {
        if (lastStepType !== undefined) {
          stepType = lastStepType;
        }
        else if (inheritedBackgroundStepType !== undefined) {
          stepType = inheritedBackgroundStepType;
          lastStepType = inheritedBackgroundStepType;
        }
        else {
          recordParseError(uri, fileName, range,
            `'${keyword}' step has no preceding Given/When/Then step (and no Background step to inherit from). behave will fail to parse this feature.`);
          stepType = "given";
        }
      }
      else if (keywordLower === "*") {
        if (lastStepType !== undefined) {
          stepType = lastStepType;
        }
        else {
          stepType = "given";
          lastStepType = "given";
        }
      }
      else {
        stepType = keywordLower;
        lastStepType = keywordLower;
      }

      // Remember the Background's last (resolved) step type so a leading And/But in a
      // following scenario inherits from it, matching behave. Track feature- and
      // Rule-level Backgrounds separately.
      if (inBackground) {
        if (inRule)
          ruleBackgroundLastStepType = stepType;
        else
          featureBackgroundLastStepType = stepType;
      }

      const key = `${uriId(uri)}${sepr}${range.start.line}`;
      featureFileSteps.set(key, new FeatureFileStep(key, uri, fileName, range, text, matchText, stepType));
      fileSteps++;
      continue;
    }

    const background = backgroundRe.exec(line);
    if (background) {
      inBackground = true;
      // A Background starts a fresh step sequence (behave tracks last_step_type from its
      // first step).
      lastStepType = undefined;
      continue;
    }

    const rule = ruleRe.exec(line);
    if (rule) {
      // Entering a Rule: its scenarios inherit the Rule's own Background if present, else
      // the feature Background. Reset the Rule-level Background tracker so a previous Rule's
      // Background does not leak into this one.
      inRule = true;
      inBackground = false;
      ruleBackgroundLastStepType = undefined;
      lastStepType = undefined;
      // A Rule's tags belong to the scenarios inside it, and do NOT carry to a later
      // Rule - so this replaces rather than accumulates.
      ruleOwnTags = takePendingTags();
      continue;
    }

    const scenario = scenarioRe.exec(line);
    if (scenario) {
      // Each scenario starts a fresh step-type context (behave resets last_step_type to
      // None). A leading And/But then inherits the enclosing Background's last step type
      // (resolved when the step is parsed), or — when there's no Background — has nothing to
      // inherit (the invalid case flagged above).
      inBackground = false;
      lastStepType = undefined;
      const scenarioName = scenario[2].trim();
      const isOutline = scenarioOutlineRe.exec(line) !== null;
      const range = new vscode.Range(new vscode.Position(lineNo, indentSize), new vscode.Position(lineNo, indentSize + scenario[0].length));
      // Feature and Rule tags are inherited; the scenario's own come last so the order
      // reads outermost-first.
      const scenarioTags = [...featureOwnTags, ...ruleOwnTags, ...takePendingTags()];
      onScenarioLine(range, scenarioName, isOutline, scenarioTags);
      fileScenarios++;
      // Reset outline tracking
      if (isOutline) {
        currentOutlineName = scenarioName;
        currentOutlineTags = scenarioTags;
        currentExamplesTags = scenarioTags;
        examplesTableIndex = 0;
        inExamplesSection = false;
      } else {
        currentOutlineName = undefined;
        currentOutlineTags = [];
        currentExamplesTags = [];
        inExamplesSection = false;
      }
      continue;
    }

    const feature = featureRe.exec(line);
    if (feature) {
      const range = new vscode.Range(new vscode.Position(lineNo, 0), new vscode.Position(lineNo, line.length));
      // Tags above "Feature:" belong to the feature, and every scenario in it inherits
      // them. Claimed here so they are not also handed to the first scenario twice.
      featureOwnTags = takePendingTags();
      ruleOwnTags = [];
      onFeatureLine(range, featureOwnTags);
      currentOutlineName = undefined;
      currentOutlineTags = [];
      currentExamplesTags = [];
      inExamplesSection = false;
    }

  }

  diagLog(`${caller}: parsed ${fileScenarios} scenarios and ${fileSteps} steps from ${uri.path}`, wkspSettings.uri);
};



