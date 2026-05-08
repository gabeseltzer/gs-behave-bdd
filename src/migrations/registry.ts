import type { MigrationEntry } from './types';
import { plainEntries } from './plain';
import { featuresPathEntries } from './featuresPath';
import { suppressedNotificationsEntries } from './suppressedNotifications';
import { envPresetEntries } from './envPresets';

/**
 * Phase 20 D-A4.4: aggregated registry. 17 total entries (see 020-04 plan reconciliation).
 *   - 11 plain-copy entries from `./plain` (Plan 02)
 *   - 2 featuresPath entries from `./featuresPath` (Plan 03)
 *   - 2 suppressedNotifications entries from `./suppressedNotifications` (Plan 04)
 *   - 2 envPresets entries from `./envPresets` (Plan 04)
 */
export const MIGRATION_REGISTRY: readonly MigrationEntry[] = [
  ...plainEntries,
  ...featuresPathEntries,
  ...suppressedNotificationsEntries,
  ...envPresetEntries,
];
