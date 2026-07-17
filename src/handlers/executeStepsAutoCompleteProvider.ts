import * as vscode from 'vscode';
import { couldBePythonStepsFile, getWorkspaceSettingsForFile, getWorkspaceUriForFile, sepr } from '../common';
import { config } from '../configuration';
import { executeStepsKeywordRe } from '../parsers/gherkinPatterns';
import { scanExecuteSteps } from '../parsers/executeStepsParser';
import { buildStepCompletionItems } from './autoCompleteProvider';


// Step auto-completion inside context.execute_steps("...") string literals - the same
// suggestions the gherkin autoCompleteProvider offers in feature files (typing "And" after
// a "When" only suggests @when/@step definitions, etc). Registered for "python":
// contributes ONLY when the cursor is on an embedded step of an execute_steps literal
// (confirmed by a live scan of the document text), so it stays silent everywhere Pylance
// operates. Unlike the gherkin provider, steps here can start mid-line (single-line
// literals, text on the opening-delimiter line), so matching anchors on the scanned call
// step - whose stepType already has behave's And/But/* inheritance applied - rather than
// on the line start.
export const executeStepsAutoCompleteProvider = {
  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] | undefined {
    try {
      if (!couldBePythonStepsFile(document.uri))
        return;

      const wkspSettings = getWorkspaceSettingsForFile(document.uri);
      if (!wkspSettings)
        return;

      // Scan the LIVE document text (the cache lags typing by the 500ms debounce)
      const { callSteps } = scanExecuteSteps(document.getText(), document.uri);
      const callStep = callSteps.find(cs =>
        cs.range.start.line === position.line && position.character >= cs.range.start.character);
      if (!callStep)
        return;

      const keywordMatch = executeStepsKeywordRe.exec(callStep.text);
      if (!keywordMatch)
        return;

      // the scanner already resolved And/But/* to the concrete inherited type
      const stepType = callStep.stepType.toLowerCase();
      const textWithoutType = callStep.textWithoutType.trim().toLowerCase();

      const matchText1 = `^${stepType}${sepr}${textWithoutType}`;
      const matchText2 = `^step${sepr}${textWithoutType}`;

      // Replace from after the typed step keyword to the end of the embedded step text
      // (NOT to the end of line - a single-line literal's closing quote must survive)
      const keywordLength = callStep.text.length - keywordMatch[2].length;
      const replaceRange = new vscode.Range(
        position.line,
        callStep.range.start.character + keywordLength,
        position.line,
        callStep.range.end.character
      );

      return buildStepCompletionItems(wkspSettings.featuresUri, matchText1, matchText2, replaceRange);
    }
    catch (e: unknown) {
      // entry point function (handler) - show error
      try {
        const wkspUri = getWorkspaceUriForFile(document.uri);
        config.logger.showError(e, wkspUri);
      }
      catch {
        config.logger.showError(e);
      }
    }
  }
};
