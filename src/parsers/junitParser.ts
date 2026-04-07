import * as vscode from 'vscode';
import * as os from 'os';
import * as xml2js from 'xml2js';
import { QueueItem } from "../extension";
import { getContentFromFilesystem, showDebugWindow, WIN_MAX_PATH, WkspError } from '../common';
import { config } from '../configuration';
import { getJunitWkspRunDirUri } from '../watchers/junitWatcher';
import { WorkspaceSettings } from '../settings';


export type parseJunitFileResult = { junitContents: JunitContents, fsPath: string };

interface JunitContents {
  testsuite: TestSuite
}

interface TestSuite {
  "$": {
    name: string,
    tests: number,
    errors: number,
    failures: number,
    skipped: number,
    time: number,
    timestamp: string,
    hostname: string
  },
  testcase: [TestCase]
}

interface TestCase {
  "$": {
    classname: string,
    name: string,
    status: string,
    time: number
  },
  skipped: string[],
  "system-out": string[]
  failure: [Reason]
  error: [Reason]
}

interface Reason {
  "_": string,
  "$": {
    type: string,
    message: string
  }
}

type ParseResult = {
  status: string,
  duration: number,
  failedText?: string,
}


export function updateTest(run: vscode.TestRun, debug: boolean, result: ParseResult, item: QueueItem): void {

  const window = debug ? "debug console" : `Behave VSC output window`;
  let message: vscode.TestMessage;

  if (run.token.isCancellationRequested)
    return;

  switch (result.status) {
    case "passed":
      run.passed(item.test, result.duration);
      break;
    case "skipped":
      run.skipped(item.test);
      break;
    case "no-junit-file":
      run.errored(item.test, new vscode.TestMessage(`No JUnit file was written for this test. Check output in ${window}.`));
      break;
    case "untested":
      run.errored(item.test, new vscode.TestMessage(`JUnit result was "untested". Check output in ${window}.`));
      break;
    case "failed":
      if (!item.test.uri || !item.test.range)
        throw "invalid test item";
      message = new vscode.TestMessage(result.failedText ?? "failed");
      message.location = new vscode.Location(item.test.uri, item.test.range);
      run.failed(item.test, message, result.duration);
      break;
    case "error":
    case "hook_error":
      if (!item.test.uri || !item.test.range)
        throw "invalid test item";
      message = new vscode.TestMessage(result.failedText ?? "error");
      message.location = new vscode.Location(item.test.uri, item.test.range);
      run.errored(item.test, message, result.duration);
      break;
    default:
      throw `Unhandled test result status: ${result.status}`;
  }

  item.scenario.result = result.status;
  const statusOutput = result.status === "passed" || result.status === "skipped"
    ? result.status.toUpperCase()
    : result.status === "error" || result.status === "hook_error"
      ? "ERROR"
      : "FAILED";
  run.appendOutput(`Test item ${vscode.Uri.parse(item.test.id).fsPath}: ${statusOutput}\r\n`);

  // Propagate failure/error results to ancestor items (group and outline) so the
  // error message is visible on parent nodes in the Test Explorer, not just the row.
  if (item.scenario.exampleRow && (result.status === "failed" || result.status === "error" || result.status === "hook_error")) {
    let ancestor = item.test.parent;
    while (ancestor) {
      const msg = new vscode.TestMessage(result.failedText ?? result.status);
      if (ancestor.uri && ancestor.range)
        msg.location = new vscode.Location(ancestor.uri, ancestor.range);
      if (result.status === "failed")
        run.failed(ancestor, msg, result.duration);
      else
        run.errored(ancestor, msg, result.duration);
      ancestor = ancestor.parent;
    }
  }

}


function CreateParseResult(wkspSettings: WorkspaceSettings, debug: boolean, testCase: TestCase, actualDuration?: number): ParseResult {

  let xmlDuration = testCase.$.time * 1000;
  const xmlStatus = testCase.$.status;

  if (actualDuration)
    xmlDuration = actualDuration;

  if (xmlStatus === "passed" || xmlStatus === "skipped")
    return { status: xmlStatus, duration: xmlDuration };

  if (xmlStatus === "untested") {
    if (debug)
      showDebugWindow();
    else
      config.logger.show(wkspSettings.uri);
    return { status: "untested", duration: xmlDuration };
  }

  if (xmlStatus !== "failed" && xmlStatus !== "error" && xmlStatus !== "hook_error") {
    throw new Error(`Unrecognised behave scenario status result "${xmlStatus}" found while parsing junit file ` +
      `for testCase "${testCase.$.name}"`);
  }

  // status === "failed", "error", or "hook_error"

  const reasonBlocks: string[] = [];
  const concatErrText = (testCase: TestCase) => {
    const build = (reasons: Reason[]) => {
      if (!reasons)
        return;
      reasons.forEach(reason => {
        let reasonBlock = "";
        if (reason.$.type && reason.$.type !== "NoneType")
          reasonBlock += `${reason.$.type.replace("\n", "")}\n`;
        if (reason.$.message)
          reasonBlock += `${reason.$.message.replace("\n", "")}\n`;
        if (reason._)
          reasonBlock += reason._.trim();
        reasonBlocks.push(reasonBlock);
      });
    }
    build(testCase.failure);
    build(testCase.error);
  }

  concatErrText(testCase);

  if (reasonBlocks.length === 0)
    throw new Error("Failed test has no failure or error message");

  // remove any error text we don't need in the UI
  let errText = "";
  reasonBlocks.forEach(reason => {
    const lines = reason.split("\n");
    lines.forEach(line => {
      if (!line.startsWith("Location: ") && /None$/.exec(line) === null) {
        errText += line.replace(/ ... failed in .+\..+s$/, " ... failed").replace(/ ... undefined in .+\..+s$/, " ... undefined") + "\n";
      }
    });
  });
  errText = errText.trim();

  return { status: xmlStatus, duration: xmlDuration, failedText: errText };
}


function getjUnitName(wkspSettings: WorkspaceSettings, featureFileName: string, featureFileWorkspaceRelativePath: string) {

  const featureFileStem = featureFileName.replace(/.feature$/, "");

  // default
  let dotSubFolders = featureFileWorkspaceRelativePath.replace(
    wkspSettings.workspaceRelativeFeaturesPath + "/", "").split("/").slice(0, -1).join(".");

  // if features and steps are sibling folders
  if (!wkspSettings.stepsSearchUri.path.startsWith(wkspSettings.featuresUri.path)) {
    if (featureFileWorkspaceRelativePath === "features/" + featureFileName) {
      dotSubFolders = featureFileWorkspaceRelativePath.split("/").slice(0, -1).join(".");
    }
    else {
      if (os.platform() === "win32") {
        const lastDir = wkspSettings.workspaceRelativeFeaturesPath.split("/").pop();
        if (lastDir === "features")
          dotSubFolders = dotSubFolders ? lastDir + "." + dotSubFolders : lastDir;
      }
    }
  }

  dotSubFolders = dotSubFolders === "" ? "" : dotSubFolders + ".";
  return `${dotSubFolders}${featureFileStem}`;
}


function getJunitFileUri(wkspSettings: WorkspaceSettings, queueItem: QueueItem, wkspJunitRunDirUri: vscode.Uri): vscode.Uri {

  const junitName = getjUnitName(wkspSettings, queueItem.scenario.featureFileName,
    queueItem.scenario.featureFileWorkspaceRelativePath);

  const junitFilename = `TESTS-${junitName}.xml`;

  const junitFileUri = vscode.Uri.joinPath(wkspJunitRunDirUri, junitFilename);

  if (os.platform() !== "win32")
    return junitFileUri;

  if (junitFileUri.fsPath.length <= WIN_MAX_PATH)
    return junitFileUri;

  throw `windows max path exceeded while trying to build junit file path: ${junitFileUri.fsPath}`;
}


export class QueueItemMapEntry {
  constructor(
    public readonly queueItem: QueueItem,
    public readonly junitFileUri: vscode.Uri,
    public readonly wkspSettings: WorkspaceSettings,
    public updated = false
  ) { }
}


export function getWkspQueueJunitFileMap(wkspSettings: WorkspaceSettings, run: vscode.TestRun, wkspQueueItems: QueueItem[]) {
  const wkspJunitRunDirUri = getJunitWkspRunDirUri(run, wkspSettings.name);
  return wkspQueueItems.map(qi => {
    const junitFileUri = getJunitFileUri(wkspSettings, qi, wkspJunitRunDirUri);
    return new QueueItemMapEntry(qi, junitFileUri, wkspSettings);
  });
}




export async function parseJunitFileAndUpdateTestResults(wkspSettings: WorkspaceSettings, run: vscode.TestRun, debug: boolean,
  junitFileUri: vscode.Uri, filteredQueue: QueueItem[]): Promise<void> {

  if (!junitFileUri.fsPath.toLowerCase().endsWith(".xml"))
    throw new WkspError("junitFileUri must be an xml file", wkspSettings.uri);

  let junitXml: string;
  try {
    junitXml = await getContentFromFilesystem(junitFileUri);
  }
  catch {
    updateTestResultsForUnreadableJunitFile(wkspSettings, run, filteredQueue, junitFileUri);
    return;
  }

  const parser = new xml2js.Parser();
  let junitContents: JunitContents;
  try {
    junitContents = await parser.parseStringPromise(junitXml);
  }
  catch {
    throw new WkspError(`Unable to parse junit file ${junitFileUri.fsPath}`, wkspSettings.uri);
  }


  for (const queueItem of filteredQueue) {

    const fullFeatureName = getjUnitName(wkspSettings, queueItem.scenario.featureFileName,
      queueItem.scenario.featureFileWorkspaceRelativePath);
    const className = `${fullFeatureName}.${queueItem.scenario.featureName}`;
    const scenarioName = queueItem.scenario.scenarioName;

    // individual example row — match by outline name + row suffix.
    // Behave substitutes <param> values in junit names, so we:
    // 1. Match the row suffix exactly (e.g. " -- @1.1 Amphibians")
    // 2. Extract the scenario part (before " -- @") and verify it matches the outline name
    //    pattern (with <param> → .* for outlines that use parameters).
    // This prevents ambiguity when multiple outlines share the same Examples name and row index.
    if (queueItem.scenario.exampleRow) {
      const { tableIndex, rowIndex, examplesName: exName } = queueItem.scenario.exampleRow;
      const rowSuffix = exName ? ` -- @${tableIndex}.${rowIndex} ${exName}` : ` -- @${tableIndex}.${rowIndex}`;

      // Build an outline name regex: exact for plain names, .* for <param> placeholders
      let outlinePattern = scenarioName.replace(/[".*+?^${}()|[\]\\]/g, '\\$&');
      if (scenarioName.includes("<"))
        outlinePattern = outlinePattern.replace(/<[^>]*>/g, ".*");
      const outlineRx = new RegExp("^" + outlinePattern + "$");

      const queueItemResults = junitContents.testsuite.testcase.filter(tc => {
        if (tc.$.classname !== className || !tc.$.name.endsWith(rowSuffix))
          return false;
        // Extract the scenario name portion (before " -- @") and match against the outline pattern
        const jScenName = tc.$.name.substring(0, tc.$.name.lastIndexOf(" -- @"));
        return outlineRx.test(jScenName);
      });
      if (queueItemResults.length === 0) {
        throw `could not match example row queueItem to junit result, when trying to match with $.classname="${className}", ` +
          `outline pattern "${outlineRx.source}", suffix "${rowSuffix}" in file ${junitFileUri.fsPath}`;
      }

      // When <param> outlines produce ambiguous matches (e.g. "Blend .*" matches both
      // "Blend Frog" and "Blend paramless"), prefer the non-skipped result.
      if (queueItemResults.length > 1) {
        const nonSkipped = queueItemResults.find(tc => tc.$.status !== "skipped");
        if (nonSkipped) {
          const parseResult = CreateParseResult(wkspSettings, debug, nonSkipped);
          updateTest(run, debug, parseResult, queueItem);
          continue;
        }
      }
      const parseResult = CreateParseResult(wkspSettings, debug, queueItemResults[0]);
      updateTest(run, debug, parseResult, queueItem);
      continue;
    }

    // normal scenario
    let queueItemResults = junitContents.testsuite.testcase.filter(tc =>
      tc.$.classname === className && tc.$.name === scenarioName
    );

    // scenario outline
    if (queueItemResults.length === 0) {
      queueItemResults = junitContents.testsuite.testcase.filter(tc =>
        tc.$.classname === className && tc.$.name.substring(0, tc.$.name.lastIndexOf(" -- @")) === scenarioName
      );
    }

    // scenario outline with <param> in scenario outline name
    if (queueItemResults.length === 0 && scenarioName.includes("<")) {
      queueItemResults = junitContents.testsuite.testcase.filter(tc => {
        const jScenName = tc.$.name.substring(0, tc.$.name.lastIndexOf(" -- @"));
        const rx = new RegExp(scenarioName.replace(/<.*>/g, ".*"));
        return tc.$.classname === className && rx.test(jScenName);
      });
    }


    if (queueItemResults.length === 0) {
      throw `could not match queueItem to junit result, when trying to match with $.classname="${className}", ` +
      `$.name="${queueItem.scenario.scenarioName}" in file ${junitFileUri.fsPath}`;
    }

    let queueItemResult = queueItemResults[0];

    // scenario outline
    if (queueItemResults.length > 1) {
      for (const qir of queueItemResults) {
        if (qir.$.status === "failed") {
          queueItemResult = qir;
          break;
        }
      }
    }

    const parseResult = CreateParseResult(wkspSettings, debug, queueItemResult);
    updateTest(run, debug, parseResult, queueItem);
  }
}


export function updateTestResultsForUnreadableJunitFile(wkspSettings: WorkspaceSettings, run: vscode.TestRun,
  queueItems: QueueItem[], junitFileUri: vscode.Uri) {

  const parseResult = { status: "no-junit-file", duration: 0 };
  for (const queueItem of queueItems) {
    updateTest(run, false, parseResult, queueItem);
  }

  if (config.exampleProject) {
    debugger; // eslint-disable-line no-debugger
    throw `JUnit file ${junitFileUri.fsPath} could not be read.`;
  }

  config.logger.show(wkspSettings.uri);
}
