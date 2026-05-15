---
phase: 023
plan_number: 3
slug: migration-mode
status: planned
depends_on: [1, 2]
files_modified:
  - src/migrations/panel.ts
  - src/migrations/panelHtml.ts
  - src/migrations/panelViewModel.ts
requirements:
  - PANEL-03-MIGRATION-MODE
must_haves:
  truths:
    - "The panel renders a `Migration Mode` section above the list with the 4 enum values (`prompt`, `migrate-and-delete`, `migrate-and-keep`, `skip`)."
    - "The currently-selected mode is visually indicated."
    - "Picking a different mode writes `gs-behave-bdd.migrationMode` at Global scope and the panel re-renders with the new selection."
    - "Re-render after a mode change reflects the new mode in the section's selected state without changing the rest of the row set."
  artifacts:
    - path: "src/migrations/panel.ts"
      provides: "`setMigrationMode` message handler that writes Global-scope and refreshes"
    - path: "src/migrations/panelHtml.ts"
      provides: "Migration Mode section markup + delegated click → postMessage"
  key_links:
    - from: "panel.ts setMigrationMode handler"
      to: "vscode.workspace.getConfiguration('gs-behave-bdd').update('migrationMode', value, ConfigurationTarget.Global)"
      via: "explicit Global scope per Decision D"
      pattern: "ConfigurationTarget\\.Global"
---

## Goal

Add the "Migration Mode" section to the panel. Read the current
`gs-behave-bdd.migrationMode` value, render a small UI for the four enum
values, and write back to Global scope when the user picks a different value.
Re-render via the same `_refresh()` path so the selection state updates
in-place.

## Why this plan exists

Migration Mode is a small, well-bounded slice that is logically separate from
the list (different message kind, different config key, different scope
semantics). Splitting it from 023-02 keeps each plan inside its context
budget and makes the read/write paths easy to reason about independently.

## Decisions settled in this plan

- **Decision D (Migration Mode write target): Global only.** `migrationMode`
  is a user preference, not a project preference; the user reaches the panel
  from any folder and expects the change to apply universally. No "Apply to:"
  selector in v1 — keep the UI minimal. Document in `panel.ts` header.

## Tasks

### Task 1 — `panelViewModel.ts`: surface mode metadata

The `migrationMode` field is already on `PanelViewModel` from 023-02. Add a
small exported constant for the UI:

```ts
export const MIGRATION_MODE_OPTIONS: { value: MigrationMode; label: string; description: string }[] = [
  { value: 'prompt',              label: 'Prompt',              description: 'Ask per scope (default)' },
  { value: 'migrate-and-delete',  label: 'Migrate & delete',    description: 'Silently move legacy values and remove the legacy key' },
  { value: 'migrate-and-keep',    label: 'Migrate & keep',      description: 'Silently copy legacy values and leave the legacy key' },
  { value: 'skip',                label: 'Skip',                description: 'Finish without copying' },
];
```

Re-export `MigrationMode` from `panelViewModel.ts` (it's already imported from
`./consent`); no new type definitions.

What NOT to do:

- No change to `consent.ts`'s `MigrationMode` type or `readMigrationMode`.
- No new evaluator hook.

### Task 2 — `panel.ts`: `setMigrationMode` message handler

Extend the `PanelMessage` union:

```ts
type PanelMessage =
  | { kind: 'requestState' }
  | { kind: 'dispatchAction'; args: MigrationActionArgs }
  | { kind: 'recheck' }
  | { kind: 'setMigrationMode'; value: MigrationMode };
```

In the `onDidReceiveMessage` switch, add the `setMigrationMode` branch:

- Validate `m.value` is in `['prompt', 'migrate-and-delete', 'migrate-and-keep',
  'skip']` (drop with audit log if not).
- Resolve `targetWkspUri` = first folder's URI or `undefined` (Global writes
  don't strictly need a binding handle, but the existing pattern in
  `recheckCommand.ts:74-78` passes one).
- Write:
  ```ts
  const cfg = vscode.workspace.getConfiguration('gs-behave-bdd', targetWkspUri);
  await cfg.update('migrationMode', m.value, vscode.ConfigurationTarget.Global);
  ```
  Wrap in try/catch identical to `recheckCommand.ts:79-91` (log via
  `config.logger.logInfo` / `logInfoAllWksps` on failure, swallow).
- Emit one audit line on success:
  `config.logger.logInfoAllWksps('MigrationsPanel: migrationMode set to ${m.value} at Global scope')`.
- `await this._refresh();` — the `onDidChangeConfiguration` listener from
  023-02 will ALSO fire, but the explicit refresh ensures determinism for
  tests.

What NOT to do:

- Do NOT prompt the user with a confirmation dialog. The picker is the choice.
- Do NOT write to Workspace or WorkspaceFolder scope. Decision D is Global-only.
- Do NOT clear `completedMigrations` as a side effect — that's what the
  Recheck command is for.

### Task 3 — `panelHtml.ts`: Migration Mode section markup + handler

In the inline `<style>` block, add minimal styles for a section:

```css
.mode-section { padding: .5rem 0 1rem; border-bottom: 1px solid var(--vscode-panel-border); margin-bottom: 1rem; }
.mode-section h2 { font-size: 1rem; margin: 0 0 .5rem; }
.mode-section button[data-mode] { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); margin-right: .25rem; }
.mode-section button[data-mode][aria-pressed="true"] { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.mode-section button[data-mode]:hover { background: var(--vscode-button-secondaryHoverBackground); }
.mode-section .desc { color: var(--vscode-descriptionForeground); margin-left: .5rem; font-size: .9em; }
```

In the `render(vm)` function, prepend the Migration Mode section to `#root`
above the rows / empty-state:

```html
<div class="mode-section">
  <h2>Migration Mode</h2>
  ${MIGRATION_MODE_OPTIONS.map(opt => `<button type="button"
    data-mode="${escape(opt.value)}"
    aria-pressed="${vm.migrationMode === opt.value}"
    title="${escape(opt.description)}">${escape(opt.label)}</button>`).join('')}
  <p class="desc">Applied at Global scope. Affects how case-2 hits are handled on next activation.</p>
</div>
```

Note: `MIGRATION_MODE_OPTIONS` is host-side; inline it as a JSON literal during
HTML construction (pass into the template literal) — the browser script
doesn't import it. Use `JSON.stringify(MIGRATION_MODE_OPTIONS)` and embed via
`const MODES = ${json};` near the top of the inline `<script>` (the project's
HTML escaping already handles the safety since values are alphanumeric+dashes).

Extend the delegated click handler:

```js
if (t.dataset.mode) {
  vscode.postMessage({ kind: 'setMigrationMode', value: t.dataset.mode });
  return;
}
```

What NOT to do:

- No `<select>` element. Buttons keep keyboard nav consistent with the action
  rows (focusable + Enter activates).
- No description-only-on-hover. The single `.desc` line is the explanation;
  per-option tooltips via `title` suffice.
- No animation / transition for the selected state.

## Verification

```bash
npx eslint src --ext ts
npm run compile
npm run test:unit
```

Manual smoke:
1. Open the panel; confirm the Migration Mode section shows 4 buttons with one
   marked pressed (`prompt` by default).
2. Click `Migrate & keep`; confirm the pressed state moves to that button.
3. Open user settings.json; confirm `"gs-behave-bdd.migrationMode":
   "migrate-and-keep"` was written.
4. Edit settings.json externally back to `prompt`; confirm the panel
   re-renders with `Prompt` pressed.
5. Re-open VS Code; confirm the mode persists (it's in user settings, not
   in-memory).

## Test coverage

Defer to 023-05. Mode-related assertions:

- Writing `setMigrationMode` invokes `cfg.update` with the correct args
  (`'migrationMode', value, ConfigurationTarget.Global`).
- HTML output contains a `[data-mode="…"]` button per option with the
  view-model's current mode marked `aria-pressed="true"`.
- Invalid `setMigrationMode` payload is dropped + logged, no `cfg.update`
  call.

## Non-goals (this plan)

- Surface-swap or diagnostics deletion (023-04).
- Per-workspace migration mode override.
- Clearing `completedMigrations` from the panel — that stays a recheck-flow
  concern.
- Localization, telemetry.

## Risks

- **Double-refresh on mode change.** Explicit `_refresh()` plus
  `onDidChangeConfiguration` both fire. Benign (two identical postMessages);
  matches the same pattern as action dispatch in 023-02. Note in the audit log
  if it gets noisy.
- **Mode change while a Case-2 dispatch is in flight.** The dispatch path
  reads `mode` via `readMigrationMode` at consent-flow entry, not at every
  scope. Mid-flight changes affect only the next activation — acceptable, and
  consistent with the rest of the migration system.
- **`aria-pressed` semantics in screen readers.** Toggle buttons with
  `aria-pressed` is the WAI-ARIA pattern for a radio-like group when the
  options are mutually exclusive; correct here. If a future accessibility
  review prefers a real `radiogroup`, swap is mechanical.
