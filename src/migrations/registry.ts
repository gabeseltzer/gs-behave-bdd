import type { MigrationEntry } from './types';
import { plainEntries } from './plain';
import { featuresPathEntries } from './featuresPath';
import { suppressedNotificationsEntries } from './suppressedNotifications';
import { envPresetEntries } from './envPresets';
import { loggingEntries } from './logging';

/**
 * Phase 20 D-A4.4: aggregated registry. 19 total entries.
 *   - 11 plain-copy entries from `./plain` (Plan 02)
 *   - 2 featuresPath entries from `./featuresPath` (Plan 03)
 *   - 2 suppressedNotifications entries from `./suppressedNotifications` (Plan 04)
 *   - 2 envPresets entries from `./envPresets` (Plan 04)
 *   - 2 logging entries from `./logging` (260730-vlg)
 *
 * ORDER MATTERS. evaluateAllMigrations iterates this array sequentially, and the two
 * `loggingEntries` depend on running in their declared order relative to each other (see the
 * comment on `loggingEntries`). They are placed LAST so that the cross-namespace plain entries
 * — including `behave-vsc.xRay` and `behave-vsc.verboseLogging` — have already landed in the
 * gs-behave-bdd namespace and are then migrated onward by the same rules as native values.
 */
export const MIGRATION_REGISTRY: readonly MigrationEntry[] = [
  ...plainEntries,
  ...featuresPathEntries,
  ...suppressedNotificationsEntries,
  ...envPresetEntries,
  ...loggingEntries,
];
