import * as vscode from "vscode";
import { getWorkspaceSettingsForFile, isFeatureFile } from "../common";
import { getFixtureByTag, getFixtures } from "../parsers/fixtureParser";
import { getFeatureTags } from "../parsers/featureParser";
import { config } from "../configuration";

export function validateFixtureTags(document: vscode.TextDocument): void {
  try {
    if (!isFeatureFile(document.uri)) {
      return;
    }

    const wkspSettings = getWorkspaceSettingsForFile(document.uri);
    if (!wkspSettings) {
      return;
    }

    const diagnostics: vscode.Diagnostic[] = [];
    const tags = getFeatureTags(wkspSettings.featuresUri).filter(t => t.uri.toString() === document.uri.toString());
    const availableFixtures = getFixtures(wkspSettings.featuresUri);

    for (const tag of tags) {
      if (!tag.tag.startsWith('fixture.')) {
        continue;
      }

      const fixture = getFixtureByTag(wkspSettings.featuresUri, tag.tag);
      if (!fixture) {
        // Extract fixture name for better error message
        let fixtureName = tag.tag.substring('fixture.'.length);
        const paramMatch = fixtureName.match(/^use\(['"]([^'"]+)['"]\)$/);
        if (paramMatch) {
          fixtureName = paramMatch[1];
        }

        const diagnostic = new vscode.Diagnostic(
          tag.range,
          `Fixture '${fixtureName}' not found in environment.py`,
          vscode.DiagnosticSeverity.Error
        );
        diagnostic.code = 'fixture-not-found';

        // Provide available fixtures as suggestions
        if (availableFixtures.length > 0) {
          const availableNames = availableFixtures.map(f => `@fixture.${f.name}`).join(', ');
          diagnostic.relatedInformation = [
            new vscode.DiagnosticRelatedInformation(
              new vscode.Location(tag.uri, tag.range),
              `Available fixtures: ${availableNames}`
            )
          ];
        }

        diagnostics.push(diagnostic);
      }
    }

    // Preserve existing non-fixture diagnostics (e.g., step diagnostics)
    const existingDiagnostics = config.diagnostics.get(document.uri) || [];
    const nonFixtureDiagnostics = [...existingDiagnostics].filter(d => d.code !== 'fixture-not-found');
    config.diagnostics.set(document.uri, [...nonFixtureDiagnostics, ...diagnostics]);
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

export function clearFixtureDiagnostics(uri: vscode.Uri): void {
  const existingDiagnostics = config.diagnostics.get(uri) || [];
  const nonFixtureDiagnostics = [...existingDiagnostics].filter(d => d.code !== 'fixture-not-found');
  config.diagnostics.set(uri, nonFixtureDiagnostics);
}
