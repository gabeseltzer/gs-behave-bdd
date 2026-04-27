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
