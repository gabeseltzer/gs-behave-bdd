import * as os from 'os';
import * as vscode from 'vscode';
import { config } from '../configuration';
import { getUrisOfWkspFoldersWithFeatures, isFeatureFile } from '../common';
import { getFeatureFileSteps } from '../parsers/featureParser';
import { getStepFileStepForFeatureFileStep, getStepMappings } from '../parsers/stepMappings';
import { getStepFileSteps } from '../parsers/stepsParser';
import { logStepResolutionContext } from './providerHelpers';

export const EXTENSION_ID = "gabeseltzer.gs-behave-bdd";


/**
 * Builds a self-contained diagnostic report describing the extension's view of the world:
 * versions, per-workspace resolved paths, discovery source, and how many step definitions /
 * mappings actually exist. This is what a user pastes into a bug report - it answers "why does
 * nothing resolve?" without a back-and-forth, and needs no verboseLogging setting to produce.
 */
export async function buildDiagnosticReport(): Promise<string> {

  const lines: string[] = [];
  const add = (s = "") => lines.push(s);

  const ext = vscode.extensions.getExtension(EXTENSION_ID);
  const pyExt = vscode.extensions.getExtension("ms-python.python");

  add("===== Behave BDD diagnostic report =====");
  add(`extension:        ${EXTENSION_ID} v${ext?.packageJSON?.version ?? "unknown"} (active: ${ext?.isActive ?? false})`);
  add(`vscode:           ${vscode.version}`);
  add(`platform:         ${process.platform} ${os.release()} / node ${process.versions.node}`);
  add(`ms-python.python: ${pyExt ? `v${pyExt.packageJSON?.version} (active: ${pyExt.isActive})` : ">>> NOT INSTALLED - this extension cannot work without it"}`);

  let verboseLogging = false;
  let xRay = false;
  try {
    verboseLogging = config.globalSettings.verboseLogging;
    xRay = config.globalSettings.xRay;
    add(`settings:         verboseLogging=${verboseLogging}, xRay=${xRay}, ` +
      `multiRootRunWorkspacesInParallel=${config.globalSettings.multiRootRunWorkspacesInParallel}`);
  }
  catch (e) {
    add(`settings:         >>> FAILED to read instance settings: ${e}`);
  }
  if (!verboseLogging)
    add(`                  (turn on gs-behave-bdd.verboseLogging and retry the failing action for far more detail)`);

  const allFolders = vscode.workspace.workspaceFolders ?? [];
  const wkspUris = getUrisOfWkspFoldersWithFeatures(true);
  add();
  add(`workspace folders open:      ${allFolders.length} (${allFolders.map(f => f.name).join(", ") || "none"})`);
  add(`folders with behave features: ${wkspUris.length} (${wkspUris.map(u => u.path.split("/").pop()).join(", ") || "none"})`);
  if (wkspUris.length === 0) {
    add(`>>> No workspace folder was recognised as a behave project. The extension will do nothing at all. ` +
      `Check that a behave config file (behave.ini/.behaverc/setup.cfg/tox.ini/pyproject.toml) or a features ` +
      `folder exists, or set gs-behave-bdd.projectPath / featuresPaths explicitly.`);
  }

  for (const wkspUri of wkspUris) {
    add();
    add(`--- workspace: ${wkspUri.fsPath} ---`);

    if (config.isWorkspaceSettingsFailed(wkspUri)) {
      add(`>>> settings FAILED to load for this workspace - see the FATAL entries earlier in this output channel.`);
      continue;
    }

    const wkspSettings = config.workspaceSettings[wkspUri.path];
    if (!wkspSettings) {
      add(`>>> no settings object for this workspace (settings load was skipped or failed).`);
      continue;
    }

    add(`project path:      ${wkspSettings.projectUri.fsPath}`);
    add(`discovery source:  ${wkspSettings.discoverySource}` +
      (wkspSettings.configFileUri ? ` (${wkspSettings.configFileUri.fsPath})` : " (no behave config file found)"));
    add(`features paths:    ${wkspSettings.featuresUris.map(u => u.fsPath).join(", ") || "(none)"}`);
    add(`steps search paths:${wkspSettings.stepsSearchUris.map(u => u.fsPath).join(", ") || "(none)"}`);
    add(`importStrategy:    ${wkspSettings.importStrategy}`);
    add(`step search timeout: ${wkspSettings.stepDefinitionSearchTimeout}s`);
    add(`activeEnvVarPreset: ${wkspSettings.activeEnvVarPreset || "(none)"} ` +
      `(${Object.keys(wkspSettings.envVarPresets).length} preset(s) defined)`);

    try {
      const pythonExec = await config.getPythonExecutable(wkspUri, wkspSettings.name);
      add(`python interpreter: ${pythonExec}`);
    }
    catch (e) {
      add(`python interpreter: >>> COULD NOT RESOLVE: ${e}`);
    }

    // The three counts that localise almost every failure: no feature steps parsed means the
    // features path is wrong; no step definitions means discovery failed; both non-zero with no
    // mappings means the step text does not match any definition's pattern.
    const featureStepCount = getFeatureFileSteps(wkspSettings.featuresUri).length;
    const stepDefCount = getStepFileSteps(wkspSettings.featuresUri).length;
    const mappingCount = getStepMappings(wkspSettings.featuresUri).length;
    add(`parsed feature file steps: ${featureStepCount}`);
    add(`loaded step definitions:   ${stepDefCount}`);
    add(`feature step -> definition mappings: ${mappingCount}`);

    if (featureStepCount === 0)
      add(`>>> ZERO feature steps parsed - the configured features path probably does not contain your .feature files.`);
    else if (stepDefCount === 0)
      add(`>>> ZERO step definitions loaded - step discovery failed or found no step files. Search this output ` +
        `channel for "Failed to load step definitions" / "NO step files found".`);
    else if (mappingCount === 0)
      add(`>>> Feature steps and step definitions both exist but NOTHING matched. This points at a step text / ` +
        `pattern mismatch, or step files that failed to load (check the Problems pane).`);
  }

  // Resolve the step under the cursor, if the user is sitting on one - this makes the report
  // answer "why doesn't ctrl+click work on THIS line?" rather than just describing the workspace.
  const editor = vscode.window.activeTextEditor;
  add();
  if (editor && isFeatureFile(editor.document.uri)) {
    const lineNo = editor.selection.active.line;
    const lineText = editor.document.lineAt(lineNo).text.trim();
    add(`--- active feature file line ---`);
    add(`${editor.document.uri.fsPath}:${lineNo + 1}`);
    add(`  "${lineText}"`);
    const stepFileStep = getStepFileStepForFeatureFileStep(editor.document.uri, lineNo);
    if (stepFileStep)
      add(`  resolves to: ${stepFileStep.uri.fsPath}:${stepFileStep.functionDefinitionRange.start.line + 1}`);
    else
      add(`  does NOT resolve to a step definition.\n${stepResolutionDetailOrHint(editor.document.uri)}`);
  }
  else {
    add(`(tip: put the cursor on a step line in a .feature file and re-run this command to have the report ` +
      `explain that specific step)`);
  }

  add();
  add("===== end of diagnostic report =====");

  return lines.join("\n");
}


// logStepResolutionContext returns "" unless verboseLogging is on; the report should always
// carry the detail, so say so rather than emitting a blank.
function stepResolutionDetailOrHint(uri: vscode.Uri): string {
  return logStepResolutionContext(uri) ||
    `  (enable gs-behave-bdd.verboseLogging to include the detailed reason here)`;
}


/**
 * Command handler: writes the report to the output channel, shows it, and puts it on the
 * clipboard so the user can paste it into a bug report in one step.
 */
export async function diagnosticReportHandler(): Promise<void> {
  try {
    const report = await buildDiagnosticReport();

    const wkspUris = getUrisOfWkspFoldersWithFeatures(true);
    if (wkspUris.length > 0) {
      config.logger.logInfo(`\n${report}`, wkspUris[0]);
      config.logger.show(wkspUris[0]);
    }
    else {
      config.logger.logInfoAllWksps(`\n${report}`);
    }

    await vscode.env.clipboard.writeText(report);
    void vscode.window.showInformationMessage(
      "Behave BDD diagnostic report copied to the clipboard (and written to the Behave BDD output channel).");
  }
  catch (e: unknown) {
    // entry point function (handler) - show error
    config.logger.showError(e);
  }
}
