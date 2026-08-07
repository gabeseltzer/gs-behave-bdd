import * as vscode from 'vscode';
import { config } from "../configuration";
import { getWorkspaceUriForFile, isFeatureFile, openDocumentRange } from '../common';
import { getStepFileStepForFeatureFileStep, waitOnReadyForStepsNavigation } from '../parsers/stepMappings';
import { featureFileStepRe } from '../parsers/gherkinPatterns';
import { logStepResolutionContext } from './providerHelpers';



export async function gotoStepHandler(textEditor: vscode.TextEditor) {

  const docUri = textEditor.document.uri;

  try {

    if (!docUri || !isFeatureFile(docUri)) {
      // this should never happen - command availability context is controlled by package.json editor/context
      throw `Go to step definition must be used from a feature file, uri was: ${docUri}`;
    }

    const lineNo = textEditor.selection.active.line;
    const lineText = textEditor.document.lineAt(lineNo).text.trim();
    const stExec = featureFileStepRe.exec(lineText);
    if (!stExec) {
      config.logger.logVerbose(
        `gotoStep: line ${lineNo + 1} of ${docUri.fsPath} is not a step line: "${lineText}"`, getWorkspaceUriForFile(docUri));
      vscode.window.showInformationMessage(`Selected line is not a step.`);
      return;
    }

    if (!await waitOnReadyForStepsNavigation(500, docUri)) {
      config.logger.logVerbose(
        `gotoStep: gave up for "${lineText}" - step files were still being parsed after 500ms`, getWorkspaceUriForFile(docUri));
      return;
    }

    const stepFileStep = getStepFileStepForFeatureFileStep(docUri, lineNo);

    if (!stepFileStep) {
      config.logger.logVerbose(
        `gotoStep: no step definition mapped to "${lineText}" (line ${lineNo + 1} of ${docUri.fsPath}).\n` +
        logStepResolutionContext(docUri),
        getWorkspaceUriForFile(docUri));
      vscode.window.showInformationMessage(`Step '${lineText}' not found.`);
      return;
    }

    await openDocumentRange(stepFileStep.uri, stepFileStep.functionDefinitionRange, false);
  }
  catch (e: unknown) {
    // entry point function (handler) - show error  
    try {
      const wkspUri = getWorkspaceUriForFile(docUri);
      config.logger.showError(e, wkspUri);
    }
    catch {
      config.logger.showError(e);
    }
  }

}
