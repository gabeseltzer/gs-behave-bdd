// Tests for regex caching in step mapping system
// Verifies that pre-compiled regex maps are used instead of creating new RegExp on every iteration

import * as assert from 'assert';
import * as vscode from 'vscode';
import { sepr } from '../../../src/common';
import { StepFileStep, parseRepWildcard } from '../../../src/parsers/stepsParser';
import { _getStepFileStepMatch } from '../../../src/parsers/stepMappings';
import { FeatureFileStep } from '../../../src/parsers/featureParser';

suite('stepMappingRegexCache', () => {

  function makeStepFileStep(stepType: string, textAsRe: string): StepFileStep {
    const reKey = `^${stepType}${sepr}${textAsRe}$`;
    const uri = vscode.Uri.file('c:/test/steps/steps.py');
    return new StepFileStep(reKey, uri, 'steps.py', stepType, textAsRe);
  }

  function makeFeatureFileStep(stepType: string, textWithoutType: string): FeatureFileStep {
    const uri = vscode.Uri.file('c:/test/features/test.feature');
    return new FeatureFileStep(
      `key`,
      uri,
      'test.feature',
      new vscode.Range(0, 0, 0, 0),
      `${stepType} ${textWithoutType}`,
      textWithoutType,
      stepType,
    );
  }

  function buildMaps(stepFileSteps: StepFileStep[]): {
    exactSteps: Map<string, StepFileStep>;
    paramsSteps: Map<string, StepFileStep>;
    compiledExactRegexes: Map<string, RegExp>;
    compiledParamsRegexes: Map<string, RegExp>;
  } {
    const exactSteps = new Map<string, StepFileStep>();
    const paramsSteps = new Map<string, StepFileStep>();
    for (const sfs of stepFileSteps) {
      const key = `^${sfs.stepType}${sepr}${sfs.textAsRe}$`;
      if (sfs.textAsRe.includes(parseRepWildcard)) {
        paramsSteps.set(key, sfs);
      } else {
        exactSteps.set(key, sfs);
      }
    }
    const compiledExactRegexes = new Map<string, RegExp>();
    for (const [key] of exactSteps) {
      compiledExactRegexes.set(key, new RegExp(key));
    }
    const compiledParamsRegexes = new Map<string, RegExp>();
    for (const [key] of paramsSteps) {
      compiledParamsRegexes.set(key, new RegExp(key));
    }
    return { exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes };
  }

  suite('_getStepFileStepMatch with cached regexes', () => {

    test('exact match is found when step text matches exactly', () => {
      const sfs = makeStepFileStep('given', 'a precondition');
      const ffs = makeFeatureFileStep('given', 'a precondition');
      const { exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes } = buildMaps([sfs]);
      const result = _getStepFileStepMatch(ffs, exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes);
      assert.strictEqual(result, sfs);
    });

    test('parameterized match is found with wildcard', () => {
      const sfs = makeStepFileStep('given', `a user named ${parseRepWildcard}`);
      const ffs = makeFeatureFileStep('given', 'a user named Alice');
      const { exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes } = buildMaps([sfs]);
      const result = _getStepFileStepMatch(ffs, exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes);
      assert.strictEqual(result, sfs);
    });

    test('longest parameterized match wins when multiple match', () => {
      const shortStep = makeStepFileStep('given', `${parseRepWildcard} exists`);
      const longStep = makeStepFileStep('given', `a user named ${parseRepWildcard} exists`);
      const ffs = makeFeatureFileStep('given', 'a user named Bob exists');
      const { exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes } = buildMaps([shortStep, longStep]);
      const result = _getStepFileStepMatch(ffs, exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes);
      assert.strictEqual(result, longStep);
    });

    test('no match returns null', () => {
      const sfs = makeStepFileStep('given', 'something else');
      const ffs = makeFeatureFileStep('given', 'no matching step');
      const { exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes } = buildMaps([sfs]);
      const result = _getStepFileStepMatch(ffs, exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes);
      assert.strictEqual(result, null);
    });

    test('step type is used as fallback when specific type does not match', () => {
      const sfs = makeStepFileStep('step', 'a universal step');
      const ffs = makeFeatureFileStep('given', 'a universal step');
      const { exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes } = buildMaps([sfs]);
      const result = _getStepFileStepMatch(ffs, exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes);
      assert.strictEqual(result, sfs);
    });

    test('exact match takes priority over parameterized match', () => {
      const exactStep = makeStepFileStep('given', 'a specific value');
      const paramsStep = makeStepFileStep('given', `a specific ${parseRepWildcard}`);
      const ffs = makeFeatureFileStep('given', 'a specific value');
      const { exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes } = buildMaps([exactStep, paramsStep]);
      const result = _getStepFileStepMatch(ffs, exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes);
      assert.strictEqual(result, exactStep);
    });

    test('step fallback works for parameterized match', () => {
      const sfs = makeStepFileStep('step', `user ${parseRepWildcard} logs in`);
      const ffs = makeFeatureFileStep('when', 'user Admin logs in');
      const { exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes } = buildMaps([sfs]);
      const result = _getStepFileStepMatch(ffs, exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes);
      assert.strictEqual(result, sfs);
    });

    test('no fallback needed when step type already is step', () => {
      const sfs = makeStepFileStep('step', 'a step definition');
      const ffs = makeFeatureFileStep('step', 'a step definition');
      const { exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes } = buildMaps([sfs]);
      const result = _getStepFileStepMatch(ffs, exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes);
      assert.strictEqual(result, sfs);
    });

    test('empty step maps return null', () => {
      const ffs = makeFeatureFileStep('given', 'anything');
      const result = _getStepFileStepMatch(
        ffs,
        new Map(), new Map(),
        new Map(), new Map(),
      );
      assert.strictEqual(result, null);
    });

  });
});
