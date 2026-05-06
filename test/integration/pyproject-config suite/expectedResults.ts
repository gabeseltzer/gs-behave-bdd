import * as vscode from 'vscode';
import { Configuration } from "../../../src/configuration";
import { WkspParseCounts } from "../../../src/parsers/fileParser";
import { TestResult, applyTestConfiguration } from "../suite-shared/expectedResults.helpers";

export function getExpectedCounts(wkspUri: vscode.Uri, config: Configuration): WkspParseCounts {
  const testCount = getExpectedResults(wkspUri, config).length;
  return {
    tests: { nodeCount: 4, testCount: testCount },
    featureFilesExceptEmptyOrCommentedOut: 1, stepFilesExceptEmptyOrCommentedOut: 1,
    stepFileStepsExceptCommentedOut: 6, featureFileStepsExceptCommentedOut: 7, stepMappings: 7
  };
}

export const getExpectedResults = (wkspUri: vscode.Uri, config: Configuration): TestResult[] => {

  const expectedResults: TestResult[] = [
    new TestResult({
      scenario_featureFileRelativePath: '{{featurePath}}/discovery.feature',
      scenario_featureName: 'Pyproject Config Discovery',
      scenario_getLabel: 'run a successful test',
      scenario_isOutline: false,
      scenario_result: 'passed',
      scenario_scenarioName: 'run a successful test',
      test_children: undefined,
      test_description: undefined,
      test_error: undefined,
      test_id: '.../pyproject-config/{{featurePath}}/discovery.feature/run a successful test',
      test_label: 'run a successful test',
      test_parent: '.../pyproject-config/{{featurePath}}/discovery.feature',
      test_uri: '.../pyproject-config/{{featurePath}}/discovery.feature'
    }),

    new TestResult({
      scenario_featureFileRelativePath: '{{featurePath}}/discovery.feature',
      scenario_featureName: 'Pyproject Config Discovery',
      scenario_getLabel: 'run a failing test',
      scenario_isOutline: false,
      scenario_result: 'failed',
      scenario_scenarioName: 'run a failing test',
      test_children: undefined,
      test_description: undefined,
      test_error: undefined,
      test_id: '.../pyproject-config/{{featurePath}}/discovery.feature/run a failing test',
      test_label: 'run a failing test',
      test_parent: '.../pyproject-config/{{featurePath}}/discovery.feature',
      test_uri: '.../pyproject-config/{{featurePath}}/discovery.feature'
    }),

    new TestResult({
      scenario_featureFileRelativePath: '{{featurePath}}/discovery.feature',
      scenario_featureName: 'Pyproject Config Discovery',
      scenario_getLabel: 'run a skipped test',
      scenario_isOutline: false,
      scenario_result: 'skipped',
      scenario_scenarioName: 'run a skipped test',
      test_children: undefined,
      test_description: undefined,
      test_error: undefined,
      test_id: '.../pyproject-config/{{featurePath}}/discovery.feature/run a skipped test',
      test_label: 'run a skipped test',
      test_parent: '.../pyproject-config/{{featurePath}}/discovery.feature',
      test_uri: '.../pyproject-config/{{featurePath}}/discovery.feature'
    }),

  ];


  const wkspSettings = config.workspaceSettings[wkspUri.path];
  return applyTestConfiguration(wkspSettings, expectedResults);
}
