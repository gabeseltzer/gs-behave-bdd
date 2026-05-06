---
phase: 09-subdirectory-config-scan
plan: 03
status: complete
---

## Summary

Wired the BFS config scanner into the extension activation flow, integrated scan cache into `hasFeaturesFolder`, implemented multi-config notification UX with 3 action buttons, and upgraded configWatcher to a two-tier strategy (narrow + recursive).

## Key Files

### Created
(none)

### Modified
- `src/common.ts` — Added scan-cache check in `hasFeaturesFolder` between convention fallback and final `return false`. Imports `getCachedScanResult`. Preserves INT-03 priority chain (manual > root config > root convention > subdir scan).
- `src/extension.ts` — Added scanner imports, async IIFE for subdirectory scanning of undiscovered workspaces, scan cache clearing in `configurationChangedHandler`, multi-config notification in `updateDiscoveryUX` with Open Settings / Show Details / Don't Show Again buttons.
- `src/watchers/configWatcher.ts` — Two-tier watcher: Tier 1 narrow watcher at discovered config's parent dir, Tier 2 recursive `**/{CONFIG_GLOB}` watcher. Added `clearScanResultCache()` call before force-refresh.

## Decisions
- INT-03: Scan cache check placed AFTER all existing discovery branches — `projectPath` manual override always wins
- INT-04: Async IIFE calls `getUrisOfWkspFoldersWithFeatures(true)` and `config.reloadSettings()` directly, NOT `configurationChangedHandler` (integrationTestRun early-exit guard)
- D-08: "Don't Show Again" sets `suppressMultiConfigNotification=true` at WorkspaceFolder scope
- D-09: Full scan results always logged to output channel regardless of suppression
- Two-tier watchers: Tier 2 recursive watcher always active to catch new configs appearing anywhere

## Self-Check: PASSED
- `npx eslint src --ext ts` — exit 0
- `npm run test:unit` — 602 passing, 0 failing
