import * as vscode from "vscode";
import { couldBePythonStepsFile } from "../common";
import { getExecuteStepsCallStepAtLine } from "../parsers/executeStepsParser";
import { getStepFileStepForExecuteStep, waitOnReadyForStepsNavigation } from "../parsers/stepMappings";
import { handleProviderError } from "./providerHelpers";


// Go-to-definition (F12 / ctrl+click) from an embedded step line inside a
// context.execute_steps("...") string literal to the matching step definition function.
// Registered for the "python" language: it contributes ONLY when the cursor is on the
// embedded step text of a scanned call site, and returns undefined everywhere else so
// other python providers (e.g. Pylance) are unaffected.
export class ExecuteStepsDefinitionProvider implements vscode.DefinitionProvider {
  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Location | vscode.LocationLink[] | undefined> {
    try {
      if (!couldBePythonStepsFile(document.uri)) {
        return undefined;
      }

      const callStep = getExecuteStepsCallStepAtLine(document.uri, position.line);
      if (!callStep || !callStep.range.contains(position)) {
        return undefined;
      }

      if (!await waitOnReadyForStepsNavigation(500, document.uri)) {
        return undefined;
      }

      const stepFileStep = getStepFileStepForExecuteStep(document.uri, position.line);
      if (!stepFileStep) {
        return undefined;
      }

      // Return a LocationLink with originSelectionRange to control the underlined span
      return [{
        originSelectionRange: callStep.range,
        targetUri: stepFileStep.uri,
        targetRange: stepFileStep.functionDefinitionRange,
        targetSelectionRange: stepFileStep.functionDefinitionRange
      }];
    }
    catch (e: unknown) {
      handleProviderError(e, document.uri);
      return undefined;
    }
  }
}
