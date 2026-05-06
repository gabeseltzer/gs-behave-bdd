---
quick_id: 260506-ijf
description: Update README to reflect v1.4.0 — featuresPaths plural + notification suppression
status: complete
completed: 2026-05-06
---

# Summary — README update for v1.4.0 user-facing surface

## Outcome

README now matches the package.json schema shipped on the `auto-detect-behave-directory` merge:

- All bare `featuresPath` references replaced with `featuresPaths` (8 occurrences flipped across the "New in this fork" item, the Old features bullet, the Workspace requirements section's two `settings.json` examples, the Auto-Discovery section, the Extension settings section, and the Troubleshooting list).
- Single explicit "Migrating from `featuresPath`" callout added next to the existing "Note:" callout — the only place the legacy name still appears (intentionally, in backticks, for users searching for the old setting).
- Feature item #13 added under "New in this fork" introducing per-notification suppression and the `gs-behave-bdd.suppressedNotifications` array setting.
- Both `settings.json` examples now use array syntax (`["..."]`) for `featuresPaths`.

Verified via:

```
grep -nE "featuresPath[^s]" README.md
# → only matches inside the migration callout (line 105)

grep -n "suppressedNotifications" README.md
# → matches once on line 30 (feature #13)
```

## Files changed

- `README.md` — 6 Edit blocks: feature item #10 (and new #13), Old features bullet, the two callouts + first/second settings examples, Auto-Discovery section, Extension settings line, Troubleshooting line.

## Out of scope

- No code changes.
- No formal `discoveryDepth` / `discoveryStopOnFirstHit` section — existing brief mention left as-is.
- No screenshots / GIFs / images.
- No restructure of "New in this fork" — numbering and order preserved.
- No CHANGELOG.md (project tracks milestones in `.planning/MILESTONES.md`).

## Resolution provenance

`featuresPath` deprecation and `featuresPaths` plural shipped in milestone v1.4.0 (Phase 16 — see `.planning/milestones/v1.4.0-MILESTONE-AUDIT.md`). `suppressedNotifications` shipped in v1.4.0 Phase 15. Both verified live in `package.json` schema (`type: array, items.type: string`).
