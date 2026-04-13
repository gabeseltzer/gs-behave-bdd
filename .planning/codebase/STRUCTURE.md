# Codebase Structure

**Analysis Date:** 2026-04-13

## Directory Layout

```
gs-behave-bdd/
├── src/                          # TypeScript source (compiled to dist/)
│   ├── extension.ts              # Entry point, lifecycle management
│   ├── configuration.ts           # Config singleton, workspace settings loader
│   ├── settings.ts                # WindowSettings, WorkspaceSettings classes
│   ├── testWorkspaceConfig.ts     # Test configuration wrapper (for testing)
│   ├── common.ts                  # Utilities: URI handling, file system, constants
│   ├── logger.ts                  # Logger class, diagnostic logging
│   ├── bundledBehave.ts           # Bundled behave version management
│   │
│   ├── handlers/                  # VS Code language service providers (20+ files)
│   │   ├── gotoStepHandler.ts     # F12 - navigate to step definition
│   │   ├── findStepReferencesHandler.ts  # Alt+F12 - find all step references
│   │   ├── autoCompleteProvider.ts       # Code completion for steps
│   │   ├── definitionProvider.ts         # Peek definition
│   │   ├── hoverProvider.ts              # Hover tooltips
│   │   ├── codeLensProvider.ts           # CodeLens for step reference counts
│   │   ├── semHighlightProvider.ts       # Semantic syntax highlighting
│   │   ├── documentSymbolProvider.ts     # Symbol outline
│   │   ├── selectionRangeProvider.ts     # Smart text selection
│   │   ├── stepReferenceProvider.ts      # Find references (IDE feature)
│   │   ├── stepReferencesView.ts         # Side panel for reference results
│   │   ├── formatFeatureProvider.ts      # Format document
│   │   ├── providerHelpers.ts            # Shared utilities for providers
│   │   ├── fixtureDiagnostics.ts         # Validation for fixture tags
│   │   ├── stepDiagnostics.ts            # Validation for step definitions
│   │   ├── fixtureProviders.ts           # Definition/hover/reference for fixtures
│   │   ├── duplicateStepDiagnostics.ts   # Detect duplicate step definitions
│   │   └── [others]
│   │
│   ├── parsers/                   # File parsing and step matching
│   │   ├── fileParser.ts          # Orchestrator - coordinates all parsing
│   │   ├── featureParser.ts        # Parses .feature files (Gherkin)
│   │   ├── stepsParser.ts          # Parses Python @step() definitions
│   │   ├── fixtureParser.ts        # Parses Python @fixture definitions
│   │   ├── testFile.ts             # TestFile, Scenario classes
│   │   ├── stepMappings.ts         # Maps feature steps → Python steps
│   │   ├── junitParser.ts          # Parses JUnit XML test results
│   │   ├── behaveLoader.ts         # Discovers bundled/env behave
│   │   ├── stepsParserBehaveAdapter.ts  # Adapts behave step discovery
│   │   ├── gherkinPatterns.ts      # Regex patterns for Gherkin parsing
│   │   └── gherkinPatterns.ts      # Regex patterns for Gherkin
│   │
│   ├── runners/                   # Test execution and debugging
│   │   ├── testRunHandler.ts       # Orchestrates test runs
│   │   ├── runOrDebug.ts           # Test queuing and behave invocation
│   │   ├── behaveRun.ts            # Execute behave command
│   │   ├── behaveDebug.ts          # Debug adapter communication
│   │   └── behaveEnv.ts            # Build environment for behave
│   │
│   ├── watchers/                  # File system and result monitoring
│   │   ├── workspaceWatcher.ts     # Monitor feature/step file changes
│   │   └── junitWatcher.ts         # Monitor JUnit result files
│   │
│   └── python/                    # Bundled Python helper scripts
│       ├── discover.py            # Behave step/fixture discovery
│       └── __init__.py
│
├── dist/                          # Compiled JavaScript (output, not committed)
├── bundled/                       # Bundled behave Python package
│   └── libs/                      # pip install --target directory
│
├── src/python/                    # Python helper for discovery
├── test/                          # Test suites
│   ├── unit/                      # Unit tests
│   ├── integration/               # Integration tests with example projects
│   └── fixtures/                  # Test data
│
├── example-projects/              # Example behave projects for testing
│   ├── project-a/
│   ├── project-b/
│   └── [others]
│
├── .vscode/                       # VS Code workspace settings
├── .github/                       # GitHub workflows and PR templates
├── images/                        # Icon and logo assets
├── package.json                   # Node.js / npm package config
├── tsconfig.json                  # TypeScript compiler config
├── webpack.config.js              # Webpack build configuration
├── .eslintrc.js                   # ESLint configuration
├── gherkin.grammar.json           # Gherkin syntax highlighting grammar
├── gherkin.language-configuration.json  # Editor settings for Gherkin
├── gherkin.snippets.json          # Gherkin code snippets
├── LICENSE.txt
└── README.md
```

## Directory Purposes

**src/:**
- Purpose: TypeScript source code for the extension
- Contains: Handler providers, parsers, runners, configuration, utilities
- Key files: `extension.ts` (entry), `common.ts` (constants and helpers)

**src/handlers/:**
- Purpose: Implement VS Code language service providers
- Contains: 20+ files, each implementing a language feature interface
- Key files: `gotoStepHandler.ts`, `autoCompleteProvider.ts`, diagnostic validators

**src/parsers/:**
- Purpose: Extract information from feature files, step files, fixtures
- Contains: File parsing, step matching, result parsing
- Key files: `fileParser.ts` (orchestrator), `stepMappings.ts` (linking logic)

**src/runners/:**
- Purpose: Execute behave tests and manage debugging
- Contains: Test run orchestration, behave invocation, debug protocol
- Key files: `testRunHandler.ts` (entry point for test runs)

**src/watchers/:**
- Purpose: Monitor file system and test result folders
- Contains: Workspace file watching, JUnit result watching
- Key files: `workspaceWatcher.ts` (feature/step changes), `junitWatcher.ts` (results)

**src/python/:**
- Purpose: Python helper scripts for step/fixture discovery
- Contains: discover.py script and package marker
- Used by: `stepsParserBehaveAdapter.ts` to invoke behave discovery

**dist/:**
- Purpose: Compiled JavaScript output of webpack build
- Contains: Single bundle file `extension.js` (webpack configured as single entry)
- Generated: By `npm run compile` or `npm run package`
- Not committed to git

**bundled/:**
- Purpose: Vendored behave Python package
- Contains: Full behave 1.3.3 Python package installed via `npm run bundle-behave`
- Used when: `importStrategy` is "useBundled" (default)
- Not committed; recreated during build

**test/:**
- Purpose: Test suites for the extension
- Contains: Unit tests, integration tests, expected results, test fixtures
- Structure: Mirrors src/ structure for organization
- Run via: `npm run test:unit`, `npm run test:integration`

**example-projects/:**
- Purpose: Sample behave projects for integration testing and documentation
- Contains: Complete projects with features/, steps/, behave.ini
- Used by: Integration test suite to validate parsing and execution

## Key File Locations

**Entry Points:**

- `src/extension.ts`: Main extension entry point, invoked by VS Code on activation
- `src/runners/testRunHandler.ts`: Entry point for test execution
- `src/handlers/gotoStepHandler.ts`: Entry point for "Go to Step Definition" command
- `src/handlers/findStepReferencesHandler.ts`: Entry point for "Find Step References" command

**Configuration:**

- `package.json`: VS Code extension manifest (contributes, activationEvents, scripts)
- `tsconfig.json`: TypeScript compiler settings
- `webpack.config.js`: Bundle configuration (single entry, tree-shaking enabled)
- `src/settings.ts`: WorkspaceSettings and WindowSettings class definitions
- `src/configuration.ts`: Configuration singleton loader

**Core Logic:**

- `src/parsers/fileParser.ts`: Parsing orchestration state machine
- `src/parsers/stepMappings.ts`: Step → step definition matching algorithm
- `src/parsers/featureParser.ts`: Gherkin feature parsing via regex
- `src/parsers/stepsParser.ts`: Python step definition extraction
- `src/common.ts`: Shared utilities (URI handling, file finding, constants)

**Testing:**

- `test/unit/run.js`: Unit test runner entry point
- `test/integration/runTestSuites.js`: Integration test orchestrator
- `test/integration/project A suite/extension.test.ts`: Example test suite

## Naming Conventions

**Files:**

- Camel case: `gotoStepHandler.ts`, `autoCompleteProvider.ts`
- Provider pattern: `*Provider.ts` for VS Code language providers
- Handler pattern: `*Handler.ts` for command/event handlers
- Validator pattern: `*Diagnostics.ts` for validation logic
- Parser pattern: `*Parser.ts` for parsing logic
- Watcher pattern: `*Watcher.ts` for file system monitors

**Directories:**

- Kebab case rarely used; mostly camelCase (parsers, handlers, runners, watchers)
- Functional grouping: handlers/, parsers/, runners/, watchers/ group by responsibility
- Avoid feature-based directories; group by technical layer instead

**Classes:**

- PascalCase: `FileParser`, `WorkspaceSettings`, `WkspRun`, `StepMapping`, `Logger`
- Provider classes end with "Provider": `AutoCompleteProvider`, `DefinitionProvider`
- Interfaces start with "I" (not always followed): `Configuration` interface (no I prefix)

**Constants:**

- UPPER_SNAKE_CASE: `WIN_MAX_PATH`, `BEHAVE_EXECUTION_ERROR_MESSAGE`
- Exported from `common.ts` or specific modules

**Functions:**

- camelCase: `gotoStepHandler()`, `parseFeatureContent()`, `rebuildStepMappings()`
- Handlers: verbs + "Handler" suffix
- Validators: verb first: `validateStepDefinitions()`, `validateFixtureTags()`
- Getters: "get" prefix: `getStepFileStepForFeatureFileStep()`, `getWorkspaceSettingsForFile()`
- Checkers: "is" prefix: `isFeatureFile()`, `isStepsFile()`

## Where to Add New Code

**New Language Service Feature (e.g., new hover behavior):**
- Primary code: `src/handlers/[featureName]Provider.ts`
- Register in: `src/extension.ts` activate() function (context.subscriptions.push with vscode.languages.register*)
- Test location: `test/integration/[project-suite]/[feature-name].test.ts`

**New Command (e.g., new editor command):**
- Handler: `src/handlers/[commandName]Handler.ts`
- Register in: `src/extension.ts` activate() function (vscode.commands.registerCommand)
- Contribute in: `package.json` commands[] and keybindings[] array
- Test location: `test/integration/[project-suite]/extension.test.ts`

**New Validation/Diagnostic:**
- Code: `src/handlers/[area]Diagnostics.ts`
- Call from: `src/extension.ts` event handlers or other validators
- Diagnostic source: Always "gs-behave-bdd"
- Diagnostic code: Descriptive kebab-case (e.g., "missing-step-definition")

**New Parser/Analyzer:**
- Code: `src/parsers/[name]Parser.ts`
- Register with: `FileParser` orchestrator if multi-workspace or file-dependent
- Storage pattern: Module-level Map keyed by features URI
- Access: Export getter functions (e.g., `getFeatureFileSteps(featuresUri)`)

**New Test Runner Feature (e.g., new run option):**
- Code: Add to `src/runners/runOrDebug.ts`
- Queue handling: `src/runners/testRunHandler.ts`
- Result parsing: `src/parsers/junitParser.ts` if output format changes

**New Configuration Option:**
- Define in: `package.json` contributes.configuration.properties
- Read in: `src/settings.ts` WindowSettings or WorkspaceSettings constructor
- Access via: `config.globalSettings` or `wkspSettings` parameter

**Unit Test:**
- Location: `test/unit/[module-name].test.ts`
- Framework: Mocha + TypeScript compilation (via ts-loader in webpack)
- Run with: `npm run test:unit`

**Integration Test:**
- Location: `test/integration/[project-suite]/extension.test.ts`
- Framework: Mocha + VS Code test runner
- Example project: Use existing example-projects/project-a/

## Special Directories

**Temporary/Output Directories:**

- `dist/`: Compiled extension bundle
  - Purpose: Output of webpack build
  - Generated: On build, not committed
  - Used by: VS Code when loading extension

- `out/`: Compiled test JavaScript
  - Purpose: TypeScript compilation output for test files
  - Generated: On test compilation, not committed
  - Used by: Test runner (Mocha)

- `.planning/codebase/`: Documentation directory
  - Purpose: GSD mapping analysis documents
  - Location: `.planning/codebase/*.md` (auto-generated by GSD mapper)
  - Not committed (git-ignored)

- `.vscode-test/`: VS Code download cache
  - Purpose: Downloaded VS Code instances for test runs
  - Generated: By @vscode/test-electron package
  - Not committed

**Git-Ignored Directories:**

- `bundled/`: Recreated during build via `npm run bundle-behave`
- `node_modules/`: NPM dependencies
- `.mypy_cache/`, `.ruff_cache/`: Python tool caches
- `.venv/`: Python virtual environment
- `.vscode-test/`: Test VS Code instances
- `out/`, `dist/`: Build outputs

## Import Path Patterns

**From src/extension.ts:**

```typescript
import { config, Configuration } from "./configuration";
import { getContentFromFilesystem, isFeatureFile } from './common';
import { FileParser } from './parsers/fileParser';
import { testRunHandler } from './runners/testRunHandler';
import { gotoStepHandler } from './handlers/gotoStepHandler';
```

Pattern:
- Relative paths with `./` for sibling modules
- `src/` folder structure maps to import paths (no `src/` prefix in import)
- One main export per file (e.g., one class or one const factory)

**Cross-layer imports:**

- Handlers → Parsers: `import { getStepFileStepForFeatureFileStep } from '../parsers/stepMappings'`
- Parsers → Common: `import { isFeatureFile, uriId } from '../common'`
- Runners → Parsers: `import { FileParser } from '../parsers/fileParser'`
- Any → Configuration: `import { config } from "../configuration"`

**Avoid circular imports:**

- All modules import from `common.ts` (it doesn't import anything except node modules)
- Configuration is a singleton; prefer `import { config }` over passing as parameter
- Handlers don't import other handlers (use common or configuration)

