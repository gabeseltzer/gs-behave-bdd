# Domain Pitfalls: VS Code Extension Auto-Discovery with Multi-Path Support

**Domain:** VS Code extension — config file discovery, INI/TOML parsing, single-to-array refactor
**Researched:** 2026-04-15
**Codebase verified:** Yes — findings cross-referenced against actual source in `src/`

---

## Critical Pitfalls

Mistakes that cause silent data loss, broken backward compat, or performance regressions.

---

### Pitfall 1: `featuresUri` Is a Collection Key — Not Just a Path

**What goes wrong:** Every module-level store in the extension (`featureFileSteps`, `featureTags`, `stepFileSteps`, `stepMappings`) uses `uriId(featuresUri)` as a key prefix for filtering, deletion, and lookup. Changing `featuresUri` to `featuresUris[]` without updating _every_ store operation causes silent data leakage — old entries remain in the maps under the old key, new entries accumulate under a new key, and stale data is never purged.

**Why it happens:** There are 108 occurrences of `featuresUri` across `src/`. The pattern is that `featuresUri` (a single `vscode.Uri`) is used as the "workspace bucket" identifier for all parsed data. When multiple paths exist, there is no single canonical URI to use as the bucket key. Developers often update the struct definition (`featuresUri → featuresUris`) but miss updating the store filter/delete functions.

**Consequences:**
- Step mappings from a removed path survive in `stepMappings[]`, causing phantom step completions
- Deleting and rebuilding step data for path A when path B changes — or rebuilding all when only one changed
- `deleteFeatureFileSteps` / `deleteStepFileSteps` / `deleteStepMappings` all take a single `featuresUri`; calling them per-item in a loop with the wrong URI silently no-ops

**Prevention:**
- Decide on the keying strategy before writing any code: either keep `featuresUri` as a store key (the "primary path" concept) OR change stores to key by workspace URI instead. The path of least resistance is: keep stores keyed by workspace URI (`wkspUri`), not features URI, since a workspace can now have multiple feature paths.
- After any store function change, write a unit test that adds entries for path A and path B, then deletes only path A, and asserts path B entries survive.

**Warning signs:** Any test that calls `deleteFeatureFileSteps` or `deleteStepMappings` and then checks the count of remaining entries.

**Phase:** Implementation of `featuresUris[]` refactor in `fileParser.ts`, `featureParser.ts`, `stepsParser.ts`, `stepMappings.ts`.

---

### Pitfall 2: INI `paths=` Is Newline-Split, Not Line-Split With Blank-Line Termination

**What goes wrong:** Python's `configparser` with default settings (`empty_lines_in_values=True`) treats indented lines after an option as continuations. Behave calls `splitlines()` on the result and strips each part. This means:

```ini
[behave]
paths = features/web
        features/api
```

…parses as TWO paths: `["features/web", "features/api"]`. But:

```ini
[behave]
paths = features/web

        features/api
```

…with an empty line between, `configparser` still sees one multiline value (blank line preserved), and `splitlines()` + `strip()` produces `["features/web", "", "features/api"]`. The empty string element is a valid-looking-but-wrong path.

**Why it happens:** TypeScript INI parsers (like `ini` npm package) do NOT implement Python's multiline-value-via-indentation semantics. A naive line-by-line split would produce wrong results for indented continuations.

**Consequences:** Extension misses paths (single-path result when multi-path expected), or passes empty strings to `vscode.Uri.joinPath`, producing a path that looks valid but resolves to the project root.

**Prevention:**
- Implement the INI parser to match Python `configparser` behavior exactly: collect all continuation lines (those that begin with whitespace after the first line), join them, then `splitlines()` + `trim()` each part, then filter out empty strings.
- Test with: single path, multiple indented paths, blank line within multiline value, comment-only lines in the value block, Windows `\r\n` line endings.
- Always filter out empty strings after splitting.

**Warning signs:** A `paths=` value that, after parsing, is an array of length 1 when the config file has two indented entries.

**Phase:** Config file parser implementation.

---

### Pitfall 3: Windows Backslash Paths in Config Files Break `vscode.Uri.joinPath`

**What goes wrong:** On Windows, users sometimes write config file paths with backslashes:

```ini
[behave]
paths = features\web
        features\api
```

`vscode.Uri.joinPath` takes path segments assuming forward slashes. `vscode.Uri.file(backslashPath)` normalizes correctly on Windows but `vscode.Uri.joinPath(base, "features\\web")` does NOT — the backslash becomes a literal character in the URI path, producing a URI that points nowhere.

**Why it happens:** VS Code URIs use forward slashes internally regardless of OS. The extension already normalizes user settings strings (`replace(/^\\|^\//,'')`) in `WorkspaceSettings`, but a new config-file parser path needs the same treatment.

**Consequences:** `fs.existsSync(uri.fsPath)` returns false for a valid path, causing "features path not found" errors only on Windows.

**Prevention:**
- After parsing any path string from an INI or TOML file, normalize backslashes to forward slashes before constructing a `vscode.Uri`: `p.replace(/\\/g, '/')`.
- Also strip leading `/` or `\` characters (behave resolves paths relative to config dir, so absolute paths from `os.path.normpath` would include the drive letter on Windows — handle that case too by checking `path.isAbsolute()` and using `vscode.Uri.file()` instead of `joinPath`).
- Test on Windows with backslash paths in a real `behave.ini`.

**Warning signs:** "Features path not found" errors that only appear in Windows CI runs but not Linux/macOS.

**Phase:** Config file parser and path resolution.

---

### Pitfall 4: `getUrisOfWkspFoldersWithFeatures` Subdirectory Scan Violates < 1ms Constraint

**What goes wrong:** The current `hasFeaturesFolder` function in `common.ts` is fast because it only calls `fs.existsSync` for two specific paths (projectUri and featuresUri). Adding a subdirectory scan (up to depth 3) inside this function to find `behave.ini` / `.behaverc` would call `fs.readdirSync` recursively — on a large monorepo this easily takes 100ms+, spiking to seconds on cold filesystem cache.

**Why it happens:** The `< 1ms` constraint exists because `getUrisOfWkspFoldersWithFeatures` is called from hot code paths (watchers, event handlers, diagnostics). The existing function measures its own duration and logs it with `diagLog`. Synchronous directory traversal inside a loop over all workspace folders violates this.

**Consequences:** Extension host becomes unresponsive during workspace load; VS Code may kill the extension host process entirely on large workspaces.

**Prevention:**
- The subdirectory scan for config files MUST happen exactly once per workspace per session, outside `getUrisOfWkspFoldersWithFeatures`, in an async context (e.g., during workspace activation or on explicit refresh).
- `getUrisOfWkspFoldersWithFeatures` should only read from the pre-populated discovery cache — never do filesystem work.
- The cache must be populated before `getUrisOfWkspFoldersWithFeatures` is first called in non-`forceRefresh` mode; activation ordering matters.
- For the scan itself: use `vwfs.readDirectory` (async VS Code FS API) rather than `fs.readdirSync` to avoid blocking. Apply `DEFAULT_EXCLUDE_DIRS` to skip `.git`, `node_modules`, `.venv`, etc. (already defined in `common.ts`).

**Warning signs:** `perf info: getUrisOfWkspFoldersWithFeatures took X ms` log entries showing X > 5ms after this change is introduced.

**Phase:** Discovery caching architecture — must be designed before implementing the scan.

---

### Pitfall 5: Backward Compat — `inspect()` Must Check All Three Scopes

**What goes wrong:** The existing `getWithLegacyFallback` already checks all three `inspect()` scopes (`globalValue`, `workspaceValue`, `workspaceFolderValue`). Any new "is this setting explicitly set?" check that only looks at `workspaceFolderValue` will silently break users who set `projectPath` / `featuresPath` at global or workspace scope (not folder scope).

**Why it happens:** VS Code has a known quirk (issue #34386): in a single-folder workspace, `workspaceValue` and `workspaceFolderValue` are both populated even when only one level of setting exists. Developers testing locally in single-folder workspaces may only test `workspaceFolderValue` and ship code that breaks multi-root workspace users.

**Consequences:** A user with `featuresPath = "src/features"` in their global `settings.json` sees auto-discovery override their explicit setting — the exact backward compat guarantee that must hold.

**Prevention:**
- Mirror the exact `inspect()` pattern from `getWithLegacyFallback`: `isExplicit = insp.globalValue !== undefined || insp.workspaceValue !== undefined || insp.workspaceFolderValue !== undefined`.
- Test backward compat with settings at all three scopes in integration tests — not just folder-level settings.
- The priority chain must be: explicit settings (any scope) > config file > convention. Never let config file discovery override an explicit setting.

**Warning signs:** Integration tests that only set settings at `workspaceFolderValue` level passing, while users with global-level settings report auto-discovery overriding their configuration.

**Phase:** `WorkspaceSettings` constructor update and priority logic.

---

## Moderate Pitfalls

---

### Pitfall 6: TOML `paths` Must Be a Native Array — Type Mismatch Is a Hard Error

**What goes wrong:** Behave's own TOML parser (`read_toml_config`) raises `ConfigParamTypeError` if `paths` is not a list. A user might write:

```toml
[tool.behave]
paths = "features"   # string, not array
```

`smol-toml` will parse this successfully and return a `string`, not `string[]`. Calling `.map()` or iterating over a string character-by-character produces garbage paths (`["f", "e", "a", "t", "u", "r", "e", "s"]`).

**Prevention:**
- After reading `paths` from TOML, always assert `Array.isArray(paths)`.
- If it is a string, either throw a parse error (matching behave's behavior) or wrap it in an array as a lenient fallback and log a warning.
- Write a unit test with `paths = "features"` (string) confirming the fallback/error path is exercised.

**Phase:** TOML parser implementation.

---

### Pitfall 7: Config File Not in Root — Path Resolution Is Relative to Config Dir, Not Workspace Root

**What goes wrong:** Behave resolves `paths=` values relative to the directory containing the config file (`config_dir = os.path.dirname(path)`). If the config file is in a subdirectory (e.g., `backend/behave.ini` with `paths = features`), the resolved path is `backend/features`, not `features`.

The extension's subdirectory scan will find `backend/behave.ini`. If path resolution uses the workspace root instead of the config file's directory, `vscode.Uri.joinPath(wkspUri, "features")` produces the wrong path.

**Prevention:**
- Always resolve `paths=` entries relative to the URI of the config file itself: `vscode.Uri.joinPath(configFileUri, '..', pathEntry)`.
- The discovered `configFileUri` must be stored in `WorkspaceSettings` (`discoverySource: "config-file"`, `configFileUri`) so path resolution uses the correct base.
- Write an integration test where `behave.ini` is in a subdirectory.

**Phase:** Path resolution in config parser; `WorkspaceSettings` construction.

---

### Pitfall 8: File Watcher Pattern Needs One Pattern Per Feature Path

**What goes wrong:** `workspaceWatcher.ts` creates a `RelativePattern` using `wkspSettings.workspaceRelativeFeaturesPath` — a single string. With multiple feature paths, only a single watcher is created, missing changes to the other paths.

VS Code's `FileSystemWatcher` does not accept an array of patterns in a single call; separate watchers must be created per path and all returned in the watchers array (which is already array-typed).

**Prevention:**
- Iterate over `wkspSettings.featuresUris` and create one `vscode.workspace.createFileSystemWatcher` per path.
- Ensure all watchers are pushed into the returned array so they can be properly disposed by the extension deactivation handler.
- The `workspaceRelativeFeaturesPath` property (used by other code) needs to become a multi-value concept or be replaced by an array. The existing convenience getter `featuresUri` (returning `featuresUris[0]`) doesn't help the watcher case.

**Warning signs:** File changes to the second feature path not triggering test tree updates.

**Phase:** `workspaceWatcher.ts` update.

---

### Pitfall 9: `setup.cfg` and `tox.ini` Are Shared Config Files — Section Absent Is Not an Error

**What goes wrong:** `setup.cfg` and `tox.ini` are generic Python project files that often do NOT contain a `[behave]` section. The config discovery scan will find these files in many Python projects that don't use behave at all (e.g., projects using pytest). Treating their absence of a `[behave]` section as an error — or even as a signal that behave is configured — is wrong.

**Prevention:**
- For `setup.cfg` / `tox.ini`: only proceed if the `[behave]` section is present. If the section is absent, treat the file as if it wasn't found and continue scanning for the next candidate.
- Never show a parse error notification for a missing `[behave]` section in `setup.cfg` — this is expected and normal.
- Mirror behave's priority: `behave.ini` > `.behaverc` > `setup.cfg` > `tox.ini` > `pyproject.toml`. Stop at the first file that yields config (matches behave's `load_configuration` which calls `defaults.update(...)` in reverse order, but the first match wins in practice when using a single config file).

**Warning signs:** Users with pytest-only projects seeing unexpected extension activation or discovery attempts.

**Phase:** Config file scanner and parser.

---

### Pitfall 10: smol-toml Throws on DoS-Vector Input; Must Be Wrapped in Try/Catch

**What goes wrong:** smol-toml has two known DoS advisories: deeply nested inline tables (pre-1.3.1) and thousands of consecutive commented lines (separate advisory). Even with a patched version, throwing an uncaught error from the TOML parser inside the extension host can crash the extension.

**Prevention:**
- Always wrap `parse(tomlContent)` in a `try/catch`. On parse error: show a warning notification (matching the requirement "Config parse errors shown as warning notification"), log the error, and fall back to convention-based discovery.
- Pin `smol-toml` to a version >= 1.3.1 which includes the DoS depth limit.
- Unit test the error path with deliberately malformed TOML (truncated, invalid key-value, etc.).

**Warning signs:** Extension crash (extension host exited) when opening a workspace with a malformed `pyproject.toml`.

**Phase:** TOML parser error handling.

---

## Minor Pitfalls

---

### Pitfall 11: Windows Drive Letter Case Inconsistency in URI-Based Keys

**What goes wrong:** The extension already documents this in `common.ts` comments: `uri.path` and `uri.fsPath` give inconsistent drive letter casing (`C:` vs `c:`) on Windows depending on how the URI was constructed. New code that constructs URIs from INI/TOML path strings (e.g., via `vscode.Uri.file(absolutePath)`) may produce keys that don't match workspace folder URIs constructed by VS Code's API.

**Prevention:**
- All URI comparisons must go through `uriId(uri)` (which calls `uri.toString()` for consistent encoding) or `urisMatch(uri1, uri2)` — both already exist in `common.ts`.
- Never compare `uri.fsPath === otherUri.fsPath` directly. Never compare `uri.path === otherUri.path` directly.
- When constructing a `vscode.Uri` from a parsed config path on Windows, use `vscode.Uri.file(normalizedPath)` then compare via `uriId()`.

**Phase:** Throughout — any new URI construction.

---

### Pitfall 12: Empty `paths=` in Config File Should Fall Through to Convention

**What goes wrong:** A config file may contain `paths =` with no value (user deleted the paths, relying on defaults). Behave itself treats an empty/missing paths list as "use the `features/` directory by default." The extension must replicate this fallback, not treat an empty array as "no feature paths found."

**Prevention:**
- After parsing `paths`, if the result is an empty array (or all entries resolve to non-existent directories), fall through to the `features/` convention check.
- `discoverySource` should reflect which path actually provided usable data.

**Phase:** Priority fallback logic in discovery.

---

### Pitfall 13: Activation Events Cover Only Two Config Files

**What goes wrong:** The PROJECT.md decision is to activate only on `workspaceContains:**/behave.ini` and `workspaceContains:**/.behaverc`, not on `pyproject.toml` / `setup.cfg` / `tox.ini`. This means a project with only a `pyproject.toml` config (and no `*.feature` file at the workspace root level that triggers `workspaceContains:**/*.feature`) will NOT activate the extension automatically.

This is a documented conscious decision — NOT a bug in the discovery logic. However, it must be consistently applied: the discovery scan must still support all five file types once the extension IS activated, even if activation itself only covers two.

**Prevention:**
- Do not conflate "activation triggers" with "config files to scan." Once activated (by any trigger), scan for all five config file types.
- Document this limitation clearly in logs: if only a `pyproject.toml` is found and no `behave.ini`/`.behaverc`, log that the extension was already activated by a `*.feature` file trigger.

**Phase:** Discovery scanner (not activation manifest changes).

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Collection store refactor (`featureParser`, `stepsParser`, `stepMappings`) | Pitfall 1: stale keys after featuresUri→featuresUris | Decide key strategy first; add deletion unit tests before refactoring store functions |
| INI parser implementation | Pitfall 2: multiline continuation semantics | Implement Python configparser indentation rules; filter empty strings |
| Path resolution | Pitfall 3 + 7: backslash normalization, relative-to-config-dir | Normalize all path strings; resolve relative to `configFileUri/../` not workspace root |
| Gatekeeper performance | Pitfall 4: scan inside hot function | Cache must be pre-populated; gatekeeper reads cache only |
| Backward compat check | Pitfall 5: inspect() scope completeness | Mirror `getWithLegacyFallback` exactly; test all three scopes |
| TOML parser | Pitfall 6 + 10: string-not-array, uncaught parse error | Assert `Array.isArray`; wrap in try/catch; pin smol-toml >= 1.3.1 |
| File watcher update | Pitfall 8: single watcher for multiple paths | One watcher per featuresUri; all added to returned array |
| Config file scanner | Pitfall 9: setup.cfg/tox.ini without [behave] | Skip gracefully if section absent; never error on missing section |
| URI construction in new code | Pitfall 11: drive letter case | Use `uriId()`/`urisMatch()` exclusively; never compare `.fsPath` or `.path` directly |
| Discovery fallback logic | Pitfall 12: empty paths array | Treat empty parsed paths as "fall through to convention" |

---

## Sources

- Behave source code: `bundled/libs/behave/configuration.py` (verified line-by-line for `read_configparser`, `read_toml_config`, `format_outfiles_coupling`, `config_filenames`)
- Extension source: `src/common.ts`, `src/settings.ts`, `src/parsers/featureParser.ts`, `src/parsers/stepsParser.ts`, `src/parsers/stepMappings.ts`, `src/watchers/workspaceWatcher.ts`, `src/parsers/fileParser.ts`
- smol-toml advisories: GHSA-pqhp-25j4-6hq9 (deeply nested tables), GHSA-v3rj-xjv7-4jmq (commented lines DoS)
- VS Code issue #34386: `workspaceValue` and `workspaceFolderValue` both set in single-folder workspace
- Python configparser docs: `empty_lines_in_values` behavior for multiline option continuation
- VS Code Extension Host docs: synchronous operations blocking the extension host
