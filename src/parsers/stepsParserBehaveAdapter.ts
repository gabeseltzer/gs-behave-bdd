/**
 * Adapter to convert BehaveStepDefinition to StepFileStep format
 * Used when replacing AST parsing with behave registry loader
 */

import * as vscode from 'vscode';
import { uriId, sepr, basename } from '../common';
import type { BehaveStepDefinition } from './behaveStepLoader';
import { StepFileStep, parseRepWildcard, storeStepFileStep } from './stepsParser';
import { diagLog } from '../logger';

/**
 * Stores behave step definitions in the stepsParser storage
 * Converts all definitions and stores them so they can be used like AST-parsed steps
 */
export function storeBehaveStepDefinitions(
  featuresUri: vscode.Uri,
  behaveDefinitions: BehaveStepDefinition[]
): number {
  let stored = 0;

  for (const behavioral of behaveDefinitions) {
    try {
      // Convert behave definition to VSCode URI for the step file
      const stepFileUri = vscode.Uri.file(behavioral.filePath);

      const stepFileStep = createStepFileStepFromBehaveDefinition(
        featuresUri,
        stepFileUri,
        behavioral
      );

      storeStepFileStep(featuresUri, stepFileStep);
      stored++;
    } catch (e) {
      diagLog(`Error storing behave step definition: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  diagLog(`storeBehaveStepDefinitions: stored ${stored}/${behaveDefinitions.length} steps`);
  return stored;
}

/**
 * Converts a BehaveStepDefinition to a StepFileStep
 * Handles:
 * - Line number conversion from 1-indexed (behave) to 0-indexed (VSCode)
 * - Pattern conversion from behave format to textAsRe format
 * - Creating the proper key for step mapping
 */
export function createStepFileStepFromBehaveDefinition(
  featuresUri: vscode.Uri,
  stepFileUri: vscode.Uri,
  behaveDef: BehaveStepDefinition
): StepFileStep {
  // Normalize step type to lowercase
  const stepType = behaveDef.stepType.toLowerCase();

  // Convert pattern to textAsRe format (behave line numbers are 1-indexed)
  const textAsRe = convertPatternToTextAsRe(behaveDef.pattern);

  const fileName = basename(stepFileUri);

  // Create the key: <featuresUri>|^<stepType>|<textAsRe>$
  const reKey = `${uriId(featuresUri)}${sepr}^${stepType}${sepr}${textAsRe}$`;

  const stepFileStep = new StepFileStep(reKey, stepFileUri, fileName, stepType, textAsRe);

  // Convert line number from 1-indexed (behave) to 0-indexed (VSCode)
  // The lineNumber from behave's registry is where the decorator is
  const zeroIndexedLine = Math.max(0, behaveDef.lineNumber - 1);
  stepFileStep.functionDefinitionRange = new vscode.Range(zeroIndexedLine, 0, zeroIndexedLine, 0);

  return stepFileStep;
}

/**
 * Converts a behave step pattern to textAsRe format
 * 
 * Process:
 * 1. Escape regex special characters (except \ and {})
 * 2. Replace any {anything} with .*
 * 
 * Examples:
 * - "I have a calculator" -> "I have a calculator"
 * - "I add {a} and {b}" -> "I add .* and .*"
 * - "I add {a:d} and {b:d}" -> "I add .* and .*"
 * - "result is (.*)" -> "result is \\(.*\\)"
 */
export function convertPatternToTextAsRe(pattern: string): string {
  if (!pattern) return '';

  let result = pattern;

  // Escape regex special characters except backslash and curly braces
  // These will be preserved for parameter handling
  result = result.replace(/[.*+?^$()|[\]]/g, '\\$&');

  // Replace any {anything} pattern (including typed like {a:d}) with .*
  result = result.replace(/{.*?}/g, parseRepWildcard);

  return result;
}
