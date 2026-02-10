## Phase 3 Complete: Create Unit Test Infrastructure and Sample Tests

Successfully set up unit test infrastructure with Mocha and Sinon, and created comprehensive unit tests for parser modules. All 65 unit tests pass in 51ms.

**Files created/changed:**
- test/unit/run.ts (unit test runner)
- test/unit/setup.ts (test setup with VS Code API mocking)
- test/unit/vscode.mock.ts (mock implementation of VS Code APIs)
- test/unit/parsers/gherkinPatterns.test.ts (45 tests)
- test/unit/common.test.ts (20 tests)
- package.json (added test:unit script)

**Functions created/changed:**
- run() in test/unit/run.ts - Mocha test runner that discovers and executes unit tests
- VS Code API mocks in test/unit/vscode.mock.ts

**Tests created/changed:**
- 45 tests for gherkinPatterns module:
  - Feature, Background, Scenario, Examples, Rule regex patterns
  - Step keywords (Given, When, Then, And, But, *)
  - Tags and comments
  - getSymbolStartLine function with various edge cases
- 20 tests for common utilities:
  - sepr, beforeFirstSepr, afterFirstSepr (separator utilities)
  - cleanBehaveText (ANSI escape sequence removal)
  - getLines (line ending handling)

**Review Status:** APPROVED

**Git Commit Message:**
```
test: Add unit test infrastructure and parser tests

- Added Mocha-based unit test runner with VS Code API mocking
- Created 45 tests for gherkinPatterns module (regex patterns and utilities)
- Created 20 tests for common module (separator, text cleaning, line utilities)
- All 65 unit tests pass in 51ms
- Added npm run test:unit script
- Installed sinon and @types/sinon for mocking
```
