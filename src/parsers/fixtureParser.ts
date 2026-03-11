import * as vscode from 'vscode';
import { uriId, sepr, basename } from '../common';
import { diagLog } from '../logger';
import type { BehaveFixtureDefinition } from './behaveLoader';

const fixtures = new Map<string, Fixture>();

export class Fixture {
  public functionDefinitionRange: vscode.Range = new vscode.Range(0, 0, 0, 0);
  constructor(
    public readonly key: string,
    public readonly uri: vscode.Uri,
    public readonly fileName: string,
    public readonly name: string,
    public readonly decoratorRange: vscode.Range
  ) { }
}

export function getFixtures(featuresUri: vscode.Uri): Fixture[] {
  const featuresUriMatchString = uriId(featuresUri);
  const result = [...fixtures.values()].filter(f => f.key.startsWith(featuresUriMatchString));
  return result;
}

export function deleteFixtures(featuresUri: vscode.Uri) {
  const featuresUriMatchString = uriId(featuresUri);
  for (const [key] of fixtures) {
    if (key.startsWith(featuresUriMatchString)) {
      fixtures.delete(key);
    }
  }
}

/**
 * Stores fixture definitions discovered by the Python subprocess.
 * Converts BehaveFixtureDefinition[] to Fixture objects and stores them.
 */
export function storePythonFixtureDefinitions(
  featuresUri: vscode.Uri,
  pythonFixtures: BehaveFixtureDefinition[]
): number {
  let stored = 0;
  for (const pf of pythonFixtures) {
    const fileUri = vscode.Uri.file(pf.filePath);
    const key = `${uriId(featuresUri)}${sepr}fixture.${pf.functionName}`;

    // Convert 1-indexed Python lines to 0-indexed VSCode ranges
    const decoratorLine = Math.max(0, pf.decoratorLine - 1);
    const defLine = Math.max(0, pf.defLine - 1);

    const decoratorRange = new vscode.Range(decoratorLine, 0, decoratorLine, 0);
    const fixture = new Fixture(key, fileUri, basename(fileUri), pf.functionName, decoratorRange);
    fixture.functionDefinitionRange = new vscode.Range(defLine, 0, defLine, 0);

    fixtures.set(key, fixture);
    stored++;
  }
  diagLog(`storePythonFixtureDefinitions: stored ${stored} fixtures`);
  return stored;
}

export function getFixtureByTag(featuresUri: vscode.Uri, tag: string): Fixture | undefined {
  if (!tag.startsWith('fixture.')) {
    return undefined;
  }

  // Extract fixture name from tag
  let fixtureName = tag.substring('fixture.'.length);

  // Handle parameterized fixtures like fixture.use("name")
  const paramMatch = fixtureName.match(/^use\(['"]([^'"]+)['"]\)$/);
  if (paramMatch) {
    fixtureName = paramMatch[1];
  } else {
    // Handle generic parameterized fixtures like fixture.name("arg")
    const callMatch = fixtureName.match(/^([a-zA-Z0-9_]+)\s*\(/);
    if (callMatch) {
      fixtureName = callMatch[1];
    }
  }

  const key = `${uriId(featuresUri)}${sepr}fixture.${fixtureName}`;
  return fixtures.get(key);
}
