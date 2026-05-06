# Phase 16: Deprecate featuresPath - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-28
**Phase:** 16-deprecate-featurespath
**Areas discussed:** Collision policy, Value filtering, Notification UX, Legacy namespace scope, Modularity (user-raised)

---

## Collision Policy

### Same-scope: BOTH `featuresPath` AND `featuresPaths` set at the same scope

| Option | Description | Selected |
|--------|-------------|----------|
| Drop singular, keep plural untouched (Recommended) | Just `update('featuresPath', undefined, sameScope)`. Plural already wins by precedence — singular was being ignored anyway. Cleanest semantics. | |
| Merge singular into plural array (with dedup) | If singular value isn't already in plural array, append before removing legacy. Mirrors Phase 15's dedup-merge pattern more literally. Risk: surprises user by promoting an actively-ignored value. | ✓ |
| Skip migration entirely on this scope | Leave both keys alone. Worst-of-both. | |

**User's choice:** Merge singular into plural array (with dedup)
**Notes:** User overrode the recommendation — preference for the Phase 15 pattern parallel over the "ignored value stays ignored" semantic.

### Cross-scope: `featuresPath` at one scope, `featuresPaths` at a different scope

| Option | Description | Selected |
|--------|-------------|----------|
| Treat each scope independently (Recommended) | Migrate `featuresPath` at its scope. User now has `featuresPaths` at both scopes; workspaceFolder wins by precedence — same effective behavior, just keys renamed. | ✓ |
| Migrate only if it would not be shadowed | Skip when a more-specific scope already has plural. Avoids creating redundant lower-priority entry. Adds non-trivial cross-scope check that's hard to test exhaustively. | |

**User's choice:** Treat each scope independently
**Notes:** Recommended option chosen.

---

## Value Filtering

### Which singular values trigger migration into plural?

| Option | Description | Selected |
|--------|-------------|----------|
| Skip empty/whitespace-only strings (Recommended) | If `featuresPath: ''` or `'   '`, just remove the legacy key without writing to plural. No user data worth preserving. | ✓ |
| Skip values that equal `'features'` (the default) | Avoids polluting plural with a redundant default-equivalent entry. | |
| Skip `'.'` | Already a fatal error per `src/settings.ts:233`. Drop silently rather than carry a known-bad value forward. | |
| Migrate everything literally (no filtering) | Every non-undefined value gets normalized and merged. Simplest semantic. | |

**User's choice:** Skip empty/whitespace-only strings only
**Notes:** Implies `'features'`, `'.'`, and any custom value all get migrated. The `'.'` case will continue to trigger the existing per-entry fatal-error guard at `src/settings.ts:233` once it lands in the plural array — preserves current behavior.

---

## Notification UX

### Helper return type — how does the caller know to fire the notification?

| Option | Description | Selected |
|--------|-------------|----------|
| Return `Promise<boolean>` — true if migrated, false if no-op (Recommended) | Caller branches: `if (migrated) await showSuppressibleNotification(...)`. Diverges from Phase 15's `Promise<void>`, but the semantic is genuinely different — Phase 15 was silent cleanup, Phase 16 is user-visible. | ✓ |
| Always fire, but message is conditional | Helper still returns void; caller fires unconditionally with conditional text. Over-fires for users who never had `featuresPath` set. | |
| Helper itself fires the notification internally | Couples a settings-migration utility to UX output. Tests get harder. | |

**User's choice:** Return `Promise<boolean>`

### Notification scope — multiple workspace folders

| Option | Description | Selected |
|--------|-------------|----------|
| One per workspace folder that migrated (Recommended) | Matches per-workspace activation loop. Per-folder dismissal scoping; suppression key (single string) means dismissal in any folder silences subsequent folders. | ✓ |
| One coalesced notification per window | Less noisy but adds coordination state and breaks per-folder suppression scoping. | |

**User's choice:** One per migrated workspace folder

### Notification buttons

| Option | Description | Selected |
|--------|-------------|----------|
| No extra buttons — just Don't Show Again (Recommended) | One-line, fire-and-forget. User has nothing to do. | |
| Add `Open Settings` button | Opens settings.json scoped to `gs-behave-bdd`. Useful for inspection. | ✓ |
| Add `Open Changelog` / `Learn More` button | Adds docs dependency. | |

**User's choice:** Add `Open Settings` button
**Notes:** User overrode the recommendation — wants the user to have a path to inspect the result.

### Suppression key

| Option | Description | Selected |
|--------|-------------|----------|
| `featuresPathMigration` (Recommended) | camelCase, parallel to Phase 15's `multiConfigNotification`. Fits D-09 from Phase 15. | ✓ |
| `deprecateFeaturesPath` | Mirrors phase name in ROADMAP.md. Slightly verbose. | |
| `featuresPathDeprecation` | Alternative wording. | |

**User's choice:** `featuresPathMigration`

---

## Legacy Namespace Scope

### Should helper migrate `behave-vsc.featuresPath` too?

| Option | Description | Selected |
|--------|-------------|----------|
| Only `gs-behave-bdd.featuresPath` — leave `behave-vsc.*` untouched (Recommended) | Matches Phase 15's scope discipline. behave-vsc legacy is its own deprecation track. Users with only behave-vsc.featuresPath set lose discovery (already on borrowed time). | |
| Migrate both namespaces in the same helper | Helper checks both, migrates whichever exists. Doubles inspect/update surface. Pulls users out of a hole. | ✓ |
| Migrate behave-vsc.featuresPath to behave-vsc.featuresPaths | Awkward — we don't really maintain that namespace. | |

**User's choice:** Migrate both namespaces in the same helper
**Notes:** User overrode the recommendation. Helper migrates from BOTH `gs-behave-bdd.featuresPath` AND `behave-vsc.featuresPath` into the canonical destination `gs-behave-bdd.featuresPaths`. `behave-vsc.featuresPaths` is never written.

### Fallback for users who don't get migrated (e.g., update fails)

| Option | Description | Selected |
|--------|-------------|----------|
| Fall back to convention (features/) — no special handling (Recommended) | Silently ignored after upgrade; if `features/` exists, discovery works; otherwise existing "Features path not found" warning fires. | ✓ |
| Add a one-time warning notification | Tells user to manually set featuresPaths. Adds scope. | |

**User's choice:** Fall back to convention — no special handling

---

## Modularity (User-Raised)

> User asked: "I want this migration system to be modular, meaning we can extend it to more settings in the future. Is our current design ready for that?"

Honest answer given to user: No, not yet. Current design = two hand-written, single-purpose functions sharing a structural pattern but no actual code. Three options laid out:

| Option | Description | Selected |
|--------|-------------|----------|
| A — Shape consistency only | No shared code. Phase 16 helper mirrors Phase 15's shape verbatim. Migration #3 still copy-paste. Zero scope creep, cliff stays. | |
| B — Extract a shared primitive (Recommended) | Add internal `migrateAtSameScope<TLegacy, TNew>()` helper. Refactor Phase 15's helper to call it. Phase 16's helper as another wrapper. Migration #3 = ~15 lines. ~50-line refactor in Phase 15 code. | ✓ |
| C — Build a migration registry/framework | Declarative `SettingsMigration[]`, `runMigrations(wkspUri)` orchestrator. Significantly expands Phase 16 scope; risks getting abstraction wrong with only 2 cases. | |
| Defer modularity decision to a later phase | Build Phase 16 standalone. Capture as deferred idea. | |

**User's choice:** B — Extract a shared primitive
**Notes:** User accepts that Phase 16 PR will modify already-shipped Phase 15 code. Regression bar: all 8 existing `migrateLegacySuppressMultiConfig` sub-cases must still pass after the refactor.

---

## Claude's Discretion

- Exact internal API shape of the extracted primitive (parameter ordering, generic constraints, callback signatures).
- Whether the primitive lives in `src/notifications.ts` or a new `src/settingsMigration.ts`.
- Whether the wrapper for `behave-vsc.featuresPath` is a separate function or a parameter to `migrateLegacyFeaturesPath`.
- Final notification message wording within the constraint of D-12.
- Test coverage strategy for the primitive (direct unit tests vs coverage via wrappers only).
- Whether `behaveLoaderNestedProject.test.ts` filename comments get updated cosmetically or left alone.

## Deferred Ideas

- Migration registry/framework (Option C from modularity discussion) — defer until 3rd concrete migration appears.
- `behave-vsc` namespace deprecation track — broader question, not Phase 16 scope.
- CHANGELOG/README updates — no CHANGELOG file maintained currently.
- Renaming `behaveLoaderNestedProject.test.ts` — cosmetic; planner discretion.
- A unified `runAllSettingsMigrations(wkspUri)` orchestrator — possible natural follow-up to D-MOD.
