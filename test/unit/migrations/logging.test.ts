// Tests for the two logging-settings migrations (260730-vlg).
//
// The ordering test below is the important one: it guards against silently enabling
// secret logging for a user who never asked for it.

import * as assert from 'assert';
import {
  loggingEntries, verboseLoggingToPresetContents, xRayToVerboseLogging,
} from '../../../src/migrations/logging';
import { MIGRATION_REGISTRY } from '../../../src/migrations/registry';


suite('logging settings migrations', () => {

  suite('verboseLogging -> logEnvVarPresetContents', () => {

    test('true carries the old preset-dumping intent across', () => {
      assert.deepStrictEqual(verboseLoggingToPresetContents(true),
        { kind: 'write', value: true, removeSource: false });
    });

    test('PRESERVES verboseLogging - this is a copy, not a move', () => {
      // verboseLogging still exists and its new meaning is almost certainly also wanted;
      // removing it would silently turn off the diagnostics the user had enabled
      const result = verboseLoggingToPresetContents(true);
      assert.strictEqual(result.kind === 'write' && result.removeSource, false);
    });

    test('false does not write the new key', () => {
      assert.deepStrictEqual(verboseLoggingToPresetContents(false),
        { kind: 'skipDest', removeSource: false });
    });

    test('unset does not write the new key', () => {
      assert.deepStrictEqual(verboseLoggingToPresetContents(undefined),
        { kind: 'skipDest', removeSource: false });
    });

  });


  suite('xRay -> verboseLogging', () => {

    test('true enables verboseLogging and retires xRay', () => {
      assert.deepStrictEqual(xRayToVerboseLogging(true, undefined), { kind: 'write', value: true });
    });

    test('removes xRay by default - the point is to retire the setting', () => {
      const result = xRayToVerboseLogging(true, undefined);
      // removeSource omitted means "remove" (see the migrateScopedSetting contract)
      assert.strictEqual(result.kind === 'write' && result.removeSource, undefined);
    });

    test('does not rewrite verboseLogging when it is already on, but still retires xRay', () => {
      assert.deepStrictEqual(xRayToVerboseLogging(true, true), { kind: 'skipDest', removeSource: true });
    });

    test('an explicit false is retired without enabling verboseLogging', () => {
      assert.deepStrictEqual(xRayToVerboseLogging(false, undefined), { kind: 'skipDest', removeSource: true });
    });

    test('unset xRay is left entirely alone', () => {
      assert.deepStrictEqual(xRayToVerboseLogging(undefined, undefined), { kind: 'skipDest', removeSource: false });
    });

  });


  suite('ordering (load-bearing)', () => {

    test('verboseLogging-self runs BEFORE xRay-self', () => {
      const ids = loggingEntries.map(e => e.id);
      assert.deepStrictEqual(ids, ['verboseLogging-self', 'xRay-self']);
    });

    test('the same order holds in the aggregated registry, which is what actually executes', () => {
      const ids = MIGRATION_REGISTRY.map(e => e.id);
      const verboseIdx = ids.indexOf('verboseLogging-self');
      const xRayIdx = ids.indexOf('xRay-self');
      assert.ok(verboseIdx >= 0 && xRayIdx >= 0, 'both entries must be registered');
      assert.ok(verboseIdx < xRayIdx,
        'verboseLogging-self must precede xRay-self (evaluateAllMigrations iterates sequentially)');
    });

    test('REGRESSION: the reverse order would offer secret logging to an xRay-only user', () => {
      // Simulate the wrong order for a user who set xRay=true and never touched verboseLogging.
      // xRay-self runs first and writes verboseLogging=true...
      const afterXRay = xRayToVerboseLogging(true, undefined);
      assert.ok(afterXRay.kind === 'write' && afterXRay.value === true);

      // ...and verboseLogging-self, seeing that value, would then enable logging of env var
      // preset CONTENTS - i.e. the user's secrets - despite them never enabling verboseLogging.
      const wouldLeak = verboseLoggingToPresetContents(afterXRay.value as boolean);
      assert.strictEqual(wouldLeak.kind, 'write',
        'this is exactly the outcome the declared order prevents - do not reorder loggingEntries');
    });

  });


  suite('registry wiring', () => {

    test('both entries are intra-namespace gs-behave-bdd migrations', () => {
      for (const entry of loggingEntries) {
        assert.strictEqual(entry.sourceNamespace, 'gs-behave-bdd', entry.id);
        assert.strictEqual(entry.destNamespace, 'gs-behave-bdd', entry.id);
      }
    });

    test('logging entries come last, after the cross-namespace behave-vsc entries', () => {
      // so that behave-vsc.xRay / behave-vsc.verboseLogging have already landed in the
      // gs-behave-bdd namespace and are then migrated onward by the same rules
      const ids = MIGRATION_REGISTRY.map(e => e.id);
      assert.ok(ids.indexOf('xRay-from-behavevsc') < ids.indexOf('xRay-self'));
      assert.ok(ids.indexOf('verboseLogging-from-behavevsc') < ids.indexOf('verboseLogging-self'));
    });

  });

});
