import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { runAllTestsAndAssertTheResults } from './extension.test.helpers';
import { TestWorkspaceConfig } from '../../../src/testWorkspaceConfig';
import { Configuration } from '../../../src/configuration';
import { TestResult } from './expectedResults.helpers';
import { WkspParseCounts } from '../../../src/parsers/fileParser';


const envVarOverrides = { "some_var": "double qu\"oted", "some_var2": "single qu'oted", "space_var": " ", "USERNAME": "bob-163487" };


// Streaming writes one NDJSON file per behave PROCESS, under <tmp>/gs-behave-bdd/events/<run>/<wksp>/.
// These helpers read them back after a run, which is what stops a streaming test being vacuous:
// a run where the stream produced nothing still passes on the junit results alone, so "the states
// were right" is not by itself evidence that streaming did anything.
const eventsRoot = () => path.join(os.tmpdir(), "gs-behave-bdd", "events");

const runDirNames = (): string[] => {
  const root = eventsRoot();
  return fs.existsSync(root) ? fs.readdirSync(root) : [];
};

const streamFilesWrittenSince = (wkspName: string, runDirsBefore: string[]): string[] => {
  const root = eventsRoot();
  if (!fs.existsSync(root))
    return [];
  return fs.readdirSync(root)
    .filter(runDir => !runDirsBefore.includes(runDir))
    .map(runDir => path.join(root, runDir, wkspName))
    .filter(wkspDir => fs.existsSync(wkspDir))
    .flatMap(wkspDir => fs.readdirSync(wkspDir)
      .filter(f => f.endsWith(".ndjson"))
      .map(f => path.join(wkspDir, f)));
};

const assertStreamsWereWritten = (wkspName: string, runDirsBefore: string[], minStreams: number) => {
  const files = streamFilesWrittenSince(wkspName, runDirsBefore);
  assert(files.length >= minStreams,
    `expected at least ${minStreams} event stream file(s) for "${wkspName}", found ${files.length}: ` +
    `${JSON.stringify(files)}. One file per behave process is the whole point - if parallel spawns ` +
    `shared a path they would truncate each other on open.`);
  const withScenarios = files.filter(f => /"event":\s*"scenario"/.test(fs.readFileSync(f, "utf8")));
  assert(withScenarios.length > 0,
    `no event stream contained a scenario event, so these results came from junit, not the stream: ` +
    `${JSON.stringify(files)}`);
  console.log(`assertStreamsWereWritten: ${files.length} stream file(s), ` +
    `${withScenarios.length} carrying scenario events`);
};



export class SharedWorkspaceTests {
  constructor(readonly testPre: string) { }


  runDefault = async (wkspName: string,
    getExpectedCounts: (wkspUri: vscode.Uri, config: Configuration) => WkspParseCounts,
    getExpectedResults: (wkspUri: vscode.Uri, config: Configuration) => TestResult[],
    projectPath?: string
  ) => {

    // default = everything undefined (except projectPath if provided for nested projects).
    // Deliberately left undefined for resultStreaming too, so this run is what asserts
    // that the shipped default (streaming ON) works with no settings.json at all.
    const testConfig = new TestWorkspaceConfig({
      runParallel: undefined, multiRootRunWorkspacesInParallel: undefined,
      envVarOverrides: undefined, projectPath: projectPath,
      justMyCode: undefined, xRay: undefined
    });

    console.log(`${this.testPre}: ${JSON.stringify(testConfig)}`);
    await runAllTestsAndAssertTheResults(false, wkspName, testConfig, getExpectedCounts, getExpectedResults);
  }


  runTogether = async (wkspName: string, wkspRelativeFeaturesPath: string,
    getExpectedCounts: (wkspUri: vscode.Uri, config: Configuration) => WkspParseCounts,
    getExpectedResults: (wkspUri: vscode.Uri, config: Configuration) => TestResult[],
    projectPath?: string
  ) => {

    // resultStreaming is pinned OFF here, and in runParallel below. Since streaming
    // became the default these are the only runs still covering the junit-only result
    // path, which a debug run always takes and which streaming falls back to.
    const testConfig = new TestWorkspaceConfig({
      runParallel: false, multiRootRunWorkspacesInParallel: true,
      envVarOverrides: envVarOverrides, projectPath: projectPath,
      featuresPaths: [wkspRelativeFeaturesPath],
      resultStreaming: false,
      justMyCode: undefined, xRay: true
    });

    console.log(`${this.testPre}: ${JSON.stringify(testConfig)}`);
    await runAllTestsAndAssertTheResults(false, wkspName, testConfig, getExpectedCounts, getExpectedResults);
  }


  runParallel = async (wkspName: string, wkspRelativeFeaturesPath: string,
    getExpectedCounts: (wkspUri: vscode.Uri, config: Configuration) => WkspParseCounts,
    getExpectedResults: (wskpUri: vscode.Uri, config: Configuration) => TestResult[],
    projectPath?: string
  ) => {

    const testConfig = new TestWorkspaceConfig({
      runParallel: true, multiRootRunWorkspacesInParallel: true,
      envVarOverrides: envVarOverrides, projectPath: projectPath,
      featuresPaths: [wkspRelativeFeaturesPath],
      resultStreaming: false,
      justMyCode: true, xRay: true
    });

    console.log(`${this.testPre}: ${JSON.stringify(testConfig)}`);
    await runAllTestsAndAssertTheResults(false, wkspName, testConfig, getExpectedCounts, getExpectedResults);
  }

  // The streaming safety net: streaming reports results from behave's formatter events rather
  // than from the junit xml, so it is a wholly separate path to the same test states. Asserting
  // it against the SAME expected results table as the runs above is what makes this an agreement
  // test - if streaming ever disagrees with junit, one of the two tables' runs must fail.
  runStreaming = async (wkspName: string, wkspRelativeFeaturesPath: string,
    getExpectedCounts: (wkspUri: vscode.Uri, config: Configuration) => WkspParseCounts,
    getExpectedResults: (wkspUri: vscode.Uri, config: Configuration) => TestResult[],
    projectPath?: string
  ) => {

    const testConfig = new TestWorkspaceConfig({
      runParallel: false, multiRootRunWorkspacesInParallel: true,
      envVarOverrides: envVarOverrides, projectPath: projectPath,
      featuresPaths: [wkspRelativeFeaturesPath],
      resultStreaming: true,
      justMyCode: undefined, xRay: true
    });

    const runDirsBefore = runDirNames();

    console.log(`${this.testPre}: ${JSON.stringify(testConfig)}`);
    await runAllTestsAndAssertTheResults(false, wkspName, testConfig, getExpectedCounts, getExpectedResults);

    assertStreamsWereWritten(wkspName, runDirsBefore, 1);
  }


  // Streaming while runParallel spawns one behave per feature - the case where a single
  // shared stream file would have been truncated by each process as it opened it.
  runStreamingParallel = async (wkspName: string, wkspRelativeFeaturesPath: string,
    getExpectedCounts: (wkspUri: vscode.Uri, config: Configuration) => WkspParseCounts,
    getExpectedResults: (wkspUri: vscode.Uri, config: Configuration) => TestResult[],
    projectPath?: string,
    minStreams = 1
  ) => {

    const testConfig = new TestWorkspaceConfig({
      runParallel: true, multiRootRunWorkspacesInParallel: true,
      envVarOverrides: envVarOverrides, projectPath: projectPath,
      featuresPaths: [wkspRelativeFeaturesPath],
      resultStreaming: true,
      justMyCode: true, xRay: true
    });

    const runDirsBefore = runDirNames();

    console.log(`${this.testPre}: ${JSON.stringify(testConfig)}`);
    await runAllTestsAndAssertTheResults(false, wkspName, testConfig, getExpectedCounts, getExpectedResults);

    assertStreamsWereWritten(wkspName, runDirsBefore, minStreams);
  }


  runDebug = async (wkspName: string, wkspRelativeFeaturesPath: string,
    getExpectedCounts: (wkspUri: vscode.Uri, config: Configuration) => WkspParseCounts,
    getExpectedResults: (wskpUri: vscode.Uri, config: Configuration) => TestResult[],
    projectPath?: string
  ) => {

    const testConfig = new TestWorkspaceConfig({
      runParallel: true, multiRootRunWorkspacesInParallel: true,
      envVarOverrides: envVarOverrides, projectPath: projectPath,
      featuresPaths: [wkspRelativeFeaturesPath],
      justMyCode: undefined, xRay: true
    });


    // NOTE - if this fails, try removing all breakpoints in both environments
    console.log(`${this.testPre}: ${JSON.stringify(testConfig)}`);
    await runAllTestsAndAssertTheResults(true, wkspName, testConfig, getExpectedCounts, getExpectedResults);
  }

}
