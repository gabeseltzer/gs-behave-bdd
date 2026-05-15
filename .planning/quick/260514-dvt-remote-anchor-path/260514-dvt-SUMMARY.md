---
quick_id: 260514-dvt
description: honor vscode.env.remoteName when computing the Global-scope anchor path
status: complete
completed: 2026-05-14
parent: 260514-djs-consent-ux-polish
---

# Summary — Server-data-dir anchor for remote hosts

User reported on a Linux devcontainer that the Problems-pane URL still showed
`~/.config/Code/User/settings.json`, which doesn't exist inside the
container. The extension was running on a VS Code Server, where user
settings live at `~/.vscode-server/data/User/settings.json`.

## Fix

`resolveAnchorUri(Global, ...)` now checks `vscode.env.remoteName` first.
When set (devcontainer / WSL / SSH / attached-container / Codespaces), it
returns the server-side path:

```
$HOME / <serverFolder> / data / User / settings.json
```

where `serverFolder` is variant-aware:
- `.vscode-server` (stable)
- `.vscode-server-insiders` (Insiders)
- `.vscode-server-exploration` (Exploration)
- fallback: `.vscode-server` (VSCodium-server convention isn't standardized)

Local case unchanged.

## Files

- `src/migrations/diagnostics.ts` — `remoteName` short-circuit at the top of
  the Global branch; new `serverDataFolderName()` helper mirroring
  `userDataFolderName()`.
- `test/unit/migrations/diagnostics.test.ts` — two new tests:
  `remoteName='dev-container'` → `.vscode-server/data/User/settings.json`;
  `remoteName='wsl'` + Insiders appName → `.vscode-server-insiders/...`.
- `test/unit/vscode.mock.ts` — `vscode.env` typed with
  `remoteName: string | undefined` (default undefined).

## Verification

- `npx eslint src --ext ts` clean.
- `npm run test:unit` → **859 passing** (was 857; +2 new tests).
- `npm run compile` → webpack bundle succeeds.

## What this still doesn't cover

- VSCodium-server: no known convention; falls back to `.vscode-server` and
  may not exist. Toast's `Open Settings` button still works (falls through to
  `workbench.action.openSettingsJson`).
- Portable mode (`--user-data-dir <path>`): no public API surfaces the
  override path. Same fallback applies.
