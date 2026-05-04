---
created: 2026-05-04T18:52:00.320Z
title: Migrate settings from previous extension versions
area: configuration
files:
  - src/configuration.ts:60-84
  - src/common.ts:202
  - src/discovery/projectList.ts:167
  - src/notifications.ts:198-238
  - src/settings.ts:14
---

## Problem

Today the extension silently reads legacy settings from the `behave-vsc` namespace
(and similar old-extension prefixes) as a fallback whenever a `gs-behave-bdd.*`
value is unset. See `src/configuration.ts` (`legacyWinConfig` / `legacyWkspConfig`),
`src/common.ts`, and `src/discovery/projectList.ts` — all do `getConfiguration("behave-vsc", ...)`
as a transparent fallback.

This works but has real downsides:
- Users never see their old settings in the gs-behave-bdd UI / settings.json — they
  remain under the old namespace forever, which is confusing and breaks discoverability.
- Two sources of truth: behavior depends on which namespace happens to be set at
  which scope (Window vs WorkspaceFolder), making bugs hard to reproduce.
- We can never cleanly drop the legacy fallback code path because there's no
  signal that migration has occurred.
- The featuresPath migration prompt in `src/notifications.ts` is the only place
  we *write* a canonical value — everything else is read-only fallback.

## Solution

Build a one-shot migration step that runs on activation:
1. For each known legacy key (enumerate them — `featuresPath(s)`, env presets,
   `runParallel`, `xRay`, etc.), inspect the `behave-vsc` config at every scope
   (Global, Workspace, WorkspaceFolder).
2. If a legacy value exists AND the canonical `gs-behave-bdd.*` key is unset at
   that scope, copy the value to the canonical namespace at the same scope, then
   clear the legacy value.
3. Show a single summary notification ("Migrated N settings from behave-vsc")
   that is itself suppressable via the Phase 15 infrastructure.
4. Record a migration version marker (e.g. `gs-behave-bdd.migrationVersion`) so
   we don't re-run on every activation and can iterate the migration logic later.
5. Once shipped and bedded in, delete the silent-fallback reads in
   `configuration.ts` / `common.ts` / `discovery/projectList.ts`.

Reuse the existing `featuresPath` migration prompt pattern from
`src/notifications.ts` (FEATURES_PATH_NAMESPACES, destNamespace logic) as the
template — it already handles the "source vs canonical" model correctly.
