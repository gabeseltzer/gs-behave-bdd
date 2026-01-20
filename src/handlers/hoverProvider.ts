import * as vscode from "vscode";
import { getContentFromFilesystem } from "../common";
import { validateAndGetStepInfo, handleProviderError } from "./providerHelpers";


export class HoverProvider implements vscode.HoverProvider {
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | undefined> {
    try {
      const stepInfo = await validateAndGetStepInfo(document, position);
      if (!stepInfo) {
        return undefined;
      }

      const { stepFileStep, stepRange } = stepInfo;

      // Read the Python file content
      const pythonContent = await getContentFromFilesystem(stepFileStep.uri);

      // Extract step decorator and docstring
      const functionInfo = extractStepDecoratorAndDocstring(pythonContent, stepFileStep.functionDefinitionRange.start.line);

      if (!functionInfo) {
        return undefined;
      }

      // Build hover content - show the step pattern decorator, not the function signature
      const hoverContent = new vscode.MarkdownString();

      // Show the decorator pattern
      hoverContent.appendCodeblock(functionInfo.decorator, 'python');

      if (functionInfo.docstring) {
        hoverContent.appendMarkdown('\n\n---\n\n');
        hoverContent.appendMarkdown(functionInfo.docstring);
      }

      return new vscode.Hover(hoverContent, stepRange);
    }
    catch (e: unknown) {
      handleProviderError(e, document.uri);
      return undefined;
    }
  }
}


interface FunctionInfo {
  decorator: string;
  docstring?: string;
}


function extractStepDecoratorAndDocstring(content: string, functionLine: number): FunctionInfo | undefined {
  const lines = content.split('\n');

  if (functionLine >= lines.length) {
    return undefined;
  }

  // Find the step decorator (the line(s) before the function definition)
  // Step decorators look like: @given('step pattern'), @when(u'pattern'), etc.
  let decorator = '';
  let decoratorStartLine = functionLine - 1;

  // Search backwards to find the decorator(s)
  while (decoratorStartLine >= 0) {
    const line = lines[decoratorStartLine].trim();

    // Check if this is a step decorator
    if (line.match(/^@(behave\.)?(step|given|when|then|and|but)\s*\(/i)) {
      // Found a step decorator, now read it (may be multi-line)
      let decoratorLine = line;
      let scanLine = decoratorStartLine;

      // Handle multi-line decorators
      while (scanLine < functionLine && !decoratorLine.includes(')')) {
        scanLine++;
        if (scanLine < functionLine) {
          decoratorLine += ' ' + lines[scanLine].trim();
        }
      }

      decorator = decoratorLine;
      break;
    } else if (line.startsWith('@')) {
      // Another decorator, keep searching backwards
      decoratorStartLine--;
    } else if (line === '' || line.startsWith('#')) {
      // Empty line or comment, keep searching
      decoratorStartLine--;
    } else {
      // Not a decorator line, stop searching
      break;
    }
  }

  if (!decorator) {
    return undefined;
  }

  // Extract docstring if present
  let docstring: string | undefined = undefined;
  let currentLine = functionLine + 1;

  // Skip empty lines
  while (currentLine < lines.length && lines[currentLine].trim() === '') {
    currentLine++;
  }

  if (currentLine < lines.length) {
    const nextLine = lines[currentLine].trim();

    // Check for docstring (""" or ''')
    if (nextLine.startsWith('"""') || nextLine.startsWith("'''")) {
      const docstringQuote = nextLine.substring(0, 3);
      const docstringLines: string[] = [];

      // Check if docstring ends on the same line
      if (nextLine.length > 3 && nextLine.substring(3).includes(docstringQuote)) {
        // Single-line docstring
        const endIndex = nextLine.indexOf(docstringQuote, 3);
        docstring = nextLine.substring(3, endIndex);
      } else {
        // Multi-line docstring
        docstringLines.push(nextLine.substring(3));
        currentLine++;

        while (currentLine < lines.length) {
          const line = lines[currentLine];
          if (line.trim().endsWith(docstringQuote)) {
            // Found the end of the docstring
            const endLine = line.trim();
            docstringLines.push(endLine.substring(0, endLine.length - 3));
            break;
          }
          docstringLines.push(line);
          currentLine++;
        }

        docstring = docstringLines
          .map(line => line.trim())
          .join('\n')
          .trim();
      }
    }
  }

  return {
    decorator,
    docstring
  };
}
