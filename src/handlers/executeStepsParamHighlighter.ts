import * as vscode from 'vscode';
import { couldBePythonStepsFile, getWorkspaceSettingsForFile } from '../common';
import { executeStepsKeywordRe, getStepParamSpans, getStepTextColumn } from '../parsers/gherkinPatterns';
import { getStepArgumentSpans } from '../parsers/stepArgumentStore';
import { ExecuteStepsCallStep } from '../parsers/executeStepsParser';
import { matchExecuteStepsContent } from '../parsers/stepMappings';
import { StepFileStep, parseRepWildcard } from '../parsers/stepsParser';
import { parser } from '../extension';
import { diagLog, DiagLogType } from '../logger';

// Highlights step {parameter} values inside execute_steps("...") strings, matching the
// gherkin semantic highlighting of feature-file step parameters (semHighlightProvider.ts).
//
// NOTE: this deliberately uses editor DECORATIONS, not a DocumentSemanticTokensProvider.
// VS Code only honors ONE semantic tokens provider per document, so registering one for
// "python" would displace Pylance's semantic highlighting. Decorations layer on top of any
// existing highlighting. The color is the contributed theme color
// `gsBehaveBdd.executeStepsParameter` (customizable via workbench.colorCustomizations).

let paramDecorationType: vscode.TextEditorDecorationType | undefined;

function getParamDecorationType(): vscode.TextEditorDecorationType {
  if (!paramDecorationType) {
    paramDecorationType = vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor('gsBehaveBdd.executeStepsParameter'),
    });
  }
  return paramDecorationType;
}

export function disposeExecuteStepsParamDecorations(): void {
  paramDecorationType?.dispose();
  paramDecorationType = undefined;
}

// Range computation (exported for unit tests): for each matched call step, the arguments behave
// would pass (when featuresUri's definitions were described by behave), otherwise the spans the
// step definition's {param} wildcards match. Mirrors semHighlightProvider._parseDoc.
export function computeParamRanges(matches: { callStep: ExecuteStepsCallStep; stepFileStep: StepFileStep | null }[],
  featuresUri?: vscode.Uri): vscode.Range[] {
  const ranges: vscode.Range[] = [];

  for (const { callStep, stepFileStep } of matches) {
    const spans = stepFileStep && featuresUri
      && getStepArgumentSpans(featuresUri, callStep.stepType, callStep.textWithoutType);
    const textColumn = getStepTextColumn(callStep.text, callStep.textWithoutType, executeStepsKeywordRe);
    if (spans && textColumn !== undefined) {
      const line = callStep.range.start.line;
      const startCol = callStep.range.start.character + textColumn;
      for (const span of spans)
        ranges.push(new vscode.Range(line, startCol + span.start, line, startCol + span.end));
      continue;
    }

    if (!stepFileStep || !stepFileStep.textAsRe.includes(parseRepWildcard))
      continue;

    const grpWldText = stepFileStep.textAsRe.replaceAll(parseRepWildcard, `(${parseRepWildcard})`);

    for (const span of getStepParamSpans(callStep.text, grpWldText, executeStepsKeywordRe)) {
      const line = callStep.range.start.line;
      const startCol = callStep.range.start.character + span.start;
      ranges.push(new vscode.Range(line, startCol, line, startCol + span.length));
    }
  }

  return ranges;
}

// Recomputes and applies parameter decorations for one editor. Scans the LIVE document
// text (same as executeStepsDiagnostics) so highlights track typing ahead of the debounce.
// Self-catching (like the diagnostics validators) - it is invoked from several event
// handlers and a decoration failure should never break them.
export function updateExecuteStepsParamDecorations(editor: vscode.TextEditor): void {
  try {
    if (!couldBePythonStepsFile(editor.document.uri))
      return;

    if (!parser.initialStepsParseComplete)
      return;

    const wkspSettings = getWorkspaceSettingsForFile(editor.document.uri);
    if (!wkspSettings)
      return;

    const { matches } = matchExecuteStepsContent(wkspSettings.featuresUri, editor.document.uri, editor.document.getText());
    editor.setDecorations(getParamDecorationType(), computeParamRanges(matches, wkspSettings.featuresUri));
  }
  catch (e: unknown) {
    // not worth a user-facing error for a highlight failure - log it
    diagLog(`updateExecuteStepsParamDecorations: ${e}`, undefined, DiagLogType.warn);
  }
}

// Refreshes decorations in every visible editor showing a watched .py file.
export function refreshAllExecuteStepsParamDecorations(): void {
  for (const editor of vscode.window.visibleTextEditors) {
    updateExecuteStepsParamDecorations(editor);
  }
}
