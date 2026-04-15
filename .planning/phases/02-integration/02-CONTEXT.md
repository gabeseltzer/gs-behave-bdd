# Phase 2: Integration - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the Phase 1 config parsers into WorkspaceSettings and the gatekeeper so the extension activates on behave projects with no settings.json. This phase delivers: discovery priority logic (settings > config > convention), cache layer, activation event expansion, and WorkspaceSettings enrichment with `discoverySource` and `configFileUri`. No user-facing UX changes (that's Phase 3).

</domain>

<decisions>
## Implementation Decisions

### Settings Override Scope
- **D-01:** "Explicit settings" means any of `globalValue`, `workspaceValue`, or `workspaceFolderValue` is set for `projectPath` or `featuresPath` — checked via `inspect()` at all three scopes. This aligns with the existing `getWithLegacyFallback()` pattern in `settings.ts` and satisfies INTG-02.
- **D-02:** When explicit settings are detected at any scope, config-file discovery is bypassed entirely. The existing settings path runs unchanged (INTG-07 backward compat).

### Activation Triggers
- **D-03:** Add `workspaceContains:**/behave.ini` and `workspaceContains:**/.behaverc` to `activationEvents` in `package.json`. The extension activates on config files even without `.feature` files present — this is the core zero-config value for non-standard feature layouts.
- **D-04:** The gatekeeper's error message (when no features are found) should be updated to mention config file discovery as an option alongside `featuresPath` settings.

### Error Capture for Phase 3
- **D-05:** Expand the `findBehaveConfig()` return type to include an error variant alongside the success result. When a config file exists but is malformed, the parser returns error details (`configFileUri` + `errorMessage`) instead of `undefined`. Phase 3 reads these from the discovery cache to show UX-02 warning notifications.
- **D-06:** Malformed config files fall through to `features/` convention discovery (not blocking). The error is captured AND the extension continues to try convention-based discovery. Matches UX-03 requirement.

### Claude's Discretion
- Specific TypeScript shape of the error variant (discriminated union, wrapper, etc.) — pick the most idiomatic pattern
- Cache data structure (Map key, what's stored beyond discovery result)
- Internal function decomposition for the discovery orchestration logic
- Whether to modify `getActualWorkspaceSetting()` or create a new `hasExplicitSetting()` function

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Behave Config Behavior
- `bundled/libs/behave/configuration.py` — Behave's own config parsing: `config_filenames()`, priority order, path resolution

### Extension Architecture (Integration Points)
- `src/common.ts` lines 126-224 — `getUrisOfWkspFoldersWithFeatures()` gatekeeper: must be modified to call config discovery when no explicit settings and no `features/` folder
- `src/common.ts` lines 116-123 — `getActualWorkspaceSetting()`: currently only checks `workspaceFolderValue`, needs expansion to all 3 scopes per D-01
- `src/settings.ts` lines 57-175 — `WorkspaceSettings` class: gains `discoverySource` and `configFileUri` properties per INTG-06
- `src/settings.ts` lines 12-26 — `getWithLegacyFallback()`: reference pattern for 3-scope inspect
- `src/extension.ts` lines 59-79 — `activate()`: calls gatekeeper then sets up watchers per workspace
- `src/extension.ts` lines 488-546 — `configurationChangedHandler`: calls `getUrisOfWkspFoldersWithFeatures(true)` to force refresh, then `reloadSettings()` — cache invalidation point per INTG-04

### Phase 1 Parser (Input)
- `src/parsers/configParser.ts` — `findBehaveConfig()` entry point, `BehaveConfigResult` interface, must be extended with error variant per D-05

### Extension Manifest
- `package.json` line 273-274 — `activationEvents`: must add `workspaceContains:**/behave.ini` and `workspaceContains:**/.behaverc` per D-03

### Requirements
- `.planning/REQUIREMENTS.md` — INTG-01 through INTG-07

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getWithLegacyFallback()` in `settings.ts` — Already implements 3-scope inspect; reference pattern for D-01
- `getActualWorkspaceSetting()` in `common.ts` — Used by gatekeeper; needs expansion or replacement
- `findBehaveConfig()` in `configParser.ts` — Phase 1 parser, ready to be called from gatekeeper
- Module-level `workspaceFoldersWithFeatures` array in `common.ts` — Existing cache pattern, needs enrichment to store discovery metadata

### Established Patterns
- Module-level Maps for caching (e.g., `featureFileSteps` in featureParser.ts)
- `fs.existsSync()` for synchronous file checks in performance-critical paths
- `inspect()` for distinguishing explicit settings from defaults
- `vscode.Uri.joinPath()` for path construction

### Integration Points
- Gatekeeper `hasFeaturesFolder()` inner function: currently checks settings then `features/` folder — config discovery inserts between these
- `configurationChangedHandler` calls `getUrisOfWkspFoldersWithFeatures(true)` with `forceRefresh` — this already invalidates the gatekeeper cache on settings changes (INTG-04 partially satisfied)
- `WorkspaceSettings` constructor: receives `wkspUri` and `wkspConfig` — can receive discovery results as additional parameter or compute them internally

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-integration*
*Context gathered: 2026-04-15*
