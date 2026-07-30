import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { config } from '../configuration';
import { getUrisOfWkspFoldersWithFeatures, isFeatureFile } from '../common';
import { getFeatureFileSteps } from '../parsers/featureParser';
import { getStepFileStepForFeatureFileStep, getStepMappings } from '../parsers/stepMappings';
import { getStepFileSteps } from '../parsers/stepsParser';
import { diagnoseStepState } from './stepStateDiagnosis';
import { logStepResolutionContext } from './providerHelpers';

export const EXTENSION_ID = "gabeseltzer.gs-behave-bdd";


/**
 * Builds a self-contained diagnostic report describing the extension's view of the world:
 * versions, per-workspace resolved paths, discovery source, and how many step definitions /
 * mappings actually exist. This is what a user pastes into a bug report - it answers "why does
 * nothing resolve?" without a back-and-forth, and needs no verboseLogging setting to produce
 * (though it is far more useful with it on).
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
      `logEnvVarPresetContents=${config.globalSettings.logEnvVarPresetContents}, ` +
      `multiRootRunWorkspacesInParallel=${config.globalSettings.multiRootRunWorkspacesInParallel}`);
  }
  catch (e) {
    add(`settings:         >>> FAILED to read instance settings: ${e}`);
  }
  if (!verboseLogging)
    add(`                  (turn on gs-behave-bdd.verboseLogging and retry the failing action for far more detail)`);
  add(`session log:      ${config.logger.getSessionLogPath() ?? "(none - nothing logged yet, or the log file could not be opened)"}`);

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

    const diagnosis = diagnoseStepState(featureStepCount, stepDefCount, mappingCount);
    if (diagnosis)
      add(`>>> ${diagnosis.title}: ${diagnosis.detail}`);
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

  // The full session log follows this summary in the report file. It is appended by
  // diagnosticReportHandler as a file-to-file copy rather than being embedded here, so that a
  // multi-megabyte log never has to exist as a string in the extension host.
  add();
  add("===== captured log (full session, unbounded) =====");

  return lines.join("\n");
}


// logStepResolutionContext returns "" unless verboseLogging is on; the report should always
// carry the detail, so say so rather than emitting a blank.
function stepResolutionDetailOrHint(uri: vscode.Uri): string {
  return logStepResolutionContext(uri) ||
    `  (enable gs-behave-bdd.verboseLogging to include the detailed reason here)`;
}


/**
 * Builds the log file name for a report. Timestamped so repeated runs (e.g. before and after
 * a settings change) don't overwrite each other, and colon-free so it is a legal Windows name.
 */
export function diagnosticReportFileName(now: Date): string {
  const stamp = now.toISOString().replace(/\.\d+Z$/, "").replace(/:/g, "-");
  return `gs-behave-bdd-diagnostics-${stamp}.log`;
}


/**
 * Streams src onto the end of dest. Used instead of readFile+append so that appending the
 * session log costs a fixed-size buffer regardless of how large that log is.
 */
async function appendFileToFile(src: string, dest: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const readStream = fs.createReadStream(src);
    const writeStream = fs.createWriteStream(dest, { flags: "a" });
    readStream.on("error", reject);
    writeStream.on("error", reject);
    writeStream.on("close", resolve);
    readStream.pipe(writeStream);
  });
}


/**
 * Command handler: writes the summary to a .log file, appends the full session log, and opens
 * it. A file rather than the clipboard because the session log is unbounded - it can run to
 * megabytes, which is too much to paste anywhere but fine to attach to an issue.
 */
export async function diagnosticReportHandler(): Promise<void> {
  try {
    const summary = await buildDiagnosticReport();

    const filePath = path.join(os.tmpdir(), diagnosticReportFileName(new Date()));
    await fs.promises.writeFile(filePath, summary + "\n", "utf8");

    // the tail of the log is the most recently written and therefore the most likely to still
    // be sitting in the stream's buffer, so flush before reading it back
    await config.logger.flushSessionLog();
    const sessionLogPath = config.logger.getSessionLogPath();
    if (sessionLogPath && fs.existsSync(sessionLogPath))
      await appendFileToFile(sessionLogPath, filePath);
    else
      await fs.promises.appendFile(filePath, "(no session log was captured)\n", "utf8");

    await fs.promises.appendFile(filePath, "\n===== end of diagnostic report =====\n", "utf8");

    // Open it so the user can eyeball it (and redact anything they'd rather not share)
    // before attaching it to an issue.
    const fileUri = vscode.Uri.file(filePath);
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc, { preview: false });

    const picked = await vscode.window.showInformationMessage(
      `Behave BDD diagnostic report written to ${filePath}`, "Copy Path", "Reveal in Explorer");
    if (picked === "Copy Path")
      await vscode.env.clipboard.writeText(filePath);
    else if (picked === "Reveal in Explorer")
      await vscode.commands.executeCommand("revealFileInOS", fileUri);
  }
  catch (e: unknown) {
    // entry point function (handler) - show error
    config.logger.showError(e);
  }
}
