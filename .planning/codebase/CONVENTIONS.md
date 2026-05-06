# Coding Conventions

**Analysis Date:** 2026-04-13

## Naming Patterns

**Files:**
- Descriptive camelCase with file extensions matching content type (`.ts` for TypeScript)
- Handler modules: `<name>Handler.ts` or `<name>Provider.ts` (e.g., `gotoStepHandler.ts`, `codeLensProvider.ts`)
- Parser modules: `<name>Parser.ts` (e.g., `featureParser.ts`, `stepsParser.ts`)
- Test files: `<name>.test.ts` (co-located with source or in `test/` directory)
- Mock/utility files: `<name>.mock.ts` (e.g., `vscode.mock.ts`)

**Functions:**
- camelCase with descriptive verb-first naming
- Async functions should indicate async behavior: `parseFileAsync()`, `waitOnReadyForStepsNavigation()`
- Getters use `get<Resource>` pattern: `getFeatureFileSteps()`, `getUrisOfWkspFoldersWithFeatures()`
- Validators/checkers: `is<Type>`, `validate<Thing>` (e.g., `isFeatureFile()`, `validateStepDefinitions()`)
- Event handlers end with `Handler`: `gotoStepHandler()`, `findStepReferencesHandler()`

**Variables:**
- camelCase for local variables and parameters
- UPPER_SNAKE_CASE for constants: `WIN_MAX_PATH`, `BEHAVE_EXECUTION_ERROR_MESSAGE`, `sepr`
- Prefixes for clarity:
  - `is<Condition>` for boolean variables: `isLibraryStep`, `initialParsingComplete`
  - `<Plural>Map` or `<Plural>Set` for collections: `featureFileSteps`, `wkspWatchers`

**Types:**
- PascalCase for classes and interfaces: `FeatureFileStep`, `FileParser`, `Logger`
- Interfaces describe contracts: `Configuration`, `WorkspaceSettings`, `HoverProvider`
- Classes are implementation-focused: `ExtensionConfiguration`, `FeatureTag`
- Enum values use double quotes and lowercase keys: `enum DiagLogType { "info", "warn", "error" }`

## Code Style

**Formatting:**
- No Prettier configuration (not enforced, but consistent spacing observed)
- 2-space indentation (seen in package.json structure)
- Line breaks between logical blocks within functions
- Trailing commas in multi-line objects/arrays

**Linting:**
- ESLint with TypeScript parser and strict rules
- Config: `.eslintrc.js` with `@typescript-eslint/recommended` preset
- **Unused variables rule**: Arguments starting with `_` are ignored (`_scenarios`, `_featureLines`)
- No unused variable warnings if prefixed with underscore

**TypeScript:**
- Strict mode enabled (`"strict": true` in `tsconfig.json`)
- Target ES2021, module commonjs
- Source root: `src/`
- Test root: `test/` with its own `tsconfig.json`

## Import Organization

**Order:**
1. Node.js built-in modules: `import * as fs from 'fs'`
2. External packages: `import * as vscode from 'vscode'`, `import * as sinon from 'sinon'`
3. Local relative imports: `import { config } from './configuration'`
4. Deep relative imports: `import { FeatureFileStep } from '../parsers/stepsParser'`

**Path Aliases:**
- No path aliases are used; imports use relative paths (e.g., `..`, `./`, `../../`)

**Style conventions:**
- Namespace imports for large APIs: `import * as vscode from 'vscode'`
- Destructured imports for specific exports: `import { config } from './configuration'`
- Type imports are not explicitly prefixed with `type` (TypeScript infers context)

## Error Handling

**Error Types:**
- Custom error class: `WkspError` extends Error and carries workspace context (`wkspUri`, optional `run`)
- Used when operation needs workspace-aware logging
- Pattern: `throw new WkspError("message", wkspUri)` or `throw "message"` for generic errors

**Handler Pattern (Entry Points):**
- All event handlers and registered commands must have try/catch at top level
- Handlers show errors to user via `config.logger.showError(e, wkspUri)` or `config.logger.showWarn()`
- Called from `activate()` in `extension.ts`, handlers like `gotoStepHandler()`, `findStepReferencesHandler()`

**Helper Function Pattern:**
- Helper/utility functions (called from handlers) must `throw`, never catch
- Errors bubble up to handler for unified display
- Example from `gotoStepHandler.ts`: validate input, throw on invalid, handler catches and shows UI message

**Async Error Patterns:**
- Wrap async operations: `await parser.stepsParseComplete(5000, "context")`
- Timeout parameter indicates max wait in milliseconds
- Failures throw and propagate to handler

Example (from `extension.ts` line 40-44):
```typescript
try {
  // work
} catch (e: unknown) {
  config.logger.showError(e, wkspUri);  // only in handlers
}
```

## Logging

**Framework:** 
- Custom `Logger` class wrapping VS Code's `OutputChannel` API
- Per-workspace output channels for multi-root workspace support
- Entry point: `config.logger` singleton

**Patterns:**
- `logInfo(text, wkspUri, testRun?)`: Log info message to workspace channel and optional test run
- `logInfoNoLF(text, wkspUri, testRun?)`: Log without line feed (for streaming behave output)
- `logSettingsWarning(text, wkspUri)`: Log warning with user notification
- `showError(error, wkspUri?, testRun?)`: Log error with automatic formatting and user dialog
- `diagLog(message, wkspUri?, logType?)`: Global diagnostic logging (only when `xRay` setting enabled)

**Usage:**
- Create detailed logs for parsing/test execution events
- Use `diagLog()` for internal debugging (with `xRay` setting check)
- Log workspace context when available to support multi-workspace debugging

Example (from `logger.ts`):
```typescript
logInfo = (text: string, wkspUri: vscode.Uri, run?: vscode.TestRun) => {
  diagLog(text);
  this.channels[wkspUri.path].appendLine(text);
  if (run)
    run.appendOutput(text + "\r\n");
};
```

## Comments

**When to Comment:**
- Complex regex patterns: include explanation of what they match
- Non-obvious algorithm steps: explain the "why", not the "what"
- Performance-critical sections: note constraints and implications
- Workarounds: prefix with `// fix for:` and explain the bug
- Entry points: add comments explaining handler/event listener flow

**JSDoc/TSDoc:**
- Not heavily used; focus on clear function signatures instead
- Comment public functions in `common.ts` and handler modules
- Example (from `common.ts`): Multiline comment explaining `WkspError` purpose and usage

**Inline Comments:**
- Explain regex patterns and non-obvious logic
- Prefix temporary workarounds: `// NOTE:`, `// FIXME:`, `// TODO:`

Example (from `extension.ts` lines 54-58):
```typescript
// construction function called on extension activation OR the first time a new/unrecognised workspace gets added.
// - call anything that needs to be initialised/kicked off async on startup, and 
// - set up all relevant event handlers/hooks/subscriptions to the vscode api
// NOTE - THIS MUST RETURN FAST: AVOID using "await" here unless absolutely necessary
export async function activate(context: vscode.ExtensionContext): Promise<TestSupport | undefined> {
```

## Function Design

**Size:** 
- Functions are typically 20-80 lines; complex parsing functions can reach 150+ lines
- Break up long parsing functions with clear logical sections and comments
- Event handlers usually 20-40 lines (try/catch + work + error handling)

**Parameters:** 
- Use object parameters for many related args: `{ uri, range, position }`
- Include context strings in async calls: `await parser.stepsParseComplete(5000, "context")`
- Optional parameters come last; no default parameter syntax observed

**Return Values:**
- Return `undefined` for not-found cases (not `null`)
- Return arrays even for zero items (use `.length` checks, not truthiness)
- Promise-based async with explicit return type annotations

Example (from `featureParser.ts` line 35-37):
```typescript
export const getFeatureFileSteps = (featuresUri: vscode.Uri) => {
  const featuresUriMatchString = uriId(featuresUri);
  return [...featureFileSteps].filter(([k,]) => k.startsWith(featuresUriMatchString));
}
```

## Module Design

**Exports:**
- Mix of named exports and default exports (not consistently enforced)
- Singletons exported as named exports: `export const config`, `export const parser`
- Classes/interfaces mixed with utility functions in same file
- Large modules like `extension.ts` export interfaces and functions

**Barrel Files:**
- No barrel files (index.ts) observed
- Direct imports from module files: `import { FileParser } from './parsers/fileParser'`

**Module Dependencies:**
- Avoid circular imports; documented in `AI_INSTRUCTIONS.md`
- Parser modules depend on common utilities but not on handlers
- Handlers depend on parsers and common utilities
- Configuration singleton available globally via `import { config }`

Example module structure (from `src/` import patterns):
```typescript
// configuration.ts - singleton
export const config: ExtensionConfiguration = global.config;

// other modules import it
import { config } from './configuration';
```

---

*Convention analysis: 2026-04-13*
