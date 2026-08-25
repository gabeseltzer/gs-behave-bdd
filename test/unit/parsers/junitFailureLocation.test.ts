// Unit tests for the junit path's failure message: text, anchor line, and diff.
//
// The XML bodies below are REAL, captured from a behave run of project A's
// group1_features/basic.feature. behave writes three lines into a <failure>:
//
//   Failing step: When we implement a failing test ... failed in 0.000s
//   Location: behave tests/some tests/group1_features/basic.feature:20
//   ASSERT FAILED:
//
// The "Location:" line names the FAILING STEP's line in the feature file. It used to
// be stripped and discarded, and the message was anchored on the scenario header
// instead - so a failure in a long scenario pointed at the wrong line.

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as commonModule from '../../../src/common';
import { parseJunitFileAndUpdateTestResults } from '../../../src/parsers/junitParser';
import { Scenario } from '../../../src/parsers/testFile';
import { WorkspaceSettings } from '../../../src/settings';
import { QueueItem } from '../../../src/extension';

suite('junitParser - failure location and message', () => {

  const FEATURE_REL = 'features/basic.feature';
  const junitUri = vscode.Uri.file('c:/tmp/junit/TESTS-basic.xml');
  const featureUri = vscode.Uri.file('c:/test/features/basic.feature');

  const wkspSettings = (() => {
    const featuresUri = vscode.Uri.file('c:/test/features');
    return {
      uri: vscode.Uri.file('c:/test'),
      projectUri: vscode.Uri.file('c:/test'),
      name: 'test',
      featuresUri,
      featuresUris: [featuresUri],
      stepsSearchUri: vscode.Uri.joinPath(featuresUri, 'steps'),
      stepsSearchUris: [vscode.Uri.joinPath(featuresUri, 'steps')],
      workspaceRelativeFeaturesPath: 'features',
      workspaceRelativeFeaturesPaths: ['features'],
      workspaceRelativeProjectPath: '',
    } as unknown as WorkspaceSettings;
  })();

  interface Reported { kind: string; message: string; locLine?: number; locPath?: string; expected?: string; actual?: string }

  let getContentStub: sinon.SinonStub;
  let reported: Reported[];

  const msgText = (m: vscode.TestMessage): string => {
    const v = m.message as unknown as { value?: string };
    return typeof v === 'string' ? v : (v.value ?? '');
  };

  const record = (kind: string) => (_i: vscode.TestItem, m: vscode.TestMessage) => {
    reported.push({
      kind,
      message: msgText(m),
      locLine: m.location?.range.start.line,
      locPath: m.location?.uri.path,
      expected: m.expectedOutput,
      actual: m.actualOutput,
    });
  };

  const makeRun = () => ({
    token: { isCancellationRequested: false },
    name: undefined,
    passed: () => { /* not under test */ },
    skipped: () => { /* not under test */ },
    failed: record('failed'),
    errored: record('errored'),
    appendOutput: () => { /* noop */ },
  } as unknown as vscode.TestRun);

  /** A plain (non-outline) scenario whose header is at 0-based line 17 (behave 18). */
  const makeQueueItem = (): QueueItem => {
    const scenario = new Scenario('basic.feature', FEATURE_REL, 'Basic', 'run a failing test', 0, false);
    const test = {
      id: featureUri.toString() + '/run a failing test',
      uri: featureUri,
      range: new vscode.Range(new vscode.Position(17, 0), new vscode.Position(17, 10)),
      label: 'run a failing test',
      children: { forEach: () => { /* noop */ } },
      parent: undefined,
    } as unknown as vscode.TestItem;
    return { test, scenario };
  };

  const junitXml = (body: string, type = 'AssertionError', message = '') =>
    '<?xml version="1.0" ?>\n' +
    '<testsuite name="test" tests="1" errors="0" failures="1" skipped="0" time="0.5" ' +
    'timestamp="2024-01-01T00:00:00" hostname="host">\n' +
    '  <testcase classname="basic.Basic" name="run a failing test" status="failed" time="0.1">\n' +
    `    <failure type="${type}" message="${message}">${body}</failure>\n` +
    '  </testcase>\n' +
    '</testsuite>';

  // As behave writes it: relative to the project directory.
  const REAL_BODY =
    'Failing step: When we implement a failing test ... failed in 0.000s\n' +
    'Location: features/basic.feature:20\n' +
    'ASSERT FAILED: ';

  setup(() => {
    reported = [];
    getContentStub = sinon.stub(commonModule, 'getContentFromFilesystem');
  });

  teardown(() => sinon.restore());


  test('anchors the failure on the failing step line, not the scenario header', async () => {
    getContentStub.resolves(junitXml(REAL_BODY));
    const item = makeQueueItem();

    await parseJunitFileAndUpdateTestResults(wkspSettings, makeRun(), false, junitUri, [item]);

    assert.strictEqual(reported.length, 1);
    // behave line 20 -> 0-based 19. The scenario header would be 17.
    assert.strictEqual(reported[0].locLine, 19);
    assert.strictEqual(reported[0].locPath, featureUri.path);
  });


  test('the Location line is not shown in the message text', async () => {
    getContentStub.resolves(junitXml(REAL_BODY));

    await parseJunitFileAndUpdateTestResults(wkspSettings, makeRun(), false, junitUri, [makeQueueItem()]);

    assert.doesNotMatch(reported[0].message, /Location:/,
      'it is consumed as a position, not displayed');
    assert.match(reported[0].message, /Failing step: When we implement a failing test/);
    assert.match(reported[0].message, /ASSERT FAILED/);
  });


  test('the step timing suffix is still trimmed from the summary', async () => {
    getContentStub.resolves(junitXml(REAL_BODY));

    await parseJunitFileAndUpdateTestResults(wkspSettings, makeRun(), false, junitUri, [makeQueueItem()]);

    assert.doesNotMatch(reported[0].message, /failed in 0\.000s/);
  });


  test('falls back to the scenario header when no Location line is present', async () => {
    getContentStub.resolves(junitXml('Failing step: When x ... failed\nASSERT FAILED: '));

    await parseJunitFileAndUpdateTestResults(wkspSettings, makeRun(), false, junitUri, [makeQueueItem()]);

    assert.strictEqual(reported[0].locLine, 17, 'the scenario header line');
  });


  // A bare Python assert reaches junit as type="AssertionError" message="" - there is
  // no comparison to show, and inventing one would be worse than showing none.
  test('no diff is offered for a bare assert', async () => {
    getContentStub.resolves(junitXml(REAL_BODY));

    await parseJunitFileAndUpdateTestResults(wkspSettings, makeRun(), false, junitUri, [makeQueueItem()]);

    assert.strictEqual(reported[0].expected, undefined);
    assert.strictEqual(reported[0].actual, undefined);
  });


  test('a stated comparison does become a diff', async () => {
    getContentStub.resolves(junitXml(
      'Failing step: Then it should transform ... failed\n' +
      'Location: features/basic.feature:20\n' +
      'AssertionError: expected mush but got toxic waste'));

    await parseJunitFileAndUpdateTestResults(wkspSettings, makeRun(), false, junitUri, [makeQueueItem()]);

    assert.strictEqual(reported[0].expected, 'mush');
    assert.strictEqual(reported[0].actual, 'toxic waste');
  });


  test('the failure body is rendered as markdown, fenced', async () => {
    getContentStub.resolves(junitXml(REAL_BODY));

    await parseJunitFileAndUpdateTestResults(wkspSettings, makeRun(), false, junitUri, [makeQueueItem()]);

    assert.match(reported[0].message, /```/, 'a traceback must not be reflowed as prose');
  });

});
