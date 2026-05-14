---
quick_id: 260514-ean
slug: userdata-scheme-anchor
date: 2026-05-14
status: in-progress
parent: 260514-dvt-remote-anchor-path
---

# Quick Task: Anchor Global diagnostics at `vscode-userdata:/User/settings.json`

Prior fixes (`260514-djs`, `260514-dvt`) computed local-filesystem paths.
Neither worked for the user's case (Windows host + Linux devcontainer): the
window-side user settings.json path isn't reachable from the
container-side extension host, and no public API surfaces it.

User approved trying the undocumented `vscode-userdata:` scheme — the same
URI scheme VS Code's built-in Settings UI uses. VS Code core resolves it
on the window side regardless of where the extension host runs.

## Fix

- `resolveAnchorUri(Global)` returns
  `vscode.Uri.from({ scheme: 'vscode-userdata', path: '/User/settings.json' })`.
- Drop `userDataFolderName()` and `serverDataFolderName()` helpers.
- Drop `os` and `path` imports (no longer used).
- Workspace / WorkspaceFolder branches unchanged.
- Comment block flags the scheme as undocumented + names the
  `workbench.action.openSettingsJson` toast-button as the safety net.

## Tests

- Delete 5 path-detection tests.
- Add 1 test pinning the new URI shape (scheme + path).
- Mock: add `Uri.from` if absent.

## Verify

eslint clean; test:unit passes; webpack compiles.
