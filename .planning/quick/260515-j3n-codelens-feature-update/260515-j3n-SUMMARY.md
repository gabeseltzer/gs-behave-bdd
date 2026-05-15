---
id: 260515-j3n
slug: codelens-feature-update
status: complete
date: 2026-05-15
commit: 099ec3b
---

# Summary: CodeLens references update on feature file edits

## What changed

CodeLens "N references" shown above each step definition in Python files used
to go stale after editing a `.feature` file. Step mappings were rebuilt, but
nothing told VS Code the displayed counts were now wrong.

## Files modified

- `src/parsers/fileParser.ts` — feature reparse branch now fires `this.onStepMappingsRebuilt?.(wkspSettings.featuresUri)` after `rebuildStepMappings`. Previously only the Python debounce path fired it.
- `src/handlers/codeLensProvider.ts` — `StepCodeLensProvider` now owns a `vscode.EventEmitter<void>`, exposes it as `onDidChangeCodeLenses`, and offers `refresh()` + `dispose()` for VS Code to consume.
- `src/extension.ts` — captures the `StepCodeLensProvider` instance, registers it both as the language provider and in `context.subscriptions`, and calls `codeLensProvider.refresh()` from the existing `parser.onStepMappingsRebuilt` handler.
- `test/unit/handlers/codeLensProvider.test.ts` — added `refresh()` test asserting `onDidChangeCodeLenses` fires on each invocation.
- `test/unit/parsers/reparseFileDebounce.test.ts` — inverted the existing "callback is NOT invoked for feature files" test to assert the new positive behavior.
- `test/unit/vscode.mock.ts` — replaced the stub `EventEmitter` with a functional implementation (listeners actually run on `fire()`) so subscription tests are meaningful.

## Verification

- `npx eslint src --ext ts` — clean
- `npm run test:unit` — **877 passing** (was 876)
- Both new tests confirmed running:
  - `refresh() fires onDidChangeCodeLenses so VS Code re-queries open .py files`
  - `callback is invoked synchronously for feature files (CodeLens/diagnostics need to refresh)`

## Atomic commit

`099ec3b` — fix(codeLens): refresh step reference count when feature files change
