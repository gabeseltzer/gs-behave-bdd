---
phase: 15-notification-suppression
milestone: v1.4.0
status: verified
verified_at: "2026-04-27T18:00:00Z"
plans_completed: 6
total_commits: 24
unit_tests_passing: 683
unit_tests_baseline: 655
unit_tests_added: 28
requirements: [NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04, NOTIF-05, NOTIF-06, NOTIF-07, NOTIF-08]
decisions: [D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-08, D-09, D-10, D-11]
created: 2026-04-27
completed: 2026-04-27
---

# Phase 15 Summary — Notification Suppression Infrastructure

**Phase 15 ships a reusable `suppressedNotifications` array setting and a `src/notifications.ts` wrapper module that replaces the legacy ad-hoc `suppressMultiConfigNotification` boolean. The multi-config notification is the first consumer; Phase 16's `featuresPath` migration notification will be the second. Migration runs on activation, scope-preserving and idempotent. 28 new unit tests; full unit suite green at 683.**

---

## What Shipped

End-to-end, the phase delivers five tightly coupled changes plus a verification gate:

1. **Schema** — New `gs-behave-bdd.suppressedNotifications: string[]` (default `[]`, scope `resource`) added to `package.json`. Mirrors the `featuresPaths` array template exactly.
2. **Settings field** — `WorkspaceSettings.suppressedNotifications: readonly string[]` loaded with strict-undefined-throw (Pattern 1 from research).
3. **Wrapper module** — New `src/notifications.ts` exporting:
   - `isSuppressed(key, wkspUri): boolean` — reads from cached `WorkspaceSettings.suppressedNotifications`.
   - `suppressNotification(key, wkspUri): Promise<void>` — dedups against `inspect().workspaceFolderValue`, writes at `ConfigurationTarget.WorkspaceFolder`, fire-and-forget on rejection.
   - `showSuppressibleNotification(key, message, buttons, wkspUri): Promise<string | undefined>` — auto-appends "Don't Show Again", intercepts the DSA action, never leaks DSA to the caller.
   - `migrateLegacySuppressMultiConfig(wkspUri): Promise<void>` — one-shot scope-preserving migration; reads legacy boolean via `inspect()`, walks workspaceFolder → workspace → global, writes new array AND removes the legacy key at the same `ConfigurationTarget`. Idempotent and fail-soft.
   - Single module-level `DONT_SHOW_AGAIN` constant.
4. **Mock surface** — `TestWorkspaceConfig` mirrors the new array setting (private field, optional ctor param, `get()` with `?? []` fallback, `inspect()` case).
5. **Wiring + cleanup** — `extension.ts` activate() runs the per-workspace migration loop (awaited, with `config.reloadSettings()` after each, in defense-in-depth try/catch) BEFORE the `updateDiscoveryUX(getUrisOfWkspFoldersWithFeatures(), false)` call. The L141-L181 inline notification block is replaced with a single `showSuppressibleNotification('multiConfigNotification', ...)` fire-and-forget call. Legacy `gs-behave-bdd.suppressMultiConfigNotification` schema entry removed; `WorkspaceSettings.suppressMultiConfigNotification` field removed; `TestWorkspaceConfig` legacy mock entries removed; four cascading settings test fixtures (`multiPathPrecedence`, `verboseLogging`, `projectUriDerivation`, `logSettingsPlural`) cleaned of the legacy `false` line.
6. **Verification gate** — Plan 06 ran lint, typecheck (test), full unit suite (683 passing), webpack compile, targeted mocha sub-suites for every NOTIF-* row in `15-VALIDATION.md`, inline schema-shape `node -e` checks, and source/test legacy-reference greps. All green; one minor finding documented (see Findings).

The migration helper itself is the only remaining source-tree reference to the literal `suppressMultiConfigNotification` string — by design (it's the legacy key the migration inspects and removes from settings.json).

---

## Plan-by-Plan Recap

- **15-01** — Schema + WorkspaceSettings field foundation. Added `suppressedNotifications` to package.json schema, added strict-undefined-throw field to `WorkspaceSettings`, atomically updated all four cascading settings test fixtures (BLOCKER B-2 fold from Plan 04 → Plan 01), and scaffolded `notifications.test.ts` with the Wave 0 A1 probe. 7 tasks, 7 atomic commits, 4 new tests. (~25 min)

- **15-02** — `notifications.ts` core API. TDD RED → GREEN. Implemented `isSuppressed`, `suppressNotification`, `showSuppressibleNotification`, and `DONT_SHOW_AGAIN` constant. 13 new unit tests covering NOTIF-02/03/04 + DSA passthrough. Added `ConfigurationTarget` enum to vscode mock (Rule 3 deviation — required for `vscode.ConfigurationTarget.WorkspaceFolder` to resolve). 2 commits. (~15 min)

- **15-03** — Migration helper. TDD RED → GREEN. Implemented `migrateLegacySuppressMultiConfig` with three-scope detection ladder, same-scope dedup read (Pitfall 2 mitigation), scope-preserving dual-key writes (D-06, D-08), defense-in-depth try/catch (D-07). 8 new sub-case tests. Introduced `makePerKeyScopedConfig` helper for the migration's two-key inspect() pattern. 2 commits. (~10 min)

- **15-04** — `TestWorkspaceConfig` mock surgery. Added `suppressedNotifications` mock surface mirroring the `featuresPaths` array precedent (private field, optional ctor param, `get()` with `?? []` fallback, `inspect()` case without fallback). Single-task plan structure preserved per BLOCKER B-2 fold (the four cascading-fixture updates that were originally Plan 04 Tasks 2-5 already landed in Plan 01). 1 commit. (~10 min)

- **15-05** — `extension.ts` wiring + schema removal. A1 probe verified GREEN before schema removal. Wired `showSuppressibleNotification('multiConfigNotification', ...)` at L141-L181 (fire-and-forget). Added per-workspace migration loop to `activate()` before `updateDiscoveryUX` (D-05, Pitfall 3, Pitfall 4). Deleted legacy schema entry from package.json (NOTIF-05). Cleaned `WorkspaceSettings`, `TestWorkspaceConfig`, and four cascading test fixtures. Added 3 structural tests guarding the activation-order invariant + wrapper call shape + legacy-key-literal absence. Comment in extension.ts rephrased to drop the literal token (so the structural test stays maximally strict). 2 Rule 1/2 deviations folded into their task commits. 4 implementation commits. (~12 min)

- **15-06** — Phase verification gate. Ran lint + typecheck (test) + full unit suite + webpack compile + targeted mocha sub-suites + inline schema-shape `node -e` checks + source/test legacy-reference greps. All checks GREEN. One minor finding (see below). Aggregated per-plan summaries into this phase-level summary. (~10 min)

**Total phase duration:** ~82 min across 6 plans.

---

## Verification Results

| Check | Command | Result |
|-------|---------|--------|
| Lint clean | `npx eslint src --ext ts` | exit 0, no output ✓ |
| Typecheck (main) | `npx tsc --noEmit -p .` | only pre-existing smol-toml ErrorOptions baseline noise ✓ |
| Typecheck (test) | `npx tsc --noEmit -p test/tsconfig.json` | exit 0 ✓ |
| Full unit suite | `npm run test:unit` | 683 passing, 0 failing ✓ |
| Webpack compile | `npm run compile` | webpack 5.76.2, ~3000 ms, no errors ✓ |
| Phase 15 sub-suite | `mocha --grep "Phase 15"` | 28 passing ✓ |
| Schema sub-suite | `mocha --grep "schema"` | 2 passing (NOTIF-01 shape + NOTIF-05 absence) ✓ |
| Migration sub-suite | `mocha --grep "migrate"` | 9 passing (8 NOTIF-06 + 1 ordering) ✓ |
| Ordering sub-suite | `mocha --grep "ordering\|activation"` | 4 passing (3 Pitfall-3 structural + 1 stepDef) ✓ |
| Settings cascade | `mocha --grep "settings\|setting"` | 36 passing ✓ |
| Inline schema check | `node -e "..."` | "schema ok" ✓ |
| Legacy-reference grep (src) | `grep "suppressMultiConfigNotification" src/` | only `src/notifications.ts` (allow-listed) ✓ |
| Legacy-reference grep (test) | `grep "suppressMultiConfigNotification" test/unit/` | `notifications.test.ts` + `packageJsonSchema.test.ts` allow-listed; **vscode.mock.ts** flagged (see Findings) ⚠️ |
| Integration test | `npm run test:integration` | DEFERRED — requires VSCode Insiders/Stable launch (matches Phase 17 manual smoke) |

**Test growth:** 655 baseline (pre-Phase-15) → 683 (end-of-Phase-15). +28 tests:
- 2 Wave 0 A1 probes (Plan 01)
- 2 schema tests (Plan 01)
- 13 notifications module tests (Plan 02)
- 8 migration sub-case tests (Plan 03)
- 3 activation-ordering structural tests (Plan 05)

---

## Requirement Traceability

| Req | Plan(s) | Test File / Suite | Status |
|-----|---------|-------------------|--------|
| **NOTIF-01** | 15-01 | `test/unit/packageJsonSchema.test.ts` `suppressedNotifications has correct array schema shape` + inline `node -e` check | ✓ |
| **NOTIF-02** | 15-02 | `test/unit/notifications.test.ts` `isSuppressed` (4) + `suppressNotification` (4) | ✓ |
| **NOTIF-03** | 15-02 | `test/unit/notifications.test.ts` `suppressNotification appends key and writes to WorkspaceFolder scope` | ✓ |
| **NOTIF-04** | 15-02, 15-05 | `test/unit/notifications.test.ts` `showSuppressibleNotification (NOTIF-04 + D-04)` (5) + `extension.*multiConfigNotification` structural | ✓ |
| **NOTIF-05** | 15-05 | `test/unit/packageJsonSchema.test.ts` `legacy ... REMOVED from schema (NOTIF-05)` + inline `node -e` absence check | ✓ |
| **NOTIF-06** | 15-03, 15-05 | `test/unit/notifications.test.ts` `migrateLegacySuppressMultiConfig (NOTIF-06)` (8) + `activate.*migration order` structural | ✓ |
| **NOTIF-07** | 15-06 | Composite — full Phase 15 unit suite (28 passing) + lint + typecheck + webpack | ✓ |
| **NOTIF-08** | 15-01, 15-04 | `TestWorkspaceConfig` mock surface + 4 cascading settings test files (`multiPathPrecedence`, `verboseLogging`, `projectUriDerivation`, `logSettingsPlural`) | ✓ |

---

## Decisions Honored

| Decision | Description | Plan(s) | Honored |
|----------|-------------|---------|---------|
| **D-01** | Plain exported functions (not class/namespace) | 15-02 | ✓ — `src/notifications.ts` exports plain async functions, no class wrapper |
| **D-02** | New dedicated `src/notifications.ts` file | 15-02 | ✓ — file created with all notification utilities |
| **D-03** | Wrapper auto-appends "Don't Show Again" and handles suppression internally | 15-02 | ✓ — DSA appended in `showSuppressibleNotification`, intercepted before return |
| **D-04** | Wrapper returns user's selected action excluding DSA | 15-02 | ✓ — `button passthrough: never returns "Don't Show Again"` test passes |
| **D-05** | Migration runs eagerly on activation, before notifications fire | 15-05 | ✓ — `await migrateLegacySuppressMultiConfig(wkspUri)` precedes `updateDiscoveryUX` (structural test guards) |
| **D-06** | After writing new array, `update(oldKey, undefined)` at same scope | 15-03 | ✓ — second `update("suppressMultiConfigNotification", undefined, target)` in migration helper |
| **D-07** | Migration failure logs warn, does not show user notification | 15-03 | ✓ — `config.logger.logInfo(...)` in catch; `assert.doesNotReject` test passes |
| **D-08** | Migration writes at same scope where old boolean was found | 15-03 | ✓ — three scope-detection tests (folder/workspace/global) all pass |
| **D-09** | Keys are camelCase freeform strings (e.g., `multiConfigNotification`) | 15-02, 15-05 | ✓ — `multiConfigNotification` used as the first key |
| **D-10** | No validation of key values; unknown keys silently ignored | 15-02 | ✓ — `isSuppressed` is a plain `Array.includes` check; no validation list |
| **D-11** | Deduplicate on write — `suppressNotification` checks before appending | 15-02, 15-03 | ✓ — `dedup: does NOT call update if key already present` + migration `merge` test pass |

---

## Pitfalls Navigated

- **A1 (Wave 0 assumption):** "Will `cfg.inspect()` return per-scope values for an unregistered key whose value lives in settings.json?" — Plan 01 documented the *expected* contract via 2 unit-level probes; Plan 05 verified GREEN before schema removal. Real-VSCode confirmation deferred to Phase 17 manual smoke per `15-VALIDATION.md` Manual-Only Verifications.
- **Pitfall 1 (settings cascade):** any plan that adds a strict-undefined throw to `WorkspaceSettings` MUST update all four BASE_CFG / makeFakeWkspSettings fixtures atomically. Honored — Plan 01 folded the four cascade updates into a single atomic landing (BLOCKER B-2 fold), eliminating the transient red full-unit-suite window during Wave 2.
- **Pitfall 2 (cfg.get vs. cfg.inspect for dedup):** `cfg.get<string[]>(...)` returns the *merged* effective value across scopes; using it for dedup risks falsely skipping lower-scope migrations when a higher-scope array already contains the key. Honored — both `suppressNotification` (Plan 02) and `migrateLegacySuppressMultiConfig` (Plan 03) read existing arrays via `cfg.inspect<string[]>(...).<sameScope>Value` only.
- **Pitfall 3 (activation ordering):** migration MUST run before `updateDiscoveryUX` so the cached settings are correct when the multi-config notification fires. Honored — Plan 05 placed the loop just before the `updateDiscoveryUX` call. Structural test in `notifications.test.ts` (`activate.*migration order: migrateLegacySuppressMultiConfig precedes updateDiscoveryUX`) guards against future regressions.
- **Pitfall 4 (cache staleness after migration):** after migration writes new settings, the cached `WorkspaceSettings` still holds the old shape. Honored — `config.reloadSettings(wkspUri)` is called after each `await migrateLegacySuppressMultiConfig(wkspUri)` in the per-workspace activation loop.
- **Pitfall 5 (TestWorkspaceConfig.inspect fidelity):** `TestWorkspaceConfig.inspect()` only populates `workspaceFolderValue`, not the full per-scope shape. Honored — migration tests in Plan 03 use the inline `makePerKeyScopedConfig` helper for per-scope shapes, not `TestWorkspaceConfig`.
- **Pitfall 6 (DSA literal divergence):** the literal `"Don't Show Again"` could drift between append site and intercept site, breaking the DSA flow silently. Honored — single `DONT_SHOW_AGAIN` module constant referenced at both sites in `src/notifications.ts` (T-15-04 mitigation).

---

## Files Changed

### Created (3)

- `src/notifications.ts` — 71 + 58 lines (Plans 02 + 03). Module of plain async functions: `isSuppressed`, `suppressNotification`, `showSuppressibleNotification`, `migrateLegacySuppressMultiConfig`. Single `DONT_SHOW_AGAIN` module constant. Imports only `vscode` (namespace) and `config` from `./configuration`.
- `test/unit/notifications.test.ts` — Phase 15 test file. Wave 0 A1 probes; isSuppressed/suppressNotification/showSuppressibleNotification suites; 8 migration sub-cases; 3 activation-ordering structural tests. Exports `makeScopedConfig` and `makePerKeyScopedConfig` helpers.
- `test/unit/packageJsonSchema.test.ts` — Schema-shape unit tests for NOTIF-01 (presence + correct shape) and NOTIF-05 (legacy key absent).

### Modified (10)

- `package.json` — `gs-behave-bdd.suppressedNotifications` schema entry added (Plan 01); legacy `gs-behave-bdd.suppressMultiConfigNotification` block deleted (Plan 05).
- `src/settings.ts` — `readonly suppressedNotifications: readonly string[]` field with strict-undefined-throw load (Plan 01); legacy `suppressMultiConfigNotification` field, ctor read, and assignment removed (Plan 05).
- `src/testWorkspaceConfig.ts` — `suppressedNotifications` private field, ctor param, ctor type annotation, ctor assignment, `get()` case with `?? []` fallback, `inspect()` case (Plan 04); legacy entries removed (Plan 05).
- `src/extension.ts` — Per-workspace migration loop in `activate()` before `updateDiscoveryUX`; replaced L141-L181 inline notification block with `showSuppressibleNotification('multiConfigNotification', ...)`; added `import { migrateLegacySuppressMultiConfig, showSuppressibleNotification } from './notifications'`; rephrased one comment to drop the literal legacy key name (Plan 05).
- `test/unit/vscode.mock.ts` — Added `enum ConfigurationTarget { Global=1, Workspace=2, WorkspaceFolder=3 }` for unit-test resolution of `vscode.ConfigurationTarget.WorkspaceFolder` (Plan 02 — Rule 3 deviation).
- `test/unit/settings/multiPathPrecedence.test.ts` — `BASE_CFG` carries `suppressedNotifications: []` (Plan 01); legacy `suppressMultiConfigNotification: false,` line removed (Plan 05).
- `test/unit/settings/verboseLogging.test.ts` — Same pair of edits in `makeFakeWkspSettings`.
- `test/unit/settings/projectUriDerivation.test.ts` — Same pair of edits in `BASE_CFG`.
- `test/unit/settings/logSettingsPlural.test.ts` — Same pair of edits in `makeFakeWkspSettings`.
- `test/unit/packageJsonSchema.test.ts` — Test name and assertion flipped from "STILL present" to "REMOVED from schema (NOTIF-05)" (Plan 05).

---

## Findings

### Finding 1 (minor, non-blocking): leftover legacy-key fallback in test/unit/vscode.mock.ts

**File:** `test/unit/vscode.mock.ts` lines 171-173
**Snippet:**
```typescript
if (key === 'suppressMultiConfigNotification') {
  return false;
}
```

**Why this exists:** Pre-existing get() fallback from before the schema removal. Plan 05 cleaned every other mention (schema, field, mock, four cascading test fixtures), but this defensive fallback in the global vscode mock was missed.

**Behavioral impact:** None observed. The migration helper uses `cfg.inspect()`, not `cfg.get()`. No production code calls `cfg.get<boolean>("suppressMultiConfigNotification")` anymore (Plan 05 removed the `WorkspaceSettings` read). The fallback returns `false` to a code path that doesn't exist anymore — pure dead code.

**Why reported, not fixed:** Plan 06 is verification-only by mandate. The executor prompt is explicit: "If any check fails, REPORT it (do not silently fix)." The original Plan 06 acceptance criterion that `grep -rn "suppressMultiConfigNotification" test/unit/` should match ONLY in `notifications.test.ts` and `packageJsonSchema.test.ts` is technically not met.

**Suggested disposition:**
- Treat as cosmetic dead code; remove in a future small-fix plan or alongside the next Phase 16/17 work that touches `vscode.mock.ts`.
- OR open a tiny Phase 15 follow-up plan if strict acceptance-criteria conformance is required. Single-line removal; one commit.

**Phase 15 sign-off:** All 8 NOTIF-* requirements pass automated verification. Finding 1 has zero behavioral effect.

---

## Manual / Deferred Verifications

| Item | Source | Why Deferred | Owner |
|------|--------|--------------|-------|
| End-to-end real-VSCode activation migration with stale `suppressMultiConfigNotification: true` in `.vscode/settings.json` | `15-VALIDATION.md` Manual-Only Verifications | Requires Extension Development Host launch; not feasible in headless verification environment. Fixture lives at `test/example-projects/multiroot-workspace/`. | Phase 17 (cross-cutting verification) |
| `npm run test:integration` smoke run | Plan 06 optional check | Requires `@vscode/test-electron` to spawn VSCode Insiders/Stable. Same as above. | Phase 17 |
| Cleanup of `test/unit/vscode.mock.ts` legacy-key fallback | Finding 1 above | Verification-only plan; reporting per executor mandate. | Optional follow-up plan or Phase 16/17 |

---

## Phase Metrics

| Metric | Value |
|--------|-------|
| Plans planned | 6 |
| Plans completed | 6 |
| Total commits | 24 (21 implementation + 3 phase docs) |
| Files created | 3 (`src/notifications.ts`, `test/unit/notifications.test.ts`, `test/unit/packageJsonSchema.test.ts`) |
| Files modified | 10 |
| New unit tests | 28 (655 → 683) |
| Lines of new production code | ~129 (src/notifications.ts ≈ 129 lines after Plans 02 + 03) |
| Phase duration (active execution) | ~82 min across 6 plans |
| Wave structure | 5 waves (Wave 0 probe in Plan 01, Waves 1-4 across Plans 01-05, Wave 5 verification in Plan 06) |
| Lint regressions | 0 |
| Typecheck regressions | 0 (only pre-existing smol-toml ErrorOptions baseline) |
| Test failures | 0 |
| Webpack compile errors | 0 |

---

## Key-Links Verified

- **15-01 → 15-02:** `WorkspaceSettings.suppressedNotifications` field present + `makeScopedConfig` exported from `notifications.test.ts` ✓
- **15-01 → 15-04:** `package.json` schema entry present and four cascading test fixtures carry `suppressedNotifications: []` ✓
- **15-02 → 15-03:** `src/notifications.ts` exists with three plain functions; `ConfigurationTarget` enum in `vscode.mock.ts` ✓
- **15-02 → 15-05:** `showSuppressibleNotification(key, message, buttons, wkspUri): Promise<string | undefined>` signature stable; Plan 05 wires it at `extension.ts` L141-L181 ✓
- **15-03 → 15-05:** `migrateLegacySuppressMultiConfig` exported and importable; Plan 05 imports + awaits it in `activate()` ✓
- **15-04 → 15-05:** `TestWorkspaceConfig` carries `suppressedNotifications` mock surface; Plan 05 cleanup leaves only the new key ✓
- **All NOTIF-* → 15-VALIDATION.md:** Every row's `<automated>` command verified GREEN in Plan 06 (see Verification Battery Walk in 15-06-SUMMARY.md) ✓

---

## Next Steps

1. **Phase verifier (`gsd-verifier`)** runs next — has the full ledger of evidence in this summary plus per-plan summaries.
2. **ROADMAP.md update** is the orchestrator's responsibility — Plan 06 leaves it untouched per its `<critical_constraints>`.
3. **Phase 16 (`featuresPath` migration + notification)** inherits the `showSuppressibleNotification` infrastructure. Pattern is established: pick a key (e.g., `featuresPathMigration`), call the wrapper. No further infrastructure changes needed in Phase 15.
4. **Phase 17 (cross-cutting verification)** should:
   - Run the manual end-to-end smoke check from `15-VALIDATION.md` Manual-Only Verifications.
   - Optionally clean up Finding 1 (dead `vscode.mock.ts` fallback).
   - Optionally land a Plan 06 acceptance-criteria-strict follow-up if strict grep-allow-list compliance is required.

---

*Phase: 15-notification-suppression*
*Milestone: v1.4.0*
*Verified: 2026-04-27*
