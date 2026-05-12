---
phase: 022-cleanup-integration-docs
mode: RETROACTIVE-STRIDE
asvs_level: 1 (IDE-side dev tool baseline)
block_on: HIGH+
audited: 2026-05-12
auditor: gsd-security-auditor
status: SECURED
threats_total: 11
threats_closed: 8
threats_accepted_risk: 3
threats_open: 0
---

# Phase 22 — Retroactive STRIDE Audit

## Context

Phase 22 is the v1.5.0 cleanup-integration-docs phase. No `<threat_model>`
block was authored in PLAN.md, so this audit builds a STRIDE register
from the actual implementation deltas (see `<scope_of_changes>` in the
phase prompt) and verifies each entry against the post-Phase-22 codebase.

The Phase 22 work is dominated by:
- Deletion of dead legacy-fallback read paths (022-01)
- Test fixtures + integration suite (022-02)
- Documentation + Settings-UI prose (022-03)
- Three post-UAT regression fixes (active-project cache restoration, D-18
  cache-reload contract, fixture nodeCount bump)

Attack surface is intrinsically narrow: VS Code extension host, no
network IO, no auth, child_process spawns of `python` for behave only.
Configuration writes go through the audited `migrateScopedSetting`
primitive (Phase 16) and the Phase 21 consent flow.

## STRIDE Register

| ID | Category | Component | Disposition | Status | Evidence |
|----|----------|-----------|-------------|--------|----------|
| T-22-01 | Tampering | Consent-flow writes to settings.json scope | mitigate | CLOSED | `src/migrations/consent.ts:112-205` — all 5 write handlers route through `migrateScopedSetting` (`src/notifications.ts:149-265`) which detects scope via `inspect()` most-specific-wins and writes only to that scope (lines 164-174). No raw `cfg.update` in consent handlers. |
| T-22-02 | Tampering | `runConsentFlow` could leak a hung promise that re-writes after window dispose | mitigate | CLOSED | `consent.ts:381-395 dispatchOverScopes` wraps each handler in try/catch; `consent.ts:265-302` orchestrator is `async` and the activation site invokes via `void runConsentFlow(...)` (D-A3.4). No throw escapes. `consent.ts:299-301` adds `reloadSettings` only when `groups.length > 0`. |
| T-22-03 | Tampering | Malformed legacy value (e.g. legacy `featuresPath` as non-string) crashes activation | mitigate | CLOSED | `src/migrations/featuresPath.ts:22` guards `typeof legacyValue !== 'string'` → returns `skipDest`. `notifications.ts:247-264` catches every `update()` rejection inside `migrateScopedSetting`, falls back to `diagLog`, never rethrows. |
| T-22-04 | Tampering / Idempotency | Re-running migration writes duplicate entries to `featuresPaths` | mitigate | CLOSED | `featuresPath.ts:32-36` dedup via `normalizeFeaturesPathEntry` from `common.ts:38-39` (W-07 single source of truth). `notifications.ts:225-229` short-circuits when dest already equals proposed value. |
| T-22-05 | Elevation of Privilege | Recheck command writes to a scope the user can't normally write | mitigate | CLOSED | `src/migrations/recheckCommand.ts:34-52` gates `Workspace` scope on `workspace.workspaceFile !== undefined` (D-07) and `WorkspaceFolder` on `workspaceFolders && length > 0`. `Global` is always-allowed by VS Code itself. |
| T-22-06 | Information Disclosure | Prompt message could render attacker-controlled markdown (UI injection) | mitigate | CLOSED | `consent.ts:77-94 formatCase{2,3}Message` interpolates only `entry.sourceNamespace/sourceKey/destNamespace/destKey` (all static literals in `MIGRATION_REGISTRY` — never read from user files) inside backticks. `joinScopes` returns a closed-vocabulary string. No user-file path or settings value is rendered in the prompt. |
| T-22-07 | Information Disclosure | README / package.json descriptions leak internal paths or credentials | mitigate | CLOSED | `package.json:114-128` (verified) contains only public command names + scope-name vocabulary, no paths/secrets. README Migration section (verified via UAT Test 2) is user-facing UX prose. |
| T-22-08 | Repudiation | Consent decisions (action / dismissal / failure) are not auditable | mitigate | CLOSED | `consent.ts` has 14 `config.logger.logInfo` / `showError` call sites covering: each dispatched action (lines 126, 143, 149, 157, 163, 176, 182, 321), dismissal (lines 341, 352), per-scope failure (line 391), and skip-mode (line 323). Every consent path produces at least one workspace-output-channel line. |
| T-22-09 | Denial of Service | `configurationChangedHandler` `needsRescan` block re-scans ALL workspaces synchronously on every scan-shaping setting change | ACCEPTED_RISK | DOCUMENTED | See "Accepted Risks" below. |
| T-22-10 | Information Disclosure | Test fixture `.vscode/settings.*.json` files committed under `example-projects/migration-consent/` | ACCEPTED_RISK | DOCUMENTED | See "Accepted Risks" below. |
| T-22-11 | Spoofing | Not applicable | ACCEPTED_RISK | N/A | No identities / no auth / no external trust boundary in an in-process VS Code extension. Documented for completeness. |

## Mitigation Verification Detail

### T-22-01 Tampering — scope-aware writes

Spot-checked all five write handlers in `consent.ts` route via
`migrateScopedSetting`:

- `runMigrateAndDelete` (L112-127) → `migrateScopedSetting({ ..., transform: ... removeSource: true })`
- `runMigrateAndKeep` (L129-144) → `removeSource: false`
- `runKeepCanonicalAndDeleteLegacy` (L166-177) → `kind: 'skipDest', removeSource: true`
- `runOverwriteAndDelete` (L154-158) → `runOverwriteAtScope(..., true)`
- `runOverwriteAndKeep` (L160-164) → `runOverwriteAtScope(..., false)`

`runOverwriteAtScope` (L187-205) explicitly passes `undefined` as
`destAtSameScope` so the entry transform produces a clean replacement
(not a merge) — verified by 022-02 integration Test 3.

### T-22-02 Tampering — fire-and-forget invariant

Activation site invokes `void runConsentFlow(...)` (per D-A3.4
documentation in consent.ts:263). The `groups.length > 0` guard around
`config.reloadSettings(wkspUri)` at `consent.ts:299-301` was the
post-UAT D-18 cache-contract fix — restores the Phase 16 invariant that
`WorkspaceSettings` reflects post-migration state without re-firing on
no-hit activations.

### T-22-05 Elevation — Recheck scope gating

`recheckCommand.ts:34, 45` — both gates are present. No way to reach
`Workspace` scope without a `.code-workspace` file, no way to reach
`WorkspaceFolder` without an open folder.

### T-22-06 Information Disclosure — prompt rendering safety

Hardcoded review of `formatCase2Message` / `formatCase3Message`:
neither function interpolates `wkspUri.fsPath`, settings values, or
on-disk content. All variable interpolations come from
`MigrationEntry` static-literal fields (`sourceNamespace`, `sourceKey`,
`destNamespace`, `destKey`). The MIGRATION_REGISTRY in
`src/migrations/index.ts` is a compile-time constant array.

## Accepted Risks

### AR-22-09 (T-22-09) — Synchronous re-scan in configurationChangedHandler

**Location:** `src/extension.ts:1024-1071` (Phase 22 regression-fix block).

**Risk:** On `needsRescan`, the handler iterates `workspaceFolders` and
calls `scanForBehaveConfig(folder.uri, depth, stopFirst)` followed by
`rebuildProjectList` for each. For a multi-root workspace with N folders
and `discoveryDepth=3`, this is an N×BFS hit on every change to
`discoveryDepth`, `discoveryStopOnFirstHit`, `projectPath(s)`, or
`featuresPath(s)`.

**Rationale for acceptance:**
1. The pre-Phase-22 code path was *broken* (Phase 19 / CLEANUP-02
   cleared the cache but never repopulated it — see UAT regression #1).
   The fix is strictly safer than the prior state.
2. Workspace size is bounded by the developer's own machine; the
   scanner already has a circuit breaker
   (`scanResult.circuitBreakerFired`) and respects `DEFAULT_EXCLUDE_DIRS`
   (common.ts:672-676).
3. The handler is debounced by VS Code's own configuration-change event
   delivery and is throttled by the user's own typing speed in
   settings.json.
4. No external attacker can drive this — settings.json edits require
   write access to the user's workspace.

**Compensating control:** `clearScanResultCache` + `clearActiveProjectCache`
(L1015-1017) prevent stale-cache leakage if re-scan fails mid-loop.

**Monitoring:** `diagLog` perf line in `common.ts:463-464` reports
`getUrisOfWkspFoldersWithFeatures` duration when `xRay` is enabled.

### AR-22-10 (T-22-10) — Committed `.vscode/settings.*.json` fixtures

**Location:** `example-projects/migration-consent/.vscode/settings.case-1.json` (`{}`),
`settings.case-2.json` (`behave-vsc.runParallel: true`),
`settings.case-3.json` (`behave-vsc.featuresPath: "features-alt"` +
`gs-behave-bdd.featuresPaths: ["features"]`),
`settings.json` (live copy of case-1, restored by suiteTeardown).

**Risk:** A user who copies the fixture folder into a real project
inherits the fixture settings. The case-3 file in particular is
deliberately a "both keys set" arrangement designed to trigger the
4-button prompt.

**Rationale for acceptance:**
- Settings contain no secrets, paths, tokens, or PII — only feature
  flags (`runParallel: true`) and relative path strings
  (`"features-alt"`, `"features"`).
- The folder is under `example-projects/` which is the conventional
  fixture location for this repo (matches `migration-stale/`,
  `project-switch/`, etc.).
- Worst case from copying: the user sees the Phase 21 consent prompt
  and resolves it through the normal UX. Same code path as a real
  legacy-settings encounter.

### AR-22-11 (T-22-11) — Spoofing N/A

Not applicable to an in-process VS Code extension with no remote
endpoints, no auth, no token storage, no shared infrastructure.

## Unregistered Flags

None. SUMMARY.md `## Threat Flags` sections for all three plans
(022-01 / 022-02 / 022-03) reported "None" — no new attack surface
detected by the executors during implementation. The retroactive STRIDE
register above is the audit-side ledger and captures the
configuration-write paths surfaced by 022-UAT.

## Conclusion

**SECURED.** 8 mitigation threats verified CLOSED with file:line
evidence in implemented code; 3 risks documented as ACCEPTED_RISK
(one DoS-class operational consideration, one fixture-hygiene note,
one N/A category). No HIGH-severity findings; nothing blocks ship.

The Phase 22 deltas are dominated by deletions and tests, with one
meaningful regression-fix block in `extension.ts:1024-1071` and one
in `consent.ts:299-301` — both verified to be tighter than the pre-fix
state.
