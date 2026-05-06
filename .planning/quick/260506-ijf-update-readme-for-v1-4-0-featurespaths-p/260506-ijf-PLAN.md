---
quick_id: 260506-ijf
description: Update README to reflect v1.4.0 — featuresPaths plural + notification suppression
created: 2026-05-06
mode: quick
---

# Plan — README update for the auto-detect-behave-directory merge (v1.4.0)

## Context

The 51b1f1d merge brought milestones 1.0.0 → v1.4.0 onto `gabe-dev`. README "New in this fork" items 10–12 already cover auto-discovery, monorepo, and project switching. Two v1.4.0-shipped items are not yet reflected:

- `featuresPath` (singular) was hard-removed from the package.json schema and replaced by `featuresPaths: string[]` (plural). Activation auto-migrates the legacy key. README still references `featuresPath` in 8 places (line numbers from current HEAD: 27, 36, 102, 104, 113, 117, 131, 139, 159, 219).
- `suppressedNotifications: string[]` setting + reusable suppression module (with "Don't Show Again" UX) is undocumented.

`discoveryDepth` and `discoveryStopOnFirstHit` are mentioned briefly on line 147 but not formally introduced — the existing copy is good enough; no change needed there.

## Goal

README accurately reflects v1.4.0 user-facing surface. No legacy `featuresPath` references remain except in a single explicit migration note. Notification suppression is discoverable.

## Task 1 — Replace `featuresPath` references with `featuresPaths`

**File:** `README.md`

**Edits (line numbers per current HEAD):**

1. **Line 27** (feature item #10) — `No featuresPath or projectPath settings needed` → `No featuresPaths or projectPath settings needed`.
2. **Line 36** (Old features list) — `runParallel`, `featuresPath`, `envVarOverrides` → `runParallel`, `featuresPaths`, `envVarOverrides`.
3. **Line 102** (Note) — `Use projectPath and featuresPath only as manual overrides` → `Use projectPath and featuresPaths only as manual overrides`.
4. **Line 104** (paragraph) — `update the featuresPath setting in extension settings` → `set the featuresPaths setting in extension settings`. The setting is plural and is now an array.
5. **Lines 106–115** (first example block) — change `behave.ini` snippet to keep current; update `settings.json` snippet:
   - `"gs-behave-bdd.featuresPath": "my_tests/behave_features"` → `"gs-behave-bdd.featuresPaths": ["my_tests/behave_features"]`
6. **Line 117** (paragraph) — `featuresPath is then relative to this project path` → `featuresPaths is then relative to this project path`.
7. **Lines 119–133** (second example block) — `"gs-behave-bdd.featuresPath": "features"` → `"gs-behave-bdd.featuresPaths": ["features"]`.
8. **Line 139** (Auto-Discovery section) — `no manual featuresPath or projectPath settings needed` → `no manual featuresPaths or projectPath settings needed`.
9. **Line 159** (Extension settings) — `runParallel`, `featuresPath`, and `envVarOverrides` → `runParallel`, `featuresPaths`, and `envVarOverrides`.
10. **Line 219** (Troubleshooting) — `If you have set the featuresPath in extension settings` → `If you have set the featuresPaths in extension settings`.

**Verify:**
- `grep -n "featuresPath[^s]" README.md` returns 0 matches (only `featuresPaths` should remain).

**Done when:** No bare `featuresPath` strings remain except inside the explicit migration callout (Task 3).

## Task 2 — Add feature item #13 for notification suppression

**File:** `README.md`

**Action:** After line 29 (existing item #12 about project switching), add:

```markdown
13. **Per-notification suppression.** Click "Don't Show Again" on any suppressible notification and it stays dismissed for that workspace folder. Backed by the `gs-behave-bdd.suppressedNotifications` array setting — visible in Settings UI, editable by hand, and scoped per workspace folder.
```

**Verify:** New bullet renders under "New in this fork".

**Done when:** Item #13 present.

## Task 3 — Add migration note

**File:** `README.md`

**Action:** Right after the "Note: In most cases you don't need these settings…" callout (current line 102), add a single short paragraph:

```markdown
> **Migrating from `featuresPath`:** The previous `featuresPath` (singular) setting was removed in v1.4.0 and replaced by `featuresPaths` (plural array). If you had `featuresPath` set, the extension migrates it automatically on activation — no action required. Multi-path support means you can now point the extension at multiple test directories from a single workspace folder.
```

**Verify:** Migration note appears once, in the workspace-requirements section, near the existing "Note" callout.

**Done when:** Note present and reads clearly.

## Task 4 — Confirm clean

**Action:**
```bash
grep -nE "featuresPath[^s]" README.md   # should match only inside the migration note (Task 3 wraps `featuresPath` in backticks)
grep -nE "featuresPaths" README.md       # should match in the new locations from Task 1 + the migration note
grep -n "suppressedNotifications" README.md  # should match the new feature bullet (Task 2)
```

**Done when:** All three greps return the expected matches and nothing else.

## Out of scope

- No code changes. README/docs only.
- No `discoveryDepth` / `discoveryStopOnFirstHit` formal section — existing brief mention on line 147 is adequate.
- No restructure of "New in this fork" — keep numbering and order intact.
- No screenshots / GIFs / images.
- No CHANGELOG.md (the project tracks milestones in `.planning/MILESTONES.md`, not CHANGELOG).

## must_haves

- truths:
  - All bare `featuresPath` references replaced with `featuresPaths` except in the explicit migration callout (where the legacy name is back-ticked for documentation purposes).
  - Item #13 about notification suppression present in "New in this fork".
  - Migration note about `featuresPath` → `featuresPaths` present once, near the existing "Note" callout.
  - All `settings.json` examples use array syntax (`["..."]`) for `featuresPaths`.
- artifacts:
  - `README.md` (edited)
- key_links:
  - `package.json` schema for `gs-behave-bdd.featuresPaths` (verified — `type: array, items.type: string`).
  - `package.json` schema for `gs-behave-bdd.suppressedNotifications` (verified — `type: array, items.type: string`).
