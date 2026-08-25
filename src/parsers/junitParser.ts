import * as vscode from 'vscode';
import * as os from 'os';
import * as xml2js from 'xml2js';
import { QueueItem } from "../extension";
import { getContentFromFilesystem, showDebugWindow, WIN_MAX_PATH, WkspError, escapeRegex } from '../common';
import { config } from '../configuration';
import { getJunitWkspRunDirUri } from '../watchers/junitWatcher';
import { WorkspaceSettings } from '../settings';
import { isSettledByStream } from '../runners/streamResults';
import { buildFailureMessage } from '../runners/failureMessage';


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
  /**
   * Feature file and 1-based line of the failing step, from the "Location:" line
   * behave writes into the junit failure body (reporter/junit.py:506-512). It is
   * stripped from the displayed text, but the position itself is the most precise
   * the junit path has - previously it was parsed off and thrown away, and the
   * message was anchored on the scenario header instead.
   */
  failedAt?: { file: string, line: number },
}


export function updateTest(wkspSettings: WorkspaceSettings, run: vscode.TestRun, debug: boolean,
  result: ParseResult, item: QueueItem, reportedAncestors = new Set<string>()): void {

  const window = debug ? "debug console" : `Behave BDD output window`;
  let message: vscode.TestMessage;

  // The live event stream already settled this one; junit is only a verifier now,
  // so leave it alone rather than re-deriving it from a name match.
  if (isSettledByStream(run.name, item.test.id))
    return;

  // On cancellation, only the SYNTHETIC "no junit file" result is suppressed - a
  // scenario that never ran must not be reported as errored. A real result parsed
  // from a junit file is still true and is kept: discarding those meant a cancelled
  // run told you nothing about the work it had already completed.
  if (run.token.isCancellationRequested && result.status === "no-junit-file")
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
      message = buildFailureMessage(result.failedText ?? "failed", failureLocation(wkspSettings, result, item.test));
      run.failed(item.test, message, result.duration);
      break;
    case "error":
    case "hook_error":
    case "cleanup_error":
      if (!item.test.uri || !item.test.range)
        throw "invalid test item";
      message = buildFailureMessage(result.failedText ?? "error", failureLocation(wkspSettings, result, item.test));
      run.errored(item.test, message, result.duration);
      break;
    default:
      throw `Unhandled test result status: ${result.status}`;
  }

  item.scenario.result = result.status;
  // NOTE: deliberately no "Test item <path>: STATUS" line here. It appeared in
  // the same stream as behave's own output, but arrived in a burst once the
  // feature's junit file was parsed - so out of order with the text it described
  // - and nothing on the command line looks like it. The result still reaches
  // the UI via run.passed()/failed()/errored() above.

  // Propagate failure/error results to ancestor items (group and outline) so the
  // error message is visible on parent nodes in the Test Explorer, not just the row.
  // Use reportedAncestors to avoid duplicate calls when multiple rows fail in the same group.
  if (item.scenario.exampleRow && (result.status === "failed" || result.status === "error" || result.status === "hook_error" || result.status === "cleanup_error")) {
    let ancestor = item.test.parent;
    while (ancestor) {
      if (reportedAncestors.has(ancestor.id))
        break;
      reportedAncestors.add(ancestor.id);
      // An ancestor is anchored at its OWN position, not the failing step's: the
      // outline/group header is what the user clicks on in the tree.
      const ancestorLocation = ancestor.uri && ancestor.range
        ? new vscode.Location(ancestor.uri, ancestor.range)
        : undefined;
      const msg = buildFailureMessage(result.failedText ?? result.status, ancestorLocation);
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

  if (xmlStatus !== "failed" && xmlStatus !== "error" && xmlStatus !== "hook_error" && xmlStatus !== "cleanup_error") {
    throw new Error(`Unrecognised behave scenario status result "${xmlStatus}" found while parsing junit file ` +
      `for testCase "${testCase.$.name}"`);
  }

  // status === "failed", "error", "hook_error", or "cleanup_error"

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

  // remove any error text we don't need in the UI. The "Location:" line is parsed
  // out rather than merely skipped: it names the failing step's line in the feature
  // file, which is a better place to anchor the message than the scenario header.
  let errText = "";
  let failedAt: { file: string, line: number } | undefined;
  reasonBlocks.forEach(reason => {
    const lines = reason.split("\n");
    lines.forEach(line => {
      if (line.startsWith("Location: ")) {
        failedAt = failedAt ?? parseFailureLocation(line);
        return;
      }
      if (/None$/.exec(line) === null) {
        errText += line.replace(/ ... failed in .+\..+s$/, " ... failed").replace(/ ... undefined in .+\..+s$/, " ... undefined") + "\n";
      }
    });
  });
  errText = errText.trim();

  return { status: xmlStatus, duration: xmlDuration, failedText: errText, failedAt };
}


/**
 * Parse behave's "Location: <feature file>:<line>" failure line.
 *
 * The path is relative to behave's working directory (the project), matching the
 * event stream's own "file" field, so both paths resolve it the same way.
 */
function parseFailureLocation(line: string): { file: string, line: number } | undefined {
  const match = /^Location: (.+):(\d+)$/.exec(line.trim());
  if (!match)
    return undefined;
  return { file: match[1], line: parseInt(match[2], 10) };
}


/** Resolve a junit failure location onto the feature file it names. */
function failureLocation(wkspSettings: WorkspaceSettings, result: ParseResult,
  item: vscode.TestItem): vscode.Location | undefined {

  // projectUri is what behave's relative path is relative to; without it the path
  // cannot be resolved, so fall back rather than guessing at a location.
  if (result.failedAt && wkspSettings.projectUri) {
    const uri = vscode.Uri.joinPath(wkspSettings.projectUri, result.failedAt.file.replace(/\\/g, "/"));
    // A Range, not a bare Position: Location accepts either, but every other
    // location here is a Range and consumers read .range.start.
    const at = new vscode.Position(Math.max(0, result.failedAt.line - 1), 0);
    return new vscode.Location(uri, new vscode.Range(at, at));
  }

  if (item.uri && item.range)
    return new vscode.Location(item.uri, item.range);

  return undefined;
}


function getjUnitName(wkspSettings: WorkspaceSettings, featureFileName: string, featureFileWorkspaceRelativePath: string) {

  const featureFileStem = featureFileName.replace(/.feature$/, "");

  // Find the matching features root for this feature file's relative path
  let matchingRelPath = wkspSettings.workspaceRelativeFeaturesPath; // default to primary
  for (const relPath of wkspSettings.workspaceRelativeFeaturesPaths) {
    if (featureFileWorkspaceRelativePath.startsWith(relPath + "/")) {
      matchingRelPath = relPath;
      break;
    }
  }

  let dotSubFolders = featureFileWorkspaceRelativePath.replace(
    matchingRelPath + "/", "").split("/").slice(0, -1).join(".");

  // sibling-steps check: use the matching root's stepsSearchUri/featuresUri pair
  const rootIndex = wkspSettings.workspaceRelativeFeaturesPaths.indexOf(matchingRelPath);
  const stepsUri = rootIndex >= 0 ? wkspSettings.stepsSearchUris[rootIndex] : wkspSettings.stepsSearchUri;
  const featUri = rootIndex >= 0 ? wkspSettings.featuresUris[rootIndex] : wkspSettings.featuresUri;

  if (!stepsUri.path.startsWith(featUri.path)) {
    if (featureFileWorkspaceRelativePath === "features/" + featureFileName) {
      dotSubFolders = featureFileWorkspaceRelativePath.split("/").slice(0, -1).join(".");
    }
    else {
      if (os.platform() === "win32") {
        const lastDir = matchingRelPath.split("/").pop();
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

  // Retry parsing to handle the case where the filesystem watcher fires while
  // behave is still mid-write, producing truncated/corrupt XML.
  const maxRetries = 3;
  const retryDelayMs = 200;
  let junitContents!: JunitContents;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const parser = new xml2js.Parser();
    try {
      junitContents = await parser.parseStringPromise(junitXml);
      break;
    }
    catch {
      if (attempt === maxRetries)
        throw new WkspError(`Unable to parse junit file ${junitFileUri.fsPath}`, wkspSettings.uri);
      await new Promise(r => setTimeout(r, retryDelayMs));
      try {
        junitXml = await getContentFromFilesystem(junitFileUri);
      }
      catch {
        updateTestResultsForUnreadableJunitFile(wkspSettings, run, filteredQueue, junitFileUri);
        return;
      }
    }
  }


  const reportedAncestors = new Set<string>();

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
      let outlinePattern = escapeRegex(scenarioName);
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
          updateTest(wkspSettings, run, debug, parseResult, queueItem, reportedAncestors);
          continue;
        }
      }
      const parseResult = CreateParseResult(wkspSettings, debug, queueItemResults[0]);
      updateTest(wkspSettings, run, debug, parseResult, queueItem, reportedAncestors);
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
        const rx = new RegExp("^" + escapeRegex(scenarioName).replace(/<[^>]*>/g, ".*") + "$");
        return tc.$.classname === className && rx.test(jScenName);
      });
    }


    if (queueItemResults.length === 0) {
      throw `could not match queueItem to junit result, when trying to match with $.classname="${className}", ` +
      `$.name="${queueItem.scenario.scenarioName}" in file ${junitFileUri.fsPath}`;
    }

    let queueItemResult = queueItemResults[0];

    // scenario outline — prefer failed, then non-skipped, then first
    if (queueItemResults.length > 1) {
      const failed = queueItemResults.find(qir => qir.$.status === "failed");
      if (failed) {
        queueItemResult = failed;
      } else {
        const nonSkipped = queueItemResults.find(qir => qir.$.status !== "skipped");
        if (nonSkipped)
          queueItemResult = nonSkipped;
      }
    }

    const parseResult = CreateParseResult(wkspSettings, debug, queueItemResult);
    updateTest(wkspSettings, run, debug, parseResult, queueItem, reportedAncestors);

    // When an outline is run directly, also update child group and row items
    // so individual example results are visible in the Test Explorer.
    if (queueItem.scenario.isOutline && queueItemResults.length > 1) {
      updateOutlineChildResults(wkspSettings, run, debug, queueItem.test, queueItemResults);
    }
  }
}


export function updateTestResultsForUnreadableJunitFile(wkspSettings: WorkspaceSettings, run: vscode.TestRun,
  queueItems: QueueItem[], junitFileUri: vscode.Uri) {

  const parseResult = { status: "no-junit-file", duration: 0 };
  for (const queueItem of queueItems) {
    updateTest(wkspSettings, run, false, parseResult, queueItem);
  }

  if (config.exampleProject) {
    debugger; // eslint-disable-line no-debugger
    throw `JUnit file ${junitFileUri.fsPath} could not be read.`;
  }

  config.logger.show(wkspSettings.uri);
}


/**
 * After running a Scenario Outline directly, propagate individual junit results
 * to the outline's child test items (Examples groups and their row items).
 * This makes per-row pass/fail visible in the Test Explorer even when the user
 * ran the outline as a whole rather than individual rows.
 */
function updateOutlineChildResults(wkspSettings: WorkspaceSettings, run: vscode.TestRun, debug: boolean,
  outlineItem: vscode.TestItem, testCases: TestCase[]) {

  // Build a lookup from the " -- @x.y name" suffix to testcase(s).
  // Multiple outlines can share the same suffix; use an array to avoid silent overwrites.
  const suffixMap = new Map<string, TestCase[]>();
  for (const tc of testCases) {
    const atIdx = tc.$.name.lastIndexOf(" -- @");
    if (atIdx >= 0) {
      const suffix = tc.$.name.substring(atIdx);
      const existing = suffixMap.get(suffix);
      if (existing)
        existing.push(tc);
      else
        suffixMap.set(suffix, [tc]);
    }
  }

  // Walk outline children: groups → rows
  outlineItem.children.forEach(groupOrRow => {
    let groupWorstStatus: string | undefined;
    let groupWorstResult: ParseResult | undefined;

    groupOrRow.children.forEach(rowItem => {
      const result = matchRowItemToResult(wkspSettings, debug, rowItem, suffixMap);
      if (result) {
        reportResult(wkspSettings, run, debug, rowItem, result);
        // Track worst result for the group
        if (!groupWorstResult || isWorse(result.status, groupWorstStatus ?? "passed")) {
          groupWorstResult = result;
          groupWorstStatus = result.status;
        }
      }
    });

    // Update the group item with its worst child result
    if (groupWorstResult) {
      reportResult(wkspSettings, run, debug, groupOrRow, groupWorstResult);
    }
  });
}


function matchRowItemToResult(wkspSettings: WorkspaceSettings, debug: boolean,
  rowItem: vscode.TestItem, suffixMap: Map<string, TestCase[]>): ParseResult | undefined {

  // The row's label is like "@1.1 Red Tree Frog | mush" — extract the "@x.y" part to build the suffix
  const label = rowItem.label;
  const atMatch = /^@(\d+)\.(\d+)\b/.exec(label);
  if (!atMatch)
    return undefined;

  // Try all suffixes that contain this @x.y pattern
  for (const [suffix, testCases] of suffixMap) {
    if (suffix.includes(` -- @${atMatch[1]}.${atMatch[2]} `) || suffix.endsWith(` -- @${atMatch[1]}.${atMatch[2]}`)) {
      // Prefer non-skipped result when multiple outlines share the suffix
      const tc = testCases.find(t => t.$.status !== "skipped") ?? testCases[0];
      return CreateParseResult(wkspSettings, debug, tc);
    }
  }
  return undefined;
}


function reportResult(wkspSettings: WorkspaceSettings, run: vscode.TestRun, debug: boolean,
  item: vscode.TestItem, result: ParseResult) {
  if (isSettledByStream(run.name, item.id))
    return;
  if (run.token.isCancellationRequested && result.status === "no-junit-file")
    return;
  switch (result.status) {
    case "passed":
      run.passed(item, result.duration);
      break;
    case "skipped":
      run.skipped(item);
      break;
    case "failed": {
      run.failed(item, buildFailureMessage(result.failedText ?? "failed",
        failureLocation(wkspSettings, result, item)), result.duration);
      break;
    }
    case "error":
    case "hook_error":
    case "cleanup_error": {
      run.errored(item, buildFailureMessage(result.failedText ?? "error",
        failureLocation(wkspSettings, result, item)), result.duration);
      break;
    }
  }
  // see the note in updateTest(): no "Test item ..." line - the result reaches
  // the UI through the run.* calls above.
}


function isWorse(status: string, currentWorst: string): boolean {
  const severity: Record<string, number> = { "passed": 0, "skipped": 1, "failed": 2, "error": 3, "hook_error": 3, "cleanup_error": 3 };
  return (severity[status] ?? 0) > (severity[currentWorst] ?? 0);
}
