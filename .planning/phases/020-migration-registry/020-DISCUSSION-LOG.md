# Phase 20: Migration Registry — Discussion Log

**Date:** 2026-05-08
**Phase:** 020-migration-registry

This log captures the discussion turns that produced `020-CONTEXT.md`. Audit trail; not consumed by downstream agents.

## Mode

- ADVISOR_MODE: true (USER-PROFILE.md present)
- Calibration tier: standard (vendor_philosophy = pragmatic-fast in CLAUDE.md global profile)
- Research subagents: **skipped** — gray areas were codebase-internal (registry organization, transform semantics for an internal refactor); external research would not have surfaced useful comparisons. User did not push back on the skip.

## Pre-loaded context

- `.planning/PROJECT.md` — v1.5.0 milestone goals
- `.planning/REQUIREMENTS.md` — MIGRATE-01/02/03, TEST-04
- `.planning/STATE.md` — Phase 19 verifier PASS; ready for Phase 20
- `.planning/ROADMAP.md` — Phase 20 boundary, depends on Phase 19
- `.planning/phases/019-migration-foundation/019-CONTEXT.md` — locked `MigrationEntry` shape (D-04), evaluator-vs-primitive boundary

## Codebase scout

- `src/notifications.ts:143` (primitive), `:261` (suppressMultiConfig), `:316` (featuresPath wrapper)
- `src/settings.ts:16-30` (`getWithLegacyFallback`) — authoritative source of D-A1 key list
- `src/configuration.ts:68-92`, `src/common.ts:214,222`, `src/discovery/projectList.ts:179`

## Gray areas presented

User selected **all four** for discussion:
1. Exhaustive `behave-vsc` key list
2. Object-shaped transform semantics
3. Registry organization & file layout
4. v1.4.0 migration refactor shape

## Turn-by-turn

### Area 1 — Exhaustive `behave-vsc` key list

**Options:**
- A: All 15 (exhaustive, future-proof) — Recommended
- B: 12, drop v1.5.0-only keys
- C: Decide at plan time per key

**User choice:** A — All 15. Locks D-A1.

### Area 2 — Object-shaped transform semantics

**Options:**
- A: Replace (opaque records) — Recommended (cleaner semantics for case 3)
- B: Deep-merge (preset-level + var-level)
- C: Shallow-merge (preset-level only)

**User choice:** B — Deep-merge. Locks D-A2.

**Claude note:** The deep-merge utility (`mergeRecord`) lands in Phase 20 but case-2 degenerates to a straight copy (canonical empty at scope), so the merge logic only actually fires in case 3 — Phase 21 territory. Phase 20 ships the utility; Phase 21 wires action choices to merge direction.

### Area 3 — Registry organization & file layout

**Options:**
- A: Single registry.ts (~400+ lines)
- B: Grouped by concern — Recommended
- C: One file per entry × 18

**User choice:** B — Grouped layout under `src/migrations/`. Locks D-A3.

### Area 4 — v1.4.0 migration refactor shape

**Options:**
- A: Two registry entries, shared transform export — Recommended
- B: One entry with `sourceNamespace: string | string[]`
- C: Keep wrapper, register façade

**User choice:** A — Two entries sharing exported transform. Locks D-A4.

## Deferred ideas

- Case 3 prompt actions → Phase 21
- Per-migration `migrationMode` → out-of-scope for v1.5.0
- Removing `behave-vsc.*` reads from configuration/common/projectList → Phase 22 (CLEANUP-01)
- Schema validation of migrated values → future hardening pass

## Final entry count

17 total entries:
- 15 `behave-vsc.<key>` → `gs-behave-bdd.<key>` cross-extension entries (D-A1.3 inventory)
- 1 `featuresPath-self` intra-namespace entry (singular→plural rename, lifted from v1.4.0)
- 1 `suppressMultiConfig-self` intra-namespace entry (boolean→array append, lifted from v1.4.0)
