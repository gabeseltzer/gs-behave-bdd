# Phase 3: UX & Verification - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-15
**Phase:** 03-ux-verification
**Areas discussed:** Discovery logging, Parse error UX, Status bar behavior, Integration test scope

---

## Discovery Logging

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal (Recommended) | One-line summary per workspace. Only log on activation and settings changes. | ✓ |
| Detailed | Multi-line with config file found, paths parsed, resolution result. Log every discovery run. | |
| You decide | Claude picks based on existing patterns. | |

**User's choice:** Minimal (Recommended)
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Always-on minimal + xRay detail | Always log one-liner. When xRay enabled, also log full discovery chain. | ✓ |
| Always-on only | One-liner always. No extra detail even with xRay. | |
| You decide | Claude picks based on existing xRay patterns. | |

**User's choice:** Always-on minimal + xRay detail
**Notes:** None

---

## Parse Error UX

| Option | Description | Selected |
|--------|-------------|----------|
| Warning notification (Recommended) | showWarningMessage with error details and Show Config File button. Non-blocking. | |
| Output channel only | Log error to output channel only. Silent fallback. | |
| Warning + diagnostic | Warning notification AND Problems panel diagnostic. | ✓ |

**User's choice:** Warning + diagnostic
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Open Config File button | Single button to open malformed config file. | |
| Open Config + Open Settings | Two buttons: open config file and open extension settings. | ✓ |
| No button | Just the message. | |

**User's choice:** Open Config + Open Settings
**Notes:** None

---

## Status Bar Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Icon + source label (Recommended) | e.g. check behave.ini or check settings. Short text. Hover shows full details. | |
| Icon only | Just a behave icon. All details in hover tooltip. | ✓ |
| You decide | Claude picks based on VS Code conventions. | |

**User's choice:** Icon only
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Open output channel | Click opens Behave BDD output channel. | |
| Open extension settings | Click opens extension settings page. | |
| No click action | Read-only. Hover shows info. | |
| You decide | Claude picks most useful click action. | ✓ |

**User's choice:** You decide
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Always when extension is active (Recommended) | Shows whenever extension activates. | |
| Only for config-file discovery | Only shows for config-file discovery path. | |
| You decide | Claude picks based on UX. | ✓ |

**User's choice:** You decide
**Notes:** None

---

## Integration Test Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Focused (Recommended) | New config-only/ project + 1 integration test. Verify existing projects pass. | |
| Comprehensive | Multiple new example projects with integration tests. Add priority logic unit tests. | ✓ |
| You decide | Claude picks balance of coverage vs maintenance. | |

**User's choice:** Comprehensive
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Add override note (Recommended) | Prepend 'Override auto-discovery:' to existing descriptions. | |
| Full rewrite | Rewrite descriptions to explain discovery hierarchy. | |
| You decide | Claude picks clearest wording. | ✓ |

**User's choice:** You decide
**Notes:** None

---

## Claude's Discretion

- Status bar click action
- Status bar visibility rules
- Setting description wording (UX-05)
- Diagnostic severity for malformed config entries
- Example project structure and contents

## Deferred Ideas

None
