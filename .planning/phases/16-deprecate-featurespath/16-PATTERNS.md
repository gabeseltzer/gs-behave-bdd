# Phase 16: Deprecate featuresPath - Pattern Map

**Mapped:** 2026-04-28
**Files analyzed:** 11 modified (no new files)
**Analogs found:** 11 / 11 — every modification has an in-tree analog (Phase 15 work or the file-being-modified itself)

> Phase 16 creates **zero new files**. The D-MOD primitive is added to an existing file (`src/notifications.ts`), the new `migrateLegacyFeaturesPath` wrapper sits next to its sibling helper, and every test extension goes into an existing test file. The closest analog for almost every change is **the file being modified** — i.e. Phase 15's just-shipped code is the structural template for Phase 16.

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `src/notifications.ts` | utility (cross-cutting) | event-driven (one-shot per activation) | `src/notifications.ts:90-130` (self — Phase 15 helper) | **exact** — extracting common shape |
| `src/settings.ts` | config (settings cache constructor) | request-response (synchronous read) | `src/settings.ts:188-229` (self — current ladder, post-Phase 7) | **exact** — collapsing 4 rungs to 3 |
| `src/common.ts` | utility (discovery hot path) | request-response | `src/common.ts:195-285` (self — current `hasFeaturesFolder`) | **exact** — branch deletion + gate rewrite |
| `src/testWorkspaceConfig.ts` | config (mock) | request-response | `src/testWorkspaceConfig.ts` (self — `projectPath` is the parallel surviving setting) | **role-match** — `projectPath`'s 6 surfaces (field/ctor/get/inspect/getExpected) are the exact shape that survives after `featuresPath`'s 6 surfaces are deleted |
| `src/extension.ts` (activation loop) | extension lifecycle | event-driven | `src/extension.ts:295-306` (self — Phase 15 loop) + `src/extension.ts:121-178` (multi-config notification with .then-action) | **exact** — 2-line addition to existing loop + post-loop notification mirrors Phase 15 multi-config |
| `package.json` schema | config | declarative | `package.json:38-43` (self — block being removed) + `package.json:44-52` (sibling plural that survives) | **exact** — JSON delete |
| `test/unit/notifications.test.ts` | test (unit) | request-response (mocked) | `test/unit/notifications.test.ts:278-388` (self — Phase 15 migration suite, regression bar) + `:257-276` (`makePerKeyScopedConfig` helper, reusable) | **exact** — same suite shape, same helper |
| `test/unit/settings/multiPathPrecedence.test.ts` | test (unit) | request-response (mocked) | `test/unit/settings/multiPathPrecedence.test.ts:117-124` (Rung 2 suite — being deleted) + `:201-249` (both-set log suite — being deleted) | **exact** — surgical deletions to known line ranges |
| `test/unit/settings/discoveryPriority.test.ts` | test (unit) | request-response (mocked) | `test/unit/settings/discoveryPriority.test.ts:65-67, 75-78, 108-111` (parallel `projectPath` tests that survive) | **role-match** — `projectPath` test shape is what `featuresPath` tests being deleted should leave behind |
| `test/integration/suite-shared/shared.workspace.tests.ts` | test (integration fixture) | request-response | `shared.workspace.tests.ts:43, 60, 76` (3 of 4 sites, all use `wkspRelativeFeaturesPath`) | **exact** — 4 mechanical replacements |
| `test/integration/debug suite/extension.test.ts` | test (integration) | request-response | `extension.test.ts:33-37` (self — single call site) | **exact** — drop one line |

---

## Pattern Assignments

### `src/notifications.ts` (utility, event-driven) — D-MOD primitive + new wrapper + Phase 15 refactor

**Analog:** `src/notifications.ts:90-130` (self — `migrateLegacySuppressMultiConfig`).

**The full Phase 15 helper is the structural template.** Phase 16 extracts the common skeleton into `migrateScopedSetting<TSrc, TDest>(opts)` and reroutes both helpers through it.

**Imports pattern** (lines 1-2 — unchanged):
```typescript
import * as vscode from 'vscode';
import { config } from './configuration';
```
Phase 16 adds **no new imports** (no `path`, no new types).

**Existing constant pattern** (line 14):
```typescript
const DONT_SHOW_AGAIN = "Don't Show Again";
```
Phase 16 adds module-level constants the same way:
```typescript
// Phase 16
const FEATURES_PATH_NAMESPACES = ["gs-behave-bdd", "behave-vsc"] as const;
```

**Phase 15 helper line-by-line → primitive mapping** (this is the load-bearing breakdown for D-MOD; planner copies these mappings directly into the extraction):

| `src/notifications.ts:90-130` line(s) | Fragment | Belongs in |
|---------------------------------------|----------|-----------|
| L91 `const cfg = vscode.workspace.getConfiguration("gs-behave-bdd", wkspUri);` | Source-namespace config lookup | **Primitive** — parameterize namespace |
| L92 `const insp = cfg.inspect<boolean>("suppressMultiConfigNotification");` | Source key inspect | **Primitive** — parameterize sourceKey + TSrc |
| L93 `if (!insp) return;` | Defensive null guard | **Primitive** |
| L96-L107 scope-detection ladder (`if insp.workspaceFolderValue ... else if insp.workspaceValue ... else if insp.globalValue ...`) | **Most-specific-wins scope detection** | **Primitive** — yields `(target, legacyValue)` tuple |
| L108 `if (target === undefined \|\| legacyValue !== true) return;` | Wrapper-specific filter (boolean must be true) | **Wrapper transform** — Phase 15 transform returns "skip both" when `legacyValue !== true` |
| L112-L116 `cfg.inspect<string[]>("suppressedNotifications")` + same-scope read of dest | **Same-scope dest read (Pitfall 2)** | **Primitive** — uses dest namespace + dest key + `target` enum from step above |
| L117-L118 `merged = [...existingArr]; if (!merged.includes("multiConfigNotification")) merged.push(...)` | Wrapper-specific merge logic (boolean→array, single hardcoded key) | **Wrapper transform** — Phase 15 transform: `(legacyVal, existingArr) => legacyVal !== true ? skipBoth : merge_with("multiConfigNotification")` |
| L121 `await cfg.update("suppressedNotifications", merged, target);` | Dest write at same scope | **Primitive** |
| L122 `await cfg.update("suppressMultiConfigNotification", undefined, target);` | Source removal at same scope | **Primitive** — controlled by transform's `removeSource` flag |
| L123-L129 try/catch + `config.logger.logInfo(...)` | Defense-in-depth | **Primitive** |

**Recommended primitive signature** (from RESEARCH.md, locked by D-MOD + Open Question #2 resolution):
```typescript
type TransformResult<T> =
  | { kind: 'write'; value: T }
  | { kind: 'skipDest'; removeSource: boolean };

async function migrateScopedSetting<TSrc, TDest>(opts: {
  namespace: string;          // e.g. "gs-behave-bdd" or "behave-vsc"
  sourceKey: string;
  destNamespace?: string;     // defaults to namespace
  destKey: string;
  wkspUri: vscode.Uri;
  transform: (sourceVal: TSrc, destValAtSameScope: TDest | undefined) => TransformResult<TDest>;
}): Promise<boolean>;
```

**Existing fire-and-forget log pattern to preserve** (lines 123-128):
```typescript
} catch (e) {
  // D-07: warn-and-continue, never throw.
  config.logger.logInfo(
    `Could not migrate suppressMultiConfigNotification to suppressedNotifications: ${e}`,
    wkspUri,
  );
}
```
The primitive must use this exact pattern (`config.logger.logInfo` — NOT `showError` or `showWarn`, NOT `console.error`). Per CLAUDE.md "Logging" + AI_INSTRUCTIONS "Exception Handling": helpers `throw` OR log-and-continue; this helper is in the log-and-continue camp because activation must not block.

**Phase 15 wrapper after refactor** (regression bar — public signature unchanged):
```typescript
export async function migrateLegacySuppressMultiConfig(wkspUri: vscode.Uri): Promise<void> {
  await migrateScopedSetting<boolean, string[]>({
    namespace: "gs-behave-bdd",
    sourceKey: "suppressMultiConfigNotification",
    destKey: "suppressedNotifications",
    wkspUri,
    transform: (legacyValue, existingArr) => {
      if (legacyValue !== true) {
        // Pre-refactor behavior: return BEFORE any update calls (callCount=0 in test L335).
        // Skip dest AND skip source removal.
        return { kind: 'skipDest', removeSource: false };
      }
      const current = Array.isArray(existingArr) ? [...existingArr] : [];
      if (current.includes("multiConfigNotification")) return { kind: 'write', value: current };
      return { kind: 'write', value: [...current, "multiConfigNotification"] };
    },
  });
  // Public signature is Promise<void> — discard the boolean.
}
```

**Phase 16 new wrapper** (locked shape):
```typescript
function normalizePathEntry(s: string): string {
  // Same rule as src/settings.ts:204 / L214 (D-07)
  return s.replace(/^\\|^\//, "").replace(/\\$|\/$/, "").trim();
}

export async function migrateLegacyFeaturesPath(wkspUri: vscode.Uri): Promise<boolean> {
  let anyMigrated = false;
  for (const sourceNs of FEATURES_PATH_NAMESPACES) {
    const migrated = await migrateScopedSetting<string, string[]>({
      namespace: sourceNs,
      sourceKey: "featuresPath",
      destNamespace: "gs-behave-bdd",   // canonical destination, even when source is behave-vsc (D-02)
      destKey: "featuresPaths",
      wkspUri,
      transform: (legacyValue, existingArr) => {
        // D-08: empty/whitespace → remove source but skip dest write
        if (legacyValue === undefined || legacyValue.trim() === "") {
          return { kind: 'skipDest', removeSource: true };
        }
        const normalized = normalizePathEntry(legacyValue);
        if (normalized === "") return { kind: 'skipDest', removeSource: true };
        const current = Array.isArray(existingArr) ? [...existingArr] : [];
        // D-07: dedup post-normalization
        if (current.some(p => normalizePathEntry(p) === normalized)) {
          return { kind: 'write', value: current };  // already present, but DO write to commit migration
        }
        return { kind: 'write', value: [...current, normalized] };
      },
    });
    anyMigrated = anyMigrated || migrated;
  }
  return anyMigrated;
}
```

**Subtlety the planner must encode** (RESEARCH.md L500-L515): two transform return shapes are required because Phase 15's `legacyValue=false` case must keep `updateSpy.callCount === 0` (test at L335) — meaning **no source removal** — while Phase 16's blank-string case requires source removal. The discriminated union `{ kind: 'skipDest'; removeSource: boolean }` distinguishes them.

---

### `src/settings.ts` (config, request-response) — Ladder collapse

**Analog:** `src/settings.ts:188-229` (self — current 4-rung ladder).

**Strict-undefined throw pattern to PRESERVE for surviving settings** (L120-L131):
```typescript
const projectPathCfg: string | undefined = get("projectPath");
if (projectPathCfg === undefined)
  throw "projectPath is undefined";
```
The corresponding `featuresPath` block at L132-L134 is **deleted in Phase 16** (D-15). The `featuresPaths` plural read at L190 stays as-is (it tolerates `undefined` — see comment "D-12: no throw on undefined"):
```typescript
const featuresPathsCfg: string[] | undefined = get<string[] | undefined>("featuresPaths");
```

**Existing 4-rung ladder** (L188-L223 — being collapsed):
```typescript
let projectRelativeFeaturesPaths: string[];
if (featuresPathsCfg && Array.isArray(featuresPathsCfg) && featuresPathsCfg.length > 0) {
  // Rung 1: plural non-empty
  if (hasExplicitSetting(wkspConfig, "featuresPath", legacyConfig)) {     // L196 — DELETE entire info-log branch
    logger.logInfo(
      "Both featuresPath and featuresPaths are set — using featuresPaths (plural). " +
      "The singular featuresPath value is ignored.",
      wkspUri
    );
  }
  projectRelativeFeaturesPaths = featuresPathsCfg
    .map(p => p.replace(/^\\|^\//, "").replace(/\\$|\/$/, "").trim())
    .filter(p => p.length > 0);
  if (projectRelativeFeaturesPaths.length === 0) {
    // Plural was all-empty → fall to singular (L208 — REWRITE: fall to convention)
    projectRelativeFeaturesPaths = [
      featuresPathCfg.replace(/^\\|^\//, "").replace(/\\$|\/$/, "").trim() || "features"
    ];
  }
} else if (hasExplicitSetting(wkspConfig, "featuresPath", legacyConfig) && featuresPathCfg && featuresPathCfg.trim() !== "") {
  // Rung 2: singular explicit (L212-L214 — DELETE this entire `else if` branch)
  projectRelativeFeaturesPaths = [featuresPathCfg.replace(/^\\|^\//, "").replace(/\\$|\/$/, "").trim()];
} else if (entry?.source === 'config-file' && entry.featuresUris.length > 0) {
  // Rung 3: config-file (becomes Rung 2 after collapse)
  projectRelativeFeaturesPaths = entry.featuresUris.map(u =>
    path.relative(this.projectUri.fsPath, u.fsPath).replace(/\\/g, '/')
  );
} else {
  // Rung 4: convention (becomes Rung 3 after collapse)
  projectRelativeFeaturesPaths = ["features"];
}
```

**Collapsed ladder shape (target)** — copy directly from `src/settings.ts:215-222` (Rungs 3 + 4 survive verbatim, Rung 1 keeps its `.map().filter()` body, all-empty fallback inside Rung 1 changes to `["features"]`):
```typescript
let projectRelativeFeaturesPaths: string[];
if (featuresPathsCfg && Array.isArray(featuresPathsCfg) && featuresPathsCfg.length > 0) {
  // Rung 1: plural non-empty (info-log branch DELETED — no singular to compare against)
  projectRelativeFeaturesPaths = featuresPathsCfg
    .map(p => p.replace(/^\\|^\//, "").replace(/\\$|\/$/, "").trim())
    .filter(p => p.length > 0);
  if (projectRelativeFeaturesPaths.length === 0) {
    projectRelativeFeaturesPaths = ["features"];   // was: fall to singular
  }
} else if (entry?.source === 'config-file' && entry.featuresUris.length > 0) {
  // Rung 2 (was Rung 3): config-file
  projectRelativeFeaturesPaths = entry.featuresUris.map(u =>
    path.relative(this.projectUri.fsPath, u.fsPath).replace(/\\/g, '/')
  );
} else {
  // Rung 3 (was Rung 4): convention
  projectRelativeFeaturesPaths = ["features"];
}
```

**Fatal-error string update** (L234):
```typescript
// BEFORE:
this._fatalErrors.push(`"." is not a valid "gs-behave-bdd.featuresPath" value. The features folder must be a subfolder.`);
// AFTER (D-15):
this._fatalErrors.push(`"." is not a valid "gs-behave-bdd.featuresPaths" entry. The features folder must be a subfolder.`);
```

**Normalization rule (D-07 source of truth)** at L204 / L214:
```typescript
.replace(/^\\|^\//, "").replace(/\\$|\/$/, "").trim()
```
This is **the exact rule** Phase 16's `normalizePathEntry` helper in `src/notifications.ts` mirrors. Keep them in sync.

---

### `src/common.ts` (utility, request-response) — Discovery branch simplification

**Analog:** `src/common.ts:199-285` (self — current `hasFeaturesFolder`).

**Branch A gate to rewrite** (L207-L209):
```typescript
// BEFORE:
if (hasExplicitSetting(wkspConfig, "projectPath", legacyWkspConfig) ||
    hasExplicitSetting(wkspConfig, "featuresPath", legacyWkspConfig) ||
    hasExplicitNonEmptyArraySetting(wkspConfig, "featuresPaths")) {
// AFTER (D-16):
if (hasExplicitSetting(wkspConfig, "projectPath", legacyWkspConfig) ||
    hasExplicitNonEmptyArraySetting(wkspConfig, "featuresPaths")) {
```

**Singular read to delete** (L212):
```typescript
const featuresPath = getActualWorkspaceSetting<string>(wkspConfig, "featuresPath", legacyWkspConfig);
```
This entire variable goes away. All downstream uses (L256, L261, L266, L277) must also be excised.

**Survives unchanged** — the plural-array handling at L236-L248 (already plural-only):
```typescript
const featuresPathsArr = wkspConfig.get<string[]>("featuresPaths");
if (Array.isArray(featuresPathsArr) && featuresPathsArr.length > 0) {
  const validUris = featuresPathsArr
    .map(p => p.replace(/^\\|^\//, "").replace(/\\$|\/$/, "").trim())
    .filter(p => p.length > 0)
    .map(p => vscode.Uri.joinPath(projectUri, p))
    .filter(u => fs.existsSync(u.fsPath));
  if (validUris.length > 0) {
    discoveryCache.set(uriId(folder.uri), { source: "settings", featuresUris: validUris });
    return true;
  }
}
```

**Block to delete entirely** (L256-L283 — the `featuresPath`-singular tail):
```typescript
if (!featuresPath && !hasDefaultFeaturesFolder) {
  return false;
}
if (hasDefaultFeaturesFolder && !featuresPath) {
  discoveryCache.set(uriId(folder.uri), { source: "settings", featuresUris: [featuresUri] });
  return true;
}
featuresUri = vscode.Uri.joinPath(projectUri, featuresPath as string);
if (fs.existsSync(featuresUri.fsPath) && vscode.workspace.getWorkspaceFolder(featuresUri) === folder) {
  discoveryCache.set(uriId(folder.uri), { source: "settings", featuresUris: [featuresUri] });
  return true;
}
// L274-L281 warning notification with `Configured featuresPath: "${featuresPath}"` — DELETE
vscode.window.showWarningMessage(
  `Behave BDD: Features path not found.\n\n` + ...
);
return false;
```

**Replacement (RESEARCH.md L681-L686)** — concise default-features-folder fall-through:
```typescript
if (!hasDefaultFeaturesFolder) {
  return false; // probably a workspace with no behave requirements
}
discoveryCache.set(uriId(folder.uri), { source: "settings", featuresUris: [featuresUri] });
return true;
```

**Why this is safe (D-16):** The plural handling at L236-L248 already covers any explicit user features path. After Phase 16's migration runs at activation, every legacy `featuresPath: "x"` becomes `featuresPaths: ["x"]` — the discovery branch reads from the plural and the singular is gone from settings.json before this code runs (Pitfall 4 — `reloadSettings` ensures the cache is current).

---

### `src/testWorkspaceConfig.ts` (config mock, request-response) — Drop singular surfaces

**Analog:** the **`projectPath` surface in the same file** is the parallel surviving setting that shows the exact shape `featuresPath` had — just delete `featuresPath` everywhere `projectPath` exists side-by-side.

**Field declaration** (L15-L16):
```typescript
private projectPath: string | undefined;
private featuresPath: string | undefined;        // DELETE this line
private featuresPaths: string[] | undefined;     // KEEP
```

**Constructor destructure** (L31, L39, L56) — drop `featuresPath` from the destructured argument list, the type annotation, and the assignment. Leave `featuresPaths` (plural) unchanged.

**`get()` switch case** (L88-L89) — DELETE:
```typescript
case "featuresPath":
  return <T><unknown>(this.featuresPath === undefined ? "features" : this.featuresPath);
```
The `featuresPaths` case at L90-L91 stays.

**`inspect()` switch case** (L145-L146) — DELETE:
```typescript
case "featuresPath":
  response = <T><unknown>this.featuresPath;
  break;
```

**`getExpectedFeaturesPath()` helper** (L204-L212) — DELETE entirely:
```typescript
const getExpectedFeaturesPath = (): string => {
  switch (this.featuresPath) {
    case "":
    case undefined:
      return "features";
    default:
      return this.featuresPath.trim().replace(/^\\|^\//, "").replace(/\\$|\/$/, "");
  }
}
```

**`getExpectedWorkspaceRelativeFeaturesPath()`** (L215-L219) — must be rewritten OR deleted depending on test consumers. Per RESEARCH.md, it can be rewritten to read `featuresPaths[0]`:
```typescript
// REWRITE shape (if anything still calls it):
const getExpectedWorkspaceRelativeFeaturesPath = (): string => {
  const projectPath = getExpectedProjectPath();
  const features = (this.featuresPaths && this.featuresPaths[0]) || "features";
  const normalized = features.trim().replace(/^\\|^\//, "").replace(/\\$|\/$/, "");
  return projectPath ? `${projectPath}/${normalized}` : normalized;
};
```

**`getExpected()` switch cases** (L252, L254-L255):
```typescript
case "featuresPath":
  return <T><unknown>getExpectedFeaturesPath();         // DELETE
case "workspaceRelativeFeaturesPath":
  return <T><unknown>getExpectedWorkspaceRelativeFeaturesPath();   // KEEP if rewritten above; else delete
```

**`featuresUri` and `stepsSearchUri` cases at L258-L261** — these depend on `getExpectedFeaturesPath()`. If kept, retarget to read `featuresPaths[0]`; if no integration test consumer depends on them post-Phase 16, delete.

---

### `src/extension.ts` activation loop (extension lifecycle, event-driven) — 2nd migration call + post-loop notification

**Analog 1 (existing migration loop):** `src/extension.ts:295-306` — the Phase 15 loop.

**Analog 2 (existing fire-and-forget notification with `.then(action)` button handling):** `src/extension.ts:121-178` — the multi-config notification block. Same shape Phase 16 uses for its post-loop notification.

**Existing loop to extend** (L295-L306):
```typescript
// Phase 15 / NOTIF-06: migrate legacy boolean suppression key → suppressedNotifications array.
// Must complete BEFORE updateDiscoveryUX so notifications honor the migrated suppression state (Pitfall 3).
for (const wkspUri of getUrisOfWkspFoldersWithFeatures()) {
  try {
    await migrateLegacySuppressMultiConfig(wkspUri); // D-05; D-07 ensures it never throws
    config.reloadSettings(wkspUri); // Pitfall 4: refresh WorkspaceSettings cache
  } catch (e) {
    // Defense-in-depth — D-07 prevents throws from the migration helper, but wrap to ensure
    // activation continues if reloadSettings ever throws.
    config.logger.logInfo(`Phase 15 migration error: ${e}`, wkspUri);
  }
}
```

**Modified loop (D-18 ordering)** — copy from RESEARCH.md L563-L580 verbatim, with the publisher correction noted below:
```typescript
// Phase 16 / DEP-02..DEP-04: migrate legacy featuresPath → featuresPaths.
// Phase 15 / NOTIF-06: migrate legacy boolean suppression key.
// Order per D-18: data shape FIRST, UX-suppression cleanup SECOND, single reloadSettings, then notify.
const pendingFeaturesPathNotifs: vscode.Uri[] = [];
for (const wkspUri of getUrisOfWkspFoldersWithFeatures()) {
  let migrated = false;
  try {
    migrated = await migrateLegacyFeaturesPath(wkspUri);   // D-18 step 1: data shape
    await migrateLegacySuppressMultiConfig(wkspUri);        // D-18 step 2: UX
    config.reloadSettings(wkspUri);                         // D-18 step 3 (sync — Pitfall 8)
  } catch (e) {
    config.logger.logInfo(`Phase 15/16 migration error: ${e}`, wkspUri);
  }
  if (migrated) pendingFeaturesPathNotifs.push(wkspUri);
}

// Phase 16 / DEP-04: fire notification AFTER reloadSettings so suppressedNotifications cache is current.
for (const wkspUri of pendingFeaturesPathNotifs) {
  showSuppressibleNotification(
    "featuresPathMigration",
    "Migrated featuresPath → featuresPaths. The deprecated `featuresPath` setting has been moved to the new `featuresPaths` array.",
    ["Open Settings"],
    wkspUri,
  ).then(action => {
    if (action === "Open Settings") {
      vscode.commands.executeCommand("workbench.action.openSettings", "@ext:gabeseltzer.gs-behave-bdd");
    }
  });
}
```

**Publisher correction (load-bearing — RESEARCH.md A4/A6 verification):** The publisher in `package.json:280` is **`gabeseltzer`**, NOT `formlabs`. The "Open Settings" command must use `@ext:gabeseltzer.gs-behave-bdd`. RESEARCH.md cites `formlabs` as a placeholder pending Wave 0 verification — the actual value is now confirmed.

**Existing fire-and-forget notification with `.then(action)` shape to mirror** (L165-L177):
```typescript
showSuppressibleNotification(
  "multiConfigNotification",
  message,
  ['Select Project', 'Show Details'],
  wkspUri,
).then(action => {
  if (action === 'Select Project') {
    vscode.commands.executeCommand('gs-behave-bdd.selectProject');
  } else if (action === 'Show Details') {
    vscode.commands.executeCommand('gs-behave-bdd.openOutput');
  }
  // "Don't Show Again" is intercepted internally by the wrapper — never returned here.
});
```
The Phase 16 post-loop block follows this exact shape (no try/catch wrapper, no await — fire-and-forget; the wrapper handles suppression and DSA internally).

**Comment update at L936** (`featuresPath` → `featuresPaths`):
```typescript
// BEFORE:
// changing featuresPath in settings.json/*.vscode-workspace to a valid path...
// AFTER:
// changing featuresPaths in settings.json/*.vscode-workspace to a valid path...
```

**Comment update at L1002** (`featuresPath` → `featuresPaths`):
```typescript
// BEFORE:
// configuration has now changed, e.g. featuresPath, so we need to reparse files
// AFTER:
// configuration has now changed, e.g. featuresPaths, so we need to reparse files
```

**Import update at L42** — add `migrateLegacyFeaturesPath`:
```typescript
import { migrateLegacySuppressMultiConfig, migrateLegacyFeaturesPath, showSuppressibleNotification } from './notifications';
```

---

### `package.json` schema removal

**Analog:** `package.json:38-43` (self — block being deleted) + `package.json:44-52` (sibling that survives).

**Block to delete** (L38-L43):
```json
"gs-behave-bdd.featuresPath": {
  "scope": "resource",
  "type": "string",
  "markdownDescription": "*project-relative* path to the features subfolder. **Override only:** Leave blank to use the path from your behave config file, or `features/` if no config file is found. Set this only if auto-discovery resolves the wrong features directory. This path is relative to `projectPath` (or workspace root if `projectPath` is not set). Example: `my_behave_tests`. For multiple feature paths, use `featuresPaths` (plural) instead.",
  "default": "features"
},
```

**Block that stays unchanged** (L44-L52) — but its `markdownDescription` references `featuresPath` ("When both `featuresPath` and `featuresPaths` are set..."). After DEP-01, that sentence is misleading and should be trimmed. **Suggested rewrite** of the plural's `markdownDescription`:
```json
"markdownDescription": "*project-relative* paths to features subfolders. **Override only:** Leave blank to use the paths from your behave config file, or `features/` if no config file is found. Example: `[\"features\", \"features-alt\"]`."
```

**Trailing comma cleanup**: deleting the `featuresPath` block leaves the preceding entry's trailing comma intact (it was followed by `featuresPaths`); JSON remains valid.

---

### `test/unit/notifications.test.ts` (test, request-response mocked)

**Analog:** the same file's existing 8 sub-cases (L289-L387) — these are the **regression bar**.

**Reusable helper from existing file** (L257-L276):
```typescript
function makePerKeyScopedConfig(perKey: {
  [key: string]: { globalValue?: unknown; workspaceValue?: unknown; workspaceFolderValue?: unknown };
}, updateSpy?: sinon.SinonSpy): any {
  return {
    get: (_key: string) => undefined,
    has: () => false,
    inspect: (key: string) => {
      const s = perKey[key] ?? {};
      return {
        key,
        defaultValue: undefined,
        globalValue: s.globalValue,
        workspaceValue: s.workspaceValue,
        workspaceFolderValue: s.workspaceFolderValue,
      };
    },
    update: updateSpy ?? (() => Promise.resolve()),
  };
}
```
Phase 16 reuses this **as-is** — it already supports per-namespace lookups by key. For the two-namespace case, two separate `getConfiguration` calls each return a `makePerKeyScopedConfig` instance keyed to the namespace's keys. The existing import path is `import { makePerKeyScopedConfig } from ...` — but it's only `export {makeScopedConfig}` at L250. **The planner needs to also export `makePerKeyScopedConfig`** OR redeclare it in the new test file. Recommend: add `export { makePerKeyScopedConfig };` near L250.

**Existing migrate test pattern** (L289-L306) — copy the shape verbatim for each new Phase 16 sub-case:
```typescript
test('migrate at WorkspaceFolder scope: writes array + removes legacy key', async () => {
  sinon.stub(vscode.workspace, 'getConfiguration').returns(makePerKeyScopedConfig({
    suppressMultiConfigNotification: { workspaceFolderValue: true },
    suppressedNotifications: {},
  }, updateSpy));
  await migrateLegacySuppressMultiConfig(MOCK_URI);
  assert.strictEqual(updateSpy.callCount, 2, 'one update for new array, one to delete legacy key');
  assert.deepStrictEqual(updateSpy.firstCall.args, [
    'suppressedNotifications',
    ['multiConfigNotification'],
    vscode.ConfigurationTarget.WorkspaceFolder,
  ]);
  assert.deepStrictEqual(updateSpy.secondCall.args, [
    'suppressMultiConfigNotification',
    undefined,
    vscode.ConfigurationTarget.WorkspaceFolder,
  ]);
});
```

**Phase 16 test sub-case template** (e.g., for `gs-behave-bdd.featuresPath` at WorkspaceFolder):
```typescript
test('migrateLegacyFeaturesPath at WorkspaceFolder (gs-behave-bdd): writes array + removes legacy key', async () => {
  // Two getConfiguration calls — one per namespace iteration. Both return per-key configs.
  const getConfigStub = sinon.stub(vscode.workspace, 'getConfiguration');
  getConfigStub.withArgs('gs-behave-bdd', sinon.match.any).returns(makePerKeyScopedConfig({
    featuresPath: { workspaceFolderValue: 'my-tests' },
    featuresPaths: {},
  }, updateSpy));
  getConfigStub.withArgs('behave-vsc', sinon.match.any).returns(makePerKeyScopedConfig({
    featuresPath: {},
    featuresPaths: {},
  }, updateSpy));

  const result = await migrateLegacyFeaturesPath(MOCK_URI);

  assert.strictEqual(result, true, 'D-01: returns true when at least one scope migrated');
  assert.strictEqual(updateSpy.callCount, 2, 'one update for new array, one to delete legacy');
  assert.deepStrictEqual(updateSpy.firstCall.args, [
    'featuresPaths',
    ['my-tests'],
    vscode.ConfigurationTarget.WorkspaceFolder,
  ]);
  assert.deepStrictEqual(updateSpy.secondCall.args, [
    'featuresPath',
    undefined,
    vscode.ConfigurationTarget.WorkspaceFolder,
  ]);
});
```

**Existing failure-handling pattern** (L368-L387) — copy for the Phase 16 update-rejection test:
```typescript
test('migrate failure: rejection logs warn, does NOT throw', async () => {
  let callCount = 0;
  const rejectingUpdate = sinon.spy(() => {
    callCount += 1;
    if (callCount === 1) return Promise.reject(new Error('read-only workspace'));
    return Promise.resolve();
  });
  sinon.stub(vscode.workspace, 'getConfiguration').returns(makePerKeyScopedConfig({...}, rejectingUpdate));
  await assert.doesNotReject(() => migrateLegacySuppressMultiConfig(MOCK_URI));
  assert.ok(logInfoSpy.called, 'D-07: must log warn on failure');
});
```

**Existing structural-ordering test pattern** (L390-L428) — Phase 16 extends with two new tests:
1. featuresPath migration call **precedes** suppressMultiConfig call in the source.
2. `reloadSettings` is called **once** after both migrations (string-search `config.reloadSettings(wkspUri)` should appear at most once inside the migration loop body).

```typescript
test('activate.*migration order: migrateLegacyFeaturesPath precedes migrateLegacySuppressMultiConfig', () => {
  const src = readExtensionSrc();
  const featurePathIdx = src.indexOf('migrateLegacyFeaturesPath(wkspUri)');
  const suppressIdx = src.indexOf('migrateLegacySuppressMultiConfig(wkspUri)');
  assert.notStrictEqual(featurePathIdx, -1);
  assert.notStrictEqual(suppressIdx, -1);
  assert.ok(featurePathIdx < suppressIdx, 'D-18: featuresPath migration must run first (data shape before UX)');
});
```

**Setup pattern (existing, copy verbatim)** (L282-L286):
```typescript
setup(() => {
  updateSpy = sinon.spy(() => Promise.resolve());
  logInfoSpy = sinon.spy();
  sinon.stub(configModule.config, 'logger').value({ logInfo: logInfoSpy });
});
teardown(() => sinon.restore());
```

---

### `test/unit/settings/multiPathPrecedence.test.ts` — drop legacy fixtures

**Analog:** the file itself.

**`BASE_CFG` reference at L69** (in `buildSettings`):
```typescript
const cfg = makeConfig({ ...BASE_CFG, featuresPath: 'features', ...overrides });
```
Drop the `featuresPath: 'features'` literal. After Phase 16, `BASE_CFG` no longer needs the singular default — `WorkspaceSettings` constructor no longer reads it.

**Suite to delete entirely** — `Rung 2: singular set` (L117-L124):
```typescript
suite('Rung 2: singular set (featuresPaths absent)', () => {
  test('singular featuresPath used when featuresPaths is undefined', () => {
    const s = buildSettings({ featuresPaths: undefined, featuresPath: 'my-tests' });
    ...
  });
});
```

**Suite to delete** — `all-empty plural falls to singular` (L147-L154) — replace test (or delete). The replacement asserts plural-all-empty → convention "features":
```typescript
test('all-empty plural falls to convention "features"', () => {
  const s = buildSettings({ featuresPaths: ['', '  '] });
  assert.strictEqual(s.projectRelativeFeaturesPaths.length, 1);
  assert.strictEqual(s.projectRelativeFeaturesPath, 'features');
});
```

**Suite to delete** — both-set info-log assertions (L201-L249).

**Test to update (L253-L267)** — `TestWorkspaceConfig featuresPaths default`:
```typescript
// BEFORE:
const tc = new TestWorkspaceConfig({
  envVarOverrides: {},
  featuresPath: 'features',          // DROP this line
  justMyCode: true,
  ...
});
```

---

### `test/unit/settings/discoveryPriority.test.ts` — delete singular tests, keep `projectPath` parallels

**Analog:** the same file's `projectPath` tests (L65-L67, L75-L78, L108-L111) — these stay; `featuresPath` tests are deleted because the discovery branch no longer reads the singular.

**Tests to delete** (per RESEARCH.md Pitfall 7):
- L70-L83 (`featuresPath set at workspaceValue`, `featuresPath set at workspaceFolderValue`)
- L93-L98 (`empty string at workspaceValue` for `featuresPath`)
- L102-L113 (the `priority order verification` tests that assert `featuresPath` returns true/false)

**Surviving sibling test pattern** (L65-L67) — proves `hasExplicitSetting` for `projectPath` still works; this is the shape Phase 16 leaves behind:
```typescript
test('projectPath set at workspaceValue -- returns true (settings branch)', () => {
  const cfg = makeConfig({ projectPath: 'myproject' }, ['projectPath']);
  assert.strictEqual(hasExplicitSetting(cfg, 'projectPath'), true);
});
```

---

### `test/integration/suite-shared/shared.workspace.tests.ts` — 4 fixture call sites

**Analog:** the file itself; identical mechanical replacement at every site.

**Site at L26** — `featuresPath: undefined` — drop the property entirely (no replacement; absent = `undefined` in the constructor's destructured signature):
```typescript
// BEFORE (L24-L28):
const testConfig = new TestWorkspaceConfig({
  runParallel: undefined, multiRootRunWorkspacesInParallel: undefined,
  envVarOverrides: undefined, projectPath: projectPath, featuresPath: undefined,
  justMyCode: undefined, xRay: undefined
});
// AFTER:
const testConfig = new TestWorkspaceConfig({
  runParallel: undefined, multiRootRunWorkspacesInParallel: undefined,
  envVarOverrides: undefined, projectPath: projectPath,
  justMyCode: undefined, xRay: undefined
});
```

**Sites at L43, L60, L76** — `featuresPath: wkspRelativeFeaturesPath` — load-bearing (the parameter flows to the extension under test). Replace with the plural form:
```typescript
// BEFORE (L41-L45):
const testConfig = new TestWorkspaceConfig({
  runParallel: false, multiRootRunWorkspacesInParallel: true,
  envVarOverrides: envVarOverrides, projectPath: projectPath, featuresPath: wkspRelativeFeaturesPath,
  justMyCode: undefined, xRay: true
});
// AFTER:
const testConfig = new TestWorkspaceConfig({
  runParallel: false, multiRootRunWorkspacesInParallel: true,
  envVarOverrides: envVarOverrides, projectPath: projectPath,
  featuresPaths: wkspRelativeFeaturesPath ? [wkspRelativeFeaturesPath] : undefined,
  justMyCode: undefined, xRay: true
});
```
Constructor signature already supports `featuresPaths?: string[] | undefined` (L40 in `testWorkspaceConfig.ts`) — no mock change needed.

---

### `test/integration/debug suite/extension.test.ts` (L33-L37) — single call site

**Analog:** the file itself.

**Drop `featuresPath: undefined` from the fixture** (L35):
```typescript
// BEFORE:
const testConfig = new TestWorkspaceConfig({
  runParallel: false, multiRootRunWorkspacesInParallel: false,
  envVarOverrides: undefined, projectPath: undefined, featuresPath: undefined,
  justMyCode: true, xRay: false,
});
// AFTER:
const testConfig = new TestWorkspaceConfig({
  runParallel: false, multiRootRunWorkspacesInParallel: false,
  envVarOverrides: undefined, projectPath: undefined,
  justMyCode: true, xRay: false,
});
```

---

## Shared Patterns

### Same-Scope Inspect-Detect (Pitfall 2)
**Source:** `src/notifications.ts:96-107` and `:112-116` — the per-scope detection ladder.
**Apply to:** D-MOD primitive (the centerpiece of Phase 16).

```typescript
let target: vscode.ConfigurationTarget | undefined;
let legacyValue: TSrc | undefined;
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
if (target === undefined) return false;

// Read DEST at SAME scope (Pitfall 2 — never cfg.get() which merges scopes)
const destInsp = destCfg.inspect<TDest>(opts.destKey);
const destAtScope =
  target === vscode.ConfigurationTarget.WorkspaceFolder ? destInsp?.workspaceFolderValue :
    target === vscode.ConfigurationTarget.Workspace ? destInsp?.workspaceValue :
      destInsp?.globalValue;
```
**Why same-scope:** dedup must compare against what's at that scope, not against the merged `get()` result. Phase 15's helper does this at L112-L116; Phase 16's primitive must preserve it.

### Defense-in-Depth Logging (D-05/D-07)
**Source:** `src/notifications.ts:123-128`.
**Apply to:** D-MOD primitive's catch block + the activation-loop catch.

```typescript
} catch (e) {
  config.logger.logInfo(
    `Could not migrate ${sourceKey} to ${destKey}: ${e}`,
    wkspUri,
  );
}
```
Helpers **never throw** — the activation loop's outer try/catch is defense-in-depth, not load-bearing. The helper logs and returns `false` (Phase 16) or `undefined` (Phase 15).

### Fire-and-Forget Notification with Action Handler
**Source:** `src/extension.ts:165-177` (multi-config notification).
**Apply to:** Phase 16 post-loop notification block.

```typescript
showSuppressibleNotification(key, message, buttons, wkspUri).then(action => {
  if (action === 'ButtonLabel') {
    vscode.commands.executeCommand('command.id', ...args);
  }
  // DSA intercepted internally by the wrapper — never returned here.
});
```
No `await`, no try/catch wrapper, no `.catch()` — the wrapper handles all error cases internally (it never rejects on suppression-list update failure; it logs).

### Strict-Undefined Throw on Registered Settings
**Source:** `src/settings.ts:120-131` — pattern for every registered key in `WorkspaceSettings` constructor.
**Apply to:** the surviving `featuresPaths` plural read in `src/settings.ts` — but with a twist. Per the comment at `settings.ts:189`: "D-12: no throw on undefined — VS Code returns undefined for undeclared keys". The plural is registered (default `[]`), so `get()` should always return at least the default; the `undefined`-tolerance is defensive. Phase 16 keeps this pattern unchanged.

### Normalization Rule (D-07 single source of truth)
**Source:** `src/settings.ts:204` and `:214`.
```typescript
.replace(/^\\|^\//, "").replace(/\\$|\/$/, "").trim()
```
**Apply to:** Phase 16's `normalizePathEntry` helper in `src/notifications.ts`. **MUST be byte-identical** — these two regexes are the operational definition of "same path" for dedup (D-07). If they ever drift, dedup silently double-appends.

---

## No Analog Found

None. Every Phase 16 modification has a closer-than-arms-length analog already in the codebase. No file is novel; even the D-MOD primitive is "extract this existing function's skeleton into a new function in the same file."

---

## Cross-Cutting Constraints (from CLAUDE.md / AI_INSTRUCTIONS.md)

**After every TS source change:**
```bash
npx eslint src --ext ts
```
Exit 0 with no output = clean. Treat any warning as a failure.

**After any `src/` change:**
```bash
npm run test:unit
```
Phase 16 regression bar: full unit suite stays green; the existing 8 `migrateLegacySuppressMultiConfig` sub-cases (L289-L387) and 3 structural tests (L400-L428) all pass after the D-MOD refactor.

**Phase 16 quick filter** during implementation:
```bash
npm run test:unit -- --grep "featuresPath\|migrateLegacy\|migrateScoped\|TestWorkspaceConfig"
```

---

## Metadata

**Analog search scope:** `src/notifications.ts`, `src/settings.ts`, `src/common.ts`, `src/testWorkspaceConfig.ts`, `src/extension.ts`, `src/configuration.ts`, `package.json`, `test/unit/notifications.test.ts`, `test/unit/settings/multiPathPrecedence.test.ts`, `test/unit/settings/discoveryPriority.test.ts`, `test/integration/suite-shared/shared.workspace.tests.ts`, `test/integration/debug suite/extension.test.ts`.

**Files scanned:** 12 (every file CONTEXT.md / RESEARCH.md identified as touched, plus `package.json` for the `publisher` field verification).

**Verified facts the planner can lock into PLAN.md:**
- **Publisher = `gabeseltzer`** (from `package.json:280`). The "Open Settings" command uses `@ext:gabeseltzer.gs-behave-bdd` — NOT `@ext:formlabs.gs-behave-bdd` as RESEARCH.md placeholders suggested. (RESEARCH.md A4/A6 deferred this verification to Wave 0; it's now resolved.)
- **`config.reloadSettings(wkspUri)` is synchronous** (returns `void`, not `Promise<void>` — see `src/configuration.ts:14, 54`). Phase 16 must NOT add `await` (Pitfall 8).
- **`makePerKeyScopedConfig` is defined but NOT exported** in `test/unit/notifications.test.ts:257` (only `makeScopedConfig` is exported at L250). Phase 16 either exports it or duplicates it in a new test suite.
- **Constructor of `TestWorkspaceConfig` already accepts `featuresPaths?: string[] | undefined`** at `src/testWorkspaceConfig.ts:40, 57` — the integration fixture replacements in `shared.workspace.tests.ts` need no mock-side change.

**Pattern extraction date:** 2026-04-28
