---
quick_id: 260514-dvt
slug: remote-anchor-path
date: 2026-05-14
status: in-progress
parent: 260514-djs-consent-ux-polish
---

# Quick Task: Honor `vscode.env.remoteName` in Global anchor path

User reports the Global-scope diagnostic still anchors at
`~/.config/Code/User/settings.json` inside a Linux devcontainer — that's the
*local-install* path. The extension is running on the VS Code Server inside
the container, which stores settings at `~/.vscode-server/data/User/settings.json`.

## Fix

`src/migrations/diagnostics.ts` → `resolveAnchorUri(Global, ...)`:

- Check `vscode.env.remoteName` first. If non-undefined, return
  `~/<serverFolder>/data/User/settings.json` where `serverFolder` is:
  - `.vscode-server` (stable VS Code)
  - `.vscode-server-insiders` (Insiders)
  - `.vscode-server-exploration` (Exploration)
  - fallback: `.vscode-server` (VSCodium / unknown)
- Local case unchanged.

## Tests

Two new cases in `diagnostics.test.ts`:
- `remoteName='dev-container'` → path includes `.vscode-server/data/User/settings.json`
- `remoteName='wsl'` + Insiders appName → path includes `.vscode-server-insiders`

Mock: extend `vscode.env` with `remoteName: undefined`.
