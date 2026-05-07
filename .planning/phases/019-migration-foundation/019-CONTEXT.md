# Phase 19: Migration Foundation - Context

**Gathered:** 2026-05-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the migration plumbing for v1.5.0 — register the new `migrationMode` and `completedMigrations` settings, ship the per-scope migration evaluator that classifies each migration × scope into case 1/2/3, register the *Behave BDD: Recheck Migrations* command, and pay down the v1.4.0 `activeProjectCache` invalidation tech debt. Phase 19 builds infrastructure only; case 2/case 3 prompt UX lands in Phase 21, and concrete registry entries land in Phase 20.

</domain>

<decisions>
## Implementation Decisions

### Evaluator vs. primitive boundary
- **D-01:** The evaluator owns scope inspection. It calls `vscode.workspace.getConfiguration(ns, wkspUri).inspect(key)` directly per VS Code scope (Global / Workspace / WorkspaceFolder), classifies each scope as case 1/2/3, and only invokes `migrateScopedSetting` (`src/notifications.ts:143`) when an actual copy is needed. The primitive stays untouched and continues to handle same-scope inspect/write/clear.
- **D-02:** The W-02 stale-other-scopes warning inside `migrateScopedSetting` becomes obsolete for callers that go through the evaluator (the evaluator visits every scope in its own loop). Leave the warning in place as defensive logging — it now only fires for any direct caller that bypasses the evaluator (which should be none after Phase 20).
- **D-03:** Case 1 (neither legacy nor canonical set at this scope) is handled entirely inside the evaluator: silently mark Finished, no prompts, no copy. Case 2/3 detection happens in the evaluator, but the actual prompt UX is deferred to Phase 21 — Phase 19 exposes a hook (e.g. an injected `onCaseHit(case, entry, scope)` callback) so Phase 21 can wire the notifications without modifying the evaluator.

### Registry entry shape
- **D-04:** Lock the minimal `MigrationEntry` interface in Phase 19: `{ id: string; sourceNamespace: string; sourceKey: string; destNamespace: string; destKey: string; transform: (src, destAtSameScope) => TransformResult }`. Phase 20 may extend the interface (additional fields like `legacyCleanupNote`, `description`, etc.) when it registers concrete entries.
- **D-05:** The registry in Phase 19 is an empty array (or a single test fixture entry used only by `TEST-03`). Phase 20 populates it with the v1.4.0 refactors and the `behave-vsc` entries.

### Recheck Migrations command UX
- **D-06:** The command shows a `vscode.window.showQuickPick` with three options — **Global**, **Workspace**, **Workspace Folder** — and clears `completedMigrations` only at the chosen scope before re-running the migration scan. Surgical control beats a single-click sweep, and the command is rare enough that one extra click does not grate.
- **D-07:** Scopes that the user cannot write to (e.g. **Workspace** when there is no `.code-workspace` open) are filtered out of the quick-pick at presentation time so the user is never offered a no-op choice.
- **D-08:** After the user picks a scope, the command writes `[]` to `completedMigrations` at that scope and triggers the same evaluator run that activation uses — Phase 19 does not invent a parallel rescan path.

### `activeProjectCache` invalidation breadth
- **D-09:** The new invalidation hook listens for changes to **all scan-shaping keys**: `discoveryDepth`, `projectPath`, `projectPaths`, `featuresPath`, `featuresPaths`. On any of these changes the hook calls `clearScanResultCache()` (`src/discovery/configScanner.ts:45`) and invalidates `activeProjectCache` (`src/discovery/projectList.ts`). This proactively closes the same class of stale-cache bugs the v1.4.0 read-time hack was patching for `discoveryDepth` only.
- **D-10:** The hook lives inside the existing `onDidChangeConfiguration` → `configurationChangedHandler` flow registered at `src/extension.ts:1104`. Add the new branch alongside the current logic — no new top-level subscription.
- **D-11:** Remove the read-time `discoveryDepth` re-read in `src/common.ts:347` once the new invalidation is in place. The unit test for TEST-06 pins the new behavior so the comment block at L355–L360 can be deleted (the v1.4.0 follow-up debt is officially closed by this phase).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v1.5.0 Scope & Requirements
- `.planning/REQUIREMENTS.md` — full v1.5.0 requirement list; CONSENT-05/07/08/09, MIGRATE-04/07/08/09, CLEANUP-02, TEST-03/05/06 all map to Phase 19.
- `.planning/ROADMAP.md` § "Phase 19: Migration Foundation" — phase boundary and success criteria.
- `.planning/STATE.md` § "v1.5.0 Decisions" — locked architectural decisions carried forward (route through `migrateScopedSetting`, no parallel implementations).

### v1.4.0 Tech Debt (closed by this phase)
- `.planning/milestones/v1.4.0-MILESTONE-AUDIT.md` § tech_debt — context for the `activeProjectCache` carry-forward debt that CLEANUP-02 closes.

### Existing Migration Primitive
- `src/notifications.ts:143` — `migrateScopedSetting<TSrc, TDest>` primitive. Read the W-02 docblock (L130–L142) to understand the same-scope-most-specific-wins semantics the evaluator works around.
- `src/notifications.ts:261` — `migrateLegacySuppressMultiConfig` (existing v1.4.0 caller, refactored to registry in Phase 20).
- `src/notifications.ts:316` — `migrateLegacyFeaturesPath` (existing v1.4.0 caller, refactored to registry in Phase 20).

### Cache & Discovery Code
- `src/discovery/configScanner.ts:45` — `clearScanResultCache()` to call from the new invalidation hook.
- `src/discovery/projectList.ts:19` — `activeProjectCache` Map definition; planner needs to decide whether to expose a public `clearActiveProjectCache()` helper or inline a `.clear()` call.
- `src/common.ts:340–360` — read-time `discoveryDepth` re-read site that D-11 deletes.
- `src/extension.ts:1104` — `onDidChangeConfiguration` registration; new branch lands here.

### Project Conventions
- `AI_INSTRUCTIONS.md` — URI handling, error patterns, disposable conventions; required reading before any code changes in this repo.
- `CLAUDE.md` — root project instructions (lint + unit tests after every TS change).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `migrateScopedSetting` (`src/notifications.ts:143`) — keep as-is; the evaluator orchestrates around it. Same-scope inspect/write/clear semantics are exactly what we need for the copy step.
- `clearScanResultCache()` (`src/discovery/configScanner.ts:45`) — already-public; the new config-change hook calls it directly.
- `configurationChangedHandler` (`src/extension.ts:1104` registration) — established pattern for reacting to settings changes. New invalidation logic lands inside this handler, no new subscription needed.
- VS Code `cfg.inspect<T>(key)` — returns `{ globalValue, workspaceValue, workspaceFolderValue }`. The evaluator uses this directly to classify each scope without merging.

### Established Patterns
- Per-scope, most-specific-wins semantics are already expressed in `migrateScopedSetting` L156–L168. Mirror that classification logic in the evaluator's per-scope loop instead of inventing new semantics.
- Settings registration: existing `gs-behave-bdd.*` keys in `package.json` follow a consistent shape (description, type, default, scope). New `migrationMode` and `completedMigrations` follow the same template.
- Commands: existing palette commands in `package.json` map to `commands.registerCommand` calls in `extension.ts` `activate()`.
- Custom error class `WkspError` (`src/common.ts`) — use when the evaluator needs to surface a workspace-aware failure to the logger.

### Integration Points
- Activation (`src/extension.ts` `activate()`): the v1.4.0 silent-migration calls at L348–L349 are gone in Phase 20. Phase 19 should *introduce* the evaluator as a no-op (empty registry) so Phase 20 can flip the switch.
- `onDidChangeConfiguration` (`src/extension.ts:1104`): new invalidation branch.
- Settings UI: `package.json` `contributes.configuration.properties` — add `gs-behave-bdd.migrationMode` (enum) and `gs-behave-bdd.completedMigrations` (array of string).

</code_context>

<specifics>
## Specific Ideas

- The evaluator should be testable in isolation. Mocking strategy: stub `vscode.workspace.getConfiguration().inspect()` per scope rather than going through real VS Code config — matches the existing unit-test pattern for `migrateScopedSetting`.
- Consider exposing the evaluator as a single function `evaluateMigration(entry, wkspUri, hooks)` returning `{ scope, case, action }[]` so TEST-03 can drive it directly without spinning up the activation flow.
- The Phase 21 prompt UX needs to call back into "mark this migration Finished at this scope". Phase 19 should ship that helper (`markMigrationFinishedAtScope(id, scope, wkspUri)`) so Phase 21 doesn't reach into `completedMigrations` directly.

</specifics>

<deferred>
## Deferred Ideas

- **Per-migration `migrationMode`** — already documented as out-of-scope for v1.5.0 in REQUIREMENTS.md. Single global default strategy stands.
- **Diagnostics / Problems-panel summary of what was migrated** — out-of-scope per REQUIREMENTS.md "Future Requirements". Output channel log is the v1.5.0 audit trail.
- **Removing legacy `behave-vsc` references in `src/notifications.ts` (FEATURES_PATH_NAMESPACES)** — out-of-scope per REQUIREMENTS.md; possible v1.6.0 candidate.
- **Restructuring `migrateScopedSetting` to support multi-scope per invocation** — explicitly rejected during discussion. Evaluator owns the per-scope loop; primitive stays single-scope. If a future phase ever needs multi-scope migration without an evaluator, revisit then.

</deferred>

---

*Phase: 19-Migration Foundation*
*Context gathered: 2026-05-07*
</content>
</invoke>