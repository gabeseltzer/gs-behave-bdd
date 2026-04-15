# Phase 01: Config Parsing - Research

**Researched:** 2026-04-15
**Domain:** TypeScript INI/TOML parsing, VS Code URI handling, Mocha unit test patterns
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** The config parser exports a structured `BehaveConfigResult` interface: `{ configFileUri: vscode.Uri, format: 'ini' | 'toml', rawPaths: string[], resolvedPath: vscode.Uri }`. Returns `undefined` when no config is found or config has no `[behave]`/`[tool.behave]` section.
- **D-02:** The structured result provides everything Phase 2 needs (`configFileUri` maps to INTG-06's `configFileUri`, `format` informs `discoverySource`) without re-reading the config file.
- **D-03:** Parse ALL paths from the config into `rawPaths[]`, but resolve only `rawPaths[0]` as `resolvedPath`. No warning or log about extra paths — this is a clean v2 upgrade path since the data is already captured.
- **D-04:** v1 single-path constraint (from project decisions) is enforced at the return type level, not the parse level.
- **D-05:** Tests use real config files on disk in `test/unit/parsers/fixtures/config/`. This exercises the full read-from-disk path and matches the existing fixtures pattern in the test suite.
- **D-06:** Fixture files include: standard configs for all 5 formats, malformed INI, INI without `[behave]` section, multi-path config, and TOML without `[tool.behave]` table.
- **D-07:** Single `src/parsers/configParser.ts` file with `findBehaveConfig()` as the exported entry point and internal helpers (`parseIniConfig`, `parseTomlConfig`, `resolvePaths`, `searchConfigFiles`).
- **D-08:** Single corresponding test file: `test/unit/parsers/configParser.test.ts`.
- **D-09:** Matches existing parser module pattern (featureParser.ts, stepsParser.ts are each single files).

### Claude's Discretion

- Internal function signatures and helper decomposition within configParser.ts
- Exact regex patterns for INI continuation-line parsing (must match Python configparser behavior per DISC-02)
- Error handling internals (return undefined for missing/invalid configs — Phase 3 adds UX)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DISC-01 | Extension reads `behave.ini`, `.behaverc`, `setup.cfg`, `tox.ini`, `pyproject.toml` from workspace root | `searchConfigFiles` iterates these five filenames via `fs.existsSync()` on `vscode.Uri.joinPath(wkspUri, filename).fsPath` |
| DISC-02 | INI files parsed for `[behave]` section `paths` key with Python configparser continuation-line semantics | Hand-rolled INI parser: split on `\n`, filter lines under `[behave]`, collect `paths=` value + indented continuation lines |
| DISC-03 | TOML files parsed for `[tool.behave]` table `paths` key as native array | `smol-toml` v1.6.0 `parse()` → access `result?.tool?.behave?.paths` |
| DISC-04 | Parsed paths resolved relative to config file directory | `vscode.Uri.joinPath(configFileUri, '..', rawPath)` for relative paths; absolute paths used as-is via `vscode.Uri.file()` |
| DISC-05 | Config file search follows behave's priority order (`behave.ini` > `.behaverc` > `setup.cfg` > `tox.ini` > `pyproject.toml`) | `searchConfigFiles` returns first found file in priority-ordered array |
| DISC-06 | Config files without `[behave]` / `[tool.behave]` section silently skipped | Parsers return `undefined` when section absent; `searchConfigFiles` continues to next candidate |
| TEST-01 | Unit tests for all 5 config file formats (INI + TOML) | Five fixture files; one test per format in `configParser.test.ts` |
| TEST-03 | Unit tests for path resolution relative to config directory | Fixtures with relative paths; assertions compare resolved URI against expected absolute URI |
| TEST-04 | Unit tests for edge cases (malformed files, missing sections, empty paths) | Fixture files for: malformed INI, no `[behave]` section, no `[tool.behave]` table, empty paths value |

</phase_requirements>

---

## Summary

Phase 1 delivers a standalone TypeScript module (`src/parsers/configParser.ts`) that reads any of behave's five config file formats and returns a resolved feature path as a `BehaveConfigResult`. The module has no dependencies on VS Code's workspace API beyond URI construction — it receives a workspace root `vscode.Uri` and returns a result or `undefined`.

The two parsing sub-problems have clearly different solutions. TOML parsing uses `smol-toml` v1.6.0, which is already installed and has a CJS entry point (`dist/index.cjs`) that webpack bundles correctly. INI/CFG parsing must be hand-rolled because Python's `configparser` continuation-line semantics (indent = continuation, not new key) are not replicated by any suitable npm package. The hand-rolled parser is a ~30-line line-by-line state machine.

Path resolution follows behave's own logic exactly: `os.path.normpath(os.path.join(config_dir, p))`, translated to `vscode.Uri.joinPath(configDirUri, rawPath)` for relative paths. Absolute paths are passed through directly via `vscode.Uri.file(rawPath)`.

**Primary recommendation:** Write `configParser.ts` as a pure function module (no module-level state, no caching — that's Phase 2's job). Use `fs.existsSync` + `fs.readFileSync` for file I/O, matching the existing pattern in `src/common.ts` and `src/settings.ts`. Use `vscode.Uri.joinPath()` for all path operations.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Config file discovery (filesystem scan) | Parser layer | — | Pure file I/O, no workspace API needed beyond URI construction |
| INI/TOML parsing | Parser layer | — | Stateless text processing; no VS Code API involvement |
| Path resolution | Parser layer | — | `vscode.Uri.joinPath` is available in unit tests via the existing mock |
| Priority ordering | Parser layer | — | Internal implementation detail of `searchConfigFiles` |
| Caching / integration with `getUrisOfWkspFoldersWithFeatures` | Integration layer (Phase 2) | — | Out of scope for Phase 1 |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `smol-toml` | 1.6.0 | Parse `pyproject.toml` | Already installed; CJS-compatible; ~5KB; correct TOML 1.0 spec compliance [VERIFIED: node_modules/smol-toml/package.json] |
| `fs` (Node built-in) | — | Read config files from disk | Used throughout `src/` for synchronous file I/O [VERIFIED: src/common.ts, src/settings.ts] |
| `vscode.Uri` | API 1.82+ | URI construction and path joining | Required by project conventions (AI_INSTRUCTIONS.md: never use `path.join` for URI construction) [VERIFIED: AI_INSTRUCTIONS.md] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `path` (Node built-in) | — | `path.dirname(uri.fsPath)` in tests only | Only in test code when computing absolute fixture paths; avoid in `src/` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled INI parser | `ini` npm package | `ini` does not handle configparser continuation lines (indented values as multi-line continuation); would produce wrong results for multi-path `paths=` values [ASSUMED — based on configparser spec] |
| `smol-toml` | Native `JSON.parse(JSON.dumps(tomllib.load(...)))` (Python approach) | This is already handled in TypeScript space; no need for a Python subprocess |

**Installation:** No installation needed — `smol-toml` is already in `node_modules/`. [VERIFIED: node_modules/smol-toml/]

---

## Architecture Patterns

### System Architecture Diagram

```
findBehaveConfig(wkspUri)
        │
        ▼
searchConfigFiles(wkspUri)
  ├─ fs.existsSync("behave.ini") ─── found ──► parseIniConfig(configUri) ──► BehaveConfigResult | undefined
  ├─ fs.existsSync(".behaverc")  ─── found ──► parseIniConfig(configUri) ──► BehaveConfigResult | undefined
  ├─ fs.existsSync("setup.cfg")  ─── found ──► parseIniConfig(configUri) ──► BehaveConfigResult | undefined
  ├─ fs.existsSync("tox.ini")    ─── found ──► parseIniConfig(configUri) ──► BehaveConfigResult | undefined
  └─ fs.existsSync("pyproject.toml") ─ found ─► parseTomlConfig(configUri) ─► BehaveConfigResult | undefined
        │ (first file that yields a non-undefined result wins)
        ▼
  resolvePaths(rawPaths, configDirUri)
        │
        ▼
  BehaveConfigResult { configFileUri, format, rawPaths, resolvedPath }
        OR undefined (no config, or config has no [behave] section)
```

### Recommended Project Structure

```
src/
└── parsers/
    └── configParser.ts      # New file: findBehaveConfig() + internal helpers

test/
└── unit/
    └── parsers/
        ├── configParser.test.ts           # New test file
        └── fixtures/
            └── config/                    # New fixture directory
                ├── behave-ini/
                │   └── behave.ini
                ├── behaverc/
                │   └── .behaverc
                ├── setup-cfg/
                │   └── setup.cfg
                ├── tox-ini/
                │   └── tox.ini
                ├── pyproject-toml/
                │   └── pyproject.toml
                ├── no-behave-section/
                │   └── behave.ini         # has [other] but no [behave]
                ├── malformed-ini/
                │   └── behave.ini         # invalid INI syntax
                ├── no-tool-behave/
                │   └── pyproject.toml     # has [tool] but no [tool.behave]
                └── multi-path/
                    └── behave.ini         # paths= with 2+ entries
```

### Pattern 1: Config File Search (Priority Order)

**What:** Iterate the five filenames in priority order, return the first that exists AND yields a non-undefined parse result. This matches behave's `config_filenames()` behavior scoped to workspace root only.

**When to use:** Called once per `findBehaveConfig()` invocation. No caching at this layer (Phase 2 adds cache).

```typescript
// Source: bundled/libs/behave/configuration.py config_filenames() + read_configuration()
const CONFIG_FILES: Array<{ filename: string; format: 'ini' | 'toml' }> = [
  { filename: 'behave.ini',      format: 'ini'  },
  { filename: '.behaverc',       format: 'ini'  },
  { filename: 'setup.cfg',       format: 'ini'  },
  { filename: 'tox.ini',         format: 'ini'  },
  { filename: 'pyproject.toml',  format: 'toml' },
];

function searchConfigFiles(wkspUri: vscode.Uri): BehaveConfigResult | undefined {
  for (const { filename, format } of CONFIG_FILES) {
    const fileUri = vscode.Uri.joinPath(wkspUri, filename);
    if (!fs.existsSync(fileUri.fsPath)) continue;
    const result = format === 'ini'
      ? parseIniConfig(fileUri)
      : parseTomlConfig(fileUri);
    if (result !== undefined) return result;
  }
  return undefined;
}
```

### Pattern 2: INI Parser (Continuation-Line Semantics)

**What:** Behave uses Python's `configparser` with `action="append"` for `paths`. The parser calls `config.get("behave", "paths").splitlines()` and strips each part. In an INI file, continuation lines are any lines that are indented under the key. The hand-rolled parser must replicate this.

**Critical detail from behave source** (`configuration.py` line 582):
```python
value_parts = config.get("behave", dest).splitlines()
this_config[param_name] = [value_type(part.strip()) for part in value_parts]
```
This means the raw string value (which spans multiple lines via indentation) is split on newlines, then each part is stripped. Empty strings after strip are discarded.

```typescript
// Source: bundled/libs/behave/configuration.py read_configparser() lines 558-598
function parseIniConfig(fileUri: vscode.Uri): BehaveConfigResult | undefined {
  let content: string;
  try {
    content = fs.readFileSync(fileUri.fsPath, 'utf8');
  } catch {
    return undefined; // unreadable file — silently skip
  }

  // Locate [behave] section; return undefined if absent (DISC-06)
  const lines = content.split(/\r?\n/);
  let inBehaveSection = false;
  let pathsLines: string[] = [];
  let collectingPaths = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[')) {
      if (trimmed === '[behave]') {
        inBehaveSection = true;
        collectingPaths = false;
        continue;
      } else if (inBehaveSection) {
        break; // left [behave] section
      }
      continue;
    }
    if (!inBehaveSection) continue;
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith(';')) {
      collectingPaths = false; // blank/comment lines break continuation
      continue;
    }
    if (/^paths\s*=/.test(trimmed)) {
      const value = trimmed.replace(/^paths\s*=\s*/, '');
      pathsLines = value ? [value] : [];
      collectingPaths = true;
      continue;
    }
    // Continuation line: starts with whitespace in raw line
    if (collectingPaths && /^\s/.test(line)) {
      if (trimmed) pathsLines.push(trimmed);
      continue;
    }
    collectingPaths = false; // different key — stop collecting
  }

  if (!inBehaveSection) return undefined; // DISC-06: no [behave] section
  if (pathsLines.length === 0) return undefined; // no paths key

  const rawPaths = pathsLines.map(p => p.trim()).filter(p => p.length > 0);
  if (rawPaths.length === 0) return undefined;

  return buildResult(fileUri, 'ini', rawPaths);
}
```

**Key pitfall:** Blank lines between continuation lines reset the continuation in Python's configparser. The parser must stop collecting when it encounters a blank line or comment line.

### Pattern 3: TOML Parser

**What:** Use `smol-toml`'s `parse()` function. Access `result?.tool?.behave?.paths`. Paths are a native TOML array — no line-splitting needed.

```typescript
// Source: bundled/libs/behave/configuration.py read_toml_config() lines 601-662
// Source: node_modules/smol-toml/dist/parse.d.ts
import { parse as parseToml } from 'smol-toml';

function parseTomlConfig(fileUri: vscode.Uri): BehaveConfigResult | undefined {
  let content: string;
  try {
    content = fs.readFileSync(fileUri.fsPath, 'utf8');
  } catch {
    return undefined;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseToml(content) as Record<string, unknown>;
  } catch {
    return undefined; // malformed TOML — silently skip (Phase 3 adds warning)
  }

  // Access [tool.behave] — silently skip if absent (DISC-06)
  const tool = parsed?.tool as Record<string, unknown> | undefined;
  const behave = tool?.behave as Record<string, unknown> | undefined;
  if (!behave) return undefined;

  const paths = behave.paths as string[] | undefined;
  if (!paths || !Array.isArray(paths) || paths.length === 0) return undefined;

  const rawPaths = paths.map(String).filter(p => p.length > 0);
  if (rawPaths.length === 0) return undefined;

  return buildResult(fileUri, 'toml', rawPaths);
}
```

### Pattern 4: Path Resolution

**What:** Behave resolves relative paths against the config file's directory: `os.path.normpath(os.path.join(config_dir, p))`. Absolute paths are preserved. Use `vscode.Uri.joinPath` for relative paths; `vscode.Uri.file(rawPath)` for absolute paths.

```typescript
// Source: bundled/libs/behave/configuration.py format_outfiles_coupling() lines 547-555
function resolvePaths(rawPaths: string[], configFileUri: vscode.Uri): vscode.Uri {
  const configDirUri = vscode.Uri.joinPath(configFileUri, '..');
  const rawPath = rawPaths[0]; // v1: only first path (D-03, D-04)
  // Absolute paths: pass through
  if (rawPath.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(rawPath)) {
    return vscode.Uri.file(rawPath);
  }
  // Relative path: resolve against config file's directory
  return vscode.Uri.joinPath(configDirUri, rawPath);
}

function buildResult(
  configFileUri: vscode.Uri,
  format: 'ini' | 'toml',
  rawPaths: string[]
): BehaveConfigResult {
  return {
    configFileUri,
    format,
    rawPaths,
    resolvedPath: resolvePaths(rawPaths, configFileUri),
  };
}
```

### Pattern 5: Test Structure (Matches Existing Test Pattern)

**What:** Mocha `suite` / `test` with real fixture files. Assert on `result.resolvedPath.fsPath` or `result.rawPaths`. Use `assert.strictEqual` and `assert.deepStrictEqual`.

```typescript
// Source: test/unit/parsers/featureParser.test.ts — existing pattern
import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { findBehaveConfig } from '../../../src/parsers/configParser';

suite('configParser', () => {
  const fixtureRoot = path.resolve(__dirname, '../../parsers/fixtures/config');

  suite('behave.ini', () => {
    test('returns resolvedPath for standard behave.ini', () => {
      const wkspUri = vscode.Uri.file(path.join(fixtureRoot, 'behave-ini'));
      const result = findBehaveConfig(wkspUri);
      assert.ok(result, 'should return a result');
      assert.strictEqual(result.format, 'ini');
      assert.deepStrictEqual(result.rawPaths, ['features']);
      assert.ok(result.resolvedPath.fsPath.endsWith('features'));
    });
  });
  // ... 4 more format suites, edge case suites
});
```

### Anti-Patterns to Avoid

- **Using `path.join()` in `src/`:** All path operations must use `vscode.Uri.joinPath()`. The `path.join()` method is acceptable only in test code when computing fixture directory paths. [VERIFIED: AI_INSTRUCTIONS.md]
- **Comparing URIs with `===` or `.fsPath ===`:** Use `uriId()` / `urisMatch()` from `common.ts` for any URI equality check. Windows drive letter casing is inconsistent. [VERIFIED: src/common.ts lines 76-81]
- **Using `vscode.workspace.fs.readFile()`:** This is async and slow. Use synchronous `fs.readFileSync()` for file reading in the parser, consistent with `fs.existsSync()` usage throughout `src/`. [VERIFIED: src/common.ts lines 171-183]
- **Module-level caching state in configParser.ts:** Phase 1 is pure parsing. Do not add caching here — that's Phase 2's responsibility.
- **Throwing on malformed files:** Return `undefined` for unreadable or malformed files. Phase 3 adds UX warnings. Throwing would crash the extension for users with broken config files.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TOML parsing | Custom regex TOML parser | `smol-toml` v1.6.0 | TOML spec has many edge cases (multi-line strings, inline tables, escape sequences); smol-toml is already installed |
| URI path joining | `path.join(uri.fsPath, segment)` then `vscode.Uri.file(result)` | `vscode.Uri.joinPath(uri, segment)` | `Uri.joinPath` handles cross-platform path separators and normalizes to forward slashes internally |

**Key insight:** INI parsing IS hand-rolled by design. No npm package replicates Python's `configparser` continuation-line behavior accurately. The hand-rolled parser is intentionally simple (~50 lines).

---

## Common Pitfalls

### Pitfall 1: INI Continuation Lines
**What goes wrong:** Treating every indented line as part of a multi-line value. Python's `configparser` stops collecting continuation lines when it encounters a blank line, a comment line, or a new key.
**Why it happens:** The continuation-line spec is not widely documented in the context of `paths=` with multiple entries.
**How to avoid:** Stop `collectingPaths` when a blank/comment line is encountered, not just when a new key is seen.
**Warning signs:** Tests with multi-path INI configs that have blank lines between entries fail to parse all paths.

### Pitfall 2: TOML Array vs. Single String
**What goes wrong:** Behave's `read_toml_config` validates that `paths` is a list (it raises `ConfigParamTypeError` if it's a scalar). A `pyproject.toml` with `paths = "features"` (string) is malformed.
**Why it happens:** Users may write `paths = "features"` instead of `paths = ["features"]`.
**How to avoid:** Check `Array.isArray(paths)` before accessing. Return `undefined` (not throw) if it's not an array — this is a user error, not a parser bug.
**Warning signs:** TypeScript type cast succeeds but runtime value is a string.

### Pitfall 3: Absolute Path Detection on Windows
**What goes wrong:** `rawPath.startsWith('/')` check misses Windows absolute paths like `C:\features`.
**Why it happens:** Behave runs on Windows; config files may have Windows-style absolute paths.
**How to avoid:** Check for both Unix (`/`) and Windows (`C:\` or `C:/`) absolute path patterns. Regex: `/^[a-zA-Z]:[\\/]/`.
**Warning signs:** Windows absolute paths get joined to config dir, producing a wrong double-rooted path.

### Pitfall 4: `.behaverc` Filename Edge Case
**What goes wrong:** `.behaverc` starts with a dot — on some systems, `fs.existsSync` returns false for dot-files if the directory listing is wrong, but this is not actually an issue in Node.js. The real pitfall is that `.behaverc` has no file extension, so format detection must be by filename, not extension.
**Why it happens:** Extension-based dispatch (`path.extname('.behaverc')` returns `''`) breaks format detection.
**How to avoid:** Use the filename-to-format mapping table (the `CONFIG_FILES` array) rather than file extension to determine `'ini'` vs `'toml'`.
**Warning signs:** `.behaverc` gets dispatched to TOML parser and fails.

### Pitfall 5: smol-toml Import in CommonJS Bundle
**What goes wrong:** `smol-toml` has `"type": "module"` in its package.json. If imported as an ES module in a CommonJS context, webpack may fail to bundle it.
**Why it happens:** The package is dual-format (ESM + CJS), but the wrong entry point gets resolved.
**How to avoid:** Use `import { parse } from 'smol-toml'` — webpack resolves to `dist/index.cjs` (the `"main"` field) in CommonJS mode. Verified: `dist/index.cjs` exists and is CommonJS format.
**Warning signs:** Webpack build error about `require() of ES Module`.

---

## Code Examples

### Full `configParser.ts` Module Shape

```typescript
// Source: bundled/libs/behave/configuration.py (behavior reference)
// Source: src/parsers/featureParser.ts (module pattern reference)
import * as vscode from 'vscode';
import * as fs from 'fs';
import { parse as parseToml } from 'smol-toml';

export interface BehaveConfigResult {
  configFileUri: vscode.Uri;
  format: 'ini' | 'toml';
  rawPaths: string[];
  resolvedPath: vscode.Uri;
}

// Entry point — called by Phase 2's integration layer
export function findBehaveConfig(wkspUri: vscode.Uri): BehaveConfigResult | undefined {
  return searchConfigFiles(wkspUri);
}

// Internal helpers: searchConfigFiles, parseIniConfig, parseTomlConfig,
// resolvePaths, buildResult — see patterns above
```

### smol-toml Access Pattern

```typescript
// Source: node_modules/smol-toml/dist/parse.d.ts
// parse() returns TomlTableWithoutBigInt which is Record<string, TomlValue>
// Nested access requires casting since TOML values are typed as TomlValue
const parsed = parseToml(content);
const paths = (parsed as any)?.tool?.behave?.paths as string[] | undefined;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual `settings.json` configuration | Auto-discover from behave config files | Phase 1 (this phase) | Zero-config onboarding |
| Extension-based format detection | Filename-to-format mapping table | This phase | Handles `.behaverc` (no extension) correctly |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `ini` npm package does not handle Python configparser continuation-line semantics | Don't Hand-Roll | Minimal — even if an npm package exists, the hand-rolled parser is ~50 lines and testable against reference behavior |
| A2 | Blank lines in a `paths=` multi-value block terminate continuation (i.e., Python configparser resets continuation on blank lines) | Pattern 2 (INI Parser) | Medium — would misparse multi-path configs with intervening blank lines. Verified from `configparser` source behavior but not tested against live Python configparser in this session |

---

## Open Questions

1. **Does Python configparser reset continuation on comment lines?**
   - What we know: blank lines reset continuation (standard configparser behavior)
   - What's unclear: whether `;` or `#` comment lines also reset continuation, or are treated as continuations
   - Recommendation: Treat comment lines as continuation-breakers (conservative). Write a fixture with a comment between continuation lines to verify in tests.

2. **Are there `setup.cfg` edge cases where `[behave]` coexists with `[tool:behave]`?**
   - What we know: behave only reads the `[behave]` section in INI/CFG files (not `[tool:behave]`)
   - What's unclear: if users write `[tool:behave]` in setup.cfg by mistake
   - Recommendation: Silently ignore — parser only looks for `[behave]`, so `[tool:behave]` in setup.cfg is not found, which matches behave's own behavior.

---

## Environment Availability

Step 2.6: SKIPPED — this phase is purely code/config changes (new TypeScript file + test fixtures). The only external dependency is `smol-toml`, which is already installed at v1.6.0. [VERIFIED: node_modules/smol-toml/package.json]

---

## Sources

### Primary (HIGH confidence)
- `bundled/libs/behave/configuration.py` — Behave's own config parsing logic: `config_filenames()` (line 692), `read_configparser()` (line 558), `read_toml_config()` (line 601), path resolution (lines 547-555) [VERIFIED: read directly]
- `node_modules/smol-toml/` — smol-toml v1.6.0 installation: `package.json` (version, CJS main), `dist/parse.d.ts` (function signature), `dist/index.cjs` (CJS format) [VERIFIED: read directly]
- `src/common.ts` — URI handling conventions (`uriId`, `urisMatch`, `vscode.Uri.joinPath` pattern), `getUrisOfWkspFoldersWithFeatures` performance constraint [VERIFIED: read directly]
- `src/parsers/featureParser.ts` — Module pattern: named exports, no default export, no module-level caching needed for Phase 1 [VERIFIED: read directly]
- `test/unit/parsers/featureParser.test.ts` — Test pattern: `suite` / `test`, `assert.strictEqual`, fixture-based testing [VERIFIED: read directly]
- `test/unit/vscode.mock.ts` — `Uri` mock with `joinPath`, `file`, `fsPath` fully implemented [VERIFIED: read directly]
- `AI_INSTRUCTIONS.md` — URI handling rules, `path.join` prohibition in `src/`, exception handling pattern [VERIFIED: read directly]

### Secondary (MEDIUM confidence)
- `.planning/config.json` — `nyquist_validation: false` confirmed; Validation Architecture section omitted [VERIFIED: read directly]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — smol-toml confirmed installed; `fs` and `vscode.Uri` usage verified in existing code
- Architecture: HIGH — based on direct reading of behave source and existing parser patterns
- Pitfalls: HIGH for items derived from behave source; MEDIUM for configparser edge cases (A2 in Assumptions Log)
- INI continuation-line semantics: MEDIUM — derived from behave source and Python configparser docs, not live-tested

**Research date:** 2026-04-15
**Valid until:** 2026-05-15 (stable tech stack, no fast-moving dependencies)
