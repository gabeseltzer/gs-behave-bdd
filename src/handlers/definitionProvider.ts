import * as vscode from "vscode";
import { validateAndGetStepInfo, handleProviderError } from "./providerHelpers";


export class DefinitionProvider implements vscode.DefinitionProvider {
  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Location | vscode.LocationLink[] | undefined> {
    try {
      const stepInfo = await validateAndGetStepInfo(document, position);
      if (!stepInfo) {
        return undefined;
      }

      const { stepFileStep, stepRange } = stepInfo;

      // Return a LocationLink with originSelectionRange to control the underlined span
      return [{
        originSelectionRange: stepRange,
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
