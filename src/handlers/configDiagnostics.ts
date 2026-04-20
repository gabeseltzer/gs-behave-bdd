import * as vscode from 'vscode';
import { config } from '../configuration';

const CONFIG_PARSE_CODE = 'behave-config-parse-error';
const PATH_NOT_FOUND_CODE = 'behave-config-path-not-found';
const PATH_SUBSUMED_CODE = 'behave-config-path-subsumed';

export function setConfigParseErrorDiagnostic(
  configFileUri: vscode.Uri,
  errorMessage: string
): void {
  const range = new vscode.Range(0, 0, 0, 0);
  const diagnostic = new vscode.Diagnostic(
    range,
    `Behave config parse error: ${errorMessage}`,
    vscode.DiagnosticSeverity.Warning
  );
  diagnostic.code = CONFIG_PARSE_CODE;
  diagnostic.source = 'gs-behave-bdd';
  const existing = config.diagnostics.get(configFileUri) || [];
  const filtered = [...existing].filter(d => d.code !== CONFIG_PARSE_CODE);
  config.diagnostics.set(configFileUri, [...filtered, diagnostic]);
}

export function clearConfigParseErrorDiagnostic(configFileUri: vscode.Uri): void {
  const existing = config.diagnostics.get(configFileUri) || [];
  const filtered = [...existing].filter(d => d.code !== CONFIG_PARSE_CODE);
  config.diagnostics.set(configFileUri, filtered);
}

export function setPathResolutionDiagnostics(
  configFileUri: vscode.Uri,
  invalidPaths: { rawPath: string; lineNumber: number }[]
): void {
  const newDiags = invalidPaths.map(({ rawPath, lineNumber }) => {
    const range = new vscode.Range(lineNumber, 0, lineNumber, 999);
    const diagnostic = new vscode.Diagnostic(
      range,
      `Behave config: path "${rawPath}" does not exist`,
      vscode.DiagnosticSeverity.Error
    );
    diagnostic.code = PATH_NOT_FOUND_CODE;
    diagnostic.source = 'gs-behave-bdd';
    return diagnostic;
  });
  const existing = config.diagnostics.get(configFileUri) || [];
  const filtered = [...existing].filter(d => d.code !== PATH_NOT_FOUND_CODE);
  config.diagnostics.set(configFileUri, [...filtered, ...newDiags]);
}

export function setSubsumptionDiagnostics(
  configFileUri: vscode.Uri,
  subsumedPaths: { rawPath: string; lineNumber: number; subsumedBy: string }[]
): void {
  const newDiags = subsumedPaths.map(({ rawPath, lineNumber, subsumedBy }) => {
    const range = new vscode.Range(lineNumber, 0, lineNumber, 999);
    const diagnostic = new vscode.Diagnostic(
      range,
      `Behave config: path "${rawPath}" is contained within "${subsumedBy}" — this path will be ignored to avoid duplicate features`,
      vscode.DiagnosticSeverity.Warning
    );
    diagnostic.code = PATH_SUBSUMED_CODE;
    diagnostic.source = 'gs-behave-bdd';
    return diagnostic;
  });
  const existing = config.diagnostics.get(configFileUri) || [];
  const filtered = [...existing].filter(d => d.code !== PATH_SUBSUMED_CODE);
  config.diagnostics.set(configFileUri, [...filtered, ...newDiags]);
}

export function clearPathDiagnostics(configFileUri: vscode.Uri): void {
  const existing = config.diagnostics.get(configFileUri) || [];
  const filtered = [...existing].filter(
    d => d.code !== PATH_NOT_FOUND_CODE && d.code !== PATH_SUBSUMED_CODE
  );
  config.diagnostics.set(configFileUri, filtered);
}
