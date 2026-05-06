# Phase 6: v1.1 Tech Debt & Admin Cleanup - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Close code review findings (WR-01, WR-02, IN-01, IN-02) from Phase 4 and planning hygiene issues identified by the v1.1 milestone audit, so v1.1 ships clean. No new features, no new requirements — purely fixing existing code and updating planning docs to match reality.

</domain>

<decisions>
## Implementation Decisions

### Code Fixes — testRunHandler.ts
- **D-01:** WR-02 — Replace all loose `==` with `===` at lines 218, 392, and 393. Strict equality per codebase convention.
- **D-02:** IN-01 — Remove stray `}` character from template literal at line 464 (in the `throw` string for `getChildScenariosForParentFeature`).

### Code Fixes — configWatcher.ts
- **D-03:** IN-02 — Switch `configDebounceTimers` Map key from `wkspUri.path` to `uriId(wkspUri)`. This aligns with `discoveryCache` and all other URI-keyed Maps in the codebase, eliminating drive-letter-casing mismatch risk on Windows. Import `uriId` from `common.ts`.

### Admin — Planning Docs
- **D-04:** Add `requirements_completed: [GUARD-01, GUARD-02, GUARD-03, GUARD-04, TEST-09]` to YAML frontmatter in `.planning/phases/04-watcher-run-guard/04-02-SUMMARY.md`.
- **D-05:** Flip REQUIREMENTS.md traceability table checkboxes to `[x]` / Complete for all 12 satisfied v1.1 requirements (WATCH-01 through WATCH-06, GUARD-01 through GUARD-04, TEST-07, TEST-09). Only TEST-08 remains `[ ]` / Pending.

### Agent's Discretion
- **WR-01:** The unreachable `completed` diagLog at testRunHandler.ts:85 — agent decides whether to move it into the `finally` block (before `run.end()`) or remove it entirely, based on what makes the most diagnostic sense.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Audit Source (defines all items)
- `.planning/v1.1-MILESTONE-AUDIT.md` — Tech debt section enumerates WR-01, WR-02, IN-01, IN-02; planning hygiene section specifies SUMMARY.md and REQUIREMENTS.md fixes

### Code Review (original findings)
- `.planning/phases/04-watcher-run-guard/04-REVIEW.md` — Original code review that identified WR-01, WR-02, IN-01, IN-02

### Target Source Files
- `src/runners/testRunHandler.ts` — WR-01 (line 85), WR-02 (lines 218, 392-393), IN-01 (line 464)
- `src/watchers/configWatcher.ts` — IN-02 (line 38, `configDebounceTimers` key)
- `src/common.ts` — `uriId()` function to import for IN-02 fix

### Target Planning Files
- `.planning/phases/04-watcher-run-guard/04-02-SUMMARY.md` — Missing `requirements_completed` frontmatter
- `.planning/REQUIREMENTS.md` — Traceability table checkbox updates

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `uriId()` in `src/common.ts`: Already used by `discoveryCache`, `getDiscoveryEntry()`, and all URI-keyed Maps. Direct import for IN-02 fix.

### Established Patterns
- Strict equality: Codebase uses `===` consistently (WR-02 instances are exceptions, not the norm)
- URI normalization: All Map keys derived from workspace URIs use `uriId()` (discoveryCache, wkspWatchers references)
- diagLog: Used throughout for xRay diagnostic tracing; always fires in try/catch/finally contexts for lifecycle events

### Integration Points
- `configWatcher.ts` imports from `common.ts` — adding `uriId` to the existing import is trivial
- `testRunHandler.ts` changes are all local edits — no cross-module impact
- Unit tests in `test/unit/watchers/configWatcher.test.ts` and `test/unit/runners/testRunHandler.test.ts` must still pass after fixes

</code_context>

<specifics>
## Specific Ideas

No specific requirements — all items are enumerated by the milestone audit. Standard code fixes and doc updates.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 06-tech-debt-admin-cleanup*
*Context gathered: 2026-04-17*
