import * as vscode from 'vscode';
import { uriId, sepr, basename, getLines, getContentFromFilesystem } from '../common';
import { diagLog } from '../logger';

// Regex to match fixture.use decorator: @fixture or behave.fixture
const fixtureDecoratorRe = /^\s*@(behave\.)?fixture(?:\((.*?)\))?/i;
// Regex to match function definition
const funcRe = /^(async )?def\s+(\w+)/;
// Regex to match imports
const fromImportRe = /^\s*from\s+([.a-zA-Z0-9_]+)\s+import/i;
const importRe = /^\s*import\s+([.a-zA-Z0-9_]+)/i;

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

export async function parseEnvironmentFileContent(featuresUri: vscode.Uri, content: string, environmentFileUri: vscode.Uri, caller: string, visited: Set<string> = new Set()) {
  if (!content) {
    return;
  }

  const fileUriMatchString = uriId(environmentFileUri);

  if (visited.has(fileUriMatchString)) {
    return;
  }
  visited.add(fileUriMatchString);

  // Clear all existing fixtures for this environment file
  for (const [key, fixture] of fixtures) {
    if (uriId(fixture.uri) === fileUriMatchString) {
      fixtures.delete(key);
    }
  }

  let fileFixtures = 0;
  const lines = getLines(content);
  let pendingFixtureLine: number | undefined = undefined;

  for (let lineNo = 0; lineNo < lines.length; lineNo++) {
    const line = lines[lineNo];
    const trimmedLine = line.trim();

    if (trimmedLine === '' || trimmedLine.startsWith('#')) {
      continue;
    }

    // Check for imports to follow
    const fromImportMatch = fromImportRe.exec(trimmedLine);
    const importMatch = importRe.exec(trimmedLine);

    let modulePath: string | undefined;
    if (fromImportMatch) {
      modulePath = fromImportMatch[1];
    } else if (importMatch) {
      modulePath = importMatch[1];
    }

    if (modulePath) {
      const importedUri = await resolveImportPath(environmentFileUri, modulePath);
      if (importedUri) {
        try {
          const importedContent = await getContentFromFilesystem(importedUri);
          await parseEnvironmentFileContent(featuresUri, importedContent, importedUri, caller, visited);
        } catch (e) {
          console.log(`[fixtureParser] Failed to parse imported file ${importedUri.fsPath}:`, e);
        }
      }
    }

    // Check for fixture decorator
    const fixtureMatch = fixtureDecoratorRe.exec(trimmedLine);
    if (fixtureMatch) {
      pendingFixtureLine = lineNo;
      continue;
    }

    // Check for function definition after a fixture decorator
    if (pendingFixtureLine !== undefined) {
      const funcMatch = funcRe.exec(trimmedLine);
      if (funcMatch) {
        const functionName = funcMatch[2];
        const decoratorRange = new vscode.Range(pendingFixtureLine, 0, pendingFixtureLine, lines[pendingFixtureLine].length);
        const key = `${uriId(featuresUri)}${sepr}fixture.${functionName}`;

        console.log('[parseEnvironmentFileContent] Creating fixture with key:', key);
        console.log('[parseEnvironmentFileContent] featuresUri:', featuresUri.toString());
        console.log('[parseEnvironmentFileContent] functionName:', functionName);

        const fixture = new Fixture(key, environmentFileUri, basename(environmentFileUri), functionName, decoratorRange);
        fixture.functionDefinitionRange = new vscode.Range(lineNo, 0, lineNo, line.trimEnd().length);

        fixtures.set(key, fixture);
        fileFixtures++;
        pendingFixtureLine = undefined;
      } else if (!trimmedLine.startsWith('@')) {
        // Not a decorator and not a function, reset
        pendingFixtureLine = undefined;
      }
    }
  }

  diagLog(`${caller}: parsed ${fileFixtures} fixtures from ${environmentFileUri.path}`);
}

async function resolveImportPath(currentUri: vscode.Uri, modulePath: string): Promise<vscode.Uri | undefined> {
  const currentDir = vscode.Uri.joinPath(currentUri, '..');

  // Handle dots in module path (e.g. from . import or from ..sub import)
  let searchPath = modulePath;
  if (modulePath.startsWith('.')) {
    // Basic handling for relative imports
    // . -> ./
    // .. -> ../
    // ... -> ../../
    // In this simple resolver we'll just try to treat the dotted path as a relative path
    // modulePath = .sub -> ./sub
    // modulePath = ..sub -> ../sub
    // remove leading dots and determine parent count
    let dotCount = 0;
    while (searchPath.startsWith('.')) {
      searchPath = searchPath.substring(1);
      dotCount++;
    }

    // dotCount 1 = current dir, 2 = parent, etc.
    // However, in python:
    // from . import x => dotCount 1. relative to current package (dir).
    // from .. import x => dotCount 2. relative to parent package.

    let baseUri = currentDir;
    for (let i = 1; i < dotCount; i++) {
      baseUri = vscode.Uri.joinPath(baseUri, '..');
    }

    // Now we have baseUri and searchPath (the rest of the name)
    // If searchPath is empty (e.g. "from . import x"), we look for x in baseUri, but x is in the import part (which we didn't parse fully)
    // Wait, regex: from (.sub) import ... -> modulePath = .sub
    // regex: from (.) import ... -> modulePath = .

    if (searchPath === '') {
      // Import is just dots "from . import x"
      // We can't easily jump to 'x' without parsing the "import x" part.
      // But the regex I used `from ([\.a-zA-Z0-9_]+) import` captures the module part.
      return undefined; // resolving "from ." is hard without knowing what is imported if it's a file.
    }

    searchPath = searchPath.replace(/\./g, '/');

    try {
      const candidate1 = vscode.Uri.joinPath(baseUri, searchPath + '.py');
      await vscode.workspace.fs.stat(candidate1);
      return candidate1;
    } catch {
      // ignore
    }

    try {
      const candidate2 = vscode.Uri.joinPath(baseUri, searchPath, '__init__.py');
      await vscode.workspace.fs.stat(candidate2);
      return candidate2;
    } catch {
      // ignore
    }

    return undefined;
  }

  // Standard import: import x.y.z
  searchPath = modulePath.replace(/\./g, '/');

  // 1. Try relative to current file
  try {
    const candidate1 = vscode.Uri.joinPath(currentDir, searchPath + '.py');
    await vscode.workspace.fs.stat(candidate1);
    return candidate1;
  } catch {
    // ignore
  }

  try {
    const candidate2 = vscode.Uri.joinPath(currentDir, searchPath, '__init__.py');
    await vscode.workspace.fs.stat(candidate2);
    return candidate2;
  } catch {
    // ignore
  }

  // 2. Try relative to workspace root
  const wksp = vscode.workspace.getWorkspaceFolder(currentUri);
  if (wksp) {
    try {
      const candidate3 = vscode.Uri.joinPath(wksp.uri, searchPath + '.py');
      await vscode.workspace.fs.stat(candidate3);
      return candidate3;
    } catch {
      // ignore
    }

    try {
      const candidate4 = vscode.Uri.joinPath(wksp.uri, searchPath, '__init__.py');
      await vscode.workspace.fs.stat(candidate4);
      return candidate4;
    } catch {
      // ignore
    }
  }

  return undefined;
}

export function getFixtureByTag(featuresUri: vscode.Uri, tag: string): Fixture | undefined {
  // Tag format can be:
  // - @fixture.function_name
  // - @fixture.use("function_name")
  console.log('[getFixtureByTag] featuresUri:', featuresUri.toString(), 'tag:', tag);

  if (!tag.startsWith('fixture.')) {
    console.log('[getFixtureByTag] Tag does not start with fixture.');
    return undefined;
  }

  // Extract fixture name from tag
  let fixtureName = tag.substring('fixture.'.length);
  console.log('[getFixtureByTag] Extracted fixture name:', fixtureName);

  // Handle parameterized fixtures like fixture.use("name")
  const paramMatch = fixtureName.match(/^use\(['"]([^'"]+)['"]\)$/);
  if (paramMatch) {
    fixtureName = paramMatch[1];
    console.log('[getFixtureByTag] Extracted from use() param:', fixtureName);
  } else {
    // Handle generic parameterized fixtures like fixture.name("arg")
    const callMatch = fixtureName.match(/^([a-zA-Z0-9_]+)\s*\(/);
    if (callMatch) {
      fixtureName = callMatch[1];
      console.log('[getFixtureByTag] Extracted function name from call:', fixtureName);
    }
  }

  const key = `${uriId(featuresUri)}${sepr}fixture.${fixtureName}`;
  console.log('[getFixtureByTag] Looking up key:', key);
  console.log('[getFixtureByTag] Available fixtures:', [...fixtures.keys()]);
  const result = fixtures.get(key);
  console.log('[getFixtureByTag] Result:', result);
  return result;
}
