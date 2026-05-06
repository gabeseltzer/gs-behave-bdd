# Phase 4: Watcher & Run Guard - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 04-watcher-run-guard
**Areas discussed:** Debounce behavior, Run guard UX, Watcher lifecycle, Logging & feedback

---

## Debounce Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, show busy | Set statusItem.busy=true when debounce starts, clear when reparse completes | ✓ |
| No, stay silent | Status bar stays 'Behave: Ready' during config change reparse | |
| You decide | Claude picks the best approach | |

**User's choice:** Yes, show busy
**Notes:** Consistent with existing activation behavior where status bar shows "Behave: Parsing..."

---

| Option | Description | Selected |
|--------|-------------|----------|
| Reset timer on each save | Each new save restarts the 500ms timer, only final save triggers re-discovery | ✓ |
| Fire on first, ignore rest | First save triggers after 500ms, subsequent saves within window ignored | |
| You decide | Claude picks the best approach | |

**User's choice:** Reset timer on each save
**Notes:** Matches existing Python file debounce pattern in fileParser.ts

---

| Option | Description | Selected |
|--------|-------------|----------|
| Separate per-workspace timer | New Map for config watchers, independent of Python debounce timers | |
| Reuse fileParser debounce | Route through fileParser's existing _pythonReparseTimers | |
| You decide | Claude picks the best approach | ✓ |

**User's choice:** You decide (Claude's discretion)
**Notes:** User deferred to Claude — either approach acceptable

---

| Option | Description | Selected |
|--------|-------------|----------|
| Debounce all events equally | Create, change, and delete all go through 500ms debounce | ✓ |
| Delete fires immediately | Only create/change debounce, delete triggers instant re-discovery | |
| You decide | Claude picks the best approach | |

**User's choice:** Debounce all events equally
**Notes:** Handles delete-then-recreate within 500ms (e.g., git operations)

---

## Run Guard UX

| Option | Description | Selected |
|--------|-------------|----------|
| Name the broken file | "Config file 'behave.ini' has parse errors. Tests may not discover correctly." | ✓ |
| Generic warning | "This workspace has configuration errors. Tests may not run correctly." | |
| You decide | Claude picks the best wording | |

**User's choice:** Name the broken file
**Notes:** Consistent with existing malformed config notification in updateDiscoveryUX

---

| Option | Description | Selected |
|--------|-------------|----------|
| Prompt every time | Re-check discoveryCache on each run, warning clears when config is fixed | ✓ |
| Remember per-workspace for session | Suppress warnings after 'Run Anyway' until config changes or restart | |
| You decide | Claude picks the best approach | |

**User's choice:** Prompt every time
**Notes:** Prevents accidentally running stale tests repeatedly

---

| Option | Description | Selected |
|--------|-------------|----------|
| Warn only for broken workspace | Show warning naming the broken workspace, Cancel cancels entire run | ✓ |
| Run healthy, warn for broken | Start running healthy workspace tests immediately, prompt separately for broken | |
| You decide | Claude picks the best approach | |

**User's choice:** Warn only for broken workspace
**Notes:** Scoped per GUARD-04. Cancel = cancel all, Run Anyway = run all, Open Config = open file and cancel.

---

| Option | Description | Selected |
|--------|-------------|----------|
| All run triggers | Guard fires for bulk runs, individual scenarios, and debug sessions | ✓ |
| Bulk runs only | Individual scenario runs skip the guard | |
| You decide | Claude picks the best approach | |

**User's choice:** All run triggers
**Notes:** Consistent protection per GUARD-03

---

## Watcher Lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| At activation | Create config watchers in the same activate() loop as wkspWatchers | ✓ |
| Lazy on first detection | Only create for workspaces where findBehaveConfig() found a config file | |
| You decide | Claude picks the best approach | |

**User's choice:** At activation
**Notes:** Simple, predictable — watchers exist from the moment the extension loads

---

| Option | Description | Selected |
|--------|-------------|----------|
| Separate Map | New wkspConfigWatchers Map parallel to wkspWatchers | ✓ |
| Merge into wkspWatchers | Add config watchers to the same Map | |
| You decide | Claude picks the best approach | |

**User's choice:** Separate Map
**Notes:** Matches STATE.md architecture constraint. Keeps concerns separate.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Via configurationChangedHandler | Add dispose/recreate logic alongside existing wkspWatchers handling | ✓ |
| Separate onDidChangeWorkspaceFolders handler | Dedicated listener for workspace folder changes | |
| You decide | Claude picks the best approach | |

**User's choice:** Via configurationChangedHandler
**Notes:** Single code path for all workspace lifecycle events

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, always re-discover | Config file creation triggers full re-discovery regardless of current discovery source | ✓ |
| Only if paths differ | Compare resolved path to convention path, only rebuild if different | |
| You decide | Claude picks the best approach | |

**User's choice:** Yes, always re-discover
**Notes:** Config-file discovery takes precedence over convention per existing priority chain

---

## Logging & Feedback

| Option | Description | Selected |
|--------|-------------|----------|
| One-line summary | "Config file changed: behave.ini — re-discovering features..." + discovery summary | ✓ |
| Detailed change log | Event type, file path, old vs new discovery result, timing | |
| You decide | Claude picks the best verbosity level | |

**User's choice:** One-line summary
**Notes:** Concise, matches existing log style

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, detailed xRay | Log event type, debounce timer resets, re-discovery timing via diagLog() | ✓ |
| Minimal xRay | Only log that a config watcher event fired | |
| You decide | Claude picks the best approach | |

**User's choice:** Yes, detailed xRay
**Notes:** Matches existing pattern where xRay logs performance metrics and state machine details

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, log to output channel | "Run guard: config error in behave.ini — user prompted" | ✓ |
| Popup only | Warning popup is sufficient, no output channel log | |
| You decide | Claude picks the best approach | |

**User's choice:** Yes, log to output channel
**Notes:** Creates audit trail, matches pattern where showError/showWarn also log

---

| Option | Description | Selected |
|--------|-------------|----------|
| No notification, silent | Silent update per WATCH-04, status bar "Parsing..." is only visible feedback | ✓ |
| Subtle notification | Information toast "Behave BDD: Config updated, test tree refreshed" | |
| You decide | Claude picks the best approach | |

**User's choice:** No notification, silent
**Notes:** Per WATCH-04 requirement. Matches existing behavior for workspace setting changes.

---

## Claude's Discretion

- Debounce timer implementation: separate per-workspace timer Map vs reusing fileParser debounce mechanism

## Deferred Ideas

None — discussion stayed within phase scope.
