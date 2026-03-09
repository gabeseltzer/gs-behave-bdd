# Claude Instructions for behave-vsc

## Project Overview

**behave-vsc** is a VSCode extension that integrates Python [Behave](https://behave.readthedocs.io/) BDD tests into the VSCode Test Explorer. Key features:
- Run/debug behave scenarios from the Test Explorer sidebar or feature files
- Two-way step navigation (Go to Step Definition / Find All Step References)
- Gherkin syntax highlighting, autocompletion, and formatting
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

## Architecture Patterns

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

### Integration Test Structure
Each integration suite has:
- `expectedResults.ts` — expected test pass/fail outcomes
- `extension.test.ts` — main assertions
- `index.ts` — suite entry point

## VSCode Debug Configurations

`.vscode/launch.json` has many configurations for manually debugging the extension with different example projects (e.g., "Debug: Simple workspace", "Debug: Nested Project") and for running individual test suites ("Run Test Suite: Simple", etc.). Use `Ctrl+Shift+D` to access them.

## Python Tooling

- `pyproject.toml` configures Ruff (linting/formatting) and MyPy (strict type checking)
- Python files live in `src/python/` and `bundled/`
- Example projects in `example-projects/` are excluded from Python linting
- Minimum Python version: 3.10.15
