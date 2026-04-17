# Phase 7: Internal Multi-Path Types - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

The codebase carries multi-path shape end-to-end (`featuresUris: Uri[]`, `resolvedPaths: Uri[]`) with singular getters that return `…s[0]` for every existing consumer. **Zero user-visible behavior change.** Compilation-only risk. No new npm deps, no `package.json` schema entry, no example-project fixtures. SC#3 (length-2 arrays for INI `paths = features\n features-alt`) is satisfied via unit tests with both directories present.

Phase 7 ends where consumer migration begins — Phase 8 owns the 18-file cascade that actually iterates over the new plural fields.

</domain>

<decisions>
## Implementation Decisions

### Shape (MP-02)

- **D-01:** `BehaveConfigResult.resolvedPath: Uri` becomes `resolvedPaths: Uri[]` (breaking rename). The type is a discriminated union; getter shims on union members are awkward, and only 2 read sites in `common.ts::hasFeaturesFolder` touch it.
- **D-02:** `DiscoveryEntry.featuresUri: Uri` becomes `featuresUris: Uri[]` (breaking rename). Populated as length-1 arrays in every single-path branch (Branch A explicit settings, Branch B config-file, Branch C convention).
- **D-03:** `WorkspaceSettings` grows four plural fields — `featuresUris: Uri[]`, `stepsSearchUris: Uri[]`, `projectRelativeFeaturesPaths: string[]`, `workspaceRelativeFeaturesPaths: string[]` — with singular getters returning `[0]` for back-compat. Singular getters cover all 20+ existing call sites unchanged.
- **D-04:** `StepMapping.featuresUri` stays scalar `Uri`. Per-mapping identity — each mapping belongs to exactly one feature root. (Locked by ARCHITECTURE.md Anti-Pattern 1; restated here to prevent drift.)

### Non-Empty Invariant

- **D-05:** Every plural field on `WorkspaceSettings` and every `resolvedPaths` array on `BehaveConfigResult.ok:true` is **guaranteed non-empty at construction**. Singular getters (`featuresUri`, `stepsSearchUri`, `projectRelativeFeaturesPath`, `workspaceRelativeFeaturesPath`) always return a defined `Uri` / `string` — callers never see `undefined`. This preserves back-compat for the 20+ consumers that read the singular today.
- **D-06:** If **any** entry in a resolved path list is invalid (empty string, `"."`, or points to a non-existent directory), the whole config returns `ok:false` (malformed) or falls back to convention — **matches v1.1 all-or-nothing behavior exactly**. No partial-success today. Per-path diagnostics (MP-04) land in Phase 8.
- **D-07:** `"."` rejection from v1.1 (`settings.ts:159`) is preserved per entry. If `featuresPaths: ["features", "."]` is supplied, the `"."` entry fails the same fatal-error check as today, rejecting the whole plural list.

### Phase 7 / Phase 8 Scope Boundary

- **D-08:** `isFileInFeatures(uri: Uri): boolean` ships on `WorkspaceSettings` in Phase 7. Implementation: `featuresUris.some(fu => uri.path.startsWith(fu.path + '/') || urisMatch(fu, uri))`. Pure addition; no consumer migration. Unblocks Phase 8 handler work without forcing a second type pass.
- **D-09:** `getFeaturesRootForFile(wkspSettings: WorkspaceSettings, fileUri: Uri): Uri | undefined` ships as a module-level helper in `common.ts` in Phase 7. Accepted as dead code until Phase 8 per-document-root scoping calls it — lands together with the type change to avoid a Phase 8 diff that mixes types + helpers + consumers.
- **D-10:** Windows backslash normalization (`\` → `/`) ships in Phase 7 inside the plural-array builder. Applied to every entry of `rawPaths` before URI construction in `resolvePaths`. TEST-12 explicitly requires this. Not technically part of MP-02, but small enough and colocated with the Uri[] construction — splitting it would force Phase 8 to re-touch the same function.

### Settings Reading (partial MP-03 scaffolding)

- **D-11:** `WorkspaceSettings` constructor reads **both** `featuresPath` (singular) AND `featuresPaths` (plural) from the VS Code configuration in Phase 7. Precedence:
  1. `featuresPaths` set and non-empty → use plural
  2. `featuresPath` set (non-empty string) → use singular wrapped in length-1 array
  3. Neither → fall back to discovery cache / convention (length-1 array)
  - Empty array `featuresPaths: []` treated as "not set" (matches Pitfall 4).
  - Both set at same scope → plural wins + info-level log line (deferred to Phase 10 for the user-visible log; Phase 7 just picks plural silently — log copy lands with MP-03).
- **D-12:** `package.json` schema **is NOT modified in Phase 7**. The `gs-behave-bdd.featuresPaths: string[]` declaration is Phase 10 (MP-03). Production users only see `featuresPath`; `featuresPaths` is wired for test-harness injection only. `hasExplicitSetting` keeps current v1.1 semantics (only `featuresPath` counts as explicit user override). Phase 10 flips both switches (declare + extend hasExplicitSetting).

### Test Harness

- **D-13:** `testWorkspaceConfig.ts` mirrors the plural fields and accepts `featuresPaths: string[]` as input alongside existing `featuresPath: string`. Production shape == test-harness shape. TEST-12's precedence matrix (plural set / singular set / both set / neither set / plural empty array) is exercised via the harness's plural input.
- **D-14:** `testWorkspaceConfig` singular getters behave identically to production — return `[0]` of the respective plural. Existing unit tests that only pass `featuresPath` in setup see zero change.

### SC#3 Satisfaction

- **D-15:** The length-2 assertion (SC#3: INI `paths = features\n features-alt` → `WorkspaceSettings.featuresUris.length === 2`) is validated via **unit test only**, with both `features/` and `features-alt/` directories present in a temp-dir fixture (or mocked `fs.existsSync`) so D-06's existence check passes. No new `example-projects/` fixture is created in Phase 7 — `multi-path/` and `monorepo-scan/` fixtures land in Phase 11 (TEST-14).

### Claude's Discretion

- Implementation of singular getters (TypeScript `get featuresUri()` on the class vs. computed readonly field at construction) — pick whichever reads cleaner.
- Order of commits within the phase — recommend atomic type migration per file (configParser → common → settings → testWorkspaceConfig) so each intermediate commit still compiles.
- Exact signature of `getFeaturesRootForFile` (arg order, return `undefined` vs. throwing) — follow existing helper conventions in `common.ts`.
- Whether Windows normalization lives as a private helper in `configParser.ts` or a shared util in `common.ts` (only caller in Phase 7 is the parser; default to colocated private, move later if Phase 8 needs it).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap + Requirements
- `.planning/ROADMAP.md` §Phase 7 — Goal, Success Criteria 1-5, Requirements MP-02 + TEST-12
- `.planning/REQUIREMENTS.md` §MP-02, §TEST-12 — exact acceptance criteria wording
- `.planning/STATE.md` — v1.2 roadmap-level decisions (primary-plus-list locked; Phase 7 must land first)
- `.planning/PROJECT.md` — Milestone v1.2 scoping + Key Decisions table

### Research (HIGH confidence)
- `.planning/research/SUMMARY.md` §Reconciled Phase Decomposition — Phase 1 (= our Phase 7) "types, compilation-only risk"
- `.planning/research/ARCHITECTURE.md` §Build Order / Phase 1 — explicit Phase 7 scope callout
- `.planning/research/ARCHITECTURE.md` §Every Consumer of featuresUri/featuresPath Today — exhaustive 18-file grep result; singular getters cover all of them
- `.planning/research/ARCHITECTURE.md` §Anti-Pattern 1 — StepMapping.featuresUri stays scalar
- `.planning/research/ARCHITECTURE.md` §Cross-Cutting Design Rules #2 — getFeaturesRootForFile helper signature
- `.planning/research/PITFALLS.md` §Pitfall 3 — primary-plus-list pattern rationale (18-file rename trap)
- `.planning/research/PITFALLS.md` §Pitfall 4 — `featuresPaths: []` treated as unset
- `.planning/research/PITFALLS.md` §Pitfall 8 — Windows backslash normalization (applies in Phase 7 per D-10)

### Source files Phase 7 touches
- `src/common.ts` §DiscoveryEntry (line 32) + `hasFeaturesFolder` (lines 177-291) — Branch A/B/C populate plural arrays
- `src/settings.ts` §WorkspaceSettings (lines 59-233) — four new plural fields + singular getters
- `src/parsers/configParser.ts` §BehaveConfigResult (line 12) + `resolvePaths` (line 158) + `buildResult` (line 171) — plural rename + Windows normalization
- `src/testWorkspaceConfig.ts` — plural field mirror + plural input

### v1.1 precedents carried forward
- `.planning/milestones/v1.1-ROADMAP.md` — watcher + run-guard architecture (unaffected by Phase 7)
- `CLAUDE.md` §After Every Code Change — `npx eslint src --ext ts` + `npm run test:unit` must pass
- `AI_INSTRUCTIONS.md` — URI handling, disposables, performance, cross-platform rules

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`uriId(uri)`** (`src/common.ts:89`) — canonical case-insensitive URI comparator. Use for any dedup or prefix-match logic even though Phase 7 only populates length-1 arrays in single-path case.
- **`urisMatch(a, b)`** (`src/common.ts`) — equality check. Use in `isFileInFeatures` alongside `startsWith`.
- **`findSubdirectorySync`, `findHighestTargetParentDirectorySync`** (`src/common.ts`) — used today in `stepsSearchUri` derivation. Phase 7 must call them **per `featuresUris[i]`** when computing `stepsSearchUris[i]`.
- **Discriminated union pattern on `BehaveConfigResult`** — already established (`ok:true` vs `ok:false`). Phase 7 preserves that shape; only the `ok:true` variant's field renames.

### Established Patterns
- **Singular getter over plural state** is new for this codebase but mirrors the `WindowSettings` readonly pattern at `settings.ts:59` — readonly fields computed at construction.
- **Fail-fast throws for undefined package.json-defaulted settings** (`settings.ts:104-132`) — `featuresPaths` must NOT throw when undefined, since package.json doesn't declare it yet (D-12). Use optional-read pattern: `get<string[] | undefined>("featuresPaths")`.
- **V1.1 watcher debounce + cache-invalidation paths** are unaffected. `configurationChangedHandler` and `configWatcher` stay singular in Phase 7 — they read the cache which just has arrays under the hood.

### Integration Points
- **`common.ts::hasFeaturesFolder`** is the discovery writer and the single place where `DiscoveryEntry.featuresUris` is set. Every branch (explicit settings, config file, convention) populates arrays.
- **`settings.ts` WorkspaceSettings constructor** is the sole reader of VS Code configuration for feature paths. Adding `featuresPaths` read here is the right seam.
- **`testWorkspaceConfig.ts`** is the only entry point integration tests use to construct `WorkspaceSettings` — mirroring plural fields there covers TEST-12.

### Anti-Patterns (do NOT do in Phase 7)
- Do NOT migrate any of the 20+ singular-getter call sites in Phase 7. Phase 8 owns that. If the scan finds a call site that breaks when a length-1 array becomes length-2, that's a Phase 8 finding, not a Phase 7 fix.
- Do NOT dedup overlapping paths (MP-01 / Pitfall 2) in Phase 7 — that's Phase 8 parser rewrite territory. Phase 7 preserves whatever dedup behavior v1.1 had (which is: none, because there's only one path today).
- Do NOT add path-group intermediate TestItems. Single TestItem root per workspace stays firm through Phase 7. MP-05 is Phase 8.
- Do NOT touch `configWatcher.ts` glob. Two-tier strategy is Phase 9 / SD-04.

</code_context>

<specifics>
## Specific Ideas

- **Commit atomicity**: suggest ordering `configParser → common → settings → testWorkspaceConfig` so each intermediate commit compiles. `eslint src` + `npm run test:unit` green at every step.
- **Singular getter implementation**: TypeScript `get` accessor on the class (preferred over a regular field initialized at construction) — matches the "computed from `[0]`" semantics and makes the back-compat contract visible at declaration.
- **`isFileInFeatures(uri)` test surface**: single-path case (length-1 array) must return true for files inside the single root and false for outside. Multi-path case (length-2 array, both dirs exist) must return true for files in either root.
- **Windows normalization test matrix**: `"features\\alt"` → `features/alt` URI; `"C:\\abs"` absolute path handling stays correct.

</specifics>

<deferred>
## Deferred Ideas

- **`package.json` `featuresPaths: string[]` schema declaration** — MP-03 / Phase 10. Phase 7 reads the key but does not declare it publicly.
- **`hasExplicitSetting` extension to recognize `featuresPaths`** — Phase 10 alongside the schema declaration.
- **Info-level log when both `featuresPath` and `featuresPaths` are set at the same scope** — Phase 10. Phase 7 silently picks plural.
- **Per-path resolution failure diagnostic (`paths=[features, bogus]` flags `bogus`)** — MP-04 / Phase 8. Phase 7 stays all-or-nothing.
- **Overlap dedup in `resolvePaths` (Pitfall 2)** — MP-01 / Phase 8.
- **18-file consumer migration (loop/union over `featuresUris[]`)** — MP-06 / Phase 8.
- **Path-group intermediate TestItems** — MP-05 / Phase 8.
- **`configScanner.ts` subdir scan module** — SD-01 / Phase 9.
- **Fixtures `example-projects/multi-path/` + `monorepo-scan/`** — TEST-14 / Phase 11.
- **Integration test matrix (multi-path from behave.ini, from settings.json, etc.)** — TEST-13 / Phase 11.

</deferred>

---

*Phase: 07-internal-multi-path-types*
*Context gathered: 2026-04-17*
