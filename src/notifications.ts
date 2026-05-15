import * as vscode from 'vscode';
import { config } from './configuration';
import { diagLog } from './logger';
import { featuresPathMergeWithDedup } from './migrations/featuresPath';
import { suppressMultiConfigToArray } from './migrations/suppressedNotifications';

/**
 * Phase 15: Notification suppression infrastructure.
 *
 * Reusable helpers that gate `vscode.window.showInformationMessage` calls on a
 * user-controlled `gs-behave-bdd.suppressedNotifications: string[]` setting.
 *
 * @see .planning/phases/15-notification-suppression/15-RESEARCH.md
 * @see .planning/phases/15-notification-suppression/15-PATTERNS.md
 */

const DONT_SHOW_AGAIN = "Don't Show Again";

/**
 * W-01 helper: structural equality for the simple JSON-shaped values written
 * by migrateScopedSetting (string[] for featuresPaths / suppressedNotifications,
 * boolean for legacy keys). Avoids pulling in a deep-equal dependency for what
 * is in practice always a plain JSON tree from VS Code settings.
 */
function deepEqualForSettings(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Returns true if the given notification key is in the workspace's suppressed
 * notifications list. Reads from the cached `WorkspaceSettings` (consistent
 * with all other settings reads in this codebase).
 */
export function isSuppressed(key: string, wkspUri: vscode.Uri): boolean {
  const wkspSettings = config.workspaceSettings[wkspUri.path];
  return wkspSettings?.suppressedNotifications?.includes(key) ?? false;
}

/**
 * Appends `key` to `gs-behave-bdd.suppressedNotifications` at WorkspaceFolder
 * scope (NOTIF-03). Deduplicates against the WorkspaceFolder-scope value (D-11)
 * — NOT against the merged `get()` result (Pitfall 2 in 15-RESEARCH.md).
 *
 * On failure (e.g., read-only workspace), logs a warning to the output channel
 * and returns normally (does NOT throw — matches the fire-and-forget shape of
 * the existing extension.ts L177-L178 caller).
 */
export async function suppressNotification(key: string, wkspUri: vscode.Uri): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("gs-behave-bdd", wkspUri);
  const insp = cfg.inspect<string[]>("suppressedNotifications");
  const wfv = insp ? insp.workspaceFolderValue : undefined;
  const current = Array.isArray(wfv) ? wfv : [];
  if (current.includes(key)) return; // D-11
  try {
    await cfg.update("suppressedNotifications", [...current, key], vscode.ConfigurationTarget.WorkspaceFolder);
  } catch (e) {
    // W-03: surface as a settings warning so the user sees their "Don't Show
    // Again" click did NOT persist (e.g. read-only workspace) — otherwise
    // they'll click it again next session with no idea why.
    config.logger.logSettingsWarning(
      `Could not persist "Don't Show Again" for notification "${key}": ${e}`,
      wkspUri,
    );
  }
}

/**
 * Shows an information message gated on `suppressedNotifications`. Appends
 * "Don't Show Again" to the caller's button list and intercepts that choice
 * internally — callers never see "Don't Show Again" returned (D-04).
 *
 * @returns The user's clicked button label (one of `buttons`), or `undefined`
 *          if dismissed, suppressed, or DSA was clicked.
 *
 * LIMITATION (W-04): the three "no action returned" cases — (1) the wrapper
 * short-circuited because the key was already suppressed, (2) the user
 * dismissed the notification (e.g. clicked the X), and (3) the user clicked
 * "Don't Show Again" — are deliberately conflated as `undefined`. Callers
 * cannot distinguish them from the return value alone. If a future caller
 * needs to distinguish "user opted out of this notification forever" from
 * "user ignored this one" (e.g. for telemetry or UX work that wants to count
 * dismissals), this signature will need to change to a discriminated result
 * (e.g. `{ action: string } | { dismissed: true } | { suppressed: true }`).
 * For now, the conflation is correct because every existing caller treats
 * all three cases identically.
 */
export async function showSuppressibleNotification(
  key: string,
  message: string,
  buttons: string[],
  wkspUri: vscode.Uri,
): Promise<string | undefined> {
  if (isSuppressed(key, wkspUri)) return undefined;

  const allButtons = [...buttons, DONT_SHOW_AGAIN];
  const action = await vscode.window.showInformationMessage(message, ...allButtons);

  if (action === DONT_SHOW_AGAIN) {
    await suppressNotification(key, wkspUri);
    return undefined;
  }
  return action;
}

/**
 * Result of a migration transform callback.
 * - `write`: write `value` as the new dest value. `removeSource` controls whether
 *   the source key is removed (both at same scope):
 *     - `removeSource: true` (or omitted) — remove source (default, current behavior).
 *     - `removeSource: false` — preserve source (Phase 21 D-A8.3: needed for the
 *       case-2 "migrate-and-keep" and case-3 "overwrite-and-keep" actions, which
 *       write the dest but intentionally leave the legacy entry in place).
 * - `skipDest`: do NOT write the dest. `removeSource` controls whether the source key is removed:
 *     - `removeSource: true`  — remove source (Phase 16 D-08: blank legacy value, drop it).
 *     - `removeSource: false` — preserve source (Phase 15: legacyValue !== true is a no-op).
 */
type TransformResult<T> =
  | { kind: 'write'; value: T; removeSource?: boolean }
  | { kind: 'skipDest'; removeSource: boolean };

/**
 * Phase 16 D-MOD: generic scope-preserving migration primitive.
 *
 * Detects the most-specific scope where `sourceKey` has a user-set value
 * (workspaceFolder → workspace → global, most-specific wins via inspect()).
 * Reads `destKey` at the SAME scope (Pitfall 2 — never cfg.get() which merges scopes).
 * Calls `transform(sourceVal, destValAtSameScope)` to compute the next action.
 * Writes the new dest value (if any) and removes the source key (if requested),
 * BOTH at the same scope target.
 *
 * W-02 LIMITATION: This is a SINGLE-scope migration per invocation. If the user
 * has the legacy `sourceKey` set at MULTIPLE scopes (e.g. global default + a
 * per-folder override), only the most-specific scope is migrated; values at
 * other scopes linger as deprecated keys. Cross-scope migration of the same
 * (namespace × key) pair is intentionally out of scope — wrappers (e.g.
 * `migrateLegacyFeaturesPath`) achieve cross-NAMESPACE independence by
 * invoking this primitive once per namespace, but cross-SCOPE within one
 * namespace is not handled. We surface a one-shot diagLog warning when stale
 * values exist at non-migrated scopes so the situation is at least diagnosable.
 *
 * Returns true iff at least the source removal OR a dest write completed for that scope.
 * Never throws — on update() rejection, logs via config.logger.logInfo and returns false.
 */
async function migrateScopedSetting<TSrc, TDest>(opts: {
  namespace: string;
  sourceKey: string;
  destNamespace?: string;
  destKey: string;
  wkspUri: vscode.Uri;
  transform: (sourceVal: TSrc, destValAtSameScope: TDest | undefined) => TransformResult<TDest>;
}): Promise<boolean> {
  const sourceCfg = vscode.workspace.getConfiguration(opts.namespace, opts.wkspUri);
  const insp = sourceCfg.inspect<TSrc>(opts.sourceKey);
  if (!insp) return false;

  // Most-specific-wins scope detection (Pitfall 2 — same shape as Phase 15 L96-L107).
  let target: vscode.ConfigurationTarget | undefined;
  let sourceVal: TSrc | undefined;
  if (insp.workspaceFolderValue !== undefined) {
    target = vscode.ConfigurationTarget.WorkspaceFolder;
    sourceVal = insp.workspaceFolderValue;
  } else if (insp.workspaceValue !== undefined) {
    target = vscode.ConfigurationTarget.Workspace;
    sourceVal = insp.workspaceValue;
  } else if (insp.globalValue !== undefined) {
    target = vscode.ConfigurationTarget.Global;
    sourceVal = insp.globalValue;
  }
  if (target === undefined) return false;

  // W-02: warn if the legacy key ALSO exists at non-migrated scopes. The
  // primitive only migrates the most-specific scope; other-scope values
  // linger as deprecated keys. Surfacing this via diagLog (xRay) keeps the
  // limitation diagnosable without spamming users who already had the
  // expected single-scope setup.
  const otherScopesWithStaleValues: string[] = [];
  if (target !== vscode.ConfigurationTarget.WorkspaceFolder && insp.workspaceFolderValue !== undefined) {
    otherScopesWithStaleValues.push("workspaceFolder");
  }
  if (target !== vscode.ConfigurationTarget.Workspace && insp.workspaceValue !== undefined) {
    otherScopesWithStaleValues.push("workspace");
  }
  if (target !== vscode.ConfigurationTarget.Global && insp.globalValue !== undefined) {
    otherScopesWithStaleValues.push("global");
  }
  if (otherScopesWithStaleValues.length > 0) {
    config.logger.logInfo(
      `Migration W-02: ${opts.namespace}.${opts.sourceKey} has stale values at additional scope(s) ` +
      `[${otherScopesWithStaleValues.join(", ")}] that will NOT be migrated automatically. ` +
      `Remove them manually if no longer needed.`,
      opts.wkspUri,
    );
  }

  // Same-scope dest read (Pitfall 2 — never cfg.get() which merges scopes).
  const destNs = opts.destNamespace ?? opts.namespace;
  const destCfg = destNs === opts.namespace
    ? sourceCfg
    : vscode.workspace.getConfiguration(destNs, opts.wkspUri);
  const destInsp = destCfg.inspect<TDest>(opts.destKey);
  const destAtScope: TDest | undefined =
    target === vscode.ConfigurationTarget.WorkspaceFolder ? destInsp?.workspaceFolderValue :
      target === vscode.ConfigurationTarget.Workspace ? destInsp?.workspaceValue :
        destInsp?.globalValue;

  // sourceVal is non-undefined here (we found a user-set scope above) — assert by structure.
  const result = opts.transform(sourceVal as TSrc, destAtScope);

  try {
    if (result.kind === 'write') {
      // D-A8.3 (Phase 21): the optional `removeSource` field on the write
      // variant gates legacy-key removal. Omitted or `true` → remove (current
      // behavior, all prior callers). Explicit `false` → preserve the source
      // entry (needed for case-2 "migrate-and-keep" / case-3 "overwrite-and-keep").
      const shouldRemoveSource = result.removeSource !== false;
      // W-01: if the dest at this scope is already deep-equal to the proposed
      // value, skip the dest write — it's a no-op that nevertheless triggers a
      // configuration-change event and a full reparse cycle on idempotent
      // re-activation. Still honour removeSource for the legacy entry.
      if (destAtScope !== undefined && deepEqualForSettings(destAtScope, result.value)) {
        if (shouldRemoveSource) {
          await sourceCfg.update(opts.sourceKey, undefined, target);
        }
        return true;
      }
      // Phase 15 contract: write dest, then (optionally) remove source. Order
      // matters for the test assertion that updateSpy.firstCall == dest,
      // secondCall == source removal.
      await destCfg.update(opts.destKey, result.value, target);
      if (shouldRemoveSource) {
        await sourceCfg.update(opts.sourceKey, undefined, target);
      }
      return true;
    }
    // kind === 'skipDest'
    if (result.removeSource) {
      await sourceCfg.update(opts.sourceKey, undefined, target);
      return true;
    }
    // Neither wrote nor removed (Phase 15 legacyValue !== true case — callCount must stay 0).
    return false;
  } catch (e) {
    // D-05 / D-07 carryforward: warn-and-continue, never throw.
    // W-03: use diagLog for internal migration paths — surfacing this to the
    // user adds no value (the migration is best-effort and behavior degrades
    // gracefully if it fails: legacy keys keep working until next attempt).
    // Wrapped in try/catch because this is already an error-handling path:
    // we MUST honor the no-throw contract even if diagLog itself fails (e.g.
    // when config.globalSettings is unavailable in a test stub).
    try {
      diagLog(
        `Could not migrate ${opts.sourceKey} to ${opts.destKey}: ${e}`,
        opts.wkspUri,
      );
    } catch {
      // intentional: never throw from a "log on error" fallback.
    }
    return false;
  }
}

/**
 * Phase 20 thin shim delegating to `suppressMultiConfigToArray` (registry entry id:
 * `suppressMultiConfig-self`). Public `Promise<void>` signature preserved for the
 * `test/unit/notifications.test.ts` regression bar (Pitfall 1). Full deletion is Phase 22.
 */
export async function migrateLegacySuppressMultiConfig(wkspUri: vscode.Uri): Promise<void> {
  await migrateScopedSetting<boolean, string[]>({
    namespace: 'gs-behave-bdd',
    sourceKey: 'suppressMultiConfigNotification',
    destKey: 'suppressedNotifications',
    wkspUri,
    transform: suppressMultiConfigToArray,
  });
  // Public signature is Promise<void> — discard the boolean return.
}

/**
 * Phase 20 D-A4.1: refactored to delegate to featuresPathMergeWithDedup.
 * Public Promise<boolean> signature preserved through v1.5.0; full deletion is Phase 22.
 *
 * Never throws — primitive logs via diagLog on update() rejection (D-05).
 * Registry entries: featuresPath-self, featuresPath-from-behavevsc.
 */
export async function migrateLegacyFeaturesPath(wkspUri: vscode.Uri): Promise<boolean> {
  let anyMigrated = false;
  for (const sourceNs of ['gs-behave-bdd', 'behave-vsc'] as const) {
    const migrated = await migrateScopedSetting<string, string[]>({
      namespace: sourceNs,
      sourceKey: 'featuresPath',
      destNamespace: 'gs-behave-bdd',
      destKey: 'featuresPaths',
      wkspUri,
      transform: featuresPathMergeWithDedup,
    });
    anyMigrated = anyMigrated || migrated;
  }
  return anyMigrated;
}

export { migrateScopedSetting };
export type { TransformResult };
