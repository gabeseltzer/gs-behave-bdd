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
 * Phase 15 / NOTIF-06: One-shot migration of the legacy
 * `gs-behave-bdd.suppressMultiConfigNotification: boolean` setting to the new
 * `gs-behave-bdd.suppressedNotifications: string[]` setting.
 *
 * Detects the scope where the legacy key was set via `inspect()` (D-08), writes
 * the array AND removes the legacy key at the SAME scope (D-06). Failure logs
 * a warning and returns (D-07 — never throws — the caller in `activate()`
 * relies on this to avoid blocking activation).
 *
 * Idempotent: dedups against the existing scope-local array (D-11), and the
 * legacy key being already-removed is detected by `insp.<scope>Value` being
 * undefined.
 *
 * @see .planning/phases/15-notification-suppression/15-RESEARCH.md Pattern 2 + Pitfalls 1-5
 */
export async function migrateLegacySuppressMultiConfig(wkspUri: vscode.Uri): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("gs-behave-bdd", wkspUri);
  const insp = cfg.inspect<boolean>("suppressMultiConfigNotification");
  if (!insp) return;

  // D-08: detect scope where the legacy boolean lives. Most-specific wins.
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
  if (target === undefined || legacyValue !== true) return;

  try {
    // D-11 dedup: read existing array at SAME scope (not merged — Pitfall 2).
    const existingInsp = cfg.inspect<string[]>("suppressedNotifications");
    const existingArr =
      target === vscode.ConfigurationTarget.WorkspaceFolder ? existingInsp?.workspaceFolderValue :
        target === vscode.ConfigurationTarget.Workspace ? existingInsp?.workspaceValue :
          existingInsp?.globalValue;
    const merged = Array.isArray(existingArr) ? [...existingArr] : [];
    if (!merged.includes("multiConfigNotification")) merged.push("multiConfigNotification");

    // D-06: write new array, then remove legacy key. Both at SAME target.
    await cfg.update("suppressedNotifications", merged, target);
    await cfg.update("suppressMultiConfigNotification", undefined, target);
  } catch (e) {
    // D-07: warn-and-continue, never throw.
    config.logger.logInfo(
      `Could not migrate suppressMultiConfigNotification to suppressedNotifications: ${e}`,
      wkspUri,
    );
  }
}
