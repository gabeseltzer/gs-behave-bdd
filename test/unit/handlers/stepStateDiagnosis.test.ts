// The shared step-state diagnosis. This backs the language-status item, the diagnostic report,
// and the step-navigation log, so these tests pin the wording ONE place and all three follow.

import * as assert from 'assert';
import { diagnoseStepState } from '../../../src/handlers/stepStateDiagnosis';


suite('diagnoseStepState', () => {

  test('a healthy workspace gets no diagnosis (status item stays "Ready")', () => {
    assert.strictEqual(diagnoseStepState(10, 8, 9), undefined);
  });

  test('zero feature steps points at the features path', () => {
    const d = diagnoseStepState(0, 5, 0);
    assert.ok(d);
    assert.strictEqual(d!.title, 'No feature steps found');
    assert.ok(d!.detail.includes('featuresPaths'), d!.detail);
  });

  test('zero step definitions points at the steps folder', () => {
    const d = diagnoseStepState(10, 0, 0);
    assert.ok(d);
    assert.strictEqual(d!.title, 'No step definitions loaded');
    assert.ok(d!.detail.includes('steps'), d!.detail);
    assert.ok(d!.detail.includes('verboseLogging'), 'should tell the user how to get more detail');
  });

  test('both present but nothing matched points at a text/pattern mismatch', () => {
    const d = diagnoseStepState(10, 8, 0);
    assert.ok(d);
    assert.strictEqual(d!.title, 'No steps matched');
    assert.ok(d!.detail.includes('Problems pane'), d!.detail);
  });

  test('feature steps take priority - a wrong features path explains the other zeros', () => {
    // all three are zero; reporting "no steps matched" would send the user down the wrong path
    const d = diagnoseStepState(0, 0, 0);
    assert.strictEqual(d!.title, 'No feature steps found');
  });

  test('a partially-matched workspace is healthy enough not to warn', () => {
    // some steps unmatched is normal while editing - only ZERO mappings is degenerate
    assert.strictEqual(diagnoseStepState(50, 20, 1), undefined);
  });

});
