# Unit Tests

This directory contains unit tests for the behave-vsc-gs extension.

Unit tests run quickly without requiring a VS Code instance. They test individual functions and modules in isolation using mocks and stubs.

## Running Unit Tests

```bash
npm run test:unit
```

## Writing Unit Tests

Unit tests use:

- **Mocha** as the test framework (TDD style)
- **Node assert** for assertions
- **Sinon** for mocking and stubbing

Example:

```typescript
import * as assert from 'assert';
import * as sinon from 'sinon';

suite('MyModule', () => {
  test('should do something', () => {
    assert.strictEqual(1 + 1, 2);
  });
});
```
