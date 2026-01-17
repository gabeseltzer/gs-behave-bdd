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

      // Extract function signature and docstring
      const functionInfo = extractFunctionInfo(pythonContent, stepFileStep.functionDefinitionRange.start.line);

      if (!functionInfo) {
        return undefined;
      }

      // Build hover content
      const hoverContent = new vscode.MarkdownString();
      hoverContent.appendCodeblock(functionInfo.signature, 'python');

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
  signature: string;
  docstring?: string;
}


function extractFunctionInfo(content: string, functionLine: number): FunctionInfo | undefined {
  const lines = content.split('\n');

  if (functionLine >= lines.length) {
    return undefined;
  }

  // Find the function definition line
  const defLine = lines[functionLine];
  let currentLine = functionLine;

  // Handle multi-line function definitions
  // We need to find the colon that ends the function definition, not just any colon
  // (type annotations can have colons like "arg: int")
  let signature = defLine;
  let foundEnd = false;

  while (!foundEnd && currentLine < lines.length) {
    const currentLineText = lines[currentLine].trim();

    // Check if this line ends with a colon (possibly followed by a comment)
    // Remove comments first to check properly
    const lineWithoutComment = currentLineText.split('#')[0].trim();
    if (lineWithoutComment.endsWith(':')) {
      foundEnd = true;
      if (currentLine !== functionLine) {
        signature += ' ' + currentLineText;
      }
    } else if (currentLine !== functionLine) {
      // Continue building the signature
      signature += ' ' + currentLineText;
      currentLine++;
    } else {
      // First line doesn't end with colon, continue to next line
      currentLine++;
    }
  }

  // Clean up the signature
  signature = signature.trim();

  // Remove trailing colon and anything after it (including comments)
  const signatureWithoutComment = signature.split('#')[0];
  const colonIndex = signatureWithoutComment.lastIndexOf(':');
  if (colonIndex !== -1) {
    signature = signatureWithoutComment.substring(0, colonIndex).trim();
  }

  // Extract docstring if present
  let docstring: string | undefined = undefined;
  currentLine++;

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
    signature,
    docstring
  };
}
