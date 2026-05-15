import type { MigrationEntry } from './types';
import type { TransformResult } from '../notifications';

/**
 * Phase 20 D-A4.3: lifted from `src/notifications.ts:267-279` (the inner
 * `transform` body of v1.4.0's migrateLegacySuppressMultiConfig). Behavior is
 * byte-identical including the `legacyValue !== true` callCount-zero contract.
 *
 * The v1.4.0 wrapper `migrateLegacySuppressMultiConfig` remains a thin shim
 * delegating to this function (Pitfall 1 — notifications.test.ts still imports it).
 * Full wrapper deletion is Phase 22. Registry entry id: `suppressMultiConfig-self`.
 */
export const suppressMultiConfigToArray = (
  legacyValue: boolean | undefined,
  existingArr: string[] | undefined,
): TransformResult<string[]> => {
  if (legacyValue !== true) {
    // Pre-refactor parity: no dest write AND no source removal (callCount === 0
    // contract at notifications.test.ts L335).
    return { kind: 'skipDest', removeSource: false };
  }
  const current = Array.isArray(existingArr) ? [...existingArr] : [];
  if (current.includes('multiConfigNotification')) {
    // Already present — write the unchanged array (still triggers source removal).
    return { kind: 'write', value: current };
  }
  return { kind: 'write', value: [...current, 'multiConfigNotification'] };
};

/**
 * D-A2.4 array append-with-dedup transform for the cross-namespace
 * `behave-vsc.suppressedNotifications` -> `gs-behave-bdd.suppressedNotifications`
 * migration. Same shape as featuresPathMergeWithDedup but on plain string equality
 * (no path normalization needed for notification ids).
 *
 * If legacyArr is undefined/not-an-array: skip dest + remove source (case-1 path).
 * Otherwise: dedup-merge legacy entries into canonical (legacy appended, dedup by
 * string equality). Returns write even if merged equals canonical — the W-01
 * deep-equal short-circuit in the primitive skips the actual update() call when
 * values are identical.
 */
export const suppressedNotificationsAppendWithDedup = (
  legacyArr: readonly string[] | undefined,
  existingArr: readonly string[] | undefined,
): TransformResult<string[]> => {
  if (!Array.isArray(legacyArr)) {
    return { kind: 'skipDest', removeSource: true };
  }
  const current = Array.isArray(existingArr) ? [...existingArr] : [];
  for (const item of legacyArr) {
    if (typeof item === 'string' && !current.includes(item)) {
      current.push(item);
    }
  }
  return { kind: 'write', value: current };
};

/**
 * Two registry entries for the suppressedNotifications migration area.
 *
 * 1. `suppressMultiConfig-self`: intra-namespace boolean -> array-append.
 *    migrates gs-behave-bdd.suppressMultiConfigNotification -> gs-behave-bdd.suppressedNotifications
 * 2. `suppressedNotifications-from-behavevsc`: cross-namespace array append-with-dedup.
 *    migrates behave-vsc.suppressedNotifications -> gs-behave-bdd.suppressedNotifications
 */
export const suppressedNotificationsEntries: readonly MigrationEntry[] = [
  {
    id: 'suppressMultiConfig-self',
    sourceNamespace: 'gs-behave-bdd',
    sourceKey: 'suppressMultiConfigNotification',
    destNamespace: 'gs-behave-bdd',
    destKey: 'suppressedNotifications',
    transform: suppressMultiConfigToArray as MigrationEntry['transform'],
  },
  {
    id: 'suppressedNotifications-from-behavevsc',
    sourceNamespace: 'behave-vsc',
    sourceKey: 'suppressedNotifications',
    destNamespace: 'gs-behave-bdd',
    destKey: 'suppressedNotifications',
    transform: suppressedNotificationsAppendWithDedup as MigrationEntry['transform'],
  },
];
