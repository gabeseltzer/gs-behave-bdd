# Testing Patterns

**Analysis Date:** 2026-04-13

## Test Framework

**Runner:**
- Mocha 9.1.3 with TDD UI (`ui: 'tdd'`)
- Config: test files use `suite()` and `test()` functions (not `describe()`/`it()`)
- Setup file: `test/unit/setup.ts` loads vscode mock before tests run
- Entry point: `test/unit/run.ts` discovers and runs all test files

**Assertion Library:**
- Node.js built-in `assert` module
- `assert.strictEqual()`, `assert.deepStrictEqual()`, `assert.ok()`
- Sinon 21.0.1 for stubs, spies, and sandboxes

**Run Commands:**
```bash
npm run test:unit              # Unit tests only (Mocha, fast, no VSCode)
npm run compile-tests          # Compile test TypeScript to out/test/
npm run watch-tests            # Watch mode for test compilation
npm run test:integration       # Integration tests (downloads VSCode Stable)
npm run testinsiders           # Integration tests with VSCode Insiders
npm test                       # Lint + compile + all tests
npm run pretest                # Pre-test hook: runs lint + lint:python
```

## Test File Organization

**Location:**
- Unit tests: `test/unit/**/*.test.ts` — mirrors `src/` structure
- Integration tests: `test/integration/*/` — each subdirectory is a test suite
- Shared integration helpers: `test/integration/suite-shared/`

**Naming:**
- Unit tests: `<module>.test.ts` (e.g., `common.test.ts`, `codeLensProvider.test.ts`)
- Feature files match source: `src/handlers/codeLensProvider.ts` → `test/unit/handlers/codeLensProvider.test.ts`

**Structure:**
```
test/
├── unit/
│   ├── setup.ts              # Mock vscode before tests
│   ├── run.ts                # Mocha runner entry
│   ├── vscode.mock.ts        # Full vscode API mock
│   ├── common.test.ts
│   ├── handlers/
│   │   ├── codeLensProvider.test.ts
│   │   ├── hoverProvider.test.ts
│   │   └── navigationProviders.test.ts
│   ├── parsers/
│   │   ├── featureParser.test.ts
│   │   ├── stepsParser.test.ts
│   │   └── behaveLoader.test.ts
│   └── runners/
├── integration/
│   ├── runTestSuites.ts      # Main integration runner
│   ├── runDebugSuite.ts      # Debug-specific suite runner
│   ├── simple suite/
│   ├── nested project suite/
│   └── suite-shared/         # Shared helpers
└── tsconfig.json             # Extends ../tsconfig.json
```

## Test Structure

**Suite Organization:**

```typescript
// From test/unit/common.test.ts
suite('common utilities', () => {
  
  suite('sepr', () => {
    test('should be a unique separator', () => {
      assert.strictEqual(sepr, ':////:');
    });
  });

  suite('beforeFirstSepr', () => {
    test('should return part before separator', () => {
      const input = 'part1:////:part2';
      const result = beforeFirstSepr(input);
      assert.strictEqual(result, 'part1');
    });
  });
});
```

**Patterns:**

- Nested `suite()` blocks group related tests
- Each `test()` has a descriptive name starting with "should"
- `setup()` and `teardown()` hooks for test lifecycle

Example (from `codeLensProvider.test.ts`):
```typescript
suite('codeLensProvider', () => {
  let sandbox: sinon.SinonSandbox;
  let provider: StepCodeLensProvider;

  setup(() => {
    sandbox = sinon.createSandbox();
    provider = new StepCodeLensProvider();
  });
  
  teardown(() => sandbox.restore());

  test('should return empty array when showStepReferenceCodeLens is false', async () => {
    // test body
  });
});
```

## Mocking

**Framework:** Sinon.js 21.0.1

**Patterns:**

Mock vscode API for unit tests. The vscode module is intercepted by `test/unit/setup.ts`:

```typescript
// From test/unit/setup.ts - load before any tests
const originalRequire = Module.prototype.require;
(Module.prototype.require as any) = function (id: string) {
  if (id === 'vscode') {
    return vscodeMock;  // Return mock instead of real module
  }
  return originalRequire.call(this, id);
};
```

Stub external dependencies in tests:

```typescript
// From codeLensProvider.test.ts
sandbox.stub(vscode.workspace, 'getConfiguration').returns({
  get: (key: string) => key === 'showStepReferenceCodeLens' ? false : undefined,
  has: () => false,
  inspect: () => undefined,
  update: () => Promise.resolve(),
} as unknown as vscode.WorkspaceConfiguration);

sandbox.stub(common, 'isStepsFile').returns(true);
sandbox.stub(common, 'getWorkspaceSettingsForFile').returns({
  uri: vscode.Uri.file('/test'),
} as ReturnType<typeof common.getWorkspaceSettingsForFile>);
```

**What to Mock:**
- External module functions via `sandbox.stub(module, 'function')`
- VSCode API calls that would fail outside extension host
- File system operations that need controlled data
- Async operations to control timing

**What NOT to Mock:**
- Internal utility functions from `common.ts`
- Class construction (unless testing dependency injection)
- Core parsing logic (test with real data instead)

Mock Document example (from `codeLensProvider.test.ts`):
```typescript
function makeMockDocument(uri: vscode.Uri, content: string): vscode.TextDocument {
  const lines = content.split('\n');
  return {
    uri,
    getText: () => content,
    lineAt: (line: number) => ({
      text: lines[line] || '',
      range: new vscode.Range(line, 0, line, (lines[line] || '').length),
      lineNumber: line,
    }),
    lineCount: lines.length,
  } as unknown as vscode.TextDocument;
}
```

## Fixtures and Factories

**Test Data:**

Factory functions create test objects consistently:

```typescript
// From codeLensProvider.test.ts
function makeStepFileStep(uri: vscode.Uri, stepType: string, textAsRe: string, funcLine: number): StepFileStep {
  const step = new StepFileStep(
    `key${sepr}^${stepType}${sepr}${textAsRe}$`,
    uri,
    'steps.py',
    stepType,
    textAsRe,
  );
  step.functionDefinitionRange = new vscode.Range(funcLine, 0, funcLine, 20);
  return step;
}

function makeFeatureFileStep(uri: vscode.Uri, line: number, text: string, stepType: string): FeatureFileStep {
  return new FeatureFileStep(
    'key', uri, 'test.feature',
    new vscode.Range(line, 0, line, text.length),
    text, text.replace(/^(Given|When|Then|And|But)\s+/i, ''), stepType
  );
}
```

**Location:**
- Factory functions defined inline in test files (not in separate fixtures directory)
- Reused across multiple `suite()` blocks within the same file
- Test data files for integration tests in `test/integration/<suite>/features/` and `test/integration/<suite>/steps/`

## Coverage

**Requirements:** 
- No enforced coverage threshold in config
- Unit tests focus on critical parsing and utility logic
- Integration tests cover full workflows

**View Coverage:**
```bash
# No built-in coverage command; tests use standard Mocha/Node.js assertion
npm run test:unit
```

## Test Types

**Unit Tests:**
- Scope: isolated functions and classes without VSCode context
- Approach: pure functions, mocked dependencies, assertion-driven
- Location: `test/unit/`
- Framework: Mocha + assert + Sinon
- Examples: 
  - `test/unit/common.test.ts` — utility functions like `sepr`, `cleanBehaveText`
  - `test/unit/parsers/featureParser.test.ts` — parsing text blocks and scenarios
  - `test/unit/handlers/codeLensProvider.test.ts` — code lens generation logic

**Integration Tests:**
- Scope: full extension behavior within VSCode
- Approach: real VSCode extension host, real file system, behave subprocess
- Location: `test/integration/`
- Framework: @vscode/test-electron with Mocha
- Runs: Manual via `npm run test:integration` (not in CI pre-commit)
- Examples:
  - `test/integration/simple suite/extension.test.ts` — basic extension loading
  - `test/integration/debug suite/extension.test.ts` — debug session flow
  - `test/integration/stepLibraryDiagnostics/` — step discovery and diagnostics

**E2E Tests:**
- Not explicitly defined; integration tests serve as E2E verification
- No Cypress/Playwright framework

## Common Patterns

**Async Testing:**

```typescript
// From many test files
test('should load steps', async () => {
  const result = await parser.stepsParseComplete(5000, "test");
  assert.ok(result);
});

// Return promise implicitly (Mocha awaits it)
test('should handle async operation', async () => {
  await someAsyncFunction();
  assert.ok(true);
});
```

**Error Testing:**

```typescript
// From featureParser.test.ts
test('should skip lines inside text blocks', () => {
  const content = `
Feature: Test
  Scenario: Test
    Given a step
    """
    This should be skipped
    """
  `;
  
  let scenarios = 0;
  parseFeatureContent(wkspSettings, testUri, content, 'test', 
    () => { scenarios++; },  // onScenarioLine callback
    () => {}  // onFeatureLine callback
  );
  
  assert.strictEqual(scenarios, 1);
});
```

**Callback-Based Testing:**

Tests that verify functions call callbacks with expected parameters:

```typescript
// From featureParser.test.ts
suite('parseFeatureContent', () => {
  test('should invoke callbacks for feature and scenarios', () => {
    let featureCalls = 0;
    let scenarioCalls = 0;
    
    parseFeatureContent(wkspSettings, uri, content, 'test',
      (range, name, isOutline) => { scenarioCalls++; },
      (range) => { featureCalls++; }
    );
    
    assert.strictEqual(scenarioCalls, 2);
    assert.strictEqual(featureCalls, 1);
  });
});
```

**Stubbing with Sinon:**

```typescript
// From codeLensProvider.test.ts
suite('CodeLens with stubs', () => {
  let sandbox: sinon.SinonSandbox;
  
  setup(() => sandbox = sinon.createSandbox());
  teardown(() => sandbox.restore());
  
  test('should use stubbed parser', async () => {
    const stub = sandbox.stub(parser, 'initialStepsParseComplete').get(() => true);
    
    // test code
    
    assert.ok(stub.called);
  });
});
```

## Integration Test Pattern

Example from `test/integration/simple suite/extension.test.ts`:

```typescript
suite('extension - simple suite', function () {
  this.timeout(120000);  // Integration tests are slow
  
  let testSupport: TestSupport | undefined;
  
  suiteSetup(async () => {
    // Initialize VS Code with test behave project
    testSupport = await activateExtensionAndWait(...);
  });
  
  suiteTeardown(async () => {
    // Cleanup
    await deactivateExtension(testSupport);
  });
  
  test('should load test items from features', async () => {
    // Full end-to-end test
    assert.ok(testSupport?.ctrl);
  });
});
```

---

*Testing analysis: 2026-04-13*
