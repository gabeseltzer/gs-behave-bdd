import type { MigrationEntry } from './types';
import { plainEntries } from './plain';
import { featuresPathEntries } from './featuresPath';

/**
 * Phase 20 D-A4.4: aggregated registry. Final count is 17 entries:
 *   - 11 plain-copy entries from `./plain` (Plan 02)
 *   - 2 featuresPath entries from `./featuresPath` (Plan 03)
 *   - 1 suppressMultiConfig entry from `./suppressedNotifications` (Plan 04)
 *   - 2 envPresets entries from `./envPresets` (Plan 04)
 */
export const MIGRATION_REGISTRY: readonly MigrationEntry[] = [
  ...plainEntries,
  ...featuresPathEntries,
  // suppressMultiConfig entry — added by Plan 04
  // envPresets entries — added by Plan 04
];
