import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { config } from '../../../src/configuration';
import * as featureParser from '../../../src/parsers/featureParser';
import { FeatureFileStep } from '../../../src/parsers/featureParser';
import * as stepsParser from '../../../src/parsers/stepsParser';
import * as pythonCheck from '../../../src/parsers/stepArgumentPythonCheck';
import { clearArgumentCheckDefinitions, setArgumentCheckDefinitions } from '../../../src/parsers/stepArgumentStore';
import type { BehaveStepDefinition, StepCheckResult } from '../../../src/parsers/behaveLoader';
import {
  STEP_ARGUMENT_CONVERSION_ERROR, STEP_ARGUMENT_MISMATCH, validateStepArguments
} from '../../../src/handlers/stepArgumentDiagnostics';
import { getStepArgumentHover } from '../../../src/handlers/stepArgumentHover';
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
    stepType: "given", pattern: "an even {n:Even} number", filePath: "/proj/features/steps/steps.py", lineNumber: 7, regex: "",
    paramCheck: {
      kind: "parse", flags: ["DOTALL"], needsPython: true, segments: [
        { text: "an even " },
        { name: "n", spec: "Even", type: "Even", regex: "(?P<f1>.+?)", custom: true, hasPattern: false, needsPython: true },
        { text: " number" },
      ]
    },
  },
];

const featuresUri = vscode.Uri.file('/proj/features');
const docUri = vscode.Uri.file('/proj/features/a.feature');


suite('stepArgumentDiagnostics', () => {
  let sandbox: sinon.SinonSandbox;
  let diagnostics: vscode.Diagnostic[];
  let requestStub: sinon.SinonStub;
  let pythonResults: Map<string, StepCheckResult>;

  setup(() => {
    sandbox = sinon.createSandbox();
    diagnostics = [];
    pythonResults = new Map();
    sandbox.stub(config.diagnostics, 'get').callsFake(() => diagnostics);
    sandbox.stub(config.diagnostics, 'set').callsFake((_uri: unknown, diags?: unknown) => {
      diagnostics = (diags as vscode.Diagnostic[] | undefined) ?? [];
    });
    sandbox.stub(stepsParser, 'getStepFileSteps').returns([]);
    requestStub = sandbox.stub(pythonCheck, 'requestPythonStepChecks');
    sandbox.stub(pythonCheck, 'getPythonStepCheck').callsFake((_uri, stepType, text) => {
      const result = pythonResults.get(`${stepType}\n${text}`);
      return result ? { result, incomplete: false } : undefined;
    });
    setArgumentCheckDefinitions(featuresUri, DEFINITIONS);
  });

  teardown(() => {
    sandbox.restore();
    clearArgumentCheckDefinitions(featuresUri);
  });

  function settings(checkWithPython = true) {
    return { featuresUri, featuresUris: [featuresUri], checkStepArgumentsWithPython: checkWithPython } as unknown as WorkspaceSettings;
  }

  /** Lines of a feature file; every line starting with a keyword becomes a feature file step. */
  function useFeature(lines: string[], isDirty = false) {
    const steps: [string, FeatureFileStep][] = [];
    let lastType = "given";
    lines.forEach((line, lineNo) => {
      const m = /^(\s*)(Given|When|Then|And|But) (.*)$/.exec(line);
      if (!m)
        return;
      if (m[2] !== "And" && m[2] !== "But")
        lastType = m[2].toLowerCase();
      const range = new vscode.Range(lineNo, m[1].length, lineNo, line.length);
      const key = `${lineNo}`;
      steps.push([key, new FeatureFileStep(key, docUri, "a.feature", range, line.trim(), m[3].trim(), lastType)]);
    });
    sandbox.stub(featureParser, 'getFeatureFileSteps').returns(steps);
    return { uri: docUri, isDirty, getText: () => lines.join("\n") } as unknown as vscode.TextDocument;
  }

  const summary = () => diagnostics.map(d =>
    `${d.code} ${d.range.start.line}:${d.range.start.character}-${d.range.end.character}`);

  test('a mismatched argument is an Error on the argument itself', () => {
    const doc = useFeature([
      "Feature: f",
      "  Scenario: s",
      "    Given I have many cukes",
      "    And I have 5 cukes",
    ]);
    validateStepArguments(doc, settings());

    assert.deepStrictEqual(summary(), [`${STEP_ARGUMENT_MISMATCH} 2:17-21`]);
    const [diag] = diagnostics;
    assert.strictEqual(diag.severity, vscode.DiagnosticSeverity.Error);
    assert.strictEqual(diag.message,
      `"many" doesn't match {count:d}, which expects an integer. behave will report this step as undefined.`);
    assert.strictEqual(diag.relatedInformation?.[0].location.uri.fsPath, vscode.Uri.file("/proj/features/steps/steps.py").fsPath);
  });

  test('other diagnostics on the document are kept', () => {
    const doc = useFeature(["    Given I have many cukes"]);
    const fixtureDiag = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), "fixture");
    fixtureDiag.code = "invalid-fixture-tag";
    diagnostics = [fixtureDiag];
    validateStepArguments(doc, settings());
    assert.deepStrictEqual(diagnostics.map(d => d.code), ["invalid-fixture-tag", STEP_ARGUMENT_MISMATCH]);
  });

  test('in a Scenario Outline the diagnostic lands on the Examples cell', () => {
    const doc = useFeature([
      "Feature: f",
      "  Scenario Outline: o",
      "    Given I have <count> cukes",
      "    Examples:",
      "      | count |",
      "      | 5     |",
      "      | many  |",
    ]);
    validateStepArguments(doc, settings());

    assert.deepStrictEqual(summary(), [`${STEP_ARGUMENT_MISMATCH} 6:8-12`]);
    assert.match(diagnostics[0].message, /\(Examples column <count>, used by "I have <count> cukes"\)$/);
  });

  test('a custom type without a pattern is checked by behave once the file is saved', () => {
    const doc = useFeature(["    Given an even 3 number"]);
    validateStepArguments(doc, settings());

    assert.strictEqual(diagnostics.length, 0, "the regex alone can't tell");
    assert.deepStrictEqual(requestStub.firstCall.args.slice(1), [[{ stepType: "given", text: "an even 3 number" }], true]);

    pythonResults.set("given\nan even 3 number", {
      stepType: "given", text: "an even 3 number", status: "error", error: "ValueError: 3 is odd",
      filePath: "/proj/features/steps/steps.py", lineNumber: 7,
      arguments: [{ segment: 1, start: 8, end: 9, original: "3", error: "ValueError: 3 is odd" }],
    });
    validateStepArguments(doc, settings());

    assert.deepStrictEqual(summary(), [`${STEP_ARGUMENT_CONVERSION_ERROR} 0:18-19`]);
    assert.strictEqual(diagnostics[0].message,
      `"3" can't be converted by {n:Even}: ValueError: 3 is odd. behave will fail this step with an error.`);
  });

  test('an unsaved file queues the behave check without releasing it', () => {
    const doc = useFeature(["    Given an even 3 number"], true);
    validateStepArguments(doc, settings());
    assert.strictEqual(requestStub.firstCall.args[2], false);
  });

  test('with the Python check turned off nothing is sent to behave', () => {
    const doc = useFeature(["    Given an even 3 number"]);
    validateStepArguments(doc, settings(false));
    assert.strictEqual(requestStub.callCount, 0);
    assert.deepStrictEqual(diagnostics, []);
  });

  test('hover over an argument names its parameter and type', () => {
    const doc = useFeature(["    Given I have 5 cukes"]);
    const hover = getStepArgumentHover(doc, new vscode.Position(0, 17), settings());
    assert.ok(hover);
    assert.strictEqual(hover.content.value, "**Argument** for parameter `{count:d}` — an integer");
    assert.deepStrictEqual([hover.range.start.character, hover.range.end.character], [17, 18]);
    assert.strictEqual(getStepArgumentHover(doc, new vscode.Position(0, 12), settings()), undefined, "not over literal text");
  });

  test('hover shows the value behave converted the argument to', () => {
    const doc = useFeature(["    Given an even 4 number"]);
    pythonResults.set("given\nan even 4 number", {
      stepType: "given", text: "an even 4 number", status: "matched",
      arguments: [{ segment: 1, start: 8, end: 9, original: "4", value: "4", valueType: "int" }],
    });
    const hover = getStepArgumentHover(doc, new vscode.Position(0, 18), settings());
    assert.match(hover?.content.value ?? "", /behave converts `4` to `4` \(`int`\)$/);
  });

  test('hover over a placeholder says which Examples column fills it', () => {
    const doc = useFeature([
      "  Scenario Outline: o",
      "    Given I have <count> cukes",
      "    Examples:",
      "      | count |",
      "      | 5     |",
    ]);
    const hover = getStepArgumentHover(doc, new vscode.Position(1, 19), settings());
    assert.match(hover?.content.value ?? "", /Filled from the Examples column `<count>`$/);
  });
});
