# Phase 20: Migration Registry - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Populate the Phase 19 migration registry with concrete entries and dissolve v1.4.0's two existing migration call sites into the same registry. Two classes of entries land here:

1. **Existing v1.4.0 migrations refactored as registry entries** — `migrateLegacyFeaturesPath` and `migrateLegacySuppressMultiConfig`. Their activation-time silent call sites go away; they only run via the Phase 19 evaluator.
2. **New `behave-vsc.<key>` → `gs-behave-bdd.<key>` cross-extension entries** — one per silently-fallback-read key currently consumed via `getWithLegacyFallback` in `src/settings.ts`, plus the explicit `projectPath` checks in `src/common.ts:222` and `src/discovery/projectList.ts:180`.

No prompts, no case 2/3 user actions — those are Phase 21's job. Phase 20 only writes the registry, refactors the call sites, and adds idempotency tests. By the end of Phase 20 every migration is data, not code, and the activation flow is "evaluator runs over registry × scopes" with empty-registry → no-op behavior unchanged from Phase 19.

</domain>

<decisions>
## Implementation Decisions

### Key list (D-A1)
- **D-A1.1:** Register **all 15** keys that `getWithLegacyFallback` currently reads as `behave-vsc.<key>` → `gs-behave-bdd.<key>` migration entries. Even keys that almost certainly never existed in `behave-vsc` (`discoveryDepth`, `discoveryStopOnFirstHit`, possibly `verboseLogging`) get entries.
- **D-A1.2:** Rationale: a user without those keys hits **case 1** at every scope on first activation — silent, mark-Finished, never re-evaluated. Cost is one extra evaluator pass per scope per missing-everywhere migration, exactly once per workspace. Benefit: the registry mirrors `getWithLegacyFallback`'s coverage one-for-one — there's never a "why isn't this key migrated?" question.
- **D-A1.3:** Inventory:
  | Key | Type | Scope | Notes |
  |---|---|---|---|
  | `featuresPath` | string | resource | covered by v1.4.0 cross-namespace entry (D-A4) |
  | `projectPath` | string | resource | also explicit-checked in common.ts:222 / projectList.ts:180 |
  | `runParallel` | boolean | resource | |
  | `justMyCode` | boolean | resource | |
  | `xRay` | boolean | window | |
  | `verboseLogging` | boolean | window | uncertain whether behave-vsc had it |
  | `multiRootRunWorkspacesInParallel` | boolean | window | |
  | `importStrategy` | string enum | resource | |
  | `stepDefinitionSearchTimeout` | number | resource | |
  | `discoveryDepth` | number | resource | new in v1.5.0; behave-vsc never had it |
  | `discoveryStopOnFirstHit` | boolean | resource | new in v1.5.0; behave-vsc never had it |
  | `suppressedNotifications` | string[] | resource | array — append-with-dedup transform |
  | `activeEnvVarPreset` | string | resource | |
  | `envVarPresets` | record | resource | object-shaped — see D-A2 |
  | `envVarOverrides` | record | resource | object-shaped — see D-A2 |

### Object-shaped transforms (D-A2)
- **D-A2.1:** For `envVarPresets` and `envVarOverrides`, the transform implements **deep-merge at preset-level AND var-level**. Top-level: union of preset names. Within a colliding preset: union of vars.
- **D-A2.2:** Case 2 (canonical empty at scope) → straight copy of legacy. Deep-merge degenerates to identity since `destAtSameScope` is undefined. No special-casing needed in the transform.
- **D-A2.3:** Case 3 (both present at scope) → Phase 21 territory. The deep-merge utility lands in Phase 20 (`mergeRecord` exported from `src/migrations/envPresets.ts`); Phase 21 wires action choices to merge direction:
  - `overwrite-*` actions → deep-merge with **legacy winning** on collisions
  - `keep-canonical-*` actions → no merge (canonical untouched; legacy may be deleted per action)
  - `keep-both` → no-op
  Phase 20 ships only the case-2 path through this transform; the case-3 plumbing arrives in Phase 21.
- **D-A2.4:** Arrays (`suppressedNotifications`, `featuresPaths`): keep the established v1.4.0 pattern of **append-with-dedup**. That's what `migrateLegacySuppressMultiConfig` and `migrateLegacyFeaturesPath` already do; preserve it on refactor.

### Registry organization & file layout (D-A3)
- **D-A3.1:** New directory `src/migrations/` with grouped-by-concern layout:
  ```
  src/migrations/
    index.ts                      # exports `migrations: MigrationEntry[]` (the aggregated registry)
    types.ts                      # MigrationEntry, TransformResult re-export
    plain.ts                      # makePlainEntry(sourceNs, sourceKey, destNs, destKey) factory + the ~10 plain-copy entries
    featuresPath.ts               # featuresPathMergeWithDedup transform + 2 entries (intra-ns + cross-ns)
    suppressedNotifications.ts    # suppressMultiConfigToArray transform + 1 entry
    envPresets.ts                 # mergeRecord deep-merge utility + 2 entries (envVarPresets, envVarOverrides)
  ```
- **D-A3.2:** Tests sit beside the entries: `src/migrations/featuresPath.test.ts`, `src/migrations/envPresets.test.ts`, etc. Plain entries get a single `plain.test.ts` exercising the factory.
- **D-A3.3:** `src/migrations/index.ts` is the single import surface: `import { migrations } from './migrations';`. The Phase 19 evaluator wiring in `src/extension.ts` switches from the empty placeholder array to importing this.
- **D-A3.4:** Old call sites (`migrateLegacyFeaturesPath`, `migrateLegacySuppressMultiConfig` in `src/notifications.ts`) are deleted from activation. The exported functions themselves can stay as a thin compatibility wrapper IF unit tests still depend on them; otherwise delete. Planner decides at plan time after grepping callers.

### v1.4.0 migration refactor shape (D-A4)
- **D-A4.1:** `migrateLegacyFeaturesPath` becomes **two registry entries** sharing one exported transform:
  - id: `featuresPath-self` — `gs-behave-bdd.featuresPath` → `gs-behave-bdd.featuresPaths` (intra-namespace rename, the singular→plural migration from v1.4.0)
  - id: `featuresPath-from-behavevsc` — `behave-vsc.featuresPath` → `gs-behave-bdd.featuresPaths` (cross-extension)
  - Both reference `featuresPathMergeWithDedup` exported from `src/migrations/featuresPath.ts`.
- **D-A4.2:** Each entry gets its own slot in `completedMigrations`, so the user can have completed `featuresPath-self` at Workspace scope but not yet completed `featuresPath-from-behavevsc` at the same scope. This matches the evaluator's "entry × scope" iteration model from Phase 19.
- **D-A4.3:** `migrateLegacySuppressMultiConfig` becomes **one registry entry**:
  - id: `suppressMultiConfig-self` — `gs-behave-bdd.suppressMultiConfigNotification` → `gs-behave-bdd.suppressedNotifications`
  - transform `suppressMultiConfigToArray` exported from `src/migrations/suppressedNotifications.ts` (preserves the existing boolean-true → append "multiConfigNotification" semantics).
- **D-A4.4:** Final entry count: **17** total — 15 behave-vsc-source entries (D-A1.3) + 1 `featuresPath-self` intra-namespace + 1 `suppressMultiConfig-self` intra-namespace. The behave-vsc cross-namespace `featuresPath-from-behavevsc` entry is one of the 15 (the `featuresPath` row).
- **D-A4.5:** Reject extending `MigrationEntry` to allow `sourceNamespace: string | string[]`. The evaluator's "entries × scopes" axis is the right granularity; folding namespace iteration into the entry shape couples concerns and breaks per-namespace Finished tracking.

### Idempotency (D-A5)
- **D-A5.1:** Idempotency is a property of the Phase 19 evaluator, not of individual entries: an entry whose id is in `completedMigrations` at a given scope is skipped before its transform is invoked. Phase 20 does not add any new idempotency mechanism.
- **D-A5.2:** TEST-04 covers two dimensions per entry:
  - **(a) `completedMigrations`-based skip:** evaluator with the entry's id already present at scope X → no `inspect` calls for that entry × scope, no transform invocation.
  - **(b) Case-1 silent finish:** evaluator with neither legacy nor canonical at scope X → mark-Finished, no transform invocation, no write side effects beyond the `completedMigrations` update.

### Activation refactor (D-A6)
- **D-A6.1:** Delete the silent activation-time calls to `migrateLegacyFeaturesPath` and `migrateLegacySuppressMultiConfig` in `src/extension.ts:348-349` (per Phase 19 D-A6 carry-forward). The Phase 19 evaluator already runs at activation; once the registry is populated, that single call covers all migrations.
- **D-A6.2:** No new activation-time hook. Phase 19's evaluator wiring is the single entry point for all migration work.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 19 carry-forward (READ THESE FIRST)
- `.planning/phases/019-migration-foundation/019-CONTEXT.md` — locks `MigrationEntry` shape (D-04), evaluator-vs-primitive boundary (D-01/D-02/D-03), and the Phase 21 hook contract.
- `.planning/phases/019-migration-foundation/019-02-evaluator-PLAN.md` and `-SUMMARY.md` — actual evaluator implementation. Phase 20 entries plug into this.
- `.planning/phases/019-migration-foundation/019-04-active-project-cache-invalidation-PLAN.md` — context for the v1.4.0 carry-forward debt that's already closed; do NOT reopen.

### v1.5.0 Scope & Requirements
- `.planning/REQUIREMENTS.md` § MIGRATE-01, MIGRATE-02, MIGRATE-03, TEST-04 — the four requirements Phase 20 maps to.
- `.planning/ROADMAP.md` § "Phase 20: Migration Registry" — phase boundary and success criteria.
- `.planning/STATE.md` § "v1.5.0 Decisions" — locked architectural decisions (route through `migrateScopedSetting`; no parallel implementations).

### Existing migration code to refactor
- `src/notifications.ts:143` — `migrateScopedSetting<TSrc, TDest>` primitive. Untouched by Phase 20; the registry transforms call into it via the evaluator.
- `src/notifications.ts:261` — `migrateLegacySuppressMultiConfig`. Refactor target → `suppressMultiConfig-self` registry entry. Transform body lifts to `suppressMultiConfigToArray`.
- `src/notifications.ts:316` — `migrateLegacyFeaturesPath`. Refactor target → 2 registry entries (`featuresPath-self`, `featuresPath-from-behavevsc`). Transform body lifts to `featuresPathMergeWithDedup`.
- `src/notifications.ts:286` — `FEATURES_PATH_NAMESPACES` const. Goes away once both featuresPath entries are registered separately.
- `src/extension.ts:348-349` — silent activation-time migration calls. Delete once registry is populated and evaluator wiring is live.

### Legacy fallback read sites (the source of D-A1's key list)
- `src/settings.ts:16-30` — `getWithLegacyFallback` definition. Authoritative list of which keys read `behave-vsc.*`.
- `src/settings.ts:40-58` — `WindowSettings` constructor (3 keys: `multiRootRunWorkspacesInParallel`, `xRay`, `verboseLogging`).
- `src/settings.ts:106+` — `WorkspaceSettings` constructor (12 resource-scope keys).
- `src/configuration.ts:68-92` — site that wires `legacyConfig` into the constructors.
- `src/common.ts:214,222` — `projectPath` explicit-setting check (separate from the constructor flow).
- `src/discovery/projectList.ts:179-180` — `projectPath` explicit-setting check.

### Project conventions
- `AI_INSTRUCTIONS.md` — URI handling, error patterns, disposable conventions; required reading before any code changes in this repo.
- `CLAUDE.md` — root project instructions (lint + unit tests after every TS change).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 19 evaluator** — already in place; consumes a `migrations: MigrationEntry[]` array. Phase 20's `src/migrations/index.ts` becomes the new source of that array.
- **`migrateScopedSetting` primitive** (`src/notifications.ts:143`) — same-scope inspect/write/clear semantics. Every transform in the registry routes through it via the evaluator.
- **Existing transform bodies** — the merge-with-dedup logic in `migrateLegacyFeaturesPath` (lines 325-343) and the boolean→array-append logic in `migrateLegacySuppressMultiConfig` (lines 267-279) lift wholesale into the new files. Don't rewrite — move and rename.
- **`normalizeFeaturesPathEntry`** (`src/common.ts`) — keeps its v1.4.0 home; the lifted `featuresPathMergeWithDedup` imports it.

### Established Patterns
- **Per-scope, most-specific-wins semantics** — already expressed in `migrateScopedSetting`. The registry inherits this for free; transforms don't re-implement it.
- **Workspace-aware error logging** — `WkspError` (`src/common.ts`) for any transform that needs to surface a workspace-aware failure to the logger. Existing transforms throw or return `skipDest`; mirror that.
- **Test pattern** — `src/notifications.test.ts` already mocks `vscode.workspace.getConfiguration().inspect()`. Phase 20 tests follow the same shape, located beside the migration files.

### Integration Points
- **`src/extension.ts:348-349`** — silent activation-time migration calls; delete after registry wiring lands.
- **Phase 19 evaluator import** — wherever Phase 19 wired the empty registry, switch the import to `from './migrations'`. Planner verifies at plan time.
- **`package.json`** — no new settings, no new commands. Phase 20 is pure refactor + new module.

</code_context>

<specifics>
## Specific Ideas

- **`makePlainEntry` factory signature:** `(sourceKey, destKey?) => MigrationEntry` where omitted `destKey` defaults to `sourceKey`. Source namespace is always `behave-vsc`, dest always `gs-behave-bdd` for plain entries — those don't vary, so they're not parameters.
- **Entry id naming convention:** `<key>-from-behavevsc` for cross-extension entries (the 15), `<key>-self` for intra-namespace entries (the 2). This way `featuresPath-from-behavevsc` and `featuresPath-self` are unambiguous in `completedMigrations`. Document the convention in `src/migrations/types.ts` near the `MigrationEntry` interface.
- **`mergeRecord` utility shape:** `mergeRecord<T>(legacy: Record<string, T> | undefined, canonical: Record<string, T> | undefined, mergeValue: (l, c) => T): Record<string, T>`. Inner merge for envVarPresets is `mergeRecord` recursively (preset-level keys map to var-level records); for envVarOverrides it's a single level (var name → string).
- **TEST-04 structure:** one test file per entry-group file (`plain.test.ts`, `featuresPath.test.ts`, `suppressedNotifications.test.ts`, `envPresets.test.ts`). Per entry: (a) the `completedMigrations`-based skip case, (b) the case-1 silent-finish case. Plus per-transform: a small unit-test for the transform itself in isolation.
- **Avoid re-running `migrateLegacyFeaturesPath`/`migrateLegacySuppressMultiConfig` exports:** if no other caller exists in `src/`, the planner should remove the wrappers entirely after the lift. If `src/notifications.test.ts` still imports them as a regression bar, keep thin re-exports that just call the registry entries' transforms — but prefer deleting the test once the new ones cover it.

</specifics>

<deferred>
## Deferred Ideas

- **Case 3 prompt actions** — the four MIGRATE-06 actions (`overwrite-and-delete` / `overwrite-and-keep` / `keep-canonical-and-delete-legacy` / `keep-both`) are Phase 21. Phase 20 only ships the case-2 path; the deep-merge utility (`mergeRecord`) is exported and ready to be called with different merge directions in Phase 21.
- **Per-migration `migrationMode`** — already documented as out-of-scope for v1.5.0 in REQUIREMENTS.md. Single global default strategy stands.
- **Removing the `behave-vsc.*` reads from `src/configuration.ts` / `src/common.ts:214` / `src/discovery/projectList.ts:179`** — that's CLEANUP-01, scoped to Phase 22. Phase 20 does NOT remove those reads; the legacy fallback continues to work for users who haven't yet migrated (case 2/3 in Phase 21 will drive the actual migration, and Phase 22 deletes the fallback paths).
- **Schema validation of migrated values** — e.g., verifying that `behave-vsc.importStrategy` was a legal `gs-behave-bdd.importStrategy` enum value before copying. Not required by MIGRATE-03; if a user had garbage in `behave-vsc`, they get garbage in `gs-behave-bdd` and the existing `WorkspaceSettings` constructor's runtime validation surfaces it. Add as a future hardening pass if it bites.

</deferred>

---

*Phase: 20-Migration Registry*
*Context gathered: 2026-05-08*
