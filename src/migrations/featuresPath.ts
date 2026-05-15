import type { MigrationEntry } from './types';
import type { TransformResult } from '../notifications';
import { normalizeFeaturesPathEntry } from '../common';

/**
 * Phase 20 D-A4.1: lifted from `src/notifications.ts:325-343` (the inner
 * `transform` body of v1.4.0's `migrateLegacyFeaturesPath`). Behavior is
 * byte-identical — same dedup regex, same skip-with-removal semantics,
 * same merge order. The 12 sub-case regression bar in
 * `test/unit/notifications.test.ts:601+` still pins this function via
 * the wrapper that delegates to it.
 *
 * Used by both registry entries below — D-A4.1 mandates that
 * featuresPath-self and featuresPath-from-behavevsc share one transform
 * reference (so the regression bar covers both wirings).
 */
export const featuresPathMergeWithDedup = (
  legacyValue: string | undefined,
  existingArr: string[] | undefined,
): TransformResult<string[]> => {
  // D-08: empty/whitespace → remove source but skip dest write.
  if (legacyValue === undefined || typeof legacyValue !== 'string' || legacyValue.trim() === '') {
    return { kind: 'skipDest', removeSource: true };
  }
  const normalized = normalizeFeaturesPathEntry(legacyValue);
  if (normalized === '') {
    // Post-normalization empty (e.g., the value was "/" or "\\").
    return { kind: 'skipDest', removeSource: true };
  }
  // D-06 / D-07: same-scope merge-with-dedup, post-normalization comparison.
  const current = Array.isArray(existingArr) ? [...existingArr] : [];
  if (current.some((p) => normalizeFeaturesPathEntry(p) === normalized)) {
    // Already present — write the unchanged array (still triggers source removal
    // via the primitive's kind='write' branch).
    return { kind: 'write', value: current };
  }
  return { kind: 'write', value: [...current, normalized] };
};

/**
 * D-A4.1 / D-A4.2: two entries sharing one transform.
 *  - `featuresPath-self`           — gs-behave-bdd.featuresPath -> gs-behave-bdd.featuresPaths (intra-namespace; v1.4.0 singular -> plural).
 *  - `featuresPath-from-behavevsc` — behave-vsc.featuresPath    -> gs-behave-bdd.featuresPaths (cross-namespace).
 * Per D-A4.2 each gets its own `completedMigrations` slot — the user can
 * complete one without affecting the other.
 */
export const featuresPathEntries: readonly MigrationEntry[] = [
  {
    id: 'featuresPath-self',
    sourceNamespace: 'gs-behave-bdd',
    sourceKey: 'featuresPath',
    destNamespace: 'gs-behave-bdd',
    destKey: 'featuresPaths',
    transform: featuresPathMergeWithDedup as MigrationEntry['transform'],
  },
  {
    id: 'featuresPath-from-behavevsc',
    sourceNamespace: 'behave-vsc',
    sourceKey: 'featuresPath',
    destNamespace: 'gs-behave-bdd',
    destKey: 'featuresPaths',
    transform: featuresPathMergeWithDedup as MigrationEntry['transform'],
  },
];
