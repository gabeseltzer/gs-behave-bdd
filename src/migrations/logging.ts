import type { MigrationEntry } from './types';
import type { TransformResult } from '../notifications';

/**
 * v1.6.x logging-settings migrations.
 *
 * Two intra-namespace (`-self`) entries, and the ORDER BETWEEN THEM IS LOAD-BEARING - see
 * `loggingEntries` below before reordering or adding to them.
 */


/**
 * `gs-behave-bdd.verboseLogging` -> `gs-behave-bdd.logEnvVarPresetContents`
 *
 * verboseLogging used to do exactly one thing: dump the full contents of envVarPresets to the
 * output channel. It now means "log detailed diagnostics" and deliberately logs no secrets,
 * with preset contents moved behind their own opt-in. A user who had verboseLogging enabled
 * was opting into preset dumping, so carry that intent across to the new key.
 *
 * verboseLogging itself is PRESERVED (`removeSource: false`) - it still exists and its new
 * meaning is almost certainly also wanted by someone who had it on. This is a copy, not a move.
 *
 * Only `true` migrates: an explicit `false` carries no intent worth transferring, and writing
 * `false` to the new key would just add noise to settings.json.
 */
export const verboseLoggingToPresetContents = (
  src: boolean | undefined,
): TransformResult<boolean> => {
  if (src !== true)
    return { kind: 'skipDest', removeSource: false };
  return { kind: 'write', value: true, removeSource: false };
};


/**
 * `gs-behave-bdd.xRay` -> `gs-behave-bdd.verboseLogging`
 *
 * xRay is deprecated: verboseLogging now covers both the output-channel diagnostics and the
 * DevTools-console diagnostics + error stack traces that xRay used to gate, so there is one
 * flag to ask a user for instead of two that each cover half the picture.
 *
 * Unlike the migration above this is a MOVE - the source is removed (default `removeSource`),
 * because the whole point is to retire the setting. xRay keeps working as an alias until the
 * user migrates (see diagLog), so removing it only ever loses a redundant key.
 */
export const xRayToVerboseLogging = (
  src: boolean | undefined,
  destAtSameScope: boolean | undefined,
): TransformResult<boolean> => {
  if (src !== true) {
    // xRay explicitly false: nothing to carry across, but still retire the key.
    return { kind: 'skipDest', removeSource: src === false };
  }
  if (destAtSameScope === true) {
    // already on - just retire xRay
    return { kind: 'skipDest', removeSource: true };
  }
  return { kind: 'write', value: true };
};


/**
 * ORDER IS LOAD-BEARING. `verboseLogging-self` MUST come before `xRay-self`, and `evaluateAllMigrations` runs the registry sequentially
 * (a `for...of` with `await`) so this array order is what executes.
 *
 * If xRay ran first, it would set `verboseLogging: true` for an xRay user - and then the
 * preset-contents migration would see a `true` that the user never set and offer to enable
 * logging of their environment variable values, i.e. their secrets. Running preset-contents
 * first means it only ever observes the user's ORIGINAL verboseLogging value.
 *
 * (Belt and braces: the first migration is marked Finished per scope on its own pass -
 * including the case-1 "neither set" path - so a later write by the second migration cannot
 * retroactively trigger it. The ordering is still the primary guarantee, and is pinned by a
 * test in test/unit/migrations/logging.test.ts.)
 */
export const loggingEntries: readonly MigrationEntry[] = [
  {
    id: 'verboseLogging-self',
    sourceNamespace: 'gs-behave-bdd',
    sourceKey: 'verboseLogging',
    destNamespace: 'gs-behave-bdd',
    destKey: 'logEnvVarPresetContents',
    transform: verboseLoggingToPresetContents as MigrationEntry['transform'],
  },
  {
    id: 'xRay-self',
    sourceNamespace: 'gs-behave-bdd',
    sourceKey: 'xRay',
    destNamespace: 'gs-behave-bdd',
    destKey: 'verboseLogging',
    transform: xRayToVerboseLogging as MigrationEntry['transform'],
  },
];
