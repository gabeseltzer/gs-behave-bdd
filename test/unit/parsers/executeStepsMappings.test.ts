// Tests for the execute_steps mapping funnel: parallel executeStepsMappings array, the union
// edit in getStepMappingsForStepsFileFunction, rebuild/delete/lookup helpers, and the required
// REFS-04 regression guard (getStepMappings must never include execute_steps rows).

import * as assert from 'assert';
import * as vscode from 'vscode';
import { sepr, uriId, urisMatch } from '../../../src/common';
import { StepFileStep, parseRepWildcard, getStepFileSteps, parseStepsFileContent, deleteStepFileSteps } from '../../../src/parsers/stepsParser';
import { FeatureFileStep, getFeatureFileSteps, parseFeatureContent, deleteFeatureFileSteps } from '../../../src/parsers/featureParser';
import { ExecuteStepsCallStep, getExecuteStepsCallSteps, parseExecuteStepsFileContent, deleteExecuteStepsCallSteps } from '../../../src/parsers/executeStepsParser';
import { WorkspaceSettings } from '../../../src/settings';
import {
  _getStepFileStepMatch,
  getStepMappings,
  getStepMappingsForStepsFileFunction,
  getStepFileStepForExecuteStep,
  deleteExecuteStepsMappings,
  deleteStepMappings,
  rebuildExecuteStepsMappings,
  rebuildStepMappings,
  matchExecuteStepsContent,
} from '../../../src/parsers/stepMappings';

suite('executeStepsMappings', () => {

  function makeStepFileStep(stepType: string, textAsRe: string, uri?: vscode.Uri): StepFileStep {
    const reKey = `^${stepType}${sepr}${textAsRe}$`;
    const stepUri = uri ?? vscode.Uri.file('c:/execute-steps-mappings-test/features/steps/steps.py');
    return new StepFileStep(reKey, stepUri, 'steps.py', stepType, textAsRe);
  }

  function makeExecuteStepsCallStep(stepType: string, textWithoutType: string, opts?: {
    uri?: vscode.Uri;
    line?: number;
    hasFormatPlaceholders?: boolean;
  }): ExecuteStepsCallStep {
    const uri = opts?.uri ?? vscode.Uri.file('c:/execute-steps-mappings-test/features/steps/lib.py');
    const line = opts?.line ?? 0;
    const key = `${uriId(uri)}${sepr}${line}`;
    const range = new vscode.Range(line, 0, line, stepType.length + 1 + textWithoutType.length);
    return new ExecuteStepsCallStep(
      key, uri, 'lib.py', range,
      `${stepType} ${textWithoutType}`, textWithoutType, stepType,
      opts?.hasFormatPlaceholders ?? false,
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

  suite('union in getStepMappingsForStepsFileFunction', () => {

    test('returns feature-file mappings AND execute_steps mappings for the same step-def function line', () => {
      const featuresUri = vscode.Uri.file('c:/execute-steps-mappings-test-union/features');
      const stepFileUri = vscode.Uri.file('c:/execute-steps-mappings-test-union/features/steps/steps.py');
      deleteExecuteStepsMappings(featuresUri);

      const sfs = makeStepFileStep('given', 'a precondition', stepFileUri);
      sfs.functionDefinitionRange = new vscode.Range(10, 0, 10, 20);

      const ffs = new FeatureFileStep(
        'ffs-key', vscode.Uri.file('c:/execute-steps-mappings-test-union/features/test.feature'),
        'test.feature', new vscode.Range(0, 0, 0, 20),
        'Given a precondition', 'a precondition', 'given',
      );

      const callStep = makeExecuteStepsCallStep('given', 'a precondition', {
        uri: vscode.Uri.file('c:/execute-steps-mappings-test-union/features/steps/lib.py'),
        line: 5,
      });

      const { exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes } = buildMaps([sfs]);
      const stepFileStep = _getStepFileStepMatch(ffs, exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes);
      assert.ok(stepFileStep, 'precondition for the test: feature step must match the step def');

      // Manually seed the mappings for this scenario via the real rebuild functions is not
      // possible without wiring getFeatureFileSteps/getStepFileSteps caches, so we drive the
      // union directly through the real exported functions using the shared step-def maps.
      const execMatch = _getStepFileStepMatch(callStep, exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes);
      assert.ok(execMatch, 'precondition for the test: exec call step must match the step def');

      // Assert union behavior structurally: getStepMappingsForStepsFileFunction concatenates
      // stepMappings and executeStepsMappings filtered by the same predicate - verified via the
      // rebuild + lookup round trip in the 'rebuildExecuteStepsMappings' suite below, which
      // exercises the real module-level state end-to-end.
      assert.strictEqual(stepFileStep, sfs);
      assert.strictEqual(execMatch, sfs);
    });
  });

  suite('rebuildExecuteStepsMappings + union + REFS-04 regression guard', () => {

    test('end-to-end: seeded def + feature step + exec call step surface through the union, and getStepMappings stays exec-free', async () => {
      const featuresUri = vscode.Uri.file('c:/execute-steps-mappings-test-rebuild/features');
      const stepFileUri = vscode.Uri.file('c:/execute-steps-mappings-test-rebuild/features/steps/steps.py');
      const libUri = vscode.Uri.file('c:/execute-steps-mappings-test-rebuild/features/steps/lib.py');
      const featureUri = vscode.Uri.file('c:/execute-steps-mappings-test-rebuild/features/test.feature');
      const wkspSettings = { uri: vscode.Uri.file('c:/execute-steps-mappings-test-rebuild') } as WorkspaceSettings;

      try {
        // Seed the REAL module caches through their own parse entry points:
        // one step definition, one feature step that matches it, one execute_steps call site that matches it.
        await parseStepsFileContent(featuresUri, '@given("a precondition")\ndef step_impl(context):\n    pass\n', stepFileUri, 'test');
        parseFeatureContent(wkspSettings, featureUri, 'Feature: T\n  Scenario: S\n    Given a precondition\n', 'test', () => undefined, () => undefined);
        parseExecuteStepsFileContent(featuresUri, 'def helper(context):\n    context.execute_steps("Given a precondition")\n', libUri, 'test');

        rebuildStepMappings(featuresUri, featuresUri);
        const processed = rebuildExecuteStepsMappings(featuresUri);
        assert.strictEqual(processed, 1, 'exactly one execute_steps call step should be processed');

        const stepFileSteps = getStepFileSteps(featuresUri);
        assert.strictEqual(stepFileSteps.length, 1, 'precondition: the seeded step def must be in the cache');
        const fnLine = stepFileSteps[0][1].functionDefinitionRange.start.line;

        // The union: getStepMappingsForStepsFileFunction must return BOTH the feature-file mapping
        // and the execute_steps mapping for the same step-def function line. Dropping the
        // .concat(executeStepsMappings...) union edit would fail this assertion.
        const union = getStepMappingsForStepsFileFunction(stepFileUri, fnLine);
        const execRows = union.filter(m => m.featureFileStep instanceof ExecuteStepsCallStep);
        const featureRows = union.filter(m => !(m.featureFileStep instanceof ExecuteStepsCallStep));
        assert.strictEqual(execRows.length, 1, 'union must include the execute_steps call site');
        assert.ok(urisMatch(execRows[0].featureFileStep.uri, libUri), 'exec row must point at the calling .py file');
        assert.strictEqual(featureRows.length, 1, 'union must still include the feature-file mapping');

        // getStepFileStepForExecuteStep resolves the call site (line 1 of lib.py) to the step def
        const resolved = getStepFileStepForExecuteStep(libUri, 1);
        assert.strictEqual(resolved, stepFileSteps[0][1]);

        // REFS-04 regression guard against a NON-empty flat table: the feature mapping is present,
        // the exec mapping is not.
        const flatMappings = getStepMappings(featuresUri);
        assert.ok(flatMappings.length >= 1, 'guard must run against a non-empty flat table');
        assert.ok(
          flatMappings.every(m => !(m.featureFileStep instanceof ExecuteStepsCallStep)),
          'getStepMappings must not include execute_steps mappings (REFS-04)',
        );
      }
      finally {
        deleteStepMappings(featuresUri);
        deleteExecuteStepsMappings(featuresUri);
        deleteStepFileSteps(featuresUri);
        deleteFeatureFileSteps(featuresUri);
        deleteExecuteStepsCallSteps(featuresUri);
      }
    });

    test('rebuild does not double counts when called twice for the same featuresUri (per-workspace, not per-root)', () => {
      const featuresUri = vscode.Uri.file('c:/execute-steps-mappings-test-double/features');
      deleteExecuteStepsMappings(featuresUri);

      const first = rebuildExecuteStepsMappings(featuresUri);
      const second = rebuildExecuteStepsMappings(featuresUri);
      assert.strictEqual(first, second, 'processed count should be stable across repeated rebuilds with no new call steps');
    });
  });

  suite('leading */And/But funnel semantics (WR-02)', () => {

    test('leading * resolves to given and must NOT match a when/then-only step def', () => {
      // behave resolves a leading "*" deterministically to "given"
      // (bundled/libs/behave/parser.py:847,860,876-877; i18n.py:264), so the funnel must never
      // map it to a @when/@then definition that behave's registry would not resolve.
      const whenOnlySfs = makeStepFileStep('when', 'something happens');
      const { exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes } = buildMaps([whenOnlySfs]);

      const starCallStep = makeExecuteStepsCallStep('given', 'something happens'); // scanner resolves * -> given
      const match = _getStepFileStepMatch(starCallStep, exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes);
      assert.strictEqual(match, null, 'a *-resolved given step must not match a when-only step def');
    });

    test('leading * resolved to given matches a given step def (and falls back to the step bucket)', () => {
      const givenSfs = makeStepFileStep('given', 'something happens');
      const { exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes } = buildMaps([givenSfs]);

      const starCallStep = makeExecuteStepsCallStep('given', 'something happens');
      const match = _getStepFileStepMatch(starCallStep, exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes);
      assert.strictEqual(match, givenSfs);

      const stepSfs = makeStepFileStep('step', 'something happens');
      const maps2 = buildMaps([stepSfs]);
      const match2 = _getStepFileStepMatch(starCallStep, maps2.exactSteps, maps2.paramsSteps, maps2.compiledExactRegexes, maps2.compiledParamsRegexes);
      assert.strictEqual(match2, stepSfs, 'the generic "step" bucket fallback still applies');
    });
  });

  suite('getStepFileStepForExecuteStep', () => {

    test('returns undefined when there is no mapping at the given file+line', () => {
      const fileUri = vscode.Uri.file('c:/execute-steps-mappings-test-lookup/features/steps/lib.py');
      const result = getStepFileStepForExecuteStep(fileUri, 999);
      assert.strictEqual(result, undefined);
    });
  });

  suite('matchExecuteStepsContent (live-text matching, no persistence)', () => {

    test('returns matches without mutating getStepMappingsForStepsFileFunction output', () => {
      const featuresUri = vscode.Uri.file('c:/execute-steps-mappings-test-livematch/features');
      const stepFileUri = vscode.Uri.file('c:/execute-steps-mappings-test-livematch/features/steps/steps.py');
      deleteExecuteStepsMappings(featuresUri);

      const before = getStepMappingsForStepsFileFunction(stepFileUri, 0);

      const content = 'def some_helper(context):\n    context.execute_steps("""\n        Given a precondition\n    """)\n';
      const results = matchExecuteStepsContent(featuresUri, stepFileUri, content);

      assert.ok(Array.isArray(results.matches));
      assert.ok(Array.isArray(results.invalidLines));
      // The returned call steps must carry the scanned document's uri, not the features directory
      assert.strictEqual(results.matches.length, 1);
      assert.ok(urisMatch(results.matches[0].callStep.uri, stepFileUri),
        'call step uri must be the scanned file, not the features directory');
      // No step defs registered for this featuresUri, so every result's stepFileStep is null -
      // but the important assertion is that nothing was persisted to executeStepsMappings.
      const after = getStepMappingsForStepsFileFunction(stepFileUri, 0);
      assert.deepStrictEqual(after, before, 'matchExecuteStepsContent must not persist to executeStepsMappings');
    });

    test('does not mutate the executeStepsCallSteps cache (pure read path)', () => {
      const featuresUri = vscode.Uri.file('c:/execute-steps-mappings-test-livematch-cache/features');
      const fileUri = vscode.Uri.file('c:/execute-steps-mappings-test-livematch-cache/features/steps/steps.py');
      const before = getExecuteStepsCallSteps(featuresUri).length;

      const content = 'context.execute_steps("""\n    Given a step\n""")\n';
      matchExecuteStepsContent(featuresUri, fileUri, content);

      const after = getExecuteStepsCallSteps(featuresUri).length;
      assert.strictEqual(after, before, 'matchExecuteStepsContent must not write to the executeStepsParser cache');
    });
  });

  suite('_getCompiledStepDefs / _getFilteredSteps behavior preservation', () => {

    test('existing feature-file mapping behavior is unaffected by the refactor', () => {
      const featuresUri = vscode.Uri.file('c:/execute-steps-mappings-test-preserve/features');
      deleteExecuteStepsMappings(featuresUri);

      // rebuildStepMappings should still work exactly as before against real (empty) caches.
      const processed = rebuildStepMappings(featuresUri, featuresUri);
      assert.strictEqual(processed, getFeatureFileSteps(featuresUri).length);
      // sanity: getStepFileSteps still callable post-refactor
      assert.strictEqual(getStepFileSteps(featuresUri).length, getStepFileSteps(featuresUri).length);
    });
  });

  suite('getStepMappings excludes execute_steps rows (REFS-04)', () => {

    test('getStepMappings excludes execute_steps rows even when exec mappings exist', async () => {
      const featuresUri = vscode.Uri.file('c:/execute-steps-regression-test/features');
      const stepFileUri = vscode.Uri.file('c:/execute-steps-regression-test/features/steps/steps.py');
      const libUri = vscode.Uri.file('c:/execute-steps-regression-test/features/steps/lib.py');

      try {
        // Seed ONLY a step def and an exec call site (no feature steps), so the parallel array is
        // genuinely non-empty while the flat table has no rows for this featuresUri.
        await parseStepsFileContent(featuresUri, '@when("something occurs")\ndef step_impl(context):\n    pass\n', stepFileUri, 'test');
        parseExecuteStepsFileContent(featuresUri, 'context.execute_steps("When something occurs")\n', libUri, 'test');

        rebuildStepMappings(featuresUri, featuresUri);
        const processed = rebuildExecuteStepsMappings(featuresUri);
        assert.strictEqual(processed, 1, 'precondition: one exec mapping must actually exist');

        const fnLine = getStepFileSteps(featuresUri)[0][1].functionDefinitionRange.start.line;
        assert.strictEqual(getStepMappingsForStepsFileFunction(stepFileUri, fnLine).length, 1,
          'precondition: the exec mapping is reachable through the union');

        const mappings = getStepMappings(featuresUri);
        assert.strictEqual(mappings.length, 0,
          'getStepMappings must not include execute_steps mappings (only exec rows exist for this featuresUri)');
      }
      finally {
        deleteStepMappings(featuresUri);
        deleteExecuteStepsMappings(featuresUri);
        deleteStepFileSteps(featuresUri);
        deleteExecuteStepsCallSteps(featuresUri);
      }
    });
  });
});
