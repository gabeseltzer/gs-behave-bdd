# Phase 6: v1.1 Tech Debt & Admin Cleanup - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 06-tech-debt-admin-cleanup
**Areas discussed:** Debounce Map key normalization (IN-02), diagLog placement (WR-01)

---

## Debounce Map key normalization (IN-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Switch to uriId(wkspUri) | Matches discoveryCache convention. Eliminates drive-letter-casing mismatch risk. | ✓ |
| Keep .path + add code comment | If .path is safe because wkspUri always comes from VS Code's workspace folder API. | |
| You decide | Let the agent pick based on code analysis. | |

**User's choice:** Switch to uriId(wkspUri)
**Notes:** Consistent with the rest of the codebase. discoveryCache and all other URI-keyed Maps use uriId().

---

## diagLog placement (WR-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Move into finally block (before run.end()) | diagLog fires on both success and error paths. Matches the audit recommendation. | |
| Remove the diagLog entirely | If 'completed' is misleading on error. | |
| You decide | Agent decides based on what makes sense. | ✓ |

**User's choice:** You decide (agent's discretion)
**Notes:** User deferred to agent. Agent will choose based on diagnostic value.

---

## Agent's Discretion

- WR-01 diagLog placement — user deferred to agent

## Deferred Ideas

None — discussion stayed within phase scope.
