// Unit tests for execute_steps parameter-highlight range computation
import * as assert from 'assert';
import * as vscode from 'vscode';
import { computeParamRanges } from '../../../src/handlers/executeStepsParamHighlighter';
import { ExecuteStepsCallStep } from '../../../src/parsers/executeStepsParser';
import { StepFileStep, parseRepWildcard } from '../../../src/parsers/stepsParser';

suite('executeStepsParamHighlighter', () => {

  const docUri = vscode.Uri.file('/test/features/steps/lib.py');
  const stepDefUri = vscode.Uri.file('/test/features/steps/steps.py');

  // builds a call step whose embedded text starts at startCol on the given line
  function makeCallStep(line: number, startCol: number, text: string, stepType = 'given'): ExecuteStepsCallStep {
    return new ExecuteStepsCallStep(
      `key-${line}`, docUri, 'lib.py',
      new vscode.Range(line, startCol, line, startCol + text.length),
      text, text.replace(/^\w+ /, ''), stepType, false,
    );
  }

  function makeStepDef(stepType: string, textAsRe: string): StepFileStep {
    return new StepFileStep(`^${stepType}|${textAsRe}$`, stepDefUri, 'steps.py', stepType, textAsRe);
  }

  test('highlights the wildcard-matched span of a single-parameter step', () => {
    // def: "a machine named {name}" -> textAsRe "a machine named .*"
    const callStep = makeCallStep(5, 8, 'Given a machine named alpha');
    const stepDef = makeStepDef('given', `a machine named ${parseRepWildcard}`);

    const ranges = computeParamRanges([{ callStep, stepFileStep: stepDef }]);

    assert.strictEqual(ranges.length, 1);
    const expectedStart = 8 + 'Given a machine named '.length;
    assert.strictEqual(ranges[0].start.line, 5);
    assert.strictEqual(ranges[0].start.character, expectedStart);
    assert.strictEqual(ranges[0].end.character, expectedStart + 'alpha'.length);
  });

  test('highlights multiple parameter spans in one step', () => {
    const callStep = makeCallStep(3, 4, 'When user bob enters 42');
    const stepDef = makeStepDef('when', `user ${parseRepWildcard} enters ${parseRepWildcard}`);

    const ranges = computeParamRanges([{ callStep, stepFileStep: stepDef }]);

    assert.strictEqual(ranges.length, 2);
    assert.strictEqual(ranges[0].start.character, 4 + 'When user '.length);
    assert.strictEqual(ranges[0].end.character, 4 + 'When user bob'.length);
    assert.strictEqual(ranges[1].start.character, 4 + 'When user bob enters '.length);
    assert.strictEqual(ranges[1].end.character, 4 + 'When user bob enters 42'.length);
  });

  test('produces no ranges for exact-match (parameterless) step defs', () => {
    const callStep = makeCallStep(2, 8, 'Given the machine is primed');
    const stepDef = makeStepDef('given', 'the machine is primed');

    assert.strictEqual(computeParamRanges([{ callStep, stepFileStep: stepDef }]).length, 0);
  });

  test('produces no ranges for unmatched call steps', () => {
    const callStep = makeCallStep(2, 8, 'Given something unknown');

    assert.strictEqual(computeParamRanges([{ callStep, stepFileStep: null }]).length, 0);
  });

  test('strips the keyword when the step def starts with a wildcard', () => {
    // def: "{actor} logs in" -> textAsRe ".* logs in"; a naive group would swallow "Given "
    const callStep = makeCallStep(7, 8, 'Given alice logs in');
    const stepDef = makeStepDef('given', `${parseRepWildcard} logs in`);

    const ranges = computeParamRanges([{ callStep, stepFileStep: stepDef }]);

    assert.strictEqual(ranges.length, 1);
    const expectedStart = 8 + 'Given '.length;
    assert.strictEqual(ranges[0].start.character, expectedStart, 'keyword must not be part of the highlighted span');
    assert.strictEqual(ranges[0].end.character, expectedStart + 'alice'.length);
  });
});
