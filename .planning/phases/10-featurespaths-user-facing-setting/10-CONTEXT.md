# Phase 10: `featuresPaths` User-Facing Settings Key - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can opt into multi-path discovery via a new `gs-behave-bdd.featuresPaths: string[]` setting in `settings.json`, and legacy `featuresPath` keeps working unchanged. When both are set, the plural value wins with an info-level log. `hasExplicitSetting` recognizes both keys.

Phase 10 flips the two switches that Phase 7 D-12 deferred: (1) declare the setting in `package.json`, (2) extend `hasExplicitSetting` to recognize `featuresPaths`. The internal plumbing (precedence ladder, empty-array handling) already works from Phase 7 D-11.

</domain>

<decisions>
## Implementation Decisions

### Setting Description Copy

- **D-01:** `featuresPaths` uses **override-style framing** matching `projectPath` and `featuresPath`: "Override only: Leave blank to use auto-discovery..." tone.
- **D-02:** The `markdownDescription` includes a **short inline example**: `["features", "features-alt"]`.
- **D-03:** The description **explicitly states precedence**: "When both `featuresPath` and `featuresPaths` are set, this plural value takes precedence."
- **D-04:** The `default` value in `package.json` is **`[]` (empty array)**, which is treated as unset per Phase 7 D-11.
- **D-05:** The setting scope is **`resource`** (per-workspace-folder), matching `featuresPath` and all other per-workspace settings.

### Info Log Trigger & Wording

- **D-06:** The "singular is being ignored" info log fires when **both `featuresPath` and `featuresPaths` are explicitly set at ANY VS Code scope** (global, workspace, or workspace folder). The check uses `inspect()` on both keys — same pattern as `hasExplicitSetting`. It does NOT fire when the singular only has its package.json default value.
- **D-07:** The log uses **info level** (`config.logger.logInfo()`) — always visible in the output channel, not gated behind `xRay`.
- **D-08:** The log wording is **informational and explicit**: `"Both featuresPath and featuresPaths are set — using featuresPaths (plural). The singular featuresPath value is ignored."`
- **D-09:** The log fires **every time settings are loaded** (on every `WorkspaceSettings` construction), matching the pattern of other config warnings. No per-session dedup.

### `featuresPath` Description Update

- **D-10:** The existing `featuresPath` `markdownDescription` is **updated to cross-reference the plural**: adds a sentence like "For multiple feature paths, use `featuresPaths` (plural) instead."
- **D-11:** **No deprecation** — both `featuresPath` and `featuresPaths` are first-class settings. The singular is simpler for single-path projects; the plural is for multi-path.
- **D-12:** VS Code sorts settings alphabetically in the UI; `featuresPaths` will naturally appear near `featuresPath`. No special ordering needed.

### `hasExplicitSetting` Extension

- **D-13:** `hasExplicitSetting` in `common.ts` (used in Branch A of `hasFeaturesFolder`) is extended to also check `"featuresPaths"` via `inspect()`. If either `featuresPath` OR `featuresPaths` is explicitly set at any scope, Branch A (explicit settings) activates — preserving the v1.0 manual-override priority.
- **D-14:** The check uses the same 3-scope pattern (global, workspace, workspace folder) for `featuresPaths` as it already does for `featuresPath`. For the plural key, a non-empty array at any scope counts as "explicitly set"; an empty array `[]` does not.

### Claude's Discretion

- Exact wording of the `featuresPaths` `markdownDescription` (as long as it follows override-style, includes example, and mentions precedence).
- Exact wording of the `featuresPath` cross-reference addition.
- Whether the "both set" detection logic lives inline in the `WorkspaceSettings` constructor or as a small helper function.
- Whether unit tests for the "both set" log are added in Phase 10 or deferred to Phase 11 (TEST-13). Recommend Phase 10 for the unit tests since the logic is new.

</decisions>

<specifics>
## Specific Ideas

- **`package.json` placement**: Insert `gs-behave-bdd.featuresPaths` immediately after the existing `gs-behave-bdd.featuresPath` block in `package.json` for source-code readability (VS Code sorts alphabetically regardless).
- **"Both set" detection**: The `WorkspaceSettings` constructor already reads both values (Phase 7 D-11). The check should happen at the point where the precedence ladder picks plural over singular — add the log call right there, not in `logSettings`.
- **`hasExplicitSetting` for `featuresPaths`**: The existing function checks a single key name. The call site in `common.ts:188-189` currently checks `projectPath` OR `featuresPath`. Add a third `hasExplicitSetting(wkspConfig, "featuresPaths", legacyWkspConfig)` term.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap + Requirements
- `.planning/ROADMAP.md` §Phase 10 — Goal, Success Criteria 1-5, Requirement MP-03
- `.planning/REQUIREMENTS.md` §MP-03 — exact acceptance criteria
- `.planning/STATE.md` — v1.2 roadmap-level decisions, key architecture constraints

### Prior Phase Context
- `.planning/phases/07-internal-multi-path-types/07-CONTEXT.md` — D-11 (precedence ladder already implemented), D-12 (package.json NOT modified in Phase 7 — that's Phase 10's job), D-13/D-14 (test harness mirrors plural fields)
- `.planning/phases/08-parser-test-tree-watcher-multi-root/08-CONTEXT.md` — D-02 (path-group TestItems when paths= set), D-04 (partial discovery)

### Source files Phase 10 touches
- `package.json` §configuration — add `gs-behave-bdd.featuresPaths` declaration; update `gs-behave-bdd.featuresPath` description
- `src/settings.ts` §WorkspaceSettings constructor (line ~180) — add "both set" detection + info log
- `src/common.ts` §hasExplicitSetting call site (line 188-189) — add `featuresPaths` check
- `src/testWorkspaceConfig.ts` — verify test harness already supports `featuresPaths` input (Phase 7 D-13)

### Build verification
- `CLAUDE.md` §After Every Code Change — `npx eslint src --ext ts` + `npm run test:unit` must pass
- `AI_INSTRUCTIONS.md` — URI handling, disposables, performance, cross-platform rules

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Precedence ladder** in `settings.ts` (line 180-205) — Phase 7 D-11 already implements plural > singular > convention. Phase 10 adds the info log inside the plural branch.
- **`hasExplicitSetting()`** in `common.ts` (line 145) — Inspects a single key at all 3 VS Code scopes. Call site at line 188-189 checks `projectPath` OR `featuresPath`.
- **`logSettings()`** in `settings.ts` (line 312) — Already renders `featuresPaths` in the output. The "both set" log fires earlier (during construction), not in `logSettings`.

### Established Patterns
- **Override-style descriptions** — `projectPath` and `featuresPath` both use "Override only: Leave blank to use auto-discovery..." framing.
- **Setting declarations** — `package.json` uses `"scope": "resource"`, `"type"`, `"markdownDescription"`, `"default"` consistently.
- **`inspect()` for explicit-set detection** — `hasExplicitSetting` already checks `globalValue`, `workspaceValue`, `workspaceFolderValue`.

### Integration Points
- **`common.ts:188-189`** — The only call site of `hasExplicitSetting` for feature paths. Adding `featuresPaths` here makes Branch A (explicit settings) activate when either key is set.
- **`settings.ts:182`** — The `featuresPaths` read site. The "both set" log goes here (or immediately after the `if` that picks plural).
- **`settings.ts:131`** — The `featuresPath` read site. Unmodified; the singular still works as before.

</code_context>

<deferred>
## Deferred Ideas

- **Deprecate `featuresPath` (singular)** — Migrate users from `featuresPath` to `featuresPaths` and remove the singular key. This would simplify the settings surface but requires a migration path, touching 20+ singular-getter call sites, and updating all documentation. Captured for a future milestone (v2.0 settings cleanup phase).
- **Deprecate other legacy settings** — Review all existing settings for cleanup opportunities in the same future phase (e.g., consolidating related settings, removing vestiges of the `behave-vsc` legacy namespace).
- **Settings migration command** — A `Behave BDD: Migrate Settings` command that automatically rewrites `featuresPath` → `featuresPaths` in `settings.json`. Pairs with the deprecation work.

</deferred>

---

*Phase: 10-featurespaths-user-facing-setting*
*Context gathered: 2026-04-21*
