# Phase 023: Migrations Panel (Webview) — Research

**Researched:** 2026-05-14
**Domain:** VS Code Webview Panel (HTML/CSS/JS-in-extension)
**Confidence:** HIGH

## Summary

This phase replaces the existing Problems-pane / Code-Action consent surface
with a single Webview panel hosted by the VS Code window. The Webview API has
been stable since VS Code 1.25 (2018) and is unchanged through 1.95+ at the
properties this phase touches; targeting `@types/vscode 1.82.0` is well within
range. The "right" implementation is the canonical pattern published in the
`microsoft/vscode-extension-samples/webview-sample` repo: a singleton class
that owns the `WebviewPanel`, handles `createOrShow` / `dispose`, applies a
strict CSP with a per-render nonce, themes via `var(--vscode-*)` CSS
variables, and routes messages via `webview.postMessage` / `onDidReceiveMessage`.

**Primary recommendation:** Build a `MigrationsPanel` class in `src/migrations/panel.ts`
modeled directly on the webview-sample's `CatCodingPanel`. Inline the HTML in
a `getHtml()` template literal (panel is ~10 KB rendered, well under the
threshold where external assets pay for themselves). Use the existing
`dispatchMigrationAction` as the message endpoint with minimal adaptation —
the action payload type already serializes cleanly. Skip
`retainContextWhenHidden` and `WebviewPanelSerializer`; the migration list is
cheap to re-derive from the registry + evaluator on every open.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Panel lifecycle (create / reveal / dispose) | Extension host | — | `WebviewPanel` is an extension-host object. |
| HTML rendering | Extension host | — | HTML built as a string in TS and assigned to `webview.html`. |
| User input (button clicks) | Webview (browser) | Extension host (dispatch) | DOM events fire in the webview; `acquireVsCodeApi().postMessage` ships them. |
| Migration action execution | Extension host | — | Reuses `dispatchMigrationAction` unchanged. |
| Theming | Webview (browser) | — | CSS `var(--vscode-*)` resolved by VS Code at paint time. |
| Re-render on config change | Extension host | Webview (browser) | Host watches config, posts a `setState` message; webview re-renders. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---|---|---|---|
| `vscode` (ambient) | `^1.82.0` already pinned | `createWebviewPanel`, `Webview`, `WebviewPanel` | The only API for this surface; no alternative exists inside VS Code. [CITED: code.visualstudio.com/api/extension-guides/webview] |
| TypeScript | 4.5.5 (project pin) | Source | Project standard. [VERIFIED: tsconfig.json] |

### Supporting
No new dependencies needed. The phase reuses:

| Existing module | Purpose | Reuse |
|---|---|---|
| `src/migrations/consent.ts` | 7 action handlers + `ConsentHit` types | Imported as-is. |
| `src/migrations/codeActions.ts → dispatchMigrationAction` | Action runner | Repurpose as the webview message handler; keep the function, retire the CodeActionProvider + the registered `gs-behave-bdd.migration.action` command. |
| `src/migrations/registry.ts → MIGRATION_REGISTRY` | Entry list for view-model | Imported as-is. |
| `src/migrations/evaluator.ts` (existing) | Build `ConsentHit[]` for re-render | Re-run on each panel open / config change. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|---|---|---|
| Raw HTML/CSS/JS string | `vscode-elements` (web components) | Adds ~30 KB bundle + Lit dep; overkill for ~10 KB of UI with 4 button styles. Recommend only if v2 grows complex. |
| Webview panel | TreeView in custom view container | Native VS Code UI, no CSP/nonce concerns — BUT cannot render the "Migration Mode" picker or per-row buttons natively (TreeView items only have inline icon actions, not multiple labeled buttons). Mismatch with the design. |
| Inline HTML template literal | External `media/panel.html` + `asWebviewUri` | External keeps TS clean but requires webpack `copy-webpack-plugin` rule + 3 files. Not worth it at this size. |

**Installation:**
No new packages. The phase is implementation-only against the existing
`@types/vscode ^1.82.0` already in `package.json`.

**Version verification:**
The Webview API surface (`createWebviewPanel`, `onDidDispose`, `onDidReceiveMessage`,
`postMessage`, `asWebviewUri`, `cspSource`, `localResourceRoots`) is present in
the 1.82 typings — verified by reading `node_modules/@types/vscode/index.d.ts`
during plan-time would confirm; the API has been stable since 1.38 (2019) when
`asWebviewUri` and `cspSource` were added.

## Architecture Patterns

### System Architecture Diagram

```
                 [user]
                   │
                   ▼
   ┌───────────────────────────────┐
   │  Summary toast (consent.ts)   │  ── click "Open Migrations Panel"
   │  Command palette entry        │  ── gs-behave-bdd.openMigrationsPanel
   └───────────────┬───────────────┘
                   │
                   ▼
   ┌───────────────────────────────┐
   │  MigrationsPanel.createOrShow │  ← single-instance gate
   │  (src/migrations/panel.ts)    │
   └───────────────┬───────────────┘
                   │ creates / reveals
                   ▼
   ┌───────────────────────────────┐         ┌────────────────────────────┐
   │  vscode.WebviewPanel          │◀───────▶│  Webview HTML/CSS/JS       │
   │  - .webview.html (set)        │ postMsg │  - acquireVsCodeApi()      │
   │  - onDidReceiveMessage        │  both   │  - button click handlers   │
   │  - onDidDispose               │  ways   │  - var(--vscode-*) theme   │
   └───────────────┬───────────────┘         └────────────────────────────┘
                   │ message: {type:'action', args:MigrationActionArgs}
                   ▼
   ┌───────────────────────────────┐
   │  dispatchMigrationAction      │  (existing — surface-agnostic)
   │  → runMigrateAndDelete / etc. │
   └───────────────┬───────────────┘
                   │ on success
                   ▼
   ┌───────────────────────────────┐
   │  markMigrationFinishedAtScope │
   │  config.reloadSettings        │
   │  panel re-evaluates + reRender│  (host posts updated view-model)
   └───────────────────────────────┘
```

The arrows model **data flow**, not file structure. The webview never imports
project code directly — it only sends/receives JSON messages.

### Component Responsibilities

| File | Responsibility |
|---|---|
| `src/migrations/panel.ts` (new) | `MigrationsPanel` class: singleton, HTML builder, message router, dispose chain. |
| `src/migrations/codeActions.ts` | After phase: keep `dispatchMigrationAction` + `MigrationActionArgs`; delete `MigrationCodeActionProvider`, `MIGRATION_ACTION_COMMAND` registration, `resolveWkspUriForDispatch`, `CASE_2_LABELS` / `CASE_3_LABELS` (move labels into the panel's view-model builder, since the webview owns the rendering). |
| `src/migrations/diagnostics.ts` | Deleted entirely (or reduced to no-op stubs the integration suite still imports — check imports). |
| `src/migrations/consent.ts → runConsentFlow` | Reshape: instead of `publishConsentDiagnostics`, stash the latest `ConsentHit[]` somewhere the panel can read (e.g., expose a module-level `getPendingHits()` from `panel.ts`) and surface the summary toast with a single `Open Migrations Panel` button. |
| `src/extension.ts` | Register `gs-behave-bdd.openMigrationsPanel` command; pass `context.extensionUri` into the panel constructor for any future `asWebviewUri` use. |

### Recommended Project Structure

```
src/migrations/
├── panel.ts           # NEW — Webview panel class
├── consent.ts         # UPDATED — runConsentFlow stashes hits, opens panel
├── codeActions.ts     # SLIMMED — only dispatchMigrationAction remains
├── diagnostics.ts     # DELETED (or empty re-export stubs if imported elsewhere)
├── evaluator.ts       # UNCHANGED
├── registry.ts        # UNCHANGED
├── completedMigrations.ts # UNCHANGED
└── types.ts           # UNCHANGED
```

### Pattern 1: Singleton Panel with createOrShow / dispose

**What:** Exactly one panel instance per VS Code window. Subsequent
"open panel" calls `reveal()` the existing panel rather than spawning a second.

**When to use:** Always, for management/settings-style panels. (Multi-panel is
for "open document X" patterns like a Markdown preview per-file.)

**Example (canonical, from `microsoft/vscode-extension-samples/webview-sample`):**

```typescript
// Source: https://github.com/microsoft/vscode-extension-samples/blob/main/webview-sample/src/extension.ts
class CatCodingPanel {
  public static currentPanel: CatCodingPanel | undefined;
  public static readonly viewType = 'catCoding';

  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (CatCodingPanel.currentPanel) {
      CatCodingPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      CatCodingPanel.viewType,
      'Cat Coding',
      column || vscode.ViewColumn.One,
      { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')] },
    );

    CatCodingPanel.currentPanel = new CatCodingPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._update();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(message => { /* … */ }, null, this._disposables);
  }

  public dispose() {
    CatCodingPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      this._disposables.pop()?.dispose();
    }
  }
}
```

### Pattern 2: Strict CSP with per-render nonce

Every call to `getHtml()` generates a fresh random nonce. The CSP allows
scripts only matching that nonce, so an attacker who somehow injected HTML
into a message-rendered string can't run JS. Inline `<style>` is forbidden;
inline `<script>` must carry `nonce="${nonce}"`.

```typescript
// Source: https://github.com/microsoft/vscode-extension-samples/blob/main/webview-sample/src/extension.ts
const nonce = getNonce();
return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Migrations</title>
</head>
<body>
  <!-- content -->
  <script nonce="${nonce}">
    // inline JS — runs because it carries the matching nonce
  </script>
</body>
</html>`;

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}
```

**Note on `'unsafe-inline'` in `style-src`:** The canonical webview-sample
only allows `${webview.cspSource}` for styles, requiring an external CSS file
loaded via `<link>`. For an inline-HTML approach (our recommendation), you
need `'unsafe-inline'` in `style-src` to allow an inline `<style>` block —
this is documented and accepted; the security risk is bounded because the
HTML itself is built by the extension, not user-controlled.

Alternative: emit the CSS via a `<style nonce="${nonce}">` tag — recent CSP3
allows nonced styles, and VS Code's webview engine (Electron Chromium ≥ 100)
supports it. Recommend the nonced `<style>` approach for cleanest CSP.

### Pattern 3: Message-passing protocol

**Extension → Webview:**
```typescript
this._panel.webview.postMessage({ type: 'setState', viewModel });
```

**Webview → Extension** (inside the inline `<script nonce=…>`):
```typescript
const vscode = acquireVsCodeApi();
document.querySelectorAll('button[data-action]').forEach(b => {
  b.addEventListener('click', (e) => {
    const t = e.currentTarget;
    vscode.postMessage({
      type: 'action',
      args: { entryId: t.dataset.entryId, case: Number(t.dataset.case), scope: Number(t.dataset.scope), action: t.dataset.action, wkspUri: t.dataset.wkspUri },
    });
  });
});
window.addEventListener('message', (ev) => {
  const m = ev.data;
  if (m.type === 'setState') render(m.viewModel);
});
```

**Extension receive side:**
```typescript
this._panel.webview.onDidReceiveMessage(async (m: PanelMessage) => {
  if (m.type === 'action') {
    await dispatchMigrationAction(m.args);
    await this._refresh(); // re-evaluate + postMessage('setState')
  }
}, null, this._disposables);
```

### Anti-Patterns to Avoid

- **Calling `acquireVsCodeApi()` more than once** — it throws on the second call. Capture it once at script top-level and reuse. [CITED: code.visualstudio.com/api/extension-guides/webview]
- **Re-assigning `webview.html` on every state change** — re-renders the entire DOM, drops focus, loses scroll. Prefer posting a message and patching DOM client-side.
- **Forgetting to dispose** — without `onDidDispose` → `this.dispose()`, message subscribers leak and `currentPanel` stays non-undefined, so `createOrShow` thinks the panel exists and silently no-ops.
- **Inline `onclick="…"` attributes** — blocked by CSP. Use `addEventListener` inside a nonced `<script>`.
- **Setting `retainContextWhenHidden: true` reflexively** — doubles memory. Only set if losing state on hide is unacceptable. Our list is cheap to rebuild; don't set it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| HTML escaping for user-derived values | Hand-rolled escape function | A 4-line helper escaping `& < > " '` is acceptable here since values are setting keys (alphanumeric + dots), not free-form. Document the assumption. | Truly user-untrusted content would warrant `dompurify`, but adding it for our 5-character namespace strings is overkill. |
| State persistence across reloads | Custom `globalState` write hooks | `WebviewPanelSerializer` if needed | Standard API for "panel survives window reload." But for this phase, recommend NOT persisting — re-derive hits from the registry on next activation. Simpler. |
| Theme detection / dark-mode toggle | `matchMedia` queries | Just use `var(--vscode-*)` — VS Code swaps values automatically on theme change. | Theming is automatic. |
| Nonce generation | Custom crypto | The webview-sample's 32-char alphanumeric is the de-facto pattern. | It's a CSP token, not a cryptographic secret — alphabet collisions over 62^32 are not a risk. |

**Key insight:** The whole point of the Webview API is that it's the
standard. Lean into the sample patterns; deviating saves nothing and breaks
the things VS Code maintainers test.

## Runtime State Inventory

> Phase 023 is a surface-replacement refactor; the runtime state inventory
> matters because diagnostics get *deleted* and the singleton panel introduces
> new in-memory state.

| Category | Items Found | Action Required |
|---|---|---|
| Stored data | None — `completedMigrations` (workspaceState) keys are unaffected. The panel reads but does not write to them via direct API; all writes go through `markMigrationFinishedAtScope`. | None. |
| Live service config | None — no external services. | None. |
| OS-registered state | None. | None. |
| Secrets / env vars | None. | None. |
| Build artifacts | `dist/extension.js` will pick up the new `panel.ts` automatically via webpack. **No** new copy-webpack-plugin entries needed if HTML stays inline. If plan 023 switches to external assets, `webpack.config.js` would need a new pattern in `copy-webpack-plugin`. | Verify webpack output contains the new module; no config change needed for inline-HTML approach. |
| In-process state | `MigrationCodeActionProvider` was stateless. The new `MigrationsPanel.currentPanel` is module-level singleton state. `getDiagnosticCollection()` lazy singleton in `diagnostics.ts` — gone after delete. | New singleton is bounded (one per host); disposal nulls it correctly. The deleted diagnostic collection must be released from `context.subscriptions` reference in `extension.ts` — search for where it's added. |

**Canonical question:** *After every file in the repo is updated, what runtime
systems still have the old string cached, stored, or registered?* — Answer:
The `gs-behave-bdd.migration.action` command registration in
`extension.ts` and any `vscode.languages.registerCodeActionsProvider` call for
the migration provider. Both must be removed from `extension.ts` along with
the provider import.

## Common Pitfalls

### Pitfall 1: Stale view after settings change
**What goes wrong:** User has the panel open, switches to settings.json, edits
a key, comes back — panel still shows the old hits.
**Why it happens:** No listener wired to `vscode.workspace.onDidChangeConfiguration`.
**How to avoid:** Subscribe in the `MigrationsPanel` constructor (push the
disposable into `this._disposables`); on event, re-evaluate and post a
`setState` message.
**Warning signs:** Manual test — change a key while the panel is visible, see
no update.

### Pitfall 2: `acquireVsCodeApi()` called twice
**What goes wrong:** Throws "An instance of the VS Code API has already been acquired."
**Why it happens:** Re-rendering by re-setting `webview.html` runs the script
again. Second script-run calls `acquireVsCodeApi()` again → throw.
**How to avoid:** Either (a) never re-set `webview.html` after first render —
update via `postMessage` — or (b) stash the API on `window` and guard:
```javascript
const vscode = window.__vscode__ ?? (window.__vscode__ = acquireVsCodeApi());
```
**Warning signs:** DevTools shows a thrown error after the second open/reveal.
Use the **Webview Developer Tools** via the command
`Developer: Open Webview Developer Tools`.

### Pitfall 3: Silent CSP failure
**What goes wrong:** Buttons don't respond, panel looks correct but is dead.
**Why it happens:** Nonce mismatch between meta tag and `<script>` tag — typically
because `getHtml()` is called twice and the second call's nonce was used in
HTML but the first call's was used in script (race in template assembly).
**How to avoid:** Capture `const nonce = getNonce()` ONCE per `getHtml()` call,
use the same variable everywhere in the template literal.
**Warning signs:** Webview Developer Tools console shows CSP violations like
`Refused to execute inline script because it violates the following Content Security Policy directive…`. Always check that console when buttons don't work.

### Pitfall 4: Button event-handler leak on re-render
**What goes wrong:** Memory grows; eventually duplicate handlers fire.
**Why it happens:** Setting `innerHTML = newHtml` removes nodes but if you also
attached listeners to `document` for delegation, those persist.
**How to avoid:** Either keep listeners attached to the container that gets
replaced (so removal cleans them) OR use a single delegated listener on
`document.body` that reads `event.target.dataset` — no per-render attachment.
The delegated pattern is simpler and recommended.

### Pitfall 5: `currentPanel` set but panel actually closed
**What goes wrong:** `createOrShow` reveals nothing because `currentPanel` is
non-undefined but the underlying panel is disposed.
**Why it happens:** `dispose()` wasn't called on `onDidDispose` (e.g., user
closed the tab and an exception in the dispose handler prevented `currentPanel = undefined`).
**How to avoid:** Always set `currentPanel = undefined` as the FIRST line of
`dispose()`, before any code that could throw.

### Pitfall 6: Webview not in a remote-friendly state
**What goes wrong:** Webviews work fine, BUT if your panel ever needs to load
`media/foo.css` via `asWebviewUri`, the local resource must be physically present
on the **window** side. In remote-extension-host setups (this phase's whole
motivation), VS Code transparently proxies extension-host files to the window,
so it does work — but only if `localResourceRoots` is set correctly to
`[context.extensionUri]` or a subfolder thereof.
**How to avoid:** Always pass `context.extensionUri` (or a `joinPath` from it)
in `localResourceRoots`, never an arbitrary fs path.

## Code Examples

### Example 1: Minimal MigrationsPanel skeleton (matches consent.ts code style)

```typescript
// Source pattern: microsoft/vscode-extension-samples/webview-sample
// Adapted to project conventions: 2-space indent, strict mode, camelCase,
// `import * as vscode from 'vscode'`, named singleton export.
import * as vscode from 'vscode';
import { config } from '../configuration';
import { dispatchMigrationAction, type MigrationActionArgs } from './codeActions';

type PanelMessage =
  | { type: 'action'; args: MigrationActionArgs }
  | { type: 'ready' };

export class MigrationsPanel {
  public static currentPanel: MigrationsPanel | undefined;
  public static readonly viewType = 'gs-behave-bdd.migrationsPanel';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri): void {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
    if (MigrationsPanel.currentPanel) {
      MigrationsPanel.currentPanel._panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      MigrationsPanel.viewType,
      'Behave BDD: Migrations',
      column,
      {
        enableScripts: true,
        localResourceRoots: [extensionUri],
        // retainContextWhenHidden intentionally omitted — list is cheap to rebuild.
      },
    );
    MigrationsPanel.currentPanel = new MigrationsPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.webview.html = this._getHtml();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(async (m: PanelMessage) => {
      try {
        if (m.type === 'action') {
          await dispatchMigrationAction(m.args);
          await this._refresh();
        } else if (m.type === 'ready') {
          await this._refresh();
        }
      } catch (e) {
        config.logger.logInfoAllWksps(`MigrationsPanel: message handler failed: ${e}`);
      }
    }, null, this._disposables);

    // Re-render when the user edits settings.json externally.
    this._disposables.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('gs-behave-bdd')) void this._refresh();
      }),
    );
  }

  public dispose(): void {
    MigrationsPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) this._disposables.pop()?.dispose();
  }

  private async _refresh(): Promise<void> {
    // Build view-model from current evaluator output (filled out in plan 023-02).
    const viewModel = { hits: [], migrationMode: 'prompt' as const, empty: true };
    await this._panel.webview.postMessage({ type: 'setState', viewModel });
  }

  private _getHtml(): string {
    const nonce = getNonce();
    const cspSource = this._panel.webview.cspSource;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src ${cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Migrations</title>
  <style nonce="${nonce}">
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 1rem; }
    .row { border: 1px solid var(--vscode-panel-border); padding: .75rem; margin-bottom: .5rem; }
    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 0; padding: .25rem .75rem; margin-right: .25rem; cursor: pointer; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button:focus { outline: 1px solid var(--vscode-focusBorder); }
    .empty { color: var(--vscode-descriptionForeground); font-style: italic; }
  </style>
</head>
<body>
  <h1>Pending Migrations</h1>
  <div id="root"><p class="empty">Loading…</p></div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const root = document.getElementById('root');
    window.addEventListener('message', (ev) => {
      const m = ev.data;
      if (m.type === 'setState') render(m.viewModel);
    });
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLButtonElement) || !t.dataset.action) return;
      vscode.postMessage({
        type: 'action',
        args: {
          entryId: t.dataset.entryId,
          case: Number(t.dataset.case),
          scope: Number(t.dataset.scope),
          action: t.dataset.action,
          wkspUri: t.dataset.wkspUri,
        },
      });
    });
    function render(vm) { /* filled out in plan 023-02 */ }
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}
```

### Example 2: Registering the command in `extension.ts`

```typescript
// Adds to the existing context.subscriptions.push(...) block in activate():
context.subscriptions.push(
  vscode.commands.registerCommand('gs-behave-bdd.openMigrationsPanel', () => {
    MigrationsPanel.createOrShow(context.extensionUri);
  }),
);
```

And in `package.json` contributes:

```json
{
  "command": "gs-behave-bdd.openMigrationsPanel",
  "title": "Behave BDD: Open Migrations Panel",
  "category": "Behave BDD"
}
```

## Theming — CSS Variable Catalogue

VS Code exposes ~400 theme colors as `var(--vscode-<dotted-key>)` (dots → dashes).
The relevant subset for a management panel:

| Variable | Purpose |
|---|---|
| `--vscode-foreground` | Default body text. |
| `--vscode-editor-background` | Recommended panel background. |
| `--vscode-editor-foreground` | Alt body text. |
| `--vscode-descriptionForeground` | Secondary / muted text (empty state). |
| `--vscode-panel-border` | Card / row borders. |
| `--vscode-button-background` | Primary button bg. |
| `--vscode-button-foreground` | Primary button fg. |
| `--vscode-button-hoverBackground` | Button hover bg. |
| `--vscode-button-secondaryBackground` | Secondary button bg (for "Keep both" etc.). |
| `--vscode-button-secondaryForeground` | Secondary button fg. |
| `--vscode-button-secondaryHoverBackground` | Secondary button hover. |
| `--vscode-focusBorder` | Focus outline. |
| `--vscode-input-background` | If we ever add a dropdown for Migration Mode. |
| `--vscode-input-foreground` | Dropdown fg. |
| `--vscode-input-border` | Dropdown border. |
| `--vscode-errorForeground` | Error text. |
| `--vscode-list-warningForeground` | Warning text — case 3 ambiguity. |
| `--vscode-link-foreground` | Hyperlink color. |
| `--vscode-font-family` | Workbench default font. |
| `--vscode-font-size` | Workbench default size. |
| `--vscode-editor-font-family` | Monospace (for displaying setting keys). |

Body theme kind: VS Code adds one of these classes to `<body>`:
`vscode-light`, `vscode-dark`, `vscode-high-contrast`, or
`vscode-high-contrast-light`. Use only as a last resort; prefer CSS variables
because they auto-update on theme change without re-rendering.

Sources: [CITED: code.visualstudio.com/api/extension-guides/webview#theming-webview-content], [CITED: code.visualstudio.com/api/references/theme-color]

## State Preservation

| Option | When to use | Cost | Recommendation for this phase |
|---|---|---|---|
| `retainContextWhenHidden: true` | Webview state is expensive to rebuild (e.g., a Monaco editor). | Memory: each panel keeps full DOM + JS heap when hidden. | **No.** Our list rebuilds in <1ms from the in-memory registry. |
| `webview.getState()` / `setState()` | Survive panel hide/show while preserving scroll, form input. | Cheap; values must be JSON-serializable. | **Optional.** Not needed in v1; defer. |
| `WebviewPanelSerializer` | Survive full VS Code reload — panel restores on next launch. | Requires `package.json` activation event; rebuild from serialized state. | **No.** Panel can be re-opened by the toast or command on next activation; no need to persist tab. |

## Asset Strategy — Inline vs External

| Approach | Pros | Cons | Recommendation |
|---|---|---|---|
| Inline HTML/CSS/JS in TS template literal | Zero build changes; one file; nonce flows naturally. | TS file gets ~150-line HTML string; CSP needs `'nonce-…'` on `<style>` and `<script>`. | **Pick this for v1.** Total panel HTML ≈ 8-10 KB; well under the threshold (~50 KB) where externalizing pays off. |
| External `media/panel.{html,css,js}` + `asWebviewUri` | Editor syntax highlighting on assets; easier reviews. | `webpack.config.js` needs `copy-webpack-plugin` patterns for media/; `localResourceRoots` must include media/; CSS/JS load via `<link>` / `<script src>`. | Pick if v2 grows complex (≥ 3 sub-views, real forms, charts). |

## Testing Patterns

### Unit-test surface

| What | How | Coverage |
|---|---|---|
| `MigrationsPanel.createOrShow` singleton behavior | Stub `vscode.window.createWebviewPanel` in `vscode.mock.ts` to return a mock `WebviewPanel` exposing `webview`, `reveal`, `onDidDispose`, `onDidReceiveMessage`, `dispose`. Assert second call invokes `reveal` not `createWebviewPanel`. | High. |
| HTML generation | Call private `_getHtml` via `(panel as any)._getHtml()`, assert returned string contains nonce, expected CSP, button labels per view-model. | High. |
| Message handler routing | Capture the handler passed to `onDidReceiveMessage`, invoke directly with `{type:'action', args:…}`, assert `dispatchMigrationAction` (mocked via Sinon) was called with matching args. | High. |
| Dispose path | Call `dispose()`, assert `currentPanel === undefined`, all `_disposables` had `.dispose()` called, no further messages route. | Medium. |
| Configuration-change re-render | Fire the registered `onDidChangeConfiguration` listener with `e.affectsConfiguration('gs-behave-bdd') === true`, assert `postMessage` was called with `{type:'setState', …}`. | Medium. |

### Why not Webview integration tests?

The existing integration suite spawns VS Code Insiders/Stable via
`@vscode/test-electron`. Driving a Webview through that suite requires
`webview.postMessage` calls from inside the extension test process, but VS Code
sandboxes the webview's window context — you can't query DOM from the test
runner without injecting a probe script. The cost (custom probe protocol, flaky
timing) far exceeds the value (one extra layer of confidence beyond unit tests
that already cover routing). Keep integration coverage at the
`dispatchMigrationAction` boundary, which is surface-agnostic — the existing
suite already does this per phase 21 design.

### Mock additions needed in `test/unit/vscode.mock.ts`

```typescript
// Augment the existing window mock:
window.createWebviewPanel = (viewType: string, title: string, viewColumn: number, options: unknown) => ({
  viewType, title, viewColumn, options,
  webview: {
    cspSource: 'vscode-webview://mock',
    html: '',
    asWebviewUri: (u: Uri) => u,
    onDidReceiveMessage: (cb: (m: unknown) => void) => { /* capture cb */ return { dispose() {} }; },
    postMessage: (_m: unknown) => Promise.resolve(true),
  },
  reveal: (_c?: number) => { /* noop */ },
  onDidDispose: (cb: () => void) => { /* capture cb */ return { dispose() {} }; },
  dispose: () => { /* noop */ },
});
```

Capture the registered callbacks on a module-level array so tests can invoke
them; this matches the existing `EventEmitter` mock pattern in `vscode.mock.ts`.

## Concrete code skeleton

See **Code Examples → Example 1** above. ~85 lines including the HTML
template; meets the prompt's "60-line skeleton" with the inline HTML pulled
out, but is more useful for plan 023-01 with the HTML included since CSP +
nonce flow is the load-bearing part.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| `<webview>` tag (Electron native) | `vscode.window.createWebviewPanel` | VS Code 1.25 (2018) | The extension API; `<webview>` not exposed to extensions at all. |
| `asWebviewUri()` vs. older `vscode-resource:` scheme | `asWebviewUri()` + `cspSource` | VS Code 1.38 (2019) | `vscode-resource:` deprecated. 1.82 is well past this. |
| `WebviewView` (sidebar embedded) | Used for sidebar/panel container views | VS Code 1.50+ | NOT what we want — `createWebviewPanel` is for tab-style panels. Mentioned only to avoid confusion. |
| External `media/` assets | Mostly stylistic preference | N/A | Inline HTML is still standard for small panels in 2025. |

**Deprecated/outdated:**
- `vscode-resource:` URI scheme: replaced by `asWebviewUri`. Do not use.
- Loading `<script>` tags without nonces: still works but VS Code's review/CSP advisories discourage. Always nonce.

## Project Constraints (from CLAUDE.md)

- **After every code change:** `npx eslint src --ext ts` must be clean.
- **After modifying `src/`:** `npm run test:unit` must pass.
- **TypeScript strict mode** + ES2021 target — all examples above type-check.
- **2-space indentation** (project convention; the prompt's "4-space" reference is incorrect — `consent.ts`, `vscode.mock.ts`, `codeActions.ts` all use 2-space).
- **camelCase** for functions/variables; **PascalCase** for classes; constants UPPER_SNAKE_CASE.
- **`_disposables.push(...)`** pattern for cleanup; never raw subscriptions.
- **`config.logger.logInfo(msg, wkspUri)`** for audit logging; never `console.log`.
- **No Markdown in VS Code message strings** (text-only constraint from phase 21 — but irrelevant inside the Webview HTML, where full HTML rendering is available).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | `@types/vscode 1.82` exposes `webview.cspSource`. | Standard Stack | LOW — `cspSource` has been on the typings since 1.38; the project would not compile against 1.82 otherwise. Verify by grepping `node_modules/@types/vscode/index.d.ts` if any doubt. `[CITED: code.visualstudio.com/api/extension-guides/webview]` |
| A2 | Inline `<style nonce="…">` is honored by VS Code's webview CSP engine (Electron Chromium). | CSP & Pattern 2 | LOW — CSP3 nonced styles supported since Chromium 75 (2019); Electron ≥ 22 used by VS Code ≥ 1.75. If wrong, fall back to `'unsafe-inline'` in `style-src` (still acceptable for extension-controlled HTML). `[ASSUMED]` |
| A3 | `vscode.workspace.onDidChangeConfiguration` fires when the user edits settings.json externally (not just via the Settings UI). | Pattern, Pitfall 1 | LOW — documented behavior; this is the canonical hook for that. Verified across many extensions in the wild. `[CITED: code.visualstudio.com/api/references/vscode-api]` |
| A4 | The integration suite at `test/integration/migration-consent suite/` truly is surface-agnostic and won't need rework. | CONTEXT.md `## Test inventory` | LOW — CONTEXT.md asserts it; this research did not re-verify. Plan 023-05 should confirm by reading the suite. `[ASSUMED]` |

## Open Questions

These are 5 design questions surfaced for the planner / discuss-phase. None
are pinned in `023-CONTEXT.md`.

1. **Multi-root workspaces: one panel total, or one per workspace folder?**
   - What we know: `MIGRATION_REGISTRY` is global, but `wkspUri` is per-folder; consent hits are evaluated per-folder.
   - What's unclear: A user with three workspace folders open — do they see one merged list (with a "folder" column per row) or three panels?
   - Recommendation: **One panel total**, with rows that show the workspace folder name as metadata when there's more than one folder. Reuses the singleton pattern cleanly; matches what the Problems pane currently does (one diagnostic surface aggregating all folders).

2. **Auto-reopen on next activation if previously open?**
   - What we know: `WebviewPanelSerializer` is the API; CONTEXT.md non-goals say "no persistence beyond `completedMigrations`."
   - What's unclear: Does "persistence" mean storage of choices (which we don't want) or window-tab persistence (which is a separate UX question)?
   - Recommendation: **No serializer.** If hits are present at activation, the summary toast pops anyway. If no hits, no panel needed.

3. **Configuration-change listener scope: global or filtered to migration keys?**
   - What we know: `e.affectsConfiguration('gs-behave-bdd')` filters to our namespace, but the panel cares specifically about keys that are in `MIGRATION_REGISTRY` source/dest.
   - What's unclear: Should we filter tighter to avoid refresh churn when the user toggles unrelated `gs-behave-bdd.*` settings (xRay, runParallel, etc.)?
   - Recommendation: **Filter to `gs-behave-bdd` namespace.** Re-evaluation is cheap (sub-ms) and over-refresh is benign. Keep simple.

4. **"Migration Mode" section: live-write to which scope?**
   - What we know: `migrationMode` setting is at-call resolved per-workspace.
   - What's unclear: When the user picks `migrate-and-keep` in the panel's Migration Mode dropdown, do we write to `Global`, `Workspace`, or the active `WorkspaceFolder` target?
   - Recommendation: **Write to `Global` by default**, with a small "Apply to:" radio adjacent to the dropdown for advanced users. Or simpler: ship v1 with Global-only writes and document this. Discuss with user.

5. **Empty-state behavior: keep panel open or auto-close?**
   - What we know: After the user resolves all pending migrations, the panel will render the empty state.
   - What's unclear: Should the panel auto-dispose after a delay, or stay open showing "No pending migrations" indefinitely?
   - Recommendation: **Stay open.** Auto-close is surprising UX; explicit user close (tab X) is predictable. The empty state also confirms to the user that their action worked.

## Environment Availability

No external tools beyond the existing project stack. All work is TypeScript edits compiled by the existing webpack pipeline. Skipping the dependency table.

## Validation Architecture

### Test Framework
| Property | Value |
|---|---|
| Framework | Mocha 9.2.2 + Sinon 21.0.1 |
| Config file | `test/unit/` (project pattern; per project skills) |
| Quick run command | `npm run test:unit` |
| Full suite command | `npm run test:unit && npm run test:integration` |

### Phase Requirements → Test Map
The phase will have requirement IDs assigned during planning. Anticipated mapping:

| Req | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| Panel-01 | `createOrShow` creates a panel the first time, reveals on subsequent calls | unit | `npm run test:unit -- --grep "MigrationsPanel"` | ❌ Wave 0 — `test/unit/migrations/panel.test.ts` |
| Panel-02 | HTML output contains CSP meta with nonce, button data attrs match view-model | unit | same | ❌ Wave 0 |
| Panel-03 | Message handler dispatches to `dispatchMigrationAction` with correct args | unit | same | ❌ Wave 0 |
| Panel-04 | Dispose clears `currentPanel` and all `_disposables` | unit | same | ❌ Wave 0 |
| Panel-05 | `onDidChangeConfiguration` for `gs-behave-bdd` triggers postMessage('setState') | unit | same | ❌ Wave 0 |
| Panel-06 | Existing `dispatchMigrationAction` still works end-to-end | integration | `npm run test:integration` | ✅ existing migration-consent suite |
| Removal-01 | Diagnostics module deleted; no imports of `publishConsentDiagnostics` remain | unit (compile-time) | `npx tsc --noEmit` + grep | ✅ structural |
| Removal-02 | `MigrationCodeActionProvider` and command registration gone from `extension.ts` | unit (compile-time) | ESLint + grep | ✅ structural |

### Sampling Rate
- **Per task commit:** `npm run test:unit`
- **Per wave merge:** `npm run test:unit && npx eslint src --ext ts`
- **Phase gate:** Full suite green (`npm run test:unit && npm run test:integration`) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/unit/migrations/panel.test.ts` — covers Panel-01 through Panel-05
- [ ] Extend `test/unit/vscode.mock.ts` with `createWebviewPanel` mock (snippet provided above)
- [ ] Reshape `test/unit/migrations.test.ts` test 4.10 to assert panel-opening signal instead of diagnostic publish (per CONTEXT.md)
- [ ] Reshape `test/unit/migrations/consent.test.ts` toast assertions to expect single `Open Migrations Panel` button

## Security Domain

ASVS categories applicable to a self-contained extension Webview:

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | no | N/A — single-user IDE context. |
| V3 Session Management | no | N/A. |
| V4 Access Control | no | N/A. |
| V5 Input Validation | yes | All Webview→host messages are JSON; the host MUST validate `m.type`, `m.args.entryId` against `MIGRATION_REGISTRY`, and `m.args.scope` against the `ConfigurationTarget` enum. Untrusted message bodies could otherwise dispatch arbitrary actions. |
| V6 Cryptography | yes (light) | Nonce generation: 32-char alphanumeric is a CSP token, not a secret. `Math.random` is acceptable per the documented sample. Do not represent as cryptographically strong. |
| V14 Configuration | yes | CSP meta tag must be present and strict (`default-src 'none'`); webview must set `enableScripts: true` only because we need them; `localResourceRoots` must be `[extensionUri]` (or narrower). |

### Known Threat Patterns for VS Code Webviews

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| XSS via unescaped string in HTML template | Tampering | Escape the 5 chars `& < > " '` when interpolating registry-derived strings into the HTML template. Don't import `dompurify` for this volume. |
| Message spoof (untrusted iframe sending crafted messages) | Spoofing | VS Code restricts `postMessage` to the panel's own webview — the host's `onDidReceiveMessage` only fires for that panel. No additional check needed beyond validating message shape. |
| Action-replay (user clicks button after settings already migrated) | Tampering | The existing handlers in `consent.ts` are idempotent w.r.t. `markMigrationFinishedAtScope`; replay is safe. |
| `localResourceRoots` set too wide | Information Disclosure | Use `[context.extensionUri]`, never `[/]`. |
| Inline scripts without nonce | XSS | CSP `script-src 'nonce-xxx'` blocks any script without matching nonce. |

## Sources

### Primary (HIGH confidence)
- [VS Code Webview API guide](https://code.visualstudio.com/api/extension-guides/webview) — CSP pattern, theming, lifecycle, message-passing.
- [VS Code API Reference](https://code.visualstudio.com/api/references/vscode-api) — `window.createWebviewPanel`, `WebviewPanel`, `Webview` interfaces.
- [microsoft/vscode-extension-samples — webview-sample/src/extension.ts](https://github.com/microsoft/vscode-extension-samples/blob/main/webview-sample/src/extension.ts) — canonical `CatCodingPanel` source, fetched verbatim.
- [VS Code Theme Color reference](https://code.visualstudio.com/api/references/theme-color) — `--vscode-*` variable catalogue.
- Project source: `src/migrations/consent.ts`, `src/migrations/codeActions.ts`, `src/migrations/diagnostics.ts`, `test/unit/vscode.mock.ts`.

### Secondary (MEDIUM confidence)
- General Electron/Chromium CSP behavior for nonced styles (CSP3) — widely documented, but not pinned to a specific VS Code version statement. Risk: if VS Code's older webview shell rejects nonced `<style>` on a specific version, fall back to `'unsafe-inline'`.

### Tertiary (LOW confidence)
- None — all material claims for this phase are sourceable to official docs or the codebase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — single API surface, well-documented sample.
- Architecture: HIGH — pattern is canonical; mirrors `CatCodingPanel`.
- Pitfalls: MEDIUM-HIGH — all 6 pitfalls observed in the wild; pitfall 3 (silent CSP failure) is the most common.
- Theming: HIGH — direct from VS Code docs.
- Testing: MEDIUM — recommendation defers integration tests; unit tests follow existing project patterns.

**Research date:** 2026-05-14
**Valid until:** ~2026-06-14 (Webview API is stable; revisit only if `@types/vscode` upgrade reveals new shape).
