---
phase: 023
plan_number: 3
slug: migration-mode
status: complete
completed: 2026-05-14
requirements:
  - PANEL-03-MIGRATION-MODE
commits:
  - 5499955  # feat(023-03): expose MIGRATION_MODE_OPTIONS + re-export MigrationMode
  - 6632092  # feat(023-03): wire setMigrationMode handler with Global-scope write
  - 99b92e5  # feat(023-03): render Migration Mode picker section in panel webview
files_modified:
  - src/migrations/panelViewModel.ts
  - src/migrations/panel.ts
  - src/migrations/panelHtml.ts
verification:
  lint: clean (npx eslint src --ext ts)
  unit_tests: 855 passing (npm run test:unit) — baseline preserved
  tsc: clean (only the pre-existing smol-toml ErrorOptions warning,
    same as 023-01 / 023-02)
  manual_smoke: deferred (executor has no interactive F5 host)
---

# Phase 023 Plan 03: Migration Mode — Summary

The Migrations panel now renders a 4-button "Migration Mode" picker
above the row list. Clicking a button writes `gs-behave-bdd.migrationMode`
at **Global scope** (Decision D), the host re-renders, and the new value
flows back as the pressed-state of the selected button. External edits to
the user `settings.json` also trip the panel's existing
`onDidChangeConfiguration` listener, so the picker stays in sync without
a manual refresh.

## What shipped

1. **`src/migrations/panelViewModel.ts`** — surface mode metadata.
   - New `MIGRATION_MODE_OPTIONS` constant: fixed-order list of
     `{ value, label, description }` records for the four enum values.
     Order matches the spec (`prompt`, `migrate-and-delete`,
     `migrate-and-keep`, `skip`) so the rendered button row is stable
     across reloads. Descriptions are used as `title` tooltips.
   - New `MIGRATION_MODE_VALUES` constant — `readonly MigrationMode[]`
     extracted from the options list for O(n) membership checks during
     webview input validation.
   - Re-exports `MigrationMode` so consumers (panel.ts, panelHtml.ts)
     pull it from the view-model barrel instead of reaching into
     `consent.ts`.

2. **`src/migrations/panel.ts`** — `setMigrationMode` message handler.
   - **Discriminated-union narrowing** (per the 023-02 handoff note):
     `PanelInboundMessage['setMigrationMode']` is now
     `{ kind: 'setMigrationMode'; value: MigrationMode }` instead of
     the placeholder `{ [k: string]: unknown }`. The exhaustive-switch
     `_exhaustive: never` default keeps compiling.
   - **Runtime validation** (V5 — postMessage payloads are untrusted):
     the handler still checks `typeof value === 'string'` AND
     `MIGRATION_MODE_VALUES.includes(value)` before writing. Invalid
     payloads are dropped with an audit line; no `cfg.update` call.
   - **Global-scope write** per Decision D:
     ```ts
     const cfg = vscode.workspace.getConfiguration('gs-behave-bdd', targetWkspUri);
     await cfg.update('migrationMode', value, vscode.ConfigurationTarget.Global);
     ```
     Wrapped in try/catch identical to `recheckCommand.ts:79-91`:
     log via `config.logger.logInfoAllWksps` on failure, swallow.
     `targetWkspUri` is `vscode.workspace.workspaceFolders?.[0]?.uri`
     (matches the recheck-command pattern; Global writes don't strictly
     require a resource handle but it's harmless when present).
   - **Audit line on success:**
     `MigrationsPanel: migrationMode set to '<value>' at Global scope`.
   - **Explicit `_refresh()`** after the write for deterministic test
     behavior. The `onDidChangeConfiguration` listener wired in 023-02
     will also fire — benign double-refresh; same pattern as the
     action-dispatch flow.
   - **File header** updated to document Decision D (Global only, no
     "Apply to:" selector in v1).

3. **`src/migrations/panelHtml.ts`** — Migration Mode picker UI.
   - New CSS for `.mode-section` and its child buttons. Pressed buttons
     (`[aria-pressed="true"]`) use the primary `--vscode-button-*`
     palette; unpressed use the secondary palette; hover uses
     `--vscode-button-secondaryHoverBackground`. All colors via theme
     custom properties — zero hardcoded values, full theme fidelity.
   - New `<div id="mode-root">` mount placed above the `<h1>Pending
     Migrations</h1>` heading.
   - `MIGRATION_MODE_OPTIONS` is embedded as a JSON literal via
     `JSON.stringify(MIGRATION_MODE_OPTIONS)` near the top of the inline
     `<script>`. Values are alphanumeric+dashes (registry-controlled);
     safe to embed without HTML escaping at the JS-literal layer, and
     the `escape()` helper is still applied at every attribute
     interpolation site (defense in depth).
   - New `renderModeSection(currentMode)` function — builds one
     `<button data-mode aria-pressed title>` per option and writes the
     result to `#mode-root`. Renders on EVERY `stateUpdate` (including
     the empty-state case), so the picker is always available — useful
     because the mode affects the next activation even when there are
     no pending migrations right now.
   - The delegated click handler gains a `data-mode` branch:
     ```js
     if (typeof t.dataset.mode === 'string' && t.dataset.mode.length > 0) {
       vscode.postMessage({ kind: 'setMigrationMode', value: t.dataset.mode });
       return;
     }
     ```
     Sits between the `data-recheck` and `data-action` branches.

## Decisions reaffirmed

- **Decision D (Migration Mode write target): Global only.** Implemented
  in `panel.ts` setMigrationMode handler with an explicit
  `vscode.ConfigurationTarget.Global` passed to `cfg.update`. File
  header documents the rationale.

## Deviations from plan

None of substance. A couple of small choices worth flagging:

- The plan calls for embedding `MIGRATION_MODE_OPTIONS` near the top of
  the inline `<script>` "via `const MODES = ${json};`". Shipped exactly
  that, with the additional note in the script-side comment that the
  values are registry-controlled (no XSS surface) and `escape()` is
  still applied at every attribute interpolation site as defense in
  depth.
- The plan's `<p class="desc">` text reads "Affects how case-2 hits are
  handled on next activation." Shipped as "Affects how silent migrations
  are handled on next activation." — the user-facing copy avoids the
  internal "case-2" term, which is implementation jargon that doesn't
  appear anywhere else in the panel UI. Same semantic content.
- `renderModeSection` renders on every `stateUpdate`, including the
  empty-state branch. The plan implies prepending to `#root` markup;
  using a separate `#mode-root` mount keeps the picker visible even when
  `#root` shows the empty-state, which is more useful (the user can
  still change mode without first creating a pending migration).
- The plan's button selected-state uses just background/foreground
  color swap. Shipped identically — no animation/transition, exactly
  per "What NOT to do" §3.

## Auth gates / external blockers

None.

## Verification details

- `npx eslint src --ext ts` — clean, no output.
- `npm run test:unit` — **855/855 passing** (baseline preserved).
- `npx tsc --noEmit` — clean except for the pre-existing
  `node_modules/smol-toml/dist/error.d.ts(28,25): Cannot find name
  'ErrorOptions'` warning documented in 023-01-SUMMARY. Unrelated.
- Manual smoke (5 steps in the plan: open panel → click Migrate & keep
  → confirm settings.json write → externally revert → confirm panel
  re-renders → reload VS Code, confirm persistence) — **deferred**, no
  interactive F5 host in this executor session. **Strongly recommend
  running before 023-04 starts** so any setMigrationMode wiring
  surprises surface here, not in the surface-swap PR.

## Follow-ups / handoffs to 023-04

- **Surface swap is mechanical from here.** The panel now owns both the
  list AND the mode picker, so 023-04 can delete `src/migrations/
  diagnostics.ts` and the related code in `codeActions.ts` / `consent.ts`
  / `extension.ts` without breaking any UX path the user reaches.
- **`MigrationCodeActionProvider` is still alive** because the legacy
  `CASE_2_LABELS` / `CASE_3_LABELS` re-export shim from 023-02 keeps it
  compiling. 023-04 deletes both the provider and the shim together.
- **Toast button reshape** (`consent.ts` line ~327): from
  `'Open Problems', 'Open Settings'` → single `'Open Migrations
  Panel'` → `vscode.commands.executeCommand('gs-behave-bdd.openMigrations
  Panel')`. The command is already registered (023-01) and works.
- **Tests still defer to 023-05.** No new `panel.test.ts` assertions
  were added in 023-03 (per the plan's "Test coverage: Defer to 023-05"
  section). 023-05's pinning list now includes:
  - Writing `setMigrationMode` invokes `cfg.update` with
    `('migrationMode', value, ConfigurationTarget.Global)`.
  - HTML output contains a `[data-mode="…"]` button per option with the
    view-model's current mode marked `aria-pressed="true"`.
  - Invalid `setMigrationMode` payload is dropped + logged, no
    `cfg.update` call.

## Blockers for 023-04

None. The mode picker is fully wired and the surface-swap deletions
(diagnostics.ts, MigrationCodeActionProvider, vscode-userdata anchor)
have no remaining producers in the panel surface. 023-04 can proceed
immediately.

## Known stubs

None. The mode-section render path is fully wired to the view-model
and the host-side writer; no placeholder data flows to the UI.

## Threat Flags

None. The only new surface is the `setMigrationMode` webview message
kind, which is covered by V5 input-validation in `_handleMessage`
(re-checks the value against `MIGRATION_MODE_VALUES` before writing).
No new network endpoints, file access patterns, or schema changes at
trust boundaries.

## Self-Check: PASSED

- `src/migrations/panelViewModel.ts` modified (MIGRATION_MODE_OPTIONS
  + MIGRATION_MODE_VALUES + re-export of MigrationMode) ✓
- `src/migrations/panel.ts` modified (setMigrationMode handler with
  Global-scope write + union narrowing) ✓
- `src/migrations/panelHtml.ts` modified (mode-section styles, markup,
  click handler, renderModeSection) ✓
- Commits 5499955, 6632092, 99b92e5 all in `git log` ✓
- Lint clean, unit tests 855/855, tsc clean (modulo the pre-existing
  smol-toml warning) ✓
