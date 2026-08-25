import * as vscode from 'vscode';
import * as os from 'os';
import { WorkspaceSettings } from "../settings";
import { runBehaveInstance } from './behaveRun';
import { debugBehaveInstance, getDebugOutputFileUri } from './behaveDebug';
import { QueueItem } from '../extension';
import { WkspError, escapeRegex } from '../common';
import { STREAM_FORMATTER_NAME } from '../bundledBehave';
import { WkspRun } from './testRunHandler';
import { ExampleRow } from '../parsers/testFile';



// hard-code any settings we MUST have (i.e. override user behave.ini file only where absolutely necessary)
// NOTE: --junit-directory must stay LAST - callers append its value.
const OVERRIDE_ARGS = [
  // Without this, behave sees a pipe rather than a tty, runs monochrome, and its
  // pretty formatter reports no step status at all: match() prints the step as
  // Status.executing and result() deliberately does nothing ("Step.status is not
  // used in monochrome mode", formatter/pretty.py:157-175). No colour, no
  // timings, and a failed step that looks identical to a passed one.
  // Use the "--color=on" form, NOT "--color on": behave special-cases a
  // valueless --color followed by positional paths (configuration.py:946-957),
  // and the "=" form avoids that path entirely.
  "--color=on",
  // Pinned, not merely relied on. It is behave's default, but a user can turn it
  // off in behave.ini, and it is what appends " # <file>:<line>" to every feature
  // and scenario header (formatter/pretty.py:123-126,349-351). That comment is how
  // output lines are attributed to a scenario - it travels in the output itself,
  // so unlike the event stream it cannot arrive out of order with the lines it
  // describes. Without it, output falls back to feature-level attribution.
  "--show-source",
  "--show-skipped", // show-skipped is required for skipped tests to produce junit output
  "--junit",
  "--junit-directory"
];


/** Feature file stem, used to attribute output lines when runs share a TestRun. */
function featureStem(workspaceRelativePath: string): string {
  const name = workspaceRelativePath.replaceAll("\\", "/").split("/").pop() ?? "";
  return name.replace(/\.feature$/i, "");
}


/**
 * Formatter args for this behave process, or [] to leave behave's defaults alone.
 *
 * Two independent questions decide these: where behave's human-readable output
 * should go, and whether the event stream is wanted alongside it.
 *
 *  - On a RUN, pretty goes to stdout ("-o -"), which is piped and filtered.
 *  - On a DEBUG run, stdout is the debug console and belongs to the user's own
 *    print() output, so pretty goes to a file that behaveDebug tails instead.
 *    That is why a debug run names a formatter even when streaming is off.
 *
 * Both formatters get an EXPLICIT outfile, which matters:
 *  - Naming any formatter suppresses behave's default, so without "-f pretty" the
 *    human-readable output disappears entirely (default_format only applies when
 *    no formatters are configured).
 *  - make_formatters() pairs config.format[i] with config.outputs[i] and falls back
 *    to stdout beyond the end, so an unpaired "-f pretty" would be handed the
 *    NDJSON file.
 *
 * A user's own "format=" in behave.ini is preserved: behave appends CLI formatters
 * to the config's list, and format_outfiles_coupling() has already given each
 * config formatter its own "<name>.output" file, so the index pairing still lines up.
 */
export function getFormatterArgs(wr: WkspRun, label: string): string[] {

  // A run with streaming off wants behave's stock behaviour exactly - naming
  // nothing is both correct and one less pairing to keep aligned.
  if (!wr.debug && !wr.streaming)
    return [];

  const prettyOutfile = wr.debug ? `"${getDebugOutputFileUri(wr).fsPath}"` : "-";
  const args = ["-f", "pretty", "-o", prettyOutfile];

  if (wr.streaming && wr.streamSession) {
    // NOTE: not pure - this allocates the stream file for the behave process about to
    // be spawned and starts tailing it, so it must be called exactly once per spawn.
    const streamFileUri = wr.streamSession.open(label);
    args.push("-f", STREAM_FORMATTER_NAME, "-o", `"${streamFileUri.fsPath}"`);
  }

  return args;
}


// Convert a workspace-relative path to a project-relative path
// e.g., "backend/features/test.feature" with projectPath "backend" becomes "features/test.feature"
function toProjectRelativePath(workspaceRelativePath: string, projectPath: string): string {
  if (!projectPath) {
    return workspaceRelativePath;
  }
  // Normalize separators to forward slashes
  const normalizedPath = workspaceRelativePath.replaceAll("\\", "/");
  const normalizedProjectPath = projectPath.replaceAll("\\", "/").replace(/\/$/, "");

  if (normalizedPath.startsWith(normalizedProjectPath + "/")) {
    return normalizedPath.slice(normalizedProjectPath.length + 1);
  }
  return normalizedPath;
}


export async function runOrDebugAllFeaturesInOneInstance(wr: WkspRun): Promise<void> {
  // runs all features in a single instance of behave

  const friendlyEnvVars = getFriendlyEnvVars(wr.wkspSettings);
  const { ps1, ps2 } = getPSCmdModifyIfWindows();

  const friendlyArgs = [...OVERRIDE_ARGS, `"${wr.junitRunDirUri.fsPath}"`,
    ...getFormatterArgs(wr, "all-features")];
  const args = friendlyArgs.map(x => x.replaceAll('"', ""));

  const friendlyCmd = `${ps1}cd "${wr.wkspSettings.projectUri.fsPath}"\n` +
    `${friendlyEnvVars}${ps2}"${wr.pythonExec}" -m behave ${friendlyArgs.join(" ")}`;

  if (wr.debug) {
    await debugBehaveInstance(wr, args, friendlyCmd);
    return;
  }

  await runBehaveInstance(wr, args, friendlyCmd);
}


export async function runOrDebugFeatures(wr: WkspRun, parallelMode: boolean, scenarioQueueItems: QueueItem[]): Promise<void> {

  // runs selected features in a single instance of behave
  // (if we are in parallelMode, then up the stack this will be called without await)

  try {

    if (parallelMode && wr.debug)
      throw new Error("running async debug is not supported");

    const pipedPathPatterns = getPipedFeaturePathsPattern(wr, parallelMode, scenarioQueueItems);
    const friendlyEnvVars = getFriendlyEnvVars(wr.wkspSettings);
    const { ps1, ps2 } = getPSCmdModifyIfWindows();

    // In parallel mode this instance covers exactly one feature, so name its stream
    // after that feature; otherwise it covers the lot.
    const streamLabel = parallelMode && scenarioQueueItems.length > 0
      ? featureStem(scenarioQueueItems[0].scenario.featureFileWorkspaceRelativePath)
      : "features";

    const friendlyArgs = ["-i", `"${pipedPathPatterns}"`, ...OVERRIDE_ARGS, `"${wr.junitRunDirUri.fsPath}"`,
      ...getFormatterArgs(wr, streamLabel)];
    const args = friendlyArgs.map(x => x.replaceAll('"', ""));

    const friendlyCmd = `${ps1}cd "${wr.wkspSettings.projectUri.fsPath}"\n` +
      `${friendlyEnvVars}${ps2}"${wr.pythonExec}" -m behave ${friendlyArgs.join(" ")}`;

    if (wr.debug) {
      await debugBehaveInstance(wr, args, friendlyCmd);
      return;
    }

    // In parallel mode this instance covers exactly one feature, so its output
    // can be prefixed and attached to that feature's test item.
    let outputPrefix = "";
    let outputTest: vscode.TestItem | undefined;
    if (parallelMode && scenarioQueueItems.length > 0) {
      outputPrefix = `[${streamLabel}] `;
      outputTest = scenarioQueueItems[0].test.parent;
    }

    await runBehaveInstance(wr, args, friendlyCmd, outputPrefix, outputTest);
  }
  catch (e: unknown) {
    // unawaited (if runParallel) async func, must log the error
    // NOTE: do NOT end the run here - testRunHandler owns run.end() in its
    // finally block, and ending early silently discards every later update.
    throw new WkspError(e, wr.wkspSettings.uri, wr.run);
  }

}


export async function runOrDebugFeatureWithSelectedScenarios(wr: WkspRun, parallelMode: boolean,
  selectedScenarioQueueItems: QueueItem[]): Promise<void> {

  // runs selected scenarios in a single instance of behave
  // (if we are in parallelMode, then up the stack this will be called without await)

  try {

    if (parallelMode && wr.debug)
      throw new Error("running parallel debug is not supported");

    const pipedScenarioNames = getPipedScenarioNames(selectedScenarioQueueItems);
    const friendlyEnvVars = getFriendlyEnvVars(wr.wkspSettings);
    const { ps1, ps2 } = getPSCmdModifyIfWindows();
    const featureFileWorkspaceRelativePath = selectedScenarioQueueItems[0].scenario.featureFileWorkspaceRelativePath;
    // Convert workspace-relative path to project-relative path for behave
    const featureFileProjectRelativePath = toProjectRelativePath(
      featureFileWorkspaceRelativePath,
      wr.wkspSettings.workspaceRelativeProjectPath
    );

    const friendlyArgs = [
      "-i", `"${featureFileProjectRelativePath}$"`,
      "-n", `"${pipedScenarioNames}"`,
      ...OVERRIDE_ARGS, `"${wr.junitRunDirUri.fsPath}"`,
      ...getFormatterArgs(wr, featureStem(featureFileWorkspaceRelativePath)),
    ];
    const args = friendlyArgs.map(x => x.replace(/^"(.*)"$/, '$1'));

    const friendlyCmd = `${ps1}cd "${wr.wkspSettings.projectUri.fsPath}"\n` +
      `${friendlyEnvVars}${ps2}"${wr.pythonExec}" -m behave ${friendlyArgs.join(" ")}`;

    if (wr.debug) {
      await debugBehaveInstance(wr, args, friendlyCmd);
      return;
    }

    // This form always targets a single feature file, so prefix and attach its
    // output whenever the run may be sharing a TestRun with other instances.
    const outputPrefix = wr.wkspSettings.runParallel && !wr.debug
      ? `[${featureStem(featureFileWorkspaceRelativePath)}] `
      : "";
    const outputTest = wr.wkspSettings.runParallel && !wr.debug
      ? selectedScenarioQueueItems[0].test.parent
      : undefined;

    await runBehaveInstance(wr, args, friendlyCmd, outputPrefix, outputTest);
  }
  catch (e: unknown) {
    // unawaited (if runParallel) async func, must log the error
    // NOTE: do NOT end the run here - testRunHandler owns run.end() in its
    // finally block, and ending early silently discards every later update.
    throw new WkspError(e, wr.wkspSettings.uri, wr.run);
  }

}


function getPipedFeaturePathsPattern(wr: WkspRun, parallelMode: boolean, filteredChildItems: QueueItem[]) {

  // build the -i path pattern parameter for behave
  // which is a regex of the form: 
  // features/path1/|features/path2/|features/path3/|features/path4/my.feature$|features/path5/path6/my.feature$

  const projectPath = wr.wkspSettings.workspaceRelativeProjectPath;

  // reduce the folders to the top-level where possible
  const folderPaths: string[] = [];
  if (!parallelMode) {

    // get the user-selected folder paths
    const selectedFolderIds = wr.request.include?.filter(x => !x.uri).map(x => x.id) ?? [];

    folderPaths.push(...selectedFolderIds.map(id => {
      const wkspRelPath = vscode.workspace.asRelativePath(vscode.Uri.parse(id), false) + "/";
      return toProjectRelativePath(wkspRelPath, projectPath);
    }));

    // keep only the top level folder paths (i.e. if we have a/b/c and a/b, remove a/b/c)
    folderPaths.sort();
    for (let i = folderPaths.length - 1; i > 0; i--) {
      if (folderPaths[i].startsWith(folderPaths[i - 1]))
        folderPaths.splice(i, 1);
    }
  }


  // get the feature paths (workspace-relative) and convert to project-relative, remove duplicates
  const distinctFeaturePaths = [...new Set(filteredChildItems.map(qi =>
    toProjectRelativePath(qi.scenario.featureFileWorkspaceRelativePath, projectPath)
  ))];

  // remove any feature path already covered by a parent folder selected by the user
  const featurePathsNotCoveredByFolderPaths = distinctFeaturePaths.filter(x => folderPaths.every(y => !x.includes(y)));

  // NOTE!! be careful changing the `x + "$"` to another regex!
  // you will need to retest it with nested folders/features, top level folders,
  // individual features and individual/multiple selected scenarios across both example project A and project B

  // as an example of what can go wrong, currently, this would work fine:
  // cd "example-projects/project A"
  // python" -m behave -i "^behave tests/some tests/group1_features/"

  // BUT this would NOT work:
  // cd "example-projects/project B"
  // python -m behave -i "^features/grouped/"


  // BE VERY CAREFUL CHANGING THE PATTERN REGEX - SEE ABOVE NOTES AND TEST THOROUGHLY
  return folderPaths.map(x => x)
    .concat(...featurePathsNotCoveredByFolderPaths.map(x => x + "$"))
    .join('|')
    .replaceAll("\\", "/");
}


function getPipedScenarioNames(selectedScenarios: QueueItem[]) {
  const scenarioNames: string[] = [];
  selectedScenarios.forEach(x => {
    scenarioNames.push(getScenarioRunName(x.scenario.scenarioName, x.scenario.isOutline, x.scenario.exampleRow));
  });
  const pipedScenarioNames = scenarioNames.join("|");
  return pipedScenarioNames;
}


export function getScenarioRunName(scenName: string, isOutline: boolean, exampleRow?: ExampleRow) {
  let scenarioName = escapeRegex(scenName);

  // individual example row — match outline name (with <param> → .*) + row suffix
  if (exampleRow) {
    // Replace <param> placeholders with .* since behave substitutes actual values
    if (scenarioName.includes("<"))
      scenarioName = scenarioName.replace(/<[^>]*>/g, ".*");
    // Build the row suffix: " -- @tableIndex.rowIndex [examplesName]"
    const escapedExName = escapeRegex(exampleRow.examplesName);
    const suffix = exampleRow.examplesName
      ? ` -- @${exampleRow.tableIndex}\\.${exampleRow.rowIndex} ${escapedExName}`
      : ` -- @${exampleRow.tableIndex}\\.${exampleRow.rowIndex}`;
    return "^" + scenarioName + suffix + "$";
  }

  // scenario outline with a <param> in its name
  if (isOutline && scenarioName.includes("<"))
    scenarioName = scenarioName.replace(/<[^>]*>/g, ".*");

  return "^" + scenarioName + (isOutline ? " -- @" : "$");
}


function getFriendlyEnvVars(wkspSettings: WorkspaceSettings) {
  let envVars = "";
  const effectiveEnvVars = wkspSettings.getEffectiveEnvVars();

  for (const [name, value] of Object.entries(effectiveEnvVars)) {
    envVars += os.platform() === "win32" ?
      typeof value === "number" ? `$Env:${name}=${value}\n` : `$Env:${`${name}="${value.replace('"', '""')}"`}\n` :
      typeof value === "number" ? `${name}=${value} ` : `${name}="${value.replace('"', '\\"')}" `;
  }

  return envVars;
}


function getPSCmdModifyIfWindows(): { ps1: string, ps2: string } {
  let ps1 = "", ps2 = "";
  if (os.platform() === "win32") {
    ps1 = `powershell commands:\n`;
    ps2 = "& ";
  }
  return { ps1, ps2 };
}
