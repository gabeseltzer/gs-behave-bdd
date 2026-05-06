# Phase 5: Integration Verification - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 05-integration-verification
**Areas discussed:** Test scope & event coverage, Suite & fixture strategy, Config-edit & cleanup, Wait/sync strategy, Run guard test strategy, CI wire-up

---

## Test scope & event coverage

### Test scope

| Option | Description | Selected |
|--------|-------------|----------|
| Watcher only (Recommended) | Cover watcher → test-tree-update only; run guard stays on Phase 4 unit coverage + Human UAT | |
| Watcher + run guard | Also add integration test driving test run against malformed fixture, assert warning popup fires | ✓ |
| Watcher + dispose lifecycle | Watcher tests + workspace-folder-change dispose test; skips run guard | |

**User's choice:** Watcher + run guard
**Notes:** Matches phase goal ("watcher + run guard verified end-to-end"). Accepts a second flakiness surface in exchange for closing all 5 Human UAT items via automation.

### Watcher events covered

| Option | Description | Selected |
|--------|-------------|----------|
| onDidChange only (Recommended) | Literal reading of Success Criterion 1 | |
| All three events (create / change / delete) | Covers WATCH-02 end-to-end + WATCH-05 dispose residual | ✓ |
| Change + delete | Skips create | |

**User's choice:** All three events
**Notes:** Closes the full WATCH-02 surface in one pass; worth the extra fixture manipulation cost.

---

## Suite & fixture strategy

### Suite location

| Option | Description | Selected |
|--------|-------------|----------|
| New 'watcher integration suite' (Recommended) | Dedicated `test/integration/watcher-integration suite/` directory | ✓ |
| Extend config-only + malformed-config suites | Reuse existing fixtures; tighter coupling | |
| Hybrid | New suite for watcher create/change/delete; reuse malformed-config suite for run guard | |

**User's choice:** New 'watcher integration suite'

### Fixture strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated example-projects/watcher-integration (Recommended) | New fixture cloned from config-only layout | ✓ |
| Reuse example-projects/config-only | Mutate existing fixture with snapshot+restore | |
| Copy fixture to os.tmpdir() at suiteSetup | Full isolation but dynamic launchArgs plumbing required | |

**User's choice:** Dedicated example-projects/watcher-integration

---

## Config-edit & cleanup

### Change op

| Option | Description | Selected |
|--------|-------------|----------|
| Swap paths key to alternate features dir (Recommended) | behave.ini paths=features → paths=features-alt, assert tree contains alt scenario | ✓ |
| Add a new .feature file | Would test feature watcher, not config watcher — wrong SUT | |
| Toggle [behave] section valid ↔ invalid | Conflates change test with run-guard test | |

**User's choice:** Swap paths key to alternate features dir

### Cleanup pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Read original at suiteSetup, write back in teardown (Recommended) | Snapshot + restore; try/finally per test | ✓ |
| Commit-clean via git at teardown | `git checkout --` on fixture; requires git in test env | |
| Work on a copy in os.tmpdir() | Zero pollution but adds dynamic launchArgs plumbing | |

**User's choice:** Read original at suiteSetup, write back in teardown

### Test ordering

| Option | Description | Selected |
|--------|-------------|----------|
| Delete → Create → Change (Recommended) | Linear state transitions; each test's final state is next's start | ✓ |
| Each test independent, full restore between | beforeEach restore; Mocha-idiomatic; slower | |
| Single big test covering all three events | Worst diagnostic output on failure | |

**User's choice:** Delete → Create → Change

---

## Wait/sync strategy

### Wait mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Poll test tree until expected (Recommended) | Loop inspecting ctrl.items until predicate matches or timeout | ✓ |
| await parser.featureParseComplete(timeout) | API-level sync; couples test to parser state machine | |
| Fixed sleep (debounce + margin) | setTimeout(1500); worst CI-flakiness bet | |

**User's choice:** Poll test tree until expected

### Poll configuration

| Option | Description | Selected |
|--------|-------------|----------|
| 100ms poll, 5s timeout (Recommended) | Balanced; well under existing 300s Mocha timeout | ✓ |
| 50ms poll, 3s timeout | More aggressive | |
| 250ms poll, 10s timeout | Relaxed, hedges against loaded CI | |

**User's choice:** 100ms poll, 5s timeout

---

## Run guard test strategy

### Popup handling

| Option | Description | Selected |
|--------|-------------|----------|
| Stub vscode.window.showWarningMessage (Recommended) | sinon.stub with predetermined button response; no real modal | ✓ |
| Drive through full testRunHandler with stubbed popup | Exercises more of production path; heavier, couples to behave subprocess | |
| Unit-level only (don't add to integration suite) | Backs off from 'Watcher + run guard' scope | |

**User's choice:** Stub vscode.window.showWarningMessage

### CI wire-up

| Option | Description | Selected |
|--------|-------------|----------|
| Wire into runTestSuites.ts (Recommended) | Append as 18th suite; runs by default in `npm run test:integration` | ✓ |
| Separate opt-in script | New npm script; CI updated separately | |

**User's choice:** Wire into runTestSuites.ts

---

## Claude's Discretion

- Exact filename/split inside `test/integration/watcher-integration suite/` (single `extension.test.ts` vs. `watcher.test.ts` + `runGuard.test.ts`)
- Poll helper API shape (promise-based vs. async-iterator)
- Number of scenarios inside `features-alt/` fixture (one is enough)
- `TestSupport`/`activateExtensionAndWait` bootstrap variant (match existing simple/config-only suite)
- How to assert "tree rebuilt from convention" after delete (likely compare to simple-suite baseline shape)

## Deferred Ideas

None — discussion stayed within phase scope.
