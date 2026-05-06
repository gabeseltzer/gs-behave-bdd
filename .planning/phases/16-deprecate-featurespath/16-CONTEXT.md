# Phase 16: Deprecate featuresPath - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Hard-remove the singular `featuresPath` setting from the `package.json` schema, auto-migrate any explicit user value (at any scope, in either the `gs-behave-bdd` or legacy `behave-vsc` namespace) into `gs-behave-bdd.featuresPaths[]`, and surface a suppressible "we migrated this" notification. Internal source-tree reads of `featuresPath` (singular) are removed entirely; the precedence ladder in `src/settings.ts` collapses to plural → config-file → convention.

Phase 16 is the second consumer of the Phase 15 suppression infrastructure (key: `featuresPathMigration`). It is also the second use of the inspect-then-write-at-same-scope migration pattern Phase 15 introduced — and the trigger for extracting that pattern into a shared primitive (D-MOD).

</domain>

<decisions>
## Implementation Decisions

### Migration Helper API (D-01..D-05)
- **D-01:** New helper `migrateLegacyFeaturesPath(wkspUri: vscode.Uri): Promise<boolean>`. Returns `true` if at least one scope was migrated, `false` otherwise. Diverges from Phase 15's `Promise<void>` because Phase 16 is user-visible — the caller branches on the boolean to decide whether to fire the notification.
- **D-02:** Helper migrates **both** `gs-behave-bdd.featuresPath` and `behave-vsc.featuresPath` (legacy fork namespace). Both source values land in the canonical destination `gs-behave-bdd.featuresPaths`. `behave-vsc.featuresPaths` is **never** written.
- **D-03:** For each (namespace, scope) pair where a legacy value exists, write to `gs-behave-bdd.featuresPaths` at the **same scope level** as the legacy value (workspaceFolder / workspace / global), then `update(legacyKey, undefined, sameTarget)` to remove the legacy key.
- **D-04:** Cross-scope independence: a `behave-vsc.featuresPath` at workspace scope and a `gs-behave-bdd.featuresPath` at workspaceFolder scope are migrated independently into `gs-behave-bdd.featuresPaths` at their respective scopes. No cross-scope shadowing logic.
- **D-05:** Helper never throws (D-07 from Phase 15 carries forward). On `update()` rejection, log via `config.logger.logInfo(...)` and continue. Boolean return reflects only successful migrations.

### Same-Scope Collision Policy (D-06..D-07)
- **D-06:** When a user has BOTH `featuresPath` (singular, explicit) AND `featuresPaths` (plural, non-empty array) at the same scope: **merge singular into plural with dedup**. Read existing plural at same scope via `inspect()` (Pitfall 2 — never `cfg.get()` which merges scopes), append the singular value if not already present, write the merged array, then remove the legacy singular.
- **D-07:** Dedup compares post-normalization (trim leading/trailing slashes, trim whitespace) — the same normalization the active settings ladder applies at `src/settings.ts:204`/`L214`.

### Value Filtering (D-08..D-09)
- **D-08:** Skip migration when the legacy value is empty string or whitespace-only after trim. Just remove the legacy key (the user has nothing worth preserving). The legacy key removal still fires; only the merge-into-plural step is skipped.
- **D-09:** Migrate everything else literally, including:
  - `"features"` (matches the package.json default — user explicitly set it, so we honor that intent)
  - `"."` (will continue to trigger the existing per-entry fatal-error guard at `src/settings.ts:233` once it lands in `featuresPaths` — preserves existing behavior)
  - any custom path

### Notification UX (D-10..D-13)
- **D-10:** Notification fires **per migrated workspace folder** (matches the per-workspace activation loop). Each notification scopes its `Don't Show Again` to that workspace folder, but the suppression key is a single string — once dismissed at any scope, all subsequent fires across workspace folders also stay quiet (matches Phase 15 semantics).
- **D-11:** Notification fires **only when the helper returns `true`** for that workspace folder. Users with no `featuresPath` at any scope, in any namespace, see nothing.
- **D-12:** Buttons: `["Open Settings"]` (plus the auto-appended `"Don't Show Again"` from `showSuppressibleNotification`). Clicking "Open Settings" opens the workspace's settings UI scoped to the `gs-behave-bdd` extension. Notification text: `"Migrated featuresPath → featuresPaths. The deprecated featuresPath setting has been moved to the new featuresPaths array."` (final wording is Claude's discretion within this shape.)
- **D-13:** Suppression key (added to `suppressedNotifications[]`): `featuresPathMigration` (camelCase, matches D-09 of Phase 15 CONTEXT).

### Modularity (D-MOD)
- **D-MOD:** Extract a shared internal primitive in `src/notifications.ts` (or a new dedicated file — planner's HOW choice) that captures the inspect-detect-scope-write-then-remove-legacy mechanics common to Phase 15's helper and Phase 16's helper. Refactor Phase 15's `migrateLegacySuppressMultiConfig` to call the primitive. Implement Phase 16's `migrateLegacyFeaturesPath` as another wrapper. Adding a 3rd migration (e.g., a future `discoveryDepth` rename) becomes a ~15-line wrapper, not a copy-paste of the full pattern.
  - **Scope expectation:** Phase 16 PR will modify already-shipped Phase 15 code. Reviewers should expect this. The primitive is extracted and exercised by both helpers in the same PR; no half-finished framework.
  - **NOT a registry/declarative system** (Option C from discussion) — that's deferred until a 3rd concrete migration validates the abstraction.
  - **Regression bar:** all 8 existing `migrateLegacySuppressMultiConfig` sub-cases must still pass after the refactor (no behavior change to Phase 15 helper).

### Source-Tree Cleanup (D-14..D-17)
- **D-14:** `package.json` — remove the `gs-behave-bdd.featuresPath` schema entry. Keep `gs-behave-bdd.featuresPaths`.
- **D-15:** `src/settings.ts` — remove the `featuresPath` strict-undefined throw at L132-L134, the precedence-ladder Rung 2 branch at L212-L214, the `hasExplicitSetting(wkspConfig, "featuresPath", ...)` info-log branch at L196-L202, and the `featuresPath`-named fatal error string at L234. The collapsed ladder is: plural → config-file → convention. The strict-undefined pattern still applies to the surviving `featuresPaths` read.
- **D-16:** `src/common.ts` — remove the `featuresPath` references in the `hasFeaturesFolder()` discovery branch at L208, L212, L256-L283. The Branch A (explicit settings) gate becomes: `hasExplicitSetting(wkspConfig, "projectPath", legacyWkspConfig) || hasExplicitNonEmptyArraySetting(wkspConfig, "featuresPaths")`. The featuresPath-specific warning notification at L274-L281 is removed; the plural ladder produces equivalent diagnostics via existing per-path resolution at `src/settings.ts:232-234`.
- **D-17:** `src/testWorkspaceConfig.ts` — drop the `featuresPath` private field, constructor parameter, `get()`/`inspect()` switch cases at L88-L89/L145-L146/L252, and the `getExpectedFeaturesPath()` helper at L205-L218 (or rewrite it to read from `featuresPaths[0]`). Update all 6+ test fixture call sites that pass `featuresPath` to the constructor — they become positional `undefined` or get removed depending on signature.

### Activation Loop Ordering (D-18)
- **D-18:** In `src/extension.ts` `activate()`, the existing per-workspace migration loop (added in Phase 15) gains a second migration call. Order: featuresPath migration FIRST (data shape), then suppressMultiConfig migration (UX-suppression cleanup). After both, `await config.reloadSettings(wkspUri)` once. Both migrations wrapped in the existing defense-in-depth try/catch. The featuresPath notification fires AFTER the loop (it depends on `suppressedNotifications` being current, which means after the suppression migration has populated it).

### Claude's Discretion
- Exact internal API shape of the extracted primitive (parameter ordering, generic constraints, callback signatures). The user gave the strategic choice (Option B); the planner picks the type signature.
- Whether the primitive lives in `src/notifications.ts` (keeps related code colocated) or in a new `src/settingsMigration.ts` (separation of concerns). Both are defensible.
- Whether the wrapper for `behave-vsc.featuresPath` is a separate function or a parameter to `migrateLegacyFeaturesPath`. Behavior-equivalent either way.
- Final notification message wording within the constraint of D-12.
- Test coverage strategy for the primitive vs the wrappers (unit tests for primitive directly, or coverage via wrappers only).
- Whether `behaveLoaderNestedProject.test.ts` (filename references singular `featuresPath` in a comment) gets renamed/updated in this phase or left alone (cosmetic).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 15 patterns to mirror and refactor
- `src/notifications.ts` — Phase 15's `migrateLegacySuppressMultiConfig` (L90-L130) is the structural template. Phase 16 extracts the common pattern (D-MOD) and refactors this helper to call it.
- `.planning/phases/15-notification-suppression/15-CONTEXT.md` — Phase 15 decisions; D-05/D-07/D-09/D-11 carry forward.
- `.planning/phases/15-notification-suppression/15-RESEARCH.md` — Pitfalls 1-5 (especially Pitfall 2: `inspect()` per-scope vs `cfg.get()` merged scopes; Pitfall 4: `reloadSettings` after migration).
- `.planning/phases/15-notification-suppression/15-VALIDATION.md` — A1 probe contract (`inspect()` of unregistered key returns defined-shape object even after schema removal). Phase 16 relies on this same contract for `featuresPath` after schema removal.

### featuresPath touchpoints (must be removed/updated in DEP-05)
- `src/settings.ts` §L132-L134 — strict-undefined throw on `featuresPath` get. Remove.
- `src/settings.ts` §L188-L223 — precedence ladder Rungs 1-4. Collapse to 3 rungs (plural → config-file → convention).
- `src/settings.ts` §L196-L202 — info-log branch when both singular and plural set at any scope. Remove (no singular to compare against).
- `src/settings.ts` §L212-L214 — Rung 2 (singular-explicit-set). Remove.
- `src/settings.ts` §L234 — fatal error string mentioning `gs-behave-bdd.featuresPath`. Update to reference plural.
- `src/common.ts` §L195-L285 — `hasFeaturesFolder()` discovery branch. Remove all `featuresPath` references; rewrite the explicit-settings gate to check `projectPath` and plural-only.
- `src/testWorkspaceConfig.ts` §L16, L31, L39, L56, L88-L89, L145-L146, L205-L218, L252 — mock for singular. Drop entirely.
- `package.json` §L38-L43 — schema entry for singular. Remove.
- `src/extension.ts` §L936, §L1002 — comments referencing `featuresPath`. Update to plural-only.

### Settings ladder reference (precedence semantics that survive)
- `src/settings.ts` §L188-L229 (post-cleanup) — collapsed ladder.
- `src/settings.ts` §L232-L234 — per-entry "." rejection in plural array. Survives; covers the migrated-`"."` case (D-09).

### Test fixture cascade
- `test/unit/settings/discoveryPriority.test.ts` §L70-L100 — tests reference singular `featuresPath` directly via `hasExplicitSetting`. Must be updated or removed in DEP-07.
- `test/unit/parsers/behaveLoaderNestedProject.test.ts` — filename comments mention singular `featuresPath` (cosmetic; functional behavior tests resolved features path, which is unaffected).
- `test/unit/testWorkspaceConfig.test.ts` and any fixture file constructing `TestWorkspaceConfig` — call sites passing `featuresPath` positional arg must be updated for D-17.

### Project-level
- `.planning/REQUIREMENTS.md` — DEP-01..DEP-07 acceptance criteria.
- `.planning/PROJECT.md` — milestone v1.4.0 framing; "Auto-migration ensures users with `featuresPath` see zero behavior change" constraint.
- `.planning/ROADMAP.md` — Phase 16 goal, success criteria, depends-on Phase 15.

### Verification debt to be aware of (NOT Phase 16 scope)
- `.planning/phases/15-notification-suppression/15-HUMAN-UAT.md` — 2 pending items deferred to Phase 17 (real-VSCode confirmation of A1 probe + integration smoke). Phase 16 inherits the same A1 probe assumption — its own real-VSCode confirmation also rolls up to Phase 17.
- `.planning/phases/04-watcher-run-guard/04-HUMAN-UAT.md` — 5 pending items, status partial. Older debt; not Phase 16's responsibility.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/notifications.ts` `showSuppressibleNotification(key, message, buttons, wkspUri)` — Phase 15 wrapper; auto-appends "Don't Show Again" and handles suppression internally. Phase 16 calls this with key `featuresPathMigration` and buttons `["Open Settings"]`.
- `src/notifications.ts` `migrateLegacySuppressMultiConfig` — structural template for the new helper; will be refactored to call the extracted primitive (D-MOD).
- `src/notifications.ts` constant `DONT_SHOW_AGAIN` — already defined; reused implicitly via the wrapper.
- `src/configuration.ts` `config.reloadSettings(wkspUri)` — already called in the Phase 15 activation loop after migration; Phase 16 reuses the same call.
- `src/common.ts` `hasExplicitSetting(cfg, key, legacyCfg)` — already supports two-namespace lookup; Phase 16's helper inspects each namespace directly via `inspect()`, but the `hasExplicitSetting` helper itself can survive (it's used elsewhere) or be retired alongside the singular reads.
- VS Code commands `workbench.action.openSettings` with arg `@ext:formlabs.gs-behave-bdd` — for the "Open Settings" button.

### Established Patterns
- Per-workspace migration loop in `activate()` (Phase 15) wraps the helper in try/catch + `reloadSettings`. Phase 16 adds a second helper call to the same loop without changing the surrounding shape.
- `inspect()` per-scope reads (Pitfall 2) — every migration scope-detection ladder uses `insp.workspaceFolderValue ?? insp.workspaceValue ?? insp.globalValue` semantics, never `cfg.get()`.
- `vscode.ConfigurationTarget` enum values (1/2/3) — `test/unit/vscode.mock.ts` already has the enum from Phase 15 Plan 02 (Rule 3 deviation). No mock-side change needed for Phase 16.
- Strict-undefined throws on registered settings (`throw "key is undefined"`) — Phase 16 keeps this for the surviving `featuresPaths` read; removes for the disappearing `featuresPath` read.

### Integration Points
- `src/extension.ts` `activate()` per-workspace loop — second migration call added here.
- `src/extension.ts` notification firing site — after the migration loop completes and `reloadSettings` has run, conditionally fire `showSuppressibleNotification` per workspace folder where the helper returned `true`.
- `src/settings.ts` precedence ladder — collapses by 1 rung after singular reads removed.
- `src/common.ts` discovery branch — `hasFeaturesFolder()` simplifies; warning text adjusted.

</code_context>

<specifics>
## Specific Ideas

- The extracted primitive (D-MOD) is the load-bearing structural decision of this phase. The user explicitly chose Option B (extract a shared primitive) over Option A (consistency only) and Option C (full registry/framework). The refactor of Phase 15's `migrateLegacySuppressMultiConfig` is in-scope and intentional; the regression bar is "all 8 existing sub-cases still pass."
- The notification button is "Open Settings" (not "Learn More" or no extra buttons). The button should open settings UI scoped to `@ext:formlabs.gs-behave-bdd` (matches VS Code's standard pattern for extension-scoped settings).
- Both `gs-behave-bdd.featuresPath` AND `behave-vsc.featuresPath` get migrated to `gs-behave-bdd.featuresPaths`. The legacy fork namespace `behave-vsc` is the source, never the destination.
- Empty/whitespace-only legacy values are silently dropped (legacy key removed, plural unchanged). Default-equivalent values (`"features"`) and known-fatal values (`"."`) are migrated literally — the existing plural-array per-entry guards handle them.

</specifics>

<deferred>
## Deferred Ideas

- **Migration registry/framework (Option C from discussion).** Declarative `SettingsMigration[]` with `id`, `transform`, `shouldMigrate`, `userVisible`, `notificationKey`, `runMigrations(wkspUri)` orchestrator. Defer until a 3rd concrete migration appears (e.g., a future `discoveryDepth` rename or type change) — designing the abstraction with only 2 known cases risks getting it wrong for case #3. Capture in milestone backlog.
- **`behave-vsc` namespace deprecation track.** Phase 16 migrates `behave-vsc.featuresPath` because the user asked for it, but the broader question of "kill all `behave-vsc` legacy reads" (other settings, namespace warnings, eventual removal) is its own deprecation cycle. Not a Phase 16 responsibility.
- **CHANGELOG/README updates.** No CHANGELOG file is currently maintained in this repo. Adding one is out of scope. README updates for the deprecation may roll into Phase 17 cross-cutting verification or a milestone-close docs pass.
- **Renaming `behaveLoaderNestedProject.test.ts`** (filename comments reference singular `featuresPath`). Cosmetic; functional behavior is unaffected. If the planner finds it cheap to update during the test fixture cascade, it's fine; otherwise leave alone.
- **A unified `migrate*` orchestrator function.** A single `runAllSettingsMigrations(wkspUri)` that calls both Phase 15 and Phase 16 helpers and returns a per-migration result map. Possibly a natural follow-up to D-MOD if the activation-loop call site grows past 2 migrations. Not Phase 16 scope.

</deferred>

---

*Phase: 16-deprecate-featurespath*
*Context gathered: 2026-04-28*
