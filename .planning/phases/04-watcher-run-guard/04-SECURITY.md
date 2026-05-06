---
phase: 04-watcher-run-guard
asvs_level: 1
threats_total: 6
threats_open: 0
threats_closed: 6
audit_date: 2026-04-17
auditor: gsd-secure-phase (claude-sonnet-4-6)
---

# Security Audit — Phase 04: watcher-run-guard

## Summary

All 6 threats in the phase threat register are closed. The single `mitigate` threat (T-04-02) has verified implementation evidence. The five `accept` threats are documented below with rationale. No unregistered threat flags were raised in `04-02-SUMMARY.md ## Threat Flags`.

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-04-01 | Tampering | accept | CLOSED | See accepted risks log below |
| T-04-02 | Denial of Service | mitigate | CLOSED | `src/watchers/configWatcher.ts:10-11,14-19,44-64` — per-workspace 500ms debounce Map; `clearConfigDebounceTimers()` registered as `context.subscriptions` disposable at `src/extension.ts:216` |
| T-04-03 | Information Disclosure | accept | CLOSED | See accepted risks log below |
| T-04-04 | Spoofing | accept | CLOSED | See accepted risks log below |
| T-04-05 | Denial of Service | accept | CLOSED | See accepted risks log below |
| T-04-06 | Elevation of Privilege | accept | CLOSED | See accepted risks log below |

## T-04-02 Mitigation Evidence

**Threat:** Rapid filesystem events against `configDebounceTimers` could cause excessive re-parsing (DoS).

**Mitigation verified:**

1. **Per-workspace debounce Map** — `src/watchers/configWatcher.ts` line 11 declares `const configDebounceTimers = new Map<string, NodeJS.Timeout>()`. The unified event handler (lines 38-64) clears any existing timer before setting a new one keyed by `wkspUri.path`, enforcing exactly one pending callback per workspace at any time.

2. **500ms debounce constant** — `DEBOUNCE_MS = 500` at line 10 is the declared mitigation interval. Rapid saves within 500ms collapse to a single re-discovery call.

3. **Cleanup on shutdown** — `clearConfigDebounceTimers()` is exported (lines 14-19) and pushed to `context.subscriptions` as an inline disposable at `src/extension.ts:216`. This cancels any pending timers when the extension is deactivated, preventing ghost callbacks.

4. **Cleanup on workspace config change** — Old config watchers are disposed in `configurationChangedHandler` at `src/extension.ts:614-616`, releasing watcher resources when the workspace folder set changes.

## Accepted Risks Log

### T-04-01 — Tampering / configWatcher event handler

**Risk accepted.** Config files (`behave.ini`, `.behaverc`, `setup.cfg`, `tox.ini`, `pyproject.toml`) are user-owned workspace files on the local filesystem. Behave itself reads the same files. An attacker who can write these files already has full access to the user's workspace; parsing them in the extension does not grant any additional privilege. The existing `findBehaveConfig` parser already handles malformed content safely (surfacing a `configError` rather than throwing). No additional mitigation required at ASVS Level 1.

### T-04-03 — Information Disclosure / config.logger.logInfo

**Risk accepted.** The only data logged is the filename of the changed config file (e.g., `behave.ini`). This is written to the extension's own Output Channel, which is visible only to the local user who owns the workspace. No secrets, credentials, or sensitive data appear in config file paths. No additional mitigation required at ASVS Level 1.

### T-04-04 — Spoofing / getDiscoveryEntry

**Risk accepted.** The discovery cache (`discoveryCache` Map in `common.ts`) is an in-process, in-memory data structure populated exclusively by the extension's own config file parser. There is no external input channel that can inject or replace cache entries. No spoofing vector exists at ASVS Level 1.

### T-04-05 — Denial of Service / checkRunGuard

**Risk accepted.** `checkRunGuard` performs a single synchronous pass over an in-memory Map and issues at most one `showWarningMessage` call per run invocation. There is no loop, no network call, and no fan-out. The "Run Anyway" button guarantees the user can always proceed regardless of the config error state. No amplification risk at ASVS Level 1.

### T-04-06 — Elevation of Privilege / vscode.commands.executeCommand('vscode.open')

**Risk accepted.** The `'Open Config File'` branch in `checkRunGuard` calls `vscode.commands.executeCommand('vscode.open', configFileUri)` where `configFileUri` is the URI already stored in the discovery cache — a file within the user's own workspace. VS Code's built-in `vscode.open` command opens the file in the editor. It does not execute it, escalate OS permissions, or cross any privilege boundary. No mitigation required at ASVS Level 1.

## Unregistered Threat Flags

None. `04-02-SUMMARY.md` section `## Threat Flags` explicitly states: "No new threat surface introduced beyond the plan's threat model."

## Audit Trail

| Date | Auditor | Action | Result |
|------|---------|--------|--------|
| 2026-04-17 | gsd-secure-phase (claude-sonnet-4-6) | Initial audit of phase 04 threat register against implemented code | SECURED — 6/6 threats closed |
