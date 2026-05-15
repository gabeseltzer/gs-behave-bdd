---
quick_id: 260514-ean
description: switch Global-scope diagnostic anchor to vscode-userdata URI scheme
status: complete
completed: 2026-05-14
parent: 260514-dvt-remote-anchor-path
---

# Summary — `vscode-userdata:` anchor for Global-scope diagnostics

Prior path-computing attempts (`260514-djs` appName-aware, `260514-dvt`
`.vscode-server` for remote) couldn't reach the user's case: Windows-host
window + Linux-devcontainer extension host. No public extension API
exposes the window-side filesystem path to the extension host —
[Microsoft's own remote-extensions doc](https://code.visualstudio.com/api/advanced-topics/remote-extensions)
explicitly warns against path-based assumptions.

The fix is to stop computing a path. Anchor the Global-scope diagnostic
at the same URI VS Code's built-in Settings UI uses:

```
vscode-userdata:/User/settings.json
```

VS Code core resolves this scheme on the window side, so it transparently
handles local / remote / web / portable / profile contexts.

## Risk

The `vscode-userdata:` scheme is **not part of the public extension API**.
[microsoft/vscode#174971](https://github.com/microsoft/vscode/issues/174971)
shows VS Code treats it as an internal implementation detail and has
changed its resolution behavior at least once. If they break or remove it,
the Problems-pane click stops working silently.

Safety net: the summary toast's `Open Settings` button uses the supported
`workbench.action.openSettingsJson` command and stays correct regardless.

## Files

- `src/migrations/diagnostics.ts` — `resolveAnchorUri(Global)` body is now
  one line; helpers `userDataFolderName` / `serverDataFolderName` deleted;
  `os` + `path` imports dropped. Long comment block flags the undocumented
  status of the scheme and names the safety net.
- `test/unit/migrations/diagnostics.test.ts` — 5 deletions (appName /
  VSCodium / remoteName / Insiders-remote variant tests; the
  filesystem-path Global test); 1 addition pinning scheme + path of the
  new URI. Net −4 tests.
- `test/unit/vscode.mock.ts` — added `Uri.from({ scheme, path })` (minimal
  stand-in; preserves scheme and path verbatim).

## Verification

- `npx eslint src --ext ts` → clean.
- `npm run test:unit` → **855 passing** (was 859; net −4 by design).
- `npm run compile` → webpack bundle succeeds.

## Follow-up if this turns out to also fail

If clicking the Global-scope diagnostic still doesn't open settings.json,
options ranked by escalation cost:

1. Drop the Global diagnostic entirely; rely on the summary toast +
   workspace/folder diagnostics. (Smallest change, smallest UX.)
2. Implement a `TextDocumentContentProvider` with a custom scheme that
   renders a virtual document describing the Global-scope migration.
   Anchor the diagnostic there. Click opens a synthetic "pending
   migration" page with the same Code Action quick-fixes. (Best UX;
   ~half-day of work.)
3. File a VS Code feature request asking for a public API equivalent of
   `vscode-userdata:` — until that lands, options 1 or 2 are the
   sustainable answer.
