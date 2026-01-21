import * as vscode from "vscode";
import { getWorkspaceSettingsForFile, isFeatureFile } from "../common";
import { getFixtureByTag } from "../parsers/fixtureParser";
import { getFeatureTagByPosition } from "../parsers/featureParser";
import { config } from "../configuration";

export class FixtureDefinitionProvider implements vscode.DefinitionProvider {
  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Location | vscode.LocationLink[] | undefined> {
    try {
      const docUri = document.uri;

      if (!docUri || !isFeatureFile(docUri)) {
        return undefined;
      }

      const featureTag = getFeatureTagByPosition(docUri, position);
      console.log('[FixtureDefinitionProvider] position:', position, 'featureTag:', featureTag);

      if (!featureTag || !featureTag.tag.startsWith('fixture.')) {
        console.log('[FixtureDefinitionProvider] No fixture tag or does not start with fixture.');
        return undefined;
      }

      const wkspSettings = getWorkspaceSettingsForFile(docUri);
      if (!wkspSettings) {
        console.log('[FixtureDefinitionProvider] No workspace settings found.');
        return undefined;
      }

      const fixture = getFixtureByTag(wkspSettings.featuresUri, featureTag.tag);
      console.log('[FixtureDefinitionProvider] Lookup for tag "' + featureTag.tag + '" result:', fixture);
      if (!fixture) {
        console.log('[FixtureDefinitionProvider] Fixture not found.');
        return undefined;
      }

      console.log('[FixtureDefinitionProvider] Returning location link.');
      return [{
        originSelectionRange: featureTag.range,
        targetUri: fixture.uri,
        targetRange: fixture.functionDefinitionRange,
        targetSelectionRange: fixture.functionDefinitionRange
      }];
    }
    catch (e: unknown) {
      try {
        const wkspSettings = getWorkspaceSettingsForFile(document.uri);
        config.logger.showError(e, wkspSettings?.uri);
      }
      catch {
        config.logger.showError(e);
      }
      return undefined;
    }
  }
}

export class FixtureHoverProvider implements vscode.HoverProvider {
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | undefined> {
    try {
      const docUri = document.uri;

      if (!docUri || !isFeatureFile(docUri)) {
        return undefined;
      }

      const featureTag = getFeatureTagByPosition(docUri, position);
      console.log('[FixtureHoverProvider] position:', position, 'featureTag:', featureTag);

      if (!featureTag || !featureTag.tag.startsWith('fixture.')) {
        console.log('[FixtureHoverProvider] No fixture tag or does not start with fixture.');
        return undefined;
      }

      const wkspSettings = getWorkspaceSettingsForFile(docUri);
      if (!wkspSettings) {
        console.log('[FixtureHoverProvider] No workspace settings found.');
        return undefined;
      }

      const fixture = getFixtureByTag(wkspSettings.featuresUri, featureTag.tag);
      console.log('[FixtureHoverProvider] Lookup for tag "' + featureTag.tag + '" result:', fixture);
      if (!fixture) {
        console.log('[FixtureHoverProvider] Fixture not found.');
        return undefined;
      }

      const hoverContent = new vscode.MarkdownString();

      // Extract actual fixture name for display
      const displayTag = featureTag.tag;
      const paramMatch = displayTag.match(/^fixture\.use\(['"]([^'"]+)['"]\)$/);
      const fixtureName = paramMatch ? paramMatch[1] : fixture.name;

      hoverContent.appendCodeblock(`@fixture\ndef ${fixtureName}(context):`, 'python');

      return new vscode.Hover(hoverContent, featureTag.range);
    }
    catch (e: unknown) {
      try {
        const wkspSettings = getWorkspaceSettingsForFile(document.uri);
        config.logger.showError(e, wkspSettings?.uri);
      }
      catch {
        config.logger.showError(e);
      }
      return undefined;
    }
  }
}
