/**
 * Phase v1.5.0 follow-up — surface migration consent as Problems-pane
 * diagnostics + Code Actions instead of toast prompts (260513-oh5).
 *
 * Rationale: vscode.window.showInformationMessage renders plain text only —
 * the prior design's bullet/bold copy displayed as literal characters
 * (see microsoft/vscode#20595, #50512). Diagnostics give us a persistent
 * surface anchored to the actual settings.json line, native VS Code styling,
 * and free "snooze" semantics (the diagnostic IS the deferral; user acts
 * when ready by clicking a Code Action quick-fix).
 */

import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { parseTree, findNodeAtLocation, type Node } from 'jsonc-parser';
import type { ConsentHit } from './consent';
import type { MigrationEntry, MigrationScope } from './types';

export const MIGRATION_DIAG_SOURCE = 'gs-behave-bdd';

let _collection: vscode.DiagnosticCollection | undefined;

/**
 * Lazy singleton — created on first use so the module is safe to import in
 * unit tests that don't actually call `vscode.languages.createDiagnosticCollection`.
 */
export function getDiagnosticCollection(): vscode.DiagnosticCollection {
  if (!_collection) {
    _collection = vscode.languages.createDiagnosticCollection('gs-behave-bdd.migrations');
  }
  return _collection;
}

/**
 * Test-only: release the collection so the next call creates a fresh one.
 * Production never needs this — extension.ts registers the collection as a
 * disposable and VS Code reclaims it on deactivate.
 */
export function disposeDiagnosticCollection(): void {
  _collection?.dispose();
  _collection = undefined;
}

/**
 * Per-scope file URI where the legacy key lives (and where we anchor the
 * diagnostic). Returns `undefined` when no plausible file exists for that
 * scope — caller falls back to skipping the diagnostic (we never invent a
 * fake URI just to hold a Problems entry).
 *
 * Paths:
 *   Global          → user settings.json (platform default; portable / Insiders
 *                     / custom --user-data-dir installs fall back here too —
 *                     range degrades to [0,0] if the key isn't found at that
 *                     path, which is the right behavior).
 *   Workspace       → vscode.workspace.workspaceFile (the .code-workspace).
 *   WorkspaceFolder → <wkspUri>/.vscode/settings.json.
 */
export function resolveAnchorUri(scope: MigrationScope, wkspUri: vscode.Uri): vscode.Uri | undefined {
  switch (scope) {
    case vscode.ConfigurationTarget.Global: {
      const home = os.homedir();
      let p: string;
      if (process.platform === 'win32') {
        const appData = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
        p = path.join(appData, 'Code', 'User', 'settings.json');
      } else if (process.platform === 'darwin') {
        p = path.join(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json');
      } else {
        const xdg = process.env.XDG_CONFIG_HOME ?? path.join(home, '.config');
        p = path.join(xdg, 'Code', 'User', 'settings.json');
      }
      return vscode.Uri.file(p);
    }
    case vscode.ConfigurationTarget.Workspace:
      return vscode.workspace.workspaceFile;
    case vscode.ConfigurationTarget.WorkspaceFolder:
      return vscode.Uri.joinPath(wkspUri, '.vscode', 'settings.json');
  }
}

/**
 * Locate `entry.sourceNamespace.<entry.sourceKey>` inside the JSONC file at
 * `uri` and return a Range covering the property key. For .code-workspace files
 * (Workspace scope), the relevant path is `['settings', '<flat-or-nested>']`.
 *
 * Falls back to `new vscode.Range(0, 0, 0, 0)` whenever:
 *   - the file doesn't exist
 *   - jsonc-parser can't parse the contents
 *   - neither flat (`"behave-vsc.justMyCode": …`) nor nested
 *     (`"behave-vsc": { "justMyCode": … }`) form is present
 *
 * The fallback is intentional: the diagnostic still surfaces in the Problems
 * pane (anchored at the top of the file), and the Code Action quick-fix still
 * works. Only the visual cue degrades.
 */
export async function computeRange(
  uri: vscode.Uri,
  entry: MigrationEntry,
  scope: MigrationScope,
): Promise<vscode.Range> {
  const fallback = new vscode.Range(0, 0, 0, 0);
  let bytes: Uint8Array;
  try {
    bytes = await vscode.workspace.fs.readFile(uri);
  } catch {
    return fallback;
  }
  const text = Buffer.from(bytes).toString('utf8');
  let root: Node | undefined;
  try {
    root = parseTree(text);
  } catch {
    return fallback;
  }
  if (!root) return fallback;

  const flatKey = `${entry.sourceNamespace}.${entry.sourceKey}`;
  const tryPaths: (string | number)[][] = scope === vscode.ConfigurationTarget.Workspace
    ? [['settings', flatKey], ['settings', entry.sourceNamespace, entry.sourceKey]]
    : [[flatKey], [entry.sourceNamespace, entry.sourceKey]];

  for (const p of tryPaths) {
    const valueNode = findNodeAtLocation(root, p);
    if (!valueNode || !valueNode.parent || valueNode.parent.type !== 'property') continue;
    const keyNode = valueNode.parent.children?.[0];
    if (!keyNode) continue;
    return offsetRange(text, keyNode.offset, keyNode.length);
  }
  return fallback;
}

function offsetRange(text: string, offset: number, length: number): vscode.Range {
  const start = offsetToPosition(text, offset);
  const end = offsetToPosition(text, offset + length);
  return new vscode.Range(start, end);
}

function offsetToPosition(text: string, offset: number): vscode.Position {
  let line = 0;
  let col = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) {
      line++;
      col = 0;
    } else {
      col++;
    }
  }
  return new vscode.Position(line, col);
}

/**
 * Build the diagnostic-friendly description for one (entry, case) hit. Plain
 * text only — VS Code does not render Markdown in diagnostic messages either
 * (same constraint as toasts).
 */
export function buildDiagnosticMessage(entry: MigrationEntry, mcase: 2 | 3, scope: MigrationScope): string {
  const scopeName = describeScope(scope);
  const legacy = `${entry.sourceNamespace}.${entry.sourceKey}`;
  const canonical = `${entry.destNamespace}.${entry.destKey}`;
  if (mcase === 2) {
    return `${legacy} is set (${scopeName}) but ${canonical} is not. Use the quick-fix to migrate or dismiss.`;
  }
  return `Both ${legacy} and ${canonical} are set (${scopeName}). Use the quick-fix to choose which value wins.`;
}

function describeScope(scope: MigrationScope): string {
  switch (scope) {
    case vscode.ConfigurationTarget.Global: return 'Global';
    case vscode.ConfigurationTarget.Workspace: return 'Workspace';
    case vscode.ConfigurationTarget.WorkspaceFolder: return 'Workspace Folder';
  }
}

/**
 * Encode (entryId, case, scope) into the `Diagnostic.code` field so the
 * CodeActionProvider can recover them without holding extra state. Format:
 *   `${entryId}::${case}::${scope-as-number}`
 *
 * scope is one of vscode.ConfigurationTarget.{Global=1, Workspace=2,
 * WorkspaceFolder=3}, which we serialize as the numeric value so the code is
 * stable across reloads. The provider re-hydrates back to MigrationScope.
 */
export function encodeDiagnosticCode(entryId: string, mcase: 2 | 3, scope: MigrationScope): string {
  return `${entryId}::${mcase}::${scope}`;
}

export interface DecodedCode {
  entryId: string;
  case: 2 | 3;
  scope: MigrationScope;
}

export function decodeDiagnosticCode(code: unknown): DecodedCode | undefined {
  if (typeof code !== 'string') return undefined;
  const parts = code.split('::');
  if (parts.length !== 3) return undefined;
  const [entryId, caseStr, scopeStr] = parts;
  const mcase = Number(caseStr);
  const scope = Number(scopeStr);
  if (mcase !== 2 && mcase !== 3) return undefined;
  if (
    scope !== vscode.ConfigurationTarget.Global &&
    scope !== vscode.ConfigurationTarget.Workspace &&
    scope !== vscode.ConfigurationTarget.WorkspaceFolder
  ) return undefined;
  return { entryId, case: mcase, scope: scope as MigrationScope };
}

/**
 * Publish a fresh diagnostic per (entry, case, scope) hit. Groups by anchor
 * URI so multiple hits sharing the same settings.json appear under one entry
 * in the Problems pane.
 *
 * Caller is expected to have already filtered hits to those that should
 * surface (case 2 with mode === 'prompt', or any case 3). Silent migrationMode
 * paths never reach this function.
 */
export async function publishConsentDiagnostics(
  wkspUri: vscode.Uri,
  hits: readonly ConsentHit[],
): Promise<number> {
  const collection = getDiagnosticCollection();
  const byUri = new Map<string, { uri: vscode.Uri; diags: vscode.Diagnostic[] }>();
  let published = 0;

  for (const hit of hits) {
    const uri = resolveAnchorUri(hit.scope, wkspUri);
    if (!uri) continue;
    const range = await computeRange(uri, hit.entry, hit.scope);
    const diag = new vscode.Diagnostic(
      range,
      buildDiagnosticMessage(hit.entry, hit.case, hit.scope),
      vscode.DiagnosticSeverity.Warning,
    );
    diag.source = MIGRATION_DIAG_SOURCE;
    diag.code = encodeDiagnosticCode(hit.entry.id, hit.case, hit.scope);
    const key = uri.toString();
    const existing = byUri.get(key);
    if (existing) {
      existing.diags.push(diag);
    } else {
      byUri.set(key, { uri, diags: [diag] });
    }
    published++;
  }

  for (const { uri, diags } of byUri.values()) {
    collection.set(uri, diags);
  }
  return published;
}

/**
 * Remove diagnostics for a specific (entry, scope) tuple. Called by every
 * action handler in consent.ts after a successful primitive write so the
 * Problems pane reflects the new state immediately without waiting for the
 * next activation.
 *
 * Matches on `code` prefix `${entry.id}::*::${scope}` — any case for that
 * entry+scope is cleared. (Cases 2 and 3 can't co-exist at the same scope
 * for the same entry, so this is just defensive.)
 */
export function clearDiagnosticsForEntryAtScope(
  entry: MigrationEntry,
  scope: MigrationScope,
): void {
  const collection = getDiagnosticCollection();
  collection.forEach((uri, diagnostics) => {
    const kept = diagnostics.filter(d => {
      if (d.source !== MIGRATION_DIAG_SOURCE) return true;
      const decoded = decodeDiagnosticCode(d.code);
      if (!decoded) return true;
      return !(decoded.entryId === entry.id && decoded.scope === scope);
    });
    if (kept.length !== diagnostics.length) {
      collection.set(uri, kept);
    }
  });
}
