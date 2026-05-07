import type { MigrationEntry } from './types';

/**
 * Phase 19 D-05: registry intentionally empty. Phase 20 populates it with
 * the v1.4.0 refactors (migrateLegacyFeaturesPath, migrateLegacySuppressMultiConfig)
 * and the new behave-vsc -> gs-behave-bdd entries (MIGRATE-03).
 */
export const MIGRATION_REGISTRY: readonly MigrationEntry[] = [];
