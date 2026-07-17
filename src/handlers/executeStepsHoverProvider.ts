import * as vscode from "vscode";
import { couldBePythonStepsFile } from "../common";
import { getExecuteStepsCallStepAtLine } from "../parsers/executeStepsParser";
import { getStepFileStepForExecuteStep, waitOnReadyForStepsNavigation } from "../parsers/stepMappings";
import { buildStepHoverContent } from "./hoverProvider";
import { handleProviderError } from "./providerHelpers";


// Hover info for embedded steps inside context.execute_steps("...") string literals -
// shows the same decorator + docstring content the gherkin HoverProvider shows for
// feature-file steps. Registered for "python": contributes ONLY when the cursor is on
// the embedded step text of a scanned call site, so Pylance hovers are unaffected
// (hover providers merge across extensions, unlike semantic token providers).
export class ExecuteStepsHoverProvider implements vscode.HoverProvider {
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | undefined> {
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

      const hoverContent = await buildStepHoverContent(stepFileStep, document.uri);
      if (!hoverContent) {
        return undefined;
      }

      return new vscode.Hover(hoverContent, callStep.range);
    }
    catch (e: unknown) {
      handleProviderError(e, document.uri);
      return undefined;
    }
  }
}
