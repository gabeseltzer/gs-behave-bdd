---
phase: 023
plan_number: 2
slug: migrations-list
status: planned
depends_on: [1]
files_modified:
  - src/migrations/panelViewModel.ts
  - src/migrations/panel.ts
  - src/migrations/panelHtml.ts
requirements:
  - PANEL-02-LIST
  - PANEL-04-DISPATCH
  - PANEL-CONFIG-RERENDER
must_haves:
  truths:
    - "The panel lists every currently-pending case-2 / case-3 hit across all workspace folders."
    - "Each case-2 row renders 3 action buttons; each case-3 row renders 4 action buttons."
    - "Clicking an action button dispatches through `dispatchMigrationAction` and the panel re-renders with the updated hit set."
    - "If multiple workspace folders are open, rows are grouped by folder with the folder name as a section header."
    - "When the user changes any `gs-behave-bdd.*` setting externally, the panel re-evaluates and re-renders."
    - "When zero hits remain, the panel shows an empty state with a `Recheck Migrations` button (wired to the existing command)."
  artifacts:
    - path: "src/migrations/panelViewModel.ts"
      provides: "buildViewModel() — collect-only evaluator wrapper returning a typed PanelViewModel; exports CASE_2_BUTTONS / CASE_3_BUTTONS with pinned action-union types"
    - path: "src/migrations/panel.ts"
      provides: "Full message routing (dispatchAction / recheck / requestState) + onDidChangeConfiguration re-render"
  key_links:
    - from: "panel.ts message handler"
      to: "dispatchMigrationAction"
      via: "import + await on action message"
      pattern: "dispatchMigrationAction\\("
    - from: "panel.ts"
      to: "evaluateAllMigrations"
      via: "buildViewModel → evaluateAllMigrations({ onCaseHit })"
      pattern: "evaluateAllMigrations"
    - from: "panel.ts"
      to: "vscode.workspace.onDidChangeConfiguration"
      via: "subscription pushed into _disposables"
      pattern: "onDidChangeConfiguration"
---

## Goal

Make the panel actually render pending migrations and let the user act on them.
This plan builds a typed view-model from the evaluator's collect-mode output,
renders one row per (entry, scope) hit with the case-correct button set, and
wires the bidirectional message protocol so clicks dispatch through the
existing `dispatchMigrationAction` and successful actions trigger an in-place
re-render. Also subscribes to configuration changes so external settings edits
keep the panel fresh.

## Why this plan exists

The shell from 023-01 renders nothing meaningful. This plan delivers the core
user value of the phase: a single place to see and act on pending migrations.
It deliberately leaves the Migration Mode picker (023-03) and the
surface-swap / diagnostics deletion (023-04) for later plans so this one stays
under the context-budget ceiling — view-model + render + message routing +
re-render is already a meaty slice.

## Decisions settled in this plan

- **Decision A (multi-root scope): single panel, group rows by folder.** Build
  one merged view-model across all `vscode.workspace.workspaceFolders`. When
  `folders.length > 1`, render a `<h2>` section header per folder; when there's
  exactly one folder, suppress the header to avoid noise. Mirrors how the
  Problems pane aggregates across folders.
- **Decision C (config-change listener granularity): filter by namespace.**
  Listen with `e.affectsConfiguration('gs-behave-bdd') ||
  e.affectsConfiguration('behave-vsc')` — over-refresh is sub-ms and benign,
  under-refresh leaves the panel stale. Filtering to the exact registry keys
  is an unnecessary optimization at <10 entries.

## Tasks

### Task 1 — `src/migrations/panelViewModel.ts`: typed view-model + builder

Create `src/migrations/panelViewModel.ts`.

Exports:

```ts
export type PanelRow = {
  entryId: string;
  case: 2 | 3;
  scope: vscode.ConfigurationTarget;  // Global | Workspace | WorkspaceFolder
  scopeLabel: string;                  // 'Global' | 'Workspace' | 'Workspace Folder'
  sourceKey: string;                   // 'behave-vsc.featuresPaths'
  destKey: string;                     // 'gs-behave-bdd.featuresPaths'
  wkspUri: string;                     // serialized vscode.Uri for the binding folder
  folderName: string;                  // workspace folder name (for grouping)
  buttons: { label: string; action: string }[];  // 3 for case 2, 4 for case 3
};

export type PanelViewModel = {
  rows: PanelRow[];
  folderCount: number;
  migrationMode: MigrationMode;        // current value at the first folder (read-only here; 023-03 owns the writer)
  empty: boolean;                      // true iff rows.length === 0
};

export async function buildViewModel(): Promise<PanelViewModel>;
```

**Pinned label-map types (CRITICAL — see Task 4):** the action-label maps
that move from `codeActions.ts` into this module MUST keep their narrowed
action-union types. The host-side `dispatchMigrationAction` call site relies
on the action field being a `Case2Action | Case3Action` (not `string`), so
the move must preserve type safety. Pin signatures explicitly:

```ts
import type { Case2Action, Case3Action } from './consent';

export const CASE_2_BUTTONS: readonly { label: string; action: Case2Action }[] = [
  // moved verbatim from codeActions.ts CASE_2_LABELS — same string content
];

export const CASE_3_BUTTONS: readonly { label: string; action: Case3Action }[] = [
  // moved verbatim from codeActions.ts CASE_3_LABELS — same string content
];
```

This is a typecheck criterion of the plan: after Task 4, `tsc --noEmit` must
pass with these readonly array types on both the new exports and the
re-exports in `codeActions.ts`. If the move drops them to `string`, the
023-04 `dispatchMigrationAction` callsite loses union-narrowing — fix in
this plan, not later.

Implementation:

- Read `vscode.workspace.workspaceFolders`. If empty, return `{ rows: [],
  folderCount: 0, migrationMode: 'prompt', empty: true }`.
- For each folder, call `evaluateAllMigrations(folder.uri, { onCaseHit: (mcase,
  entry, scope) => { if (mcase === 2 || mcase === 3) hits.push({...}) } })`
  exactly as `recheckCommand.ts:100-109` does. Collect-only — never dispatch.
- For each hit, build a `PanelRow` using:
  - `scopeLabel` from a small `describeScope` helper (`Global`, `Workspace`,
    `Workspace Folder`).
  - `sourceKey` = `${entry.sourceNamespace}.${entry.sourceKey}`, `destKey` =
    `${entry.destNamespace}.${entry.destKey}`.
  - `buttons` from `CASE_2_BUTTONS` / `CASE_3_BUTTONS` (defined above).
    During the 023-02 → 023-04 gap, leave a re-export shim in `codeActions.ts`
    (see Task 4) so the existing CodeActionProvider still compiles.
  - `wkspUri` = `folder.uri.toString()`.
  - `folderName` = `folder.name`.
- Read `migrationMode` via `readMigrationMode(folders[0].uri)` for the
  view-model's display field. (023-03 wires the writer.)

Pattern reference: read-side mirrors `consent.ts:readMigrationMode` and the
`recheckCommand.ts` folder loop. No evaluator changes required.

What NOT to do:

- No dispatch. Pure read.
- No deduplication beyond what `evaluateAllMigrations` already does — if the
  evaluator emits duplicate (entry, scope) tuples that's an evaluator bug, not
  ours to paper over.
- Do NOT import anything from `diagnostics.ts` (it's being deleted in 023-04).

### Task 2 — `src/migrations/panel.ts`: message routing + re-render

Expand the constructor stub from 023-01:

- Define the message type union at module top:
  ```ts
  type PanelMessage =
    | { kind: 'requestState' }
    | { kind: 'dispatchAction'; args: MigrationActionArgs }
    | { kind: 'recheck' };
    // 023-03 adds { kind: 'setMigrationMode'; value: MigrationMode }
  ```
- Replace the `onDidReceiveMessage` body with a switch on `m.kind`:
  - `requestState` → `await this._refresh()`. (Replaces the 023-01 no-op log.)
  - `dispatchAction` → validate `m.args.entryId` against `MIGRATION_REGISTRY`
    (drop with audit log if not found — V5 input-validation from
    023-RESEARCH §Security), validate `m.args.scope` is in
    `[Global, Workspace, WorkspaceFolder]`, then
    `await dispatchMigrationAction(m.args); await this._refresh();`.
  - `recheck` → `await vscode.commands.executeCommand('gs-behave-bdd.recheckMigrations'); await this._refresh();`.
  - Wrap the whole switch in try/catch → `config.logger.logInfoAllWksps`.
- Implement `_refresh()`:
  ```ts
  private async _refresh(): Promise<void> {
    const viewModel = await buildViewModel();
    await this._panel.webview.postMessage({ kind: 'stateUpdate', viewModel });
  }
  ```
- Subscribe to configuration changes in the constructor:
  ```ts
  this._disposables.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('gs-behave-bdd') || e.affectsConfiguration('behave-vsc')) {
        void this._refresh();
      }
    }),
  );
  ```

What NOT to do:

- Do NOT call `dispatchMigrationAction` directly from the panel — always through
  the imported function. (The panel never re-implements action semantics.)
- Do NOT debounce the config listener. Refresh is sub-ms and the
  `affectsConfiguration` check already filters churn.
- Do NOT call `_refresh()` synchronously inside the constructor — the
  `requestState` message from the webview script triggers the first render.

### Task 3 — `src/migrations/panelHtml.ts`: render function + row markup

Replace the `render(vm)` stub in the inline `<script>` from 023-01 with a real
implementation. The render function (browser-side JS) receives the view-model
and rebuilds `#root` innerHTML.

Also remove the 023-01 TODO in the click delegate and wire the real
`dispatchAction` post (the host switch now exists per Task 2).

Markup rules:

- If `vm.empty`: render `<p class="empty">No pending migrations.</p><button
  type="button" data-recheck="true">Recheck Migrations</button>`. The
  delegated click handler posts `{ kind: 'recheck' }` when
  `e.target.dataset.recheck` is set.
- Else: optionally render a `<h2>` per folder when `vm.folderCount > 1` (group
  by `row.folderName`); for each row render:
  ```
  <div class="row">
    <code>${escape(row.sourceKey)}</code> → <code>${escape(row.destKey)}</code>
    <span class="scope">at ${escape(row.scopeLabel)}</span>
    <div class="actions">
      ${row.buttons.map(b => `<button type="button"
        data-action="${escape(b.action)}"
        data-entry-id="${escape(row.entryId)}"
        data-case="${row.case}"
        data-scope="${row.scope}"
        data-wksp-uri="${escape(row.wkspUri)}">${escape(b.label)}</button>`).join('')}
    </div>
  </div>
  ```
- Add an `escape()` 4-line helper in the inline script that replaces `& < > " '`
  (per 023-RESEARCH §Don't Hand-Roll — acceptable for registry-derived
  alphanumeric values; documented assumption).

Update the delegated click handler to:

- If `t.dataset.recheck` → post `{ kind: 'recheck' }`.
- If `t.dataset.action` → post `{ kind: 'dispatchAction', args: { entryId,
  case: Number(case), scope: Number(scope), action, wkspUri } }`.
- Else: ignore.

Also update the `message` listener to switch on `m.kind === 'stateUpdate'`
(replaces 023-01's stub `setState`).

What NOT to do:

- No client-side filtering or sorting controls.
- No CSS for `display: grid` or fancy layout. Plain stacked rows — matches
  CONTEXT.md's "panel owns the surface, not the styling polish."
- Do NOT trust `row.entryId` server-side after the round-trip — re-validate in
  Task 2's message handler.

### Task 4 — `src/migrations/codeActions.ts`: temporary re-export of label maps

Until 023-04 deletes the CodeActionProvider, keep `codeActions.ts` compiling by
adding:

```ts
export { CASE_2_BUTTONS as CASE_2_LABELS, CASE_3_BUTTONS as CASE_3_LABELS } from './panelViewModel';
```

…and removing the local `CASE_2_LABELS` / `CASE_3_LABELS` definitions. Pure
move; same string content. The CodeActionProvider's `provideCodeActions` body
keeps using the imported names without change.

**Type-preservation check (verification step):** after the move, run
`npx tsc --noEmit` and confirm:
- `CASE_2_LABELS` (re-exported) types as `readonly { label: string; action: Case2Action }[]`
- `CASE_3_LABELS` (re-exported) types as `readonly { label: string; action: Case3Action }[]`
- `provideCodeActions` still narrows `b.action` to the union type when
  constructing the `MigrationActionArgs` payload.

If any of those degrades to `string`, the move regressed the narrowing —
fix in Task 1's pinned signatures.

What NOT to do:

- Do NOT delete `MigrationCodeActionProvider`, `MIGRATION_ACTION_COMMAND`, or
  `dispatchMigrationAction` here. 023-04 owns that.

## Verification

```bash
npx eslint src --ext ts
npm run compile          # this is the typecheck gate for the Task-4 label-map move
npm run test:unit
```

Manual smoke:
1. Set `behave-vsc.featuresPaths` in user settings.json without setting the
   canonical key (creates a case-2 hit).
2. Open the panel; confirm one row appears with three buttons.
3. Click `Migrate & delete`; confirm the row disappears and the legacy key is
   removed from settings.json.
4. Edit settings.json externally (re-add the legacy key); confirm the panel
   re-renders within ~100 ms.
5. Resolve all hits; confirm empty state + Recheck button; click Recheck and
   confirm the quick-pick flow runs.

## Test coverage

Defer all `panel.test.ts` assertions to 023-05. This plan should not block on
new tests; the existing suite (`npm run test:unit`) must remain green — meaning
the `codeActions.ts` label-map move (Task 4) must not break
`diagnostics.test.ts` or any consent tests. Run after Task 4 to confirm.

**Predicted test count after 023-02:** ~870 (855 baseline + ~5 view-model
shape tests if added inline; no panel.test.ts yet). See 023-05 for the
full trajectory table.

## Non-goals (this plan)

- Migration Mode picker UI (023-03).
- Toast button rewiring or diagnostics deletion (023-04).
- Persistence across reloads, telemetry, localization, search/filter.
- Any change to `evaluator.ts`, `registry.ts`, or `migrationMode` setting
  semantics.
- Webview-side dedup of cross-folder duplicates (Global-scope hits naturally
  appear once per folder loop iteration; accept the trivial duplication or
  dedupe in `buildViewModel` if it surfaces in manual testing — see Risks).

## Risks

- **Global-scope hit duplication across folders.** `evaluateAllMigrations` is
  called per folder; a Global-scope hit is the same logical row each time.
  Mitigate in `buildViewModel` with a `Set<string>` keyed by
  `${entryId}::${scope}` for Global/Workspace scopes (WorkspaceFolder scope
  stays per-folder). Catch in manual smoke.
- **`affectsConfiguration` thrash during dispatch.** Action handlers write to
  settings, which fires `onDidChangeConfiguration`, which calls `_refresh()`
  while the dispatch chain's own `_refresh()` is in flight. Net effect is two
  identical refreshes — benign but logs noise. If observed, gate with a
  per-call lock or skip the listener-driven refresh while a dispatch is
  in-flight.
- **Validation drift between webview and host.** The panel sends
  string-coerced numbers (`Number(t.dataset.case)`); the host must coerce to
  the `ConfigurationTarget` enum properly. Mitigate with the explicit enum
  membership check in Task 2's `dispatchAction` branch.
- **Label-map type narrowing regression.** If the `CASE_2_BUTTONS` /
  `CASE_3_BUTTONS` move drops the `Case2Action` / `Case3Action` narrowing,
  the dispatch site silently weakens to `string`. The Task 4 verification
  step (`npx tsc --noEmit`) catches it; do not skip.
