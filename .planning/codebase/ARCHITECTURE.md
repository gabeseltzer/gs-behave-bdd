# Architecture

**Analysis Date:** 2026-04-13

## Pattern Overview

**Overall:** VS Code Extension with multi-layer separation of concerns

This is a VS Code language support extension for Behave BDD testing. The architecture follows a clear command-handler-parser-runner pattern with distinct separation between:
- **Language services** (completion, hover, definition, diagnostics)
- **File parsing** (feature files, step definitions, fixtures)
- **Test orchestration** (test tree, test execution, debugging)
- **Workspace configuration management**

**Key Characteristics:**
- Event-driven activation and reactive updates via VS Code's FileSystemWatcher and TextDocument events
- Asynchronous file parsing with debouncing for Python files (500ms)
- In-memory caching of parsed step mappings to enable fast navigation
- Multi-root workspace support with per-workspace settings and output channels
- Dispose pattern for cleanup and subscription management

## Layers

**Extension Layer (Entry Point):**
- Purpose: VS Code extension lifecycle management, event registration, handler setup
- Location: `src/extension.ts`
- Contains: `activate()` function, test controller creation, event subscription setup, command registration
- Depends on: All other layers
- Used by: VS Code extension host

**Language Services Layer:**
- Purpose: Provide IDE features (go-to-definition, hover, completion, diagnostics, semantic highlighting)
- Location: `src/handlers/*.ts` (20+ provider files)
- Contains: AutoComplete, CodeLens, DefinitionProvider, HoverProvider, SemanticHighlight, DocumentSymbol, SelectionRange, FindStepReferences, Diagnostics
- Depends on: Parser layer (step mappings, fixtures, feature content)
- Used by: VS Code language feature registrations

**Test Framework Integration Layer:**
- Purpose: Execute behave tests, manage test tree, handle debugging
- Location: `src/runners/*.ts` (4 files: testRunHandler, runOrDebug, behaveRun, behaveDebug, behaveEnv)
- Contains: Test run orchestration, scenario queueing, behave execution, debug session setup, JUnit result parsing
- Depends on: Parser layer (test tree structure), configuration layer
- Used by: Test controller and test run handlers

**Parsing & Analysis Layer:**
- Purpose: Parse and cache feature files, step definitions, fixtures, and build step mappings
- Location: `src/parsers/*.ts` (10+ files)
- Contains:
  - `fileParser.ts`: Orchestrator for all parsing (features, steps, fixtures)
  - `featureParser.ts`: Gherkin feature file parsing
  - `stepsParser.ts`: Python step definition extraction
  - `fixtureParser.ts`: Python fixture discovery
  - `stepMappings.ts`: Feature step → Python step matching engine
  - `junitParser.ts`: JUnit XML result parsing
  - `behaveLoader.ts`: Behave bundled discovery
- Depends on: Configuration layer, common utilities
- Used by: Language services, test framework, watchers

**Configuration Layer:**
- Purpose: Manage workspace settings, environment variables, logger setup
- Location: `src/configuration.ts`, `src/settings.ts`, `src/testWorkspaceConfig.ts`
- Contains: WorkspaceSettings, WindowSettings, environment preset management, Python executable resolution
- Depends on: Logger, common utilities
- Used by: All layers

**Utilities & Support:**
- Purpose: Cross-cutting concerns and helpers
- Location: `src/common.ts`, `src/logger.ts`, `src/bundledBehave.ts`
- Contains: URI handling, file system operations, random ID generation, diagnostic logging
- Used by: All layers

**Watchers:**
- Purpose: Monitor file system changes and test results
- Location: `src/watchers/*.ts` (2 files: workspaceWatcher, junitWatcher)
- Contains: Feature file/step file tracking, JUnit result folder monitoring
- Used by: Extension layer and test run handler

## Data Flow

**Feature File Discovery & Parsing:**

1. Workspace opened → `extension.activate()` calls
2. `parser.clearTestItemsAndParseFilesForAllWorkspaces()` initiates async parsing
3. `FileParser._parseFeatureFiles()` finds all `.feature` files via `findFiles()`
4. For each file: `parseFeatureContent()` extracts scenarios, tags, steps using regex patterns from `gherkinPatterns.ts`
5. `TestFile.createScenarioTestItemsFromFeatureFileContent()` builds VS Code test items in tree
6. Step data cached in `featureFileSteps` map by features URI
7. Test tree immediately visible to user; parsing continues in background

**Step Definition Discovery & Mapping:**

1. `FileParser._parseStepsFiles()` runs asynchronously after features (or together in `_parseFilesCallsComplete`)
2. Finds all `.py` files in steps folders via `findFiles()`
3. For each file: `getStepFileSteps()` extracts `@step()` decorated functions using regex
4. Results cached in `stepFileSteps` map by features URI
5. `rebuildStepMappings()` performs matching: each feature step → step definition step
6. Matching uses exact string match first, then regex parameter matching
7. Results cached in `stepMappings` array for navigation

**Fixture Parsing:**

1. After steps parsing, `storePythonFixtureDefinitions()` extracts `@fixture` decorated functions
2. Parses `environment.py` for fixture definitions and tags
3. Results cached in `fixtures` map by features URI
4. Used for: fixture tag validation, hover info, definition navigation

**Python File Changes (Debounced):**

1. User edits `.py` file → `onDidChangeTextDocument` event fires
2. `parser.reparseFile()` queued with 500ms debounce (via `_pythonReparseTimers`)
3. After debounce: Step mappings rebuild, diagnostics re-validate, semantic highlighting retriggers

**Test Execution Flow:**

1. User clicks "Run Tests" → `testRunHandler()` invoked
2. Waits for feature parsing complete (1000ms timeout)
3. `queueSelectedTestItems()` walks test tree, collects selected test items
4. Creates `WkspRun` per workspace with test runner details
5. `runOrDebugFeatures()` invokes `behave` command via child_process
6. stdout/stderr streamed to output channel
7. `JunitWatcher` monitors output folder for JUnit XML results
8. `junitParser.ts` parses results and maps back to test items
9. Test item marked as passed/failed/skipped

**State Management:**

Global module-level maps hold parsed data:
- `featureFileSteps` (Map<Uri, FeatureFileStep[]>)
- `stepFileSteps` (Map<Uri, StepFileStep[]>)
- `fixtures` (Map<Uri, Fixture[]>)
- `stepMappings` (StepMapping[]) - flat array for performance
- `testData` (WeakMap<TestItem, BehaveTestData>) - attached to VS Code test items

All cleared when workspace changes or configuration reloads.

## Key Abstractions

**FileParser:**
- Purpose: Central orchestrator for all file discovery and parsing
- Examples: `src/parsers/fileParser.ts`
- Pattern: Singleton exported as `export const parser = new FileParser()` from extension.ts
- Manages: Parse state machines (_finishedFeaturesParseForAllWorkspaces, _finishedStepsParseForWorkspace), status change handlers, error handlers, debounce timers

**StepMapping:**
- Purpose: Links feature file steps to Python step definitions for navigation
- Examples: `src/parsers/stepMappings.ts` class StepMapping
- Pattern: Simple data class with featuresUri, stepFileStep, featureFileStep
- Supports: Many feature steps → one step definition (1:N relationship stored flat for perf)

**WorkspaceSettings:**
- Purpose: Encapsulates per-workspace configuration (paths, env vars, Python executable)
- Examples: `src/settings.ts` class WorkspaceSettings
- Pattern: Loaded from VS Code workspace config during reloadSettings()
- Manages: Environment variable presets, project path, features path, import strategy

**WkspRun:**
- Purpose: Encapsulates all context needed for a test run in one workspace
- Examples: `src/runners/testRunHandler.ts` class WkspRun
- Pattern: Passed between orchestration functions to avoid parameter drilling
- Contains: VS Code TestRun, test queue, workspace settings, Python executable path, JUnit dir

**TestFile / Scenario:**
- Purpose: Represent parsed feature file structure matching VS Code test item structure
- Examples: `src/parsers/testFile.ts`
- Pattern: Attached to VS Code TestItem via WeakMap testData
- Methods: `createScenarioTestItemsFromFeatureFileContent()` recursively builds tree with Outline/Example support

## Entry Points

**Extension Activation:**
- Location: `src/extension.ts` `activate()` function
- Triggers: When workspace contains `.feature` files (activationEvents: workspaceContains:**/*.feature)
- Responsibilities: Set up test controller, register event handlers, initialize parser, register language services, load initial test tree

**Test Run Handler:**
- Location: `src/runners/testRunHandler.ts`
- Triggers: User clicks "Run Tests" or "Debug Tests" button
- Responsibilities: Collect selected test items, validate readiness, create WkspRun, execute tests, monitor results, report outcomes

**Language Service Handlers:**
- Location: `src/handlers/*.ts`
- Triggers: User hovers, requests completion, presses F12, right-clicks, etc.
- Responsibilities: Provide IDE features (completion items, hover info, definition ranges, etc.)

**File System Watchers:**
- Location: `src/watchers/workspaceWatcher.ts`
- Triggers: When files are created/deleted/renamed on disk
- Responsibilities: Notify parser to reparse affected files, update test tree, clear stale mappings

## Error Handling

**Strategy:** Two-tier error reporting

**Tier 1 - User-Facing (UI):**
- Entry point functions (activate, handlers, event callbacks) catch errors with try-catch
- Call `config.logger.showError(e, wkspUri)` which logs to workspace output channel and shows notification
- Error shown once, prevents duplicate notifications

**Tier 2 - Diagnostic Logging:**
- `diagLog()` function logs to DevTools console (enabled via xRay setting)
- Used internally for performance metrics, state machine tracing, step matching debug info
- Low overhead when disabled

**Custom Error Class:**
- `WkspError` extends Error with wkspUri and optional TestRun
- Used to propagate workspace context up the stack for targeted logging
- Logger distinguishes WkspError from generic Error for formatting

**Validation Errors:**
- Collected in DiagnosticCollection and displayed in Problems pane
- Types: duplicate-scenario, missing-step-definition, duplicate-step-definition, invalid-fixture-tag
- Cleared and re-validated on file edits via `validateStepDefinitions()`, `validateFixtureTags()`

## Cross-Cutting Concerns

**Logging:**
- Framework: `Logger` class in `src/logger.ts`
- Per-workspace output channels created during activation
- `logInfoAllWksps()`, `logWarn()`, `showError()` methods handle routing
- Diagnostic logging via `diagLog()` function

**Validation:**
- Step definition validation via `validateStepDefinitions()` in `src/handlers/stepDiagnostics.ts`
- Checks: Missing step definitions, duplicate steps, parameter count mismatches
- Fixture tag validation via `validateFixtureTags()` in `src/handlers/fixtureDiagnostics.ts`
- Both triggered on: initial parsing, file edits, configuration changes

**Authentication:**
- Configuration: Resolved Python executable via `config.getPythonExecutable()` (uses ms-python extension API)
- Environment variables: Read from workspace config and merged with active preset
- Passed to behave child_process via `behaveEnv()` function

**Multi-Root Workspace Support:**
- Each workspace folder gets separate WorkspaceSettings, output channel, file watchers
- Test controller shared across workspaces (items grouped by workspace id)
- Configuration changes re-sync all watchers and test items
- Parallel test runs possible via `runParallel` setting (one behave instance per feature)

