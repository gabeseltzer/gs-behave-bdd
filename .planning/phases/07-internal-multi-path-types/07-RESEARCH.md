# Phase 7: Internal Multi-Path Types — Research

**Researched:** 2026-04-17
**Domain:** TypeScript strict-mode type migration across four source files in a VS Code extension (compilation-only risk)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Shape (MP-02):**
- **D-01:** `BehaveConfigResult.resolvedPath: Uri` becomes `resolvedPaths: Uri[]` (breaking rename). Discriminated union; getter shims on union members are awkward. Only 2 read sites in `common.ts::hasFeaturesFolder` touch it.
- **D-02:** `DiscoveryEntry.featuresUri: Uri` becomes `featuresUris: Uri[]` (breaking rename). Populated as length-1 arrays in every single-path branch (Branch A explicit settings, Branch B config-file, Branch C convention).
- **D-03:** `WorkspaceSettings` grows four plural fields — `featuresUris: Uri[]`, `stepsSearchUris: Uri[]`, `projectRelativeFeaturesPaths: string[]`, `workspaceRelativeFeaturesPaths: string[]` — with singular getters returning `[0]` for back-compat. Singular getters cover all 20+ existing call sites unchanged.
- **D-04:** `StepMapping.featuresUri` stays scalar `Uri`. Per-mapping identity — each mapping belongs to exactly one feature root.

**Non-Empty Invariant:**
- **D-05:** Every plural field on `WorkspaceSettings` and every `resolvedPaths` array on `BehaveConfigResult.ok:true` is **guaranteed non-empty at construction**. Singular getters always return a defined `Uri` / `string` — callers never see `undefined`.
- **D-06:** If **any** entry in a resolved path list is invalid, the whole config returns `ok:false` or falls back to convention. Matches v1.1 all-or-nothing behavior exactly. Per-path diagnostics land in Phase 8.
- **D-07:** `"."` rejection from v1.1 (`settings.ts:159`) is preserved **per entry**.

**Phase 7 / Phase 8 Scope Boundary:**
- **D-08:** `isFileInFeatures(uri: Uri): boolean` ships on `WorkspaceSettings` in Phase 7. Pure addition.
- **D-09:** `getFeaturesRootForFile(wkspSettings, fileUri): Uri | undefined` ships as module-level helper in `common.ts` in Phase 7 (dead code until Phase 8).
- **D-10:** Windows backslash normalization (`\` → `/`) ships in Phase 7 inside the plural-array builder. Applied to every entry of `rawPaths` before URI construction in `resolvePaths`.

**Settings Reading (partial MP-03 scaffolding):**
- **D-11:** `WorkspaceSettings` constructor reads **both** `featuresPath` (singular) AND `featuresPaths` (plural). Precedence: plural set+non-empty → plural; singular set → length-1 wrap; neither → discovery cache / convention. Empty array `[]` treated as "not set".
- **D-12:** `package.json` schema **is NOT modified in Phase 7**. `featuresPaths` wired via optional-read (`get<string[] | undefined>("featuresPaths")`) for test-harness injection only. `hasExplicitSetting` keeps current v1.1 semantics.

**Test Harness:**
- **D-13:** `testWorkspaceConfig.ts` mirrors the plural fields and accepts `featuresPaths: string[]` input.
- **D-14:** `testWorkspaceConfig` singular getters return `[0]` of the respective plural.

**SC#3 Satisfaction:**
- **D-15:** The length-2 assertion is validated via **unit test only**. No new `example-projects/` fixtures in Phase 7 (those land in Phase 11).

### Claude's Discretion

- TypeScript `get` accessor on the class vs. readonly field at construction for singular getters — pick whichever reads cleaner. **Recommended: `get` accessor** (per specifics section).
- Order of commits within the phase — **recommended: `configParser → common → settings → testWorkspaceConfig`** atomically.
- Exact signature of `getFeaturesRootForFile` — follow existing helper conventions in `common.ts`.
- Whether Windows normalization lives as a private helper in `configParser.ts` or a shared util in `common.ts` — **default to private/colocated in configParser.ts**.

### Deferred Ideas (OUT OF SCOPE)

- `package.json` `featuresPaths` schema declaration → Phase 10 (MP-03)
- `hasExplicitSetting` extension to recognize `featuresPaths` → Phase 10
- Info log when both `featuresPath` and `featuresPaths` are set → Phase 10
- Per-path resolution failure diagnostic (MP-04) → Phase 8
- Overlap dedup in `resolvePaths` (Pitfall 2) → Phase 8
- 18-file consumer migration (MP-06) → Phase 8
- Path-group intermediate TestItems (MP-05) → Phase 8
- `configScanner.ts` subdir scan → Phase 9 (SD-01)
- `example-projects/multi-path/` + `monorepo-scan/` fixtures → Phase 11 (TEST-14)
- Integration test matrix → Phase 11 (TEST-13)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **MP-02** | `WorkspaceSettings` exposes `featuresUris: Uri[]` (plus `stepsSearchUris`, `projectRelativeFeaturesPaths`, `workspaceRelativeFeaturesPaths`) with singular getters (`featuresUri` returns `featuresUris[0]`) for primary-plus-list back-compat. | Singular-getter pattern (§Architecture Patterns #1), commit-ordering walk (§Commit Ordering Proof), 32-call-site audit (§Consumer Inventory) demonstrates getter coverage. |
| **TEST-12** | Unit tests for `WorkspaceSettings` — plural/singular precedence matrix (plural set / singular set / both set / neither set / plural empty array), `hasExplicitSetting` branches, Windows backslash normalization applied to all entries. | Precedence Matrix Test Design (§Validation Architecture), Windows normalization test matrix (§Specific Ideas), `hasExplicitSetting` kept scoped to `featuresPath` only per D-12 (branch assertions delegated to existing discoveryPriority.test.ts). |
</phase_requirements>

---

## Summary

Phase 7 is a **four-file TypeScript type migration** with compilation-only risk. The feature surface is entirely internal: every plural field added to `BehaveConfigResult`, `DiscoveryEntry`, and `WorkspaceSettings` ships alongside a singular getter returning `[0]`, so none of the 32 existing read sites for the four singular fields need to change. The discovery writer (`common.ts::hasFeaturesFolder`) populates length-1 arrays in all three branches (explicit settings / config-file / convention) — no user-visible behavior change.

Three primitives ship with the types: `isFileInFeatures(uri)` on `WorkspaceSettings`, `getFeaturesRootForFile(wkspSettings, fileUri)` as a module-level helper in `common.ts`, and Windows backslash normalization inside the plural-array builder in `configParser.ts`. All three are dead code from Phase 7's perspective (single-path users) but unblock Phase 8 without a second type pass.

TEST-12's precedence matrix (plural set / singular set / both set / neither set / plural empty array) is validated via unit tests only, exercised through `TestWorkspaceConfig` whose plural-input surface mirrors production. SC#3's length-2 assertion is a single focused unit test with a `TestWorkspaceConfig` supplying `featuresPaths: ["features", "features-alt"]` — no new `example-projects/` fixtures.

**Primary recommendation:** Commit atomically in the order `configParser → common → settings → testWorkspaceConfig`, running `npx eslint src --ext ts` + `npm run test:unit` green at every step. Adopt the TypeScript `get` accessor pattern for singular back-compat (matches the semantic intent "this is a derived view of the plural" and avoids a constructor-ordering hazard where the singular field would need to be initialized after the plural).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Config-file parsing (INI/TOML → rawPaths[]) | Parser layer (`configParser.ts`) | — | Stateless, no VS Code surface dependency; `smol-toml` and hand-rolled INI parser live here. |
| Multi-path URI resolution (rawPaths[] → resolvedPaths[]) | Parser layer (`configParser.ts`) | Settings layer (consumes) | Colocated with path parsing; same function owns Windows backslash normalization (D-10). |
| Discovery cache population | Discovery layer (`common.ts::hasFeaturesFolder`) | — | Writes arrays into `DiscoveryEntry.featuresUris`; reads `BehaveConfigResult.resolvedPaths`. |
| Plural-field storage + singular back-compat | Settings layer (`WorkspaceSettings`) | — | Central shim: all 32 call sites unchanged via getter returning `[0]`. |
| File-belongs-to-features check | Settings layer (`isFileInFeatures`) | — | Instance method on `WorkspaceSettings` — per-workspace answer. |
| Per-document root selection | Discovery/common layer (`getFeaturesRootForFile`) | — | Module-level helper in `common.ts` per existing utility convention (`getWorkspaceSettingsForFile`, `uriId`). |
| Test harness plural injection | Test-support layer (`testWorkspaceConfig.ts`) | — | Mirrors production shape exactly; production shape == harness shape. |

---

## Standard Stack

### Core (all already installed — zero new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 4.5.5 | Strict-mode type migration | Already on project (`.tool-versions`, `tsconfig.json`). `get` accessors supported since TS 1.6. [VERIFIED: tsconfig.json line "strict": true] |
| `@types/vscode` | 1.82.0 | `vscode.Uri`, `WorkspaceConfiguration` types | Already installed. No API surface change needed. [VERIFIED: package.json] |
| Mocha + Sinon | 9.2.2 / 21.0.1 | Unit tests for precedence matrix | Existing `test/unit/settings/` pattern (5 files) uses both. [VERIFIED: test/unit/settings/discoveryPriority.test.ts] |
| ESLint | 8.11.0 + @typescript-eslint 5.15.0 | Enforced after every code change per CLAUDE.md | `npx eslint src --ext ts` — must be exit-0. [VERIFIED: CLAUDE.md] |

### Supporting (no additions)

**Not needed for Phase 7:** no new npm deps, no new dev deps, no new test harness libraries. The `TestWorkspaceConfig` class at `src/testWorkspaceConfig.ts` is extended in-place for D-13/D-14.

### Alternatives Considered

| Instead of | Could Use | Tradeoff | Verdict |
|------------|-----------|----------|---------|
| `get featuresUri()` accessor | Readonly field initialized at construction: `this.featuresUri = this.featuresUris[0]` | Field reads are marginally faster, but introduces a constructor-ordering hazard: singular must be assigned *after* plural. If someone later reorders constructor assignments, a subtle bug appears where `featuresUri === undefined` during intermediate construction states. | **Accessor wins** (D-03 specifics) — reads cleaner, no ordering hazard, semantic intent visible at declaration. |
| Shared Windows-normalization util in `common.ts` | Colocated private helper in `configParser.ts` | `common.ts` util is reusable in Phase 8; colocated helper requires a move later. | **Private in configParser.ts** (D-10 Discretion default) — only Phase 7 caller is the parser; premature abstraction. Move in Phase 8 if another caller emerges. |
| Breaking rename of `resolvedPath` → `resolvedPaths` (D-01) | Getter shim on the ok:true variant keeping both | Getter shims on **discriminated union members** are awkward in TypeScript (you'd need the getter to live outside the union, or duplicate on both variants). | **Breaking rename wins** — 2 read sites in `common.ts::hasFeaturesFolder`; blast radius is tiny. |

**Installation:** `(none — all deps already installed)`

**Version verification:** All libraries verified against `package.json` and `package-lock.json` in the repo. No registry fetch needed (no new dependencies).

---

## Architecture Patterns

### System Architecture Diagram (Phase 7 — data flow for plural-type insertion)

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                    USER INPUT (unchanged from v1.1 in Phase 7)                    │
│   behave.ini / settings.json[featuresPath] / convention (features/)               │
└───────────────────────────────────────────────────────────────────────────────────┘
                              │
                              v
┌───────────────────────────────────────────────────────────────────────────────────┐
│  PARSER TIER — src/parsers/configParser.ts                                        │
│                                                                                   │
│    findBehaveConfig(dir) → BehaveConfigResult                                     │
│       .ok:true → { configFileUri, format, rawPaths: string[], resolvedPaths[] }   │
│       .ok:false → { configFileUri, errorMessage }                                 │
│                                                                                   │
│    resolvePaths(rawPaths, configFileUri) → Uri[]    ← [D-01 rename]              │
│       1. For each rawPath:                                                        │
│           normalizeSeparators(rawPath)              ← [D-10 new, private helper]  │
│           absolute? → Uri.file(norm)                                              │
│           relative? → Uri.joinPath(configDirUri, norm)                            │
│       2. Return Uri[] (non-empty invariant per D-05)                              │
└───────────────────────────────────────────────────────────────────────────────────┘
                              │
                              v
┌───────────────────────────────────────────────────────────────────────────────────┐
│  DISCOVERY TIER — src/common.ts::hasFeaturesFolder                                │
│                                                                                   │
│    DiscoveryEntry { source, configFileUri?, configError?, featuresUris: Uri[] }   │
│                                                                    ↑              │
│                                                               [D-02 rename]      │
│                                                                                   │
│    Branch A (explicit settings):    featuresUris = [computed]  (length 1)         │
│    Branch B (config-file valid):    featuresUris = [resolvedPaths[0]]  (len 1)    │
│         NOTE: Phase 7 filters to existingPaths per D-06 but KEEPS length-1       │
│         single-path semantics — it does NOT iterate resolvedPaths in Phase 7.     │
│    Branch B (config-file invalid):  configError captured; featuresUris=[fallback] │
│    Branch C (convention):           featuresUris = [<wksp>/features]  (len 1)    │
│                                                                                   │
│    Module-level NEW helper: getFeaturesRootForFile(wkspSettings, fileUri)         │
│      → wkspSettings.featuresUris.find(root =>                                     │
│           fileUri.path.startsWith(root.path + '/') || urisMatch(root, fileUri))   │
│      (dead code in Phase 7; wired by Phase 8 handlers per D-09)                   │
└───────────────────────────────────────────────────────────────────────────────────┘
                              │
                              v
┌───────────────────────────────────────────────────────────────────────────────────┐
│  SETTINGS TIER — src/settings.ts::WorkspaceSettings                               │
│                                                                                   │
│    Constructor reads:                                                             │
│      featuresPath: string    (singular; current package.json schema)              │
│      featuresPaths: string[] | undefined   ← [D-11 NEW optional read]            │
│         get<string[] | undefined>("featuresPaths")  — NO fail-fast throw          │
│                                                                                   │
│    Precedence ladder (D-11):                                                      │
│      1. featuresPaths set + non-empty → use plural                                │
│      2. featuresPath set (non-empty) → wrap in [featuresPath]                     │
│      3. neither → discoveryEntry?.featuresUris ?? [projectUri/"features"]         │
│                                                                                   │
│    Public readonly fields (D-03, new):                                            │
│      featuresUris: Uri[]                          (non-empty invariant D-05)     │
│      stepsSearchUris: Uri[]                       (one computed per featuresUri)  │
│      projectRelativeFeaturesPaths: string[]                                       │
│      workspaceRelativeFeaturesPaths: string[]                                     │
│                                                                                   │
│    Singular getters (D-03, D-05, back-compat for 32 call sites):                  │
│      get featuresUri(): Uri { return this.featuresUris[0]; }                      │
│      get stepsSearchUri(): Uri { return this.stepsSearchUris[0]; }                │
│      get projectRelativeFeaturesPath(): string { return ...Paths[0]; }            │
│      get workspaceRelativeFeaturesPath(): string { return ...Paths[0]; }          │
│                                                                                   │
│    Instance method (D-08, new, shippable primitive):                              │
│      isFileInFeatures(uri: Uri): boolean                                          │
│                                                                                   │
│    Per-entry validation (D-07 preserved):                                         │
│      Any entry === "." → fatalError for that entry → whole config fails (D-06)    │
│      Any entry empty string → treated as "not set" (filtered before plural-wins   │
│         check; if filter drops all entries, falls through to next precedence      │
│         rung; plural array never reaches the constructor as `[]` per D-11)        │
└───────────────────────────────────────────────────────────────────────────────────┘
                              │
                              v
┌───────────────────────────────────────────────────────────────────────────────────┐
│  CONSUMER TIER — 32 call sites (see §Consumer Inventory)                          │
│                                                                                   │
│  All UNCHANGED in Phase 7 — they read singular getters which return [0].          │
│  Phase 8 owns the union/iterate/per-root-scope migration.                         │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── common.ts                 # + getFeaturesRootForFile helper (D-09)
├── settings.ts               # WorkspaceSettings: 4 new plural fields, 4 getters, isFileInFeatures
├── testWorkspaceConfig.ts    # mirrors plural: featuresPaths input, featuresPaths getter, featuresUris/stepsSearchUris/...Paths getExpected
└── parsers/
    └── configParser.ts       # BehaveConfigResult.resolvedPaths[], resolvePaths returns Uri[], private normalizeSeparators
```

No new files in Phase 7.

### Pattern 1: Primary-Plus-List with Singular Getter

**What:** Store state as plural arrays; expose singular fields as computed getters returning `[0]`. Ensure plural is guaranteed non-empty at construction so the getter is total.

**When to use:** Migrating a scalar field to a list where the vast majority of consumers only need the primary element and migration must not cascade across 30+ files in a single PR.

**Example:**
```typescript
// src/settings.ts (Phase 7 shape)
export class WorkspaceSettings {
  public readonly featuresUris: vscode.Uri[];                   // non-empty invariant
  public readonly stepsSearchUris: vscode.Uri[];
  public readonly projectRelativeFeaturesPaths: string[];
  public readonly workspaceRelativeFeaturesPaths: string[];

  // Singular getters for back-compat (32 call sites read these today)
  public get featuresUri(): vscode.Uri { return this.featuresUris[0]; }
  public get stepsSearchUri(): vscode.Uri { return this.stepsSearchUris[0]; }
  public get projectRelativeFeaturesPath(): string { return this.projectRelativeFeaturesPaths[0]; }
  public get workspaceRelativeFeaturesPath(): string { return this.workspaceRelativeFeaturesPaths[0]; }

  // New instance method (D-08)
  public isFileInFeatures(uri: vscode.Uri): boolean {
    return this.featuresUris.some(
      fu => uri.path.startsWith(fu.path + '/') || urisMatch(fu, uri)
    );
  }

  constructor(/* ... */) {
    // ...read featuresPath + featuresPaths per D-11 precedence ladder...
    this.projectRelativeFeaturesPaths = projectRelativeFeaturesPaths;  // non-empty
    this.featuresUris = projectRelativeFeaturesPaths.map(
      p => vscode.Uri.joinPath(this.projectUri, p)
    );
    // stepsSearchUris computed per-entry (see Pattern 3)
  }
}
```

**Key constraint:** The plural field MUST be assigned before any code path can trigger a getter read. Since the getter reads `[0]` and D-05 guarantees non-empty, the getter is total — but only after construction completes. This is why the `get` accessor is preferred over `this.featuresUri = this.featuresUris[0]` as a readonly field: the accessor is lazy.

**Anti-pattern to avoid (readonly field version):**
```typescript
// BAD — constructor-ordering hazard
public readonly featuresUri: vscode.Uri;
constructor() {
  this.featuresUri = this.featuresUris[0];  // reads before plural assignment? NaN/crash
  this.featuresUris = [...];
}
```

### Pattern 2: Non-Empty Array Invariant (D-05) at Construction

**What:** Guarantee at the type boundary that a plural array is never `[]` when it reaches a consumer. Enforce via validation-and-throw before assignment, not defensive checks at every read.

**When to use:** Any time a singular getter returns `arr[0]` — `arr` must be non-empty, otherwise the getter returns `undefined` silently and every downstream consumer breaks in a different place.

**Example:**
```typescript
// src/parsers/configParser.ts — v1.2 resolvePaths return shape
function resolvePaths(rawPaths: string[], configFileUri: vscode.Uri): vscode.Uri[] {
  const configDirUri = vscode.Uri.joinPath(configFileUri, '..');
  const results: vscode.Uri[] = [];
  for (const rawPath of rawPaths) {
    const normalized = normalizeSeparators(rawPath);  // D-10
    if (normalized.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(normalized)) {
      results.push(vscode.Uri.file(normalized));
    } else {
      results.push(vscode.Uri.joinPath(configDirUri, normalized));
    }
  }
  return results;  // non-empty because rawPaths is filtered non-empty upstream (lines 114, 149)
}

// src/parsers/configParser.ts — caller is buildResult
function buildResult(configFileUri: vscode.Uri, format: 'ini' | 'toml', rawPaths: string[]): BehaveConfigResult {
  // rawPaths already non-empty (parseIniConfig line 115 returns undefined if empty;
  // parseTomlConfig line 150 returns undefined if empty)
  return {
    ok: true,
    configFileUri,
    format,
    rawPaths,
    resolvedPaths: resolvePaths(rawPaths, configFileUri),  // non-empty by construction
  };
}
```

**Key insight:** The invariant is preserved by the existing parser filters (`parseIniConfig` line 115: `if (rawPaths.length === 0) return undefined;` and equivalent in TOML branch). Phase 7 must NOT weaken these filters. The non-emptiness of `resolvedPaths` is a direct consequence of `rawPaths` being non-empty.

### Pattern 3: Per-Entry Computation for Parallel Arrays

**What:** When a plural field has a derived parallel plural (e.g., `stepsSearchUris[i]` derived from `featuresUris[i]`), compute each entry using the same algorithm, in a loop, producing the same-length array.

**When to use:** Computing `stepsSearchUris[]` in `settings.ts` after `featuresUris[]` is set. Today's code (lines 176-184) derives a single `stepsSearchUri` by calling `findSubdirectorySync` + `findHighestTargetParentDirectorySync`. In Phase 7 (single-path world), the loop iterates once. In Phase 8+, it iterates N times.

**Example:**
```typescript
// src/settings.ts — Phase 7 derivation
this.stepsSearchUris = this.featuresUris.map(featuresUri => {
  let stepsSearchUri = vscode.Uri.joinPath(featuresUri);  // default: inside features
  if (!findSubdirectorySync(stepsSearchUri.fsPath, "steps")) {
    const fsPath = findHighestTargetParentDirectorySync(
      featuresUri.fsPath, this.projectUri.fsPath, "steps"
    );
    if (fsPath) {
      stepsSearchUri = vscode.Uri.file(fsPath);
    } else {
      // no steps folder found for this features root
      // Phase 7 preserves v1.1 behavior: log warning (only for the "first" / primary root to avoid noise)
      // ... see §Risk Surface for discussion
    }
  }
  return stepsSearchUri;
});
```

**Phase 7-specific simplification:** Since all plural arrays are length-1 in Phase 7, the `logger.showWarn("No steps folder found.")` semantics are identical to today — the single entry's miss produces a single warning. No new log noise.

### Pattern 4: Test Harness Shape Parity (D-13, D-14)

**What:** The test harness's accessor surface mirrors production's accessor surface exactly. Input surface accepts both singular and plural.

**When to use:** `testWorkspaceConfig.ts` must remain interchangeable with `vscode.WorkspaceConfiguration` (it implements that interface). Production reads `featuresPath` (required) and `featuresPaths` (optional); harness must return correct values for both via `get<T>(section)` and `inspect<T>(section)`.

**Example:**
```typescript
// src/testWorkspaceConfig.ts — new fields
private featuresPath: string | undefined;
private featuresPaths: string[] | undefined;  // NEW — D-13

constructor({ /* ... */, featuresPath, featuresPaths }: {
  // ... existing fields ...
  featuresPath: string | undefined;
  featuresPaths?: string[] | undefined;        // NEW — D-13 (optional)
}) {
  this.featuresPath = featuresPath;
  this.featuresPaths = featuresPaths;           // NEW
}

get<T>(section: string): T {
  switch (section) {
    // ... existing cases ...
    case "featuresPath":
      return <T><unknown>(this.featuresPath === undefined ? "features" : this.featuresPath);
    case "featuresPaths":
      // NEW — optional read; undefined when test did not supply it
      return <T><unknown>(this.featuresPaths);  // No default! Per D-11/D-12 optional-read.
    default:
      /* ... */
  }
}

inspect<T>(section: string) {
  switch (section) {
    // ... existing cases ...
    case "featuresPaths":
      response = <T><unknown>this.featuresPaths;  // NEW
      break;
    /* ... */
  }
  return { key: "", workspaceFolderValue: response, /* ... */ };
}

// D-14: singular getExpected delegates to plural [0] for multi-path tests
// (preserves existing getExpectedFeaturesPath / getExpectedWorkspaceRelativeFeaturesPath single-path behavior)
```

**Key insight:** The production constructor calls `get<string[] | undefined>("featuresPaths")`. If the harness's `get<T>` throws on unknown sections (line 94: `throw new Error("get() missing case for section: " + section);`), Phase 7 breaks every test that doesn't supply `featuresPaths`. The harness must return `undefined` for the `featuresPaths` case when the test didn't provide it — **this maps 1:1 to "setting not set" in VS Code's real config**, which is exactly what D-12's optional-read semantics demand.

### Anti-Patterns to Avoid

- **Hand-migrating the 32 call sites:** Phase 7 MUST leave them unchanged. If you find yourself touching `fileParser.ts:359` or `testRunHandler.ts:199`, you're in Phase 8 territory. Singular getters cover all 32 sites.
- **Treating `featuresPaths: []` as a valid non-empty config:** Empty array → treat as "not set" (Pitfall 4 / D-11 empty-array-as-unset rule). Fall through to next precedence rung.
- **Computing `stepsSearchUris` from `featuresUris[0]` only:** Each entry has its own steps-folder derivation. Length-1 world hides this, but the implementation must loop per entry so Phase 8 has nothing to rewrite.
- **Normalizing separators in `common.ts::hasFeaturesFolder` instead of `configParser.ts`:** D-10 explicitly places normalization **inside the plural-array builder**. Doing it upstream skips the `rawPaths` text-level guarantee; doing it downstream doubles the work per path.
- **Using `fs.existsSync` to filter entries inside `resolvePaths`:** Per D-06, existence check is upstream in `common.ts::hasFeaturesFolder`. Phase 7 preserves the v1.1 all-or-nothing rule: if any entry is invalid, whole config fails. Per-path filtering is Phase 8 / MP-04.
- **Adding a `featuresUris` readonly field AND a `featuresUri` readonly field as two sources of truth:** Getter pattern keeps the plural as the sole source — the singular is derived. Dual-populated fields can drift.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Case-insensitive URI comparison on Windows | Raw `uri.path === other.path` | `urisMatch(a, b)` / `uriId(uri)` from `common.ts:89-94` | Windows drive-letter casing is inconsistent (`C:` vs `c:`). AI_INSTRUCTIONS.md §URI Handling is a hard rule. |
| Path containment for `isFileInFeatures` | `uri.path.startsWith(featuresUri.path)` | `uri.path.startsWith(featuresUri.path + '/') \|\| urisMatch(featuresUri, uri)` | Raw `startsWith` matches `featuresA` when looking for `features` (Pitfall 3 prevention advice). The `+ '/'` guard prevents sibling-prefix false positives; the `urisMatch` handles exact-root case. |
| Steps-folder derivation | Custom traversal with `fs.readdirSync` | `findSubdirectorySync` + `findHighestTargetParentDirectorySync` from `common.ts:486, 509` | Already handles the "steps folder inside features" vs "steps folder as sibling of features" ambiguity with v1.0 semantics. Per-entry reuse is a `.map()` call. |
| Reading VS Code config with legacy fallback | Direct `wkspConfig.get(...)` | `getWithLegacyFallback<T>(newConfig, legacyConfig, key)` in `settings.ts:14` | v1.1 established the pattern for `behave-vsc → gs-behave-bdd` migration. New plural key follows the same scope-inspection logic. |
| Dedup / overlap detection | Building a sort-by-length-then-filter | **Nothing** — Phase 7 does not dedup | Pitfall 2 / MP-01 is Phase 8 work. Phase 7 preserves v1.1 behavior (no dedup, because v1.1 only ever had one path). |
| INI / TOML parsing | Custom parser | `smol-toml` (installed) + existing hand-rolled INI parser (`parseIniConfig`) | Already works end-to-end; v1.0 already did this. No changes in Phase 7. |

**Key insight:** Phase 7's discipline is specifically *not to hand-roll anything new*. Every primitive it needs already exists in `common.ts` or is a trivial derivation. The only novel code is (1) plural storage + getters, (2) the `isFileInFeatures`/`getFeaturesRootForFile` helpers which are thin wrappers over existing URI utilities, and (3) the backslash normalizer which is a one-line `.replaceAll('\\\\', '/')`.

---

## Runtime State Inventory

> Phase 7 is a pure type migration — no stored data, no running services, no OS-level registrations are affected. Explicit answers per template:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **None** — no ChromaDB, Mem0, Redis, or similar datastores in this extension. `discoveryCache` is in-memory and rebuilt on every `getUrisOfWkspFoldersWithFeatures(true)`; the schema change from scalar `featuresUri` to plural `featuresUris[]` is internal to the process lifetime. | None — cache rebuilds on activation. |
| Live service config | **None** — the extension doesn't talk to external services whose config lives in a UI. The test runner spawns `behave` via `child_process.spawn`; behave reads its own `behave.ini` live from disk. | None. |
| OS-registered state | **None** — no Task Scheduler entries, launchd plists, systemd units, pm2 process names, or similar. VS Code manages extension activation via `package.json` `activationEvents`. | None. |
| Secrets/env vars | **None affected** — Phase 7 does not touch env var reading (`envVarOverrides`, `envVarPresets` are unrelated to features-path shape). | None. |
| Build artifacts / installed packages | `dist/extension.js` (webpack output) must be rebuilt after the type migration — standard `npm run compile`. No stale `*.egg-info` or similar — the extension has no Python package install surface of its own (Python-side tooling is `bundled/libs/` for behave, untouched by Phase 7). | Rebuild via `npm run compile` before running integration tests (not strictly needed for `npm run test:unit`). |

**Verified:** Phase 7 edits four `src/*.ts` files. Git-tracked sources only. No migration scripts, no seed-data updates, no registration touch-ups.

---

## Consumer Inventory (Audit — 32 call sites across 10 files)

The singular getters added in Phase 7 (`featuresUri`, `stepsSearchUri`, `projectRelativeFeaturesPath`, `workspaceRelativeFeaturesPath`) must cover every read site. This table enumerates them so the planner can verify that no caller requires the plural in Phase 7.

### `wkspSettings.featuresUri` read sites (27 total)

| File | Line | Read Kind | Phase 7 Treatment |
|------|------|-----------|---------------------|
| `src/extension.ts` | 199 | `urisMatch(wkspSettings.featuresUri, featuresUri)` | Singular getter returns `[0]`; `onStepMappingsRebuilt` fires with a single feature root (Phase 8 changes signature). |
| `src/watchers/workspaceWatcher.ts` | 19 | `wkspSettings.stepsSearchUri.path.startsWith(wkspSettings.featuresUri.path)` | Both singular getters; evaluates against `[0]`. |
| `src/runners/testRunHandler.ts` | 199 | `uriId(wkspSettings.featuresUri)` | Getter; Phase 8 builds union matcher. |
| `src/handlers/autoCompleteProvider.ts` | 39 | `getStepFileSteps(wkspSettings.featuresUri)` | Getter; Phase 8 unions across roots. |
| `src/handlers/codeLensProvider.ts` | 59 | `getStepFileSteps(wkspSettings.featuresUri)` | Same. |
| `src/handlers/fixtureProviders.ts` | 33, 87, 153, 169 | `getFixtureByTag / getFixtures / getFeatureTags(wkspSettings.featuresUri)` | 4 reads; Phase 8 per-document scoping. |
| `src/handlers/fixtureDiagnostics.ts` | 24, 25, 32 | `getFeatureTags / getFixtures / getFixtureByTag(wkspSettings.featuresUri)` | 3 reads; same. |
| `src/handlers/stepDiagnostics.ts` | 25, 28 | `getFeatureFileSteps / getStepFileSteps(wkspSettings.featuresUri)` | 2 reads; Phase 8 per-document scoping. |
| `src/parsers/fileParser.ts` | 143 | `deleteFeatureFileSteps(wkspSettings.featuresUri)` | Getter; Phase 8 loops. |
| `src/parsers/fileParser.ts` | 144 | `deleteStepMappings(wkspSettings.featuresUri)` | Getter; Phase 8 loops. |
| `src/parsers/fileParser.ts` | 150 | `findFiles(wkspSettings.featuresUri, ...)` | Getter; Phase 8 iterates. |
| `src/parsers/fileParser.ts` | 154 | Error message interpolation `${wkspSettings.featuresUri.fsPath}` | Getter; message stays single-path in Phase 7. |
| `src/parsers/fileParser.ts` | 181 | `wkspSettings.stepsSearchUri.path.startsWith(wkspSettings.featuresUri.path)` | Both getters. |
| `src/parsers/fileParser.ts` | 184 | Ternary: `wkspSettings.featuresUri : wkspSettings.stepsSearchUri` | Both getters. |
| `src/parsers/fileParser.ts` | 248, 249 | `deleteStepFileSteps / deleteFixtures(wkspSettings.featuresUri)` | 2 reads; Phase 8 loops. |
| `src/parsers/fileParser.ts` | 253, 254 | `storeBehaveStepDefinitions / storePythonFixtureDefinitions(wkspSettings.featuresUri, ...)` | 2 reads; same. |
| `src/parsers/fileParser.ts` | 359 | `uri.path.substring(wkspSettings.featuresUri.path.length + 1)` | Getter; Phase 8 picks the right root via `getFeaturesRootForFile`. |
| `src/parsers/fileParser.ts` | 366 | `uriId(wkspSettings.featuresUri) + "/" + path` | Same. |
| `src/parsers/fileParser.ts` | 512 | `rebuildStepMappings(wkspSettings.featuresUri)` | Getter; Phase 8 loops. |
| `src/parsers/fileParser.ts` | 543, 544, 545 | `getStepFileSteps / getFeatureFileSteps / getStepMappings(wkspSettings.featuresUri).length` | 3 reads; Phase 8 sums across roots. |
| `src/parsers/fileParser.ts` | 595 | `rebuildStepMappings(wkspSettings.featuresUri)` (Python reparse) | Getter. |
| `src/parsers/fileParser.ts` | 636 | `wkspSettings.stepsSearchUri.path.startsWith(wkspSettings.featuresUri.path)` | Both getters. |
| `src/parsers/fileParser.ts` | 680, 681, 683, 684 | `deleteStepFileSteps / deleteFixtures / storeBehaveStepDefinitions / storePythonFixtureDefinitions(wkspSettings.featuresUri, ...)` | 4 reads; Phase 8 per-file-root selection. |
| `src/parsers/fileParser.ts` | 700, 701 | `rebuildStepMappings(wkspSettings.featuresUri)` + `onStepMappingsRebuilt?.(wkspSettings.featuresUri)` | 2 reads. |
| `src/parsers/junitParser.ts` | 207 | `wkspSettings.stepsSearchUri.path.startsWith(wkspSettings.featuresUri.path)` | Both getters. |
| `src/settings.ts` | 158, 161, 166, 176, 179, 265 | Self-assignments inside the constructor | These become assignments to `this.featuresUris = ...`. The singular read-sites inside the constructor are collapsed — they don't go through the getter, they read the new plural directly. |

**Total:** 27 reads of `wkspSettings.featuresUri` (excluding self-writes inside `settings.ts` which are the migration targets themselves).

### `wkspSettings.stepsSearchUri` read sites (5 distinct external; many also paired with `featuresUri` above)

| File | Line | Read Kind |
|------|------|-----------|
| `src/parsers/fileParser.ts` | 184, 208 (fsPath), 637 (first arg), 639 (first arg), 643 (fsPath) | Various |
| `src/handlers/stepDiagnostics.ts` | 41 | `vscode.workspace.asRelativePath(wkspSettings.stepsSearchUri)` |

### `wkspSettings.projectRelativeFeaturesPath` read sites (2)

| File | Line | Read Kind |
|------|------|-----------|
| `src/settings.ts` | 170-172 | Template-string in computing `workspaceRelativeFeaturesPath` |
| `src/settings.ts` | 269 | `wkspEntries.push(["featuresPath", this.projectRelativeFeaturesPath])` in `logSettings` |

### `wkspSettings.workspaceRelativeFeaturesPath` read sites (3)

| File | Line | Read Kind |
|------|------|-----------|
| `src/watchers/workspaceWatcher.ts` | 14 | `RelativePattern(wkspSettings.uri, \`${wkspSettings.workspaceRelativeFeaturesPath}/**\`)` |
| `src/parsers/junitParser.ts` | 204 | `wkspSettings.workspaceRelativeFeaturesPath + "/"` for JUnit classname trim |
| `src/parsers/junitParser.ts` | 213 | `wkspSettings.workspaceRelativeFeaturesPath.split("/").pop()` |

**Grand total:** 32 external read sites (27 + 5 stepsSearchUri + 2 projectRelativeFeaturesPath + 3 workspaceRelativeFeaturesPath, with some overlap where a single line reads both singular fields). All covered by Phase 7's getters.

**Verification via compilation:** After Phase 7 lands, `tsc --noEmit` (via the webpack build) must pass. The fact that TypeScript doesn't complain about any of these call sites is **the compilation-only proof** that the singular getter covers them. This is the primary safety net.

### `DiscoveryEntry.featuresUri` read sites (2 — both in `extension.ts`)

| File | Line | Read Kind | Phase 7 Treatment |
|------|------|-----------|---------------------|
| `src/extension.ts` | 79 | `config.logger.logInfo(\`Features directory: ${entry.featuresUri.fsPath}\`, wkspUri)` | Breaking rename per D-02: must change to `entry.featuresUris[0].fsPath` (or iterate — Phase 8 plural log is deferred; Phase 7 keeps single-line log). |
| `src/extension.ts` | 83 | Same pattern in `diagLog` | Same. |

**Phase 7 action:** Rename both reads to `entry.featuresUris[0].fsPath`. No getter shim on `DiscoveryEntry` per D-02 (interface, not class — can't add a getter; and the scope is deliberately small). Per D-06, this does not change the log output in single-path workspaces.

### `BehaveConfigResult.resolvedPath` read sites (2 — both in `common.ts::hasFeaturesFolder`)

| File | Line | Read Kind | Phase 7 Treatment |
|------|------|-----------|---------------------|
| `src/common.ts` | 255 | `const featuresUri = configResult.resolvedPath;` | Rename: `const resolvedPaths = configResult.resolvedPaths; const featuresUris = [resolvedPaths[0]].filter(u => fs.existsSync(u.fsPath))` per Phase 7 scope (preserves single-path behavior; Phase 8 widens the filter to cover all entries). |
| `src/common.ts` | 255-261 | Used to build `DiscoveryEntry` | Becomes `featuresUris` on the new `DiscoveryEntry`. |

**Phase 7 action:** Two reads change. Matches D-01 exactly.

---

## Commit Ordering Proof

The recommended order `configParser.ts → common.ts → settings.ts → testWorkspaceConfig.ts` lets every intermediate commit compile (`tsc`) and pass `npm run test:unit`. Walk-through:

### Commit 1: `configParser.ts` — `resolvedPath: Uri` → `resolvedPaths: Uri[]` + private `normalizeSeparators`

**Changes:**
- `BehaveConfigResult.ok:true` variant: `resolvedPath: vscode.Uri` → `resolvedPaths: vscode.Uri[]`
- `resolvePaths` returns `vscode.Uri[]` (maps every entry of `rawPaths`, not just `[0]`)
- New private helper `normalizeSeparators(rawPath: string): string` replaces `\\` with `/`
- `buildResult` constructs with `resolvedPaths: resolvePaths(rawPaths, configFileUri)`

**What breaks after this commit (before the next):**
- `common.ts:255` reads `configResult.resolvedPath` — TS error.
- `test/unit/parsers/configParser.test.ts:162-164` asserts `result.resolvedPath.fsPath.endsWith(...)` — runtime test failure (compile error, since `.resolvedPath` no longer exists).

**Mitigation within this commit:** Update the two `common.ts` reads **as part of the same commit**, OR make Commit 1 a two-step: `(1a)` add `resolvedPaths` alongside `resolvedPath` (dual-populated), `(1b)` rename reads. Given the scope (2 reads in one file), a single atomic commit is cleaner — update `common.ts:255` in the same commit.

**Test file updates in Commit 1:**
- `test/unit/parsers/configParser.test.ts:162-164`: change assertion to `result.resolvedPaths[0].fsPath.endsWith(...)` and add a `result.resolvedPaths.length === 3` assertion (the existing fixture has 3 paths — low-cost enhancement).
- **New test:** Windows normalization matrix — `paths = features\\alt` on Linux must resolve to `.../features/alt`, and absolute `C:\\foo` must preserve `C:/foo`. Fixture preparation: add a `test/unit/parsers/fixtures/config/windows-backslash/behave.ini` or mock the `fs.readFileSync` with an in-memory string per existing test patterns.

**Post-commit verification:**
- `npx eslint src --ext ts` → clean
- `npm run test:unit` → green (updated configParser test + new normalization tests pass; all other tests untouched and passing)
- `npx tsc --noEmit` (via `npm run compile`) → clean

**Ordering hazard:** If `common.ts:255` is left unchanged, `tsc` fails. Must update both in the same commit (or step 1a/1b dual-populate for two separate commits). **Recommendation: single atomic commit touching `configParser.ts` + `common.ts` reads 255 only.** Keep the `DiscoveryEntry` change for Commit 2.

### Commit 2: `common.ts` — `DiscoveryEntry.featuresUri: Uri` → `featuresUris: Uri[]` + `getFeaturesRootForFile` helper

**Changes:**
- `DiscoveryEntry.featuresUri: vscode.Uri` → `featuresUris: vscode.Uri[]`
- Every `discoveryCache.set(..., { ..., featuresUri: X })` becomes `featuresUris: [X]` (length-1 arrays in all three branches per D-02)
- Line 79, 83 reads (`entry.featuresUri.fsPath`) become `entry.featuresUris[0].fsPath` in `extension.ts`
- New module-level export `getFeaturesRootForFile(wkspSettings: WorkspaceSettings, fileUri: vscode.Uri): vscode.Uri | undefined`

**What breaks after this commit (before the next):**
- `settings.ts:99-101` reads `entry?.featuresUri` indirectly through destructuring of `DiscoveryEntry`? **Let me verify:** checking `settings.ts` lines 99-101: `const entry = discoveryEntry ?? getDiscoveryEntry(wkspUri); this.discoverySource = entry?.source ?? "convention"; this.configFileUri = entry?.configFileUri;` — **no reference to `entry.featuresUri`** in `settings.ts` today. So this commit doesn't break `settings.ts`. [VERIFIED: grep of settings.ts returns only self-assignments, no reads of `entry.featuresUri`].
- `extension.ts:79, 83` reads must update in same commit. **Update in this commit.**

**Test file updates in Commit 2:**
- No existing unit test directly reads `DiscoveryEntry.featuresUri` (verified via grep: the `discoveryCache` is not exposed to tests; `DiscoveryEntry` is consumed only by `extension.ts` and `settings.ts`).
- **New test:** `isFileInFeatures` depends on `WorkspaceSettings`, so add that in Commit 3. For Commit 2, add a unit test for `getFeaturesRootForFile` using a mock `WorkspaceSettings`-shaped object (`{ featuresUris: [...] }`).

**Post-commit verification:**
- `npx eslint src --ext ts` → clean
- `npm run test:unit` → green
- `npx tsc --noEmit` → clean

**Ordering hazard:** `extension.ts:79, 83` must update in the same commit. `settings.ts` is unaffected (verified — doesn't read `entry.featuresUri`). `testWorkspaceConfig.ts` doesn't touch `DiscoveryEntry` at all.

### Commit 3: `settings.ts` — 4 plural fields + 4 getters + `isFileInFeatures` + plural-settings read per D-11

**Changes:**
- Four new `public readonly` plural fields: `featuresUris`, `stepsSearchUris`, `projectRelativeFeaturesPaths`, `workspaceRelativeFeaturesPaths`
- **Remove** four existing `public readonly` singular fields (replaced by getters). NOTE: the existing `projectRelativeFeaturesPath` and `workspaceRelativeFeaturesPath` are declared at lines 72 and 80 as fields; they become getters. The existing `featuresUri` (line 78) and `stepsSearchUri` (line 79) same.
- Four `get` accessors returning `[0]` of the respective plural
- Constructor reads `featuresPaths: string[] | undefined` via optional `get<string[] | undefined>("featuresPaths")` (NO `throw` on undefined, unlike the fail-fast pattern at lines 104-132). D-12 wiring.
- Precedence ladder (D-11): plural non-empty → plural; singular → `[singular]`; neither → discoveryEntry fallback
- Per-entry `"."` rejection (D-07): any entry equal to `"."` pushes a fatalError and the config fails.
- `isFileInFeatures(uri)` instance method (D-08)
- `logSettings` (lines 261-275) continues to use singular getters (no behavior change in single-path world); may additionally push plural fields with `.join(", ")` — discretionary, recommend **keep singular-only in Phase 7** to avoid log-noise churn (plural logging lands in Phase 11 per ROADMAP §Phase 11 SC #5).

**What breaks after this commit (before the next):**
- `testWorkspaceConfig.ts` — the production `WorkspaceSettings` constructor now calls `get<string[] | undefined>("featuresPaths")` on the `WorkspaceConfiguration`. In unit tests that inject `TestWorkspaceConfig`, its `get` method (line 67-95) has a `switch` with **no case for `featuresPaths`**, and the `default` case throws (line 93-94). **This breaks every existing unit test that constructs a `WorkspaceSettings` via `TestWorkspaceConfig`.**

**CRITICAL ORDERING HAZARD:** Commit 3 cannot land before Commit 4. This is the only real ordering risk in Phase 7.

**Two options:**
1. **Merge Commits 3 and 4 into one atomic commit** — `settings.ts` + `testWorkspaceConfig.ts` together. Preferred for atomicity; still compiles at every earlier commit.
2. **Invert the order** — do `testWorkspaceConfig.ts` first (add the `featuresPaths` case returning undefined), then `settings.ts`. Simpler commit-level story but breaks the narrative ("types before harness").

**Recommendation:** **Merge 3+4**. Rationale: `settings.ts` read of `featuresPaths` is the exact feature that `testWorkspaceConfig.ts` must support. They are semantically coupled. Separating them for a clean "types-first" narrative introduces a must-not-land-alone constraint that git enforcement doesn't express.

**Test file updates in Commit 3/4:**
- **New test file:** `test/unit/settings/multiPathPrecedence.test.ts` covering the TEST-12 precedence matrix (5 cases). See §Validation Architecture for shape.
- **New test file:** `test/unit/settings/isFileInFeatures.test.ts` covering D-08 helper behavior.
- **New test file:** `test/unit/common/getFeaturesRootForFile.test.ts` covering D-09 helper behavior (may have landed in Commit 2; land here if merged into 3/4).

**Post-commit verification:**
- `npx eslint src --ext ts` → clean
- `npm run test:unit` → green (new TEST-12 suite passes; all existing unit tests pass with zero changes because they only supply `featuresPath`, and `featuresPaths` returns `undefined` → falls to precedence rung 2 → `[featuresPath]` → single-path semantics preserved)
- `npx tsc --noEmit` → clean

### Commit 4: `testWorkspaceConfig.ts` — mirror plural fields per D-13/D-14

**Changes:**
- New private field: `private featuresPaths: string[] | undefined`
- Constructor accepts `featuresPaths?: string[] | undefined`
- `get<T>(section)` handles `case "featuresPaths"` returning `this.featuresPaths` (may be undefined — optional-read per D-12)
- `inspect<T>(section)` handles `case "featuresPaths"` returning `{ workspaceFolderValue: this.featuresPaths }`
- `getExpected<T>(section)` optionally handles `featuresPaths` / `featuresUris` / `stepsSearchUris` / `projectRelativeFeaturesPaths` / `workspaceRelativeFeaturesPaths` for the new TEST-12 tests (per D-14: mirror plural at the `getExpected` surface). Signature unchanged — just more cases.

**Post-commit verification:**
- `npx eslint src --ext ts` → clean
- `npm run test:unit` → green
- `npx tsc --noEmit` → clean

### Summary

**Ordering recommendation:** `configParser` → `common+extension` → `settings+testWorkspaceConfig` (three atomic commits, with Commits 3+4 merged).

| # | Files | Why Atomic |
|---|-------|-----------|
| 1 | `src/parsers/configParser.ts`, `src/common.ts:255` | `BehaveConfigResult` rename forces `common.ts` read to update. |
| 2 | `src/common.ts` (DiscoveryEntry + helper), `src/extension.ts:79,83` | `DiscoveryEntry` rename forces `extension.ts` reads to update. |
| 3 | `src/settings.ts`, `src/testWorkspaceConfig.ts` | Production reads `featuresPaths`; harness must supply it. Otherwise unit-test regression. |

All three commits pass lint, unit tests, and tsc individually.

---

## Singular Getter Implementation Pattern

**Decision:** TypeScript `get` accessor on the class, NOT readonly field at construction.

### Rationale

**Option A (recommended): `get` accessor**
```typescript
public get featuresUri(): vscode.Uri { return this.featuresUris[0]; }
```

- ✓ Semantic intent visible at declaration ("this is a derived view").
- ✓ No constructor-ordering risk — plural must exist, and the getter lazily reads `[0]`.
- ✓ Cannot be re-assigned by mistake.
- ✓ Matches the existing pattern for computed-from-other-fields concepts.
- ✗ Marginally slower on hot paths (V8 optimizes this eventually).

**Option B: readonly field at construction**
```typescript
public readonly featuresUri: vscode.Uri;
constructor() {
  // ...
  this.featuresUris = [...];
  this.featuresUri = this.featuresUris[0];  // MUST come after featuresUris
}
```

- ✓ Faster reads (one property access vs one function call).
- ✗ Constructor-ordering hazard: if someone reorders the assignments, `this.featuresUri = this.featuresUris[0]` reads `undefined`. Silent bug.
- ✗ Two sources of truth — drift possible if someone later writes to `this.featuresUris` mutably (though `readonly` guards against external writes).
- ✗ Doesn't match the "derived view" semantic.

### Compared to `WindowSettings` (existing pattern at `settings.ts:30-57`)

`WindowSettings` uses readonly fields (`multiRootRunWorkspacesInParallel`, `xRay`, `verboseLogging`) — but those are **independent values read directly from config**, not derived from another state. The pattern doesn't apply to derivatives.

### Compiler-verification

TypeScript strict mode accepts both patterns. The `get` accessor option requires no `strict` tweaks. Verified by reading `tsconfig.json` (strict: true enabled).

### Test harness consistency (D-14)

The test harness's `getExpected<T>` switch (testWorkspaceConfig.ts:215-245) can continue returning scalars for the singular cases. Unit tests never directly read `WorkspaceSettings.featuresUri` vs `.featuresUris[0]` — they compare against the expected value from `getExpected`. Consistency is preserved.

**Verdict:** `get` accessor wins on clarity, safety, and consistency.

---

## Precedence Matrix Test Design (TEST-12)

TEST-12 requires coverage for:
1. Plural set (only)
2. Singular set (only)
3. Both set
4. Neither set
5. Plural empty array `[]`
6. `hasExplicitSetting` branches (D-12: scope unchanged in Phase 7; see below)
7. Windows backslash normalization applied to all entries

### Recommended file structure

New: `test/unit/settings/multiPathPrecedence.test.ts`

Follows the `discoveryPriority.test.ts` pattern (at the same directory): local `makeConfig` helpers that fake a `vscode.WorkspaceConfiguration`; construction of `WorkspaceSettings` directly (NOT via `TestWorkspaceConfig` — simpler and closer to integration boundaries).

### Test shape (Mocha suite)

```typescript
// test/unit/settings/multiPathPrecedence.test.ts
import * as assert from 'assert';
import * as vscode from 'vscode';
import { WorkspaceSettings, WindowSettings } from '../../../src/settings';
import { Logger } from '../../../src/logger';

// ... makeConfig helpers copied from discoveryPriority.test.ts ...

suite('WorkspaceSettings multi-path precedence (TEST-12, MP-02)', () => {
  const wkspUri = vscode.Uri.file('/fake/wksp');
  const winSettings = new WindowSettings(/* ...default window config... */);
  const logger = /* Logger stub */;

  suite('Plural set only', () => {
    test('featuresPaths=["a","b"] → featuresUris.length === 2 (SC#3)', () => {
      const cfg = makeConfig({
        featuresPaths: ['features', 'features-alt'],
        featuresPath: '',  // empty string = not set
      }, ['featuresPaths']);
      const ws = new WorkspaceSettings(wkspUri, cfg, winSettings, logger);
      assert.strictEqual(ws.featuresUris.length, 2);
      assert.ok(ws.featuresUris[0].path.endsWith('/features'));
      assert.ok(ws.featuresUris[1].path.endsWith('/features-alt'));
    });

    test('singular getter returns [0] of plural', () => {
      const cfg = makeConfig({ featuresPaths: ['a', 'b'] }, ['featuresPaths']);
      const ws = new WorkspaceSettings(wkspUri, cfg, winSettings, logger);
      assert.strictEqual(ws.featuresUri, ws.featuresUris[0]);
      assert.strictEqual(ws.projectRelativeFeaturesPath, 'a');
    });
  });

  suite('Singular set only (v1.1 parity)', () => {
    test('featuresPath="features" → featuresUris.length === 1', () => {
      const cfg = makeConfig({ featuresPath: 'features' }, ['featuresPath']);
      const ws = new WorkspaceSettings(wkspUri, cfg, winSettings, logger);
      assert.strictEqual(ws.featuresUris.length, 1);
      assert.ok(ws.featuresUris[0].path.endsWith('/features'));
    });
  });

  suite('Both set: plural wins', () => {
    test('featuresPath="x" + featuresPaths=["a","b"] → plural wins', () => {
      const cfg = makeConfig({
        featuresPath: 'x',
        featuresPaths: ['a', 'b'],
      }, ['featuresPath', 'featuresPaths']);
      const ws = new WorkspaceSettings(wkspUri, cfg, winSettings, logger);
      assert.strictEqual(ws.featuresUris.length, 2);
      assert.ok(ws.featuresUris[0].path.endsWith('/a'));
      // NOTE: info log deferred to Phase 10 (MP-03) per D-12 deferred list.
      // Phase 7 silently picks plural.
    });
  });

  suite('Neither set: discovery fallback', () => {
    test('neither key set → falls back to convention (features/)', () => {
      const cfg = makeConfig({});
      const ws = new WorkspaceSettings(wkspUri, cfg, winSettings, logger);
      assert.strictEqual(ws.featuresUris.length, 1);
      assert.ok(ws.featuresUris[0].path.endsWith('/features'));
    });
  });

  suite('Plural empty array: treated as unset (Pitfall 4)', () => {
    test('featuresPaths=[] → falls through to singular/convention', () => {
      const cfg = makeConfig({
        featuresPaths: [],
        featuresPath: 'mySingular',
      }, ['featuresPaths', 'featuresPath']);
      const ws = new WorkspaceSettings(wkspUri, cfg, winSettings, logger);
      assert.strictEqual(ws.featuresUris.length, 1);
      assert.ok(ws.featuresUris[0].path.endsWith('/mySingular'));  // singular wins
    });

    test('featuresPaths=[] + featuresPath unset → convention', () => {
      const cfg = makeConfig({ featuresPaths: [] }, ['featuresPaths']);
      const ws = new WorkspaceSettings(wkspUri, cfg, winSettings, logger);
      assert.strictEqual(ws.featuresUris.length, 1);
      assert.ok(ws.featuresUris[0].path.endsWith('/features'));
    });
  });

  suite('Invalid-entry rejection (D-07, SC#4)', () => {
    test('featuresPath="." → fatalError thrown (v1.1 parity)', () => {
      const cfg = makeConfig({ featuresPath: '.' }, ['featuresPath']);
      assert.throws(
        () => new WorkspaceSettings(wkspUri, cfg, winSettings, logger),
        /not a valid .* value/
      );
    });

    test('featuresPaths=["features", "."] → whole config rejected (D-06)', () => {
      const cfg = makeConfig({ featuresPaths: ['features', '.'] }, ['featuresPaths']);
      assert.throws(
        () => new WorkspaceSettings(wkspUri, cfg, winSettings, logger),
        /not a valid .* value/
      );
    });
  });

  suite('Windows backslash normalization (D-10, TEST-12)', () => {
    test('featuresPath="features\\\\alt" → features/alt URI', () => {
      const cfg = makeConfig({ featuresPath: 'features\\alt' }, ['featuresPath']);
      const ws = new WorkspaceSettings(wkspUri, cfg, winSettings, logger);
      assert.ok(ws.featuresUris[0].path.endsWith('/features/alt'));
    });

    test('featuresPaths=["a\\\\b","c\\\\d"] → both normalized', () => {
      const cfg = makeConfig({ featuresPaths: ['a\\b', 'c\\d'] }, ['featuresPaths']);
      const ws = new WorkspaceSettings(wkspUri, cfg, winSettings, logger);
      assert.ok(ws.featuresUris[0].path.endsWith('/a/b'));
      assert.ok(ws.featuresUris[1].path.endsWith('/c/d'));
    });
  });
});

// NOTE on D-06 length-2 path existence: SC#3 test above asserts length === 2 but
// does NOT require both dirs to exist on disk. Phase 7 keeps v1.1 filtering at
// the discovery layer (common.ts:256 fs.existsSync check) — but that gates
// whether the config goes into discoveryCache at all, NOT whether WorkspaceSettings
// constructor accepts the plural input. The TestWorkspaceConfig path bypasses the
// fs.existsSync check because it injects the config directly; the constructor's
// per-entry fatalError-on-missing runs via settings.ts:161 fs.existsSync check, which
// WILL trigger if the test fixtures don't mkdir the two dirs.
//
// Two valid mitigations:
//  (A) Mock fs.existsSync via sinon stub for the test suite.
//  (B) Create real temp dirs in suiteSetup / delete in suiteTeardown.
// Recommend (A) — simpler, already used elsewhere (search test/unit for sinon.stub(fs,...)).
```

### `hasExplicitSetting` branches

Per D-12, `hasExplicitSetting` is NOT extended in Phase 7 to recognize `featuresPaths`. The branches table remains exactly as in v1.1 (covered by existing `discoveryPriority.test.ts`). TEST-12's "`hasExplicitSetting` branches" sub-requirement is satisfied by the existing tests; **no new hasExplicitSetting tests needed in Phase 7**. Phase 10 (MP-03) adds `featuresPaths` recognition and its corresponding test.

### Test-file sibling: isFileInFeatures (D-08)

New: `test/unit/settings/isFileInFeatures.test.ts`

```typescript
suite('WorkspaceSettings.isFileInFeatures (D-08)', () => {
  test('single-path: file inside root → true', () => {
    // construct WorkspaceSettings with featuresPath="features"
    // assert isFileInFeatures(wkspUri/features/foo.feature) === true
  });
  test('single-path: file outside root → false', () => {
    // assert isFileInFeatures(wkspUri/other/foo.feature) === false
  });
  test('multi-path: file in second root → true', () => {
    // featuresPaths=["a","b"], file in wkspUri/b/foo.feature → true
  });
  test('exact root URI → true (via urisMatch)', () => {
    // isFileInFeatures(wkspUri/features) === true
  });
  test('sibling prefix "featuresX" does not match "features" root', () => {
    // Prevents Pitfall 3 prevention failure: startsWith("features") matches "featuresX"
    // Proper implementation uses startsWith(featuresUri.path + '/') || urisMatch
  });
});
```

### Test-file sibling: getFeaturesRootForFile (D-09)

New: `test/unit/common/getFeaturesRootForFile.test.ts`

```typescript
suite('getFeaturesRootForFile (D-09)', () => {
  test('returns the matching root for a file under multi-path', () => {
    // featuresUris = [A, B], file under B → returns B
  });
  test('returns undefined for file outside any root', () => {});
  test('handles exact-root URI via urisMatch', () => {});
});
```

---

## `isFileInFeatures` and `getFeaturesRootForFile` Signatures

### `WorkspaceSettings.isFileInFeatures` (D-08)

```typescript
// src/settings.ts
public isFileInFeatures(uri: vscode.Uri): boolean {
  return this.featuresUris.some(
    fu => uri.path.startsWith(fu.path + '/') || urisMatch(fu, uri)
  );
}
```

- **Return convention:** `boolean` — no throwing, no `undefined`. Pure predicate.
- **Containment semantics:** "Is this URI a descendant OR exact match of any features root?" — the `+ '/'` guard prevents `/features` matching `/featuresA` (the canonical Pitfall 3 prevention).
- **Performance:** O(N) where N = `featuresUris.length` (typically 1). Acceptable.
- **Cross-platform:** `urisMatch` handles Windows drive-letter casing (`common.ts:92`). `startsWith` on `.path` works after URIs are constructed (path is case-preserved once built).

### `getFeaturesRootForFile` (D-09)

```typescript
// src/common.ts (module-level export)
export function getFeaturesRootForFile(
  wkspSettings: WorkspaceSettings,
  fileUri: vscode.Uri
): vscode.Uri | undefined {
  return wkspSettings.featuresUris.find(
    root => fileUri.path.startsWith(root.path + '/') || urisMatch(root, fileUri)
  );
}
```

- **Return convention:** `vscode.Uri | undefined`. Returns `undefined` for files outside any root — follows the existing `common.ts` pattern (`getWorkspaceUriForFile` returns `undefined`, `getWorkspaceSettingsForFile` returns `undefined`).
- **Signature:** `(wkspSettings, fileUri)` — follows existing helpers in `common.ts` (`getWorkspaceSettingsForFile(fileorFolderUri)`). Slightly different because it needs both the settings object and the file URI.
- **Not throwing:** By convention throws `"message"` only in parsers/validators that must fail-fast (AI_INSTRUCTIONS.md §Exception Handling). This helper is a pure lookup — returning `undefined` is correct.
- **Circularity note:** `common.ts` imports `WorkspaceSettings` from `settings.ts` (already does — settings.ts line 2 imports common.ts helpers, common.ts line 8 imports `WorkspaceSettings` from `./settings`). No new cycle.

Circular import check (existing):
```typescript
// common.ts line 8:
import { WorkspaceSettings } from './settings';
// settings.ts line 3-7:
import { ... getDiscoveryEntry, ... } from './common';
```

This circular dep already exists and works in v1.1. Adding a new usage site of `WorkspaceSettings` in `common.ts` does not change cycle topology.

### Unit test surface

Combined ~8 tests across two files:

| File | # Tests | Coverage |
|------|---------|----------|
| `test/unit/settings/isFileInFeatures.test.ts` | 5 | Single-path match/no-match, multi-path match, exact-root, sibling-prefix anti-pattern |
| `test/unit/common/getFeaturesRootForFile.test.ts` | 3 | Match in multi-path, no-match, exact-root |

---

## Windows Normalization Placement

**Decision:** Private helper in `configParser.ts`. Aligns with D-10 and Discretion default.

```typescript
// src/parsers/configParser.ts (private, not exported)
function normalizeSeparators(rawPath: string): string {
  return rawPath.replaceAll('\\', '/');
}
```

**Test matrix (enumerated):**

| Input | Expected resolved path | Notes |
|-------|----------------------|-------|
| `"features"` | `<cfgDir>/features` | Unchanged (no backslashes) |
| `"features\\alt"` | `<cfgDir>/features/alt` | Basic normalization |
| `"features\\sub\\deep"` | `<cfgDir>/features/sub/deep` | Multiple backslashes |
| `"features/alt"` | `<cfgDir>/features/alt` | Forward slashes preserved |
| `"features\\mixed/sep"` | `<cfgDir>/features/mixed/sep` | Mixed normalization |
| `"/abs/unix"` | Uri.file("/abs/unix") | Absolute Unix preserved |
| `"C:\\Windows\\abs"` | Uri.file("C:/Windows/abs") | Absolute Windows: the regex `/^[a-zA-Z]:[\\/]/` matches BEFORE or AFTER normalization (it permits both slashes in the char class); after normalization the path has forward slashes, which Uri.file accepts. |
| `""` (empty) | filtered upstream | `parseIniConfig:114, parseTomlConfig:149` already filter `p.length > 0` — Phase 7 preserves this. |

**Placement verification:**

- **Inside `resolvePaths` (preferred, D-10):** applies to every element pre-URI-construction. Colocated with the URI-build logic. One call site, easy to reason about.
- **Inside `parseIniConfig` / `parseTomlConfig` at rawPaths-build time:** feasible but duplicates across two parsers. Also changes `rawPaths` content — callers that log rawPaths would see normalized text, which changes diagnostic output vs. user-written config.
- **In `common.ts`:** premature abstraction; only caller in Phase 7 is the parser.

**Recommendation matches D-10:** colocated private helper in `configParser.ts`, applied as the first transformation inside `resolvePaths`'s per-entry loop, BEFORE the absolute-path regex test.

**Security note:** `replaceAll('\\', '/')` on user-provided strings has no injection surface — the output feeds `vscode.Uri.file` / `vscode.Uri.joinPath`, both of which further sanitize. No path traversal widening (`..` handling is unchanged).

---

## Common Pitfalls

### Pitfall 1: Singular Getter Returns `undefined` Silently (D-05 Violation)

**What goes wrong:** If any code path produces an empty plural array at construction (e.g., `featuresPaths: ["", "", ""]` where the filter drops every entry), the getter returns `arr[0]` which is `undefined`. Every downstream call to `wkspSettings.featuresUri.path` or `.fsPath` now throws `TypeError: Cannot read property 'path' of undefined` — but at a different call site for each consumer.

**Why it happens:** D-05 non-empty invariant is implicit in the type system — TypeScript won't enforce "this array has length ≥ 1." The invariant must be enforced by the constructor, not by defensive reads.

**How to avoid:** After computing `projectRelativeFeaturesPaths` in the constructor (per the D-11 precedence ladder), verify length ≥ 1 and throw a fatalError if empty (matches v1.1's `featuresPath === ""` fallback to "features"). Specifically, after the precedence ladder:
```typescript
if (projectRelativeFeaturesPaths.length === 0) {
  projectRelativeFeaturesPaths = ["features"];  // matches v1.1 settings.ts:156-157 fallback
}
```

**Warning signs:** Unit tests that pass `featuresPaths: ["", ""]` and don't throw. Add an explicit test asserting fallback-to-features occurs.

### Pitfall 2: `hasExplicitSetting` Drift (D-12 Violation)

**What goes wrong:** Someone Phase 7 extends `hasExplicitSetting` to also check `featuresPaths`, reasoning that "if the user sets plural, Branch A should engage." This violates D-12 (schema not declared in Phase 7) and causes test regressions: existing tests that set `featuresPaths: []` at global scope (not explicit at workspace) now return true, flipping Branch A/Branch B decisions.

**Why it happens:** Feels natural to extend both at once. Phase 10 is the correct place.

**How to avoid:** Do NOT touch `hasExplicitSetting`. Search `git diff` for that function name before committing Phase 7.

**Warning signs:** `test/unit/settings/discoveryPriority.test.ts` regressions.

### Pitfall 3: `configError` Placeholder Update Missed in Branch B

**What goes wrong:** `common.ts:274` sets a placeholder `featuresUri: vscode.Uri.joinPath(folder.uri, "features")` when a malformed config is captured. When renaming to plural, this becomes `featuresUris: [vscode.Uri.joinPath(folder.uri, "features")]`. If missed, TypeScript error "Property 'featuresUri' does not exist on type 'DiscoveryEntry'" at this line.

**Why it happens:** The placeholder is deep inside an `else` branch that's only exercised by malformed-config tests.

**How to avoid:** Grep `featuresUri:` in `common.ts` before committing — should find **zero** remaining occurrences after the migration (all renamed to `featuresUris:`).

**Warning signs:** `npx tsc --noEmit` fails with "Property 'featuresUri' does not exist." Easy to spot.

### Pitfall 4: `testWorkspaceConfig.ts` Default for `featuresPaths` Breaks Optional-Read

**What goes wrong:** Someone follows the existing harness pattern ("return a default for undefined") and makes the `featuresPaths` case return `[]` instead of `undefined`:
```typescript
case "featuresPaths":
  return <T><unknown>(this.featuresPaths === undefined ? [] : this.featuresPaths);  // WRONG
```
Now the precedence ladder sees `featuresPaths = []` (empty array, not undefined), which per D-11 is "treated as not set" — which works. BUT `inspect()` now returns `workspaceFolderValue: []`, making `hasExplicitSetting` (once extended in Phase 10) return true for "explicit empty array," which then fails the Phase 10 tests.

**Why it happens:** The existing harness pattern (lines 67-95) defaults to type-natural empties for undefined-but-schema-declared fields. `featuresPaths` is **not schema-declared** (D-12), so its default shape is "undefined when absent," matching VS Code's real behavior for undeclared settings.

**How to avoid:** The new `case "featuresPaths"` returns `this.featuresPaths` directly (no default, can be undefined). The new `inspect` case sets `workspaceFolderValue: this.featuresPaths` — undefined when absent.

**Warning signs:** Phase 10 tests fail, not Phase 7 tests. Catch during Phase 7 by grepping the harness for `featuresPaths === undefined ? []`.

### Pitfall 5: `logSettings` Plural Surface Churn (premature)

**What goes wrong:** Phase 7's `settings.ts:261-275` `logSettings` mutates `rscSettingsDic` with `featuresPath` from `projectRelativeFeaturesPath`. Someone eager for "plural correctness" changes this to list the full plural via `featuresUris.map(...).join(", ")`. This changes the output channel surface for every existing user — a **user-visible change** in Phase 7, violating the phase's "zero user-visible change" boundary.

**Why it happens:** Feels like low-risk improvement. It's not — ROADMAP §Phase 11 SC#5 explicitly assigns plural log output to Phase 11.

**How to avoid:** Leave `logSettings` unchanged (it uses singular getters which return `[0]`, so single-path users see identical output). Resist the urge.

**Warning signs:** `git diff src/settings.ts` after Commit 3/4 shows changes in `logSettings()` function. Revert.

---

## Code Examples

### Example 1: `BehaveConfigResult` rename (D-01)

```typescript
// src/parsers/configParser.ts (Phase 7 shape)
// Before:
export type BehaveConfigResult =
  | { ok: true; configFileUri: vscode.Uri; format: 'ini' | 'toml'; rawPaths: string[]; resolvedPath: vscode.Uri }
  | { ok: false; configFileUri: vscode.Uri; errorMessage: string };

// After:
export type BehaveConfigResult =
  | { ok: true; configFileUri: vscode.Uri; format: 'ini' | 'toml'; rawPaths: string[]; resolvedPaths: vscode.Uri[] }
  | { ok: false; configFileUri: vscode.Uri; errorMessage: string };

// Updated resolver (normalizes + maps all entries):
function normalizeSeparators(rawPath: string): string {
  return rawPath.replaceAll('\\', '/');
}

function resolvePaths(rawPaths: string[], configFileUri: vscode.Uri): vscode.Uri[] {
  const configDirUri = vscode.Uri.joinPath(configFileUri, '..');
  return rawPaths.map(rawPath => {
    const normalized = normalizeSeparators(rawPath);
    if (normalized.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(normalized)) {
      return vscode.Uri.file(normalized);
    }
    return vscode.Uri.joinPath(configDirUri, normalized);
  });
}

function buildResult(configFileUri: vscode.Uri, format: 'ini' | 'toml', rawPaths: string[]): BehaveConfigResult {
  return {
    ok: true,
    configFileUri,
    format,
    rawPaths,
    resolvedPaths: resolvePaths(rawPaths, configFileUri),
  };
}
```

### Example 2: `DiscoveryEntry` rename + Branch B consumption (D-02, D-06)

```typescript
// src/common.ts (Phase 7 shape)
export interface DiscoveryEntry {
  source: DiscoverySource;
  configFileUri?: vscode.Uri;
  configError?: {
    configFileUri: vscode.Uri;
    errorMessage: string;
  };
  featuresUris: vscode.Uri[];    // was: featuresUri: vscode.Uri
}

// hasFeaturesFolder Branch B (lines 252-277 today):
const configResult = findBehaveConfig(folder.uri);
if (configResult) {
  if (configResult.ok) {
    // Phase 7: preserve single-path behavior (first path only enters discoveryCache).
    // Phase 8 widens to "existingPaths = configResult.resolvedPaths.filter(u => fs.existsSync(u.fsPath))"
    // and stores the full list.
    const firstPath = configResult.resolvedPaths[0];
    if (fs.existsSync(firstPath.fsPath)) {
      discoveryCache.set(uriId(folder.uri), {
        source: "config-file",
        configFileUri: configResult.configFileUri,
        featuresUris: [firstPath],
      });
      return true;
    }
    // Config points to nonexistent directory → fall through to convention
  } else {
    // Malformed -- capture error, fall through to convention
    discoveryCache.set(uriId(folder.uri), {
      source: "convention",
      configError: {
        configFileUri: configResult.configFileUri,
        errorMessage: configResult.errorMessage,
      },
      featuresUris: [vscode.Uri.joinPath(folder.uri, "features")],  // placeholder
    });
  }
}
```

**NOTE:** Phase 7 keeps the single-path `[firstPath]` filter at Branch B. SC#3 (length-2 assertion) is satisfied via **unit tests only**, where `TestWorkspaceConfig` directly injects `featuresPaths: ["features","features-alt"]` into `WorkspaceSettings`. The discovery cache path is unaffected by SC#3 in Phase 7 — Phase 8 widens Branch B to iterate `resolvedPaths`.

### Example 3: `WorkspaceSettings` plural fields + getters (D-03, D-08)

```typescript
// src/settings.ts (Phase 7 shape)
export class WorkspaceSettings {
  // New plural fields (D-03)
  public readonly featuresUris: vscode.Uri[];
  public readonly stepsSearchUris: vscode.Uri[];
  public readonly projectRelativeFeaturesPaths: string[];
  public readonly workspaceRelativeFeaturesPaths: string[];

  // Singular back-compat getters (D-03, D-05)
  public get featuresUri(): vscode.Uri { return this.featuresUris[0]; }
  public get stepsSearchUri(): vscode.Uri { return this.stepsSearchUris[0]; }
  public get projectRelativeFeaturesPath(): string { return this.projectRelativeFeaturesPaths[0]; }
  public get workspaceRelativeFeaturesPath(): string { return this.workspaceRelativeFeaturesPaths[0]; }

  // New instance method (D-08)
  public isFileInFeatures(uri: vscode.Uri): boolean {
    return this.featuresUris.some(
      fu => uri.path.startsWith(fu.path + '/') || urisMatch(fu, uri)
    );
  }

  constructor(wkspUri, wkspConfig, winSettings, logger, legacyConfig?, discoveryEntry?) {
    // ... existing fields untouched ...

    // D-11 precedence ladder:
    const featuresPathCfg: string | undefined = get("featuresPath");
    if (featuresPathCfg === undefined) throw "featuresPath is undefined";
    // Optional read per D-12: do NOT throw on undefined (package.json doesn't declare it)
    const featuresPathsCfg: string[] | undefined = get("featuresPaths");

    let projectRelativeFeaturesPaths: string[];
    if (featuresPathsCfg && Array.isArray(featuresPathsCfg) && featuresPathsCfg.length > 0) {
      // Rung 1: plural set + non-empty
      projectRelativeFeaturesPaths = featuresPathsCfg
        .map(p => p.replace(/^\\|^\//, "").replace(/\\$|\/$/, "").trim())
        .filter(p => p.length > 0);
      if (projectRelativeFeaturesPaths.length === 0) {
        // All entries empty → treat as unset, fall through
        projectRelativeFeaturesPaths = [featuresPathCfg ? featuresPathCfg.trim() : "features"];
      }
    } else if (featuresPathCfg && featuresPathCfg.trim() !== "") {
      // Rung 2: singular set
      projectRelativeFeaturesPaths = [featuresPathCfg.replace(/^\\|^\//, "").replace(/\\$|\/$/, "").trim()];
    } else {
      // Rung 3: neither set → discovery cache / convention (single-path, length-1 per D-02)
      const entry = discoveryEntry ?? getDiscoveryEntry(wkspUri);
      const uris = entry?.featuresUris ?? [vscode.Uri.joinPath(this.projectUri, "features")];
      projectRelativeFeaturesPaths = uris.map(u =>
        path.relative(this.projectUri.fsPath, u.fsPath).replaceAll("\\", "/") || "features"
      );
    }

    // D-05: non-empty invariant
    if (projectRelativeFeaturesPaths.length === 0) projectRelativeFeaturesPaths = ["features"];

    // D-07: per-entry "." rejection
    for (const p of projectRelativeFeaturesPaths) {
      if (p === ".") {
        this._fatalErrors.push(`"." is not a valid "gs-behave-bdd.featuresPath" value. The features folder must be a subfolder.`);
      }
    }

    this.projectRelativeFeaturesPaths = projectRelativeFeaturesPaths;
    this.featuresUris = projectRelativeFeaturesPaths.map(p =>
      vscode.Uri.joinPath(this.projectUri, p)
    );

    // Per-entry existence check (matches v1.1 settings.ts:161)
    for (const u of this.featuresUris) {
      if (!fs.existsSync(u.fsPath)) {
        this._fatalErrors.push(`features path ${u.fsPath} not found.`);
      }
    }

    // workspaceRelativeFeaturesPaths: per-entry join with projectPath
    this.workspaceRelativeFeaturesPaths = projectRelativeFeaturesPaths.map(p =>
      this.workspaceRelativeProjectPath
        ? `${this.workspaceRelativeProjectPath}/${p}`
        : p
    );

    // stepsSearchUris: per-entry derivation (Pattern 3)
    this.stepsSearchUris = this.featuresUris.map(featuresUri => {
      let stepsSearchUri = vscode.Uri.joinPath(featuresUri);
      if (!findSubdirectorySync(stepsSearchUri.fsPath, "steps")) {
        const fsPath = findHighestTargetParentDirectorySync(
          featuresUri.fsPath, this.projectUri.fsPath, "steps"
        );
        if (fsPath) stepsSearchUri = vscode.Uri.file(fsPath);
        // Phase 7: preserve v1.1 warn-only-once behavior via existing showWarn
        // logger.showWarn("No steps folder found.", this.uri);  — see §Risk Surface
      }
      return stepsSearchUri;
    });

    // NOTE: existing "No steps folder found." warning currently fires at most once
    // (single-path). In Phase 7 (still length-1), fires at most once. No change.

    // ... existing envVarPresets/envVarOverrides handling untouched ...

    this.logSettings(logger, winSettings);
  }
}
```

### Example 4: `TestWorkspaceConfig` plural surface (D-13, D-14)

```typescript
// src/testWorkspaceConfig.ts (Phase 7 additions)
private featuresPaths: string[] | undefined;  // NEW

constructor({ /* ...existing... */, featuresPath, featuresPaths }: {
  /* ...existing... */
  featuresPath: string | undefined;
  featuresPaths?: string[] | undefined;  // NEW
}) {
  /* ...existing assignments... */
  this.featuresPaths = featuresPaths;
}

get<T>(section: string): T {
  switch (section) {
    /* ...existing cases... */
    case "featuresPath":
      return <T><unknown>(this.featuresPath === undefined ? "features" : this.featuresPath);
    case "featuresPaths":
      // Optional read per D-12: return undefined when not provided
      return <T><unknown>this.featuresPaths;
    default: /* existing throw */;
  }
}

inspect<T>(section: string) {
  switch (section) {
    /* ...existing cases... */
    case "featuresPaths":
      response = <T><unknown>this.featuresPaths;
      break;
    default: /* existing throw */;
  }
  return { key: "", workspaceFolderValue: response, /* ... */ };
}

getExpected<T>(section: string, wkspUri?: vscode.Uri) {
  /* existing helpers */

  const getExpectedFeaturesPaths = (): string[] => {
    // D-11 precedence mirror for test expectations
    if (this.featuresPaths && this.featuresPaths.length > 0) {
      return this.featuresPaths.map(p => p.trim().replace(/^\\|^\//, "").replace(/\\$|\/$/, ""));
    }
    return [getExpectedFeaturesPath()];
  };

  switch (section) {
    /* ...existing cases... */
    case "featuresPaths":
      return <T><unknown>getExpectedFeaturesPaths();
    case "featuresUris":
      return <T><unknown>getExpectedFeaturesPaths().map(p => vscode.Uri.joinPath(getExpectedProjectUri(), p));
    default: /* existing throw */;
  }
}
```

---

## State of the Art

| Old Approach (v1.1) | New Approach (Phase 7) | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `resolvedPath: Uri` on BehaveConfigResult | `resolvedPaths: Uri[]` | Phase 7 | Type breaking — 2 read sites in `common.ts` updated. |
| `DiscoveryEntry.featuresUri: Uri` | `DiscoveryEntry.featuresUris: Uri[]` | Phase 7 | Type breaking — 2 read sites in `extension.ts` updated (lines 79, 83). Branch B populates `[firstPath]` (Phase 8 widens). |
| `WorkspaceSettings.featuresUri: Uri` (readonly field) | `featuresUris: Uri[]` + `get featuresUri()` accessor | Phase 7 | Additive — 27 read sites unchanged; they now hit the getter. |
| Singular `stepsSearchUri`, `projectRelativeFeaturesPath`, `workspaceRelativeFeaturesPath` | Plural mirrors + accessor getters | Phase 7 | Same pattern for all three. |
| No separator normalization in `resolvePaths` | `normalizeSeparators(rawPath)` applied per-entry | Phase 7 (D-10 / TEST-12) | Cross-platform behavior uniformity — Windows backslash paths now work on Unix. |
| No `isFileInFeatures` helper | Instance method on WorkspaceSettings | Phase 7 (D-08) | Unblocks Phase 8 without introducing another type-touch pass. |
| No `getFeaturesRootForFile` helper | Module-level function in `common.ts` | Phase 7 (D-09) | Same rationale. Dead code in Phase 7. |
| `WorkspaceSettings` reads only `featuresPath` from config | Reads both `featuresPath` + optional `featuresPaths` | Phase 7 (D-11) | Precedence matrix wired; test-harness injection surface ready. |

**Deprecated/outdated:**

- **Dual-populated `resolvedPath` + `resolvedPaths` fields** — rejected in Discussion Log (getter shim on union member is awkward). Single source of truth via breaking rename.
- **Filter-and-continue on invalid entries** — rejected in Discussion Log. All-or-nothing preserved (D-06). MP-04 softens this in Phase 8.
- **Phase 7 declaring `featuresPaths` in package.json** — rejected (D-12). Violates traceability (MP-03 belongs to Phase 10).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The 32 call-site count for singular-field reads is exhaustive (grep yielded 27 `featuresUri` + 5 `stepsSearchUri` + 2 `projectRelativeFeaturesPath` + 3 `workspaceRelativeFeaturesPath` — some sites read two fields on one line). | Consumer Inventory | If a call site was missed, singular getters won't help → TypeScript compile error at Phase 7 → caught by `npx tsc --noEmit`. **Low risk** (compiler catches it). |
| A2 | `common.ts` already circular-imports `WorkspaceSettings` from `settings.ts`; adding `getFeaturesRootForFile(wkspSettings: WorkspaceSettings, ...)` doesn't create new cycle pathology. | `getFeaturesRootForFile` Signatures | If a new cycle emerges under strict TypeScript emit rules, move helper to a new `src/discovery/featuresRoot.ts` module. **Low risk** (verified pattern — v1.1 shipped with this import dir). |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

This research has 2 `[ASSUMED]` items; both are low-risk and caught by compilation. **No user confirmation blocking planning.**

---

## Open Questions

1. **Should `logSettings` change output for plural?**
   - What we know: ROADMAP §Phase 11 SC#5 explicitly assigns plural output to Phase 11. Discussion Log §specifics does not reassign.
   - What's unclear: Nothing — this is resolved. Phase 7 leaves `logSettings` untouched (singular getters yield identical output for length-1 arrays).
   - Recommendation: Do NOT touch `logSettings` in Phase 7. Add a unit test that asserts the `projectRelativeFeaturesPath` line in `rscSettingsDic` matches v1.1 output on a single-path fixture (optional, defensive).

2. **Should Branch B in `common.ts::hasFeaturesFolder` populate all `resolvedPaths` or just `[firstPath]`?**
   - What we know: D-02 says "Populated as length-1 arrays in every single-path branch." Phase 8 (SC#3 from ROADMAP) is where multi-path actually enters the discovery cache.
   - What's unclear: Does "single-path branch" mean "every branch when single-path is the reality" (i.e., always length-1 in Phase 7), or "Branch A + Branch C which are single-path by nature, while Branch B widens when config has multi-path"?
   - Recommendation: **Length-1 in all branches in Phase 7** (conservative interpretation). Branch B stores `[resolvedPaths[0]]` only. Phase 8 widens Branch B to iterate. This matches CONTEXT.md D-02 narrative "in every single-path branch" and the "compilation-only risk" phase boundary. SC#3 is unit-tested via `TestWorkspaceConfig` direct injection — no need for Branch B to ever produce length-2 in Phase 7.
   - **This is the canonical interpretation used throughout this research.** Planner should lock it into the first PLAN.md.

3. **Does `fs.existsSync` need to be stubbed in Phase 7 unit tests?**
   - What we know: `WorkspaceSettings` constructor calls `fs.existsSync(u.fsPath)` per-entry (Pattern 3 example line `for (const u of this.featuresUris) if (!fs.existsSync...)` pushes fatalError).
   - What's unclear: Do existing unit tests stub this? Grep suggests some test files use sinon to stub fs methods; verify during test-writing.
   - Recommendation: When writing `test/unit/settings/multiPathPrecedence.test.ts`, use `sinon.stub(fs, "existsSync")` for multi-path cases where the test directories don't exist on disk. Mirrors existing patterns in other settings unit tests.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Compilation + unit tests | ✓ | 18.17.1 (per `.tool-versions`) | — |
| npm | Dependency install + test runner | ✓ | Bundled with Node | — |
| TypeScript (tsc) | Type-check | ✓ | 4.5.5 (installed) | — |
| ESLint | After-every-change lint per CLAUDE.md | ✓ | 8.11.0 (installed) | — |
| Mocha | Unit test runner | ✓ | 9.2.2 (installed) | — |
| Sinon | fs.existsSync stubbing | ✓ | 21.0.1 (installed) | — |
| VS Code runtime (integration tests) | Not needed for Phase 7 unit tests | — | — | Integration tests deferred to Phase 11. |
| Python / behave | Not needed for Phase 7 (type-only phase) | — | — | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

**All Phase 7 work is pure TypeScript type migration — no external dependencies beyond the already-installed Node/TypeScript/Mocha toolchain.**

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Mocha 9.2.2 + Sinon 21.0.1 |
| Config file | `test/unit/.mocharc.json` (existing; no changes needed) |
| Quick run command | `npm run test:unit -- --grep "TEST-12"` (scoped to Phase 7 tests) |
| Full suite command | `npm run test:unit` |
| Lint command | `npx eslint src --ext ts` (must be exit-0 per CLAUDE.md) |
| Type-check command | `npx tsc --noEmit` (via `npm run compile` which includes webpack emit) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MP-02 | `WorkspaceSettings.featuresUris` exists and equals `[featuresUri]` when singular is set | unit | `npm run test:unit -- --grep "singular.*featuresPath"` | ❌ Wave 0 — new file `test/unit/settings/multiPathPrecedence.test.ts` |
| MP-02 | Singular getter returns `featuresUris[0]` (back-compat) | unit | `npm run test:unit -- --grep "singular getter"` | ❌ Wave 0 — same file |
| MP-02 | `WorkspaceSettings.isFileInFeatures(uri)` — D-08 helper | unit | `npm run test:unit -- --grep "isFileInFeatures"` | ❌ Wave 0 — new file `test/unit/settings/isFileInFeatures.test.ts` |
| MP-02 | `getFeaturesRootForFile(wkspSettings, fileUri)` — D-09 helper | unit | `npm run test:unit -- --grep "getFeaturesRootForFile"` | ❌ Wave 0 — new file `test/unit/common/getFeaturesRootForFile.test.ts` |
| TEST-12 | Precedence matrix: plural set only | unit | `npm run test:unit -- --grep "Plural set only"` | ❌ Wave 0 — `multiPathPrecedence.test.ts` |
| TEST-12 | Precedence matrix: singular set only | unit | `npm run test:unit -- --grep "Singular set only"` | ❌ Wave 0 — same |
| TEST-12 | Precedence matrix: both set → plural wins | unit | `npm run test:unit -- --grep "Both set: plural wins"` | ❌ Wave 0 — same |
| TEST-12 | Precedence matrix: neither set → fallback | unit | `npm run test:unit -- --grep "Neither set"` | ❌ Wave 0 — same |
| TEST-12 | Precedence matrix: plural empty array → treated as unset | unit | `npm run test:unit -- --grep "Plural empty array"` | ❌ Wave 0 — same |
| TEST-12 | Windows backslash normalization applied to all entries | unit | `npm run test:unit -- --grep "Windows backslash"` | ❌ Wave 0 — same (part of `multiPathPrecedence.test.ts`) + update to `configParser.test.ts` |
| TEST-12 | `"."` rejection preserved per-entry (D-07) | unit | `npm run test:unit -- --grep "Invalid-entry"` | ❌ Wave 0 — `multiPathPrecedence.test.ts` |
| SC#3 | `featuresUris.length === 2` for a plural config | unit | `npm run test:unit -- --grep "length === 2"` | ❌ Wave 0 — inside "Plural set only" suite |
| SC#4 | `featuresPath="."` still rejected (v1.1 parity) | unit | Existing unit tests cover | ✅ Existing — verify `test/unit/settings/` for a `.`-rejection test; if absent, land in Phase 7 alongside `Invalid-entry` suite |
| SC#1 | Single-path workspace unchanged | integration | `npm run test:integration` (existing suites) | ✅ Existing — Phase 7 must not regress these |
| SC#2 | 20+ call sites work via getters | compile | `npx tsc --noEmit` | ✅ Built-in to toolchain |
| SC#5 | `npm run test:unit` green | unit | `npm run test:unit` | ✅ Existing |

### Sampling Rate

- **Per task commit:** `npx eslint src --ext ts` + `npm run test:unit -- --grep "<feature-name>"` (scoped to the tests added in that commit) — must pass before the commit lands. Mandated by CLAUDE.md "After Every Code Change."
- **Per commit pair (configParser+common, etc.):** `npm run test:unit` (full unit suite) + `npm run compile` (full webpack compile, catches TypeScript strict-mode errors) — must be green.
- **Phase gate:** Full unit suite green + `npx eslint src --ext ts` clean + `npm run compile` clean before `/gsd-verify-work`. Integration suite (existing v1.1 tests) expected green — sampled via `npm run test:integration` once per phase as a non-regression check.

### Coverage Model

- **Type-level coverage:** `tsc` strict mode validates that all 32 consumer call sites (see §Consumer Inventory) compile against the new plural fields via singular getters. This is the load-bearing safety net for the phase's "compilation-only risk" claim.
- **Per-measurement-dimension coverage (Nyquist):**
  - **Static type-check:** every source file touched.
  - **Unit test (precedence):** 5 rungs × ~2 tests per rung = 10 tests minimum in TEST-12 suite.
  - **Unit test (helpers):** 5 `isFileInFeatures` + 3 `getFeaturesRootForFile` = 8 tests.
  - **Unit test (normalization):** 2 new tests in `multiPathPrecedence.test.ts` + 1 update to `configParser.test.ts`.
  - **Unit test (existing regressions):** all prior unit tests must still pass unchanged (singular-path world preserved).
  - **Integration test (existing non-regression):** `simple/`, `sibling steps folder/`, etc. suites run to confirm Phase 7's type migration doesn't break execution paths.
  - **Manual smoke (optional):** open `example-projects/simple/` in a debug host, confirm test tree populates identically to v1.1.
- **Branch coverage (hasFeaturesFolder):** Branch A (settings), Branch B ok:true, Branch B ok:false, Branch C. In Phase 7, all three populate length-1 `featuresUris`. Unit tests for `common.ts` cover Branch B (via existing `discoveryPriority.test.ts`); Branches A and C are covered by the integration smoke suites.

### Confidence Threshold

**HIGH.** All changes are type-level. Existing behavior is tested by the unchanged integration test suites; new behavior (plural precedence + helpers) is tested by 18 new unit tests organized across 3 test files. The `tsc` + ESLint + unit-test triad catches every realistic failure mode within the phase's scope. Zero Python-side changes, zero user-visible changes, zero new dependencies — the blast radius is within the intended four-file diff.

### Wave 0 Gaps

- [ ] `test/unit/settings/multiPathPrecedence.test.ts` — covers TEST-12 precedence matrix + SC#3 length-2 + Windows normalization at settings layer + D-07 rejection
- [ ] `test/unit/settings/isFileInFeatures.test.ts` — covers D-08 helper
- [ ] `test/unit/common/getFeaturesRootForFile.test.ts` — covers D-09 helper
- [ ] Update `test/unit/parsers/configParser.test.ts:148-166` — migrate `result.resolvedPath` assertion to `result.resolvedPaths[0]`; add length-3 assertion on existing 3-path fixture; add 2 new test cases for Windows normalization at parser layer (normalization behavior is verified at both the parser layer AND the settings layer to catch bugs at either boundary)
- [ ] No new shared fixtures needed — existing `test/unit/parsers/fixtures/config/multi-path/` covers parser-level assertions; settings-layer tests inject via `makeConfig` helper copied from `discoveryPriority.test.ts`
- [ ] No framework installation needed — Mocha + Sinon already present

*(If all above items land: TEST-12 is satisfied + Phase 7's unit-test Nyquist coverage is complete)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — (VS Code extension runs in-process; no auth surface) |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | **yes** | Config file contents + settings.json values are user-controlled input. Validation via `fs.existsSync` per-entry (D-06), `"."` rejection per-entry (D-07), empty-string filter, and Windows backslash normalization (D-10 — sanitizes to a canonical form before URI construction). |
| V6 Cryptography | no | — |

### Known Threat Patterns for TypeScript + VS Code extension

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via `..` in user-supplied `featuresPath` | Elevation of Privilege | `vscode.Uri.joinPath` and `vscode.Uri.file` both resolve `..` segments; workspace boundary check via `getWorkspaceFolder(uri)` (already in place at `common.ts:323`). Phase 7 preserves — no new traversal surface. |
| Path injection via Windows backslashes yielding unexpected file access | Tampering | `normalizeSeparators` canonicalizes input to forward slashes before URI construction (D-10). No shell interpretation of `\`. Reads are through `vscode.Uri.file`, not `exec`/`spawn`. |
| Malformed INI/TOML causing parser crashes | Denial of Service | Existing `try/catch` wrappers in `parseTomlConfig` (line 134) and graceful `fs.readFileSync` error handling (line 60) — Phase 7 does not touch these. |
| Array-of-strings DoS via extremely long `featuresPaths` | DoS | Phase 7 consumes at most `featuresPaths.length` entries; no upper bound enforced. Realistic threat low (user's own config). **Mitigation:** rely on `fs.existsSync` per-entry — each entry costs one syscall. No quadratic behavior. Phase 8 dedup adds additional per-entry work; if an attacker-controlled config with 10,000+ paths becomes a concern, add a hard cap (recommend 128) — but this is Phase 8 / future milestone work, not Phase 7. |
| Prototype pollution via `{ [key]: value }` patterns reading config | Tampering | `get<string[] | undefined>("featuresPaths")` returns a value typed as `string[]` — VS Code's config API is not a prototype-pollution surface. No `Object.assign` on user-controlled data. |

**Assessment:** Phase 7 introduces one new input vector (`featuresPaths`) and one new transformation (`normalizeSeparators`). Both are defensively handled by existing patterns (per-entry validation, URI construction boundary). No security regressions.

---

## Project Constraints (from CLAUDE.md)

Directives extracted from `CLAUDE.md` (project root). Treat with same authority as CONTEXT.md locked decisions.

### After Every Code Change (MANDATORY)

1. **Lint:** `npx eslint src --ext ts` — Exit 0 with no output. Fix any warnings or errors before finishing.
2. **Unit tests:** `npm run test:unit` — All green. Fix any failures before finishing.

Both MUST pass before any commit in Phase 7. Any commit that lint-fails or test-fails is a broken commit — revert and redo.

### Multi-Path Project Constraints

- **Performance:** `getUrisOfWkspFoldersWithFeatures()` < 1ms hard requirement. Discovery results must be cached. Phase 7 does not touch the caching logic — preserved.
- **Backward compatibility:** Users with explicit `projectPath`/`featuresPath` settings must see zero behavior change. Phase 7's Branch A runs unchanged; the new plural read (featuresPaths) engages ONLY when explicitly set (D-11 rung 1).
- **Bundle size:** Extension must remain lightweight. Phase 7 adds zero npm dependencies.
- **Tech stack:** TypeScript, VS Code Extension API, Mocha/Sinon for tests. No Python changes. Phase 7 respects this (no Python touched).
- **Config fidelity:** INI/TOML parsing must match behave's own behavior for the `paths` key. Phase 7 preserves — only `resolvePaths` (post-parse) changes.

### AI_INSTRUCTIONS.md §URI Handling

- **NEVER** compare URIs using `===`, `.path`, or `.fsPath`. Use `urisMatch` / `uriId`. Phase 7's `isFileInFeatures` uses `startsWith + '/'` + `urisMatch` — compliant.
- **Path construction:** Use `vscode.Uri.joinPath()`, never `path.join()`. Phase 7 uses `Uri.joinPath` in `configParser.ts::resolvePaths` — compliant.

### AI_INSTRUCTIONS.md §Exception Handling Pattern

- Only top-level functions (handlers/event listeners) call `config.logger.showError()`. Helpers `throw`.
- Phase 7 helpers (`getFeaturesRootForFile`, `isFileInFeatures`, `normalizeSeparators`) don't throw — they return values. Correct pattern for pure lookups / transforms.
- Constructor fail-fast via `throw` (existing pattern at settings.ts:104-132) preserved for D-07 / D-06 `_fatalErrors` accumulation then `throw new WkspError(...)` in `logSettings()` (line 293-296).

### AI_INSTRUCTIONS.md §Strict TypeScript

- All code must pass `strict: true`. Phase 7's type migration is type-level; strict mode is the primary validator.
- Unused parameters prefixed `_`. N/A — no new parameter-unused code in Phase 7.

---

## Risk / Regression Surface

### What breaks if plural arrays are accidentally empty?

**Impact:** Singular getter returns `undefined`. Every downstream consumer breaks at a different call site with `TypeError: Cannot read properties of undefined (reading 'path')`.

**Mitigation:** D-05 invariant enforced in constructor (see §Common Pitfalls #1). Explicit test: `featuresPaths=["", ""]` → falls back to `["features"]`. Test in TEST-12 precedence matrix "Plural empty array" suite covers this.

### What breaks if a singular getter is called before plural is initialized?

**Impact:** `this.featuresUris` is `undefined` → `undefined[0]` throws `TypeError`.

**Mitigation:** With the `get` accessor pattern, the plural field MUST be assigned during construction before any reachable code reads the getter. TypeScript's "definite assignment assertion" rules for class fields (`public readonly featuresUris: vscode.Uri[];` without initializer) will fail strict-mode compile UNLESS the constructor assigns it. The compiler catches this automatically.

Concrete proof: if Phase 7 accidentally leaves `this.featuresUris` unassigned, `tsc` emits:
```
error TS2564: Property 'featuresUris' has no initializer and is not definitely assigned in the constructor.
```

### What existing integration tests could fail?

Cross-referenced against `test/integration/` suites:

| Suite | Risk | Mitigation |
|-------|------|------------|
| `simple suite/` | LOW — single-path workspace; singular getters preserve behavior. | Run non-regression sample. |
| `sibling steps folder*/` | LOW — tests `stepsSearchUri` logic; getter returns `[0]` identical to v1.1. | Run non-regression sample. |
| `nested project suite/` | LOW — tests `projectPath` + `featuresPath`; Branch A precedence preserved. | Run non-regression sample. |
| `project A & B suites/` | LOW — multiple workspaces, but each single-path. | Run non-regression sample. |
| `multiroot suite/` | LOW — multi-root workspace, not multi-path features. | Run non-regression sample. |
| `watcher-integration suite/` | LOW — v1.1 watcher; no touch in Phase 7. | Run non-regression sample. |
| `debug suite/` | LOW — debug launch config; no touch. | Run non-regression sample. |

Expected result: all green. Phase 7 is a non-regression phase by design.

### Unit test regressions

Cross-referenced against `test/unit/` suites (18 files):

- **`test/unit/parsers/configParser.test.ts`:** REQUIRES UPDATE — line 162-164 reads `result.resolvedPath.fsPath`. Migrate to `result.resolvedPaths[0].fsPath`.
- **`test/unit/settings/*.test.ts` (5 files):** NO CHANGES REQUIRED — none read `featuresUri` or plural fields directly. They use `makeConfig` helpers to construct `WorkspaceSettings` in-test; all pass if the getters work.
- **`test/unit/parsers/*.test.ts` (other files):** NO CHANGES REQUIRED — consumer files may mock `WorkspaceSettings` with featuresUri scalars; the getter covers this.
- **`test/unit/handlers/*.test.ts`, `test/unit/watchers/*.test.ts`, `test/unit/runners/*.test.ts`:** NO CHANGES REQUIRED — same rationale.

Only `configParser.test.ts` needs touch. Plus three new test files (see Wave 0 Gaps).

### Cross-module cycle risk

Verified: `common.ts` ↔ `settings.ts` circular imports already exist (settings.ts:3-7 imports common.ts; common.ts:8 imports settings.ts). Adding `getFeaturesRootForFile(wkspSettings: WorkspaceSettings, ...)` to `common.ts` adds one more usage of the existing circular import — does not create new cycle topology. webpack bundles the extension to a single file (`dist/extension.js`), neutralizing any load-order issues.

### Compilation risk

TypeScript strict mode catches all "field undefined at getter call" risks via `TS2564`. Every Phase 7 source file passes `tsc --noEmit` at every commit boundary per §Commit Ordering Proof. Risk: LOW.

### Test flakiness risk

New unit tests are synchronous (no `setTimeout`, no filesystem race — `fs.existsSync` is sync; sinon stubs are deterministic). No flakiness surface introduced. Risk: LOW.

### Phase 8 handoff risk

Phase 7 produces dead code (`isFileInFeatures`, `getFeaturesRootForFile`). Phase 8's plan should reference this research's §Consumer Inventory to identify which of the 32 call sites convert to `isFileInFeatures`/`getFeaturesRootForFile` vs. iterate-over-plural vs. union. Research hands off a clean inventory. Risk: LOW.

---

## Sources

### Primary (HIGH confidence)

- **Source code analysis — direct read of every touched file:**
  - `src/common.ts` (554 lines) — `DiscoveryEntry` interface (line 32), `hasFeaturesFolder` closure (lines 177-291), `uriId`/`urisMatch` helpers, `findSubdirectorySync`/`findHighestTargetParentDirectorySync`
  - `src/settings.ts` (302 lines) — `WorkspaceSettings` class (lines 59-300), fail-fast pattern, `"."` rejection (line 159), `logSettings`
  - `src/parsers/configParser.ts` (183 lines) — `BehaveConfigResult` union, `resolvePaths` single-path bug, `buildResult`
  - `src/testWorkspaceConfig.ts` (261 lines) — test harness `get`/`inspect`/`getExpected` dispatch
  - `src/parsers/stepMappings.ts` — confirmed `StepMapping.featuresUri` scalar preservation (D-04)
  - `src/watchers/workspaceWatcher.ts` — confirmed `wkspSettings.workspaceRelativeFeaturesPath` consumer
  - `src/parsers/fileParser.ts` — 18 call sites identified
  - `src/handlers/*` — 10 call sites identified
  - `src/extension.ts` — 3 call sites identified (lines 79, 83, 199)
  - `src/runners/testRunHandler.ts` — 1 call site (line 199)

- **CONTEXT.md** (`.planning/phases/07-internal-multi-path-types/07-CONTEXT.md`) — 15 locked decisions D-01..D-15; read verbatim.
- **DISCUSSION-LOG.md** (same directory) — confirms all 15 decisions' origins.
- **REQUIREMENTS.md** — MP-02 and TEST-12 exact wording.
- **ROADMAP.md** — Phase 7 goal, 5 success criteria.
- **ARCHITECTURE.md** (`.planning/research/ARCHITECTURE.md`) — 18-file consumer integration table (§Every Consumer of featuresUri/featuresPath Today); Build Order / Phase 1 scope; Cross-Cutting Design Rules #2 (`getFeaturesRootForFile` signature origin); Anti-Pattern 1 (`StepMapping.featuresUri` stays scalar).
- **PITFALLS.md** (`.planning/research/PITFALLS.md`) — Pitfall 3 (18-file rename trap), Pitfall 4 (empty array as unset), Pitfall 8 (Windows backslash normalization).
- **SUMMARY.md** (`.planning/research/SUMMARY.md`) — cross-phase confidence levels; Phase 1 = our Phase 7 scope confirmation.
- **CLAUDE.md** (`./CLAUDE.md`) — mandatory lint/unit-test after every code change.
- **AI_INSTRUCTIONS.md** (`./AI_INSTRUCTIONS.md`) — URI handling rules, exception handling pattern, strict TypeScript.
- **`.planning/config.json`** — workflow.nyquist_validation: true (confirmed Validation Architecture section required).

### Secondary (MEDIUM confidence)

- **`package.json`** — confirms current schema (no `featuresPaths` declared); confirms engines.vscode ^1.82.0, TypeScript 4.5.5, Mocha 9.2.2, Sinon 21.0.1.
- **Existing unit test patterns** — `test/unit/settings/discoveryPriority.test.ts` and `test/unit/settings/discoverySource.test.ts` — used as templates for the new TEST-12 suite.
- **Existing fixture** — `test/unit/parsers/fixtures/config/multi-path/behave.ini` contains 3 continuation-line paths (`features/auth`, `features/checkout`, `features/admin`) — already wired through the existing `configParser.test.ts:148-166` multi-path test, can be extended in Commit 1.

### Tertiary (LOW confidence, informational)

- **v1.1 watcher behavior** — assumed unchanged in Phase 7 per D-12 and §Deferred Ideas. Verified via grep: `configWatcher.ts` and `workspaceWatcher.ts` don't reference `featuresUris` — they read `workspaceRelativeFeaturesPath` (getter-covered). Low confidence only because tomorrow's commit may add an unrelated watcher change.
- **ESLint behavior for computed accessors** — assumed ESLint strict-type rules don't flag `get` accessors with implicit-any (they don't in standard `@typescript-eslint/recommended` preset). Verified via `.eslintrc.js` — no custom rules targeting accessors.

---

## Metadata

**Confidence breakdown:**

- **Standard stack:** HIGH — zero new dependencies; every library version verified against `package.json`.
- **Architecture:** HIGH — direct source analysis with line-level citations for every touched file.
- **Pitfalls:** HIGH — 5 pitfalls catalogued, each with explicit mitigation and "warning signs" verification hook.
- **Consumer inventory:** HIGH — grep-verified 32 call sites across 10 files.
- **Commit ordering:** HIGH — walked through each commit boundary, identified 1 ordering hazard (Commits 3+4 must merge) with explicit mitigation.
- **Precedence matrix test design:** HIGH — 11 unit tests across 3 files, mapped directly to TEST-12 sub-requirements.
- **Windows normalization:** HIGH — test matrix enumerated with edge cases; D-10 placement is explicit.
- **`isFileInFeatures` / `getFeaturesRootForFile` signatures:** HIGH — CONTEXT.md Claude's Discretion defaulted to specific signatures; circular-import check performed.
- **Risk / regression surface:** MEDIUM — integration-test regression risk is assessed as LOW across all 7 suites but not verified via run (Phase 7 execution will verify).

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (30 days for stable stack; the phase is compilation-only — stability is maximal).

---

## RESEARCH COMPLETE