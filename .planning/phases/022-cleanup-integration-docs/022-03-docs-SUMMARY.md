---
phase: 022-cleanup-integration-docs
plan: "03"
subsystem: documentation
tags: [docs, migration, consent-ux, readme, package-json]
dependency_graph:
  requires: ["022-01"]
  provides: ["DOC-01", "DOC-02"]
  affects: []
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified:
    - README.md
    - package.json
decisions:
  - "completedMigrations description uses 'Array of migration IDs' (lowercase 'migration') to satisfy CONSENT-08 test pin without verbatim match"
  - "Prose refined from plan suggestions to match existing fork-list tone while hitting all required tokens"
metrics:
  duration: "162 seconds"
  completed: "2026-05-11"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase 022 Plan 03: Documentation — Migration from behave-vsc Summary

**One-liner:** Added README bullet #14 and sub-section documenting the v1.5.0 consent-flow UX, plus condensed Settings UI descriptions for `migrationMode` and `completedMigrations`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | README — add bullet #14 + Migration sub-section | 8589e65 | README.md |
| 2 | package.json — tighten markdownDescriptions | 69e9fd5 | package.json |

## Deliverables

### DOC-01 — README.md

Bullet #14 added at line 31 under "New in this fork":

> **Migration from `behave-vsc`.** This fork now reads settings only from its own `gs-behave-bdd.*` namespace...

The sub-section underneath covers:

- **v1.5.0 blockquote callout** — silent fallback reads removed, legacy values stay in `settings.json` but are no longer read at runtime
- **Three scan outcomes** — case 1 (neither set, silent), case 2 (legacy only, controlled by `migrationMode`), case 3 (both set, always prompts)
- **`migrationMode`** — all four values with a `settings.json` code-block example
- **`completedMigrations`** — per-scope semantics explained, extension manages automatically
- **`Behave BDD: Recheck Migrations`** — command palette invocation, use cases (post-skip, new workspace)

### DOC-02 — package.json

| Setting | Character count | Content |
|---------|----------------|---------|
| `gs-behave-bdd.migrationMode` | 348 | All four enum values, case-3 always-prompt callout, Recheck Migrations reference |
| `gs-behave-bdd.completedMigrations` | 197 | "migration" token (lowercase, satisfies CONSENT-08), "scope" token, Recheck Migrations reference |

Neither description contains markdown links (`](` not present in either string).

## Phase 19 Schema Test Compatibility

`test/unit/packageJsonSchema.test.ts` pins these assertions on `completedMigrations`:

- `includes('migration')` — satisfied: description now begins "Array of **migration** IDs..."
- `includes('Recheck Migrations')` — satisfied

No test pins the verbatim old description; all 836 unit tests pass after changes.

## Prose Decisions Beyond Suggested Copy

1. **`completedMigrations` opening** changed from "Migration IDs..." (capital M, would fail `includes('migration')`) to "Array of migration IDs..." to pass the CONSENT-08 test pin without touching the test.
2. **`migrationMode` description** follows the plan's suggested copy exactly (348 chars, well under 400 limit).
3. **README sub-section** follows the plan's structural template with minor word-order refinements for natural reading. All required tokens and heading levels match the spec.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed completedMigrations description to include lowercase 'migration' token**
- **Found during:** Task 2 (unit test run after edit)
- **Issue:** Plan's suggested copy "Migration IDs marked Finished..." begins with capital M, causing `s.markdownDescription!.includes('migration')` assertion (CONSENT-08) to fail.
- **Fix:** Prefixed with "Array of" so "migration" appears lowercase: "Array of migration IDs marked Finished at this scope..."
- **Files modified:** package.json
- **Commit:** 69e9fd5 (same task commit — fix was made before committing)

## Self-Check: PASSED

- README.md: exists, contains "14." at line 31, "### Old from the original extension" preserved at line 62
- package.json: valid JSON, both descriptions pass all verify-script assertions
- Commits 8589e65 and 69e9fd5 present in git log
- 836 unit tests passing
