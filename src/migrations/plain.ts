import type { MigrationEntry } from './types';

/**
 * Phase 20 D-A3.1 / CONTEXT.md plain-keys inventory: factory for the 11
 * plain-copy `behave-vsc.<key>` -> `gs-behave-bdd.<key>` migration entries.
 *
 * Source namespace is always `behave-vsc` and dest namespace is always
 * `gs-behave-bdd` — they are not parameters because they never vary for
 * plain entries.
 *
 * The transform is unconditional `{ kind: 'write', value: src }`. The
 * Phase 19 evaluator (case 1/2/3 dispatch) gates this transform: it is only
 * invoked in case 2 (legacy set, canonical absent) where a straight copy is
 * the right semantics. Case 3 is owned by Phase 21 and overrides the
 * transform's behavior via the action callback.
 *
 * Entry id convention (CONTEXT.md D-A4 / types.ts Pitfall 3):
 *   `<key>-from-behavevsc` for all cross-extension plain entries.
 */
export function makePlainEntry<T>(
  sourceKey: string,
  destKey: string = sourceKey,
): MigrationEntry<T, T> {
  return {
    id: `${sourceKey}-from-behavevsc`,
    sourceNamespace: 'behave-vsc',
    sourceKey,
    destNamespace: 'gs-behave-bdd',
    destKey,
    transform: (src) => ({ kind: 'write', value: src }),
  };
}

/**
 * The 11 plain-copy entries from D-A1.3 (the 15 inventory keys minus the 4
 * transform-bearing keys: featuresPath, suppressedNotifications, envVarPresets,
 * envVarOverrides — those land in Plans 03/04).
 *
 * Order mirrors the inventory table for review-ability.
 */
export const plainEntries: readonly MigrationEntry[] = [
  makePlainEntry('projectPath'),
  makePlainEntry('runParallel'),
  makePlainEntry('justMyCode'),
  makePlainEntry('xRay'),
  makePlainEntry('verboseLogging'),
  makePlainEntry('multiRootRunWorkspacesInParallel'),
  makePlainEntry('importStrategy'),
  makePlainEntry('stepDefinitionSearchTimeout'),
  makePlainEntry('discoveryDepth'),
  makePlainEntry('discoveryStopOnFirstHit'),
  makePlainEntry('activeEnvVarPreset'),
];
