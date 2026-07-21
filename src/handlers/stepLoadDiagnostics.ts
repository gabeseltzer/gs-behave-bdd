import * as vscode from "vscode";
import { config } from "../configuration";
import { getContentFromFilesystem } from "../common";
import { diagLog } from "../logger";
import type { FailedFileInfo } from "../parsers/behaveLoader";

const LOAD_FAILURE_CODE = 'step-load-failure';
const MISSING_MODULE_CODE = 'missing-module-hint';

// Track which file paths have our diagnostics so we can efficiently clear them
const loadFailureUris = new Set<string>();
const missingModuleUris = new Set<string>();

/**
 * Creates diagnostics on Python files that step discovery could not load.
 * These are quiet, contextual signals (Problems pane + squiggle at the failing
 * line) - deliberately NOT popups: a broken file mid-edit is expected and
 * self-resolving, and the extension keeps that file's cached step definitions.
 */
export function setStepLoadDiagnostics(failedFiles: FailedFileInfo[]): void {
  clearStepLoadDiagnostics();

  const byFile = new Map<string, vscode.Diagnostic[]>();

  for (const failure of failedFiles) {
    const line = Math.max(0, failure.lineNumber - 1);
    const range = new vscode.Range(line, 0, line, 200);

    const consequence = "step discovery is using this file's last good definitions";
    let message: string;
    switch (failure.kind) {
      case "syntax":
        message = `Step discovery: this file doesn't compile (${failure.errorMessage}) — ${consequence}.`;
        break;
      case "import":
        message = `Step discovery: this file failed to import (${failure.errorMessage}) — ${consequence}.`;
        break;
      default:
        message = `Step discovery: this file raised while loading (${failure.errorMessage}) — ${consequence}.`;
    }

    // Warning, not Error: the Python language server already marks the code
    // problem itself; this diagnostic states the step-discovery consequence.
    const diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning);
    diagnostic.code = LOAD_FAILURE_CODE;
    diagnostic.source = 'gs-behave-bdd';

    const fileDiags = byFile.get(failure.filePath);
    if (fileDiags) fileDiags.push(diagnostic);
    else byFile.set(failure.filePath, [diagnostic]);
  }

  for (const [filePath, diagnostics] of byFile) {
    const uri = vscode.Uri.file(filePath);
    const existing = config.diagnostics.get(uri) || [];
    const others = [...existing].filter(d => d.code !== LOAD_FAILURE_CODE);
    config.diagnostics.set(uri, [...others, ...diagnostics]);
    loadFailureUris.add(filePath);
  }
}

export function clearStepLoadDiagnostics(): void {
  for (const filePath of loadFailureUris) {
    const uri = vscode.Uri.file(filePath);
    const existing = config.diagnostics.get(uri) || [];
    config.diagnostics.set(uri, [...existing].filter(d => d.code !== LOAD_FAILURE_CODE));
  }
  loadFailureUris.clear();
}

// Matches "import a.b.c" / "from a.b import x" / "import a, b" - captures the dotted names
const IMPORT_LINE_RE = /^\s*(?:from\s+([A-Za-z_][\w.]*)|import\s+([A-Za-z_][\w.]*(?:\s*,\s*[A-Za-z_][\w.]*)*))/;

/**
 * Creates Information diagnostics on import lines of modules that step
 * discovery satisfied with stubs because they are not installed in the
 * selected interpreter. Quiet but actionable: names exactly what to install.
 */
export async function setMissingModuleHints(mockedModules: string[], pyFilesToScan: vscode.Uri[]): Promise<void> {
  clearMissingModuleHints();

  if (mockedModules.length === 0 || pyFilesToScan.length === 0)
    return;

  // discover.py reports full names (e.g. "matplotlib.pyplot"); match imports by top-level name
  const mockedTopLevel = new Set(mockedModules.map(m => m.split(".")[0]));

  for (const fileUri of pyFilesToScan) {
    let content: string;
    try {
      content = await getContentFromFilesystem(fileUri);
    } catch {
      continue;
    }
    if (!content)
      continue;

    const diagnostics: vscode.Diagnostic[] = [];
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const m = IMPORT_LINE_RE.exec(lines[i]);
      if (!m)
        continue;
      const importedNames = (m[1] ? [m[1]] : m[2].split(",")).map(n => n.trim());
      const missing = importedNames.filter(n => mockedTopLevel.has(n.split(".")[0]));
      if (missing.length === 0)
        continue;

      const names = [...new Set(missing.map(n => n.split(".")[0]))].join("', '");
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(i, 0, i, lines[i].length),
        `'${names}' is not installed in the selected Python interpreter — step discovery parsed this file with a stub; running these tests will fail until it is installed.`,
        vscode.DiagnosticSeverity.Information
      );
      diagnostic.code = MISSING_MODULE_CODE;
      diagnostic.source = 'gs-behave-bdd';
      diagnostics.push(diagnostic);
    }

    if (diagnostics.length > 0) {
      const existing = config.diagnostics.get(fileUri) || [];
      const others = [...existing].filter(d => d.code !== MISSING_MODULE_CODE);
      config.diagnostics.set(fileUri, [...others, ...diagnostics]);
      missingModuleUris.add(fileUri.fsPath);
    }
  }

  diagLog(`setMissingModuleHints: annotated imports of [${mockedModules.join(", ")}] across ${missingModuleUris.size} file(s)`);
}

export function clearMissingModuleHints(): void {
  for (const filePath of missingModuleUris) {
    const uri = vscode.Uri.file(filePath);
    const existing = config.diagnostics.get(uri) || [];
    config.diagnostics.set(uri, [...existing].filter(d => d.code !== MISSING_MODULE_CODE));
  }
  missingModuleUris.clear();
}
