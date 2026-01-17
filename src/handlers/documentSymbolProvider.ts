import * as vscode from "vscode";
import { getLines } from "../common";

const featureRe = /^\s*Feature:(.*)$/i;
const backgroundRe = /^\s*Background:(.*)$/i;
const scenarioRe = /^\s*(Scenario|Scenario Outline|Scenario Template):(.*)$/i;
const scenarioOutlineRe = /^\s*(Scenario Outline|Scenario Template):(.*)$/i;
const examplesRe = /^\s*Examples:(.*)$/i;
const ruleRe = /^\s*Rule:(.*)$/i;
const stepRe = /^\s*(Given|When|Then|And|But|\*)(.*)$/i;

export class DocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(
    document: vscode.TextDocument,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    cancelToken: vscode.CancellationToken
  ): vscode.DocumentSymbol[] | undefined {
    const symbols: vscode.DocumentSymbol[] = [];
    const lines = getLines(document.getText());

    let currentFeature: vscode.DocumentSymbol | undefined;
    let currentRule: vscode.DocumentSymbol | undefined;
    let currentScenario: vscode.DocumentSymbol | undefined;
    let currentBackground: vscode.DocumentSymbol | undefined;
    let currentExamples: vscode.DocumentSymbol | undefined;
    let currentStep: vscode.DocumentSymbol | undefined;

    for (let lineNo = 0; lineNo < lines.length; lineNo++) {
      const line = lines[lineNo].trim();

      // Skip empty lines and comments
      if (line === "" || line.startsWith("#")) {
        continue;
      }

      // Check for Feature
      const featureMatch = featureRe.exec(line);
      if (featureMatch) {
        // Close previous feature range
        if (currentFeature) {
          this.updateSymbolRange(currentFeature, lineNo - 1, lines);
        }

        const featureName = featureMatch[1].trim() || "Feature";
        const selectionRange = new vscode.Range(
          new vscode.Position(lineNo, 0),
          new vscode.Position(lineNo, lines[lineNo].length)
        );
        // Start with a temporary range, will be updated later
        currentFeature = new vscode.DocumentSymbol(
          featureName,
          "",
          vscode.SymbolKind.Module,
          selectionRange,
          selectionRange
        );
        symbols.push(currentFeature);
        currentRule = undefined;
        currentScenario = undefined;
        currentBackground = undefined;
        currentStep = undefined;
        currentExamples = undefined;
        continue;
      }

      // Check for Rule
      const ruleMatch = ruleRe.exec(line);
      if (ruleMatch && currentFeature) {
        // Close previous rule range
        if (currentRule) {
          this.updateSymbolRange(currentRule, lineNo - 1, lines);
        }

        const ruleName = ruleMatch[1].trim() || "Rule";
        const selectionRange = new vscode.Range(
          new vscode.Position(lineNo, 0),
          new vscode.Position(lineNo, lines[lineNo].length)
        );
        currentRule = new vscode.DocumentSymbol(
          ruleName,
          "",
          vscode.SymbolKind.Namespace,
          selectionRange,
          selectionRange
        );
        currentFeature.children.push(currentRule);
        currentScenario = undefined;
        currentBackground = undefined;
        currentStep = undefined;
        currentExamples = undefined;
        continue;
      }

      // Check for Background
      const backgroundMatch = backgroundRe.exec(line);
      if (backgroundMatch && currentFeature) {
        // Close previous background range
        if (currentBackground) {
          this.updateSymbolRange(currentBackground, lineNo - 1, lines);
        }

        const backgroundName = backgroundMatch[1].trim() || "Background";
        const selectionRange = new vscode.Range(
          new vscode.Position(lineNo, 0),
          new vscode.Position(lineNo, lines[lineNo].length)
        );
        currentBackground = new vscode.DocumentSymbol(
          backgroundName,
          "",
          vscode.SymbolKind.Method,
          selectionRange,
          selectionRange
        );

        if (currentRule) {
          currentRule.children.push(currentBackground);
        } else {
          currentFeature.children.push(currentBackground);
        }
        currentScenario = undefined;
        currentStep = undefined;
        currentExamples = undefined;
        continue;
      }

      // Check for Scenario or Scenario Outline
      const scenarioMatch = scenarioRe.exec(line);
      if (scenarioMatch && currentFeature) {
        // Close any open examples range first
        if (currentExamples) {
          this.updateSymbolRange(currentExamples, lineNo - 1, lines);
        }
        // Close previous scenario range
        if (currentScenario) {
          this.updateSymbolRange(currentScenario, lineNo - 1, lines);
        }
        // Close previous background range if scenario follows it
        if (currentBackground) {
          this.updateSymbolRange(currentBackground, lineNo - 1, lines);
        }

        const scenarioName = scenarioMatch[2].trim() || "Scenario";
        const isOutline = scenarioOutlineRe.test(line);
        const selectionRange = new vscode.Range(
          new vscode.Position(lineNo, 0),
          new vscode.Position(lineNo, lines[lineNo].length)
        );
        currentScenario = new vscode.DocumentSymbol(
          scenarioName,
          isOutline ? "Scenario Outline" : "Scenario",
          vscode.SymbolKind.Function,
          selectionRange,
          selectionRange
        );

        if (currentRule) {
          currentRule.children.push(currentScenario);
        } else {
          currentFeature.children.push(currentScenario);
        }
        currentBackground = undefined;
        currentStep = undefined;
        currentExamples = undefined;
        continue;
      }

      // Check for Examples (as a child of Scenario Outline)
      const examplesMatch = examplesRe.exec(line);
      if (examplesMatch && currentScenario) {
        // Close previous examples range
        if (currentExamples) {
          this.updateSymbolRange(currentExamples, lineNo - 1, lines);
        }

        const examplesName = examplesMatch[1].trim() || "Examples";
        const selectionRange = new vscode.Range(
          new vscode.Position(lineNo, 0),
          new vscode.Position(lineNo, lines[lineNo].length)
        );
        currentExamples = new vscode.DocumentSymbol(
          examplesName,
          "",
          vscode.SymbolKind.Property,
          selectionRange,
          selectionRange
        );
        currentScenario.children.push(currentExamples);
        currentStep = undefined;
        continue;
      }

      // Check for Steps (Given/When/Then/And/But/*)
      const stepMatch = stepRe.exec(line);
      if (stepMatch && (currentScenario || currentBackground)) {
        // Close previous step range
        if (currentStep) {
          this.updateSymbolRange(currentStep, lineNo - 1, lines);
        }

        const stepKeyword = stepMatch[1];
        const stepText = stepMatch[2].trim();
        const stepName = stepText.length > 50 ? stepText.substring(0, 47) + "..." : stepText;
        const selectionRange = new vscode.Range(
          new vscode.Position(lineNo, 0),
          new vscode.Position(lineNo, lines[lineNo].length)
        );
        currentStep = new vscode.DocumentSymbol(
          `${stepKeyword} ${stepName}`,
          "",
          vscode.SymbolKind.Field,
          selectionRange,
          selectionRange
        );

        if (currentBackground) {
          currentBackground.children.push(currentStep);
        } else if (currentScenario) {
          currentScenario.children.push(currentStep);
        }
        continue;
      }
    }

    // Close all open ranges at the end of the document
    if (currentStep) {
      this.updateSymbolRange(currentStep, lines.length - 1, lines);
    }
    if (currentExamples) {
      this.updateSymbolRange(currentExamples, lines.length - 1, lines);
    }
    if (currentScenario) {
      this.updateSymbolRange(currentScenario, lines.length - 1, lines);
    }
    if (currentBackground) {
      this.updateSymbolRange(currentBackground, lines.length - 1, lines);
    }
    if (currentRule) {
      this.updateSymbolRange(currentRule, lines.length - 1, lines);
    }
    if (currentFeature) {
      this.updateSymbolRange(currentFeature, lines.length - 1, lines);
    }

    return symbols;
  }

  private updateSymbolRange(symbol: vscode.DocumentSymbol, endLineNo: number, lines: string[]): void {
    // Find the last non-empty, non-comment line
    let actualEndLine = endLineNo;
    while (actualEndLine > symbol.range.start.line) {
      const line = lines[actualEndLine].trim();
      if (line !== "" && !line.startsWith("#")) {
        break;
      }
      actualEndLine--;
    }

    const endPosition = new vscode.Position(actualEndLine, lines[actualEndLine].length);
    symbol.range = new vscode.Range(symbol.range.start, endPosition);
  }
}
