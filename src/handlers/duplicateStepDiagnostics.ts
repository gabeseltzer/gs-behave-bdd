import * as vscode from "vscode";
import { config } from "../configuration";
import type { DuplicateStepInfo } from "../parsers/behaveLoader";

const DIAGNOSTIC_CODE = 'duplicate-step-definition';

// Track which URIs have duplicate diagnostics so we can efficiently clear them
const affectedUris = new Set<string>();

/**
 * Creates diagnostics on Python step definition files for duplicate step patterns.
 * Each duplicate decorator line gets an error diagnostic with related information
 * pointing to the other location(s) where the same pattern is defined.
 */
export function setDuplicateStepDiagnostics(duplicates: DuplicateStepInfo[]): void {
  // Clear any previous duplicate diagnostics first
  clearDuplicateStepDiagnostics();

  // Group duplicates by (stepType, pattern) to build relatedInformation cross-references
  const byPattern = new Map<string, DuplicateStepInfo[]>();
  for (const dup of duplicates) {
    // Normalize: @step conflicts with @given/@when/@then, use pattern only as key
    const key = dup.pattern;
    const group = byPattern.get(key);
    if (group) group.push(dup);
    else byPattern.set(key, [dup]);
  }

  // Group by file to set diagnostics per-file
  const byFile = new Map<string, vscode.Diagnostic[]>();

  for (const [, group] of byPattern) {
    if (group.length < 2) continue;

    for (const dup of group) {
      const line = Math.max(0, dup.lineNumber - 1);
      const range = new vscode.Range(line, 0, line, 200);

      // Build list of "also defined at" locations
      const others = group.filter(d => !(d.filePath === dup.filePath && d.lineNumber === dup.lineNumber));
      const otherLocations = others.map(other => {
        const otherLine = Math.max(0, other.lineNumber - 1);
        return new vscode.DiagnosticRelatedInformation(
          new vscode.Location(
            vscode.Uri.file(other.filePath),
            new vscode.Position(otherLine, 0)
          ),
          `Also defined here: @${other.stepType}("${other.pattern}")`
        );
      });

      const diagnostic = new vscode.Diagnostic(
        range,
        `Duplicate step definition: @${dup.stepType}("${dup.pattern}")`,
        vscode.DiagnosticSeverity.Error
      );
      diagnostic.code = DIAGNOSTIC_CODE;
      diagnostic.source = 'behave-vsc-gs';
      diagnostic.relatedInformation = otherLocations;

      const fileDiags = byFile.get(dup.filePath);
      if (fileDiags) fileDiags.push(diagnostic);
      else byFile.set(dup.filePath, [diagnostic]);
    }
  }

  // Set diagnostics per file, preserving any existing non-duplicate diagnostics
  for (const [filePath, diagnostics] of byFile) {
    const uri = vscode.Uri.file(filePath);
    const existing = config.diagnostics.get(uri) || [];
    const nonDuplicate = [...existing].filter(d => d.code !== DIAGNOSTIC_CODE);
    config.diagnostics.set(uri, [...nonDuplicate, ...diagnostics]);
    affectedUris.add(filePath);
  }
}

/**
 * Clears all duplicate step definition diagnostics from previously affected files.
 */
export function clearDuplicateStepDiagnostics(): void {
  for (const filePath of affectedUris) {
    const uri = vscode.Uri.file(filePath);
    const existing = config.diagnostics.get(uri) || [];
    const nonDuplicate = [...existing].filter(d => d.code !== DIAGNOSTIC_CODE);
    config.diagnostics.set(uri, nonDuplicate);
  }
  affectedUris.clear();
}
