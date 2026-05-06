---
phase: 16-deprecate-featurespath
verified: 2026-04-29T00:00:00Z
status: passed
score: 6/6 must-haves verified
---

# Phase 16: Deprecate featuresPath — Verification Report

**Phase Goal:** Remove `featuresPath` from schema, auto-migrate to `featuresPaths[]` with user notification.
**Verified:** 2026-04-29
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | Singular `featuresPath` setting absent from package.json schema | ✓ VERIFIED | `grep featuresPath package.json` returns only `featuresPaths` (plural) at [package.json#L38](package.json#L38) |
| 2 | Production runtime code reads only `featuresPaths[]` (no singular reads) | ✓ VERIFIED | All `\bfeaturesPath\b` matches in src/ are either historical comments (settings.ts L186, common.ts L207/L252, extension.ts L297-L325) or the migration helper itself (notifications.ts L237) — no live `get<...>("featuresPath")` calls |
| 3 | `migrateLegacyFeaturesPath(wkspUri)` wrapper exists in src/notifications.ts | ✓ VERIFIED | [src/notifications.ts#L232](src/notifications.ts#L232) — covers both `gs-behave-bdd` and `behave-vsc` source namespaces, writes to canonical `gs-behave-bdd.featuresPaths` |
| 4 | Migration wired into per-workspace activation BEFORE multi-config migration (D-18) | ✓ VERIFIED | [src/extension.ts#L307-L310](src/extension.ts#L307-L310) — `migrateLegacyFeaturesPath` invoked first, then `migrateLegacySuppressMultiConfig`, then `config.reloadSettings` (sync, not awaited per Pitfall 8) |
| 5 | Generic `migrateScopedSetting<TSrc, TDest>` primitive exists and Phase 15 helper delegates to it | ✓ VERIFIED | Primitive at [src/notifications.ts#L98](src/notifications.ts#L98); `migrateLegacySuppressMultiConfig` calls it at [src/notifications.ts#L175](src/notifications.ts#L175); `migrateLegacyFeaturesPath` calls it at [src/notifications.ts#L235](src/notifications.ts#L235) |
| 6 | testWorkspaceConfig mock has no singular `featuresPath` surface; lint clean; full unit suite green (696) | ✓ VERIFIED | [src/testWorkspaceConfig.ts](src/testWorkspaceConfig.ts) only references `featuresPaths` (plural); `npx eslint src --ext ts` exits clean (no output); `npm run test:unit` reports `696 passing (12s)` |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| [package.json](package.json) | Schema omits singular `featuresPath` | ✓ VERIFIED | Only `gs-behave-bdd.featuresPaths` declared (L38) |
| [src/settings.ts](src/settings.ts) | No singular reads in `WorkspaceSettings` ladder | ✓ VERIFIED | Comment block at L186 documents removal; ladder reads only `featuresPaths` (L189) |
| [src/common.ts](src/common.ts) | No singular reads in discovery code | ✓ VERIFIED | Branch A is plural-only per D-16 comments at L207, L252 |
| [src/testWorkspaceConfig.ts](src/testWorkspaceConfig.ts) | No singular field/getter | ✓ VERIFIED | Only plural `featuresPaths: string[]` field (L16) and getter cases (L85, L140) |
| [src/notifications.ts](src/notifications.ts) | `migrateScopedSetting` + `migrateLegacyFeaturesPath` exported | ✓ VERIFIED | Both present (L98, L232); exports at L266 |
| [src/extension.ts](src/extension.ts) | Activation invokes featuresPath migration before multiConfig migration | ✓ VERIFIED | Loop at L307-L319 with explicit D-18 ordering comment |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `extension.ts` activation loop | `migrateLegacyFeaturesPath` | direct call at L308 | ✓ WIRED | Returns boolean; result pushed to `pendingFeaturesPathNotifs` and gates post-loop notification at L322-L335 |
| `migrateLegacyFeaturesPath` | `migrateScopedSetting` primitive | inner loop over `FEATURES_PATH_NAMESPACES` calls primitive (L235) | ✓ WIRED | Both source namespaces (`gs-behave-bdd`, `behave-vsc`) routed to canonical `gs-behave-bdd.featuresPaths` dest |
| `migrateLegacySuppressMultiConfig` | `migrateScopedSetting` primitive | refactored to delegate (L175) | ✓ WIRED | Public `Promise<void>` signature preserved; transform implements legacy boolean → array merge |
| Successful migration | User notification | `pendingFeaturesPathNotifs` → `showSuppressibleNotification("featuresPathMigration", ...)` | ✓ WIRED | Fired per migrated workspace (L324); "Open Settings" action invokes `workbench.action.openSettings` with publisher-correct query |
| Migration ordering | `reloadSettings` cache refresh | called once after both migrations (L310) | ✓ WIRED | Sync void per Pitfall 8 — not awaited; ensures notification suppression check reads fresh cache |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| DEP-01 | 16-05 | `featuresPath` removed from package.json schema | ✓ SATISFIED | Schema verified — only plural present |
| DEP-02 | 16-03, 16-04 | Auto-migrate explicit `featuresPath` value at any scope | ✓ SATISFIED | `migrateLegacyFeaturesPath` + activation wiring |
| DEP-03 | 16-03 | Migration writes to same scope as source | ✓ SATISFIED | Primitive uses most-specific-wins scope detection (notifications.ts L113-L122) and writes dest at same `target` (L149) |
| DEP-04 | 16-04 | Post-migration notification shown | ✓ SATISFIED | `showSuppressibleNotification("featuresPathMigration", ...)` at extension.ts L324-L335 |
| DEP-05 | 16-05, 16-06 | Internal code reads only `featuresPaths[]` | ✓ SATISFIED | settings.ts L186 ladder + common.ts L207/L252 D-16 plural-only branch |
| DEP-06 | 16-05, 16-06 | testWorkspaceConfig mock singular surface removed | ✓ SATISFIED | Only plural field/getter in mock |
| DEP-07 | 16-02, 16-03, 16-06 | Unit tests cover migration edge cases | ✓ SATISFIED | 696 passing — includes Phase 15 sub-cases (D-MOD regression bar) + Phase 16 wrapper cases (a)-(j) |

No orphaned requirements detected — every DEP-* ID is traceable to a Phase 16 plan and to live code.

### Anti-Patterns Found

None. Source-tree comments referencing the legacy `featuresPath` are intentional historical breadcrumbs (D-15, D-16, D-18) and the migration helper, not stub indicators.

### Human Verification Required

None blocking. Optional manual smoke (not required for goal achievement):

1. **End-to-end migration UX**
   - **Test:** In a fresh workspace, set `gs-behave-bdd.featuresPath: "features-alt"` in `.vscode/settings.json`, then reload window.
   - **Expected:** Setting is removed; `gs-behave-bdd.featuresPaths: ["features-alt"]` appears at workspaceFolder scope; notification "Migrated `featuresPath` → `featuresPaths`…" appears with "Open Settings" + "Don't Show Again" actions.
   - **Why human:** VS Code config persistence + notification UI are not asserted in unit tests.

### Gaps Summary

No gaps. All six must-haves verified, all seven DEP requirements satisfied, lint clean, 696 unit tests passing. The D-18 ordering invariant (featuresPath data-shape migration before suppressMultiConfig UX migration before reloadSettings) is enforced and commented in `src/extension.ts`. Phase 16 has achieved its goal.

---

_Verified: 2026-04-29_
_Verifier: the agent (gsd-verifier)_
