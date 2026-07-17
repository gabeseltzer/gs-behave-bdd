import * as vscode from 'vscode';
import { couldBePythonStepsFile, getWorkspaceSettingsForFile } from '../common';
import { executeStepsKeywordRe } from '../parsers/gherkinPatterns';
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

// Pure range computation (exported for unit tests): for each matched call step whose step
// definition contains {param} wildcards, locate the wildcard-matched spans inside the
// embedded step text. Mirrors semHighlightProvider._parseDoc's grouped-wildcard approach.
export function computeParamRanges(matches: { callStep: ExecuteStepsCallStep; stepFileStep: StepFileStep | null }[]): vscode.Range[] {
  const ranges: vscode.Range[] = [];

  for (const { callStep, stepFileStep } of matches) {
    if (!stepFileStep || !stepFileStep.textAsRe.includes(parseRepWildcard))
      continue;

    const grpWldText = stepFileStep.textAsRe.replaceAll(parseRepWildcard, `(${parseRepWildcard})`);
    const wcMatches = new RegExp(grpWldText).exec(callStep.text);
    if (!wcMatches || wcMatches.length < 2)
      continue;

    wcMatches.shift();
    for (let match of wcMatches) {
      // a leading wildcard can swallow the step keyword - strip it before locating the span
      if (stepFileStep.textAsRe.startsWith(parseRepWildcard)) {
        const m = executeStepsKeywordRe.exec(callStep.text);
        if (m)
          match = match.replace(m[1], "").trim();
      }
      if (!match)
        continue;

      const idx = callStep.text.indexOf(match);
      if (idx === -1)
        continue;

      const line = callStep.range.start.line;
      const startCol = callStep.range.start.character + idx;
      ranges.push(new vscode.Range(line, startCol, line, startCol + match.length));
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
    editor.setDecorations(getParamDecorationType(), computeParamRanges(matches));
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
