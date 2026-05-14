---
phase: 23
slug: migrations-panel-webview
milestone: v1.5.0
status: planned
created: 2026-05-14
parent_artifacts:
  - .planning/quick/260513-oh5-consent-diagnostics/
  - .planning/quick/260513-o1k-recheck-consent-flow/
  - .planning/quick/260514-djs-consent-ux-polish/
  - .planning/quick/260514-dvt-remote-anchor-path/
  - .planning/quick/260514-ean-userdata-scheme-anchor/
---

# Phase 023 Context — Migrations Panel (Webview)

## Why we're doing this

The diagnostics-based consent UX shipped in `6f1adb2` (260513-oh5) and
iterated five times this week (260513-o1k / 260514-djs / 260514-dvt /
260514-ean) cannot reliably anchor Global-scope diagnostics at the User
settings.json file under remote-extension-host conditions
(Windows-host + Linux-devcontainer is the user's reported case, but the
same gap exists for WSL / SSH-remote / Codespaces).

The fundamental issue: there is no public extension API that exposes the
VS Code window's filesystem path to the extension host. We tried:

- Hardcoded `~/.config/Code/User/settings.json` (260513-oh5) — broke on Insiders / VSCodium.
- `vscode.env.appName` → folder mapping (260514-djs) — still broke in devcontainers.
- `vscode.env.remoteName` → `.vscode-server` path (260514-dvt) — wrong layer; the *window* is the host, not the server.
- Undocumented `vscode-userdata:` URI scheme (260514-ean) — user tested, still didn't open.

The replacement is a Webview, which is hosted by the VS Code window. It
renders in the user's actual VS Code UI regardless of where the extension
host runs. We never need to know the settings.json path — the user reads
the Webview, picks an action, and the action dispatches through the
existing `dispatchMigrationAction` chain which works via the abstracted
`workspace.getConfiguration().update(...)` API (which Microsoft routes
correctly across all hosting setups).

## What the panel owns

The Webview replaces the entire Problems-pane diagnostic surface for
migrations. Single source of truth. Going away in this phase:

- `publishConsentDiagnostics` / `clearDiagnosticsForEntryAtScope` in `src/migrations/diagnostics.ts`.
- The `'gs-behave-bdd.migrations'` `DiagnosticCollection`.
- `MigrationCodeActionProvider` and the `gs-behave-bdd.migration.action` command in `src/migrations/codeActions.ts`.
- The `vscode-userdata:` anchor hack.
- All path-resolution helpers (`resolveAnchorUri` for Global, `computeRange`, JSONC parsing for the Global anchor).

Staying:

- `dispatchMigrationAction` — moves from "command handler for Code Action" to "command handler for Webview message". Same 7 action handlers underneath.
- The summary toast — its lone button changes from `Open Problems` / `Open Settings` to `Open Migrations Panel`.
- All silent migrationMode paths (`migrate-and-delete` / `migrate-and-keep` / `skip` for case 2). Untouched.
- The evaluator, the registry, `markMigrationFinishedAtScope`. Untouched.
- The integration suite — already drives via `dispatchMigrationAction` (260513-oh5 work), so the surface change is transparent.

## Design decisions (settled with user 2026-05-14)

| Choice | Pick |
|---|---|
| View type | Webview panel (HTML/CSS/JS) |
| Discoverability | Summary toast button + command palette entry |
| Diagnostic survival | Drop all migration diagnostics — panel owns the whole surface |
| Milestone | Phase 023 of v1.5.0 |

## Planner-settled decisions (2026-05-14, /gsd-plan-phase)

| ID | Choice | Pick | Where |
|---|---|---|---|
| A | Multi-root scope | Single panel; group rows by folder when `folders.length > 1` | 023-02 |
| B | Auto-reopen on activation | No — summary toast is the canonical re-entry | 023-01 |
| C | Config-change listener granularity | Filter to `gs-behave-bdd.*` + `behave-vsc.*` namespaces (over-refresh benign) | 023-02 |
| D | Migration Mode write target | Global scope (user preference) | 023-03 |
| E | Empty-state lifecycle | Stay open with Recheck + Close (single-instance; user closes when done) | 023-01 (reserved); 023-02 (markup) |

## Plans (skeleton)

- **023-01** — `023-01-webview-shell-PLAN.md` — Webview shell: lifecycle (single-instance create / reveal / dispose), command registration, CSP-safe HTML scaffold, theme integration via CSS custom properties. Settles Decision B + reserves E.
- **023-02** — `023-02-migrations-list-PLAN.md` — Migrations list: build a view-model from current hits by re-running the evaluator in collect-only mode; render case-2 (3 buttons) and case-3 (4 buttons) per row; message-passing wiring to `dispatchMigrationAction`; configuration-change re-render; empty-state markup. Settles Decisions A + C.
- **023-03** — `023-03-migration-mode-PLAN.md` — Migration Mode section: read current value, render UI for the 4 enum values, write at Global scope on selection, re-render. Settles Decision D.
- **023-04** — `023-04-surface-swap-PLAN.md` — Replace the surfaces: toast button → opens panel; delete the diagnostics surface (`publishConsentDiagnostics`, `clearDiagnosticsForEntryAtScope`, `MigrationCodeActionProvider`, the `vscode-userdata:` anchor hack, `getDiagnosticCollection`, `diagnostics.ts` entirely); trim `dispatchMigrationAction`'s `clearDiagnosticsForEntryAtScope` call; delete `diagnostics.test.ts`. Deliberately leaves `consent.test.ts` + `migrations.test.ts` test 4.10 in a known-failing state for 023-05.
- **023-05** — `023-05-tests-PLAN.md` — Tests: new `panel.test.ts` covering lifecycle, HTML pins, message routing, dispose, config re-render, Migration Mode write, empty state. Reshape `consent.test.ts` toast assertions + audit `summarizeDiagnostics`. Reshape `migrations.test.ts` test 4.10 to assert panel-opening signal. Audit `vscode.mock.ts` for now-dead surface.

## Non-goals

- No localization (English only).
- No telemetry beyond the existing `config.logger.logInfo` audit lines.
- No bulk-action UI in v1 ("migrate all" etc.) — each migration is dispatched individually.
- No persistence across reloads beyond what `completedMigrations` already gives us.
- No webview-side filtering/search (typically 0-5 pending migrations; not needed).

## Test inventory at phase start

- 855 unit tests passing.
- The integration suite at `test/integration/migration-consent suite/` drives via `dispatchMigrationAction` — surface-agnostic.
- `test/unit/migrations.test.ts` test 4.10 asserts on the diagnostic surface — needs reshape to assert panel-opening signal.
- `test/unit/migrations/consent.test.ts` asserts on the toast button set + diagnostic collection state — needs reshape for the single `Open Migrations Panel` button.

## Risk register

- **Webview message-passing reliability** — VS Code's webview API has well-known patterns for this; sticking to them mitigates.
- **CSP / nonce hygiene** — required by VS Code for webview HTML; standard boilerplate, but easy to get wrong. Plan 01 should establish this.
- **Theme drift** — using CSS custom properties (`var(--vscode-foreground)` etc.) keeps the panel themed correctly across light/dark/high-contrast.
- **Stale view** — if the user changes settings.json externally while the panel is open, the list needs to re-evaluate. Plan 02 should address re-render triggers (configuration change listener + manual refresh).
