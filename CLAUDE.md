# Claude Instructions for gs-behave-bdd

## Shared Instructions

See [AI_INSTRUCTIONS.md](AI_INSTRUCTIONS.md) for comprehensive project conventions, architecture patterns, common tasks, and pitfalls. **Read that file first** — it contains critical information about URI handling, error patterns, disposables, performance, and cross-platform compatibility.

## After Every Code Change

Always run the linter after modifying any TypeScript source file:

```bash
npx eslint src --ext ts
```

Exit 0 with no output means clean. Fix any warnings or errors before finishing.

## Unit Tests

After modifying files in `src/`, run unit tests to catch regressions:

```bash
npm run test:unit
```

Fix any failures before finishing.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Auto-Discover Behave Projects**

An enhancement to the gs-behave-bdd VS Code extension that automatically discovers behave project structure by reading behave's native configuration files (`behave.ini`, `.behaverc`, `setup.cfg`, `tox.ini`, `pyproject.toml`). New users opening a folder with a behave config file will see their tests appear in the Test Explorer with zero manual configuration — the extension "just works."

**Core Value:** Zero-configuration project discovery: tests appear in the Test Explorer without the user touching settings.json.

### Constraints

- **Performance**: `getUrisOfWkspFoldersWithFeatures()` < 1ms hard requirement. Discovery results must be cached.
- **Backward compatibility**: Users with explicit `projectPath`/`featuresPath` settings must see zero behavior change.
- **Bundle size**: Extension must remain lightweight. `smol-toml` adds ~5KB — acceptable.
- **Tech stack**: TypeScript, VS Code Extension API, Mocha/Sinon for tests. No Python changes.
- **Config fidelity**: INI/TOML parsing must match behave's own parsing behavior for the `paths` key.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 4.5.5 - VSCode extension source code in `src/`
- Python 3.10.15+ - Step discovery and behave integration via `src/python/discover.py`
- JavaScript - Configuration files and build scripts
## Runtime
- Node.js 18.17.1 - Extension runtime (required by VSCode API)
- Python 3.10.15+ - For behave test execution and step discovery
- npm (with package-lock.json) - Node dependencies
- uv - Python package manager (`uv pip install` for dependencies, configured in `pyproject.toml`)
## Frameworks
- VSCode Test Controller API 1.82.0+ - Test discovery, execution, and UI
- VSCode Extensions API - Language features, providers, event handling
- Mocha 9.2.2 - Unit test framework
- @vscode/test-electron 2.5.2 - Integration test runner (spawns VSCode Insiders/Stable)
- Sinon 21.0.1 - Mocking and stubbing for unit tests
- Webpack 5.76.2 - Bundles TypeScript into single extension.js
- TypeScript 4.5.5 - Compilation (strict mode enabled in `tsconfig.json`)
- ts-loader 9.2.8 - Webpack loader for TypeScript
- ESLint 8.11.0 with @typescript-eslint - Code linting
- Behave 1.3.3 - BDD test framework (bundled in `bundled/libs/`, installed via `npm run bundle-behave`)
- Ruff 0.6+ - Python formatter and linter
- mypy 1.0+ - Python static type checking
- pytest - Not detected; Behave is the primary test runner
## Key Dependencies
- xml2js 0.6.2 - Parses behave's JUnit XML output (in `src/parsers/junitParser.ts`)
- nanoid (transitive) - Generates unique IDs for temporary directories
- @types/glob 8.1.0 - TypeScript types for glob
- @types/mocha 10.0.10 - TypeScript types for Mocha
- @types/sinon 21.0.0 - TypeScript types for Sinon
- @types/vscode 1.82.0 - TypeScript types for VSCode API
- @types/xml2js 0.4.11 - TypeScript types for xml2js
- @typescript-eslint/eslint-plugin 5.15.0 - ESLint plugin for TypeScript
- @typescript-eslint/parser 5.15.0 - Parser for ESLint
- glob 7.2.0 - File globbing utility
- webpack-cli 4.9.2 - Webpack CLI
- copy-webpack-plugin 13.0.1 - Copies Python files to dist/ during webpack build
## Configuration
- `package.json` - Defines extension manifest, commands, language support (Gherkin), keybindings
- `tsconfig.json` - TypeScript compiler options (target ES2021, strict mode)
- `.eslintrc.js` - ESLint rules (extends recommended + @typescript-eslint)
- `webpack.config.js` - Entry: `src/extension.ts`, output: `dist/extension.js`
- `.tool-versions` - Node.js 18.17.1 (for asdf/mise version managers)
- `pyproject.toml` - Python project metadata and tool configuration
- `dist/extension.js` - Bundled and minified extension (webpack output)
- `bundled/libs/` - Bundled behave 1.3.3 installed via `uv pip install --target`
## Platform Requirements
- Operating System: Windows, macOS, Linux
- VSCode: ^1.82.0
- Node.js: 18.17.1 (managed via .tool-versions)
- Python: 3.10.15+ (for step discovery and running tests)
- VSCode: ^1.82.0
- VSCode Python Extension (ms-python.python) - **REQUIRED** dependency
- Triggered on: `workspaceContains:**/*.feature` (any .feature file in workspace)
- Entry point: `src/extension.ts` → `activate()` function
## Bundling Strategy
- webpack bundles `src/extension.ts` and all imports into single `dist/extension.js`
- Node.js modules excluded as externals: vscode module is created by VSCode
- Python files copied to `dist/python/` via copy-webpack-plugin
- Behave 1.3.3 bundled to `bundled/libs/` (installed during build via `npm run bundle-behave`)
- Custom step discovery script: `src/python/discover.py` spawned via `child_process.spawn()`
- Python is invoked from VSCode's Python extension (ms-python.python) interpreter
## Environment Variables
- No .env files detected (not used by this extension)
- Environment variables for behave tests configured through:
## CI/CD Integration
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Descriptive camelCase with file extensions matching content type (`.ts` for TypeScript)
- Handler modules: `<name>Handler.ts` or `<name>Provider.ts` (e.g., `gotoStepHandler.ts`, `codeLensProvider.ts`)
- Parser modules: `<name>Parser.ts` (e.g., `featureParser.ts`, `stepsParser.ts`)
- Test files: `<name>.test.ts` (co-located with source or in `test/` directory)
- Mock/utility files: `<name>.mock.ts` (e.g., `vscode.mock.ts`)
- camelCase with descriptive verb-first naming
- Async functions should indicate async behavior: `parseFileAsync()`, `waitOnReadyForStepsNavigation()`
- Getters use `get<Resource>` pattern: `getFeatureFileSteps()`, `getUrisOfWkspFoldersWithFeatures()`
- Validators/checkers: `is<Type>`, `validate<Thing>` (e.g., `isFeatureFile()`, `validateStepDefinitions()`)
- Event handlers end with `Handler`: `gotoStepHandler()`, `findStepReferencesHandler()`
- camelCase for local variables and parameters
- UPPER_SNAKE_CASE for constants: `WIN_MAX_PATH`, `BEHAVE_EXECUTION_ERROR_MESSAGE`, `sepr`
- Prefixes for clarity:
- PascalCase for classes and interfaces: `FeatureFileStep`, `FileParser`, `Logger`
- Interfaces describe contracts: `Configuration`, `WorkspaceSettings`, `HoverProvider`
- Classes are implementation-focused: `ExtensionConfiguration`, `FeatureTag`
- Enum values use double quotes and lowercase keys: `enum DiagLogType { "info", "warn", "error" }`
## Code Style
- No Prettier configuration (not enforced, but consistent spacing observed)
- 2-space indentation (seen in package.json structure)
- Line breaks between logical blocks within functions
- Trailing commas in multi-line objects/arrays
- ESLint with TypeScript parser and strict rules
- Config: `.eslintrc.js` with `@typescript-eslint/recommended` preset
- **Unused variables rule**: Arguments starting with `_` are ignored (`_scenarios`, `_featureLines`)
- No unused variable warnings if prefixed with underscore
- Strict mode enabled (`"strict": true` in `tsconfig.json`)
- Target ES2021, module commonjs
- Source root: `src/`
- Test root: `test/` with its own `tsconfig.json`
## Import Organization
- No path aliases are used; imports use relative paths (e.g., `..`, `./`, `../../`)
- Namespace imports for large APIs: `import * as vscode from 'vscode'`
- Destructured imports for specific exports: `import { config } from './configuration'`
- Type imports are not explicitly prefixed with `type` (TypeScript infers context)
## Error Handling
- Custom error class: `WkspError` extends Error and carries workspace context (`wkspUri`, optional `run`)
- Used when operation needs workspace-aware logging
- Pattern: `throw new WkspError("message", wkspUri)` or `throw "message"` for generic errors
- All event handlers and registered commands must have try/catch at top level
- Handlers show errors to user via `config.logger.showError(e, wkspUri)` or `config.logger.showWarn()`
- Called from `activate()` in `extension.ts`, handlers like `gotoStepHandler()`, `findStepReferencesHandler()`
- Helper/utility functions (called from handlers) must `throw`, never catch
- Errors bubble up to handler for unified display
- Example from `gotoStepHandler.ts`: validate input, throw on invalid, handler catches and shows UI message
- Wrap async operations: `await parser.stepsParseComplete(5000, "context")`
- Timeout parameter indicates max wait in milliseconds
- Failures throw and propagate to handler
## Logging
- Custom `Logger` class wrapping VS Code's `OutputChannel` API
- Per-workspace output channels for multi-root workspace support
- Entry point: `config.logger` singleton
- `logInfo(text, wkspUri, testRun?)`: Log info message to workspace channel and optional test run
- `logInfoNoLF(text, wkspUri, testRun?)`: Log without line feed (for streaming behave output)
- `logSettingsWarning(text, wkspUri)`: Log warning with user notification
- `showError(error, wkspUri?, testRun?)`: Log error with automatic formatting and user dialog
- `diagLog(message, wkspUri?, logType?)`: Global diagnostic logging (only when `xRay` setting enabled)
- Create detailed logs for parsing/test execution events
- Use `diagLog()` for internal debugging (with `xRay` setting check)
- Log workspace context when available to support multi-workspace debugging
## Comments
- Complex regex patterns: include explanation of what they match
- Non-obvious algorithm steps: explain the "why", not the "what"
- Performance-critical sections: note constraints and implications
- Workarounds: prefix with `// fix for:` and explain the bug
- Entry points: add comments explaining handler/event listener flow
- Not heavily used; focus on clear function signatures instead
- Comment public functions in `common.ts` and handler modules
- Example (from `common.ts`): Multiline comment explaining `WkspError` purpose and usage
- Explain regex patterns and non-obvious logic
- Prefix temporary workarounds: `// NOTE:`, `// FIXME:`, `// TODO:`
## Function Design
- Functions are typically 20-80 lines; complex parsing functions can reach 150+ lines
- Break up long parsing functions with clear logical sections and comments
- Event handlers usually 20-40 lines (try/catch + work + error handling)
- Use object parameters for many related args: `{ uri, range, position }`
- Include context strings in async calls: `await parser.stepsParseComplete(5000, "context")`
- Optional parameters come last; no default parameter syntax observed
- Return `undefined` for not-found cases (not `null`)
- Return arrays even for zero items (use `.length` checks, not truthiness)
- Promise-based async with explicit return type annotations
## Module Design
- Mix of named exports and default exports (not consistently enforced)
- Singletons exported as named exports: `export const config`, `export const parser`
- Classes/interfaces mixed with utility functions in same file
- Large modules like `extension.ts` export interfaces and functions
- No barrel files (index.ts) observed
- Direct imports from module files: `import { FileParser } from './parsers/fileParser'`
- Avoid circular imports; documented in `AI_INSTRUCTIONS.md`
- Parser modules depend on common utilities but not on handlers
- Handlers depend on parsers and common utilities
- Configuration singleton available globally via `import { config }`
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- **Language services** (completion, hover, definition, diagnostics)
- **File parsing** (feature files, step definitions, fixtures)
- **Test orchestration** (test tree, test execution, debugging)
- **Workspace configuration management**
- Event-driven activation and reactive updates via VS Code's FileSystemWatcher and TextDocument events
- Asynchronous file parsing with debouncing for Python files (500ms)
- In-memory caching of parsed step mappings to enable fast navigation
- Multi-root workspace support with per-workspace settings and output channels
- Dispose pattern for cleanup and subscription management
## Layers
- Purpose: VS Code extension lifecycle management, event registration, handler setup
- Location: `src/extension.ts`
- Contains: `activate()` function, test controller creation, event subscription setup, command registration
- Depends on: All other layers
- Used by: VS Code extension host
- Purpose: Provide IDE features (go-to-definition, hover, completion, diagnostics, semantic highlighting)
- Location: `src/handlers/*.ts` (20+ provider files)
- Contains: AutoComplete, CodeLens, DefinitionProvider, HoverProvider, SemanticHighlight, DocumentSymbol, SelectionRange, FindStepReferences, Diagnostics
- Depends on: Parser layer (step mappings, fixtures, feature content)
- Used by: VS Code language feature registrations
- Purpose: Execute behave tests, manage test tree, handle debugging
- Location: `src/runners/*.ts` (4 files: testRunHandler, runOrDebug, behaveRun, behaveDebug, behaveEnv)
- Contains: Test run orchestration, scenario queueing, behave execution, debug session setup, JUnit result parsing
- Depends on: Parser layer (test tree structure), configuration layer
- Used by: Test controller and test run handlers
- Purpose: Parse and cache feature files, step definitions, fixtures, and build step mappings
- Location: `src/parsers/*.ts` (10+ files)
- Contains:
- Depends on: Configuration layer, common utilities
- Used by: Language services, test framework, watchers
- Purpose: Manage workspace settings, environment variables, logger setup
- Location: `src/configuration.ts`, `src/settings.ts`, `src/testWorkspaceConfig.ts`
- Contains: WorkspaceSettings, WindowSettings, environment preset management, Python executable resolution
- Depends on: Logger, common utilities
- Used by: All layers
- Purpose: Cross-cutting concerns and helpers
- Location: `src/common.ts`, `src/logger.ts`, `src/bundledBehave.ts`
- Contains: URI handling, file system operations, random ID generation, diagnostic logging
- Used by: All layers
- Purpose: Monitor file system changes and test results
- Location: `src/watchers/*.ts` (2 files: workspaceWatcher, junitWatcher)
- Contains: Feature file/step file tracking, JUnit result folder monitoring
- Used by: Extension layer and test run handler
## Data Flow
- `featureFileSteps` (Map<Uri, FeatureFileStep[]>)
- `stepFileSteps` (Map<Uri, StepFileStep[]>)
- `fixtures` (Map<Uri, Fixture[]>)
- `stepMappings` (StepMapping[]) - flat array for performance
- `testData` (WeakMap<TestItem, BehaveTestData>) - attached to VS Code test items
## Key Abstractions
- Purpose: Central orchestrator for all file discovery and parsing
- Examples: `src/parsers/fileParser.ts`
- Pattern: Singleton exported as `export const parser = new FileParser()` from extension.ts
- Manages: Parse state machines (_finishedFeaturesParseForAllWorkspaces, _finishedStepsParseForWorkspace), status change handlers, error handlers, debounce timers
- Purpose: Links feature file steps to Python step definitions for navigation
- Examples: `src/parsers/stepMappings.ts` class StepMapping
- Pattern: Simple data class with featuresUri, stepFileStep, featureFileStep
- Supports: Many feature steps → one step definition (1:N relationship stored flat for perf)
- Purpose: Encapsulates per-workspace configuration (paths, env vars, Python executable)
- Examples: `src/settings.ts` class WorkspaceSettings
- Pattern: Loaded from VS Code workspace config during reloadSettings()
- Manages: Environment variable presets, project path, features path, import strategy
- Purpose: Encapsulates all context needed for a test run in one workspace
- Examples: `src/runners/testRunHandler.ts` class WkspRun
- Pattern: Passed between orchestration functions to avoid parameter drilling
- Contains: VS Code TestRun, test queue, workspace settings, Python executable path, JUnit dir
- Purpose: Represent parsed feature file structure matching VS Code test item structure
- Examples: `src/parsers/testFile.ts`
- Pattern: Attached to VS Code TestItem via WeakMap testData
- Methods: `createScenarioTestItemsFromFeatureFileContent()` recursively builds tree with Outline/Example support
## Entry Points
- Location: `src/extension.ts` `activate()` function
- Triggers: When workspace contains `.feature` files (activationEvents: workspaceContains:**/*.feature)
- Responsibilities: Set up test controller, register event handlers, initialize parser, register language services, load initial test tree
- Location: `src/runners/testRunHandler.ts`
- Triggers: User clicks "Run Tests" or "Debug Tests" button
- Responsibilities: Collect selected test items, validate readiness, create WkspRun, execute tests, monitor results, report outcomes
- Location: `src/handlers/*.ts`
- Triggers: User hovers, requests completion, presses F12, right-clicks, etc.
- Responsibilities: Provide IDE features (completion items, hover info, definition ranges, etc.)
- Location: `src/watchers/workspaceWatcher.ts`
- Triggers: When files are created/deleted/renamed on disk
- Responsibilities: Notify parser to reparse affected files, update test tree, clear stale mappings
## Error Handling
- Entry point functions (activate, handlers, event callbacks) catch errors with try-catch
- Call `config.logger.showError(e, wkspUri)` which logs to workspace output channel and shows notification
- Error shown once, prevents duplicate notifications
- `diagLog()` function logs to DevTools console (enabled via xRay setting)
- Used internally for performance metrics, state machine tracing, step matching debug info
- Low overhead when disabled
- `WkspError` extends Error with wkspUri and optional TestRun
- Used to propagate workspace context up the stack for targeted logging
- Logger distinguishes WkspError from generic Error for formatting
- Collected in DiagnosticCollection and displayed in Problems pane
- Types: duplicate-scenario, missing-step-definition, duplicate-step-definition, invalid-fixture-tag
- Cleared and re-validated on file edits via `validateStepDefinitions()`, `validateFixtureTags()`
## Cross-Cutting Concerns
- Framework: `Logger` class in `src/logger.ts`
- Per-workspace output channels created during activation
- `logInfoAllWksps()`, `logWarn()`, `showError()` methods handle routing
- Diagnostic logging via `diagLog()` function
- Step definition validation via `validateStepDefinitions()` in `src/handlers/stepDiagnostics.ts`
- Checks: Missing step definitions, duplicate steps, parameter count mismatches
- Fixture tag validation via `validateFixtureTags()` in `src/handlers/fixtureDiagnostics.ts`
- Both triggered on: initial parsing, file edits, configuration changes
- Configuration: Resolved Python executable via `config.getPythonExecutable()` (uses ms-python extension API)
- Environment variables: Read from workspace config and merged with active preset
- Passed to behave child_process via `behaveEnv()` function
- Each workspace folder gets separate WorkspaceSettings, output channel, file watchers
- Test controller shared across workspaces (items grouped by workspace id)
- Configuration changes re-sync all watchers and test items
- Parallel test runs possible via `runParallel` setting (one behave instance per feature)
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
