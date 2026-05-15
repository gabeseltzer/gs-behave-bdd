---
quick_id: 260514-djs
description: consent UX polish from user-testing feedback (toast copy, two-button toast, appName-aware path, diagnostic copy)
status: complete
completed: 2026-05-14
parent: 260513-oh5-consent-diagnostics
---

# Summary — Consent UX polish

Four iterations on the diagnostics consent surface shipped in `6f1adb2`, all
driven by user-testing feedback the same day:

1. **Toast copy.** Was: `"1 legacy behave-vsc setting needs attention. Open the
   Problems pane and use the quick-fix to choose what to do."` Now:
   `"1 setting can be migrated for Behave BDD"`. The "where to go" affordance
   moves from the message body into explicit buttons.

2. **Two buttons on the toast.** `Open Problems` jumps to the Problems pane
   (`workbench.actions.view.problems`); `Open Settings` opens the first hit's
   anchor settings.json at the legacy-key line via
   `workspace.openTextDocument` + `window.showTextDocument(..., { selection })`,
   with a graceful fallback to `workbench.action.openSettingsJson` if the
   anchor file can't be opened (e.g. portable-mode / custom user-data-dir
   installs the variant-detection in #3 can't cover).

3. **Global-anchor path fix** (the user-testing bug report). VS Code's
   user-data folder name varies by build: stable is `Code`, Insiders is
   `Code - Insiders`, plus `VSCodium`, `Code - OSS`, and `Code - Exploration`.
   The earlier code hardcoded `Code` for Windows, breaking clickable
   navigation from the Problems pane on every non-stable build with
   *"editor could not be opened because the file was not found"*.
   `userDataFolderName()` now reads `vscode.env.appName` and maps:
   - `"Visual Studio Code"` → `"Code"`
   - `"Visual Studio Code - Insiders"` → `"Code - Insiders"`
   - `"Visual Studio Code - Exploration"` → `"Code - Exploration"`
   - Anything else (VSCodium / Code-OSS) → `appName` verbatim (it matches the
     folder name for those builds).
   Same logic now applies to win32, darwin, and linux.

4. **Diagnostic message rewrite.**
   - Case 2: `behave-vsc.<key> can be migrated for use with Behave BDD. Use quick-fix to migrate or dismiss.`
   - Case 3: `behave-vsc.<key> and gs-behave-bdd.<key> are both set. Use quick-fix to choose which value to keep.`
   - Case-3 wording deliberately drops the "migrate" framing — case 3 is a
     conflict between two set values, not a missing canonical.

## Files changed

- `src/migrations/consent.ts` — new toast copy + two-button `.then()` chain;
  added `handleSummaryToastChoice` (non-blocking, catches all errors so a
  misclick can't surface a stack trace).
- `src/migrations/diagnostics.ts` — `userDataFolderName()` helper folded into
  `resolveAnchorUri`; `buildDiagnosticMessage` rewritten for the new copy
  (drops the scope-name appendage — the diagnostic is anchored at the file
  for that scope, so it's redundant in the message).
- `test/unit/migrations/consent.test.ts` — updated message-content assertion
  (`/can be migrated for Behave BDD/`), updated button-set assertion
  (`['Open Problems', 'Open Settings']`), added 3 new tests covering each
  button dispatch path including the openSettingsJson fallback.
- `test/unit/migrations/diagnostics.test.ts` — updated case-2 / case-3
  message assertions for the new copy; added 2 tests pinning the
  `vscode.env.appName` → folder-name mapping (Insiders + VSCodium).
- `test/unit/migrations.test.ts` — test 4.10's summary-message regex updated.
- `test/unit/vscode.mock.ts` — added `vscode.env` (with `appName: 'Visual Studio Code'`),
  added `workspace.openTextDocument` and `window.showTextDocument` stubs.
  `commands.executeCommand` signature widened to accept varargs so tests can
  inspect the command name.

## Verification

- `npx eslint src --ext ts` → clean.
- `npm run test:unit` → **857 passing** (was 852; +3 button-dispatch tests
  + 2 appName tests).
- `npm run compile` → webpack bundle succeeds.

## Limitations worth noting

- Portable mode and `--user-data-dir <path>` overrides still can't be
  detected from inside the extension — there's no public VS Code API that
  surfaces the actual user-data-dir path. In those cases the Global anchor
  points at the default-install path (which doesn't exist) and clicking the
  diagnostic in the Problems pane will fail to open the file. The summary
  toast's `Open Settings` button is the workaround — its fallback path
  invokes `workbench.action.openSettingsJson`, which VS Code routes to the
  *actual* user-data-dir regardless of mode. Worth a follow-up if anyone
  reports it.
- `vscode.env.uriScheme` is a more reliable signal for variant detection
  (`vscode-insiders` vs `vscode` vs `vscodium`) than `appName`, but mapping
  the URI scheme back to a folder name is the same table. Kept `appName` for
  readability.
