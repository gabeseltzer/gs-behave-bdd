# Phase 7: Internal Multi-Path Types - Pattern Map

**Mapped:** 2026-04-17
**Files analyzed:** 4 production modifications + 3 new test files + 1 test modification = 8 files
**Analogs found:** 8 / 8 (6 exact, 1 role-match, 1 partial — see No Analog Found for Windows-normalization at settings layer)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/parsers/configParser.ts` (modify) | parser | transform | self (discriminated-union shape already established) | exact |
| `src/common.ts` (modify) | utility + discovery | transform + request-response | self (existing `uriId`, `urisMatch`, `findSubdirectorySync`, `getWorkspaceSettingsForFile` helpers) | exact |
| `src/settings.ts` (modify) | config | request-response | self (existing readonly field pattern; `WindowSettings` at `settings.ts:30-57`) | exact |
| `src/testWorkspaceConfig.ts` (modify) | test-support / config-mirror | request-response | self (mirror pattern for every existing production setting) | exact |
| `test/unit/settings/multiPathPrecedence.test.ts` (new) | test | request-response | `test/unit/settings/discoveryPriority.test.ts` (makeConfig helper) + `test/unit/settings/verboseLogging.test.ts` (WorkspaceSettings construction harness) | exact |
| `test/unit/settings/isFileInFeatures.test.ts` (new) | test | request-response | `test/unit/settings/verboseLogging.test.ts` (fake WorkspaceSettings object via prototype call) | role-match |
| `test/unit/common/getFeaturesRootForFile.test.ts` (new) | test | request-response | `test/unit/settings/discoveryPriority.test.ts` (helper-level unit test in `settings/` dir — we repurpose to `common/`) | role-match |
| `test/unit/parsers/configParser.test.ts` (modify) | test | transform | self (existing suite already structured per-format) | exact |

---

## Pattern Assignments

### `src/parsers/configParser.ts` (parser, transform)

**Analog:** self — discriminated-union shape already established at `configParser.ts:12-14`.

**Type-change pattern — discriminated union preserves shape (D-01):**

Current shape at `src/parsers/configParser.ts:10-14`:

```typescript
// Discriminated union: ok:true = success, ok:false = config file found but malformed (D-05)
// undefined return from findBehaveConfig = no config file found at all (not an error)
export type BehaveConfigResult =
  | { ok: true; configFileUri: vscode.Uri; format: 'ini' | 'toml'; rawPaths: string[]; resolvedPath: vscode.Uri }
  | { ok: false; configFileUri: vscode.Uri; errorMessage: string };
```

Target shape (D-01 rename — only the `resolvedPath` field becomes plural on the `ok:true` variant; `ok:false` variant unchanged):

```typescript
export type BehaveConfigResult =
  | { ok: true; configFileUri: vscode.Uri; format: 'ini' | 'toml'; rawPaths: string[]; resolvedPaths: vscode.Uri[] }
  | { ok: false; configFileUri: vscode.Uri; errorMessage: string };
```

**`resolvePaths` signature change pattern (D-01, D-10):**

Current implementation at `src/parsers/configParser.ts:155-169`:

```typescript
// Resolves rawPaths[0] against the config file's directory.
// v1: only the first path is resolved (D-03, D-04); all paths are captured in rawPaths[].
// Source: bundled/libs/behave/configuration.py path resolution ~lines 547-555
function resolvePaths(rawPaths: string[], configFileUri: vscode.Uri): vscode.Uri {
  const configDirUri = vscode.Uri.joinPath(configFileUri, '..');
  const rawPath = rawPaths[0];

  // Absolute path detection: Unix (/...) or Windows (C:\... or C:/...)
  if (rawPath.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(rawPath)) {
    return vscode.Uri.file(rawPath);
  }

  // Relative path: resolve against config file's directory
  return vscode.Uri.joinPath(configDirUri, rawPath);
}
```

Target (return `vscode.Uri[]`, loop over rawPaths, inject `normalizeSeparators` as the first per-entry transformation):

```typescript
function resolvePaths(rawPaths: string[], configFileUri: vscode.Uri): vscode.Uri[] {
  const configDirUri = vscode.Uri.joinPath(configFileUri, '..');
  return rawPaths.map(rawPath => {
    const normalized = normalizeSeparators(rawPath);  // D-10 — first transformation
    if (normalized.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(normalized)) {
      return vscode.Uri.file(normalized);
    }
    return vscode.Uri.joinPath(configDirUri, normalized);
  });
}
```

**`buildResult` update pattern:**

Current at `src/parsers/configParser.ts:171-183`:

```typescript
function buildResult(
  configFileUri: vscode.Uri,
  format: 'ini' | 'toml',
  rawPaths: string[]
): BehaveConfigResult {
  return {
    ok: true,
    configFileUri,
    format,
    rawPaths,
    resolvedPath: resolvePaths(rawPaths, configFileUri),
  };
}
```

Target: rename field only; keep structure.

**Windows normalization — new private helper (D-10):**

No existing normalization helper in `configParser.ts`. **Closest codebase analog is `src/runners/runOrDebug.ts:28-29`** (the only existing `\` → `/` normalization in production source):

```typescript
// src/runners/runOrDebug.ts:27-29
// Normalize separators to forward slashes
const normalizedPath = workspaceRelativePath.replaceAll("\\", "/");
const normalizedProjectPath = projectPath.replaceAll("\\", "/").replace(/\/$/, "");
```

Apply the same idiom as a private, colocated helper in `configParser.ts`:

```typescript
// Private helper (not exported) — D-10 colocated in configParser per Claude's Discretion
// Converts Windows-style backslashes to forward slashes before URI construction.
function normalizeSeparators(rawPath: string): string {
  return rawPath.replaceAll('\\', '/');
}
```

Placement: above `resolvePaths` (line ~155) so Phase 7's sole caller is lexically adjacent.

**Error handling pattern (unchanged):**

Error path at `src/parsers/configParser.ts:134-138` — `parseTomlConfig` catch returns `{ ok: false, ... }`. Phase 7 does not touch this branch.

---

### `src/common.ts` (utility + discovery, transform + request-response)

**Analog:** self — `DiscoveryEntry` interface at `common.ts:32-40`, `hasFeaturesFolder` at `common.ts:177-291`, helper idiom at `common.ts:89-94, 323-345, 486-506`.

**Type-change pattern — interface rename (D-02):**

Current shape at `src/common.ts:32-40`:

```typescript
export interface DiscoveryEntry {
  source: DiscoverySource;
  configFileUri?: vscode.Uri;       // set when source = "config-file"
  configError?: {                   // set when malformed config found (D-05)
    configFileUri: vscode.Uri;
    errorMessage: string;
  };
  featuresUri: vscode.Uri;          // the resolved features path used
}
```

Target (D-02 rename):

```typescript
export interface DiscoveryEntry {
  source: DiscoverySource;
  configFileUri?: vscode.Uri;
  configError?: {
    configFileUri: vscode.Uri;
    errorMessage: string;
  };
  featuresUris: vscode.Uri[];       // non-empty per D-05; length-1 in every Phase 7 branch
}
```

**Branch A populate pattern (discovery writer, lines 225, 231):**

Current at `src/common.ts:225`:

```typescript
discoveryCache.set(uriId(folder.uri), { source: "settings", featuresUri });
return true;
```

Target: wrap the scalar in a length-1 array:

```typescript
discoveryCache.set(uriId(folder.uri), { source: "settings", featuresUris: [featuresUri] });
return true;
```

Apply the same transformation at `common.ts:231` (second Branch A write site).

**Branch B populate pattern — BehaveConfigResult consumer at lines 252-277:**

Current at `src/common.ts:252-276`:

```typescript
const configResult = findBehaveConfig(folder.uri);

if (configResult) {
  if (configResult.ok) {
    // Config file found with valid paths -- use it
    const featuresUri = configResult.resolvedPath;
    if (fs.existsSync(featuresUri.fsPath)) {
      discoveryCache.set(uriId(folder.uri), {
        source: "config-file",
        configFileUri: configResult.configFileUri,
        featuresUri,
      });
      return true;
    }
    // Config points to nonexistent directory -- fall through to convention
  } else {
    // ok:false -- malformed config file; capture error, fall through to convention (D-06)
    // Store a partial entry so Phase 3 can read the configError
    discoveryCache.set(uriId(folder.uri), {
      source: "convention",
      configError: {
        configFileUri: configResult.configFileUri,
        errorMessage: configResult.errorMessage,
      },
      featuresUri: vscode.Uri.joinPath(folder.uri, "features"), // placeholder
    });
  }
}
```

Target — Phase 7 preserves single-path semantics in Branch B (per Open Question #2 in RESEARCH.md: "length-1 in all branches in Phase 7 — conservative interpretation"). Read `configResult.resolvedPaths[0]`, wrap in length-1 array, keep `fs.existsSync` existence gate on that first entry (Phase 8 widens):

```typescript
if (configResult.ok) {
  const firstPath = configResult.resolvedPaths[0];
  if (fs.existsSync(firstPath.fsPath)) {
    discoveryCache.set(uriId(folder.uri), {
      source: "config-file",
      configFileUri: configResult.configFileUri,
      featuresUris: [firstPath],
    });
    return true;
  }
} else {
  discoveryCache.set(uriId(folder.uri), {
    source: "convention",
    configError: { /* unchanged */ },
    featuresUris: [vscode.Uri.joinPath(folder.uri, "features")], // placeholder (length-1)
  });
}
```

**Branch C populate pattern — convention fallthrough at lines 280-288:**

Current at `src/common.ts:280-288`:

```typescript
const conventionFeaturesUri = vscode.Uri.joinPath(folder.uri, "features");
if (fs.existsSync(conventionFeaturesUri.fsPath)) {
  const existing = discoveryCache.get(uriId(folder.uri));
  discoveryCache.set(uriId(folder.uri), {
    ...existing,                  // preserves configError if set from malformed config above
    source: "convention",
    featuresUri: conventionFeaturesUri,
  });
  return true;
}
```

Target: same spread, wrap in length-1 array:

```typescript
discoveryCache.set(uriId(folder.uri), {
  ...existing,
  source: "convention",
  featuresUris: [conventionFeaturesUri],
});
```

**Module-level helper pattern — `getFeaturesRootForFile` (D-09):**

No existing helper has the exact `(wkspSettings, fileUri) -> Uri | undefined` signature. Closest analogs in `common.ts`:

1. **`uriId` / `urisMatch`** at `src/common.ts:89-94` — the canonical URI equality primitive:

```typescript
// these two uri functions are here to highlight why uri.toString() is needed:
// ...
export function uriId(uri: vscode.Uri) {
  return uri.toString();
}
export function urisMatch(uri1: vscode.Uri, uri2: vscode.Uri) {
  return uri1.toString() === uri2.toString();
}
```

2. **`getWorkspaceUriForFile` / `getWorkspaceSettingsForFile`** at `src/common.ts:323-345` — the "given-a-file-find-its-owner" lookup idiom (returns `undefined` for no-match, no throwing):

```typescript
export const getWorkspaceUriForFile = (fileorFolderUri: vscode.Uri | undefined): vscode.Uri | undefined => {
  if (fileorFolderUri?.scheme !== "file")
    return undefined;
  if (!fileorFolderUri)
    return undefined;
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileorFolderUri);
  if (!workspaceFolder) {
    console.warn(`[gs-behave-bdd] No workspace folder found for file ${fileorFolderUri.fsPath}, skipping workspace-specific features`);
    return undefined;
  }
  return workspaceFolder.uri;
}

export const getWorkspaceSettingsForFile = (fileorFolderUri: vscode.Uri | undefined): WorkspaceSettings | undefined => {
  const wkspUri = getWorkspaceUriForFile(fileorFolderUri);
  if (!wkspUri)
    return undefined;
  return config.workspaceSettings[wkspUri.path];
}
```

3. **`findSubdirectorySync`** at `src/common.ts:486-506` — `(searchPath, target) -> string | null` returns `null` for no-match; documents the "return a terminator value, do not throw" convention for pure lookups.

**Derived signature for `getFeaturesRootForFile` — follows the `getWorkspaceSettingsForFile` idiom** (settings-then-file arg order, `Uri | undefined` return, no throw, `export function` not `export const` since it uses a classic `function` declaration for module-level exports that depend on `WorkspaceSettings`):

```typescript
// src/common.ts (new, module-level — place near getWorkspaceSettingsForFile at line ~340)
// Returns the first featuresUri in wkspSettings.featuresUris that contains fileUri,
// or undefined if fileUri is outside every root. Dead code in Phase 7 — Phase 8 callers activate it.
export function getFeaturesRootForFile(
  wkspSettings: WorkspaceSettings,
  fileUri: vscode.Uri
): vscode.Uri | undefined {
  return wkspSettings.featuresUris.find(
    root => fileUri.path.startsWith(root.path + '/') || urisMatch(root, fileUri)
  );
}
```

Signature rationale (from RESEARCH.md §Signatures):
- Arg order `(wkspSettings, fileUri)` mirrors `getWorkspaceSettingsForFile(fileorFolderUri)` but with the settings passed in explicitly (this helper is called per-document in Phase 8, so it can't rely on a global lookup).
- Return `Uri | undefined` matches `getWorkspaceUriForFile` / `findSubdirectorySync` (which returns `string | null`; undefined is the TypeScript-idiomatic equivalent).
- No throwing — pure predicate lookup (per AI_INSTRUCTIONS.md §Exception Handling: helpers throw only when the operation must fail-fast).

**Path-containment guard pattern (Pitfall 3 prevention):**

The `root.path + '/'` guard comes from RESEARCH.md §Don't Hand-Roll — prevents `startsWith("/features")` from matching `/featuresA`. The `|| urisMatch(root, fileUri)` handles the exact-root case (where `fileUri === root`). Both primitives already exist in `common.ts`.

**Circularity note:** `common.ts:8` already imports `WorkspaceSettings` from `./settings` (for `getWorkspaceSettingsForFile`), and `settings.ts:3-7` already imports from `./common`. Adding another `WorkspaceSettings` usage in `common.ts` does not change cycle topology — verified by RESEARCH.md §`getFeaturesRootForFile` Signatures.

**`extension.ts` read-site update pattern:**

Current at `src/extension.ts:79, 83`:

```typescript
config.logger.logInfo(`Features directory: ${entry.featuresUri.fsPath}`, wkspUri);
// ...
diagLog(
  `Discovery detail: source=${entry.source}, config=${entry.configFileUri?.fsPath ?? 'none'}, features=${entry.featuresUri.fsPath}`,
  wkspUri
);
```

Target — `DiscoveryEntry` is an interface (not a class), so it can't have a getter shim per D-02. Two reads must rename:

```typescript
config.logger.logInfo(`Features directory: ${entry.featuresUris[0].fsPath}`, wkspUri);
// ...
diagLog(
  `Discovery detail: source=${entry.source}, config=${entry.configFileUri?.fsPath ?? 'none'}, features=${entry.featuresUris[0].fsPath}`,
  wkspUri
);
```

Phase 7 keeps single-line log output (plural-listing log deferred to Phase 11 per ROADMAP §Phase 11 SC#5).

---

### `src/settings.ts` (config, request-response)

**Analog:** self — `WindowSettings` class at `src/settings.ts:30-57` is the closest analog for the readonly-field pattern, `WorkspaceSettings` constructor at `settings.ts:89-233` is the integration target.

**Singular getter pattern — derived from `WindowSettings` readonly idiom:**

Closest existing pattern at `src/settings.ts:30-57` — `WindowSettings` uses `public readonly` fields populated in the constructor:

```typescript
export class WindowSettings {
  public readonly multiRootRunWorkspacesInParallel: boolean;
  public readonly xRay: boolean;
  public readonly verboseLogging: boolean;

  constructor(winConfig: vscode.WorkspaceConfiguration, legacyConfig?: vscode.WorkspaceConfiguration) {
    // ... read each value with fail-fast throw on undefined ...
    this.multiRootRunWorkspacesInParallel = multiRootRunWorkspacesInParallelCfg;
    this.xRay = xRayCfg;
    this.verboseLogging = verboseLoggingCfg;
  }
}
```

**For Phase 7's singular-from-plural derivation,** this readonly-field pattern does NOT apply directly (constructor-ordering hazard — see RESEARCH.md §Singular Getter Implementation Pattern). Instead, use TypeScript `get` accessors — same visibility (`public`), same immutability, but **lazy** read from the plural source of truth. Apply the pattern to all four fields (D-03):

```typescript
// src/settings.ts — target shape for WorkspaceSettings (replaces lines 72, 78, 79, 80 singular declarations)
export class WorkspaceSettings {
  // ... existing fields at lines 64-77 unchanged ...

  // NEW plural fields (D-03) — replace the singular readonly fields at lines 72, 78, 79, 80
  public readonly featuresUris: vscode.Uri[];
  public readonly stepsSearchUris: vscode.Uri[];
  public readonly projectRelativeFeaturesPaths: string[];
  public readonly workspaceRelativeFeaturesPaths: string[];

  // Singular back-compat getters (D-03, D-05 — all 27+ existing call sites untouched)
  public get featuresUri(): vscode.Uri { return this.featuresUris[0]; }
  public get stepsSearchUri(): vscode.Uri { return this.stepsSearchUris[0]; }
  public get projectRelativeFeaturesPath(): string { return this.projectRelativeFeaturesPaths[0]; }
  public get workspaceRelativeFeaturesPath(): string { return this.workspaceRelativeFeaturesPaths[0]; }

  // ... existing discovery metadata at lines 82-86 unchanged ...
}
```

**Why `get` over readonly field:** RESEARCH.md §Singular Getter Implementation Pattern documents the decision — `readonly featuresUri: vscode.Uri` initialized in constructor creates a constructor-ordering hazard where if `this.featuresUri = this.featuresUris[0]` is reordered accidentally, it reads `undefined` silently. TypeScript's `TS2564` "has no initializer and is not definitely assigned" is the compile-time safety net that protects the plural field (see RESEARCH.md §Risk Surface).

**Fail-fast `get<T>` pattern — applied to `featuresPaths` but with an IMPORTANT EXCEPTION:**

Current pattern at `src/settings.ts:104-132` (10+ fail-fast reads):

```typescript
const envVarOverridesCfg: { [name: string]: string } | undefined = get("envVarOverrides");
if (envVarOverridesCfg === undefined)
  throw "envVarOverrides is undefined";
// ...
const featuresPathCfg: string | undefined = get("featuresPath");
if (featuresPathCfg === undefined)
  throw "featuresPath is undefined";
```

**DO NOT follow this pattern for `featuresPaths` (D-12).** Because `package.json` does not declare `featuresPaths` in Phase 7, VS Code will legitimately return `undefined` for the optional read — throwing would break every production invocation. Instead, use the optional-read variant (RESEARCH.md §Standard Stack "Fail-fast throws for undefined package.json-defaulted settings" - explicit exception):

```typescript
// NEW — after the existing featuresPath read at settings.ts:116-118:
const featuresPathCfg: string | undefined = get("featuresPath");
if (featuresPathCfg === undefined)
  throw "featuresPath is undefined";

// Optional read per D-12: package.json does not declare "featuresPaths" in Phase 7.
// VS Code returns undefined when the key is absent — this is expected, NOT an error.
const featuresPathsCfg: string[] | undefined = get<string[] | undefined>("featuresPaths");
```

**Precedence-ladder pattern (D-11) — NEW, no direct analog; derives from `featuresPath` fallback at `settings.ts:154-157`:**

Current v1.1 fallback pattern at `src/settings.ts:154-157`:

```typescript
// Process featuresPath - this is relative to projectPath
this.projectRelativeFeaturesPath = featuresPathCfg.replace(/^\\|^\//, "").replace(/\\$|\/$/, "").trim();
// vscode will not substitute a default if an empty string is specified in settings.json
if (!this.projectRelativeFeaturesPath)
  this.projectRelativeFeaturesPath = "features";
```

Target — Phase 7 replaces lines 154-157 with the three-rung precedence ladder, preserving the trim-and-strip-slashes normalization from line 154 per entry:

```typescript
// D-11 precedence ladder: plural wins → singular → convention
let projectRelativeFeaturesPaths: string[];
if (featuresPathsCfg && Array.isArray(featuresPathsCfg) && featuresPathsCfg.length > 0) {
  // Rung 1: plural set + non-empty
  projectRelativeFeaturesPaths = featuresPathsCfg
    .map(p => p.replace(/^\\|^\//, "").replace(/\\$|\/$/, "").trim())
    .filter(p => p.length > 0);
  if (projectRelativeFeaturesPaths.length === 0) {
    // All entries were empty after trim → treat plural as unset, fall to singular
    projectRelativeFeaturesPaths = [featuresPathCfg.replace(/^\\|^\//, "").replace(/\\$|\/$/, "").trim() || "features"];
  }
} else if (featuresPathCfg && featuresPathCfg.trim() !== "") {
  // Rung 2: singular set
  projectRelativeFeaturesPaths = [featuresPathCfg.replace(/^\\|^\//, "").replace(/\\$|\/$/, "").trim()];
} else {
  // Rung 3: neither set → convention
  projectRelativeFeaturesPaths = ["features"];
}

// D-05 non-empty invariant (defense-in-depth)
if (projectRelativeFeaturesPaths.length === 0) projectRelativeFeaturesPaths = ["features"];
```

**`"."` rejection pattern preserved per-entry (D-07) — derived from `settings.ts:159-160`:**

Current v1.1 rejection at `src/settings.ts:159-160`:

```typescript
if (this.projectRelativeFeaturesPath === ".")
  this._fatalErrors.push(`"." is not a valid "gs-behave-bdd.featuresPath" value. The features folder must be a subfolder.`);
```

Target — loop per entry, same error message (the error string is load-bearing: TEST-12 asserts `/not a valid .* value/`):

```typescript
// D-07: per-entry "." rejection — ANY entry equal to "." fails the whole config (D-06 all-or-nothing)
for (const p of projectRelativeFeaturesPaths) {
  if (p === ".") {
    this._fatalErrors.push(`"." is not a valid "gs-behave-bdd.featuresPath" value. The features folder must be a subfolder.`);
  }
}
```

**Per-entry existence check pattern — derived from `settings.ts:161-167`:**

Current scalar check at `src/settings.ts:161-167`:

```typescript
if (!fs.existsSync(this.featuresUri.fsPath)) {
  // note - this error should never happen or some logic/hooks are wrong 
  // (or the user has actually deleted/moved the features path since loading)
  // because the existence of the path should always be checked by getUrisOfWkspFoldersWithFeatures(true)
  // before we get here (i.e. called elsewhere when workspace folders/settings are changed etc.)    
  this._fatalErrors.push(`features path ${this.featuresUri.fsPath} not found.`);
}
```

Target — loop per entry:

```typescript
this.projectRelativeFeaturesPaths = projectRelativeFeaturesPaths;
this.featuresUris = projectRelativeFeaturesPaths.map(p =>
  vscode.Uri.joinPath(this.projectUri, p)
);

// D-06 all-or-nothing: any missing entry fails the whole config (Phase 7 preserves v1.1 exactly)
for (const u of this.featuresUris) {
  if (!fs.existsSync(u.fsPath)) {
    this._fatalErrors.push(`features path ${u.fsPath} not found.`);
  }
}
```

**Per-entry computation pattern — derived from `settings.ts:170-184` (RESEARCH.md Pattern 3):**

Current single-path `workspaceRelativeFeaturesPath` + `stepsSearchUri` derivation at `src/settings.ts:170-184`:

```typescript
// Compute workspace-relative features path for file watchers etc.
this.workspaceRelativeFeaturesPath = this.workspaceRelativeProjectPath
  ? `${this.workspaceRelativeProjectPath}/${this.projectRelativeFeaturesPath}`
  : this.projectRelativeFeaturesPath;

// default to watching features folder for (possibly multiple) "steps" 
// subfolders (e.g. like example project B/features folder)
this.stepsSearchUri = vscode.Uri.joinPath(this.featuresUri);
if (!findSubdirectorySync(this.stepsSearchUri.fsPath, "steps")) {
  // if not found, get the highest-level "steps" folder above the features folder inside the project
  const stepsSearchFsPath = findHighestTargetParentDirectorySync(this.featuresUri.fsPath, this.projectUri.fsPath, "steps");
  if (stepsSearchFsPath)
    this.stepsSearchUri = vscode.Uri.file(stepsSearchFsPath);
  else
    logger.showWarn(`No "steps" folder found.`, this.uri);
}
```

Target — `.map` over the plural, applying the identical scalar logic per entry (Phase 7 still length-1, so behavior identical in single-path world):

```typescript
// workspaceRelativeFeaturesPaths: per-entry join (Pattern 3)
this.workspaceRelativeFeaturesPaths = projectRelativeFeaturesPaths.map(p =>
  this.workspaceRelativeProjectPath
    ? `${this.workspaceRelativeProjectPath}/${p}`
    : p
);

// stepsSearchUris: per-entry derivation using existing helpers (Pattern 3)
this.stepsSearchUris = this.featuresUris.map(featuresUri => {
  let stepsSearchUri = vscode.Uri.joinPath(featuresUri);
  if (!findSubdirectorySync(stepsSearchUri.fsPath, "steps")) {
    const stepsSearchFsPath = findHighestTargetParentDirectorySync(
      featuresUri.fsPath, this.projectUri.fsPath, "steps"
    );
    if (stepsSearchFsPath) {
      stepsSearchUri = vscode.Uri.file(stepsSearchFsPath);
    } else {
      logger.showWarn(`No "steps" folder found.`, this.uri);
    }
  }
  return stepsSearchUri;
});
```

**Instance-method-on-settings pattern — `isFileInFeatures` (D-08):**

Existing instance method on `WorkspaceSettings` — `getEffectiveEnvVars()` at `src/settings.ts:240-245`:

```typescript
/**
 * Gets the effective environment variables by merging the active preset with overrides.
 * The order of precedence (highest to lowest): envVarOverrides > activePreset
 */
getEffectiveEnvVars(): { [name: string]: string } {
  const presetVars = this.activeEnvVarPreset && this.envVarPresets[this.activeEnvVarPreset]
    ? this.envVarPresets[this.activeEnvVarPreset]
    : {};
  return { ...presetVars, ...this.envVarOverrides };
}
```

Target — follow same shape: JSDoc block, public method (no modifier keyword), pure computation over `this.<plural>`:

```typescript
/**
 * Returns true if the given URI points to a file inside any of this workspace's
 * configured features roots. Matches on exact-root equality or path-prefix containment.
 * Uses the "+ '/'" guard to prevent false positives like "/features" matching "/featuresA".
 */
public isFileInFeatures(uri: vscode.Uri): boolean {
  return this.featuresUris.some(
    fu => uri.path.startsWith(fu.path + '/') || urisMatch(fu, uri)
  );
}
```

**Error handling — `logSettings` unchanged (Pitfall 5):**

`logSettings` at `src/settings.ts:248-298` must NOT change output shape in Phase 7 (ROADMAP §Phase 11 SC#5 reserves plural log output for Phase 11). The `nonUserSettableWkspSettings` exclusion list at line 261 already hides `featuresUri` and `stepsSearchUri`; the `wkspEntries.push(["featuresPath", this.projectRelativeFeaturesPath])` at line 269 continues to work because the singular getter now returns the first element. Do NOT add plural entries.

---

### `src/testWorkspaceConfig.ts` (test-support / config-mirror, request-response)

**Analog:** self — every existing setting already has a three-point mirror (`private` field, `get<T>` case, `inspect<T>` case, `getExpected<T>` case).

**Plural input pattern — derived from the `featuresPath` mirror at lines 16, 27, 48, 76-77, 125-127, 172-180, 220-221:**

Current `featuresPath` three-point mirror:

```typescript
// src/testWorkspaceConfig.ts:16 — private field
private featuresPath: string | undefined;

// src/testWorkspaceConfig.ts:27 — constructor destructure
featuresPath: featuresPath,

// src/testWorkspaceConfig.ts:35 — constructor param type
featuresPath: string | undefined,

// src/testWorkspaceConfig.ts:48 — constructor assignment
this.featuresPath = featuresPath;

// src/testWorkspaceConfig.ts:76-77 — get<T> case with package.json default
case "featuresPath":
  return <T><unknown>(this.featuresPath === undefined ? "features" : this.featuresPath);

// src/testWorkspaceConfig.ts:125-127 — inspect<T> case
case "featuresPath":
  response = <T><unknown>this.featuresPath;
  break;

// src/testWorkspaceConfig.ts:172-180 — getExpected<T> helper
const getExpectedFeaturesPath = (): string => {
  switch (this.featuresPath) {
    case "":
    case undefined:
      return "features";
    default:
      return this.featuresPath.trim().replace(/^\\|^\//, "").replace(/\\$|\/$/, "");
  }
}

// src/testWorkspaceConfig.ts:220-221 — getExpected<T> case
case "featuresPath":
  return <T><unknown>getExpectedFeaturesPath();
```

Target for `featuresPaths` — same mirror shape WITH ONE KEY DEVIATION: the `get<T>` case must return `this.featuresPaths` **without substituting a default when undefined** (Pitfall 4 from RESEARCH.md §Common Pitfalls — because package.json doesn't declare this key in Phase 7, the "VS Code returns undefined" shape must be preserved):

```typescript
// NEW private field
private featuresPaths: string[] | undefined;

// NEW constructor destructure + param type (optional)
constructor({ /* ...existing... */, featuresPath, featuresPaths }: {
  /* ...existing... */
  featuresPath: string | undefined;
  featuresPaths?: string[] | undefined;  // optional; test harness may omit it
}) {
  /* ...existing... */
  this.featuresPaths = featuresPaths;
}

// NEW get<T> case — D-12 optional-read semantics (no default substitution)
case "featuresPaths":
  return <T><unknown>this.featuresPaths;  // undefined is the correct "not set" signal

// NEW inspect<T> case — mirror of featuresPath at lines 125-127
case "featuresPaths":
  response = <T><unknown>this.featuresPaths;
  break;
```

**`getExpected` mirror pattern (D-14):**

Derived from `getExpectedFeaturesPath` / `getExpectedFeaturesUri` / `getExpectedStepsSearchUri` local helpers at `src/testWorkspaceConfig.ts:172-211`. Add parallel plural helpers that match the production `WorkspaceSettings` precedence (D-14 — harness `getExpected` must produce the same result the constructor would):

```typescript
// NEW local helper — mirror getExpectedFeaturesPath at lines 172-180
const getExpectedFeaturesPaths = (): string[] => {
  // D-11 precedence mirror: plural wins when set non-empty; else fall to singular
  if (this.featuresPaths && this.featuresPaths.length > 0) {
    const normalized = this.featuresPaths
      .map(p => p.trim().replace(/^\\|^\//, "").replace(/\\$|\/$/, ""))
      .filter(p => p.length > 0);
    if (normalized.length > 0) return normalized;
  }
  return [getExpectedFeaturesPath()];  // rung 2/3 fallback
};

// NEW switch cases — mirror at lines 220-221, 226-229
case "featuresPaths":
  return <T><unknown>getExpectedFeaturesPaths();
case "featuresUris":
  return <T><unknown>getExpectedFeaturesPaths().map(p =>
    vscode.Uri.joinPath(getExpectedProjectUri(), p)
  );
case "projectRelativeFeaturesPaths":
  return <T><unknown>getExpectedFeaturesPaths();
case "workspaceRelativeFeaturesPaths":
  return <T><unknown>getExpectedFeaturesPaths().map(p => {
    const projectPath = getExpectedProjectPath();
    return projectPath ? `${projectPath}/${p}` : p;
  });
case "stepsSearchUris":
  // Phase 7 keeps single-path semantics; the length-1 case reuses the existing helper
  return <T><unknown>[getExpectedStepsSearchUri()];
```

---

### `test/unit/settings/multiPathPrecedence.test.ts` (new test)

**Analog:** `test/unit/settings/discoveryPriority.test.ts` (makeConfig helper) + `test/unit/settings/verboseLogging.test.ts` (fake WorkspaceSettings via prototype call — ONLY for `isFileInFeatures` tests; `multiPathPrecedence` constructs real `WorkspaceSettings` instances).

**Suite structure pattern — from `configParser.test.ts` shape:**

Existing suite layout at `test/unit/parsers/configParser.test.ts:14-35`:

```typescript
suite('configParser', () => {

  suite('findBehaveConfig - behave.ini (TEST-01)', () => {

    test('returns BehaveConfigResult for standard behave.ini', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'behave-ini'));
      const result = findBehaveConfig(wkspUri);
      assert.ok(result, 'should return a result');
      assert.strictEqual(result.ok, true, 'should be ok:true');
      if (!result.ok) return;  // TypeScript narrowing
      assert.strictEqual(result.format, 'ini', 'format should be ini');
      // ...
    });
  });
});
```

Target — nested suite-per-precedence-rung with requirement IDs in the name (RESEARCH.md §Precedence Matrix Test Design):

```typescript
suite('WorkspaceSettings multi-path precedence (TEST-12, MP-02)', () => {
  suite('Plural set only', () => { test('...', () => { /* ... */ }); });
  suite('Singular set only (v1.1 parity)', () => { test('...', () => { /* ... */ }); });
  suite('Both set: plural wins', () => { test('...', () => { /* ... */ }); });
  suite('Neither set: discovery fallback', () => { test('...', () => { /* ... */ }); });
  suite('Plural empty array: treated as unset (Pitfall 4)', () => { test('...', () => { /* ... */ }); });
  suite('Invalid-entry rejection (D-07, SC#4)', () => { test('...', () => { /* ... */ }); });
  suite('Windows backslash normalization (D-10, TEST-12)', () => { test('...', () => { /* ... */ }); });
});
```

**`makeConfig` helper pattern — copied verbatim from `discoveryPriority.test.ts:13-27`:**

```typescript
// test/unit/settings/discoveryPriority.test.ts:11-27
// --- Helpers: mock vscode.WorkspaceConfiguration with specific scope values ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeConfig(values: Record<string, unknown>, explicitKeys: string[] = []): any {
  return {
    get: (key: string) => values[key],
    has: () => false,
    inspect: (key: string) => ({
      key,
      defaultValue: undefined,
      globalValue: undefined,
      workspaceValue: explicitKeys.includes(key) ? values[key] : undefined,
      workspaceFolderValue: undefined,
    }),
    update: () => Promise.resolve(),
  };
}
```

**RESEARCH.md calls this out as THE reference for settings-layer test injection.** Copy it into the new test file verbatim. It already supports the "key set vs key unset" distinction via `explicitKeys`, which is exactly what `hasExplicitSetting` branches need.

**`WorkspaceSettings` construction pattern — from `verboseLogging.test.ts:108-128`:**

Current (indirect) construction pattern at `test/unit/settings/verboseLogging.test.ts:108-128`:

```typescript
function callLogSettings(
  fakeWksp: ReturnType<typeof makeFakeWkspSettings>,
  verboseLogging: boolean
): string {
  const winSettings = new WindowSettings(
    makeConfig({ ...WIN_DEFAULTS, verboseLogging })
  );

  let loggedText = '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockLogger: any = {
    logInfo: (text: string, _uri: unknown) => { loggedText = text; },
    logInfoAllWksps: () => { /* ignore instance settings log */ },
  };

  WorkspaceSettings.prototype.logSettings.call(fakeWksp, mockLogger, winSettings);
  return loggedText;
}
```

**NOTE** — this test calls `WorkspaceSettings.prototype.logSettings` via `.call` on a fake object because direct `new WorkspaceSettings(...)` is not used anywhere in the current unit suite (verified: `grep "new WorkspaceSettings" test/unit/` returns no matches). Phase 7's `multiPathPrecedence.test.ts` is the **first suite to directly construct `WorkspaceSettings`**. The RESEARCH.md suggests this is straightforward — the constructor takes:

```typescript
// src/settings.ts:89
constructor(wkspUri: vscode.Uri, wkspConfig: vscode.WorkspaceConfiguration, winSettings: WindowSettings, logger: Logger, legacyConfig?: vscode.WorkspaceConfiguration, discoveryEntry?: DiscoveryEntry)
```

All six args are injectable via existing patterns:
- `wkspUri` — `vscode.Uri.file('/fake/wksp')`
- `wkspConfig` — `makeConfig(...)` helper
- `winSettings` — `new WindowSettings(makeConfig(WIN_DEFAULTS))` per `verboseLogging.test.ts:110`
- `logger` — minimal stub `{ logInfo, logInfoAllWksps, showWarn, showError } as unknown as Logger`
- `legacyConfig` — omitted (undefined)
- `discoveryEntry` — omitted for Rung 1/2 tests; pass a fake `{ source: 'convention', featuresUris: [Uri.file(...)] }` for Rung 3 fallback tests

**fs.existsSync stubbing pattern — NEW, no exact precedent:**

Grep returned no existing `sinon.stub(fs, 'existsSync')` in `test/unit/`. The closest existing fs-stubbing pattern is at `test/unit/parsers/benchmarkInstrumentation.test.ts:54`:

```typescript
readFileStub = sinon.stub(fs.promises, 'readFile');
```

This stubs `fs.promises.readFile`, not `fs.existsSync`. The new tests need `fs.existsSync` stubbed because per-entry existence checks at the Phase 7 settings constructor (new code at target line ~207) will fatalError for missing dirs, which would break multi-path test cases where test directories don't exist on disk.

**Recommended new pattern** (following the sinon idiom used project-wide — see §Shared Patterns below for 16 files using `sinon.stub(...)` — and matching RESEARCH.md §Open Question #3 "recommend option A — sinon stub"):

```typescript
// test/unit/settings/multiPathPrecedence.test.ts — setup/teardown
import * as sinon from 'sinon';
import * as fs from 'fs';

let existsSyncStub: sinon.SinonStub;

setup(() => {
  // Stub fs.existsSync to return true for any path — tests control precedence, not disk state.
  // Invalid-entry rejection tests explicitly override return value for "." entries (which don't hit fs).
  existsSyncStub = sinon.stub(fs, 'existsSync').returns(true);
});

teardown(() => {
  sinon.restore();
});
```

**Test-level assertions pattern — from `discoveryPriority.test.ts:65-68`:**

```typescript
// test/unit/settings/discoveryPriority.test.ts:65-68
test('projectPath set at workspaceValue -- returns true (settings branch)', () => {
  const cfg = makeConfig({ projectPath: 'myproject' }, ['projectPath']);
  assert.strictEqual(hasExplicitSetting(cfg, 'projectPath'), true);
});
```

Apply the same `makeConfig(values, explicitKeys) → assert.strictEqual` shape. Example for the SC#3 length-2 assertion:

```typescript
test('featuresPaths=["features","features-alt"] → featuresUris.length === 2 (SC#3)', () => {
  const cfg = makeConfig({
    projectPath: '',
    featuresPath: 'features',  // will be overridden by plural per D-11
    featuresPaths: ['features', 'features-alt'],
    // ... other required WorkspaceSettings config keys (envVarOverrides: {}, etc.) ...
  }, ['featuresPaths']);
  const ws = new WorkspaceSettings(wkspUri, cfg, winSettings, logger);
  assert.strictEqual(ws.featuresUris.length, 2);
  assert.ok(ws.featuresUris[0].path.endsWith('/features'));
  assert.ok(ws.featuresUris[1].path.endsWith('/features-alt'));
});
```

**"." rejection assertion pattern — from RESEARCH.md §Precedence Matrix Test Design:**

```typescript
test('featuresPath="." → fatalError thrown (v1.1 parity)', () => {
  const cfg = makeConfig({ featuresPath: '.' }, ['featuresPath']);
  assert.throws(
    () => new WorkspaceSettings(wkspUri, cfg, winSettings, logger),
    /not a valid .* value/
  );
});
```

The regex `/not a valid .* value/` matches the v1.1 error string at `settings.ts:160` (preserved verbatim per D-07).

---

### `test/unit/settings/isFileInFeatures.test.ts` (new test)

**Analog:** `test/unit/settings/verboseLogging.test.ts:70-91` (fake WorkspaceSettings object) + `test/unit/settings/discoveryPriority.test.ts` (test shape).

**Fake-settings pattern — from `verboseLogging.test.ts:70-91`:**

```typescript
// test/unit/settings/verboseLogging.test.ts:70-91
function makeFakeWkspSettings(presets: { [name: string]: { [k: string]: string } }) {
  return {
    envVarPresets: presets,
    envVarOverrides: {},
    // ... all other public fields ...
    featuresUri: vscode.Uri.file('/fake/workspace/features'),
    stepsSearchUri: vscode.Uri.file('/fake/workspace/features'),
    workspaceRelativeFeaturesPath: 'features',
    _warnings: [],
    _fatalErrors: [],
  };
}
```

Target — for `isFileInFeatures` tests, a simpler shape suffices because the method only reads `this.featuresUris`. Call via prototype `.call()` same as `logSettings` test:

```typescript
// Fake shape exposes only what isFileInFeatures needs
function makeFakeWkspSettings(featuresUris: vscode.Uri[]) {
  return { featuresUris };
}

test('single-path: file inside root → true', () => {
  const wkspRoot = vscode.Uri.file('/fake/wksp');
  const featuresUri = vscode.Uri.joinPath(wkspRoot, 'features');
  const fake = makeFakeWkspSettings([featuresUri]);
  const fileUri = vscode.Uri.joinPath(featuresUri, 'foo.feature');

  const result = WorkspaceSettings.prototype.isFileInFeatures.call(fake, fileUri);

  assert.strictEqual(result, true);
});
```

**Test matrix (from RESEARCH.md §Test-file sibling: isFileInFeatures):**
1. single-path: file inside root → true
2. single-path: file outside root → false
3. multi-path: file in second root → true
4. exact root URI → true (via urisMatch)
5. sibling prefix "featuresX" does NOT match "features" root (Pitfall 3 prevention)

---

### `test/unit/common/getFeaturesRootForFile.test.ts` (new test)

**Analog:** `test/unit/settings/discoveryPriority.test.ts` — helper-level unit test invoking a module-level function with minimal mocks. Note: `test/unit/common/` directory does NOT currently exist — create it (mirrors the `src/common.ts` source path).

**Directory structure pattern:**

`test/unit/` subdirectories today: `parsers/`, `settings/`, `handlers/`, `watchers/`, `runners/`. Plus top-level tests `common.test.ts`, `findFiles.test.ts`. The **existing `test/unit/common.test.ts`** covers some `common.ts` helpers at the root level, but for Phase 7 the CONTEXT calls out `test/unit/common/getFeaturesRootForFile.test.ts` explicitly — follow that path and create the subdirectory (the Mocha runner auto-discovers `**/*.test.ts`).

**Invocation pattern — direct function call (module-level helper, not an instance method):**

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';
import { getFeaturesRootForFile } from '../../../src/common';
import type { WorkspaceSettings } from '../../../src/settings';

suite('getFeaturesRootForFile (D-09)', () => {

  test('returns the matching root for a file under multi-path', () => {
    const wkspRoot = vscode.Uri.file('/fake/wksp');
    const rootA = vscode.Uri.joinPath(wkspRoot, 'features-a');
    const rootB = vscode.Uri.joinPath(wkspRoot, 'features-b');
    const fakeSettings = { featuresUris: [rootA, rootB] } as unknown as WorkspaceSettings;
    const fileUri = vscode.Uri.joinPath(rootB, 'foo.feature');

    const result = getFeaturesRootForFile(fakeSettings, fileUri);

    assert.ok(result !== undefined);
    assert.strictEqual(result?.toString(), rootB.toString());
  });

  test('returns undefined for file outside any root', () => { /* ... */ });
  test('handles exact-root URI via urisMatch', () => { /* ... */ });
});
```

**Mock-settings cast pattern:** Use `{ featuresUris: [...] } as unknown as WorkspaceSettings` — the helper only touches `.featuresUris`, so a partial object suffices. This mirrors the "duck-typed fake" pattern at `test/unit/settings/verboseLogging.test.ts:70-91`.

---

### `test/unit/parsers/configParser.test.ts` (modify)

**Analog:** self — 8 existing `test(...)` blocks, each asserting on `result.resolvedPath.fsPath`.

**Field-rename migration pattern — per-test assertion update:**

Current at `test/unit/parsers/configParser.test.ts:26-29` (example — same pattern at lines 48-51, 94-97, 104-115, 156-164):

```typescript
assert.ok(
  result.resolvedPath.fsPath.replace(/\\/g, '/').endsWith('behave-ini/features'),
  `resolvedPath ${result.resolvedPath.fsPath} should end with behave-ini/features`
);
```

Target — mechanical rename to indexed plural access:

```typescript
assert.ok(
  result.resolvedPaths[0].fsPath.replace(/\\/g, '/').endsWith('behave-ini/features'),
  `resolvedPaths[0] ${result.resolvedPaths[0].fsPath} should end with behave-ini/features`
);
```

**Length-3 assertion pattern — new, but trivial extension of existing `rawPaths` assertion at line 156-160:**

Current at `test/unit/parsers/configParser.test.ts:148-167` (the `multi-path` suite — the existing 3-path fixture already supports this):

```typescript
suite('findBehaveConfig - multi-path (TEST-04, D-03)', () => {

  test('parses all continuation-line paths into rawPaths but resolves only the first', () => {
    const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'multi-path'));
    const result = findBehaveConfig(wkspUri);
    assert.ok(result, 'should return a result');
    assert.strictEqual(result.ok, true, 'should be ok:true');
    if (!result.ok) return;
    assert.deepStrictEqual(
      result.rawPaths,
      ['features/auth', 'features/checkout', 'features/admin'],
      'rawPaths should contain all 3 paths from continuation lines'
    );
    assert.ok(
      result.resolvedPath.fsPath.replace(/\\/g, '/').endsWith('multi-path/features/auth'),
      `resolvedPath ${result.resolvedPath.fsPath} should resolve only the first path (features/auth)`
    );
  });
});
```

Target — update the suite name (drop the "only the first" narrative), update the single-element assertion to `resolvedPaths[0]`, and ADD a length-3 assertion + assertions for entries [1] and [2] (the existing fixture at `test/unit/parsers/fixtures/config/multi-path/behave.ini` verified to contain all 3 paths):

```typescript
suite('findBehaveConfig - multi-path (TEST-04, MP-02)', () => {

  test('parses all continuation-line paths into rawPaths AND resolves all three', () => {
    const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'multi-path'));
    const result = findBehaveConfig(wkspUri);
    assert.ok(result, 'should return a result');
    assert.strictEqual(result.ok, true, 'should be ok:true');
    if (!result.ok) return;
    assert.deepStrictEqual(
      result.rawPaths,
      ['features/auth', 'features/checkout', 'features/admin'],
      'rawPaths should contain all 3 paths from continuation lines'
    );
    assert.strictEqual(result.resolvedPaths.length, 3, 'resolvedPaths should contain all 3 entries');
    assert.ok(result.resolvedPaths[0].fsPath.replace(/\\/g, '/').endsWith('multi-path/features/auth'));
    assert.ok(result.resolvedPaths[1].fsPath.replace(/\\/g, '/').endsWith('multi-path/features/checkout'));
    assert.ok(result.resolvedPaths[2].fsPath.replace(/\\/g, '/').endsWith('multi-path/features/admin'));
  });
});
```

**Windows normalization assertion pattern — new, fixture-driven using existing INI parse path:**

No existing Windows-backslash fixture in `test/unit/parsers/fixtures/config/`. Two valid mitigations (see RESEARCH.md §Wave 0 Gaps — fixture list shows none needed beyond existing; inline approach preferred):

**Option A (inline input) — preferred for parser-layer test:** bypass the INI parse and call the parser with rawPaths directly if the internal `resolvePaths` is testable. BUT — `resolvePaths` is NOT exported (line 158 `function resolvePaths`, not `export function`). So testing must go through the full `findBehaveConfig → parseIniConfig → buildResult → resolvePaths` path.

**Option B (new fixture):** create `test/unit/parsers/fixtures/config/windows-backslash/behave.ini` containing:

```ini
[behave]
paths = features\alt
    features\sub\deep
```

and assert:

```typescript
test('Windows backslash paths normalized to forward slashes', () => {
  const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'windows-backslash'));
  const result = findBehaveConfig(wkspUri);
  assert.ok(result);
  assert.strictEqual(result.ok, true);
  if (!result.ok) return;
  // Raw paths preserved as-written (backslashes visible in rawPaths)
  assert.deepStrictEqual(result.rawPaths, ['features\\alt', 'features\\sub\\deep']);
  // Resolved paths have normalized forward slashes in the URI path component
  assert.ok(result.resolvedPaths[0].path.endsWith('/features/alt'));
  assert.ok(result.resolvedPaths[1].path.endsWith('/features/sub/deep'));
});
```

**Recommendation:** Option B — one new fixture directory following the existing naming convention (`behave-ini`, `multi-path`, etc.). File is trivial (2 lines of INI). Matches the other fixture-driven tests in the suite.

---

## Shared Patterns

### Pattern: URI equality (canonical)
**Source:** `src/common.ts:89-94`
**Apply to:** `isFileInFeatures` implementation in `settings.ts`; `getFeaturesRootForFile` implementation in `common.ts`; any test assertion comparing URIs for equality.

```typescript
// src/common.ts:89-94
export function uriId(uri: vscode.Uri) {
  return uri.toString();
}
export function urisMatch(uri1: vscode.Uri, uri2: vscode.Uri) {
  return uri1.toString() === uri2.toString();
}
```

**Critical:** Never compare URIs via `===`, `.path`, or `.fsPath` directly (Windows drive-letter casing inconsistency — documented at `src/common.ts:82-88`). Both `isFileInFeatures` and `getFeaturesRootForFile` must use `urisMatch` for the exact-root case.

### Pattern: Path-containment with prefix guard (Pitfall 3 prevention)
**Source:** RESEARCH.md §Don't Hand-Roll (net-new idiom derived from AI_INSTRUCTIONS.md)
**Apply to:** `isFileInFeatures` in `settings.ts`; `getFeaturesRootForFile` in `common.ts`.

```typescript
// Canonical shape — the "+ '/'" guard prevents /features matching /featuresA
fu => uri.path.startsWith(fu.path + '/') || urisMatch(fu, uri)
```

### Pattern: Fail-fast `get<T>` for package.json-declared settings
**Source:** `src/settings.ts:104-132` (10+ examples)
**Apply to:** Every existing key read in the `WorkspaceSettings` constructor — UNCHANGED in Phase 7.

```typescript
const envVarOverridesCfg: { [name: string]: string } | undefined = get("envVarOverrides");
if (envVarOverridesCfg === undefined)
  throw "envVarOverrides is undefined";
```

**Explicit exception (D-12):** `featuresPaths` — because package.json does NOT declare it in Phase 7 — reads without the fail-fast throw:

```typescript
const featuresPathsCfg: string[] | undefined = get<string[] | undefined>("featuresPaths");
// NO throw on undefined — VS Code returns undefined for undeclared keys
```

### Pattern: Slash-strip + trim for user-supplied paths
**Source:** `src/settings.ts:143, 154` (applied twice in v1.1)
**Apply to:** Every per-entry of `featuresPaths` in the new precedence ladder.

```typescript
// src/settings.ts:143
this.workspaceRelativeProjectPath = projectPathCfg.replace(/^\\|^\//, "").replace(/\\$|\/$/, "").trim();

// src/settings.ts:154
this.projectRelativeFeaturesPath = featuresPathCfg.replace(/^\\|^\//, "").replace(/\\$|\/$/, "").trim();
```

Apply per entry in the plural rung:

```typescript
projectRelativeFeaturesPaths = featuresPathsCfg
  .map(p => p.replace(/^\\|^\//, "").replace(/\\$|\/$/, "").trim())
  .filter(p => p.length > 0);
```

### Pattern: Fatal-error accumulation + single-throw in `logSettings`
**Source:** `src/settings.ts:147, 160, 166, 293-297`
**Apply to:** D-06 per-entry existence check + D-07 per-entry `"."` rejection.

```typescript
// src/settings.ts:293-297 — single throw site at end of constructor
if (this._fatalErrors.length > 0) {
  throw new WkspError(`\nFATAL error due to invalid workspace setting in workspace "${this.name}". Extension cannot continue. ` +
    `${this._fatalErrors.join("\n")}\n` +
    `NOTE: fatal errors may require you to restart vscode after correcting the problem.) `, this.uri);
}
```

Phase 7 loops push per-entry errors into `this._fatalErrors`, then the existing `logSettings` throw catches them all at once.

### Pattern: Helper functions return undefined (not throw) for no-match
**Source:** `src/common.ts:326-334` (`getWorkspaceUriForFile`), `src/common.ts:340-345` (`getWorkspaceSettingsForFile`), `src/common.ts:505` (`findSubdirectorySync` returns `null`)
**Apply to:** `getFeaturesRootForFile` in `common.ts`.

Per AI_INSTRUCTIONS.md §Exception Handling: helpers throw only when the operation must fail-fast. `getFeaturesRootForFile` is a pure lookup — returns `undefined`.

### Pattern: `makeConfig` test helper for `vscode.WorkspaceConfiguration` mocking
**Source:** `test/unit/settings/discoveryPriority.test.ts:13-27`, also copied into `test/unit/settings/discoverySource.test.ts:11-24`, `test/unit/settings/verboseLogging.test.ts:14-27`
**Apply to:** All three new test files.

Copy the helper verbatim. It exposes both the `get` method (returns `values[key]`) and the `inspect` method (with `explicitKeys` distinguishing workspace-set from unset). This is the canonical test-injection surface for `WorkspaceSettings`-like construction.

### Pattern: Sinon stub + teardown for per-test module overrides
**Source:** `test/unit/settings/verboseLogging.test.ts:93-104` (stubs `commonModule.getUrisOfWkspFoldersWithFeatures` and `configModule.config.extensionTempFilesUri`)

```typescript
// test/unit/settings/verboseLogging.test.ts:95-104
setup(() => {
  getUrisStub = sinon.stub(commonModule, 'getUrisOfWkspFoldersWithFeatures').returns([mockUri]);
  sinon.stub(configModule.config, 'extensionTempFilesUri').value(vscode.Uri.file('/tmp/gs-behave-bdd'));
});

teardown(() => {
  sinon.restore();
});
```

**Apply to:** `multiPathPrecedence.test.ts` for `fs.existsSync` stubbing (new extension of this pattern — stub module `fs` instead of project-local module). Pattern is the `setup()`/`teardown()` pair with `sinon.restore()` guaranteeing cleanup.

### Pattern: `.replaceAll('\\', '/')` for Windows-to-POSIX separator normalization
**Source:** `src/runners/runOrDebug.ts:28-29, 196` (only existing `\` → `/` normalization in production source)

```typescript
// src/runners/runOrDebug.ts:28-29
const normalizedPath = workspaceRelativePath.replaceAll("\\", "/");
const normalizedProjectPath = projectPath.replaceAll("\\", "/").replace(/\/$/, "");
```

**Apply to:** `normalizeSeparators` private helper in `configParser.ts` (D-10).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/settings.ts` — `get featuresUri()` accessor | config | request-response | No existing `get` accessor pattern on any class in `src/**`. `WindowSettings` uses readonly fields. Phase 7 introduces the `get`-accessor idiom as net-new (RESEARCH.md §Singular Getter Implementation Pattern documents the justification). **Safety net:** TypeScript `TS2564` "has no initializer" error catches the constructor-ordering bug at compile time. |
| `test/unit/settings/multiPathPrecedence.test.ts` — direct `new WorkspaceSettings(...)` construction | test | request-response | No existing unit test directly constructs `WorkspaceSettings` (verified via `grep "new WorkspaceSettings" test/unit/` — zero matches). `verboseLogging.test.ts` calls methods via `.prototype.<method>.call()` on a fake object. Phase 7's precedence tests are the first to invoke the constructor directly. **Mitigation:** shape is documented at `src/settings.ts:89` — six args, all injectable via existing patterns. |
| `fs.existsSync` sinon stub | test setup | test-double | No existing `sinon.stub(fs, 'existsSync')` in `test/unit/`. Closest precedent is `sinon.stub(fs.promises, 'readFile')` at `test/unit/parsers/benchmarkInstrumentation.test.ts:54`. Phase 7 extends the pattern with a different `fs` method. |
| `test/unit/common/` directory | test | request-response | Directory does NOT currently exist — only `test/unit/common.test.ts` at the top level. Phase 7 creates the subdirectory for `getFeaturesRootForFile.test.ts`. Mocha runner auto-discovers `**/*.test.ts` so no config change needed. |

---

## Metadata

**Analog search scope:**
- `src/parsers/configParser.ts`, `src/common.ts`, `src/settings.ts`, `src/testWorkspaceConfig.ts` — all four target files read end-to-end
- `src/runners/runOrDebug.ts:20-35, 190-200` — Windows normalization precedent
- `src/handlers/autoCompleteProvider.ts:58` — backslash-handling edge case (not applicable)
- `src/extension.ts:70-100` — DiscoveryEntry consumer call sites
- `test/unit/settings/*.test.ts` (6 files) — makeConfig helper + WorkspaceSettings construction patterns
- `test/unit/parsers/configParser.test.ts` (full file) — suite shape for parser tests
- `test/unit/parsers/fixtures/config/` — fixture naming/layout convention
- `grep -r "sinon.stub"` across `test/unit/` — 16 files using sinon

**Files scanned:** ~20 files read, 3 full directories indexed via Glob/Bash
**Pattern extraction date:** 2026-04-17
**Pattern map confidence:** HIGH — 6 of 8 target files have exact same-file analogs; 2 have role-match analogs; 4 "net-new" idioms clearly called out with nearest precedents.
