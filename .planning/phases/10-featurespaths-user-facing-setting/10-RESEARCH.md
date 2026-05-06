# Phase 10: `featuresPaths` User-Facing Settings Key - Research

**Researched:** 2026-04-21
**Domain:** VS Code Extension Configuration API (package.json `contributes.configuration` + `WorkspaceConfiguration.inspect()`)
**Confidence:** HIGH

## Summary

Phase 10 is a small, well-scoped phase that flips two switches deferred from Phase 7: (1) declare `gs-behave-bdd.featuresPaths` in `package.json`'s `contributes.configuration`, and (2) extend `hasExplicitSetting` in `common.ts` to recognize the new plural key. The internal plumbing — the precedence ladder, empty-array handling, `WorkspaceSettings` reading — is already implemented and tested from Phase 7 D-11.

The VS Code configuration API is well-documented and stable. Array-type settings with `"default": []` are fully supported in `package.json` schemas. The `inspect()` API returns per-scope values that distinguish "explicitly set to `[]`" from "not set at all" — which is critical for D-14's empty-array-is-unset semantics. The main pitfall is that `get()` on an undeclared key returns `undefined`, while `get()` on a declared key with `"default": []` returns `[]` — Phase 7 already handles this correctly with the optional-read pattern.

**Primary recommendation:** Declare the setting in `package.json` following the exact same schema pattern as `featuresPath` (scope: resource, markdownDescription, default), add the `featuresPaths` check to the `hasExplicitSetting` call site, and add the info log in the precedence-ladder's plural branch in `settings.ts`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** `featuresPaths` uses **override-style framing** matching `projectPath` and `featuresPath`: "Override only: Leave blank to use auto-discovery..." tone.
- **D-02:** The `markdownDescription` includes a **short inline example**: `["features", "features-alt"]`.
- **D-03:** The description **explicitly states precedence**: "When both `featuresPath` and `featuresPaths` are set, this plural value takes precedence."
- **D-04:** The `default` value in `package.json` is **`[]` (empty array)**, which is treated as unset per Phase 7 D-11.
- **D-05:** The setting scope is **`resource`** (per-workspace-folder), matching `featuresPath` and all other per-workspace settings.
- **D-06:** The "singular is being ignored" info log fires when **both `featuresPath` and `featuresPaths` are explicitly set at ANY VS Code scope** (global, workspace, or workspace folder). The check uses `inspect()` on both keys — same pattern as `hasExplicitSetting`. It does NOT fire when the singular only has its package.json default value.
- **D-07:** The log uses **info level** (`config.logger.logInfo()`) — always visible in the output channel, not gated behind `xRay`.
- **D-08:** The log wording is **informational and explicit**: `"Both featuresPath and featuresPaths are set — using featuresPaths (plural). The singular featuresPath value is ignored."`
- **D-09:** The log fires **every time settings are loaded** (on every `WorkspaceSettings` construction), matching the pattern of other config warnings. No per-session dedup.
- **D-10:** The existing `featuresPath` `markdownDescription` is **updated to cross-reference the plural**: adds a sentence like "For multiple feature paths, use `featuresPaths` (plural) instead."
- **D-11:** **No deprecation** — both `featuresPath` and `featuresPaths` are first-class settings.
- **D-12:** VS Code sorts settings alphabetically in the UI; `featuresPaths` will naturally appear near `featuresPath`. No special ordering needed.
- **D-13:** `hasExplicitSetting` in `common.ts` is extended to also check `"featuresPaths"` via `inspect()`. If either `featuresPath` OR `featuresPaths` is explicitly set at any scope, Branch A (explicit settings) activates.
- **D-14:** The check uses the same 3-scope pattern (global, workspace, workspace folder) for `featuresPaths`. For the plural key, a non-empty array at any scope counts as "explicitly set"; an empty array `[]` does not.

### Claude's Discretion
- Exact wording of the `featuresPaths` `markdownDescription` (as long as it follows override-style, includes example, and mentions precedence).
- Exact wording of the `featuresPath` cross-reference addition.
- Whether the "both set" detection logic lives inline in the `WorkspaceSettings` constructor or as a small helper function.
- Whether unit tests for the "both set" log are added in Phase 10 or deferred to Phase 11 (TEST-13). Recommend Phase 10 for the unit tests since the logic is new.

### Deferred Ideas (OUT OF SCOPE)
- Deprecate `featuresPath` (singular) — future milestone.
- Deprecate other legacy settings — future milestone.
- Settings migration command — future milestone.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MP-03 | `featuresPaths` array setting added to `package.json`; plural wins over singular when both set; empty array treated as unset; info-level log emitted when both keys set; `hasExplicitSetting` recognizes both. | All five sub-criteria have verified implementation patterns below: package.json schema declaration, `inspect()` for explicit-set detection, `logInfo()` for the dual-set log, and empty-array guard via `inspect()` scope checks. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Setting declaration | Extension manifest (`package.json`) | — | VS Code reads `contributes.configuration` at install/activation to register settings |
| Setting value read | Extension runtime (`settings.ts`) | — | `WorkspaceConfiguration.get()` and `inspect()` in constructor |
| Explicit-set detection | Extension runtime (`common.ts`) | — | `hasExplicitSetting()` uses `inspect()` for scope-level checks |
| Info log on dual-set | Extension runtime (`settings.ts`) | — | `config.logger.logInfo()` in WorkspaceSettings constructor |
| Settings UI rendering | VS Code host | — | VS Code auto-generates UI from `package.json` schema; no extension code needed |

## Standard Stack

### Core

No new dependencies. Phase 10 uses only existing VS Code APIs already in the project.

| API | Version | Purpose | Why Standard |
|-----|---------|---------|--------------|
| `workspace.getConfiguration()` | VS Code ^1.82.0 | Read configuration values | Already used throughout `settings.ts` and `common.ts` |
| `WorkspaceConfiguration.inspect<T>()` | VS Code ^1.82.0 | Distinguish per-scope values from defaults | Already used in `hasExplicitSetting()` and `getWithLegacyFallback()` |
| `WorkspaceConfiguration.get<T>()` | VS Code ^1.82.0 | Get effective (merged) value | Already used for all settings reads |
| `package.json` `contributes.configuration` | VS Code Extension API | Declare settings schema | The only way to register extension settings |

### Supporting

None — no new libraries needed.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `inspect()` for empty-array detection | `get()` with deep equality check | `inspect()` is the correct API — `get()` can't distinguish "user set `[]`" from "default is `[]`" for undeclared keys, but for declared keys with `"default": []`, `get()` returns `[]` in both cases. `inspect()` shows `undefined` at each scope when unset. |

## Architecture Patterns

### System Architecture Diagram

```
settings.json / *.code-workspace
        │
        ▼
VS Code Configuration Host
        │  (reads package.json schema, merges scopes)
        ▼
┌──────────────────────────────────────────┐
│ getConfiguration("gs-behave-bdd", uri)   │
│                                          │
│   .get("featuresPaths") ─────────────────┼──► WorkspaceSettings constructor
│   .inspect("featuresPaths") ─────────────┼──► hasExplicitSetting()
│   .inspect("featuresPath")  ─────────────┼──► hasExplicitSetting()
│                                          │    + "both set" detection
└──────────────────────────────────────────┘
        │                         │
        ▼                         ▼
  Precedence ladder         Branch A gate
  (Phase 7 D-11)           (common.ts:188)
  plural > singular          projectPath OR
  > convention              featuresPath OR
                            featuresPaths
```

### Pattern 1: Array Setting Declaration in `package.json`

**What:** Declare an array-of-strings setting with `"type": "array"`, `"items": { "type": "string" }`, `"default": []`.

**When to use:** When users need to provide a list of string values.

**Example:**
```json
// Source: VS Code Extension API docs — contributes.configuration
"gs-behave-bdd.featuresPaths": {
    "scope": "resource",
    "type": "array",
    "items": {
        "type": "string"
    },
    "markdownDescription": "...",
    "default": []
}
```

**Key behavior:**
- `get<string[]>("featuresPaths")` returns `[]` when no user value is set (the default) [VERIFIED: VS Code API docs — `get()` returns `defaultValue` from package.json]
- `inspect("featuresPaths").workspaceFolderValue` returns `undefined` when not explicitly set at workspace folder scope [VERIFIED: VS Code API docs — `inspect()` returns per-scope breakdown]
- `inspect("featuresPaths").workspaceFolderValue` returns `[]` when user explicitly writes `"featuresPaths": []` [VERIFIED: VS Code API docs — explicit empty array IS a user value]
- VS Code Settings UI renders array settings as an "Add Item" list widget automatically [VERIFIED: VS Code Settings Editor behavior]

### Pattern 2: `inspect()` for Explicit-Set Detection

**What:** Use `inspect<T>(key)` to check whether a setting has been set by the user at any scope, as opposed to having only its package.json default value.

**When to use:** When the extension needs to know "did the user touch this setting?" vs "is this just the default?".

**Example (existing code, from `common.ts`):**
```typescript
// Source: Codebase — common.ts:148-159
export function hasExplicitSetting(
  wkspConfig: vscode.WorkspaceConfiguration,
  name: string,
  legacyConfig?: vscode.WorkspaceConfiguration
): boolean {
  const insp = wkspConfig.inspect(name);
  if (insp && (insp.globalValue !== undefined ||
               insp.workspaceValue !== undefined ||
               insp.workspaceFolderValue !== undefined))
    return true;
  if (legacyConfig) {
    const legacyInsp = legacyConfig.inspect(name);
    if (legacyInsp?.workspaceFolderValue !== undefined) return true;
  }
  return false;
}
```

**Critical nuance for D-14:** For the plural `featuresPaths` key, the existing `hasExplicitSetting` function returns `true` when the user sets `"featuresPaths": []` because `inspect().workspaceFolderValue` is `[]` (not `undefined`). But D-14 says empty array should NOT count as explicit. This requires a **specialized check** for the plural key — not the generic `hasExplicitSetting`. The call site at `common.ts:188` needs to call `hasExplicitSetting` for the scalar keys (`projectPath`, `featuresPath`) but use a custom check for `featuresPaths` that additionally verifies the array is non-empty.

### Pattern 3: "Both Set" Detection for Info Log (D-06 through D-09)

**What:** Check whether both `featuresPath` and `featuresPaths` have been explicitly set (at any VS Code scope) and emit an info log when they have.

**Where it goes:** Inside the `WorkspaceSettings` constructor, at the point where the precedence ladder picks plural over singular (around line 182 in `settings.ts`).

**Example:**
```typescript
// Inside WorkspaceSettings constructor, after precedence ladder picks plural
if (featuresPathsCfg && Array.isArray(featuresPathsCfg) && featuresPathsCfg.length > 0) {
  // Rung 1: plural non-empty — check if singular is ALSO explicitly set for info log
  const singularIsExplicit = this.isExplicitlySet(wkspConfig, "featuresPath", legacyConfig);
  if (singularIsExplicit) {
    logger.logInfo(
      "Both featuresPath and featuresPaths are set — using featuresPaths (plural). " +
      "The singular featuresPath value is ignored.",
      wkspUri
    );
  }
  // ... rest of plural handling
}
```

**Design choice (Claude's discretion):** The "is singular explicitly set" check can be inline using `inspect()` directly (simple, clear) or extracted to a helper. Since the existing `hasExplicitSetting` function already does this exact check, recommend **reusing it inline** — no new helper needed:

```typescript
if (hasExplicitSetting(wkspConfig, "featuresPath", legacyConfig)) {
  logger.logInfo("Both featuresPath and featuresPaths are set — ...", wkspUri);
}
```

### Anti-Patterns to Avoid

- **Do NOT use `get()` to detect explicit-set status:** `get()` always returns the merged effective value including defaults. Only `inspect()` can distinguish "user set this" from "this is the default." [VERIFIED: VS Code API docs — `get()` returns merged value]
- **Do NOT throw when `featuresPaths` is `undefined`:** Unlike settings with a `package.json` default, `featuresPaths` returns `undefined` from `get()` only when there's no `package.json` declaration. Since Phase 10 adds the declaration with `"default": []`, after Phase 10 `get()` will return `[]` not `undefined`. But the Phase 7 code already handles both cases correctly. [VERIFIED: settings.ts:180 — uses optional-read pattern]
- **Do NOT use `getWithLegacyFallback` for `featuresPaths`:** There is no legacy (`behave-vsc`) equivalent of `featuresPaths`. The plural key is new to this extension. [VERIFIED: CONTEXT.md — no legacy namespace mention]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Setting registration | Custom UI for array input | `package.json` `contributes.configuration` with `"type": "array"` | VS Code auto-generates the Settings UI widget including "Add Item" button, validation, and JSON editing |
| Per-scope value detection | Manual JSON file parsing | `WorkspaceConfiguration.inspect<T>()` | Returns all scopes (global, workspace, workspaceFolder) in one call; handles all merge logic internally |
| Settings UI ordering | `"order"` property hacks | Natural alphabetical sort | `featuresPaths` naturally sorts right after `featuresPath`; VS Code sorts all properties alphabetically in Settings UI |
| Config change notification | Custom file watchers on settings.json | `workspace.onDidChangeConfiguration` | Already wired through `configurationChangedHandler`; fires automatically when any setting changes |

## Common Pitfalls

### Pitfall 1: Empty Array `[]` vs Unset for `hasExplicitSetting`

**What goes wrong:** `hasExplicitSetting` returns `true` when a user explicitly writes `"featuresPaths": []` in `settings.json` because `inspect().workspaceFolderValue` is `[]` (truthy object, not `undefined`). But D-14 says empty `[]` should NOT count as "explicitly set."

**Why it happens:** `inspect()` correctly reports `[]` as the user's value — it IS explicitly set in `settings.json`. The semantic difference is that for this extension, `[]` means "I don't want to override" but technically the user DID write it.

**How to avoid:** At the `hasExplicitSetting` call site in `common.ts:188`, the `featuresPaths` check must be:
```typescript
hasExplicitSettingNonEmptyArray(wkspConfig, "featuresPaths")
```
Where the helper checks all 3 scopes AND verifies the value is a non-empty array:
```typescript
function hasExplicitNonEmptyArraySetting(
  wkspConfig: vscode.WorkspaceConfiguration, name: string
): boolean {
  const insp = wkspConfig.inspect<string[]>(name);
  if (!insp) return false;
  return (Array.isArray(insp.globalValue) && insp.globalValue.length > 0) ||
         (Array.isArray(insp.workspaceValue) && insp.workspaceValue.length > 0) ||
         (Array.isArray(insp.workspaceFolderValue) && insp.workspaceFolderValue.length > 0);
}
```

**Warning signs:** Test case `"featuresPaths": []` activates Branch A when it should fall through to config-file discovery (Branch B).

### Pitfall 2: `get()` Return Value Changes After `package.json` Declaration

**What goes wrong:** Before Phase 10, `get<string[]>("featuresPaths")` returns `undefined` (no declaration in `package.json`). After Phase 10 adds the declaration with `"default": []`, `get()` returns `[]`.

**Why it happens:** VS Code uses the `package.json` `"default"` value as the fallback when no user value is set.

**How to avoid:** Phase 7's precedence ladder (settings.ts:180) already handles both `undefined` and empty arrays correctly — the check is `featuresPathsCfg && Array.isArray(featuresPathsCfg) && featuresPathsCfg.length > 0`. After Phase 10, the `undefined` path is dead code but the `[]` path (empty array = unset) is now the live path. No code change needed — just awareness.

**Warning signs:** None — this is informational. The code already works correctly.

### Pitfall 3: "Both Set" Log in `logSettings()` vs Constructor

**What goes wrong:** Putting the "both set" info log in `logSettings()` instead of the constructor means it fires AFTER the full settings object is built, not at the decision point.

**Why it happens:** `logSettings()` is the natural place for output — it already dumps all settings.

**How to avoid:** D-09 says the log fires on every `WorkspaceSettings` construction. Per CONTEXT.md specifics, the log should fire at the precedence-ladder decision point (around settings.ts:182), NOT in `logSettings()`. The constructor has access to the `logger` parameter and `wkspUri` for targeting.

**Warning signs:** The log appears after the settings dump instead of before/inline.

### Pitfall 4: `markdownDescription` Formatting

**What goes wrong:** Using raw backticks or code blocks in `markdownDescription` that render incorrectly in the VS Code Settings UI.

**Why it happens:** VS Code renders `markdownDescription` as Markdown in the Settings UI, but some constructs (like multi-line code blocks) don't render well in the narrow description area.

**How to avoid:** Follow the existing pattern from `featuresPath` — use inline code backticks for setting names and short path examples, keep descriptions concise (2-3 sentences max). Use `\\n` for line breaks if needed. [VERIFIED: existing package.json descriptions use this pattern]

**Warning signs:** Description renders as raw markdown in Settings UI.

### Pitfall 5: TestWorkspaceConfig `get()` Case for `featuresPaths`

**What goes wrong:** After Phase 10 declares `featuresPaths` in `package.json` with `"default": []`, the test harness `get()` for `"featuresPaths"` should return `[]` (not `undefined`) when no test value is passed. Currently it returns `undefined` because there was no package.json declaration.

**Why it happens:** `TestWorkspaceConfig.get()` mirrors VS Code's behavior: declared settings return their default, undeclared ones return `undefined`.

**How to avoid:** Update `testWorkspaceConfig.ts` `get()` case for `"featuresPaths"` to return `this.featuresPaths ?? []` instead of `this.featuresPaths`. This mirrors the real VS Code behavior where an array setting with `"default": []` returns `[]` when not set.

**Warning signs:** Tests that previously passed because `get("featuresPaths")` returned `undefined` may behave differently. Check the Phase 7 precedence ladder handling — the `undefined` vs `[]` distinction matters.

## Code Examples

### Example 1: `package.json` `featuresPaths` Declaration

```json
// Source: Codebase pattern (package.json existing settings) + VS Code docs
"gs-behave-bdd.featuresPaths": {
    "scope": "resource",
    "type": "array",
    "items": {
        "type": "string"
    },
    "markdownDescription": "*project-relative* paths to multiple features subfolders. **Override only:** Leave blank to use the paths from your behave config file, or `features/` if no config file is found. Example: `[\"features\", \"features-alt\"]`. When both `featuresPath` and `featuresPaths` are set, this plural value takes precedence.",
    "default": []
}
```

### Example 2: Updated `featuresPath` Description (D-10)

```json
// Source: Codebase — existing featuresPath description + D-10 cross-reference
"gs-behave-bdd.featuresPath": {
    "scope": "resource",
    "type": "string",
    "markdownDescription": "*project-relative* path to the features subfolder. **Override only:** Leave blank to use the path from your behave config file, or `features/` if no config file is found. Set this only if auto-discovery resolves the wrong features directory. This path is relative to `projectPath` (or workspace root if `projectPath` is not set). Example: `my_behave_tests`. For multiple feature paths, use `featuresPaths` (plural) instead.",
    "default": "features"
}
```

### Example 3: `hasExplicitSetting` Call Site Extension (D-13, D-14)

```typescript
// Source: Codebase — common.ts:188-189 (existing) + D-13/D-14 extension
// Before:
if (hasExplicitSetting(wkspConfig, "projectPath", legacyWkspConfig) ||
    hasExplicitSetting(wkspConfig, "featuresPath", legacyWkspConfig)) {

// After:
if (hasExplicitSetting(wkspConfig, "projectPath", legacyWkspConfig) ||
    hasExplicitSetting(wkspConfig, "featuresPath", legacyWkspConfig) ||
    hasExplicitNonEmptyArraySetting(wkspConfig, "featuresPaths")) {
```

### Example 4: "Both Set" Info Log (D-06 through D-09)

```typescript
// Source: Codebase — settings.ts:182 (precedence ladder) + D-06 through D-09
// Inside WorkspaceSettings constructor, in the plural branch:
if (featuresPathsCfg && Array.isArray(featuresPathsCfg) && featuresPathsCfg.length > 0) {
  // Rung 1: plural non-empty — emit info log if singular also explicitly set (D-06)
  if (hasExplicitSetting(wkspConfig, "featuresPath", legacyConfig)) {
    logger.logInfo(
      "Both featuresPath and featuresPaths are set — using featuresPaths (plural). " +
      "The singular featuresPath value is ignored.",
      wkspUri
    );
  }
  projectRelativeFeaturesPaths = featuresPathsCfg
    .map(p => p.replace(/^\\|^\//, "").replace(/\\$|\/$/, "").trim())
    .filter(p => p.length > 0);
  // ... rest unchanged
}
```

### Example 5: TestWorkspaceConfig `get()` Update

```typescript
// Source: Codebase — testWorkspaceConfig.ts get() switch
case "featuresPaths":
  return <T><unknown>(this.featuresPaths ?? []);  // was: this.featuresPaths
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No `featuresPaths` in package.json | Declared with `"type": "array"` | Phase 10 (now) | VS Code recognizes the key; `get()` returns `[]` not `undefined`; Settings UI shows the control |
| `hasExplicitSetting` checks 2 keys | Checks 3 keys (+ non-empty guard for array) | Phase 10 (now) | Branch A activates correctly for plural users |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `inspect()` returns `[]` (not `undefined`) for `workspaceFolderValue` when user explicitly writes `"featuresPaths": []` | Pitfall 1 | HIGH — empty-array-is-unset semantics would break. Mitigation: unit test covers this case explicitly. |
| A2 | VS Code Settings UI auto-renders `"type": "array"` with an "Add Item" widget | Architecture Patterns | LOW — if wrong, users can still edit JSON directly; no code impact. |

Both assumptions are based on VS Code's well-documented configuration system behavior. A1 is easily verified with a manual test or unit test.

## Open Questions

1. **Should `hasExplicitNonEmptyArraySetting` be a new standalone function or inline logic?**
   - What we know: The check is needed only at one call site (common.ts:188). It's conceptually similar to `hasExplicitSetting` but adds a non-empty guard.
   - What's unclear: Whether the function will be reused elsewhere in future phases.
   - Recommendation: Create it as a named function near `hasExplicitSetting` for readability and testability. It's 5 lines — the abstraction cost is negligible.

2. **Should the `featuresPaths` case in `TestWorkspaceConfig.get()` return `[]` now?**
   - What we know: Phase 7 made it return `undefined`. Phase 10 adds the `package.json` declaration with `"default": []`, so VS Code would return `[]`.
   - What's unclear: Whether changing this default breaks any Phase 7 tests.
   - Recommendation: Yes, update to `this.featuresPaths ?? []` to match production behavior. Verify Phase 7 tests still pass — the precedence ladder handles both `undefined` and `[]` correctly, so this should be safe.

## Project Constraints (from CLAUDE.md)

- **After every code change:** Run `npx eslint src --ext ts` — exit 0 with no output means clean.
- **After modifying files in `src/`:** Run `npm run test:unit` to catch regressions.
- **URI handling:** Use `uriId()` for comparisons, not raw string equality.
- **Error handling:** Handler functions catch errors; utility functions throw.
- **Naming:** camelCase for functions/variables, PascalCase for classes, `UPPER_SNAKE_CASE` for constants.
- **Imports:** Relative paths, no aliases. `import * as vscode from 'vscode'` for namespace imports.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Mocha 9.2.2 + Sinon 21.0.1 |
| Config file | `test/.mocharc.yml` (if exists) or inline in `package.json` |
| Quick run command | `npm run test:unit` |
| Full suite command | `npm run test:unit` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MP-03a | `featuresPaths` declared in package.json — VS Code returns `[]` default | unit | `npm run test:unit` | ❌ Wave 0 — verify `TestWorkspaceConfig.get("featuresPaths")` returns `[]` |
| MP-03b | Plural wins over singular when both set | unit | `npm run test:unit` | ✅ Phase 7 TEST-12 covers precedence matrix |
| MP-03c | Empty array treated as unset | unit | `npm run test:unit` | ✅ Phase 7 TEST-12 covers empty-array fallback |
| MP-03d | Info-level log emitted when both keys set | unit | `npm run test:unit` | ❌ Wave 0 — new behavior, needs test |
| MP-03e | `hasExplicitSetting` recognizes `featuresPaths` | unit | `npm run test:unit` | ❌ Wave 0 — verify Branch A activates for plural |

### Sampling Rate
- **Per task commit:** `npm run test:unit`
- **Per wave merge:** `npx eslint src --ext ts && npm run test:unit`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Unit test: `TestWorkspaceConfig.get("featuresPaths")` returns `[]` when not set (verify default change)
- [ ] Unit test: "both set" info log fires when both `featuresPath` and `featuresPaths` are explicit
- [ ] Unit test: "both set" info log does NOT fire when only plural is set
- [ ] Unit test: `hasExplicitSetting`-equivalent for `featuresPaths` — non-empty array at any scope returns true; empty array returns false; undefined returns false

## Security Domain

Not applicable. Phase 10 adds a configuration setting declaration and extends detection logic. No user input flows to external systems, no network calls, no file writes, no authentication. All data stays within VS Code's configuration system.

## Sources

### Primary (HIGH confidence)
- [VS Code API docs — WorkspaceConfiguration](https://code.visualstudio.com/api/references/vscode-api#WorkspaceConfiguration) — `get()`, `inspect()`, `update()` behavior, merge order documentation
- Codebase — `src/settings.ts` (lines 1-300) — existing setting read patterns, precedence ladder
- Codebase — `src/common.ts` (lines 145-195) — `hasExplicitSetting()` implementation and call site
- Codebase — `package.json` (lines 1-130) — existing setting declarations, schema patterns
- Codebase — `src/testWorkspaceConfig.ts` (lines 1-260) — test harness `get()`/`inspect()` implementation
- Phase 7 CONTEXT.md — D-11 (precedence ladder), D-12 (package.json deferred to Phase 10), D-13/D-14 (test harness)

### Secondary (MEDIUM confidence)
- [VS Code Extension API — contributes.configuration](https://code.visualstudio.com/api/references/contribution-points#contributes.configuration) — schema format for array settings [CITED]

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all APIs are already in use in this codebase; no new dependencies
- Architecture: HIGH — exact file locations and line numbers known from codebase read; patterns mirror existing code
- Pitfalls: HIGH — 5 pitfalls identified from direct code analysis; Pitfall 1 (empty array) is the only non-trivial one and has a clear solution

**Research date:** 2026-04-21
**Valid until:** Indefinite — VS Code configuration API is stable; no breaking changes expected
