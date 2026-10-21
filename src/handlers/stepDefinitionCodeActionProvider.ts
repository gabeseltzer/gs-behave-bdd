import * as vscode from 'vscode';
import * as fs from 'fs';
import { WorkspaceSettings } from '../settings';
import { basename, getFeaturesRootForFile, getWorkspaceSettingsForFile, isStepsFile, uriId, urisMatch } from '../common';
import { FeatureFileStep, getFeatureFileSteps } from '../parsers/featureParser';
import {
  backgroundRe, featureFileStepRe, featureRe, ruleRe, scenarioOutlineRe, scenarioRe, tableRowRe, textBlockDelimiterRe
} from '../parsers/gherkinPatterns';
import { getStepFileStepForFeatureFileStep } from '../parsers/stepMappings';
import { getStepFileSteps } from '../parsers/stepsParser';
import { buildStepDefinitionEdits, StepDefinitionEdits, StepDefinitionSource } from './stepDefinitionSnippet';
import { STEP_NOT_FOUND } from './stepDiagnostics';
import { handleProviderError } from './providerHelpers';


export const CREATE_STEP_DEFINITION_COMMAND = "gs-behave-bdd.createStepDefinition";


// Quick-fix (lightbulb / ctrl+.) on a step-not-found diagnostic in a feature file. Offers:
//  - "Create step definition in <file>" (preferred): the last steps file the user picked
//    for this workspace, else the best-ranked one (see rankStepsFiles)
//  - "Create step definition in…": a picker over all steps files plus "New steps file…"
// Both run CREATE_STEP_DEFINITION_COMMAND rather than carrying a plain edit, so the target
// file can be opened with the new stub selected (and so the picker can be shown).
export class StepDefinitionCodeActionProvider implements vscode.CodeActionProvider {

  public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  async provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): Promise<vscode.CodeAction[] | undefined> {
    try {
      const notFoundDiags = context.diagnostics.filter(d => d.code === STEP_NOT_FOUND);
      if (notFoundDiags.length === 0)
        return undefined;

      const wkspSettings = getWorkspaceSettingsForFile(document.uri);
      if (!wkspSettings)
        return undefined;

      const ranked = await getRankedStepsFiles(wkspSettings, document.uri);
      const defaultTarget = ranked[0];

      const actions: vscode.CodeAction[] = [];
      for (const diag of notFoundDiags) {
        const line = diag.range.start.line;

        if (defaultTarget) {
          const action = new vscode.CodeAction(
            `Create step definition in ${vscode.workspace.asRelativePath(defaultTarget.uri, false)}`,
            vscode.CodeActionKind.QuickFix
          );
          action.diagnostics = [diag];
          action.isPreferred = true;
          action.command = { title: action.title, command: CREATE_STEP_DEFINITION_COMMAND, arguments: [document.uri, line, defaultTarget.uri] };
          actions.push(action);
        }

        const pickAction = new vscode.CodeAction(
          defaultTarget ? "Create step definition in…" : "Create step definition in a new steps file…",
          vscode.CodeActionKind.QuickFix
        );
        pickAction.diagnostics = [diag];
        pickAction.command = { title: pickAction.title, command: CREATE_STEP_DEFINITION_COMMAND, arguments: [document.uri, line] };
        actions.push(pickAction);
      }

      return actions;
    }
    catch (e: unknown) {
      handleProviderError(e, document.uri);
      return undefined;
    }
  }
}


// Handler for CREATE_STEP_DEFINITION_COMMAND. Without a targetUri, asks the user to pick a
// steps file (or name a new one). New files (isNew) are created but not saved.
export async function createStepDefinitionHandler(featureUri: vscode.Uri, line: number, targetUri?: vscode.Uri, isNew = false) {
  const wkspSettings = getWorkspaceSettingsForFile(featureUri);
  try {
    if (!wkspSettings)
      throw new Error(`no workspace settings found for ${featureUri.fsPath}`);

    const featureDoc = await vscode.workspace.openTextDocument(featureUri);
    const step = getLiveFeatureFileStep(wkspSettings, featureDoc, line);
    if (!step)
      throw new Error(`no step found at line ${line + 1} of ${featureUri.fsPath}`);

    const source = getStepDefinitionSource(featureDoc, step);

    let target: { uri: vscode.Uri; isNew: boolean } | undefined;
    if (targetUri)
      target = { uri: targetUri, isNew };
    else
      target = await pickStepsFile(wkspSettings, featureUri, source.textWithoutType);
    if (!target)
      return;

    await insertStepDefinition(target.uri, target.isNew, source);
    rememberLastTarget(wkspSettings.uri, target.uri);
  }
  catch (e: unknown) {
    // entry point - show error
    handleProviderError(e, featureUri);
  }
}


// The step at `line` of the (possibly unsaved) feature document. The parsed-step cache is
// preferred because it resolves step types exactly like behave (incl. Background
// inheritance), but it can briefly lag the live text while a re-parse is pending, so when the
// cached step no longer matches the line, the step type is resolved from the live text instead.
export function getLiveFeatureFileStep(wkspSettings: WorkspaceSettings, document: vscode.TextDocument,
  line: number): FeatureFileStep | undefined {

  const match = featureFileStepRe.exec(document.lineAt(line).text);
  if (!match)
    return undefined;
  const text = match[0].trim();

  const featuresRoot = getFeaturesRootForFile(wkspSettings, document.uri) ?? wkspSettings.featuresUri;
  const cached = getFeatureFileSteps(featuresRoot)
    .map(([, s]) => s)
    .find(s => urisMatch(s.uri, document.uri) && s.range.start.line === line);
  if (cached && cached.text === text)
    return cached;

  const keyword = match[1].trim().toLowerCase();
  let stepType = keyword === "given" || keyword === "when" || keyword === "then" ? keyword : undefined;
  // and/but/* inherit from the nearest preceding Given/When/Then in the same block
  for (let i = line - 1; i >= 0 && !stepType; i--) {
    const prevText = document.lineAt(i).text;
    if (scenarioRe.test(prevText) || backgroundRe.test(prevText) || ruleRe.test(prevText) || featureRe.test(prevText))
      break;
    const prevKeyword = featureFileStepRe.exec(prevText)?.[1].trim().toLowerCase();
    if (prevKeyword === "given" || prevKeyword === "when" || prevKeyword === "then")
      stepType = prevKeyword;
  }

  const range = new vscode.Range(line, 0, line, match[0].length);
  return new FeatureFileStep(`${uriId(document.uri)}:${line}`, document.uri, basename(document.uri), range,
    text, match[2].trim(), stepType ?? "given");
}


export function getStepDefinitionSource(document: vscode.TextDocument, step: FeatureFileStep): StepDefinitionSource {
  const line = step.range.start.line;

  // walk up to the enclosing scenario to see whether it is an outline
  let inOutline = false;
  for (let i = line - 1; i >= 0; i--) {
    const text = document.lineAt(i).text;
    if (scenarioRe.test(text)) {
      inOutline = scenarioOutlineRe.test(text);
      break;
    }
  }

  // a data table or doc string starts on the next non-blank, non-comment line
  let hasTable = false;
  let hasDocString = false;
  for (let i = line + 1; i < document.lineCount; i++) {
    const text = document.lineAt(i).text;
    if (text.trim() === "" || text.trim().startsWith("#"))
      continue;
    hasTable = tableRowRe.test(text);
    hasDocString = textBlockDelimiterRe.test(text) || /^\s*```/.test(text);
    break;
  }

  return {
    stepType: step.stepType,
    stepText: step.text,
    textWithoutType: step.textWithoutType,
    inOutline,
    hasTable,
    hasDocString,
  };
}


// Applies the stub (and any behave import fix-up) to the target file, then opens it with the
// stub's raise statement selected, ready to be replaced with the real implementation.
export async function insertStepDefinition(targetUri: vscode.Uri, isNew: boolean, source: StepDefinitionSource) {
  const edit = new vscode.WorkspaceEdit();
  let edits: StepDefinitionEdits;

  if (isNew) {
    edits = buildStepDefinitionEdits(source, "");
    const importText = edits.importEdit ? `${edits.importEdit.text}\n` : "";
    edit.createFile(targetUri, { ignoreIfExists: false });
    edit.insert(targetUri, new vscode.Position(0, 0), importText + edits.appendText);
  }
  else {
    const targetDoc = await vscode.workspace.openTextDocument(targetUri);
    edits = buildStepDefinitionEdits(source, targetDoc.getText());
    addStepDefinitionEdits(edit, targetDoc, edits);
  }

  if (!await vscode.workspace.applyEdit(edit))
    throw new Error(`could not add the step definition to ${targetUri.fsPath}`);

  const targetDoc = await vscode.workspace.openTextDocument(targetUri);
  const editor = await vscode.window.showTextDocument(targetDoc, { preview: false });
  const offset = targetDoc.getText().lastIndexOf(edits.raiseStatement);
  if (offset !== -1) {
    const range = new vscode.Range(targetDoc.positionAt(offset), targetDoc.positionAt(offset + edits.raiseStatement.length));
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }
}


// Adds the import fix-up and the appended stub to a workspace edit for an existing document.
// The import is added first so that, when both land at the end of the file, it precedes the stub.
export function addStepDefinitionEdits(edit: vscode.WorkspaceEdit, targetDoc: vscode.TextDocument, edits: StepDefinitionEdits) {
  const uri = targetDoc.uri;
  const end = targetDoc.lineAt(targetDoc.lineCount - 1).range.end;

  if (edits.importEdit) {
    const { line, replace, text } = edits.importEdit;
    if (replace)
      edit.replace(uri, targetDoc.lineAt(line).range, text);
    else if (line < targetDoc.lineCount)
      edit.insert(uri, new vscode.Position(line, 0), `${text}\n`);
    else
      edit.insert(uri, end, `\n${text}`);
  }

  edit.insert(uri, end, edits.appendText);
}


// --- choosing the target steps file ---

export interface RankedStepsFile {
  uri: vscode.Uri;
  defCount: number;
  group: "recent" | "related" | "other";
}

// Orders candidate steps files: the last one picked, then files that already define other
// steps used by this feature file, then the rest - each group by definition count (desc),
// then path.
export function rankStepsFiles(candidates: vscode.Uri[], defCounts: Map<string, number>,
  relatedIds: Set<string>, lastUsedId: string | undefined): RankedStepsFile[] {

  const groupOrder = { recent: 0, related: 1, other: 2 };
  const ranked: RankedStepsFile[] = candidates.map(uri => {
    const id = uriId(uri);
    const group = id === lastUsedId ? "recent" : relatedIds.has(id) ? "related" : "other";
    return { uri, defCount: defCounts.get(id) ?? 0, group };
  });

  return ranked.sort((a, b) =>
    groupOrder[a.group] - groupOrder[b.group] ||
    b.defCount - a.defCount ||
    a.uri.path.localeCompare(b.uri.path));
}


export async function getRankedStepsFiles(wkspSettings: WorkspaceSettings, featureUri: vscode.Uri): Promise<RankedStepsFile[]> {
  const featuresRoot = getFeaturesRootForFile(wkspSettings, featureUri) ?? wkspSettings.featuresUri;
  const rootIndex = wkspSettings.featuresUris.findIndex(u => u.toString() === featuresRoot.toString());
  const stepsSearchUri = wkspSettings.stepsSearchUris[rootIndex] ?? wkspSettings.stepsSearchUri;

  const candidates = new Map<string, vscode.Uri>();
  const defCounts = new Map<string, number>();
  for (const [, stepDef] of getStepFileSteps(featuresRoot)) {
    if (!isStepsFile(stepDef.uri))
      continue;
    const id = uriId(stepDef.uri);
    candidates.set(id, stepDef.uri);
    defCounts.set(id, (defCounts.get(id) ?? 0) + 1);
  }

  // steps files with no definitions yet (e.g. one just created) are still valid targets
  const pyFiles = await vscode.workspace.findFiles(new vscode.RelativePattern(stepsSearchUri, "**/steps/*.py"), undefined, 500);
  for (const uri of pyFiles) {
    if (isStepsFile(uri) && !uri.path.endsWith("/__init__.py") && !candidates.has(uriId(uri)))
      candidates.set(uriId(uri), uri);
  }

  const relatedIds = new Set<string>();
  for (const [, step] of getFeatureFileSteps(featuresRoot)) {
    if (step.uri.toString() !== featureUri.toString())
      continue;
    const stepDef = getStepFileStepForFeatureFileStep(step.uri, step.range.start.line);
    if (stepDef)
      relatedIds.add(uriId(stepDef.uri));
  }

  const lastUsed = getLastTarget(wkspSettings.uri);
  const lastUsedId = lastUsed && candidates.has(uriId(lastUsed)) ? uriId(lastUsed) : undefined;

  return rankStepsFiles([...candidates.values()], defCounts, relatedIds, lastUsedId);
}


const NEW_FILE_ITEM_LABEL = "$(new-file) New steps file…";
const groupLabels = { recent: "recently used", related: "used by this feature", other: "steps files" };

async function pickStepsFile(wkspSettings: WorkspaceSettings, featureUri: vscode.Uri,
  stepText: string): Promise<{ uri: vscode.Uri; isNew: boolean } | undefined> {

  const ranked = await getRankedStepsFiles(wkspSettings, featureUri);

  type Item = vscode.QuickPickItem & { uri?: vscode.Uri };
  const items: Item[] = [];
  let lastGroup: string | undefined;
  for (const file of ranked) {
    if (file.group !== lastGroup) {
      items.push({ label: groupLabels[file.group], kind: vscode.QuickPickItemKind.Separator });
      lastGroup = file.group;
    }
    const relDir = vscode.workspace.asRelativePath(vscode.Uri.joinPath(file.uri, ".."), false);
    items.push({
      label: `$(file) ${basename(file.uri)}`,
      description: `${relDir} · ${file.defCount} step${file.defCount === 1 ? "" : "s"}`,
      uri: file.uri,
    });
  }
  if (items.length > 0)
    items.push({ label: "", kind: vscode.QuickPickItemKind.Separator });
  items.push({ label: NEW_FILE_ITEM_LABEL });

  const picked = await vscode.window.showQuickPick(items, {
    title: "Create Step Definition",
    placeHolder: `Choose a steps file for "${stepText}"`,
    matchOnDescription: true,
  });
  if (!picked)
    return undefined;
  if (picked.uri)
    return { uri: picked.uri, isNew: false };

  const stepsDir = ranked.length > 0
    ? vscode.Uri.joinPath(ranked[0].uri, "..")
    : getDefaultStepsDir(wkspSettings, featureUri);
  const newUri = await promptForNewStepsFile(stepsDir, featureUri);
  return newUri ? { uri: newUri, isNew: true } : undefined;
}


function getDefaultStepsDir(wkspSettings: WorkspaceSettings, featureUri: vscode.Uri): vscode.Uri {
  const featuresRoot = getFeaturesRootForFile(wkspSettings, featureUri) ?? wkspSettings.featuresUri;
  const rootIndex = wkspSettings.featuresUris.findIndex(u => u.toString() === featuresRoot.toString());
  const stepsSearchUri = wkspSettings.stepsSearchUris[rootIndex] ?? wkspSettings.stepsSearchUri;
  return vscode.Uri.joinPath(stepsSearchUri, "steps");
}


async function promptForNewStepsFile(stepsDir: vscode.Uri, featureUri: vscode.Uri): Promise<vscode.Uri | undefined> {
  const featureStem = basename(featureUri).replace(/\.feature$/i, "").replace(/\W+/g, "_").toLowerCase();
  const defaultName = `${featureStem}_steps.py`;

  const name = await vscode.window.showInputBox({
    title: "New Steps File",
    prompt: `Create in ${vscode.workspace.asRelativePath(stepsDir, false)}`,
    value: defaultName,
    valueSelection: [0, defaultName.length - ".py".length],
    validateInput: value => validateNewStepsFileName(value, stepsDir),
  });
  if (!name)
    return undefined;
  return vscode.Uri.joinPath(stepsDir, name.trim());
}


export function validateNewStepsFileName(value: string, stepsDir: vscode.Uri): string | undefined {
  const name = value.trim();
  if (!/^[A-Za-z_][\w-]*\.py$/.test(name))
    return "Enter a python file name, e.g. login_steps.py (behave only loads files directly in the steps folder)";
  if (fs.existsSync(vscode.Uri.joinPath(stepsDir, name).fsPath))
    return `${name} already exists - pick it from the list instead`;
  return undefined;
}


// --- last-picked target, remembered per workspace folder ---

let workspaceStateRef: vscode.Memento | undefined;
const lastTargetKey = (wkspUri: vscode.Uri) => `gs-behave-bdd.lastStepDefinitionTarget:${wkspUri.toString()}`;

export function initStepDefinitionTargetMemory(workspaceState: vscode.Memento) {
  workspaceStateRef = workspaceState;
}

function getLastTarget(wkspUri: vscode.Uri): vscode.Uri | undefined {
  const value = workspaceStateRef?.get<string>(lastTargetKey(wkspUri));
  return value ? vscode.Uri.parse(value) : undefined;
}

function rememberLastTarget(wkspUri: vscode.Uri, targetUri: vscode.Uri) {
  workspaceStateRef?.update(lastTargetKey(wkspUri), targetUri.toString());
}
