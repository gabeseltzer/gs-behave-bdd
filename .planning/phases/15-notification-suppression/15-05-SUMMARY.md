---
phase: 15-notification-suppression
plan: 05
subsystem: extension
tags: [extension, wiring, activation, schema-removal, cleanup, integration, notifications]

requires:
  - phase: 15-notification-suppression
    plan: 01
    provides: "WorkspaceSettings.suppressedNotifications field; package.json schema; four cascading settings test fixtures"
  - phase: 15-notification-suppression
    plan: 02
    provides: "src/notifications.ts with isSuppressed, suppressNotification, showSuppressibleNotification, DONT_SHOW_AGAIN; ConfigurationTarget enum in vscode.mock.ts"
  - phase: 15-notification-suppression
    plan: 03
    provides: "src/notifications.ts::migrateLegacySuppressMultiConfig and 8 NOTIF-06 sub-case tests"
  - phase: 15-notification-suppression
    plan: 04
    provides: "TestWorkspaceConfig mock surface for suppressedNotifications: string[]"
provides:
  - "extension.ts wired to use showSuppressibleNotification('multiConfigNotification', ...) (NOTIF-04)"
  - "extension.ts activate() runs migrateLegacySuppressMultiConfig + config.reloadSettings per workspace before updateDiscoveryUX (NOTIF-06 wired; D-05 + Pitfall 3 + Pitfall 4 mitigations)"
  - "package.json: legacy gs-behave-bdd.suppressMultiConfigNotification schema entry REMOVED (NOTIF-05)"
  - "WorkspaceSettings.suppressMultiConfigNotification field, ctor read, and assignment REMOVED"
  - "TestWorkspaceConfig: legacy private field, ctor param + type annotation, ctor assignment, and three switch cases REMOVED"
  - "Four cascading settings test fixtures cleaned: only suppressedNotifications: [] remains"
  - "test/unit/packageJsonSchema.test.ts: assertion FLIPPED — legacy key absent (NOTIF-05 boundary)"
  - "Three new activation-ordering structural tests in test/unit/notifications.test.ts (Pitfall 3 + NOTIF-04 wire shape + legacy-key-absence guard)"
affects:
  - "Phase 15 is functionally complete after this plan"

tech-stack:
  added: []
  patterns:
    - "Fire-and-forget wrapper call: showSuppressibleNotification(...).then(action => ...) preserves the prior unawaited UX shape while delegating suppression mechanics to the wrapper (D-04)"
    - "Eager per-workspace migration loop in activate(): await migrateLegacySuppressMultiConfig(wkspUri); config.reloadSettings(wkspUri); wrapped in defense-in-depth try/catch (D-05, D-07, Pitfall 3, Pitfall 4)"
    - "Structural-test-as-architectural-guard: indexOf-based ordering assertion in unit test catches future refactors that would move the migration after updateDiscoveryUX"

key-files:
  created: []
  modified:
    - src/extension.ts
    - src/settings.ts
    - src/testWorkspaceConfig.ts
    - package.json
    - test/unit/packageJsonSchema.test.ts
    - test/unit/notifications.test.ts
    - test/unit/settings/multiPathPrecedence.test.ts
    - test/unit/settings/verboseLogging.test.ts
    - test/unit/settings/projectUriDerivation.test.ts
    - test/unit/settings/logSettingsPlural.test.ts

key-decisions:
  - "A1 probe (Wave 0) confirmed GREEN before schema removal — the unit-level contract that cfg.inspect() returns scope values for unregistered-but-still-in-settings.json keys is documented and asserted. Real-VSCode confirmation deferred to Phase 17 manual smoke test per 15-VALIDATION.md."
  - "Comment text in extension.ts rewritten to avoid the literal string 'suppressMultiConfigNotification' so the new structural test (`!src.includes(...)`) passes — comment now says 'legacy boolean suppression key', which carries the same intent without the literal token."
  - "Used the call-site signature `updateDiscoveryUX(getUrisOfWkspFoldersWithFeatures()` in the ordering-test indexOf, not the bare function name — there is also a `function updateDiscoveryUX` declaration earlier in the file (line 70) that would have produced a false-positive ordering match. Discovered as a Rule 1 fix during the first run of the new structural test."
  - "Migration is awaited inside activate() despite AI_INSTRUCTIONS.md 'never block activation' — D-05 mandates 'before any notifications fire'. Migration is fast (≤1 inspect + ≤2 updates per workspace × N workspaces). Failure is fail-soft per D-07 + the defense-in-depth try/catch around reloadSettings."

patterns-established:
  - "Comment hygiene: when a comment's only legitimate use of a literal token is to name a removed legacy key, rephrase the comment instead of leaving the literal — keeps `grep -n <legacy-key> src/extension.ts` clean for any future structural-test guards"
  - "indexOf ordering assertions in test code MUST match the call site, not the function declaration — bare-name indexOf is not selective enough"

requirements-completed: [NOTIF-04, NOTIF-05, NOTIF-06]

duration: ~12min
completed: 2026-04-27
---

# Phase 15 Plan 05: extension.ts Wiring + Schema Removal Summary

**Wires `showSuppressibleNotification` into the multi-config notification block (NOTIF-04), adds the eager per-workspace `migrateLegacySuppressMultiConfig + config.reloadSettings` loop in `activate()` before `updateDiscoveryUX` runs (D-05, Pitfall 3, Pitfall 4), and removes every remaining legacy `suppressMultiConfigNotification` reference outside the migration helper itself — schema entry from `package.json` (NOTIF-05), field from `WorkspaceSettings`, mock entries from `TestWorkspaceConfig`, and adjacent `false` lines from the four cascading settings fixture files. Adds three structural tests guarding the activation-order invariant. Phase 15 is functionally complete.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-27T17:27Z (sequential executor invocation)
- **Completed:** 2026-04-27T17:39Z
- **Tasks:** 5 (Task 1 was verification-only — no commit; Tasks 2-5 each landed atomically)
- **Files modified:** 10
- **Files created:** 0

## Accomplishments

- **NOTIF-04 wired:** `extension.ts` L141-L181 inline `showInformationMessage` block replaced with `showSuppressibleNotification('multiConfigNotification', message, ['Select Project', 'Show Details'], wkspUri).then(action => ...)`. Output-channel logging at the top of the block preserved (D-09). Local `suppress` variable read removed — wrapper does its own `isSuppressed` check.
- **NOTIF-06 wired:** New per-workspace migration loop in `activate()` runs `await migrateLegacySuppressMultiConfig(wkspUri)` followed by `config.reloadSettings(wkspUri)`, wrapped in a defense-in-depth try/catch. Loop is positioned BEFORE the `updateDiscoveryUX(getUrisOfWkspFoldersWithFeatures(), false)` call (D-05, Pitfall 3, Pitfall 4 — verified by structural test).
- **NOTIF-05:** `gs-behave-bdd.suppressMultiConfigNotification` schema entry deleted from `package.json contributes.configuration.properties`. Schema test assertion in `test/unit/packageJsonSchema.test.ts` flipped to assert ABSENCE.
- **WorkspaceSettings cleaned:** legacy field declaration, constructor read (with strict-undefined throw), and assignment all removed. Only `readonly suppressedNotifications: readonly string[]` remains.
- **TestWorkspaceConfig cleaned:** legacy private field, constructor destructure entry, constructor type annotation, constructor assignment, `get()` switch case, `inspect()` switch case, and `getExpected()` switch case all removed. Only the new `suppressedNotifications` mock surface remains.
- **Four cascading test fixtures cleaned:** the `suppressMultiConfigNotification: false,` line removed from BASE_CFG / makeFakeWkspSettings in `multiPathPrecedence.test.ts`, `verboseLogging.test.ts`, `projectUriDerivation.test.ts`, and `logSettingsPlural.test.ts`. Only `suppressedNotifications: []` remains.
- **Three new structural tests** in `test/unit/notifications.test.ts`: (1) ordering invariant (migration call index < `updateDiscoveryUX(...)` call index), (2) wrapper call shape (key + both buttons), (3) legacy-key-literal absence in `extension.ts`. These catch future refactors that would re-introduce Pitfall 3 or Pitfall 4 regressions.
- **Full unit suite GREEN:** 683 tests passing (680 baseline + 3 new structural). Webpack compile succeeds. Lint clean. Typecheck clean except pre-existing smol-toml ErrorOptions baseline noise.

## Task Commits

1. **Task 1: A1 probe verification (no commit — verification only)** — Confirmed both A1 probes pass (`A1: inspect() returns workspaceFolderValue for unregistered key with settings.json value` + `A1: inspect() returns globalValue for unregistered key set globally`). Plan 05 schema removal unblocked.
2. **Task 2: Wire showSuppressibleNotification + activate() migration loop** — `3fc2d25` (feat)
3. **Task 3: Remove legacy schema entry from package.json + flip schema test assertion** — `3e3ecdf` (refactor)
4. **Task 4: Remove legacy field/mock/fixture entries** — `76af76d` (refactor)
5. **Task 5: Add activation-ordering structural tests** — `82e2d7c` (test)

## Files Created/Modified

### Modified

- `src/extension.ts` — +37 -28 lines. Added `import { migrateLegacySuppressMultiConfig, showSuppressibleNotification } from './notifications'`. Replaced the L141-L181 inline notification block with a `showSuppressibleNotification(...)` fire-and-forget call. Added a per-workspace migration loop in `activate()` (between the project-list-population loop and the `updateDiscoveryUX` call). Removed the local `suppress` variable read. Rewrote one comment to avoid the literal legacy key name (so the new structural test passes).
- `src/settings.ts` — -5 lines. Dropped public `suppressMultiConfigNotification: boolean` field; dropped its constructor read + strict-undefined throw; dropped its assignment.
- `src/testWorkspaceConfig.ts` — -10 lines. Dropped private field, constructor destructure entry, constructor type annotation, constructor assignment, `get()` switch case, `inspect()` switch case, and `getExpected()` switch case for the legacy boolean.
- `package.json` — -7 lines. Deleted the entire `gs-behave-bdd.suppressMultiConfigNotification` block from `contributes.configuration.properties`.
- `test/unit/packageJsonSchema.test.ts` — Test name and assertion flipped: now asserts the legacy key is ABSENT (was: STILL present). Boundary marker for Plan 05 closes here.
- `test/unit/notifications.test.ts` — +43 lines. Added `fs` and `path` imports; appended `suite('Phase 15 — extension.ts activation ordering (Pitfall 3)')` with three tests using `path.resolve(__dirname, '../../../../src/extension.ts')` (with a 3-level fallback for the alternate compile layout, mirroring `packageJsonSchema.test.ts`).
- `test/unit/settings/multiPathPrecedence.test.ts` — Single-line removal of `suppressMultiConfigNotification: false,` from BASE_CFG.
- `test/unit/settings/verboseLogging.test.ts` — Single-line removal from `makeFakeWkspSettings`.
- `test/unit/settings/projectUriDerivation.test.ts` — Single-line removal from BASE_CFG.
- `test/unit/settings/logSettingsPlural.test.ts` — Single-line removal from `makeFakeWkspSettings`.

## Decisions Made

- **A1 probe ran ONCE, then plan proceeded.** Per the plan, Task 1 is verification-only — no edits, no commit. A1 was GREEN, so Tasks 2-5 executed without halting. If A1 had been RED, the plan would have stopped here and written `BLOCKER.md` per the plan's Task 1 instructions.
- **Wrapper call is fire-and-forget, NOT awaited.** `showSuppressibleNotification(...).then(action => ...)` matches the pre-existing inline block's UX (the original `vscode.window.showInformationMessage(...).then(...)` was also unawaited). Awaiting the wrapper would block `updateDiscoveryUX` on user input — a regression. The migration loop, by contrast, IS awaited because it must finish before `updateDiscoveryUX` runs (D-05, Pitfall 3).
- **Migration loop placed just before `updateDiscoveryUX(...)`, not adjacent to the per-workspace setup loops.** The plan's interfaces hint suggested "near L232-L242" but the most readable placement is immediately before the `updateDiscoveryUX` call (line 295) — this makes the ordering invariant visually obvious and matches the new structural test's intent.
- **Defense-in-depth try/catch around the migration await.** D-07 says the helper never throws, so this catch is belt-and-suspenders. But the catch ALSO covers `config.reloadSettings(wkspUri)` — that call is not contracted to never throw, and a sync throw there before the loop completes for all workspaces would block subsequent migrations. The catch routes any failure to `config.logger.logInfo` and continues with the next workspace.
- **Comment in `extension.ts` rephrased to drop the literal legacy key name.** The plan's structural test asserts `!src.includes('suppressMultiConfigNotification')` — a strict literal absence check. Rather than weaken the test, the source comment was rephrased from "migrate legacy suppressMultiConfigNotification" to "migrate legacy boolean suppression key". The intent is preserved; the literal token is gone. This keeps the structural guard maximally strict for future regressions.
- **Ordering test matches call site, not function declaration.** First-pass test used `src.indexOf('updateDiscoveryUX')` which matched the function declaration at line 70 (well above the migration loop). Updated to `src.indexOf('updateDiscoveryUX(getUrisOfWkspFoldersWithFeatures()')` so it matches the actual call site at line 309 — correctly proving the migration runs first.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Ordering structural test matched function declaration, not call site**
- **Found during:** Task 5 (running tests after appending the new suite).
- **Issue:** `src.indexOf('updateDiscoveryUX')` returned the index of `function updateDiscoveryUX(...)` at line 70 — well before the migration loop at line 296. The test failed with `actual=false, expected=true` because migration index (≈ line 297) was greater than the function-declaration index (line 70).
- **Fix:** Changed the indexOf pattern to `'updateDiscoveryUX(getUrisOfWkspFoldersWithFeatures()'` — matches the unique call site, not the declaration. Updated assertion message to "migration must precede updateDiscoveryUX call" for clarity.
- **Files modified:** `test/unit/notifications.test.ts`
- **Commit:** `82e2d7c` (folded into the same Task 5 commit — fix landed before commit)

**2. [Rule 2 - Critical Functionality] Comment in extension.ts contained the literal legacy key, breaking the new structural test**
- **Found during:** Task 4 → Task 5 transition (after writing the structural test).
- **Issue:** The migration-loop block-comment in `extension.ts` originally read "migrate legacy suppressMultiConfigNotification → suppressedNotifications". The structural test asserts `!src.includes('suppressMultiConfigNotification')` to guard against future regressions — a strict literal check. The comment violated that.
- **Fix:** Rephrased the comment to "migrate legacy boolean suppression key → suppressedNotifications array". Same intent, no literal token.
- **Files modified:** `src/extension.ts`
- **Commit:** `76af76d` (Task 4 commit — pre-emptive fix landed alongside the field/mock removal so Task 5 didn't need a fixup commit)

**Total deviations:** 2 (both Rule 1/2 fixes, both folded into the appropriate task commit before the next task).
**Impact on plan:** None on behavior, plan structure, or test outcomes. Plan completed in ~12 minutes.

## Issues Encountered

- **CRLF line endings in `extension.ts` defeated the first Edit attempt.** The Read tool's display format made the file appear to use `\n`, but the underlying bytes are CRLF (Windows newlines). Combined with the file's literal `•` escape sequences (vs. the rendered "•" glyph), the Edit tool's old_string match repeatedly returned "string not found." Worked around with a one-shot Node script (`fix-ext.cjs`) that constructed the exact target byte sequence using `String.fromCharCode(92)` and `\r\n` separators, then surgically replaced the block. Script removed before commit.
- **Pre-existing `tsc --noEmit -p .` baseline noise (smol-toml ErrorOptions).** Same as Plans 01-04 — out of scope per the executor SCOPE BOUNDARY rule. Test compile (`tsc -p test/tsconfig.json`) is clean; webpack `npm run compile` succeeds; lint is clean; full unit suite is green.

## User Setup Required

None — no external service configuration required.

## Next Plan Readiness

- **Phase 15 functional work is complete.** No Plan 06 was authored as a separate file at the time of execution — STATE.md and ROADMAP.md showed total_plans=6 but only Plans 01-05 were on disk. Per the plan's `<success_criteria>` "Phase 15 is functionally complete," any residual cleanup (e.g., docs, README updates) belongs in a future plan if scoped, otherwise this phase concludes here.
- **Phase 16** (Migration Notification — featuresPath migration) will be the second consumer of `showSuppressibleNotification`. The pattern is now established: pick a key like `featuresPathMigration`, call `showSuppressibleNotification(key, message, buttons, wkspUri)`. No infrastructure changes needed.
- **Phase 17** (cross-cutting verification) should include the manual end-to-end smoke check from `15-VALIDATION.md` Manual-Only Verifications: open `test/example-projects/multiroot-workspace/` with `gs-behave-bdd.suppressMultiConfigNotification: true` in one folder's `.vscode/settings.json`, launch Extension Development Host, confirm: (a) `suppressedNotifications: ["multiConfigNotification"]` appears at same scope, (b) old key gone, (c) no user-facing notification of migration.

## Self-Check

Verified each modified file exists and each commit is reachable from HEAD.

- `src/extension.ts` — FOUND (modified)
- `src/settings.ts` — FOUND (modified)
- `src/testWorkspaceConfig.ts` — FOUND (modified)
- `package.json` — FOUND (modified)
- `test/unit/packageJsonSchema.test.ts` — FOUND (modified)
- `test/unit/notifications.test.ts` — FOUND (modified)
- `test/unit/settings/multiPathPrecedence.test.ts` — FOUND (modified)
- `test/unit/settings/verboseLogging.test.ts` — FOUND (modified)
- `test/unit/settings/projectUriDerivation.test.ts` — FOUND (modified)
- `test/unit/settings/logSettingsPlural.test.ts` — FOUND (modified)

Commit hashes (each verified via `git log --oneline | grep`):

- `3fc2d25` — Task 2 (feat: wire wrapper + migration loop)
- `3e3ecdf` — Task 3 (refactor: schema removal + assertion flip)
- `76af76d` — Task 4 (refactor: legacy field/mock/fixture sweep + comment rephrase)
- `82e2d7c` — Task 5 (test: activation-ordering structural tests)

Verification commands run:

- `npx eslint src --ext ts` — exit 0, no output
- `npx tsc --noEmit -p .` — only pre-existing smol-toml baseline noise (matches Plans 01-04)
- `npx tsc --noEmit -p test/tsconfig.json` — exit 0
- `npm run test:unit` — 683 tests passing (680 baseline + 3 new structural), 0 failing
- `npm run compile` — webpack 5.76.2 compiled successfully

Acceptance-criteria grep counts:

| Pattern | Path | Expected | Actual |
|---------|------|----------|--------|
| `showSuppressibleNotification(` | `src/extension.ts` | 1 | 1 ✓ |
| `migrateLegacySuppressMultiConfig(wkspUri)` | `src/extension.ts` | 1 | 1 ✓ |
| `config.reloadSettings(wkspUri)` | `src/extension.ts` | ≥ 1 | 2 ✓ |
| `wkspSettings?.suppressMultiConfigNotification` | `src/extension.ts` | 0 | 0 ✓ |
| `suppressMultiConfigNotification` | `src/extension.ts` | 0 | 0 ✓ |
| `suppressMultiConfigNotification` | `src/settings.ts` | 0 | 0 ✓ |
| `suppressMultiConfigNotification` | `src/testWorkspaceConfig.ts` | 0 | 0 ✓ |
| `suppressMultiConfigNotification` | `test/unit/settings/` | 0 | 0 ✓ |
| `suppressMultiConfigNotification` | `src/notifications.ts` | ≥ 1 | 4 ✓ (legitimate — migration helper reads the key) |
| `gs-behave-bdd.suppressMultiConfigNotification` | `package.json` | 0 | 0 ✓ |
| `gs-behave-bdd.suppressedNotifications` | `package.json` | 1 | 1 ✓ |
| `REMOVED from schema (NOTIF-05)` | `test/unit/packageJsonSchema.test.ts` | 1 | 1 ✓ |
| `STILL present in this plan` | `test/unit/packageJsonSchema.test.ts` | 0 | 0 ✓ |
| `extension.ts activation ordering (Pitfall 3)` | `test/unit/notifications.test.ts` | 1 | 1 ✓ |

## Self-Check: PASSED

---
*Phase: 15-notification-suppression*
*Plan: 05*
*Completed: 2026-04-27*
