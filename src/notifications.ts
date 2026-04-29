import * as vscode from 'vscode';
import { config } from './configuration';

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
    config.logger.logInfo(`Could not suppress notification "${key}": ${e}`, wkspUri);
  }
}

/**
 * Shows an information message gated on `suppressedNotifications`. Appends
 * "Don't Show Again" to the caller's button list and intercepts that choice
 * internally — callers never see "Don't Show Again" returned (D-04).
 *
 * @returns The user's clicked button label (one of `buttons`), or `undefined`
 *          if dismissed, suppressed, or DSA was clicked.
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
 * - `write`: write `value` as the new dest value AND remove the source key (both at same scope).
 * - `skipDest`: do NOT write the dest. `removeSource` controls whether the source key is removed:
 *     - `removeSource: true`  — remove source (Phase 16 D-08: blank legacy value, drop it).
 *     - `removeSource: false` — preserve source (Phase 15: legacyValue !== true is a no-op).
 */
type TransformResult<T> =
  | { kind: 'write'; value: T }
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
      // Phase 15 contract: write dest, then remove source. Order matters for the test
      // assertion that updateSpy.firstCall == dest, secondCall == source removal.
      await destCfg.update(opts.destKey, result.value, target);
      await sourceCfg.update(opts.sourceKey, undefined, target);
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
    config.logger.logInfo(
      `Could not migrate ${opts.sourceKey} to ${opts.destKey}: ${e}`,
      opts.wkspUri,
    );
    return false;
  }
}

/**
 * Phase 15 / NOTIF-06 — refactored in Phase 16 to call the migrateScopedSetting
 * primitive (D-MOD). Public signature unchanged: Promise<void>.
 *
 * Behavior preserved:
 *   - When legacyValue !== true (including false): NO update() calls (callCount === 0).
 *   - When legacyValue === true: write [...existingArr, "multiConfigNotification"]
 *     (deduped) at the detected scope, then remove the legacy boolean.
 *   - On update() rejection: log via config.logger.logInfo, return.
 */
export async function migrateLegacySuppressMultiConfig(wkspUri: vscode.Uri): Promise<void> {
  await migrateScopedSetting<boolean, string[]>({
    namespace: "gs-behave-bdd",
    sourceKey: "suppressMultiConfigNotification",
    destKey: "suppressedNotifications",
    wkspUri,
    transform: (legacyValue, existingArr) => {
      if (legacyValue !== true) {
        // Pre-refactor parity: no dest write AND no source removal (callCount === 0
        // contract at notifications.test.ts L335).
        return { kind: 'skipDest', removeSource: false };
      }
      const current = Array.isArray(existingArr) ? [...existingArr] : [];
      if (current.includes("multiConfigNotification")) {
        // Already present — write the unchanged array (still triggers source removal).
        return { kind: 'write', value: current };
      }
      return { kind: 'write', value: [...current, "multiConfigNotification"] };
    },
  });
  // Public signature is Promise<void> — discard the boolean return.
}

// Phase 16 — namespaces inspected for legacy featuresPath. D-02: both source values
// land in canonical gs-behave-bdd.featuresPaths. behave-vsc.featuresPaths is NEVER written.
const FEATURES_PATH_NAMESPACES = ["gs-behave-bdd", "behave-vsc"] as const;

/**
 * Phase 16 — D-07 single source of truth. The regex MUST be byte-identical to
 * src/settings.ts:204 / L214. If they ever drift, dedup silently double-appends
 * (Pitfall 9 from 16-PATTERNS.md).
 */
function normalizePathEntry(s: string): string {
  return s.replace(/^\\|^\//, "").replace(/\\$|\/$/, "").trim();
}

/**
 * Phase 16 / DEP-02, DEP-03: One-shot migration of the legacy
 * `featuresPath: string` setting (in EITHER `gs-behave-bdd` or `behave-vsc` namespace
 * per D-02) to the canonical `gs-behave-bdd.featuresPaths: string[]` setting.
 *
 * For each source namespace × each detected scope:
 *   - Same-scope merge-with-dedup: append the singular into existing plural
 *     (post-normalization comparison per D-07).
 *   - Empty/whitespace-only legacy values: skip dest write, still remove legacy (D-08).
 *   - Default-equivalent ("features") and known-fatal (".") values: migrate literally
 *     (D-09); the per-entry fatal-error guard at src/settings.ts:232-234 handles
 *     the "." case downstream.
 *
 * Cross-scope and cross-namespace independence (D-04): each (namespace × scope) hit
 * migrates independently into gs-behave-bdd.featuresPaths at the matching scope.
 *
 * @returns true iff at least one (namespace × scope) was migrated; false otherwise (D-01).
 *
 * Never throws on update() rejection — primitive logs via config.logger.logInfo (D-05).
 *
 * @see .planning/phases/16-deprecate-featurespath/16-PATTERNS.md (Phase 16 wrapper)
 */
export async function migrateLegacyFeaturesPath(wkspUri: vscode.Uri): Promise<boolean> {
  let anyMigrated = false;
  for (const sourceNs of FEATURES_PATH_NAMESPACES) {
    const migrated = await migrateScopedSetting<string, string[]>({
      namespace: sourceNs,
      sourceKey: "featuresPath",
      destNamespace: "gs-behave-bdd",     // D-02: canonical destination, even when source is behave-vsc
      destKey: "featuresPaths",
      wkspUri,
      transform: (legacyValue, existingArr) => {
        // D-08: empty/whitespace → remove source but skip dest write.
        if (legacyValue === undefined || typeof legacyValue !== 'string' || legacyValue.trim() === "") {
          return { kind: 'skipDest', removeSource: true };
        }
        const normalized = normalizePathEntry(legacyValue);
        if (normalized === "") {
          // Post-normalization empty (e.g., the value was "/" or "\\").
          return { kind: 'skipDest', removeSource: true };
        }
        // D-06 / D-07: same-scope merge-with-dedup, post-normalization comparison.
        const current = Array.isArray(existingArr) ? [...existingArr] : [];
        if (current.some(p => normalizePathEntry(p) === normalized)) {
          // Already present — write the unchanged array (still triggers source removal
          // via the primitive's kind='write' branch).
          return { kind: 'write', value: current };
        }
        return { kind: 'write', value: [...current, normalized] };
      },
    });
    anyMigrated = anyMigrated || migrated;
  }
  return anyMigrated;
}

export { migrateScopedSetting };
export type { TransformResult };
