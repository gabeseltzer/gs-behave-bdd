# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.1 — Config File Watching

**Shipped:** 2026-04-17
**Phases:** 3 (Phases 4, 5, 6) | **Plans:** 9 | **Requirements:** 13/13

### What Was Built

- Per-workspace FileSystemWatcher covering all 5 behave config formats with 500ms debounce, wired through `configurationChangedHandler` so test-tree rebuilds happen automatically on config edits (Phase 4)
- Non-blocking `checkRunGuard` that intercepts both regular runs and debug sessions when the discovery cache reports `configError` — "Run Anyway / Open Config File / Cancel" (Phase 4)
- 14th integration suite: 3 watcher tests (delete/create/change) + 4 run-guard tests, built on top of a shared `waitForTestTree` polling primitive and a dedicated `watcher-integration/` fixture; locked in with a 3-run Windows flakiness gate (Phase 5)
- Code-review finding cleanup (WR-01, WR-02, IN-01, IN-02) + REQUIREMENTS.md traceability flip (12 Phase 4 rows + TEST-08) (Phase 6)

### What Worked

- **Audit-driven Phase 5 + Phase 6.** The v1.1 milestone audit found `gaps_found` (TEST-08 unsatisfied + 4 tech-debt items). Spawning a dedicated integration-verification phase and a tech-debt cleanup phase made those gaps first-class work instead of acceptance-with-debt. Phases 4/5/6 closed same-week with zero carried debt.
- **Dedicated fixture per suite that mutates fs state.** Adding `watcher-integration/` alongside `features-alt/` meant other suites could keep running in parallel without cross-pollution — exactly the pattern D-05 predicted.
- **`waitForTestTree` predicate polling.** Replacing wall-clock sleeps with state-based polling cut both flakiness and runtime on Windows, where FileSystemWatcher delete events can trail the syscall by 1-5s.
- **Single choke-point callback.** Routing the watcher callback through `configurationChangedHandler(undefined, undefined, true)` (not a new handler) preserved the integration-test guard, log clearing, watcher rebuild, and notification-dedup clear in one place. Zero state-management branches.
- **Phase 4 wiring via integration checker before UAT.** The 100% wired result from the cross-phase integration check let us confidently skip the 5 human UAT items once Phase 5 automated them.

### What Was Inefficient

- **Audit was run against work-in-progress.** The v1.1 audit fired before Phases 5 and 6 existed as plans, so `gaps_found` status stuck around until the milestone-close ran. In future, the audit is most useful after planning phases exist but before they execute — not as a pre-flight for a close.
- **Three SUMMARY.md files (04-02, 06-01, 06-02) lacked the `one_liner` frontmatter field** that `gsd-tools summary-extract` reads. That is why `milestone complete` reported "2 phases, 7 plans" instead of the actual 3/9 — the tool counts plans via the presence of that field. Cheap to fix: add `one_liner:` to the YAML frontmatter convention.
- **STATE.md drift through the milestone.** Multiple mid-milestone edits to plans/tasks counts meant STATE.md and the tool's view diverged at the close. Either use `gsd-tools` as the single writer, or clear the stats at milestone close rather than trying to keep them current mid-flight.
- **`audit-open` CLI is broken** (`ReferenceError: output is not defined` at bin/gsd-tools.cjs:786). The pre-close artifact audit step was skipped. File this upstream.

### Patterns Established

- **Tech-debt cleanup as its own phase at milestone close.** When the audit surfaces code-review findings, making them an explicit phase (like Phase 6) means milestone-complete ships with zero debt instead of "known debt deferred."
- **Dedicated `example-projects/` fixture per fs-mutating suite.** Any suite that writes to a `behave.ini` (or any fixture file) gets its own fixture root. Snapshot + restore in `suiteSetup`/`suiteTeardown`, never per-test.
- **Discovery cache is the single source of truth for runtime guards.** Read `getDiscoveryEntry()` — never the `WorkspaceSettings` snapshot — when a guard needs to know whether a workspace is healthy.
- **Non-blocking guards over hard-blocking dialogs.** The user must always be able to proceed ("Run Anyway"); the guard's job is awareness, not prohibition.

### Key Lessons

1. **When a watcher callback exists, make the main handler absorb its work.** Don't build a parallel "config-watcher path." `configurationChangedHandler(undefined, undefined, true)` carries every side effect the real path carries — reuse it.
2. **Brace-glob for FileSystemWatcher, not bare filenames.** VS Code bug #164925 means `behave.ini` silently fails but `{behave.ini,.behaverc,…}` works. Document inline next to the glob.
3. **500ms debounce is mandatory for config watchers, not a polish.** `onDidChange` fires before the file is fully written on Windows (#72831). Without the debounce, parse errors show up on every save.
4. **Predicate polling beats wall-clock sleeps at the integration-test layer.** One `waitForTestTree` primitive replaced half a dozen ad-hoc `setTimeout`s and eliminated the Windows delete-event flakiness in one step.
5. **Audit timing matters.** Run the milestone audit *after* all phases are planned (so every requirement has a phase) but *before* execution starts; running it mid-execution produces stale `gaps_found` that looks blocking at close.

### Cost Observations

- Model mix: majority opus (planning, verification, milestone orchestration); sonnet for plan execution; minimal haiku
- Sessions: ~5 (spread across 2026-04-16 and 2026-04-17)
- Notable: Phases 5 and 6 both landed on the same day as audit remediation. The audit → plan-gap → execute-gap → close loop ran end-to-end in under a working day.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 3 | 6 | Initial MVP — config parsing, discovery cache, UX |
| v1.1 | 3 | 9 | Introduced milestone audit + dedicated tech-debt phase at close; added predicate-polling test primitive |

### Cumulative Quality

| Milestone | Unit Tests | Integration Suites | Requirements Shipped | Deferred Debt |
|-----------|-----------|--------------------|--------------------:|---------------|
| v1.0 | ~430 | 13 | 21 | 0 |
| v1.1 | 539 | 14 | 13 | 0 |

### Top Lessons (Verified Across Milestones)

1. **Cache-first architecture keeps runtime cheap.** Both v1.0 (discovery cache) and v1.1 (run guard reads the same cache) validated that a module-level Map read in the hot path is the right shape for sub-ms gatekeepers.
2. **Integration tests earn their cost when they cover multi-module flows.** v1.0's config-only/pyproject-config/malformed-config suites and v1.1's watcher-integration suite both caught wiring bugs that unit tests by construction cannot see.
3. **Non-blocking UX over blocking dialogs.** Ship warnings, not gates — validated in both milestones (malformed-config notification in v1.0, run guard in v1.1).
