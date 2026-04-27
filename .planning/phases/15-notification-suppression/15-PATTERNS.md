# Phase 15: Notification Suppression Infrastructure - Pattern Map

**Mapped:** 2026-04-27
**Files analyzed:** 10 (2 created, 8 modified)
**Analogs found:** 10 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/notifications.ts` (CREATE) | utility / cross-cutting helper module | request-response (settings I/O + UI prompt) | `src/common.ts` (plain exported helpers) + `src/extension.ts` L141-L181 (existing inline notification) + `src/settings.ts` L13-L29 (`getWithLegacyFallback` scope-aware inspect) | exact (composite) |
| `test/unit/notifications.test.ts` (CREATE) | test | request-response (stubbed config) | `test/unit/settings/multiPathPrecedence.test.ts` L22-L70 + `test/unit/settings/legacyFallback.test.ts` L10-L23 (inline `makeConfig` with explicit-keys / scope control) | exact |
| `src/extension.ts` (MODIFY) | extension entry / handler | event-driven (activation flow) | `src/extension.ts` self — replace inline block at L141-L181 in place; add migration call in `activate()` near L232-L242 (the existing per-workspace `for` loops) | exact (self-replacement) |
| `src/settings.ts` (MODIFY) | configuration / value object | request-response (constructor reads VS Code config) | `src/settings.ts` self — `featuresPaths` array loader at L190 (D-12 pattern) for the array shape + L155-L167 strict-undefined block for the throw pattern | exact |
| `src/testWorkspaceConfig.ts` (MODIFY) | test mock / configuration | request-response (mock VS Code API) | `src/testWorkspaceConfig.ts` self — `featuresPaths` mock at L17, L40, L57, L90-L91, L148-L150 (array setting with `?? []` fallback) | exact |
| `package.json` (MODIFY) | config / extension manifest | request-response (declarative schema) | `package.json` self — `gs-behave-bdd.featuresPaths` schema at L44-L52 (array-of-strings with `default: []`) | exact |
| `test/unit/settings/multiPathPrecedence.test.ts` (MODIFY) | test | request-response | `test/unit/settings/multiPathPrecedence.test.ts` self — `BASE_CFG` at L54-L66 (drop boolean, add array) + `TestWorkspaceConfig` block at L253-L267 | exact (self-edit) |
| `test/unit/settings/verboseLogging.test.ts` (MODIFY) | test | request-response | self — `makeFakeWkspSettings` at L70-L98 + (no BASE_CFG; only the fake-wksp object includes the boolean at L81) | exact (self-edit) |
| `test/unit/settings/projectUriDerivation.test.ts` (MODIFY) | test | request-response | self — `BASE_CFG` at L50-L63 | exact (self-edit) |
| `test/unit/settings/logSettingsPlural.test.ts` (MODIFY) | test | request-response | self — `makeFakeWkspSettings` at L37-L68 (line 48: `suppressMultiConfigNotification: false`) | exact (self-edit) |

## Pattern Assignments

### `src/notifications.ts` (CREATE — utility module, request-response)

**Analogs:**
1. **Style** — `src/common.ts` (plain exported functions, no class wrapper). Per D-01.
2. **Existing notification behavior** — `src/extension.ts` L141-L181 (the block being replaced — every behavior here MUST be preserved).
3. **Scope-aware inspect** — `src/settings.ts` L13-L29 (`getWithLegacyFallback` → ladder: `workspaceFolderValue` then `workspaceValue` then `globalValue`).
4. **Cache read** — `src/configuration.ts` L77-L87 (`config.workspaceSettings[wkspUri.path]`).

**Imports pattern** (model after `src/settings.ts` L1-L10 and `src/common.ts`):
```typescript
import * as vscode from 'vscode';
import { config } from './configuration';
```
Use namespace import for vscode (project convention per AI_INSTRUCTIONS.md). No path aliases — relative imports only. Do NOT import `Logger` directly; reach `config.logger` for warn-on-failure logging (D-07).

**Existing notification block to REPLICATE behavior-for-behavior** (`src/extension.ts` L141-L181):
```typescript
// L142-L143: read suppression from cached WorkspaceSettings (KEEP this access path)
const wkspSettings = config.workspaceSettings[wkspUri.path];
const suppress = wkspSettings?.suppressMultiConfigNotification ?? false;

// L157-L181: gated showInformationMessage with three buttons + DSA + write-on-DSA
if (!suppress) {
  vscode.window.showInformationMessage(
    message,
    'Select Project',
    'Show Details',
    "Don't Show Again"
  ).then(action => {
    if (action === 'Select Project') {
      vscode.commands.executeCommand('gs-behave-bdd.selectProject');
    } else if (action === 'Show Details') {
      vscode.commands.executeCommand('gs-behave-bdd.openOutput');
    } else if (action === "Don't Show Again") {
      const wkspCfg = vscode.workspace.getConfiguration("gs-behave-bdd", wkspUri);
      wkspCfg.update("suppressMultiConfigNotification", true, vscode.ConfigurationTarget.WorkspaceFolder);
    }
  });
}
```

The new module must reproduce: (a) the cache-read for the suppression check, (b) the WorkspaceFolder-scope write on DSA, (c) the fire-and-forget `.then()` shape (so the caller does not need to `await`). The literal string `"Don't Show Again"` MUST be defined as a single module constant (anti-pattern in RESEARCH.md: "use a constant `DONT_SHOW_AGAIN` to avoid divergence").

**Core pattern — `isSuppressed`** (mirrors the `wkspSettings?.suppressMultiConfigNotification ?? false` access path at extension.ts L142-L143):
```typescript
export function isSuppressed(key: string, wkspUri: vscode.Uri): boolean {
  const wkspSettings = config.workspaceSettings[wkspUri.path];
  return wkspSettings?.suppressedNotifications?.includes(key) ?? false;
}
```

**Core pattern — `suppressNotification`** (mirrors L177-L178 write-with-target). NOTIF-03 mandates `WorkspaceFolder`. Dedup per D-11 reads `inspect().workspaceFolderValue` (not `cfg.get()` — see Pitfall 2 in RESEARCH.md):
```typescript
export async function suppressNotification(key: string, wkspUri: vscode.Uri): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("gs-behave-bdd", wkspUri);
  const insp = cfg.inspect<string[]>("suppressedNotifications");
  const current = Array.isArray(insp?.workspaceFolderValue) ? insp!.workspaceFolderValue : [];
  if (current.includes(key)) return; // D-11 dedup
  try {
    await cfg.update("suppressedNotifications", [...current, key], vscode.ConfigurationTarget.WorkspaceFolder);
  } catch (e) {
    config.logger.logInfo(`Could not suppress notification "${key}": ${e}`, wkspUri);
  }
}
```

**Core pattern — `showSuppressibleNotification`** (RESEARCH.md Pattern 3, lines 286-311):
```typescript
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
    return undefined; // D-04: caller never sees DSA
  }
  return action;
}
```

**Migration pattern — `migrateLegacySuppressMultiConfig`** (scope-preserving migration, RESEARCH.md Pattern 2 lines 240-281). Use the same scope-detection ladder as `getWithLegacyFallback` in `src/settings.ts` L20-L25 (most-specific wins: workspaceFolderValue → workspaceValue → globalValue). Per D-07 the function must NEVER throw — wrap the writes in try/catch and `config.logger.logInfo` on failure:
```typescript
export async function migrateLegacySuppressMultiConfig(wkspUri: vscode.Uri): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("gs-behave-bdd", wkspUri);
  const insp = cfg.inspect<boolean>("suppressMultiConfigNotification");
  if (!insp) return;

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
  if (target === undefined || legacyValue !== true) return; // no-op for false / unset

  try {
    const existingInsp = cfg.inspect<string[]>("suppressedNotifications");
    const existingArr =
      target === vscode.ConfigurationTarget.WorkspaceFolder ? existingInsp?.workspaceFolderValue :
      target === vscode.ConfigurationTarget.Workspace ? existingInsp?.workspaceValue :
      existingInsp?.globalValue;
    const merged = Array.isArray(existingArr) ? [...existingArr] : [];
    if (!merged.includes("multiConfigNotification")) merged.push("multiConfigNotification");

    await cfg.update("suppressedNotifications", merged, target);
    await cfg.update("suppressMultiConfigNotification", undefined, target); // D-06
  } catch (e) {
    // D-07: warn-and-continue, never throw
    config.logger.logInfo(
      `Could not migrate suppressMultiConfigNotification to suppressedNotifications: ${e}`,
      wkspUri
    );
  }
}
```

**Error handling pattern:** Helpers `throw` only via the implicit await; per AI_INSTRUCTIONS.md "Helper/utility functions must throw, never catch" — but D-07 explicitly overrides this for the migration function (warn-and-continue). The `showSuppressibleNotification` and `suppressNotification` helpers SHOULD let `await cfg.update(...)` reject naturally (callers have try/catch), EXCEPT `suppressNotification` is fire-and-forget from the `.then()` chain in `extension.ts`, so it should also catch+log per the existing block at extension.ts L177-L178 (which does NOT await or catch).

**ESLint compliance:** Avoid declaring unused destructured fields from `inspect()` results (RESEARCH.md Pitfall 6). Either use direct property access or prefix with `_`.

---

### `test/unit/notifications.test.ts` (CREATE — test, request-response)

**Analog:** `test/unit/settings/legacyFallback.test.ts` (L10-L23) for explicit-keys-aware `makeConfig`; `test/unit/settings/multiPathPrecedence.test.ts` (L22-L35, L74-L90) for sandbox setup with `sinon.stub(common, ...)`.

**Why this analog (not `TestWorkspaceConfig`):** RESEARCH.md Pitfall 5 — `TestWorkspaceConfig.inspect()` only sets `workspaceFolderValue` (testWorkspaceConfig.ts L185). Migration tests must exercise `globalValue`/`workspaceValue` paths, which only the inline `makeConfig` helper supports.

**Imports pattern** (copy from `multiPathPrecedence.test.ts` L1-L17):
```typescript
import * as assert from 'assert';
import * as sinon from 'sinon';
import * as configModule from '../../../src/configuration';
import {
  isSuppressed, suppressNotification, showSuppressibleNotification, migrateLegacySuppressMultiConfig,
} from '../../../src/notifications';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscode = require('vscode');

const MOCK_URI = vscode.Uri.file('/fake/workspace');
```

**Scope-aware `makeConfig` helper** (extend from `legacyFallback.test.ts` L10-L23 — needs to support all three scope levels for migration coverage):
```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeScopedConfig(scopes: {
  globalValue?: unknown;
  workspaceValue?: unknown;
  workspaceFolderValue?: unknown;
}, updateSpy?: sinon.SinonSpy): any {
  return {
    get: (_key: string) => scopes.workspaceFolderValue ?? scopes.workspaceValue ?? scopes.globalValue,
    has: () => false,
    inspect: (_key: string) => ({
      key: _key,
      defaultValue: undefined,
      globalValue: scopes.globalValue,
      workspaceValue: scopes.workspaceValue,
      workspaceFolderValue: scopes.workspaceFolderValue,
    }),
    update: updateSpy ?? (() => Promise.resolve()),
  };
}
```

**Stubbing `vscode.workspace.getConfiguration`** (suppression module reads via the live API):
```typescript
let getConfigStub: sinon.SinonStub;
let updateSpy: sinon.SinonSpy;

setup(() => {
  updateSpy = sinon.spy(() => Promise.resolve());
  // For isSuppressed: also need to stub config.workspaceSettings (cache read path)
  sinon.stub(configModule.config, 'workspaceSettings').get(() => ({
    [MOCK_URI.path]: { suppressedNotifications: ['multiConfigNotification'] },
  }));
  getConfigStub = sinon.stub(vscode.workspace, 'getConfiguration')
    .returns(makeScopedConfig({ /* per-test */ }, updateSpy));
});

teardown(() => sinon.restore());
```

**Coverage matrix** (drives test names per RESEARCH.md Validation table lines 605-621):

| `--grep` | Behavior | Stub setup |
|----------|----------|------------|
| `isSuppressed` | true when key in cached array; false otherwise; false when cache absent | Stub `config.workspaceSettings` to return `{[uri.path]: {suppressedNotifications: [...]}}` |
| `suppressNotification` | calls `update("suppressedNotifications", [...current, key], WorkspaceFolder)` | `inspect().workspaceFolderValue = []`; assert `updateSpy.calledWith("suppressedNotifications", ["x"], vscode.ConfigurationTarget.WorkspaceFolder)` |
| `dedup` | does NOT call update if key already present | `inspect().workspaceFolderValue = ["x"]`; assert `updateSpy.notCalled` |
| `WorkspaceFolder scope` | third arg of update equals `vscode.ConfigurationTarget.WorkspaceFolder` (NOTIF-03) | assert `updateSpy.firstCall.args[2] === vscode.ConfigurationTarget.WorkspaceFolder` |
| `multiConfigNotification key` | wrapper passes that key string through | stub `vscode.window.showInformationMessage` to return `'Select Project'`; call `showSuppressibleNotification("multiConfigNotification", ...)` and assert returned value |
| `button passthrough` | wrapper returns the user's selected button label (not "Don't Show Again") | as above |
| `DSA returns undefined` | DSA selection causes wrapper to return undefined and call `suppressNotification` internally | stub `showInformationMessage` to return `"Don't Show Again"`; assert returns undefined and updateSpy called with the key |
| `migrate.*WorkspaceFolder` | NOTIF-06 folder-scope path | `inspect("suppressMultiConfigNotification").workspaceFolderValue = true`; assert update called with `WorkspaceFolder` |
| `migrate.*Workspace$` | NOTIF-06 workspace-scope path | only `workspaceValue = true` |
| `migrate.*Global` | NOTIF-06 global-scope path | only `globalValue = true` |
| `migrate.*no-op` | NOTIF-06 false/absent | `legacyValue = false` or `inspect()` returns undefined → no update call |
| `migrate.*merge` | existing array entries preserved | `inspect("suppressedNotifications").workspaceFolderValue = ["someOther"]`; assert update with `["someOther", "multiConfigNotification"]` |
| `migrate.*idempotent` | running twice does not duplicate | first run merges; second run: `inspect("suppressedNotifications").workspaceFolderValue = ["multiConfigNotification"]` AND `inspect("suppressMultiConfigNotification").workspaceFolderValue = undefined` → no-op |
| `migrate.*failure` | NOTIF-06 D-07 failure path | stub `update` to reject; assert `config.logger.logInfo` called and migration does NOT throw |

**Stubbing pattern for `vscode.window.showInformationMessage`** (the project's `vscode.mock.ts` L211 already returns undefined; tests must stub per-call):
```typescript
const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage').resolves('Select Project');
// or .resolves("Don't Show Again") for the DSA branch
```

**Logger stubbing for failure paths** (mirrors `multiPathPrecedence.test.ts` L46-L51 `mockLogger`):
```typescript
const logInfoSpy = sinon.spy();
sinon.stub(configModule.config, 'logger').value({ logInfo: logInfoSpy });
```

---

### `src/extension.ts` (MODIFY — extension entry, event-driven)

**Analog:** self at L141-L181 (replace) and L232-L242 (insert migration loop near other per-workspace activation loops).

**What to read first:** `src/extension.ts` L130-L190 (the multi-config block + surrounding `updateDiscoveryUX` function); L198-L300 (the `activate()` function — find a place near the top of the try block, before `updateDiscoveryUX(...)` is called at L300).

**Replacement at L141-L181** (use the inline `if (entry.alsoFoundConfigs && ...)` block — keep the output-channel logging at L145-L154 unchanged; replace L156-L181 with the wrapper call):
```typescript
// REPLACE the `if (!suppress)` block from L157 onward:
if (entry.alsoFoundConfigs && entry.alsoFoundConfigs.length > 0) {
  // KEEP L145-L154 as-is — output channel logging always runs regardless of suppression (D-09)
  config.logger.logInfo(`Multiple behave configs found:`, wkspUri);
  // ... (unchanged primary + alsoFound logging) ...

  // NEW — replaces L156-L181:
  const totalConfigs = entry.alsoFoundConfigs.length + 1;
  const configLines = [`• ${primaryRelPath} (active)`];
  for (const alsoUri of entry.alsoFoundConfigs) {
    configLines.push(`• ${vscode.workspace.asRelativePath(alsoUri, false)}`);
  }
  const message = `Behave BDD: Found ${totalConfigs} behave configs:\n${configLines.join('\n')}\nUse "Behave BDD: Select Project" to switch.`;

  // Fire-and-forget — preserves the existing untawaited .then() shape from the original block.
  // The wrapper internally checks suppression (replaces the `if (!suppress)` guard),
  // appends "Don't Show Again" (replaces L170), and writes to WorkspaceFolder scope on DSA (replaces L177-L178).
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
    // "Don't Show Again" is intercepted internally by the wrapper — never returned here.
  });
}
```
Also remove the local `suppress` variable read at L142-L143 (no longer needed — wrapper does the check).

**Migration call inside `activate()`** (place AFTER the `for (const wkspUri of getUrisOfWkspFoldersWithFeatures())` loops at L232-L242 but BEFORE `updateDiscoveryUX(...)` at L300; see RESEARCH.md Pitfall 3 — must complete before the notification fires). Per D-05 the call IS awaited, and per Pitfall 4 we must call `config.reloadSettings(wkspUri)` after migration so the cached `WorkspaceSettings.suppressedNotifications` reflects the new array:
```typescript
// Phase 15: One-shot migration of legacy suppressMultiConfigNotification → suppressedNotifications.
// MUST run before updateDiscoveryUX so notifications honor the migrated suppression state.
for (const wkspUri of getUrisOfWkspFoldersWithFeatures()) {
  await migrateLegacySuppressMultiConfig(wkspUri); // D-05, D-07 (never throws)
  config.reloadSettings(wkspUri); // refresh cached WorkspaceSettings (Pitfall 4)
}
```

**Import addition** at the top of `extension.ts`:
```typescript
import { migrateLegacySuppressMultiConfig, showSuppressibleNotification } from './notifications';
```

**Error-handling pattern** (existing at extension.ts L1038 `try/catch` around `activate`): no changes — the migration is awaited inside the existing try-block, and per D-07 the migration function never throws. The replacement notification call remains fire-and-forget (`.then()` chain), matching original L171-L180 behavior.

---

### `src/settings.ts` (MODIFY — configuration, request-response)

**Analog:** self at L155-L167 (boolean strict-undefined block — pattern to keep) and L190 (`featuresPaths` array `get<string[] | undefined>` — pattern to copy for the new array setting).

**What to read first:** `src/settings.ts` L60-L170 (`WorkspaceSettings` field declarations + constructor's settings reads).

**Field declaration** (replaces L74). Boolean → array. Mark `readonly`:
```typescript
// REMOVE L74:
public readonly suppressMultiConfigNotification: boolean;

// ADD (preserve `readonly` and `string[]` typing):
public readonly suppressedNotifications: readonly string[];
```

**Constructor read pattern** (replaces L155-L157, then assignment at L167). Use the strict-undefined-throw pattern matching the existing block — NOT the optional pattern at L190 (`featuresPaths` is optional because singular is the fallback; `suppressedNotifications` always has `default: []` in package.json so `get` returns `[]`, not undefined):
```typescript
// REMOVE L155-L157:
const suppressMultiConfigNotificationCfg: boolean | undefined = get("suppressMultiConfigNotification");
if (suppressMultiConfigNotificationCfg === undefined)
  throw "suppressMultiConfigNotification is undefined";

// REPLACE WITH (RESEARCH.md Pattern 1, lines 217-227):
const suppressedNotificationsCfg: string[] | undefined = get<string[]>("suppressedNotifications");
if (suppressedNotificationsCfg === undefined)
  throw "suppressedNotifications is undefined";

// REMOVE L167 assignment:
this.suppressMultiConfigNotification = suppressMultiConfigNotificationCfg;

// REPLACE WITH:
this.suppressedNotifications = suppressedNotificationsCfg;
```

**Why throw (matching existing convention at L121, L124, L127, etc.):** "If the value is undefined at runtime, the package.json schema is wrong" — fail loud at activation.

---

### `src/testWorkspaceConfig.ts` (MODIFY — test mock, request-response)

**Analog:** self — `featuresPaths` array mock entries at L17 (private field), L40 (constructor signature), L57 (constructor assignment), L90-L91 (`get()` switch with `?? []` default), L148-L150 (`inspect()` switch). **Do NOT** add a `getExpected` case — the boolean had one at L278-L279 (returns the value with `?? false`) but for arrays the existing `featuresPaths` pattern omits `getExpected` entirely.

**Field replacement** (L17, L27 area):
```typescript
// REMOVE L27:
private suppressMultiConfigNotification: boolean | undefined;

// ADD (mirror L17 featuresPaths pattern):
private suppressedNotifications: string[] | undefined;
```

**Constructor signature update** (L30-L51 destructured params; L52-L67 assignments):
```typescript
// REMOVE from destructure list (L33) and from type annotation (L50):
suppressMultiConfigNotification

// ADD (mirror L40 featuresPaths pattern — optional with `?` for tests not specifying it):
suppressedNotifications

// In type annotation (mirror L40):
suppressedNotifications?: string[] | undefined,

// REMOVE assignment L67:
this.suppressMultiConfigNotification = suppressMultiConfigNotification;

// ADD assignment (mirror L57):
this.suppressedNotifications = suppressedNotifications;
```

**`get()` switch update** (L110-L111 → mirror L90-L91 array pattern with `?? []` default — package.json default is `[]`):
```typescript
// REMOVE L110-L111:
case "suppressMultiConfigNotification":
  return <T><unknown>(this.suppressMultiConfigNotification === undefined ? false : this.suppressMultiConfigNotification);

// REPLACE WITH (mirror L90-L91 — VS Code returns the package.json default for declared keys):
case "suppressedNotifications":
  return <T><unknown>(this.suppressedNotifications ?? []);
```

**`inspect()` switch update** (L175-L176 → mirror L148-L150 array pattern — direct assignment, no fallback; `inspect` returns undefined for unset values):
```typescript
// REMOVE L175-L176:
case "suppressMultiConfigNotification":
  response = <T><unknown>this.suppressMultiConfigNotification;
  break;

// REPLACE WITH (mirror L148-L150):
case "suppressedNotifications":
  response = <T><unknown>this.suppressedNotifications;
  break;
```

**`getExpected()` switch update** (L278-L279 → REMOVE; do not add an array equivalent — `featuresPaths` has no `getExpected` case either, by precedent):
```typescript
// REMOVE L278-L279 entirely:
case "suppressMultiConfigNotification":
  return <T><unknown>(this.suppressMultiConfigNotification === undefined ? false : this.suppressMultiConfigNotification);
```

**Fidelity gap to acknowledge** (RESEARCH.md Pitfall 5, line 425-434): `TestWorkspaceConfig.inspect()` only populates `workspaceFolderValue` (L185). Migration tests that exercise `globalValue`/`workspaceValue` paths CANNOT use this mock — they must use the inline `makeScopedConfig` helper in `test/unit/notifications.test.ts`. **Do NOT extend `inspect()` to support per-scope returns in this phase** (out of scope; existing call sites assume the current shape).

---

### `package.json` (MODIFY — schema, request-response)

**Analog:** self at L44-L52 — `gs-behave-bdd.featuresPaths` array-of-strings with `default: []`.

**What to read first:** `package.json` L25-L130 (the `contributes.configuration.properties` block).

**Schema removal** (L120-L125):
```jsonc
// REMOVE entirely:
"gs-behave-bdd.suppressMultiConfigNotification": {
  "scope": "resource",
  "type": "boolean",
  "markdownDescription": "Suppress the notification shown when multiple behave config files are found in subdirectories. Scan results are always logged to the output channel regardless of this setting.",
  "default": false
}
```

**Schema addition** (mirror L44-L52 `featuresPaths` exactly — `scope: "resource"`, `type: "array"`, `items: { "type": "string" }`, `default: []`):
```jsonc
// ADD (NOTIF-01) — recommend placing AT L120 where the old key was, to minimize diff churn:
"gs-behave-bdd.suppressedNotifications": {
  "scope": "resource",
  "type": "array",
  "items": {
    "type": "string"
  },
  "markdownDescription": "List of notification keys that have been dismissed via 'Don't Show Again'. Edit this list to re-enable suppressed notifications. Known keys: `multiConfigNotification` (multiple behave configs found).",
  "default": []
}
```

**Verification snippet** (NOTIF-01 + NOTIF-05, RESEARCH.md lines 605, 612 — runnable as a plain `node -e` check or as a `test/unit/packageJsonSchema.test.ts`):
```javascript
const p = require('./package.json');
const props = p.contributes.configuration.properties;
const s = props['gs-behave-bdd.suppressedNotifications'];
if (s.type !== 'array' || s.items.type !== 'string' || !Array.isArray(s.default) || s.default.length !== 0) process.exit(1);
if ('gs-behave-bdd.suppressMultiConfigNotification' in props) process.exit(1);
```

---

### `test/unit/settings/multiPathPrecedence.test.ts` (MODIFY — test)

**Analog:** self — `BASE_CFG` constant at L54-L66 and `TestWorkspaceConfig` block at L253-L267.

**Edits:**

1. `BASE_CFG` at L65 — replace boolean with array:
```typescript
// REMOVE L65:
suppressMultiConfigNotification: false,
// ADD:
suppressedNotifications: [],
```

2. Optional new TestWorkspaceConfig coverage block (mirror L253-L267 — pattern: construct, call `get`, assert empty array default):
```typescript
suite('TestWorkspaceConfig suppressedNotifications default (NOTIF-08)', () => {
  test('get("suppressedNotifications") returns [] when not passed', () => {
    const tc = new TestWorkspaceConfig({
      envVarOverrides: {},
      featuresPath: 'features',
      justMyCode: true,
      multiRootRunWorkspacesInParallel: true,
      runParallel: false,
      xRay: false,
    });
    const result = tc.get<string[]>('suppressedNotifications');
    assert.ok(Array.isArray(result));
    assert.strictEqual(result.length, 0);
  });

  test('get("suppressedNotifications") returns the passed array', () => {
    const tc = new TestWorkspaceConfig({
      envVarOverrides: {},
      featuresPath: 'features',
      justMyCode: true,
      multiRootRunWorkspacesInParallel: true,
      runParallel: false,
      xRay: false,
      suppressedNotifications: ['multiConfigNotification'],
    });
    const result = tc.get<string[]>('suppressedNotifications');
    assert.deepStrictEqual(result, ['multiConfigNotification']);
  });
});
```

---

### `test/unit/settings/verboseLogging.test.ts` (MODIFY — test)

**Edit:** Single line in `makeFakeWkspSettings` at L81:
```typescript
// REMOVE L81:
suppressMultiConfigNotification: false,
// ADD (mirror — array shape):
suppressedNotifications: [],
```

No other changes required — this file tests `logSettings`, not the suppression pipeline.

---

### `test/unit/settings/projectUriDerivation.test.ts` (MODIFY — test)

**Edit:** Single line in `BASE_CFG` at L62:
```typescript
// REMOVE L62:
suppressMultiConfigNotification: false,
// ADD:
suppressedNotifications: [],
```

---

### `test/unit/settings/logSettingsPlural.test.ts` (MODIFY — test)

**Edit:** Single line in `makeFakeWkspSettings` at L48:
```typescript
// REMOVE L48:
suppressMultiConfigNotification: false,
// ADD:
suppressedNotifications: [],
```

---

## Shared Patterns

### Plain-Function Module Style (not class/namespace)
**Source:** `src/common.ts` (no top-level class — exports `getActualWorkspaceSetting`, `hasExplicitSetting`, `hasExplicitNonEmptyArraySetting` as plain functions at L131-L172).
**Apply to:** `src/notifications.ts` (D-01).
```typescript
// Module-level constant + exported functions — no class wrapper
const DONT_SHOW_AGAIN = "Don't Show Again";
export function isSuppressed(...) { /* ... */ }
export async function suppressNotification(...) { /* ... */ }
export async function showSuppressibleNotification(...) { /* ... */ }
export async function migrateLegacySuppressMultiConfig(...) { /* ... */ }
```

### Scope-Detection Ladder
**Source:** `src/settings.ts` L20-L25 (`getWithLegacyFallback` walks `globalValue`, `workspaceValue`, `workspaceFolderValue`); `src/common.ts` L151-L153 (`hasExplicitSetting`).
**Apply to:** `src/notifications.ts::migrateLegacySuppressMultiConfig` (D-08).
```typescript
const insp = newConfig.inspect<T>(key);
const isExplicit = insp !== undefined && (
  insp.globalValue !== undefined ||
  insp.workspaceValue !== undefined ||
  insp.workspaceFolderValue !== undefined
);
```
**Direction note:** Migration uses MOST-SPECIFIC-WINS (`workspaceFolderValue` first, then `workspaceValue`, then `globalValue`) per D-08 ("writes the array value at the same scope level where the old boolean was found").

### WorkspaceFolder-Scope Write
**Source:** `src/extension.ts` L177-L178 (existing DSA write).
**Apply to:** `src/notifications.ts::suppressNotification` (NOTIF-03).
```typescript
const wkspCfg = vscode.workspace.getConfiguration("gs-behave-bdd", wkspUri);
wkspCfg.update("<key>", <value>, vscode.ConfigurationTarget.WorkspaceFolder);
```

### Strict-Undefined Settings Loading
**Source:** `src/settings.ts` L120-L154 (every required setting throws if `get()` returns undefined).
**Apply to:** `src/settings.ts::WorkspaceSettings` constructor for new `suppressedNotifications` field.
```typescript
const xCfg: T | undefined = get<T>("xKey");
if (xCfg === undefined) throw "xKey is undefined";
this.xField = xCfg;
```

### Fire-and-Forget Notification + `.then()` Action Switch
**Source:** `src/extension.ts` L166-L180 (existing block).
**Apply to:** the call site in `extension.ts` after wrapper replacement — preserves zero-await behavior, matches existing UX where `updateDiscoveryUX` does not block on user dismissal.

### Logger Failure Path (warn-and-continue)
**Source:** `src/extension.ts` L130 (`config.logger.logInfo` calls); `src/settings.ts` L196-L201 (informational log without throw).
**Apply to:** D-07 migration failure path AND `suppressNotification` failure path.
```typescript
config.logger.logInfo(`Could not <action>: ${e}`, wkspUri);
```

### Inline `makeConfig` Test Helper (per-scope)
**Source:** `test/unit/settings/legacyFallback.test.ts` L10-L23 (with `explicitKeys` for marking workspaceValue) and `test/unit/settings/multiPathPrecedence.test.ts` L22-L35 (workspaceValue-only variant).
**Apply to:** `test/unit/notifications.test.ts` — extended with all three scope levels because migration tests must vary `globalValue`/`workspaceValue`/`workspaceFolderValue` independently. **Do NOT use `TestWorkspaceConfig` for migration tests** (Pitfall 5).

### `config.logger` / `config.workspaceSettings` Stubbing
**Source:** `test/unit/settings/multiPathPrecedence.test.ts` L46-L51 (mock logger object) and L85 (`sinon.stub(configModule.config, '<prop>').value(...)`).
**Apply to:** `test/unit/notifications.test.ts` — stub `config.workspaceSettings` for `isSuppressed` cache reads; stub `config.logger` to capture warn-on-failure messages.

## No Analog Found

None — every file in this phase has a direct in-codebase analog. The phase is pure glue over established primitives (RESEARCH.md line 350: "every primitive needed for this phase already exists in the VS Code API at the HIGH-confidence level. The phase is pure glue.").

## Metadata

**Analog search scope:** `src/`, `test/unit/`, `package.json`, `.planning/phases/15-notification-suppression/`
**Files scanned:** ~30 (all referenced canonical sources from RESEARCH.md + cross-checked against current head)
**Pattern extraction date:** 2026-04-27
