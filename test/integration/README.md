# Integration Tests

This directory contains integration tests for the gs-behave-bdd extension.

Integration tests run against a full VS Code instance and test the extension's functionality end-to-end with real workspace projects.

## Running Integration Tests

```bash
npm run test:integration
```

To run only some suites, pass `--suite` (repeatable; matches a substring of the suite folder
name, ignoring case, spaces and punctuation, so no quoting is needed):

```bash
npm run test:integration -- --suite debug --suite siblingstepsfolder2
```

The run stops at the first failing suite, so after a failure, re-run just the failing suite
and then the ones after it rather than the whole set.

## Test Suites

Each subdirectory represents a test suite that validates the extension against a specific workspace configuration from `example-projects/`.
