---
phase: 16-deprecate-featurespath
milestone: v1.4.0
status: verified
verified_at: "2026-04-29T00:00:00Z"
plans_completed: 6
total_commits: 13
unit_tests_passing: 696
unit_tests_baseline: 683
unit_tests_added: 13
requirements: [DEP-01, DEP-02, DEP-03, DEP-04, DEP-05, DEP-06, DEP-07]
decisions: [D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-08, D-09, D-12, D-13, D-15, D-16, D-17, D-18, D-MOD]
created: 2026-04-29
completed: 2026-04-29
---

# Phase 16 Summary — Deprecate `featuresPath`

**Phase 16 removes the singular `gs-behave-bdd.featuresPath` setting from the package.json schema, auto-migrates any explicit user value (in either `gs-behave-bdd` or `behave-vsc` namespace) to the canonical `gs-behave-bdd.featuresPaths[]` array at the same scope, and shows a one-time post-migration notification with an "Open Settings" action. A new generic `migrateScopedSetting<TSrc, TDest>` primitive in `src/notifications.ts` is the single backbone for both Phase 15's suppression-key migration and Phase 16's path migration. Six plans, 13 implementation commits, 7/7 DEP requirements satisfied, full unit suite green at 696.**

This phase is a pure rollup — facts come directly from per-plan SUMMARYs (16-01..16-06) and `16-VERIFICATION.md`. No new analysis.

---

## What Shipped

End-to-end:

1. **Generic migration primitive (D-MOD).** Plan 02 extracted `migrateScopedSetting<TSrc, TDest>` from the Phase 15 helper. The primitive encapsulates `inspect()` → most-specific-scope detection → same-scope dest read (Pitfall 2) → transform → write+remove at the same `ConfigurationTarget` → never-throws rejection log. Returns its decision via a `TransformResult<T>` discriminated union (`{ kind: 'write', value }` or `{ kind: 'skipDest', removeSource }`). Phase 15's `migrateLegacySuppressMultiConfig` was refactored to delegate to the primitive, with all 8 Phase 15 sub-cases preserved as a regression bar.
2. **`migrateLegacyFeaturesPath` wrapper.** Plan 03 layered a thin wrapper over the primitive: loop the two source namespaces (`gs-behave-bdd`, `behave-vsc`), call the primitive once per namespace with a transform that handles same-scope merge-with-dedup (D-06/D-07), empty/whitespace skip-with-removal (D-08), and literal-`.` migration (D-09). Returns `Promise<boolean>` (true = at least one (namespace × scope) was migrated) so the caller can gate a single user-visible notification.
3. **Activation wiring (D-18 ordering).** Plan 04 placed `migrateLegacyFeaturesPath` first, `migrateLegacySuppressMultiConfig` second, and `config.reloadSettings(wkspUri)` third (sync void per Pitfall 8 — never awaited) inside the per-workspace activation loop in `src/extension.ts`. Migrated workspaces are pushed to a `pendingFeaturesPathNotifs` queue; a post-loop `showSuppressibleNotification('featuresPathMigration', …, ['Open Settings'])` fires once per migrated workspace. Clicking "Open Settings" runs `workbench.action.openSettings @ext:gabeseltzer.gs-behave-bdd` (publisher literal D-12, locked in Plan 01).
4. **Schema removal + source-tree singular cleanup (D-15, D-16).** Plan 05 deleted the `gs-behave-bdd.featuresPath` block from `package.json`, collapsed `WorkspaceSettings`'s 4-rung precedence ladder to 3 rungs (plural → config-file → convention), and simplified `hasFeaturesFolder()`'s Branch A to a plural-only gate plus a default-features-folder convention check. After this plan no production code path in `src/settings.ts` or `src/common.ts` reads the singular setting.
5. **Mock surgery + fixture cascade (D-17).** Plan 06 atomically removed the singular surface from `src/testWorkspaceConfig.ts` (private field, ctor entry, get/inspect/getExpected switch cases, helper renamed `getExpectedFeaturesPath` → `getExpectedFeaturesFolder`) and updated all 8 consuming test fixture files in the same plan to keep the compile graph green. Edge-case helper tests that previously exercised `'featuresPath'` against `hasExplicitSetting` were retargeted to `'projectPath'` (a surviving caller) — preserving coverage without losing tests.

The migration helper itself is the only remaining live source-tree reference to the literal `featuresPath` string (it's the legacy key the migration inspects and removes from `settings.json`). Comment-only references in `src/settings.ts`, `src/common.ts`, and `src/extension.ts` document **what was removed and why** for future readers; they are intentional historical breadcrumbs (D-15, D-16, D-18), not stub indicators.

---

## Plan-by-Plan Recap

- **16-01 — Pre-flight verification + helper export.** Locked three load-bearing facts: publisher literal `gabeseltzer` for D-12 (`package.json:280`), Wave 0 A1 inspect() contract still GREEN, baseline pass count = 683. Re-exported `makePerKeyScopedConfig` from `notifications.test.ts` so Plans 02–03 could import it directly. 1 commit (`5210104`). (~5 min)

- **16-02 — Extract `migrateScopedSetting` primitive (D-MOD).** TDD-style refactor. Pulled the inspect-detect-scope-write-then-remove mechanics out of Phase 15's helper into a generic `migrateScopedSetting<TSrc, TDest>` async function with a `TransformResult<T>` discriminated union. Phase 15 wrapper shrank to a ~10-line transform callback; public `Promise<void>` signature unchanged. 8 Phase 15 sub-cases preserved as regression bar. 7 new direct primitive tests. 2 commits (`c83e785`, `a89227e`). (~10 min)

- **16-03 — Implement `migrateLegacyFeaturesPath` wrapper.** Wrapper iterates `FEATURES_PATH_NAMESPACES = ['gs-behave-bdd', 'behave-vsc']`; transform handles three cases inline (empty/whitespace skip-with-removal, post-normalization-empty skip-with-removal, merge-with-dedup). `destNamespace: 'gs-behave-bdd'` hardcoded inside the wrapper — both source namespaces' values land in the canonical destination. 12 new tests cover cases (a)-(j). 2 commits (`c53429e`, `284d2e7`). (~10 min)

- **16-04 — Wire `migrateLegacyFeaturesPath` into activation + notification.** D-18 ordering enforced (featuresPath migration first, suppressMultiConfig second, reloadSettings third — sync void per Pitfall 8). Post-loop notification block uses key `featuresPathMigration` (D-13) with button `Open Settings` (D-12, publisher literal `@ext:gabeseltzer.gs-behave-bdd`). 4 structural tests guard ordering, key literal, publisher literal, and the no-await Pitfall-8 invariant. 2 commits (`7303a19`, `7869a87`). (~5 min)

- **16-05 — Source-tree singular `featuresPath` cleanup.** Deleted schema entry (DEP-01); collapsed `WorkspaceSettings` ladder to 3 rungs (D-15); simplified `hasFeaturesFolder()` Branch A (D-16). Plan-allowed task swap (Task 2 → Task 1 → Task 3) kept every commit's compile graph green by removing the `get("featuresPath")` call before deleting the schema entry. 4 unit tests in `multiPathPrecedence.test.ts` deferred to Plan 06 — they assert exactly the ladder branches D-15 deleted. 3 commits (`2e3b7da`, `c9ab99d`, `33d9c0f`). (~5 min)

- **16-06 — Atomic mock surgery + test-fixture cascade + phase verification.** Removed singular surface from `src/testWorkspaceConfig.ts` (D-17) and atomically updated 8 consuming test files in the same plan. 11 obsolete tests deleted; 4 deferred failures from Plan 05 resolved; 5 helper-edge-case tests retargeted from `'featuresPath'` to `'projectPath'` (preserving coverage). Final unit suite: 696 passing, 0 failing. Webpack compiles. Lint clean. All 6 ROADMAP success criteria verified. 2 commits (`d58ba6e`, `7eff75b`). (~12 min)

**Total phase duration:** ~47 min across 6 plans, 13 implementation commits.

---

## Verification Results

(From `16-VERIFICATION.md` — `status: passed`, `score: 6/6 must-haves verified`.)

| Check | Result |
|-------|--------|
| Singular `featuresPath` absent from package.json schema | ✓ — only plural at L38 |
| Production runtime reads only `featuresPaths[]` | ✓ — all `\bfeaturesPath\b` matches in src/ are comments or the migration helper |
| `migrateLegacyFeaturesPath(wkspUri)` exported from `src/notifications.ts` | ✓ — `src/notifications.ts:232` |
| Migration wired BEFORE multi-config migration (D-18) | ✓ — `src/extension.ts:307-310` with explicit D-18 comment |
| Generic `migrateScopedSetting<TSrc, TDest>` exists; Phase 15 helper delegates | ✓ — primitive at `src/notifications.ts:98`; wrapper delegates at L175; featuresPath wrapper delegates at L235 |
| Mock has no singular surface; lint clean; full unit suite green | ✓ — only plural in `src/testWorkspaceConfig.ts`; eslint clean; **696 passing** |
| Activation publisher literal | ✓ — `@ext:gabeseltzer.gs-behave-bdd` in `src/extension.ts` (NOT `formlabs`) |
| `config.reloadSettings` called WITHOUT await (Pitfall 8) | ✓ — 0 `await config.reloadSettings` matches |
| Migration suite tests (combined grep) | 34 passing |
| Webpack compile | ✓ |

---

## Requirement Traceability

(From `16-VERIFICATION.md` Requirements Coverage table.)

| Req | Plan(s) | Description | Evidence | Status |
|-----|---------|-------------|----------|--------|
| **DEP-01** | 16-05 | `featuresPath` removed from package.json schema | Schema verified — only plural present | ✓ |
| **DEP-02** | 16-03, 16-04 | Auto-migrate explicit `featuresPath` value at any scope | `migrateLegacyFeaturesPath` + activation wiring | ✓ |
| **DEP-03** | 16-03 | Migration writes to same scope as source | Primitive uses most-specific-wins scope detection (`notifications.ts:113-122`) and writes dest at same `target` (L149) | ✓ |
| **DEP-04** | 16-04 | Post-migration notification shown | `showSuppressibleNotification("featuresPathMigration", ...)` at `extension.ts:324-335` | ✓ |
| **DEP-05** | 16-05, 16-06 | Internal code reads only `featuresPaths[]` | `settings.ts:186` ladder + `common.ts:207/252` D-16 plural-only branch | ✓ |
| **DEP-06** | 16-05, 16-06 | testWorkspaceConfig mock singular surface removed | Only plural field/getter in mock | ✓ |
| **DEP-07** | 16-02, 16-03, 16-06 | Unit tests cover migration edge cases | 696 passing — Phase 15 sub-cases (D-MOD regression bar) + Phase 16 wrapper cases (a)-(j) + 4 activation-structural tests = 34 migration tests | ✓ |

No orphaned requirements detected — every DEP-* ID is traceable to a Phase 16 plan and to live code.

---

## Decisions Honored

| Decision | Description | Plan(s) | Honored |
|----------|-------------|---------|---------|
| **D-01** | Helper signature `Promise<boolean>` | 16-03 | ✓ |
| **D-02** | Both source namespaces (`gs-behave-bdd`, `behave-vsc`) → canonical `gs-behave-bdd.featuresPaths` | 16-03 | ✓ — `FEATURES_PATH_NAMESPACES` constant + hardcoded `destNamespace: "gs-behave-bdd"` |
| **D-03** | Same-scope writes | 16-03 | ✓ — case (a) test |
| **D-04** | Cross-scope independence | 16-03 | ✓ — case (f) test |
| **D-05** | Migration never throws | 16-03 | ✓ — case (j) test |
| **D-06** | Merge with dedup | 16-03 | ✓ — case (e1) test |
| **D-07** | Post-normalization comparison (Pitfall 9) | 16-03 | ✓ — case (e2) test; regex byte-identical to `settings.ts:204` |
| **D-08** | Skip empty/whitespace; remove source | 16-03 | ✓ — cases (g1)(g2) tests |
| **D-09** | Literal `.` migrates as-is | 16-03 | ✓ — case (h) test |
| **D-12** | "Open Settings" + publisher literal `@ext:gabeseltzer.gs-behave-bdd` | 16-04 | ✓ — `extension.ts` |
| **D-13** | Suppression key `featuresPathMigration` | 16-04 | ✓ |
| **D-15** | `settings.ts` ladder collapsed to plural-only | 16-05 | ✓ |
| **D-16** | `common.ts` Branch A simplified to plural-only | 16-05 | ✓ |
| **D-17** | `testWorkspaceConfig.ts` singular surface removed | 16-06 | ✓ |
| **D-18** | Activation order: featuresPath data-shape migration BEFORE suppressMultiConfig UX migration BEFORE `reloadSettings` | 16-04 | ✓ — `extension.ts:307-310` (308 < 309) |
| **D-MOD** | Generic `migrateScopedSetting` primitive | 16-02 | ✓ — Phase 15 wrapper delegates; 8/8 sub-cases preserved |

---

## Files Changed

### Created (1 phase artifact)

- `.planning/phases/16-deprecate-featurespath/16-VERIFICATION.md` — phase verification report (`status: passed`, `score: 6/6`).

### Modified (production code, 4)

- `package.json` — `gs-behave-bdd.featuresPath` schema block deleted (Plan 05); `gs-behave-bdd.featuresPaths` markdownDescription cleaned of obsolete "When both ... are set" sentence.
- `src/notifications.ts` — Added `migrateScopedSetting<TSrc, TDest>` primitive + `TransformResult<T>` discriminated union (Plan 02); refactored `migrateLegacySuppressMultiConfig` to delegate (Plan 02); added `FEATURES_PATH_NAMESPACES` constant, `normalizePathEntry` helper, and `migrateLegacyFeaturesPath` wrapper (Plan 03).
- `src/settings.ts` — Removed `featuresPath` strict-undefined throw, "Both featuresPath and featuresPaths are set" info-log branch, and Rung 2 (singular-explicit-set) of the precedence ladder (Plan 05).
- `src/common.ts` — Simplified `hasFeaturesFolder()` Branch A to plural-only gate; removed `featuresPath` variable read and singular-driven discovery tail (~30 lines deleted, 6 lines added) (Plan 05).
- `src/extension.ts` — Activation loop wires `migrateLegacyFeaturesPath` first, `migrateLegacySuppressMultiConfig` second, `config.reloadSettings` third (sync void); added post-loop notification block with `featuresPathMigration` key + `@ext:gabeseltzer.gs-behave-bdd` publisher literal; comments at L936/L1002 updated singular → plural (Plan 04).

### Modified (test code, 9)

- `src/testWorkspaceConfig.ts` — Singular field, ctor entry/type/body, get/inspect/getExpected switch cases removed; helper renamed `getExpectedFeaturesPath` → `getExpectedFeaturesFolder` (Plan 06).
- `test/unit/notifications.test.ts` — `makePerKeyScopedConfig` re-exported (Plan 01); 7 primitive tests added (Plan 02); 12 wrapper tests added (Plan 03); 4 activation-structural tests added (Plan 04).
- `test/unit/settings/multiPathPrecedence.test.ts` — 5 obsolete tests deleted; rewrites to convention semantics; BASE_CFG cleaned (Plan 06).
- `test/unit/settings/discoveryPriority.test.ts` — 2 featuresPath Branch A tests deleted; rewrites retargeted to `'projectPath'` (Plan 06).
- `test/unit/settings/discoverySource.test.ts` — All `hasExplicitSetting` tests retargeted from `'featuresPath'` to `'projectPath'` (Plan 06).
- `test/unit/settings/legacyFallback.test.ts` — 4 featuresPath tests deleted (Plan 06).
- `test/unit/settings/projectUriDerivation.test.ts` — BASE_CFG `featuresPath: 'features'` removed (Plan 06).
- `test/integration/suite-shared/shared.workspace.tests.ts` — 1 site drops `featuresPath: undefined`; 3 sites use `featuresPaths: [wkspRelativeFeaturesPath]` (Plan 06).
- `test/integration/debug suite/extension.test.ts` — 1 site drops `featuresPath: undefined` (Plan 06).

---

## Phase Metrics

| Metric | Value |
|--------|-------|
| Plans planned | 6 |
| Plans completed | 6 |
| Total implementation commits | 13 |
| Files created | 0 production / 1 verification artifact |
| Production files modified | 5 (`package.json`, `src/notifications.ts`, `src/settings.ts`, `src/common.ts`, `src/extension.ts`) |
| Test files modified | 9 |
| Unit test pass count | 683 (pre-Phase-16 baseline) → 696 (end-of-Phase-16) |
| Net unit test delta | +13 (+11 new, ~+13 net after Plan 06's deletions/rewrites) |
| Migration test sub-suite | 34 passing |
| Phase duration (active execution) | ~47 min across 6 plans |
| Lint regressions | 0 |
| Webpack compile errors | 0 |
| Test failures | 0 |

---

## Manual / Deferred Verifications

(From `16-VERIFICATION.md` "Human Verification Required" — none blocking; Phase 17 closed all of these.)

| Item | Source | Closed By |
|------|--------|-----------|
| End-to-end activation smoke (stale `featuresPath` in `.vscode/settings.json` → migrated, notification fires, "Open Settings" works, DSA writes suppression) | 16-VERIFICATION optional manual | Phase 17 migrations integration suite (7 tests, real VSCode) — see `17-VERIFICATION.md` |
| `npm run test:integration` smoke run | 16-06 deferred | Phase 17 |
| Real-VSCode `inspect()` A1 contract | 16-06 deferred | Phase 17 Test 7 |

---

## Key-Links Verified

(From `16-VERIFICATION.md` Key Link Verification table.)

- **`extension.ts` activation loop → `migrateLegacyFeaturesPath`:** Direct call at L308; boolean result feeds `pendingFeaturesPathNotifs`; gates post-loop notification at L322-L335. ✓
- **`migrateLegacyFeaturesPath` → `migrateScopedSetting` primitive:** Inner loop over `FEATURES_PATH_NAMESPACES` calls primitive at L235. ✓
- **`migrateLegacySuppressMultiConfig` → `migrateScopedSetting` primitive:** Refactored to delegate at L175; public `Promise<void>` preserved. ✓
- **Successful migration → user notification:** `pendingFeaturesPathNotifs` queue → `showSuppressibleNotification("featuresPathMigration", ...)` fires per migrated workspace at L324; "Open Settings" invokes `workbench.action.openSettings` with publisher-correct query. ✓
- **Migration ordering → `reloadSettings` cache refresh:** Called once after both migrations at L310 (sync void per Pitfall 8 — not awaited; ensures notification suppression check reads fresh cache). ✓

---

## Next Steps

1. **Phase 17 (cross-cutting verification)** consumed Phase 16's outputs end-to-end via the new `migrations` integration suite — see `17-SUMMARY.md` for cross-phase evidence (commits `27e5af3` registration, `c08ced5` cache fix, 15-HUMAN-UAT closed).
2. **Milestone v1.4.0 audit** confirmed all 7 DEP requirements satisfied — see `.planning/v1.4.0-MILESTONE-AUDIT.md`.
3. **Carry-forward tech debt:** the `activeProjectCache` invalidation pattern observed during Phase 17's regression bisect (commit `c08ced5`) is recorded in `.planning/STATE.md` v1.4.0 carry-forward section. Not a Phase 16 issue, but worth a future redesign pass.

---

*Phase: 16-deprecate-featurespath*
*Milestone: v1.4.0*
*Verified: 2026-04-29*
