# Milestones

## v1.1 Config File Watching (Shipped: 2026-04-17)

**Phases completed:** 3 phases (4-6), 9 plans, 19 tasks
**Git range:** v1.0..v1.1 (48 commits, 93 files, +9458/-8540 lines)
**Requirements:** 13/13 complete

**Key accomplishments:**

- Per-workspace FileSystemWatcher covering all 5 behave config formats with 500ms debounce, wired into `configurationChangedHandler` so test-tree rebuilds happen automatically on config edits
- Non-blocking run guard (`checkRunGuard`) that reads `configError` from the discovery cache and intercepts both test runs and debug sessions with "Run Anyway / Open Config File / Cancel"
- Dedicated watcher-integration fixture (`example-projects/watcher-integration/`) with sibling `features-alt/` for mutation-safe filesystem tests
- Shared `waitForTestTree` polling primitive replacing brittle wall-clock sleeps with deterministic state gating across integration suites
- 14th integration suite added: 3 watcher tests (delete/create/change) + 4 run-guard tests, locked in by a 3-run flakiness gate on Windows
- TEST-08 closed and 13/13 v1.1 requirements flipped to Complete; Phase 4 code-review findings (WR-01, WR-02, IN-01, IN-02) resolved in Phase 6

---

## v1.0 Auto-Discover Behave Projects (Shipped: 2026-04-16)

**Phases completed:** 3 phases, 6 plans, 11 tasks

**Key accomplishments:**

- Stateless `configParser.ts` module with hand-rolled INI parser and smol-toml TOML parser, reading all 5 behave config formats in priority order and resolving feature paths as `vscode.Uri`
- 12-test Mocha suite covering all 5 behave config formats, path resolution, edge cases, multi-path, and priority order — status: checkpoint pending human verification
- One-liner:
- Discovery results surfaced via output channel log (source, config file, features directory), fire-and-forget warning notification with Open Config File/Open Settings buttons, and Problems panel diagnostics — with package.json descriptions reframed as override-only
- example-projects/config-only/

---
