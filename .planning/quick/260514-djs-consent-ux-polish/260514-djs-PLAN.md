---
quick_id: 260514-djs
slug: consent-ux-polish
date: 2026-05-14
status: in-progress
parent: 260513-oh5-consent-diagnostics
---

# Quick Task: Consent UX polish (user-testing feedback)

Four targeted iterations on the diagnostics consent UX shipped in `6f1adb2`.

## Changes

1. **Toast copy:** `${N} setting(s) can be migrated for Behave BDD` — drop the
   "Open the Problems pane…" trailing sentence; buttons cover it now.
2. **Toast buttons:** `Open Problems` + `Open Settings`. Non-blocking (.then chain).
   - `Open Problems` → `workbench.actions.view.problems`
   - `Open Settings` → open first hit's anchor URI at its diagnostic range;
     fall back to `workbench.action.openSettingsJson`.
3. **Global anchor path fix:** use `vscode.env.appName` to derive the
   user-data folder name (so Insiders / VSCodium / Code-OSS work). Applied
   across win32 / darwin / linux.
4. **Diagnostic message rewrite:**
   - Case 2: `behave-vsc.<key> can be migrated for use with Behave BDD. Use quick-fix to migrate or dismiss.`
   - Case 3: `behave-vsc.<key> and gs-behave-bdd.<key> are both set. Use quick-fix to choose which value to keep.`

## Files

- `src/migrations/consent.ts` — toast copy + two-button .then chain.
- `src/migrations/diagnostics.ts` — appName-aware folder mapping + new
  `buildDiagnosticMessage` copy.
- `test/unit/migrations/consent.test.ts` — update assertions for new copy +
  buttons; add tests for the two button dispatch paths.
- `test/unit/migrations/diagnostics.test.ts` — update message assertions +
  add appName variant test.
- `test/unit/vscode.mock.ts` — add `env.appName`, stubable `commands.executeCommand`,
  `workspace.openTextDocument`, `window.showTextDocument`.

## Verify

- eslint clean, tsc clean, `npm run test:unit` passes, `npm run compile` succeeds.
