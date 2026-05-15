---
quick_id: 260513-oh5
description: refactor migration consent UX from toast prompts to Problems-pane diagnostics + Code Actions
status: complete
completed: 2026-05-13
---

# Summary — Migration consent → diagnostics + Code Actions

## Outcome

Replaced the per-(entry, case) `showInformationMessage` prompts with a persistent
Problems-pane surface. Each unhandled legacy `behave-vsc.*` setting now appears
as a `Warning` diagnostic anchored to the line in `settings.json` (or the
`.code-workspace` file) where the legacy key lives. The diagnostic's Code
Action quick-fixes carry the 3 (case 2) or 4 (case 3) decision buttons; a single
summary toast tells the user how many migrations need attention.

This sidesteps VS Code's plain-text-only notification limitation
([vscode#20595](https://github.com/microsoft/vscode/issues/20595),
[vscode#50512](https://github.com/microsoft/vscode/issues/50512)) — the earlier
markdown-rich copy displayed as literal `**bold**` text. Diagnostics also give
us free "snooze" semantics: doing nothing leaves the diagnostic in place across
reloads.

## Why the integration suite changed

Phase 022 Test 2 / Test 3 drove migrations by stubbing
`showInformationMessage` to return button labels. Under the new contract there
is no per-prompt button — actions are dispatched through the
`gs-behave-bdd.migration.action` command (the same code path the Code Action
quick-fix triggers). Both tests now assert the summary toast fired, locate the
diagnostic by `code` decoding, and invoke `dispatchMigrationAction` directly.

## Files changed

### Source (new)

- `src/migrations/diagnostics.ts` — DiagnosticCollection singleton; per-scope
  anchor resolution (Global → user settings.json, Workspace → workspaceFile,
  WorkspaceFolder → `<wksp>/.vscode/settings.json`); JSONC-aware range parsing
  via `jsonc-parser` with [0,0] fallback; `publishConsentDiagnostics`,
  `clearDiagnosticsForEntryAtScope`, and `encode/decodeDiagnosticCode` helpers.
- `src/migrations/codeActions.ts` — `MigrationCodeActionProvider` (returns
  case-2 / case-3 quick-fix sets per Diagnostic) and `dispatchMigrationAction`
  (resolves entryId from `MIGRATION_REGISTRY`, runs the matching handler from
  `consent.ts`, clears the diagnostic on success). Command id constant
  `MIGRATION_ACTION_COMMAND`.

### Source (modified)

- `src/migrations/consent.ts`
  - The seven action handlers (`runMigrateAndDelete`, etc.) are now `export`ed
    so `codeActions.ts` can dispatch to them. Each handler clears its own
    diagnostic on success.
  - `runConsentFlow` no longer prompts per (entry, case). It splits hits into
    silent-mode dispatch (case-2 + `mode !== 'prompt'`) and prompt-bound (case-2
    `mode === 'prompt'` OR any case-3), publishes diagnostics for the
    prompt-bound set, and shows a single non-blocking summary toast.
  - `processCase2Silent` extracted from the old `processGroup`. The
    handler-for-button + per-scope dispatch loop is replaced by the Code
    Action flow in `codeActions.ts`.
  - `formatCase2Message` / `formatCase3Message` retained for one diagnostic
    sentence each (already plain text after `a2faf71`).
- `src/migrations/index.ts` — adds exports for the new modules.
- `src/extension.ts` — registers `MIGRATION_ACTION_COMMAND`, the
  `MigrationCodeActionProvider` (selector matches `**/settings.json` and
  `**/*.code-workspace` for both `json` and `jsonc` language ids), and adds
  the DiagnosticCollection to the extension's disposables.
- `package.json` — adds `jsonc-parser ^3.3.1` dependency, restores
  `smol-toml ^1.6.0` (was used by `src/parsers/configParser.ts` but had been
  silently dropped from `dependencies` at some earlier point — my
  `npm install jsonc-parser --save` pruned the stale node_modules entry and
  surfaced the gap).

### Tests

- `test/unit/migrations/diagnostics.test.ts` (new) — 14 cases covering
  encode/decode round-trip, anchor URI resolution per scope, JSONC range
  parsing (flat + nested + missing-key), publish shape (severity / source /
  code), URI grouping, `clearDiagnosticsForEntryAtScope`, and
  `dispatchMigrationAction` routing + clear-on-success + unknown-entryId
  handling.
- `test/unit/migrations/consent.test.ts` — full rewrite. Old per-button
  action tests + grouping/sequential/order tests moved to (or superseded by)
  `diagnostics.test.ts`. Now pins: no-hit short-circuit, single case-2 /
  case-3 / multi-scope diagnostic publishing, case-3-always-prompts (mode=skip
  still surfaces), pluralized summary message, silent migrationMode dispatch
  (no UI surface), reloadSettings gated on ≥1 hit.
- `test/unit/migrations.test.ts` — Test 4.10 (recheck-consent-flow regression
  from `260513-o1k`) updated for the new contract: asserts on diagnostic
  presence + summary toast instead of button-set.
- `test/integration/migration-consent suite/extension.test.ts` — Tests 2 and 3
  rewritten to assert the summary toast, locate the diagnostic by decoded
  code, and dispatch the action via `dispatchMigrationAction`.
- `test/unit/vscode.mock.ts` — `DiagnosticCollection.forEach` now actually
  iterates (was a no-op); added `CodeAction`, `CodeActionKind`,
  `registerCodeActionsProvider`.

## Verification

- `npx eslint src --ext ts` → clean.
- `npx tsc --noEmit -p tsconfig.json` → clean (ignoring the pre-existing
  smol-toml resolution error that returns once the dep is restored — which it
  is in this commit).
- `npm run test:unit` → 852 passing (was 847; +5 net for new
  diagnostics-suite cases and reshape).
- `npm run compile` → webpack bundle succeeds, `dist/extension.js` = 305 KB
  (was ~300 KB — `jsonc-parser` adds ~5 KB to the bundle; well under any
  reasonable budget).

## Gotchas worth noting for future work

- The shared `makePerKeyScopedConfig` stub is namespace-blind and ignores
  `defaultValue` on `get()`. Tests that need source/dest namespace separation
  or default values must either build a namespace-aware `callsFake` (as
  `migrations.test.ts` test 4.10 does) or seed the key explicitly (as
  `consent.test.ts` does for `migrationMode`).
- Anchor URI resolution returns `undefined` for Workspace scope when
  `vscode.workspace.workspaceFile` is unset; the hit is silently skipped.
  Tests that exercise Workspace scope must stub `workspaceFile`. Easier path
  in tests: use `Global` or `WorkspaceFolder` scope (both always resolve).
- `jsonc-parser`'s `findNodeAtLocation` returns the property *value* node;
  we walk up to `.parent` to get the property node and then `.children[0]`
  for the key node. If the schema changes (jsonc-parser major bump), this is
  the place to look first.
- The user-settings.json path for Global scope uses default VS Code install
  locations. Portable mode, Insiders, and `--user-data-dir` overrides fall
  back to the default path; if the legacy key isn't found there, the range
  degrades to `[0,0]` but the diagnostic still surfaces and the quick-fix
  still works. Documented in `diagnostics.ts` JSDoc.
