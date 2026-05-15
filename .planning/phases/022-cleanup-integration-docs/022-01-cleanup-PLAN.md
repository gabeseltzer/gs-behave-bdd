---
phase: 022-cleanup-integration-docs
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/settings.ts
  - src/configuration.ts
  - src/common.ts
  - src/discovery/projectList.ts
  - test/unit/settings/legacyFallback.test.ts
  - test/unit/settings/verboseLogging.test.ts
  - test/unit/settings/projectUriDerivation.test.ts
autonomous: true
requirements:
  - CLEANUP-01

must_haves:
  truths:
    - "src/configuration.ts no longer constructs vscode.workspace.getConfiguration(\"behave-vsc\", ...) at runtime"
    - "src/common.ts hasFeaturesFolder() reads only the gs-behave-bdd namespace"
    - "src/discovery/projectList.ts isManualProjectPathMode() reads only the gs-behave-bdd namespace"
    - "getWithLegacyFallback<T>() is deleted from src/settings.ts"
    - "WindowSettings and WorkspaceSettings constructors no longer accept the optional legacyConfig parameter"
    - "All callers of WindowSettings / WorkspaceSettings pass the trimmed argument list"
    - "Helpers hasExplicitSetting() and getActualWorkspaceSetting() in src/common.ts no longer accept the legacyConfig parameter"
    - "`npx tsc --noEmit` succeeds with no errors"
    - "`npx eslint src --ext ts` exits 0 with no output"
    - "`npm run test:unit` reports 849+ passing tests"
  artifacts:
    - path: "src/settings.ts"
      provides: "WindowSettings + WorkspaceSettings without legacy ladder"
      contains: "constructor(winConfig: vscode.WorkspaceConfiguration)"
    - path: "src/configuration.ts"
      provides: "reloadSettings() canonical-only"
      contains: "getConfiguration(\"gs-behave-bdd\""
  key_links:
    - from: "src/configuration.ts"
      to: "src/settings.ts"
      via: "new WindowSettings(cfg) / new WorkspaceSettings(uri, cfg, win, logger)"
      pattern: "new (Window|Workspace)Settings\\("
---

<objective>
Strip every silent `behave-vsc.*` namespace read from the runtime path so that, after v1.5.0 ships, the extension reads only canonical `gs-behave-bdd.*` keys. Per D-C1 the cleanup goes all the way to the source: delete the `getWithLegacyFallback<T>()` helper, drop the optional `legacyConfig?` constructor parameter from `WindowSettings` / `WorkspaceSettings`, simplify the inner `get<T>(key)` lambdas, and trim every call site (production + tests) that was passing 5 arguments. Also drop the `legacyConfig?` parameter from `hasExplicitSetting()` and `getActualWorkspaceSetting()` in `src/common.ts` — those are the two helpers that read legacy `behave-vsc.*` at lines 150 and 167 — and trim their two call sites (`src/common.ts:222,225` and `src/discovery/projectList.ts:180`).

Purpose: leaving the helper and parameters as dead code (per Phase 19 CLEANUP-02 precedent) creates almost-equivalent follow-up churn. One atomic cleanup leaves a clean v1.5.0 state.

Output:
- `src/settings.ts` — `getWithLegacyFallback<T>()` deleted; `WindowSettings` / `WorkspaceSettings` constructors take canonical config only; inner lambdas simplified.
- `src/configuration.ts` — `legacyWinConfig` / `legacyWkspConfig` locals removed; `getConfiguration("behave-vsc", …)` call sites at lines 68-69, 81, 92 removed.
- `src/common.ts` — `hasFeaturesFolder()` (`line 214`) no longer reads `behave-vsc`; helpers `hasExplicitSetting()` and `getActualWorkspaceSetting()` drop their `legacyConfig?` param and the `if (legacyConfig)` branches.
- `src/discovery/projectList.ts` — `isManualProjectPathMode()` (line 179) no longer reads `behave-vsc`.
- Test fixtures `test/unit/settings/legacyFallback.test.ts`, `test/unit/settings/verboseLogging.test.ts`, and `test/unit/settings/projectUriDerivation.test.ts` — trimmed to match the new constructor signatures; tests that asserted legacy-fallback semantics are either deleted or rewritten to assert the canonical-only behavior.

Invariants preserved:
- The Phase 20 registry still owns cross-extension migration via `migrateScopedSetting`; the migration code paths in `src/migrations/*.ts` are NOT touched.
- The activation-time `migrateLegacyFeaturesPath` / `migrateLegacySuppressMultiConfig` wrapper shims in `src/notifications.ts:257,275` are NOT touched (deferred per CONTEXT.md scope boundary).
- The `behave-vsc.*` legacy command aliases in `src/extension.ts:430-433, 605, 708` are NOT touched (intentional keybinding preservation, unrelated to silent setting reads).
- The `'behave-vsc'` literal in `src/notifications.ts:292` is NOT touched (that's the migration source-namespace list, owned by the registry).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/022-cleanup-integration-docs/022-CONTEXT.md
@.planning/phases/021-consent-ux-case-2-case-3-prompts/021-CONTEXT.md
@CLAUDE.md
@AI_INSTRUCTIONS.md
@src/settings.ts
@src/configuration.ts
@src/common.ts
@src/discovery/projectList.ts

<interfaces>
<!-- Current shape (BEFORE this plan), for reference. -->

src/settings.ts (current):
```typescript
function getWithLegacyFallback<T>(
  newConfig: vscode.WorkspaceConfiguration,
  legacyConfig: vscode.WorkspaceConfiguration,
  key: string
): T | undefined { /* lines 14-30 */ }

export class WindowSettings {
  constructor(winConfig: vscode.WorkspaceConfiguration, legacyConfig?: vscode.WorkspaceConfiguration) { /* L40 */
    const get = <T>(key: string): T | undefined =>
      legacyConfig ? getWithLegacyFallback<T>(winConfig, legacyConfig, key) : winConfig.get<T>(key);
    /* … */
  }
}

export class WorkspaceSettings {
  constructor(wkspUri: vscode.Uri, wkspConfig: vscode.WorkspaceConfiguration, winSettings: WindowSettings, logger: Logger, legacyConfig?: vscode.WorkspaceConfiguration, discoveryEntry?: DiscoveryEntry) { /* L106 */
    const get = <T>(key: string): T | undefined =>
      legacyConfig ? getWithLegacyFallback<T>(wkspConfig, legacyConfig, key) : wkspConfig.get<T>(key);
    /* …
       L175 also reads legacyConfig:
       } else if (!hasExplicitSetting(wkspConfig, "projectPath", legacyConfig) … */
  }
}
```

src/common.ts (current):
```typescript
export const getActualWorkspaceSetting = <T>(wkspConfig: vscode.WorkspaceConfiguration, name: string, legacyConfig?: vscode.WorkspaceConfiguration): T => {
  const value = wkspConfig.inspect(name)?.workspaceFolderValue;
  if (value !== undefined) return value as T;
  if (legacyConfig) return legacyConfig.inspect(name)?.workspaceFolderValue as T;  // L150
  return undefined as unknown as T;
}

export function hasExplicitSetting(
  wkspConfig: vscode.WorkspaceConfiguration,
  name: string,
  legacyConfig?: vscode.WorkspaceConfiguration  // L161
): boolean {
  const insp = wkspConfig.inspect(name);
  if (insp && (insp.globalValue !== undefined || insp.workspaceValue !== undefined || insp.workspaceFolderValue !== undefined))
    return true;
  if (legacyConfig) {                                       // L166
    const legacyInsp = legacyConfig.inspect(name);          // L167
    if (legacyInsp?.workspaceFolderValue !== undefined) return true;
  }
  return false;
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove behave-vsc silent reads from src/common.ts + src/discovery/projectList.ts</name>
  <files>src/common.ts, src/discovery/projectList.ts</files>
  <read_first>
    - src/common.ts (lines 140-230 for full helper bodies + hasFeaturesFolder)
    - src/discovery/projectList.ts (lines 170-200 for isManualProjectPathMode)
    - .planning/phases/022-cleanup-integration-docs/022-CONTEXT.md (D-C1 for the exhaustive cleanup contract)
  </read_first>
  <action>
    In `src/common.ts`:
    1. Change the signature of `getActualWorkspaceSetting` (~L147) from `(wkspConfig, name, legacyConfig?)` to `(wkspConfig, name)`. Delete the body line `if (legacyConfig) return legacyConfig.inspect(name)?.workspaceFolderValue as T;` (~L150). Final body returns `undefined as unknown as T` when the canonical lookup yields undefined.
    2. Change the signature of `hasExplicitSetting` (~L158) from `(wkspConfig, name, legacyConfig?)` to `(wkspConfig, name)`. Delete the entire `if (legacyConfig) { … }` block (~L166-169).
    3. In `hasFeaturesFolder()` (~L211 down): delete `const legacyWkspConfig = vscode.workspace.getConfiguration("behave-vsc", folder.uri);` (~L214). Update the call at ~L222 from `hasExplicitSetting(wkspConfig, "projectPath", legacyWkspConfig)` to `hasExplicitSetting(wkspConfig, "projectPath")`. Update the call at ~L225 from `getActualWorkspaceSetting<string>(wkspConfig, "projectPath", legacyWkspConfig)` to `getActualWorkspaceSetting<string>(wkspConfig, "projectPath")`.

    In `src/discovery/projectList.ts`:
    1. In `isManualProjectPathMode()` (~L177-181): delete `const legacyConfig = vscode.workspace.getConfiguration("behave-vsc", wkspUri);` (~L179). Update the return from `hasExplicitSetting(wkspConfig, "projectPath", legacyConfig)` to `hasExplicitSetting(wkspConfig, "projectPath")`.

    Run `grep -rn 'getConfiguration("behave-vsc"' src/common.ts src/discovery/projectList.ts` — must return zero matches when done.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n 'getConfiguration("behave-vsc"' src/common.ts` returns no matches.
    - `grep -n 'getConfiguration("behave-vsc"' src/discovery/projectList.ts` returns no matches.
    - `grep -n "legacyConfig" src/common.ts` returns no matches.
    - `grep -n "legacyWkspConfig" src/common.ts` returns no matches.
    - `grep -n "legacyConfig" src/discovery/projectList.ts` returns no matches.
    - `npx tsc --noEmit` exits 0.
  </acceptance_criteria>
  <done>
    `src/common.ts` and `src/discovery/projectList.ts` are free of the legacy namespace; the two helpers in common.ts have single-arg signatures; tsc clean.
  </done>
</task>

<task type="auto">
  <name>Task 2: Delete getWithLegacyFallback and drop legacyConfig from WindowSettings / WorkspaceSettings; trim configuration.ts call sites</name>
  <files>src/settings.ts, src/configuration.ts</files>
  <read_first>
    - src/settings.ts (full file — 380 lines)
    - src/configuration.ts (lines 1-120 for reloadSettings + globalSettings + workspaceSettings getter)
    - .planning/phases/022-cleanup-integration-docs/022-CONTEXT.md (D-C1)
  </read_first>
  <action>
    In `src/settings.ts`:
    1. Delete the entire `getWithLegacyFallback<T>()` function and its leading comment (~L14-30).
    2. `WindowSettings` constructor (~L40): change signature from `(winConfig: vscode.WorkspaceConfiguration, legacyConfig?: vscode.WorkspaceConfiguration)` to `(winConfig: vscode.WorkspaceConfiguration)`. Replace the inner lambda (~L41-42) with:
       ```typescript
       const get = <T>(key: string): T | undefined => winConfig.get<T>(key);
       ```
    3. `WorkspaceSettings` constructor (~L106): change signature from `(wkspUri, wkspConfig, winSettings, logger, legacyConfig?, discoveryEntry?)` to `(wkspUri, wkspConfig, winSettings, logger, discoveryEntry?)`. Replace the inner lambda (~L107-108) with:
       ```typescript
       const get = <T>(key: string): T | undefined => wkspConfig.get<T>(key);
       ```
    4. At ~L175 (the `else if` after the projectPath fatal check), update `!hasExplicitSetting(wkspConfig, "projectPath", legacyConfig)` to `!hasExplicitSetting(wkspConfig, "projectPath")`.

    In `src/configuration.ts`:
    1. In `reloadSettings()` (~L58-74) `else` branch: delete the two locals (~L68-69):
       ```typescript
       const legacyWinConfig = vscode.workspace.getConfiguration("behave-vsc");
       const legacyWkspConfig = vscode.workspace.getConfiguration("behave-vsc", wkspUri);
       ```
       Trim the `WindowSettings` call (~L70) from `new WindowSettings(vscode.workspace.getConfiguration("gs-behave-bdd"), legacyWinConfig)` to `new WindowSettings(vscode.workspace.getConfiguration("gs-behave-bdd"))`.
       Trim the `WorkspaceSettings` call (~L71-72) from `new WorkspaceSettings(wkspUri, vscode.workspace.getConfiguration("gs-behave-bdd", wkspUri), this._windowSettings, this.logger, legacyWkspConfig)` to `new WorkspaceSettings(wkspUri, vscode.workspace.getConfiguration("gs-behave-bdd", wkspUri), this._windowSettings, this.logger)`.
    2. In the `globalSettings` getter (~L76-83): delete the second `getConfiguration("behave-vsc")` argument at ~L81. Final:
       ```typescript
       : this._windowSettings = new WindowSettings(
           vscode.workspace.getConfiguration("gs-behave-bdd")
         );
       ```
    3. In the `workspaceSettings` getter (~L85-115): trim the `WorkspaceSettings` construction call (~L90-92) — drop the trailing `vscode.workspace.getConfiguration("behave-vsc", wkspUri)` argument. Final form passes only 4 positional args (`wkspUri`, canonical config, `winSettings`, `this.logger`).
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "getWithLegacyFallback" src/settings.ts` returns no matches.
    - `grep -n "legacyConfig" src/settings.ts` returns no matches.
    - `grep -n 'getConfiguration("behave-vsc"' src/configuration.ts` returns no matches.
    - `grep -n "legacyWinConfig\|legacyWkspConfig" src/configuration.ts` returns no matches.
    - `npx tsc --noEmit` exits 0 (test compilation excluded — Task 3 handles the unit-test fixtures).
  </acceptance_criteria>
  <done>
    `getWithLegacyFallback` is gone; both constructors are slimmer; configuration.ts builds canonical-only settings. tsc on `src/` is clean.
  </done>
</task>

<task type="auto">
  <name>Task 3: Trim 6-arg / 5-arg call sites in unit tests; delete obsolete legacy-fallback assertions; lint + full unit suite green</name>
  <files>test/unit/settings/legacyFallback.test.ts, test/unit/settings/verboseLogging.test.ts, test/unit/settings/projectUriDerivation.test.ts</files>
  <read_first>
    - test/unit/settings/legacyFallback.test.ts (full file — tests that are now obsolete by D-C1 cleanup)
    - test/unit/settings/verboseLogging.test.ts (lines 30-130 — tests that pass `legacyCfg` to `WindowSettings`)
    - test/unit/settings/projectUriDerivation.test.ts (full file — 4 call sites at lines 96, 120, 144, 163 use the 6-arg `WorkspaceSettings` form with `undefined` in the legacyConfig slot)
    - test/unit/settings/logSettingsPlural.test.ts (line 86 — verify it uses the 1-arg `WindowSettings` form; if so, NO change needed. Pre-confirmed by planner: line 86 reads `new WindowSettings(makeConfig({ ...WIN_DEFAULTS, verboseLogging }))` — single-arg, NOT affected.)
    - CLAUDE.md (mandates `npx eslint src --ext ts` and `npm run test:unit` after src changes)
  </read_first>
  <action>
    1. `npx tsc --noEmit -p test/unit/tsconfig.json` (or equivalent test compile) will fail because `WindowSettings`/`WorkspaceSettings` constructors no longer accept the legacy arg. Use the error list as the authoritative inventory of call sites to fix.

    2. `test/unit/settings/legacyFallback.test.ts`:
       This file's entire purpose was pinning the `getWithLegacyFallback` ladder semantics — which no longer exist. Either:
       - **Preferred:** delete the file entirely (it tests deleted production code).
       - Or, if any test in it incidentally pinned canonical-only behavior, keep that test and rewrite the rest. Run `grep -c "legacyConfig\|legacyCfg" test/unit/settings/legacyFallback.test.ts` first; if every test references the legacy arg, delete the file outright.

       Take the delete path unless a test demonstrably exercises canonical-only fallback default.

    3. `test/unit/settings/verboseLogging.test.ts`:
       - Lines 51, 58: `new WindowSettings(newCfg, legacyCfg)` — drop the second arg, becomes `new WindowSettings(newCfg)`. The tests' intent (asserting that legacy-only values come through) is now moot — rewrite them to assert that when only the canonical `verboseLogging` is set, `WindowSettings` reads it correctly. If a test was specifically pinning legacy-fallback behavior, delete that single test.
       - Lines 117-…: `new WindowSettings(…)` two-arg form — drop the second arg.

    4. `test/unit/settings/projectUriDerivation.test.ts`:
       This file has 4 call sites using the 6-arg `WorkspaceSettings` form, all passing literal `undefined` in the old `legacyConfig` slot. After Task 2's constructor change, `discoveryEntry` becomes the 5th positional arg. Rewrite each:
       - Line 96: `new WorkspaceSettings(MOCK_WKSP_URI, cfg, makeWinSettings(), mockLogger(), undefined, entry)` → `new WorkspaceSettings(MOCK_WKSP_URI, cfg, makeWinSettings(), mockLogger(), entry)`
       - Line 120: `new WorkspaceSettings(MOCK_WKSP_URI, cfg, makeWinSettings(), mockLogger(), undefined, entry)` → `new WorkspaceSettings(MOCK_WKSP_URI, cfg, makeWinSettings(), mockLogger(), entry)`
       - Line 144: `new WorkspaceSettings(MOCK_WKSP_URI, cfg, makeWinSettings(), mockLogger(), undefined, entry)` → `new WorkspaceSettings(MOCK_WKSP_URI, cfg, makeWinSettings(), mockLogger(), entry)`
       - Line 163: `new WorkspaceSettings(MOCK_WKSP_URI, cfg, makeWinSettings(), mockLogger(), undefined, entry)` → `new WorkspaceSettings(MOCK_WKSP_URI, cfg, makeWinSettings(), mockLogger(), entry)`

       Note on `logSettingsPlural.test.ts`: line 86 already uses the 1-arg `WindowSettings(makeConfig(...))` form (confirmed at plan-revision time). No edit needed there.

    5. Search for any other `new (Window|Workspace)Settings\(` call that passes more args than the new signature accepts:
       ```bash
       grep -rn "new WindowSettings(\|new WorkspaceSettings(" test/ src/
       ```
       Trim each. The expected stable matches are:
       - `src/configuration.ts` (4 sites — already fixed in Task 2)
       - `test/unit/settings/projectUriDerivation.test.ts` (4 sites — fixed in step 4 above)
       - `test/unit/settings/multiPathPrecedence.test.ts` — 4-arg form already matches.
       - `test/unit/settings/logSettingsPlural.test.ts` — already 1-arg form; no change.

    6. After all fixes:
       - `npx tsc --noEmit` over the test tsconfig must be clean.
       - `npx eslint src --ext ts` must be clean.
       - `npm run test:unit` must pass with at least 800 tests (down from the Phase 21 baseline of 849 to allow for deleted legacyFallback tests). Record the new count in the SUMMARY.
  </action>
  <verify>
    <automated>npx eslint src --ext ts && npm run test:unit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -rn "legacyCfg\|legacyConfig" test/unit/settings/` returns no matches (or only matches in deleted-file's git history — verify by `git status` showing the file deleted, not modified).
    - `grep -rn "new WorkspaceSettings([^)]*,\s*legacy" test/` returns no matches.
    - `grep -rn "new WorkspaceSettings(.*undefined.*entry" test/unit/settings/projectUriDerivation.test.ts` returns no matches (the 6-arg form with `undefined` in slot 5 is gone).
    - `grep -c "new WorkspaceSettings(MOCK_WKSP_URI, cfg, makeWinSettings(), mockLogger(), entry)" test/unit/settings/projectUriDerivation.test.ts` returns 4 (the new 5-arg form).
    - `npx tsc --noEmit` over the project tsconfig exits 0.
    - `npx eslint src --ext ts` exits 0 with no output.
    - `npm run test:unit` exits 0; final line reports passing count of at least 800 (allow for deleted legacyFallback tests; record the actual count in the SUMMARY).
    - `grep -rn 'getConfiguration("behave-vsc"' src/` returns matches ONLY in `src/extension.ts` (legacy command aliases — preserved intentionally) AND `src/notifications.ts:292` (migration source-namespace list — preserved). Zero matches in `src/configuration.ts`, `src/common.ts`, `src/settings.ts`, `src/discovery/`.
  </acceptance_criteria>
  <done>
    The whole project compiles, lints clean, and the full unit suite is green. The only `behave-vsc` references left in `src/` are the migration registry's source-namespace literal and the legacy command aliases — both intentional.
  </done>
</task>

</tasks>

<verification>
End of phase cleanup invariants:
- `grep -rn "getWithLegacyFallback" src/` → 0
- `grep -rn "legacyConfig" src/` → 0 (the parameter name is gone everywhere)
- `grep -rn 'getConfiguration("behave-vsc"' src/` → matches only in `src/extension.ts` (command aliases) and `src/notifications.ts:292` (migration source-ns list)
- `npx eslint src --ext ts` exits 0
- `npm run test:unit` reports ≥ 800 passing tests
</verification>

<success_criteria>
1. The four read sites named in CLEANUP-01 (configuration.ts:68-72/81/92, common.ts:214, projectList.ts:179) are gone.
2. `getWithLegacyFallback<T>()` is deleted.
3. `WindowSettings` / `WorkspaceSettings` constructors and `hasExplicitSetting` / `getActualWorkspaceSetting` helpers no longer accept a legacy config parameter.
4. Project compiles, lints, and the unit suite is green.
</success_criteria>

<output>
After completion, create `.planning/phases/022-cleanup-integration-docs/022-01-cleanup-SUMMARY.md` covering:
- Files touched and deletion counts (lines removed)
- Final `npm run test:unit` count vs the 849 baseline (note any obsolete tests deleted)
- Any call sites discovered via `tsc --noEmit` beyond the four listed in D-C1
</output>
