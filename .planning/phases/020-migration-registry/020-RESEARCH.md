# Phase 20: Migration Registry - Research

**Researched:** 2026-05-08
**Domain:** VS Code extension settings migration — populating Phase 19's evaluator registry
**Confidence:** HIGH

## Prior Art / Reusable Tooling (USER QUESTION)

> The user explicitly asked whether there are existing tools, libraries, or established
> patterns we should consider before rolling our own registry. Answered up-front so it
> isn't buried.

### TL;DR Recommendation

**Stay with the bespoke `MigrationEntry` registry from Phase 19.** No third-party tool
or VS Code API meaningfully simplifies what Phase 20 has to do. Phase 19 has already
shipped (verifier PASS, 739/739 tests, locked decisions D-01..D-04 in `019-CONTEXT.md`)
and the registry's per-scope, three-case semantics are tighter than anything off the
shelf provides. There is no realistic pivot — the question is whether to *augment*,
not replace, and the answer is "no" for v1.5.0.

### 1. Does VS Code's API surface anything for settings migration?

**No.** VS Code does not provide a settings-migration API. This is confirmed in the
official `microsoft/vscode-discussions` thread #862, which is the canonical question
on the topic [CITED: github.com/microsoft/vscode-discussions/discussions/862]. The
recommended pattern from VS Code maintainers is exactly what this codebase already
does:

1. Register the new setting in `package.json` (already done — `featuresPaths`,
   `suppressedNotifications`, and the v1.5.0 `migrationMode` / `completedMigrations`).
2. Programmatically copy from old → new via `WorkspaceConfiguration.update()`
   (already done — that's what `migrateScopedSetting` is).
3. Add a `deprecationMessage` on the old key in `package.json` so the Settings UI
   warns users (this codebase deliberately doesn't, because the legacy keys live in
   the *other* extension's namespace `behave-vsc.*` — we can't add a
   `deprecationMessage` to a key we don't own).
4. Eventually remove the read path (CLEANUP-01 in Phase 22).

What VS Code *does* provide for cross-extension migration is the
**deprecated-extension Migrate button** [CITED: code.visualstudio.com/updates/v1_68]:
the deprecating extension's `package.json` declares `"deprecated": { "extension":
"newPublisher.newId" }` and VS Code surfaces a UI button. That mechanism is irrelevant
here because `behave-vsc` is *not* under our control — we cannot add a deprecation
field to its `package.json`. The migration has to be driven from the *consuming*
side, which is exactly what the registry does.

[VERIFIED: github discussion #862 confirms no built-in API, recommends pattern matching
what this codebase already implements].

### 2. Are there npm packages widely used for config-migration runners?

The packages that show up consistently are `electron-store` and `conf` (both
sindresorhus), plus `electron-conf` (alex8088) and the more general `migrat`.
[CITED: npmjs.com/package/electron-store, npmjs.com/package/conf,
github.com/alex8088/electron-conf, npmjs.com/package/migrat]. None of them fit:

| Tool | Why It Doesn't Apply |
|------|----------------------|
| `electron-store` / `conf` | Migrate a JSON file *they own* across version numbers. We don't own the storage — VS Code does. The whole point of `cfg.inspect()`/`cfg.update()` per `ConfigurationTarget` is that we reach into VS Code's per-scope storage; a generic store can't see scopes. |
| `electron-conf` | Same as above; safer Electron-renderer story irrelevant in an extension host. |
| `migrat` | A SQL-ish migration runner with up/down scripts and version tracking. Wrong shape: we don't need ordered migrations, we need a *set* of independent (entry × scope × user-choice) classifications evaluated each activation. |

Generic migration runners assume "migrate from version N to version N+1 once,
forever." Our shape is "for every user, every workspace, every scope, classify each
entry into case 1/2/3 and sometimes wait for a user prompt." There's no version
number — there's a `completedMigrations: string[]` per scope (CONSENT-07) that the
user can edit. None of the off-the-shelf runners model that.

[VERIFIED: package READMEs reviewed; all assume self-owned storage and linear version
progression — neither applies here].

### 3. How do other large VS Code extensions handle setting renames?

Concrete prior art is sparse and small in scope:

- **vscode-eslint** ships an `ESLint: Migrate Settings` command that prompts users
  to convert `eslint.autoFixOnSave` → `editor.codeActionsOnSave` format [CITED:
  search result on `microsoft/vscode-eslint`]. This is a **single-key**, command-driven
  migration — much smaller than v1.5.0's 17-entry registry — but the *shape* is
  similar to our Recheck Migrations command (Phase 19 Plan 03, already shipped).
  Confirms our chosen UX is in line with established practice.

- **GitLens** uses `deprecationMessage` on legacy keys plus internal one-shot
  migration code; no public abstraction emerged. Documentation emphasizes "grouped
  settings" as the *organizational* alternative to migration, which the discussion
  thread also recommends [CITED: github.com/microsoft/vscode-discussions/discussions/862].

- **vscode-azure-account** has a "Migration Guide" but it's user-facing prose, not
  a code abstraction [CITED: deepwiki.com/microsoft/vscode-azure-account/9-migration-guide].

The pattern is uniform: **each extension hand-rolls its migration code**. There is
no community-blessed library. Most extensions migrate one or two settings, so they
write a few `inspect()`/`update()` calls inline. Phase 19 + 20 is more ambitious
(per-scope, per-entry, per-user-consent) and the registry shape is the right
abstraction for *this* problem.

### 4. Recommendation

Stay with the bespoke registry. Specifically:

- **Do not add a runtime dependency.** No `electron-store`, no `migrat`. They model
  the wrong storage and the wrong lifecycle.
- **Do not abstract beyond `MigrationEntry`.** Phase 19 D-04 locks an interface
  that's exactly the right size: `{ id, sourceNamespace, sourceKey, destNamespace,
  destKey, transform }`. Going broader (e.g. supporting `sourceNamespace: string |
  string[]`) was already rejected in `020-CONTEXT.md` D-A4.5 — the per-namespace
  Finished tracking would break.
- **What *does* simplify the per-entry code** is the `makePlainEntry` factory
  (D-A3.1, `src/migrations/plain.ts`) — that's 10 of the 17 entries reduced to
  one-liners. That's already in the plan.
- **What *does* simplify testing** is leaning hard on the `makePerKeyScopedConfig`
  helper from `test/unit/notifications.test.ts` (Phase 15 Plan 03) and the
  `migrations.test.ts` patterns from Phase 19 — they already work for "stub
  inspect() per scope and assert update() spies." The new tests should import
  those helpers, not reinvent them.

The only library decision in front of Phase 20 is whether to write the deep-merge
utility for `envVarPresets`/`envVarOverrides` from scratch or pull in something like
`lodash.merge`. Recommendation: **write it from scratch**. The shape is small (`mergeRecord<T>(legacy, canonical, mergeValue)` per D-A3.1), the project has no
lodash dep today (verified by `package.json`), and adding lodash for a 15-line
utility is bundle-size waste against the project's "lightweight" constraint
(CLAUDE.md). [VERIFIED: package.json scan — no lodash dep present; smol-toml is
the only recent addition.]

---

## Summary

Phase 20 is a refactor + module-creation phase, not new-territory research. The
evaluator (Phase 19) already exists and consumes a `MigrationEntry[]`; Phase 20
populates it with 17 entries, lifts the two existing v1.4.0 transform bodies into
the new `src/migrations/` directory, and deletes the silent activation-time call
sites at `src/extension.ts:348-349`. The registry shape is locked by Phase 19 D-04
and the file layout is locked by `020-CONTEXT.md` D-A3.

**Primary recommendation:** Land Phase 20 as four tightly-scoped plans paralleling
the four group files (`plain.ts`, `featuresPath.ts`, `suppressedNotifications.ts`,
`envPresets.ts`), each with co-located tests, then a final wiring plan that swaps
the empty registry import for the populated one and deletes the activation-time
silent-migration calls. No new dependencies, no new evaluator API, no new test
framework.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Migration entry definitions | `src/migrations/*.ts` | — | New module per D-A3.1 — pure data + transform fns |
| Transform functions (mergeRecord, featuresPathMergeWithDedup, suppressMultiConfigToArray) | `src/migrations/*.ts` | `src/common.ts` (uses `normalizeFeaturesPathEntry`) | Lifted from `src/notifications.ts:267-279, 325-343` |
| Per-scope inspect/write/clear semantics | `src/notifications.ts` (`migrateScopedSetting`) | — | Phase 19 boundary D-01 — primitive untouched |
| Case 1/2/3 classification | `src/migrations/evaluator.ts` (Phase 19) | — | No changes — evaluator just consumes the populated registry |
| Activation-time wiring | `src/extension.ts` | — | Delete L348-L349 silent calls; Phase 19 evaluator already runs at activation |
| Phase 21 prompt UX | (not in scope) | — | Deferred — Phase 20 only ships case-2 path through the case-1 sub-cases |

## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-A1.1 / D-A1.2 / D-A1.3** — Register all 15 keys that `getWithLegacyFallback`
currently reads as `behave-vsc.<key>` → `gs-behave-bdd.<key>` migration entries,
even keys that almost certainly never existed in `behave-vsc`. Inventory locked at:
`featuresPath`, `projectPath`, `runParallel`, `justMyCode`, `xRay`, `verboseLogging`,
`multiRootRunWorkspacesInParallel`, `importStrategy`, `stepDefinitionSearchTimeout`,
`discoveryDepth`, `discoveryStopOnFirstHit`, `suppressedNotifications`,
`activeEnvVarPreset`, `envVarPresets`, `envVarOverrides`.

**D-A2.1 / D-A2.2 / D-A2.3 / D-A2.4** — Object-shaped transforms for
`envVarPresets` / `envVarOverrides` deep-merge at preset-level AND var-level. Case 2
(canonical empty at scope) → straight copy. Case 3 → Phase 21 (the deep-merge
utility ships in Phase 20 but its case-3 caller wires up in Phase 21). Arrays use
the established v1.4.0 append-with-dedup pattern.

**D-A3.1 / D-A3.2 / D-A3.3 / D-A3.4** — File layout `src/migrations/` with files
`index.ts`, `types.ts`, `plain.ts`, `featuresPath.ts`, `suppressedNotifications.ts`,
`envPresets.ts`. Tests beside entries. Single import surface from `./migrations`.
Old `src/notifications.ts:261, 316` exports may stay as thin wrappers IF tests
still depend on them (planner decides at plan time after grepping callers).

**D-A4.1 / D-A4.2 / D-A4.3 / D-A4.4 / D-A4.5** — `migrateLegacyFeaturesPath`
becomes 2 entries (`featuresPath-self`, `featuresPath-from-behavevsc`) sharing one
`featuresPathMergeWithDedup` transform. `migrateLegacySuppressMultiConfig` becomes
1 entry (`suppressMultiConfig-self`). Final count: 17 entries (15 cross-namespace
+ 2 intra-namespace). Reject extending `MigrationEntry` to allow `sourceNamespace:
string | string[]`.

**D-A5.1 / D-A5.2** — Idempotency is a property of the Phase 19 evaluator, not of
individual entries. TEST-04 covers two dimensions per entry: (a) skip via
`completedMigrations`, (b) case-1 silent finish.

**D-A6.1 / D-A6.2** — Delete silent activation-time calls in `src/extension.ts:
348-349`. No new activation-time hook.

### Claude's Discretion

- Whether to delete the `migrateLegacyFeaturesPath` / `migrateLegacySuppressMultiConfig`
  exports entirely or keep them as thin wrappers (D-A3.4) — planner decides after
  grepping callers.
- Entry id naming convention (`<key>-from-behavevsc` / `<key>-self`) is a
  recommendation in `<specifics>`, not locked. Planner can refine.
- `makePlainEntry` factory signature shape is suggested in `<specifics>` but the
  exact TypeScript shape is at planner discretion.

### Deferred Ideas (OUT OF SCOPE)

- **Case 3 prompt actions** (`overwrite-and-delete` / `overwrite-and-keep` /
  `keep-canonical-and-delete-legacy` / `keep-both`) — Phase 21.
- **Per-migration `migrationMode`** — out of scope for v1.5.0.
- **Removing `behave-vsc.*` reads from `src/configuration.ts` /
  `src/common.ts:214` / `src/discovery/projectList.ts:179`** — CLEANUP-01,
  Phase 22.
- **Schema validation of migrated values** (e.g. checking enum legality before
  copying) — not required by MIGRATE-03; existing `WorkspaceSettings` constructor
  validation surfaces bad values.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MIGRATE-01 | `migrateLegacyFeaturesPath` registered as registry entry; no silent activation auto-migration | Existing transform body at `src/notifications.ts:316-348` lifts to `src/migrations/featuresPath.ts`; activation call at `extension.ts:349` deleted (D-A6.1). Two entries per D-A4.1. |
| MIGRATE-02 | `migrateLegacySuppressMultiConfig` registered as registry entry | Existing transform body at `src/notifications.ts:261-282` lifts to `src/migrations/suppressedNotifications.ts`; activation call at `extension.ts:350` deleted. One entry per D-A4.3. |
| MIGRATE-03 | New `behave-vsc` → `gs-behave-bdd` entries for every silent-fallback key | 15-key inventory locked in D-A1.3, all routed through `makePlainEntry` factory except the 4 transform-bearing keys (`featuresPath`, `suppressedNotifications`, `envVarPresets`, `envVarOverrides`). |
| TEST-04 | Unit tests per registered legacy → canonical pair + idempotency | Test pattern from `test/unit/migrations.test.ts` (Phase 19) with `makePerKeyScopedConfig` helper; per D-A5.2 cover (a) `completedMigrations` skip, (b) case-1 silent finish. Plus per-transform unit tests for the four non-plain transforms. |

## Standard Stack

### Core (already in repo — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 4.5.5 | Source language | Project standard; strict mode |
| `vscode` (types) | ^1.82.0 | `ConfigurationTarget`, `WorkspaceConfiguration.inspect/update` | The only legitimate way to read/write per-scope settings |
| Mocha | 9.2.2 | Test framework | Project standard; `npm run test:unit` runner |
| Sinon | 21.0.1 | Stubs/spies for `inspect()`/`update()` | Established in `notifications.test.ts` and `migrations.test.ts` |

### Supporting (already in repo)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `migrateScopedSetting` (internal) | n/a | Same-scope inspect/write/clear primitive | Every transform routes through it via the evaluator (MIGRATE-07) |
| `normalizeFeaturesPathEntry` (`src/common.ts`) | n/a | Path normalization for dedup comparison | The `featuresPathMergeWithDedup` transform imports this verbatim |
| `makePerKeyScopedConfig` (test helper, `test/unit/migrations.test.ts:33`) | n/a | Stub `inspect()` per scope per key | Reuse in every Phase 20 test file — do not duplicate |

### Alternatives Considered (and rejected — see Prior Art section above)

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Bespoke `MigrationEntry` registry | `electron-store` migrations | Wrong storage model — assumes self-owned JSON; can't see VS Code scopes [CITED: npmjs.com/package/electron-store] |
| Hand-rolled deep merge for `envVarPresets` | `lodash.merge` | Adds runtime dep for ~15 LOC; project has no lodash today and lightweight bundle is a CLAUDE.md constraint |
| 15 separate plain entries | `MigrationEntry[]` extended with `sourceNamespace: string \| string[]` | Rejected by D-A4.5: breaks per-namespace Finished tracking |
| Generic migration runner | `migrat` | Wrong lifecycle — assumes linear version progression; we need per-(entry × scope × user) classification [CITED: npmjs.com/package/migrat] |

**Installation:** No new packages. The `npm view smol-toml version` check confirms
the only recently added dep (1.6.1) and is unrelated to migrations. [VERIFIED:
`npm view` against the registry, 2026-05-08].

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│ extension.ts activate()                                                 │
│   ├── (DELETE: migrateLegacyFeaturesPath / migrateLegacySuppressMulti)  │ <-- D-A6.1
│   └── for each wkspUri:                                                 │
│         await evaluateAllMigrations(wkspUri, hooks)  ──┐                │
└────────────────────────────────────────────────────────┼────────────────┘
                                                        │
                                                        ▼
            ┌─────────────────────────────────────────────────────┐
            │ src/migrations/evaluator.ts (Phase 19 — UNTOUCHED)  │
            │   for each entry in MIGRATION_REGISTRY:             │
            │     for each scope in [Global, Wksp, WkspFolder]:   │
            │       classify case 1 / 2 / 3                       │
            │       case 1 → markFinished + onCaseHit(1, ...)     │
            │       case 2/3 → onCaseHit + 'pending-user-choice'  │
            │       (Phase 21 hook fires prompts)                 │
            └─────────────────────┬───────────────────────────────┘
                                  │ reads
                                  ▼
            ┌─────────────────────────────────────────────────────┐
            │ src/migrations/index.ts                              │ <-- NEW (Phase 20)
            │   export const MIGRATION_REGISTRY = [                │
            │     ...plainEntries,           // 11 from plain.ts   │
            │     ...featuresPathEntries,    //  2 from featuresPath.ts │
            │     suppressMultiConfigEntry,  //  1 from suppressedNotifications.ts │
            │     ...envPresetEntries,       //  2 from envPresets.ts │
            │   ]; // total 17 (D-A4.4)                            │
            └─────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
            ┌─────────────────────────────────────────────────────┐
            │ src/notifications.ts migrateScopedSetting (UNTOUCHED)│
            │   primitive — same-scope inspect/write/clear         │
            │   invoked by Phase 21's case-2/case-3 actions through│
            │   the entry's transform                              │
            └─────────────────────────────────────────────────────┘
```

### Recommended Project Structure (locked by D-A3.1)

```
src/migrations/
├── index.ts                       # barrel + aggregated MIGRATION_REGISTRY
├── types.ts                       # MigrationEntry shape (Phase 19 — extend if needed)
├── registry.ts                    # (Phase 19 — REPLACE empty array with imports from grouping files)
├── evaluator.ts                   # (Phase 19 — UNTOUCHED)
├── completedMigrations.ts         # (Phase 19 — UNTOUCHED)
├── recheckCommand.ts              # (Phase 19 — UNTOUCHED)
├── plain.ts                       # NEW — makePlainEntry factory + 11 cross-ns entries
├── featuresPath.ts                # NEW — featuresPathMergeWithDedup + 2 entries
├── suppressedNotifications.ts     # NEW — suppressMultiConfigToArray + 1 entry
└── envPresets.ts                  # NEW — mergeRecord + 2 entries

test/unit/migrations/              # OR co-located src/migrations/*.test.ts (D-A3.2 — beside entries)
├── plain.test.ts
├── featuresPath.test.ts
├── suppressedNotifications.test.ts
└── envPresets.test.ts
```

> **Note on test colocation:** D-A3.2 says "Tests sit beside the entries:
> `src/migrations/featuresPath.test.ts`". The existing project convention is
> `test/unit/<area>/`. Planner should confirm at plan time which the team prefers.
> The Phase 19 tests live at `test/unit/migrations.test.ts`. Recommend adding new
> test files to `test/unit/migrations/` (subdirectory) for parity with Phase 19,
> not co-locating in `src/`. [ASSUMED: project convention — verify at plan time].

### Pattern 1: `makePlainEntry` factory (D-A3.1)

**What:** Produce a `MigrationEntry` for a `behave-vsc.<key>` → `gs-behave-bdd.<key>`
plain-copy migration in one line.
**When to use:** The 11 keys that have no transform — straight value copy.
**Example:**
```typescript
// src/migrations/plain.ts
import type { MigrationEntry } from './types';

export function makePlainEntry<T>(sourceKey: string, destKey: string = sourceKey): MigrationEntry<T, T> {
  return {
    id: `${sourceKey}-from-behavevsc`,
    sourceNamespace: 'behave-vsc',
    sourceKey,
    destNamespace: 'gs-behave-bdd',
    destKey,
    transform: (src) => ({ kind: 'write', value: src }),
  };
}

export const plainEntries: readonly MigrationEntry[] = [
  makePlainEntry<string>('projectPath'),
  makePlainEntry<boolean>('runParallel'),
  makePlainEntry<boolean>('justMyCode'),
  makePlainEntry<boolean>('xRay'),
  makePlainEntry<boolean>('verboseLogging'),
  makePlainEntry<boolean>('multiRootRunWorkspacesInParallel'),
  makePlainEntry<string>('importStrategy'),
  makePlainEntry<number>('stepDefinitionSearchTimeout'),
  makePlainEntry<number>('discoveryDepth'),
  makePlainEntry<boolean>('discoveryStopOnFirstHit'),
  makePlainEntry<string>('activeEnvVarPreset'),
];
```

### Pattern 2: `featuresPathMergeWithDedup` lifted from `src/notifications.ts:325-343`

**What:** Append the legacy singular into the existing plural array, normalized,
deduped. Empty/whitespace → skip dest, remove source. Preserves v1.4.0 byte-identical
behavior.
**When to use:** Both `featuresPath-self` and `featuresPath-from-behavevsc` entries.
**Example:** lift verbatim — see `src/notifications.ts:325-343` for the existing
implementation. The function moves to `src/migrations/featuresPath.ts` and is
exported by name. Two entries reference it (D-A4.1).

### Pattern 3: `suppressMultiConfigToArray` lifted from `src/notifications.ts:267-279`

**What:** Boolean `true` → append `"multiConfigNotification"` to the
`suppressedNotifications` array (deduped). Boolean `false` → no-op (skip dest, do
not remove source per Phase 15 contract).
**When to use:** The `suppressMultiConfig-self` entry (D-A4.3).
**Example:** lift verbatim from `src/notifications.ts:267-279`.

### Pattern 4: `mergeRecord` deep-merge utility (D-A2.1, D-A3.1)

**What:** Generic two-record merger with caller-supplied inner merge.
**When to use:** `envVarPresets-from-behavevsc` and `envVarOverrides-from-behavevsc`
entries. Phase 20 only invokes the case-2 path (canonical absent → straight copy
degenerates from the merge); Phase 21 wires the case-3 callers.
**Example:**
```typescript
// src/migrations/envPresets.ts
export function mergeRecord<T>(
  legacy: Record<string, T> | undefined,
  canonical: Record<string, T> | undefined,
  mergeValue: (legacyVal: T, canonicalVal: T) => T,
): Record<string, T> {
  const out: Record<string, T> = { ...(canonical ?? {}) };
  for (const [k, lv] of Object.entries(legacy ?? {})) {
    out[k] = k in out ? mergeValue(lv, out[k]) : lv;
  }
  return out;
}

// envVarPresets transform — preset-level + var-level deep merge
const envVarPresetsTransform = (
  legacy: Record<string, Record<string, string>>,
  canonical: Record<string, Record<string, string>> | undefined,
) => ({
  kind: 'write' as const,
  value: mergeRecord(legacy, canonical, (lp, cp) =>
    mergeRecord(lp, cp, (lv, _cv) => lv) // legacy wins on var collision (D-A2.3 overwrite-* direction; case-2 path canonical is undefined anyway so merge degenerates)
  ),
});
```

### Anti-Patterns to Avoid

- **Don't call `cfg.get()` anywhere in `src/migrations/`** — it merges scopes
  (Pitfall 2 in `notifications.ts:124`). Always use `inspect()` and pick the per-scope
  field. The Phase 19 grep gate enforces this; Phase 20 inherits it.
- **Don't extend `MigrationEntry` with `sourceNamespace: string | string[]`** —
  rejected by D-A4.5. Make two entries instead (the Phase 19 evaluator's per-entry
  iteration is the right granularity).
- **Don't add `await` after `migrateLegacyFeaturesPath` deletion** — when
  `extension.ts:348-352` is removed, also remove the surrounding `Promise.all` /
  `migrationResults` plumbing that consumed it. The Phase 19 evaluator runs
  separately and isn't part of this loop.
- **Don't write tests by stubbing `vscode.workspace.getConfiguration` ad-hoc** —
  reuse `makePerKeyScopedConfig` from `test/unit/migrations.test.ts:33`. It's
  already designed for the (sourceKey + completedMigrations) two-key inspect pattern.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-scope inspect/write/clear | New helper | `migrateScopedSetting` in `src/notifications.ts:143` | MIGRATE-07 mandates single source of truth; primitive handles W-02 stale-scope warning, no-op skip on deep-equal dest, error-trapping |
| Case 1/2/3 dispatch | New evaluator | Phase 19 `evaluateMigration` (`src/migrations/evaluator.ts`) | Phase 19 already verified and shipped (739/739 tests) |
| `completedMigrations` read/write | Inline `update()` | `markMigrationFinishedAtScope` / `isMigrationFinishedAtScope` | Phase 19 helpers handle dedup, idempotency, never-throw |
| Path normalization for `featuresPath` dedup | New regex | `normalizeFeaturesPathEntry` in `src/common.ts` | Phase 16 W-07 — single source of truth so `settings.ts` and migration regex cannot drift |
| `inspect()` per-scope test stub | New helper | `makePerKeyScopedConfig` in `test/unit/migrations.test.ts:33` | Already enforces Pitfall 2 by returning broken `get()`; reuse for free |

**Key insight:** Phase 19 already paid the architecture cost. Phase 20 is mostly
plumbing — wiring transform bodies into entries and exporting them through the
barrel. Treat new helpers as an anti-pattern; lift and rename existing code instead.

## Runtime State Inventory

> Phase 20 is a refactor + new module phase, not a string rename. Categories below
> verified against the codebase.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — VS Code's settings storage is the only datastore. `gs-behave-bdd.completedMigrations` already exists from Phase 19 (CONSENT-07); Phase 20 doesn't add new keys. | None — registry entries are pure code |
| Live service config | None — no external services involved | None |
| OS-registered state | None — no Task Scheduler / launchd / systemd entries | None |
| Secrets/env vars | None — no env vars referenced by name in this phase | None |
| Build artifacts | `dist/extension.js` will rebuild via webpack on `npm run compile`; no stale artifacts because `src/migrations/` is webpacked into the same bundle | Standard `npm run compile` after lift |

**Nothing found in any category requires special migration work** — Phase 20 is
purely additive in `src/migrations/` plus deletions in `src/extension.ts:348-349`
and (potentially) `src/notifications.ts`.

## Common Pitfalls

### Pitfall 1: Forgetting to keep the `migrateLegacyFeaturesPath` / `migrateLegacySuppressMultiConfig` exports if `src/notifications.test.ts` still imports them

**What goes wrong:** Deleting the exports compiles but breaks
`test/unit/notifications.test.ts` lines 11-13 (verified — these imports exist:
`migrateLegacySuppressMultiConfig`, `migrateLegacyFeaturesPath`).
**Why it happens:** D-A3.4 says "Old call sites … are deleted from activation. The
exported functions themselves can stay as a thin compatibility wrapper IF unit tests
still depend on them; otherwise delete." Those tests *do* still depend on them.
**How to avoid:** Planner must grep at plan time. Recommended approach: keep the
exported functions as thin wrappers that delegate to the new transforms in
`src/migrations/`. Alternatively, port the test cases to the new
`src/migrations/featuresPath.test.ts` / `suppressedNotifications.test.ts` and
delete the wrappers + old test cases together.
**Warning signs:** `npm run test:unit` errors out with "Cannot find module" or
"X is not exported from src/notifications" after the wrapper deletion.

### Pitfall 2: `cfg.get()` instead of `cfg.inspect()` in any new transform code

**What goes wrong:** `cfg.get()` merges scopes. A migration that reads via `get()`
will falsely treat a higher-scope canonical value as "already set at this scope"
and skip a legitimate lower-scope migration.
**Why it happens:** It's the obvious first instinct from VS Code documentation.
**How to avoid:** Phase 19 added a grep gate (`grep cfg\.get\( src/migrations/` →
0 hits). Extend that gate to all new files in `src/migrations/`. Reviewers should
also reject any PR that adds `cfg.get(` inside the migrations module.
**Warning signs:** Tests that pass with stub data but fail in real VS Code; or
case-3 false negatives where a Workspace-level legacy gets clobbered by a Global-
level canonical.

### Pitfall 3: Entry id collisions

**What goes wrong:** Two entries with the same `id` cause `completedMigrations` to
falsely mark both as Finished after only one runs.
**Why it happens:** The `featuresPath-self` and `featuresPath-from-behavevsc` pair
(D-A4.1) is the obvious case where a careless one-id-for-all approach would break.
**How to avoid:** Document the `<key>-from-behavevsc` / `<key>-self` naming
convention in `src/migrations/types.ts` near the `MigrationEntry` interface (per
`<specifics>` in CONTEXT.md). Add a unit test in `index.test.ts` that asserts
`new Set(MIGRATION_REGISTRY.map(e => e.id)).size === MIGRATION_REGISTRY.length`.
**Warning signs:** TEST-04 idempotency test would catch it (case (a) — finished
flag short-circuit applies to both entries with the same id).

### Pitfall 4: `envVarPresets` deep-merge identity vs. write distinction

**What goes wrong:** In case 2 (canonical absent at scope), the deep-merge
degenerates to identity (legacy wins because canonical is `undefined`). But the
transform must still return `{ kind: 'write', value: legacy }` — not `{ kind:
'skipDest' }` — so the primitive copies the value into canonical. Returning
`skipDest` means "don't write dest" and the migration silently does nothing.
**Why it happens:** "There's nothing to merge" sounds like "nothing to do."
**How to avoid:** Per D-A2.2 ("straight copy of legacy. Deep-merge degenerates to
identity"), the transform must `return { kind: 'write', value: mergeRecord(...) }`
unconditionally for the case-2 path. Test 4.x in `envPresets.test.ts` should
explicitly cover (legacy={a:{X:1}}, canonical=undefined) → write={a:{X:1}}.
**Warning signs:** TEST-04 case-1 silent-finish test passes but case-2 transform
test shows `update()` was never called.

### Pitfall 5: Mocha test path mismatch when adding `src/migrations/*.test.ts`

**What goes wrong:** D-A3.2 says tests sit beside entries. The Mocha runner glob
in `out/test/test/unit/run.js` (per Phase 19 Plan 06 finding) searches
`out/test/test/unit/**/*.test.js`. Tests in `src/migrations/` would compile to
`out/src/migrations/*.test.js` and never run.
**Why it happens:** Project convention is `test/unit/...`, and the test runner's
glob assumes that.
**How to avoid:** Either (a) put new tests under `test/unit/migrations/` (recommended
— matches existing Phase 19 pattern) or (b) extend the test runner's glob. Recommend
(a) — easier and consistent. Verify at plan time. [ASSUMED — confirm runner glob
during Wave 0.]
**Warning signs:** Tests "pass" because Mocha didn't pick them up; assertion count
in suite output is lower than expected.

## Code Examples

Verified patterns lifted from existing source:

### Existing `featuresPath` transform (lift verbatim into `src/migrations/featuresPath.ts`)

```typescript
// Source: src/notifications.ts:325-343 (Phase 16 — verified working, regression-pinned)
transform: (legacyValue, existingArr) => {
  if (legacyValue === undefined || typeof legacyValue !== 'string' || legacyValue.trim() === "") {
    return { kind: 'skipDest', removeSource: true };
  }
  const normalized = normalizeFeaturesPathEntry(legacyValue);
  if (normalized === "") {
    return { kind: 'skipDest', removeSource: true };
  }
  const current = Array.isArray(existingArr) ? [...existingArr] : [];
  if (current.some(p => normalizeFeaturesPathEntry(p) === normalized)) {
    return { kind: 'write', value: current };
  }
  return { kind: 'write', value: [...current, normalized] };
}
```

### Existing `suppressMultiConfigNotification` transform (lift verbatim)

```typescript
// Source: src/notifications.ts:267-279 (Phase 15 — verified, callCount===0 contract preserved)
transform: (legacyValue, existingArr) => {
  if (legacyValue !== true) {
    return { kind: 'skipDest', removeSource: false };
  }
  const current = Array.isArray(existingArr) ? [...existingArr] : [];
  if (current.includes("multiConfigNotification")) {
    return { kind: 'write', value: current };
  }
  return { kind: 'write', value: [...current, "multiConfigNotification"] };
}
```

### Test stub for per-key scoped config (reuse from Phase 19)

```typescript
// Source: test/unit/migrations.test.ts:33-59 (Phase 19 Plan 02 — already in repo)
function makePerKeyScopedConfig(byKey: Record<string, ScopeValues>, updateSpy?: sinon.SinonSpy) {
  return {
    get: (key: string) => { /* intentionally broken to enforce Pitfall 2 */
      const s = byKey[key]; if (!s) return undefined;
      return s.workspaceFolderValue ?? s.workspaceValue ?? s.globalValue;
    },
    has: () => false,
    inspect: (key: string) => {
      const s = byKey[key] ?? {};
      return { key, defaultValue: undefined, ...s };
    },
    update: updateSpy ?? (() => Promise.resolve()),
  };
}
```

## State of the Art

| Old Approach (v1.4.0) | Current Approach (v1.5.0) | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Silent activation-time `migrateLegacyFeaturesPath()` + `migrateLegacySuppressMultiConfig()` | Registry entries evaluated through Phase 19 evaluator with consent UX | Phase 20 (this phase) deletes the silent calls; Phase 21 adds prompts | Migration becomes opt-in (CONSENT-*); user sees a notification before settings are mutated (case 2/3) |
| `getWithLegacyFallback` reads `behave-vsc.*` silently at every settings construction | Continues reading until Phase 22 (CLEANUP-01), but registry now offers a forward path | Phase 22 deletes the fallback reads | Users who decline migration (skip / don't-migrate) lose the fallback in Phase 22 — documented prominently in DOC-01 |

**Deprecated/outdated:**
- The activation-time call site at `src/extension.ts:345-359` (the `Promise.all`
  wrapping `migrateLegacyFeaturesPath` and `migrateLegacySuppressMultiConfig`)
  becomes obsolete in Phase 20 per D-A6.1. Phase 19's evaluator wiring (look at
  the new evaluator-runs-at-activation site established by Phase 19) is the
  single source.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Mocha 9.2.2 + Sinon 21.0.1 |
| Config file | `test/unit/run.ts` (compiled to `out/test/test/unit/run.js`) |
| Quick run command | `npm run test:unit -- --grep "<pattern>"` (note: `--grep` may not propagate through the npm script wrapper on Windows; use `npx mocha --require ./out/test/test/unit/setup.js --ui tdd 'out/test/test/unit/**/*.test.js' --grep <pattern>` as fallback per Phase 15 Plan 06 finding) |
| Full suite command | `npm run test:unit` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MIGRATE-01 | `migrateLegacyFeaturesPath` registered as 2 entries; activation call deleted | unit + structural grep | `npm run test:unit -- --grep "featuresPath-self\|featuresPath-from-behavevsc"` + grep `extension.ts` for absence of `migrateLegacyFeaturesPath(` call | ❌ Wave 0 (`test/unit/migrations/featuresPath.test.ts`) |
| MIGRATE-02 | `migrateLegacySuppressMultiConfig` registered as 1 entry; activation call deleted | unit + structural grep | `npm run test:unit -- --grep "suppressMultiConfig-self"` | ❌ Wave 0 (`test/unit/migrations/suppressedNotifications.test.ts`) |
| MIGRATE-03 | 15 cross-namespace entries registered | unit | `npm run test:unit -- --grep "plain entries\|behave-vsc registry"` | ❌ Wave 0 (`test/unit/migrations/plain.test.ts`, `envPresets.test.ts`) |
| TEST-04 | Per entry: (a) skip via `completedMigrations`, (b) case-1 silent finish | unit | `npm run test:unit -- --grep "TEST-04\|idempotency"` | ❌ Wave 0 — same files as above |

### Sampling Rate

- **Per task commit:** `npx eslint src --ext ts` (0 output) + `npm run test:unit -- --grep "<area>"` (Phase-20-area only)
- **Per wave merge:** `npm run test:unit` full suite (target: 739 → ~780+ passing, no regressions)
- **Phase gate:** `npm test` (lint + compile + all tests) green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `test/unit/migrations/plain.test.ts` — covers MIGRATE-03 plain entries + factory + TEST-04 idempotency × 11 entries
- [ ] `test/unit/migrations/featuresPath.test.ts` — covers MIGRATE-01 (2 entries) + transform unit tests + TEST-04
- [ ] `test/unit/migrations/suppressedNotifications.test.ts` — covers MIGRATE-02 + TEST-04
- [ ] `test/unit/migrations/envPresets.test.ts` — covers MIGRATE-03 (envVarPresets, envVarOverrides) + `mergeRecord` unit tests + TEST-04 + Pitfall 4 (deep-merge identity in case 2)
- [ ] `test/unit/migrations/index.test.ts` — assert no entry id collisions (Pitfall 3) + count === 17 (D-A4.4)
- [ ] No new framework install needed; Mocha + Sinon already in package.json
- [ ] Confirm runner glob picks up `test/unit/migrations/**/*.test.js` (verify via Wave 0 smoke check; Phase 19 placed `migrations.test.ts` directly in `test/unit/` — subdirectory may need glob update)

## Security Domain

> Skipped — `security_enforcement` not relevant for an internal settings-migration
> refactor in a VS Code extension. No auth, no input validation beyond the existing
> `WorkspaceSettings` validation that already runs downstream of migration. No
> network, no file uploads, no user-supplied schemas. The only "input" is the user's
> own `behave-vsc.*` settings.json values, and per CONTEXT.md `<deferred>` ("Schema
> validation of migrated values"), validation of those values is explicitly out of
> scope — the existing constructor validation surfaces bad values downstream.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Test runner glob convention `test/unit/<area>/*.test.ts` is preferred over co-locating in `src/` | Architecture / Wave 0 | Low — easily verified at plan time by checking `test/unit/run.ts` glob; if `src/` co-location works, planner adopts D-A3.2 verbatim |
| A2 | `migrateLegacyFeaturesPath` and `migrateLegacySuppressMultiConfig` exports are imported by `test/unit/notifications.test.ts` (verified by Read) — the wrappers cannot simply be deleted without test surgery | Pitfall 1 | Verified directly; A2 is now a fact, not an assumption |
| A3 | The `mergeRecord` utility's case-3 caller (Phase 21) needs both "legacy wins" and "no merge" semantics — encoded as a `mergeValue` callback rather than separate functions | Pattern 4 | Low — Phase 21 will revisit; the case-2 path doesn't exercise the callback directionality so any choice now is fine |
| A4 | `verboseLogging` may not have existed in `behave-vsc` — registering it anyway hits case 1 silently with negligible cost | D-A1.2 | None — D-A1.2 accepts this trade-off explicitly |
| A5 | `discoveryDepth` and `discoveryStopOnFirstHit` were introduced in v1.5.0 and never existed in `behave-vsc` | D-A1.3 | None — same as A4; case 1 silent finish is the documented outcome |

**A1 needs Wave 0 verification.** The other assumptions are either already verified
or accepted by CONTEXT.md.

## Open Questions

1. **Where do the new test files live? `test/unit/migrations/*.test.ts` (subdirectory)
   or co-located `src/migrations/*.test.ts`?**
   - What we know: D-A3.2 says co-located; project convention puts tests under
     `test/unit/`; Phase 19 used `test/unit/migrations.test.ts` (single file, not
     subdirectory).
   - What's unclear: which one passes the Mocha runner glob without modification.
   - Recommendation: Wave 0 task creates `test/unit/migrations/probe.test.ts`
     containing a single trivial assertion; if the glob picks it up, use that
     subdirectory. Otherwise add it to the runner glob in `test/unit/run.ts`.
     This is a 5-minute probe and unblocks all four implementation plans.

2. **Should the v1.4.0 wrapper exports (`migrateLegacyFeaturesPath`,
   `migrateLegacySuppressMultiConfig`) be deleted entirely or kept as thin
   compatibility shims?**
   - What we know: `test/unit/notifications.test.ts:11-13` imports both. Deletion
     breaks the test file (~30+ tests covering case-by-case scenarios from Phase 15
     and Phase 16).
   - What's unclear: whether porting those tests to the new
     `src/migrations/*.test.ts` files is cheaper than maintaining shims.
   - Recommendation: keep thin shims for v1.5.0 — they're 3-line wrappers around
     `evaluateMigration(...)` for the relevant entry. The existing test coverage
     becomes a regression bar pinning the lifted transform behavior. Mark the shims
     `@deprecated` and remove in v1.6.0 once the new test suite has bedded in.
     (This is a Phase 20 implementation decision the planner can make; the user
     marked D-A3.4 as "Planner decides at plan time after grepping callers" which
     gives explicit license.)

3. **Should `evaluateAllMigrations` be wired into `extension.ts` activation in
   Phase 20, or is that wiring already in place from Phase 19?**
   - What we know: `evaluateAllMigrations` is exported via `src/migrations/index.ts`
     (verified). The recheck command (`recheckMigrationsCommandHandler`) calls
     it. But CONTEXT.md `<integration_points>` says "Phase 19 evaluator import —
     wherever Phase 19 wired the empty registry, switch the import to `from
     './migrations'`. Planner verifies at plan time."
   - What's unclear: is there an activation-time `evaluateAllMigrations` call yet?
     Grep found no call in `extension.ts`. Phase 19 may not have wired it because
     the registry was empty (D-05).
   - Recommendation: Wave 0 task — grep `extension.ts` for `evaluateAllMigrations`.
     If absent, Phase 20 must add the wiring (per workspace, in `activate()`,
     replacing the L348-L349 silent calls). Add this as a discrete plan task so
     it's not overlooked.

## Sources

### Primary (HIGH confidence)
- Phase 19 source code (`src/migrations/evaluator.ts`, `types.ts`, `registry.ts`,
  `completedMigrations.ts`, `recheckCommand.ts`, `index.ts`) — verified via Read
- Phase 19 contracts (`019-CONTEXT.md` D-01..D-04, `019-02-evaluator-PLAN.md`,
  `019-02-evaluator-SUMMARY.md`) — locked, verified
- Existing transform bodies (`src/notifications.ts:143-348`) — verified, regression-
  pinned by 739 unit tests
- Phase 19 test patterns (`test/unit/migrations.test.ts`,
  `test/unit/notifications.test.ts`) — verified
- `020-CONTEXT.md` — locked decisions D-A1..D-A6 verbatim

### Secondary (MEDIUM confidence)
- VS Code Discussions #862 [CITED: github.com/microsoft/vscode-discussions/discussions/862]
  — official guidance: no built-in migration API, recommended pattern matches what
  the codebase already does
- VS Code 1.68 release notes [CITED: code.visualstudio.com/updates/v1_68] — deprecated-
  extension Migrate button (not applicable cross-extension when we don't own the
  legacy publisher)

### Tertiary (LOW confidence — cited only to refute)
- npm package READMEs for `electron-store`, `conf`, `electron-conf`, `migrat`
  [CITED: npmjs.com/package/electron-store, npmjs.com/package/conf,
  github.com/alex8088/electron-conf, npmjs.com/package/migrat] — reviewed and
  rejected as not fitting the per-scope, per-(entry × user-consent) model
- General-search results on GitLens / ESLint / Python extension migration patterns
  — none surfaced a reusable abstraction; pattern is universally hand-rolled per
  extension

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all reused from existing codebase, no new dependencies
- Architecture: HIGH — all locked by Phase 19 D-04 + Phase 20 D-A1..D-A6
- Pitfalls: HIGH — Pitfalls 1-3 verified by direct code inspection; Pitfall 4
  derives from D-A2.2; Pitfall 5 is a known Phase 19 finding documented in
  Plan 06 SUMMARY
- Prior-art recommendation: HIGH — official VS Code guidance directly answers the
  user's question; npm packages reviewed and definitively rejected for cause

**Research date:** 2026-05-08
**Valid until:** 2026-06-08 (30 days — domain is stable; tooling landscape changes
slowly)
