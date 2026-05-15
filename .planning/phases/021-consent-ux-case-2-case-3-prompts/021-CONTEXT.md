# Phase 21: Consent UX (Case 2 & Case 3 Prompts) - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the Phase 19 evaluator's `onCaseHit` seam to user-facing prompts and implement the case 2 / case 3 action handlers. By end of Phase 21, on activation:

1. Every case 1 hit stays silent (already true from Phase 19; do not regress).
2. Every case 2 hit either prompts the user (when `migrationMode === 'prompt'`) or runs the chosen mode silently (`migrate-and-delete` / `migrate-and-keep` / `skip`).
3. Every case 3 hit **always** prompts the user with four actions, regardless of `migrationMode`.
4. Whichever action runs marks the migration Finished at the scope(s) it covered.
5. Dismissal (X / click-away) leaves the migration unfinished so it re-surfaces next activation.

No new registry entries land here — those are all in place from Phase 20. No new settings land here — `migrationMode` and `completedMigrations` were registered in Phase 19. Phase 21 is pure UX + action dispatcher + tests (TEST-01, TEST-02).

</domain>

<decisions>
## Implementation Decisions

### Notification grouping (D-A1)
- **D-A1.1:** Hits are grouped by **(entry, case)** tuple. For each tuple, exactly one notification is shown covering every scope where that entry hit that case. Rationale: keeps the surface compact for users with many seeded `behave-vsc.*` settings (worst-case ≈ 51 hits without grouping) while keeping the action vocabulary uniform per notification.
- **D-A1.2:** When a single entry hits **different cases at different scopes** (case 2 at one scope, case 3 at another), it produces **two notifications** — one per (entry, case) tuple. Each has the correct action set for its case (3 actions for case 2, 4 for case 3). Mixed-case entries should be rare in practice (requires the user to have set legacy in one scope and *both* legacy+canonical in another), but the contract is explicit.
- **D-A1.3:** The user's chosen action **applies uniformly to every scope grouped under the notification**. E.g. if `featuresPath-from-behavevsc` hit case 2 at Workspace and at Global, picking "Migrate & keep" performs the copy at both scopes and marks Finished at both. Picking "Don't migrate" marks Finished at both without writes. This is what makes grouping cheap: action ≡ apply to all grouped scopes.
- **D-A1.4:** Notification text names the affected scopes inline, e.g. *"`behave-vsc.featuresPath` is set in this workspace folder and globally, but the new `gs-behave-bdd.featuresPaths` is not set there. What do you want to do?"* — see D-A4 for friendly scope labels.

### Button labels & message copy (D-A2)
- **D-A2.1:** **Short button labels** with full action semantics described in the message body. VS Code notification buttons wrap awkwardly when long; the REQUIREMENTS verbatim labels ("Migrate and delete legacy", etc.) are kept as the message's explanation, not as the button strings.
- **D-A2.2:** Case 2 buttons (3): `Migrate & delete` / `Migrate & keep` / `Don't migrate`.
- **D-A2.3:** Case 3 buttons (4): `Overwrite & delete` / `Overwrite & keep` / `Keep canonical` / `Keep both`.
- **D-A2.4:** Message body explains each button. Example case 2 body:
  > `behave-vsc.featuresPath` is set in **this workspace folder** but `gs-behave-bdd.featuresPaths` is not.
  > - **Migrate & delete**: copy the legacy value to the canonical setting and clear the legacy entry.
  > - **Migrate & keep**: copy the value but leave the legacy entry in place.
  > - **Don't migrate**: skip this migration. The extension will stop reading the legacy fallback in a future version.
- **D-A2.5:** Exact final copy is a planner-level detail; the planner may iterate on wording while preserving the button labels (which the tests pin per TEST-01/02).

### Hook integration & flow (D-A3)
- **D-A3.1:** **Collect-then-prompt** pattern. `evaluateAllMigrations` runs to completion first with a hook that *only* collects `{case, entry, scope}` tuples into an in-memory array. After evaluation finishes, a separate orchestrator processes the collected hits.
- **D-A3.2:** The orchestrator lives in a new module `src/migrations/consent.ts`. Public surface:
  - `runConsentFlow(wkspUri, hits, mode): Promise<void>` — entry point called from `src/extension.ts`.
  - Internally: filters hits by `migrationMode` for case 2; groups remaining hits by (entry, case); sequentially awaits each notification; dispatches actions; calls `markMigrationFinishedAtScope` per affected scope.
- **D-A3.3:** **Sequential notifications** — `runConsentFlow` awaits each notification before showing the next. Avoids stacking many toasts and lets the user process choices in order. Notifications themselves remain non-blocking VS Code information messages (CONSENT-01 — "non-blocking" means "doesn't gate extension activation," not "shown in parallel"); activation has already completed by the time `runConsentFlow` runs.
- **D-A3.4:** Activation wiring change in `src/extension.ts:338` becomes roughly:
  ```ts
  const hits: ConsentHit[] = [];
  await evaluateAllMigrations(wkspUri, {
    onCaseHit: (mcase, entry, scope) => {
      if (mcase === 2 || mcase === 3) hits.push({ case: mcase, entry, scope });
    },
  });
  config.reloadSettings(wkspUri);
  const mode = readMigrationMode(wkspUri);
  void runConsentFlow(wkspUri, hits, mode); // fire-and-forget; activation already finished
  ```
  Activation does NOT await `runConsentFlow` — UI prompts should not gate the rest of activation. The defense-in-depth try/catch around `evaluateAllMigrations` stays as-is.
- **D-A3.5:** The evaluator itself remains untouched. No changes to `src/migrations/evaluator.ts` are needed; Phase 19's hook contract already supports this pattern.

### migrationMode handling (D-A4)
- **D-A4.1:** `migrationMode` is read once per workspace via `vscode.workspace.getConfiguration('gs-behave-bdd', wkspUri).get<MigrationMode>('migrationMode', 'prompt')`. This uses VS Code's standard scope merging (most-specific scope wins). The migrationMode is **a workspace-level preference**, not per-(entry×scope).
- **D-A4.2:** Case 2 hits dispatch by `migrationMode`:
  - `prompt` → group + show notification.
  - `migrate-and-delete` → run the action silently, mark Finished. No notification.
  - `migrate-and-keep` → run the action silently, mark Finished. No notification.
  - `skip` → mark Finished silently (CONSENT-06). Audit-log the skip to the output channel (D-A6).
- **D-A4.3:** Case 3 hits **ignore** `migrationMode` and always prompt (CONSENT-03 explicit). Even `skip` does not silence case 3.

### Action handlers (D-A5)
- **D-A5.1:** All action handlers live in `src/migrations/consent.ts` and route through `migrateScopedSetting` (the v1.4.0 primitive) for the actual config writes. MIGRATE-07 is non-negotiable: no parallel migration implementations.
- **D-A5.2:** Action → primitive mapping:
  | Action | Case | Behavior |
  |---|---|---|
  | `migrate-and-delete` | 2 | `migrateScopedSetting` with `entry.transform` + `removeSource: true` |
  | `migrate-and-keep` | 2 | `migrateScopedSetting` with `entry.transform` + `removeSource: false` |
  | `don't-migrate` | 2 | no-op; just `markMigrationFinishedAtScope` |
  | `overwrite-and-delete` | 3 | `migrateScopedSetting` with a transform that **ignores** `destAtSameScope` (overwrite, not merge) + `removeSource: true` |
  | `overwrite-and-keep` | 3 | overwrite transform + `removeSource: false` |
  | `keep-canonical-and-delete-legacy` | 3 | no copy; clear legacy at scope via `migrateScopedSetting` `skipDest` + `removeSource: true` |
  | `keep-both` | 3 | no-op; just `markMigrationFinishedAtScope` |
- **D-A5.3:** Case 3 "overwrite" needs a wrapper transform that calls `entry.transform(src, undefined)` — i.e. pretends the canonical is empty so the entry's natural transform produces the legacy value as the result. This works for plain entries (identity), `featuresPath` (becomes a fresh array from the legacy value), and the `mergeRecord`-based env entries (becomes the legacy record). The grouped-scope application iterates this wrapper per scope.
- **D-A5.4:** **Multi-scope dispatch** — when a grouped notification covers N scopes, the chosen action runs N times sequentially (one `migrateScopedSetting` invocation per scope). Marking Finished is per-scope. If one scope's write fails, log it and continue with the remaining scopes — partial completion is acceptable; the failing scope simply re-surfaces next activation.

### Audit logging & friendly labels (D-A6)
- **D-A6.1:** Every dispatched action emits one `config.logger.logInfo(...)` line to the workspace output channel. Examples:
  - `Migration featuresPath-from-behavevsc: migrate-and-delete at WorkspaceFolder — done.`
  - `Migration envVarPresets-from-behavevsc: dismissed at Workspace — will re-surface next activation.`
- **D-A6.2:** Notification text uses **friendly scope names**, not VS Code enum names:
  - `vscode.ConfigurationTarget.Global` → "globally"
  - `vscode.ConfigurationTarget.Workspace` → "in this workspace"
  - `vscode.ConfigurationTarget.WorkspaceFolder` → "in this workspace folder"
- **D-A6.3:** Output-channel audit lines may use the raw VS Code scope names — those logs are for diagnostics and consistency with developer-facing logging elsewhere in the extension.

### Dismissal semantics (D-A7)
- **D-A7.1:** `vscode.window.showInformationMessage` returns `undefined` when the user dismisses (X) or clicks away. The orchestrator treats `undefined` as a no-op: do NOT mark Finished, do NOT run any action, just log a single `... dismissed at <scope(s)> — will re-surface next activation.` line.
- **D-A7.2:** Per CONSENT-04, this is the only way to leave a migration unfinished after a notification has fired. Every explicit action (including `don't-migrate` and `keep-both`) marks Finished.

### Module layout (D-A8)
- **D-A8.1:** New file `src/migrations/consent.ts` exports:
  ```ts
  export type Case2Action = 'migrate-and-delete' | 'migrate-and-keep' | 'dont-migrate';
  export type Case3Action = 'overwrite-and-delete' | 'overwrite-and-keep' | 'keep-canonical-and-delete-legacy' | 'keep-both';
  export type MigrationMode = 'prompt' | 'migrate-and-delete' | 'migrate-and-keep' | 'skip';
  export interface ConsentHit { case: 2 | 3; entry: MigrationEntry; scope: MigrationScope; }
  export function runConsentFlow(wkspUri, hits, mode): Promise<void>;
  ```
- **D-A8.2:** `src/migrations/index.ts` re-exports `runConsentFlow` (and the types above as needed) so `src/extension.ts` imports stay flat.
- **D-A8.3:** `src/notifications.ts` is NOT modified by Phase 21. Keep that module focused on the suppressible-notification primitive and the v1.4.0 thin shims. Migration UX belongs under `src/migrations/`.

### Test structure (D-A9)
- **D-A9.1:** New file `test/unit/migrations/consent.test.ts` covers TEST-01 + TEST-02 + the orchestrator's grouping and dispatch logic.
- **D-A9.2:** Mocking strategy mirrors existing migration tests: stub `vscode.window.showInformationMessage` (returns the chosen button label or `undefined`), stub `vscode.workspace.getConfiguration().inspect()` and `.update()`, stub `markMigrationFinishedAtScope`.
- **D-A9.3:** Required coverage:
  - Case 2 prompt: each of the 3 actions; dismissal re-surfaces; each `migrationMode != 'prompt'` value runs silently with the corresponding behavior.
  - Case 3 prompt: each of the 4 actions; dismissal re-surfaces; case 3 prompts even when `migrationMode === 'skip'`.
  - Grouping: an entry that hits the same case at 2 scopes produces 1 notification; the chosen action runs at both scopes; both scopes are marked Finished.
  - Mixed-case: an entry that hits case 2 at one scope and case 3 at another produces 2 notifications.
  - Audit log: each action emits exactly one `logInfo` line (verify via stubbed logger).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 19 / 20 carry-forward (READ THESE FIRST)
- `.planning/phases/019-migration-foundation/019-CONTEXT.md` — locks the `MigrationEntry` shape (D-04), evaluator-vs-primitive boundary (D-01/D-02), `onCaseHit` hook contract (D-03), and `markMigrationFinishedAtScope` helper.
- `.planning/phases/019-migration-foundation/019-02-evaluator-PLAN.md` and `-SUMMARY.md` — evaluator implementation that Phase 21 wires into via hooks.
- `.planning/phases/020-migration-registry/020-CONTEXT.md` — locks the 17-entry registry, `featuresPathMergeWithDedup` / `suppressMultiConfigToArray` / `mergeRecord` transforms, and the `<key>-from-behavevsc` / `<key>-self` id convention.
- `.planning/phases/020-migration-registry/020-VERIFICATION.md` — confirms Phase 20 is fully landed (17 entries, evaluator wired at `src/extension.ts:338`).

### v1.5.0 Scope & Requirements
- `.planning/REQUIREMENTS.md` § CONSENT-01..04, CONSENT-06, MIGRATE-05, MIGRATE-06, TEST-01, TEST-02 — the nine requirements Phase 21 maps to. Also CONSENT-05/07 for the settings shape (already implemented by Phase 19, but read so prompts align with the registered enum).
- `.planning/ROADMAP.md` § "Phase 21: Consent UX (Case 2 & Case 3 Prompts)" — phase boundary and success criteria.
- `.planning/STATE.md` § "v1.5.0 Decisions" — locked architectural decisions (route through `migrateScopedSetting`; no parallel implementations).

### Code to read or modify
- `src/migrations/evaluator.ts` — read-only; the `onCaseHit` seam. Phase 21 does NOT change this file.
- `src/migrations/registry.ts` — read-only; the 17 entries Phase 21 dispatches over.
- `src/migrations/completedMigrations.ts` — `markMigrationFinishedAtScope`. Phase 21 calls this after every action (and for case-2 silent flows).
- `src/notifications.ts` — `migrateScopedSetting` primitive (L143) + `TransformResult` type. Phase 21 invokes the primitive from action handlers. **Do not modify** this file in Phase 21.
- `src/extension.ts:338` — single wiring site; replace the no-hooks `evaluateAllMigrations` call with the collect-then-prompt pattern from D-A3.4.

### Project conventions
- `AI_INSTRUCTIONS.md` — URI handling, error patterns, disposable conventions; required reading before any code changes in this repo.
- `CLAUDE.md` — root project instructions (lint + unit tests after every TS change).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 19 evaluator** — `evaluateAllMigrations(wkspUri, hooks?)` accepts an `EvaluatorHooks` object with `onCaseHit(case, entry, scope)`. Phase 21 supplies a collector hook.
- **`markMigrationFinishedAtScope(id, scope, wkspUri)`** — already-public helper from Phase 19. Phase 21 calls this after every action and on case-2 silent dispatches.
- **`migrateScopedSetting<TSrc, TDest>`** (`src/notifications.ts:143`) — same-scope inspect/write/clear primitive. Every Phase 21 action handler routes through this. Already supports `removeSource: boolean` and `transform` returning `TransformResult<T>` (`{kind: 'value', value} | {kind: 'skipDest', removeSource}`).
- **Entry transforms** (`src/migrations/{featuresPath,suppressedNotifications,envPresets}.ts`) — used as-is for case-2 `migrate-*` actions. For case-3 `overwrite-*` actions, wrap them: pass `undefined` as the `destAtSameScope` argument so the transform produces a clean replacement value instead of a merge.
- **`config.logger.logInfo(message, wkspUri)`** — standard workspace-aware logging. Phase 21 uses it for the audit trail.

### Established Patterns
- **Per-scope inspect** (`cfg.inspect(key)`) — never `cfg.get(key)`. Pitfall 2 from Phase 15 onwards: `get()` merges scopes and conflates them. The evaluator already follows this; consent code does NOT need to inspect (it acts on what the evaluator collected) but the action handlers must continue routing through `migrateScopedSetting` which inspects-then-writes correctly.
- **Fire-and-forget UI from activation** — pattern matches v1.4.0: activation should not block on user input. The migration evaluator IS awaited (it's a fast, non-UI scan), but the prompt flow that follows is fire-and-forget.
- **Test fixture style** — `test/unit/migrations/*.test.ts` files mock `vscode.workspace.getConfiguration()` and the logger. `consent.test.ts` adds `vscode.window.showInformationMessage` stubbing.
- **`WkspError`** (`src/common.ts`) — wrap any thrown error from action handlers in a `WkspError` so the logger formats the workspace context.

### Integration Points
- **`src/extension.ts:338`** — the only activation wiring change. Replace the bare `await evaluateAllMigrations(wkspUri)` with the collect-then-prompt pattern (D-A3.4). The surrounding try/catch and `config.reloadSettings(wkspUri)` stay.
- **`src/migrations/index.ts`** — add `export { runConsentFlow } from './consent';` and any new types Phase 21 needs to expose.
- **`package.json`** — no changes needed. `migrationMode` / `completedMigrations` settings and the Recheck Migrations command are all from Phase 19.

</code_context>

<specifics>
## Specific Ideas

- **MigrationMode reading helper:** add a tiny exported `readMigrationMode(wkspUri): MigrationMode` in `src/migrations/consent.ts` rather than reading the config inline at the call site. Makes mocking trivial in tests and keeps the consent module self-contained.
- **Notification copy templates:** maintain two template strings in `consent.ts` — `formatCase2Message(entry, scopes)` and `formatCase3Message(entry, scopes)`. Keeps copy iteration cheap and avoids inline string concat in the dispatch loop. The friendly scope names (D-A6.2) live in a single `friendlyScopeName(scope)` helper.
- **Sequential await loop:** the orchestrator's main loop after grouping is a plain `for (const group of groups) { await showAndDispatch(group); }`. No need for fancy queue/worker plumbing.
- **Tie-break ordering:** when multiple groups need notifications, sort by `entry.id` then by case (2 before 3) for deterministic UX and test stability. Document this in a comment near the sort.
- **Overwrite transform wrapper helper:** add an internal `runOverwriteAtScope(entry, scope, wkspUri, removeSource): Promise<void>` so the four case-3 actions remain one-liners. The "overwrite" semantic is the only place where Phase 21 invents a calling convention on top of the entry transforms — keep it isolated.
- **Test naming convention:** mirror the descriptive `describe('case 2 prompt', () => { describe('action: migrate-and-delete', ...) })` style already used in `test/unit/migrations/plain.test.ts`.

</specifics>

<deferred>
## Deferred Ideas

- **Bulk "apply to all" action** — e.g. one notification offering "Migrate everything (delete legacy)" that runs every case-2 hit at once. Out of scope; we'd need a separate UX surface and risk less-informed decisions. If users complain about notification volume, revisit in v1.6.0.
- **Per-entry `migrationMode` overrides** — already documented out-of-scope for v1.5.0 in REQUIREMENTS.md.
- **Removing the `behave-vsc.*` silent-fallback reads from `src/configuration.ts` / `src/common.ts` / `src/discovery/projectList.ts`** — that's CLEANUP-01, scoped to Phase 22.
- **Integration test in real VS Code** (TEST-07) — Phase 22. Phase 21 ships unit coverage only (TEST-01, TEST-02 are unit-only by REQUIREMENTS).
- **Schema validation of overwrite/migrate values** — already-deferred from Phase 20. If a user had garbage in `behave-vsc`, they still get garbage in `gs-behave-bdd` and the existing `WorkspaceSettings` constructor surfaces it at read time.
- **Localization of notification copy** — extension is English-only today. Phase 21 hardcodes English strings; future i18n effort would extract them.

</deferred>

---

*Phase: 21-Consent UX (Case 2 & Case 3 Prompts)*
*Context gathered: 2026-05-11*
