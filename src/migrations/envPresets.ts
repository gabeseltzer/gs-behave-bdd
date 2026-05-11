import type { MigrationEntry } from './types';
import type { TransformResult } from '../notifications';

/**
 * Phase 20 D-A2.1 / D-A2.2 / D-A2.3: generic two-record merge utility.
 * Caller supplies the inner-merge function for collision resolution.
 *
 * - Case 2 (canonical undefined): degenerates to identity over `legacy`.
 *   Pitfall 4: must still return `{ kind: 'write', value: legacy }` — NOT
 *   `{ kind: 'skipDest' }` — so the primitive copies legacy into canonical.
 * - Case 3 (both present): caller's mergeValue callback determines direction.
 *   Phase 20 ships only the case-2 path (canonical undefined at scope, so merge
 *   degenerates to identity); Phase 21 wires case-3 action callbacks with
 *   keep-canonical / overwrite-* semantics by supplying different mergeValue fns.
 *
 * Exported for Phase 21 reuse (CONTEXT.md D-A2.3).
 */
export function mergeRecord<T>(
  legacy: Record<string, T> | undefined,
  canonical: Record<string, T> | undefined,
  mergeValue: (legacyVal: T, canonicalVal: T) => T,
): Record<string, T> {
  const out: Record<string, T> = { ...(canonical ?? {}) };
  for (const [k, lv] of Object.entries(legacy ?? {})) {
    out[k] = k in out ? mergeValue(lv, out[k]) : lv;
  }
  return out;
}

/**
 * envVarPresets — preset-level mergeRecord, var-level mergeRecord with
 * legacy-wins-on-collision (the case-2 / overwrite-* direction). Phase 21
 * will swap the inner mergeValue to honor case-3 user choices.
 *
 * Pitfall 4: if legacy is undefined/null/not-an-object → skipDest + removeSource.
 * If legacy is a valid object (even empty) → always return write so the primitive
 * copies the merged result into canonical.
 */
export const envVarPresetsTransform = (
  legacy: Record<string, Record<string, string>> | undefined,
  canonical: Record<string, Record<string, string>> | undefined,
): TransformResult<Record<string, Record<string, string>>> => {
  if (legacy === undefined || legacy === null || typeof legacy !== 'object') {
    return { kind: 'skipDest', removeSource: true };
  }
  // D-A2.3 overwrite-* direction: legacy wins on var collision.
  // In the case-2 path (canonical=undefined), mergeRecord degenerates to identity
  // over legacy — still returns write (Pitfall 4).
  const merged = mergeRecord(legacy, canonical, (lp, cp) =>
    mergeRecord(lp, cp, (lv) => lv), // legacy var wins on collision
  );
  return { kind: 'write', value: merged };
};

/**
 * envVarOverrides — single-level mergeRecord (var name -> string), legacy wins.
 * Pitfall 4: same guard as envVarPresetsTransform — undefined legacy → skipDest.
 */
export const envVarOverridesTransform = (
  legacy: Record<string, string> | undefined,
  canonical: Record<string, string> | undefined,
): TransformResult<Record<string, string>> => {
  if (legacy === undefined || legacy === null || typeof legacy !== 'object') {
    return { kind: 'skipDest', removeSource: true };
  }
  return { kind: 'write', value: mergeRecord(legacy, canonical, (lv) => lv) };
};

/**
 * Two registry entries for the envPresets migration area.
 *
 * 1. `envVarPresets-from-behavevsc`: cross-namespace deep-merge (preset-level + var-level).
 *    migrates behave-vsc.envVarPresets -> gs-behave-bdd.envVarPresets
 * 2. `envVarOverrides-from-behavevsc`: cross-namespace single-level merge.
 *    migrates behave-vsc.envVarOverrides -> gs-behave-bdd.envVarOverrides
 */
export const envPresetEntries: readonly MigrationEntry[] = [
  {
    id: 'envVarPresets-from-behavevsc',
    sourceNamespace: 'behave-vsc',
    sourceKey: 'envVarPresets',
    destNamespace: 'gs-behave-bdd',
    destKey: 'envVarPresets',
    transform: envVarPresetsTransform as MigrationEntry['transform'],
  },
  {
    id: 'envVarOverrides-from-behavevsc',
    sourceNamespace: 'behave-vsc',
    sourceKey: 'envVarOverrides',
    destNamespace: 'gs-behave-bdd',
    destKey: 'envVarOverrides',
    transform: envVarOverridesTransform as MigrationEntry['transform'],
  },
];
