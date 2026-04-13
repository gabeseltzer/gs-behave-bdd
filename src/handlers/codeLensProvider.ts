import * as vscode from 'vscode';
import { isStepsFile, couldBePythonStepsFile, getWorkspaceSettingsForFile, urisMatch } from '../common';
import { getStepFileSteps, stepFileDecoratorPattern } from '../parsers/stepsParser';
import { getStepMappingsForStepsFileFunction } from '../parsers/stepMappings';
import { parser } from '../extension';

const stepDecoratorRe = new RegExp(stepFileDecoratorPattern, 'i');


export function findDecoratorLine(document: vscode.TextDocument, funcLine: number): number {
  let line = funcLine - 1;
  let topDecorator = funcLine;

  while (line >= 0) {
    const text = document.lineAt(line).text.trim();

    if (stepDecoratorRe.test(text)) {
      topDecorator = line;
      line--;
    } else if (text.startsWith('@')) {
      // Non-step decorator (e.g., @fixture) — keep scanning above it
      line--;
    } else if (text === '' || text.startsWith('#') || text === ')' ||
      text.startsWith('"') || text.startsWith("'")) {
      // Blank line, comment, or continuation of a multi-line decorator
      line--;
    } else {
      break;
    }
  }

  return topDecorator;
}


export class StepCodeLensProvider implements vscode.CodeLensProvider {

  async provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {

    const enabled = vscode.workspace.getConfiguration('gs-behave-bdd').get<boolean>('showStepReferenceCodeLens', true);
    if (!enabled)
      return [];

    const docUri = document.uri;

    if (!isStepsFile(docUri) && !couldBePythonStepsFile(docUri))
      return [];

    const wkspSettings = getWorkspaceSettingsForFile(docUri);
    if (!wkspSettings)
      return [];

    if (!parser.initialStepsParseComplete)
      return [];

    const allSteps = getStepFileSteps(wkspSettings.featuresUri);

    // Filter to steps defined in this document, deduplicate by function line
    // (a function can have multiple decorators like @given + @when, or be loaded
    // by both the step parser and behave loader)
    const stepsInFile = allSteps.filter(([, step]) => urisMatch(step.uri, docUri));
    const seenLines = new Set<number>();

    const lenses: vscode.CodeLens[] = [];
    for (const [, step] of stepsInFile) {
      const funcLine = step.functionDefinitionRange.start.line;
      if (seenLines.has(funcLine))
        continue;
      seenLines.add(funcLine);

      const mappings = getStepMappingsForStepsFileFunction(docUri, funcLine);
      const refCount = mappings.length;
      const title = refCount === 1 ? '1 reference' : `${refCount} references`;

      const decoratorLine = findDecoratorLine(document, funcLine);
      const lensRange = new vscode.Range(decoratorLine, 0, decoratorLine, 0);

      lenses.push(new vscode.CodeLens(
        lensRange,
        {
          title,
          command: 'gs-behave-bdd.codeLensReferences',
          arguments: [docUri, funcLine],
        }
      ));
    }

    // Sort by line number
    lenses.sort((a, b) => a.range.start.line - b.range.start.line);

    return lenses;
  }
}
