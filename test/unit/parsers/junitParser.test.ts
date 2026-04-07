// Unit tests for junitParser — focusing on example row matching.
// The key bug: behave substitutes <param> values in junit output, so the
// stored junitName template ("Blenders Fail <thing> -- @1.1 Amphibians")
// never matches the actual junit entry ("Blenders Fail Red Tree Frog -- @1.1 Amphibians").

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as commonModule from '../../../src/common';
import { parseJunitFileAndUpdateTestResults } from '../../../src/parsers/junitParser';
import { Scenario, ExampleRow } from '../../../src/parsers/testFile';
import { WorkspaceSettings } from '../../../src/settings';
import { QueueItem } from '../../../src/extension';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWkspSettings(featuresRelPath = 'features'): WorkspaceSettings {
  const featuresUri = vscode.Uri.file(`c:/test/${featuresRelPath}`);
  return {
    uri: vscode.Uri.file('c:/test'),
    name: 'test',
    featuresUri,
    // steps under features so getjUnitName doesn't add "features." prefix
    stepsSearchUri: vscode.Uri.joinPath(featuresUri, 'steps'),
    workspaceRelativeFeaturesPath: featuresRelPath,
    workspaceRelativeProjectPath: '',
  } as unknown as WorkspaceSettings;
}

function makeExampleRowScenario(
  outlineName: string,
  tableIndex: number,
  rowIndex: number,
  examplesName: string,
  values: string[],
  featureName = 'Mixed outline',
  featureFileName = 'outline_mixed.feature',
  featureFileRelPath = 'features/outline_mixed.feature',
): Scenario {
  const junitName = `${outlineName} -- @${tableIndex}.${rowIndex}${examplesName ? ' ' + examplesName : ''}`;
  const exampleRow: ExampleRow = { tableIndex, rowIndex, examplesName, values, junitName };
  return new Scenario(featureFileName, featureFileRelPath, featureName, outlineName, 0, false, exampleRow);
}

function makeQueueItem(scenario: Scenario): QueueItem {
  const testItem = {
    id: vscode.Uri.file('c:/test/features/outline_mixed.feature').toString() + '/' + scenario.getLabel(),
    uri: vscode.Uri.file('c:/test/features/outline_mixed.feature'),
    range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 10)),
    label: scenario.getLabel(),
    children: { forEach: () => { /* noop */ } },
  } as unknown as vscode.TestItem;
  return { test: testItem, scenario };
}

function makeRun() {
  const results: { status: string; item: QueueItem }[] = [];
  return {
    run: {
      token: { isCancellationRequested: false },
      passed: (_item: vscode.TestItem, _duration?: number) => results.push({ status: 'passed', item: _item as unknown as QueueItem }),
      failed: (_item: vscode.TestItem) => results.push({ status: 'failed', item: _item as unknown as QueueItem }),
      skipped: (_item: vscode.TestItem) => results.push({ status: 'skipped', item: _item as unknown as QueueItem }),
      errored: (_item: vscode.TestItem) => results.push({ status: 'errored', item: _item as unknown as QueueItem }),
      appendOutput: () => { /* noop */ },
    } as unknown as vscode.TestRun,
    results,
  };
}

// Build a minimal junit XML string matching how behave generates it.
// Note: behave substitutes <param> values in the testcase name.
function makeJunitXml(testcases: { classname: string; name: string; status: string }[]): string {
  const cases = testcases.map(tc => {
    if (tc.status === 'failed') {
      return `  <testcase classname="${tc.classname}" name="${tc.name}" status="${tc.status}" time="0.1">\n` +
        `    <failure type="AssertionError" message="step failed">Assertion failed</failure>\n` +
        `  </testcase>`;
    }
    return `  <testcase classname="${tc.classname}" name="${tc.name}" status="${tc.status}" time="0.1"/>`;
  }).join('\n');
  return `<?xml version="1.0" ?>\n<testsuite name="test" tests="${testcases.length}" errors="0" failures="0" skipped="0" time="0.5" timestamp="2024-01-01T00:00:00" hostname="host">\n${cases}\n</testsuite>`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

suite('junitParser - example row matching', () => {

  let getContentStub: sinon.SinonStub;
  const junitUri = vscode.Uri.file('c:/tmp/junit/TESTS-outline_mixed.xml');
  const wkspSettings = makeWkspSettings('features');

  setup(() => {
    getContentStub = sinon.stub(commonModule, 'getContentFromFilesystem');
  });

  teardown(() => {
    sinon.restore();
  });

  // The core regression: outline name contains <param>, behave substitutes it
  test('matches example row when outline name contains <param> that behave substitutes', async () => {
    // Scenario Outline: "Blenders Fail <thing>"
    // behave junit entry: "Blenders Fail Red Tree Frog -- @1.1 Amphibians"
    // our junitName:      "Blenders Fail <thing> -- @1.1 Amphibians"  ← template, does NOT match
    const xml = makeJunitXml([{
      classname: 'outline_mixed.Mixed outline',
      name: 'Blenders Fail Red Tree Frog -- @1.1 Amphibians',  // substituted by behave
      status: 'passed',
    }]);
    getContentStub.resolves(xml);

    const scenario = makeExampleRowScenario('Blenders Fail <thing>', 1, 1, 'Amphibians', ['Red Tree Frog']);
    const qi = makeQueueItem(scenario);
    const { run, results } = makeRun();

    try {
      await parseJunitFileAndUpdateTestResults(wkspSettings, run, false, junitUri, [qi]);
    } catch (e: unknown) {
      assert.fail(`Should not throw — got: ${typeof e} ${String(e)} ${JSON.stringify(e)}`);
    }
    assert.strictEqual(results.length, 1, 'Should have recorded one result');
    assert.strictEqual(results[0].status, 'passed');
  });

  test('matches example row without <param> in outline name (plain name, exact match still works)', async () => {
    const xml = makeJunitXml([{
      classname: 'outline_mixed.Mixed outline',
      name: 'Blenders Success paramless -- @1.1 Amphibians',
      status: 'passed',
    }]);
    getContentStub.resolves(xml);

    const scenario = makeExampleRowScenario('Blenders Success paramless', 1, 1, 'Amphibians', ['Red Tree Frog']);
    const qi = makeQueueItem(scenario);
    const { run, results } = makeRun();

    await assert.doesNotReject(
      () => parseJunitFileAndUpdateTestResults(wkspSettings, run, false, junitUri, [qi])
    );
    assert.strictEqual(results[0].status, 'passed');
  });

  test('matches by -- @tableIndex.rowIndex suffix, not by which row has which param value', async () => {
    // Two rows in different tables — each must match only its own entry
    const xml = makeJunitXml([
      { classname: 'outline_mixed.Mixed outline', name: 'Blenders Fail Red Tree Frog -- @1.1 Amphibians', status: 'passed' },
      { classname: 'outline_mixed.Mixed outline', name: 'Blenders Fail iPhone -- @2.1 Electronics', status: 'passed' },
    ]);
    getContentStub.resolves(xml);

    const row1 = makeExampleRowScenario('Blenders Fail <thing>', 1, 1, 'Amphibians', ['Red Tree Frog']);
    const row2 = makeExampleRowScenario('Blenders Fail <thing>', 2, 1, 'Electronics', ['iPhone']);
    const qi1 = makeQueueItem(row1);
    const qi2 = makeQueueItem(row2);
    const { run, results } = makeRun();

    await parseJunitFileAndUpdateTestResults(wkspSettings, run, false, junitUri, [qi1, qi2]);

    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].status, 'passed', 'Row 1 (Amphibians) should be passed');
    assert.strictEqual(results[1].status, 'passed', 'Row 2 (Electronics) should be passed');
  });

  test('matches example row with unnamed Examples table (no examplesName)', async () => {
    // junit name: "Outline -- @1.1" (no trailing name)
    const xml = makeJunitXml([{
      classname: 'outline_mixed.Mixed outline',
      name: 'Blenders Success <thing> -- @1.1',
      status: 'passed',
    }]);
    getContentStub.resolves(xml);

    const scenario = makeExampleRowScenario('Blenders Success <thing>', 1, 1, '', ['Red Tree Frog']);
    const qi = makeQueueItem(scenario);
    const { run, results } = makeRun();

    await assert.doesNotReject(
      () => parseJunitFileAndUpdateTestResults(wkspSettings, run, false, junitUri, [qi])
    );
    assert.strictEqual(results[0].status, 'passed');
  });

  test('throws when no junit entry matches the example row suffix', async () => {
    const xml = makeJunitXml([{
      classname: 'outline_mixed.Mixed outline',
      name: 'Blenders Fail Red Tree Frog -- @1.1 Amphibians',
      status: 'passed',
    }]);
    getContentStub.resolves(xml);

    // Wrong table/row index — should not match @1.1 entry
    const scenario = makeExampleRowScenario('Blenders Fail <thing>', 1, 2, 'Amphibians', ['iPhone']);
    const qi = makeQueueItem(scenario);
    const { run } = makeRun();

    await assert.rejects(
      () => parseJunitFileAndUpdateTestResults(wkspSettings, run, false, junitUri, [qi]),
      /could not match example row/
    );
  });

  test('failed example row propagates failure message to parent items (group and outline)', async () => {
    const xml = makeJunitXml([{
      classname: 'outline_mixed.Mixed outline',
      name: 'Blenders Fail Red Tree Frog -- @1.1 Amphibians',
      status: 'failed',
    }]);
    getContentStub.resolves(xml);

    // Build parent chain: outline → group → row
    const outlineItem = {
      id: 'outline-id',
      uri: vscode.Uri.file('c:/test/features/outline_mixed.feature'),
      range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 10)),
      label: 'Blenders Fail <thing>',
      children: { forEach: () => { /* noop */ } },
    } as unknown as vscode.TestItem;
    const groupItem = {
      id: 'group-id',
      uri: vscode.Uri.file('c:/test/features/outline_mixed.feature'),
      range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 10)),
      label: 'Amphibians',
      parent: outlineItem,
      children: { forEach: () => { /* noop */ } },
    } as unknown as vscode.TestItem;

    const scenario = makeExampleRowScenario('Blenders Fail <thing>', 1, 1, 'Amphibians', ['Red Tree Frog']);
    const testItem = {
      id: vscode.Uri.file('c:/test/features/outline_mixed.feature').toString() + '/@1.1 Red Tree Frog',
      uri: vscode.Uri.file('c:/test/features/outline_mixed.feature'),
      range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 10)),
      label: scenario.getLabel(),
      parent: groupItem,
      children: { forEach: () => { /* noop */ } },
    } as unknown as vscode.TestItem;
    const qi: QueueItem = { test: testItem, scenario };

    const failedCalls: { itemId: string }[] = [];
    const { run } = makeRun();
    // Override failed to also capture item IDs
    (run as unknown as { failed: unknown }).failed = (item: vscode.TestItem, _msg: unknown, _dur?: number) => {
      failedCalls.push({ itemId: item.id });
    };

    await parseJunitFileAndUpdateTestResults(wkspSettings, run, false, junitUri, [qi]);

    // The row itself should be failed
    assert.ok(failedCalls.some(c => c.itemId === testItem.id),
      'Row item should have run.failed() called');
    // The group parent should also be failed
    assert.ok(failedCalls.some(c => c.itemId === groupItem.id),
      'Group item should have run.failed() called (propagated from child)');
    // The outline grandparent should also be failed
    assert.ok(failedCalls.some(c => c.itemId === outlineItem.id),
      'Outline item should have run.failed() called (propagated from child)');
  });

});
