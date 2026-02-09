## Plan: VS Code Extension Unit Tests and Test Restructuring

This plan will add unit test infrastructure to the VS Code extension using Mocha and Sinon, move all testing code to a dedicated `test/` directory, separate unit and integration tests, and ensure both test suites run independently and as part of the publish process.

**Phases: 5**

1. **Phase 1: Create Test Directory Structure and Configuration**
   - **Objective:** Set up the new `test/` directory structure with separate unit and integration subdirectories, and create necessary configuration files
   - **Files/Functions to Modify/Create:**
     - Create `test/unit/` directory
     - Create `test/integration/` directory
     - Create `test/tsconfig.json` for test-specific TypeScript configuration
     - Create `test/unit/.mocharc.json` for unit test configuration
     - Create `test/integration/.mocharc.json` for integration test configuration
   - **Tests to Write:** None (infrastructure phase)
   - **Steps:**
     1. Create root `test/` directory with `unit/` and `integration/` subdirectories
     2. Create `test/tsconfig.json` extending root tsconfig with test-specific settings
     3. Create `test/unit/.mocharc.json` for unit test Mocha configuration (fast, no VS Code)
     4. Create `test/integration/.mocharc.json` for integration test Mocha configuration (existing pattern)
     5. Run TypeScript compiler to verify configuration is valid

2. **Phase 2: Move Integration Tests to New Structure**
   - **Objective:** Move all existing integration tests from `src/_integrationTests/` to `test/integration/` and update all import paths
   - **Files/Functions to Modify/Create:**
     - Move all files from src/_integrationTests/ to test/integration/
     - Update test/integration/runTestSuites.ts with new paths
     - Update test/integration/index.helper.ts with new paths
     - Update all suite index.ts files with corrected import paths
     - Update .vscodeignore to exclude test/ directory
   - **Tests to Write:** None (migration phase)
   - **Steps:**
     1. Copy entire src/_integrationTests/ directory to test/integration/
     2. Update all relative imports in moved files to account for new location (../../src/ instead of ../)
     3. Update suite runner paths and configurations
     4. Verify all integration test files have correct import paths
     5. Update .vscodeignore to exclude test/ instead of src/
     6. Run integration tests to verify they still work

3. **Phase 3: Create Unit Test Infrastructure and Sample Tests**
   - **Objective:** Set up unit test infrastructure with Mocha and Sinon, and create unit tests for parser modules to establish testing patterns
   - **Files/Functions to Modify/Create:**
     - Install sinon and @types/sinon as dev dependencies
     - Create test/unit/setup.ts for unit test setup/teardown
     - Create test/unit/parsers/gherkinPatterns.test.ts for testing src/parsers/gherkinPatterns.ts
     - Create test/unit/parsers/stepMappings.test.ts for testing src/parsers/stepMappings.ts
     - Create test/unit/common.test.ts for testing src/common.ts utility functions
     - Create test/unit/run.ts as unit test runner
   - **Tests to Write:**
     - gherkinPatterns.test.ts: Test regex patterns for Gherkin syntax (Given, When, Then, etc.)
     - stepMappings.test.ts: Test step mapping utility functions
     - common.test.ts: Test utility functions from common.ts
   - **Steps:**
     1. Install sinon and @types/sinon packages
     2. Create unit test runner script (test/unit/run.ts)
     3. Create setup.ts with any necessary test initialization
     4. Write tests for gherkinPatterns regex functions (GIVEN_RE, WHEN_RE, THEN_RE, etc.)
     5. Run tests to verify they pass
     6. Write tests for stepMappings utility functions
     7. Run tests to verify they pass
     8. Write tests for common.ts utility functions
     9. Run tests to verify they pass
     10. Ensure tests can run with npm run test:unit

4. **Phase 4: Update Build Configuration and Scripts**
   - **Objective:** Update package.json scripts, tsconfig.json, and VS Code configuration to support both test types independently
   - **Files/Functions to Modify/Create:**
     - Update package.json scripts section
     - Update tsconfig.json to exclude test directory
     - Update .vscode/tasks.json with unit test tasks
     - Update .vscode/launch.json with unit test debug configurations
   - **Tests to Write:** None (configuration phase)
   - **Steps:**
     1. Add test:unit script to run unit tests only
     2. Add test:integration script to run integration tests only
     3. Update test script to run both unit and integration tests sequentially
     4. Update pretest, compile-tests, and watch-tests to handle new test/ structure
     5. Update tsconfig.json to exclude test/ directory from main compilation
     6. Add VS Code launch configuration for debugging unit tests
     7. Add VS Code task for watching and running unit tests
     8. Ensure prevscode:prepublish runs both test suites

5. **Phase 5: Cleanup and Verification**
   - **Objective:** Remove old test directory, verify both test suites run correctly, and ensure extension packaging works with new structure
   - **Files/Functions to Modify/Create:**
     - Delete src/_integrationTests/ directory
     - Update .vscodeignore final configuration
     - Verify package.json prepublish hooks
   - **Tests to Write:** None (verification phase)
   - **Steps:**
     1. Delete the old src/_integrationTests/ directory
     2. Run unit tests independently and verify they pass
     3. Run integration tests independently and verify they pass
     4. Run combined test suite and verify both pass
     5. Test VS Code launch configurations for both test types
     6. Run npm run package to verify extension bundles correctly
     7. Verify .vscodeignore excludes test directory from package
