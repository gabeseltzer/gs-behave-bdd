# Phase 16: Deprecate featuresPath - Research

**Researched:** 2026-04-28
**Domain:** VS Code Extension API — schema deprecation + scope-preserving settings migration + reusable migration primitive extraction
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Migration Helper API (D-01..D-05)**
- **D-01:** New helper `migrateLegacyFeaturesPath(wkspUri: vscode.Uri): Promise<boolean>`. Returns `true` if at least one scope was migrated, `false` otherwise. Diverges from Phase 15's `Promise<void>` because Phase 16 is user-visible — the caller branches on the boolean to decide whether to fire the notification.
- **D-02:** Helper migrates **both** `gs-behave-bdd.featuresPath` and `behave-vsc.featuresPath` (legacy fork namespace). Both source values land in the canonical destination `gs-behave-bdd.featuresPaths`. `behave-vsc.featuresPaths` is **never** written.
- **D-03:** For each (namespace, scope) pair where a legacy value exists, write to `gs-behave-bdd.featuresPaths` at the **same scope level** as the legacy value (workspaceFolder / workspace / global), then `update(legacyKey, undefined, sameTarget)` to remove the legacy key.
- **D-04:** Cross-scope independence: a `behave-vsc.featuresPath` at workspace scope and a `gs-behave-bdd.featuresPath` at workspaceFolder scope are migrated independently into `gs-behave-bdd.featuresPaths` at their respective scopes. No cross-scope shadowing logic.
- **D-05:** Helper never throws (D-07 from Phase 15 carries forward). On `update()` rejection, log via `config.logger.logInfo(...)` and continue. Boolean return reflects only successful migrations.

**Same-Scope Collision Policy (D-06..D-07)**
- **D-06:** When a user has BOTH `featuresPath` (singular, explicit) AND `featuresPaths` (plural, non-empty array) at the same scope: **merge singular into plural with dedup**. Read existing plural at same scope via `inspect()` (Pitfall 2 — never `cfg.get()` which merges scopes), append the singular value if not already present, write the merged array, then remove the legacy singular.
- **D-07:** Dedup compares post-normalization (trim leading/trailing slashes, trim whitespace) — the same normalization the active settings ladder applies at `src/settings.ts:204`/`L214`.

**Value Filtering (D-08..D-09)**
- **D-08:** Skip migration when the legacy value is empty string or whitespace-only after trim. Just remove the legacy key (the user has nothing worth preserving). The legacy key removal still fires; only the merge-into-plural step is skipped.
- **D-09:** Migrate everything else literally, including `"features"` (matches default — user explicitly set), `"."` (preserves existing fatal-error guard at `src/settings.ts:233`), and any custom path.

**Notification UX (D-10..D-13)**
- **D-10:** Notification fires per migrated workspace folder. DSA suppression key is a single string — once dismissed at any scope, stays quiet across all workspace folders.
- **D-11:** Notification fires only when the helper returns `true`.
- **D-12:** Buttons: `["Open Settings"]` (plus auto-appended "Don't Show Again"). Clicking "Open Settings" opens settings UI scoped to `@ext:formlabs.gs-behave-bdd`.
- **D-13:** Suppression key: `featuresPathMigration` (camelCase).

**Modularity (D-MOD)**
- Extract a shared internal primitive in `src/notifications.ts` (or a new dedicated file — planner's HOW choice) that captures the inspect-detect-scope-write-then-remove-legacy mechanics common to Phase 15 and Phase 16. Refactor `migrateLegacySuppressMultiConfig` to call it.
- Regression bar: all 8 existing `migrateLegacySuppressMultiConfig` sub-cases must still pass after refactor.
- NOT a registry/declarative system (Option C deferred until 3rd migration appears).

**Source-Tree Cleanup (D-14..D-17)**
- **D-14:** `package.json` — remove `gs-behave-bdd.featuresPath` schema entry (L38-L43). Keep plural.
- **D-15:** `src/settings.ts` — remove strict-undefined throw L132-L134; precedence-ladder Rung 2 branch L212-L214; `hasExplicitSetting(wkspConfig, "featuresPath", ...)` info-log branch L196-L202; `featuresPath`-named fatal error string at L234. Collapsed ladder: plural → config-file → convention.
- **D-16:** `src/common.ts` — remove `featuresPath` references in `hasFeaturesFolder()` (L208, L212, L256-L283). Branch A gate becomes `hasExplicitSetting(wkspConfig, "projectPath", legacyWkspConfig) || hasExplicitNonEmptyArraySetting(wkspConfig, "featuresPaths")`. Singular-specific warning notification at L274-L281 removed.
- **D-17:** `src/testWorkspaceConfig.ts` — drop `featuresPath` private field (L16), constructor parameter (L31, L39, L56), `get()`/`inspect()` switch cases (L88-L89, L145-L146), `getExpectedFeaturesPath()` helper (L204-L218), and `getExpected()` switch case (L252). Update all 6 fixture call sites.

**Activation Loop Ordering (D-18)**
- **D-18:** In `src/extension.ts` `activate()`, the existing per-workspace migration loop gains a second migration call. Order: featuresPath migration FIRST (data shape), then suppressMultiConfig migration (UX-suppression cleanup). After both, `await config.reloadSettings(wkspUri)` once. Both wrapped in existing defense-in-depth try/catch. The featuresPath notification fires AFTER the loop (depends on `suppressedNotifications` being current).

### Claude's Discretion
- Exact internal API shape of the extracted primitive (parameter ordering, generics, callback signatures).
- Whether the primitive lives in `src/notifications.ts` or new `src/settingsMigration.ts`.
- Whether `behave-vsc.featuresPath` migration is a separate function or a parameter to `migrateLegacyFeaturesPath`.
- Final notification message wording within D-12 constraint.
- Test coverage strategy (primitive directly vs. coverage via wrappers).
- Whether `behaveLoaderNestedProject.test.ts` filename comment gets updated (cosmetic).

### Deferred Ideas (OUT OF SCOPE)
- Migration registry/framework (Option C). Defer until 3rd migration.
- Broader `behave-vsc` namespace deprecation track.
- CHANGELOG/README updates.
- Renaming `behaveLoaderNestedProject.test.ts`.
- Unified `runAllSettingsMigrations(wkspUri)` orchestrator.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **DEP-01** | `featuresPath` setting removed from package.json schema | Confirmed location: `package.json:38-43`. Removal must occur AFTER migration runs at first activation post-update, but `inspect()` still surfaces values from settings.json regardless of schema (Phase 15 Wave 0 A1 probe verified this — see `15-RESEARCH.md` Assumption A1 / Pitfall 1, and the unit test at `test/unit/notifications.test.ts:48-74`). Phase 16 inherits the same load-bearing assumption. |
| **DEP-02** | On activation, if `featuresPath` has explicit value at any scope, auto-migrate to `featuresPaths[]` and remove old key | New helper `migrateLegacyFeaturesPath(wkspUri)` at `src/notifications.ts` (or `src/settingsMigration.ts`). Inspects both `gs-behave-bdd.featuresPath` and `behave-vsc.featuresPath` (D-02) per scope (D-08-style ladder). Wired into existing `extension.ts:297-306` activation loop (D-18). |
| **DEP-03** | Migration writes to same scope level as found | Pattern proven in Phase 15 (`src/notifications.ts:90-130`). Phase 16's primitive uses the same scope-detection ladder: `workspaceFolderValue` → `workspaceValue` → `globalValue`. Independent per-namespace and per-scope migrations (D-04). |
| **DEP-04** | User notification after migration | `showSuppressibleNotification("featuresPathMigration", message, ["Open Settings"], wkspUri)` (D-12, D-13). Fires only when helper returns `true` (D-11). Notification fires AFTER the activation loop completes so `reloadSettings` has populated `suppressedNotifications` (D-18). |
| **DEP-05** | Internal `featuresPath` reads removed | Touchpoints verified by reading source: `src/settings.ts:132-134, 188-223, 234`; `src/common.ts:207-208, 211-212, 254-283`. After removal, the surviving reads are: plural `featuresPaths` ladder (`settings.ts:188-229`) + `hasExplicitNonEmptyArraySetting(wkspConfig, "featuresPaths")` (`common.ts:209`). |
| **DEP-06** | `testWorkspaceConfig` mock updated | 6 surfaces in `src/testWorkspaceConfig.ts`: field decl L16, constructor destructure L31, type L39, assign L56, `get()` case L88-L89, `inspect()` case L145-L146, `getExpectedFeaturesPath()` helper L204-L212, `getExpectedWorkspaceRelativeFeaturesPath()` reference L217, `getExpected()` switch case L252. Fixture call sites listed in §Test-Fixture Cascade below. |
| **DEP-07** | Unit tests cover migration edge cases | New test suites in `test/unit/notifications.test.ts` (or new `test/unit/settingsMigration.test.ts`) covering: gs-behave-bdd at folder/wksp/global scope, behave-vsc at folder/wksp/global scope, both-namespaces-set, same-scope collision merge with dedup, normalization-aware dedup, empty/whitespace skip, `"."` migrated literally, idempotency, update-rejection logs warn. Plus regression bar: all 8 existing `migrateLegacySuppressMultiConfig` sub-cases pass after D-MOD refactor. |
</phase_requirements>

## Summary

Phase 16 is the second invocation of a now-proven Phase 15 pattern: scope-preserving settings migration via `inspect()`-driven scope detection, same-scope `update()` write + `update(legacyKey, undefined, target)` removal. Every primitive needed already exists in the codebase or VS Code API. The user's strategic call (D-MOD) requires extracting a single shared primitive that both the existing `migrateLegacySuppressMultiConfig` and the new `migrateLegacyFeaturesPath` call into; the regression bar is "all 8 existing Phase 15 sub-cases still pass."

The phase has three structural pieces: **(1)** the D-MOD primitive extraction + Phase 15 helper refactor; **(2)** the new `migrateLegacyFeaturesPath` wrapper handling 6 (namespace × scope) combinations with same-scope merge-with-dedup logic; **(3)** the source-tree cleanup removing every `featuresPath` (singular) read from production code, the package.json schema, the test mock, and the unit tests. Activation-loop wiring (D-18) is a 3-line addition to `extension.ts:297-306`.

Two load-bearing assumptions carry from Phase 15: (a) `inspect()` of an unregistered key still returns user-set scope values from settings.json (verified Wave 0 in Phase 15; phase-16 also depends on this for the post-DEP-01 migration to work); (b) `cfg.update(key, undefined, target)` removes the user-set value at that target — confirmed by the existing `src/notifications.ts:122` usage which is exercised by the Phase 15 test at `test/unit/notifications.test.ts:301-305`.

**Primary recommendation:** Place the extracted primitive in `src/notifications.ts` (keeps it adjacent to its only two known callers and to `showSuppressibleNotification`; new file is unjustified at 2 callers — defer split to Phase 17 or beyond). Implement `migrateLegacyFeaturesPath` as a single function that iterates a hardcoded `["gs-behave-bdd", "behave-vsc"]` namespace list and calls the primitive once per (namespace × scope) hit. The primitive's `merge` callback handles the same-scope-merge-with-dedup logic for the new featuresPaths array case, and a no-op-style merge for the Phase 15 boolean→array case.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Schema declaration / removal | Static config (`package.json`) | — | VS Code reads the schema at extension load. DEP-01 is a JSON edit. |
| Settings read (production) | Configuration layer (`WorkspaceSettings`) | — | All settings reads go through the per-workspace cache. DEP-05 collapses one branch of that cache constructor. |
| Migration scope detection | Cross-cutting (`notifications.ts`) | VS Code Configuration API | Uses `inspect()` to find user-set scope. Same as Phase 15. |
| Migration write (new key + remove old) | VS Code Configuration API direct | Cross-cutting (`notifications.ts`) | `cfg.update(...)` is called directly with the matching `ConfigurationTarget`. The cache (`config.workspaceSettings`) is read-only and is refreshed via `reloadSettings()` after migration. |
| Migration trigger | Extension layer (`extension.ts::activate`) | Cross-cutting (`notifications.ts`) | The per-workspace activation loop owns timing. The migration helper is a side-effect function called once per workspace. |
| Notification rendering | VS Code extension host (Window) | Cross-cutting (`notifications.ts` wrapper) | `showSuppressibleNotification` (Phase 15) handles the UI mechanics. |
| Notification trigger | Extension layer (`extension.ts::activate`) | — | After the activation loop, iterate workspaces where the helper returned `true` and fire the notification. Lives outside the migration helper for testability. |
| Discovery branch (Branch A gate) | Discovery layer (`common.ts::hasFeaturesFolder`) | Configuration layer | DEP-05 simplifies the gate; the surviving check uses `hasExplicitNonEmptyArraySetting` for plural. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `vscode` engine | `^1.82.0` | `WorkspaceConfiguration.inspect()`, `update()`, `ConfigurationTarget` enum, `showInformationMessage`, `commands.executeCommand("workbench.action.openSettings", ...)` | Native VS Code API; no third-party alternative. [VERIFIED: `package.json:289`] |
| TypeScript | 4.5.5 | Source language | Project standard. [VERIFIED: `CLAUDE.md` "Languages"] |
| Mocha | 9.2.2 | Unit test framework | Project standard. [VERIFIED: `CLAUDE.md` "Frameworks"] |
| Sinon | 21.0.1 | Stub/spy library | Project standard. [VERIFIED: `CLAUDE.md` "Frameworks"] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | — | — | Phase 16 introduces no new dependencies — bundle size unchanged. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Eager programmatic migration (chosen) | VS Code's native `deprecationMessage` schema field | Native deprecation only shows a warning in settings UI; doesn't move the value. We need both the move AND user awareness. |
| Single primitive in `notifications.ts` (recommended) | New `src/settingsMigration.ts` file | Splitting into a new file at 2 callers violates Rule of Three. Files in `src/` are flat (no `src/utils/` etc.); a new file would need its own justification. Defer until 3rd migration. |
| `behave-vsc` as a parameter to `migrateLegacyFeaturesPath` (recommended) | Separate `migrateLegacyBehaveVscFeaturesPath` function | Parameter approach is one source-of-truth function with a fixed `["gs-behave-bdd", "behave-vsc"]` constant. Two functions duplicate the scope ladder. |

**Installation:** No new dependencies.

**Version verification:** N/A — no new packages.

## Architecture Patterns

### System Architecture Diagram

```
                       ┌──────────────────────────────────────────┐
                       │         activate() [extension.ts:297]    │
                       │  ┌────────────────────────────────────┐  │
                       │  │ for each wkspUri:                  │  │
                       │  │  try {                             │  │
                       │  │    migrated = await                │  │
                       │  │      migrateLegacyFeaturesPath(uri)│  │  D-18 ORDER
                       │  │    await                           │  │  (1) shape
                       │  │      migrateLegacySuppress...(uri) │  │  (2) UX
                       │  │    await reloadSettings(uri)       │  │  (3) refresh
                       │  │    if (migrated)                   │  │  (4) note
                       │  │      pendingNotifs.push(uri)       │  │
                       │  │  } catch { logInfo(...) }          │  │
                       │  └─────────────┬──────────────────────┘  │
                       │                │                         │
                       │                ▼                         │
                       │  ┌────────────────────────────────────┐  │
                       │  │ for each pendingNotifs uri:        │  │
                       │  │   showSuppressibleNotification(    │  │
                       │  │     "featuresPathMigration",       │  │
                       │  │     "Migrated featuresPath...",    │  │
                       │  │     ["Open Settings"], uri)        │  │
                       │  │   .then(action ⇒ if "Open Settings"│  │
                       │  │     openSettings("@ext:formlabs..."│  │
                       │  └────────────────────────────────────┘  │
                       │                │                         │
                       │                ▼                         │
                       │  updateDiscoveryUX(...)  [unchanged]    │
                       └──────────────────────────────────────────┘
                                          │
                                          ▼
                       ┌──────────────────────────────────────────┐
                       │   src/notifications.ts                   │
                       │ ┌─────────────────────────────────────┐  │
                       │ │ migrateScopedSetting (D-MOD primit.)│  │
                       │ │  inputs: namespace, sourceKey,      │  │
                       │ │   destKey, wkspUri, transform fn    │  │
                       │ │  1. inspect sourceKey → find scope  │  │
                       │ │  2. read destKey at SAME scope      │  │
                       │ │  3. call transform(srcVal, destVal) │  │
                       │ │     → may return undefined to skip  │  │
                       │ │  4. update destKey at SAME scope    │  │
                       │ │  5. update(sourceKey, undef, scope) │  │
                       │ │  → returns boolean (migrated?)      │  │
                       │ └──────────────┬──────────────────────┘  │
                       │                │ called by                │
                       │   ┌────────────┴────────────┐             │
                       │   ▼                         ▼             │
                       │ ┌──────────────┐  ┌──────────────────┐    │
                       │ │ migrateLegacy│  │ migrateLegacy    │    │
                       │ │ Suppress...  │  │ FeaturesPath     │    │
                       │ │ (boolean→arr)│  │ (string→arr,     │    │
                       │ │              │  │  2 namespaces)   │    │
                       │ └──────────────┘  └──────────────────┘    │
                       └──────────────────────────────────────────┘
```

### Component Responsibilities

| Component | File | Responsibility |
|-----------|------|----------------|
| `migrateScopedSetting` (NEW, D-MOD) | `src/notifications.ts` | Generic primitive — scope detection ladder + same-scope read + caller-provided transform + write + remove. Returns `Promise<boolean>` (true if any scope was migrated). |
| `migrateLegacyFeaturesPath` (NEW) | `src/notifications.ts` | Iterates `["gs-behave-bdd", "behave-vsc"]` × per-scope, calls `migrateScopedSetting` with a transform that does same-scope merge-with-dedup of singular into plural. Returns `Promise<boolean>` (true if ANY namespace×scope hit). |
| `migrateLegacySuppressMultiConfig` (REFACTORED) | `src/notifications.ts` | Calls `migrateScopedSetting` once with a boolean→array-merge transform. Public signature unchanged (`Promise<void>`); internally delegates. |
| `WorkspaceSettings` constructor (MODIFIED) | `src/settings.ts` | Drops singular `featuresPathCfg` strict-undefined block (L132-L134); drops Rung 2 branch (L212-L214); drops `hasExplicitSetting` info-log branch (L196-L202); collapses to `plural → config-file → convention` ladder. |
| `hasFeaturesFolder` (MODIFIED) | `src/common.ts` | Drops singular `featuresPath` from Branch A gate (L208); drops `getActualWorkspaceSetting<string>` call for singular (L212); drops singular-specific check + warn block (L256-L283). |
| `TestWorkspaceConfig` (MODIFIED) | `src/testWorkspaceConfig.ts` | Drops singular field, constructor param, get/inspect/getExpected switch cases, and the `getExpectedFeaturesPath()` helper. Surface count: 9 lines/regions. |
| Activation-loop migration call (NEW) | `src/extension.ts:297-306` | Adds `migrateLegacyFeaturesPath` call before the existing `migrateLegacySuppressMultiConfig` call. Tracks `pendingNotifs: vscode.Uri[]` for post-loop notification firing. |
| Post-loop notification block (NEW) | `src/extension.ts` (new, between L306 and L309) | For each `pendingNotifs` uri, fires `showSuppressibleNotification` and on `"Open Settings"` action calls `vscode.commands.executeCommand("workbench.action.openSettings", "@ext:formlabs.gs-behave-bdd")`. |

### Recommended Project Structure
```
src/
├── notifications.ts          # MODIFIED — add migrateScopedSetting primitive (D-MOD),
│                             #            add migrateLegacyFeaturesPath wrapper,
│                             #            refactor migrateLegacySuppressMultiConfig to call primitive
├── extension.ts              # MODIFIED — add migrateLegacyFeaturesPath call to activation loop (line ~298),
│                             #            add post-loop notification firing block
├── settings.ts               # MODIFIED — DEP-05: collapse featuresPath ladder
├── common.ts                 # MODIFIED — DEP-05: simplify hasFeaturesFolder()
├── testWorkspaceConfig.ts    # MODIFIED — DEP-06: drop singular featuresPath surfaces
└── configuration.ts          # UNCHANGED — reuses reloadSettings()
package.json                  # MODIFIED — DEP-01: remove gs-behave-bdd.featuresPath schema
test/unit/
├── notifications.test.ts     # MODIFIED — refactor existing 8 sub-cases (regression bar) +
│                             #            add new sub-cases for migrateLegacyFeaturesPath
├── settings/
│   ├── multiPathPrecedence.test.ts  # MODIFIED — drop featuresPath from BASE_CFG (L69), drop Rung 2 tests, drop both-set tests
│   ├── discoveryPriority.test.ts    # MODIFIED — drop featuresPath from L70-L100, L96-L98, L102-L113 (4 tests)
│   ├── discoverySource.test.ts      # MODIFIED — drop featuresPath from L60-L102, L141-L147 (4 tests)
│   ├── legacyFallback.test.ts       # MODIFIED — drop featuresPath from L104, L124-L144 (3 tests)
│   ├── projectUriDerivation.test.ts # MODIFIED — drop featuresPath from L55
│   └── logSettingsPlural.test.ts    # MODIFIED — review & drop featuresPath references
└── parsers/
    └── behaveLoaderNestedProject.test.ts  # OPTIONAL — comment cosmetics (filename refs singular; deferred per CONTEXT)
test/integration/
├── debug suite/extension.test.ts            # MODIFIED — drop featuresPath: undefined from line 35
└── suite-shared/shared.workspace.tests.ts   # MODIFIED — drop featuresPath from 4 call sites (L26, L43, L60, L76)
```

### Pattern 1: Scope-Preserving Migration (existing, generalized)

**What:** Extract the inspect-detect-scope-write-remove-legacy mechanics from Phase 15 into a primitive parameterized by source key, destination key, and a transform callback that decides the new destination value.

**When to use:** Any settings rename or shape-change migration where the legacy value's scope must be preserved.

**Example (recommended primitive signature):**
```typescript
// Source: src/notifications.ts (D-MOD, NEW)

/**
 * Generic scope-preserving migration primitive.
 *
 * For each scope (workspaceFolder → workspace → global, most-specific wins),
 * detects whether `sourceKey` has a user-set value at that scope; if so, reads
 * `destKey` at the SAME scope, calls `transform(sourceVal, destVal)` to compute
 * the new destination value, writes the new dest value + removes the source key
 * (both at the same scope). Returns true iff at least one scope was migrated.
 *
 * `transform` may return:
 *   - a value: write it as the new dest value
 *   - undefined: skip the dest write (still remove the source key —
 *                used for Phase 16 D-08 empty/whitespace skip)
 *
 * Never throws — on update() rejection, logs via config.logger.logInfo and
 * returns false for that scope.
 */
async function migrateScopedSetting<TSrc, TDest>(opts: {
  namespace: string;          // "gs-behave-bdd" or "behave-vsc"
  sourceKey: string;          // legacy key being read + removed
  destNamespace?: string;     // destination namespace (defaults to namespace)
  destKey: string;            // canonical key being written
  wkspUri: vscode.Uri;
  transform: (sourceVal: TSrc, destValAtSameScope: TDest | undefined) => TDest | undefined;
}): Promise<boolean>;
```

**Why this signature:**
- Two namespace params (with `destNamespace` defaulting to `namespace`) handle Phase 16's behave-vsc → gs-behave-bdd cross-namespace write without complicating the Phase 15 in-namespace use.
- `transform` is a pure function — keeps the primitive's side effects (read/write/remove) separated from the per-migration value logic. Phase 15 transform: `(boolValue, existingArr) => boolValue === true ? mergeKey(existingArr ?? [], "multiConfigNotification") : undefined`. Phase 16 transform per-namespace-per-scope: `(strValue, existingArr) => isBlank(strValue) ? undefined : mergeNormalized(existingArr ?? [], strValue)`.
- `Promise<boolean>` lets callers aggregate (Phase 16 wrapper does `migrated = migrated || result`).

### Pattern 2: Same-Scope Merge-with-Dedup (Phase 16 specific)

**What:** When migrating singular `featuresPath` and a non-empty plural `featuresPaths` array exists at the same scope, append the singular to the array if not already present (D-06), comparing post-normalization (D-07).

**When to use:** Inside the Phase 16 transform callback.

**Example:**
```typescript
// Source: src/notifications.ts (Phase 16, NEW)

// Same normalization as src/settings.ts:204 / L214 (D-07)
function normalizePathEntry(s: string): string {
  return s.replace(/^\\|^\//, "").replace(/\\$|\/$/, "").trim();
}

function isBlankPath(s: string | undefined): boolean {
  return s === undefined || s.trim() === "";
}

// Phase 16 transform: legacy string → merged-into-existing-or-new array
function featuresPathTransform(
  legacyValue: string,
  existingArr: string[] | undefined,
): string[] | undefined {
  if (isBlankPath(legacyValue)) {
    // D-08: skip the dest write but still remove the source key.
    // Returning undefined signals "skip dest write — caller still removes source".
    return undefined;
  }
  const normalizedLegacy = normalizePathEntry(legacyValue);
  const current = Array.isArray(existingArr) ? [...existingArr] : [];
  // D-07: dedup compares post-normalization
  const alreadyPresent = current.some(p => normalizePathEntry(p) === normalizedLegacy);
  if (alreadyPresent) return current;  // already there — but still write it back so we know we migrated
  return [...current, normalizedLegacy];
}
```

**Subtlety:** "already present" is treated as a successful migration (returns the current array, not `undefined`) so the source key still gets removed. The user's intent (one canonical destination) is achieved even when the destination already had it.

### Pattern 3: Two-Namespace Iteration (Phase 16 specific)

**What:** Iterate over `["gs-behave-bdd", "behave-vsc"]` and call the primitive once per source namespace; the destination is always `gs-behave-bdd.featuresPaths` (D-02).

**Example:**
```typescript
// Source: src/notifications.ts (Phase 16, NEW)

const FEATURES_PATH_NAMESPACES = ["gs-behave-bdd", "behave-vsc"] as const;

export async function migrateLegacyFeaturesPath(wkspUri: vscode.Uri): Promise<boolean> {
  let anyMigrated = false;
  for (const sourceNs of FEATURES_PATH_NAMESPACES) {
    const migrated = await migrateScopedSetting<string, string[]>({
      namespace: sourceNs,
      sourceKey: "featuresPath",
      destNamespace: "gs-behave-bdd",   // always canonical (D-02)
      destKey: "featuresPaths",
      wkspUri,
      transform: featuresPathTransform,
    });
    anyMigrated = anyMigrated || migrated;
  }
  return anyMigrated;
}
```

**Cross-scope independence (D-04) is automatic:** The primitive iterates scopes top-down within a single namespace call. Two calls (one per namespace) means scope-detection runs independently — a `behave-vsc.featuresPath` at workspace scope and a `gs-behave-bdd.featuresPath` at workspaceFolder scope each get migrated to their respective scopes.

**Subtlety — same-scope, two namespaces:** If the user has BOTH `gs-behave-bdd.featuresPath` AND `behave-vsc.featuresPath` set at the same scope (rare), the first iteration migrates `gs-behave-bdd.featuresPath` into the destination at that scope. The second iteration reads the destination via `inspect()` at the same scope — it now contains the just-written value. The transform's dedup (D-07) prevents double-append. Result: both source keys removed, destination has one entry. Verified by mental trace; documented as a test case in §Validation Architecture.

### Pattern 4: Schema Removal Without Migration Regression

**What:** After DEP-01 removes the singular schema, `cfg.inspect("featuresPath")` may behave differently for unregistered keys. Phase 15 verified that user-set values in settings.json are still surfaced via `globalValue`/`workspaceValue`/`workspaceFolderValue`.

**When to use:** Any phase removing a schema entry with a parallel migration. Already-shipped Phase 15 work proved this assumption empirically against the project's vscode mock; real-VSCode confirmation deferred to Phase 17.

**Reference:** `test/unit/notifications.test.ts:48-74` (A1 probe — passes against mock; carries forward unchanged for Phase 16).

### Anti-Patterns to Avoid

- **Reading `cfg.get<string[]>("featuresPaths")` for dedup before write:** `get()` merges scopes (most-specific wins). For dedup we must compare against the value at the *same* scope we're about to write. Always use `inspect().<sameScopeName>Value`. (Pitfall 2 from Phase 15 — load-bearing for Phase 16's same-scope merge.)
- **Removing the schema (DEP-01) before the migration runs at first activation:** First post-update activation must run the migration. The schema removal is part of the same release; both ship together. The Phase 15 A1 probe confirmed `inspect()` of unregistered key still surfaces user-set values, so a fresh-install user without the legacy key sees no migration overhead. (Pitfall 1 from Phase 15.)
- **Calling the notification fire-and-forget INSIDE the activation loop:** That breaks D-18 ordering — notifications would fire before `reloadSettings` had a chance to populate `suppressedNotifications` for THIS workspace, allowing a freshly-suppressed `featuresPathMigration` to fire anyway. Fire AFTER the loop (see "Component Responsibilities" — `pendingNotifs` array).
- **Forgetting to clear the singular-specific test cases:** `multiPathPrecedence.test.ts:117-124` (Rung 2), `:201-249` (both-set info log), `:253-267` (TestWorkspaceConfig featuresPaths default test that constructs with `featuresPath: 'features'`) — all need updating in DEP-06/DEP-07. Plan must enumerate them or DEP-06 ships incomplete.
- **Using `===` to compare path strings without normalization:** `"features"` and `"/features/"` and `"features\\"` are the same path post-normalization. Use the existing `src/settings.ts:204` rule (D-07).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-scope settings detection | Custom config-file reader | `vscode.WorkspaceConfiguration.inspect<T>()` | Already used 16+ times in this codebase; Phase 15 primitive proves the pattern. |
| Scope-aware setting write/remove | Direct `fs.writeFile` to settings.json | `WorkspaceConfiguration.update(key, value, target)` (and `update(key, undefined, target)` to remove) | VS Code handles file location, JSONC formatting, multi-root semantics, and notifies other extensions. |
| Notification with "Don't Show Again" | Custom modal logic | `showSuppressibleNotification(key, msg, buttons, wkspUri)` from Phase 15 | Already-shipped wrapper handles append + intercept + WorkspaceFolder-scope write. Phase 16 reuses unchanged. |
| Idempotency guard | Module-level `_alreadyMigrated` boolean | The dedup check + the source-of-truth-once design | Migration is idempotent by construction: if it ran, source key is `undefined` → primitive returns false. Re-runs harmless. (Same as Phase 15.) |
| Open settings UI scoped to extension | Custom URL/command building | `vscode.commands.executeCommand("workbench.action.openSettings", "@ext:formlabs.gs-behave-bdd")` | VS Code's standard pattern for extension-scoped settings UI. Already used at `src/extension.ts:132` for the malformed-config notification. [VERIFIED in source] |

**Key insight:** Every primitive needed for Phase 16 already exists in the codebase or VS Code API. The phase is glue work + one extraction (D-MOD) + cleanup. No novel mechanics.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | User settings.json files containing `gs-behave-bdd.featuresPath: "..."` AND/OR `behave-vsc.featuresPath: "..."` (across global, workspace, workspaceFolder scopes) | Migration writes `gs-behave-bdd.featuresPaths: [...]` at same scope + removes source key (D-03, D-04). One-time per namespace×scope per user. |
| Live service config | None — extension does not register external services. | None. |
| OS-registered state | None — extension does not register OS hooks or watch any global state. | None. |
| Secrets/env vars | None — no secrets touch this phase. | None. |
| Build artifacts | None — TypeScript-only changes; webpack rebuilds bundle from source. | Standard `npm run compile` after changes. The `dist/extension.js` bundle is regenerated. |

**The canonical question:** *After every file in the repo is updated, what runtime systems still have the old string cached, stored, or registered?*

→ Only user settings.json files (handled by the migration). Nothing else. The `WorkspaceSettings` cache is in-memory; it's rebuilt on `reloadSettings()` post-migration (D-18 / Pitfall 4).

## Common Pitfalls

Phase 15's pitfalls 1-5 carry forward unchanged. Cited from `.planning/phases/15-notification-suppression/15-RESEARCH.md`:

- **Pitfall 1** (Schema removal before migration runs) — `15-RESEARCH.md` "Common Pitfalls" §Pitfall 1. Load-bearing for Phase 16 DEP-01: removing the `featuresPath` schema relies on `inspect()` of an unregistered key still surfacing user-set values. Phase 15 A1 probe at `test/unit/notifications.test.ts:48-74` covers the same contract for the singular boolean and is the generalized contract Phase 16 inherits. Real-VSCode smoke deferred to Phase 17.
- **Pitfall 2** (Writing dedup against wrong scope — `cfg.get()` merges scopes) — `15-RESEARCH.md` §Pitfall 2. The same-scope merge in `featuresPathTransform` MUST read via `inspect().<scope>Value`, never `cfg.get()`. The primitive enforces this — callers can't get it wrong because they receive `existingArr` already scope-correct from the primitive.
- **Pitfall 3** (Activation race — migration not awaited before notification fires) — `15-RESEARCH.md` §Pitfall 3. Phase 16 inherits via the same `await` in `activate()`. Strengthened by D-18: BOTH migrations awaited before notification fires.
- **Pitfall 4** (`WorkspaceSettings` cache not refreshed post-migration) — `15-RESEARCH.md` §Pitfall 4. Existing code at `src/extension.ts:300` already calls `config.reloadSettings(wkspUri)` after the Phase 15 migration. Phase 16 changes the loop to call `reloadSettings` ONCE after BOTH migrations (D-18) — single refresh covers both.
- **Pitfall 5** (TestWorkspaceConfig.inspect() only sets workspaceFolderValue) — `15-RESEARCH.md` §Pitfall 5. Phase 16 unit tests use the inline `makePerKeyScopedConfig` helper (already exported from `test/unit/notifications.test.ts:257`) for migration tests, not `TestWorkspaceConfig`.

### Phase 16-Specific Pitfalls

#### Pitfall 6: Cleanup-driven test breakage cascade

**What goes wrong:** After dropping `featuresPath` from `TestWorkspaceConfig` (DEP-06), every fixture that constructs a `TestWorkspaceConfig` with `featuresPath: ...` becomes a TypeScript compile error (or in JS, a silent runtime drop). Several integration test fixtures pass it positionally.

**Why it happens:** The constructor's destructured object signature includes `featuresPath: string | undefined`. Removing it changes the public type.

**How to avoid:** The plan must enumerate all 6 call sites (5 in `test/integration/suite-shared/shared.workspace.tests.ts` and `test/integration/debug suite/extension.test.ts`, 1 in `test/unit/settings/multiPathPrecedence.test.ts:255-262`) and treat them as a single atomic task — either all updated together, or the typecheck fails. The lint+unit-test gate at task-end catches it; integration tests are gated separately.

**Warning signs:** `tsc` reports "Property 'featuresPath' does not exist in type '...'" after constructor change; integration suite fails to compile during `npm test`.

**Concrete fixture call sites verified:**
- `test/integration/debug suite/extension.test.ts:35` — `featuresPath: undefined`
- `test/integration/suite-shared/shared.workspace.tests.ts:26` — `featuresPath: undefined`
- `test/integration/suite-shared/shared.workspace.tests.ts:43` — `featuresPath: wkspRelativeFeaturesPath`
- `test/integration/suite-shared/shared.workspace.tests.ts:60` — `featuresPath: wkspRelativeFeaturesPath`
- `test/integration/suite-shared/shared.workspace.tests.ts:76` — `featuresPath: wkspRelativeFeaturesPath`
- `test/unit/settings/multiPathPrecedence.test.ts:257` — `featuresPath: 'features'`

(Total: **6 call sites**.) The 4 in `shared.workspace.tests.ts` that pass `wkspRelativeFeaturesPath` are load-bearing — the parameter goes through the workspace config to the extension under test. Replacement: the test must instead pass `featuresPaths: [wkspRelativeFeaturesPath]` (singular array) so the singular value lands in the plural setting where the extension now reads it. Verify the constructor signature still accepts `featuresPaths` (it does — `src/testWorkspaceConfig.ts:17, 40, 57`).

#### Pitfall 7: `discoveryPriority.test.ts` and `discoverySource.test.ts` test-by-test cleanup

**What goes wrong:** These two files exercise `hasExplicitSetting(cfg, 'featuresPath', ...)` directly. After DEP-05 collapses `hasFeaturesFolder` to no longer call this helper for `featuresPath`, the function `hasExplicitSetting` remains (it's used for `projectPath`), but its `featuresPath` test cases become semantically meaningless — they test a code path that no longer affects discovery.

**Why it happens:** The tests were Phase 8/9 era; they exercised the discovery branch's signal that `featuresPath` was explicitly set.

**How to avoid:** The plan must DELETE (not modify) test cases at:
- `test/unit/settings/discoveryPriority.test.ts:70-83` (4 tests for `featuresPath set at workspaceValue/Folder/Global`)
- `test/unit/settings/discoveryPriority.test.ts:86-99` (2 tests using `featuresPath` literal)
- `test/unit/settings/discoveryPriority.test.ts:102-113` (2 tests asserting `featuresPath` returns false)
- `test/unit/settings/discoverySource.test.ts:60-105` and similar test cases

`hasExplicitSetting(cfg, 'projectPath', ...)` tests survive — those are still load-bearing. The `featuresPath` branch tests can be replaced with `hasExplicitNonEmptyArraySetting(cfg, 'featuresPaths')` tests if not already covered, OR simply deleted if the plural variant is already tested elsewhere (verify in `multiPathPrecedence.test.ts`).

**Warning signs:** Tests pass after DEP-05 but cover a non-existent code path; coverage reports show `hasFeaturesFolder` Branch A featuresPath check as "0% covered" (expected — it's gone).

#### Pitfall 8: D-18 ordering with TWO migrations + ONE reloadSettings

**What goes wrong:** The existing loop at `src/extension.ts:297-306` has the structure:
```
for (wkspUri) {
  try {
    await migrateLegacySuppressMultiConfig(wkspUri);  // L299
    config.reloadSettings(wkspUri);                    // L300 (NOT awaited!)
  } catch (e) { logInfo(...); }
}
```
D-18 says "After both, await config.reloadSettings(wkspUri) once." But the existing code calls `reloadSettings` synchronously without `await`. Adding the new migration BEFORE the existing one and keeping `reloadSettings` between them is wrong (introduces a partial cache). Calling `reloadSettings` only after both migrations is correct.

**Why it happens:** `config.reloadSettings(wkspUri)` is synchronous in the codebase (verified in `src/configuration.ts` — re-reads settings synchronously into the cache). The Phase 15 code didn't `await` because it didn't need to. Phase 16 must NOT introduce an `await` on `reloadSettings` because that changes the contract for all other callers (e.g., `extension.ts:834, 964, 982, 987`).

**How to avoid:** Plan replaces the loop body with:
```typescript
let migrated = false;
try {
  migrated = await migrateLegacyFeaturesPath(wkspUri);   // D-18 step 1: data shape
  await migrateLegacySuppressMultiConfig(wkspUri);        // D-18 step 2: UX
  config.reloadSettings(wkspUri);                         // D-18 step 3: refresh (sync, no await)
} catch (e) {
  config.logger.logInfo(`Phase 16 migration error: ${e}`, wkspUri);
}
if (migrated) pendingNotifs.push(wkspUri);
```
Note `migrateLegacyFeaturesPath` returns `Promise<boolean>` (D-01), so the `await` captures the result. `migrateLegacySuppressMultiConfig` still returns `Promise<void>`. The single `reloadSettings` covers both.

**Warning signs:** Notification fires before suppression list is current; users who suppress on first activation see the notification again on next activation if migration somehow re-runs (it shouldn't, but the cache miss would expose it).

#### Pitfall 9: "Open Settings" button URI quoting

**What goes wrong:** `vscode.commands.executeCommand("workbench.action.openSettings", "@ext:formlabs.gs-behave-bdd")` opens the settings UI filtered to the extension. The publisher prefix is required — without it, VS Code falls back to a partial-match search.

**Why it happens:** VS Code's `@ext:` filter syntax requires `<publisher>.<extension-name>`. The publisher comes from `package.json` `publisher` field; verify the actual value before locking the string.

**How to avoid:** Read `package.json` for the actual `publisher` value during Wave 0. Use that string. (`CLAUDE.md` and `15-RESEARCH.md` reference `formlabs` but verify before locking the literal.) The pattern at `src/extension.ts:132` uses `'gs-behave-bdd'` (no `@ext:` prefix) which opens the search — the Phase 16 button should use the more specific `@ext:<publisher>.gs-behave-bdd` form to filter to only this extension's settings.

**Warning signs:** "Open Settings" opens settings UI with a generic search, not filtered to this extension; user has to scroll to find featuresPaths.

## Code Examples

### Refactored Phase 15 helper (regression bar: same 8 sub-cases pass)

```typescript
// Source: src/notifications.ts (REFACTORED) — public signature unchanged
export async function migrateLegacySuppressMultiConfig(wkspUri: vscode.Uri): Promise<void> {
  await migrateScopedSetting<boolean, string[]>({
    namespace: "gs-behave-bdd",
    sourceKey: "suppressMultiConfigNotification",
    destKey: "suppressedNotifications",
    wkspUri,
    transform: (legacyValue, existingArr) => {
      if (legacyValue !== true) return undefined;  // skip dest write but still remove source
      const current = Array.isArray(existingArr) ? [...existingArr] : [];
      if (current.includes("multiConfigNotification")) return current;
      return [...current, "multiConfigNotification"];
    },
  });
  // Public signature is Promise<void> — discard the boolean return.
}
```

**Behavior preservation** (regression bar):
- `legacyValue !== true` → returns `undefined` from transform → primitive skips dest write → the existing test "migrate no-op when legacy value is false" (`test/unit/notifications.test.ts:329-336`) still passes (dest write count = 0; source removal also skipped because there's no migration to commit).

  ⚠ **Subtlety to verify in implementation:** the existing Phase 15 code at `src/notifications.ts:108` does `if (target === undefined || legacyValue !== true) return;` — meaning when `legacyValue === false`, it returns BEFORE any update calls. The test asserts `updateSpy.callCount === 0`. The primitive must replicate this: when `transform` returns `undefined` AND the source key has a non-undefined value, do NOT call `update(sourceKey, undefined, target)` — because that would trip the test (callCount would be 1, not 0). For Phase 15: false → no source removal needed (the key still says false; user's preference). For Phase 16 D-08: blank-string → DO remove source (the user has nothing worth keeping). The two cases are different; the primitive must distinguish.

  **Resolution:** Two transform return values needed:
  - `undefined`: skip BOTH dest write AND source removal (Phase 15 false-case)
  - sentinel `SKIP_DEST` (or a distinct return shape): skip dest write but DO remove source (Phase 16 blank-string case)

  **Concrete signature:**
  ```typescript
  type TransformResult<T> =
    | { kind: 'write'; value: T }
    | { kind: 'skipDest'; removeSource: boolean };

  transform: (sourceVal, destValAtSameScope) => TransformResult<TDest>;
  ```
  This is cleaner than overloading `undefined`. Phase 15 transform returns `{kind:'skipDest', removeSource:false}` for legacyValue=false; Phase 16 transform returns `{kind:'skipDest', removeSource:true}` for blank-string.

### New Phase 16 helper

```typescript
// Source: src/notifications.ts (NEW)
const FEATURES_PATH_NAMESPACES = ["gs-behave-bdd", "behave-vsc"] as const;

function normalizePathEntry(s: string): string {
  // Same rule as src/settings.ts:204 (D-07)
  return s.replace(/^\\|^\//, "").replace(/\\$|\/$/, "").trim();
}

export async function migrateLegacyFeaturesPath(wkspUri: vscode.Uri): Promise<boolean> {
  let anyMigrated = false;
  for (const sourceNs of FEATURES_PATH_NAMESPACES) {
    const migrated = await migrateScopedSetting<string, string[]>({
      namespace: sourceNs,
      sourceKey: "featuresPath",
      destNamespace: "gs-behave-bdd",
      destKey: "featuresPaths",
      wkspUri,
      transform: (legacyValue, existingArr) => {
        if (legacyValue === undefined || legacyValue.trim() === "") {
          // D-08: remove source but skip dest write
          return { kind: 'skipDest', removeSource: true };
        }
        const normalized = normalizePathEntry(legacyValue);
        if (normalized === "") {
          // Defensive: post-normalization blank
          return { kind: 'skipDest', removeSource: true };
        }
        const current = Array.isArray(existingArr) ? [...existingArr] : [];
        // D-07: dedup compares post-normalization
        if (current.some(p => normalizePathEntry(p) === normalized)) {
          return { kind: 'write', value: current };  // already present — but DO write to confirm migration
        }
        return { kind: 'write', value: [...current, normalized] };
      },
    });
    anyMigrated = anyMigrated || migrated;
  }
  return anyMigrated;
}
```

### Activation-loop integration

```typescript
// Source: src/extension.ts:295-310 (MODIFIED)
// Phase 16 / DEP-02..DEP-04: migrate legacy featuresPath → featuresPaths.
// Phase 15 / NOTIF-06: migrate legacy boolean suppression key.
// Order per D-18: data shape FIRST, UX-suppression cleanup SECOND, single reloadSettings, then notify.
const pendingFeaturesPathNotifs: vscode.Uri[] = [];
for (const wkspUri of getUrisOfWkspFoldersWithFeatures()) {
  let migrated = false;
  try {
    migrated = await migrateLegacyFeaturesPath(wkspUri);   // D-18 step 1
    await migrateLegacySuppressMultiConfig(wkspUri);        // D-18 step 2
    config.reloadSettings(wkspUri);                         // D-18 step 3 (sync — Pitfall 8)
  } catch (e) {
    config.logger.logInfo(`Phase 15/16 migration error: ${e}`, wkspUri);
  }
  if (migrated) pendingFeaturesPathNotifs.push(wkspUri);
}

// Phase 16 / DEP-04: fire notification AFTER reloadSettings so suppressedNotifications cache is current.
for (const wkspUri of pendingFeaturesPathNotifs) {
  showSuppressibleNotification(
    "featuresPathMigration",
    "Migrated featuresPath → featuresPaths. The deprecated `featuresPath` setting has been moved to the new `featuresPaths` array.",
    ["Open Settings"],
    wkspUri,
  ).then(action => {
    if (action === "Open Settings") {
      vscode.commands.executeCommand("workbench.action.openSettings", "@ext:formlabs.gs-behave-bdd");
    }
  });
}

// Phase 3: Surface discovery results (UX-01 through UX-05) — UNCHANGED at line ~309
updateDiscoveryUX(getUrisOfWkspFoldersWithFeatures(), false);
```

**Verify before locking:** `formlabs` is the publisher name in package.json. Confirm during Wave 0 by reading `package.json` for the `publisher` field (not shown in this RESEARCH.md scan; the canonical value is the source of truth).

### `package.json` schema removal

```jsonc
// REMOVE this block (package.json:38-43):
"gs-behave-bdd.featuresPath": {
  "scope": "resource",
  "type": "string",
  "markdownDescription": "...",
  "default": "features"
},
// KEEP the existing gs-behave-bdd.featuresPaths block (L44-L52) unchanged.
```

### Settings ladder collapse

```typescript
// Source: src/settings.ts (MODIFIED — DEP-05)
// REMOVE L132-L134 (singular strict-undefined throw):
//   const featuresPathCfg: string | undefined = get("featuresPath");
//   if (featuresPathCfg === undefined) throw "featuresPath is undefined";
// (variable `featuresPathCfg` no longer referenced after below cleanup)

// Process featuresPath(s) — collapsed ladder (3 rungs)
const featuresPathsCfg: string[] | undefined = get<string[] | undefined>("featuresPaths");

let projectRelativeFeaturesPaths: string[];
if (featuresPathsCfg && Array.isArray(featuresPathsCfg) && featuresPathsCfg.length > 0) {
  // Rung 1: plural non-empty (info-log branch L196-L202 REMOVED — no singular to compare against)
  projectRelativeFeaturesPaths = featuresPathsCfg
    .map(p => p.replace(/^\\|^\//, "").replace(/\\$|\/$/, "").trim())
    .filter(p => p.length > 0);
  if (projectRelativeFeaturesPaths.length === 0) {
    // Plural was all-empty → fall to convention (was: fall to singular)
    projectRelativeFeaturesPaths = ["features"];
  }
} else if (entry?.source === 'config-file' && entry.featuresUris.length > 0) {
  // Rung 2 (was Rung 3): config-file discovery paths
  projectRelativeFeaturesPaths = entry.featuresUris.map(u =>
    path.relative(this.projectUri.fsPath, u.fsPath).replace(/\\/g, '/')
  );
} else {
  // Rung 3 (was Rung 4): convention
  projectRelativeFeaturesPaths = ["features"];
}

// Update fatal-error string (L234) to reference plural:
for (const p of projectRelativeFeaturesPaths) {
  if (p === ".") {
    this._fatalErrors.push(`"." is not a valid "gs-behave-bdd.featuresPaths" entry. The features folder must be a subfolder.`);
  }
}
```

### `hasFeaturesFolder` simplification

```typescript
// Source: src/common.ts (MODIFIED — DEP-05)
// At L207-L209, the gate becomes:
if (hasExplicitSetting(wkspConfig, "projectPath", legacyWkspConfig) ||
    hasExplicitNonEmptyArraySetting(wkspConfig, "featuresPaths")) {

  const projectPath = getActualWorkspaceSetting<string>(wkspConfig, "projectPath", legacyWkspConfig);
  // L212: featuresPath read REMOVED entirely
  // ... existing projectPath validation block at L214-L234 unchanged ...

  // === Handle plural featuresPaths (D-11 Rung 1) === (L236-L248 — UNCHANGED)
  const featuresPathsArr = wkspConfig.get<string[]>("featuresPaths");
  if (Array.isArray(featuresPathsArr) && featuresPathsArr.length > 0) {
    // ... existing plural handling unchanged ...
  }

  // default features path, no settings.json required
  let featuresUri = vscode.Uri.joinPath(projectUri, "features");
  const hasDefaultFeaturesFolder = fs.existsSync(featuresUri.fsPath);

  // L256-L283: REMOVE the entire featuresPath-singular block (the `if (!featuresPath && ...)` block,
  // the `featuresUri = vscode.Uri.joinPath(projectUri, featuresPath as string)` block, and the
  // `vscode.window.showWarningMessage(...featuresPath...)` warning notification).
  //
  // Replace with:
  if (!hasDefaultFeaturesFolder) {
    return false; // probably a workspace with no behave requirements
  }
  discoveryCache.set(uriId(folder.uri), { source: "settings", featuresUris: [featuresUri] });
  return true;
}
// ... Branch B unchanged ...
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Singular `featuresPath: string` setting + parallel plural | Plural-only `featuresPaths: string[]` | This phase (v1.4.0) | Single source of truth; multi-path use cases first-class. Migration preserves user intent. |
| `behave-vsc.featuresPath` legacy fallback handled via `getWithLegacyFallback` | `behave-vsc.featuresPath` migrated AT ACTIVATION into `gs-behave-bdd.featuresPaths` | This phase (v1.4.0) | Eliminates one cross-namespace fallback path. Users from the original fork get their value into the canonical destination once. |
| Per-migration scope-detect-write-remove copy-paste | Single `migrateScopedSetting` primitive | This phase (D-MOD) | 3rd migration becomes a ~15-line wrapper, not a copy of the entire pattern. |

**Deprecated/outdated:**
- `gs-behave-bdd.featuresPath` schema entry — removed in DEP-01.
- `WorkspaceSettings.projectRelativeFeaturesPath` getter (`src/settings.ts:82`) — survives, but now reads `[0]` of the always-populated plural array. No external behavior change.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 (carries from Phase 15) | After removing `gs-behave-bdd.featuresPath` from schema, `cfg.inspect("featuresPath")` still returns `globalValue`/`workspaceValue`/`workspaceFolderValue` for the unregistered key when set in settings.json | Pitfall 1, DEP-01 | **MEDIUM** — Phase 15 verified against vscode mock (`test/unit/notifications.test.ts:48-74`); real-VSCode confirmation deferred to Phase 17 manual smoke. If false, migration silently no-ops for existing users. Mitigation if it fails: keep `featuresPath` schema with `deprecationMessage` in v1.4.0 and remove in v1.5.0. |
| A2 | `cfg.update(legacyKey, undefined, target)` removes the user-set value at that target (does not just set it to `undefined` literal) | D-08, DEP-02 | **LOW** — Pattern proven in Phase 15 at `src/notifications.ts:122`, exercised by the test at `test/unit/notifications.test.ts:301-305` which asserts the `update` call is `(legacyKey, undefined, target)`. VS Code API documents this behavior explicitly. [VERIFIED via code: matches existing working pattern.] |
| A3 (carries from Phase 15) | `WorkspaceSettings` cache (`config.workspaceSettings[wkspUri.path]`) does NOT auto-refresh after `cfg.update(...)`; explicit `config.reloadSettings(wkspUri)` is required | Pitfall 4 / Pitfall 8, D-18 | **LOW** — Verified by Phase 15 implementation at `src/extension.ts:300`. If auto-refresh worked, the explicit call is harmless. |
| A4 | `vscode.commands.executeCommand("workbench.action.openSettings", "@ext:<publisher>.<name>")` opens settings UI filtered to the extension | Pitfall 9, D-12 | **MEDIUM** — Standard VS Code pattern but the exact publisher prefix needs verification. The existing `extension.ts:132` uses `"gs-behave-bdd"` (no prefix) which opens a search. Phase 16 should use the more precise `@ext:` form. **Verify in Wave 0:** read `package.json` `publisher` field and lock the literal in the implementation. |
| A5 | Removing `featuresPath` from `TestWorkspaceConfig` constructor's destructured signature is a type-level breaking change; all 6 fixture call sites become compile errors | Pitfall 6, DEP-06 | **LOW** — TypeScript strict mode + the destructured signature in `testWorkspaceConfig.ts:31` makes this a compile error. The lint+unit gate catches it pre-merge. The 6 sites are enumerated in Pitfall 6. |
| A6 | The `@ext:formlabs.gs-behave-bdd` filter, IF the publisher is "formlabs", filters the settings UI to only this extension's settings | D-12 | **LOW** — Standard VS Code documented behavior. Verify publisher name in Wave 0. |

**Verification plan for A4/A6:** Wave 0 must include reading `package.json` for the `publisher` field to lock the exact `@ext:<publisher>.gs-behave-bdd` literal used in the "Open Settings" command. (Was not visible in the lines this research read — defer to implementation.)

## Open Questions

1. **Should `migrateScopedSetting` be exported (for direct primitive testing) or kept module-private (only tested via wrappers)?**
   - What we know: D-MOD's regression bar ("all 8 existing sub-cases pass") indicates testing through the wrappers is mandatory. Phase 15's helpers are exported for unit-test access.
   - What's unclear: Is the primitive valuable to test directly, or is wrapper-coverage sufficient?
   - Recommendation: **Export it** with an exported test name, but mark with a JSDoc note that it's "internal — test via wrappers; direct tests cover the primitive contract." Direct primitive tests (3-4 cases) cover the contract; the 8 existing wrapper tests + 10-15 new Phase 16 wrapper tests cover the full surface. Belt-and-suspenders. Defer to Claude's discretion (CONTEXT explicitly leaves this open).

2. **Does the Phase 15 transform need to handle `legacyValue === false` differently from `legacyValue === undefined`?**
   - What we know: Existing `src/notifications.ts:108` returns when `target === undefined || legacyValue !== true` — both `false` and `undefined` legacy values are treated as no-op.
   - What's unclear: After refactor, does the primitive's transform receive `legacyValue=false` (and return `{kind:'skipDest', removeSource:false}`), OR does the primitive short-circuit before calling transform when the legacy value is "the default"?
   - Recommendation: **Primitive calls transform with whatever non-undefined value it found**. Transform decides "is this worth migrating?". For Phase 15's boolean: `legacyValue === false` → skipDest with removeSource=false (the user explicitly set false; we leave it set, don't auto-clean defaults). For Phase 16's string: `legacyValue === ""` → skipDest with removeSource=true (per D-08, blank means "remove the cruft").

3. **Does behave-vsc.featuresPath need the same legacy-namespace dedup as gs-behave-bdd.featuresPath when both are set at the same scope?**
   - What we know: D-07 specifies dedup post-normalization. D-04 says cross-scope independent. The same-scope-two-namespace case (rare) is covered by Pattern 3's mental trace.
   - What's unclear: Is the second-namespace iteration's `inspect()` of `gs-behave-bdd.featuresPaths` guaranteed to see the just-written value from the first iteration's `update()`?
   - Recommendation: **Yes, it must** — because both `update()` calls are awaited, and VS Code's settings update is synchronous-ish (the next `inspect()` reflects the write). If this proves wrong in real VSCode (Phase 17 smoke), the fix is to pass the dest-after-write value forward via `migrateScopedSetting` returning the new dest value, but that's complexity to defer until proven needed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build / runtime | ✓ | 18.17.1 | — |
| TypeScript compiler | `npm run compile` | ✓ | 4.5.5 | — |
| ESLint | `npx eslint src --ext ts` | ✓ | 8.11.0 | — |
| Mocha | `npm run test:unit` | ✓ | 9.2.2 | — |
| Sinon | Unit test mocking | ✓ | 21.0.1 | — |
| VS Code `^1.82.0` API | Runtime / integration tests | ✓ (engine pinned) | 1.82.0+ | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

Phase 16 introduces no new dependencies; bundle size unchanged.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Mocha 9.2.2 + Sinon 21.0.1 |
| Config file | `test/unit/.mocharc.cjs`; `test/unit/setup.ts` loads `vscode.mock.ts` |
| Quick run command | `npm run test:unit -- --grep "featuresPath\|migrateLegacy\|migrateScoped"` |
| Full suite command | `npm run test:unit` |
| Estimated runtime | ~5s quick, ~30s full unit suite (683 baseline + new tests) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| **DEP-01** | Schema: `gs-behave-bdd.featuresPath` absent from package.json | unit (schema validation) | `node -e "const p=require('./package.json'); if('gs-behave-bdd.featuresPath' in p.contributes.configuration.properties) process.exit(1)"` | ❌ Wave 0 |
| **DEP-01** | Schema: `gs-behave-bdd.featuresPaths` still present | unit (schema validation) | `node -e "const p=require('./package.json'); if(!('gs-behave-bdd.featuresPaths' in p.contributes.configuration.properties)) process.exit(1)"` | ✅ existing assertion (extends from Phase 15 schema test) |
| **DEP-02 (gs-behave-bdd folder scope)** | `migrateLegacyFeaturesPath` reads `inspect().workspaceFolderValue=value` and writes `["value"]` to `gs-behave-bdd.featuresPaths` at WorkspaceFolder | unit | `npx mocha out/test/test/unit/notifications.test.js --grep "migrateLegacyFeaturesPath.*WorkspaceFolder.*gs-behave-bdd"` | ❌ Wave 0 |
| **DEP-02 (gs-behave-bdd workspace scope)** | Migration reads `inspect().workspaceValue=value` writes at `Workspace` target | unit | grep "migrateLegacyFeaturesPath.*Workspace$" | ❌ Wave 0 |
| **DEP-02 (gs-behave-bdd global scope)** | Migration reads `inspect().globalValue=value` writes at `Global` target | unit | grep "migrateLegacyFeaturesPath.*Global" | ❌ Wave 0 |
| **DEP-02 (behave-vsc folder scope)** | `behave-vsc.featuresPath` migrated to `gs-behave-bdd.featuresPaths` at folder scope | unit | grep "behave-vsc.*featuresPath.*WorkspaceFolder" | ❌ Wave 0 |
| **DEP-02 (behave-vsc workspace scope)** | Same at workspace scope | unit | grep "behave-vsc.*featuresPath.*Workspace$" | ❌ Wave 0 |
| **DEP-02 (behave-vsc global scope)** | Same at global scope | unit | grep "behave-vsc.*featuresPath.*Global" | ❌ Wave 0 |
| **DEP-02 (returns true on migration)** | Helper returns `true` when at least one scope migrated | unit | grep "migrateLegacyFeaturesPath.*returns true" | ❌ Wave 0 |
| **DEP-02 (returns false when nothing to migrate)** | Helper returns `false` when no legacy value at any scope in either namespace | unit | grep "migrateLegacyFeaturesPath.*returns false" | ❌ Wave 0 |
| **DEP-03** | Migration writes at exact source scope (covered by per-scope tests above) | unit | (covered by DEP-02 sub-cases) | ❌ Wave 0 |
| **DEP-04 (notification fires when migrated)** | Activation calls `showSuppressibleNotification("featuresPathMigration", ..., wkspUri)` when helper returns true | unit (extension flow / structural) | grep "extension.*featuresPathMigration" | ❌ Wave 0 |
| **DEP-04 (notification suppresses)** | When `suppressedNotifications` contains `featuresPathMigration`, notification does not fire | unit (covered by Phase 15 `isSuppressed`) | (existing) | ✅ existing |
| **DEP-04 (Open Settings button)** | Clicking "Open Settings" executes `workbench.action.openSettings` with `@ext:<publisher>.gs-behave-bdd` | unit | grep "Open Settings.*workbench.action.openSettings" | ❌ Wave 0 |
| **DEP-05 (settings.ts collapsed)** | `WorkspaceSettings` constructor does not call `get("featuresPath")` | unit (structural) | `node -e "const s=require('fs').readFileSync('src/settings.ts','utf8'); if(s.match(/get\\(\"featuresPath\"\\)/)) process.exit(1)"` | ❌ Wave 0 |
| **DEP-05 (common.ts simplified)** | `hasFeaturesFolder` does not call `hasExplicitSetting(.., "featuresPath", ..)` | unit (structural) | `node -e "const s=require('fs').readFileSync('src/common.ts','utf8'); if(s.match(/hasExplicitSetting\\([^,]+,\\s*\"featuresPath\"/)) process.exit(1)"` | ❌ Wave 0 |
| **DEP-05 (collapsed ladder behavior)** | Plural-only ladder produces correct `featuresUris` for plural-set, config-file, convention cases | unit | `npx mocha out/test/test/unit/settings/multiPathPrecedence.test.js` | ✅ existing (modified to drop singular cases) |
| **DEP-06** | `TestWorkspaceConfig` constructor accepts no `featuresPath` parameter; calls without it succeed | unit (TS compilation) | `npx tsc -p test/tsconfig.json --noEmit` (existing build gate) | ✅ existing — `npm run compile` |
| **DEP-06 (mock get/inspect)** | `TestWorkspaceConfig.get<string[]>("featuresPaths")` returns `[]` default; `get` of `featuresPath` THROWS (cleaned switch case) | unit | `npx mocha out/test/test/unit/settings/multiPathPrecedence.test.js --grep "TestWorkspaceConfig.*featuresPaths"` | ✅ existing — extend |
| **DEP-07 (regression bar)** | All 8 existing `migrateLegacySuppressMultiConfig` sub-cases still pass after D-MOD refactor | unit | `npx mocha out/test/test/unit/notifications.test.js --grep "migrateLegacySuppressMultiConfig"` | ✅ existing (must stay green) |
| **DEP-07 (same-scope merge)** | `migrateLegacyFeaturesPath` with existing `featuresPaths: ["other"]` at same scope produces `["other", "newValue"]` | unit | grep "migrateLegacyFeaturesPath.*merge" | ❌ Wave 0 |
| **DEP-07 (dedup)** | `migrateLegacyFeaturesPath` with existing `featuresPaths: ["features"]` and singular `featuresPath: "features"` does NOT double-append | unit | grep "migrateLegacyFeaturesPath.*dedup" | ❌ Wave 0 |
| **DEP-07 (normalization-aware dedup)** | `featuresPaths: ["features"]` and singular `featuresPath: "/features/"` (slashes) → no double-append | unit | grep "migrateLegacyFeaturesPath.*normaliz" | ❌ Wave 0 |
| **DEP-07 (D-08 empty)** | Singular `featuresPath: ""` → source removed, plural unchanged | unit | grep "migrateLegacyFeaturesPath.*empty" | ❌ Wave 0 |
| **DEP-07 (D-08 whitespace)** | Singular `featuresPath: "   "` → source removed, plural unchanged | unit | grep "migrateLegacyFeaturesPath.*whitespace" | ❌ Wave 0 |
| **DEP-07 (D-09 dot)** | Singular `featuresPath: "."` → migrated literally; existing `settings.ts:233` fatal-error guard handles it | unit | grep "migrateLegacyFeaturesPath.*dot" | ❌ Wave 0 |
| **DEP-07 (D-09 features default)** | Singular `featuresPath: "features"` (the default) but explicitly set → migrated literally | unit | grep "migrateLegacyFeaturesPath.*features default" | ❌ Wave 0 |
| **DEP-07 (idempotent)** | Running migration twice produces no additional updates | unit | grep "migrateLegacyFeaturesPath.*idempotent" | ❌ Wave 0 |
| **DEP-07 (failure logs)** | `update` rejection logs warn, does not throw | unit | grep "migrateLegacyFeaturesPath.*failure" | ❌ Wave 0 |
| **DEP-07 (both namespaces)** | Both `gs-behave-bdd.featuresPath` AND `behave-vsc.featuresPath` set at same scope → both removed, dest has both values (deduped) | unit | grep "migrateLegacyFeaturesPath.*both namespaces" | ❌ Wave 0 |
| **D-MOD primitive direct (optional)** | `migrateScopedSetting` boolean→array case behaves identically to Phase 15 helper inline implementation | unit | grep "migrateScopedSetting" | ❌ Wave 0 |
| **D-18 ordering** | `migrateLegacyFeaturesPath` precedes `migrateLegacySuppressMultiConfig` in `extension.ts` activation loop | unit (structural) | extends existing `test/unit/notifications.test.ts:400-411` to assert featuresPath migration comes first | ❌ Wave 0 (extends existing) |
| **D-18 single reloadSettings** | `reloadSettings` is called ONCE after both migrations | unit (structural) | new structural test | ❌ Wave 0 |
| **Activation flow integration** | Real VSCode: stale `featuresPath: "x"` in settings.json → after activation, `featuresPaths: ["x"]` at same scope, old key absent | integration | `npm run test:integration` (real-VSCode launch) | ❌ deferred to Phase 17 (matches Phase 15's deferred A1 verification) |

### Sampling Rate
- **Per task commit:** `npm run test:unit -- --grep "featuresPath\|migrateLegacy\|migrateScoped\|TestWorkspaceConfig"` (target ≤ 5s)
- **Per wave merge:** `npm run test:unit` (full unit suite — must stay at 683+ passing, 0 failing; new Phase 16 tests increase the count)
- **Phase gate:** `npm test` (lint + compile + unit + integration) green before `/gsd-verify-work`
- **Max feedback latency:** 30 seconds

### Wave 0 Gaps

- [ ] **`test/unit/notifications.test.ts`** — extend existing file (or split into a new `test/unit/settingsMigration.test.ts` if the planner prefers; the helper file decision is Claude's discretion) with:
  - Direct `migrateScopedSetting` primitive tests (3-4 cases) — optional, recommended
  - `migrateLegacyFeaturesPath` per-scope-per-namespace tests (6 base cases × scopes)
  - Boolean-return tests (2 cases: returns true/false)
  - Same-scope merge + dedup + normalization tests (4-5 cases)
  - D-08 empty/whitespace/post-normalization-blank tests (3 cases)
  - D-09 dot/features-default literal-migration tests (2 cases)
  - Both-namespaces-same-scope test (1 case)
  - Idempotency test (1 case)
  - Update-rejection logs warn test (1 case)
- [ ] **`test/unit/notifications.test.ts:400-428`** — extend the existing 3 structural tests to cover D-18 ordering: featuresPath migration precedes suppressMultiConfig migration; single reloadSettings after both; pendingNotifs loop fires AFTER both migrations.
- [ ] **`test/unit/settings/multiPathPrecedence.test.ts`** — drop `featuresPath: 'features'` from `BASE_CFG` at L69 and the `buildSettings` helper. Drop the singular Rung 2 test suite (L117-L124). Drop "all-empty plural falls to singular" suite (L147-L154 — replace with "all-empty plural falls to convention features"). Drop the both-set info-log suite (L201-L249). Update the `TestWorkspaceConfig featuresPaths default` test (L253-L267) to drop the `featuresPath` constructor arg.
- [ ] **`test/unit/settings/discoveryPriority.test.ts`** — delete tests at L70-L83, L93-L98, L102-L113 that use `featuresPath` literal; keep `projectPath` parallel tests.
- [ ] **`test/unit/settings/discoverySource.test.ts`** — delete tests at L60-L102 and L141-L147 that use `featuresPath` literal.
- [ ] **`test/unit/settings/legacyFallback.test.ts`** — delete tests at L124-L144 that use `featuresPath`. The legacy fallback mechanism survives for `projectPath`.
- [ ] **`test/unit/settings/projectUriDerivation.test.ts:55`** — drop `featuresPath: 'features'` from BASE_CFG.
- [ ] **`test/unit/settings/logSettingsPlural.test.ts`** — review for `featuresPath` references; drop accordingly.
- [ ] **`test/integration/suite-shared/shared.workspace.tests.ts`** — replace `featuresPath: wkspRelativeFeaturesPath` with `featuresPaths: wkspRelativeFeaturesPath ? [wkspRelativeFeaturesPath] : undefined` at L26, L43, L60, L76 (4 sites). Drop `featuresPath: undefined` at L26.
- [ ] **`test/integration/debug suite/extension.test.ts:35`** — drop `featuresPath: undefined`.
- [ ] **Schema validation snippets** — inline `node -e` checks for DEP-01 (singular absent + plural present). Pattern at `15-VALIDATION.md:43, 59` is the template.
- [ ] **Wave 0 publisher verification** — read `package.json` for the `publisher` field and lock the `@ext:<publisher>.gs-behave-bdd` literal in the implementation (Pitfall 9 / A4).

*If no gaps: not applicable — Phase 16 has substantial test cascade work.*

### Manual-Only Verifications (deferred to Phase 17)

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end activation migration in real VSCode host | DEP-02 cross-cutting | Requires real workspace with stale `gs-behave-bdd.featuresPath: "..."` in `.vscode/settings.json` and a real VSCode launch | Open `test/example-projects/multiroot-workspace/`, set `gs-behave-bdd.featuresPath: "my-features"` in one folder's `.vscode/settings.json`, launch Extension Development Host, confirm: (a) `featuresPaths: ["my-features"]` appears at same scope, (b) old key gone, (c) notification fires with "Open Settings" button, (d) clicking "Open Settings" opens settings UI filtered to extension. |
| `behave-vsc.featuresPath` migration in real VSCode host | DEP-02 (D-02) | Same as above but with legacy fork namespace | Set `behave-vsc.featuresPath: "old-features"` in `.vscode/settings.json`, confirm migration to `gs-behave-bdd.featuresPaths: ["old-features"]`. |
| Same-scope merge with existing plural in real VSCode host | DEP-07 (D-06) | Requires real settings.json with both keys at same scope | Set both `featuresPaths: ["a"]` and `featuresPath: "b"` at workspace folder scope, confirm post-activation: `featuresPaths: ["a", "b"]`, `featuresPath` removed. |
| A1 probe in real VSCode host | DEP-01 cross-cutting | Same as Phase 15 A1 probe but for `featuresPath` | Carries forward from Phase 15 — the same probe mechanism applies; once Phase 15's smoke is run, Phase 16 inherits the result. |

*All other Phase 16 behaviors have automated unit-test verification.*

### Regression Bar (D-MOD)

After the D-MOD refactor that extracts `migrateScopedSetting` and reroutes Phase 15's `migrateLegacySuppressMultiConfig` through it:

- [ ] All 8 existing `migrateLegacySuppressMultiConfig` sub-cases pass without modification:
  - migrate at WorkspaceFolder scope (L289-L306)
  - migrate at Workspace scope (L308-L317)
  - migrate at Global scope (L319-L327)
  - no-op when legacy value is false (L329-L336)
  - no-op when legacy value absent (L338-L345)
  - merge preserves existing entries (L347-L357)
  - idempotent on second run (L359-L366)
  - failure logs warn, does not throw (L368-L387)
- [ ] All 3 existing structural-ordering tests at L400-L428 pass.
- [ ] Full unit suite stays at ≥ 683 passing, 0 failing (count grows with new Phase 16 tests).

## Project Constraints (from CLAUDE.md)

| Directive | Source | How this phase complies |
|-----------|--------|--------------------------|
| Always run `npx eslint src --ext ts` after TS changes | CLAUDE.md "After Every Code Change" | Each task in the plan ends with the lint gate. |
| Always run `npm run test:unit` after `src/` changes | CLAUDE.md "Unit Tests" | Each task ends with the unit-test gate. |
| Use `urisMatch`/`uriId` for URI comparisons | AI_INSTRUCTIONS.md "URI Handling" | Phase 16 doesn't compare URIs — keys are literal strings, scopes are enum. `wkspUri` flows directly to `getConfiguration()` as opaque parameter. |
| `vscode.Uri.joinPath()` for path construction | AI_INSTRUCTIONS.md | No path construction in migration code. The migrated string values pass through unchanged (settings layer joins them). |
| Top-level handlers call `showError`; helpers `throw` | AI_INSTRUCTIONS.md "Exception Handling" | All Phase 16 helpers (`migrateScopedSetting`, `migrateLegacyFeaturesPath`) `logInfo` warn (per D-05/D-07), they don't `showError`. Top-level `activate()` try/catch at `extension.ts:1038` covers any escaping throw. The notification fire-and-forget `.then(action => ...)` block has no try/catch (matches Phase 15's pattern at the multi-config notification site). |
| Disposables added to `context.subscriptions` | AI_INSTRUCTIONS.md "Disposables Management" | Phase 16 introduces no new disposables. Notifications and migrations are fire-and-forget Thenables. |
| Multi-root workspace support | AI_INSTRUCTIONS.md "Multi-Root Workspace Support" | Migration loops `for (const wkspUri of getUrisOfWkspFoldersWithFeatures())`. Each workspace folder gets its own scope detection and write. Notification fires per workspace folder (D-10). |
| Never block activation; avoid `await` in `activate()` unless necessary | AI_INSTRUCTIONS.md "Performance Requirements" | The migration `await` is necessary (D-18 ordering). Migration is fast (≤6 inspect + ≤12 update calls per workspace × N workspaces). Phase 15 set the precedent. |
| `getUrisOfWkspFoldersWithFeatures()` < 1ms hard requirement | CLAUDE.md "Project / Constraints" | Not affected — Phase 16 doesn't modify the discovery hot path. The simplification of `hasFeaturesFolder` (removing one branch + one `getActualWorkspaceSetting` call) potentially makes it slightly faster. |
| Backward compatibility: explicit settings → zero behavior change | CLAUDE.md "Project / Constraints" | Migration preserves user intent (singular value lands in plural at same scope). Users with no `featuresPath` see no migration. |
| Bundle size: lightweight | CLAUDE.md "Project / Constraints" | This phase adds NO dependencies — bundle size unchanged. |
| Tech stack: TypeScript, VS Code Extension API, Mocha/Sinon for tests. No Python changes. | CLAUDE.md "Project / Constraints" | Phase is TypeScript-only. No Python changes. |

## Sources

### Primary (HIGH confidence)
- `src/notifications.ts` (entire file, 130 lines) — Phase 15 helper structural template; D-MOD source
- `src/settings.ts` L13-L228, L232-L234 — strict-undefined pattern + featuresPath ladder + per-entry "." rejection
- `src/common.ts` L146-L172 (hasExplicitSetting/hasExplicitNonEmptyArraySetting) + L195-L285 (hasFeaturesFolder)
- `src/testWorkspaceConfig.ts` (entire file, 297 lines) — mock surface for DEP-06
- `src/extension.ts` L42, L100-L181, L295-L309, L911-L1029 — activation loop + multi-config notification + configurationChangedHandler
- `package.json` L30-L52, L249, L258, L273 — schema + branding strings
- `test/unit/notifications.test.ts` (entire file, 429 lines) — Phase 15 test template + 8 sub-cases (regression bar)
- `test/unit/settings/multiPathPrecedence.test.ts` (entire file, 269 lines) — TEST-12 fixture
- `test/unit/settings/discoveryPriority.test.ts` L1-L130 — featuresPath test cases to delete
- `test/integration/suite-shared/shared.workspace.tests.ts` L1-L86 — fixture cascade
- `test/integration/debug suite/extension.test.ts` L33-L35 — fixture cascade
- `.planning/phases/15-notification-suppression/15-CONTEXT.md` — Phase 15 decisions D-05/D-07/D-09/D-11 carrying forward
- `.planning/phases/15-notification-suppression/15-RESEARCH.md` — Phase 15 patterns + pitfalls 1-5
- `.planning/phases/15-notification-suppression/15-VALIDATION.md` — Phase 15 task-test map structure (template for §Validation Architecture above)
- `.planning/phases/16-deprecate-featurespath/16-CONTEXT.md` — locked decisions D-01..D-18 + D-MOD
- `.planning/REQUIREMENTS.md` — DEP-01..DEP-07 + traceability
- `AI_INSTRUCTIONS.md` (entire file) — exception handling, disposables, multi-root, performance, URI handling
- `CLAUDE.md` (project root) — lint + unit-test mandate, project constraints

### Secondary (MEDIUM confidence)
- [VS Code API: WorkspaceConfiguration interface](https://code.visualstudio.com/api/references/vscode-api#WorkspaceConfiguration) — `inspect()` and `update()` semantics, `ConfigurationTarget` enum [CITED]
- [VS Code API: workbench.action.openSettings](https://code.visualstudio.com/api/references/commands) — `@ext:<publisher>.<name>` filter syntax [CITED — verify publisher in Wave 0]

### Tertiary (LOW confidence)
- None for this phase. All structural decisions are derived from concrete file reads, and all primitives have HIGH-confidence existing-pattern templates in the codebase.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — no new dependencies; all primitives are existing project conventions verified in source
- Architecture: **HIGH** — D-MOD primitive shape derived from concrete reading of Phase 15 helper; activation-loop change is a 3-line addition to verified existing code
- Pitfalls: **HIGH** for #2/3/4/8 (carries from Phase 15); **HIGH** for #6/7 (verified by enumerating call sites); **MEDIUM** for #1 (Phase 15 inherited assumption), #9 (publisher prefix needs Wave 0 confirmation)
- Validation: **HIGH** — Mocha + Sinon infrastructure exists; test patterns proven in Phase 15; `makePerKeyScopedConfig` helper at `test/unit/notifications.test.ts:257` directly reusable for the 6+ Phase 16 scope test cases

**Research date:** 2026-04-28
**Valid until:** 2026-05-28 (30 days — VS Code API is stable; the only changing surface is this codebase, which is the phase target itself)
