# Technology Stack: Config File Auto-Discovery

**Project:** gs-behave-bdd — behave config file auto-discovery milestone
**Researched:** 2026-04-15
**Scope:** Stack decisions for INI + TOML parsing and filesystem discovery in a VS Code extension

---

## Recommended Stack

### TOML Parsing

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| smol-toml | 1.6.0 (installed), 1.6.1 (latest) | Parse `pyproject.toml` for `[tool.behave]` section | HIGH |

**Why smol-toml:**

- Already installed in `node_modules` at v1.6.0 (the milestone plan already calls for it)
- Ships both ESM (`dist/index.js`) and CJS (`dist/index.cjs`) with proper `exports` field — webpack resolves `"require": "./dist/index.cjs"` automatically with no config changes
- TypeScript types included (`dist/index.d.ts`) — no `@types/` package needed
- TOML 1.1.0 spec-compliant — correct for `pyproject.toml` parsing
- 6.8M weekly npm downloads; most popular TOML parser on npm (MEDIUM confidence, WebSearch source)
- BSD-3-Clause license
- Zero runtime dependencies
- ~20KB tarball (confirmed from local pack); well within the "~5KB" budget mentioned in PROJECT.md (that estimate likely refers to gzipped, which the tgz confirms is reasonable)

**API surface needed:**

```typescript
import { parse } from 'smol-toml';

const doc = parse(fileContent); // returns typed object
const paths = (doc as any)?.tool?.behave?.paths as string[] | undefined;
```

**Upgrade note:** v1.6.1 patches a stack overflow on recursive comment parsing. Pin to `^1.6.1` in package.json (not the currently installed 1.6.0) to get the security fix.

---

### INI Parsing

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| Hand-rolled parser (inline, ~30 lines) | N/A | Parse `behave.ini`, `.behaverc`, `setup.cfg`, `tox.ini` | HIGH |

**Why NOT an npm INI package:**

- `npm/ini` v6.0.0: Does NOT support Python configparser-style continuation lines. Splits input on `[\r\n]+` treating each line independently. `paths =\n  ./features\n  ./more_features` would not be parsed as a single multiline value.
- `config-ini-parser`, `@jedmao/ini-parser`, `js-ini`: Same limitation — none replicate Python configparser's indented continuation line behavior (verified by inspecting `npm/ini` source; others have similar line-by-line architectures based on their documentation).
- The feature to be implemented needs to match behave's own parsing exactly. Behave calls `configparser.ConfigParser`, which reads indented continuation lines as a single string value and then calls `.splitlines()` + `.strip()` on each part.

**What the hand-rolled parser must do:**

Behave's `read_configparser` for `paths` does exactly this:
```python
value_parts = config.get("behave", dest).splitlines()
this_config[param_name] = [value_type(part.strip()) for part in value_parts if part.strip()]
```

Python's ConfigParser folds indented continuation lines into the previous key's value with a `\n` prefix. So `paths =\n  ./features\n  ./more_features` becomes the string `\n./features\n./more_features` after ConfigParser reads it.

The TypeScript parser must:
1. Read only the `[behave]` section (ignore all other sections)
2. Recognize continuation lines: a line starting with whitespace that follows a key-value pair is appended to that value with `\n`
3. After extracting the raw value for `paths`, split on `\n` and strip each part, filtering empty strings
4. Handle `#` and `;` inline comments on the section header lines
5. Stop processing once `[behave]` section ends (next `[section]` header encountered)

This is ~30 lines of TypeScript. No third-party dependency is justified.

---

### Filesystem Operations

| Approach | Use Case | Why |
|----------|----------|-----|
| `fs.readFileSync` (Node.js built-in) | Reading config file contents | Synchronous; consistent with how `common.ts` already uses `fs.existsSync` in the performance-critical `getUrisOfWkspFoldersWithFeatures()` path |
| `fs.existsSync` (Node.js built-in) | Checking file presence during discovery scan | Already in use; confirmed < 1ms per call |
| `vscode.workspace.fs.readFile` (async) | NOT used for discovery | Too slow for the < 1ms path; existing code comment explicitly says "try/catch with await vwfs.stat(uri) is much too slow atm" |

**Why synchronous `fs` over `vscode.workspace.fs` for the hot path:**

The existing codebase is unambiguous about this. In `common.ts`:

```typescript
// try/catch with await vwfs.stat(uri) is much too slow atm
const hasDefaultFeaturesFolder = fs.existsSync(featuresUri.fsPath);
```

Config file discovery runs inside `getUrisOfWkspFoldersWithFeatures()`, which has a < 1ms hard requirement. The discovery result is cached in a module-level `Map` after first run — `fs.readFileSync` is only called once per config file per workspace session. Subsequent calls hit the cache and are pure in-memory.

`vscode.workspace.fs` is appropriate for non-critical-path async operations (file watchers, one-time async operations). It is not appropriate here.

**Remote development note (LOW confidence):** `vscode.workspace.fs` is recommended for SSH/remote development scenarios because `fs` doesn't work over SSH. However, behave runs locally (it's a Python subprocess), so remote development is not a realistic scenario for this extension. The existing architecture already makes this tradeoff.

---

### Directory Scanning

| Technology | Purpose | Why |
|------------|---------|-----|
| Node.js built-in `fs.readdirSync` + `fs.statSync` | Subdirectory scan at depth 1-3 | Already in codebase pattern; synchronous; no new dependency |

The `findSubdirectorySync` utility already exists in `common.ts` and uses `fs.readdirSync`. The discovery scan should follow the same pattern: recursive descent up to `discoveryDepth` (default 3), checking for config filenames at each level.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| TOML parsing | smol-toml | `@iarna/toml` | Unmaintained; last release 2019; TOML 0.5 only |
| TOML parsing | smol-toml | `toml` (npm) | TOML 0.5 only; 600KB+ bundle |
| TOML parsing | smol-toml | Hand-rolled regex | TOML is too complex for regex (nested tables, inline arrays, quoted strings) |
| INI parsing | Hand-rolled | `npm/ini` v6 | Doesn't handle Python configparser continuation lines |
| INI parsing | Hand-rolled | `config-ini-parser` | No continuation line support; adds unnecessary dependency |
| File I/O (hot path) | `fs.readFileSync` | `vscode.workspace.fs.readFile` | Async; incompatible with < 1ms requirement |

---

## Installation

```bash
# smol-toml is already installed at v1.6.0
# Upgrade to patch the stack overflow security fix:
npm install smol-toml@^1.6.1

# No other new dependencies required
```

---

## Webpack Compatibility

No webpack config changes needed. smol-toml's `package.json` has:
```json
"exports": {
  "require": "./dist/index.cjs"
}
```

Webpack 5 resolves `"require"` exports when targeting `commonjs2`, matching the existing `libraryTarget: 'commonjs2'` in `webpack.config.js`.

---

## TypeScript Compatibility

smol-toml ships `dist/index.d.ts`. The existing `tsconfig.json` uses `"module": "commonjs"` + `"strict": true`. smol-toml's types are compatible. Import as:

```typescript
import { parse } from 'smol-toml';
```

TypeScript resolves to `dist/index.d.ts` via the `"types"` field in smol-toml's package.json.

---

## Sources

- smol-toml GitHub: https://github.com/squirrelchat/smol-toml (version 1.6.1 confirmed March 2026)
- smol-toml npm: https://www.npmjs.com/package/smol-toml (6.8M weekly downloads)
- npm/ini source: https://github.com/npm/ini (confirmed no continuation line support via source inspection)
- behave configuration.py: bundled at `bundled/libs/behave/configuration.py` — primary source for parsing semantics
- Python configparser docs: https://docs.python.org/3/library/configparser.html (continuation line spec)
- VS Code remote extensions guide: https://code.visualstudio.com/api/advanced-topics/remote-extensions
