# AI Agent Instructions for behave-vsc

This file contains shared instructions for all AI coding agents (Claude, Copilot, etc.).

## Project Overview

**behave-vsc** is a VSCode extension that enables running, debugging, and navigating Python [behave](https://behave.readthedocs.io/) BDD tests using the native VSCode Test API. The extension provides:

- Test execution/debugging via VSCode's Test Explorer
- Two-way step navigation (Feature ↔ Step definitions)
- Gherkin syntax highlighting, formatting, and autocomplete
- Fixture validation and step diagnostics
- Multi-root workspace support

## Tech Stack

- **TypeScript** (strict mode) — extension source in `src/`
- **VSCode Test Controller API** — for test discovery and execution
- **Webpack** — bundles the extension
- **Mocha + Sinon** — unit test framework
- **@vscode/test-electron** — integration test runner
- **Python / Behave 1.3.3** — bundled in `bundled/libs/`
- **uv** — Python environment management

## Key Commands

### Setup
```bash
npm install            # Install Node dependencies
npm run bundle-behave  # Install behave to bundled/libs/
uv sync                # Set up Python dev environment
```

### Build
```bash
npm run compile   # Compile TypeScript + webpack bundle
npm run watch     # Watch mode (auto-rebuild)
npm run package   # Production build (minified)
```

### Testing
```bash
npm run test:unit         # Unit tests only (fast, no VSCode needed)
npm run test:integration  # Integration tests (downloads VSCode Stable)
npm run test:debug-suite  # Debug tests (requires VSCode Insiders)
npm test                  # Lint + compile + all tests
```

### Linting
```bash
npm run lint           # ESLint on src/ TypeScript
npm run lint:python    # Ruff + mypy on Python code
```

## After Every Code Change

Always run the linter after modifying any TypeScript source file:

```bash
npx eslint src --ext ts
```

Exit 0 with no output means clean. Fix any warnings or errors before finishing.

## Project Structure

```
src/
  extension.ts              # Entry point — activates extension, registers commands
  configuration.ts          # Global config singleton
  settings.ts               # WindowSettings & WorkspaceSettings classes
  common.ts                 # Shared utility functions
  logger.ts                 # Logging
  bundledBehave.ts          # Logic to use bundled behave vs system behave
  handlers/                 # VSCode language/UI providers
    autoCompleteProvider.ts
    definitionProvider.ts
    findStepReferencesHandler.ts
    gotoStepHandler.ts
    semHighlightProvider.ts
    stepDiagnostics.ts
    formatFeatureProvider.ts
    ...
  parsers/                  # Core parsing logic
    fileParser.ts           # Orchestrates all parsing (main entry)
    featureParser.ts        # Gherkin feature file parsing
    stepsParser.ts          # Python steps file parsing
    stepMappings.ts         # Maps feature steps → step definitions
    junitParser.ts          # Parses behave junit XML output
    importParser.ts         # Python import analysis
    behaveStepLoader.ts     # Discovers steps via behave dry-run
  runners/                  # Test execution
    testRunHandler.ts       # Orchestrates run/debug
    behaveRun.ts            # Spawns behave process
    behaveDebug.ts          # Creates VSCode debug launch config
    behaveEnv.ts            # Environment variable setup
  watchers/                 # File system watchers
    workspaceWatcher.ts     # Watches feature/steps files
    junitWatcher.ts         # Watches junit output

test/
  unit/                     # Unit tests (Mocha, no VSCode process)
    vscode.mock.ts          # Full VSCode API mock
    setup.ts                # Loads mock before tests
    run.ts                  # Mocha runner entry
    handlers/, parsers/, runners/, watchers/, settings/
  integration/              # Integration tests (run inside real VSCode)
    runTestSuites.ts        # Main integration runner
    runDebugSuite.ts        # Debug suite runner
    simple suite/
    nested project suite/
    sibling steps folder* suites/
    project A & B suites/
    multiroot suite/
    debug suite/
    suite-shared/           # Shared test helpers and assertions

example-projects/           # Example behave projects used by integration tests
bundled/libs/               # Bundled behave 1.3.3 (Python)
```

## Critical Conventions

### URI Handling (Most Common Bug Source)

**NEVER** compare URIs using `===`, `.path`, or `.fsPath`. Windows drive letter casing is inconsistent (`C:` vs `c:`).

```typescript
// ✅ CORRECT
import { urisMatch, uriId } from './common';
if (urisMatch(uri1, uri2)) { ... }
const key = uriId(uri); // for Map keys

// ❌ WRONG
if (uri1 === uri2) { ... }
if (uri1.path === uri2.path) { ... }
if (uri1.fsPath === uri2.fsPath) { ... }
```

**Path construction**: Use `vscode.Uri.joinPath()`, never `path.join()` (except in tests). Use `uri.path` internally, `uri.fsPath` only for filesystem operations.

### Exception Handling Pattern

Only top-level functions (handlers/event listeners) should call `config.logger.showError()`. All other functions must `throw`.

```typescript
// ✅ In handler (top-level)
export function myHandler() {
  try {
    // work
  } catch (e: unknown) {
    config.logger.showError(e, wkspUri);
  }
}

// ✅ In helper function
function helperFunction() {
  if (problem) {
    throw new WkspError("message", wkspUri); // if workspace context available
    // or
    throw "message"; // will be caught and wrapped by handler
  }
}

// ❌ WRONG - shows error multiple times
function helperFunction() {
  config.logger.showError(e, wkspUri); // NO! Only in handlers
}
```

### Disposables Management

Every disposable must be either:
1. Added to `context.subscriptions.push()` in `activate()`
2. Disposed in a `finally` block
3. Disposed in `deactivate()`

Common disposables: event handlers, FileSystemWatcher, CancellationTokenSource.

### Multi-Root Workspace Support

Always consider that users may have multiple workspace folders with different behave projects:

- Settings are per-workspace-folder, accessed via `getWorkspaceSettingsForFile(uri)`
- Output channels are per-workspace (see `config.logger.logInfo(msg, wkspUri)`)
- Test runs may execute in parallel across workspaces
- Workspace folders can be added/removed at runtime

### Performance Requirements

Performance is the **#1 priority** for editor extensions:

- **Never block activation**: Use unawaited async calls in `activate()`. The `activate()` function should return fast.
- **Avoid redundant parsing**: Use `FileParser` caching. Check `parser.featureParseComplete()` before test runs.
- **Log timings**: Use `performance.now()` and `diagLog()` to measure expensive operations.
- Example: `src/extension.ts` logs `activate took X ms`.

### Cross-Platform Compatibility

- No bash/cmd/shell-specific commands
- Windows max path: 259 chars (`WIN_MAX_PATH`)
- Windows max command line: 8191 chars (`WIN_MAX_CMD`)
- Use `/` internally (vscode normalizes; `\` only in `uri.fsPath`)
- Use `utf8` encoding
- Line endings are `\n` (vscode normalizes)

## Key Architecture Patterns

### Data Flow
1. Files parsed → `TestFile` / `Scenario` objects created
2. Stored in `WeakMap<vscode.TestItem, BehaveTestData>`
3. Displayed in Test Explorer
4. On run/debug → `testRunHandler` called
5. Behave spawned with optimized `-i` (regex include) patterns
6. junit XML output parsed → test results updated in UI

### Key Conventions
- **Strict TypeScript** — all code must pass `strict: true`; no implicit `any`
- **Unused parameters** — prefix with `_` to suppress ESLint warnings (e.g., `_token`)
- **Settings access** — always go through `configuration.ts` singleton, not direct `vscode.workspace.getConfiguration` calls in most cases
- **WeakMap for test data** — `BehaveTestData` (feature or scenario) is stored keyed by `vscode.TestItem` to avoid memory leaks
- **Async pattern** — use async/await, not `.then()` chains (except for unawaited background tasks)

### Test Data Structure

Tests are stored in a `WeakMap<vscode.TestItem, BehaveTestData>`:

```typescript
const testData = new WeakMap<vscode.TestItem, BehaveTestData>();
const data = testData.get(item);
if (data instanceof Scenario) { /* ... */ }
if (data instanceof TestFile) { /* ... */ }
```

Tree: `TestController` → Workspace folders → Feature files → Scenarios

### Step Mappings

Two-way navigation requires mapping feature steps to step file definitions:

- `getStepFileStepForFeatureFileStep(featureUri, line)`: Feature → Step file
- `getStepMappingsForStepsFileFunction(stepsUri, lineNo)`: Step file → Feature usages

Step matching is regex-based: `{param}` → `.*`. Limitations: doesn't handle `{param:d}`, `cfparse`, or `re` regex patterns. See README "Known issues".

### Diagnostics System

Two types of diagnostics:

1. **Fixture diagnostics** (`fixtureDiagnostics.ts`): Validates `@fixture.xxx` tags against `environment.py`
2. **Step diagnostics** (`stepDiagnostics.ts`): Highlights undefined steps in feature files

Both validate on:
- Document open (`onDidOpenTextDocument`)
- Document change (`onDidChangeTextDocument`)
- Related file changes (e.g., environment.py change → re-validate all open features)

Clear diagnostics using the helper functions (`clearFixtureDiagnostics`, `clearStepDiagnostics`) to avoid duplication.

### Configuration Reloading

Settings changes trigger `configurationChangedHandler()`:

1. Reload workspace settings via `config.reloadSettings(wkspUri)`
2. Recreate file watchers for new `featuresPath`/`projectPath`
3. Reparse all workspaces to rebuild test tree

For tests, inject test config: `configurationChangedHandler(undefined, testCfg, true)`.

### Behave Command Construction

See `src/runners/behaveRun.ts` and `behaveDebug.ts`:

- Command logged to "Behave VSC" output channel
- Workspace support: uses workspace-specific `projectPath`, `featuresPath`, Python interpreter
- Smart `-i` regex to run multiple tests in one behave instance (unless `runParallel`)
- Always includes `--junit` and `--show-skipped` for result parsing
- **Bundled behave**: The extension ships behave 1.3.3 in `bundled/libs/`. By default (`importStrategy: "useBundled"`), behave is invoked from the bundle. Set `importStrategy: "fromEnvironment"` to use behave from the user's Python environment instead.

## Integration Test Structure

Each integration suite has:
- `expectedResults.ts` — expected test pass/fail outcomes
- `extension.test.ts` — main assertions
- `index.ts` — suite entry point

## Development Workflow

### Debugging

1. Open workspace in VSCode
2. (`Ctrl+Shift+B`) to start watch build
3. (`Ctrl+Shift+D`) → Select "Debug: Simple workspace" (or other example project)
4. (`F5`) to launch Extension Development Host
5. Set breakpoints in source VSCode, test in host VSCode

**Common debugging issues**:
- Hit unexpected breakpoint? Delete ALL breakpoints in both source AND host environments, then restart.
- Timeout failures? Same fix as above.
- Can't step? Check you haven't disabled "Just My Code" unintentionally.

See `CONTRIBUTING.md` § "Debugging" for detailed troubleshooting.

### File Watching & Reparsing

The extension reparses on:
- **Disk changes** (`workspaceWatcher.ts`): File add/delete/rename
- **Editor changes** (`onDidChangeTextDocument`): While typing, before save

Why reparse on editor changes?
1. User may run unsaved file
2. Semantic highlighting needs current step mappings
3. Navigation (F12) needs current state
4. Better UX with instant test tree updates

## Common Tasks

### Adding a New Language Provider

1. Create provider in `src/handlers/` implementing VS Code's provider interface
2. Register in `activate()`: `vscode.languages.register[Type]Provider(...)`
3. Add to `context.subscriptions.push()`

Example: [definitionProvider.ts](src/handlers/definitionProvider.ts), [hoverProvider.ts](src/handlers/hoverProvider.ts)

### Adding Extension Settings

1. Add to `package.json` § `contributes.configuration.properties`
2. Add getter to `WorkspaceSettings` or `WindowSettings` class in [settings.ts](src/settings.ts)
3. Use via `getWorkspaceSettingsForFile(uri)` or `config.globalSettings`

### Modifying Parsers

Parsers cache results keyed by URI:

- `featureParser.ts`: Stores in-memory maps of tags, steps
- `fixtureParser.ts`: Stores fixtures from `environment.py`
- `stepsParser.ts`: Stores step definitions, line numbers, regex

Call `deleteFeatureFileSteps(featuresUri)` before reparsing to clear cache.

### Logging

```typescript
// To workspace output channel (preferred when workspace known)
config.logger.logInfo("message", wkspUri);

// To all workspace output channels (rare, only when no specific workspace context)
config.logger.logInfoAllWksps("message");

// Extension developer diagnostics (visible in "Developer: Toggle Developer Tools" when xRay enabled)
diagLog("message");

// Test run output (during test execution)
run.appendOutput("message\r\n");
```

**Don't** call logger for errors/warnings. Use `throw` for errors, `config.logger.showWarn()` for warnings.

## Testing Patterns

### Unit Tests

Located in `test/unit/`. Use Mocha + Sinon for mocking:

```typescript
import * as sinon from 'sinon';
import * as assert from 'assert';

suite('MyModule', () => {
  test('should work', () => {
    const stub = sinon.stub();
    // ...
    assert.strictEqual(result, expected);
  });
});
```

### Integration Tests

Structure: `test/integration/<suite-name>/<workspace-name>.test.ts`

Each test:
1. Activates extension with example project (e.g., `example-projects/simple/`)
2. Calls `runAllTestsAndAssertTheResults()`
3. Asserts test counts, pass/fail statuses

Use `TestWorkspaceConfigWithWkspUri` to inject test-specific settings.

## VSCode Debug Configurations

`.vscode/launch.json` has many configurations for manually debugging the extension with different example projects (e.g., "Debug: Simple workspace", "Debug: Nested Project") and for running individual test suites ("Run Test Suite: Simple", etc.). Use `Ctrl+Shift+D` to access them.

## Python Tooling

- `pyproject.toml` configures Ruff (linting/formatting) and MyPy (strict type checking)
- Python files live in `src/python/` and `bundled/`
- Example projects in `example-projects/` are excluded from Python linting
- Minimum Python version: 3.10.15

## Common Pitfalls

1. **Forgetting to clear diagnostics** when reparsing features → use `clearFixtureDiagnostics()` before setting new ones
2. **Using path.join() for URIs** → use `vscode.Uri.joinPath()`
3. **Comparing URIs with `===`** → use `urisMatch()`
4. **Calling `showError()` in non-handler functions** → throw instead
5. **Not handling multi-root workspaces** → test with `example-projects/multiroot.code-workspace`
6. **Forgetting to dispose resources** → add to `context.subscriptions` or `finally` block
7. **Awaiting in `activate()`** → makes extension slow to init; avoid unless necessary
8. **Using `.then()` chains** → extension uses async/await, not promises (except for unawaited background tasks)

## Quick Reference

| Task | File | Key Function |
|------|------|--------------|
| Extension entry point | `src/extension.ts` | `activate()` |
| Parse feature files | `src/parsers/featureParser.ts` | `parseFeatureContent()` |
| Parse step files | `src/parsers/stepsParser.ts` | `parseStepsContent()` |
| Go to definition | `src/handlers/gotoStepHandler.ts` | `gotoStepHandler()` |
| Find references | `src/handlers/findStepReferencesHandler.ts` | `findStepReferencesHandler()` |
| Run tests | `src/runners/testRunHandler.ts` | `testRunHandler()` |
| Validate fixtures | `src/handlers/fixtureDiagnostics.ts` | `validateFixtureTags()` |
| Validate steps | `src/handlers/stepDiagnostics.ts` | `validateStepDefinitions()` |
| Bundled behave | `src/bundledBehave.ts` | `getBundledBehavePath()` |

## Additional Resources

- [README.md](README.md): User-facing features, workspace requirements, settings
- [CONTRIBUTING.md](CONTRIBUTING.md): Development guidelines, testing procedures, PR checklist
- Example projects: [example-projects/](example-projects/) — Use for debugging/testing
- VSCode Test API: https://code.visualstudio.com/api/extension-guides/testing
