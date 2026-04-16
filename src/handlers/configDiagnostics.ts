import * as vscode from 'vscode';
import { config } from '../configuration';

const CONFIG_PARSE_CODE = 'behave-config-parse-error';

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
