# Phase 19: Migration Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-07
**Phase:** 19-Migration Foundation
**Areas discussed:** Evaluator vs. primitive boundary, Registry entry shape, Recheck command UX scope, activeProjectCache invalidation breadth

---

## Evaluator vs. primitive boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Evaluator owns scope inspection; primitive does the copy | Evaluator calls cfg.inspect() per scope, classifies case 1/2/3, and only invokes migrateScopedSetting when an actual copy is needed. Primitive stays unchanged. Removes the W-02 stale-values warning since evaluator visits all scopes. | ✓ |
| Extend primitive with explicit target scope arg | Add an optional `targetScope: ConfigurationTarget` param so evaluator can call migrateScopedSetting per scope. Primitive keeps same-scope inspect/write semantics. Evaluator becomes a thin per-scope loop. | |
| Two-layer split: new perScopeMigrate wrapper + existing primitive | Keep migrateScopedSetting untouched. Build new perScopeMigrate(entry) that loops scopes, classifies cases, and delegates copy work to the existing primitive once per scope. Evaluator calls perScopeMigrate. | |

**User's choice:** "up to you" — Claude selected option 1.
**Notes:** Cleanest separation: primitive remains a focused same-scope copy/clear utility; evaluator handles classification. The W-02 stale-values warning becomes obsolete for evaluator-driven callers but is left in place as defensive logging.

---

## Registry entry shape

| Option | Description | Selected |
|--------|-------------|----------|
| Lock the full shape now | Define MigrationEntry { id, sourceNamespace, sourceKey, destNamespace, destKey, transform } completely in Phase 19. Phase 20 just registers entries. Reduces Phase 20 churn but bakes assumptions before we've written the cross-extension entries. | |
| Lock minimal shape; let Phase 20 extend | Phase 19 locks only what the evaluator needs ({ id, sourceNamespace, sourceKey, destNamespace, destKey }) plus a transform fn. Phase 20 can add fields (e.g. legacyCleanupNote) when registering real entries. | ✓ |
| Stub it — Phase 19 evaluator works against an empty registry | Phase 19 ships the evaluator + types skeleton but no concrete shape decisions; tests use synthetic entries. Phase 20 designs the real interface alongside the v1.4.0 refactor. | |

**User's choice:** Lock minimal shape; let Phase 20 extend.
**Notes:** Phase 19 ships an empty registry (or a single fixture entry for TEST-03). Phase 20 populates and may extend the interface.

---

## Recheck command UX scope

| Option | Description | Selected |
|--------|-------------|----------|
| Clear all writeable scopes silently, then rescan | Iterate Global / Workspace / WorkspaceFolder; clear completedMigrations at every scope where the user can write. Single-click recheck — matches CONSENT-09's literal wording. Power-user friendly. | |
| Quick-pick: which scope to recheck? | Show vscode.window.showQuickPick with Global / Workspace / Workspace Folder options. User picks one, only that scope is cleared and rescanned. More surgical but adds a click on a rarely-used command. | ✓ |
| Always just current WorkspaceFolder | Most conservative — only clears completedMigrations at the active folder scope. Users who want to recheck Global edit settings.json directly. Less surprising but doesn't really match the requirement wording. | |

**User's choice:** Quick-pick: which scope to recheck.
**Notes:** Surgical control beats a one-click sweep on a rarely-used command. Non-writable scopes filtered out at presentation time.

---

## activeProjectCache invalidation breadth

| Option | Description | Selected |
|--------|-------------|----------|
| Just discoveryDepth (matches CLEANUP-02 literally) | Only handle the documented debt. Other settings (projectPaths, featuresPaths, projectPath) currently aren't observed to cause stale-cache bugs — keep scope tight, add the others if/when they bite. | |
| discoveryDepth + all scan-shaping keys | Invalidate on changes to discoveryDepth, projectPath, projectPaths, featuresPath, featuresPaths. Closes related stale-cache risks proactively. Slightly broader Phase 19 surface but pays down the same class of debt. | ✓ |
| discoveryDepth + projectPaths/featuresPaths only | Middle ground — invalidate on discoveryDepth and the multi-path keys (which directly drive scanForBehaveConfig output). Skip the singular legacy keys since they migrate forward in Phase 20 anyway. | |

**User's choice:** discoveryDepth + all scan-shaping keys.
**Notes:** Proactively closes the same class of bugs the v1.4.0 read-time hack was patching. Hook lands inside the existing onDidChangeConfiguration handler at src/extension.ts:1104.

---

## Claude's Discretion

- **Evaluator vs. primitive boundary** — user said "up to you"; Claude chose option 1 (evaluator owns scope inspection).
- Hook shape for Phase 21 case 2/3 prompts (an `onCaseHit` callback) — not explicitly discussed, captured in D-03 as the natural extension point.
- Helper signature `markMigrationFinishedAtScope(id, scope, wkspUri)` for Phase 21 — captured in `<specifics>`.

## Deferred Ideas

- Per-migration `migrationMode` — already out-of-scope per REQUIREMENTS.md.
- Diagnostics / Problems-panel summary of what migrated — already out-of-scope per REQUIREMENTS.md.
- Removing FEATURES_PATH_NAMESPACES references in `src/notifications.ts` — already out-of-scope per REQUIREMENTS.md.
- Restructuring `migrateScopedSetting` for multi-scope per invocation — rejected during D-01 discussion; evaluator owns the per-scope loop instead.
</content>
</invoke>
