# Phase 15: Notification Suppression Infrastructure - Research

**Researched:** 2026-04-27
**Domain:** VSCode Extension API — WorkspaceConfiguration scope detection, notification button handling, settings migration
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Suppression Module API Shape**
- **D-01:** Plain exported functions (not class or namespace). Matches codebase style in `common.ts`.
- **D-02:** New dedicated file `src/notifications.ts` for all notification-related utilities.
- **D-03:** Module provides a full notification wrapper `showSuppressibleNotification(key, message, buttons, wkspUri)` that auto-appends "Don't Show Again" and handles suppression internally.
- **D-04:** Wrapper returns the user's selected action (`string | undefined`), excluding "Don't Show Again" which is handled internally. Callers can react to button choices (e.g., "Select Project" → run command).

**Migration Timing & Error Handling**
- **D-05:** Migration runs eagerly on activation (inside `activate()`), before any notifications fire.
- **D-06:** After writing the new array value, remove the old `suppressMultiConfigNotification` key from settings via `update(oldKey, undefined)`.
- **D-07:** On migration failure (e.g., read-only workspace), log a warning to the output channel but don't notify the user. Old boolean stays, new array gets created with default `[]`.
- **D-08:** Migration writes the array value at the same scope level where the old boolean was found (use `inspect()` to detect scope).

**Notification Key Naming Convention**
- **D-09:** Keys are camelCase freeform strings (e.g., `multiConfigNotification`, `featuresPathMigration`).
- **D-10:** No validation of key values — unknown keys in the array are silently ignored.
- **D-11:** Deduplicate on write — `suppressNotification()` checks if key already exists before appending.

### Claude's Discretion
- Internal function naming and parameter ordering within `src/notifications.ts`
- Whether migration function is exported (for unit testing) or kept private
- Whether to export a `migrateNotificationSuppression()` function separately or inline in activation

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NOTIF-01 | New `suppressedNotifications` setting in package.json — array of strings, default `[]` | Schema pattern verified against existing `featuresPaths` array setting (package.json L44-L52). Use `scope: "resource"`, `type: "array"`, `items.type: "string"`, `default: []`. |
| NOTIF-02 | Reusable module checks suppression and handles "Don't Show Again" by appending key | `src/notifications.ts` exports plain functions (D-01). `isSuppressed(key, wkspUri)` reads `WorkspaceSettings.suppressedNotifications`. `suppressNotification(key, wkspUri)` writes via `wkspCfg.update(...)` with dedup (D-11). |
| NOTIF-03 | "Don't Show Again" writes to `WorkspaceFolder` scope by default | The user-driven suppression write uses `vscode.ConfigurationTarget.WorkspaceFolder` (verified pattern at extension.ts L178). The `wkspUri` parameter scopes `getConfiguration("gs-behave-bdd", wkspUri)` to that folder. |
| NOTIF-04 | Multi-config notification migrated to use new infrastructure with key `multiConfigNotification` | Replace inline block at extension.ts L141-L181 with `await showSuppressibleNotification("multiConfigNotification", message, ["Select Project", "Show Details"], wkspUri)`. Returned action drives the existing switch. |
| NOTIF-05 | `suppressMultiConfigNotification` boolean removed from package.json | Remove L120-L125 block from package.json. Schema removal must happen AFTER migration code reads the old key, but the migration uses `inspect()` which works regardless of schema presence. Old key remains in user settings.json files until migration removes it (D-06). |
| NOTIF-06 | Existing `suppressMultiConfigNotification: true` auto-migrated to `suppressedNotifications: ["multiConfigNotification"]` | Migration runs eagerly (D-05), uses `inspect()` to detect scope (D-08), writes array at same scope, removes old key (D-06). Failure path: warn to output channel (D-07). |
| NOTIF-07 | Unit tests for suppression module (check, suppress, migrate) | Project has Mocha + Sinon infrastructure with `vscode.mock.ts`. Pattern: stub `vscode.workspace.getConfiguration`, assert `.update()` calls. Existing template: `test/unit/settings/multiPathPrecedence.test.ts`. |
| NOTIF-08 | `testWorkspaceConfig` mock updated for new setting shape | Add `suppressedNotifications: string[]` field; remove `suppressMultiConfigNotification`. Update three switch cases: `get()` (L110-L111), `inspect()` (L175-L176), `getExpected()` (L278-L279). Update constructor signature and `WorkspaceSettings` to read the new key. |
</phase_requirements>

## Summary

This is a low-risk, well-scoped infrastructure phase. All technical questions resolve cleanly:
the VSCode `WorkspaceConfiguration` API exposes everything needed via `inspect()` (returns
`globalValue`/`workspaceValue`/`workspaceFolderValue` per scope) and `update()` (accepts a
matching `ConfigurationTarget` enum). `showInformationMessage` returns `Thenable<string | undefined>`
— `undefined` on dismiss, the button label (`string`) on click — making the wrapper trivial to
implement.

The codebase already establishes every pattern this phase needs: array setting schema (`featuresPaths`),
scope-aware update at WorkspaceFolder (extension.ts L178), per-workspace settings via `config.workspaceSettings[wkspUri.path]`,
strict-undefined throw pattern in `WorkspaceSettings` constructor, and three-method test mock
in `testWorkspaceConfig.ts`. The new module slots in alongside `common.ts` as plain exported functions.

The one fidelity gap to flag: `TestWorkspaceConfig.inspect()` only sets `workspaceFolderValue`
(testWorkspaceConfig.ts L185). Migration tests that exercise scope detection across `globalValue`/
`workspaceValue` cannot use `TestWorkspaceConfig` directly — they need an inline `makeConfig` helper
matching the `multiPathPrecedence.test.ts` pattern.

**Primary recommendation:** Implement the wrapper as `async function showSuppressibleNotification`,
with two helpers (`isSuppressed`, `suppressNotification`) and one migration function
(`migrateLegacySuppressMultiConfig`). Run migration synchronously-ish (await it before the first
`updateDiscoveryUX` call) inside `activate()`'s try block. Use the existing `WorkspaceSettings`
constructor pattern: throw if undefined for the new array setting (after schema is added with `default: []`).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Notification button rendering | VS Code extension host (Window) | — | `vscode.window.showInformationMessage` is the only API for modal-like notifications. |
| Suppression state read | Configuration layer (`WorkspaceSettings`) | Cross-cutting (`notifications.ts`) | State read goes through the per-workspace settings singleton (`config.workspaceSettings[uri.path]`) for cache locality and consistency with all other settings reads. |
| Suppression state write | VS Code Configuration API direct | — | Writes call `vscode.workspace.getConfiguration(...).update(...)` directly (per existing pattern at extension.ts L178). The `WorkspaceSettings` cache is read-only; it auto-refreshes via `onDidChangeConfiguration`. |
| Migration (read old, write new) | Cross-cutting (`notifications.ts`) | Configuration layer | One-shot eager logic that runs once per `activate()`. Lives with the suppression module, not in `WorkspaceSettings` (which is a value object, not a side-effect runner). |
| Multi-config notification trigger | Extension layer (`extension.ts::updateDiscoveryUX`) | Cross-cutting (`notifications.ts`) | The trigger logic (when to show) stays in `updateDiscoveryUX`; the wrapper handles suppression mechanics. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `vscode` | `^1.82.0` (engine) | Configuration API, notification API, scope-aware writes | Native VSCode API — no third-party alternative for extension settings or notifications. [VERIFIED: package.json L289] |
| TypeScript | 4.5.5 | Source language | Project standard. [VERIFIED: AI_INSTRUCTIONS.md] |
| Mocha | 9.2.2 | Unit test framework | Project standard. [VERIFIED: package.json] |
| Sinon | 21.0.1 | Stub/spy library for unit tests | Project standard. [VERIFIED: package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | — | — | This phase requires no new dependencies. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Per-key boolean settings (e.g., `suppressMultiConfigNotification`, `suppressFeaturesPathNotification`) | `suppressedNotifications: string[]` (chosen) | Per-key booleans don't scale; user already has 1 such setting. STATE.md: "single `suppressedNotifications` string array setting (not per-key booleans)" — locked at milestone level. |
| `extensionContext.globalState`/`workspaceState` (hidden) | Visible settings entry (chosen) | STATE.md: "Setting is visible in settings UI (not hidden in workspaceState)" — locked at milestone level. Visible settings let users un-suppress without commands. |

**Installation:**
```bash
# No new dependencies required for this phase.
```

**Version verification:** No new packages to verify — phase uses only existing `vscode` API
already pinned at `^1.82.0`.

## Architecture Patterns

### System Architecture Diagram

```
                       ┌──────────────────────────────────────────┐
                       │         activate() [extension.ts]        │
                       │  ┌────────────────────────────────────┐  │
                       │  │ 1. migrateLegacySuppressMultiConfig│  │
                       │  │    (eager, before notifications)   │  │
                       │  └─────────────┬──────────────────────┘  │
                       │                │ for each wkspUri        │
                       │                ▼                         │
                       │  ┌─────────────────────────────────────┐ │
                       │  │ inspect("suppressMultiConfig...")   │ │
                       │  │  → detect scope (folder/wksp/global)│ │
                       │  └─────────────┬───────────────────────┘ │
                       │                │ if true at any scope    │
                       │                ▼                         │
                       │  ┌─────────────────────────────────────┐ │
                       │  │ update("suppressedNotifications",   │ │
                       │  │   [...existing, "multiConfig..."],  │ │
                       │  │   matchingTarget)                   │ │
                       │  │ update("suppressMultiConfig...",    │ │
                       │  │   undefined, matchingTarget)        │ │
                       │  └─────────────────────────────────────┘ │
                       │                │ failure → showWarn      │
                       │                ▼                         │
                       │  ┌────────────────────────────────────┐  │
                       │  │ updateDiscoveryUX(...) [as today]  │  │
                       │  │  ┌──────────────────────────────┐  │  │
                       │  │  │ if entry.alsoFoundConfigs:   │  │  │
                       │  │  │   showSuppressibleNotif(     │  │  │
                       │  │  │     "multiConfigNotification"│  │  │
                       │  │  │     message,                 │  │  │
                       │  │  │     ["Select","Show Details"]│  │  │
                       │  │  │     wkspUri)                 │  │  │
                       │  │  │   → action ∈ buttons|undef   │  │  │
                       │  │  └──────────────────────────────┘  │  │
                       │  └────────────────────────────────────┘  │
                       └──────────────────────────────────────────┘
                                          │
                                          ▼
                       ┌──────────────────────────────────────────┐
                       │   src/notifications.ts (NEW MODULE)      │
                       │ ┌─────────────────────────────────────┐  │
                       │ │ isSuppressed(key, wkspUri)          │  │
                       │ │  → reads config.workspaceSettings   │  │
                       │ │    [wkspUri.path].suppressedNotif.. │  │
                       │ └─────────────────────────────────────┘  │
                       │ ┌─────────────────────────────────────┐  │
                       │ │ suppressNotification(key, wkspUri)  │  │
                       │ │  → reads current array, dedupes,    │  │
                       │ │    writes to WorkspaceFolder scope  │  │
                       │ └─────────────────────────────────────┘  │
                       │ ┌─────────────────────────────────────┐  │
                       │ │ showSuppressibleNotification(...)   │  │
                       │ │  1. if isSuppressed → return undef  │  │
                       │ │  2. show msg with buttons + "DSA"   │  │
                       │ │  3. await user choice               │  │
                       │ │  4. if "Don't Show Again" →         │  │
                       │ │     suppressNotification();         │  │
                       │ │     return undefined                │  │
                       │ │  5. else return action              │  │
                       │ └─────────────────────────────────────┘  │
                       │ ┌─────────────────────────────────────┐  │
                       │ │ migrateLegacySuppressMultiConfig... │  │
                       │ │  (one-shot, called by activate)     │  │
                       │ └─────────────────────────────────────┘  │
                       └──────────────────────────────────────────┘
```

### Component Responsibilities

| Component | File | Responsibility |
|-----------|------|----------------|
| `showSuppressibleNotification` | `src/notifications.ts` (new) | Top-level wrapper: check suppression, show with appended "Don't Show Again", handle DSA internally, return user action. |
| `isSuppressed` | `src/notifications.ts` (new) | Pure read of `config.workspaceSettings[wkspUri.path].suppressedNotifications`. Returns `boolean`. |
| `suppressNotification` | `src/notifications.ts` (new) | Write helper: read current array, dedupe (D-11), `update(...)` to `WorkspaceFolder` scope (D-03/NOTIF-03). Logs warn on failure. |
| `migrateLegacySuppressMultiConfig` | `src/notifications.ts` (new) | One-shot migration: `inspect()` old key, write array at same scope, remove old key. Called once per workspace folder in `activate()`. |
| `WorkspaceSettings.suppressedNotifications` | `src/settings.ts` (modified) | Replaces `suppressMultiConfigNotification`. Loaded with strict-undefined-throw pattern. Type: `readonly string[]`. |
| `updateDiscoveryUX` multi-config block | `src/extension.ts` L141-L181 (modified) | Replaces inline `showInformationMessage` with `await showSuppressibleNotification(...)` call. Switch on returned action remains. |
| `TestWorkspaceConfig` | `src/testWorkspaceConfig.ts` (modified) | Drop `suppressMultiConfigNotification`; add `suppressedNotifications: string[]` to constructor, `get()`, `inspect()`, `getExpected()`. |

### Recommended Project Structure
```
src/
├── notifications.ts        # NEW — suppression module + migration helper
├── extension.ts            # MODIFIED — replace inline notification (L141-L181), call migration in activate()
├── settings.ts             # MODIFIED — replace suppressMultiConfigNotification with suppressedNotifications
├── testWorkspaceConfig.ts  # MODIFIED — mock fields and switch cases
└── common.ts               # UNCHANGED (style template only)
test/unit/
├── notifications.test.ts   # NEW — covers NOTIF-07: check, suppress, migrate
└── settings/
    └── multiPathPrecedence.test.ts  # MODIFIED — drop suppressMultiConfigNotification from BASE_CFG, add suppressedNotifications: []
package.json                # MODIFIED — remove suppressMultiConfigNotification, add suppressedNotifications
```

### Pattern 1: Strict-Undefined Settings Loading
**What:** All settings declared in package.json are loaded in `WorkspaceSettings` constructor with a throw-on-undefined check, because VSCode populates the package.json default for any registered key.
**When to use:** Whenever adding a new setting to `WorkspaceSettings`.
**Example:**
```typescript
// Source: src/settings.ts L155-L167 (existing pattern for boolean)
const suppressedNotificationsCfg: string[] | undefined = get<string[]>("suppressedNotifications");
if (suppressedNotificationsCfg === undefined)
  throw "suppressedNotifications is undefined";

this.suppressedNotifications = suppressedNotificationsCfg;
```

**Why throw:** If the value is undefined at runtime, the package.json schema is wrong (or the
key isn't registered). Failing loud at activation surfaces the bug immediately rather than letting
a malformed setting cascade silently.

### Pattern 2: Scope-Preserving Migration
**What:** Use `inspect()` to detect which scope holds the legacy value, then write the new value
to the matching `ConfigurationTarget`.
**When to use:** Migrating a legacy setting key to a new key, preserving user intent.
**Example:**
```typescript
// Source: VS Code API spec — inspect() returns { globalValue?, workspaceValue?, workspaceFolderValue?, ... }
// [CITED: vshaxe.github.io/vscode-extern/vscode/WorkspaceConfiguration.html]
async function migrateLegacySuppressMultiConfig(wkspUri: vscode.Uri): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("gs-behave-bdd", wkspUri);
  const insp = cfg.inspect<boolean>("suppressMultiConfigNotification");
  if (!insp) return; // schema unregistered after NOTIF-05 — nothing to migrate

  // Determine scope where legacy value was set; precedence: most-specific wins
  let target: vscode.ConfigurationTarget | undefined;
  let legacyValue: boolean | undefined;
  if (insp.workspaceFolderValue !== undefined) {
    target = vscode.ConfigurationTarget.WorkspaceFolder;
    legacyValue = insp.workspaceFolderValue;
  } else if (insp.workspaceValue !== undefined) {
    target = vscode.ConfigurationTarget.Workspace;
    legacyValue = insp.workspaceValue;
  } else if (insp.globalValue !== undefined) {
    target = vscode.ConfigurationTarget.Global;
    legacyValue = insp.globalValue;
  }

  if (target === undefined || legacyValue !== true) return; // not set, or set to false (default) — nothing to do

  try {
    // Read existing suppressedNotifications at the SAME scope (not merged across scopes)
    const existingInsp = cfg.inspect<string[]>("suppressedNotifications");
    const existingArr =
      target === vscode.ConfigurationTarget.WorkspaceFolder ? existingInsp?.workspaceFolderValue :
      target === vscode.ConfigurationTarget.Workspace ? existingInsp?.workspaceValue :
      existingInsp?.globalValue;
    const merged = Array.isArray(existingArr) ? [...existingArr] : [];
    if (!merged.includes("multiConfigNotification")) merged.push("multiConfigNotification");

    await cfg.update("suppressedNotifications", merged, target);
    await cfg.update("suppressMultiConfigNotification", undefined, target);
  } catch (e) {
    // D-07: log warning to output channel, do not notify user
    config.logger.logInfo(
      `Could not migrate suppressMultiConfigNotification to suppressedNotifications: ${e}`,
      wkspUri
    );
  }
}
```

### Pattern 3: Notification Wrapper with Internal "Don't Show Again"
**What:** Wrapper appends "Don't Show Again" to caller's button list, intercepts that choice
internally (writes to settings, returns `undefined`), and returns the user's actual action otherwise.
**When to use:** Any notification the user should be able to permanently dismiss.
**Example:**
```typescript
// [VERIFIED: VS Code API — showInformationMessage returns Thenable<T | undefined>]
// [CITED: github.com/microsoft/vscode/issues/1248 — undefined on dismiss confirmed]
const DONT_SHOW_AGAIN = "Don't Show Again";

export async function showSuppressibleNotification(
  key: string,
  message: string,
  buttons: string[],
  wkspUri: vscode.Uri
): Promise<string | undefined> {
  if (isSuppressed(key, wkspUri)) return undefined;

  const allButtons = [...buttons, DONT_SHOW_AGAIN];
  const action = await vscode.window.showInformationMessage(message, ...allButtons);

  if (action === DONT_SHOW_AGAIN) {
    await suppressNotification(key, wkspUri);
    return undefined;
  }

  return action; // string (one of the caller's buttons) or undefined (dismissed)
}
```

### Pattern 4: Deduplicating Suppression Write
**What:** Read current array, check membership, append if absent, write back.
**When to use:** D-11 — prevent the same key being appended twice if "Don't Show Again" is somehow re-clicked or migration runs twice.
**Example:**
```typescript
export async function suppressNotification(key: string, wkspUri: vscode.Uri): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("gs-behave-bdd", wkspUri);
  // Read current value at WorkspaceFolder scope only (D-03 / NOTIF-03)
  const insp = cfg.inspect<string[]>("suppressedNotifications");
  const current = Array.isArray(insp?.workspaceFolderValue) ? insp!.workspaceFolderValue : [];
  if (current.includes(key)) return; // D-11: dedup
  const next = [...current, key];
  try {
    await cfg.update("suppressedNotifications", next, vscode.ConfigurationTarget.WorkspaceFolder);
  } catch (e) {
    config.logger.logInfo(`Could not suppress notification "${key}": ${e}`, wkspUri);
  }
}
```

### Anti-Patterns to Avoid
- **Reading `cfg.get<string[]>("suppressedNotifications")` for dedup before write:** `get()` returns the *effective* value (most-specific scope wins, falling back through the chain). For dedup we must compare against the value at the *same* scope we're about to write — otherwise we may re-write a folder-scope copy of an array already set globally.
- **Writing to `Global` (or omitting `ConfigurationTarget`) for the user's "Don't Show Again":** NOTIF-03 mandates `WorkspaceFolder`. Omitting the parameter falls back to Workspace scope when the configuration isn't resource-specific — breaks the requirement.
- **Awaiting migration *inside the for-loop* of `updateDiscoveryUX`:** Migration must finish *before* `updateDiscoveryUX` runs (D-05). Run it in a separate loop earlier in `activate()`.
- **Throwing from migration on failure:** D-07 mandates warn-and-continue. Migration is best-effort; failure leaves both keys intact, which is recoverable user-side.
- **Using `===` to compare button labels:** Fine for ASCII strings, but verify consistent quoting. Use a constant `DONT_SHOW_AGAIN = "Don't Show Again"` to avoid divergence between append site and intercept site.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-scope settings detection | Custom config-file reader | `vscode.WorkspaceConfiguration.inspect<T>()` | Returns all five scope levels (`defaultValue`, `globalValue`, `workspaceValue`, `workspaceFolderValue`, `*LanguageValue`) plus language-specific overrides. [CITED: vshaxe.github.io/vscode-extern/vscode/WorkspaceConfiguration.html] |
| Scope-aware setting write | Direct `fs.writeFile` to settings.json | `WorkspaceConfiguration.update(key, value, target)` | VSCode handles file location (user vs `.vscode/settings.json` vs `.code-workspace`), JSONC formatting, and notification of other extensions. |
| Notification dismiss handling | Custom timeout/event-listener approach | `await showInformationMessage(msg, ...buttons)` returning `Thenable<string \| undefined>` | Native API: `undefined` on dismiss, button label on click. [CITED: github.com/microsoft/vscode/issues/1248] |
| Migration once-only guard | Module-level boolean / counter | The dedup check (D-11) + the source-of-truth-once design | Migration is idempotent: if it ran already, the old key is undefined → early return; if the new array already contains the key, dedup skips append. No flag needed. |

**Key insight:** Every primitive needed for this phase already exists in the VS Code API at the
HIGH-confidence level. The phase is pure glue: compose existing primitives, no novel mechanics.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | User settings.json files containing `suppressMultiConfigNotification: true` (across global, workspace, and workspaceFolder scopes) | Migration writes new array key + removes old key at same scope (D-06, D-08). One-time per scope per user. |
| Live service config | None — extension does not register external services. | None. |
| OS-registered state | None — extension does not register OS hooks. | None. |
| Secrets/env vars | None — no secrets touch this phase. | None. |
| Build artifacts | None — TypeScript-only change, webpack bundle regenerates from source. | Standard `npm run compile` after changes. |

**The canonical question:** *After every file in the repo is updated, what runtime systems still
have the old string cached, stored, or registered?* → User settings.json files (handled by D-06
migration); no other state.

## Common Pitfalls

### Pitfall 1: Removing schema before migration runs
**What goes wrong:** If we remove `suppressMultiConfigNotification` from package.json *before* the
migration code runs, `cfg.inspect("suppressMultiConfigNotification")` may return `undefined` instead of
exposing the user's old explicit value.
**Why it happens:** VSCode's `inspect()` documentation states the configuration name must be a
registered leaf. [CITED: github.com/microsoft/vscode-docs/issues/2601]
**How to avoid:** Empirically, VSCode still surfaces user-set values for unregistered keys via
`globalValue`/`workspaceValue`/`workspaceFolderValue` (these come from settings.json regardless of
schema). However, to be safe, the implementation can either: (a) keep the schema until v1.5.0 with
`deprecationMessage`, or (b) verify in integration test that `inspect()` of an unregistered key with
a value in settings.json still returns the value. **Recommended:** verify with a smoke test before
removing schema; if `inspect()` returns undefined post-removal, migration code reads `cfg.get()` as
fallback (which works for unregistered keys whose value is in settings.json). [ASSUMED — needs
verification in Wave 0]
**Warning signs:** Migration silently no-ops on real user installs; old key persists; new array empty.

### Pitfall 2: Writing dedup against wrong scope
**What goes wrong:** Dedup reads `cfg.get<string[]>("suppressedNotifications")` (which merges scopes,
most-specific wins) and finds `"multiConfigNotification"` already present at *Workspace* scope, so
skips the WorkspaceFolder write — but the user's intent was to suppress at WorkspaceFolder.
**Why it happens:** `get()` is scope-aware merging; `inspect()` exposes per-scope values.
**How to avoid:** Always read `inspect().workspaceFolderValue` (or matching target's scope) for dedup,
never `get()`.
**Warning signs:** Suppression appears effective, but user sees notification again after reopening
the workspace folder if a higher-scope `["multiConfigNotification"]` was previously cleared.

### Pitfall 3: Activation race — migration not awaited before notification fires
**What goes wrong:** `activate()` calls `migrateLegacySuppressMultiConfig()` without `await`, then
calls `updateDiscoveryUX(...)` which calls `showSuppressibleNotification(...)`. The check reads the
old `suppressMultiConfigNotification` (still true, but new array empty), shows the notification anyway.
**Why it happens:** D-05 says "before any notifications fire" but `activate()` is async and `await`
in `activate()` is normally avoided per AI_INSTRUCTIONS.md ("Never block activation").
**How to avoid:** Migration is fast (one inspect + at most two updates per workspace). The
`activate()` rule is "avoid await unless absolutely necessary" — migration is necessary because
it gates correctness of the immediately-following notification. Either: (a) `await` the migration
explicitly, with a `try/catch` to enforce D-07 fail-soft, or (b) reload settings via
`config.reloadSettings(wkspUri)` after migration so the cached `WorkspaceSettings` reflects the
new array.
**Warning signs:** Users who had suppressed notifications see them re-appear after upgrading.

### Pitfall 4: WorkspaceSettings cache not refreshed post-migration
**What goes wrong:** Migration writes `suppressedNotifications: ["multiConfigNotification"]` via
`cfg.update(...)`, but `config.workspaceSettings[wkspUri.path]` was constructed earlier in
`activate()` with the old settings (empty array). `isSuppressed()` reads the cache → returns false →
notification fires anyway.
**Why it happens:** `WorkspaceSettings` is constructed once and cached; `update()` does NOT
auto-refresh that cache. The `onDidChangeConfiguration` handler at extension.ts L1016 *does* trigger
`reloadSettings()` — but only after VSCode fires the change event, which is async and may not have
fired by the time `updateDiscoveryUX` runs.
**How to avoid:** After migration writes succeed, call `config.reloadSettings(wkspUri)` for the
affected workspaces, *or* read directly from `cfg.get<string[]>("suppressedNotifications")` inside
`isSuppressed()` rather than from the cached `WorkspaceSettings`. **Recommended:** read from
`config.workspaceSettings` (consistent with all other settings) but add an explicit reload after
migration in `activate()`.
**Warning signs:** Migration logs success but suppressed notifications still fire on the same activation.

### Pitfall 5: TestWorkspaceConfig.inspect() only sets workspaceFolderValue
**What goes wrong:** Migration unit tests that construct a `TestWorkspaceConfig` with the old
boolean only see `workspaceFolderValue` set in `inspect()`. Tests cannot exercise the
`globalValue` or `workspaceValue` migration paths via `TestWorkspaceConfig`.
**Why it happens:** `testWorkspaceConfig.ts` L185 hardcodes `workspaceFolderValue: response`.
**How to avoid:** Use the inline `makeConfig` helper pattern from `multiPathPrecedence.test.ts`
(L22-L35) which lets the test specify which scope value is set. Reserve `TestWorkspaceConfig` for
end-to-end-flavor unit tests where the scope detail doesn't matter.
**Warning signs:** Test coverage gaps in scope-detection branches; integration tests catch bugs
unit tests should have caught.

### Pitfall 6: ESLint unused-variable warnings in migration code
**What goes wrong:** Migration may declare `_target` or destructure unused `defaultValue` from
`inspect()` result, triggering ESLint errors per project's `.eslintrc.js`.
**Why it happens:** Project enforces unused-variable rule with underscore-prefix exception.
**How to avoid:** Follow the underscore-prefix convention or omit unused destructured keys entirely.
**Warning signs:** `npx eslint src --ext ts` reports errors after `notifications.ts` is added.

## Code Examples

### Reading suppressedNotifications in WorkspaceSettings

```typescript
// Source: src/settings.ts pattern (existing — featuresPaths handling)
// [VERIFIED: src/settings.ts L190 reads featuresPaths as string[] | undefined]

const suppressedNotificationsCfg: string[] | undefined = get<string[]>("suppressedNotifications");
if (suppressedNotificationsCfg === undefined)
  throw "suppressedNotifications is undefined";

// VSCode returns the package.json default ([]) when no explicit value is set.
this.suppressedNotifications = suppressedNotificationsCfg;
```

### isSuppressed reading via WorkspaceSettings cache

```typescript
// Source: src/notifications.ts (new)
import { config } from "./configuration";

export function isSuppressed(key: string, wkspUri: vscode.Uri): boolean {
  const wkspSettings = config.workspaceSettings[wkspUri.path];
  return wkspSettings?.suppressedNotifications?.includes(key) ?? false;
}
```

### Wiring into extension.ts (replacing L141-L181)

```typescript
// Source: src/extension.ts (modified) — replaces inline block at L141-L181
// [VERIFIED: existing block at extension.ts L141-L181]

if (entry.alsoFoundConfigs && entry.alsoFoundConfigs.length > 0) {
  // D-09: Always log full results to output channel regardless of suppression
  config.logger.logInfo(`Multiple behave configs found:`, wkspUri);
  const primaryRelPath = entry.configFileUri
    ? vscode.workspace.asRelativePath(entry.configFileUri, false)
    : 'unknown';
  config.logger.logInfo(`  • ${primaryRelPath} (active)`, wkspUri);
  for (const alsoUri of entry.alsoFoundConfigs) {
    const relPath = vscode.workspace.asRelativePath(alsoUri, false);
    config.logger.logInfo(`  • ${relPath}`, wkspUri);
  }

  // Build the message (unchanged from existing code)
  const totalConfigs = entry.alsoFoundConfigs.length + 1;
  const configLines = [`• ${primaryRelPath} (active)`];
  for (const alsoUri of entry.alsoFoundConfigs) {
    configLines.push(`• ${vscode.workspace.asRelativePath(alsoUri, false)}`);
  }
  const message = `Behave BDD: Found ${totalConfigs} behave configs:\n${configLines.join('\n')}\nUse "Behave BDD: Select Project" to switch.`;

  // NEW: delegate suppression to wrapper (NOTIF-04)
  // Note: not awaited — preserves fire-and-forget behavior of original code
  showSuppressibleNotification(
    "multiConfigNotification",
    message,
    ['Select Project', 'Show Details'],
    wkspUri
  ).then(action => {
    if (action === 'Select Project') {
      vscode.commands.executeCommand('gs-behave-bdd.selectProject');
    } else if (action === 'Show Details') {
      vscode.commands.executeCommand('gs-behave-bdd.openOutput');
    }
    // "Don't Show Again" handled internally by wrapper — never reaches here
  });
}
```

### package.json schema change

```jsonc
// REMOVE this block (L120-L125):
"gs-behave-bdd.suppressMultiConfigNotification": {
  "scope": "resource",
  "type": "boolean",
  "markdownDescription": "Suppress the notification shown when multiple behave config files are found in subdirectories. Scan results are always logged to the output channel regardless of this setting.",
  "default": false
}

// ADD this block (NOTIF-01):
"gs-behave-bdd.suppressedNotifications": {
  "scope": "resource",
  "type": "array",
  "items": { "type": "string" },
  "markdownDescription": "List of notification keys that have been dismissed via 'Don't Show Again'. Edit this list to re-enable suppressed notifications. Known keys: `multiConfigNotification` (multiple behave configs found).",
  "default": []
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-notification boolean settings | Single `suppressedNotifications: string[]` setting | This phase (v1.4.0) | Scales to N notifications without N schema entries; visible in Settings UI; user can re-enable by editing array. |
| Inline `vscode.window.showInformationMessage(...).then(...)` in extension.ts | `await showSuppressibleNotification(key, msg, buttons, wkspUri)` wrapper | This phase (v1.4.0) | Centralizes suppression logic; "Don't Show Again" appended automatically; consistent UX across notifications. |
| Migration via VSCode native deprecation messages only | Eager programmatic migration in `activate()` (D-05) | This phase (v1.4.0) | Existing users keep their preference without action; old key removed (D-06) so settings.json stays clean. |

**Deprecated/outdated:** None — all current patterns remain valid.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | After removing `suppressMultiConfigNotification` from package.json schema, `cfg.inspect()` still returns `globalValue`/`workspaceValue`/`workspaceFolderValue` for the unregistered key when set in settings.json | Pitfall 1, NOTIF-05 | **MEDIUM** — If false, migration silently no-ops for existing users. Mitigation: keep schema in v1.4.0 with `deprecationMessage`, or fall back to `cfg.get()`. Verify in Wave 0 with a quick integration smoke test, OR follow the safer D-08 path: read `inspect()` *before* removing schema. **Recommended:** Wave 0 verification task confirms `inspect()` of unregistered key with value in settings.json. |
| A2 | `WorkspaceSettings` cache (`config.workspaceSettings[wkspUri.path]`) does NOT auto-refresh after `cfg.update(...)` is awaited; an explicit `config.reloadSettings(wkspUri)` is required | Pitfall 4 | **LOW** — If wrong (i.e., update auto-refreshes), the explicit reload is harmless. If right (most likely based on configuration.ts L54-L66 pattern), failing to reload causes Pitfall 4 bug. |
| A3 | The package.json schema `default: []` causes `cfg.get<string[]>("suppressedNotifications")` to return `[]` (not `undefined`) when no explicit value is set | NOTIF-01, Pattern 1 | **LOW** — Matches existing `featuresPaths` pattern (package.json L51 `"default": []`); `multiPathPrecedence.test.ts` L262-L266 confirms `TestWorkspaceConfig` returns `[]`. Verified. |

**Verification plan for A1:** In Wave 0 of execution, write a one-liner integration smoke test that:
(1) registers a value in settings.json for an unregistered key, (2) calls `getConfiguration().inspect(key)`,
(3) asserts `workspaceFolderValue` (or matching scope) is set. If it returns undefined, switch
strategy: keep schema with `deprecationMessage` in v1.4.0, schedule full removal for v1.5.0.

## Open Questions

1. **Should migration also support migrating `behave-vsc.suppressMultiConfigNotification` (legacy namespace)?**
   - What we know: `getWithLegacyFallback` and `legacyConfig` parameter exist throughout `WorkspaceSettings` for the `behave-vsc` → `gs-behave-bdd` migration.
   - What's unclear: Does `suppressMultiConfigNotification` exist in `behave-vsc` schema? It's a fork-introduced setting (Phase 9, recent), so likely not.
   - Recommendation: Out of scope for this phase. The legacy fallback handles the read path generically; if `behave-vsc.suppressMultiConfigNotification` was ever set, the existing legacy mechanism continues working until the read site (`WorkspaceSettings`) is changed. Document as a follow-up only if user reports a regression.

2. **Should the wrapper accept a `wkspUri | undefined` for cross-workspace notifications?**
   - What we know: All current callers have a `wkspUri` (from `for (const wkspUri of getUrisOfWkspFoldersWithFeatures())`). NOTIF-03 mandates WorkspaceFolder scope, which requires `wkspUri`.
   - What's unclear: Phase 16 will introduce a `featuresPathMigration` notification — will it fire per-workspace or globally?
   - Recommendation: Require `wkspUri` (no optional). Phase 16 already iterates per-workspace for migration; the notification can fire per-workspace too. If a global notification need arises later, add an overload — don't pre-design it.

3. **Should `migrateLegacySuppressMultiConfig` be exported for unit testing, or kept private?**
   - What we know: D-Discretion item explicitly leaves this open. Both patterns exist in codebase.
   - What's unclear: How direct does the test access need to be?
   - Recommendation: **Export it.** It's a one-shot side-effect function with clearly testable inputs (cfg, wkspUri) and outputs (update calls, log messages). Direct test access avoids test brittleness from going through `activate()`.

## Environment Availability

> Phase requires only existing tooling — no new external dependencies.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build / runtime | ✓ | 18.17.1 | — |
| TypeScript compiler | `npm run compile` | ✓ | 4.5.5 | — |
| ESLint | `npx eslint src --ext ts` | ✓ | 8.11.0 | — |
| Mocha | `npm run test:unit` | ✓ | 9.2.2 | — |
| Sinon | Unit test mocking | ✓ | 21.0.1 | — |
| VSCode `^1.82.0` API | Runtime / integration tests | ✓ (engine) | 1.82.0+ | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Mocha 9.2.2 + Sinon 21.0.1 |
| Config file | `test/unit/.mocharc.cjs` (existing project standard); `test/unit/setup.ts` loads `vscode.mock.ts` |
| Quick run command | `npm run test:unit -- --grep "notifications"` |
| Full suite command | `npm run test:unit` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NOTIF-01 | Schema: `suppressedNotifications` array string default `[]` exists in package.json | unit (schema validation) | `node -e "const p=require('./package.json'); const s=p.contributes.configuration.properties['gs-behave-bdd.suppressedNotifications']; if(s.type!=='array'\|\|s.items.type!=='string'\|\|!Array.isArray(s.default)\|\|s.default.length!==0) process.exit(1)"` | ❌ Wave 0 |
| NOTIF-02 (check) | `isSuppressed(key, wkspUri)` returns true when key in array, false otherwise | unit | `npx mocha test/unit/notifications.test.ts --grep "isSuppressed"` | ❌ Wave 0 |
| NOTIF-02 (suppress) | `suppressNotification(key, wkspUri)` calls `cfg.update("suppressedNotifications", [..., key], WorkspaceFolder)` | unit | `npx mocha test/unit/notifications.test.ts --grep "suppressNotification"` | ❌ Wave 0 |
| NOTIF-02 (dedup) | `suppressNotification` does NOT call `update` if key already in array (D-11) | unit | `npx mocha test/unit/notifications.test.ts --grep "dedup"` | ❌ Wave 0 |
| NOTIF-03 | `update` is called with `vscode.ConfigurationTarget.WorkspaceFolder` (assert third arg) | unit | `npx mocha test/unit/notifications.test.ts --grep "WorkspaceFolder scope"` | ❌ Wave 0 |
| NOTIF-04 | Multi-config notification calls `showSuppressibleNotification` with key `"multiConfigNotification"` and buttons `["Select Project", "Show Details"]` | unit (mocked extension flow) | `npx mocha test/unit/notifications.test.ts --grep "multiConfigNotification key"` | ❌ Wave 0 |
| NOTIF-04 (button passthrough) | Wrapper returns the actual button label when user clicks (not "Don't Show Again") | unit | `npx mocha test/unit/notifications.test.ts --grep "button passthrough"` | ❌ Wave 0 |
| NOTIF-05 | `gs-behave-bdd.suppressMultiConfigNotification` absent from package.json schema | unit (schema validation) | `node -e "const p=require('./package.json'); if('gs-behave-bdd.suppressMultiConfigNotification' in p.contributes.configuration.properties) process.exit(1)"` | ❌ Wave 0 |
| NOTIF-06 (folder scope) | `migrateLegacySuppressMultiConfig` reads `inspect().workspaceFolderValue=true` and writes array at `WorkspaceFolder` target | unit | `npx mocha test/unit/notifications.test.ts --grep "migrate.*WorkspaceFolder"` | ❌ Wave 0 |
| NOTIF-06 (workspace scope) | Migration reads `inspect().workspaceValue=true` and writes array at `Workspace` target | unit | `npx mocha test/unit/notifications.test.ts --grep "migrate.*Workspace$"` | ❌ Wave 0 |
| NOTIF-06 (global scope) | Migration reads `inspect().globalValue=true` and writes array at `Global` target | unit | `npx mocha test/unit/notifications.test.ts --grep "migrate.*Global"` | ❌ Wave 0 |
| NOTIF-06 (false → no-op) | Migration with `legacyValue=false` (or absent) does NOT write | unit | `npx mocha test/unit/notifications.test.ts --grep "migrate.*no-op"` | ❌ Wave 0 |
| NOTIF-06 (existing array merge) | Migration with existing `["someOther"]` produces `["someOther", "multiConfigNotification"]` | unit | `npx mocha test/unit/notifications.test.ts --grep "migrate.*merge"` | ❌ Wave 0 |
| NOTIF-06 (idempotent) | Running migration twice does not duplicate `"multiConfigNotification"` (D-11) | unit | `npx mocha test/unit/notifications.test.ts --grep "migrate.*idempotent"` | ❌ Wave 0 |
| NOTIF-06 (failure logs) | When `update` rejects, migration logs warn via `config.logger.logInfo` and does not throw (D-07) | unit | `npx mocha test/unit/notifications.test.ts --grep "migrate.*failure"` | ❌ Wave 0 |
| NOTIF-07 | All check/suppress/migrate tests above pass | unit (composite) | `npm run test:unit -- --grep "notifications"` | ❌ Wave 0 |
| NOTIF-08 | `TestWorkspaceConfig` get/inspect/getExpected return correct shape for `suppressedNotifications`; old key removed | unit | `npx mocha test/unit/settings/multiPathPrecedence.test.ts --grep "TestWorkspaceConfig suppressedNotifications"` | ❌ Wave 0 (extends existing test file) |
| Activation flow integration | Old `suppressMultiConfigNotification: true` → after activation, `suppressedNotifications: ["multiConfigNotification"]` and old key absent | integration | `npm run test:integration` (extend `multiroot suite` or `simple suite` with a fixture that has old key set) | ❌ Wave 0 (deferred to Phase 17 cross-cutting verification per ROADMAP, but a smoke check here is wise) |

### Sampling Rate
- **Per task commit:** `npm run test:unit -- --grep "notifications\|TestWorkspaceConfig\|suppressedNotifications"` (target ≤ 5 seconds)
- **Per wave merge:** `npm run test:unit` (full unit suite, ~30 seconds historical)
- **Phase gate:** Full suite green: `npm test` (lint + compile + unit + integration) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/unit/notifications.test.ts` — covers NOTIF-02, NOTIF-03, NOTIF-04 (button passthrough), NOTIF-06 (all six sub-cases), NOTIF-07
- [ ] Schema validation snippets (inline `node -e` checks) for NOTIF-01 and NOTIF-05 — can live in CI script or as a separate `test/unit/packageJsonSchema.test.ts`
- [ ] Existing `test/unit/settings/*.test.ts` files updated to:
  - Remove `suppressMultiConfigNotification: false` from BASE_CFG / makeFakeWkspSettings
  - Add `suppressedNotifications: []` where required
  - Files affected: `multiPathPrecedence.test.ts`, `verboseLogging.test.ts`, `projectUriDerivation.test.ts`, `logSettingsPlural.test.ts`
- [ ] Integration test fixture (or smoke check via `TestWorkspaceConfigWithWkspUri`) verifying end-to-end migration during activation — **optional for this phase**, **required at Phase 17**
- [ ] Wave 0 verification probe for Assumption A1: confirm `inspect()` returns scope values for an unregistered key with a value in settings.json

## Project Constraints (from CLAUDE.md)

| Directive | Source | How this phase complies |
|-----------|--------|--------------------------|
| Always run `npx eslint src --ext ts` after TS changes | CLAUDE.md "After Every Code Change" | Verify after each file change in `src/` |
| Always run `npm run test:unit` after `src/` changes | CLAUDE.md "Unit Tests" | Run after task completion |
| Use `urisMatch`/`uriId` for URI comparisons, never `===` or `.path` | AI_INSTRUCTIONS.md "URI Handling" | Suppression key is a string, not a URI — directly comparable. `wkspUri` flows to `getConfiguration` directly; not compared to other URIs. |
| `vscode.Uri.joinPath()` for path construction | AI_INSTRUCTIONS.md | No path construction in this phase; setting key is a literal string. |
| Top-level handlers call `showError`; helpers `throw` | AI_INSTRUCTIONS.md "Exception Handling" | `showSuppressibleNotification`, `suppressNotification`, `migrateLegacySuppressMultiConfig` are helpers — they `logInfo` warn (per D-07), they don't `showError`. The `activate()` try/catch at extension.ts L1038 covers any escaping throw. |
| Disposables added to `context.subscriptions` | AI_INSTRUCTIONS.md "Disposables Management" | This phase introduces no new disposables. Notifications are fire-and-forget Thenables. |
| Multi-root workspace support | AI_INSTRUCTIONS.md "Multi-Root Workspace Support" | Migration loops `for (const wkspUri of getUrisOfWkspFoldersWithFeatures())`. Each workspace folder gets its own scope detection and write. |
| Never block activation; avoid `await` in `activate()` unless necessary | AI_INSTRUCTIONS.md "Performance Requirements" | Migration `await` is necessary (D-05 mandates "before any notifications fire"). Mitigation: migration is fast (≤1 inspect + ≤2 updates per workspace × N workspaces). Measure with `performance.now()` block. |
| `getUrisOfWkspFoldersWithFeatures()` < 1ms hard requirement | CLAUDE.md "Project / Constraints" | Not affected — phase does not modify the discovery hot path. |
| Backward compatibility: explicit settings → zero behavior change | CLAUDE.md "Project / Constraints" | Migration preserves user intent (suppressed stays suppressed) at same scope. Users with `suppressMultiConfigNotification: false` see no change (false is migration no-op). |
| Bundle size: `smol-toml` ~5KB acceptable | CLAUDE.md "Project / Constraints" | This phase adds no dependencies — bundle size unchanged. |
| Tech stack: TypeScript, VS Code Extension API, Mocha/Sinon for tests. No Python changes. | CLAUDE.md "Project / Constraints" | Phase is TypeScript-only. No Python touched. |

## Sources

### Primary (HIGH confidence)
- `src/extension.ts` (L141-L181, L178, L198-L1048) — current notification + activation flow
- `src/settings.ts` (L60-L167, L317-L385) — WorkspaceSettings strict-undefined pattern
- `src/testWorkspaceConfig.ts` (L1-L298) — mock pattern incl. `inspect()` fidelity gap at L185
- `src/common.ts` (L131-L172) — `hasExplicitSetting`, `hasExplicitNonEmptyArraySetting`, `getActualWorkspaceSetting` patterns
- `src/configuration.ts` (L54-L87) — singleton `WorkspaceSettings` caching behavior
- `package.json` (L44-L52, L120-L125) — array setting schema (featuresPaths) and old boolean (to remove)
- `test/unit/settings/multiPathPrecedence.test.ts` (L22-L70) — inline `makeConfig` test pattern with scope control
- `test/unit/settings/legacyFallback.test.ts` (L10-L23) — explicit-keys-aware mock config helper
- `test/unit/vscode.mock.ts` (L137-L194, L208-L226) — vscode API mocking surface
- `AI_INSTRUCTIONS.md` — exception handling, disposables, multi-root, performance rules
- `CLAUDE.md` — lint + unit test mandate, project constraints
- `.planning/STATE.md` — locked v1.4.0 milestone decisions
- `.planning/REQUIREMENTS.md` — NOTIF-01..08 + traceability table
- `.planning/ROADMAP.md` — Phase 15 success criteria

### Secondary (MEDIUM confidence)
- [VS Code API: WorkspaceConfiguration interface](https://vshaxe.github.io/vscode-extern/vscode/WorkspaceConfiguration.html) — full type signatures for `inspect()` and `update()`, including `ConfigurationTarget` semantics (verified against multiple sources)
- [VS Code API reference (official)](https://code.visualstudio.com/api/references/vscode-api) — confirms `Thenable<T | undefined>` shape for `showInformationMessage`
- [GitHub issue: showErrorMessage returns undefined on dismiss](https://github.com/microsoft/vscode/issues/1248) — confirms `undefined` on dismiss for all `show*Message` variants
- [VS Code Contribution Points: configuration scopes](https://code.visualstudio.com/api/references/contribution-points) — `application | machine | window | resource | machine-overridable` scope values

### Tertiary (LOW confidence)
- [GitHub issue: WorkspaceConfiguration.inspect documentation gap](https://github.com/microsoft/vscode-docs/issues/2601) — feeds Pitfall 1 / Assumption A1 (behavior of `inspect()` for unregistered keys is underspecified)
- [GitHub discussion: typing array configuration](https://github.com/microsoft/vscode-discussions/discussions/864) — confirms array-of-strings schema pattern

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all primitives are existing project conventions verified in source
- Architecture: HIGH — every component has a verified template (settings loading, mock shape, ConfigurationTarget write, notification button handling)
- Pitfalls: HIGH for #2 (scope-aware dedup), #3 (race), #4 (cache refresh), #5 (mock fidelity); MEDIUM for #1 (schema-removal-vs-inspect — flagged as Assumption A1 needing Wave 0 verification)
- Validation: HIGH — Mocha + Sinon infrastructure exists, test patterns are established (multiPathPrecedence, legacyFallback templates)

**Research date:** 2026-04-27
**Valid until:** 2026-05-27 (30 days — VSCode API stable; project is the only changing surface)
