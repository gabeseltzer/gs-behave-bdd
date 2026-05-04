---
created: 2026-05-04T18:52:00.320Z
title: Make more notifications suppressable
area: notifications
files:
  - src/notifications.ts
  - src/logger.ts
---

## Problem

Phase 15 added the `gs-behave-bdd.suppressedNotifications` infrastructure
(`isSuppressed` / `suppressNotification` in `src/notifications.ts`), but only a
handful of notifications actually opt into it. Many user-facing warnings and
info messages — particularly those raised through `config.logger.showWarn` /
`showError` and the various ad-hoc `vscode.window.show*Message` call sites —
still fire unconditionally on every activation or every test run, with no
"Don't show again" affordance.

This is the #1 source of noise feedback for the extension.

## Solution

1. Audit every `vscode.window.showInformationMessage` / `showWarningMessage` /
   `showErrorMessage` call site, plus every `logger.showWarn` / `showError`
   path, and classify each as:
   - Always-show (genuine errors that need user action every time)
   - Suppressable (recoverable warnings, informational hints, migration prompts)
2. For each suppressable one, assign a stable key (e.g.
   `featuresPath.migration`, `bundledBehave.fallback`, `pythonExt.notReady`)
   and route it through `notifications.ts` so it adds a "Don't show again"
   button that calls `suppressNotification(key, wkspUri)`.
3. Document the keys in the README / settings schema so users can also edit
   `suppressedNotifications` directly in settings.json.
4. Consider a small helper `showSuppressableMessage(key, wkspUri, kind, msg, ...actions)`
   in `notifications.ts` to avoid repeating the suppression boilerplate at
   every call site.
