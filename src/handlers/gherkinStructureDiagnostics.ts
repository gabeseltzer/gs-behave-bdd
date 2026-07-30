import * as vscode from "vscode";
import { getWorkspaceSettingsForFile, isFeatureFile } from "../common";
import { getFeatureParseErrors } from "../parsers/featureParser";
import { config } from "../configuration";

const GHERKIN_STRUCTURE_CODE = "invalid-and-but-step";

// Surfaces Gherkin structural problems found during feature-file parsing (currently:
// an And/But step with no preceding Given/When/Then and no Background step to inherit a
// step type from). behave rejects such files outright with a ParserError; we parse them
// leniently but flag the problem here as an Error so the user sees why behave would fail.
export function validateGherkinStructure(document: vscode.TextDocument): void {
  try {
    if (!isFeatureFile(document.uri)) {
      return;
    }

    const wkspSettings = getWorkspaceSettingsForFile(document.uri);
    if (!wkspSettings) {
      return;
    }

    const structureDiagnostics: vscode.Diagnostic[] = [];
    const parseErrors = wkspSettings.featuresUris.flatMap(u => getFeatureParseErrors(u))
      .filter(e => e.uri.toString() === document.uri.toString());

    for (const parseError of parseErrors) {
      const diagnostic = new vscode.Diagnostic(
        parseError.range,
        parseError.message,
        vscode.DiagnosticSeverity.Error
      );
      diagnostic.code = GHERKIN_STRUCTURE_CODE;
      diagnostic.source = 'gs-behave-bdd';
      structureDiagnostics.push(diagnostic);
    }

    // Preserve existing non-structure diagnostics (e.g. step/fixture diagnostics)
    const existingDiagnostics = config.diagnostics.get(document.uri) || [];
    const otherDiagnostics = [...existingDiagnostics].filter(d => d.code !== GHERKIN_STRUCTURE_CODE);
    config.diagnostics.set(document.uri, [...otherDiagnostics, ...structureDiagnostics]);
  }
  catch (e: unknown) {
    try {
      const wkspSettings = getWorkspaceSettingsForFile(document.uri);
      config.logger.showError(e, wkspSettings?.uri);
    }
    catch {
      config.logger.showError(e);
    }
  }
}

export function clearGherkinStructureDiagnostics(uri: vscode.Uri): void {
  const existingDiagnostics = config.diagnostics.get(uri) || [];
  const otherDiagnostics = [...existingDiagnostics].filter(d => d.code !== GHERKIN_STRUCTURE_CODE);
  config.diagnostics.set(uri, otherDiagnostics);
}
