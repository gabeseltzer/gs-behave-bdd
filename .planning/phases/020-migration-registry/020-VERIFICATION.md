---
phase: 020-migration-registry
verified: 2026-05-08T00:00:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
---

# Phase 20: Migration Registry Verification Report

**Phase Goal:** A single registry holds every migration entry the extension knows about — both v1.4.0's two existing migrations and the new `behave-vsc` cross-extension entries — and they all flow through the case 1/2/3 evaluator built in Phase 19.
**Verified:** 2026-05-08
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `migrateLegacyFeaturesPath` and `migrateLegacySuppressMultiConfig` are registered as registry entries; their old activation-time silent auto-migration call sites are gone, and they only run via the evaluator. | ✓ VERIFIED | `src/extension.ts:338` calls only `evaluateAllMigrations(wkspUri)`. No call to `migrateLegacyFeaturesPath(wkspUri)` or `migrateLegacySuppressMultiConfig(wkspUri)` in extension.ts. Registry entries `featuresPath-self` and `suppressMultiConfig-self` exist in their respective modules. Both v1.4.0 wrapper functions are preserved as thin shims in `src/notifications.ts:257,275` (intentional — Phase 22 deletes them; test regression bar still imports them). |
| 2 | New `behave-vsc` → `gs-behave-bdd` migration entries cover every silent-fallback key currently read in `src/configuration.ts`, `src/common.ts:214`, and `src/discovery/projectList.ts:179`. | ✓ VERIFIED | 11 plain entries cover all keys read via `getWithLegacyFallback` in `src/settings.ts`: `projectPath`, `runParallel`, `justMyCode`, `xRay`, `verboseLogging`, `multiRootRunWorkspacesInParallel`, `importStrategy`, `stepDefinitionSearchTimeout`, `discoveryDepth`, `discoveryStopOnFirstHit`, `activeEnvVarPreset`. Plus `featuresPath-from-behavevsc`, `suppressedNotifications-from-behavevsc`, `envVarPresets-from-behavevsc`, `envVarOverrides-from-behavevsc` for the transform-bearing keys. Total 17 entries, count-gate test pins it at `test/unit/migrations/index.test.ts:27`. |
| 3 | Re-running migrations on already-Finished entries is a no-op (idempotency guarantee). | ✓ VERIFIED | `src/migrations/evaluator.ts:63-70` — `isMigrationFinishedAtScope` short-circuits immediately, returns `'already-finished'` without calling `update()`. Tested exhaustively per-entry in `test/unit/migrations/plain.test.ts:124-148` (TEST-04 dimension a). |
| 4 | Unit tests exercise each registered legacy → canonical key pair and idempotency. | ✓ VERIFIED | 5 test files: `test/unit/migrations/index.test.ts` (registry invariants, count gate, structural extension.ts grep), `plain.test.ts` (11 entries × idempotency + case-1 finish), `featuresPath.test.ts` (2 entries + transform logic), `suppressedNotifications.test.ts` (2 entries + transform logic), `envPresets.test.ts` (2 entries + mergeRecord logic). Full suite: 826 passing, 0 failing. |

**Score:** 4/4 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/migrations/registry.ts` | Aggregated MIGRATION_REGISTRY (17 entries) | ✓ VERIFIED | Exports `MIGRATION_REGISTRY` spreading plainEntries (11) + featuresPathEntries (2) + suppressedNotificationsEntries (2) + envPresetEntries (2) = 17 |
| `src/migrations/plain.ts` | `makePlainEntry` factory + 11 plain entries | ✓ VERIFIED | Factory present, `plainEntries` array has 11 entries, all `behave-vsc` → `gs-behave-bdd` |
| `src/migrations/featuresPath.ts` | `featuresPathMergeWithDedup` + 2 entries | ✓ VERIFIED | Transform lifted from v1.4.0, shared by both `featuresPath-self` and `featuresPath-from-behavevsc` |
| `src/migrations/suppressedNotifications.ts` | 2 entries + transforms | ✓ VERIFIED | `suppressMultiConfigToArray` + `suppressedNotificationsAppendWithDedup`; entries `suppressMultiConfig-self` and `suppressedNotifications-from-behavevsc` |
| `src/migrations/envPresets.ts` | 2 entries + transforms | ✓ VERIFIED | `envVarPresetsTransform` + `envVarOverridesTransform` using `mergeRecord`; entries `envVarPresets-from-behavevsc` and `envVarOverrides-from-behavevsc` |
| `src/migrations/index.ts` | Public API re-exports | ✓ VERIFIED | Re-exports `MIGRATION_REGISTRY`, `evaluateAllMigrations`, `evaluateMigration`, types |
| `src/notifications.ts` (shims) | v1.4.0 wrappers refactored to delegate | ✓ VERIFIED | Both wrappers preserved as shims delegating to the new transform functions; no direct call sites in extension.ts |
| `src/extension.ts` (wiring) | `evaluateAllMigrations` wired at activation | ✓ VERIFIED | Line 338 calls `evaluateAllMigrations(wkspUri)` inside `Promise.all` over all workspace URIs |
| `test/unit/migrations/index.test.ts` | Registry invariants + structural checks | ✓ VERIFIED | Tests: no duplicate ids, naming convention, count === 17, extension.ts wiring structural grep |
| `test/unit/migrations/plain.test.ts` | TEST-04 dimensions (a) and (b) | ✓ VERIFIED | Per-entry idempotency (dim a) + per-entry case-1 silent finish (dim b) |
| `test/unit/migrations/featuresPath.test.ts` | FeaturesPath transform + entry tests | ✓ VERIFIED | Transform sub-cases + evaluateMigration integration |
| `test/unit/migrations/suppressedNotifications.test.ts` | Suppress transform + entry tests | ✓ VERIFIED | Both transforms + evaluateMigration integration |
| `test/unit/migrations/envPresets.test.ts` | EnvPresets transform + entry tests | ✓ VERIFIED | mergeRecord + both transforms + evaluateMigration integration |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/extension.ts` | `evaluateAllMigrations` | import from `./migrations` at line 43 | ✓ WIRED | Called at line 338 inside activation's `Promise.all` loop |
| `src/migrations/registry.ts` | All four entry modules | spread imports | ✓ WIRED | plainEntries, featuresPathEntries, suppressedNotificationsEntries, envPresetEntries all spread into `MIGRATION_REGISTRY` |
| `src/migrations/featuresPath.ts` | `normalizeFeaturesPathEntry` from `../common` | named import | ✓ WIRED | Used in `featuresPathMergeWithDedup` dedup comparison |
| `src/notifications.ts` shim | `featuresPathMergeWithDedup` from `./migrations/featuresPath` | named import at line 4 | ✓ WIRED | Used as transform arg in `migrateLegacyFeaturesPath` shim |
| `src/notifications.ts` shim | `suppressMultiConfigToArray` from `./migrations/suppressedNotifications` | named import at line 5 | ✓ WIRED | Used as transform arg in `migrateLegacySuppressMultiConfig` shim |
| `src/migrations/evaluator.ts` | `MIGRATION_REGISTRY` from `./registry` | named import | ✓ WIRED | `evaluateAllMigrations` defaults `registry` parameter to `MIGRATION_REGISTRY` |

---

### Data-Flow Trace (Level 4)

Not applicable — Phase 20 introduces no UI-rendering artifacts. All artifacts are migration logic modules and test files.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 826 unit tests pass | `npm run test:unit` | `826 passing (13s)` | ✓ PASS |
| Linter clean | `npx eslint src --ext ts` | Exit 0, no output | ✓ PASS |
| Registry count === 17 | index.test.ts:27 (run as part of suite) | Passes as part of 826 | ✓ PASS |
| `extension.ts` has no direct call sites for v1.4.0 migrations | index.test.ts:31-50 (structural grep in test) | Passes as part of 826 | ✓ PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MIGRATE-01 | 020-03, 020-05 | `migrateLegacyFeaturesPath` lifted into registry + old call sites removed | ✓ SATISFIED | `featuresPath-self` + `featuresPath-from-behavevsc` in registry; extension.ts uses evaluator only |
| MIGRATE-02 | 020-04, 020-05 | `migrateLegacySuppressMultiConfig` lifted into registry + old call sites removed | ✓ SATISFIED | `suppressMultiConfig-self` in registry; extension.ts uses evaluator only |
| MIGRATE-03 | 020-02, 020-04 | `behave-vsc` → `gs-behave-bdd` entries for all silent-fallback keys | ✓ SATISFIED | 11 plain + 4 transform entries cover all 15 distinct keys read via `getWithLegacyFallback` |
| TEST-04 | 020-02 through 020-05 | Unit tests for each key pair + idempotency | ✓ SATISFIED | 5 test files; plain.test.ts covers all 11 entries × 2 TEST-04 dimensions; specialized tests for transform-bearing entries |

---

### Anti-Patterns Found

None. No TODOs, placeholders, or stub patterns detected in the migration source files. The v1.4.0 wrapper shims (`migrateLegacyFeaturesPath`, `migrateLegacySuppressMultiConfig`) are intentional preservation for Phase 22 deletion per Pitfall 1 in the plan.

---

### Human Verification Required

One smoke-check item from VALIDATION.md that cannot be verified programmatically:

**1. Activation smoke test**

**Test:** Open `example-projects/project A` in VS Code with the extension loaded. Confirm activation completes without errors in *Developer: Show Logs → Extension Host*.
**Expected:** Extension activates cleanly; no `TypeError` or unhandled rejection from the migration evaluator path; no direct calls to the v1.4.0 migration functions appear in the log.
**Why human:** Cannot spawn a real VS Code Extension Host in the automated unit suite; only structural and behavioral unit tests are available for Phase 20.

---

### Gaps Summary

No gaps. All four ROADMAP success criteria are observably met in the codebase:

1. **SC-1 (MIGRATE-01/02):** `migrateLegacyFeaturesPath(wkspUri)` and `migrateLegacySuppressMultiConfig(wkspUri)` are gone from `extension.ts`; `evaluateAllMigrations(wkspUri)` is wired at line 338. The v1.4.0 functions remain as thin shims in `notifications.ts` (intentional — Phase 22 deletes them).

2. **SC-2 (MIGRATE-03):** All 15 distinct `behave-vsc` keys read via `getWithLegacyFallback` in `src/settings.ts` have corresponding registry entries: 11 plain entries + `featuresPath-from-behavevsc` + `suppressedNotifications-from-behavevsc` + `envVarPresets-from-behavevsc` + `envVarOverrides-from-behavevsc`. Total = 17 entries (includes 2 intra-namespace self-entries).

3. **SC-3 (idempotency):** `evaluateMigration` short-circuits at `isMigrationFinishedAtScope` check before any `update()` call; unit tests pin this per-entry.

4. **SC-4 (TEST-04):** 5 unit test files, 826 passing, 0 failing. Each of the 17 entries is exercised for both key-pair routing and idempotency.

---

_Verified: 2026-05-08_
_Verifier: Claude (gsd-verifier)_
