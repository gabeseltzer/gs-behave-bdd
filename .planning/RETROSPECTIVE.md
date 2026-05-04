# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: 1.1.0 — Config File Watching

**Shipped:** 2026-04-17
**Phases:** 3 (Phases 4, 5, 6) | **Plans:** 9 | **Requirements:** 13/13

### What Was Built

- Per-workspace FileSystemWatcher covering all 5 behave config formats with 500ms debounce, wired through `configurationChangedHandler` so test-tree rebuilds happen automatically on config edits (Phase 4)
- Non-blocking `checkRunGuard` that intercepts both regular runs and debug sessions when the discovery cache reports `configError` — "Run Anyway / Open Config File / Cancel" (Phase 4)
- 14th integration suite: 3 watcher tests (delete/create/change) + 4 run-guard tests, built on top of a shared `waitForTestTree` polling primitive and a dedicated `watcher-integration/` fixture; locked in with a 3-run Windows flakiness gate (Phase 5)
- Code-review finding cleanup (WR-01, WR-02, IN-01, IN-02) + REQUIREMENTS.md traceability flip (12 Phase 4 rows + TEST-08) (Phase 6)

### What Worked

- **Audit-driven Phase 5 + Phase 6.** The 1.1.0 milestone audit found `gaps_found` (TEST-08 unsatisfied + 4 tech-debt items). Spawning a dedicated integration-verification phase and a tech-debt cleanup phase made those gaps first-class work instead of acceptance-with-debt. Phases 4/5/6 closed same-week with zero carried debt.
- **Dedicated fixture per suite that mutates fs state.** Adding `watcher-integration/` alongside `features-alt/` meant other suites could keep running in parallel without cross-pollution — exactly the pattern D-05 predicted.
- **`waitForTestTree` predicate polling.** Replacing wall-clock sleeps with state-based polling cut both flakiness and runtime on Windows, where FileSystemWatcher delete events can trail the syscall by 1-5s.
- **Single choke-point callback.** Routing the watcher callback through `configurationChangedHandler(undefined, undefined, true)` (not a new handler) preserved the integration-test guard, log clearing, watcher rebuild, and notification-dedup clear in one place. Zero state-management branches.
- **Phase 4 wiring via integration checker before UAT.** The 100% wired result from the cross-phase integration check let us confidently skip the 5 human UAT items once Phase 5 automated them.

### What Was Inefficient

- **Audit was run against work-in-progress.** The 1.1.0 audit fired before Phases 5 and 6 existed as plans, so `gaps_found` status stuck around until the milestone-close ran. In future, the audit is most useful after planning phases exist but before they execute — not as a pre-flight for a close.
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

## Milestone: 1.2.0 — Multi-Path & Monorepo-Aware Discovery

**Shipped:** 2026-04-22
**Phases:** 5 (Phases 7-11) | **Plans:** 13 | **Requirements:** 19/20 (INT-01 intentionally dropped)

### What Was Built

- Primary-plus-list multi-path types end-to-end: `featuresUris[]` / `resolvedPaths[]` with singular getters preserving 20+ call sites unchanged (Phase 7)
- 18-file consumer cascade: parser, test tree (path-group intermediate TestItems), watchers (fan-out per root), runner queue, fixture/step handlers, JUnit parser all iterate/union across `featuresUris[]` (Phase 8)
- `configParser` dedup + per-path diagnostics: overlapping paths collapsed, unresolvable paths flagged individually in Problems panel without aborting the valid paths (Phase 8)
- BFS subdirectory config scanner (`configScanner.ts`): exclude-dirs, symlink-cycle protection, circuit breaker, `discoveryDepth` setting (default 3, 0 = root-only) (Phase 9)
- First-match-wins multi-config UX: non-modal notification listing all found configs with "Open Settings" to set `projectPath` (Phase 9)
- Two-tier config watcher strategy: narrow watcher at discovered config + recursive `**/` fallback when no config found (Phase 9)
- `featuresPaths[]` settings.json key: plural wins over singular, empty array = unset, info log when both set (Phase 10)
- 3 integration fixtures (multi-path/, multi-path-settings/, monorepo-scan/) + 3 new integration suites + 3× Windows CI flakiness gate (Phase 11)

### What Worked

- **Primary-plus-list type strategy.** Adding `featuresUris: Uri[]` alongside `featuresUri` getter returning `[0]` meant 20+ existing call sites compiled without modification. Consumer migration happened incrementally across Phase 8 rather than in a single risky commit. Back-compat was never broken.
- **Phase 7 → Phase 8 dependency.** Splitting "make types plural" (Phase 7) from "make consumers iterate" (Phase 8) avoided a combinatorial explosion of changes. Phase 7 was pure plumbing — easy to verify, easy to revert. Phase 8 could focus on correctness of iteration logic.
- **INT-01 early drop.** Recognizing in Phase 8 discussion (D-08) that behave loads fixtures globally — not per-feature-path — saved a full phase of work that would have diverged from runtime semantics.
- **BFS scanner with circuit breaker.** `maxEntriesScanned` guard plus `DEFAULT_EXCLUDE_DIRS` kept monorepo scanning under 100ms even with seeded `node_modules/` directories. No perf regressions.
- **Two-tier watcher pattern.** Narrow watcher at discovered config directory handles edits/deletes; recursive fallback catches creation of new configs elsewhere. Covers both steady-state and initial-setup scenarios.

### What Was Inefficient

- **Phase 11 plan numbering collision.** Phase 11 plans were numbered `11-01`, `11-02`, `11-03` — same prefix as Phase 1's plans. This caused confusion in ROADMAP cross-references. Future milestones should use globally unique plan prefixes.
- **Phase 7 plans also collided (listed Phase 11 plans).** The ROADMAP had Phase 7's plan list duplicated from Phase 11 entries. A copy-paste error during roadmap creation — caught late.
- **Semver migration mid-milestone.** Converting from `v1.X` to semver `X.Y.0` format was the right call but introduced churn in planning docs mid-workflow. Better to align versioning at milestone start.

### Patterns Established

- **Primary-plus-list for plural type migration.** When expanding a singular field to an array, keep the singular as a getter returning `[0]`. Migrate consumers incrementally, never all-at-once.
- **Per-path diagnostics over all-or-nothing.** When a multi-value config has some valid and some invalid entries, flag the bad ones individually and proceed with the good ones. Never abort discovery entirely.
- **Two-tier watchers for scan-discovered paths.** Narrow watcher at the known path + recursive fallback for the unknown case. Avoids both missing events (narrow-only) and excessive events (recursive-only).
- **`discoveryDepth: 0` as the escape hatch.** Any scan-based feature should offer depth=0 to restore pre-scan behavior. Makes rollback trivial for users who hit edge cases.
- **First-match-wins + inform as the bridge to full multi-project.** When multiple configs exist but full multi-project isn't built yet, pick the first and tell the user about the others. Ships value immediately while deferring complexity.

### Key Lessons

1. **Behave loads fixtures globally, not per-feature-path.** Scoping fixtures to individual roots would diverge from behave's actual runtime model. When the extension models something the test runner doesn't do, the result is a bug, not a feature.
2. **Consumer cascade is the real work in multi-path.** The type change is trivial; making 18 files correctly iterate/union/scope is where the bugs live. Budget phases accordingly.
3. **Settings precedence chains get complex fast.** `featuresPaths[]` > `featuresPath` > config file `paths=` > convention, with `hasExplicitSetting` checking both singular and plural across 3 scope levels. Document the chain in code comments, not just planning docs.
4. **Integration test fixtures are worth the upfront cost.** `multi-path/`, `multi-path-settings/`, and `monorepo-scan/` caught wiring bugs in Phase 11 that no unit test could have surfaced.
5. **Drop requirements early when assumptions are wrong.** INT-01 was based on an incorrect mental model of behave's fixture loading. Dropping it during Phase 8 discussion saved a full phase of wasted work.

### Cost Observations

- 67 commits, 130 files changed, +15,786/-1,011 lines over 5 days (2026-04-17 → 2026-04-22)
- 5 phases with 13 plans — the largest milestone to date
- Scanner + two-tier watcher (Phase 9) was the most complex single phase

---


## Milestone: 1.3.0 — Project Switching

**Shipped:** 2026-04-23
**Phases:** 3 (Phases 12-14) | **Plans:** 7 | **Requirements:** 18/18

### What Was Built

- Per-workspace `ProjectList` module with CRUD, `workspaceState` persistence, auto-selection, and fallback logic — scanner promotes all configs as switchable projects (Phase 12)
- `Behave BDD: Select Project` quick-pick command with status bar indicator, output channel logging, and multi-config notification update (Phase 13)
- Pure helper extraction (`selectProjectHelpers.ts`) with 35 unit tests covering quick-pick item building and status bar visibility (Phase 13)
- Switch triggers full test tree + step mapping rebuild via `configurationChangedHandler` with `withProgress` notification and `projectSwitchInProgress` run guard (Phase 14)
- Dedicated `project-switch/` integration test fixture (alpha + beta sub-projects) with 18th integration suite (Phase 14)
- README documentation covering auto-discovery, multi-path, monorepo scanning, and project switching (Phase 14)

### What Worked

- **One-active-at-a-time architecture decision.** Avoiding the 1:N `WorkspaceSettings` refactor saved massive complexity. The ProjectList module is self-contained (~170 lines) and the switch operation reuses the existing `configurationChangedHandler` choke point.
- **Pure helper extraction for testability.** Instead of testing activate() closures, extracting `buildQuickPickItems`/`computeStatusBarState` into `selectProjectHelpers.ts` yielded 21 unit tests with zero mock complexity.
- **Single-day milestone.** 3 phases, 7 plans, 20 commits completed in one day — the fastest milestone. The well-established infrastructure from 1.0.0-1.2.0 made this incremental.
- **Reusing configurationChangedHandler for rebuild.** Rather than building a parallel switch-rebuild path, calling the existing handler with `(undefined, undefined, true)` preserved all side effects (log clearing, watcher rebuild, notification dedup).

### What Was Inefficient

- **No VERIFICATION.md files created.** All three phases skipped the verification step during execute-phase. The milestone audit had to verify requirements via code inspection rather than reading structured verification files. Not a blocker but adds audit overhead.
- **SUMMARY frontmatter missing `requirements-completed` on most plans.** Only Phase 13 plans populated this field. The audit cross-reference relied on code inspection for Phase 12 and 14 requirements.
- **ROADMAP 14-02 checkbox not ticked.** Minor admin drift — the SUMMARY existed on disk but the ROADMAP checkbox wasn't updated.

### Patterns Established

- **Module-level callback pattern for cross-scope bridging.** `updateProjectStatusBarFn` arrow function assigned inside `activate()` and called from `updateDiscoveryUX` — cleanest way to bridge closure scope to module-level functions.
- **`isManualProjectPathMode` as universal gate.** A single function checking whether `projectPath` is explicitly set gates status bar visibility, quick-pick behavior, project list operations, and config watcher logic.
- **`projectSwitchInProgress` flag as rebuild guard.** Temporary boolean flag with `try/finally` cleanup prevents test runs during the brief rebuild window after project switch.

### Key Lessons

1. **One-active-at-a-time is sufficient for first-generation multi-project.** Users can switch; the extension rebuilds. Simultaneous projects is a future milestone only if user feedback demands it.
2. **Helper extraction > mock-heavy closure testing.** When VS Code API code lives inside `activate()` closures, extract the pure logic into companion `*Helpers.ts` files. Tests stay simple, coverage stays high.
3. **Reuse the existing choke point for new trigger paths.** The `configurationChangedHandler` already handles settings changes, config watcher events, and initial load. Adding project switch as another caller (not a parallel path) prevents state management divergence.

### Cost Observations

- 20 commits, 40 files changed, +3715/-40 lines in a single day
- 3 phases with 7 plans — smallest milestone (1.0.0 was also 3 phases/6 plans)
- Notable: Built entirely on 1.2.0 infrastructure; zero new external dependencies

---

## Milestone: v1.4.0 — Deprecate featuresPath & Notification Suppression

**Shipped:** 2026-05-04
**Phases:** 4 (Phases 15-18) | **Plans:** 17 | **Requirements:** 15/15

### What Was Built

- Reusable notification suppression module (`src/notifications.ts`) — `suppressedNotifications: string[]` array setting + `isSuppressed`/`suppressNotification`/`showSuppressibleNotification` API; legacy `suppressMultiConfigNotification` boolean removed and auto-migrated to the array on activation (Phase 15)
- `featuresPath` deprecation — schema removal + `migrateLegacyFeaturesPath` activation wiring with same-scope inspect/write/clear semantics; internal reads collapsed to `featuresPaths[]`-only across `settings.ts`, `common.ts`, and the `TestWorkspaceConfig` mock (Phase 16)
- `migrateScopedSetting<TSrc, TDest>` reusable migration primitive — extracted from the Phase 15 helper, with Phase 15 then refactored to delegate to it; both Phase 15 and Phase 16 ship migrations as thin wrappers (D-MOD regression bar: all 8 Phase 15 sub-cases held)
- 19th integration suite — `test/integration/migrations integration suite/` covering both migrations end-to-end via a real-VSCode launch and a dedicated `migration-stale/` fixture (7 tests, suite-load-time stub for `runTestSuites.ts` registration)
- Phase 18 closure — removed unreachable `suppressMultiConfigNotification` mock fallback, documented the read-time `discoveryDepth` re-read as a deliberate ad-hoc workaround, wrote phase-level rollups for Phases 16+17, and captured `activeProjectCache` invalidation pairing as carry-forward tech debt

### What Worked

- **Primitive extraction by the second usage.** Phase 15 shipped `migrateLegacySuppressMultiConfig` as a one-off. Phase 16 needed almost the same scope-aware logic for `featuresPath`. Rather than copy-paste, Plan 16-02 extracted `migrateScopedSetting<TSrc, TDest>` and refactored Phase 15 to call it — using the existing 8 Phase 15 sub-cases as a regression bar. The primitive shipped, both migrations got cleaner, and the regression coverage was free. The "wait for the second use case to extract" rule paid off cleanly.
- **A dedicated cross-cutting verification phase.** Migrations span Phases 15 and 16, which means neither phase's verification covers the integration. Spinning up Phase 17 specifically to write the migrations integration suite caught a Phase 12 `activeProjectCache` regression that no per-phase test would have surfaced. The 7-test suite is now a permanent regression bar for any future migration work.
- **Closure phase as a tech-debt graduation step.** The v1.4.0 audit found 5 low-severity items. Rather than carry them across the milestone boundary, Phase 18 ran two parallel plans (one code-cleanup, one doc-rollup) in a single wave with non-overlapping `files_modified`. Both completed in a single executor pass; milestone closed with zero outstanding artifact debt.
- **Form-feed-resistant artifacts.** PROJECT.md had latent form-feed bytes (`\x0c`) replacing the `f` in "featuresPath" that no human ever noticed because the renderer hides them. The bytes only mattered when the milestone-close workflow tried Edit-tool surgery. Lesson: at major milestone boundaries, scrub planning docs for control bytes.

### What Was Inefficient

- **Phase 18 was structurally avoidable.** Phase 15 and Phase 17 had everything they needed to write the missing rollups (16/17 SUMMARYs, 17 VERIFICATION) and remove the dead `suppressMultiConfigNotification` mock branch when the legacy schema was removed. Both got deferred and resurfaced as audit findings. Cost: a closure phase that didn't need to exist if per-phase verification had been stricter about cleanup.
- **`activeProjectCache` regression hit during integration testing.** The Phase 12 cache wasn't invalidated when `discoveryDepth` changed; a Phase 17 integration test surfaced the staleness. Fixed tactically with a read-time re-read (commit `c08ced5`) — the proper fix (pair `clearScanResultCache()` with project-list invalidation) is now carry-forward debt. A pre-Phase-17 cache-coherence audit would have caught this earlier.

### Patterns Established

- **Migration primitive + thin wrappers.** Generic `migrateScopedSetting<TSrc, TDest>` with `TransformResult<T>` discriminated union as the contract; per-setting wrappers handle only the transform function and key names. Future legacy-setting deprecations ship as ~10-line wrappers with primitive-level test coverage as the regression bar.
- **`migration-stale/` fixture pattern for integration testing migrations.** Seeded `settings.json` + restore-template + minimal behave config; suite-load-time stub registers in `runTestSuites.ts`. Reusable for future migrations.
- **Audit-driven closure phases — but only when the audit is non-trivial.** v1.4.0's audit found 5 items (mix of artifact + code cleanup + doc); Phase 18 closed all five in 2 plans / 1 wave / parallel execution. For audits with 0-2 trivial items, the closure phase is overhead — handle inline before `/gsd-complete-milestone`.

### Key Lessons

- **Extract a primitive at N=2, not N=1, not N=3.** Phase 15 was the right place to ship the one-off; Phase 16 was the right place to extract. Don't pre-extract on speculation, don't carry duplicated code past the second user.
- **Cross-cutting verification needs its own phase when 2+ phases touch the same activation path.** Phase 17 caught the cache regression. A "Phase 16 verification" alone wouldn't have, because the regression was in Phase 12 code that Phase 16 didn't touch.
- **Cache-invalidation strategy is load-bearing — make it explicit, not ad-hoc.** Two phases (12, 17) ended up reasoning about `activeProjectCache` semantics. The lack of an explicit invalidation contract is now carry-forward debt. For future caches: define the invalidation rule in the same module that defines the cache.
- **Latent encoding garbage compounds across edits.** Form-feed bytes in PROJECT.md were invisible until automated edits failed. Worth a one-time scrub at milestone boundaries.

### Cost Observations

- 4 phases, 17 plans, 77 commits, 8 days — biggest plan-count milestone since 1.2.0
- Phase 17 was the slowest single phase (3 plans but heavy integration-suite construction + bisect debugging for the cache regression)
- Phase 18 ran Wave 1 in true parallel (2 plans, non-overlapping `files_modified`) — both executors landed in one orchestrator pass

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| 1.0.0 | 3 | 6 | Initial MVP — config parsing, discovery cache, UX |
| 1.1.0 | 3 | 9 | Introduced milestone audit + dedicated tech-debt phase at close; added predicate-polling test primitive |
| 1.2.0 | 5 | 13 | Primary-plus-list type migration pattern; BFS scanner with circuit breaker; two-tier watcher strategy; semver alignment |
| 1.3.0 | 3 | 7 | One-active-at-a-time project switching; pure helper extraction for testability; single-day milestone on established infrastructure |
| v1.4.0 | 4 | 17 | Migration primitive + thin wrappers (extract-at-N=2); dedicated cross-cutting verification phase; parallel-wave closure phase for audit findings |

### Cumulative Quality

| Milestone | Unit Tests | Integration Suites | Requirements Shipped | Deferred Debt |
|-----------|-----------|--------------------|--------------------:|---------------|
| 1.0.0 | ~430 | 13 | 21 | 0 |
| 1.1.0 | 539 | 14 | 13 | 0 |
| 1.2.0 | 614 | 17 | 19 (1 dropped) | 0 |
| 1.3.0 | 655 | 18 | 18 | 0 |

### Top Lessons (Verified Across Milestones)

1. **Cache-first architecture keeps runtime cheap.** Both 1.0.0 (discovery cache) and 1.1.0 (run guard reads the same cache) validated that a module-level Map read in the hot path is the right shape for sub-ms gatekeepers.
2. **Integration tests earn their cost when they cover multi-module flows.** 1.0.0's config-only/pyproject-config/malformed-config suites, 1.1.0's watcher-integration suite, and 1.2.0's multi-path/monorepo-scan suites all caught wiring bugs that unit tests by construction cannot see.
3. **Non-blocking UX over blocking dialogs.** Ship warnings, not gates — validated in all three milestones (malformed-config notification in 1.0.0, run guard in 1.1.0, first-match-wins notification in 1.2.0).
4. **Primary-plus-list for safe plural migration.** When expanding a singular field to an array, keep the singular as a getter returning `[0]`. Proven in 1.2.0 across 20+ call sites with zero back-compat breaks.
5. **Drop requirements when underlying assumptions are wrong.** INT-01 in 1.2.0 was based on incorrect behave fixture semantics. Early drop saved an entire phase of misdirected work.
6. **Reuse existing choke points for new trigger paths.** `configurationChangedHandler` serves settings changes (1.0.0), config watcher events (1.1.0), and project switches (1.3.0). One entry point, zero state divergence.
