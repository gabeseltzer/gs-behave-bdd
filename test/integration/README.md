# Integration Tests

This directory contains integration tests for the behave-vsc-gs extension.

Integration tests run against a full VS Code instance and test the extension's functionality end-to-end with real workspace projects.

## Running Integration Tests

```bash
npm run test:integration
```

## Test Suites

Each subdirectory represents a test suite that validates the extension against a specific workspace configuration from `example-projects/`.
