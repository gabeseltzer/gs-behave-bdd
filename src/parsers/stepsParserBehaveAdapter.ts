/**
 * Adapter to convert BehaveStepDefinition to StepFileStep format
 * Used when replacing AST parsing with behave registry loader
 */

import * as vscode from 'vscode';
import { performance } from 'perf_hooks';
import { uriId, sepr, basename } from '../common';
import type { BehaveStepDefinition } from './behaveStepLoader';
import { StepFileStep, parseRepWildcard, storeStepFileStep } from './stepsParser';
import * as fs from 'fs';
import { diagLog } from '../logger';

/**
 * Stores behave step definitions in the stepsParser storage
 * Converts all definitions and stores them so they can be used like AST-parsed steps
 */
export async function storeBehaveStepDefinitions(
  featuresUri: vscode.Uri,
  behaveDefinitions: BehaveStepDefinition[]
): Promise<number> {
  const totalStart = performance.now();
  let stored = 0;
  // Batch-read all unique file paths upfront
  const fileContents = new Map<string, string | undefined>();
  let fileReadTimeMs = 0;

  // Collect unique file paths
  const uniquePaths = new Set<string>();
  for (const behavioral of behaveDefinitions) {
    uniquePaths.add(behavioral.filePath);
  }

  // Read all unique files in parallel
  const readStart = performance.now();
  const readResults = await Promise.all(
    [...uniquePaths].map(async (filePath) => {
      try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        return { filePath, content } as const;
      } catch {
        return { filePath, content: undefined } as const;
      }
    })
  );
  fileReadTimeMs = performance.now() - readStart;

  // Populate cache from batch results
  for (const { filePath, content } of readResults) {
    fileContents.set(filePath, content);
  }

  for (const behavioral of behaveDefinitions) {
    try {
      // Convert behave definition to VSCode URI for the step file
      const stepFileUri = vscode.Uri.file(behavioral.filePath);

      const fileContent = fileContents.get(behavioral.filePath);

      const stepFileStep = createStepFileStepFromBehaveDefinition(
        featuresUri,
        stepFileUri,
        behavioral,
        fileContent || undefined
      );

      storeStepFileStep(featuresUri, stepFileStep);
      stored++;
    } catch (e) {
      diagLog(`Error storing behave step definition: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const totalElapsed = Math.round(performance.now() - totalStart);
  const processingTime = totalElapsed - Math.round(fileReadTimeMs);
  diagLog(`storeBehaveStepDefinitions: stored ${stored}/${behaveDefinitions.length} steps in ${totalElapsed}ms (file reading: ${Math.round(fileReadTimeMs)}ms, processing: ${processingTime}ms, files cached: ${fileContents.size})`);
  return stored;
}

/**
 * Converts a BehaveStepDefinition to a StepFileStep
 * Handles:
 * - Line number conversion from 1-indexed (behave) to 0-indexed (VSCode)
 * - Pattern conversion from behave format to textAsRe format
 * - Creating the proper key for step mapping
 * - Finding the actual function definition line (behave returns decorator line)
 */
export function createStepFileStepFromBehaveDefinition(
  featuresUri: vscode.Uri,
  stepFileUri: vscode.Uri,
  behaveDef: BehaveStepDefinition,
  fileContent?: string
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
  // Behave returns the line number of the decorator, but we need the function definition line
  let zeroIndexedLine = Math.max(0, behaveDef.lineNumber - 1);

  // If we have file content, try to find the actual function definition
  if (fileContent) {
    const lines = fileContent.split('\n');
    // Start from the behave line and search downward for the function definition
    for (let i = zeroIndexedLine; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('def ') && trimmed.includes('(')) {
        // Found the function definition line
        zeroIndexedLine = i;
        break;
      }
    }
  }

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
