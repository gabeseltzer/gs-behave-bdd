# Phase 22: Discussion Log

**Gathered:** 2026-05-11
**Mode:** discuss (default)

## Areas Discussed

User selected all four offered gray areas:
1. CLEANUP-01 removal scope
2. TEST-07 fixture coverage depth
3. CLEANUP-01 vs TEST-07 ordering
4. DOC-01 / DOC-02 placement & tone

## Q&A

### Q1 — CLEANUP-01 reach into settings.ts ladder
**Options:**
- Full cleanup (Recommended)
- Surgical (literal req — 3 sites only)
- Phased (3 sites now, ladder later)

**User selected:** Full cleanup.

**Decision recorded:** D-C1 — delete `getWithLegacyFallback`, drop `legacyConfig?` from constructors, simplify lambdas. Matches Phase 19 CLEANUP-02 precedent.

### Q2 — TEST-07 coverage depth
**Options:**
- Golden path only (Recommended)
- Per-case smoke (case 1/2/3)
- Action matrix (case 2 × 3 + case 3 × 4)

**User selected:** Per-case smoke.

**Decision recorded:** D-C2 — three integration scenarios exercising case 1 silent, case 2 `Migrate & delete`, case 3 `Overwrite & delete`. Unit tests cover the action × mode matrix; integration only proves the VS Code seam.

### Q3 — CLEANUP-01 vs TEST-07 ordering
**Options:**
- CLEANUP-01 first, then TEST-07 (Recommended)
- TEST-07 first, then CLEANUP-01
- Parallel (independent plans, Wave 1)

**User selected:** CLEANUP-01 first.

**Decision recorded:** D-C3 — Wave 1: cleanup. Wave 2: integration test + docs (parallelizable). Test asserts post-cleanup state directly. The consent flow runs off the Phase 20 registry, not the silent-fallback ladder, so TEST-07 has no dependency on the pre-cleanup state.

### Q4 — DOC-01 / DOC-02 placement
**Options:**
- New top-level section + concise pkg.json (Recommended)
- Dedicated MIGRATION.md + pkg.json links
- Callout block in existing 'New in this fork' list

**User selected:** Callout block in 'New in this fork' list.

**Decision recorded:** D-C4 — README adds bullet #14 in the existing "New in this fork" list with a sub-section underneath for migrationMode/completedMigrations/Recheck command. Package.json descriptions are 1-2 sentences each, self-contained, no README links. Lower discoverability than a top-level section, accepted for minimal README churn.

## Scope Creep Redirects

None — discussion stayed inside the four CLEANUP-01 / TEST-07 / DOC-01 / DOC-02 boundaries.

## Deferred Ideas

- v1.4.0 wrapper-shim removal in `src/notifications.ts:257,275` — eligible for a future cleanup phase.
- Post-v1.5.0 telemetry on `skip` vs `migrate-*` choice distribution — would inform deprecation timing.
