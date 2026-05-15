---
phase: 023
plan_number: 2
slug: migrations-list
status: complete
completed: 2026-05-14
requirements:
  - PANEL-02-LIST
  - PANEL-04-DISPATCH
  - PANEL-CONFIG-RERENDER
commits:
  - 75ca1ce  # feat(023-02): add panelViewModel with collect-only evaluator wrapper
  - b6565bc  # feat(023-02): wire panel message routing + config-change re-render
  - 4cf5c70  # feat(023-02): render real per-row markup + recheck button in panel webview
  - 6fda8fc  # refactor(023-02): re-export CASE_2/3_LABELS from panelViewModel
files_created:
  - src/migrations/panelViewModel.ts
files_modified:
  - src/migrations/panel.ts
  - src/migrations/panelHtml.ts
  - src/migrations/codeActions.ts
verification:
  lint: clean (npx eslint src --ext ts)
  compile: clean (npm run compile — webpack succeeds; tsc emits only the
    pre-existing smol-toml ErrorOptions error documented in 023-01-SUMMARY)
  unit_tests: 855 passing (npm run test:unit) — baseline preserved
  manual_smoke: deferred (executor has no interactive F5 host)
---

# Phase 023 Plan 02: Migrations List — Summary

The webview shell from 023-01 now renders pending migrations and acts on
them. Clicking a button dispatches through the existing
`dispatchMigrationAction`, the panel re-renders in place with the updated
hit set, and external `settings.json` edits trigger a refresh via an
`onDidChangeConfiguration` listener filtered to the `gs-behave-bdd` and
`behave-vsc` namespaces.

## What shipped

1. **`src/migrations/panelViewModel.ts` (new)**
   - `buildViewModel()` — async builder that walks every workspace folder,
     calls `evaluateAllMigrations` in collect-only mode (no dispatch), and
     folds case-2 / case-3 hits into a typed `PanelViewModel`.
   - **Multi-root dedup:** Global- and Workspace-scope hits keyed by
     `${entryId}::${scope}` so the same logical row doesn't multiply once
     per folder iteration. WorkspaceFolder-scope hits stay per-folder.
   - Returns `migrationMode` from the first folder for 023-03's picker
     (read-only here).
   - `CASE_2_BUTTONS` / `CASE_3_BUTTONS` exported with pinned
     `Case2Action` / `Case3Action` union types — typecheck verified via
     `npm run compile`.
   - `describeScope()` returns user-facing `'Workspace Folder'` (with the
     space) for the scope column.

2. **`src/migrations/panel.ts` (updated)**
   - `_handleMessage` switch routes `requestState` → `_refresh()`,
     `dispatchAction` → `validateActionArgs` → `dispatchMigrationAction` →
     `_refresh()`, `recheck` → command palette command → `_refresh()`.
   - `validateActionArgs` re-validates the payload: `entryId` must be in
     `MIGRATION_REGISTRY`, `scope` must be a `ConfigurationTarget` enum
     member, all string/number fields are typechecked. Malformed payloads
     are dropped with an audit log line (V5 input-validation per
     023-RESEARCH §Security).
   - `_refresh()` builds the view-model and `postMessage`s a
     `{ kind: 'stateUpdate', viewModel }` message.
   - `onDidChangeConfiguration` listener filtered to `gs-behave-bdd` and
     `behave-vsc` (Decision C); pushed into `_disposables` so it cleans up
     on panel close.
   - `setMigrationMode` reserved for 023-03 — still logs + ignores. Switch
     uses `_exhaustive: never` so future `PanelInboundMessage` additions
     trip a typecheck error if not handled.

3. **`src/migrations/panelHtml.ts` (updated)**
   - `render(vm)` builds real per-row markup. Each row shows
     `<code>sourceKey</code> → <code>destKey</code>` plus a scope label
     and the case-correct button set.
   - **Folder grouping:** when `vm.folderCount > 1`, rows render under
     `<h2>folderName</h2>` section headers (Decision A). Single-folder
     workspaces suppress the header.
   - **Empty state:** renders `<p class="empty">No pending migrations.</p>`
     plus a `Recheck Migrations` button (`data-recheck="true"`) wired
     through the new `recheck` message kind to the existing
     `gs-behave-bdd.recheckMigrations` command.
   - 4-line `escape()` helper for HTML entities in registry-derived
     values (acceptable scope per 023-RESEARCH §Don't Hand-Roll).
   - Delegated click handler distinguishes `data-recheck` from
     `data-action` and posts the appropriate message kind.
   - Added theme-driven CSS for `.row code`, `.row .scope`, `.row .actions`,
     and the `<h2>` section header — all `var(--vscode-*)`, no hardcoded
     colors.

4. **`src/migrations/codeActions.ts` (slimmed)**
   - Local `CASE_2_LABELS` / `CASE_3_LABELS` definitions removed; replaced
     by a re-export from `panelViewModel.ts` under the legacy names so the
     `MigrationCodeActionProvider` keeps compiling until 023-04 deletes it.
   - The provider body now references `CASE_2_BUTTONS` / `CASE_3_BUTTONS`
     (imported directly) — same iteration, same `action as Case2Action |
     Case3Action` cast, same emitted `CodeAction[]`.
   - Type narrowing preserved: `npm run compile` (which runs `ts-loader`)
     succeeds without weakening any dispatch-site union.

## Decisions reaffirmed

- **Decision A (multi-root scope):** single panel, group by `folderName`
  when `folderCount > 1`. Implemented in `panelHtml.render` + dedup logic
  in `buildViewModel`.
- **Decision C (config-change listener granularity):** filtered to
  `gs-behave-bdd` + `behave-vsc` namespaces. Implemented in `panel.ts`
  constructor.

## Deviations from plan

None of substance. A few notes worth flagging:

- The plan's `PanelRow.buttons` type is
  `{ label: string; action: string }[]`. The implementation tightens this
  to `readonly { label: string; action: Case2Action | Case3Action }[]` so
  the narrowing survives the round-trip declared elsewhere in the same
  plan (the type-preservation invariant in Task 4). This is consistent
  with the plan's Task 1 "pinned label-map types" requirement — the plan
  signature was simply less strict than the actual constraint demanded.

- Task 4's plan says to use `export { CASE_2_BUTTONS as CASE_2_LABELS,
  CASE_3_BUTTONS as CASE_3_LABELS } from './panelViewModel';` and remove
  the local consts. That's exactly what shipped, plus a direct
  `import { CASE_2_BUTTONS, CASE_3_BUTTONS }` so the provider body could
  switch to the new names (the alias-only re-export creates exports but
  doesn't introduce locals). Same diff size; cleaner inside the provider.

- The plan's empty-state markup uses
  `<button type="button" data-recheck="true">Recheck Migrations</button>`.
  Shipped exactly as specified — including the `data-recheck="true"`
  attribute (string compare against `'true'` in the click handler so a
  missing attribute doesn't accidentally match).

## Auth gates / external blockers

None.

## Verification details

- `npx eslint src --ext ts` — clean, no output. (Run after every TS edit
  per CLAUDE.md.)
- `npm run compile` — webpack succeeds. The only `tsc --noEmit` warning is
  the pre-existing `smol-toml/dist/error.d.ts(28,25): Cannot find name
  'ErrorOptions'` documented in 023-01-SUMMARY — unrelated to this plan.
- `npm run test:unit` — **855/855 passing**. The `codeActions.ts` label-
  map move did not regress any consent or diagnostics tests, as predicted
  by the plan (no test references `CASE_2_LABELS` / `CASE_3_LABELS`
  directly).
- Manual smoke — deferred. The plan's 5-step manual smoke (set legacy key
  → open panel → click Migrate & delete → externally re-add key → resolve
  → click Recheck) requires an interactive VS Code session. **Strongly
  recommend running before 023-03 starts** so any CSP nonce / message-
  routing surprises surface here, not deeper in the chain.

## Follow-ups / handoffs to 023-03

- **Migration Mode picker.** 023-03 adds a `<select>` (or radio group)
  above the row list reading `vm.migrationMode` and posting
  `{ kind: 'setMigrationMode', value: MigrationMode }`. The panel's
  `setMigrationMode` branch is already reserved (logs + ignores in
  023-02); replace the body with a host-side writer that calls
  `vscode.workspace.getConfiguration('gs-behave-bdd').update(
   'migrationMode', value, vscode.ConfigurationTarget.Global)` per
  Decision D, then `_refresh()`.
- The `PanelInboundMessage` discriminated union has
  `setMigrationMode: { kind; [k: string]: unknown }` — 023-03 should
  narrow this to `{ kind: 'setMigrationMode'; value: MigrationMode }` and
  re-validate the `value` field in `_handleMessage` against the four
  enum strings.
- The exhaustive-switch `_exhaustive: never` default in `_handleMessage`
  will start typing-erroring once the union is narrowed — that's the
  intent; replace the `setMigrationMode` case body and the error goes
  away.

## Blockers for 023-03

None. The view-model exposes `migrationMode`, the message protocol has
the `setMigrationMode` slot reserved, the re-render path is already
wired. 023-03 is a pure addition above the row list.

## Known stubs

None. The render function and view-model are fully wired; no placeholder
data flows to the UI.

## Threat Flags

None. The only new surface is the webview message protocol, already in
the plan's `<threat_model>` (covered by V5 input-validation in
`validateActionArgs`). No new network endpoints, file access patterns, or
schema changes at trust boundaries.

## Self-Check: PASSED

- `src/migrations/panelViewModel.ts` exists ✓
- `src/migrations/panel.ts` modified ✓
- `src/migrations/panelHtml.ts` modified ✓
- `src/migrations/codeActions.ts` modified ✓
- Commits 75ca1ce, b6565bc, 4cf5c70, 6fda8fc all in `git log` ✓
- Lint clean, compile clean, 855/855 unit tests passing ✓
