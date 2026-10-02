// Parameter highlighting and execute_steps argument diagnostics, driven by behave's own matching
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as common from '../../../src/common';
import { config } from '../../../src/configuration';
import { parser } from '../../../src/extension';
import * as featureParser from '../../../src/parsers/featureParser';
import { FeatureFileStep } from '../../../src/parsers/featureParser';
import { ExecuteStepsCallStep } from '../../../src/parsers/executeStepsParser';
import * as stepMappings from '../../../src/parsers/stepMappings';
import * as stepsParser from '../../../src/parsers/stepsParser';
import { StepFileStep } from '../../../src/parsers/stepsParser';
import * as pythonCheck from '../../../src/parsers/stepArgumentPythonCheck';
import type { BehaveStepDefinition } from '../../../src/parsers/behaveLoader';
import { clearArgumentCheckDefinitions, setArgumentCheckDefinitions } from '../../../src/parsers/stepArgumentStore';
import { locateRegexGroups } from '../../../src/parsers/stepArguments';
import { computeParamRanges } from '../../../src/handlers/executeStepsParamHighlighter';
import { SemHighlightProvider } from '../../../src/handlers/semHighlightProvider';
import { validateExecuteSteps } from '../../../src/handlers/executeStepsDiagnostics';
import { STEP_ARGUMENT_MISMATCH } from '../../../src/handlers/stepArgumentDiagnostics';
import { WorkspaceSettings } from '../../../src/settings';

const INT_RE = "(?P<f1>[-+ ]?[-+ ]?[0-9]+|[-+ ]?0[xX][0-9a-fA-F]+|[-+ ]?0[bB][01]+|[-+ ]?0[oO][0-7]+)";

const DEFINITIONS: BehaveStepDefinition[] = [
  {
    stepType: "given", pattern: "I have {count:d} cukes", filePath: "/proj/features/steps/steps.py", lineNumber: 3, regex: "",
    paramCheck: {
      kind: "parse", flags: ["DOTALL"], needsPython: false, segments: [
        { text: "I have " },
        { name: "count", spec: "d", type: "d", regex: INT_RE, custom: false, hasPattern: true, needsPython: false },
        { text: " cukes" },
      ]
    },
  },
  {
    stepType: "given", pattern: "^regex (?P<num>\\d+) and (\\w+) things$", filePath: "/proj/features/steps/re_steps.py", lineNumber: 5, regex: "",
    paramCheck: { kind: "re", flags: [], regex: "^regex (?P<num>\\d+) and (\\w+) things$", needsPython: false },
  },
];

const featuresUri = vscode.Uri.file('/proj/features');
const anyStepDef = new StepFileStep("k", vscode.Uri.file("/proj/features/steps/steps.py"), "steps.py", "given", "unused");


suite('step argument highlighting and execute_steps diagnostics', () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(stepsParser, 'getStepFileSteps').returns([]);
    setArgumentCheckDefinitions(featuresUri, DEFINITIONS);
  });

  teardown(() => {
    sandbox.restore();
    clearArgumentCheckDefinitions(featuresUri);
  });

  function callStep(line: number, startCol: number, text: string) {
    return new ExecuteStepsCallStep(`k${line}`, vscode.Uri.file('/proj/features/steps/lib.py'), 'lib.py',
      new vscode.Range(line, startCol, line, startCol + text.length), text, text.replace(/^\w+ /, ''), 'given', false);
  }

  const columns = (ranges: vscode.Range[]) => ranges.map(r => [r.start.character, r.end.character]);

  test('locateRegexGroups finds repeated and nested group values', () => {
    assert.deepStrictEqual(locateRegexGroups(/^(\d) and (\d)$/u, "5 and 5"), [{ start: 0, end: 1 }, { start: 6, end: 7 }]);
    assert.deepStrictEqual(locateRegexGroups(/^((a)b)c$/u, "abc"), [{ start: 0, end: 2 }, { start: 0, end: 1 }]);
    assert.deepStrictEqual(locateRegexGroups(/^x(y)?$/u, "x"), []);
  });

  test('execute_steps: typed parameters and regex capture groups are highlighted', () => {
    const typed = callStep(1, 8, 'Given I have 5 cukes');
    const regex = callStep(2, 8, 'Given regex 42 and abc things');
    const ranges = computeParamRanges([
      { callStep: typed, stepFileStep: anyStepDef },
      { callStep: regex, stepFileStep: anyStepDef },
    ], featuresUri);
    assert.deepStrictEqual(columns(ranges), [
      [8 + 'Given I have '.length, 8 + 'Given I have 5'.length],
      [8 + 'Given regex '.length, 8 + 'Given regex 42'.length],
      [8 + 'Given regex 42 and '.length, 8 + 'Given regex 42 and abc'.length],
    ]);
  });

  test('feature file: regex capture groups get semantic tokens', () => {
    const lines = ["Feature: f", "  Scenario: s", "    Given regex 42 and abc things", "    Given I have 5 cukes"];
    const docUri = vscode.Uri.file('/proj/features/a.feature');
    sandbox.stub(common, 'getWorkspaceSettingsForFile').returns({ featuresUri, featuresUris: [featuresUri] } as unknown as WorkspaceSettings);
    sandbox.stub(featureParser, 'getFeatureFileSteps').returns([2, 3].map(line => {
      const text = lines[line].trim();
      return [`${line}`, new FeatureFileStep(`${line}`, docUri, "a.feature", new vscode.Range(line, 4, line, lines[line].length),
        text, text.replace(/^Given /, ""), "given")];
    }));
    sandbox.stub(stepMappings, 'getStepFileStepForFeatureFileStep').returns(undefined);

    const document = { uri: docUri, getText: () => lines.join("\n") } as unknown as vscode.TextDocument;
    const token = { isCancellationRequested: false } as vscode.CancellationToken;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tokens = (new SemHighlightProvider() as any)._parseDoc(document, token) as { line: number; startCharacter: number; length: number }[];

    assert.deepStrictEqual(tokens.map(t => [t.line, t.startCharacter, t.length]), [
      [2, 16, 2], [2, 23, 3],
      [3, 17, 1],
    ]);
  });

  test('execute_steps: an argument that does not fit its parameter is an Error', () => {
    const docUri = vscode.Uri.file('/proj/features/steps/lib.py');
    const bad = callStep(4, 12, 'Given I have many cukes');
    let diagnostics: vscode.Diagnostic[] = [];
    sandbox.stub(parser, 'initialStepsParseComplete').get(() => true);
    sandbox.stub(common, 'couldBePythonStepsFile').returns(true);
    sandbox.stub(common, 'getWorkspaceSettingsForFile').returns({
      featuresUri, featuresUris: [featuresUri], stepsSearchUri: vscode.Uri.file('/proj/features/steps'), checkStepArgumentsWithPython: true,
    } as unknown as WorkspaceSettings);
    sandbox.stub(stepMappings, 'matchExecuteStepsContent').returns({ matches: [{ callStep: bad, stepFileStep: anyStepDef }], invalidLines: [] });
    sandbox.stub(config.diagnostics, 'get').callsFake(() => diagnostics);
    sandbox.stub(config.diagnostics, 'set').callsFake((_uri: unknown, d?: unknown) => { diagnostics = (d as vscode.Diagnostic[]) ?? []; });
    sandbox.stub(pythonCheck, 'requestPythonStepChecks');

    validateExecuteSteps({ uri: docUri, isDirty: false, getText: () => "" } as unknown as vscode.TextDocument);

    assert.deepStrictEqual(diagnostics.map(d => [d.code, d.range.start.line, d.range.start.character, d.range.end.character]),
      [[STEP_ARGUMENT_MISMATCH, 4, 12 + 'Given I have '.length, 12 + 'Given I have many'.length]]);

    // and a re-validation replaces it rather than piling up
    validateExecuteSteps({ uri: docUri, isDirty: false, getText: () => "" } as unknown as vscode.TextDocument);
    assert.strictEqual(diagnostics.length, 1);
  });
});
