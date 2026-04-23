# Phase 12: Project List Discovery & Persistence - Discussion Log

**Date:** 2026-04-23
**Participants:** User + Agent
**Purpose:** Audit trail of discuss-phase Q&A (human reference only — not consumed by downstream agents)

---

## Area Selection

**Question:** Which areas do you want to discuss for Project List Discovery & Persistence?
**Options:** Active project fallback, Notification evolution, Project list ordering, Root-level config status
**Selected:** All four areas

---

## Area 1: Active Project Fallback

### Q1: When the active project's config is deleted, what should happen?
- Options: Auto-select next project / Show empty tree + prompt / You decide
- **Answer:** (freeform) "Auto-select the next project and notify the user"

### Q2: How should the user be notified that the active project changed due to config deletion?
- Options: Output channel only / Notification + output channel / You decide
- **Answer:** Notification + output channel

### Q3: What happens when the last project's config is deleted (no other projects)?
- Options: Clear tree + log (current behavior) / Clear tree + suggest fix
- **Answer:** Clear tree + log (current behavior)

### Q4: When the active project's config becomes malformed, should the project list auto-switch away?
- Options: Keep in list, run guard handles it / Switch away from malformed config / You decide
- **Answer:** Keep in list, run guard handles it

### Continuation: More questions or next area?
- **Answer:** Next area

---

## Area 2: Notification Evolution

### Q1: When should the multi-config notification be updated?
- Options: Update notification in Phase 12 / Leave for Phase 13 / Remove notification in Phase 12
- **Answer:** Leave for Phase 13

### Q2: How should the deletion-fallback notification look?
- Options: Brief + Show Details button / Detailed inline / You decide
- **Answer:** Brief + Show Details button

### Continuation: More questions or next area?
- **Answer:** Next area

---

## Area 3: Project List Ordering

### Q1: How should projects be ordered in the list?
- Options: Scanner order (depth + priority) / Alphabetical by path / Active first, then scanner order
- **Answer:** Active first, then scanner order

### Q2: Confirm: auto-selection picks the scanner's primary result (shallowest depth)?
- Options: Scanner primary = auto-select / First alphabetical
- **Answer:** Scanner primary = auto-select

### Q3: When a new config is created on disk, should the active project change?
- Options: Add silently, don't switch / Add + offer to switch
- **Answer:** Add silently, don't switch

### Continuation: More questions or next area?
- **Answer:** Next area

---

## Area 4: Root-Level Config Status

### Q1: Should the root-level config have special status in the project list?
- Options: Equal entry (depth 0) / Primary with badge / You decide
- **Answer:** Equal entry (depth 0)

### Q2: Can users switch between root and subdirectory projects?
- Options: Both switchable / Root wins, subdirs disabled
- **Answer:** Both switchable

### Q3: Should the project list populate incrementally (root first, subdirs later)?
- Options: Incremental population / Full scan first
- **Answer:** Full scan first

### Q4: Considering the performance constraint, reconsider the approach?
- Options: Immediate root + deferred switch / Full scan wait (accept delay)
- **Answer:** (freeform) "full scan wait (accept delay) and let's add a loading throbber or something to tell the user it is loading"

### Q5: What kind of loading indicator during the scan?
- Options: Test Controller resolving state / Output channel only / You decide
- **Answer:** Test Controller resolving state

### Continuation: Create context?
- **Answer:** I'm ready for context

---

*Discussion log complete — 12 decisions captured across 4 areas*
