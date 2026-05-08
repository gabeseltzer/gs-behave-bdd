import type { MigrationEntry } from './types';
import { plainEntries } from './plain';

/**
 * Phase 20 D-A4.4: aggregated registry. Final count is 17 entries:
 *   - 11 plain-copy entries from `./plain` (this commit)
 *   - 2 featuresPath entries from `./featuresPath` (Plan 03)
 *   - 1 suppressMultiConfig entry from `./suppressedNotifications` (Plan 04)
 *   - 2 envPresets entries from `./envPresets` (Plan 04)
 */
export const MIGRATION_REGISTRY: readonly MigrationEntry[] = [
  ...plainEntries,
  // featuresPath entries — added by Plan 03
  // suppressMultiConfig entry — added by Plan 04
  // envPresets entries — added by Plan 04
];
