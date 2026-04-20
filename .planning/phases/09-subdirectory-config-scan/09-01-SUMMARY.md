---
phase: 09-subdirectory-config-scan
plan: 01
status: complete
---

## Summary

Declared 3 new VS Code settings (`discoveryDepth`, `discoveryStopOnFirstHit`, `suppressMultiConfigNotification`) in `package.json`, wired them into `WorkspaceSettings` with proper validation/clamping, extended `DiscoveryEntry` with `alsoFoundConfigs` field, and added `dist`, `out`, `build`, `coverage` to `DEFAULT_EXCLUDE_DIRS`.

## Key Files

### Created
(none)

### Modified
- `package.json` — 3 new settings in `contributes.configuration.properties`
- `src/settings.ts` — 3 new readonly fields + constructor reads + clamping
- `src/common.ts` — `DiscoveryEntry.alsoFoundConfigs` field + 4 new entries in `DEFAULT_EXCLUDE_DIRS`
- `test/unit/vscode.mock.ts` — defaults for new settings
- `test/unit/settings/multiPathPrecedence.test.ts` — BASE_CFG updated
- `test/unit/settings/verboseLogging.test.ts` — mock settings updated
- `test/unit/findFiles.test.ts` — DEFAULT_EXCLUDE_DIRS count updated 9→13

## Decisions
- `discoveryDepth` clamped to 0–10 via `Math.max(0, Math.min(10, ...))` per T-09-01
- 4 build-output dirs added to exclude set: `dist`, `out`, `build`, `coverage`

## Self-Check: PASSED
- `npx eslint src --ext ts` — exit 0
- `npm run test:unit` — 586 passing, 0 failing
