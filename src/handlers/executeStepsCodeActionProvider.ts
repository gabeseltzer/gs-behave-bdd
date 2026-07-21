import * as vscode from 'vscode';
import { couldBePythonStepsFile, isStepsFile, getWorkspaceSettingsForFile, uriId, urisMatch } from '../common';
import { executeStepsKeywordRe } from '../parsers/gherkinPatterns';
import { scanExecuteSteps } from '../parsers/executeStepsParser';
import { getStepFileSteps } from '../parsers/stepsParser';
import { EXECUTE_STEPS_STEP_NOT_FOUND } from './executeStepsDiagnostics';
import { handleProviderError } from './providerHelpers';


// Quick-fix (lightbulb / ctrl+.) on an execute-steps-step-not-found diagnostic that
// scaffolds a step-definition skeleton, following behave's own undefined-step snippet
// shape (def step_impl + raise NotImplementedError). The skeleton is appended to the
// current file when it is itself a steps file (behave registers everything under steps/),
// otherwise to the workspace's largest steps file.
export class ExecuteStepsCodeActionProvider implements vscode.CodeActionProvider {

  public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  async provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): Promise<vscode.CodeAction[] | undefined> {
    try {
      if (!couldBePythonStepsFile(document.uri))
        return undefined;

      const notFoundDiags = context.diagnostics.filter(d => d.code === EXECUTE_STEPS_STEP_NOT_FOUND);
      if (notFoundDiags.length === 0)
        return undefined;

      const wkspSettings = getWorkspaceSettingsForFile(document.uri);
      if (!wkspSettings)
        return undefined;

      const targetUri = pickTargetStepsFile(document.uri, wkspSettings.featuresUri);
      if (!targetUri)
        return undefined;

      // live scan so and/but/* step types are resolved for the decorator choice
      const { callSteps } = scanExecuteSteps(document.getText(), document.uri);

      const actions: vscode.CodeAction[] = [];
      for (const diag of notFoundDiags) {
        const stepText = document.getText(diag.range);
        const keywordMatch = executeStepsKeywordRe.exec(stepText);
        if (!keywordMatch)
          continue;

        const callStep = callSteps.find(cs => cs.range.start.line === diag.range.start.line);
        const stepType = callStep?.stepType ?? 'step';
        const textWithoutType = (callStep?.textWithoutType ?? keywordMatch[2]).trim();
        if (!textWithoutType)
          continue;

        const action = new vscode.CodeAction(
          `Create step definition "${textWithoutType}"`,
          vscode.CodeActionKind.QuickFix
        );
        action.diagnostics = [diag];
        action.isPreferred = true;

        const targetDoc = await vscode.workspace.openTextDocument(targetUri);
        const insertPos = new vscode.Position(targetDoc.lineCount, 0);
        const separator = targetDoc.getText().endsWith('\n') ? '\n' : '\n\n';
        const escapedText = textWithoutType.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
        const snippet =
          `${separator}\n` +
          `@${stepType}("${escapedText}")\n` +
          `def step_impl(context):\n` +
          `    raise NotImplementedError("STEP: ${stepType} ${escapedText}")\n`;

        const edit = new vscode.WorkspaceEdit();
        edit.insert(targetUri, insertPos, snippet);
        action.edit = edit;

        actions.push(action);
      }

      return actions.length > 0 ? actions : undefined;
    }
    catch (e: unknown) {
      handleProviderError(e, document.uri);
      return undefined;
    }
  }
}


// The current file when it is a steps file; otherwise the workspace steps file with the
// most step definitions (deterministic tie-break: lowest uri).
export function pickTargetStepsFile(currentUri: vscode.Uri, featuresUri: vscode.Uri): vscode.Uri | undefined {
  if (isStepsFile(currentUri))
    return currentUri;

  const defCountsByUri = new Map<string, { uri: vscode.Uri; count: number }>();
  for (const [, stepDef] of getStepFileSteps(featuresUri)) {
    if (!isStepsFile(stepDef.uri) || urisMatch(stepDef.uri, currentUri))
      continue;
    const id = uriId(stepDef.uri);
    const entry = defCountsByUri.get(id);
    if (entry)
      entry.count++;
    else
      defCountsByUri.set(id, { uri: stepDef.uri, count: 1 });
  }

  let best: { uri: vscode.Uri; count: number } | undefined;
  for (const entry of defCountsByUri.values()) {
    if (!best || entry.count > best.count ||
      (entry.count === best.count && uriId(entry.uri) < uriId(best.uri)))
      best = entry;
  }
  return best?.uri;
}
